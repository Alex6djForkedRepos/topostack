export const SITE_ORIGIN = "https://topostack.echofoxtrot.works";
export const REPOSITORY_URL = "https://github.com/Echo-Foxtrot-Works/topostack";
export const DOCS_HOME = "/guides";
export const PUBLIC_PAGES: Record<string, { title: string; description: string; label: string }> = {
  "/": {
    title: "Free Topographic Map Generator for Laser Cutting | TopoStack",
    description: "Create layered terrain maps and flat topographic engravings from real elevation data. Customize your design and export SVG files free in your browser.",
    label: "Home",
  },
  "/guides": {
    title: "Topographic Map Guides and Documentation | TopoStack",
    description: "Guides for making layered and engraved topographic maps, understanding lake-depth data and export files, troubleshooting, and TopoStack's sources, credits and privacy.",
    label: "Guides",
  },
  "/guides/laser-cut-topographic-map": {
    title: "How to Make a Laser-Cut Topographic Map | TopoStack",
    description: "Make a layered terrain map from real elevation data. Choose material thickness, preview your stack, and export SVG cut panels with an assembly guide.",
    label: "Layered map guide",
  },
  "/guides/topographic-map-engraving": {
    title: "Create a Topographic Map SVG for Laser Engraving | TopoStack",
    description: "Create a flat contour map for laser engraving. Set contour density, add roads and water, and export a single SVG at your chosen physical size.",
    label: "Engraving guide",
  },
  "/guides/lake-depth-data": {
    title: "Search Lakes with Surveyed Depth Data | TopoStack",
    description: "Search TopoStack's lake-depth catalog by name, region or source. Find surveyed grids and depth contours, then open a lake in the studio.",
    label: "Lake depth directory",
  },
  "/guides/how-lake-depths-work": {
    title: "How Lake Depths Work: Surveys, Predictions and Layers | TopoStack",
    description: "Learn how TopoStack combines lake surveys, shoreline terrain and depth estimates, handles missing data, and turns lake floors into cut layers.",
    label: "How lake depths work",
  },
  "/guides/studio-tour": {
    title: "Studio Tour: Settings, Previews and Saving | TopoStack",
    description: "Find your way around the TopoStack studio: choose a place, frame the map, generate terrain, switch previews, and save or import projects.",
    label: "Studio tour",
  },
  "/guides/map-details": {
    title: "Map Details, Labels and Linework for Laser Maps | TopoStack",
    description: "Choose roads, trails, water fills and boundaries, place elevation labels and the north arrow, and set line widths for laser engraving.",
    label: "Map details and linework",
  },
  "/guides/custom-markers-and-paths": {
    title: "Add Custom Markers and Trails to a Topographic Map | TopoStack",
    description: "Engrave your own summit markers, hiking routes and boundaries on a topographic map from latitude and longitude coordinates.",
    label: "Custom markers and paths",
  },
  "/guides/settings-reference": {
    title: "Studio Settings Reference | TopoStack",
    description: "Every TopoStack studio control with its range, default and output type, from vertical exaggeration and kerf to linework widths.",
    label: "Settings reference",
  },
  "/guides/export-files": {
    title: "Laser Export Files and SVG Structure | TopoStack",
    description: "What each TopoStack download contains: SVG panels, colors and operation groups, kerf compensation, assembly guide, project file and attribution.",
    label: "Export files",
  },
  "/guides/troubleshooting": {
    title: "Troubleshooting Topographic Map Exports | TopoStack",
    description: "Fix blocked exports, understand studio warnings, and get answers to common questions about layers, lake depth, SVG scale and kerf.",
    label: "Troubleshooting",
  },
  "/examples/crater-lake": {
    title: "Crater Lake Topographic Map: A Terrain Project | TopoStack",
    description: "Explore the Crater Lake terrain preview in TopoStack, follow the project setup, and learn how to generate fresh terrain for layered or engraved SVG exports.",
    label: "Crater Lake example",
  },
  "/attribution": {
    title: "Sources and Attribution | TopoStack",
    description: "Explore TopoStack’s terrain, map, lake-depth, artwork, and software sources, how they are used, and their credits and licenses.",
    label: "Sources and attribution",
  },
  "/privacy": {
    title: "Privacy and Browser Storage | TopoStack",
    description: "How TopoStack stores project settings, requests map data, and measures visits and successful exports.",
    label: "Privacy",
  },
};
export const STUDIO_META = {
  title: "Studio: Create Your Topographic Map | TopoStack",
  description: "Choose a place, customize layered relief or flat engraving, and generate SVG artwork in the free TopoStack studio.",
  label: "studio",
};
