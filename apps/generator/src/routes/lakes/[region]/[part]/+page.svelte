<script lang="ts">
  import LakePageView from "$lib/site/LakePageView.svelte";

  let { data } = $props();
</script>

<LakePageView page={data.lakePage} />
