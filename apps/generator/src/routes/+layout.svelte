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
