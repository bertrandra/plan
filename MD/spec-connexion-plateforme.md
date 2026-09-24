# Specification — Plan as a product of the backprod platform

**Target release:** `2.0.0`
**Prerequisite:** `1.2.0` — the interface rebuilt by zones, with the command registry
(`spec-ihm-zones.md`, published 22 September 2026)
**Supersedes:** `spec-plateforme-multitenant.md` — see §0.2
**Platform side of this contract:** `backprod/docs/plan-service.md` (accepted 20 September 2026)
and `backprod/docs/adr/ADR-051-a-product-beside-the-platform-connects-with-three-credentials.md`
**Companions:** `architecture.md`, `spec-data-strategy.md`, `RELEASE.md`

---

## 0. What this changes, stated plainly

### 0.1 The decision

Plan is **one product of the backprod platform**, not a platform of its own. It is deployed beside
the platform, on its own host, with its own code and its own release. The people who use it are the
platform's people, the organisation that pays is the platform's tenant, and what a person may do is
the platform's answer, read live.

Three consequences to accept up front:

1. **Plan writes no authentication.** No accounts, no passwords, no TOTP, no sessions, no roles, no
   memberships, no offers, no invoices. Each of those is the platform's, and a product that
   re-implements one becomes a second authority. Two authorities disagree.
2. **Plan needs no database.** The platform's `projects` resource stores an opaque JSONB document
   with a schema version, plus versions, assets and soft delete — which is exactly the shape of
   `projet.json`. `api.php` and `data/` are retired (§6).
3. **The client still enforces nothing.** Reading `capabilities` and `permissions` to grey a button
   is presentation. The platform refuses what must be refused, on its own routes.

### 0.2 Why the previous specification is withdrawn

`spec-plateforme-multitenant.md` targeted the same `2.0.0` and built tenants, users, memberships,
roles, TOTP, recovery codes, a session mechanism, a feature catalogue with local resolution, admin
screens and a PostgreSQL schema for all of it — 28 days of "this is a database project". Every one
of those is named in `backprod/docs/plan-service.md` §1 as something a product **must not**
implement. The document is kept, marked superseded, with a note saying what survived and where it
went. What survived is listed in §13.

### 0.3 The measured starting point

Verified on 22 September 2026, against the live hosts:

| Fact | Observed |
|---|---|
| `plan.raillard.org` | `401` with `WWW-Authenticate: Basic realm="Password protected"`, nginx |
| `plan1.raillard.org/plan.html` | `200`, 689 405 bytes, byte-identical to the `1.2.0` build |
| `plan1.raillard.org/api.php?action=list` | `200 application/json`, returns the project list **to anyone** |
| Security headers on either host | none of CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |
| `plan.html` cache policy | `Cache-Control: max-age=15552000` — 180 days on the application itself |

Two of these are defects to fix whatever happens with the platform. The unauthenticated project list
is the reason this specification exists. The 180-day cache on `plan.html` means a returning visitor
keeps an old application for half a year.

A third, found while fixing them: **`data/` is served by the web.** `api.php` keeps the projects
beside itself, inside the document root, so `GET /data/<id>.json` returned a whole project without
going through the API — 106 062 bytes in the clear.

All three are **fixed in the repository** and wait only to be deployed: `deploy/htaccess.template`,
completed at build time with the SHA-256 fingerprint of the inline script, closes `data/`, puts
`plan.html` on `no-cache` and sets the headers of §1. `npm run verifier-deploiement <host>` checks
all of it against a live host, and reported seven failures out of eleven on 22 September. The
content policy it carries already names every origin of §14.4, which is the part of §1 this
specification no longer has to ask for.

**The page is `index.html` since 24 September 2026, and the canonical address of Plan is the root
of its subdomain.** That is what the platform hands out: it stores an *origin* for the product
(`app_url`, no path, no filename), and the browser resolves a bare origin to the directory index by
default. While the page was called `plan.html`, that resolution rested on a single `DirectoryIndex`
line shipped inside a file that has to be redeployed at every build — lose it, or move to nginx or
a CDN, and the very address the platform distributes stops answering. The old address redirects
permanently and carries its query string, so a deep link `/plan.html?projet=<uuid>` still lands on
the project it names. Mentions of `plan.html` further down this document are observations dated
before the rename, and are left as they were written.

One thing deliberately did **not** follow: the literal `plan.html` inside what Plan exports — the
`/Creator` of both PDFs and `exportedBy` in the project JSON. It identifies the artefact, not a
URL, and it is frozen into two of the six witnesses. Renaming the served file leaves it untouched.

---

## 1. Deployment

```text
https://plan.raillard.org          Plan: one HTML file, served static
https://www.raillard.org           backprod: the shell and /api/v1
```

**Both hosts were settled on 22 September 2026**, and they satisfy the condition above by
construction: `plan` and `www` are siblings under `raillard.org`, so a request from one carries the
other's `SameSite=Strict` cookie. The platform is live —
`GET https://www.raillard.org/api/v1/auth/jwks` answers `200`.

- **A sibling subdomain of the platform's host, over HTTPS.** This is the condition for single
  sign-on: the platform's refresh cookie is `HttpOnly; SameSite=Strict; Path=/api/v1/auth` with no
  `Domain` attribute, and `SameSite=Strict` is a rule about the *site* (`raillard.org`). A request
  from `plan.raillard.org` carries it. A product on another registrable domain would not, and this
  specification does not cover that case.
