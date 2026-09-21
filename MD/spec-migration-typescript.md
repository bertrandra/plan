# Migration specification — `plan_interactif.html` → TypeScript

**Subject:** single-file HTML application "Plan interactif — Parcelle AE 101"
**Analysed artefact:** `plan__2_.html`, 13 487 lines / 773 KB
**Status:** proposal for review
**Audience:** the developer(s) carrying out the migration

---

## 1. Objectives and non-objectives

### 1.1 Objectives

| # | Objective | Verifiable by |
|---|---|---|
| O1 | Compile the whole application under `tsc --strict` with zero `any` in domain code | CI build |
| O2 | Break the single 12 400-line `boot()` closure into ~30 modules with explicit imports | Repo layout |
| O3 | Give the persisted data model (project JSON) a single authoritative type definition | `src/model/types.ts` |
| O4 | Preserve byte-identical exports (SVG / DXF / PDF / GLB / JSON) for a fixed input project | Golden-file tests |
| O5 | Keep deployment as **one HTML file** dropped next to `api.php` | `vite-plugin-singlefile` output |
| O6 | Unit-test the calculation engines (terrace structure, BOM, cut optimisation, sun position, geodesy) | Vitest coverage ≥ 80 % on `src/engine/**` |

### 1.2 Non-objectives (explicitly out of scope)

- **No functional change.** No new feature, no bug fix, no UI change during the migration. Bugs found are logged, not fixed, except where a fix is required to make the code typable (§10.3).
- **No renaming of French domain identifiers.** `lambourde`, `solive`, `entraxe`, `debit`, `plot`, `vis` stay as-is. The domain vocabulary is the spec; translating it would destroy traceability to NF DTU 51.4.
- **No framework.** No React/Vue/Svelte. The app is SVG + direct DOM and stays that way. Introducing a framework at the same time as TypeScript would make regressions unattributable.
- **No CSS refactor.** The `<style>` block (lines 6–226) moves to one `.css` file unchanged.
- **No backend change.** `api.php` keeps its current contract (§8.1).

---

## 2. Current state — measured inventory

Facts established by reading the artefact, not assumptions.

### 2.1 Physical structure

| Region | Lines | Content |
|---|---|---|
| `<style>` | 6–226 | Theming via CSS custom properties, light/dark via `prefers-color-scheme` |
| `<body>` markup | 228–596 | Static shell: 165 distinct `id` attributes, all panels pre-rendered and toggled with `style.display` |
| Script block 1 | 597–1009 | Error banner, toast, confirm/prompt, Poly Haven texture picker, `DEMO_OBJECTS`, `DEMO_MEASURES`, API client, `loadInitialProject()` |
| Script block 2 | 1010–13485 | `try { function boot(seed){ … 12 450 lines … } loadInitialProject().then(boot).catch(…) } catch(err){ showErrBanner(err) }` |

### 2.2 Code shape

- **331 top-level `function` declarations**, of which ~320 live inside `boot()`.
- **~150 closure variables** act as application state (`objects`, `measures`, `selectedKey`, `scale`, `originScreen`, `appMode`, `orthoActif`, `threeScene`, `vue3dMinutes`, …).
- **246 `document.getElementById`** calls, **251 `addEventListener`**, **55 `createElementNS`**, **81 `innerHTML`** assignments.
- No inline `onclick=` attributes, no `eval`, no `with`. Good.
- Largest functions: `ouvrirImportCadastre` (773 lines), `renderAttrTable` (725), `buildThreeScene` (634), `renderTerrasseConfigurator` (365), `renderMethode` (282), `buildExportPDF` (265), `objetsDepuisCadastre` (228).

### 2.3 Functional domains identified

1. Plan editor — SVG rendering, hit-testing, pointer/pinch/pan drag, vertex/edge editing, undo.
2. Geometry kernel — polygon area, centroid, offset, clipping, bisectors, Catmull-Rom paths.
3. Cadastre & geodesy — BAN geocoding, API Carto parcels, local ENU projection, ring merging, neighbour detection.
4. IGN layers — BD TOPO buildings/vegetation/hedges, estimated trees, GPU/PLU zoning, WMTS orthophoto tiling and cache.
5. Measurement tool — perpendicular witness lines, reference-segment picking, rotation alignment.
6. Parasol shadow model — sun sampling over months/hours, shadow polygon, heatmap, best-position search.
7. Terrace engine — structural sizing (screw/joist/batten spans per NF DTU 51.4), spa zones, screw grid, layer generation, BOM, price model, cut optimisation (`debit`), setting-out plan, site planning.
8. 3D — dynamic three.js r128 loading, scene build, sun positioning, fence, textures, GLB export, GLB viewer.
9. Export/import — SVG, PNG, DXF, hand-rolled PDF writer, multi-page A4 dossier, project JSON.
10. Persistence — `api.php` list/load/save/delete, `localStorage` last-project id, dirty tracking.

### 2.4 The five structural problems TypeScript will expose

| ID | Problem | Consequence for migration |
|---|---|---|
| P1 | Everything is in one closure. There are no module boundaries to preserve — they must be **created**. | The migration is a decomposition project first, a typing project second. §6 is the critical section. |
| P2 | The model object carries its own DOM: `obj.el`, `obj.nameEl`, `obj.pointEls[]`, `obj.edgeEls[]`, `obj.segLabelEls[]`, `obj.radiusHandle`, `obj.camMarkerEl` sit on the same object as `obj.pts`, `obj.fill`, `obj.construction`. `serializeObjects()` exists purely to strip them again. | Must split `PlanObject` (data, serialisable) from `ObjectView` (DOM handles) — §5.2. This is the single highest-value change in the whole migration. |
| P3 | `const history = []` (line 1016) is the **undo stack**, shadowing `window.history`. Once files are split, an un-imported reference to `history` silently resolves to `window.history` and type-checks cleanly. | Rename to `undoStack` in Phase 0, before any file splitting. Non-negotiable. |
| P4 | Every external payload (BAN, API Carto, GPU, WFS, WMTS, Poly Haven, `api.php`, imported JSON/SVG) is consumed as untyped `any`. | Needs a validation boundary — §8.2. `validerProjetJSON()` (line 5715) already does this for one case and is the model to follow. |
| P5 | Units are mixed and implicit: metres (`pts`, `scale`), centimetres (`plotEntraxe`, `depassementVis`), millimetres (`largeurLame`, `soliveSection` "63x175"), PostScript points (`PT_PAR_METRE`), degrees and radians (`PARASOL_ELEV_MIN_DEG` vs `SOLEIL_ELEV_PLANCHER`). | Branded unit types — §5.5. Highest defect-prevention value in the terrace engine. |

---

## 3. Target architecture

### 3.1 Toolchain

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.6+ | — |
| Bundler | Vite 5 | Fast, zero-config TS, native ESM in dev |
| Single-file output | `vite-plugin-singlefile` | Preserves the "copy one file to the server" deployment that the app depends on |
| Tests | Vitest + `@vitest/coverage-v8` | Same transform pipeline as the build |
| DOM tests | `jsdom` environment | Enough for the render/serialise layers; the 3D layer is not DOM-tested |
| Lint | ESLint + `@typescript-eslint` (type-aware) | Rules in §9.3 |
| Format | Prettier, 2-space, 110 col | Match the existing file's style |
| Node | ≥ 20 LTS | — |

### 3.2 Repository layout

