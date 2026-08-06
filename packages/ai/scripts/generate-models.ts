#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { Api, Model, OpenAICompletionsCompat } from "../src/types.ts";
import {
	createModelDataManifest,
	type ModelDataStructure,
	MODEL_DATA_MANIFEST_FILE,
	readModelDataProviderIds,
	validateGeneratedModelData,
	validateModelDataDirectory,
} from "./model-data.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

interface GeneratorOptions {
	strict: boolean;
	dataOnly: boolean;
	jsonOnly: boolean;
	jsonOutputDir: string | undefined;
	pretty: boolean;
}

function readGeneratorOptions(args: string[]): GeneratorOptions {
	let strict = false;
	let dataOnly = false;
	let jsonOnly = false;
	let jsonOutputDir: string | undefined;
	let pretty = false;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--strict") {
			strict = true;
			continue;
		}
		if (arg === "--data-only") {
			dataOnly = true;
			continue;
		}
		if (arg === "--json-only") {
			jsonOnly = true;
			continue;
		}
		if (arg === "--pretty") {
			pretty = true;
			continue;
		}
		if (arg === "--json-output") {
			const value = args[++index];
			if (!value) throw new Error("--json-output requires a directory");
			jsonOutputDir = resolve(value);
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (jsonOnly && !jsonOutputDir) throw new Error("--json-only requires --json-output");
	if (dataOnly && (jsonOnly || jsonOutputDir)) throw new Error("--data-only cannot be combined with JSON catalog output");
	return { strict, dataOnly, jsonOnly, jsonOutputDir, pretty };
}

const generatorOptions = readGeneratorOptions(process.argv.slice(2));

const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const OPENROUTER_KIMI_K3_MODEL_IDS = new Set(["moonshotai/kimi-k3", "~moonshotai/kimi-latest"]);
const KIMI_K3_MAX_TOKENS = 131072;

// OpenAI gpt-5+ models on responses API where "off" maps to "none" (reasoning
// is on-by-default with effort "none"). Models NOT in this set get off: null.
const OPENAI_RESPONSES_OFF_NONE_REASONING_MODELS = new Set([
	"openai/gpt-5.1",
	"openai/gpt-5.2",
	"openai/gpt-5.3-codex",
	"openai/gpt-5.4",
	"openai/gpt-5.4-mini",
	"openai/gpt-5.4-nano",
	"openai/gpt-5.5",
	"openai/gpt-5.6-sol",
	"openai/gpt-5.6-terra",
	"openai/gpt-5.6-luna",
]);

/**
 * Restricts generated model output strictly to the `openrouter` provider.
 * All other providers are intentionally excluded from the built-in catalog;
 * local/custom providers (e.g. vLLM) are registered via `models.json`.
 */
const GENERATED_PROVIDERS = ["openrouter"] as const;

function roundCost(value: number): number {
	return Number(value.toFixed(6));
}

function toNumber(value: string | number | undefined): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	const parsed = parseFloat(value ?? "0");
	return Number.isFinite(parsed) ? parsed : 0;
}

interface OpenRouterModelFromApi {
	id: string;
	name: string;
	architecture?: { modality?: string[] };
	pricing?: {
		prompt?: string;
		completion?: string;
		input_cache_read?: string;
		input_cache_write?: string;
	};
	top_provider?: { context_length?: number; max_completion_tokens?: number };
	context_length?: number;
	supported_parameters?: string[];
}

async function fetchOpenRouterModels(): Promise<Model<any>[]> {
	try {
		console.log("Fetching models from OpenRouter API...");
		const response = await fetch(OPENROUTER_MODELS_URL);
		if (!response.ok) throw new Error(`OpenRouter API returned ${response.status}`);
		const data = (await response.json()) as { data?: OpenRouterModelFromApi[] };

		const models: Model<any>[] = [];
		for (const model of data.data ?? []) {
			// Only include models that support tools
			if (!model.supported_parameters?.includes("tools")) continue;

			const input: ("text" | "image")[] = ["text"];
			if (model.architecture?.modality?.includes("image")) {
				input.push("image");
			}

			const contextWindow = model.top_provider?.context_length || model.context_length || 4096;
			const maxTokens = model.top_provider?.max_completion_tokens || 4096;

			models.push({
				id: model.id,
				name: model.name,
				api: "openai-completions",
				baseUrl: OPENROUTER_API_BASE_URL,
				provider: "openrouter",
				reasoning: model.supported_parameters?.includes("reasoning") || false,
				input,
				cost: {
					input: roundCost(toNumber(model.pricing?.prompt) * 1_000_000),
					output: roundCost(toNumber(model.pricing?.completion) * 1_000_000),
					cacheRead: roundCost(toNumber(model.pricing?.input_cache_read) * 1_000_000),
					cacheWrite: roundCost(toNumber(model.pricing?.input_cache_write) * 1_000_000),
				},
				contextWindow,
				maxTokens,
			});
		}

		console.log(`Fetched ${models.length} tool-capable models from OpenRouter`);
		return models;
	} catch (error) {
		console.error("Failed to fetch OpenRouter models:", error);
		if (generatorOptions.strict) throw error;
		return [];
	}
}

