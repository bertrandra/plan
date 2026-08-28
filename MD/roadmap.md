# Roadmap — Plan interactif

**Version:** 1.0 — proposal for review
**Horizon model:** H1 run · H2 grow · H3 transform
**Companions:** `architecture.md`, `spec-migration-typescript.md`, `spec-plateforme-multitenant.md`, `spec-data-strategy.md`, `RELEASE.md`

---

## 1. How to read this

Three horizons, defined by **confidence and dependency**, not by calendar. H1 is fully specified and low-risk. H2 is specified in shape and needs commercial decisions. H3 is a thesis with a gate in front of it.

| Horizon | Question it answers | Confidence | Investment |
|---|---|---|---|
| **H1 — Run** | Can the product be operated, sold to more than one organisation, and changed safely? | High — fully specified | **70 %** |
| **H2 — Grow** | Can it charge for itself, legally and reliably? | Medium — mechanics known, packaging is a business decision | **20 %** |
| **H3 — Transform** | Can it produce something no competitor can, from geometry it already owns? | Low — thesis, gated by a spike | **10 %** |

The horizons **overlap in time**. H3 exploration starts during H2; the 70/20/10 split is of capacity, not of calendar.

**Why commerce sits ahead of GenAI.** Two dependencies, both hard:

1. Packages are bundles of feature entitlements. The catalog is built in H1; without it, packaging has nothing to bundle.
2. AI rendering has a **real marginal cost per image**. Shipping it without metering, quotas and prepaid credits means an unbounded cost line with no revenue attached. H2 builds exactly that machinery.

Reversing the order is possible but means building throwaway quota plumbing for H3 and then rebuilding it for H2.

---

## 2. Baseline — where we are

| Dimension | Today |
|---|---|
| Product | Working plan editor, structural terrace engine, 3D view, 7 export formats |
| Codebase | One 13 487-line HTML file, no build, no tests, no types |
| Users | Single-user, no authentication |
| Commercial | None — no packaging, no billing |
| Data | Flat files behind `api.php` |
| Deployment | Copy one file |

The domain engine is the asset. Everything else is scaffolding to be built.

---

## 3. H1 — Run (releases 1.1.0 → 2.3.0)

Fully specified in the companion documents. Compressed here for sequence only.

| Release | Outcome | Effort |
|---|---|---|
| `1.1.0` | TypeScript, modular, tested, strict — zero behaviour change | 54 d |
| `2.0.0` | Backend, sessions, TOTP MFA, tenancy with three-layer isolation, data migration | 28 d |
| `2.1.0` | Feature catalog, entitlements, server-side enforcement, quotas, admin screens | 17 d |
| `2.2.0` | Tenant branding, including the SVG token rework | 14 d |
| `2.3.0` | PDF logo, platform console, PostGIS, audit automation | 11 d |
| | **Total H1** | **~124 d** |

**H1 exit criteria — the gate to H2.** All must hold:

- [ ] Cross-tenant isolation suite green; RLS verified on every tenant-scoped table
- [ ] Golden fixtures byte-identical across the whole migration
- [ ] Feature catalog live, with server-side enforcement tested on every gated endpoint
- [ ] `tenant_usage` metering in production and observed to be accurate
- [ ] At least **two real tenants** in production, one of them external
- [ ] Backup restore drill passed

The two-tenant condition matters more than the rest. Packaging designed without a second customer is packaging designed against an imagination.

---

## 4. H2 — Grow: service packages, payment, invoicing

**Goal:** turn the feature catalog into a commercial offer, collect money reliably, and issue invoices that are legal in France in 2027.

### 4.1 Packaging model

A **package** is a named bundle of feature entitlements and quotas. This is why the catalog was built as data (`architecture.md` P8): packaging becomes configuration, not code.

```sql
create table packages (
  id uuid primary key, code text unique not null,      -- 'essentiel', 'pro'
  name text not null, description text,
  price_cents int not null, currency char(3) not null default 'EUR',
  billing_period text not null check (billing_period in ('month','year')),
  seat_model text not null check (seat_model in ('flat','per_seat')),
  included_seats int, public boolean not null default true,
  active boolean not null default true
);

create table package_features (
  package_id uuid references packages(id) on delete cascade,
  feature_key text references features(key),
  quota int,                                            -- null = unlimited
  primary key (package_id, feature_key)
);
```

