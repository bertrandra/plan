# WBS — delivery with Claude Code in the loop

**Version:** 1.0 — proposal for review
**Scope:** the full programme (H1 → H3) from `roadmap.md`, decomposed into work packages, with an AI-assisted effort model
**Companions:** `roadmap.md`, `architecture.md`, and the three specifications

---

## 1. Method

Two numbers per work package: a **baseline** (competent engineer, conventional tooling) and an **assisted** figure (same engineer, Claude Code in the loop). The ratio is not a single programme-wide multiplier — that is the mistake most AI-productivity estimates make. It is derived per package from a leverage class.

**The multipliers below are hypotheses, not measurements.** §7 defines how to replace them with observed values within the first three work packages. Any number in this document that survives to month two without being recalibrated should be treated as fiction.

---

## 2. AI leverage classes

The single strongest predictor of AI leverage is not task difficulty. It is **whether correctness is machine-checkable within seconds**. A task with a mechanical oracle can be attempted, verified, and corrected in a loop that needs no human in it. A task whose correctness lives in someone's judgement cannot.

| Class | Description | Oracle | Uplift | Human role |
|---|---|---|---|---|
| **A** | Mechanical and machine-verifiable — module extraction against golden files, type annotation, test generation for pure functions, DDL and repository CRUD, admin screens, migration scripts | Golden fixtures, `tsc`, lint, fitness functions, DB introspection | **×3.2** | Specify, spot-check, merge |
| **B** | Generative from a written spec — auth flows, webhook handlers, job infrastructure, exporters, UI panels | Tests written alongside; spec is the reference | **×2.2** | Specify precisely, review substantively |
| **C** | Judgement-heavy but code-producing — state container design, model/view split, security-sensitive code, binary formats | Partial; requires reasoning about semantics | **×1.5** | Design, pair, review line by line |
| **D** | Human-bound — architecture decisions, vendor selection, compliance interpretation, pricing, human evaluation, pentest | None | **×1.0** | Everything |

### 2.1 Why this codebase sits unusually high on the scale

The migration has a property most legacy modernisations lack: **a mechanical oracle for correctness**. `spec-migration-typescript.md` Phase 0 captures byte-identical exports — SVG, DXF, PDF, dossier, project JSON — before a single line moves. From that point on, "did this refactor change behaviour?" is answered by a diff, in seconds, without a human.

That converts the bulk of the migration from class C to class A. The agentic loop becomes: extract a module → run `tsc` → run the fixtures → self-correct on failure → present a passing diff for review. The engineer specifies and adjudicates; they do not transcribe.

The same holds later. The 14 fitness functions in `architecture.md` §9 were written as quality gates. **They double as the AI's feedback loop** — import-cycle checks, layering rules, RLS introspection, the `FeatureKey` drift test, the bundle budget. Every one of them is a check Claude Code can run itself before asking for review.

> The general lesson, reusable beyond this programme: **invest in verification before investing in generation.** An hour spent making correctness mechanically checkable buys more AI leverage than any amount of prompt engineering.

---

## 3. Operating model

### 3.1 Setup (0.5 d, before WP 1.1.1)

| Item | Content |
|---|---|
| `CLAUDE.md` at repo root | Domain vocabulary (P9 — never translate `lambourde`, `entraxe`, `débit`), the layering rules, the golden-fixture workflow, the commit convention, "never edit `legacy/`", the four documents to consult |
| Per-directory `CLAUDE.md` | `engine/` — purity rule, exact-equality test expectations. `api/` — tenant scoping is never optional. `model/` — schema migration protocol |
| Skills | `extract-module` (the Phase 2–6 recipe), `add-endpoint` (route + role + feature + quota + 403 test), `add-migration` (schema bump + fixtures N and N+1) |
| Hooks | Pre-commit: `tsc --noEmit`, lint, affected tests. Post-edit: run the fixture diff on `export/**` changes |
| Subagents | One per extraction target during Phase 2 and Phase 5, where modules are independent |
| Commands | `/extract <module>`, `/fixtures`, `/isolation` |

### 3.2 The loop, per class

