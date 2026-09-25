import { expect, test } from "@playwright/test";
import { DEFAULT_PROJECT } from "@topostack/core";
import { shareUrl } from "@topostack/data-contracts/share-link";

// The page plays the chat host: it frames the built in-chat preview in a
// sandboxed iframe, as Claude and ChatGPT do, answers the MCP Apps handshake
// and delivers a preview_model result. The e2e build generates from the
// deterministic terrain fixture, so nothing reaches the network.
test("previews a planned model inside a sandboxed chat frame", async ({ page, request, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/v1/**", (route) => route.abort("internetdisconnected"));

  const preview = await (await request.get("/mcp-app/terrain-preview.html")).text();
  expect(preview).toContain("%TOPOSTACK_API_ORIGIN%");
  const html = preview.replaceAll("%TOPOSTACK_API_ORIGIN%", new URL(baseURL!).origin);

  const { explodedPreview: _preview, ...design } = { ...DEFAULT_PROJECT, name: "Crater Lake" };
  const studioUrl = shareUrl(design, "https://topostack.app/studio", "?generate=1");
  const toolResult = { content: [{ type: "text", text: "Crater Lake plan" }], structuredContent: { studioUrl, plan: { sheetCount: 12 }, attribution: { text: "Terrain: Mapzen Terrain Tiles · Map data © OpenStreetMap contributors" } } };

  // Inline script data must not contain "</script>", so "<" is escaped.
  const script = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  await page.setContent(`<!doctype html><html><body><iframe title="preview" sandbox="allow-scripts" style="width:640px;height:720px;border:0"></iframe>
    <script>
      window.received = [];
      window.opened = [];
      const frame = document.querySelector("iframe");
      const reply = (message) => frame.contentWindow.postMessage(message, "*");
      window.addEventListener("message", (event) => {
        if (event.source !== frame.contentWindow) return;
        const message = event.data;
        window.received.push(message.method);
        if (message.method === "ui/initialize") reply({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "harness", version: "1" }, hostCapabilities: { openLinks: {} }, hostContext: { theme: "dark" } } });
        if (message.method === "ui/notifications/initialized") reply({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: ${script(toolResult)} });
        if (message.method === "ui/open-link") { window.opened.push(message.params.url); reply({ jsonrpc: "2.0", id: message.id, result: {} }); }
      });
      frame.srcdoc = ${script(html)};
    </script></body></html>`);

  const frame = page.frameLocator("iframe");
  await expect(frame.locator("h1")).toHaveText("Crater Lake");
  await expect(frame.locator("#figure svg path").first()).toBeAttached({ timeout: 30_000 });
  await expect(frame.locator("#stats")).toContainText("about 12 sheets");
  await expect(frame.locator("#stats")).toContainText(/Generated\s*\d+ sheets/);
  await expect(frame.locator("#status")).toContainText("added in TopoStack");
  await expect(frame.locator("footer")).toContainText("OpenStreetMap");
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");

  await frame.getByRole("button", { name: "Open in TopoStack" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([studioUrl]);
  expect(await page.evaluate(() => (window as unknown as { received: string[] }).received)).toContain("ui/notifications/size-changed");
  expect(pageErrors).toEqual([]);
});
