<script lang="ts">
  import { base } from "$app/paths";
  import { onMount } from "svelte";
  import { Sparkles } from "@lucide/svelte";
  import { LATEST_VERSION as version, hasUnseenRelease, markReleaseSeen } from "$lib/studio/whats-new";

  let unseen = $state(false);
  onMount(() => { unseen = hasUnseenRelease(localStorage, version); });
  const label = $derived(`What's new in TopoStack ${version}${unseen ? " (new release)" : ""} (opens in a new tab)`);
</script>

<a class="about-link whats-new-link" href={`${base}/changelog`} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} onclick={() => { markReleaseSeen(localStorage, version); unseen = false; }}>
  <Sparkles size={18} aria-hidden="true" />{#if unseen}<span class="whats-new-dot" aria-hidden="true"></span>{/if}
</a>