**Class A** — the engineer writes the target module boundary and the acceptance command. Claude Code extracts, types, tests, iterates against `tsc` + fixtures until green, opens a PR. Review is a diff read plus a fixture check, typically 15–30 minutes for a 400-line PR.

**Class B** — the engineer writes the spec section first (most already exist in the companion documents — that is a large part of why this model works). Claude Code implements against it. Review is substantive: does the implementation match the intent, not just the tests?

**Class C** — the engineer designs, Claude Code drafts, both iterate. Expect two or three rounds. Review is line by line.

**Class D** — Claude Code is used for research, option comparison, and document drafting, not for the decision. No uplift is claimed on the decision itself.

### 3.3 Non-negotiable human gates

Regardless of class, a human authors or line-reviews and merges:

- Authentication, MFA, session handling, CSRF (WP 1.2.2)
- Tenant scoping and RLS policies (WP 1.2.1, 1.2.4)
- Every `requireFeature` / `requireRole` decision (WP 1.3.1)
- Any change to `engine/**` that could move a quantity (`architecture.md` ASR-1)
- Every schema migration
- Invoice numbering, immutability, and retention (WP 2.3.2)

The rule: **where a mistake is silent, expensive, and legally or financially consequential, generation may be assisted but judgement may not be delegated.**

---

## 4. Work breakdown structure

Effort in person-days. `Base` = baseline, `AI` = assisted, `Cl` = leverage class.

### 1 — H1 Foundation

| WBS | Work package | Deliverable | Base | Cl | AI | Verification oracle |
|---|---|---|---|---|---|---|
| **1.1** | **TypeScript migration** | | **54** | | **24.4** | |
| 1.1.1 | Phase 0 — safety net | Golden fixtures, HTTP fixtures, `history` rename, repo init | 3 | A | 0.9 | Fixtures reproduce from the tagged file |
| 1.1.2 | Phase 1 — scaffolding | Vite + TS, `legacy.ts`, single-file build | 2 | A | 0.6 | Build output functionally identical |
| 1.1.3 | Phase 2 — pure leaves | `util`, `geometry`, `geo/projection`, `geo/soleil`, `pdf/writer` + tests | 6 | A | 1.9 | `tsc` + fixtures + new unit tests |
| 1.1.4 | Phase 3 — engine | `engine/**` pure, ≥80 % coverage | 8 | B | 3.6 | Exact-equality BOM/débit on both reference terraces |
| 1.1.5 | Phase 4 — model & state | Data/view split, `AppState`, `render/**`, `interaction/**` | 12 | C | 8.0 | Fixtures + manual smoke checklist |
| 1.1.6 | Phase 5 — UI panels | `attrPanel`, configurator, cadastre dialog, decomposed | 10 | A | 3.1 | `tsc` + fixtures + smoke |
| 1.1.7 | Phase 6 — 3D & export | `buildThreeScene` split, dossier PDF, GLB | 9 | B | 4.1 | GLB structural comparison, PDF byte diff |
| 1.1.8 | Phase 7 — strictness | Ratchet to `strict`, delete `legacy.ts` | 4 | A | 1.2 | `tsc --strict` clean, FF-1/2/9/10 green |
| **1.2** | **Platform 2.0.0** | | **28** | | **13.6** | |
| 1.2.1 | Database foundation | Schema, migrations, repository layer, RLS, CI | 6 | A | 1.9 | FF-8 introspection test |
| 1.2.2 | Authentication & MFA | Sessions, Argon2id, TOTP, recovery codes, step-up, rate limiting | 10 | **C** | 6.7 | Auth suite; **human-authored** |
| 1.2.3 | Auth shell | Login / MFA / enrolment / reset UI | 4 | B | 1.8 | State-machine tests |
| 1.2.4 | Tenancy & isolation | Tenant model, three-layer isolation, isolation suite | 5 | B | 2.3 | Cross-tenant suite, all endpoints |
| 1.2.5 | Data migration | Flat files → database, id mapping | 3 | A | 0.9 | Round-trip byte-identical on 10 projects |
| **1.3** | **Features 2.1.0** | | **17** | | **6.6** | |
| 1.3.1 | Catalog & entitlements | Catalog, resolution, server-side enforcement | 6 | B | 2.7 | FF-6, FF-7 |
| 1.3.2 | Quotas & metering | `tenant_usage`, consumption, reset | 3 | A | 0.9 | Concurrency tests |
| 1.3.3 | Tenant admin screens | Users, features, audit | 5 | A | 1.6 | Role tests |
| 1.3.4 | Code-splitting | Gated regions lazily imported | 3 | B | 1.4 | FF-5 bundle analysis |
| **1.4** | **Branding 2.2.0** | | **14** | | **6.5** | |
| 1.4.1 | Token model | Validation, contrast enforcement | 4 | A | 1.2 | Injection and contrast tests |
| 1.4.2 | SVG/render token rework | `readThemeTokens`, scheme reaction, re-render | 5 | **C** | 3.3 | jsdom `getComputedStyle` assertions + fixtures |
| 1.4.3 | Asset pipeline | Upload, re-encode, object storage | 2 | A | 0.6 | Payload-stripping test |
| 1.4.4 | Branding admin + PDF footer | Screen, preview, footer | 3 | B | 1.4 | Golden PDF |
| **1.5** | **Consolidation 2.3.0** | | **11** | | **5.1** | |
| 1.5.1 | PDF logo | `/XObject` + DCTDecode | 5 | **C** | 3.3 | PDF validator + visual diff |
| 1.5.2 | Platform console | Tenants, entitlements, impersonation | 4 | A | 1.2 | Separate-session tests |
| 1.5.3 | Data operations | PostGIS, audit partitions, thinning job | 2 | A | 0.6 | Introspection + job tests |
| **1.6** | **Programme & assurance** | | **10** | | **10.0** | |
| 1.6.1 | Architecture & ADRs | Decisions, records, reviews | 5 | D | 5.0 | — |
| 1.6.2 | Security & continuity | External pentest, remediation, restore drill | 5 | D | 5.0 | — |
| | **H1 total** | | **134** | | **65.5** | **×2.05** |

