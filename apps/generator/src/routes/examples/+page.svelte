<script lang="ts">
  import { base } from "$app/paths";
  import Article from "$lib/site/Article.svelte";

  let { data } = $props();
</script>

<Article title="Topographic map examples" intro="Real TopoStack projects you can open and make: each one shows the finished relief, the settings behind it, and a project file to import into the studio.">
  <ul class="gallery">
    {#each data.examples as example (example.slug)}
      <li>
        <a href={`${base}/examples/${example.slug}`}>
          <img src={`${base}/images/examples/${example.slug}-800.webp`} width={Math.min(800, example.image.width)} height={Math.round(Math.min(800, example.image.width) * example.image.height / example.image.width)} loading="lazy" decoding="async" alt={`${example.place} layered relief rendered in TopoStack.`} />
          <span class="title">{example.place}</span>
        </a>
        <span class="meta">{example.region} · {example.layers} layers{example.shape === "circle" ? " · round" : ""}</span>
      </li>
    {/each}
    <li>
      <a href={`${base}/examples/crater-lake`}>
        <img src={`${base}/images/examples/crater-lake-800.webp`} width="740" height="430" loading="lazy" decoding="async" alt="Crater Lake relief with surveyed lake floor, rendered in TopoStack." />
        <span class="title">Crater Lake</span>
      </a>
      <span class="meta">Oregon, USA · surveyed lake floor</span>
    </li>
  </ul>
  <h2>Start your own</h2>
  <p>Every example began as a place and a size. <a href={`${base}/studio`}>Open the studio</a> to pick your own, follow the <a href={`${base}/guides/laser-cut-topographic-map`}>layered map guide</a>, or browse <a href={`${base}/lakes`}>lakes with surveyed depth data</a> for a lake map.</p>
</Article>

<style>
  .gallery { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
  .gallery a { display: grid; gap: 8px; text-decoration: none; }
  .gallery img { aspect-ratio: 4 / 3; object-fit: contain; background: #20231d; }
  .gallery .title { font-size: 18px; font-weight: 600; }
  .meta { color: var(--loidolt-text-muted); font-size: 13px; }
</style>
