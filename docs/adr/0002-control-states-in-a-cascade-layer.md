# 2. Control states in a cascade layer

Date: 2026-09-06
Status: Accepted
Context: [MEM-221](https://linear.app/memoji-inc/issue/MEM-221/redesign-the-workspace-presentation-on-scheme-a-stage-and-docks),
landed by [MEM-223](https://linear.app/memoji-inc/issue/MEM-223/control-primitives-topbar-and-project-bar)

Amends [ADR 1](0001-tailwind-and-shadcn-ui.md), which recorded that the legacy
stylesheet wins over Tailwind utilities.

## Context

MEM-223 generates the first shadcn primitives and rebuilds two regions on
them. Two things about the arrangement ADR 1 left behind got in the way.

`src/styles.css` was unlayered and Tailwind's utilities are in
`@layer utilities`, so **every** legacy rule beat **every** utility, whatever
their specificity. ADR 1 called that the correct pressure. In practice it does
not apply pressure to a converted region — it makes one impossible: the legacy
element rules (`button, input { font: inherit }`, `button:focus-visible { … }`)
have no region to convert away from, so a generated `Button` could not set its
own type size or its own focus indicator no matter what it asked for.

The second thing is the states themselves. The spec asks for one set of four
states that applies to every control and that no component may opt out of —
in particular, a focus indicator that is never suppressed. Expressing that as
per-component classes means every future component has to remember it, and the
first one that forgets is a keyboard user going blind on that control.

## Decision

Order the stylesheets as explicit cascade layers, declared in
`src/tailwind.css`:

```css
@layer theme, base, legacy, utilities, controls;
```

- **theme** — Tailwind's variable layer.
- **base** — the one preflight rule the generated primitives depend on
  (`[data-slot] { border: 0 solid var(--border) }`), because Tailwind's border
  utilities set a width and a colour but no style, and preflight is still off.
- **legacy** — `src/styles.css`, imported into the layer rather than by
  `src/App.tsx`. It keeps the regions that have not been redressed yet.
- **utilities** — Tailwind, so a redressed component outranks the legacy
  stylesheet without a specificity war.
- **controls** — `src/controls.css`, the four control states and the motion
  budget, last so that no component and no utility can opt out of them.

The pressure ADR 1 wanted is kept by the rule it was there to enforce: when a
region is redressed, its legacy rules are deleted in the same change. MEM-223
does that for the topbar and the project bar.

Inside the controls layer, source order settles the states, so every exclusion
is wrapped in `:where()` to keep it out of the specificity sum. Without that,
`:not(.file-error button)` quietly outranks `[aria-pressed="true"]` and a
pressed toggle stops reading as pressed.

Component files carry density and geometry only. Colour and state are not
theirs to state; a colour declaration in `src/components/ui` is a defect, in
the same way ADR 1 says a component-level colour override is.

## Consequences

**A half-converted panel now looks unstyled rather than wrong.** That is the
opposite of what ADR 1 predicted and it is the better failure: a control with
no density reads as obviously unfinished, where a control wearing two
stylesheets reads as a bug in the design.

**The motion budget is one media query.** `src/tokens.css` sets
`--motion-control` and `--motion-collapse`, and a `prefers-reduced-motion`
block sets both to `0ms`. Nothing else in the application may state a
duration, so no component can be left out of the preference.

**Legacy controls are redressed ahead of their region.** The controls layer
reaches every button and select in the application, including panels still on
`src/styles.css`. Their density stays legacy until their ticket lands, but
their states are already the new ones. Two shapes opt out of the fill because
they are not chips — the accent-filled `.primary-button` and the borderless
text buttons — and they are named in `src/controls.css`.

**Adding a primitive means deleting, not writing, colour.** `shadcn add`
generates a component full of state classes; the override strips them and
keeps the density. The generated file is a starting point, not the artifact.
