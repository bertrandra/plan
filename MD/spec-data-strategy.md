# Data strategy — Plan interactif

**Scope:** storage model, performance envelope, flexibility mechanisms, and evolution path for releases `1.1.0` → `2.3.0` and beyond.
**Companions:** `spec-migration-typescript.md`, `spec-plateforme-multitenant.md`, `RELEASE.md`
**Engine:** PostgreSQL 15+ (the strategy assumes `jsonb`, RLS, generated columns, lz4 TOAST compression, declarative partitioning)

---

## 1. The one rule

> **Anything you query, join, sort, authorise on, count, or audit gets a column.
> The plan itself stays an opaque document.**

Every decision below follows from that sentence. When a new requirement arrives, the question is never "relational or JSON?" — it is "will this be *queried*?" If yes, it becomes a column, through the promotion path in §6.2. If no, it stays in the document and costs nothing.

The corollary matters as much: **the document is always complete and self-sufficient.** Columns are *derived duplicates* of what the document already contains, never the sole home of a fact. That asymmetry is what makes the design safe to evolve — a promotion that turns out to be wrong is reversible by dropping a column, because nothing was ever moved *out* of the document.

---

## 2. Storage tiers

Five tiers, each holding what it is good at.

| Tier | Technology | Holds | Why here |
|---|---|---|---|
| **T1 — Relational core** | Postgres tables | tenants, users, memberships, sessions, MFA credentials, recovery codes, features, tenant_features, quotas, project envelopes, version envelopes, asset metadata | Constraints, foreign keys, transactions, indexes, RLS. Everything authorisation depends on. |
| **T2 — Document payload** | `jsonb` columns | `projects.data` (objects, measures, meta), `tenant_branding.tokens_*`, `audit_events.metadata` | Shape changes with the product; never filtered on; read and written whole. |
| **T3 — Derived / projection** | `jsonb` `summary` column +, later, projection tables | counts, surfaces, BOM totals, commune, essence used | Serves lists and reporting without detoasting the payload. Rebuildable from T2 at any time. |
| **T4 — Binary assets** | Object storage (S3 / MinIO), metadata row in T1 | tenant logos, favicons, and later server-generated GLB/PDF artefacts | Streaming, CDN, lifecycle rules, backups that don't bloat the database. Never `bytea`. |
| **T5 — Ephemeral cache** | Redis or in-process LRU | resolved feature sets, branding payloads, session lookups, quota counters | Rebuildable, no durability requirement, keeps the hot path off the primary. |

Deliberately **not** a tier: orthophoto tiles. They already live in a client-side `Map` cache (`orthoCache`, legacy line 7546) and are re-fetchable from IGN. Caching third-party raster tiles in your own database buys nothing and grows without bound. If server-side proxying becomes necessary (rate limits, offline), it goes to T4 with a TTL, not to Postgres.

---

## 3. Sizing model — measured, not guessed

From the reference project (`Parcelle AE 101`, 12 objects, 2 terraces, full cadastre + PLU + BOM):

| Metric | Value |
|---|---|
| Project payload, raw JSON | **40.3 KB** |
| Same, gzip | **6.1 KB** |
| `construction` block, per terrace | ~1.9 KB |
| `cadastre` block, per parcel | ~0.6 KB (excl. `geometrieSource`) |
| `plu` block, per parcel | ~2.5 KB |

**The size driver is the neighbourhood import, not the plan.** `construireVoisinage` can pull up to `MAX_VOISINES = 20` parcels, each with its own `cadastre.geometrieSource`, plus BD TOPO buildings, vegetation zones, hedges, and up to `MAX_ARBRES_ESTIMES = 60` estimated trees. A dense suburban plan with the full neighbourhood imported lands at **300–800 KB**.

Planning envelope:

| Percentile | Payload | Note |
|---|---|---|
| p50 | 40 KB | typical single-parcel plan |
| p90 | 150 KB | a few neighbours, several terraces |
| p99 | 600 KB | full neighbourhood import |
| Hard cap | **4 MB** | rejected at the API with a clear French message; the client already caps JSON *import* at `IMPORT_JSON_TAILLE_MAX = 5 MB` — align the two |

Capacity at 1 000 tenants × 30 projects × 20 retained versions:

```
live projects   30 000 × 40 KB  ≈ 1.2 GB
versions       600 000 × 40 KB  ≈ 24 GB raw
after TOAST lz4 (~6× on this JSON)  ≈ 4–5 GB total
```

