import type { Encoding } from "./colour";

export type ScopePixels = {
  width: number;
  height: number;
  pixels: Float32Array;
};
export type ScopeDistribution = {
  histogram: Uint32Array[];
  parade: Uint32Array[];
  sampleCount: number;
  below: number[];
  above: number[];
  nonFinite: number[];
};
export type ScopeResult = ScopeDistribution & {
  width: number;
  height: number;
  encoding: Encoding;
};

/** One running measurement and one replaceable request; GPU readback is throttled too. */
export class ScopeQueue {
  private worker: Worker | null = null;
  private revision = 0;
  private active: {
    revision: number;
    resolve: (value: ScopeResult | null) => void;
    reject: (error: Error) => void;
    metadata: Omit<ScopeResult, keyof ScopeDistribution>;
  } | null = null;
  private pending: {
    revision: number;
    read: () => ScopePixels;
    encoding: Encoding;
    resolve: (value: ScopeResult | null) => void;
    reject: (error: Error) => void;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastStarted = -Infinity;

  request(
    read: () => ScopePixels,
    encoding: Encoding,
  ): Promise<ScopeResult | null> {
    this.invalidate();
    return new Promise((resolve, reject) => {
      this.pending = {
        revision: this.revision,
        read,
        encoding: { ...encoding },
        resolve,
        reject,
      };
      this.schedule();
    });
  }

  invalidate() {
    this.revision++;
    this.pending?.resolve(null);
    this.pending = null;
    // Release callers immediately; keep the worker occupied until it responds.
    this.active?.resolve(null);
    clearTimeout(this.timer);
  }

  private schedule() {
    if (this.active || !this.pending) return;
    this.timer = setTimeout(
      () => this.start(),
      Math.max(0, 1000 / 15 - (performance.now() - this.lastStarted)),
    );
  }

  private start() {
    const request = this.pending;
    if (!request || this.active) return;
    this.pending = null;
    this.lastStarted = performance.now();
    try {
      if (!this.worker) {
        this.worker = new Worker(
          new URL("./scopes.worker.ts", import.meta.url),
          { type: "module" },
        );
        this.worker.onmessage = (event: MessageEvent<ScopeDistribution>) => {
          const active = this.active;
          this.active = null;
          if (active?.revision === this.revision)
            active.resolve({ ...active.metadata, ...event.data });
          this.schedule();
        };
        this.worker.onerror = () => {
          this.active?.reject(
            new Error("Scope worker failed. Edit the grade to retry."),
          );
          this.active = null;
          this.worker?.terminate();
          this.worker = null;
          this.schedule();
        };
      }
      const { pixels, width, height } = request.read();
      this.active = {
        ...request,
        metadata: { width, height, encoding: request.encoding },
      };
      this.lastStarted = performance.now();
      this.worker.postMessage({ pixels, width, height }, [pixels.buffer]);
    } catch (cause) {
      this.active = null;
      request.reject(
        cause instanceof Error ? cause : new Error("Scope measurement failed."),
      );
      this.schedule();
    }
  }

  dispose() {
    this.invalidate();
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
  }
}