- **Nothing asks for a second password in front of the page.** A browser challenged with
  `401 Basic` never reaches the application, and the platform's shell cannot send somebody to a
  page that asks again what they have already answered. This was written as a thing to remove,
  because `plan.raillard.org` once carried such a challenge; it no longer does — the check of
  22 September found the host answering `404` on `plan.html` and `403` on the root, and no
  `WWW-Authenticate` at all. The rule stays a rule and no longer describes this host.
- **`plan.raillard.org` is the target, and the only one this specification covers.** The `2.0.0`
  deployment goes there, beside `www.raillard.org`, and `verifier-deploiement` is pointed at it.
  `plan1.raillard.org` is where the `1.x` application still runs on its own `api.php`; the
  CHANGELOG records what was found there on 22 September — a project listing served to whoever
  asks, `data/` readable in the clear, no security header. Nothing here deploys to it, and what
  becomes of it is the operator's decision, not this document's.
- **Response headers**, on Plan's host, mirroring the platform's:

  ```text
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://<platform host> <IGN hosts>;
                           frame-ancestors 'none'; object-src 'none'; base-uri 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cache-Control: no-cache            (on plan.html)
  ```

  `connect-src` must name the platform origin, or every call from the page is blocked. It must also
  name the IGN and texture hosts, which the platform's own template does not — see §14.4.
  These headers are not a wish: they are `deploy/htaccess.template`, produced into `dist/.htaccess`
  by the build. What step 0 of §16 adds to it is the platform origin, and nothing else.
- **No CORS of Plan's own**: Plan serves one static file and calls only outward, and the platform
  allows the origin `https://plan.raillard.org` in its `CORS_ALLOWED_ORIGINS`.

---

## 2. Configuration

The bundle carries exactly two facts, both public:

```text
BACKPROD_API_URL=https://<platform host>       the platform's origin, no path
BACKPROD_PRODUCT_CODE=plan                     what X-Product says
```

They become build-time constants in `src/model/plateforme.ts`, beside `version.ts`, and they appear
in none of the six exported artefacts — an export must not change because the API moved.

A product key (`BACKPROD_PRODUCT_KEY=bpk_…`) and a webhook secret (`BACKPROD_WEBHOOK_SECRET=bwh_…`)
are **server-only**, and Plan has no server in `2.0.0` (§6, §8). They are therefore absent, and a
build gate proves it: `scripts/verifier-paquet.mjs` (`npm run verifier-paquet`) greps the built
`plan.html` for a product key, a webhook secret and a frozen session token, and fails on a hit. The gate runs while no key exists, so it cannot be forgotten the day one does.

> Settled on 22 September 2026: `BACKPROD_API_URL=https://www.raillard.org`. The value is the origin
> alone — the contract's paths are appended at runtime — and it reaches exactly two places, both
> produced by the same build: the bundle, and `connect-src` in the `.htaccess`. Changing it means
> rebuilding and redeploying **both files together**, never one without the other.

---

## 3. Identity and session

Plan's client is a client of the platform's contract. Its types and calls are generated from the
platform's `openapi.json` at a pinned commit, by a `gate:client` of Plan's own, so a field the
platform renames breaks Plan's build rather than a customer's afternoon.

### 3.1 Boot

`src/app/boot.ts` today starts with `loadInitialProject().then(boot)`. It becomes:

```text
page loads
  → POST /api/v1/auth/refresh        credentials: 'include', no request body at all
      200 → Session { access_token, token_type, expires_in } ; the token lives in memory only
      401 → nobody is signed in → the sign-in form (§3.2)
  → GET /api/v1/me/context           Authorization: Bearer …, X-Product: plan
      200 → who, which tenant, roles, permissions, capabilities, entitlements, usage
      403 NO_TENANT_ACCESS  → "this account holds no Plan"
      404 PRODUCT_NOT_FOUND → the same page; the product is not live on the platform
  → then, and only then, the zones mount
```

Nothing renders behind the gate before `/me/context` has answered. Nothing durable is written to the
browser: no token, no user id, no tenant id. `localStorage` keeps what it already keeps — the drawer
height under `plan.tiroir`, and later the language — and nothing that identifies anybody.

### 3.2 Signing in on Plan's page

`POST /api/v1/auth/token` with `{ email, password }` and `credentials: 'include'`, so the cookie the
platform sets is stored for the platform's host and the shell resumes from it too. Password rules
are the platform's — 12 to 72 characters — and Plan does not restate them, it relays the `422`. Plan
never stores the password and clears the field on failure. Forgot-password and address confirmation
stay the platform's screens, reached by an ordinary link.

### 3.3 Staying signed in, and leaving

- The access token is renewed through `/auth/refresh` 60 s before `expires_in` elapses. A `401` on
  any call triggers **one** renewal and **one** retry, then the sign-in form.
- Sign out is `POST /api/v1/auth/sign-out`, which answers **`204` with no body**. The platform clears
  the cookie and revokes the family. Plan forgets the token. There is no "sign out of Plan only".
- **A `401` arriving mid-session must never discard the user's plan.** The unsaved project stays in
  memory and the sign-in form appears over it. This was the single most important line of the
  withdrawn specification and it survives unchanged.

### 3.4 What `/me/context` answers

Nine top-level fields, all of them always present:

