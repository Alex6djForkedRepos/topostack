<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { Section } from "@loidolt/theme-svelte";
  import ImportTools from "$lib/studio/customdata/ImportTools.svelte";
  import MarkerTools from "$lib/studio/customdata/MarkerTools.svelte";
  import PathTools from "$lib/studio/customdata/PathTools.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * Markers and paths inside the platform embed, whose rails are the
   * platform's own and do not change with the preview.
   *
   * The standalone studio moved these into the custom data view, where they
   * sit beside a map to place them on; both render the same editors. Graphics
   * and depth charts stay out of the embed: Atomm's own Studio places artwork,
   * and tracing a chart is a job for the full studio.
   */

  const studio = getStudio();
  const { sectionSummary, toggleSection } = studio;
</script>

<Section class="config-section custom-data-section" aria-labelledby="atomm-customData-title">
  <button type="button" class="section-disclosure" id="atomm-customData-title" aria-expanded={studio.openSections.customData} aria-controls="section-custom-data" onclick={() => toggleSection("customData")}>
    <span class="section-number">08</span>
    <span class="section-title">{studio.embeddedInPlatform ? "Markers & paths" : "Custom Data"}<small>{sectionSummary("customData")}</small></span>
    <ChevronDown size={16} class={studio.openSections.customData ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
  </button>
  <div id="section-custom-data" class="section-content" hidden={!studio.openSections.customData}>
    <p class="custom-data-intro">Add your own geographic annotations. Coordinates stay attached to the project and are clipped to the selected map area during engraving.</p>
    <ImportTools />
    <MarkerTools />
    <PathTools />
  </div>
</Section>
