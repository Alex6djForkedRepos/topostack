<script lang="ts">
  import FeedbackButton from "./FeedbackButton.svelte";
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import { Brand, ThemeToggle, Topbar } from "@loidolt/theme-svelte";
  import type { Snippet } from "svelte";
  import { theme } from "./theme";
  import { PUBLIC_PAGES, REPOSITORY_URL } from "./seo";
  import { DOCS_HOME, DOCS_NAV, docsNeighbours, docsSection, headingId } from "./docs";
  let { title, intro, children }: { title: string; intro: string; children: Snippet } = $props();

  const path = $derived(page.url.pathname.replace(/\/$/, "") || "/");
  const section = $derived(docsSection(path));
  const neighbours = $derived(docsNeighbours(path));
  let article = $state<HTMLElement>();
  let menuOpen = $state(false);
  let headings = $state<{ id: string; text: string }[]>([]);
  let activeHeading = $state("");

  // Headings are collected after render so guides stay plain markup. Only
  // top-level headings are listed; directory results and cards stay out.
  afterNavigate(() => {
    menuOpen = false;
    const elements = [...(article?.querySelectorAll<HTMLHeadingElement>(":scope > h2, :scope > section > h2") ?? [])];
    const taken = new Set(elements.map((element) => element.id).filter(Boolean));
    headings = elements.map((element) => {
      if (!element.id) element.id = headingId(element.textContent ?? "", taken);
      return { id: element.id, text: element.textContent?.trim() ?? "" };
    });
    updateActiveHeading();
  });

  let frame = 0;
  function updateActiveHeading(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      let current = headings[0]?.id ?? "";
      for (const heading of headings) {
        const top = document.getElementById(heading.id)?.getBoundingClientRect().top ?? Infinity;
        if (top > 120) break;
        current = heading.id;
      }
      activeHeading = current;
    });
  }
</script>

<svelte:window onscroll={updateActiveHeading} />