| Field | Shape | Plan reads it for |
|---|---|---|
| `user` | `id` (uuid), `email`, `display_name`, `locale` (`en`\|`fr`\|`es`\|`de`\|`it`) | the language, and the author of a project |
| `tenant` | `id` (uuid), `slug`, `name` | the organisation whose projects are listed |
| `product` | `id`, `code`, `name`, `app_url` | nothing in `2.0.0`; it confirms the context |
| `roles` | array of string (`TENANT_ADMIN`, `USER`) | **nothing** — Plan never branches on a role name |
| `permissions` | array of flat codes (`projects.read`, `projects.write`, …) | what this person may *do* |
| `capabilities` | array of feature codes (`plan.access`, …) | what this organisation has *bought* |
| `entitlements` | `feature`, `name`, `kind` (`BOOLEAN`\|`QUOTA`), `unit`, `limit`, `unlimited`, `source`, `valid_until` | what a quota allows |
| `usage` | `feature`, `name`, `unit`, `limit`, `unlimited`, `metered`, `used`, `remaining` | what is left of it |
| `token_expires_at` | RFC 3339 in the `…Z` form, nullable | how long the answer may be cached |

The answer is cached in memory until `token_expires_at`, and **not at all** when it is null. It is
never persisted. The platform's access token lasts one hour by default, not the fifteen minutes the
prose says (§14.2), so a membership revoked on the platform is honoured by Plan within the hour.
That is the platform's guarantee, and not Plan's to shorten or to lengthen.

---

## 4. What a person may do in Plan

### 4.1 Two questions, two sources

- **May this organisation use this at all?** A `capability`. The plan decides, so the answer was
  bought, and a missing one is answered by an upgrade.
- **May this person do it?** A `permission`. The role decides, so a missing one is answered by an
  administrator of the organisation.

Two refusals, two sentences, as the platform's shell says them. Plan never branches on a product,
plan or offer *name*, and never on a role name.

### 4.2 Where the check lives: the command registry

The `1.2.0` rebuild left exactly one place where an action is named and executed:
`src/app/commandes.ts`, 47 commands in 12 groups, every button in every zone going through
`executer(id)`. That is where a right attaches — to a command, never to a button.

```ts
// src/app/commandes.ts, extended
export interface Commande {
  id: string; libelle: string; groupe: string;
  executer(): void;
  /** Bought by the organisation. Absent: available to any tenant holding Plan. */
  capacite?: CodeCapacite;
  /** Granted to the person. Absent: no permission needed. */
  permission?: CodePermission;
}
```

`obtenir(id)` gains a resolved state, and the zones render it:

```ts
export type EtatCommande =
  | { utilisable: true }
  | { utilisable: false; raison: 'capacite' | 'permission' | 'quota'; message: string };
```

The display rule survives from the withdrawn specification, and it is worth keeping word for word:
**a capability the organisation never bought makes the command absent**, because a working tool
should not be an advertisement; **a permission the person lacks, or a quota that is spent, leaves
the command visible and explaining itself**, because the person can do something about it — ask an
administrator, or wait for the period to turn.

### 4.3 The first capability map

`plan.access` gates the application as a whole: without it, the "this account holds no Plan" page.
Beyond it, the capabilities Plan proposes for the platform's catalogue, each mapped to the commands
and the modules it governs. The mapping is the point: a capability that names no code is marketing.

| Capability | Commands | What it also stops the browser fetching |
|---|---|---|
| `plan.access` | all | — |
| `plan.cadastre` | `projet.depuisAdresse`, `projet.actualiserIgn` | `api-adresse.data.gouv.fr`, `apicarto.ign.fr`, the `data.geopf.fr` WFS |
| `plan.ortho` | `affichage.orthophoto` and its two sliders | the `data.geopf.fr` WMTS tiles |
| `plan.plu` | `plu.interroger` | the `apicarto.ign.fr` GPU calls |
| `plan.terrasse` | the seven `terrasse.*` commands, the five terrace tabs of the drawer | nothing — the engine is local |
| `plan.3d` | `vue.3d`, `visionneuse.*` | three.js r128 from cdnjs, `OrbitControls`, `GLTFLoader` and `GLTFExporter` from jsdelivr, the Poly Haven texture catalogue |
| `plan.export.dxf` | `export.dxf` | nothing |
| `plan.export.dossier` | `dossier.pdf` | nothing |

> **A capability does not make the bundle smaller, and the third column says so honestly.** The
> build produces one file: `vite-plugin-singlefile` inlines every chunk, including the ones behind a
> dynamic `import()` — `src/main.ts` already uses one and the built page still contains exactly one
> inline script and no remote script. So gating `export/dxf` hides the command and ships the code
> anyway. What a capability genuinely prevents is the **runtime fetch**: three.js and its three
> helpers never leave the CDN, the IGN calls never happen, the texture catalogue is never asked
> for. That is a real saving on a slow connection and a real reduction in what the page talks to,
> which is also why those origins are in the content policy (§1). It is not a saving on the
> download of the application itself, and a capability sold on that promise would be sold on a
> false one.

> **`engine/**` and `geometry/**` keep their purity rule: no entitlement check inside the engine.**
> A function that refuses to compute because of a licence is untestable. Gating happens in the
> command registry and on the platform's routes, nowhere else.

### 4.4 Permissions Plan uses

Plan needs two of the platform's tenant permissions, and registers no code of its own in `2.0.0`:

- `projects.read` — list and open. Without it, Plan shows an empty workspace that explains itself.
- `projects.write` — create, save, duplicate, delete. Without it Plan is a reader: every mutating
  command carries `permission: 'projects.write'` and greys with the administrator sentence.

---

## 5. Errors

Every failure has one envelope, whatever produced it:

```json
{ "error": { "code": "...", "message": "...", "details": {}, "request_id": "..." } }
```

