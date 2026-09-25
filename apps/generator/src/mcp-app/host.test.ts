import { afterEach, describe, expect, it, vi } from "vitest";
import { APPS_PROTOCOL_VERSION, HostBridge } from "./host";

class FakeHost { readonly sent: Array<Record<string, unknown>> = []; postMessage = vi.fn((message: Record<string, unknown>) => { this.sent.push(message); }); }

function setup() {
  const host = new FakeHost();
  const self = new EventTarget() as unknown as Window;
  const bridge = new HostBridge(host as unknown as Window, self);
  const deliver = (data: unknown, source: unknown = host) => self.dispatchEvent(Object.assign(new Event("message"), { data, source }));
  return { host, bridge, deliver };
}

let dispose: (() => void) | undefined;
afterEach(() => dispose?.());

describe("MCP Apps host bridge", () => {
  it("initializes, reads the host's theme, then reports ready", async () => {
    const { host, bridge, deliver } = setup();
    dispose = () => bridge.dispose();
    const connected = bridge.connect({ name: "topostack-preview", version: "1" });
    const request = host.sent[0]!;
    expect(request).toMatchObject({ jsonrpc: "2.0", method: "ui/initialize", params: { protocolVersion: APPS_PROTOCOL_VERSION } });
    deliver({ jsonrpc: "2.0", id: request.id, result: { hostContext: { theme: "dark" } } });
    await expect(connected).resolves.toEqual({ theme: "dark" });
    expect(host.sent[1]).toEqual({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
  });

  it("delivers host notifications and ignores other windows", () => {
    const { bridge, deliver } = setup();
    dispose = () => bridge.dispose();
    const results: unknown[] = [];
    bridge.on("ui/notifications/tool-result", (params) => results.push(params));
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { a: 1 } } }, {});
    deliver({ jsonrpc: "1.0", method: "ui/notifications/tool-result", params: {} });
    deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { a: 2 } } });
    expect(results).toEqual([{ structuredContent: { a: 2 } }]);
  });

  it("acknowledges teardown and refuses requests it does not know", () => {
    const { host, bridge, deliver } = setup();
    dispose = () => bridge.dispose();
    deliver({ jsonrpc: "2.0", id: 7, method: "ui/resource-teardown", params: {} });
    deliver({ jsonrpc: "2.0", id: 8, method: "ui/do-something", params: {} });
    expect(host.sent).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }, { jsonrpc: "2.0", id: 8, error: { code: -32601, message: "Method not found" } }]);
  });

  it("asks the host to open links and rejects when it refuses", async () => {
    const { host, bridge, deliver } = setup();
    dispose = () => bridge.dispose();
    const opened = bridge.openLink("https://topostack.app/studio");
    expect(host.sent[0]).toMatchObject({ method: "ui/open-link", params: { url: "https://topostack.app/studio" } });
    deliver({ jsonrpc: "2.0", id: host.sent[0]!.id, error: { code: -32000, message: "Blocked" } });
    await expect(opened).rejects.toThrow("Blocked");
    bridge.reportSize(400, 300);
    expect(host.sent.at(-1)).toEqual({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: 400, height: 300 } });
  });
});
