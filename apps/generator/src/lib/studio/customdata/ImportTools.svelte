<script lang="ts">
  import { FileUp } from "@lucide/svelte";
  import * as edits from "$lib/studio/project-edits";
  import { getStudio } from "$lib/studio/studio-context";

  /** Reading markers and paths out of a file the maker already has. */

  const studio = getStudio();
  const { importCustomData } = studio;
  let geoInput: HTMLInputElement;
  let importing = $state(false);
</script>

<div class="custom-data-import">
  <button type="button" class="custom-data-import__button" onclick={() => geoInput.click()} disabled={importing || (!edits.canAddMarker(studio.project) && !edits.canAddCustomLine(studio.project))}><FileUp size={13} />{importing ? "Importing…" : "Import GPX, KML or GeoJSON"}</button>
  <input bind:this={geoInput} data-custom-import class="ldt-visually-hidden" type="file" tabindex="-1" aria-hidden="true" accept=".gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json" onchange={(event) => { const input = event.currentTarget; importing = true; void importCustomData(input.files?.[0]).finally(() => { input.value = ""; importing = false; }); }} />
  <small>Tracks and routes become trails, polygon outlines become boundaries, and waypoints become markers. Long tracks are simplified to fit.</small>
</div>