`code`, `message`, `details` and `request_id` are all present; `details` is empty rather than
absent. **Plan branches on `code`, never on `message`**, and shows `request_id` in the error banner,
because it is the only thing a person can quote to the operator.

| Code | HTTP | What Plan does |
|---|---|---|
| `UNAUTHENTICATED` | 401 | one refresh, one retry, then the sign-in form |
| `NO_TENANT_ACCESS` | 403 | "this account holds no Plan", with a link to the platform's catalogue |
| `PRODUCT_NOT_FOUND` | 404 | the same page; the product is not live |
| `PRODUCT_CONTEXT_REQUIRED` | 400 | a bug in Plan: `X-Product` was not sent. Banner with `request_id` |
| `PERMISSION_DENIED` | 403 | the administrator sentence, naming `details.permission` |
| `ENTITLEMENT_REQUIRED` | 403 | the upgrade sentence, naming `details.capability` |
| `QUOTA_EXCEEDED` | **403** | the quota sentence, with `details.limit` and `details.used` |
| `VALIDATION_FAILED` | 400 | the field-level message from `details.field` |
| `SCHEMA_VERSION_REQUIRED` | 422 | a bug in Plan: the project envelope lost its schema version |

`QUOTA_EXCEEDED` is **403**, not the `409` that `plan-service.md` §5.4, §7 and §12 and ADR-051 §4
all state. The code decides: `backprod/src/Shared/Exceptions/ForbiddenException.php` hard-codes
`403` in its constructor and `quotaExceeded()` goes through it, so there is no path to a `409`. Plan
handles `403` and, defensively, treats a `409` carrying the same code identically — one line, and
Plan is right whichever way the platform later settles its documents.

---

## 6. Storage — Plan keeps no database

### 6.1 The decision

Plan's projects live in the **platform's** `projects` resource. `api.php`, `data/` and the flat JSON
files are retired.

The platform's `Project` is a summary plus a `document`, where `ProjectDocument` is
`{"type":"object","additionalProperties":true}` — an opaque JSONB document, key order preserved,
with a required integer `schema_version` enforced on write. That is, field for field, Plan's own
project envelope: `meta.schemaVersion`, `objects`, `measures`. The resource already offers versions,
assets, duplicate, soft delete, restore and undelete — the whole of what `spec-data-strategy.md` §4
designed, already built, already isolated per tenant.

```text
GET    /api/v1/projects                       → the tenant's list        (projects.read)
POST   /api/v1/projects                       { name, description?, schema_version, document } → 201
GET    /api/v1/projects/{id}                  → the project with its document
PATCH  /api/v1/projects/{id}                  → save  (PATCH, pas PUT : le contrat le dit)
POST   /api/v1/projects/{id}/duplicate
DELETE /api/v1/projects/{id}                  → soft delete: a date, not a cascade
GET    /api/v1/projects/{id}/versions         → history
```

`src/io/api.ts` is rewritten against these routes and keeps its shape, so `app/projet.ts` and the
project selector in `zones/BarreApplication.tsx` change only in what they call.

### 6.2 What this costs and what it buys

It buys the whole of §1 and §2 of the withdrawn specification: no schema to write, no migrations, no
row-level security to get right, no isolation suite to build, no backup drill of Plan's own. The
platform's rule — the tenant comes from the resolved context, and a path naming another tenant
answers `404` rather than `403` — is enforced on the platform's side, by the platform's tests.

It costs two things, both real:

1. **Plan cannot meter** (§7). Metering needs a product key, which needs a server.
2. **The document travels whole.** A project is about 72 KB today (`projet.json`, 71 974 bytes). The
   list route returns summaries, so the cost falls on open and save, not on the list. The sizing
   model of `spec-data-strategy.md` §3 still applies, on the platform's side of the wire.

### 6.3 Migrating what exists

One script, run once, before `2.0.0` goes live:

1. Read every file behind the current `api.php` on `plan1.raillard.org`.
2. `POST /api/v1/projects` for each, under the operator's own session, with `schema_version` taken
   from `meta.schemaVersion` and `name` from `meta.name`.
3. Print the id mapping, old to new: people may have bookmarked `?projet=<id>`.
4. Verify: the count matches, and ten projects round-trip to a byte-identical document.
5. Keep the flat files read-only for 90 days, then remove them with the host.

---

## 7. Metering

**Plan meters nothing in `2.0.0`, and therefore sells boolean capabilities only.** This is a
legitimate offer — access alone is a product — and it is what a frontend-only product can honestly
support: metering from the browser is forbidden, because a count the customer can edit is not a
count.

This has a consequence the operator must see before pricing anything. **A quota on the number of
plan documents is enforced by nobody today.** The platform's own `POST /api/v1/projects` gates on
the permission `projects.write` and on the resolved context, and checks no entitlement — verified in
`backprod/src/Project/Controller/ProjectRoute.php` and `CreateProjectController.php`. A
`plan.documents` quota sold on the platform would be advertised and never applied.

Three ways out, in the order they deserve consideration:

1. **Sell no quota.** Boolean capabilities only. Nothing to build, and the honest position for
   `2.0.0`.
2. **The platform gates its own resource.** Since the platform owns `projects`, that is the natural
   place: one entitlement check in `CreateProjectController`, and every product gets quotas for
   free. This is a change to the platform, not to Plan, and it is the right one.
3. **Plan grows a server** (`plan-api`) holding `BACKPROD_PRODUCT_KEY`, creating the project only
   after a `2xx` from `POST /api/v1/product/tenants/{tenantId}/usage`, with an `idempotency_key`
   derived from the fact itself (`<project id>:created`). This is the shape `plan-service.md` §7
   describes, and it re-introduces the deployment Plan has just shed.