// Thinking level map merge helper
function mergeThinkingLevelMap(model: Model<any>, map: NonNullable<Model<any>["thinkingLevelMap"]>): void {
	model.thinkingLevelMap = { ...model.thinkingLevelMap, ...map };
}

// The default OpenAI Completions compat — represents what the runtime
// `detectCompat` function returns for a vanilla `openai` provider model.
// The delta approach stores only fields that differ from these defaults,
// matching the behaviour of the old generator.
const OPENAI_COMPLETIONS_DEFAULT_COMPAT: Record<string, unknown> = {
	supportsStore: true,
	supportsDeveloperRole: true,
	supportsReasoningEffort: true,
	supportsUsageInStreaming: true,
	supportsFinishReason: true,
	maxTokensField: "max_completion_tokens",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	requiresThinkingAsText: false,
	requiresReasoningContentOnAssistantMessages: false,
	thinkingFormat: "openai",
	openRouterRouting: {},
	vercelGatewayRouting: {},
	chatTemplateKwargs: {},
	chatTemplateArgs: {},
	zaiToolStream: false,
	supportsStrictMode: true,
	supportsOpenAIGrammarTools: false,
	sendSessionAffinityHeaders: false,
	supportsLongCacheRetention: true,
};

// Detect OpenAI Completions compat for OpenRouter models.
// Returns the full resolved compat, matching the runtime `detectCompat` logic
// for the `openrouter` provider.
function detectOpenAICompletionsCompat(model: Model<"openai-completions">): Record<string, unknown> {
	const isOpenRouterDeveloperRoleModel =
		/^~?anthropic\//.test(model.id) || model.id.startsWith("openai/");

	const cacheControlFormat = /^~?anthropic\//.test(model.id) ? "anthropic" : undefined;

	return {
		supportsStore: true,
		supportsDeveloperRole: isOpenRouterDeveloperRoleModel,
		supportsReasoningEffort: true,
		supportsUsageInStreaming: true,
		supportsFinishReason: true,
		maxTokensField: "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: false,
		thinkingFormat: "openrouter",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		chatTemplateKwargs: {},
		chatTemplateArgs: {},
		zaiToolStream: false,
		supportsStrictMode: true,
		supportsOpenAIGrammarTools: false,
		cacheControlFormat,
		sendSessionAffinityHeaders: false,
		sessionAffinityFormat: "openrouter",
		supportsLongCacheRetention: true,
	};
}

function isPlainEmptyObject(value: unknown): boolean {
	return typeof value === "object" && value !== null && Object.keys(value).length === 0;
}

// Compute the delta between detected compat and the OpenAI defaults.
// Only non-default values are kept, so model.compat stays minimal.
function openAICompletionsCompatDelta(compat: Record<string, unknown>): OpenAICompletionsCompat {
	const delta: OpenAICompletionsCompat = {};
	for (const [key, value] of Object.entries(compat)) {
		const defaultValue = OPENAI_COMPLETIONS_DEFAULT_COMPAT[key];
		if (isPlainEmptyObject(value) && isPlainEmptyObject(defaultValue)) continue;
		if (value !== defaultValue) {
			(delta as Record<string, unknown>)[key] = value;
		}
	}
	return delta;
}

function applyOpenAICompletionsCompatMetadata(model: Model<any>): void {
	if (model.api !== "openai-completions") return;
	const detected = detectOpenAICompletionsCompat(model as Model<"openai-completions">);
	const delta = openAICompletionsCompatDelta(detected);
	model.compat = { ...delta, ...(model.compat as OpenAICompletionsCompat | undefined) };
	if (Object.keys(model.compat as object).length === 0) {
		delete model.compat;
	}
}

