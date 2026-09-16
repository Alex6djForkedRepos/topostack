<script lang="ts">
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { Brand, ThemeToggle, Topbar } from "@loidolt/theme-svelte";
  import type { Snippet } from "svelte";
  import { theme } from "./theme";
  import { PUBLIC_PAGES } from "./seo";
  let { title, intro, children }: { title: string; intro: string; children: Snippet } = $props();
</script>

<div class="article-page">
  <a class="skip" href="#article">Skip to content</a>
  <Topbar>
    {#snippet brand()}<Brand name="TopoStack" meta="Terrain studio" href={`${base}/`} />{/snippet}
    {#snippet actions()}<a class="start" href={`${base}/studio`}>Open studio</a><ThemeToggle {theme} />{/snippet}
  </Topbar>
  <main id="article">
    <nav aria-label="Breadcrumb"><a href={`${base}/`}>TopoStack</a><span aria-hidden="true"> / </span><span aria-current="page">{PUBLIC_PAGES[page.url.pathname]?.label ?? "Page"}</span></nav>
    <header><h1>{title}</h1><p class="intro">{intro}</p></header>
    <article>{@render children()}</article>
    <aside aria-label="More from TopoStack">
      <h2>Keep exploring</h2>
      <ul>
        {#each Object.entries(PUBLIC_PAGES).filter(([path]) => path !== "/" && path !== page.url.pathname) as [path, metadata]}
          <li><a href={`${base}${path}`}>{metadata.label}</a></li>
        {/each}
      </ul>
      <a class="start" href={`${base}/studio`}>Create a topographic map</a>
    </aside>
  </main>
  <footer>TopoStack · Free, browser-based terrain tools · <a href="https://github.com/Echo-Foxtrot-Works/topostack">GitHub</a> · <a href={`${base}/attribution`}>Sources and attribution</a></footer>
</div>

<style>
  .article-page { min-height: 100dvh; background: var(--loidolt-background); color: var(--loidolt-text); }
  main, footer { width: min(800px, calc(100% - 40px)); margin-inline: auto; }
  main { padding-block: 32px 64px; }
  nav { font-size: 13px; margin-bottom: 40px; color: var(--loidolt-text-muted); }
  h1 { font-size: clamp(32px, 5vw, 48px); line-height: 1.15; letter-spacing: -0.035em; margin: 0 0 24px; }
  .intro { font-size: 19px; line-height: 1.65; color: var(--loidolt-text-muted); margin-bottom: 40px; }
  .article-page :global(a) { color: var(--loidolt-text-accent); text-underline-offset: 4px; }
  .article-page :global(a:focus-visible) { outline: 2px solid var(--loidolt-accent); outline-offset: 4px; }
  article :global(h2), aside h2 { font-size: 26px; line-height: 1.25; margin: 40px 0 16px; }
  article :global(h3) { font-size: 19px; margin: 24px 0 12px; }
  article :global(p), article :global(li) { font-size: 16px; line-height: 1.8; }
  article :global(li) { padding-left: 4px; margin-block: 10px; }
  article :global(figure) { margin: 32px 0; }
  article :global(img) { display: block; width: 100%; height: auto; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); }
  article :global(figcaption) { font-size: 13px; line-height: 1.6; color: var(--loidolt-text-muted); margin-top: 12px; }
  article :global(.note) { padding: 20px; border-left: 3px solid var(--loidolt-accent); background: var(--loidolt-surface); }
  aside { border-top: 1px solid var(--loidolt-border); margin-top: 48px; }
  aside ul { line-height: 2; padding-left: 20px; margin-bottom: 28px; }
  .start { display: inline-flex; align-items: center; min-height: 44px; background: var(--loidolt-accent); color: var(--loidolt-on-accent) !important; padding: 10px 18px; border-radius: var(--loidolt-border-radius); text-decoration: none; font-size: 14px; }
  footer { border-top: 1px solid var(--loidolt-border); padding-block: 24px; font-size: 12px; line-height: 1.8; }
  .skip { position: absolute; left: 16px; top: -100px; padding: 12px; background: var(--loidolt-surface); z-index: 100; }
  .skip:focus { top: 12px; }
  @media (max-width: 600px) { .article-page :global(.ldt-brand__meta) { display: none; } }
</style>