This specification recommends 1 for `2.0.0`, and 2 as the platform's next step. If 3 is ever taken,
note that the usage route answers `201` when it recorded and `200` when the idempotency key was
already known, and that `QUOTA_EXCEEDED` there also means "this tenant holds no quota on this
feature at all", arriving with `limit: 0, used: 0` — indistinguishable from a real zero quota.

---

## 8. Events

**Plan receives no webhook in `2.0.0`**, because a webhook needs a server. Everything the events
carry, Plan already reads live from `/me/context` at every session, which is why the platform's own
table says `subscription.started` has nothing to unlock.

What is lost by not having them is freshness only: a subscription that ends mid-session is honoured
by Plan at the next context read, within the hour, rather than within seconds. That is written here
so it is a decision and not an oversight.

When a `plan-api` exists, the contract it must implement is fixed, and worth recording now:

- **Endpoint:** `POST https://plan.raillard.org/api/v1/plan/platform-events`, HTTPS only; the
  platform never follows a redirect.
- **Header:** `X-Backprod-Signature: t=<unix>,v1=<hex>[,v1=<hex>]`, no spaces. Two `v1` values during
  a rotation, which overlaps for 24 hours.
- **Scheme:** `hash_hmac('sha256', "<t>.<raw body>", secret)`, lowercase hex, constant-time compare,
  any one `v1` matching being enough. The **raw bytes as received**, never a re-serialised body.
- **Window:** refuse when `|now − t| > 300 s`. `t` is the moment of *this attempt*, not of the event,
  so a delivery retried a day later still carries a fresh `t`. Note that 300 s is the product's
  convention: the platform defines no outbound tolerance of its own.
- **Also sent:** `X-Backprod-Event: <type>`, `X-Backprod-Delivery: <id>`,
  `User-Agent: backprod-webhooks/1`.
- **Answer within 10 s.** Any `2xx` counts as delivered. Retries back off `60, 600, 3600, 21600,
  86400` seconds and then park. **A `400` parks at once**, so a `400` is for a signature that does
  not verify and for nothing else.
- **Envelope:** `event_id`, `type`, `occurred_at` (RFC 3339 with a numeric offset, not `Z`),
  `product`, `tenant_id`, then the event's own keys, flat at the top level.
- **Nine types:** `subscription.started`, `subscription.changed`,
  `subscription.cancellation_scheduled`, `subscription.ended`, `member.added`, `member.removed`,
  `tenant.product.assigned`, `tenant.product.unassigned`, `user.erased`.
- **Idempotency:** store `event_id` before the handler runs; a second delivery of a known id answers
  `200` and does nothing.
- **`user.erased`** is the one event that cannot be replaced by reading context: Plan must blank
  every copy of that person's name and email it holds, and answer `200` only once that is done. In
  `2.0.0` Plan holds no such copy, which is the second reason it needs no webhook.

---

## 9. Language

The platform speaks five languages with English as the catalogue key. Plan speaks French, and its
domain vocabulary is French on purpose — `lambourde`, `entraxe`, `débit`, `plot` are the words a
French carpenter uses, and translating them would make the tool wrong in its own trade.

The two positions are compatible, and the rule is written here so nobody has to re-derive it:
**the interface is translatable, the domain is not.** Labels, menus, messages and refusals go through
`t('English sentence')` when `2.1.0` adds it; the names of the parts of a terrace stay French in
every language, the way a German decking catalogue keeps `Lattung`. `user.locale` from `/me/context`
chooses the interface language unless `?lang=` named one. Plan offers no language setting of its
own: that is the platform's profile screen, one click away.

---

## 10. What Plan must never do

- Hold, log, or put in a URL a platform token, a product key or a webhook secret; ship any of them
  in the bundle.
- Keep its own users, passwords, roles or memberships; keep a copy of an entitlement as authority.
- Decide by product, plan or offer *name*, or by role name; decide by capability and permission code.
- Write a project without the tenant from the resolved context; read across tenants.
- Meter from the browser, or sell a quota nobody enforces.
- Persist a token, a user id or a tenant id in `localStorage`.
- Discard an unsaved plan because a call came back `401`.

---

## 11. What the operator does, once

1. **Console → Products:** create `plan`, assign it to the tenants that will use it, set
   `app_url = https://plan.raillard.org`.
2. **Console → Catalogue for `plan`:** the capabilities of §4.3 as boolean features, at least one
   plan, one offer, one published version, advertised.
3. **Platform `.env`:** `CORS_ALLOWED_ORIGINS` gains `https://plan.raillard.org`.
4. **Deploy to `plan.raillard.org`** — the target, and the only host this specification covers —
   with the headers of §1 and `Cache-Control: no-cache` on `plan.html`. ~~Remove the basic
   authentication.~~ There is none: the host answers no `WWW-Authenticate`, and the check of
   22 September found `404` on `plan.html`, which is the state of a host with nothing deployed
   rather than one behind a password.
5. ~~Put basic authentication in front of `plan1.raillard.org`.~~ Out of scope: `plan1` runs the
   `1.x` application on its own `api.php` and nothing here deploys to it (§0.3). What it holds and
   what becomes of it are the operator's to decide — the CHANGELOG says what was found there.
6. ~~Decide the platform's production host.~~ Done: `https://www.raillard.org`. What remains of
   this step is point 3 above — on 22 September 2026 the platform still answered a preflight from
   `https://plan.raillard.org` **without** `Access-Control-Allow-Origin`, so every call from Plan's
   page would be blocked by the browser.