### 2 — H2 Commerce

| WBS | Work package | Deliverable | Base | Cl | AI | Oracle |
|---|---|---|---|---|---|---|
| 2.1.1 | Packaging model | `packages`, `package_features`, resolver rework | 7 | B | 3.2 | Pure-resolver test suite |
| 2.1.2 | Package & subscription screens | Admin + tenant | 5 | A | 1.6 | Role tests |
| 2.2.1 | Stripe integration | Checkout, Portal, subscription state machine | 8 | B | 3.6 | Provider test mode, state-machine tests |
| 2.2.2 | Webhooks & reconciliation | Idempotency, event store, nightly reconcile | 6 | A | 1.9 | Replay and out-of-order tests |
| 2.3.1 | Plateforme Agréée selection | Route decision, contract | 3 | **D** | 3.0 | — |
| 2.3.2 | Invoice model | Numbering, immutability, credit notes, retention | 6 | A | 1.9 | Gapless-sequence property test |
| 2.3.3 | Factur-X / UBL + routing | Structured issuance via the PA | 6 | B | 2.7 | EN 16931 schema validation |
| 2.3.4 | e-reporting | B2C and cross-border | 3 | B | 1.4 | Provider acknowledgements |
| 2.4.1 | Metering & credits | Aggregation, credit ledger | 8 | A | 2.5 | Ledger invariants (never negative) |
| 2.5.1 | Compliance | Mandatory fields, VAT, legal review | 7 | **D** | 7.0 | — |
| | **H2 total** | | **59** | | **28.7** | **×2.05** |

### 3 — H3 GenAI rendering

