import { registerBundledOAuthFlowLoaders } from "./auth/oauth/load.ts";
import { openaiCodexOAuth } from "./auth/oauth/openai-codex.ts";
import { openRouterOAuth } from "./auth/oauth/openrouter.ts";
import { createRadiusOAuth } from "./auth/oauth/radius.ts";

/** Register OAuth flows statically embedded in the standalone Bun binary. */
export function registerBunOAuthFlows(): void {
	registerBundledOAuthFlowLoaders({
		openaiCodex: () => openaiCodexOAuth,

		openrouter: () => openRouterOAuth,
		radius: createRadiusOAuth,
	});
}
