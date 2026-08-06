# Provider Pruning & Codebase Minimization Plan

This document outlines the detailed step-by-step plan for removing all unused AI providers from `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent`, restricting built-in provider options exclusively to **OpenRouter** and local/custom **vLLM** (via OpenAI completions format) on the `enterprise-fork` branch.

---

## 1. Objectives

- **Reduce Bundle Size**: Eliminate all unused provider logic, model catalogs, pricing tables, and provider-specific API format adapters.
- **Minimize Egress Risk**: Prevent accidental invocation or configuration of unauthorized third-party provider endpoints (e.g. Anthropic, Google Gemini, Amazon Bedrock, Azure OpenAI).
- **Simplify Maintainability**: Retain only [`openrouter.ts`](file:///workspace/packages/ai/src/providers/openrouter.ts), [`openrouter-images.ts`](file:///workspace/packages/ai/src/providers/openrouter-images.ts), and [`openai-completions.ts`](file:///workspace/packages/ai/src/api/openai-completions.ts) for vLLM.

---

## 2. File Modification & Deletion Inventory

### A. Provider Registry ([`packages/ai/src/providers/all.ts`](file:///workspace/packages/ai/src/providers/all.ts))
- Modify [`builtinProviders`](file:///workspace/packages/ai/src/providers/all.ts#L88) to return only `[openrouterProvider()]`.
- Modify `builtinImagesProviders` to return `[openrouterImagesProvider()]`.
- Remove imports and instantiations for:
  - `amazonBedrockProvider` — ~~removed~~
  - `antLingProvider` — ~~removed~~
  - `anthropicProvider` — ~~removed~~
  - `azureOpenAIResponsesProvider` — ~~removed~~
  - `basetenProvider` — ~~removed~~
  - `cerebrasProvider` — ~~removed~~
  - `cloudflareAIGatewayProvider` — ~~removed~~
  - `cloudflareWorkersAIProvider` — ~~removed~~
  - `deepseekProvider` — ~~removed~~
  - `fireworksProvider` — ~~removed~~
  - `githubCopilotProvider`
  - `googleProvider`
  - `googleVertexProvider`
  - `groqProvider` — ~~removed~~
  - `huggingfaceProvider`
  - `kimiCodingProvider` — ~~removed~~
  - `minimaxProvider`, `minimaxCnProvider`
  - `mistralProvider`
  - `moonshotaiProvider`, `moonshotaiCnProvider`
  - `nvidiaProvider`
  - `openaiProvider`
  - ~~`openaiCodexProvider`~~ — ~~removed~~
  - `opencodeProvider`, `opencodeGoProvider`
  - `qwenTokenPlanProvider`, `qwenTokenPlanCnProvider`
  - `radiusProvider`
  - `togetherProvider` — ~~removed~~
  - `vercelAIGatewayProvider`
  - `xaiProvider` — ~~removed~~
  - `xiaomiProvider`, `xiaomiTokenPlanAmsProvider`, `xiaomiTokenPlanCnProvider`, `xiaomiTokenPlanSgpProvider`
  - `zaiProvider`, `zaiCodingCnProvider`

### B. Provider Source Files to Delete ([`packages/ai/src/providers/`](file:///workspace/packages/ai/src/providers/))
- Remove all non-OpenRouter provider files:
  - `amazon-bedrock.ts`, `amazon-bedrock.models.ts` — ~~deleted~~
  - `ant-ling.ts`, `ant-ling.models.ts` — ~~deleted~~
  - `anthropic.ts`, `anthropic.models.ts` — ~~deleted~~
  - `azure-openai-responses.ts`, `azure-openai-responses.models.ts` — ~~deleted~~
  - `baseten.ts`, `baseten.models.ts` — ~~deleted~~
  - `cerebras.ts`, `cerebras.models.ts` — ~~deleted~~
  - `cloudflare-ai-gateway.ts`, `cloudflare-ai-gateway.models.ts` — ~~deleted~~
  - `cloudflare-workers-ai.ts`, `cloudflare-workers-ai.models.ts` — ~~deleted~~
  - `deepseek.ts`, `deepseek.models.ts` — ~~deleted~~
  - `fireworks.ts`, `fireworks.models.ts` — ~~deleted~~
  - `github-copilot.ts`, `github-copilot.models.ts`
  - `google.ts`, `google.models.ts`
  - `google-vertex.ts`, `google-vertex.models.ts`
  - `groq.ts`, `groq.models.ts` — ~~deleted~~
  - `huggingface.ts`, `huggingface.models.ts`
  - `kimi-coding.ts`, `kimi-coding.models.ts` — ~~deleted~~
  - `minimax.ts`, `minimax.models.ts`, `minimax-cn.ts`, `minimax-cn.models.ts`
  - `mistral.ts`, `mistral.models.ts`
  - `moonshotai.ts`, `moonshotai.models.ts`, `moonshotai-cn.ts`, `moonshotai-cn.models.ts`
  - `nvidia.ts`, `nvidia.models.ts`
  - `openai.ts`, `openai.models.ts` — ~~openai-codex.ts, openai-codex.models.ts~~ ~~deleted~~ (staged in working tree)
  - `opencode.ts`, `opencode.models.ts`, `opencode-go.ts`, `opencode-go.models.ts`
  - `qwen-token-plan.ts`, `qwen-token-plan.models.ts`, `qwen-token-plan-cn.ts`, `qwen-token-plan-cn.models.ts`
  - `together.ts`, `together.models.ts` — ~~deleted~~
  - `vercel-ai-gateway.ts`, `vercel-ai-gateway.models.ts`
  - `xai.ts`, `xai.models.ts` — ~~deleted~~
  - `xiaomi.ts`, `xiaomi.models.ts`, `xiaomi-token-plan-ams.ts`, `xiaomi-token-plan-ams.models.ts`, `xiaomi-token-plan-cn.ts`, `xiaomi-token-plan-cn.models.ts`, `xiaomi-token-plan-sgp.ts`, `xiaomi-token-plan-sgp.models.ts`
  - `zai.ts`, `zai.models.ts`, `zai-coding-cn.ts`, `zai-coding-cn.models.ts`

### C. OAuth Flow Removals ([`packages/ai/src/auth/oauth/`](file:///workspace/packages/ai/src/auth/oauth/))
- ~~Remove `openai-codex.ts` OAuth flow (staged in working tree)~~
- ~~Remove `kimi-coding.ts` OAuth flow ~~(committed in f019e9201)~~
- ~~Remove `anthropic.ts` OAuth flow ~~(from earlier commit batch)~~
- ~~Remove `azure-openai-responses` OAuth flow ~~(from earlier commit batch)~~
- ~~Remove `github-copilot.ts` OAuth flow ~~(from earlier commit batch)~~
- ~~Remove `xai.ts` OAuth flow ~~(from earlier commit batch)~~

### D. OAuth Loader Cleanup ([`packages/ai/src/auth/oauth/load.ts`](file:///workspace/packages/ai/src/auth/oauth/load.ts))
- ~~Remove `openaiCodex`/`kimiCoding` OAuth loaders ~~(staged in working tree)~~
- ~~Remove `loadOpenAICodexOAuth` function ~~(staged in working tree)~~
- ~~Remove `loadKimiCodingOAuth` function ~~(committed in f019e9201)~~

### E. Bundled OAuth Flows ([`packages/ai/src/bun-oauth.ts`](file:///workspace/packages/ai/src/bun-oauth.ts))
- ~~Remove `openaiCodex` and `kimiCoding` from `registerBunOAuthFlows` ~~(staged in working tree)~~

### F. Environment Variable Cleanup ([`packages/ai/src/env-api-keys.ts`](file:///workspace/packages/ai/src/env-api-keys.ts))
- ~~Remove `KIMI_API_KEY` entry ~~(committed in f019e9201)~~

### G. Model Catalog Cleanup ([`packages/ai/scripts/generate-models.ts`](file:///workspace/packages/ai/scripts/generate-models.ts))
- Update [`generate-models.ts`](file:///workspace/packages/ai/scripts/generate-models.ts) to restrict model generation output strictly to `openrouter` entries.

### H. Type Definition Cleanup ([`packages/ai/src/types.ts`](file:///workspace/packages/ai/src/types.ts))
- ~~Remove `openai-codex` from `KnownProvider` ~~(staged in working tree)~~
- Remove remaining non-OpenRouter provider entries from `KnownProvider`

### I. Generated Models Catalog ([`packages/ai/src/models.generated.ts`](file:///workspace/packages/ai/src/models.generated.ts))
- Regenerate to strip unused provider metadata.
- ~~Remove `kimi-coding` entries ~~(committed in f019e9201)~~
- ~~Remove `openai-codex` entries ~~(staged in working tree)~~

### J. Model Default Resolution ([`packages/coding-agent/src/core/model-resolver.ts`](file:///workspace/packages/coding-agent/src/core/model-resolver.ts))
- ~~Remove `kimi-coding` default model entry ~~(committed in f019e9201)~~
- Remove remaining non-OpenRouter default model entries

### K. CLI Args Cleanup ([`packages/coding-agent/src/cli/args.ts`](file:///workspace/packages/coding-agent/src/cli/args.ts))
- ~~Remove `KIMI_API_KEY` from environment variable listing ~~(committed in f019e9201)~~

### L. Footer Component Cleanup ([`packages/coding-agent/src/modes/interactive/components/footer.ts`](file:///workspace/packages/coding-agent/src/modes/interactive/components/footer.ts))
- ~~Remove kimi-coding subscription check ~~(committed in f019e9201)~~

### M. Local vLLM Provider Definition
- Ensure OpenAI completions format adapter [`openai-completions.ts`](file:///workspace/packages/ai/src/api/openai-completions.ts) remains available so vLLM can be registered via `models.json` (per [`models.md`](file:///workspace/packages/coding-agent/docs/models.md#L3)).

---

## 3. Verification & Validation Steps

1. Run `npm run check` to verify zero missing imports or broken TypeScript definitions.
2. Verify package build via `npm run build`.
3. Inspect generated bundle size to confirm reduction.
