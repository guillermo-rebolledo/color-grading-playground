# Viewer comparison and inspection

Viewer settings are transient diagnostics. They do not enter the graph schema,
parameter history, or output policy. `GradingEngine.renderViewer(graph, options)`
composes the display and leaves `readPixels()` on the active, output-encoded grade.
`render(graph, nodeId)` remains the numeric inspection interface for a solo node.

- Fit contains the capped preview without enlarging it. 100% maps one preview
  pixel to one CSS pixel; it does not recover detail discarded by the 2,048-pixel
  preview cap. Zoom ranges from 10% to 800%. Drag the image, or focus its frame
  and use arrow keys, to pan. Fit and explicit zoom controls recenter the image.
- Before is an identity grade through the current input, working, output, and
  display transforms, with the current Output range policy. It is not the raw
  encoded source shown as if it were sRGB.
- Capture A/B copies the entire graph, including nested curves, numeric
  parameters, encodings, and output policy. Each slot stays fixed until captured
  again and is compared with the current grade on the same loaded image.
  Capturing while solo is active still captures the complete grade. Slots are
  session-only; replacing the image applies both looks to the new image.
- Comparison uses a single canvas and a GPU scissor rectangle, so both sides
  share sampling, dimensions, orientation, zoom, and pan. Drag the wipe handle
  or use its arrow/Home/End keys. The reference is on the left and the current
  grade (or solo) is on the right.
- Double-click any node to toggle solo. RGB solo uses that node's declared
  encoding for display conversion; qualifier solo displays grayscale membership.
  Exit solo restores the active Output. Comparison and warnings remain available
  during solo, and the viewer labels the inspected node.
- Out-of-range inspects any RGB channel before Output clamping, in the declared
  output encoding (node encoding for an intermediate solo). Blue means below
  zero, orange above one, and magenta both in the same pixel. Fully transparent
  pixels and grayscale masks are excluded. Normal pixels retain the selected
  output/display treatment. This diagnoses output-range excursions, not all
  possible display-gamut clipping or LUT approximation error.

The diagnostic pass can bypass Output clamping on a temporary graph copy. It
never changes the caller's configuration; after comparison/solo/warnings, the
engine restores its floating-point target to the active grading result.
