<script lang="ts">
  import { page } from "$app/state";
  import { DOCS_HOME, PUBLIC_PAGES, REPOSITORY_URL, SITE_LOCALE, SITE_ORIGIN, STUDIO_META, headline, isArticlePage, socialImage } from "./seo";

  const production = import.meta.env.VITE_SITE_ENV === "production";
  const path = $derived(page.route.id ?? (page.url.pathname.replace(/\/$/, "") || "/"));
  const metadata = $derived(page.status === 404 ? undefined : PUBLIC_PAGES[path] ?? (path === "/studio" ? STUDIO_META : undefined));
  const indexable = $derived(production && page.status === 200 && Boolean(PUBLIC_PAGES[path]));
  const canonical = $derived(SITE_ORIGIN + path);
  const title = $derived(metadata?.title ?? "Page Not Found | TopoStack");
  const description = $derived(metadata?.description ?? "This page could not be found. Explore TopoStack's topographic map guides or open the studio.");
  const image = $derived(socialImage(path));
  const imageUrl = $derived(SITE_ORIGIN + image.url);
  // Only pages with recorded dates claim article metadata, so a new page cannot
  // advertise a publication date before one is written down for it.
  const article = $derived(PUBLIC_PAGES[path] && isArticlePage(path) ? PUBLIC_PAGES[path] : undefined);
  const schema = $derived(JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": SITE_ORIGIN + "/#organization", name: "Echo Foxtrot Works", url: "https://github.com/Echo-Foxtrot-Works", sameAs: [REPOSITORY_URL] },
      { "@type": "WebSite", "@id": SITE_ORIGIN + "/#website", name: "TopoStack", url: SITE_ORIGIN + "/", publisher: { "@id": SITE_ORIGIN + "/#organization" } },
      ...(path === "/" ? [{ "@type": "WebApplication", name: "TopoStack", url: SITE_ORIGIN + "/", applicationCategory: "DesignApplication", operatingSystem: "Web browser", description, isAccessibleForFree: true, license: REPOSITORY_URL + "/blob/main/LICENSE", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: ["Layered terrain relief", "Flat topographic engraving", "SVG export at physical size"], screenshot: SITE_ORIGIN + "/images/studio-crater-lake.png" }] : []),
      ...(article ? [{
        "@type": "TechArticle",
        "@id": canonical + "#article",
        headline: headline(article.title),
        description,
        datePublished: article.published,
        dateModified: article.updated,
        inLanguage: "en",
        image: { "@type": "ImageObject", url: imageUrl, width: image.width, height: image.height },
        mainEntityOfPage: canonical,
        isPartOf: { "@id": SITE_ORIGIN + "/#website" },
        author: { "@id": SITE_ORIGIN + "/#organization" },
        publisher: { "@id": SITE_ORIGIN + "/#organization" },
      }] : []),
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
  <meta property="og:locale" content={SITE_LOCALE} />
  <meta property="og:type" content={article ? "article" : "website"} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={imageUrl} />
  <meta property="og:image:width" content={String(image.width)} />
  <meta property="og:image:height" content={String(image.height)} />
  <meta property="og:image:alt" content={image.alt} />
  {#if article}
    <meta property="article:published_time" content={article.published} />
    <meta property="article:modified_time" content={article.updated} />
  {/if}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />
  <meta name="twitter:image:alt" content={image.alt} />
  {#if metadata}
    <!-- JSON is serialized from known metadata and escapes every less-than sign. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html structuredData}
  {/if}
</svelte:head>
