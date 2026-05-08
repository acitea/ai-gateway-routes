import { compileYamlRoute, defineRoute } from "ai-gateway-routes";

compileYamlRoute(`
name: linear
start: openai
nodes:
  openai:
    model:
      provider: openai
      model: gpt-4.1-mini
      timeout: 30
      retries: 2
      success: end
      fallback: end
`);

const route = defineRoute("linear", (b) => {
  const model = b.model("openai", {
    provider: "openai",
    model: "gpt-4.1-mini",
    timeout: 30,
    retries: 2,
  });

  b.fromStart().to(model);
  model.onSuccess().toEnd();
  model.onFallback().toEnd();
});

route.compile();