```
plan-interactif/
├─ index.html                  # shell only: <div id="…"> markup from lines 228–596
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ public/
│  └─ api.php                  # unchanged, copied to dist
├─ src/
│  ├─ main.ts                  # loadInitialProject().then(createApp)
│  ├─ styles/app.css           # lines 6–226, unchanged
│  ├─ model/
│  │  ├─ types.ts              # PlanObject, Construction, Measure, Project… (§5)
│  │  ├─ units.ts              # branded units (§5.5)
│  │  ├─ defaults.ts           # defaultConstruction, ELEVATION_DEFAUT, LIBELLE_FONCTION
│  │  ├─ normalize.ts          # normalizeObjects
│  │  ├─ serialize.ts          # serializeObjects, serializeMeasures, filtrerSansParcelle
│  │  └─ demo.ts               # DEMO_OBJECTS, DEMO_MEASURES
│  ├─ core/
│  │  ├─ state.ts              # AppState + createState() (§6)
│  │  ├─ history.ts            # undoStack, pushHistory, mutate, restoreState, undo
│  │  └─ events.ts             # typed event bus (§6.3)
│  ├─ geometry/
│  │  ├─ basic.ts              # dist, shoelace, centroid, signedArea, pointInPolygon
│  │  ├─ rect.ts               # estRectangle, rectangleDepuisCoin, rectangleDepuisCote
│  │  ├─ segments.ts           # projectOntoSegment, lineSegIntersect, lineLineIntersect,
│  │  │                        #   distancePointSegment, nearestSegmentIndex, angleOfSegment
│  │  ├─ polygon.ts            # polygonOffset, clipPolygonByConvex, clipLineToPolygon,
│  │  │                        #   ringSegments, exteriorBisector, offsetZone
│  │  ├─ path.ts               # pathD (Catmull-Rom), parseSvgPathPoints, polyStr
│  │  └─ rings.ts              # memePoint, decouperAnneau, fusionnerAnneaux, chainerSegments
│  ├─ geo/
│  │  ├─ projection.ts         # projecteurLocal, TERRE_A/TERRE_E2, tuileX/Y, lonDeTuile…
│  │  ├─ ban.ts                # geocoderBAN
│  │  ├─ cadastre.ts           # interrogerCadastre, construireCandidats, classerCandidats,
│  │  │                        #   trierVoisines, objetsDepuisCadastre
│  │  ├─ bdtopo.ts             # interrogerWfs, construireElementsIgn, hauteurBatiment,
│  │  │                        #   hauteurVegetation, arbresEstimes, construireVoisinage
│  │  ├─ plu.ts                # interrogerPlu, lienGeoportailUrbanisme, lienTerritoireUrbanisme
│  │  ├─ ortho.ts              # WMTS tiles, cache, placerOrthophoto, basculerOrthophoto
│  │  └─ soleil.ts             # positionSoleil, decalageFuseauFrance, lieuActuel
│  ├─ engine/                  # PURE — no DOM, no fetch, fully unit-tested
│  │  ├─ structure.ts          # porteeVisM, porteeAppuiM, evaluerStructure, computeStructure,
│  │  │                        #   buildVisGrid, findSpaZones, generateSpanningLines
│  │  ├─ layers.ts             # computeTerrasseLayers, etendueLame, empriseLame
│  │  ├─ bom.ts                # computeBOM, prices, achatVis, achatPlots, computeAssise
│  │  ├─ debit.ts              # optimiserDebitLames, computeDebitsBois, computeDebitLames
│  │  ├─ optimiser.ts          # optimiserParametres
│  │  ├─ implantation.ts       # repereImplantation, computeImplantation
│  │  ├─ chantier.ts           # CADENCES, cadenceDe, computeChantier
│  │  └─ parasol.ts            # ombreInstantanee, calculerCartesOmbre,
│  │                           #   chercherMeilleurePositionParasol
│  ├─ render/
│  │  ├─ svg.ts                # svgNS, typed createSvg<K>() helper (§7.2)
│  │  ├─ stage.ts              # toScreen, toWorld, computeSize, drawGrid, fitToObject
│  │  ├─ objects.ts            # createObjectDOM, rebuildHandles, byPriority, stacking
│  │  ├─ decor.ts              # drawNorthArrow, drawScaleBar
│  │  ├─ parasolOverlay.ts     # renderParasolOverlay
│  │  ├─ measures.ts           # drawMeasures, computeMeasureGeom, measureOutsideAnchor
│  │  ├─ terrasseLayers.ts     # renderTerrasseLayerView, layer tabs
│  │  └─ render.ts             # the render() orchestrator
│  ├─ interaction/
│  │  ├─ pointer.ts            # activeDrag, pinch/pan, activePointers
│  │  ├─ editing.ts            # insertPointOnSegment, deleteVertex, applyAngleEdit,
│  │  │                        #   applyLengthEdit, alignObjectByRotation
│  │  └─ creation.ts           # addNewObject/Path/Circle/Parasol/Viewpoint, duplicate, delete
│  ├─ ui/
│  │  ├─ dom.ts                # el(), els(), on() helpers (§7.1)
│  │  ├─ dialogs.ts            # showToast, showConfirm, showPrompt, showErrBanner
│  │  ├─ selector.ts           # rebuildSelector
│  │  ├─ attrPanel.ts          # renderAttrTable  ← split further, see §6.4
│  │  ├─ dispPanel.ts          # renderDispTable
│  │  ├─ measurePanel.ts       # rebuildMeasurePanel, renderMeasureResults
│  │  ├─ pluPanel.ts           # renderPanneauPlu
│  │  ├─ projectBar.ts         # setupProjectBar
│  │  ├─ texturePicker.ts      # Poly Haven catalogue + picker
│  │  ├─ cadastreDialog.ts     # ouvrirImportCadastre, ouvrirDialogueActualisation
│  │  ├─ terrasse/
│  │  │  ├─ configurator.ts    # renderTerrasseConfigurator, renderParametresCalcul
│  │  │  ├─ bomTable.ts        # renderBOMTable, renderDebitBois, renderDebitLames
│  │  │  ├─ coupe.ts           # renderTerrasseCoupe
│  │  │  ├─ implantation.ts    # renderImplantation
│  │  │  ├─ chantier.ts        # renderChantier
│  │  │  ├─ methode.ts         # renderMethode
│  │  │  └─ optimResult.ts     # renderOptimResult
│  │  └─ modes.ts              # setAppMode, sub-tabs, stage placement, full-page toggles
│  ├─ three/
│  │  ├─ loader.ts             # ensureThreeLoaded / GLTFExporter / GLTFLoader
│  │  ├─ scene.ts              # buildThreeScene   ← split further, see §6.4
│  │  ├─ lighting.ts           # appliquerLumiereVue3d, appliquerLumiereGlb
│  │  ├─ controls.ts           # mode3D, zoom3D, viewpoints, resize, dispose
│  │  ├─ glbExport.ts          # genererGlb, attendreTexturesPretes
│  │  └─ glbViewer.ts          # buildGlbViewerScene, viewer panel
│  ├─ export/
│  │  ├─ svgExport.ts          # buildExportSVG, escapeXml
│  │  ├─ dxf.ts                # buildExportDXF, dxfNum
│  │  ├─ pdf/
│  │  │  ├─ writer.ts          # pdfEscape, assemblerPDF, pdfTexte, pdfPolygone, pdfCercle
│  │  │  ├─ plan.ts            # buildExportPDF
│  │  │  └─ dossier.ts         # buildDossierPDF, pagePlanDeMasse, pageTerrasse, cotationPolygone
│  │  ├─ png.ts
│  │  └─ importSvg.ts          # importSVGString
│  ├─ persistence/
│  │  ├─ api.ts                # apiList/apiLoad/apiSave/apiDelete, loadInitialProject
│  │  ├─ projectIo.ts          # exportProjetJSON, validerProjetJSON, appliquerProjetImporte
│  │  └─ prefs.ts              # localStorage keys, ortho/affichage restore
│  └─ util/
│     ├─ format.ts             # nombreFr, formatHeureMin, slugFichier, horodatageFichier
│     ├─ escape.ts             # escapeHtml, escapeXml
│     └─ download.ts           # telechargerTexte
└─ tests/
   ├─ fixtures/                # reference project JSON + golden outputs
   └─ …
```

### 3.3 Dependency direction (enforced by lint, §9.3)

```
util  ←  model  ←  geometry  ←  engine
                        ↑          ↑
                       geo   →  render  →  interaction
                        ↑          ↑            ↑
                    persistence    └──── ui ────┘
                                          ↑
                                        three, export
```

Hard rules:
- `engine/**` and `geometry/**` import **nothing** from `ui`, `render`, `three`, `geo`, or the DOM. They are pure functions of plain data. This is what makes O6 achievable.
- `model/**` imports only `util` and `units`.
- Nothing imports `main.ts`.

---

## 4. Migration phases

Each phase ends with a merged, deployable, behaviour-identical build. **No phase is allowed to change output bytes** except where §10.3 lists an accepted exception.

### Phase 0 — Safety net (before any TypeScript)

Work on the current `.html`, in JavaScript.

1. Capture **golden fixtures**: with the reference project (`Parcelle AE 101`, 12 objects, 2 terraces), export SVG, DXF, PDF, the PDF dossier, GLB, and project JSON. Store under `tests/fixtures/golden/`. These are the regression oracle for the entire migration.
2. Record a **manual smoke checklist** (§11.3) — 25 interactions that no automated test will cover.
3. Rename `history` → `undoStack` (P3). Rename `objByKey`'s local shadows if any surface.
4. Freeze the artefact: tag it `v0-preTS`, commit the raw file to the new repo as `legacy/plan_interactif.html`. Every later phase diffs against it.

**Exit:** golden fixtures reproduce byte-identically from the tagged file.

### Phase 1 — Scaffolding, zero logic moved

1. Create the Vite project, `tsconfig.json` (§9.1, permissive rung), ESLint, Vitest.
2. `index.html` = lines 1–596 with `<style>` extracted to `src/styles/app.css` and `<script>` replaced by `<script type="module" src="/src/main.ts">`.
3. `src/legacy.ts` = script blocks 1 and 2 verbatim, renamed `.ts`, with `// @ts-nocheck` at the top and `export { boot, loadInitialProject }`.
4. `main.ts` wires them. Build with `vite-plugin-singlefile`.

**Exit:** the single-file build is functionally identical; golden exports still match; `dist/index.html` deploys next to `api.php` and works.

### Phase 2 — Extract the pure leaves (no state dependency)

Move, one PR per group, from `legacy.ts` into real typed modules. These functions read only their arguments:

- `util/**`, `geometry/basic.ts`, `geometry/rect.ts`, `geometry/segments.ts`, `geometry/polygon.ts`, `geometry/path.ts`, `geometry/rings.ts`
- `geo/projection.ts`, `geo/soleil.ts`
- `export/pdf/writer.ts`, `export/dxf.ts`
- `model/units.ts`, `model/types.ts`, `model/defaults.ts`

Each PR: move the function, add types, add unit tests, delete from `legacy.ts`, import it back in.

**Exit:** ~1 800 lines out of `legacy.ts`; `engine`-adjacent maths covered by tests.

### Phase 3 — Extract the engine

`engine/**` in full. These functions currently read closure state (`objects`, the selected terrace) in a few places — every such read becomes an explicit parameter. This is the phase where `computeStructure`, `computeBOM`, `optimiserDebitLames`, `computeImplantation`, `computeChantier`, and the parasol shadow model become pure.

Watch for: `ensureConstruction(obj)` mutates its argument. Keep the mutation (behaviour parity) but type it `(obj: PlanObject) => asserts obj is PlanObjectWithConstruction`.

**Exit:** the terrace engine is a pure library with ≥ 80 % coverage; BOM and débit outputs match golden fixtures for both reference terraces.

### Phase 4 — Model split and state container

The hard phase. Implement §5.2 (data/view split) and §6 (`AppState`). Every function still in `legacy.ts` that read a closure variable now receives a context.

Sequence: `state.ts` → `history.ts` → `render/**` → `interaction/**`. Do not start `ui/**` before `render/**` is out.

**Exit:** `legacy.ts` contains only UI panels and the 3D layer; `objects` no longer carries DOM references.

**Fait — et depasse — le 9 septembre 2026 (§9.2.14).** `legacy.ts` ne contient plus rien : il est supprime. La fermeture `boot()` vit dans `src/app/boot.ts`, module type et linte comme le reste.

### Phase 5 — UI panels

`ui/**`, panel by panel, largest last. `renderAttrTable` and `renderTerrasseConfigurator` get decomposed per §6.4.

### Phase 6 — 3D and export

`three/**` (including the `buildThreeScene` split) and the remaining `export/**`.

### Phase 7 — Strictness ratchet and cleanup

Climb the tsconfig rungs (§9.2) one flag per PR until the strict target is reached. Delete `legacy.ts`. Remove `// @ts-nocheck` and every `// @ts-expect-error` that no longer applies.

**Exit:** O1–O6 all met.

---

## 5. Type model

### 5.1 Geometry primitives

```ts
export interface Pt { x: Metres; y: Metres }          // world coordinates, metres, y up
export interface ScreenPt { x: number; y: number }    // SVG pixels, y down
export interface LonLat { lon: Degrees; lat: Degrees } // WGS84
```

`toScreen(p: Pt): ScreenPt` and `toWorld(p: ScreenPt): Pt` become type-checked — today they are mutually substitutable and the compiler cannot help. This alone catches a whole class of mistake in `render/**` and `interaction/**`.

### 5.2 The plan object — data / view split (P2)

**Persisted data**, discriminated on `type`:

```ts
export type ObjectKey = string & { readonly __brand: 'ObjectKey' };

export type Fonction =
  | 'terrain' | 'batiment' | 'terrasse' | 'arbre' | 'massif' | 'mobilier'
  | 'dalle' | 'equipement' | 'chemin' | 'parasol' | 'camera' | 'limite'
  | 'annexe' | 'autre';

interface ObjectBase {
  key: ObjectKey;
  name: string;
  fill: string; fillOpacity: number; stroke: string;
  showName: boolean; showSegNames: boolean; showVertNames: boolean;
  showDims: boolean; showAngles: boolean;
  constrained: boolean; locked: boolean; hidden: boolean;
  fonction: Fonction;
  matiere: string;
  priority: number;
  elevation?: Metres;
  altitude?: Metres;
  textureVerticale: Texture | null;
  textureHorizontale: Texture | null;
  textureArbre: Texture | null;
  clotureActive: boolean;
  clotureHauteur?: Metres;
  clotureCouleur?: string;
  clotureTexture: Texture | null;
  terrasseLieeKey: ObjectKey | null;
  cadastre: CadastreMeta | null;
  bdtopo?: BdTopoMeta | null;
  plu?: PluMeta | null;
  ortho?: OrthoPrefs | null;
  affichage?: AffichagePrefs | null;
  construction?: Construction;
}

interface VertexShape extends ObjectBase {
  pts: Pt[];
  vertexNames: string[];      // invariant: length === pts.length
  segmentNames: string[];     // invariant: polygon → pts.length, path → pts.length - 1
  frozenVertices: boolean[];  // invariant: length === pts.length
}

export interface PolygonObject extends VertexShape { type: 'polygon' }
export interface PathObject    extends VertexShape { type: 'path'; width: Metres; curve: boolean }
export interface CircleObject  extends ObjectBase  { type: 'circle'; center: Pt; r: Metres;
                                                     diametreArbre?: Metres; couleurArbre?: string }

export type PlanObject = PolygonObject | PathObject | CircleObject;
```

