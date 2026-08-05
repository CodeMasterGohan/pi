# Enterprise Readiness & Security Hardening Options

This document outlines technical architectural changes and configuration options for hardening `pi` for enterprise deployment where network access is restricted exclusively to **OpenRouter** and a local **vLLM** instance.

---

## 1. Provider Egress & Endpoint Filtering

### Objective
Restrict model completion requests strictly to `https://openrouter.ai/api/v1` and local vLLM endpoints (e.g. `http://localhost:8000/v1` or internal private IP/host), blocking all other built-in providers (OpenAI, Anthropic, Google Gemini, Azure, Bedrock, etc.).

### Key Changes to Implement
- **Outbound Request Allowlist:**
  - Update [`configureHttpDispatcher`](file:///workspace/packages/coding-agent/src/core/http-dispatcher.ts#L81) to inspect destination URLs and reject any requests not targeted at `https://openrouter.ai/api/v1/*` or allowed local/internal vLLM addresses.
- **Local vLLM Provider Registration:**
  - Define local vLLM instances using the OpenAI-compatible completions API type in `models.json` (see [`models.md`](file:///workspace/packages/coding-agent/docs/models.md#L3)):
    ```json
    {
      "providers": {
        "vllm": {
          "name": "Local vLLM",
          "api": "openai-completions",
          "baseUrl": "http://localhost:8000/v1",
          "apiKey": "vllm-local",
          "compat": {
            "supportsDeveloperRole": false,
            "supportsReasoningEffort": false
          },
          "models": [
            {
              "id": "vllm-model-name",
              "name": "Local vLLM Model",
              "contextWindow": 32768,
              "maxTokens": 4096
            }
          ]
        }
      }
    }
    ```
- **Provider Catalog Pruning:**
  - Prune or omit non-approved providers from [`builtinProviders`](file:///workspace/packages/ai/src/providers/all.ts#L88) to prevent users from selecting non-compliant external endpoints.

---

## 2. Telemetry, Updates, and External Endpoint Lockdown

### Objective
Eliminate background external network calls to default product endpoints or remote update servers.

### Key Changes to Implement
- **Enforce Enterprise Lockdown Flag:**
  - Ensure `isEnterpriseBuild` in [`config.ts`](file:///workspace/packages/coding-agent/src/config.ts) evaluates to true to disable automatic update checks and analytics.
- **Telemetry & Share Command Lockdown:**
  - Enforce `enableInstallTelemetry: false` and `enableAnalytics: false` in [`SettingsManager`](file:///workspace/packages/coding-agent/src/core/settings-manager.ts#L10).
  - Disable or redirect session sharing endpoints (`PI_SHARE_VIEWER_URL`) to prevent uploading interactive sessions outside the corporate network.

---

## 3. Secret & Credential Management

### Objective
Prevent storage of raw API keys in user host disk files (`~/.pi/agent/auth.json`).

### Key Changes to Implement
- **Environment Credential Resolution:**
  - Enforce reading `OPENROUTER_API_KEY` exclusively from environment variables or enterprise secret vaults (e.g., HashiCorp Vault, AWS Secrets Manager).
- **vLLM Dummy Auth:**
  - Configure local vLLM entries with static/placeholder API keys so non-authenticated local endpoints function cleanly without interactive login prompts.

---

## 4. Code Execution & Project Trust Controls

### Objective
Prevent unauthorized code execution, untrusted extension execution, or rogue project configuration loads.

### Key Changes to Implement
- **Strict Project Trust Defaults:**
  - Enforce `defaultProjectTrust: "never"` or mandate manual admin trust resolution in [`resolveProjectTrusted`](file:///workspace/packages/coding-agent/src/core/project-trust.ts#L15).
- **Container Sandboxing:**
  - Deploy the process within isolated container boundaries or micro-VMs (as detailed in [`containerization.md`](file:///workspace/packages/coding-agent/docs/containerization.md)).

---

## 5. Enterprise Proxy & TLS Certificate Configuration

### Objective
Support corporate egress proxies (Zscaler, Netskope, Palo Alto) with custom root certificates while routing internal vLLM traffic directly.

### Key Changes to Implement
- **Custom CA Certificate Support:**
  - Configure `NODE_EXTRA_CA_CERTS` in the runtime environment so Undici/fetch dispatchers trust corporate SSL inspection certificates.
- **Proxy Bypass for Local vLLM:**
  - Set `NO_PROXY=localhost,127.0.0.1,.internal.domain` alongside `HTTP_PROXY`/`HTTPS_PROXY` so local vLLM requests bypass corporate proxy gateways.
