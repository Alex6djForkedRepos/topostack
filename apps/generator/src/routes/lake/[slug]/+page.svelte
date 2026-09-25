<script lang="ts">
  import LakePlaceView from "$lib/site/LakePlaceView.svelte";

  let { data } = $props();
</script>

<LakePlaceView page={data.lakePlace} />