function supportsOpenAiXhigh(modelId: string): boolean {
	return (
		modelId.includes("gpt-5.2") ||
		modelId.includes("gpt-5.3") ||
		modelId.includes("gpt-5.4") ||
		modelId.includes("gpt-5.5") ||
		modelId.includes("gpt-5.6")
	);
}

function supportsOpenAiMax(model: Model<any>): boolean {
	return (
		model.id.includes("gpt-5.6") &&
		(model.api === "openai-responses" ||
			model.api === "azure-openai-responses" ||
			model.api === "openai-completions")
	);
}

function applyThinkingLevelMetadata(model: Model<any>): void {
	const id = model.id;
	const isGpt5 = id.startsWith("openai/gpt-5");

	// OpenAI gpt-5+ models: "off" maps based on NONE_REASONING set.
	// Models in the set get off: "none" (sends reasoning with effort "none").
	// Other gpt-5+ models get off: null (reasoning omitted when not requested).
	if (isGpt5) {
		if (OPENAI_RESPONSES_OFF_NONE_REASONING_MODELS.has(id)) {
			mergeThinkingLevelMap(model, { off: "none" });
		} else {
			mergeThinkingLevelMap(model, { off: null });
		}
	}

	// OpenAI gpt-5+ models support xhigh (for gpt-5.2/5.3/5.4/5.5/5.6)
	if (id.startsWith("openai/gpt-5.") && supportsOpenAiXhigh(id)) {
		mergeThinkingLevelMap(model, { xhigh: "xhigh" });
	}

	// gpt-5.6 models support max
	if (id.startsWith("openai/") && supportsOpenAiMax(model)) {
		mergeThinkingLevelMap(model, { max: "max" });
	}

	// gpt-5.5-pro: off, minimal, low are null
	if (id.endsWith("gpt-5.5-pro")) {
		mergeThinkingLevelMap(model, { off: null, minimal: null, low: null });
	}

	// gpt-5.5 only: minimal is null
	if (id === "openai/gpt-5.5") {
		mergeThinkingLevelMap(model, { minimal: null });
	}

	// gpt-5.6 models: minimal is null (not a supported thinking level)
	if (id.startsWith("openai/gpt-5.6")) {
		mergeThinkingLevelMap(model, { minimal: null });
	}

	// Anthropic adaptive thinking:
	// - "max" on Claude Opus 4.6, Sonnet 4.6
	if (id.includes("opus-4-6") || id.includes("opus-4.6") || id.includes("sonnet-4-6") || id.includes("sonnet-4.6")) {
		mergeThinkingLevelMap(model, { max: "max" });
	}
	// - "xhigh" and "max" on Claude Opus 4.7/4.8/5, Sonnet 5, Fable 5
	if (
		id.includes("opus-4-7") ||
		id.includes("opus-4.7") ||
		id.includes("opus-4-8") ||
		id.includes("opus-4.8") ||
		id.includes("opus-5") ||
		id.includes("opus.5") ||
		id.includes("sonnet-5") ||
		id.includes("sonnet.5")
	) {
		mergeThinkingLevelMap(model, { xhigh: "xhigh", max: "max" });
	}
	// Fable 5: off is null, xhigh and max available
	if (id.includes("fable-5")) {
		mergeThinkingLevelMap(model, { off: null, xhigh: "xhigh", max: "max" });
	}

	// DeepSeek V4 on OpenRouter: xhigh available, max not
	if (id.includes("deepseek-v4")) {
		mergeThinkingLevelMap(model, {
			...DEEPSEEK_V4_THINKING_LEVEL_MAP,
			xhigh: "xhigh",
			max: null,
		});
	}

	// Mercury 2 in instant mode: off is null
	if (id.startsWith("inception/mercury-2")) {
		mergeThinkingLevelMap(model, { off: null });
	}

	// Z AI GLM-5.2 on OpenRouter: xhigh available
	if (id === "z-ai/glm-5.2") {
		mergeThinkingLevelMap(model, { xhigh: "xhigh" });
	}

	// Kimi K2.7 Code on OpenRouter: off is null (always-thinking)
	if (id === "moonshotai/kimi-k2.7-code" || id === "moonshotai/kimi-k2.7-code-highspeed") {
		mergeThinkingLevelMap(model, { off: null, xhigh: null, max: null });
	}

	// Moonshot Kimi K3 on OpenRouter: off, minimal, medium, xhigh are null;
	// only low, high, max are available.
	if (id === "moonshotai/kimi-k3") {
		mergeThinkingLevelMap(model, {
			off: null,
			minimal: null,
			medium: null,
			xhigh: null,
			max: "max",
		});
	}
}