**View handles**, kept in a side map, never serialised:

```ts
export interface ObjectView {
  el: SVGElement;
  nameEl: SVGTextElement;
  pointEls: SVGCircleElement[];
  ptLabelEls: SVGTextElement[];
  edgeEls: SVGLineElement[];
  segLabelEls: SVGTextElement[];
  radiusHandle?: SVGCircleElement;
  camMarkerEl?: SVGGElement;
}

export type ViewMap = Map<ObjectKey, ObjectView>;
```

`serializeObjects()` becomes a near-identity function (still needed for undo snapshots and for dropping transient fields), and the "did I forget to strip a DOM node before `JSON.stringify`" class of bug becomes structurally impossible.

**Migration note:** parasol-specific fields (`matSurPerimetre`, `matDeporte`, `hauteurParasol`, `diametreParasol`) and camera-specific fields (viewpoint direction) currently live on the same flat object regardless of `fonction`. Model them as optional on `ObjectBase` in Phase 4 rather than adding a second discriminant on `fonction` — a two-axis discriminated union (`type` × `fonction`) would be a behaviour-visible refactor and belongs after the migration.

### 5.3 Construction (terrace parameters)

The `construction` sub-object has ~50 fields, all present in the reference project. Type it exhaustively and non-optionally, with `ensureConstruction()` as the only producer:

```ts
export type TypePose = 'vis-fondation' | 'plots';
export type EssenceBois = 'pin-classe4' | 'douglas' | 'exotique' | 'composite' | 'autre';
export type SoliveSection = '45x70' | '45x95' | '63x175';
export type LambourdeSection = '40x60' | '45x45' | '45x70' | '45x95' | '63x175';
export type SupportType = 'concasse' | /* … from SUPPORT_TYPES, line 8435 */ string;

export interface Construction {
  typePose: TypePose;
  hauteurVis: Cm; depassementVis: Cm; visModeAuto: boolean;
  chargeNormale: DaNPerM2; chargeSpa: DaNPerM2;
  kPortee: number; kEntraxeLame: number; coefRaideurLame: number;
  jeuLames: Mm; epaisseurLameRive: Mm;
  longueursLames: string;          // "3, 2.5, 2, 1.7, 1.5" — parsed by parseLongueurs()
  chuteMinReutilisable: Cm; jointsSurAppui: boolean;
  prixLongueurs: PrixBarre[];
  longueursBois: string; prixLongueursBois: PrixBarre[]; jointsBoisSurAppui: boolean;
  lambourdeSection: LambourdeSection; longueursLambourde: string;
  prixLongueursLambourde: PrixBarre[];
  prixVisUnite: Euros; visParBoite: number;
  hauteurPlot: Cm; plotModele: string; plotEntraxe: Cm; plotEntraxeAuto: boolean;
  plotAvecSolives: boolean; plotSurfaceAssise: Cm2; prixPlots: PrixBarre[];
  supportType: SupportType; supportDecaissement: Cm;
  cadences: Cadence[]; equipe: number; heuresJour: number;
  echelleImplant: number;
  lames3dFilaire: boolean;
  vues3d: Vue3d[];
  visEntraxe: Cm; visEntraxeZoneSpa: Cm; visMargeZoneSpa: Cm;
  soliveEntraxe: Cm; soliveSection: SoliveSection;
  avecLambourde: boolean; lambourdeEntraxe: Cm;
  sensPose: Degrees; segmentReference: number;
  essenceBois: EssenceBois; largeurLame: Mm; epaisseurLame: Mm;
  avecLameRive: boolean; hauteurLameRive: Mm; avecLamePlat: boolean;
  bom: BomLine[];
}

export interface BomLine {
  poste: 'vis' | 'bois' | 'lambourde' | 'lames' | 'visserie' | 'lameRive' | 'plots'
       | 'geotextile' | 'concasse' | 'dalles';
  label: string;
  qte: number;
  unite: 'u' | 'ml' | 'm²' | 'm³';
  prixBas: Euros; prixHaut: Euros;
  prixReel: Euros | null;
  calcule?: string;
}

export interface Vue3d { nom: string; pos: Vec3; cible: Vec3 }
```

**Note on `bom`:** it is a *computed result* persisted inside the project. Keep it persisted (round-trip parity), but `computeBOM()` must be the only writer, and the engine must never read `construction.bom` as an input.

### 5.4 Measures, project envelope, external metadata

```ts
export interface Measure {
  id: string;
  ref: { objKey: ObjectKey; segIndex: number };
  startEnd: 'A' | 'B';
  targets: Array<{ objKey: ObjectKey; ptIndex: number }>;
  label?: string;
  visible?: boolean;
}

export interface ProjectPayload {          // what api.php stores and returns
  id?: string;
  name: string;
  objects: SerializedObject[];
  measures: Measure[];
  meta?: ProjectMeta | null;
}

export interface ProjectListEntry { id: string; name: string; updatedAt?: string }
```

`CadastreMeta`, `PluMeta`, `BdTopoMeta`, `Texture`, `OrthoPrefs`, `AffichagePrefs` are transcribed field-by-field from the reference project data at lines 882–920 — every field observed there is required unless the code guards it with `||`/`?.`.

### 5.5 Branded units (P5)

```ts
declare const brand: unique symbol;
type Unit<T, B> = T & { readonly [brand]: B };

export type Metres  = Unit<number, 'm'>;
export type Cm      = Unit<number, 'cm'>;
export type Mm      = Unit<number, 'mm'>;
export type Cm2     = Unit<number, 'cm2'>;
export type Pt_     = Unit<number, 'pt'>;      // PostScript points (PDF)
export type Degrees = Unit<number, 'deg'>;
export type Radians = Unit<number, 'rad'>;
export type Minutes = Unit<number, 'minOfDay'>;
export type Euros   = Unit<number, 'EUR'>;
export type DaNPerM2 = Unit<number, 'daN/m2'>;

export const m  = (n: number) => n as Metres;
export const cm = (n: number) => n as Cm;
export const mToCm  = (v: Metres) => (v * 100) as Cm;
export const cmToM  = (v: Cm) => (v / 100) as Metres;
export const mmToM  = (v: Mm) => (v / 1000) as Metres;
export const degToRad = (v: Degrees) => (v * Math.PI / 180) as Radians;
```

**Scope of branding:** apply to `engine/**`, `geometry/**`, `geo/projection.ts`, `export/pdf/**`, and the `Construction` type. Do **not** brand UI form values — parse at the boundary (`cm(parseFloat(input.value))`) and keep the DOM layer in plain `number`. Branding everything would cost more in ceremony than it returns.

Cost estimate: ~250 conversion call-sites, ~2 days. Expect it to surface at least one genuine unit bug in `hauteurAppuiMm` / `hauteurFinieMm` / `PLOT_HAUTEUR_DTU_CM` interplay — log it, do not fix it during migration (§10.3).

---

## 6. Killing the `boot()` closure (P1)

> **Fait le 9 septembre 2026 — voir §9.2.14 pour le compte rendu.** La fermeture a ete deplacee
> telle quelle dans `src/app/boot.ts` : memes instructions, meme ordre, portee desormais verifiee.
> Le bus d'evenements esquisse en §6.3 n'a **pas** ete construit, comme §6.3 s'y autorisait.

### 6.1 Principle

Today every function can read and write every state variable. That is the whole design. Replace it with **one explicit state object, passed down**, not with module-level `let`s — module-level mutable state reproduces the same problem with worse ergonomics and breaks testability.

```ts
export interface AppState {
  // persisted domain data
  objects: PlanObject[];
  measures: Measure[];
  // view handles (P2)
  views: ViewMap;
  // selection & modes
  selectedKey: ObjectKey | null;
  appMode: 'plan' | 'terrasse' | '3d' | 'glb';
  panelTab: PanelTab;
  attrTab: 'segments' | 'angles';
  terrasseSelectedKey: ObjectKey | null;
  terrasseSubTab: TerrasseSubTab;
  // stage transform
  scale: number; originScreen: ScreenPt; W: number; H: number;
  // toggles
  showNorth: boolean; grilleVisible: boolean; voisinageVisible: boolean;
  terrasseLayerVisible: Record<LayerId, boolean>;
  // ortho
  ortho: { actif: boolean; opacite: number; parcelleOpacite: number;
           tuiles: OrthoTile[]; chargement: boolean; cache: Map<string, string> };
  // parasol tool
  parasol: { ombreAffichee: boolean; carteAffichee: boolean; dateStr: string; minutes: Minutes };
  // measure tool
  pick: PickState | null;
  draft: { ref: SegRef | null; startEnd: 'A'|'B'; targets: PtRef[] };
  align: { targetSeg: SegRef | null; distanceValue: string };
  // interaction
  drag: DragState | null;
  pointers: Map<number, PointerSample>;
  pinch: PinchState | null; pan: PanState | null;
  // persistence
  project: { id: string | null; name: string; apiAvailable: boolean; dirty: boolean };
  undoStack: Snapshot[];
  // 3d (own sub-state, see 6.2)
  three: ThreeState;
}
```

### 6.2 Sub-contexts

Three domains keep their own state object because they own disposable resources and must not leak into the plan editor:

```ts
export interface ThreeState {
  loaded: boolean;
  scene: SceneBundle | null;      // { scene, camera, renderer, controls, root, disposables }
  glbViewer: SceneBundle | null;
  dernierGlbExporte: { buffer: ArrayBuffer; nomTerrasse: string; date: Date } | null;
  vue3d: SunSettings & { pleinePage: boolean; allObjects: boolean; opaque: boolean;
                         textures: boolean; shadows: boolean; filaire: boolean };
  glb: SunSettings & { pleinePage: boolean; fond: 'clair'|'sombre'|'damier';
                       filaire: boolean; shadows: boolean };
  mode3D: 'orbit' | 'pan' | 'zoom';
}
export interface SunSettings { dateStr: string; minutes: Minutes;
                               intensite: number; lumiereAppoint: boolean; semaine: number }
```

`disposeThreeSceneResources` / `disposeThreeScene` / `disposeGlbViewerScene` become methods on `SceneBundle` — the current three copies of near-identical disposal logic collapse into one, and the compiler enforces that every created resource is registered.

### 6.3 Re-render and the event bus

`render()` is currently called ~90 times from all over the code. Keep that — do not introduce reactivity. But make the dependency explicit:

