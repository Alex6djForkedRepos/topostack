export const SITE_ORIGIN = "https://topostack.app";
export const REPOSITORY_URL = "https://github.com/Echo-Foxtrot-Works/topostack";
export const DOCS_HOME = "/guides";
export const SITE_LOCALE = "en_US";

/** Sharing card. Dimensions are declared so consumers that refuse to fetch the file still lay it out. */
export interface SocialImage { url: string; width: number; height: number; alt: string }

export const DEFAULT_SOCIAL_IMAGE: SocialImage = {
  url: "/images/social-crater-lake.png",
  width: 1200,
  height: 630,
  alt: "TopoStack Crater Lake relief with USGS surveyed lake-floor bathymetry and exaggerated depth.",
};

export interface PageMeta {
  title: string;
  description: string;
  label: string;
  /**
   * First publication and last *significant* content change, as ISO dates.
   * They drive sitemap `lastmod` and article timestamps, so bump `updated`
   * when the page's substance changes and leave it alone for typography,
   * styling or link housekeeping. A build date here would be a false signal.
   */
  published: string;
  updated: string;
  /** Overrides the default sharing card where a page has its own screenshot. */
  image?: SocialImage;
}

const SPLIT_IMAGE: SocialImage = {
  url: "/images/guides/split-relief.webp",
  width: 1600,
  height: 1100,
  alt: "TopoStack studio showing a Crater Lake relief in the 3D stack view with a smaller work area set for splitting.",
};

const PAINT_IMAGE: SocialImage = {
  url: "/images/guides/paint-template-on.webp",
  width: 1600,
  height: 1100,
  alt: "Cut layers view of a Crater Lake layer with the paint template on: land is covered by a stencil and only the lake is open.",
};

