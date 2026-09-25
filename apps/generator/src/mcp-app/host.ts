/**
 * The view side of the MCP Apps protocol: JSON-RPC 2.0 over postMessage with
 * the chat host that framed this document. Only messages from the parent
 * window are read. The protocol is small enough that a bridge this size
 * replaces the reference SDK, which would bring its own UI framework along.
 * Specification: https://github.com/modelcontextprotocol/ext-apps
 */
export const APPS_PROTOCOL_VERSION = "2026-01-26";

type Params = Record<string, unknown> | undefined;

interface Message { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Params; result?: unknown; error?: { code: number; message: string } }

export interface HostContext { theme?: "light" | "dark"; displayMode?: string }

export class HostBridge {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Map<string, Array<(params: Params) => void>>();

  constructor(private readonly host: Window, private readonly self: Window) {
    self.addEventListener("message", this.receive);
  }

  private readonly receive = (event: MessageEvent) => {
    if (event.source !== this.host) return;
    const message = event.data as Message;
    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") return;
    if (message.method === undefined) {
      const waiting = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
      if (!waiting) return;
      this.pending.delete(message.id as number);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
      return;
    }
    if (message.id !== undefined) {
      // Requests from the host: acknowledge teardown and pings, refuse the rest.
      const known = message.method === "ui/resource-teardown" || message.method === "ping";
      this.post(known ? { jsonrpc: "2.0", id: message.id, result: {} } : { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
  };

  private post(message: Message): void {
    // The host frames this document from an opaque origin; nothing sent here is private.
    this.host.postMessage(message, "*");
  }

  request(method: string, params: Params = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: Params = {}): void {
    this.post({ jsonrpc: "2.0", method, params });
  }

  on(method: string, listener: (params: Params) => void): void {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  /** Handshake: announce the view, learn the host's context, then report ready. */
  async connect(appInfo: { name: string; version: string }): Promise<HostContext> {
    const result = await this.request("ui/initialize", { protocolVersion: APPS_PROTOCOL_VERSION, appCapabilities: {}, clientInfo: appInfo, appInfo }) as { hostContext?: HostContext } | undefined;
    this.notify("ui/notifications/initialized");
    return result?.hostContext ?? {};
  }

  openLink(url: string): Promise<unknown> {
    return this.request("ui/open-link", { url });
  }

  reportSize(width: number, height: number): void {
    this.notify("ui/notifications/size-changed", { width, height });
  }

  dispose(): void {
    this.self.removeEventListener("message", this.receive);
  }
}