A single modest Postgres instance, comfortably. **No sharding, no partitioning of `projects`, no separate document store is justified at this scale** — and the design below keeps all three available later without a rewrite.

---

## 4. Schema

### 4.1 Project envelope

```sql
create table projects (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  data            jsonb not null,                 -- T2: { objects, measures, meta }
  summary         jsonb not null default '{}',    -- T3: computed by the app on save
  schema_version  int  not null,
  row_version     int  not null default 1,        -- optimistic concurrency
  size_bytes      int  not null,                  -- octet_length(data::text) at write
  parcelle_idu    text,                           -- promoted: cadastral identifier
  commune_insee   text,                           -- promoted: INSEE code
  footprint       geography(Polygon, 4326),       -- promoted: parcel outline
  created_by      uuid references users(id),
  updated_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint data_size_cap check (octet_length(data::text) <= 4 * 1024 * 1024)
);

-- the list query, and only the list query
create index projects_list_idx
  on projects (tenant_id, updated_at desc)
  where deleted_at is null;

-- ad-hoc containment queries inside the document (reporting, support)
create index projects_data_gin on projects using gin (data jsonb_path_ops);

-- spatial: "projects near this point", parcel de-duplication
create index projects_footprint_idx on projects using gist (footprint);

create index projects_parcelle_idx on projects (parcelle_idu) where parcelle_idu is not null;
```

`summary`, written by the application on every save (it already computes all of it):

```jsonc
{
  "nbObjets": 12,
  "nbTerrasses": 2,
  "surfaceTerrasseM2": 46.7,
  "surfaceParcelleM2": 716,
  "bomTotalEur": 4697.08,
  "essences": ["pin-classe4"],
  "commune": "Le Vésinet",
  "aOrthophoto": true,
  "aPlu": true,
  "aVoisinage": true
}
```

**Why the app computes `summary` rather than a Postgres generated column:** generated columns require immutable expressions, and reaching into a JSON array to sum terrace surfaces is not expressible that way without a custom immutable function. The client already has the numbers in memory at save time. Sending them costs nothing and keeps the logic in the tested TypeScript engine rather than duplicated in SQL.

### 4.2 Version history

```sql
create table project_versions (
  project_id  uuid not null references projects(id) on delete cascade,
  version     int  not null,
  data        jsonb not null,
  summary     jsonb not null default '{}',
  schema_version int not null,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  note        text,
  primary key (project_id, version)
);
create index on project_versions (created_at);
```

Written in the **same transaction** as the project update. At ~7 KB compressed per save this is the cheapest insurance in the whole system: it is what makes the rollback procedure in `RELEASE.md` §8.4 real, and it turns "the client corrupted my plan" from an incident into a support click.

Retention (nightly job): keep **every** version for 30 days; then one per day for 90 days; then one per month for 3 years; always keep the first and the current.

### 4.3 Quota counters

Never derive quota from `count(*)` over `audit_events` — that query gets slower exactly as a tenant becomes valuable.

```sql
create table tenant_usage (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  feature_key text not null references features(key),
  period      date not null,                     -- first day of the month
  used        integer not null default 0,
  primary key (tenant_id, feature_key, period)
);

-- consumeQuota(), one statement, race-free
insert into tenant_usage (tenant_id, feature_key, period, used)
values ($1, $2, date_trunc('month', now())::date, 1)
on conflict (tenant_id, feature_key, period)
do update set used = tenant_usage.used + 1
returning used;
```

### 4.4 Audit, partitioned from day one

```sql
create table audit_events (
  id bigserial, tenant_id uuid, actor_id uuid, action text not null,
  target text, metadata jsonb not null default '{}',
  ip inet, user_agent text, at timestamptz not null default now()
) partition by range (at);

create table audit_events_2026_09 partition of audit_events
  for values from ('2026-09-01') to ('2026-10-01');
```

Monthly partitions created by a scheduled job three months ahead. Detaching a partition is how you archive; deleting rows from a 200 M-row table is how you have a bad afternoon. Partitioning costs nothing to set up now and cannot be retrofitted cheaply.

