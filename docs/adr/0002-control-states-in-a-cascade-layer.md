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

Inside the controls layer a control paints itself from five custom properties
and changes state by redeclaring them. What a control **is** — a chip, a field,
a bare section header, a slider handle, an accent call to action — is said once
where that kind is described; each of the four states is one short block that
does not know which kind it is acting on. A new kind of control joins by
declaring its own five values, not by being added to an exclusion list in every
rule. That is not only tidier: the first draft of this file did use exclusion
lists, and `:not(.file-error button)` silently outranked
`[aria-pressed="true"]` and `:disabled`, so a pressed toggle did not read as
pressed and a disabled accent button stayed fully lit. Where selectors do still
overlap, source order settles them and every exclusion is wrapped in `:where()`
to keep it out of the specificity sum.

Component files carry density, geometry, and the theme token a surface is
made of — a dialog is `bg-card`, a tooltip is `bg-popover`. What they may not
carry is a **control state's** colour, or a **colour literal** of any kind. A
hex, an `rgba()` or a `black/50` in `src/components/ui` is a defect: it is a
palette decision made where nobody will look for it. The scrim and the one
popover shadow are therefore tokens (`--scrim`, `--shadow-popover`), not
values written into the two components that need them.

ADR 1 says "no component is generated until a ticket consumes it". MEM-223
generates all eight anyway, and that is a deliberate exception rather than an
oversight: its acceptance criteria name buttons, fields, sliders, accordions,
tabs, tooltips, dialogs and sheets individually, and the point of the ticket is
that there is one documented answer for each of them before the regions that
use them are built. Six of the eight have no caller yet. The rule ADR 1 was
protecting — that stock density is overridden as a component lands, never
later — is kept: every one of the eight was generated and then rewritten in
this change, and each was rendered and measured against the density in the
spec rather than assumed.

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
their states are already the new ones. The shapes that are not chips — the
accent-filled `.primary-button`, the borderless text buttons, the slider
handle — declare what they are in `src/controls.css`, so they take the four
states without taking the chip's fill.

**Adding a primitive means deleting, not writing, colour.** `shadcn add`
generates a component full of state classes; the override strips them and
keeps the density. The generated file is a starting point, not the artifact.