```ts
export type AppEvent =
  | { type: 'objects:changed' } | { type: 'selection:changed' }
  | { type: 'measures:changed' } | { type: 'view:transform' }
  | { type: 'mode:changed'; mode: AppState['appMode'] }
  | { type: 'construction:changed'; key: ObjectKey }
  | { type: 'project:dirty' };

export interface Bus { emit(e: AppEvent): void; on<T extends AppEvent['type']>(
  t: T, fn: (e: Extract<AppEvent, {type: T}>) => void): () => void }
```

`mutate()` (line 1045) already is the central mutation wrapper — it becomes `mutate(ctx, fn)` and emits `objects:changed`. `markDirty()` emits `project:dirty`. This is the minimum ceremony that lets modules stop importing each other's render functions directly (which would create the cycles §3.3 forbids).

### 6.4 Decomposing the four oversized functions

| Function | Lines | Split into |
|---|---|---|
| `ouvrirImportCadastre` | 773 | `cadastreDialog.ts`: `openDialog()`, `renderSearchStep()`, `renderCandidateList()`, `renderNeighbourStep()`, `renderConfirmStep()`, `applyImport()` — one function per dialog step, state in a local `ImportWizardState` |
| `renderAttrTable` | 725 | `attrPanel/`: `identity.ts`, `geometry.ts` (segments/angles tabs), `appearance.ts` (fill/stroke/texture), `fonction.ts`, `parasol.ts`, `camera.ts`, `cloture.ts` — each exporting `renderSection(ctx, obj): HTMLTableRowElement[]` |
| `buildThreeScene` | 634 | `three/scene/`: `terrain.ts`, `objects3d.ts`, `terrasseMesh.ts`, `cloture.ts`, `textures.ts`, `camera.ts` — each `addX(bundle, ctx): void` |
| `renderTerrasseConfigurator` | 365 | `terrasse/configurator/`: `fields.ts` (field descriptors as data), `render.ts` (generic renderer over descriptors), `handlers.ts` |

The configurator split is worth calling out: it currently builds ~40 form rows imperatively. Replacing it with a typed field-descriptor array

```ts
type Field<K extends keyof Construction> = {
  key: K; label: string; unit?: string;
  kind: 'number'|'select'|'checkbox'|'text';
  options?: ReadonlyArray<Construction[K]>;
  min?: number; max?: number; step?: number;
  hidden?: (c: Construction) => boolean;
  hint?: string;
};
```

makes the whole panel exhaustively checked against `Construction`, so a field added to the type without a UI row is a compile error. Do this in Phase 5, not earlier.

---

## 7. DOM and SVG conventions

### 7.1 Element lookup (246 call-sites)

`strictNullChecks` turns every `document.getElementById(...)` into `HTMLElement | null`. Do not sprinkle `!`. Use:

```ts
// src/ui/dom.ts
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`Élément #${id} introuvable`);
  return n as T;
}
export function elOpt<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
```

Rule: `el()` for elements present in `index.html` (they are static — the shell never removes them). `elOpt()` only where the code already guards with `if (b)` — e.g. `updateUndoBtn` at line 1087.

Better still, generate a typed registry from `index.html` in Phase 5:

```ts
export const DOM = {
  stage: el<HTMLDivElement>('stage'),
  undoBtn: el<HTMLButtonElement>('undoBtn'),
  chkOrtho: el<HTMLInputElement>('chkOrtho'),
  vue3dHeure: el<HTMLInputElement>('vue3dHeure'),
  // … 165 entries
} as const;
```

so `DOM.chkOrtho.checked` and `DOM.vue3dHeure.value` type-check without casts, and a typo in an id fails at startup rather than silently.

### 7.2 SVG creation (55 `createElementNS` call-sites)

```ts
const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}
export function attr(e: Element, name: string, v: string | number): void {
  e.setAttribute(name, typeof v === 'number' ? String(v) : v);
}
```

58 sites currently pass numbers to `setAttribute` (e.g. `svg.setAttribute('width', W)`). `attr()` absorbs them without a mechanical `String()` sweep and keeps the diff readable.

### 7.3 Event handlers using `this`

The file uses `function(){ … this.value … }` extensively (e.g. lines 13440–13454). Two accepted forms, no others:

```ts
on(DOM.vue3dHeure, 'input', (e) => {           // preferred
  ctx.three.vue3d.minutes = minutes(parseInt(e.currentTarget.value, 10));
});
```

with a typed helper:

```ts
export function on<E extends HTMLElement, K extends keyof HTMLElementEventMap>(
  target: E, type: K,
  fn: (ev: HTMLElementEventMap[K] & { currentTarget: E }) => void,
  opts?: AddEventListenerOptions
): () => void
```

Blanket conversion of `function(){}` handlers to arrows is safe here **only** through this helper, which restores the `this`-equivalent via `currentTarget`. Do not convert by hand.

### 7.4 `innerHTML` (81 sites)

Keep them. They build static markup and interpolate values already passed through `escapeHtml()`. Add an ESLint exception rather than rewriting to `createElement` — that rewrite is a behaviour risk with no typing benefit. Audit each site once during its phase: any interpolation of a user-supplied string (object names, project names, PLU labels from the Géoportail) that is **not** wrapped in `escapeHtml()` is a defect to log.

---

## 8. External boundaries

### 8.1 `api.php` contract (unchanged, now typed)

| Call | Request | Response |
|---|---|---|
| `GET ?action=list` | — | `ProjectListEntry[]` |
| `GET ?action=load&id=…` | — | `{ objects, measures, meta }` |
| `POST ?action=save` | `ProjectPayload` | `{ id: string }` |
| `POST ?action=delete` | `{ id: string }` | `{ ok: true }` |

The existing error classification (`reason: 'network' | 'notfound' | 'server' | 'badjson'`) becomes a typed error:

```ts
export type ApiFailureReason = 'network' | 'notfound' | 'server' | 'badjson';
export class ApiError extends Error { constructor(msg: string, readonly reason: ApiFailureReason) { … } }
```

`loadInitialProject()`'s deliberate asymmetry — fall back to `DEMO_OBJECTS` only when no project id is known, propagate otherwise (documented at lines 977–982 as fix M5) — is a **behavioural invariant** and needs a test, because it is exactly the kind of subtlety a refactor deletes.

### 8.2 Third-party payloads — validation, not casting

| Source | Endpoint | Handling |
|---|---|---|
| BAN | `api-adresse.data.gouv.fr/search/` | `parseBanResponse()` guard → `BanFeature[]` |
| API Carto cadastre | `apicarto.ign.fr/api/cadastre/parcelle` | guard → `GeoJsonFeatureCollection<Polygon, CadastreProps>` |
| Géoportail urbanisme | `apicarto.ign.fr/api/gpu` | guard → `PluMeta` |
| BD TOPO WFS | `data.geopf.fr/wfs/ows` | guard → `WfsFeatureCollection` |
| Orthophoto WMTS | `data.geopf.fr/wmts` | binary → data URI, no parsing |
| Poly Haven | `api.polyhaven.com/assets`, `/files/:id` | guard → `PolyhavenAsset` map |
| Imported project JSON | file | **existing** `validerProjetJSON` (line 5715) → `ProjectPayload` |
| Imported SVG | file | `importSVGString` — already defensive, type its output |

Recommendation: **hand-written type guards, not Zod.** Reasons: single-file build size matters here; the payloads are consumed shallowly (a handful of fields each); `validerProjetJSON` already establishes a house style. If a schema library is wanted later, it belongs to the JSON import path only.

Every guard returns a discriminated result rather than throwing:

```ts
export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };
```

so the existing user-facing French error strings survive unchanged.

### 8.3 three.js r128

Currently: four `<script>` tags injected at runtime (`three.min.js` r128 from cdnjs, then `OrbitControls.js`, `GLTFExporter.js`, `GLTFLoader.js` from jsDelivr `examples/js/`), all attaching to the `THREE` global, gated by `ensureThreeLoaded()` / `ensureGLTFExporterLoaded()` / `ensureGLTFLoaderLoaded()`.

Two viable options:

**Option A — keep CDN, add ambient types (recommended for Phases 1–6).**

```ts
// src/three/three-global.d.ts
import type * as THREE_NS from 'three';
declare global {
  const THREE: typeof THREE_NS & {
    OrbitControls: typeof import('three/examples/jsm/controls/OrbitControls').OrbitControls;
    GLTFExporter: typeof import('three/examples/jsm/exporters/GLTFExporter').GLTFExporter;
    GLTFLoader:   typeof import('three/examples/jsm/loaders/GLTFLoader').GLTFLoader;
  };
}
```

with `three@0.128` + `@types/three@0.128` as **dev dependencies only** (types, never bundled). Zero runtime change, zero bundle growth, full typing. The `examples/js` → `examples/jsm` API surface is identical at r128 for these three classes, so the types are accurate.

**Option B — bundle three (defer to a post-migration decision).** Removes the CDN/offline dependency the UI hints already warn about ("Nécessite une connexion internet"), but adds ~600 KB to the single-file output and changes the loading behaviour users see. Not a migration decision.

Take Option A. Record Option B as a follow-up.

**Fait le 30 août 2026, au palier `three/` (§9.2.11).** Le code avait dérivé entre-temps :
`src/three/global.d.ts` déclarait `const THREE: any` et `SceneTrois = Record<string, any>`, avec un
commentaire qui argumentait contre l'option A — « une dépendance de type sans dépendance de code » —
c'est-à-dire contre la décision prise ici même. L'écart a été refermé dans le sens de la spec, et
les deux promesses de l'option A ont été vérifiées plutôt que supposées :

- `@types/three@0.128.0` **existe** et décrit exactement la r128 que les balises `<script>` vont
  chercher chez jsDelivr, `examples/jsm/{controls/OrbitControls,exporters/GLTFExporter,loaders/GLTFLoader}`
  compris ;
- le build **ne contient aucune trace du paquet** — aucun `import` de valeur ne pointe vers `three`,
  et l'octet près, la croissance du fichier produit s'explique entièrement par le code écrit à ce
  palier (gardes de type, deux constantes locales), pas par les typages.

Un effet de bord immédiat : ces types voient que `THREE.SRGBColorSpace` et `Texture.colorSpace`
**n'existent pas à la r128** (ils datent de la r152). Le code les teste avant de s'en servir, donc
la ligne concernée ne fait rien aujourd'hui ; elle est conservée telle quelle — la changer serait
une décision de rendu, pas de typage — mais elle est désormais documentée sur place.

---

## 9. Compiler and lint configuration

### 9.1 `tsconfig.json` (final target)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests"]
}
```

### 9.2 Strictness ratchet

Start permissive so Phase 1 compiles, then one flag per PR in Phase 7. Each rung must reach zero errors before the next is enabled.

