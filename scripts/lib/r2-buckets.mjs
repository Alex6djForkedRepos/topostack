import { readFile } from "node:fs/promises";

export const DEVELOPMENT_ORIGIN = "https://dev-topostack.echofoxtrot.works";
export const PRODUCTION_ORIGIN = "https://topostack.echofoxtrot.works";

/** Every managed bucket, the wrangler environment that binds it, and that deployment's public gateway. */
export const BUCKET_DEPLOYMENTS = Object.freeze({
  "topostack-vector-data-development": { environment: "development", origin: DEVELOPMENT_ORIGIN },
  "topostack-vector-data": { environment: "production", origin: PRODUCTION_ORIGIN },
  "topostack-map-cache-development": { environment: "development", origin: DEVELOPMENT_ORIGIN },
  "topostack-map-cache": { environment: "production", origin: PRODUCTION_ORIGIN },
});

export function bucketDeployment(bucket) {
  const deployment = BUCKET_DEPLOYMENTS[bucket];
  if (!deployment) throw new Error(`No deployment is registered for bucket ${bucket}.`);
  return deployment;
}

/** Removes JSONC comments and trailing commas without touching string contents (URLs contain `//`). */
export function stripJsonc(text) {
  let output = "", inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (inString) {
      output += char;
      if (char === "\\") output += text[++index] ?? "";
      else if (char === '"') inString = false;
    } else if (char === '"') { inString = true; output += char; }
    else if (char === "/" && next === "/") { while (index < text.length && text[index] !== "\n") index += 1; output += "\n"; }
    else if (char === "/" && next === "*") { index = text.indexOf("*/", index + 2); if (index < 0) throw new Error("Unterminated JSONC comment."); index += 1; }
    else if (char === "," && /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*[}\]]/.test(text.slice(index + 1))) continue;
    else output += char;
  }
  return output;
}

export async function readWranglerConfig(path = new URL("../../workers/map-api/wrangler.jsonc", import.meta.url)) {
  return JSON.parse(stripJsonc(await readFile(path, "utf8")));
}

/** The dataset version a wrangler environment will deploy with. */
export function configuredDatasetVersion(config, environment) {
  const version = config.env?.[environment]?.vars?.DATASET_VERSION;
  if (typeof version !== "string" || !version) throw new Error(`wrangler.jsonc has no DATASET_VERSION for ${environment}.`);
  return version;
}
