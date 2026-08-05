import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";

const models = createModels();
models.setProvider(openrouterProvider());
const model = models.getModel("openrouter", "anthropic/claude-sonnet-4.5");
if (!model) throw new Error("OpenRouter smoke-test model not found");

export const agent = new Agent({
	initialState: { model },
	streamFn: models.streamSimple.bind(models),
});