| Rung | Flag | Expected pain |
|---|---|---|
| 1 | `strict: false`, `allowJs: true`, `checkJs: false` | none — Phase 1 baseline |
| 2 | `noImplicitAny` | large: every extracted function signature. Absorbed progressively in Phases 2–6. |
| 3 | `strictNullChecks` | large: the 246 `getElementById` sites (mitigated by `el()`), plus `objects.find(...)` results |
| 4 | `strictFunctionTypes`, `strictBindCallApply` | small |
| 5 | `noUncheckedIndexedAccess` | medium: `pts[i]`, `vertexNames[i]`, `segmentNames[i]` in the geometry and render layers. High value — the array-length invariants in `VertexShape` are currently only enforced by `normalizeObjects`. |
| 6 | `exactOptionalPropertyTypes` | medium: the `?` fields on `PlanObject` that are currently set to `undefined` explicitly |
| 7 | `noUnusedLocals`, `noUnusedParameters` | small: reveals dead code left by the split |

### 9.2.1 Mesure réelle — 29 août 2026

Le chiffre de 997 erreurs cité pendant les phases 2–6 était périmé. Mesuré à nouveau après
l'extraction complète, **drapeau par drapeau, en cumulatif** — parce que les mesurer isolément
sous-estime tout : sans `noImplicitAny`, presque tout vaut `any`, et un `any` ne peut pas échouer.

| Barreau | Configuration cumulée | Erreurs |
|---|---|---:|
| 1 | base actuelle | 0 |
| 2 | `noImplicitAny` | **1 375** |
| 3 | + `strictNullChecks` | 1 633 |
| 4 | + `strict` complet | 1 659 |
| 5 | + `noUncheckedIndexedAccess` | 2 126 |
| 6 | + `exactOptionalPropertyTypes` | 2 132 |
| 7 | + inutilisés, surcharges, `switch` | 2 138 |