Illustrative offer — **the numbers are placeholders for a pricing exercise, not a recommendation**:

| | Découverte | Essentiel | Pro | Entreprise |
|---|---|---|---|---|
| Price | free, 30 d | ~€29 /mo flat | ~€79 /mo per seat | on quote |
| Projects | 3 | 50 | unlimited | unlimited |
| Plan editor, measures, SVG/PNG/PDF | ✔ | ✔ | ✔ | ✔ |
| Terrace engine, débit | watermarked | ✔ | ✔ | ✔ |
| Cadastre import | 3 / mo | 20 / mo | 100 / mo | unlimited |
| PLU, orthophoto, voisinage | — | ✔ | ✔ | ✔ |
| DXF, PDF dossier | — | — | ✔ | ✔ |
| 3D view, GLB export | — | — | ✔ | ✔ |
| Optimiser, chantier | — | — | ✔ | ✔ |
| Custom branding | — | — | — | ✔ |
| SSO, audit log | — | — | — | ✔ |
| AI renders *(H3)* | — | credits | 20 / mo + credits | negotiated |

Two design rules:

- **The per-tenant override layer survives.** Entitlement resolution becomes `package → tenant_features override → role → quota`. A sales exception ("give them DXF for six months") must never require inventing a new package.
- **Downgrade never destroys data.** Losing `view.3d` hides the tab; the projects, their geometry and their BOMs remain intact and exportable. Losing a seat suspends a membership, it does not delete a user's work.

### 4.2 Payment

**Recommendation: Stripe Billing + Stripe Checkout + Customer Portal.**

| Requirement | Why Stripe |
|---|---|
| SCA / 3-D Secure (PSD2) | Handled in the hosted flow; building it is a project in itself |
| **SEPA Direct Debit and virement** | Essential — French SME B2B does not run on cards. This is not optional for the target market. |
| PCI scope | Hosted Checkout keeps the organisation at SAQ-A; card data never touches our infrastructure, consistent with the platform's "never handle credentials" posture |
| Dunning, proration, trials, coupons | Built-in and battle-tested |
| Tax determination | Stripe Tax handles FR 20 % VAT, EU B2B reverse charge with VIES validation, OSS for B2C |

Architecture:

- **Webhooks are the source of truth** for subscription state, not the checkout redirect. Handlers idempotent by `event.id`, every event persisted in `billing_events` before processing, with a nightly reconciliation job against the provider.
- Subscription state machine: `trialing → active → past_due → unpaid → canceled`. Entitlements follow state.
- **Failure design (P10).** If the payment provider is unreachable, entitlements resolve from the last known good state for a 72-hour grace window. A billing outage must never lock a user out of a plan they are drawing. Past-due tenants degrade to **read-only** — open, view, export; no editing, no new projects — never to deletion.
- `billing_accounts` is a separate entity from `tenants`: one legal entity may pay for several tenants, and the invoice is issued to the legal entity.

### 4.3 Invoicing — the French constraint, and it is a hard one

This is the part of H2 that cannot be deferred on preference, because it has statutory dates.

**Facts as of August 2026:**

- From **1 September 2026**, every French VAT-registered business must be able to **receive** electronic invoices, regardless of size — including micro-entrepreneurs.
- **Issuing** electronic invoices is mandatory from **1 September 2026** for large companies and ETI, and from **1 September 2027** for PME, TPE and micro-enterprises.
- Invoices between French VAT-registered businesses must transit through a **Plateforme Agréée (PA)** — the former "PDP" terminology. The Portail Public de Facturation is no longer a general-purpose issuing route.
- Accepted structured formats: **Factur-X, UBL 2.1, CII**, all conforming to EN 16931.
- The obligation covers domestic B2B and the public sector. B2C is out of scope for e-invoicing but in scope for **e-reporting**.

*(Verify against impots.gouv.fr before committing the H2 plan — this reform has been postponed several times and the entry date can still be shifted by a quarter by decree.)*

**The consequence for this roadmap:**

> Do not build an invoice PDF generator and consider invoicing done. A PDF is no longer a compliant B2B invoice in France. Any French business customer billed after September 2027 needs a structured invoice routed through an approved platform.

Two viable routes:

| Route | Shape | Fits when |
|---|---|---|
| **A — Stripe + a PA connector** | Stripe owns subscriptions, payments and tax determination; a Plateforme Agréée issues and routes the legal invoice (Factur-X) from Stripe's invoice data | International ambitions, higher volume, engineering capacity available |
| **B — A French PA-integrated billing suite** | A single French provider that is itself an approved platform handles invoicing and compliance; Stripe used only as a payment rail | Low volume, mostly French customers, minimal engineering budget |

**Recommendation: decide this in the first two weeks of H2**, because it determines the data model. Route A means owning `invoices` and `invoice_lines` internally; Route B means the provider owns them and the platform holds only references. Reversing that choice later is a data migration plus a compliance re-certification.

Non-negotiable invoicing rules regardless of route:

- **Sequential, gapless numbering** per legal entity. Never reused, never reordered.
- **Invoices are immutable once issued.** A correction is a credit note (`avoir`), never an edit. Same principle as the audit log.
- **10-year retention** with integrity guarantees (French commercial code).
- Mandatory fields: SIREN/SIRET, VAT numbers of both parties, VAT breakdown by rate, payment terms, late-payment penalties, the €40 recovery indemnity.
- **e-reporting** of B2C and cross-border transactions, on the same cadence.

### 4.4 Metering — the continuity payoff

`tenant_usage` already exists from H1 for quota enforcement. In H2 it becomes the billing meter:

```
usage_records ──▶ monthly aggregation ──▶ subscription_items (metered)
                                      └─▶ credit_ledger (prepaid packs)
```

Metered lines in H2: cadastre imports, PLU queries, orthophoto tile batches, and — from H3 — AI renders. Prepaid credit packs (`credit_ledger`, debit-only, never negative) suit the AI use case better than post-paid metering: a customer surprised by a €400 bill for renders is a churned customer.

### 4.5 H2 architecture impact

- **A new bounded context, `billing/`**, deliberately isolated. Only the entitlement resolver reads from it; nothing else in the application knows that money exists.
- Entitlement resolution must remain a **pure function** of `(package, overrides, role, quota, subscription_state)` — a fitness function asserts this, so pricing can be tested without a payment provider.
- The worker gains scheduled jobs: renewal, dunning, monthly aggregation, invoice issuance, e-invoice submission and its acknowledgement.
- New audit actions: `subscription.*`, `invoice.*`, `payment.*`, `credit.*`.
- **`billing/` never touches `projects.data`.** Money and plans stay disjoint.

### 4.6 H2 effort and risks

| Workstream | Effort |
|---|---|
| Packaging model, entitlement resolution rework, admin screens | 12 d |
| Stripe integration, webhooks, state machine, portal, dunning | 14 d |
| Invoicing + PA integration (route A) — or provider integration (route B) | 18 d / 8 d |
| Metering, credit ledger, monthly aggregation | 8 d |
| Compliance work: numbering, retention, e-reporting, mandatory fields | 7 d |
| **Total** | **~59 d** (route A) / **~49 d** (route B) |

| Risk | Sev | Mitigation |
|---|---|---|
| Compliance deadline missed → cannot legally bill French B2B | **High** | Decide route in week 2; PA contract signed before build starts; deadline is Sept 2027, so H2 must complete by Q1 2027 |
| Billing outage locks users out | High | 72 h grace on cached entitlements; read-only degradation, never lockout |
| Entitlement logic duplicated between package and override | Medium | Single pure resolver + fitness function |
| Pricing set before understanding usage | Medium | H1 metering runs for ≥ 3 months before prices are fixed |
| Provider lock-in | Medium | Own the `packages`/`entitlements` model; the provider owns payment mechanics only |
| Refunds, proration and mid-cycle changes get messy | Medium | Delegate entirely to the provider; never compute proration in-house |

---

## 5. H3 — Transform: photorealistic view rendering with generative AI

### 5.1 The thesis

Turn a terrace design into a photorealistic image a client can react to — in seconds, from geometry the application already has.

**Why this product is unusually well placed.** Every competing AI-rendering tool starts from a photograph or a screenshot and must *estimate* depth, inheriting every error of that estimation. Hallucinated geometry — a terrace that changes shape between renders — is the known failure mode of the category. This application does not have that problem, because it already owns:

| Asset | Already exists | What it yields |
|---|---|---|
| A real 3D scene | `buildThreeScene`, GLB exporter | **Exact** depth and normal buffers — no estimation |
| Named viewpoints | `construction.vues3d` (`{nom, pos, cible}`), `fonction: 'camera'` | Reproducible framing; the user has already chosen the shots |
| Physically-positioned sun | `positionSoleil`, date + time controls | Lighting direction that matches reality, not a guess |
| Semantic objects | `fonction`, `matiere`, `essenceBois`, textures | Per-region segmentation masks and a grounded prompt |
| Site context | Cadastre, PLU, commune, neighbouring buildings and vegetation | Plausible surroundings instead of invented ones |

Exact depth conditioning is the recognised technical answer to hallucination in this category. Owning the geometry rather than estimating it is the differentiator, and it is a by-product of work already done.

### 5.2 Pipeline

```
 ┌───────────── client ─────────────┐   ┌──────── worker ────────┐   ┌── provider ──┐
 │ 1. user picks a saved viewpoint  │   │ 4. job dequeued        │   │              │
 │    + date/time (sun) + ambiance  │   │ 5. compose prompt from │   │ 6. diffusion │
 │ 2. three.js renders control      │──▶│    structured project  │──▶│    + depth   │
 │    buffers at 1024–1536 px:      │   │    data                │   │    + edges   │
 │      · depth (linear)            │   │                        │◀──│              │
 │      · normals                   │   │ 7. store image + full  │   └──────────────┘
 │      · edges (geometry, not      │   │    provenance in T4    │
 │        detected)                 │   │ 8. notify (SSE)        │
 │      · segmentation by fonction  │   └────────────────────────┘
 │ 3. POST /renders → job id        │
 └──────────────────────────────────┘
```

**Prompt construction is structured, not free text.** Assembled from project data: decking essence and finish, materials of adjacent objects, planting by species where known, sun azimuth and elevation from the existing solar model (→ *"late-afternoon sun from the west, long shadows"*), season from the date, and a user-chosen ambience preset. A free-text field exists but is additive and length-capped — it decorates, it does not steer geometry.

**Consistency across views.** Fixed seed per project; identical prompt skeleton; a style-reference adapter seeded from the first accepted render so a set of four viewpoints reads as one project rather than four unrelated images.

**Provenance is stored with every render** — model identifier and version, seed, full prompt, hashes of the control buffers, viewpoint, sun parameters, timestamp, requesting user. Without this, a render from six months ago is unexplainable and unreproducible.

### 5.3 The fidelity rule

> **A generated image is a communication artefact, never a measurement.**
>
> It never enters the BOM path. It never feeds back into geometry. It is always labelled *« Vue d'artiste — non contractuelle »*, in the interface and in any PDF that carries it. It cannot be exported without that label.

This is not caution for its own sake. The product's core promise is that its numbers are reproducible and auditable (`architecture.md` ASR-1). An image that *looks* measured, placed next to a BOM that *is* measured, quietly transfers the credibility of the second to the first. The geometric 3D view stays available and stays the reference.

### 5.4 Architecture impact — the genuinely new capability

AI rendering is the system's **first long-running asynchronous job** (5–60 s, occasionally minutes). That is an architectural addition, not a feature, and it should be built generically:

- **Job queue** — `pg-boss` on the existing Postgres first (no new infrastructure, transactional with the rest), moving to a dedicated broker only if throughput demands it.
- **Job table with status, attempts, provenance, and a result reference**; idempotent by request key.
- **Progress transport** — SSE from the API; polling as the fallback.
- **Generic by design**, because three known future jobs reuse it: batch BOM recomputation after an engine fix, server-side dossier generation, and tenant export bundles.
- **Cost governance is a first-class concern.** Every render has a marginal cost. Hard quota (never soft), prepaid credits, per-tenant and per-platform daily ceilings, an alert on anomalous consumption, and a kill switch per tenant. This is the H2 dependency made concrete.
- **Data protection** — EU-region provider, contractual no-training-on-customer-data clause, tenant-scoped storage, renders deleted with the project, and the provider named in the tenant-facing DPA. A garden plan carries an address; it is personal data.

### 5.5 Build versus buy

