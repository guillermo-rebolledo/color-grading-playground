# 1. Tailwind and shadcn/ui as the component substrate

Date: 2026-09-06
Status: Accepted
Context: [MEM-221](https://linear.app/memoji-inc/issue/MEM-221/redesign-the-workspace-presentation-on-scheme-a-stage-and-docks),
landed by [MEM-222](https://linear.app/memoji-inc/issue/MEM-222/foundations-neutral-tokens-self-hosted-fonts-region-extraction)

## Context

The workspace redesign rebuilds the presentation layer on a neutral token
system, a documented density scale, and one set of control states. The
application's styling is a single hand-written stylesheet, `src/styles.css`,
with density and state expressed as per-panel one-offs.

Two ways to get there: port the tokens into the existing stylesheet and keep
hand-writing controls, or adopt a component substrate that already has the
states, the accessibility behaviour and a theming contract.

## Decision

Adopt Tailwind, shadcn/ui with Radix primitives, and `lucide-react` for icons.

- The theme lives in one variable block (`src/tokens.css`) and is the single
  source of truth for colour. Component-level colour overrides are a defect.
- `src/tailwind.css` re-exposes those variables to Tailwind and shadcn through
  `@theme inline`, and carries the `@custom-variant dark`. The application is
  dark-only: there is no light theme and no theme toggle.
- The `@/*` path alias resolves to `src/` in both the bundler
  (`vite.config.ts`) and the type checker (`tsconfig.json`), because shadcn's
  generator writes imports against it.
- `components.json` records the generator's configuration: new-york style,
  neutral base colour, CSS variables, `lucide` icons.

## Consequences

**The stylesheet is retired region by region, not all at once.** This is the
expand half of an expand–contract migration: the token layer is added beside
`src/styles.css`, which stays working. Whatever a redesign part touches, that
part converts fully; a part must not leave a panel half-migrated across a
release.

**Tailwind's preflight is off until the last region converts.** Preflight is a
global reset, and `src/styles.css` is still load-bearing; enabling it now would
restyle every panel before its redesign lands. `src/tailwind.css` therefore
imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` only. The
region that removes the last of `src/styles.css` switches preflight on.

**Legacy rules currently win over utilities.** `src/styles.css` is unlayered
and Tailwind's utilities are in `@layer utilities`, so any surviving legacy
rule beats a utility on the same property regardless of source order. That is
the correct pressure — it makes converting a region mean deleting its old
rules — but it means a half-converted panel will look wrong rather than merely
unstyled.

**Stock shadcn density is wrong for this application** and is overridden per
component (button heights, a toolbar variant, hairline cards, mono inputs,
2px radii). Those overrides are documented in MEM-221 and land with the
tickets that generate each component.

**Icons come from one set at one size and weight** — Lucide at 14px, stroke
1.5. Adding an icon outside the set recorded in MEM-221 is a design decision,
not an implementation one.