const DEEPSEEK_V4_THINKING_LEVEL_MAP = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	max: "max",
} as const;

function applyOpenRouterModelOverrides(model: Model<any>): void {
	if (model.provider !== "openrouter") return;

	// Apply compat detection for openai-completions models
	if (model.api === "openai-completions") {
		applyOpenAICompletionsCompatMetadata(model);
	}

	// Apply thinking level map overrides
	applyThinkingLevelMetadata(model);

	// Keep Kimi K3's canonical output limit.
	if (OPENROUTER_KIMI_K3_MODEL_IDS.has(model.id)) {
		model.maxTokens = KIMI_K3_MAX_TOKENS;
	}

	// OpenAI grammar tools: supported on gpt-5+ models
	if (model.api === "openai-completions" && model.id.startsWith("openai/gpt-5")) {
		const match = /^openai\/gpt-(\d+)/.exec(model.id);
		if (match && Number(match[1]) >= 5) {
			model.compat = {
				...(model.compat as OpenAICompletionsCompat | undefined),
				supportsOpenAIGrammarTools: true,
			};
		}
	}

	// OpenAI tool search: supported on gpt-5.4+ models (responses-format tools)
	const OPENAI_TOOL_SEARCH_MODEL_IDS = new Set([
		"openai/gpt-5.4",
		"openai/gpt-5.4-mini",
		"openai/gpt-5.4-pro",
		"openai/gpt-5.5",
		"openai/gpt-5.6-sol",
		"openai/gpt-5.6-terra",
		"openai/gpt-5.6-luna",
	]);
	if (OPENAI_TOOL_SEARCH_MODEL_IDS.has(model.id)) {
		model.compat = {
			...(model.compat as OpenAICompletionsCompat | undefined),
			supportsToolSearch: true,
		} as OpenAICompletionsCompat;
	}

	// OpenAI explicit prompt cache mode: supported on gpt-5.6+ models
	if (model.id.startsWith("openai/gpt-5.6")) {
		model.compat = {
			...(model.compat as OpenAICompletionsCompat | undefined),
			supportsExplicitPromptCacheMode: true,
		} as OpenAICompletionsCompat;
	}

	// OpenAI short context capped: gpt-5.4-pro has reduced context window
	const OPENAI_SHORT_CONTEXT_CAPPED_MODEL_IDS = new Set([
		"openai/gpt-5.4-pro",
		"openai/gpt-5.5-pro",
	]);
	if (OPENAI_SHORT_CONTEXT_CAPPED_MODEL_IDS.has(model.id)) {
		model.compat = {
			...(model.compat as OpenAICompletionsCompat | undefined),
			cacheRetention: "short",
		} as OpenAICompletionsCompat;
	}

	// Moonshot Kimi K2.5 via OpenRouter uses DeepSeek-style thinking format.
	if (model.id === "moonshotai/kimi-k2.5") {
		model.compat = {
			...(model.compat as OpenAICompletionsCompat | undefined),
			supportsDeveloperRole: undefined,
			thinkingFormat: "deepseek",
			requiresReasoningContentOnAssistantMessages: true,
			maxTokensField: undefined,
		} as OpenAICompletionsCompat;
	}

	// Pin Kimi K2.5 pricing until upstream settles.
	if (model.id === "moonshotai/kimi-k2.5") {
		model.cost.input = 0.41;
		model.cost.output = 2.06;
		model.cost.cacheRead = 0.07;
		model.maxTokens = 4096;
	}

	// Kimi K2.6 via OpenRouter uses Anthropic-style thinking objects and
	// rejects string thinking values; also requires reasoning content on
	// assistant messages.
	if (model.id.startsWith("moonshotai/kimi-k2.6")) {
		model.compat = {
			...(model.compat as OpenAICompletionsCompat | undefined),
			supportsDeveloperRole: false,
			requiresReasoningContentOnAssistantMessages: true,
		};
	}

	// Pin Z AI GLM-5 pricing.
	if (model.id === "z-ai/glm-5") {
		model.cost.input = 0.6;
		model.cost.output = 1.9;
		model.cost.cacheRead = 0.119;
	}
}

