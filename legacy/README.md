# `legacy/plan_interactif.html`

Copie figée de `plan.html` au moment de la phase 0 de la migration TypeScript
([`../MD/spec-migration-typescript.md`](../MD/spec-migration-typescript.md) §4), étiquetée
`v0-preTS`.

**Chaque phase ultérieure se compare à ce fichier**, et les golden files de
[`../tests/fixtures/golden/`](../tests/fixtures/golden/EMPREINTES.md) sont ceux qu'il produit.
Il ne doit plus jamais être modifié : une correction se fait sur `plan.html`, puis sur le code
TypeScript une fois la migration entamée.

Etat : identique a `plan.html` au commit du 28 aout 2026, renommage `history` -> `undoStack`
inclus (seul changement autorise par la spec avant TypeScript, §10.3 A1).
