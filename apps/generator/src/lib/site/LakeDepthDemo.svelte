<script lang="ts">
  let varied = $state(true);
  let scale = $state(1);
  const maximum = $derived(46 * scale);
  const center = $derived(varied ? 0.65 : 0.5);
  const floor = $derived(Array.from({ length: 101 }, (_, i) => {
    const t = i / 100;
    const depth = maximum * Math.max(0, Math.min(t / center, (1 - t) / (1 - center))) ** 0.8;
    return `${i ? "L" : "M"}${60 + t * 520},${60 + depth * 0.8}`;
  }).join(" "));
  const levels = $derived(Array.from({ length: Math.max(0, Math.ceil(maximum / 50) - 1) }, (_, i) => (i + 1) * 50));
</script>

<figure class="demo" aria-labelledby="depth-demo-heading">
  <h3 id="depth-demo-heading">See what changes the shape</h3>
  <div class="choices" role="group" aria-label="Example shoreline slopes">
    <button type="button" aria-pressed={!varied} onclick={() => varied = false}>Similar banks</button>
    <button type="button" aria-pressed={varied} onclick={() => varied = true}>Steep right bank</button>
  </div>
  <div class="bank-labels"><span>{varied ? "Gentle bank" : "Left bank"}</span><span>{varied ? "Steep bank" : "Right bank"}</span></div>
  <svg viewBox="0 0 640 240" role="img" aria-labelledby="depth-demo-title depth-demo-description">
    <title id="depth-demo-title">Illustrative lake cross-section at {scale} times depth</title>
    <desc id="depth-demo-description">{varied ? "The basin deepens gradually from the left and more quickly from the right. Its deepest point moves toward the steep right bank." : "Similar banks form a symmetric basin."} The maximum displayed depth is {maximum} meters. {levels.length} underwater contour levels fit at 50-meter intervals.</desc>
    <path d={`M0,${varied ? 40 : 10} L60,60 ${floor.replace(/^M[^L]+/, "")} L640,10 L640,240 L0,240 Z`} class="land" />
    <path d={`${floor} L60,60 Z`} class="water" />
    <path d={floor} class="floor" />
    {#each levels as depth}
      {@const fraction = (depth / maximum) ** (1 / 0.8)}
      <line x1={60 + 520 * center * fraction} x2={60 + 520 * (1 - (1 - center) * fraction)} y1={60 + depth * 0.8} y2={60 + depth * 0.8} class="contour" />
    {/each}
    <line x1="60" x2="580" y1="60" y2="60" class="surface" />
  </svg>
  <div class="legend"><span><i class="water-key"></i>Waterline and predicted floor</span><span><i class="contour-key"></i>50 m contour intervals</span></div>
  <label for="lake-depth-demo-scale">Water depth exaggeration <strong>{scale}×</strong></label>
  <input id="lake-depth-demo-scale" type="range" min="1" max="4" step="1" bind:value={scale} />
  <p class="demo-result" aria-live="polite">{maximum} m displayed depth · {levels.length} underwater {levels.length === 1 ? "contour" : "contours"}. {levels.length === 0 ? "The basin is shallower than one contour interval. Increase the depth scale to see a contour appear." : "The shoreline stays fixed while the floor gets deeper."}</p>
  <noscript><p>With JavaScript enabled, change the banks and depth scale to explore this illustration. At 1× this example has no underwater contour; at 4× it has three.</p></noscript>
  <figcaption>Illustration only, not a real lake or the prediction algorithm itself. The example starts at 46 m deep and uses a fixed 50 m contour interval. Your map’s interval depends on terrain relief, material thickness, scale, and the sheet limit.</figcaption>
</figure>

<style>
  .demo { padding: 24px; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); background: var(--loidolt-surface); }
  .demo h3 { margin: 0 0 20px; }
  .choices { display: flex; gap: 8px; flex-wrap: wrap; }
  button { min-height: 44px; padding: 10px 14px; font: inherit; font-size: 14px; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); color: var(--loidolt-text); background: var(--loidolt-background); cursor: pointer; }
  button[aria-pressed="true"] { border-color: var(--loidolt-accent); background: var(--loidolt-accent); color: var(--loidolt-on-accent); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--loidolt-accent); outline-offset: 4px; }
  .bank-labels { display: flex; justify-content: space-between; margin-top: 24px; font-size: 13px; }
  svg { display: block; width: 100%; height: auto; margin: 8px 0 16px; }
  .land { fill: var(--loidolt-border); }
  .water { fill: #49a9d4; fill-opacity: 0.18; }
  .floor { stroke: var(--loidolt-text-accent); fill: none; stroke-width: 3; }
  .surface { stroke: var(--loidolt-text-accent); stroke-width: 1.5; }
  .contour { stroke: var(--loidolt-text); stroke-width: 1.5; stroke-dasharray: 6 5; }
  .legend { display: flex; gap: 12px 24px; flex-wrap: wrap; margin-bottom: 24px; font-size: 12px; color: var(--loidolt-text-muted); }
  .legend span { display: inline-flex; gap: 8px; align-items: center; }
  i { display: inline-block; width: 20px; border-top: 2px solid var(--loidolt-text-accent); }
  .contour-key { border-top: 2px dashed var(--loidolt-text); }
  label { display: flex; justify-content: space-between; font-size: 14px; }
  input { width: 100%; margin: 12px 0; min-height: 32px; accent-color: var(--loidolt-accent); cursor: pointer; }
  .demo-result { font-size: 14px; margin: 0; }
  @media (max-width: 480px) { .demo { padding: 16px; } }
</style>
