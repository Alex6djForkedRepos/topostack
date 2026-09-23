<script lang="ts">
  import { ChevronDown, FileUp, MapPin, Route, Waves } from "@lucide/svelte";
  import { Section } from "@loidolt/theme-svelte";
  import { nav, openCustomDataSection, sectionsFor, toggleCustomDataSection, type CustomDataSectionId } from "$lib/studio/customdata/custom-data-nav.svelte";
  import { getStudio } from "$lib/studio/studio-context";
  import ChartTools from "$lib/studio/customdata/ChartTools.svelte";
  import ImportTools from "$lib/studio/customdata/ImportTools.svelte";
  import MarkerTools from "$lib/studio/customdata/MarkerTools.svelte";
  import PathTools from "$lib/studio/customdata/PathTools.svelte";

  /**
   * The sidebar while the custom data view is open: one disclosure per kind of
   * data the maker brings, holding that kind's tools, drawn like every other
   * sidebar section.
   *
   * At most one is open. Collapsing tools keeps the active workspace and
   * work in progress; choosing another section changes the workspace.
   */

  const studio = getStudio();
  const sections = $derived(sectionsFor(studio.project.outputMode));
  // A section the project cannot use is never left open.
  $effect(() => {
    if (!sections.some((section) => section.id === nav.section)) openCustomDataSection(sections[0]!.id);
  });

  const summaries = $derived<Record<CustomDataSectionId, string>>({
    charts: chartSummary(),
    markers: studio.project.markers.length ? `${studio.project.markers.length} placed` : "None yet",
    paths: pathSummary(),
    import: "GPX, KML or GeoJSON",
  });

  function chartSummary(): string {
    const inUse = Object.keys(studio.project.userDepthCharts ?? {}).length;
    return inUse ? `${inUse} carving ${inUse === 1 ? "a lake" : "lakes"}` : "Trace a printed chart";
  }

  function pathSummary(): string {
    const trails = studio.project.customLines.filter((line) => line.kind === "trail").length;
    const boundaries = studio.project.customLines.length - trails;
    const parts = [trails ? `${trails} trail${trails === 1 ? "" : "s"}` : "", boundaries ? `${boundaries} boundar${boundaries === 1 ? "y" : "ies"}` : ""].filter(Boolean);
    return parts.length ? parts.join(" · ") : "None yet";
  }
</script>

{#each sections as section, index (section.id)}
  {@const open = nav.section === section.id && nav.expanded}
  <Section class="config-section custom-data-section" aria-labelledby={`custom-data-${section.id}-title`}>
    <button type="button" class="section-disclosure" id={`custom-data-${section.id}-title`} aria-expanded={open} aria-controls={`custom-data-${section.id}`} onclick={() => toggleCustomDataSection(section.id)}>
      <span class="section-number">0{index + 1}</span>
      <span class="section-title">{section.label}<small>{summaries[section.id]}</small></span>
      <span class="section-icon" aria-hidden="true">
        {#if section.id === "charts"}<Waves size={14} />{:else if section.id === "markers"}<MapPin size={14} />{:else if section.id === "paths"}<Route size={14} />{:else}<FileUp size={14} />{/if}
      </span>
      <ChevronDown size={16} class={open ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
    </button>
    <div id={`custom-data-${section.id}`} class="section-content" hidden={!open}>
      {#if section.id === "charts"}
        <ChartTools />
      {:else if section.id === "markers"}
        <MarkerTools />
      {:else if section.id === "paths"}
        <PathTools />
      {:else}
        <ImportTools />
      {/if}
    </div>
  </Section>
{/each}