export const PUBLIC_PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Free Topographic Map Generator for Laser Cutting | TopoStack",
    description: "Create layered terrain maps and flat topographic engravings from real elevation data. Customize your design and export SVG files free in your browser.",
    label: "Home",
    published: "2026-08-19",
    updated: "2026-09-17",
  },
  "/guides": {
    title: "Topographic Map Guides and Documentation | TopoStack",
    description: "Guides for making layered and engraved topographic maps, understanding lake-depth data and export files, troubleshooting, and TopoStack's sources, credits and privacy.",
    label: "Guides",
    published: "2026-09-17",
    updated: "2026-09-17",
  },
  "/guides/laser-cut-topographic-map": {
    title: "How to Make a Laser-Cut Topographic Map | TopoStack",
    description: "Make a layered terrain map from real elevation data. Choose material thickness, preview your stack, and export SVG cut panels with an assembly guide.",
    label: "Layered map guide",
    published: "2026-09-15",
    updated: "2026-09-18",
  },
  "/guides/topographic-map-engraving": {
    title: "Create a Topographic Map SVG for Laser Engraving | TopoStack",
    description: "Create a flat contour map for laser engraving. Set contour density, add roads and water, and export a single SVG at your chosen physical size.",
    label: "Engraving guide",
    published: "2026-09-15",
    updated: "2026-09-17",
  },
  "/guides/split-large-maps": {
    title: "Split a Large Laser-Cut Map to Fit Your Bed | TopoStack",
    description: "Build a layered topographic map bigger than your laser. Split each layer into bed-sized pieces with staggered seams, puzzle tabs and assembly ids.",
    label: "Split large maps",
    published: "2026-09-18",
    updated: "2026-09-18",
    image: SPLIT_IMAGE,
  },
  "/guides/water-paint-templates": {
    title: "Paint Lakes with Laser-Cut Stencils | TopoStack",
    description: "Cut a paper stencil for each layer of a topographic map and spray paint only the water that stays visible after the stack is glued.",
    label: "Water paint templates",
    published: "2026-09-18",
    updated: "2026-09-18",
    image: PAINT_IMAGE,
  },
  "/guides/lake-depth-data": {
    title: "Search Lakes with Surveyed Depth Data | TopoStack",
    description: "Search TopoStack's lake-depth catalog by name, region or source. Find surveyed grids and depth contours, then open a lake in the studio.",
    label: "Lake depth directory",
    published: "2026-09-15",
    updated: "2026-09-17",
  },
  "/guides/how-lake-depths-work": {
    title: "How Lake Depths Work: Surveys, Predictions and Layers | TopoStack",
    description: "Learn how TopoStack combines lake surveys, shoreline terrain and depth estimates, handles missing data, and turns lake floors into cut layers.",
    label: "How lake depths work",
    published: "2026-09-16",
    updated: "2026-09-17",
  },
  "/guides/studio-tour": {
    title: "Studio Tour: Settings, Previews and Saving | TopoStack",
    description: "Find your way around the TopoStack studio: choose a place, frame the map, generate terrain, switch previews, and save or import projects.",
    label: "Studio tour",
    published: "2026-09-17",
    updated: "2026-09-18",
  },
  "/guides/map-details": {
    title: "Map Details, Labels and Linework for Laser Maps | TopoStack",
    description: "Choose roads, trails, water fills and boundaries, place elevation labels and the north arrow, and set line widths for laser engraving.",
    label: "Map details and linework",
    published: "2026-09-17",
    updated: "2026-09-20",
  },
  "/guides/custom-markers-and-paths": {
    title: "Add Custom Markers and Trails to a Topographic Map | TopoStack",
    description: "Engrave your own summit markers, hiking routes and boundaries on a topographic map from latitude and longitude coordinates.",
    label: "Custom markers and paths",
    published: "2026-09-17",
    updated: "2026-09-17",
  },
  "/guides/settings-reference": {
    title: "Studio Settings Reference | TopoStack",
    description: "Every TopoStack studio control with its range, default and output type, from vertical exaggeration and kerf to linework widths.",
    label: "Settings reference",
    published: "2026-09-17",
    updated: "2026-09-20",
  },
  "/guides/export-files": {
    title: "Laser Export Files and SVG Structure | TopoStack",
    description: "What each TopoStack download contains: SVG panels, colors and operation groups, kerf compensation, assembly guide, project file and attribution.",
    label: "Export files",
    published: "2026-09-17",
    updated: "2026-09-18",
  },
  "/guides/troubleshooting": {
    title: "Troubleshooting Topographic Map Exports | TopoStack",
    description: "Fix blocked exports, understand studio warnings, and get answers to common questions about layers, lake depth, SVG scale and kerf.",
    label: "Troubleshooting",
    published: "2026-09-17",
    updated: "2026-09-18",
  },
  "/examples/crater-lake": {
    title: "Crater Lake Topographic Map: A Terrain Project | TopoStack",
    description: "Explore the Crater Lake terrain preview in TopoStack, follow the project setup, and learn how to generate fresh terrain for layered or engraved SVG exports.",
    label: "Crater Lake example",
    published: "2026-09-15",
    updated: "2026-09-17",
  },
  "/attribution": {
    title: "Sources and Attribution | TopoStack",
    description: "Explore TopoStack’s terrain, map, lake-depth, artwork, and software sources, how they are used, and their credits and licenses.",
    label: "Sources and attribution",
    published: "2026-09-16",
    updated: "2026-09-17",
  },
  "/privacy": {
    title: "Privacy and Browser Storage | TopoStack",
    description: "How TopoStack stores project settings, requests map data, and measures visits and successful exports.",
    label: "Privacy",
    published: "2026-09-15",
    updated: "2026-09-17",
  },
};
export const STUDIO_META = {
  title: "Studio: Create Your Topographic Map | TopoStack",
  description: "Choose a place, customize layered relief or flat engraving, and generate SVG artwork in the free TopoStack studio.",
  label: "studio",
};

/**
 * Guides and worked examples are authored, dated articles; the homepage, the
 * guides hub and the policy pages are not, so they stay plain web pages rather
 * than claiming an authorship and publication date they do not have.
 */
export function isArticlePage(path: string): boolean {
  return path !== DOCS_HOME && (path.startsWith("/guides/") || path.startsWith("/examples/"));
}

/** The visible article name: the page title without the trailing site suffix. */
export function headline(title: string): string {
  return title.replace(/\s*\|\s*TopoStack$/, "");
}

export function socialImage(path: string): SocialImage {
  return PUBLIC_PAGES[path]?.image ?? DEFAULT_SOCIAL_IMAGE;
}
