# Release and versioning policy — Plan interactif

**Applies to:** the `plan-interactif` application (single-file client), `api` (backend), and the project-file format.
**Status:** proposal for review
**Companion documents:** `spec-migration-typescript.md`, `spec-plateforme-multitenant.md`

---

## 1. Why three version numbers, not one

The product ships one artefact but has three independent compatibility contracts. Collapsing them into a single number means either bumping MAJOR for changes nobody notices, or shipping breaking changes under a PATCH.

| Stream | Identifier | Contract it protects | Lives in |
|---|---|---|---|
| **Application** | `APP_VERSION` — `MAJOR.MINOR.PATCH` | What the user sees and does | `package.json` |
| **Project schema** | `SCHEMA_VERSION` — integer, monotonic | The persisted project JSON (`objects`, `measures`, `construction`, `meta`) | `src/model/schema.ts` |
| **API** | `API_VERSION` — `v1`, `v2` in the URL path | The HTTP contract between client and backend | route prefix |

They move at different speeds. A typical year: ~30 app releases, 3–4 schema bumps, 0–1 API version.

A fourth identifier, the **build id** (`git describe` + short SHA + ISO build timestamp), is not a version — it identifies an artefact, not a contract. It appears in the UI and in bug reports.

---

## 2. Application version — SemVer 2.0

### 2.1 Increment rules

The public surface of this application is: the UI, the exported artefacts (SVG / DXF / PDF / dossier PDF / GLB / project JSON), the computed quantities, and the API contract.

| Change | Bump | Example from this codebase |
|---|---|---|
| A computed quantity changes value for unchanged inputs | **MAJOR** | Correcting `porteeVisM` or `maxEntraxeLameCm`; changing rounding in `computeBOM`. A user has already sent a supplier a BOM produced by the old version. |
| A field is removed from, or made mandatory in, the project JSON | **MAJOR** | Dropping `construction.bom` from the persisted payload |
| An export format changes such that a downstream tool breaks | **MAJOR** | Restructuring the DXF entity table; changing the PDF page-size rule |
| Authentication or tenancy becomes required | **MAJOR** | The 2.0.0 release (`spec-plateforme-multitenant.md`) |
| A feature is removed or moved behind an entitlement it was not behind before | **MAJOR** | Putting `view.3d` behind a paid tier for existing tenants |
| New feature, new panel, new export, new entitlement key | **MINOR** | Adding a BOM `poste`; adding `export.ifc`; adding a construction parameter with a default |
| New optional field in the project JSON, old files still load | **MINOR** | Adding `construction.plotMarque` |
| Bug fix with **no** change to computed values or exported bytes | **PATCH** | Fixing a panel that fails to refresh; fixing a French label; fixing a crash on empty selection |
| Performance, refactor, dependency bump, typing | **PATCH** | Every phase of the TypeScript migration |
| Branding, theme tokens, tenant configuration | **PATCH** | New brandable token — unless the default palette changes, which is MINOR |

**The load-bearing rule:** *any diff in the golden-file fixtures (`tests/fixtures/golden/`) that is not explained by an intended feature is a MAJOR change, not a bug fix.* If a "fix" moves a number in the BOM, users who quoted from the previous output need to know.

### 2.2 Pre-release and channel identifiers

```
1.1.0-alpha.3      migration phase in progress, internal only
1.1.0-rc.1         feature-complete, on staging, smoke checklist passed once
1.1.0              production
```

Order: `1.1.0-alpha.3 < 1.1.0-beta.1 < 1.1.0-rc.1 < 1.1.0`.

### 2.3 Planned baseline

| Version | Content | Gate |
|---|---|---|
| `1.0.0` | The current single-file `plan_interactif.html`, frozen and tagged as-is | Golden fixtures captured (Phase 0) — ✅ 28/08/2026 |
| `1.0.x-alpha.N` | TypeScript migration phases 1–6, one prerelease per merged phase | Golden fixtures byte-identical — ✅ `alpha.1` … `alpha.47` |
| `1.1.0-alpha.N` | The **built** file ships in place of the single-page original. Phase 7 in progress | Golden fixtures identical *up to the version string*, and that proved before recapture — ✅ 29/08/2026 |
| `1.1.0` | Migration complete. **No behaviour change** — hence MINOR, not MAJOR | Definition of done, `spec-migration-typescript.md` §14 |
| `2.0.0` | Authentication + MFA + multi-tenancy. Breaking: anonymous access ends, storage moves to the database | Cross-tenant isolation tests green |
| `2.1.0` | Feature catalog and entitlements | Server-side enforcement tests green |
| `2.2.0` | Tenant branding | Contrast and sanitisation tests green |

---

## 3. Project schema version

