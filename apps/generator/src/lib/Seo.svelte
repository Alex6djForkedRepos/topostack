<script lang="ts">
  import { page } from "$app/state";
  import { DOCS_HOME, PUBLIC_PAGES, REPOSITORY_URL, SITE_ORIGIN, STUDIO_META } from "./seo";

  const production = import.meta.env.VITE_SITE_ENV === "production";
  const path = $derived(page.route.id ?? (page.url.pathname.replace(/\/$/, "") || "/"));
  const metadata = $derived(page.status === 404 ? undefined : PUBLIC_PAGES[path] ?? (path === "/studio" ? STUDIO_META : undefined));
  const indexable = $derived(production && page.status === 200 && Boolean(PUBLIC_PAGES[path]));
  const canonical = $derived(SITE_ORIGIN + path);
  const title = $derived(metadata?.title ?? "Page Not Found | TopoStack");
  const description = $derived(metadata?.description ?? "This page could not be found. Explore TopoStack's topographic map guides or open the studio.");
  const schema = $derived(JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": SITE_ORIGIN + "/#organization", name: "Echo Foxtrot Works", url: "https://github.com/Echo-Foxtrot-Works", sameAs: [REPOSITORY_URL] },
      { "@type": "WebSite", "@id": SITE_ORIGIN + "/#website", name: "TopoStack", url: SITE_ORIGIN + "/", publisher: { "@id": SITE_ORIGIN + "/#organization" } },
      ...(path === "/" ? [{ "@type": "WebApplication", name: "TopoStack", url: SITE_ORIGIN + "/", applicationCategory: "DesignApplication", operatingSystem: "Web browser", description, isAccessibleForFree: true, license: REPOSITORY_URL + "/blob/main/LICENSE", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: ["Layered terrain relief", "Flat topographic engraving", "SVG export at physical size"], screenshot: SITE_ORIGIN + "/images/studio-crater-lake.png" }] : []),
      ...(PUBLIC_PAGES[path] && path !== "/" ? [{ "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "TopoStack", item: SITE_ORIGIN + "/" },
        ...(path === DOCS_HOME ? [] : [{ "@type": "ListItem", position: 2, name: PUBLIC_PAGES[DOCS_HOME]!.label, item: SITE_ORIGIN + DOCS_HOME }]),
        { "@type": "ListItem", position: path === DOCS_HOME ? 2 : 3, name: metadata?.label, item: canonical },
      ] }] : []),
    ],
  }).replace(/</g, "\\u003c"));
  const structuredData = $derived('<script type="application/ld+json">' + schema + '</scr' + 'ipt>');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={indexable ? "index, follow, max-image-preview:large" : "noindex, follow"} />
  {#if metadata}<link rel="canonical" href={canonical} />{/if}
  <meta property="og:site_name" content="TopoStack" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={SITE_ORIGIN + "/images/social-crater-lake.png"} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="TopoStack Crater Lake relief with USGS surveyed lake-floor bathymetry and exaggerated depth." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={SITE_ORIGIN + "/images/social-crater-lake.png"} />
  <meta name="twitter:image:alt" content="Crater Lake relief with surveyed bathymetry in TopoStack." />
  {#if metadata}
    <!-- JSON is serialized from known metadata and escapes every less-than sign. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html structuredData}
  {/if}
</svelte:head>
