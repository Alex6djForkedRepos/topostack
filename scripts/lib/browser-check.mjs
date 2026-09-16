/**
 * Shared Playwright harness for the local/live verification scripts.
 *
 * `openBrowserCheck` launches a browser page, collects uncaught page errors,
 * and prepares an optional artifact directory. `run(check)` executes the check
 * and, on failure, saves `failure.png` (and optionally `failure.txt`) to the
 * artifact directory before rethrowing. The browser always closes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/** Artifact directory: an explicit override, otherwise `<os tmpdir>/topostack-<name>`. */
export function artifactDirectory(override, name) {
  return override ?? join(tmpdir(), `topostack-${name}`);
}

export async function openBrowserCheck({
  output,
  browserType = chromium,
  launchOptions = {},
  pageOptions,
  defaultTimeout,
  failureReport = false,
} = {}) {
  if (output) await mkdir(output, { recursive: true });
  const browser = await browserType.launch(launchOptions);
  const errors = [];
  let page;
  try {
    page = await browser.newPage(pageOptions);
  } catch (error) {
    await browser.close();
    throw error;
  }
  if (defaultTimeout !== undefined) page.setDefaultTimeout(defaultTimeout);
  page.on("pageerror", (error) => errors.push(error.message));

  async function run(check) {
    try {
      return await check();
    } catch (error) {
      if (output) {
        await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
        if (failureReport) {
          const body = await page.locator("body").innerText().catch(() => "");
          await writeFile(`${output}/failure.txt`, `${error.stack}\nBrowser errors: ${JSON.stringify(errors)}\n${body}`);
        }
      }
      throw error;
    } finally {
      await browser.close();
    }
  }

  return { browser, page, errors, output, run };
}
