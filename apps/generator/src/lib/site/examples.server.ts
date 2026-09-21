import { EXAMPLES, type ExampleCapture, type ExampleConfig } from "$lib/site/examples";

// Captured results live next to the published project files; see scripts/dev/capture-examples.mjs.
const files = import.meta.glob<{ capture: ExampleCapture & { image: { width: number; height: number } } }>("../../../static/examples/*.json", { eager: true, import: "default" });

export interface PublishedExample extends ExampleConfig {
  capture: ExampleCapture & { image: { width: number; height: number } };
}

export const PUBLISHED_EXAMPLES: readonly PublishedExample[] = EXAMPLES.map((example) => {
  const file = files[`../../../static/examples/${example.slug}.json`];
  if (!file) throw new Error(`Example ${example.slug} has no capture; run scripts/dev/capture-examples.mjs ${example.slug}.`);
  return { ...example, capture: file.capture };
});