### 4.5 Assets

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('logo_light','logo_dark','favicon')),
  storage_key text not null,          -- object-storage path
  content_type text not null, bytes int not null,
  width int, height int, checksum_sha256 text not null,
  created_by uuid, created_at timestamptz not null default now()
);
```

Bytes in T4. The database stores the pointer and the checksum, so an integrity check is a query, not a bucket crawl.

---

## 5. Performance strategy

### 5.1 The single most important mechanism: TOAST

Postgres moves values above ~2 KB out of the main heap into a TOAST table, compressed. Every `projects.data` is therefore stored **out-of-line**, and — this is the point — **a query that does not name the `data` column never reads it.**

```sql
-- ~1 ms, touches only the index and the heap tuple
select id, name, summary, updated_at, row_version
from projects
where tenant_id = $1 and deleted_at is null
order by updated_at desc limit 50;
```

The project list stays fast whether payloads are 40 KB or 4 MB. Which produces the hardest rule in this document:

> **Never `select *` on `projects`. Ever.**
>
> An ORM configured to hydrate whole entities will pull every payload into every list query and turn a 1 ms page into a 2 s page under load. Enforce explicit column selection in the repository layer, and add a lint rule or a query-log assertion in CI that fails if `data` is selected without a single-row predicate.

Configure `default_toast_compression = lz4` (PG14+). On this JSON it compresses ~6× at roughly 4× the decompression speed of the legacy pglz.

### 5.2 Read paths, with targets

| # | Path | Frequency | Query | Target (p95, server) |
|---|---|---|---|---|
| R1 | Project list | every navigation | `projects_list_idx`, no `data` | **< 10 ms** |
| R2 | Load project | per open | PK + detoast + transfer | **< 40 ms** + transfer |
| R3 | Session bootstrap (user, tenant, role, features, branding) | **every page load** | 3-way join, then T5 cache | **< 20 ms**, < 2 ms cached |
| R4 | Admin user list | rare | `memberships` by tenant | < 20 ms |
| R5 | Audit query | rare | partition pruning by date | < 200 ms |
| R6 | Quota check | per gated call | `tenant_usage` PK | < 2 ms |
| R7 | Version list | rare | `project_versions`, **no `data`** | < 10 ms |

R3 is the one to watch — it is on the critical path of every page load, and it fans out across four tables. Resolve it once and cache in T5 under `session:{sessionId}`, invalidated on: entitlement change, role change, branding update, session revocation. Cache the *resolved* feature set, never the raw catalog rows.

### 5.3 Transport, not storage, is the bottleneck for R2

40 KB gzips to 6 KB; a p99 600 KB plan gzips to ~60 KB. Enable brotli at the edge (~15 % better than gzip on this JSON).

**ETag on project load.** `ETag: W/"<row_version>"`; the client sends `If-None-Match`. A user who leaves a tab open all afternoon, or reopens the same plan repeatedly, gets `304 Not Modified` at near-zero cost. `row_version` is already the exact right validator — it increments on every write and on nothing else.

### 5.4 Write path

One transaction per save:

```sql
begin;
  update projects
     set data = $data, summary = $summary, name = $name,
         schema_version = $schema, size_bytes = octet_length($data::text),
         parcelle_idu = $idu, commune_insee = $insee, footprint = $footprint,
         row_version = row_version + 1, updated_by = $user, updated_at = now()
   where id = $id and tenant_id = current_setting('app.tenant_id')::uuid
     and row_version = $expected;
  -- 0 rows → 409 Conflict, the client warns instead of overwriting
  insert into project_versions (project_id, version, data, summary, schema_version, created_by)
       values ($id, $newVersion, $data, $summary, $schema, $user);
