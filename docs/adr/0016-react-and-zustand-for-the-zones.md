# ADR-16 — React and Zustand for the interface zones

**Date:** 21 September 2026 (decision) · recorded 27 September 2026
**Status:** accepted
**Supersedes:** ADR-2 — *No UI framework; SVG + direct DOM* (`MD/architecture.md` §10)

## Context

ADR-2 rejected React and Svelte in favour of SVG plus direct DOM. Its driver was regression
attributability: while `legacy.ts` was being taken apart, every behaviour change had to be traceable
to one module move, and a framework's rendering layer would have blurred that.

By `1.1.0` that condition no longer held. `legacy.ts` was gone, the client was strict TypeScript, and
the six golden artefacts had stayed byte-identical through the migration. What remained was the
interface itself: hand-built panels (`ui/*`, 4 867 lines in ten modules, including
`ouvrirImportCadastre` at 766 lines) that each rebuilt their own DOM, kept their own state and
listened to the same events in their own way. The rebuild described in `MD/spec-ihm-zones.md` (nine
zones, Z1 to Z9, with touch as an acceptance criterion) needed one state and one command table
shared by every zone, and components that re-render from that state.

## Decision

1. **Panels and chrome are React components** in `src/zones/`, at layer 6 alongside `app/`.
2. **State lives in one Zustand store**, `app/magasin.ts`, a bridge over `EtatApp`. Every action a
   zone triggers goes through the command table, `app/commandes.ts`.
3. **The plan and the gestures stay in native DOM.** `render/**` and `interaction/**` are hosted
   inside a component but not rewritten in React. They are tested, touch-capable and fast, and QA-P3
   is about the drawing strategy, not a virtual DOM. ADR-2 still holds for them.
4. **The single-file artefact is kept** (ADR-4). `vite-plugin-singlefile` embeds React, and the
   delivered-file budget moves from 1.2 MB to **5 MB** (QA-P6, FF-5). React DOM alone takes the file
   to about 680 KB, and the zones add our own code, not another dependency of that size.

## Consequences

- `zones/` is a layer-6 folder in `tests/unit/architecture.test.ts`. Nothing below layer 6 may
  import React or a zone, so the pure core is untouched.
- The `ui/` modules shrink as each zone replaces them: `attrPanel`, `panelTabs` and `selector` have
  already gone. A `ui/` module that survives is a renderer a zone calls, not a panel.
- Regression attributability, ADR-2's driver, is now carried by the golden artefacts and the smoke
  checklist (`tests/CHECKLIST-FUMEE.md`): each alpha of `1.2.0` shipped with the six artefacts
  identical apart from the version number.
- Two ways of touching the DOM coexist: React in `zones/`, direct DOM in `render/`, `interaction/`,
  `three/` and `shell/`. That boundary is deliberate. It should move only through another ADR, not
  through gradual drift.