### 3.1 Rules

`SCHEMA_VERSION` is an integer stamped into every saved project as `meta.schemaVersion`. It increments by exactly 1 whenever the persisted shape changes in any way — additive or not.

```ts
export const SCHEMA_VERSION = 4;

export interface ProjectMeta {
  schemaVersion: number;
  appVersion: string;      // APP_VERSION that last wrote the file
  writtenAt: string;       // ISO 8601
  tenantId: TenantId;      // from 2.0.0
}
```

### 3.2 Compatibility contract

| Situation | Behaviour |
|---|---|
| `file.schemaVersion < SCHEMA_VERSION` | Run the migration chain `migrate[n]` for each step, in order, then load. Silent — no user prompt. |
| `file.schemaVersion === SCHEMA_VERSION` | Load directly |
| `file.schemaVersion > SCHEMA_VERSION` | **Refuse to load.** Show: "Ce projet a été enregistré par une version plus récente de l'application (schéma N). Rechargez la page pour obtenir la dernière version." Never attempt a best-effort load — a partial parse that silently drops fields, then saves, destroys data. |
| Field absent (legacy files with no `meta`) | Treated as `schemaVersion: 1` |

### 3.3 Migration chain

```
src/model/migrations/
├─ index.ts        // MIGRATIONS: Record<number, (p: unknown) => unknown>
├─ 1-to-2.ts       // adds construction.plotSurfaceAssise, default 300
├─ 2-to-3.ts       // renames …
└─ 3-to-4.ts       // adds meta.tenantId
```

Rules:
- A migration is **pure**, takes and returns plain JSON, never touches the DOM or the network.
- A migration is **never edited after release** — a mistake in `2-to-3` is fixed by adding `4-to-5`, not by rewriting history. Files already migrated in the field cannot be un-migrated.
- Every migration ships with a fixture: a real project file at version N, and the expected version N+1 output.
- Down-migration is not supported and will not be added. Restoring an older version means restoring a backup.

### 3.4 The existing `normalizeObjects` / `validerProjetJSON` pair

`normalizeObjects()` (line 1222 of the legacy file) already performs implicit forward-migration by defaulting missing `vertexNames`, `segmentNames`, `frozenVertices`. `validerProjetJSON()` (line 5715) already gates imports. Both stay, but their roles separate:

- `validerProjetJSON` → **is this a project file at all?** (structure, size limit, types)
- `MIGRATIONS` → **bring it to the current schema** (explicit, versioned, tested)
- `normalizeObjects` → **make it usable in memory** (clone, defaults, invariants) — and stops silently absorbing schema drift.

---

## 4. API version

`v1` is the current `api.php` contract. It moves to `/api/v1/…` at 2.0.0 with authentication added — the addition of a required session is a breaking change to the *client*, but the route shapes are unchanged, so it stays `v1`.

A new `v2` prefix is only created when a route's request or response shape changes incompatibly. Both versions then run in parallel for a minimum of **90 days**, with `v1` returning a `Deprecation` and `Sunset` header (RFC 8594).

Additive changes (a new optional response field, a new endpoint) never bump the API version.

---

## 5. Version at runtime

### 5.1 Build-time injection

```ts
// vite.config.ts
define: {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILD_SHA__: JSON.stringify(execSync('git rev-parse --short HEAD').toString().trim()),
  __BUILD_AT__: JSON.stringify(new Date().toISOString()),
  __SCHEMA_VERSION__: String(SCHEMA_VERSION),
}
```

A release build **fails** if the working tree is dirty or the tag does not match `package.json`.

### 5.2 Where the version appears

| Surface | Form | Why |
|---|---|---|
| Project bar, right-hand side | `v1.2.0` — tooltip shows `1.2.0 · a3f91c2 · 2026-09-14T08:12Z` | The first thing to ask in a bug report |
| Every request | `X-App-Version: 1.2.0` header | Lets the server detect stale clients |
| Saved project | `meta.appVersion`, `meta.schemaVersion` | Explains a file that behaves oddly two years later |
| Exported PDF | Footer: `Plan interactif 1.2.0 — 14/09/2026` | The PDF is the artefact that ends up in a contractor's hands |
| Exported SVG / DXF / JSON | Comment or metadata field | Same reason |
| GLB | `asset.generator` | Standard glTF field, costs nothing |

Golden-file tests pin the version to a fixed value so a release does not appear as a diff in every fixture.

### 5.3 Stale-client detection

The single-file deployment means a user can keep a tab open for weeks across several releases.