No product key and no webhook secret are issued for `2.0.0`: Plan has no server to put them in, and
a secret issued for nobody is a secret to leak.

---

## 12. Definition of done

- **Contract.** Plan's generated client matches the platform's `openapi.json` at the pinned commit;
  `gate:client` fails on a renamed field before a customer does.
- **Single sign-on, end to end against a staging platform.** Sign in on the platform, open Plan →
  signed in. Sign in on Plan, open the platform → signed in. Sign out on either → out on both. A
  session that lapsed overnight lands on the form, not on a page of errors.
- **Refusals.** A person without `plan.access` sees the upgrade sentence. A person without
  `projects.write` sees the administrator sentence and a read-only Plan. A tenant not holding Plan
  gets the "holds no Plan" page. Each refusal shows its `request_id`.
- **The plan survives a `401`.** Provoked mid-edit with unsaved changes: the form appears, and the
  work is still there after signing back in.
- **Projects.** Create, open, save, duplicate, delete, restore, and a version list, all against the
  platform. A project id belonging to another tenant answers `404`.
- **Migration.** Every existing project imported, the mapping printed, ten round-trips byte-identical.
- **Bundle.** No `bpk_`, no `bwh_`, no token in the built `plan.html`; the headers of §1 present on
  the live host; `plan.html` no longer cached for 180 days.
- **The six golden artefacts are unchanged.** Connecting to a platform must not move a byte of an
  export. This is the one line of `RELEASE.md` §2.1 against which the whole release is measured.
- **The smoke checklist passes 25/25**, with the sign-in step added in front of it.

---

## 13. What survived from the withdrawn specification

Kept, and where it went:

| From `spec-plateforme-multitenant.md` | Now |
|---|---|
| §3.1 the feature catalogue, keys mapped to code regions | §4.3, rewritten against the command registry |
| §3.3 absent, versus disabled and explaining itself | §4.2, unchanged in substance |
| §2.9 a `401` must not discard the user's plan | §3.3, unchanged |
| §1.4 the tenant comes from the session, `404` not `403` | §6.2, now the platform's to enforce |
| §4.1 the SVG plan does not read the CSS tokens | §14.1 — still true, still unfixed, no longer in `2.0.0` |

Withdrawn entirely: §1.1–§1.3 (entities, roles, the PostgreSQL schema), §2 (passwords, TOTP,
recovery codes, the login state machine, step-up re-authentication), §3.2 (local resolution of
entitlements), §3.5 and §5 (admin screens and routes), §4.2–§4.5 (branding), §7.1 (the isolation
suite), §9 (the 28 + 17 + 14 days of effort).

---

## 14. Known hazards

These are real and must not be papered over.

1. **The plan's colours are decided once, at load.** `src/render/theme.ts` computes `SVG_INK` and its
   siblings from `prefers-color-scheme` at module level. The SVG plan therefore ignores the page's
   CSS custom properties, and no theme change — system, tenant or otherwise — reaches the plan, the
   north arrow, the scale bar or the measure lines without a reload. Any future branding work starts
   here. It is **not** in `2.0.0`.
2. **The access token lasts one hour, not fifteen minutes.** `plan-service.md` §6.1 and ADR-051 §1
   both say about fifteen; `LocalJwtTokenIssuer::DEFAULT_LIFETIME` is `3600`. Size nothing on the
   prose: use `token_expires_at`.
3. **`409` against `403` for `QUOTA_EXCEEDED`** — §5. The documents say `409` in five places and the
   code says `403`.
4. **`connect-src 'self' https://<platform host>` is not enough.** Plan calls IGN for the cadastre,
   the orthophoto tiles and the PLU, and Poly Haven for textures. Each origin must be named in the
   CSP, or the feature dies silently in production while working in development, where no CSP is
   set. This is the most likely way to ship a broken release.
5. **`/me/context` under-declares its errors.** The contract lists `401`, `403`, `429` and `500`;
   `400 PRODUCT_CONTEXT_REQUIRED` and `404 PRODUCT_NOT_FOUND` are reachable, and Plan's "holds no
   Plan" page depends on telling `403` from `404`. The generated client will not model them, so Plan
   handles them by code anyway.
6. **Three different shapes are called `usage`.** The `Entitlement` schema has no `usage` field; a
   sibling top-level `usage` array on `/me/context` carries `used`, `remaining` and `metered`; and
   the `product/*` entitlements route returns a third `usage` array declared as objects with no
   properties at all. Plan reads the `/me/context` one and ignores the others.
7. **`X-Product` cannot be sent by a strictly generated client on the auth routes.** `signIn` and
   `refreshSession` both describe behaviour that depends on it — it becomes the second `aud` — but
   neither declares the parameter. Plan sends it by hand on those two calls, with a comment saying
   why.
8. **`X-Tenant` is typed `uuid` but a slug is accepted.** Plan sends the uuid.
9. **`PRODUCT_KEY_INVALID` does not exist.** ADR-051 §4 names it; the platform answers
   `401 UNAUTHENTICATED`. This only matters if Plan ever grows a server.
11. **A project stored on the platform carries an identity, and `projet.json` says so.** The golden
    was captured from the demo fallback, where `meta` is `{id: null, name: "Plan interactif",
    updatedAt: null}`. A project on the platform has a uuid, its own name and a real
    `updated_at` — 57 bytes more. The other five artefacts are **bit for bit identical**, measured
    on 22 September 2026 from a project migrated out of `plan1.raillard.org`. Nothing computed
    moved; what moved is that a project now exists somewhere and has a name. Recapturing the
    `projet.json` golden belongs to the `2.0.0` release ceremony, with this as its stated reason.
