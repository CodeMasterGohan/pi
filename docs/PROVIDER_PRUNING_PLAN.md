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
  - `openaiProvider`, `openaiCodexProvider`
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
  - `openai.ts`, `openai.models.ts`, `openai-codex.ts`, `openai-codex.models.ts`
  - `opencode.ts`, `opencode.models.ts`, `opencode-go.ts`, `opencode-go.models.ts`
  - `qwen-token-plan.ts`, `qwen-token-plan.models.ts`, `qwen-token-plan-cn.ts`, `qwen-token-plan-cn.models.ts`
  - `together.ts`, `together.models.ts` — ~~deleted~~
  - `vercel-ai-gateway.ts`, `vercel-ai-gateway.models.ts`
  - `xai.ts`, `xai.models.ts` — ~~deleted~~
  - `xiaomi.ts`, `xiaomi.models.ts`, `xiaomi-token-plan-ams.ts`, `xiaomi-token-plan-ams.models.ts`, `xiaomi-token-plan-cn.ts`, `xiaomi-token-plan-cn.models.ts`, `xiaomi-token-plan-sgp.ts`, `xiaomi-token-plan-sgp.models.ts`
  - `zai.ts`, `zai.models.ts`, `zai-coding-cn.ts`, `zai-coding-cn.models.ts`

~~Also removed (staged for deletion in working tree):~~
~~- `kimi-coding.ts`, `kimi-coding.models.ts`~~

### C. Static Model Catalog Generation ([`packages/ai/scripts/generate-models.ts`](file:///workspace/packages/ai/scripts/generate-models.ts))
- Update [`generate-models.ts`](file:///workspace/packages/ai/scripts/generate-models.ts) to restrict model generation output strictly to `openrouter` entries.
- Regenerate [`packages/ai/src/models.generated.ts`](file:///workspace/packages/ai/src/models.generated.ts) to strip unused provider metadata.

### D. Local vLLM Provider Definition
- Ensure OpenAI completions format adapter [`openai-completions.ts`](file:///workspace/packages/ai/src/api/openai-completions.ts) remains available so vLLM can be registered via `models.json` (per [`models.md`](file:///workspace/packages/coding-agent/docs/models.md#L3)).

---

## 3. Verification & Validation Steps

1. Run `npm run check` to verify zero missing imports or broken TypeScript definitions.
2. Verify package build via `npm run build`.
3. Inspect generated bundle size to confirm reduction.