Mesurés **isolément**, six de ces drapeaux affichent zéro — `strictFunctionTypes`,
`strictBindCallApply`, `noImplicitThis`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`. Ce zéro ne veut rien dire : il disparaît dès que le barreau 2 est
franchi. `noUncheckedIndexedAccess` passe ainsi de 0 à 467 une fois les types connus, et c'est le
troisième poste de la marche.

**Trois faits qui changent le plan.**

1. **`legacy.ts` n'y contribue pour rien.** Il porte `@ts-nocheck`, donc zéro erreur sur les 1 375.
   L'échelle de rigueur et la suppression de `legacy.ts` sont **indépendantes** : on croyait devoir
   finir l'une avant l'autre, c'est faux, et la phase 7 peut commencer maintenant.
2. **Le travail est concentré.** 61 des 100 modules sont déjà propres au barreau 2. Dix fichiers
   portent 802 des 1 375 erreurs (58 %), vingt-cinq en portent 1 185 (86 %) : `ui/terrassePanels`
   (116), `ui/cadastreDialog` (102), `engine/structure` (98), `geo/apiIgn` (88), `three/scene` (86).
3. **Trois quarts sont une seule et même chose.** 1 062 des 1 375 sont `TS7006` — un paramètre sans
   type. Parmi eux, 291 nomment un objet du plan (`o`, `obj`, `objets`, `terr`…) et 130 un contexte
   (`etat`, `ctx`). `ObjetPlan` existe déjà dans `model/types.ts` : la marche n'est pas
   « inventer 1 375 types », c'est « annoter 1 375 fois quatre types déjà écrits ».

### 9.2.2 Ce qu'un étalonnage sur un module réel a montré

`render/empilement.ts` (21 erreurs) a été typé en entier, pour mesurer plutôt qu'estimer.

- Le module passe de **21 à 0**.
- Mais le total ne baisse d'abord que de **7** : typer le module fait **apparaître des erreurs dans
  son fichier de test**, dont les doublures ne satisfont plus les types. Il a fallu les reprendre
  aussi pour arriver à 1 375 → 1 353, soit −22.

**Le coût réel est donc double** : un module et son test. Et la difficulté n'est pas dans le module.

Le point instructif est ailleurs. Typer le contexte avec `Element` rendait le test **impossible à
écrire** : vérifier un ordre de peinture aurait demandé de fabriquer de vrais nœuds SVG, c'est-à-dire
de monter un navigateur pour contrôler une comparaison de nombres. La bonne réponse n'était pas de
relâcher le type mais de **paramétrer** le module sur le type d'élément (`ContexteEmpilement<E =
Element>`) — il ne lit aucune propriété de ce qu'il empile, il le passe à `appendChild`.

C'est ce que la phase 7 va révéler partout : **le typage ne mesure pas la rigueur, il mesure le
couplage.** Chaque endroit où un type rend un test impraticable désigne un module qui en demande
plus qu'il n'en a besoin. Ces endroits-là sont le vrai livrable de la phase, pas les annotations.

### 9.2.3 Ordre d'attaque proposé

Pas un fichier après l'autre par ordre de taille, mais du plus pur au plus dépendant — la même
progression que les couches (`architecture.md` §5.2.1), pour que chaque type posé serve au suivant :

1. **Consolider les types partagés** — `ObjetPlan`, `EtatPlan`, `Mesure`. C'est le levier des 291 +
   130 paramètres nommés. Retirer l'index `[autreChamp: string]: unknown` d'`ObjetPlan` en fait
   partie, et c'est là que se décidera la forme réelle des données.
2. **`geometry/` puis `model/`** — 55 erreurs à eux deux, aucun DOM, tests déjà nombreux. C'est le
   rodage : peu de volume, et les types qui en sortent servent partout ensuite.
3. **`engine/`** — 315 erreurs, mais du calcul pur couvert par les golden files et l'oracle du
   moteur. Le risque de régression y est le plus bas du projet.
4. **`geo/`, `export/`, `render/`, `io/`, `three/`, `interaction/`** — 543 erreurs, chacun contre son
   témoin.
5. **`ui/`** — 436 erreurs, en dernier. C'est la couche la plus grosse, la moins testée, et celle où
   un type mal choisi se paie en doublures de test illisibles.

Les barreaux 3 à 7 se franchissent ensuite couche par couche dans le même ordre, et non drapeau par
drapeau sur tout le dépôt : un fichier déjà strict le reste, et le compteur ne remonte pas.

### 9.2.4 Le cliquet, et le premier palier — 29 août 2026

« Un fichier déjà strict le reste » était une intention, pas une garantie : rien ne l'imposait.
`tsconfig.json` ne sait pas l'imposer non plus — restreindre `include` ne restreint rien, puisque les
fichiers importés entrent quand même dans le programme.

D'où [`scripts/cliquet.mjs`](../scripts/cliquet.mjs) (`npm run cliquet`) : il lance `tsc` avec les
drapeaux du barreau visé et **échoue si une erreur vient d'un dossier déclaré propre**. Les autres
sont comptés, pas reprochés. Promouvoir un dossier est un geste explicite — on l'ajoute à la liste
`PROPRES` — et il ne peut plus régresser.

**Palier franchi : `shell`, `geometry` et `model` rejoignent `core` et `util`.** Total au barreau 2 :
1 375 → **1 308**.

L'ordre annoncé plus haut a été suivi à une exception près, et elle vaut d'être dite : **l'index
`[autreChamp: string]: unknown` d'`ObjetPlan` n'a pas été retiré.** Le retirer relève de l'honnêteté
du type, pas de `noImplicitAny` — c'est un chantier orthogonal, qui toucherait d'un coup les neuf
dossiers encore sales. Il attend que le cliquet ait plus de terrain acquis à protéger.

**Ce que la consolidation a trouvé, et qui n'était pas une question de style :**

- `geometry/rings.ts` **annonçait `{ a, b }` et manipulait `[p0, p1]`**. Le type avait été écrit à la
  main lors de l'extraction et jamais vérifié ; producteur et consommateur, eux, s'accordaient sur
  les paires depuis toujours. C'est le seul écart de ce palier qu'un lecteur pouvait croire.
- `render/measures.ts` déclarait **sa propre interface nommée `ObjetPlan`**, homonyme de celle du
  modèle et différente d'elle. Deux vérités sous un seul nom. Elle dit maintenant ce qu'elle est —
  une exigence, `ObjetCote`, que tout `ObjetPlan` satisfait.
- `EtatPlan` valait `any` dans `app/atelier.ts` alors que `core/state.ts` décrivait déjà l'état : le
  câblage pouvait lire un champ inexistant sans que rien ne le signale. Les deux sont reliés.
- `Mesure` vivait dans `render/`. C'est une donnée du projet : elle s'enregistre dans le fichier et
  `core/state.ts` en tient la liste. Un état qui doit importer depuis `render/` pour se décrire
  remonte la pile à l'envers.

**Et la leçon de §9.2.2 s'est confirmée deux fois de plus.** `model/creation.ts` ne prend pas
`EtatApp` mais `EtatCreation` — cinq champs nommés — parce que `model/` n'a pas à connaître la pile
d'annulation ni la transformation de la scène. Et `normalizeObjects` est générique
(`<T> ⟶ (T & ObjetBrut)[]`) parce que c'est littéralement ce qu'elle fait : elle n'enlève rien, elle
ajoute. Rendre `T` seul aurait été faux dans l'autre sens — on ne pourrait plus lire les noms de
sommets qu'elle vient de poser.

Deux fichiers de test ont dû suivre, comme le coût double l'annonçait. Ce qu'ils ont révélé n'est pas
anodin : leurs objets d'essai **n'avaient pas de nom**. Le programme en lit un à la duplication
(« … (copie) ») et à la suppression ; un objet sans nom n'avait jamais existé ailleurs que là.

### 9.2.5 `engine/` — 30 août 2026

**315 → 0. Total du dépôt : 1 308 → 952.** `engine/` rejoint les dossiers que le cliquet protège.

Un seul levier : **`Construction` n'existait pas**. 53 champs lus dans dix fichiers et décrits nulle
part, dont `defaultConstruction()` était la seule définition — en creux. Écrire le type a fait tomber
le reste presque mécaniquement, et a révélé au passage que `ensureConstruction` ne comble que **40**
de ces 53 champs.

**Le typage a trouvé un défaut que j'étais en train d'introduire.** En typant `cadenceDe`, j'avais
écarté le cas « le dictionnaire est un tableau » — or les projets enregistrés portent `[]` là où le
défaut pose `{}`, le jeu de démonstration compris, et une cadence saisie s'y range parfaitement.
Le filtre aurait fait retomber cette cadence sur le barème, sans erreur et sans trace, et **aucune
empreinte ne l'aurait vu** puisque la démo n'a pas de cadence saisie. `model/dictionnaire.ts` fait
désormais l'indexation exacte d'avant, une fois, avec sa raison écrite.

C'est le complément de la leçon §9.2.2 : un type qui gêne signale bien quelque chose, mais **ce n'est
pas toujours le code qui a tort**. Ici la forme des données était bancale ; la corriger demandait une
migration de données, pas un filtre au point de lecture.

Trois autres constats :

- **19 coercitions implicites** `input.value = <nombre>`, correctes mais jamais dites. Explicitées par
  `String(...)`, et les 31 champs du panneau Terrasse comparés au témoin, identiques.
- **Troisième type local homonyme** trouvé (`ObjetParasol` dans `render/parasolOverlay.ts`), après
  l'`ObjetPlan` de `render/measures.ts` et l'`EtatPlan` d'`app/atelier.ts`. Toujours le même geste :
  redécrire sur place ce qui existait ailleurs, parce que le type partagé valait `any`.
- **Quatre exigences nommées** (`TerrasseEtudiee`, `PorteurDeConstruction`, `ObjetMesurable`,
  `ObjetCote`) là où le moteur ne lit ni clef ni nom — l'optimiseur évaluait déjà ses candidates sur
  un `{ pts, construction }` fabriqué pour l'occasion.

Vérifié en relevant les empreintes **à version inchangée** avant toute recapture : six sur six
identiques au bit près. Puis sept relevés du mode Terrasse contre le témoin figé, sept identiques.

### 9.2.6 `render/` — 30 août 2026

**33 → 0. Total du dépôt : 952 → 919.**

Quatrième type local homonyme trouvé (`ObjetPlan` dans `render/objects.ts`, après ceux de
`render/measures.ts`, `app/atelier.ts` et `render/parasolOverlay.ts`) — toujours le même geste, et
maintenant un motif reconnaissable : dès qu'un type partagé vaut `any`, chaque module qui en a besoin
finit par en écrire un à lui. Renommé `ObjetRendu`, dérivé du modèle (`ObjetPlan &
Required<Pick<...>>`) plutôt que réécrit.

Typer `render/ortho.ts` a demandé d'ajouter `cadastre` et `ortho` à `ObjetPlan`, ce qui a cassé un
test de `model/normalisation.ts` qui utilisait ces deux noms comme *placeholders* arbitraires pour
vérifier un clonage générique. Corrigé en leur donnant leur forme réelle — le mécanisme testé n'a pas
changé, seules les valeurs de test sont redevenues plausibles.

Vérifié en plus des empreintes habituelles : le fond orthophoto (que le jeu de démonstration
n'active jamais) pose les mêmes quatre tuiles, au dernier chiffre décimal, que le témoin figé.

### 9.2.7 `io/` — 30 août 2026

**57 → 0. Total du dépôt : 919 → 862.**

Pas un nouveau type cette fois, mais la correction d'un type déjà posé et **faux dans ce qu'il
promettait** : `Atelier.restoreState` annonçait `ObjetPlan[]`, alors que `core/historique.ts` fait
toujours passer ces objets par `normalizeObjects` en les restaurant. Le paramètre attend maintenant
`ObjetBrut[]` — plus permissif, donc sans effet sur les appelants existants — et dit enfin ce que la
fonction fait réellement.

Vérifié en plus des empreintes habituelles : un cycle export JSON → import (remplacement) sur le jeu
de démonstration restaure exactement les 35 objets et les 11 mesures ; relevé de santé identique.

### 9.2.8 `interaction/` — 30 août 2026

**53 → 0. Total du dépôt : 862 → 809.**

Le geste en cours (`activeDrag`) est un `GlisserEnCours` (drag.ts) ou un pan à un doigt. Écrire leur
union a révélé que `GlisserEnCours` admet déjà `'pan'` dans son propre champ `type` — un
chevauchement qui rendait le discriminant inopérant : `if (activeDrag.type === 'pan')` ne suffisait
pas à exclure la branche `GlisserEnCours`, laissant `startOrigin`/`startScreen` inaccessibles juste
après le test censé les garantir. Corrigé en intersectant le premier membre avec le sous-ensemble de
types réellement couvert ici.

Deux champs `startScreen`, posés sur deux gestes mais jamais lus (seul le pan lit le sien), ont été
retirés après vérification exhaustive — même principe que la variable morte trouvée dans
`engine/layers.ts` en phase 4 : un champ prouvé mort se supprime, il ne se maquille pas en type.

Une imprécision de `drag.ts` reste non touchée et documentée : `GlisserEnCours.obj` exige `pts`,
même pour un cercle qui n'en a jamais — la corriger casserait `estRectangle`, qui l'exige aussi.
Contournée par un cast local.

Vérifié en plus des empreintes habituelles : un `PointerEvent` de glisser réel sur un sommet déplace
ce seul sommet, exactement du delta demandé ; un `WheelEvent` redessine la scène.

### 9.2.9 `app/` — 30 août 2026

**19 → 0. Total du dépôt : 809 → 790.** Six interfaces de contexte à compléter, rien de nouveau
méthodologiquement. `ObjetPlan` gagne les quatre champs de clôture, sur le modèle de `ortho` et
`affichage` — sauf `clotureTexture`, laissé `unknown` : sa forme appartient au sélecteur de texture
(`ui/`, pas encore typé), qui rend déjà `unknown` à qui l'écoute.

Vérifié en plus des empreintes habituelles : le pilotage des quatre vues et la bascule de grille, en
séquence, sans erreur.

### 9.2.10 `geo/` — 30 août 2026

**127 → 0. Total du dépôt : 790 → 638.** L'écart est plus grand que le compte du dossier : donner
de vraies signatures à `apiIgn.ts` a éteint 25 erreurs de plus dans `ui/projectBar.ts`, qui lit ses
retours. C'est l'illustration la plus nette de §9.1 — un `any` partagé ne coûte pas cher là où il
est écrit, il coûte cher chez ceux qui l'appellent.

GeoJSON est décrit une fois (`Anneau`, `GeometrieGeoJSON`, `FeatureGeoJSON<P>`,
`CollectionGeoJSON<P>`, `EmpriseGeoJSON`), paramétré par le type des `properties` : les propriétés
d'une parcelle cadastrale et celles d'un bâtiment BD TOPO n'ont rien en commun, et c'est le seul
endroit où la distinction se voit.

Un paramètre mort trouvé et retiré : `formeCommune(pts, c)` ne lisait jamais `c`. Troisième objet
mort exhumé par le typage après les deux `startScreen` d'`interaction/` — écrire la signature oblige
à regarder ce que la fonction lit vraiment.

**La vérification qui compte n'est pas celle des empreintes.** Les six goldens ne font aucun appel
réseau, alors que `geo/` n'est presque que cela : ils prouvent seulement que le typage n'a pas
débordé ailleurs. Le vrai contrôle est le rejeu **en direct** de l'import cadastral sur les deux
versions le même jour — le témoin figé 1.0.0 et le build typé — qui rend le même projet au bit près
(25 232 octets normalisés, même SHA-256), en sollicitant BAN, l'API Carto cadastre, la BD TOPO en
WFS et les neuf interrogations du GPU/PLU. Détail dans `tests/fixtures/golden/EMPREINTES.md`.

Au passage, une limite de la méthode est devenue mesurable : l'empreinte d'import notée le 28 août
n'est plus reproductible, **sur le témoin figé lui-même** (+227 octets). Ce sont les données du GPU
qui bougent, pas le code. Une empreinte qui dépend d'un service en ligne ne se conserve pas ; seule
l'égalité entre deux versions rejouées le même jour se conserve.

### 9.2.11 `three/` — 30 août 2026

**128 → 0. Total du dépôt : 638 → 510.** Ce palier commence par refermer un écart entre §8.3 et le
code (voir là-bas) : `@types/three@0.128.0` entre en devDependency, `THREE` cesse d'être `any`, et
douze erreurs apparaissent immédiatement au barreau 1 — c'est-à-dire douze endroits où le programme
parlait à une bibliothèque dont il ne savait rien.

Ce que ces douze erreurs disaient est plus intéressant que le fait de les avoir éteintes :

- **`isMesh`, `isLight`, `isTexture` ne sont pas sur le tronc commun.** `Object3D` ne les déclare
  pas ; ce sont des drapeaux posés par les sous-classes, et Three.js s'en sert **à la place**
  d'`instanceof` parce que deux copies de la bibliothèque dans une page ont des constructeurs
  différents. Les trois gardes de `three/gardes.ts` reprennent exactement le test déjà écrit et le
  rendent au vérificateur ; ils ne changent aucune condition.
- **`THREE.SRGBColorSpace` et `Texture.colorSpace` n'existent pas à la r128.** Le code les teste
  avant usage, donc la ligne ne fait rien aujourd'hui : c'est un garde-fou tourné vers l'avenir, et
  il reste tel quel. Un typage ne décide pas d'un rendu (§10.3).
- **`GLTFExporter.parse` rend `object`**, sa signature ne distinguant pas les deux sorties que
  l'option `{ binary: true }` sépare pourtant.

Deux types qui mentaient, dans la même famille que ceux de `geometry/rings.ts` et d'`Atelier` :
`reglerSoleil` demandait une `SceneTrois` entière alors que son propre commentaire énumérait cinq
champs — et que l'appelant de la Vue 3D lui construit un objet à quatre champs sans scène ; et
`attendreTexturesPretes` déclarait `new Set<SceneTrois>()` pour y ranger des **textures**. Les deux
étaient invisibles tant que `SceneTrois` valait `Record<string, any>` : un type assez large pour
tout accepter ne dit plus rien de faux, il ne dit plus rien du tout.

`SceneTrois` devient d'ailleurs deux types réels, `SceneVue3d` et `SceneGlb`, au-dessus d'un
`SceneTroisBase` de huit champs — la Vue 3D cadre un plan (`extent`, `cen`), la visionneuse cadre un
modèle déjà produit (`centre`, `rayon`). Deux formes, pas une seule avec quatre champs facultatifs
qui ne seraient jamais tous posés.

**Ce que les empreintes ne voient pas, ici encore.** Aucune des six n'ouvre la 3D. Le contrôle réel
est l'export GLB rejoué en direct : mêmes compteurs structurels qu'au relevé d'origine — glTF 2.0,
203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène — sur un fichier de 41 473 604
octets, plus la visionneuse éprouvée sur les chemins les plus retouchés (bascule du fond, qui passe
par `estTexture` et libère la texture précédente ; filaire, qui reconstruit la scène).

**Limite connue, laissée en l'état.** `ObjetPlan` porte `[autreChamp: string]: unknown`. Les champs
de texture (`textureHorizontale`, `textureVerticale`, `textureArbre`) ne sont donc pas déclarés et
se lisent en `unknown` — ce qui est *correct* pour ce palier, la forme du catalogue Poly Haven
appartenant à `ui/texturePicker.ts`. Mais la signature d'index accepte aussi les fautes de frappe :
`o.textureHorizontal` compilerait, en `unknown`. La retirer se paierait dans tous les dossiers à la
fois ; c'est un chantier du barreau 3, pas de celui-ci.

### 9.2.12 `export/` — 30 août 2026

**122 → 0. Total du dépôt : 510 → 387.** Treize dossiers protégés ; il ne reste que `ui/` (371),
laissé pour la fin comme le prévoyait §9.2 dès le départ — la couche la plus grosse et la moins
testée, celle où un type mal choisi se paie en doublures de test illisibles.

Rien de méthodologiquement neuf : cinq exportateurs (`pdf/writer.ts`, `resume.ts`, `pdfPlan.ts`,
`svgPlan.ts`, `dossierPdf.ts`) qui ne font que lire des objets du plan et écrire du texte — SVG, DXF
maison, PDF fait main, JSON. Le plus gros fichier de tout le palier 2 (`dossierPdf.ts`, 76 erreurs)
n'a rien demandé de plus que les autres modules de rendu : des tableaux de points, des projections,
des fonctions de mise en page.

Deux types nommés valent d'être notés parce qu'ils expriment un besoin plus étroit que `ObjetPlan` :
`ObjetASurface` (`type`, `pts`, `r`, `width` — c'est tout ce que `surfaceDe` regarde, et les tests
l'appellent déjà sur des objets partiels) et `Projeteur` (`(p: PtBrut) => {x,y}`, la seule chose que
`cotationPolygone`/`anglesPolygone` demandent au plan). Aucun des deux n'a de raison de connaître le
reste de `ObjetPlan`.

**Vérification propre à ce palier.** Les deux PDF sont les artefacts les plus sensibles à un
décalage de mise en page — un point de trop et le texte chevauche la ligne suivante. Comparés avant
et après en comptes structurels (`(...) Tj`, `N 0 obj`, `/Type /Page`) : 143/14/2 pour `plan.pdf`,
106/15/3 pour `dossier.pdf`, identiques au chiffre près.

### 9.2.13 `ui/` — 30 août 2026, dernier palier du barreau 2

**371 → 0. Total du dépôt : 387 → 0.** `--noImplicitAny` est propre sur l'integralite de `src/` :
quatorze dossiers sur quatorze protégés par le cliquet. Le barreau 2 de l'échelle de rigueur (§9.1)
est termine ; le barreau 3 (`noUnusedLocals`, `noUnusedParameters`, `strictNullChecks`…) peut
commencer.

Dix fichiers, du plus petit (`panelTabs.ts`, une erreur) au plus gros (`cadastreDialog.ts`, 104 —
le dialogue d'import cadastral en trois etapes, une seule fonction exportee avec tout un assistant
en fermetures internes).

Deux limites notees a des paliers precedents se referment ici, et c'est la logique meme du
sequencement `render/` → `geo/` → `three/` → `export/` → `ui/` : chaque champ laisse `unknown`
« en attendant le palier qui le lit vraiment » finit par arriver a ce palier-la.

- **Les quatre champs de texture** (`textureVerticale`, `textureHorizontale`, `textureArbre`,
  `clotureTexture`) quittent l'index signature `[autreChamp: string]: unknown` pour
  `TextureAppliquee | null`, maintenant que `ui/texturePicker.ts` — leur seul ecrivain — est type.
  `TextureAppliquee` vit dans `model/types.ts`, pas dans le module qui la produit : meme regle que
  `Mesure` au palier `model/`, `TextureAppliquee` a la valeur seulement en donnee du projet.
- **Le zonage PLU** (`ObjetPlan.plu`) quitte `unknown` pour `ZonagePlu | null`. La famille de sept
  types demenage de `geo/apiIgn.ts` vers `model/types.ts` pour la meme raison — et parce que
  `model/` ne peut pas importer de `geo/` sans creer un cycle (`geo/apiIgn.ts` importe deja
  `PtBrut` depuis `model/types.ts`). `bdtopo` reste `unknown`, deliberement : sa forme varie trop
  d'une couche IGN a l'autre pour un type ecrit a la main (spec §12).
- **`ContexteImportCadastre`**, troisieme cas de ce palier ou un `ctx` partage entre deux fichiers
  est nomme une fois plutot que redefini deux fois : expose par `ui/projectBar.ts` (qui construit
  l'objet et ouvre le dialogue), importe par `ui/cadastreDialog.ts` (qui le recoit).

**Une leçon d'outillage, découverte sur `EtatImportCadastre`.** Les trois méthodes en sucre
syntaxique de son littéral d'objet (`parcellesPropriete(){ return this... }`) restaient signalées
« `this` implicitement `any` » malgré l'annotation `const etatImport: EtatImportCadastre = {...}`.
Ce n'est pas un défaut de l'annotation : TypeScript ne type contextuellement le `this` d'une méthode
de littéral d'objet que sous `noImplicitThis` (famille `strict`, éteinte ici, barreau 1). Sous
`noImplicitAny` seul, il faut un paramètre `this: T` explicite sur chaque méthode — vérifié par un
cas isolé avant d'être applique aux trois. Le barreau 3 fera disparaître le besoin.

**Vérification propre à ce palier — et celle qui compte, les six empreintes n'ouvrant jamais le
réseau.** L'import cadastral complet (adresse → parcelle → parcelles voisines → création de projet)
a été rejoué en direct sur « Place de la Mairie 35000 Rennes », les trois étapes de l'assistant
franchies comme un utilisateur le ferait : même resultat qu'avant le typage du palier — 4 objets,
mêmes hauteurs (16 ; 15,5 ; 13,8 m), même IDU `35238000AC0530`, même zonage PLU (dix clés), aucune
erreur console.

**Post-scriptum, même jour : la dette de `tests/` soldée.** Ce palier avait laissé 22 erreurs
`noImplicitAny` dans `tests/`, hors du périmètre du cliquet (qui ne gate que `src/`), annoncées
comme dette pour le barreau 3. Vingt-deux erreurs, une seule cause : un littéral d'objet assigné à
une variable puis passé à une fonction générique (`normalizeObjects<T extends ObjetBrut>`,
`creerCreation(etat: EtatCreation, ...)`) perd le type contextuel que le même littéral passé en
ligne aurait reçu — `pts: []` s'infère alors en `any[]`. Corrigé par annotation des variables
intermédiaires (`const src: ObjetBrut[] = [...]`) dans cinq fichiers de test, sans toucher `src/` :
aucun impact sur `dist/index.html`, aucune empreinte à recapturer. Le cliquet protège désormais
`tests/` comme bloc supplémentaire ; `--noImplicitAny` est à zéro sur l'intégralité du dépôt.

### 9.2.14 La phase 4 finie — 9 septembre 2026

Pas un palier du cliquet, mais l'evenement qui rendait les suivants possibles : **`src/legacy.ts` a
ete supprime**, et la fermeture `boot()` vit dans `src/app/boot.ts`. Le dernier `@ts-nocheck` du
depot disparait avec lui.

**Le bus d'evenements de §6.3 n'a pas ete construit, et c'est la bonne decision.** §6.3
s'autorisait deja explicitement a ne pas le faire (« Keep that — do not introduce reactivity »).
Ce qui rendait `legacy.ts` insecable n'etait pas le couplage des ~90 appels a `render()` : c'etait
la **portee**. Un bus aurait change l'ordre des effets — le seul invariant que les golden files
surveillent vraiment — et partout a la fois. Deplacer la fermeture dans un module type ne change
ni instruction ni ordre, et donne au compilateur tout ce dont il a besoin.

**Ce que le compilateur a trouve en arrivant sur un fichier que personne n'avait jamais lu :**
38 erreurs de type, 66 parametres implicitement `any`, et — une fois ESLint autorise a le lire,
sa configuration l'excluant nommement — **280 symboles morts** (272 specificateurs d'import,
8 declarations locales).

Une de ces erreurs etait un **bug de production**, pas une remarque de style : le contexte passe a
`importSVGString` citait `filtrerSansParcelle` en abrege d'objet, alors que la fonction avait
quitte ce fichier pour `io/exportProjet.ts` en **phase 2**, sans que l'import soit ajoute.
Construire l'objet levait un `ReferenceError` — avant l'appel, pas pendant — que le `try/catch`
de `app/ecouteurs/fichiers.ts` transformait en bandeau. **L'import SVG etait casse depuis la
phase 2, en silence.** Les golden files ne pouvaient pas le voir : ils n'exercent que des exports.

Le typage a donne la cause et le remede ensemble — `importSVGString` ne lit **aucune** des quatre
proprietes que ce litteral lui passait en trop. Les retirer repare le geste sans rien ajouter.

**Quatre types remis d'aplomb**, tous invisibles tant que le fichier ne compilait pas :
`ProjetResume` et `ProjetMeta` decrivaient la meme ligne de serveur et avaient diverge ;
`serializeMeasures` declarait rendre des `ObjetSerialise[]` ; `renderTerrasseSelector` exigeait
neuf fonctions de contexte pour en lire deux ; cinq litteraux de contexte passaient des proprietes
que leur destinataire ne lit pas.

**Une lecon d'outillage, plus generale que ce projet.** Les 280 symboles morts ne sont pas une
negligence de l'extraction : c'est ce qui arrive quand l'outil qui l'aurait dit est eteint. La
configuration ESLint excluait `src/legacy.ts` nommement, « tant qu'il contient le code d'origine ».
Une exclusion posee « en attendant » survit a ce qu'elle attendait, et ne se signale jamais
elle-meme. Le critere de sortie §14 est desormais **garde par un test** plutot que par une
intention : `tests/unit/echafaudage.test.ts` verifie que `legacy.ts` n'existe plus et qu'aucun
fichier de `src/` ne porte la directive `@ts-nocheck`.

### 9.3 ESLint rules that matter here

- `@typescript-eslint/no-explicit-any`: error in `src/model`, `src/engine`, `src/geometry`; warn elsewhere until Phase 7, then error everywhere.
- `@typescript-eslint/no-non-null-assertion`: error. Forces `el()` instead of `!`.
- `@typescript-eslint/switch-exhaustiveness-check`: error. Guarantees every `PlanObject['type']` and every `BomLine['poste']` is handled — this is where the discriminated union earns its keep.
- `@typescript-eslint/no-floating-promises`: error. There are 28 `async` functions and several fire-and-forget calls (`chargerOrthophoto`, `ensureThreeLoaded`) whose rejections currently vanish.
- `import/no-cycle`: error. Enforces §3.3.
- `no-restricted-imports`: forbid `ui/**`, `render/**`, `three/**` from `engine/**` and `geometry/**`.
- `no-restricted-globals`: forbid bare `history`, `name`, `status`, `location` — the P3 class of trap.

---

### 9.2.15 L'échelle gravie — 20 septembre 2026

Barreaux 3 à 7 franchis en une passe, couche par couche et en parallèle, sous la règle « aucun
changement de comportement » : 1 513 erreurs → 0, `tsconfig.json` porte la configuration cible de
la §9.1. Six empreintes sur six identiques à version inchangée, puis recapturées en `1.1.0-alpha.15`
avec la preuve forte (ancien numéro remis dans les octets frais, anciennes empreintes retrouvées au
bit près). Ce que le typage a révélé sans le corriger — signatures fausses, invariants tenus par
`normalizeObjects` ou `ensureConstruction` et non par les types — est dans
`MIGRATION-JOURNAL.md`, « Phase 7 — l'échelle gravie ». Le cliquet n'a plus de drapeaux : il
reste le rapport par dossier et la garde contre une régression.


## 10. Behaviour-preservation rules

### 10.1 Golden-file testing

For the reference project fixture, the following must be byte-identical before and after every phase:

| Artefact | Producer | Notes |
|---|---|---|
| `plan.svg` | `buildExportSVG` | includes the `data-*` round-trip attributes with the `\u241F` separator (line 3811) |
| `plan.dxf` | `buildExportDXF` | number formatting via `dxfNum` is significant |
| `plan.pdf` | `buildExportPDF` | hand-built PDF; pin the timestamp/ID generator in tests |
| `dossier.pdf` | `buildDossierPDF` | per-page auto-scale selection from `ECHELLES_DOSSIER` |
| `projet.json` | `exportProjetJSON` | key order matters for a byte diff — `serializeObjects` fixes it explicitly |
| `terrasse.glb` | `genererGlb` | compare structurally (node/mesh counts, material names), not byte-wise: three.js exporter output is not deterministic across texture load timing |

Non-determinism to neutralise in tests: `Date.now()`/`new Date()` (used in `horodatageFichier`, generated keys `obj…_1`, `path…_6`, PDF metadata), `Math.random()` if present, and `newObjCounter`. Inject a clock and a key generator into `AppState` in Phase 4 — a small, contained change that makes the whole suite deterministic.

### 10.2 Numerical parity

The terrace engine outputs money and quantities. Tests assert **exact equality** on the reference project, including the artefacts of floating-point accumulation visible in the stored BOM (`qte: 267.49999999999994`, `prixBas: 3.5000000000000004`). Reproducing those values exactly proves the arithmetic order was not changed. Do not "clean up" a formula to remove them — that is a behaviour change disguised as a refactor.

### 10.3 Accepted behaviour changes (the only ones)

| # | Change | Why unavoidable |
|---|---|---|
| A1 | `history` → `undoStack` | Identifier collision with `window.history` becomes silent once modules exist (P3) |
| A2 | Module scope replaces closure scope | Definitional |
| A3 | Duplicate three.js disposal paths merged into `SceneBundle.dispose()` | Three near-identical copies cannot be typed once without merging; verified equivalent by inspection |
| A4 | Fire-and-forget promises get `.catch(reportError)` | Required by `no-floating-promises`; changes only the failure path, from silent to logged |

Anything else discovered — including genuine bugs — goes to an issue list and is fixed **after** the migration, on the TypeScript codebase, where the fix is safe and reviewable.

---

## 11. Test strategy

### 11.1 Unit (Vitest, no DOM) — the bulk of the value

- `geometry/**`: area/centroid sign conventions, `pointInPolygon` on boundary, `polygonOffset` on concave rings, `clipPolygonByConvex`, Catmull-Rom `pathD` continuity, ring merge (`fusionnerAnneaux`) on shared-edge parcels.
- `engine/structure.ts`: `porteeVisM`/`porteeAppuiM`/`porteeVisSpaM` against NF DTU 51.4 reference cases; `maxEntraxeLameCm` per essence via `LAME_RAIDEUR`; `evaluerStructure` warning thresholds (`PLOT_ENTRAXE_MAX_M`, `PLOT_HAUTEUR_DTU_CM`, `PLOT_ASSISE_MIN_CM2`).
- `engine/bom.ts`, `engine/debit.ts`: full BOM for both reference terraces; `optimiserDebitLames` cut plan and waste; behaviour of `chuteMinReutilisable` and `jointsSurAppui`.
- `engine/parasol.ts`: `positionSoleil` against published solar positions for Le Vésinet (48.8923 N, 2.1331 E) at solstices/equinoxes, ±0.5°; `ombreInstantanee` polygon; determinism of `chercherMeilleurePositionParasol`.
- `geo/projection.ts`: `projecteurLocal` round-trip lon/lat → ENU → lon/lat under 1 cm over a 200 m extent.
- `export/pdf/writer.ts`: `pdfEscape` on parentheses/backslashes/accents; `assemblerPDF` xref offsets.
- `model/normalize.ts`, `model/serialize.ts`: round-trip `normalize(serialize(x)) === normalize(x)`; array-length invariants; deep-clone isolation (the `cadastre`/`plu`/`bdtopo` clone at lines 1233–1241 exists to stop undo snapshots aliasing live data — test it).

### 11.2 Integration (jsdom)

- Undo: add object → undo → restores; delete measure → undo → measure returns (the documented reason `snapshotState` serialises measures too).
- Dirty tracking: every `mutate()` path sets dirty; save clears it.
- Project JSON: export → import → identical `objects`/`measures`; `filtrerSansParcelle` removes the parcel, its dependent measures, and the attached fence.
- SVG round-trip: export → `importSVGString` → names, attributes and geometry preserved.
- `loadInitialProject` decision table: no id + API down → demo; known id + API down → error surfaced, **not** demo.

### 11.3 Manual smoke checklist (per phase)

Pointer interactions, three.js and PDF rendering are not automated. Fixed 25-item list, run before every phase merge: drag vertex / drag edge / drag body / double-click edge to add point / double-click corner to freeze / pinch zoom / 3-finger pan / rectangle constraint / undo × 5 / parasol shadow at two dates / measure creation with 2 targets / rotation alignment / cadastre import by address / neighbourhood toggle / orthophoto toggle + opacity / PLU query / terrace config change → BOM updates / débit tables / coupe / implantation / chantier / 3D view + sun slider + fence / save viewpoint + recall / GLB export + reopen in viewer / PDF dossier with 2 terraces.

---

## 12. Risk register

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Phase 4 (closure → `AppState`) touches everything at once and becomes an unmergeable branch | H | H | Strict ordering `state → history → render → interaction`; ≤ 400 changed lines per PR; `legacy.ts` keeps compiling throughout by importing the new modules back |
| R2 | Silent behaviour drift in the terrace engine | M | H | Exact-equality golden tests including float artefacts (§10.2); engine extracted early (Phase 3) while the rest is still legacy |
| R3 | Data/view split (P2) breaks rendering in non-obvious ways (stacking order, handle z-order, `amenerPoigneesDevant`) | M | H | Extract `ViewMap` first with objects still carrying their old fields as deprecated aliases; remove the aliases only once the smoke checklist passes twice |
| R4 | `strictNullChecks` produces 800+ errors at once | H | M | Ratchet (§9.2); `el()` helper lands before the flag |
| R5 | three.js r128 typings mismatch `examples/js` runtime | M | M | Option A pins `@types/three@0.128`; the three classes used are API-identical between `js` and `jsm` at r128; verified by the GLB round-trip test |
| R6 | Single-file build regresses (inlining fails, asset URL rewritten, size explodes) | M | H | Build-size budget in CI (fail above 1.2 MB); deploy-and-smoke on a staging copy of `api.php` every phase |
| R7 | External API drift during the migration window (IGN/Géoportail/BAN/Poly Haven) confounds regression testing | M | M | Record HTTP fixtures in Phase 0; all tests run against fixtures, never live endpoints |
| R8 | French/English identifier mixing invites opportunistic renaming | M | M | Explicit non-objective (§1.2); lint rule cannot enforce it, so it goes in the PR template checklist |
| R9 | Scope creep into "while we're here" fixes | H | M | §10.3 is the closed list; everything else is an issue |

---

## 13. Effort estimate

Assumes one developer familiar with the codebase, working with the golden-file harness in place.

| Phase | Content | Estimate |
|---|---|---|
| 0 | Golden fixtures, HTTP fixtures, `history` rename, repo init | 3 d |
| 1 | Vite + TS scaffolding, single-file build, `legacy.ts` | 2 d |
| 2 | Pure leaves (~1 800 lines) + tests | 6 d |
| 3 | Engine (~1 900 lines) + tests | 8 d |
| 4 | Model split + `AppState` + render/interaction (~2 600 lines) | 12 d |
| 5 | UI panels (~3 200 lines) | 10 d |
| 6 | 3D + export (~2 700 lines) | 9 d |
| 7 | Strictness ratchet, cleanup, docs | 4 d |
| | **Total** | **~54 working days** |

Add 20 % contingency for R1/R3. A two-developer split is viable from Phase 3 (engine ‖ render), and from Phase 5 (UI ‖ 3D), provided §3.3 boundaries hold.

---

## 14. Definition of done

**Atteinte le 21 septembre 2026, version `1.1.0`** — voir `MIGRATION-JOURNAL.md`, « La migration est terminée ».

- [x] `tsc --noEmit` clean under the §9.1 configuration. — **20 septembre 2026** (§9.2.15) : `tsconfig.json` est la configuration cible, 0 erreur.
- [x] `eslint` clean under the §9.3 ruleset. — 20 septembre 2026, `npm run lint` a zero sur `src/` et `tests/`.
- [x] Vitest green; `src/engine/**` and `src/geometry/**` ≥ 80 % line coverage. — 535 tests verts ; 91,5 % sur le moteur (phase 3).
- [x] All §11.1 golden artefacts byte-identical (GLB structurally identical). — Les six artefacts texte et PDF le sont a chaque palier (`tests/fixtures/golden/EMPREINTES.md`) ; GLB reverifie le 20 septembre 2026 en `1.1.0-alpha.16` : huit compteurs identiques a `glb-structure.json`.
- [x] Manual smoke checklist (§11.3) fully passed on the built single file. — **20 septembre 2026**, 25/25 sur `dist/index.html` en `1.1.0-alpha.16` (`tests/CHECKLIST-FUMEE.md`, journal des passages).
- [x] `dist/index.html` deployed alongside the unmodified `api.php`; list / load / save / delete all work; an existing production project opens, edits, saves and reloads unchanged. — 20 septembre 2026, PHP 8.3 en local : les quatre actions, un projet de production ouvert, duplique, enregistre (24 → 25 objets) et recharge identique, creation puis suppression d'un projet avec `.bak`.
- [x] Bundle within budget (≤ 1.2 MB, versus ~773 KB today). — 450 556 octets en `1.1.0-alpha.16`.
- [x] `legacy.ts` deleted; no `@ts-nocheck` remains. — **9 septembre 2026** (§9.2.14). La fermeture vit dans `src/app/boot.ts` ; `tests/unit/echafaudage.test.ts` garde les deux moities de cette affirmation.
- [x] `docs/architecture.md` records the module map and the §3.3 dependency rules. — `MD/architecture.md` §5.2.2, 20 septembre 2026.
- [x] Issue list of defects found-but-not-fixed is filed and triaged. — `MD/DEFAUTS.md`, treize entrees en trois priorites, 20 septembre 2026.

---

## 15. Follow-on scope (out of this document)

This specification covers the TypeScript migration only, ending at version `1.1.0` with no behaviour change. Three further workstreams are specified separately and depend on it:

| Document | Content | Releases |
|---|---|---|
| `RELEASE.md` | Versioning policy (application / project schema / API), increment rules, changelog, release checklist, rollback, stale-client detection | all |
| `spec-plateforme-multitenant.md` | Multi-tenancy and isolation, authentication with TOTP MFA, feature catalog and entitlements, tenant branding | `2.0.0` – `2.3.0` |

Two dependencies run backwards into this document and should be honoured during the migration, at no extra cost:

1. **`§5.4` project envelope** — reserve `meta.schemaVersion`, `meta.appVersion` and `meta.tenantId` in `ProjectMeta` now, and stamp the first two from Phase 4 onwards. Adding them later means another schema migration for no reason.
2. **`§7` DOM/theme conventions** — the hard-coded SVG colour constants at legacy lines 1209–1216 (`SVG_INK`, `SVG_GRID_MAJOR`, …) are evaluated once at boot and duplicate the CSS custom properties. When `render/svg.ts` is extracted in Phase 4, read them from `getComputedStyle(document.documentElement)` into a `ThemeTokens` object instead of inlining the hex literals. That single change is the precondition for tenant branding reaching the plan, and it costs nothing while the file is already being touched.

Neither changes behaviour: the resolved colours are identical, and the reserved metadata fields are additive.