- `GET /api/v1/session` returns `{ minClientVersion, currentVersion }`.
- If `APP_VERSION < minClientVersion`: block writes, show a blocking banner — "Une nouvelle version est disponible. Rechargez la page pour continuer à enregistrer." A stale client writing an old schema over a migrated project is the failure this prevents.
- If `APP_VERSION < currentVersion` but `≥ minClientVersion`: non-blocking, dismissible banner.
- Save requests carrying `X-App-Version` below `minClientVersion` are rejected with `409` and a machine-readable body. The client-side check is convenience; **this** is the guarantee.

---

## 6. Changelog

`CHANGELOG.md`, Keep a Changelog 1.1 format, French user-facing wording (the UI is French), one section per version, newest first.

```markdown
## [1.2.0] — 2026-09-14

### Ajouté
- Export IFC des terrasses (`export.ifc`, offre Pro)

### Modifié
- Le calcul du débit privilégie désormais les chutes réutilisables ≥ 50 cm

### Corrigé
- Le panneau PLU restait vide après un changement de parcelle

### Schéma projet
- Version 4 → 5 : ajout de `construction.plotMarque` (optionnel, défaut `""`)
```

An entry is mandatory for MAJOR and MINOR. PATCH releases that are purely internal (refactor, typing, dependency bump) go under an `### Interne` heading or are omitted — the changelog is for users, not for the commit log.

**Rule:** the PR that changes behaviour also writes its changelog entry. Generating the changelog from commit messages at release time is not sufficient here, because the interesting entries ("the débit calculation now prefers…") are never legible in a commit subject.

---

## 7. Conventional commits → automatic bump proposal

```
feat(terrasse): ajout du modèle de plot Jouplast
fix(plu): panneau vide après changement de parcelle
perf(render): moins de reflows au drag
refactor(engine): extraction de computeBOM
chore(deps): vite 5.4.2
feat(export)!: nouvelle structure des entités DXF
```

| Prefix | Proposed bump |
|---|---|
| `feat` | MINOR |
| `fix`, `perf`, `refactor`, `chore`, `docs`, `test`, `style` | PATCH |
| `!` suffix or `BREAKING CHANGE:` footer | MAJOR |

The tool **proposes**; a human confirms. The rule in §2.1 (a golden-fixture diff is MAJOR) cannot be derived from a commit message, so the release manager checks the fixture diff before accepting the bump.

CI enforces: commit message format, and that a `feat` or breaking change carries a `CHANGELOG.md` diff.

---

## 8. Release process

### 8.1 Branches

- `main` — always releasable, protected, linear history.
- `release/x.y` — cut only when a hotfix must ship without the `main` head. Deleted after the backport.
- Feature branches merge by squash.

### 8.2 Checklist

```
[ ] main green: tsc, eslint, vitest, golden fixtures
[ ] Bump proposed by tooling, confirmed by release manager
[ ] Golden-fixture diff reviewed — any unexplained diff blocks the release
[ ] Schema bump? migration written + fixture at N and N+1 + round-trip test
[ ] CHANGELOG.md section written in French, dated
[ ] package.json version bumped, committed, tagged vX.Y.Z (annotated, signed)
[ ] Release build (clean tree, tag == package.json), size within budget (≤ 1.2 MB)
[ ] Deployed to staging next to a copy of production data
[ ] Manual smoke checklist (25 items) passed on staging
[ ] Multi-tenant releases: cross-tenant isolation suite green on staging
[ ] minClientVersion updated in server config if this release is mandatory
[ ] Deployed to production
[ ] Post-deploy: open an existing production project, edit, save, reload
[ ] GitHub release published with the changelog section
```

### 8.3 Cadence

- **PATCH**: on demand.
- **MINOR**: every 2–4 weeks, Tuesday–Thursday, never Friday.
- **MAJOR**: announced to tenant admins ≥ 14 days ahead, with the breaking changes listed and, where a schema migration is involved, an offer to export a backup first.

### 8.4 Rollback

The client is a single static file: rollback is republishing the previous `index.html`. Two constraints:

1. **A schema migration is not reversible.** Once a project is saved at schema N+1, the previous client refuses it (§3.2). Rolling back the client across a schema bump therefore requires restoring the project database from the pre-release backup — which the release checklist takes automatically for any release carrying a schema bump.
2. `minClientVersion` must be lowered in the same operation, or the rolled-back client blocks itself.

For this reason: **never ship a schema bump and a risky feature in the same release.** A schema bump goes out alone, in a release whose only job is to migrate.

---

## 9. Support window

| Stream | Supported |
|---|---|
| Application | Latest MINOR of the current MAJOR, plus the last MINOR of the previous MAJOR for 90 days |
| API | Current version, plus the previous for 90 days after its `Sunset` header appears |
| Project schema | **All versions, forever.** The migration chain is never truncated. A project file from 2026 must open in 2032. |
