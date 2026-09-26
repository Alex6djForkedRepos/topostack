/**
 * The 1200×630 sharing card shared by the capture scripts: the TopoStack name,
 * a title and a short line of text on the left, a picture on the right and a
 * credit line along the bottom. Pages link it as `og:image`, so link previews
 * on forums, chat and social sites show this card.
 *
 * Callers position the picture with `style`; the text styles here are what
 * every card shares. Cards are written as JPEG at quality 85.
 */
export const SOCIAL_CARD = { width: 1200, height: 630, quality: 85 };

const BASE_STYLE = `
      * { box-sizing: border-box; } body { margin: 0; background: #20231d; color: #f6f4ef; font-family: Arial, sans-serif; }
      main { width: 1200px; height: 630px; padding: 42px 48px; position: relative; overflow: hidden; }
      .brand { font-size: 22px; font-weight: 700; letter-spacing: -.6px; }
      h1 { margin: 30px 0 16px; font-size: 50px; line-height: 1.05; letter-spacing: -2px; width: 360px; }
      .intro { font-size: 21px; line-height: 1.45; width: 320px; color: #c2cabb; }
      footer { position: absolute; bottom: 34px; left: 48px; right: 48px; border-top: 1px solid #58604f; padding-top: 17px; font-size: 15px; color: #c2cabb; }`;

/** Escape text for HTML element content. */
export const escapeHtml = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The card document. `title`, `intro` and `footer` are HTML, so callers escape
 * plain text; `media` is the picture markup and `style` any extra CSS.
 */
export function socialCardHtml({ brand = "TopoStack", title, intro, footer, media, style = "" }) {
  return `<!doctype html><html lang="en"><head><style>${BASE_STYLE}
      ${style}
    </style></head><body><main><div class="brand">${brand}</div><h1>${title}</h1><p class="intro">${intro}</p>${media}<footer>${footer}</footer></main></body></html>`;
}

/**
 * Render a card document to a JPEG at `path` once its images have decoded.
 * `prepare` runs in the page before the screenshot, for layout that depends
 * on measured text.
 */
export async function captureSocialCard(browser, html, path, prepare) {
  const card = await browser.newPage({ viewport: { width: SOCIAL_CARD.width, height: SOCIAL_CARD.height }, deviceScaleFactor: 1 });
  try {
    await card.setContent(html);
    await card.evaluate(async () => {
      await Promise.all([...document.images].map((img) => img.decode()));
      await document.fonts.ready;
    });
    if (prepare) await card.evaluate(prepare);
    await card.screenshot({ path, type: "jpeg", quality: SOCIAL_CARD.quality });
  } finally {
    await card.close();
  }
}
