import { cleanRequestText } from "@topostack/core/project";
import { RPC_ERRORS, RpcError } from "./protocol";

/**
 * Prompt templates a person can pick from their chat client's menu. Arguments
 * are the person's own words, cleaned of hidden characters and length-capped
 * before they are placed in the message.
 */
interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  message: (args: Record<string, string>) => string;
}

export const PROMPTS: PromptDefinition[] = [
  {
    name: "design_topo_map",
    title: "Design a topographic model",
    description: "Plan a laser-cut or engraved terrain model of a place and get a TopoStack studio link.",
    arguments: [
      { name: "place", description: "The place to model, such as \"Mount Rainier\" or \"Lake Tahoe\".", required: true },
      { name: "size", description: "Finished size, such as \"300 x 200 mm\" or \"12 inch circle\".", required: false },
      { name: "style", description: "\"layered\" for a stacked 3D relief (default) or \"flat\" for one engraved sheet.", required: false },
    ],
    message: ({ place, size, style }) => [
      `I'd like a ${style === "flat" ? "flat engraved" : "layered, laser-cut"} topographic model of ${place}${size ? `, about ${size}` : ""}.`,
      "Use the TopoStack tools: find the place with search_places, check the plan with plan_model (adjust the area, material thickness or exaggeration if the sheet count looks impractical), then give me the studio link from create_studio_link.",
      "Tell me the size, the number of sheets and their thickness, the scale, and anything from the plan's notes, and keep the data attribution with the answer.",
    ].join("\n"),
  },
  {
    name: "plan_for_my_laser",
    title: "Fit a model to my laser",
    description: "Plan a model around a laser bed size and material, splitting sheets that are larger than the bed.",
    arguments: [
      { name: "bed", description: "The laser's work area, such as \"400 x 400 mm\".", required: true },
      { name: "material", description: "Material and thickness, such as \"3 mm plywood\".", required: false },
      { name: "place", description: "The place to model, if already chosen.", required: false },
    ],
    message: ({ bed, material, place }) => [
      `My laser's work area is ${bed}${material ? ` and I'm cutting ${material}` : ""}.`,
      place ? `I'd like a model of ${place}.` : "Help me choose a place and size that suit it.",
      "Use plan_model with laser.workAreaWidthMm and laser.workAreaHeightMm set to my bed (and materialThicknessMm to my material), keep the sheet count practical, and give me the studio link from create_studio_link with the attribution.",
    ].join("\n"),
  },
];

export function promptListing({ message: _message, ...prompt }: PromptDefinition) {
  return prompt;
}

export function getPrompt(name: string, rawArgs: unknown) {
  const prompt = PROMPTS.find((entry) => entry.name === name);
  if (!prompt) throw new RpcError(RPC_ERRORS.invalidParams, `Unknown prompt: ${name}.`);
  const given = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {};
  const args: Record<string, string> = {};
  for (const argument of prompt.arguments) {
    const value = given[argument.name];
    const text = typeof value === "string" ? cleanRequestText(value, 160) : "";
    if (argument.required && !text) throw new RpcError(RPC_ERRORS.invalidParams, `Prompt argument "${argument.name}" is required.`);
    if (text) args[argument.name] = text;
  }
  return { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.message(args) } }] };
}
