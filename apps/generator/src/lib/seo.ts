export const SITE_ORIGIN = "https://topostack.echofoxtrot.works";
export const REPOSITORY_URL = "https://github.com/Echo-Foxtrot-Works/topostack";
export const PUBLIC_PAGES: Record<string, { title: string; description: string; label: string }> = {
  "/": {
    title: "Free Topographic Map Generator for Laser Cutting | TopoStack",
    description: "Create layered terrain maps and flat topographic engravings from real elevation data. Customize your design and export SVG files free in your browser.",
    label: "Home",
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
    description: "Search TopoStack's lake-depth catalog by name, region or source. Find surveyed grids and depth contours, then open a lake in the terrain studio.",
    label: "Lake depth directory",
  },
  "/guides/how-lake-depths-work": {
    title: "How Lake Depths Work: Surveys, Predictions and Layers | TopoStack",
    description: "Learn how TopoStack combines lake surveys, shoreline terrain and depth estimates, handles missing data, and turns lake floors into cut layers.",
    label: "How lake depths work",
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
  title: "Terrain Studio: Create Your Topographic Map | TopoStack",
  description: "Choose a place, customize layered relief or flat engraving, and generate SVG artwork in the free TopoStack terrain studio.",
  label: "Terrain studio",
};