| WBS | Work package | Deliverable | Base | Cl | AI | Oracle |
|---|---|---|---|---|---|---|
| 3.1.1 | Control-buffer export (spike) | Depth, normals, edges, segmentation from the scene | 4 | A | 1.2 | Visual inspection + regression images |
| 3.1.2 | Model benchmark harness (spike) | Three candidate models, 20 projects × 4 views | 4 | A | 1.2 | Harness reproducibility |
| 3.1.3 | Human evaluation (spike) | Protocol, 240 blind ratings, 3 evaluators | 5 | **D** | 5.0 | — |
| 3.1.4 | Gate decision | Go / no-go against §5.6 criteria | 2 | **D** | 2.0 | — |
| 3.2.1 | Async job infrastructure | Queue, status, SSE, idempotency — **generic** | 10 | B | 4.5 | Job lifecycle tests, retry semantics |
| 3.2.2 | Production buffer pipeline | Deterministic, resolution-aware | 8 | **C** | 5.3 | Image regression tests |
| 3.2.3 | Prompt composition | Structured from project data + ambience presets | 5 | B | 2.3 | Snapshot tests on prompt assembly |
| 3.2.4 | Render UI & gallery | Selection, gallery, provenance display | 6 | A | 1.9 | Component tests |
| 3.2.5 | Credits & cost governance | Hard quotas, ceilings, kill switch, alerting | 4 | A | 1.2 | Quota exhaustion tests |
| 3.2.6 | PDF dossier integration | Insertion + mandatory label | 2 | B | 0.9 | Golden PDF; label cannot be removed |
| | **H3 total** | | **50** | | **25.7** | **×1.95** |

### Programme totals

| | Baseline | Assisted | Ratio | Saved |
|---|---|---|---|---|
| H1 Foundation | 134 d | 65.5 d | ×2.05 | 68.5 d |
| H2 Commerce | 59 d | 28.7 d | ×2.05 | 30.3 d |
| H3 Rendering | 50 d | 25.7 d | ×1.95 | 24.3 d |
| **Total** | **243 d** | **120 d** | **×2.03** | **123 d** |

Contingency stays at 20 % of the **assisted** figure, not the baseline: → **~144 d**. Do not bank the savings and the contingency simultaneously.

---

## 5. The class-mix effect — where the ceiling comes from

| Class | Baseline share | Assisted share |
|---|---|---|
| A ×3.2 | 40 % | 25 % |
| B ×2.2 | 32 % | 30 % |
| C ×1.5 | 17 % | 22 % |
| **D ×1.0** | **11 %** | **23 %** |

Amdahl's law, in a delivery plan. Human-bound work is 11 % of the baseline and **23 % of the assisted programme** — it more than doubles in relative weight without changing in absolute size. Compliance interpretation, vendor selection, blind image evaluation and pentest remediation become, proportionally, the largest single block of the assisted plan.

Two consequences for planning:

1. **A programme-wide "×3" is not achievable here**, and any estimate claiming it has misclassified the class-D work. ×2 is the honest ceiling for this mix.
2. **The lever for the next increment is not a better model — it is moving work out of class D.** Deciding the Plateforme Agréée route in week 2 instead of week 12, or pre-agreeing the H3 evaluation rubric, removes calendar time that no amount of generation speed touches.

---

## 6. Velocity

### 6.1 Review becomes the constraint

Decompose a baseline engineering day and apply differential uplift:

| Activity | Baseline share | Uplift | Share of the assisted day |
|---|---|---|---|
| Generation / implementation | 55 % | ×3.5 | **33 %** |
| **Review** | 20 % | ×1.3 | **33 %** |
| Verification / debugging | 15 % | ×2.5 | 13 % |
| Coordination | 10 % | ×1.0 | 21 % |
| | 1.00 | | **0.47 (×2.1)** |

Review moves from a fifth of the day to a third — level with generation. **The bottleneck relocates from writing code to reading it**, and a plan that speeds up generation without addressing review capacity converts a coding queue into a review queue.

Countermeasures, in order of effect:

1. **Mechanical verification first.** Nothing reaches human review until `tsc`, lint, fixtures and the applicable fitness functions are green. The reviewer never spends attention on what a machine could have caught — this is the primary justification for the fitness-function investment.
2. **PR size cap: 400 changed lines.** Non-negotiable in Phase 4 (`spec-migration-typescript.md` R1). Assisted generation makes 2 000-line PRs easy to produce and impossible to review honestly.
3. **Every PR states its oracle.** "Fixtures green, FF-2 green, 14 new unit tests" — the reviewer knows what has already been proven and reviews only what has not.
4. **Differential review depth by class.** Class A: diff read plus oracle check. Class B: substantive. Class C: line by line. Class D: not applicable. Stated in the PR template, so review effort is allocated deliberately rather than uniformly.
5. **Claude Code as first-pass reviewer**, never as approver — a checklist pass against `CLAUDE.md` and the layering rules, before a human looks.

