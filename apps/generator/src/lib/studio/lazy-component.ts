import { createSubscriber } from "svelte/reactivity";

/**
 * A component loaded on first use. A failed import is remembered as `failed`.
 * `ensure` never retries it, so an effect that keeps asking for the component
 * cannot loop on a persistent failure; `load` imports again, for an explicit
 * retry or a view the failure handler already navigated away from.
 *
 * Plain TypeScript with `createSubscriber`, so `component` and `failed` are
 * reactive when read from markup, deriveds, or effects.
 */
export class LazyComponent<T> {
  #component: T | undefined;
  #failed = false;
  #loading = false;
  #notify: (() => void) | undefined;
  readonly #subscribe = createSubscriber((update) => {
    this.#notify = update;
    return () => { this.#notify = undefined; };
  });

  constructor(
    private readonly importer: () => Promise<{ default: T }>,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  get component(): T | undefined { this.#subscribe(); return this.#component; }
  get failed(): boolean { this.#subscribe(); return this.#failed; }

  /** Start loading unless the component is ready, loading, or already failed. Safe to call from effects. */
  ensure(): void {
    if (this.#component || this.#failed || this.#loading) return;
    void this.#start();
  }

  /** Start loading unless the component is ready or loading, forgetting an earlier failure. */
  load(): void {
    if (this.#component || this.#loading) return;
    if (this.#failed) { this.#failed = false; this.#notify?.(); }
    void this.#start();
  }

  async #start(): Promise<void> {
    this.#loading = true;
    try {
      const module = await this.importer();
      this.#component = module.default;
    } catch (error) {
      this.#failed = true;
      this.onError(error);
    } finally {
      this.#loading = false;
      this.#notify?.();
    }
  }
}
