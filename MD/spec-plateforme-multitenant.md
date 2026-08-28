# Specification — Multi-tenancy, authentication, feature catalog, branding

**Target release:** `2.0.0` (tenancy + auth), `2.1.0` (feature catalog), `2.2.0` (branding)
**Prerequisite:** `1.1.0` — TypeScript migration complete (`spec-migration-typescript.md`)
**Companion:** `RELEASE.md`

---

## 0. What this changes, stated plainly

The application today has **no concept of a user**. `api.php` accepts any request, projects are addressed by a guessable `?projet=` id, and `localStorage` holds the last-opened id. Everything in this document is new construction, not migration.

The three consequences to accept up front:

1. **A real backend is required.** Flat-file storage behind `api.php` cannot express tenants, memberships, entitlements, audit trails, or MFA secrets with the integrity guarantees they need. This is a database project.
2. **The client cannot enforce anything.** Feature gating in the browser is presentation. Every entitlement, every tenant scope, every role check is enforced server-side, and the client-side check exists only so the UI is not full of buttons that return 403.
3. **Do it after the migration, not during.** Building tenancy on the current 12 400-line closure means the authorisation logic is scattered across the same scope as the drag handlers. `spec-migration-typescript.md` must complete first.

---

## 1. Domain model

### 1.1 Entities

```
Tenant ──< Membership >── User
   │            │
   │            └─ role: tenant_admin | member | viewer
   │
   ├──< Project (tenant_id)
   ├──< TenantFeature (feature_key, enabled, quota)
   ├──── Branding (1:1)
   └──< AuditEvent

Feature (global catalog, platform-owned)
User ──< MfaCredential, RecoveryCode, Session, LoginAttempt
```

### 1.2 Roles and scopes

Two distinct admin scopes. Conflating them is the classic multi-tenant security defect.

| Role | Scope | Can |
|---|---|---|
| `platform_admin` | Cross-tenant | Create/suspend tenants, edit the **global feature catalog**, grant entitlements to a tenant, view the platform audit log. **Cannot** read tenant project content without an explicit, audited impersonation grant. |
| `tenant_admin` | One tenant | Invite/suspend/remove users in the tenant, assign roles, enable or disable **features already entitled to the tenant**, set branding, view the tenant audit log, transfer project ownership |
| `member` | One tenant | Create, edit, delete, export projects within the tenant, subject to entitlements |
| `viewer` | One tenant | Open and export projects; every mutation endpoint rejected |

A user may hold memberships in several tenants with different roles. The active tenant is part of the session, chosen at login or via a tenant switcher, and **never** read from a request parameter.

> The "admin group that manages tenant users and the feature catalog" splits across these two roles: the tenant admin manages *users and the tenant's feature switches*; the platform admin owns *the catalog itself and what each tenant is entitled to*. A tenant admin can never grant their tenant a feature it has not been entitled to.

### 1.3 Schema (PostgreSQL)

```sql
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          citext unique not null,        -- used in URLs: /t/acme/…
  name          text not null,
  status        text not null default 'active', -- active | suspended
  created_at    timestamptz not null default now()
);

create table users (
  id              uuid primary key default gen_random_uuid(),
  email           citext unique not null,
  password_hash   text,                         -- null when SSO-only
  status          text not null default 'invited', -- invited | active | suspended
  mfa_enrolled_at timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);

create table memberships (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('tenant_admin','member','viewer')),
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  data        jsonb not null,                  -- { objects, measures, meta }
  schema_version int not null,
  created_by  uuid references users(id),
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on projects (tenant_id, deleted_at, updated_at desc);

create table features (                        -- the global catalog
  key         text primary key,                -- 'view.3d'
  label       text not null,
  description text not null,
  category    text not null,
  default_on  boolean not null default false,
  quota_unit  text,                            -- null | 'per_month' | 'count'
  deprecated  boolean not null default false
);

create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  key       text not null references features(key),
  entitled  boolean not null default false,    -- platform_admin decides
  enabled   boolean not null default true,     -- tenant_admin decides
  quota     integer,                           -- null = unlimited
  primary key (tenant_id, key)
);

create table tenant_branding (
  tenant_id     uuid primary key references tenants(id) on delete cascade,
  app_name      text,
  tokens_light  jsonb not null default '{}',
  tokens_dark   jsonb not null default '{}',
  logo_light_id uuid references assets(id),
  logo_dark_id  uuid references assets(id),
  favicon_id    uuid references assets(id),
  pdf_footer    text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id)
);

create table audit_events (
  id         bigserial primary key,
  tenant_id  uuid references tenants(id),
  actor_id   uuid references users(id),
  action     text not null,                    -- 'user.invited', 'feature.enabled', …
  target     text,
  metadata   jsonb not null default '{}',
  ip         inet,
  user_agent text,
  at         timestamptz not null default now()
);
create index on audit_events (tenant_id, at desc);
```

