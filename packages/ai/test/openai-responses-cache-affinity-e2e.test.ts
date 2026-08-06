import { describe, expect, it } from "vitest";
import { complete, getModel } from "../src/compat.ts";
import type { Context, Model } from "../src/types.ts";

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

describe.skipIf(!process.env.OPENAI_API_KEY)("openai responses cache affinity e2e", () => {
	it("handles direct OpenAI Responses requests with aligned cache-affinity identifiers", { retry: 2 }, async () => {
		const model = toOpenAIResponsesModel(getModel("openrouter", "openai/gpt-5.4")!);
		const sessionId = "0195d6e4-4cf9-7f44-a2d8-f8f7f49ee9d3";
		const context: Context = {
			systemPrompt: "You are a helpful assistant. Reply exactly as requested.",
			messages: [
				{
					role: "user",
					content: "Reply with exactly: openai cache affinity e2e success",
					timestamp: Date.now(),
				},
			],
		};

		const response = await complete(model, context, {
			apiKey: process.env.OPENAI_API_KEY!,
			sessionId,
		});

		expect(response.stopReason, response.errorMessage).not.toBe("error");
		expect(response.errorMessage).toBeUndefined();
		expect(response.content.map((block) => (block.type === "text" ? block.text : "")).join("")).toContain(
			"openai cache affinity e2e success",
		);
	});
});
