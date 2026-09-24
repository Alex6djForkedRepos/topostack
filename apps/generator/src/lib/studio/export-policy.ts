import { buildProjectPackage, exportBlockReason, type GeometryIRV1, type GuideFont, type ProjectConfigV1, type SheetNestPlanV1 } from "@topostack/core";
import jostUrl from "@loidolt/theme-styles/fonts/Jost-Medium.woff2?url";
import archivoUrl from "@loidolt/theme-styles/fonts/Archivo-Regular.woff2?url";

export { buildProjectPackage, exportBlockReason } from "@topostack/core";
export type ExportIntent = "download" | "openInStudio";

// The site's own faces, one weight per family as the theme ships them. The
// build already emits these files for the site stylesheet, so embedding them
// in the assembly guide costs a (usually cached) fetch, not bundle bytes.
const GUIDE_FONTS = [
  { family: "Jost", weight: 500, url: jostUrl },
  { family: "Archivo", weight: 400, url: archivoUrl },
];

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

let guideFonts: Promise<GuideFont[]> | undefined;

/** The site fonts as base64, loaded once. A font that fails to load is left out and the guide falls back to system fonts. */
export function loadGuideFonts(): Promise<GuideFont[]> {
  guideFonts ??= Promise.all(GUIDE_FONTS.map(async ({ family, weight, url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      return [{ family, weight, woff2Base64: toBase64(new Uint8Array(await response.arrayBuffer())) }];
    } catch {
      return [];
    }
  })).then((fonts) => fonts.flat());
  return guideFonts;
}

export function createAtommExport(geometry: GeometryIRV1, project: ProjectConfigV1, intent: ExportIntent, fonts: readonly GuideFont[] = [], sheetPlan?: SheetNestPlanV1) {
  const reason = exportBlockReason(geometry, project);
  if (reason) throw new Error(reason);
  const output = buildProjectPackage(geometry, project, { guideFonts: fonts, sheetPlan });
  return intent === "openInStudio" ? { filename: output.master.filename, blob: output.master.blob } : output.files;
}