### 1.4 Isolation

Defence in depth, three layers, all three required:

1. **Session-derived scope.** Every query takes its `tenant_id` from the server session, never from the request body or query string. A request that names a tenant the session does not hold returns `404`, not `403` — do not confirm the existence of another tenant's resources.
2. **Row-level security.** `alter table projects enable row level security;` with a policy on `current_setting('app.tenant_id')`, set per connection at the start of each request. This catches the query someone forgets to scope.
3. **Repository layer.** No raw SQL in handlers. `ProjectRepository` takes a `TenantContext` in its constructor and cannot be instantiated without one.

The `?projet=<id>` URL parameter survives, but ids become UUIDv4 and are additionally checked against the session's tenant. Guessability stops being the control.

### 1.5 Migrating existing data

One-time script, run before 2.0.0 goes live:

1. Create tenant `default` and one `tenant_admin` user from an operator-supplied email.
2. Import every project file currently behind `api.php` into `projects` with `tenant_id = default`, preserving ids where they are already UUIDs and remapping otherwise (with a printed mapping table, since users may have bookmarked `?projet=`).
3. Run the schema migration chain (`RELEASE.md` §3.3) so every row lands at the current `schema_version`.
4. Verify: row count matches file count, and a sample of 10 projects round-trips to byte-identical JSON.
5. Keep the flat files read-only for 90 days.

---

## 2. Authentication and MFA

### 2.1 Session mechanism

**Server-side sessions with an opaque cookie.** Not JWT in `localStorage`.

Rationale for this application specifically: sessions must be revocable the instant a tenant admin suspends a user; the app makes long-lived tabs (users leave a plan open for hours); and there is no third-party API consumer that would justify bearer tokens.

```
Set-Cookie: pi_session=<32 bytes, CSPRNG, base64url>;
  HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200
```

- Session record: `user_id`, `tenant_id`, `mfa_satisfied_at`, `device_id`, `ip`, `user_agent`, `created_at`, `last_seen_at`, `expires_at`.
- Idle timeout 12 h, absolute lifetime 30 days. Both configurable per tenant, within platform bounds.
- **CSRF**: double-submit token. `GET /api/v1/session` returns a token; every unsafe method requires it in `X-CSRF-Token`. `SameSite=Strict` alone is not treated as sufficient.
- Session list and "revoke all other sessions" available to the user; "revoke all sessions of a user" to the tenant admin.

### 2.2 Password

- Argon2id, `m=64 MiB, t=3, p=4`. Never MD5/SHA/bcrypt-with-low-cost.
- Minimum 12 characters, no composition rules, no forced rotation (NIST SP 800-63B).
- Checked against a breached-password list (k-anonymity range query, or a local Bloom filter if egress is restricted).
- Constant-time comparison; identical response time and message for unknown email and wrong password.

### 2.3 MFA — TOTP

**TOTP (RFC 6238)** as the baseline second factor. WebAuthn/passkeys are specified as a follow-on (§2.7), not as part of 2.0.0.