12. **`jsonb` does not preserve key order, whatever the contract says — and it does reach an
    export.** `ProjectDocument` promises "Key order is preserved"; PostgreSQL reorders them by key
    length then alphabetically, and a round trip of the demonstration plan came back the same
    41 693 bytes with a first divergence at character 31.

    This paragraph said the reordering stopped at the database, because `projet.json` is written by
    Plan's serialiser from the model in memory. That was half true and therefore wrong: the
    serialiser copies some nested objects **as they are** — `clotureTexture` is one — so their keys
    come out in PostgreSQL's order. Recapturing the golden on 23 September 2026 showed exactly
    that, `vignette` and `url` having swapped places.

    It costs nothing, because the order is deterministic and the content is identical once sorted,
    but it means a golden captured before the platform cannot be compared byte for byte with one
    captured after. The migration script compares canonical forms for the same reason.

10. **Two timestamp formats in one integration.** `token_expires_at` ends in `Z`; `valid_until` and
    the webhook `occurred_at` carry a numeric offset. Both are RFC 3339; a strict parser configured
    for one fails on the other.

---

## 15. Open decisions

| # | Decision | Who |
|---|---|---|
| 1 | ~~The platform's production host.~~ **Settled 22/09/2026: `https://www.raillard.org`, with Plan at `https://plan.raillard.org`.** | done |
| 2 | Quotas: sell none, or gate the platform's own `projects` route (§7). | **✅ 22/09/2026** — `plateforme/contexte.ts`, `zones/Porte.tsx`, `app/porte.ts` ; les trois refus releves contre la plateforme (`403 NO_TENANT_ACCESS`, `404 PRODUCT_NOT_FOUND`, `400 PRODUCT_CONTEXT_REQUIRED`), chacun avec son `request_id`. **Il n'existe pas de capacite `plan.access`** : c'est le `200` qui vaut acces |
| 3 | Branding. Neither `plan-service.md` nor ADR-051 covers a product's own theme. Is a tenant's palette the platform's to publish, and where would a product read it? | **✅ 22/09/2026** — `capacite`, `permission`, `quota` et `EtatCommande` sur le registre ; `projects.write` sur les quatre commandes qui ecrivent, `plan.documents` sur les deux qui creent. Lacune nommee : le monde de demonstration n'a aucun compte en lecture seule, donc le refus de permission n'est prouve que par les tests |
| 4 | Whether `subscription.cancellation_scheduled` is ever published. The mapping names it; ADR-051 §5's own list omits it. Only matters once Plan has a server. | **✅ 22/09/2026** — `io/depotPlateforme.ts`, `api.php` et `data/` retires, drapeau supprime du code (le build refuse une origine vide). Projet reel migre depuis `plan1.raillard.org` : **cinq des six artefacts bit pour bit identiques** depuis un projet stocke par la plateforme ; `projet.json` gagne 57 octets, qui sont l'identite du projet (§14.11) |
| 5 | Whether Plan registers permission codes of its own, or keeps borrowing `projects.read` and `projects.write`. | **◐ 22/09/2026, le mecanisme mais pas les codes** — `plateforme/capacites.ts` nomme les sept capacites, leurs commandes et les origines que chacune fait taire ; un test prouve qu'une commande refusee n'execute rien, donc n'appelle rien. **Aucun code n'est attache**, et c'est deliberé : le catalogue de la plateforme ne les porte pas, `/me/context` ne distingue pas « pas achete » de « pas au catalogue », si bien qu'attacher `plan.3d` aujourd'hui retirerait la vue 3D a tous les locataires. Depend de l'etape 2 de §11. Constat au passage : la vue 3D est un bouton de mode et non une commande, donc la seule capacite au gain reseau reel n'a aucune prise avant qu'on en fasse une commande |

---

## 16. Order of work

Seven steps, each leaving the application usable and the six exported artefacts untouched. The
invariant is the one every release in this repository is measured against: **connecting to a
platform must not move a byte of an export.** A step whose empreintes move has done something it
was not asked to do, and stops there.

### 16.1 The switch that makes it incremental

Steps 0 to 3 ship while the platform may not yet hold the product. They are made shippable by one
rule, and one only:

> **When `BACKPROD_API_URL` is empty, Plan behaves exactly as `1.2.0` did** — no sign-in, no
> context, projects through `api.php`.

That keeps every step deployable and every step reversible. It is also a trap, and the specification
says so before anybody builds it: a deployment that forgets to set the variable keeps the open
`api.php` and the open `data/` of §0.3. **The switch is therefore temporary and is deleted in step
4** — removed from the code, not merely set in the configuration. A release that ships step 4 with
the switch still present has not shipped step 4.

### 16.2 The steps

