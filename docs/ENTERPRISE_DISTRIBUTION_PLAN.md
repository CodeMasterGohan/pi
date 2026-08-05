# Enterprise Distributable & Provider Pruning Plan

This plan details the steps to strip unused AI providers from `@earendil-works/pi-ai`, hardcode enterprise network boundaries to OpenRouter and local vLLM, configure internal CA certificate handling, and produce cross-platform distributable binaries on the `enterprise-fork` branch.

---

## 1. Provider Pruning & Codebase Minimization

### Objective
Remove all built-in provider implementations, model catalogs, and OAuth flows except for **OpenRouter** and OpenAI-compatible **vLLM** to drastically reduce overall bundle size.

### Detailed Sub-Plan
See the dedicated [`PROVIDER_PRUNING_PLAN.md`](file:///workspace/docs/PROVIDER_PRUNING_PLAN.md) for the complete file deletion inventory, model generation script modifications, and provider registry updates.

### Summary Steps
1. **Prune Provider Registry ([`packages/ai/src/providers/all.ts`](file:///workspace/packages/ai/src/providers/all.ts)):**
   - Retain only `openrouterProvider`, `openrouterImagesProvider`, and generic `openAICompletionsApi` (used for vLLM).
   - Delete all non-OpenRouter provider source files in [`packages/ai/src/providers/`](file:///workspace/packages/ai/src/providers/).
2. **Update Generated Model Catalog ([`packages/ai/scripts/generate-models.ts`](file:///workspace/packages/ai/scripts/generate-models.ts)):**
   - Filter `MODELS` catalog during generation to restrict output in [`models.generated.ts`](file:///workspace/packages/ai/src/models.generated.ts) to OpenRouter models only.

---

## 2. Configurable Build & Enterprise Toggle

### Objective
Make enterprise isolation settings easy to configure before triggering distributable builds.

### Steps
1. **Enterprise Build Config Flag ([`packages/coding-agent/src/config.ts`](file:///workspace/packages/coding-agent/src/config.ts)):**
   - Expose a build flag `PI_ENTERPRISE_DISTRIBUTION=true` or sentinel file `dist/enterprise`.
2. **Dynamic Egress Guard ([`packages/coding-agent/src/core/http-dispatcher.ts`](file:///workspace/packages/coding-agent/src/core/http-dispatcher.ts#L81)):**
   - In [`configureHttpDispatcher`](file:///workspace/packages/coding-agent/src/core/http-dispatcher.ts#L81), enforce strict destination checking:
     - Allowed: `https://openrouter.ai/*`, `http://localhost:*`, `http://127.0.0.1:*`, or user-specified internal vLLM domain/IP ranges.
     - Blocked: All other destinations.

---

## 3. Telemetry & Local Execution Hardening

### Objective
Eliminate remote telemetry, update checks, and untrusted code execution paths.

### Steps
1. **Telemetry & Updates:**
   - Hardcode `enableInstallTelemetry: false` and `enableAnalytics: false` in [`SettingsManager`](file:///workspace/packages/coding-agent/src/core/settings-manager.ts#L10).
   - Disable update checks in [`main.ts`](file:///workspace/packages/coding-agent/src/main.ts#L1).
2. **Project Trust Default Hardening:**
   - Set `defaultProjectTrust: "never"` in [`resolveProjectTrusted`](file:///workspace/packages/coding-agent/src/core/project-trust.ts#L77) so untrusted project templates or extensions are rejected automatically without UI prompts.

---

## 4. Internal CA Certificate Support for Local HTTPS vLLM

### Objective
Support secure connection to internal vLLM endpoints and corporate egress proxies signed by internal enterprise Certificate Authorities.

### Steps
1. Ensure the Node runtime dispatcher respects `NODE_EXTRA_CA_CERTS` environment variable when validating TLS certificates in [`configureHttpDispatcher`](file:///workspace/packages/coding-agent/src/core/http-dispatcher.ts#L81).
2. Set `NO_PROXY=localhost,127.0.0.1,.internal.domain` to bypass external proxy gateways for internal HTTPS vLLM hosts.

---

## 5. Cross-Platform Distributable Generation (Windows, Linux, macOS)

### Objective
Compile standalone, zero-dependency release binaries for enterprise distribution across Windows, Linux, and macOS platforms.

### Steps
1. Run [`scripts/build-binaries.sh`](file:///workspace/scripts/build-binaries.sh) or [`scripts/enterprise-release.mjs`](file:///workspace/scripts/enterprise-release.mjs) to compile standalone executables:
   - **Linux**: `pi-linux-x64.tar.gz`, `pi-linux-arm64.tar.gz`
   - **macOS**: `pi-darwin-arm64.tar.gz` (Apple Silicon), `pi-darwin-x64.tar.gz` (Intel)
   - **Windows**: `pi-windows-x64.zip`, `pi-windows-arm64.zip`
2. Output distributable archives to `packages/coding-agent/binaries/` for deployment to enterprise endpoint management tools (e.g. Jamf, SCCM, Intune).