- SHA-1, 6 digits, 30 s period (the interoperable profile — Google Authenticator, Authy, 1Password, FreeOTP).
- ±1 step drift window. Each accepted code is recorded and cannot be reused within its window (replay protection).
- Secret: 160 bits from a CSPRNG, stored **encrypted at rest** with a key from the KMS/env, never in the same column family as the password hash, never returned by any API after enrolment.
- Enrolment: `otpauth://totp/PlanInteractif:{email}?issuer=PlanInteractif&secret=…`, shown as QR + the base32 string. Enrolment completes only after the user submits one valid code.
- **10 recovery codes**, 10 characters each, shown exactly once, stored Argon2id-hashed, single-use. Consuming one raises an audit event and emails the user. Fewer than 3 remaining triggers a regeneration prompt.

### 2.4 MFA policy

| Setting | Default | Who sets it |
|---|---|---|
| MFA required for `platform_admin` | **Always on, not disableable** | — |
| MFA required for `tenant_admin` | On | Platform admin (may not be relaxed below "on") |
| MFA required for `member` / `viewer` | Off | Tenant admin |
| Grace period after the policy is turned on | 7 days | Tenant admin, max 14 |

When MFA becomes required and the user has not enrolled, login succeeds into a **restricted session** that can reach only the enrolment flow and logout. During the grace period the user sees a dismissible prompt; after it, enrolment is mandatory.

### 2.5 Login state machine

```
                 ┌──────────────┐
   credentials → │ password_ok  │
                 └──────┬───────┘
        mfa not required│      │mfa required
                        │      ▼
                        │  ┌──────────────┐  valid TOTP / recovery code
                        │  │ mfa_required │ ─────────────────────────┐
                        │  └──────┬───────┘                          │
                        │         │ not enrolled                     │
                        │         ▼                                  │
                        │  ┌──────────────────┐  enrolment complete  │
                        │  │ mfa_enrol_needed │ ─────────────────────┤
                        │  └──────────────────┘                      │
                        ▼                                            ▼
                   ┌─────────────────────────────────────────────────────┐
                   │ authenticated  →  tenant selection if >1 membership  │
                   └─────────────────────────────────────────────────────┘
```

The intermediate states hold a short-lived (5 min), single-purpose token — **not** a full session cookie. A `mfa_required` token can call only `POST /auth/mfa/verify`.

### 2.6 Step-up re-authentication

These operations require a fresh factor (password or TOTP) within the last 15 minutes, regardless of session age:

- Change password, change or disable MFA, regenerate recovery codes
- Invite, suspend, or remove a user; change a user's role
- Enable or disable a feature for the tenant
- Change branding
- Delete a project, or empty the trash
- Any `platform_admin` action

### 2.7 Rate limiting, lockout, audit

| Control | Rule |
|---|---|
| Password attempts | 5 per account per 15 min, then exponential backoff to 1/h; **never a permanent lock** (that is a denial-of-service vector against a known email) |
| TOTP attempts | 5 per session per 15 min, then the intermediate token is destroyed and login restarts |
| Per-IP | 20 auth requests/min, sliding window |
| Alerting | 3+ lockouts on one tenant within an hour notifies the tenant admin |

Audited, always: `auth.login.success`, `auth.login.failure`, `auth.mfa.enrolled`, `auth.mfa.failed`, `auth.recovery_code.used`, `auth.password.changed`, `session.revoked`, `user.invited`, `user.role_changed`, `user.suspended`, `feature.toggled`, `entitlement.changed`, `branding.updated`, `project.deleted`, `impersonation.started/ended`. Audit rows are append-only; no application role holds `UPDATE` or `DELETE` on `audit_events`.

### 2.8 Follow-on (not in 2.0.0)

