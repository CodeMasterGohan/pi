import { afterEach, describe, expect, it } from "vitest";
import { findEnvKeys, getEnvApiKey } from "../src/env-api-keys.ts";

const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
	if (originalOpenRouterApiKey === undefined) {
		delete process.env.OPENROUTER_API_KEY;
	} else {
		process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
	}
});

describe("environment API keys", () => {
	it("reports OPENROUTER_API_KEY for OpenRouter provider", () => {
		process.env.OPENROUTER_API_KEY = "openrouter-key";

		expect(findEnvKeys("openrouter")).toEqual(["OPENROUTER_API_KEY"]);
		expect(getEnvApiKey("openrouter")).toBe("openrouter-key");
	});

	it("returns undefined when no env key is configured", () => {
		delete process.env.OPENROUTER_API_KEY;

		expect(findEnvKeys("openrouter")).toBeUndefined();
		expect(getEnvApiKey("openrouter")).toBeUndefined();
	});
});
