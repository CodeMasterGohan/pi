import { describe, expect, it } from "vitest";
import { convertResponsesMessages } from "../src/api/openai-responses-shared.ts";
import { getModel } from "../src/compat.ts";
import type { AssistantMessage, Context, Model, ToolResultMessage, Usage } from "../src/types.ts";

function toOpenAIResponsesModel(model: Model<"openai-completions">): Model<"openai-responses"> {
	const baseCompat = model.compat as Record<string, unknown> | undefined;
	const { sessionAffinityFormat: _sessionAffinityFormat, ...restCompat } = baseCompat ?? {};
	return {
		...model,
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		compat: { ...restCompat, sendSessionAffinityHeaders: false } as unknown as Model<"openai-responses">["compat"],
	} as unknown as Model<"openai-responses">;
}

const usage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function buildEmptyToolResult(toolCallId: string, timestamp: number): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName: "bash",
		content: [{ type: "text", text: "" }],
		isError: false,
		timestamp,
	};
}

describe("OpenAI Responses convertResponsesMessages empty tool result", () => {
	it("uses '(no tool output)' placeholder for empty tool results without images", () => {
		const model = toOpenAIResponsesModel(getModel("openrouter", "openai/gpt-4o-mini")!);
		const now = Date.now();
		const assistant: AssistantMessage = {
			role: "assistant",
			content: [{ type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "true" } }],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage,
			stopReason: "toolUse",
			timestamp: now,
		};

		const context: Context = {
			messages: [
				{ role: "user", content: "Run the command", timestamp: now - 1 },
				assistant,
				buildEmptyToolResult("tool-1", now + 1),
			],
		};

		const input = convertResponsesMessages(model, context, new Set(["openrouter"]));
		const functionCallOutput = input.find((item) => item.type === "function_call_output") as
			| { type: "function_call_output"; output: string }
			| undefined;

		expect(functionCallOutput).toBeTruthy();
		expect(functionCallOutput?.output).toBe("(no tool output)");
		expect(functionCallOutput?.output).not.toContain("see attached image");
	});
});