| Option | Cost | Latency | Control | Verdict |
|---|---|---|---|---|
| **Hosted inference API** (depth/edge-conditioned models) | ~€0.02–0.10 per 1024 px image | 5–20 s | Model choice, no ops | **Start here.** No GPU operations, no capital commitment, fastest to a gate decision |
| **Self-hosted on rented GPU** | ~$0.50–1.00 per GPU-hour | 3–10 s | Full — custom LoRA on French residential terraces, data sovereignty | Revisit above ~5 000 renders/month, or if a fine-tune becomes the differentiator |
| **White-label an existing AI-rendering SaaS** | €10–30 per seat/month at market entry tiers | — | None; cannot use our depth buffers | Rejected — it discards the one asset that makes this defensible |

Illustrative economics: at €0.06 per image and a credit sold at €0.50, a 20-render monthly allowance in the Pro tier costs ~€1.20 against a ~€79 subscription. The margin is comfortable **provided the quota is hard**. It is unbounded loss if it is soft.

### 5.6 The gate — a three-week spike before any commitment

H3 is not funded as a project. It is funded as a **spike**, with pre-agreed success criteria.

**Spike scope:** offline, no UI, no billing. Take 20 real terrace projects; script the export of depth, normal, edge and segmentation buffers from the existing three.js scene; run three candidate hosted models; produce four viewpoints each.

| Criterion | Threshold |
|---|---|
| Usability | ≥ **80 %** of renders rated "presentable to a client" by 3 independent evaluators, blind |
| Geometric fidelity | Terrace outline visibly matches the source geometry in ≥ **95 %** of renders; **zero** renders that change the number of levels, the shape, or the position of the terrace |
| Latency | p95 **< 30 s** end to end |
| Cost | **< €0.15** per accepted image, including retries |
| Consistency | Four viewpoints of one project read as one coherent project |

**Kill criteria — any one of these stops the workstream:**

- Geometry drifts despite depth and edge conditioning at high conditioning scale
- Cost per *accepted* image exceeds €0.30 (retries are the usual cause, and they are the hidden cost)
- Evaluators cannot distinguish the output from what the existing three.js view already produces — in which case the honest answer is to improve the 3D materials and lighting instead, at a fraction of the cost

**Post-gate effort, if it passes:** ~35 d — job infrastructure 10 d, control-buffer pipeline 8 d, prompt composition and presets 5 d, UI and gallery 6 d, credits/quota/cost governance 4 d, PDF integration 2 d.

### 5.7 Adjacent AI candidates

Scored on value, effort and risk to the product's core promise. Rendering is the flagship, but it is not the cheapest win.

| Candidate | Value | Effort | Risk | Verdict |
|---|---|---|---|---|
| **Natural-language configuration** — *"terrasse 25 m² en pin classe 4 avec spa côté sud"* → a validated `construction` object | Medium-high | **Low** (a form filler; the engine validates every field, so a wrong answer is caught by existing code) | Low | **Do this first**, late H2. Cheapest AI win in the product. |
| **Photorealistic rendering** | High | Medium | Medium — mitigated by §5.3 | H3 flagship, gated |
| **Plan digitisation** — scanned survey PDF or photo → vector objects | **Very high** (removes the hardest onboarding step) | High | **High** — a mis-digitised boundary propagates into quantities | H4 candidate; requires mandatory human verification before any geometry is accepted |
| **Dossier narrative** — generate the *méthode* and *chantier* prose | Low-medium | Low | Low | Opportunistic |
| **Assistant over the project** — *"why is the joist spacing 40 cm here?"* | Medium | Medium | Low — it explains the engine, it does not replace it | H4 |
| **Site photo → existing conditions** | Medium | High | High | Not before H4 |

---

## 6. Sequencing

```
        2026 ──────────────────────── 2027 ──────────────────────── 2028
H1 │████████████████████████████│
   │ 1.1.0   2.0.0  2.1.0  2.2.0  2.3.0
   │                              ▲ gate: 2 tenants, metering live
H2 │                              └────█████████████████████│
   │                                   packages · payment · invoicing
   │                                   ▲ PA route decided (week 2)
   │                                   must complete ◀── Sept 2027 e-invoicing deadline
H3 │                                        ░░░spike░░░  ▲gate  ████████████│
   │                                                      job infra · rendering
   │                                        ▲ NL configuration (cheap win, late H2)
```

Critical path and hard dependencies:

1. **Feature catalog (2.1.0) → packages.** Nothing about H2 packaging is possible before it.
2. **Metering (2.1.0) → usage billing and AI credits.** Three months of observed usage before prices are fixed.
3. **H2 credits/quota → H3 launch.** Rendering without cost governance is an open cost line.
4. **September 2027 → H2 completion.** The only externally imposed date in this roadmap. Work backwards from it.
5. **Job infrastructure (H3) → server-side batch work.** Build it generically; three known future consumers.

---

## 7. Investment summary

| Horizon | Effort | Share | Nature |
|---|---|---|---|
| H1 — Run | ~124 d | 70 % | Specified, low risk, no optionality — it either happens or nothing else does |
| H2 — Grow | ~49–59 d | 20 % | Known mechanics, business decisions pending, one statutory deadline |
| H3 — Transform | 15 d spike + ~35 d | 10 % | Gated; the spike is the investment decision, not the build |
| | **~225–235 d** | | plus 20–25 % contingency |

---

## 8. Metrics per horizon

Leading indicators, not vanity numbers.

| Horizon | Metric | Why it is the right one |
|---|---|---|
| H1 | Time from merge to production | Measures whether the delivery architecture actually works |
| H1 | Golden-fixture diffs per release | Should be zero except when intended; anything else means behaviour is drifting |
| H1 | Cross-tenant test suite runtime and pass rate | The release gate that matters most |
| H2 | Trial → paid conversion, by package | Tells you whether the packaging boundaries are in the right place |
| H2 | Feature usage vs entitlement, per tenant | A feature nobody in a tier uses is in the wrong tier |
| H2 | Involuntary churn (failed payments) | Measures dunning quality, which is fixable, unlike voluntary churn |
| H2 | Days of e-invoicing readiness before the deadline | The only compliance metric that is not retrospective |
| H3 | Renders per project (not per tenant) | Repeat rendering on one project = the feature is genuinely useful |
| H3 | Accept rate on the first render | Falling accept rate = prompt or conditioning drift |
| H3 | Cost per *accepted* image | The number that decides whether H3 survives |
| H3 | Share of renders reaching a PDF dossier | The proof it entered the customer's real workflow |

---

## 9. Explicitly not doing

Named so that they can be argued for deliberately rather than drift in.

| Not doing | Reconsider when |
|---|---|
| Collaborative real-time editing | 409 conflict rate rises materially — already instrumented |
| Native mobile applications | The web client works on tablets; the field use case is capture, not editing |
| BIM/IFC export | A customer with an architect workflow asks, and pays |
| Marketplace of contractors | Not a software problem; a two-sided market is a different company |
| Self-hosted AI models | Above ~5 000 renders/month, or when a fine-tune becomes the differentiator |
| International expansion beyond France | The cadastre, PLU and NF DTU integrations are French; each new country is a `geo/**` port plus a standards study |
| Replacing the terrace engine with an AI model | Never. Reproducible, auditable quantities are the product. |

---

## 10. Assumptions and open questions

**Assumptions:**

1. The target customer is a professional — landscaper, terrace builder, small design practice — not a consumer. Packaging, seat model and SEPA payment all follow from this. **If it is wrong, H2 changes shape entirely.**
2. French market first. Compliance, cadastre, PLU and NF DTU all assume it.
3. Two developers, one frontend and one backend, from H2 onward.
4. The e-invoicing calendar holds. It has been postponed before.

**Open questions, owner and by when:**

| # | Question | Needed by |
|---|---|---|
| Q1 | Route A or route B for invoicing? | H2 week 2 — it determines the data model |
| Q2 | Seat-based or flat pricing for Pro? | Before packaging build; needs the H1 usage data |
| Q3 | Is custom branding an Entreprise-only feature, or an add-on? | H2 packaging |
| Q4 | Which entity issues invoices — is the legal structure in place? | Before any billing build |
| Q5 | Prepaid credits or post-paid metering for AI renders? | H3 gate |
| Q6 | Do renders enter the PDF dossier by default, or opt-in? | H3 build; affects the labelling obligation in §5.3 |

---

*Sources for §4.3: cegid.com, sellsy.com, pennylane.com, lido.app, impots.gouv.fr (calendrier facturation électronique, consulted August 2026). §5.5 cost ranges: replicate.com model pricing and published GPU rental rates, August 2026. All figures illustrative and to be re-verified at commitment.*
