<script lang="ts">
  import "@loidolt/theme-svelte/styles.css";
  import "@loidolt/theme-styles/dark";

  let { children } = $props();
</script>

{@render children()}
