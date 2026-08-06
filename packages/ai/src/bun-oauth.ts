import { registerBundledOAuthFlowLoaders } from "./auth/oauth/load.ts";
import { openRouterOAuth } from "./auth/oauth/openrouter.ts";

/** Register OAuth flows statically embedded in the standalone Bun binary. */
export function registerBunOAuthFlows(): void {
	registerBundledOAuthFlowLoaders({
		openrouter: () => openRouterOAuth,
	});
}
