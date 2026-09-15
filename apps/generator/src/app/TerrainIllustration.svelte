<script lang="ts">
  let { variant }: { variant: "hero" | "relief" | "engraving" | "location" | "data" } = $props();

  const contour = "M-152 36 C-190 4-146-25-131-53 C-113-89-63-71-38-104 C-10-140 38-114 59-86 C80-58 128-71 148-32 C172 12 133 34 105 58 C76 84 40 65 9 86 C-29 111-58 82-91 75 C-120 69-130 55-152 36Z";
</script>

<svg viewBox={variant === "hero" ? "0 0 460 390" : "0 0 460 280"} fill="none" aria-hidden="true">
  {#if variant === "hero"}
    <path class="guide" d="M35 294 230 365 425 294M230 365V344M35 294V279M425 294V279M230 28V49" />
    <g transform="translate(230 232)">
      {#each [0, 1, 2, 3, 4, 5, 6, 7] as layer}
        <path class="sheet" d={contour} transform={`translate(0 ${-layer * 20}) scale(${1 - layer * 0.093} ${(1 - layer * 0.093) * 0.5})`} />
      {/each}
    </g>
    <path class="guide" stroke-dasharray="3 6" d="M230 54V106M398 170H433M31 252H74" />
    <circle cx="230" cy="50" r="3" fill="currentColor" />
    <text x="230" y="388" text-anchor="middle">REAL PLACES / NEW PERSPECTIVES</text>
  {:else if variant === "relief"}
    <path class="guide" stroke-dasharray="3 6" d="M230 22V242M66 83V214M389 83V214" />
    <g transform="translate(230 206)">
      {#each [0, 1, 2, 3, 4] as layer}
        <path class="sheet" d={contour} transform={`translate(0 ${-layer * 36}) scale(${1 - layer * 0.12} ${(1 - layer * 0.12) * 0.36})`} />
      {/each}
    </g>
    <path class="guide" d="M406 57H417V209H406M413 57H421M413 209H421M74 238H387M74 232V244M387 232V244" />
    <circle cx="230" cy="29" r="3" fill="currentColor" />
    <text x="230" y="270" text-anchor="middle">CONTOURS / LAYER BY LAYER</text>
  {:else if variant === "engraving"}
    <rect class="sheet" x="68" y="25" width="324" height="216" />
    <rect class="guide" x="78" y="35" width="304" height="196" />
    <g transform="translate(226 136)">
      {#each [0, 1, 2, 3, 4, 5, 6, 7] as line}
        <path class="contour" d={contour} transform={`scale(${0.82 - line * 0.088} ${(0.82 - line * 0.088) * 0.82})`} />
      {/each}
    </g>
    <path class="guide" d="M90 211H139M90 207V215M114 207V215M139 207V215M355 51V79M347 62L355 51L363 62" />
    <circle cx="226" cy="131" r="2.5" fill="currentColor" />
    <text x="230" y="270" text-anchor="middle">ONE SURFACE / EVERY CONTOUR</text>
  {:else if variant === "location"}
    <path class="guide" d="M59 54H400M59 110H400M59 166H400M59 222H400M90 30V243M160 30V243M230 30V243M300 30V243M370 30V243" />
    <g transform="translate(229 146)">
      {#each [0, 1, 2, 3, 4, 5, 6] as line}
        <path class="contour" d={contour} transform={`scale(${1 - line * 0.12} ${(1 - line * 0.12) * 0.7})`} />
      {/each}
    </g>
    <path class="accent" d="M69 71V43H97M361 43H389V71M389 201V229H361M97 229H69V201" />
    <path class="guide" stroke-dasharray="3 6" d="M230 23V70M230 168V244M36 136H85M375 136H424" />
    <path class="sheet" d="M230 139C221 126 207 113 207 98A23 23 0 0 1 253 98C253 113 239 126 230 139Z" />
    <circle class="contour" cx="230" cy="98" r="8" />
    <text x="230" y="270" text-anchor="middle">FIND YOUR PLACE / FRAME YOUR VIEW</text>
  {:else}
    <path class="guide" stroke-dasharray="3 6" d="M59 110V213M401 110V213M230 24V251" />
    <path class="sheet" d="M59 193 230 132 401 193 230 254Z" />
    <path class="contour" d="M98 197C138 169 158 209 200 190S260 158 289 184 334 203 364 187" />
    <path class="sheet" d="M59 139 230 78 401 139 230 200Z" />
    <path class="contour" d="M111 139 181 156 219 135 281 153 348 128M219 135 225 105M281 153 285 175" />
    <circle cx="219" cy="135" r="3" fill="currentColor" />
    <path class="sheet" d="M59 85 230 24 401 85 230 146Z" />
    <g transform="translate(230 88)">
      {#each [0, 1, 2, 3, 4] as line}
        <path class="contour" d={contour} transform={`scale(${0.73 - line * 0.13} ${(0.73 - line * 0.13) * 0.34})`} />
      {/each}
    </g>
    <path class="guide" d="M410 85H431M410 139H431M410 193H431" />
    <text x="230" y="278" text-anchor="middle">ELEVATION / MAP FEATURES / WATER</text>
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; overflow: visible; color: var(--loidolt-text-accent); }
  .sheet { fill: var(--loidolt-surface); stroke: var(--loidolt-accent); stroke-width: 1.5; }
  .contour { stroke: var(--loidolt-accent); stroke-width: 1.2; }
  .accent { stroke: var(--loidolt-accent); stroke-width: 1.5; }
  .guide { stroke: var(--loidolt-border); stroke-width: 1; }
  text { fill: var(--loidolt-text-muted); font: 9px var(--loidolt-font-utility); letter-spacing: 2px; }
</style>