WebAuthn/passkeys as an alternative second factor and eventual primary factor; SAML/OIDC SSO per tenant with SCIM provisioning (sold as the `sso` entitlement); device trust ("remember this device 30 days", per-device cookie bound to the session's `device_id`).

### 2.9 Client-side impact

The current bootstrap is `loadInitialProject().then(boot).catch(showProjectLoadError)` (line 13471). It becomes:

```ts
// src/main.ts
const session = await getSession();            // GET /api/v1/session
if (!session.authenticated) { mountAuthShell(session); }   // login / mfa / enrol
else {
  applyBranding(session.branding);             // before first paint — §4.4
  const ctx = createApp(session);              // AppState now carries session + features
  await loadInitialProject(ctx).then(project => boot(ctx, project));
}
```

`ApiError` (migration spec §8.1) gains two reasons: `'unauthenticated'` (→ return to the auth shell, preserving unsaved work in memory and offering a local JSON export before redirect) and `'forbidden'` (→ the feature or role message). A `401` arriving mid-session on a save must **never** discard the user's plan.

---

## 3. Feature catalog and entitlements

### 3.1 Catalog

The catalog is platform-owned data, seeded by migration, editable by `platform_admin`. Keys are stable forever; a retired feature is marked `deprecated`, never deleted.

| Key | Label (FR) | Category | Default | Quota |
|---|---|---|---|---|
| `plan.editor` | Éditeur de plan | Core | on | — |
| `plan.measure` | Outil de mesure | Core | on | — |
| `plan.import.svg` | Import SVG | Core | on | — |
| `export.svg` | Export SVG | Export | on | — |
| `export.png` | Export PNG | Export | on | — |
| `export.dxf` | Export DXF | Export | off | — |
| `export.pdf` | Export PDF | Export | on | — |
| `export.dossier` | Dossier PDF (plan de masse + terrasses) | Export | off | — |
| `export.glb` | Export GLB (3D) | Export | off | per_month |
| `cadastre.import` | Import cadastral par adresse | Cartographie | off | per_month |
| `cadastre.voisinage` | Parcelles voisines et bâti IGN | Cartographie | off | — |
| `ign.ortho` | Fond orthophoto IGN | Cartographie | off | per_month |
| `ign.plu` | Règles d'urbanisme (PLU) | Cartographie | off | per_month |
| `terrasse.engine` | Moteur terrasse (structure, BOM) | Terrasse | on | — |
| `terrasse.optimiser` | Optimisation des paramètres | Terrasse | off | — |
| `terrasse.debit` | Débit et optimisation des chutes | Terrasse | on | — |
| `terrasse.chantier` | Planning de chantier | Terrasse | off | — |
| `view.3d` | Vue 3D | 3D | off | — |
| `view.3d.textures` | Textures Poly Haven | 3D | off | — |
| `view.glbviewer` | Visionneuse GLB | 3D | off | — |
| `branding.custom` | Charte graphique personnalisée | Plateforme | off | — |
| `admin.audit` | Journal d'audit | Plateforme | off | — |
| `sso` | Authentification SSO | Plateforme | off | — |

Each key maps to a concrete region of the existing code — `view.3d` gates the `mode3dBtn` / `terrasseTab3d` region and every `three/**` import; `ign.ortho` gates `chkOrtho`, the WMTS client and the ortho panel; `export.dossier` gates `dossierPdfBtn` and `export/pdf/dossier.ts`. This mapping is written down in `docs/features.md` and is part of the definition of done for 2.1.0.

### 3.2 Resolution

```
effective(feature) =
      features.deprecated        ? off
    : tenant_features.entitled   ? (tenant_features.enabled ? on : off)
    : features.default_on        ? on : off
  ∧  role_allows(feature, membership.role)
  ∧  quota_remaining(feature) > 0
```

Resolved **server-side, once per session**, returned in the session payload, and re-resolved on every mutating request. The client never computes it from raw catalog rows.

```ts
export type FeatureKey =
  | 'plan.editor' | 'plan.measure' | 'export.dxf' | 'view.3d' | /* … */;

export interface FeatureState {
  on: boolean;
  reason?: 'not_entitled' | 'disabled_by_admin' | 'quota_exceeded' | 'role';
  quota?: { used: number; limit: number; resetsAt: string };
}
export type Features = Readonly<Record<FeatureKey, FeatureState>>;
```

`FeatureKey` is **generated** from the catalog into `src/generated/features.ts` at build time, so an unknown key is a compile error and `switch` exhaustiveness (migration spec §9.3) covers the whole catalog.

### 3.3 Client-side gating

```ts
export function can(ctx: AppContext, k: FeatureKey): boolean { return ctx.features[k].on; }

export function gate(ctx: AppContext, k: FeatureKey, el: HTMLElement): void {
  const f = ctx.features[k];
  if (f.on) return;
  if (f.reason === 'not_entitled') el.remove();          // never existed, as far as this tenant knows
  else { el.setAttribute('disabled',''); el.title = REASON_FR[f.reason!]; }
}
```

The distinction matters for the UX: a feature the tenant has never bought is absent (no upsell clutter in a working tool); a feature the tenant *has* but the admin switched off, or that is over quota, is visible and explains itself.

Lazily-loaded regions — the three.js modules, the GLB viewer — are behind a dynamic `import()` guarded by `can()`, so a tenant without `view.3d` never downloads the 3D code. This also keeps the single-file budget honest.

### 3.4 Server-side enforcement — non-negotiable

Every endpoint declares its required feature and minimum role:

```ts
router.post('/projects/:id/export/glb',
  requireAuth, requireRole('member'), requireFeature('export.glb'), consumeQuota('export.glb'),
  handler);
```

Test rule for 2.1.0: **for every entitlement-gated endpoint, a test asserts 403 for a session without the entitlement.** A feature whose enforcement test is missing is not shipped.

### 3.5 Admin surfaces

**Tenant admin — `/admin` inside the app:**
- *Utilisateurs*: list (email, role, MFA status, last login, session count), invite by email, change role, suspend, remove, force logout, resend invitation. Bulk invite by CSV. The last `tenant_admin` cannot be removed or demoted.
- *Fonctionnalités*: entitled features only, with a switch each, quota consumption shown, an explanation of who can change what. Non-entitled features are not listed.
- *Charte graphique*: §4.
- *Journal*: tenant audit events, filterable, CSV export (behind `admin.audit`).

**Platform admin — separate application, separate host, separate session cookie.** Not a hidden route in the tenant app. Tenants CRUD, entitlement grid (tenant × feature), catalog editing, cross-tenant audit, impersonation with a mandatory reason and a hard 60-minute expiry, banner visible to the impersonated tenant's admins.

---

## 4. Tenant branding

### 4.1 The starting position is unusually good

The application is already fully themed through CSS custom properties (`--ink`, `--ink-soft`, `--paper`, `--paper-deep`, `--rule`, `--border`, `--accent`, `--accent-light`, `--stage-bg`, `--panel-bg`, `--input-bg`, `--zebra`, `--zebra-hover`), with a complete dark-mode block under `prefers-color-scheme`. Branding is therefore **token substitution**, not a restyle.

**But** — and this is the one real obstacle — the SVG plan does *not* read those tokens. Lines 1209–1216 duplicate them as JavaScript constants:

```js
const isDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
const SVG_INK = isDarkScheme ? '#EFE4C8' : '#3B2E1F';
const SVG_GRID_MAJOR = …, SVG_GRID_MINOR = …, SVG_LABEL_HALO = …,
      SVG_MEASURE_LINE = …, SVG_MEASURE_LINE_SOFT = …, SVG_MEASURE_TEXT = …;
```

evaluated **once at boot**. Two required changes, both in `render/svg.ts`:

1. Read tokens from the live stylesheet — `getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()` — into a `ThemeTokens` object.
2. Recompute on: branding change, `prefers-color-scheme` change (add the `matchMedia` listener that does not exist today), and tenant switch — then call `render()`.

Without this, a tenant's accent colour reaches the panels but not the plan, the north arrow, the scale bar, or the measure lines. This is the bulk of the 2.2.0 work.

### 4.2 What is brandable

| Element | Field | Constraint |
|---|---|---|
| Application name | `app_name` | ≤ 40 chars, plain text, replaces the `<h1>` prefix and the document title |
| Colour tokens, light | `tokens_light` | The 13 tokens above, each a strict `#RRGGBB` / `#RRGGBBAA` |
| Colour tokens, dark | `tokens_dark` | Same; optional — falls back to the default dark palette |
| Logo (light / dark) | `logo_light_id`, `logo_dark_id` | PNG or WebP, ≤ 512 KB, ≤ 1024×256, shown in the project bar |
| Favicon | `favicon_id` | PNG 32×32 / 180×180 |
| PDF footer | `pdf_footer` | ≤ 120 chars, plain text |
| Font family | `font_stack` | **Allowlist only**: the current serif stack, a sans stack, a mono stack. No arbitrary values, no remote font URLs. |

Explicitly **not** brandable: object fill/stroke defaults (they carry plan semantics — `terrain` green, `chemin` ochre, measure blue), grid geometry, layout, panel structure, French labels.

### 4.3 Safety

- **No CSS string is ever accepted from a tenant.** The admin submits a JSON map of token → colour; the server validates each value against `/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/` and rejects the whole payload on any failure. The client emits `--ink: #3B2E1F;` from validated values. This forecloses `background: url(javascript:…)`, `expression()`, and token-value CSS injection.
- **SVG logos are not accepted.** Sanitising SVG well is hard and the payoff is small. PNG/WebP only, re-encoded server-side (which strips metadata and any polyglot payload), dimensions validated after decode.
- **CSP**: `default-src 'self'; img-src 'self' data: https://cdn.polyhaven.com https://data.geopf.fr; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`. The `unsafe-inline` for styles is needed by the token block and by the ~40 inline `style=` attributes in the shell markup; the alternative is a nonce on a single injected `<style>` element, which is preferable and should be adopted if the shell's inline styles are moved to classes.
- **Contrast**: the server computes WCAG contrast for `--ink`/`--paper`, `--ink`/`--panel-bg`, `--ink-soft`/`--paper`, `--accent`/`--paper`. Below 4.5:1 → rejected. Between 4.5 and 7 → saved with a warning shown to the admin. An admin must not be able to make the tool unreadable for their own users.
- Branding changes are step-up-authenticated and audited with the before/after payload.

### 4.4 Delivery — avoiding a flash of default theme

The single-file client is served identically to every tenant, so the theme cannot be baked into the HTML at build time.

1. On successful login, the session payload includes `branding` (a small JSON object, < 2 KB) and its `etag`.
2. `applyBranding()` writes a `<style id="tenant-theme">` block into `<head>` **before** `createApp()` — no first paint of the app shell happens before this.
3. The payload is cached in `localStorage` under `pi.branding.<tenantId>` and applied optimistically at page load, before the session round-trip, then reconciled against the `etag`. This removes the flash on every visit after the first.
4. The auth shell itself is unbranded (default palette) — it is served before any tenant is known, and inferring the tenant from an unauthenticated request in order to theme the login page is an account-enumeration channel.

### 4.5 Branding in exported artefacts

| Export | Treatment | Effort |
|---|---|---|
| SVG | Tokens resolved to literal colours (already the case); logo not embedded | trivial |
| PNG | Follows the SVG | trivial |
| DXF | Not branded — CAD layers carry semantic colour | none |
| Project JSON | Not branded — data only | none |
| GLB | `asset.generator` carries the app name | trivial |
| **PDF / dossier PDF** | Logo in the header, `pdf_footer` in the footer | **significant** |

The PDF path deserves a flag. `assemblerPDF` / `pdfTexte` / `pdfPolygone` / `pdfCercle` (lines 4391–4463) are a hand-written PDF writer with no image support. Embedding a logo means adding an `/XObject` image resource — the cheapest correct route is a JPEG with `/DCTDecode`, whose bytes pass through unmodified, avoiding a Flate implementation. Budget **3–4 days** for this alone, including golden-file coverage. Text-only footer branding is a half-day; if the schedule tightens, ship the footer in 2.2.0 and the logo in 2.3.0.

---

## 5. API surface (v1, additions)

```
POST   /api/v1/auth/login                { email, password } → { state, token? } | 401
POST   /api/v1/auth/mfa/verify           { token, code }     → session cookie
POST   /api/v1/auth/mfa/enrol/start      → { secret, otpauthUri, qrSvg }
POST   /api/v1/auth/mfa/enrol/confirm    { code } → { recoveryCodes[] }   (shown once)
POST   /api/v1/auth/mfa/recovery         { token, code }
DELETE /api/v1/auth/mfa                  (step-up)
POST   /api/v1/auth/password/reset/request | /confirm
POST   /api/v1/auth/logout
GET    /api/v1/session                   → { authenticated, user, tenant, role,
                                             features, branding, minClientVersion,
                                             currentVersion, csrfToken }
POST   /api/v1/session/tenant            { tenantId }   (switch active tenant)
GET    /api/v1/sessions | DELETE /api/v1/sessions/:id

GET    /api/v1/projects                  → tenant-scoped list
GET    /api/v1/projects/:id | POST /api/v1/projects | PUT /api/v1/projects/:id
DELETE /api/v1/projects/:id              (soft delete, step-up)

GET    /api/v1/admin/users | POST /api/v1/admin/users/invite
PATCH  /api/v1/admin/users/:id           { role | status }        (step-up)
DELETE /api/v1/admin/users/:id           (step-up)
GET    /api/v1/admin/features            → entitled catalog + state + quota
PATCH  /api/v1/admin/features/:key       { enabled }              (step-up)
GET    /api/v1/admin/branding | PUT /api/v1/admin/branding        (step-up)
POST   /api/v1/admin/assets              (logo/favicon upload)
GET    /api/v1/admin/audit               ?from&to&action&actor    (feature: admin.audit)
```

Platform-admin routes live under a separate host and are not listed here.

Every response carries `X-App-Version`; every request is expected to carry it too (`RELEASE.md` §5.3).

---

## 6. Client architecture additions

Extends the module map in `spec-migration-typescript.md` §3.2:

```
src/
├─ auth/
│  ├─ session.ts        # getSession, login, logout, tenant switch, CSRF token
│  ├─ mfa.ts            # enrol, verify, recovery codes
│  └─ shell.ts          # the pre-app authentication UI (login / mfa / enrol / reset)
├─ tenancy/
│  ├─ context.ts        # TenantContext: tenant, role, features, branding
│  ├─ features.ts       # can(), gate(), quota display
│  └─ guards.ts         # requireRole / requireFeature for client routes
├─ theme/
│  ├─ tokens.ts         # ThemeTokens type, the 13 keys, defaults light + dark
│  ├─ apply.ts          # applyBranding, <style id="tenant-theme">, localStorage cache
│  └─ read.ts           # readThemeTokens() from getComputedStyle — §4.1
├─ admin/
│  ├─ users.ts | features.ts | branding.ts | audit.ts
└─ generated/
   └─ features.ts       # FeatureKey union, generated from the catalog
```

`AppState` (migration spec §6.1) gains:

```ts
session: { user: SessionUser; tenant: TenantSummary; role: Role; csrfToken: string };
features: Features;
branding: Branding;
theme: ThemeTokens;        // resolved, re-read on scheme or branding change
```

`engine/**` and `geometry/**` keep their purity rule — **no entitlement checks inside the engine.** Gating happens at the UI and API layers. An engine function that refuses to compute because of a licence is untestable and unmaintainable.

---

## 7. Testing

### 7.1 Isolation suite (blocking for 2.0.0)

For each of the ~20 tenant-scoped endpoints, a parameterised test with two tenants A and B:

- B's session reading A's project by id → `404`
- B's session writing A's project → `404`
- B's session listing → contains no A rows
- A tenant admin of B managing a user of A → `404`
- A `viewer` calling any mutating endpoint → `403`
- A session whose `tenant_id` is tampered with in the cookie (forged) → `401`
- RLS check: the same query run with `app.tenant_id` unset returns zero rows

### 7.2 Auth suite

Full state-machine coverage of §2.5; TOTP drift at −1/0/+1 steps and rejection at ±2; code replay within a window rejected; recovery code single-use; lockout backoff timings; identical response time for unknown-email and wrong-password (statistical assertion over 200 samples); step-up expiry at 15 min; session revocation takes effect on the next request.

### 7.3 Feature suite

For every catalog key: 403 without entitlement, 200 with; UI absent when `not_entitled`, disabled-with-reason when `disabled_by_admin`; quota decrement, quota exhaustion, monthly reset; the generated `FeatureKey` union matches the seeded catalog exactly (a drift test).

### 7.4 Branding suite

Token validation rejects non-hex, `url(...)`, `expression(...)`, `;`-injection, and over-length payloads; contrast rejection below 4.5:1; PNG re-encode strips an embedded payload; SVG upload rejected; `readThemeTokens()` returns the tenant palette and the SVG plan renders with it (jsdom + `getComputedStyle` assertion); scheme change re-renders; golden PDF with a branded footer and logo.

---

## 8. Risks

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| T1 | A query forgets its tenant scope → cross-tenant data exposure | M | **Critical** | Three-layer isolation (§1.4); the §7.1 suite is a release gate; no raw SQL in handlers |
| T2 | Feature gating implemented only client-side | M | High | Every gated endpoint ships with its 403 test; §3.4 is a definition-of-done item |
| T3 | Branding becomes a CSS injection vector | M | High | Structured token JSON only, strict per-value validation, no raw CSS, CSP (§4.3) |
| T4 | MFA lockout locks out the only tenant admin | M | High | Recovery codes; platform-admin unlock with audit; the last `tenant_admin` cannot be removed |
| T5 | Migration of existing flat-file projects loses or misattributes data | M | High | Dry run against a copy, round-trip verification, files kept read-only 90 days, id mapping table published |
| T6 | Tenant-specific bug reports are unreproducible without impersonation, and impersonation becomes routine | M | M | Time-boxed, reason-required, audited, visible to the tenant; monthly review of impersonation frequency |
| T7 | PDF logo embedding balloons (hand-written writer, no image support) | H | M | Ship the text footer first; logo behind its own release; JPEG/DCTDecode only |
| T8 | Scope creep — SSO, SCIM, billing, WebAuthn pulled into 2.0.0 | H | M | Explicitly deferred (§2.8); the catalog reserves `sso` as a key without an implementation |
| T9 | Feature keys renamed after release, breaking tenant entitlements | L | High | Keys are immutable; deprecate, never delete or rename (§3.1) |

---

## 9. Roadmap and effort

Sequential after `1.1.0`. One backend developer plus the frontend developer from the migration.

| Release | Content | BE | FE | Total |
|---|---|---|---|---|
| — | Backend foundation: DB, migrations, repository layer, RLS, CI | 6 d | — | 6 d |
| `2.0.0` | Sessions, password, TOTP MFA, recovery codes, step-up, rate limiting, audit; auth shell; tenancy + isolation suite; data migration | 14 d | 8 d | 22 d |
| `2.1.0` | Feature catalog, entitlement resolution, server enforcement, quotas, tenant-admin users + features screens, lazy-loaded gated regions | 8 d | 9 d | 17 d |
| `2.2.0` | Branding: token model, validation, contrast, asset pipeline, `readThemeTokens` + SVG/render rework, admin screen, PDF footer | 5 d | 9 d | 14 d |
| `2.3.0` | PDF logo (`/XObject` + DCTDecode), platform-admin application | 6 d | 5 d | 11 d |
| | **Total** | **39 d** | **31 d** | **~70 d** |

Add 25 % contingency — higher than the migration's 20 %, because this is new construction against an untested backend rather than a transformation with a golden-file oracle.

---

## 10. Definition of done (2.0.0 → 2.2.0)

- [ ] Cross-tenant isolation suite (§7.1) green; RLS enabled and verified on every tenant-scoped table
- [ ] Auth suite (§7.2) green; MFA mandatory and un-disableable for platform admins
- [ ] Every entitlement-gated endpoint has a passing 403-without-entitlement test
- [ ] `FeatureKey` generated from the catalog; drift test green; `docs/features.md` maps every key to its code region
- [ ] Branding validation and contrast tests green; no raw CSS accepted anywhere; CSP deployed
- [ ] `readThemeTokens()` in place — the SVG plan, north arrow, scale bar and measures follow the tenant palette and react to a scheme change
- [ ] Existing projects migrated into the default tenant; 10-project round-trip verified byte-identical; flat files retained read-only
- [ ] Audit log append-only; no application role holds UPDATE/DELETE on it
- [ ] Session revocation effective within one request; "revoke all sessions" available to user and tenant admin
- [ ] Penetration test (external) covering tenant isolation, auth, and file upload, with findings closed or accepted in writing
- [ ] `RELEASE.md` followed: `2.0.0` announced to tenant admins 14 days ahead; schema bump shipped alone