async function generateModels() {
	const openRouterModels = await fetchOpenRouterModels();

	const allModels: Model<any>[] = [];
	for (const model of openRouterModels) {
		const normalized = { ...model };
		applyOpenRouterModelOverrides(normalized);
		allModels.push(normalized);
	}

	// Add "auto" alias for openrouter/auto
	if (!allModels.some((m) => m.provider === "openrouter" && m.id === "auto")) {
		allModels.push({
			id: "auto",
			name: "Auto",
			api: "openai-completions",
			baseUrl: OPENROUTER_API_BASE_URL,
			provider: "openrouter",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 2000000,
			maxTokens: 30000,
		});
	}

	// Add "openrouter/fusion" alias
	if (!allModels.some((m) => m.provider === "openrouter" && m.id === "openrouter/fusion")) {
		allModels.push({
			id: "openrouter/fusion",
			name: "OpenRouter: Fusion",
			api: "openai-completions",
			baseUrl: OPENROUTER_API_BASE_URL,
			provider: "openrouter",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1000000,
			maxTokens: 30000,
		});
	}

	// Group by provider and deduplicate by model ID
	const providers: Record<string, Record<string, Model<any>>> = {};
	for (const model of allModels) {
		if (!providers[model.provider]) {
			providers[model.provider] = {};
		}
		if (!providers[model.provider][model.id]) {
			providers[model.provider][model.id] = model;
		}
	}

	const sortedProviderIds = Object.keys(providers).sort();
	const jsonProviders: Record<string, Record<string, Model<any>>> = {};
	for (const providerId of sortedProviderIds) {
		jsonProviders[providerId] = {};
		for (const modelId of Object.keys(providers[providerId]).sort()) {
			jsonProviders[providerId][modelId] = providers[providerId][modelId];
		}
	}

	const serializeJson = (value: unknown) => `${JSON.stringify(value, null, generatorOptions.pretty ? 2 : undefined)}\n`;
	const writeJson = (path: string, value: unknown) => writeFileSync(path, serializeJson(value));
	const generatedDataProviderIds = generatorOptions.dataOnly
		? readModelDataProviderIds(packageRoot)
		: sortedProviderIds;
	const missingProviderIds = generatedDataProviderIds.filter((providerId) => !jsonProviders[providerId]);
	if (missingProviderIds.length > 0) {
		throw new Error(`Cannot hydrate missing providers: ${missingProviderIds.join(", ")}`);
	}

	// Only the internal data is grouped by API for type derivation. Public JSON catalog output stays flat.
	const generatedDataProviders: Record<string, Record<string, Record<string, Model<Api>>>> = {};
	const modelDataStructure: ModelDataStructure = {};
	for (const providerId of generatedDataProviderIds) {
		const models = jsonProviders[providerId];
		generatedDataProviders[providerId] = {};
		modelDataStructure[providerId] = {};
		const apiIds = Array.from(new Set(Object.values(models).map((model) => model.api))).sort();
		for (const api of apiIds) {
			generatedDataProviders[providerId][api] = {};
			for (const [modelId, model] of Object.entries(models)) {
				if (model.api !== api) continue;
				generatedDataProviders[providerId][api][modelId] = model;
				modelDataStructure[providerId][modelId] = api;
			}
		}
	}

	const generatedAt = new Date().toISOString();

	if (!generatorOptions.jsonOnly) {
		const providersDir = join(packageRoot, "src/providers");
		const dataDir = join(providersDir, "data");
		const stagingRoot = mkdtempSync(join(providersDir, ".model-generation-"));
		const stagedDataDir = join(stagingRoot, "data");
		const previousDataDir = join(stagingRoot, "previous-data");
		let restoreGeneratedCatalog: (() => void) | undefined;
		try {
			mkdirSync(stagedDataDir, { recursive: true });
			const fileContents: Record<string, string> = {};
			for (const providerId of generatedDataProviderIds) {
				const filename = `${providerId}.json`;
				const content = serializeJson(generatedDataProviders[providerId]);
				fileContents[filename] = content;
				writeFileSync(join(stagedDataDir, filename), content);
			}
			writeJson(
				join(stagedDataDir, MODEL_DATA_MANIFEST_FILE),
				createModelDataManifest(modelDataStructure, fileContents, generatedAt),
			);
			validateModelDataDirectory(modelDataStructure, stagedDataDir);

			if (!generatorOptions.dataOnly) {
				const previousShardContents = new Map(
					readdirSync(providersDir)
						.filter((entry) => entry.endsWith(".models.ts"))
						.map((entry) => [entry, readFileSync(join(providersDir, entry), "utf8")] as const),
				);
				const aggregatorPath = join(packageRoot, "src/models.generated.ts");
				const previousAggregator = readFileSync(aggregatorPath, "utf8");
				restoreGeneratedCatalog = () => {
					for (const entry of readdirSync(providersDir)) {
						if (entry.endsWith(".models.ts")) rmSync(join(providersDir, entry));
					}
					for (const [entry, content] of previousShardContents) {
						writeFileSync(join(providersDir, entry), content);
					}
					writeFileSync(aggregatorPath, previousAggregator);
				};

				const generatedHeader = `// This file is auto-generated by scripts/generate-models.ts\n// Do not edit manually - run 'npm run generate-models' to update\n\n`;
				const catalogConstName = (providerId: string) =>
					`${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODELS`;
				const generatedShardFiles = new Set<string>();
				for (const providerId of sortedProviderIds) {
					let output = generatedHeader;
					output += `import values from "./data/${providerId}.json" with { type: "json" };\n`;
					output += `import { flattenModelCatalog, type ModelCatalog } from "../model-catalog.ts";\n\n`;
					output += `export const ${catalogConstName(providerId)}: ModelCatalog<typeof values, ${JSON.stringify(providerId)}> =\n`;
					output += `\tflattenModelCatalog(${JSON.stringify(providerId)}, values);\n`;
					const filename = `${providerId}.models.ts`;
					generatedShardFiles.add(filename);
					writeFileSync(join(providersDir, filename), output);
				}
				for (const entry of readdirSync(providersDir)) {
					if (entry.endsWith(".models.ts") && !generatedShardFiles.has(entry)) rmSync(join(providersDir, entry));
				}
				let output = generatedHeader;
				for (const providerId of sortedProviderIds) {
					output += `import { ${catalogConstName(providerId)} } from "./providers/${providerId}.models.ts";\n`;
				}
				output += `\nexport const MODELS: {\n`;
				for (const providerId of sortedProviderIds) {
					output += `\treadonly ${JSON.stringify(providerId)}: typeof ${catalogConstName(providerId)};\n`;
				}
				output += `} = {\n`;
				for (const providerId of sortedProviderIds) {
					output += `\t${JSON.stringify(providerId)}: ${catalogConstName(providerId)},\n`;
				}
				output += `};\n`;
				writeFileSync(aggregatorPath, output);
				console.log("Generated provider catalogs and src/models.generated.ts");
			}

			const hadPreviousData = existsSync(dataDir);
			if (hadPreviousData) renameSync(dataDir, previousDataDir);
			try {
				renameSync(stagedDataDir, dataDir);
				validateGeneratedModelData(packageRoot);
			} catch (error) {
				rmSync(dataDir, { recursive: true, force: true });
				if (hadPreviousData && existsSync(previousDataDir)) renameSync(previousDataDir, dataDir);
				throw error;
			}
			restoreGeneratedCatalog = undefined;
			console.log(
				generatorOptions.dataOnly
					? "Hydrated JSON model values under src/providers/data/"
					: "Generated JSON model values under src/providers/data/",
			);
		} catch (error) {
			restoreGeneratedCatalog?.();
			throw error;
		} finally {
			rmSync(stagingRoot, { recursive: true, force: true });
		}
	}

	if (generatorOptions.jsonOutputDir) {
		const providerOutputDir = join(generatorOptions.jsonOutputDir, "providers");
		rmSync(generatorOptions.jsonOutputDir, { recursive: true, force: true });
		mkdirSync(providerOutputDir, { recursive: true });
		writeJson(join(generatorOptions.jsonOutputDir, "models.json"), jsonProviders);
		writeJson(join(generatorOptions.jsonOutputDir, "providers.json"), sortedProviderIds);
		for (const providerId of sortedProviderIds) {
			writeJson(join(providerOutputDir, `${providerId}.json`), jsonProviders[providerId]);
		}
		console.log(`Generated JSON model catalog under ${generatorOptions.jsonOutputDir}`);
	}

	// Print statistics
	const totalModels = allModels.length;
	const reasoningModels = allModels.filter((m) => m.reasoning).length;

	console.log(`\nModel Statistics:`);
	console.log(`  Total tool-capable models: ${totalModels}`);
	console.log(`  Reasoning-capable models: ${reasoningModels}`);

	for (const [provider, models] of Object.entries(providers)) {
		console.log(`  ${provider}: ${Object.keys(models).length} models`);
	}
}

// Run the generator
generateModels().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