### 6.2 Sprint shape

Two-week sprints, two engineers.

| | Baseline | Assisted |
|---|---|---|
| Engineer-days per sprint | 20 | 20 |
| Work packages completed | ~1.5 | ~3–3.5 |
| PRs merged | 6–8 | 15–20 |
| Review load per engineer | ~4 h/week | ~8 h/week |

WIP limit: **two work packages in flight per engineer, maximum.** Assisted generation makes it tempting to start a third; the effect is a review backlog and stale branches, both of which cost more than the parallelism gains.

### 6.3 Calendar, not just effort

At 20 engineer-days per sprint and 144 assisted days including contingency: **~7.2 sprints ≈ 15 weeks of pure engineering**. Real calendar is longer — class-D dependencies (PA contracting, pentest scheduling, legal review, the H3 evaluation) are wall-clock items that no uplift compresses. Plan **~22–24 weeks** to `2.3.0`, and start the class-D long-lead items in parallel from week 1.

The September 2027 e-invoicing deadline (`roadmap.md` §4.3) has comfortable margin under this plan. It does not under the baseline plan if H1 slips. That is the schedule argument for the assisted model, and it is stronger than the cost argument.

---

## 7. Cost model

### 7.1 Claude Code cost

Anthropic's published enterprise figures: approximately **$13 per developer per active day**, **$150–250 per developer per month**, with 90 % of users below **$30 per active day** (code.claude.com/docs/en/costs). Subscription plan pricing is at claude.com/pricing — verify both before committing a budget.

Applied to this programme:

| Scenario | Assisted days | Token/usage cost |
|---|---|---|
| Average ($13/active day) | 120 | **~$1.6 k** |
| 90th percentile ($30/active day) | 120 | **~$3.6 k** |

Plus seats for two engineers over ~6 months. Even at the p90 rate, the tool cost is **under 4 % of the labour it displaces**. The cost conversation is not about token spend; it is about whether the uplift is real.

### 7.2 Sensitivity

Three uplift scenarios, three day rates. Labour in €, Claude Code in $ (treated near-parity for planning).

| Uplift scenario | A / B / C / D | Assisted days | Ratio | Days saved |
|---|---|---|---|---|
| Pessimistic | 2.0 / 1.5 / 1.2 / 1.0 | 161.5 | ×1.50 | 82 |
| **Central** | 3.2 / 2.2 / 1.5 / 1.0 | **119.9** | **×2.03** | **123** |
| Optimistic | 4.0 / 2.8 / 1.8 / 1.0 | 101.7 | ×2.39 | 141 |

| Day rate | Scenario | Assisted cost | Baseline cost | Claude Code | **Net saving** |
|---|---|---|---|---|---|
| €450 | Pessimistic | 72.7 k€ | 109 k€ | 2.1–4.8 k$ | **~32 k€** |
| €450 | Central | 53.9 k€ | 109 k€ | 1.6–3.6 k$ | **~52 k€** |
| €600 | Pessimistic | 96.9 k€ | 146 k€ | 2.1–4.8 k$ | **~44 k€** |
| €600 | **Central** | **71.9 k€** | **146 k€** | 1.6–3.6 k$ | **~71 k€** |
| €600 | Optimistic | 61.0 k€ | 146 k€ | 1.3–3.1 k$ | **~82 k€** |
| €800 | Central | 95.9 k€ | 194 k€ | 1.6–3.6 k$ | **~95 k€** |

**Even the pessimistic scenario pays for itself an order of magnitude over.** That asymmetry is the actual decision: the downside is a saving of 30 k€ instead of 70 k€, not a loss. The risk in this programme is not the cost of the tool — it is silent quality erosion, which §9 addresses.

---

## 8. Calibration — replacing the hypotheses with measurements

