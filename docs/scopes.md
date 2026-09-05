# Histogram and RGB parade

Scopes measure the current graph's final Output in its declared transfer function
and primaries, after the Output clamp policy and before viewer display conversion.
Solo, before/after, snapshots, warnings and fidelity overlays do not change them.
They are diagnostics outside the graph and exported LUT.

The GPU grades the capped preview, then nearest-neighbour downsamples that output
to at most 512 pixels on its long edge, preserving aspect ratio. This is a sampled
distribution, not a full-image census or an averaged image. Floating-point readback
preserves negative and above-one output; it does not pass through an eight-bit canvas.
Fully transparent samples are excluded; partially transparent samples count once.

A module Web Worker accumulates three 256-bin histograms and three parades. Bin
intervals have width 1/256; 1 belongs to bin 255. Values below 0 and above 1 land at
the endpoints and have separate per-channel counts. Non-finite channel values are
excluded and counted separately. Parade x follows image left to right, channels
are R/G/B from left to right, and values increase bottom to top. Histogram heights
share a linear count scale; parade brightness uses log density per channel.

`GradingEngine.measureScopes(graph)` returns a promise of a report or `null` when
superseded. It snapshots the graph, permits one running worker job plus one
replaceable pending request, and spaces work by at least about 67 ms. GPU readback
and worker submission are both throttled. Replaced requests resolve to `null`
immediately and stale worker responses cannot publish a report. Changing the image,
explicit invalidation, or disposal invalidates pending and active measurements.
The UI hides old plots immediately when graph/source/loading/availability changes
and shows updating or paused status. Worker failures are confined to scopes;
a subsequent edit retries. Disposal terminates the worker and clears timers.

GPU rendering/readback still runs on the main thread; only accumulation runs in the
worker. The small readback and bounded queue limit this cost, but hardware-dependent
GPU synchronization can still affect latency. Tests cover the public engine boundary,
real worker scheduling, analytic distributions, and browser editing workflows.
