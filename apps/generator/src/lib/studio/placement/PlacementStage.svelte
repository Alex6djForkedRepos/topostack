<script lang="ts">
  import { onMount } from "svelte";
  import type { GeometryIRV1, ProjectConfigV1 } from "@topostack/core";
  import type { PlacementPhase } from "$lib/studio/studio-context";
  import PlacementLayer from "./PlacementLayer.svelte";
  import StackTopView from "./StackTopView.svelte";
  import { placementContext, type PlacementSession } from "./placeables";

  /**
   * Placement mode over the preview. With `backdrop` "3d" the studio's own 3D
   * preview stays mounted underneath in its top-down state, so its meshes are
   * not rebuilt; "flat" draws the top-down composite here, over the view it
   * came from, which stays mounted so fading in and out never shows a gap.
   */
  let { backdrop, phase, geometry, project, cropShape, session, marginMm, hiddenPrefixes, onChange, onDone, onCancel }: {
    backdrop: "3d" | "flat";
    phase: PlacementPhase;
    geometry: GeometryIRV1;
    project: ProjectConfigV1;
    cropShape: ProjectConfigV1["cropShape"];
    session: PlacementSession;
    marginMm: number;
    hiddenPrefixes: readonly string[];
    onChange: (session: PlacementSession) => void;
    onDone: () => void;
    onCancel: () => void;
  } = $props();

  const context = $derived(placementContext(geometry));

  // Rendered hidden, then shown on the next frame, so the fade-in always plays.
  let shown = $state(false);
  onMount(() => {
    const frame = requestAnimationFrame(() => { shown = true; });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="placement-stage" class:placement-stage--flat={backdrop === "flat"} class:placement-stage--shown={shown && phase !== "closing"} data-placement-backdrop={backdrop} data-placement-phase={phase}>
  {#if backdrop === "flat"}<StackTopView {geometry} outputMode={project.outputMode} {cropShape} {marginMm} {hiddenPrefixes} />{/if}
  <PlacementLayer {project} {context} {session} widthMm={geometry.widthMm} heightMm={geometry.heightMm} {marginMm} interactive={phase === "editing"} {onChange} {onDone} {onCancel} />
</div>
