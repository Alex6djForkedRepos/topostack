<script lang="ts">
  import "@loidolt/theme-svelte/styles.css";
  import "@loidolt/theme-styles/dark";
  import Seo from "../lib/Seo.svelte";
  import { afterNavigate } from "$app/navigation";
  import { trackPageView } from "../lib/usage";
  afterNavigate(({ to }) => { if (to) trackPageView(to.url.pathname); });

  let { children } = $props();
</script>

<Seo />
{@render children()}

<style>
  :global(.ldt-topbar__actions) {
    gap: clamp(var(--loidolt-space-2), 2vw, var(--loidolt-space-6));
  }
</style>