The multipliers in §2 are estimates. They become measurements through the first three work packages, which are deliberately ordered to give an early, clean read.

**Protocol:**

1. **WP 1.1.1, 1.1.2, 1.1.3** (11 baseline days, all class A) run first. Record for each: elapsed engineer-hours, PR count, changed lines, review hours, rework cycles, fixture failures before green.
2. Compute observed uplift for class A. Rebase B and C by holding the **ratio** between classes constant (B ≈ 0.69 × A, C ≈ 0.47 × A), rather than re-guessing each independently.
3. Re-forecast the programme. Publish the revision — an estimate corrected in public is credible; one silently maintained is not.
4. Repeat at the end of Phase 4 (the largest class-C package) and after WP 1.2.2 (the largest security-sensitive package). Those two are where the model is most likely to be wrong.

**Track continuously, per work package:**

| Metric | Why |
|---|---|
| Actual vs estimated days | The headline calibration |
| PR review hours per 100 changed lines | Detects the §6.1 bottleneck before it becomes a backlog |
| Rework rate — PRs needing >2 review rounds | The leading indicator of over-delegation |
| Defect escape rate to staging | The one that matters; if it rises, the uplift is illusory |
| Fixture failures caught pre-review | Proves the oracle is doing the work |
| Claude Code spend per engineer-day | Against the $13 anchor |

**Stop rule:** if defect escape rate rises above the pre-programme baseline for two consecutive sprints, reduce the class assignment of the affected area by one level and re-measure. Velocity bought with defects is borrowed, at a bad rate.

---

## 9. Risks specific to AI-in-the-loop

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| AI-1 | Plausible-but-wrong refactor merged because it compiled and looked right | **High** | Golden fixtures are the gate, not the diff read; class-C work is human-authored |
| AI-2 | Review capacity becomes the bottleneck; a review queue replaces a coding queue | **High** | §6.1 countermeasures; review hours tracked as a first-class metric |
| AI-3 | Silent quality erosion — velocity looks good, defect escape rises | **High** | §8 stop rule; escape rate reviewed every sprint |
| AI-4 | Over-delegation in security code (auth, tenancy, entitlements) | **High** | §3.3 human gates; no exceptions under schedule pressure |
| AI-5 | Context loss between sessions produces inconsistent conventions | Medium | `CLAUDE.md` at root and per directory; skills encode recurring recipes; FF-1/2 catch drift mechanically |
| AI-6 | Estimates treated as commitments before calibration | Medium | §8 protocol; the first re-forecast is a scheduled deliverable, not a concession |
| AI-7 | Uneven skill across the team — one engineer gets ×3, the other ×1.2 | Medium | Pair on the first two packages; share prompts and skills in the repo, not in private histories |
| AI-8 | Engine knowledge atrophies — nobody understands the NF DTU 51.4 logic any more | Medium | Class-C designation for the engine; humans write the tests that encode the standard, whatever generates the implementation |
| AI-9 | Cost spike from parallel subagents or runaway sessions | Low | Spend limits; per-session cost visible; the $30/active-day p90 as an alert threshold |
| AI-10 | Fitness functions overridden under pressure, removing the oracle | **High** | An override requires a second approver and an issue; a routinely-overridden check is fixed or deleted, never left firing |

AI-3 is the one to watch. Every other risk announces itself. That one looks like success for about six weeks.

---

## 10. Assumptions

1. Two engineers, competent, with the domain documents in hand. The uplift model assumes the specifications already exist — **they are a large part of why class B is ×2.2 rather than ×1.5**. Writing the spec is not free; it has already been paid for.
2. Golden fixtures are captured before WP 1.1.3. If Phase 0 is skipped, the migration drops from class A to class C and the programme estimate rises by roughly 25 days. This is the single highest-leverage dependency in the plan.
3. Day rate, contingency and the split between internal and external effort are placeholders for a commercial exercise.
4. Claude Code pricing per Anthropic's published figures at August 2026; verify at claude.com/pricing and code.claude.com/docs/en/costs before budgeting.
5. The class taxonomy in §2 is reusable across engagements; the multipliers are not — they are specific to a codebase with a mechanical oracle and a written specification.
