<script lang="ts">
  import { page } from "$app/state";
  import { DEFAULT_SOCIAL_IMAGE, REPOSITORY_URL, SITE_LOCALE, SITE_ORIGIN } from "$lib/site/site";
  import type { PageSeo } from "$lib/site/seo";

  // Metadata comes from the root layout's server load, so the page registry
  // stays out of the homepage bundle.
  const production = import.meta.env.VITE_SITE_ENV === "production";
  const seo = $derived(page.status === 404 ? undefined : (page.data as { seo?: PageSeo }).seo);
  const indexable = $derived(production && page.status === 200 && Boolean(seo?.registered));
  const canonical = $derived(seo?.canonical ?? SITE_ORIGIN + (page.url.pathname.replace(/\/$/, "") || "/"));
  const title = $derived(seo?.title ?? "Page Not Found | TopoStack");
  const description = $derived(seo?.description ?? "This page could not be found. Explore TopoStack's topographic map guides or open the studio.");
  const image = $derived(seo?.image ?? DEFAULT_SOCIAL_IMAGE);
  const imageUrl = $derived(SITE_ORIGIN + image.url);
  const article = $derived(seo?.article);
  const schema = $derived(JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": SITE_ORIGIN + "/#organization", name: "Echo Foxtrot Works", url: "https://github.com/Echo-Foxtrot-Works", sameAs: [REPOSITORY_URL] },
      { "@type": "WebSite", "@id": SITE_ORIGIN + "/#website", name: "TopoStack", url: SITE_ORIGIN + "/", publisher: { "@id": SITE_ORIGIN + "/#organization" } },
      ...(canonical === SITE_ORIGIN + "/" ? [{ "@type": "WebApplication", name: "TopoStack", url: SITE_ORIGIN + "/", applicationCategory: "DesignApplication", operatingSystem: "Web browser", description, isAccessibleForFree: true, license: REPOSITORY_URL + "/blob/main/LICENSE", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: ["Layered terrain relief", "Flat topographic engraving", "SVG export at physical size"], screenshot: SITE_ORIGIN + "/images/studio-crater-lake.png" }] : []),
      ...(article ? [{
        "@type": "TechArticle",
        "@id": canonical + "#article",
        headline: article.headline,
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
      ...(seo?.breadcrumbs.length ? [{ "@type": "BreadcrumbList", itemListElement: seo.breadcrumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, ...crumb })) }] : []),
    ],
  }).replace(/</g, "\\u003c"));
  const structuredData = $derived('<script type="application/ld+json">' + schema + '</scr' + 'ipt>');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={indexable ? "index, follow, max-image-preview:large" : "noindex, follow"} />
  {#if seo}<link rel="canonical" href={canonical} />{/if}
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
  {#if seo}
    <!-- JSON is serialized from known metadata and escapes every less-than sign. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html structuredData}
  {/if}
</svelte:head>
