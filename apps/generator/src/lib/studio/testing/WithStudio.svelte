<script lang="ts">
  import type { Component } from "svelte";
  import { provideStudio, type StudioContext } from "$lib/studio/studio-context";

  /**
   * Renders one studio panel with a stand-in studio, for client tests. Panels
   * read the studio through a private context key; this is the one way in
   * that does not mount the whole of App.svelte.
   */
  let { studio, component: Inner }: { studio: StudioContext; component: Component } = $props();
  // svelte-ignore state_referenced_locally
  provideStudio(studio);
</script>

<Inner />
