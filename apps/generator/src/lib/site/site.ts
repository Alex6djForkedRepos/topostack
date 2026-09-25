// Site-wide constants small enough for any page's bundle. The page registry in
// seo.ts reaches the browser only on pages that import it; the layout gets its
// head metadata from a server load instead.
export const SITE_ORIGIN = "https://topostack.app";
export const REPOSITORY_URL = "https://github.com/Echo-Foxtrot-Works/topostack";
export const DOCS_HOME = "/guides";
export const LAKES_HOME = "/lakes";
export const EXAMPLES_HOME = "/examples";
/** The studio link that opens a worked example; the studio reads `examples/<slug>.json` itself. */
export const exampleStudioPath = (slug: string): string => `/studio?example=${slug}`;
export const SITE_LOCALE = "en_US";

/** Sharing card. Dimensions are declared so consumers that refuse to fetch the file still lay it out. */
export interface SocialImage { url: string; width: number; height: number; alt: string }

export const DEFAULT_SOCIAL_IMAGE: SocialImage = {
  url: "/images/social-crater-lake.png",
  width: 1200,
  height: 630,
  alt: "TopoStack Crater Lake relief with USGS surveyed lake-floor bathymetry and exaggerated depth.",
};