| Step | Deliverable | What moves | Proof |
|---|---|---|---|
| 0 | The contract in the build | `src/plateforme/` generated from the platform's `openapi.json` at a pinned commit; `gate:client`; the two build-time constants; the platform origin joins `connect-src` in `deploy/htaccess.template` | **✅ 22/09/2026** — `contrat/` pinned at backprod `ce0642c`, 13 operations, 7 schemas; `src/plateforme/contrat.ts` generated, `src/plateforme/config.ts`; `npm run gate:client` and `npm run verifier-paquet`; 582 tests; **the built file is byte-identical to the `1.2.0` artefact**, so nothing on screen and no empreinte moved |
| 1 | The session, with no gate in front of it | `plateforme/session.ts`: refresh with `credentials: 'include'`, token in memory, renewal 60 s before expiry, one retry on `401`. No screen depends on it yet | **✅ 22/09/2026** — `plateforme/session.ts` ; eprouve contre la plateforme lancee en local : ouverture, cookie, reprise, `401` rattrape en un renouvellement, fermeture qui revoque la famille. Fichier livre identique au bit pres a la `1.2.0` |
| 2 | The gate | The sign-in form; the "this account holds no Plan" page; `/me/context` read once and cached until `token_expires_at` | Single sign-on both ways against a staging platform; sign out on either signs out of both; a lapsed session lands on the form. `403` and `404` tell apart. Each refusal shows its `request_id` |
| 3 | Rights on the command registry | `capacite` and `permission` on the 47 commands; `EtatCommande`; the two sentences; absent versus visible-and-explaining | A person without `projects.write` gets a read-only Plan; a tenant without a capability does not see the command at all. Empreintes — **nothing a right touches may reach an export** |
| 4 | Projects move to the platform | `io/api.ts` rewritten against `/api/v1/projects`; the migration script; `api.php` and `data/` removed from the host; **the switch of §16.1 deleted** | Create, open, save, duplicate, delete, restore, versions. A project id from another tenant answers `404`. Migration: count matches, ten round-trips byte-identical, mapping printed. The smoke checklist 25/25 with sign-in in front. Empreintes |
| 5 | What a capability really stops | The CDN loads behind `plan.3d`; the IGN calls behind `plan.cadastre`, `plan.ortho`, `plan.plu`; the texture catalogue | Network observed: with the capability absent, not one request leaves for that origin. With it present, the feature works as it does today |
| 6 | The host opened | `.htaccess` deployed; basic authentication removed from `plan.raillard.org`; the shell's `app_url` points at it | **◐ 22/09/2026, cote depot** — `.htaccess` produit par le build avec l'origine de la plateforme dans `connect-src` ; `npm run verifier-deploiement` reecrit pour la `2.0.0` : il refuse desormais un hote qui sert encore `api.php` ou `data/`, et verifie que `connect-src` nomme l'origine du paquet servi. **Le depot des fichiers et le retrait de l'authentification basique restent a l'operateur** : releve du 22/09/2026 a 17 h, `plan.raillard.org/plan.html` rend `404` et `plan1.raillard.org` rend `401` |

### 16.3 What has to be true before steps 2 and 5

Neither step 0 nor step 1 needs anything from the operator. **Two steps do, and they are the two
that look most like code and are least like it.**

**Step 2** needs the product `plan` created and assigned, and `https://plan.raillard.org` in the
platform's `CORS_ALLOWED_ORIGINS`. It does **not** need a `plan.access` capability: that code does
not exist, and a `200` from `/me/context` is what grants access (§4.1).

**Step 5 needs the capabilities of §4.3 to exist in the catalogue**, and this is the harder
dependency, because it is invisible until it bites. `/me/context` reports what a tenant holds; it
does not report what the catalogue defines. A code that is absent from `capabilities` therefore
reads identically whether the organisation declined it or nobody ever created it. Attaching
`plan.3d` before the catalogue carries it would not gate a new feature — it would remove the 3D
view from every tenant already using it. So step 5 ships its mechanism and holds its codes, and the
order is not arbitrary: it is the work that does not wait on anybody, done first.

### 16.4 Where this order can go wrong

- **Step 4 is the only hard cutover.** Projects cannot live half here and half there, so it is one
  step, done once, with the migration verified before the old files are removed and kept read-only
  for 90 days afterwards (§6.3).
- **Step 3 before step 4, not after.** Gating commands while storage is still local is safe; gating
  them while storage is moving means two unfinished things in one release.
- **Step 5 last among the code steps**, because it is the one that changes what the page fetches,
  and a network change is easiest to judge when nothing else moved.
- **Step 6 needs the content policy of step 0.** The platform origin has to be in `connect-src`
  before the first real call, and the developer server sends no policy at all, so this is the
  failure that only appears in production (§14.4).

---

## 17. Effort, and what it does to the roadmap

| Step | Days |
|---|---|
| Generated client, `gate:client`, the two build-time constants | 3 |
| Boot, sign-in form, renewal, the `401` rule | 4 |
| `/me/context`, capabilities and permissions on the command registry, the two refusal sentences | 4 |
| `io/api.ts` against the platform's projects; `api.php` and `data/` retired | 4 |
| Capability gating of the remote loads: the CDN scripts, the IGN calls, the texture catalogue | 2 |
| The host: headers, cache policy, basic authentication removed | 1 |
| The migration script and its verification | 2 |
| The definition of done (§12), including the smoke checklist with sign-in | 3 |
| | **23** |

Against the withdrawn plan's **45 days** for `2.0.0` and `2.1.0` together — and `2.2.0`'s 14 days of
branding leave the roadmap entirely, since nobody has yet decided that a product may be themed.

The larger effect is further out. `roadmap.md` §3 puts packages, payment and invoicing in H2, and
gates H1 on "`tenant_usage` metering in production" and "at least two real tenants". All three
belong to the platform now. **H2 as written is not this repository's work**, and the H1 exit criteria
must be rewritten to what Plan can actually prove: the six artefacts unchanged, single sign-on
working both ways, refusals correct, and one real tenant using Plan through the platform. That
rewrite is part of this release, not a follow-on.