{#snippet guideLinks()}
  <a class="docs-home" href={`${base}${DOCS_HOME}`} aria-current={path === DOCS_HOME ? "page" : undefined}>All guides</a>
  {#each DOCS_NAV as group (group.id)}
    <p class="docs-group">{group.title}</p>
    <ul>
      {#each group.links as entry (entry.path)}
        <li><a href={`${base}${entry.path}`} aria-current={entry.path === path ? "page" : undefined}>{entry.label}</a></li>
      {/each}
    </ul>
  {/each}
{/snippet}

<div class="article-page">
  <a class="skip" href="#article">Skip to content</a>
  <Topbar>
    {#snippet brand()}<Brand name="TopoStack" meta="Guides" href={`${base}/`} />{/snippet}
    {#snippet actions()}<a class="top-link" href={`${base}${DOCS_HOME}`}>Guides</a><a class="start" href={`${base}/studio`}>Open studio</a><ThemeToggle {theme} />{/snippet}
  </Topbar>
  <div class="docs-layout">
    <nav class="docs-sidebar docs-links" aria-label="Guides">{@render guideLinks()}</nav>
    <main id="article">
      <details class="docs-menu" bind:open={menuOpen}>
        <summary>Browse guides</summary>
        <nav class="docs-links" aria-label="Guides menu">{@render guideLinks()}</nav>
      </details>
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href={`${base}/`}>TopoStack</a>
        {#if path !== DOCS_HOME}<span aria-hidden="true">/</span><a href={`${base}${DOCS_HOME}`}>Guides</a>{/if}
        {#if section}<span aria-hidden="true">/</span><span>{section.title}</span>{/if}
        <span aria-hidden="true">/</span><span aria-current="page">{PUBLIC_PAGES[path]?.label ?? "Page"}</span>
      </nav>
      <header><h1>{title}</h1><p class="intro">{intro}</p></header>
      <article bind:this={article}>{@render children()}</article>
      {#if neighbours.previous || neighbours.next}
        <nav class="pager" aria-label="Previous and next guides">
          {#if neighbours.previous}<a class="previous" href={`${base}${neighbours.previous.path}`}><small>Previous</small>{neighbours.previous.label}</a>{/if}
          {#if neighbours.next}<a class="next" href={`${base}${neighbours.next.path}`}><small>Next</small>{neighbours.next.label}</a>{/if}
        </nav>
      {/if}
      <p class="cta"><a class="start" href={`${base}/studio`}>Create a topographic map</a></p>
    </main>
    {#if headings.length > 1}
      <nav class="docs-toc docs-links" aria-label="On this page">
        <p class="docs-group">On this page</p>
        <ul>
          {#each headings as heading (heading.id)}
            <li><a href={`#${heading.id}`} aria-current={heading.id === activeHeading ? "location" : undefined}>{heading.text}</a></li>
          {/each}
        </ul>
      </nav>
    {/if}
  </div>
  <footer>TopoStack · Free, browser-based terrain tools · <a href={`${base}${DOCS_HOME}`}>Guides</a> · <a href={REPOSITORY_URL}>GitHub</a> · <a href={`${base}/attribution`}>Sources and attribution</a> · <FeedbackButton /></footer>
</div>

<style>
  :where(.article-page) :global(table) { width: 100%; border-collapse: collapse; margin-block: 16px 24px; font-size: 15px; }
  :where(.article-page) :global(th), :where(.article-page) :global(td) { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--loidolt-border); text-align: left; vertical-align: top; line-height: 1.6; }
  :where(.article-page) :global(th) { font-size: 13px; color: var(--loidolt-text-muted); font-weight: 600; }
  .article-page { min-height: 100dvh; background: var(--loidolt-background); color: var(--loidolt-text); }
  .docs-layout { display: grid; grid-template-columns: 210px minmax(0, 760px) 200px; justify-content: center; gap: 56px; width: calc(100% - 40px); margin-inline: auto; }
  main { padding-block: 32px 64px; min-width: 0; }
  footer { width: min(1286px, calc(100% - 40px)); margin-inline: auto; border-top: 1px solid var(--loidolt-border); padding-block: 24px; font-size: 12px; line-height: 1.8; }
  .docs-sidebar, .docs-toc { position: sticky; top: 0; align-self: start; max-height: 100dvh; overflow-y: auto; padding-block: 36px; font-size: 14px; }
  .docs-toc { font-size: 13px; }
  .docs-links ul { list-style: none; padding: 0; margin: 0 0 20px; }
  .docs-group { font: 11px var(--loidolt-font-utility); letter-spacing: 0.1em; text-transform: uppercase; color: var(--loidolt-text-muted); margin: 20px 0 6px; }
  .article-page .docs-links a { display: block; padding: 6px 10px; border-left: 2px solid transparent; color: var(--loidolt-text-muted); text-decoration: none; line-height: 1.4; }
  .article-page .docs-links a:hover { color: var(--loidolt-text); }
  .article-page .docs-links a[aria-current] { color: var(--loidolt-text); border-left-color: var(--loidolt-accent); font-weight: 600; }
  .article-page .docs-links .docs-home { padding-left: 0; border: 0; font-weight: 600; color: var(--loidolt-text); }
  .docs-menu { display: none; margin-bottom: 28px; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); background: var(--loidolt-surface); }
  .docs-menu summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; padding-inline: 14px; font-size: 14px; font-weight: 600; }
  .docs-menu summary::after { content: "+"; margin-left: auto; font-size: 18px; font-weight: 400; }
  .docs-menu[open] summary::after { content: "−"; }
  .docs-menu nav { padding: 0 14px 8px; }
  .breadcrumb { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 13px; margin-bottom: 40px; color: var(--loidolt-text-muted); }
  h1 { font-size: clamp(32px, 5vw, 48px); line-height: 1.15; letter-spacing: -0.035em; margin: 0 0 24px; }
  .intro { font-size: 19px; line-height: 1.65; color: var(--loidolt-text-muted); margin-bottom: 40px; }
  .article-page :global(a) { color: var(--loidolt-text-accent); text-underline-offset: 4px; }
  .article-page :global(a:focus-visible), summary:focus-visible { outline: 2px solid var(--loidolt-accent); outline-offset: 4px; }
  article :global(h2) { font-size: 26px; line-height: 1.25; margin: 40px 0 16px; scroll-margin-top: 24px; }
  article :global(h3) { font-size: 19px; margin: 24px 0 12px; }
  article :global(p), article :global(li) { font-size: 16px; line-height: 1.8; }
  article :global(li) { padding-left: 4px; margin-block: 10px; }
  article :global(figure) { margin: 32px 0; }
  article :global(img) { display: block; width: 100%; height: auto; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); }
  article :global(figcaption) { font-size: 13px; line-height: 1.6; color: var(--loidolt-text-muted); margin-top: 12px; }
  article :global(.note) { padding: 20px; border-left: 3px solid var(--loidolt-accent); background: var(--loidolt-surface); }
  .pager { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--loidolt-border); }
  .pager a { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); text-decoration: none; font-weight: 600; }
  .pager a:hover { border-color: var(--loidolt-accent); }
  .pager small { font-size: 12px; font-weight: 400; color: var(--loidolt-text-muted); }
  .pager .next { grid-column: 2; text-align: right; }
  .cta { margin-top: 32px; }
  .top-link { color: var(--loidolt-text-muted) !important; font: 12px var(--loidolt-font-utility); text-decoration: none; }
  .start { display: inline-flex; align-items: center; min-height: 44px; background: var(--loidolt-accent); color: var(--loidolt-on-accent) !important; padding: 10px 18px; border-radius: var(--loidolt-border-radius); text-decoration: none; font-size: 14px; }
  .skip { position: absolute; left: 16px; top: -100px; padding: 12px; background: var(--loidolt-surface); z-index: 100; }
  .skip:focus { top: 12px; }
  @media (max-width: 1239px) { .docs-layout { grid-template-columns: 210px minmax(0, 760px); } .docs-toc { display: none; } }
  @media (max-width: 899px) { .docs-layout { display: block; } .docs-sidebar { display: none; } .docs-menu { display: block; } }
  /* Match the homepage: keep brand and actions on one row where the theme would stack them. */
  @media (max-width: 760px) {
    .article-page :global(.ldt-topbar) { flex-wrap: nowrap; }
    .article-page :global(.ldt-topbar__actions) { width: auto; margin-left: auto; overflow: visible; }
    .article-page :global(.ldt-brand__meta), .top-link { display: none; }
    .start { min-height: 40px; padding: 8px 12px; font-size: 13px; white-space: nowrap; }
    .cta .start { min-height: 44px; padding: 10px 18px; font-size: 14px; }
  }
  @media (max-width: 600px) { .pager { grid-template-columns: 1fr; } .pager .next { grid-column: auto; } }
</style>