commit;
```

**Autosave policy.** The app currently saves on an explicit click and tracks `dirty`. If autosave is added, debounce to **≥ 20 s of idle, and only when dirty** — a save is a 40 KB write plus a 40 KB version insert, and an autosave on every vertex drag would multiply history volume by three orders of magnitude for no user benefit. Explicit save must remain, because "I saved before closing" is a promise users rely on.

**Idempotency.** Save requests carry a client-generated `Idempotency-Key`; a repeat within 60 s returns the original result rather than creating a duplicate version. This matters on flaky mobile connections, where the client cannot tell a lost response from a lost request.

### 5.5 Pooling, RLS and prepared statements

RLS uses `current_setting('app.tenant_id')`. Set it **per transaction**, not per session:

```sql
set local app.tenant_id = $1;
```

`SET LOCAL` is transaction-scoped and therefore compatible with PgBouncer in **transaction pooling** mode. A plain `SET` is session-scoped and will leak one tenant's scope into another tenant's request under a shared pooled connection — the exact catastrophe RLS exists to prevent.

Ensure every index on a tenant-scoped table **leads with `tenant_id`**, so the RLS predicate is index-supported rather than a filter applied after a scan.

### 5.6 What not to optimise

Explicitly rejected as premature at this scale, with the trigger that would change the answer:

| Not doing | Would reconsider when |
|---|---|
| Partitioning `projects` | > 5 M rows, or per-tenant data residency |
| Read replicas | R1/R3 p95 sustained > 50 ms, or reporting competing with the OLTP path |
| Separate document store (Mongo, S3-as-database) | Payloads routinely > 10 MB — which would first mean capping the neighbourhood import |
| Storing diffs instead of full versions | Version storage > 100 GB; the compressed full copy is simpler and restores in one step |
| Materialised views for reporting | `summary` stops answering a real question |
| Server-side rendering of the plan | Never, for this product |

---

## 6. Flexibility

### 6.1 Where change is cheap, by design

| Change | Cost |
|---|---|
| Add a `construction` parameter | JSON schema migration (`RELEASE.md` §3.3). No DDL. |
| Add a BOM `poste` | None — `bom` is an array in the document; the engine's union type is updated |
| Add an object type or `fonction` | None in storage; a discriminated-union arm in TypeScript |
| Add a feature to the catalog | One `INSERT` into `features` + a regenerated `FeatureKey` union |
| Add a brandable token | One key in `tenant_branding.tokens_*` + a validator entry |
| Add a *queryable* attribute | The promotion path, §6.2 |

### 6.2 The promotion path — the core flexibility mechanism

A fact starts in the document and moves outward **only when a query needs it**. Four stages, each reversible:

```
stage 0  in projects.data only          — default, free
stage 1  also in projects.summary       — app computes on save; backfill = rewrite summary
stage 2  also a real column             — DDL + backfill + dual write
stage 3  column + index                 — when the filter becomes hot
```

Procedure for a stage-1 promotion (the common case, e.g. "list projects by wood essence"):

1. Add the field to the `ProjectSummary` type and to the computation in `serializeProject()`.
2. Ship. New saves carry it.
3. Backfill: `update projects set summary = summary || compute(data)` in batches of 1 000 — no lock of consequence, no downtime, since `summary` is not read by the editor.
4. Query `summary->>'essence'` with a GIN index if needed.

For stage 2 (e.g. `commune_insee` becomes a hot filter across 200 000 projects): add the column nullable, backfill in batches, add the index `concurrently`, start writing both, then flip reads. Never a single migration that adds, backfills, and indexes in one transaction — that is a table lock proportional to your success.

**The reverse direction is always available.** Drop the column, keep querying `data`. Nothing was lost, because the document was never the loser in a move.

### 6.3 Configuration as data, not code

Three things stay in tables specifically so they can change without a release:

- **Feature catalog** — new features, labels, categories, defaults, deprecation
- **Entitlements and quotas** — per tenant, per feature
- **Branding tokens** — per tenant

Everything else — engine constants (`PORTEE_VIS_K`, `ENTRAXE_LAME_K`, `PLOT_ENTRAXE_MAX_M`, the price tables), which encode NF DTU 51.4 and market rates — stays **in code**, versioned, tested, and released. They are not configuration; they are the product's correctness. A price table editable at runtime is a BOM you cannot reproduce six months later when a customer disputes a quote.

The one exception already in the design: per-project price overrides live in `construction` (`prixLongueurs`, `prixVisUnite`, …), which is right — they are the user's data, captured with the project, reproducible from the file.

### 6.4 Extension points reserved now, unimplemented

Cheap to reserve, expensive to retrofit:

- `projects.data.meta.custom: Record<string, unknown>` — per-tenant custom fields without a schema change. Validated as an object, never interpreted by the engine.
- `tenants.settings jsonb` — tenant-level defaults (default essence, default scale, default `LIEU_DEFAUT`), currently constants.
- `projects.kind text default 'plan'` — leaves room for templates and libraries (§7) without a discriminator retrofit.
- `audit_events.metadata` — already free-form, deliberately.

---

## 7. Evolution scenarios

Each row states what the scenario costs *given this design*. The point of the table is that none of them require a migration of stored plans.

| Scenario | Approach | Cost | Blocked by anything? |
|---|---|---|---|
| **Cross-project reporting** ("BOM value per tenant per quarter") | Query `summary`; if it outgrows that, a nightly projection table or a read replica + dbt | S | No |
| **Spatial queries** ("plans within 2 km", duplicate-parcel detection) | Already enabled by `footprint` + GiST | XS | No |
| **Server-side computation** (recompute BOM after an engine fix, batch re-pricing) | `engine/**` is pure TypeScript with no DOM (migration spec §3.3) — run it in a Node worker over `data` | **S — and this is the payoff of the purity rule** | No |
| **Templates / component library** (reusable terrace configs) | New `templates` table, same `jsonb` payload shape, or `projects.kind = 'template'` | S | No |
| **Third-party API** | The document *is* the API payload; add tokens, scopes, rate limits | M | No |
| **Offline / PWA** | Payload is 6 KB gzipped; IndexedDB mirror + `row_version` reconciliation on reconnect | M | No |
| **Collaborative editing** | Operation log or CRDT alongside the document; the document becomes a periodic materialisation | **L — a genuine architecture change** | Design it as an additive log, never by normalising the plan |
| **Data residency per tenant** | `tenants.region` + per-region database; `tenant_id` is already on every row, so routing is a connection choice | M | No — the tenant key exists everywhere |
| **Archival of cold tenants** | Detach and export; payloads are self-contained JSON | S | No |
| **Analytics / usage telemetry** | Separate event store, never the OLTP database | M | No |

The one scenario that costs real money is collaborative editing, and the mitigation is stated in advance: **do not respond to it by normalising the plan.** Fifteen tables of vertices do not give you concurrent editing; an operation log or a CRDT does, and both sit *beside* the document rather than replacing it.

---

## 8. Derived data policy

Store what you can recompute **only** when one of these holds:

1. **It is contractual.** `construction.bom` is persisted inside the plan because the user sent those numbers to a supplier. Recomputing it after an engine fix would silently rewrite history — which is exactly why `RELEASE.md` §2.1 makes a change in computed quantities a MAJOR release. `computeBOM()` remains the only writer; the engine never *reads* `construction.bom` as an input.
2. **It serves a query.** `summary`, `footprint`, `parcelle_idu`, `commune_insee`. All rebuildable from `data` by a batch job — and there should be a maintained `rebuild-summaries` command proving it.
3. **It is a counter under concurrency.** `tenant_usage`.

Everything else is computed on read. In particular: never persist screen coordinates, never persist the undo stack (client-side, `HISTORY_LIMIT = 60`), never persist orthophoto tiles, never persist the 3D scene.

---

## 9. Lifecycle, backup, and tenant exit

| Concern | Policy |
|---|---|
| Project delete | Soft (`deleted_at`), visible in a trash for 30 days, restorable by a tenant admin |
| Hard delete | Nightly job past 30 days; cascades to `project_versions` |
| Version thinning | §4.2 |
| Backups | WAL archiving + PITR, 35-day window; daily base backup; **restore drill quarterly, into a scratch instance, with a documented RTO** — an untested backup is a belief, not a backup |
| Pre-release backup | Automatic and mandatory for any release carrying a schema bump (`RELEASE.md` §8.4) |
| Tenant export | A ZIP of every project in the app's own JSON export format, plus branding assets. **The portability artefact already exists** — `exportProjetJSON` is the format, so GDPR Article 20 costs a loop, not a project. |
| Tenant offboarding | Export bundle delivered → 30-day grace → hard delete, audited |
| User deletion | Anonymise `audit_events.actor_id` to a tombstone (events are append-only and must survive); projects belong to the tenant, not the user, so nothing of the tenant's is lost |

---

## 10. Integrity and validation

Validation lives at the application boundary, not in the database — with three exceptions worth the cost.

**In the database:**
- `check (octet_length(data::text) <= 4 MB)` — a runaway import must not fill the volume.
- `check (schema_version between 1 and 99)` — a sanity bound.
- Foreign keys everywhere in T1, especially `tenant_features.key → features.key` (a renamed feature key must fail loudly, not silently resolve to "off").

**In the application:**
- `validerProjetJSON()` (legacy line 5715) at the ingress of every write and every import.
- The migration chain brings any older document to `SCHEMA_VERSION` before it is stored.
- `normalizeObjects()` re-establishes the in-memory invariants (`vertexNames.length === pts.length`, etc.).

**Deliberately not doing:** a JSON Schema `CHECK` constraint via `pg_jsonschema`. It duplicates the TypeScript types, drifts from them, and turns every schema migration into a coordinated DDL change. The type system plus `validerProjetJSON` is the single source of truth.

**Not doing either:** `jsonb_set` partial updates. Writing `data->'objects'->3->'pts'` from SQL puts plan semantics in the database, defeats optimistic concurrency (two partial updates both "succeed" and produce a plan neither user drew), and makes the version history meaningless. Documents are written whole.

---

## 11. Observability

Track from day one, because each of these predicts a specific future failure:

| Metric | Alert | Predicts |
|---|---|---|
| `projects.size_bytes` p50 / p95 / max | p95 > 500 KB | Neighbourhood imports outgrowing the transport budget |
| R2 load latency, split server / transfer | p95 > 200 ms | Detoast or payload growth |
| Rows returned with `data` selected, per endpoint | any list endpoint > 0 | Someone reintroduced `select *` (§5.1) |
| `project_versions` row count and total bytes | > 100 GB | Thinning job not running |
| Save conflicts (409 per day) | rising trend | Users editing the same plan — the collaborative-editing signal |
| Quota near-misses per tenant | > 80 % | Commercial conversation, before the customer is blocked |
| Feature usage from `audit_events` | key at 0 for 90 days | A catalog entry to deprecate |
| Cache hit ratio on R3 | < 90 % | Over-aggressive invalidation on the hottest path |
| Backup restore drill | quarterly, pass/fail | The only metric that matters on the worst day |

---

## 12. Anti-patterns, and why each is rejected

| Tempting | Rejected because |
|---|---|
| Normalising geometry into tables | Array order is semantic (`ptIndex`, `segmentReference`); ~15 tables to reassemble one plan; no query needs a vertex; §7 shows nothing gains from it |
| `select *` via an ORM | Pulls a 40 KB–4 MB payload into every list query (§5.1) |
| `jsonb_set` partial writes | Plan semantics in SQL, silent lost updates, meaningless history (§10) |
| Entitlements as a JSON column on `tenants` | No foreign key, no aggregation, no safe concurrent quota increment |
| Storing the undo stack server-side | 60 snapshots per session, zero value once the tab closes |
| Storing logos as `bytea` | Bloats backups, no CDN, no streaming |
| Storing IGN tiles in Postgres | Unbounded growth, re-fetchable, already cached client-side |
| Price tables as runtime configuration | Destroys reproducibility of a BOM sent to a supplier (§6.3) |
| `updated_at` as an optimistic-lock token | Clock skew and same-millisecond writes; `row_version` is exact |
| A schema-validation constraint in the database | Duplicates and drifts from the TypeScript types (§10) |
| Diff-based version storage on day one | Complex restore for a saving measured in gigabytes, not terabytes |

---

## 13. Roadmap of data work

| Release | Data deliverables |
|---|---|
| `1.1.0` | Reserve `meta.schemaVersion` / `appVersion` / `tenantId` in the document. Migration chain + fixtures. `rebuild-summaries` command written against the future schema. |
| `2.0.0` | T1 core, RLS, `SET LOCAL` + PgBouncer, `projects` envelope, `project_versions`, flat-file import, PITR, first restore drill |
| `2.1.0` | `features` / `tenant_features` / `tenant_usage`, T5 cache for R3, ETag on R2, `summary` computation and backfill |
| `2.2.0` | `tenant_branding`, `assets` + T4 object storage |
| `2.3.0` | `footprint` + PostGIS index, audit partition automation, version thinning job, tenant export bundle |
| Later | Projection tables or read replica if `summary` stops answering; operation log if collaborative editing is committed to |

---

## 14. Decision log

| # | Decision | Alternative rejected | Reason |
|---|---|---|---|
| D1 | Document (`jsonb`) for the plan | Full relational normalisation | Access pattern is whole-document; array order is semantic; ~15 tables of pure cost |
| D2 | Relational for identity, tenancy, entitlements | JSON columns on `tenants` | Foreign keys, aggregation, concurrent counters, RLS |
| D3 | `summary` computed by the app | Postgres generated columns | Immutability constraints; the client already has the numbers |
| D4 | `row_version` optimistic locking | Last-write-wins; pessimistic locks | Whole-document writes make silent data loss the default failure |
| D5 | Full-copy version history | Diffs; no history | ~7 KB compressed per save; simple one-step restore; enables rollback |
| D6 | Assets in object storage | `bytea` | Backup size, CDN, streaming |
| D7 | Audit partitioned from day one | Single table | Cannot be retrofitted cheaply; archival becomes a `DETACH` |
| D8 | Engine constants in code | Runtime-editable price tables | BOM reproducibility is contractual |
| D9 | No document store, no sharding | Mongo / S3-as-database | 5 GB total at target scale; Postgres does both jobs |
| D10 | Validation in TypeScript, not SQL | `pg_jsonschema` | Single source of truth; avoids DDL-coupled schema migrations |
