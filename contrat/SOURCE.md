# D'ou vient ce contrat

**Depot :** https://github.com/bertrandra/backprod
**Commit epingle :** `ce0642c4537743f7129a5ad7d5c1a87f4b907502`
**Extrait le :** 2026-09-22

`backprod.openapi.json` n'est pas le contrat entier de la plateforme : c'est la fermeture
transitive des 13 operations que Plan appelle, produite par
[`../scripts/extraire-contrat.mjs`](../scripts/extraire-contrat.mjs). Le contrat complet fait
676 Ko et decrit cinq produits, une console, une facturation et une chaine de vente ; Plan n'en
utilise rien d'autre que ceci.

| | |
|---|---|
| Operations | 13 |
| Chemins | 10 |
| Schemas | 7 |

Les operations, dans l'ordre ou la specification les introduit
([`../MD/spec-connexion-plateforme.md`](../MD/spec-connexion-plateforme.md) §3, §3.4, §6.1) :

- `signIn`
- `refreshSession`
- `signOut`
- `showMyContext`
- `listProjects`
- `createProject`
- `showProject`
- `updateProject`
- `deleteProject`
- `duplicateProject`
- `listProjectVersions`
- `restoreProject`
- `undeleteProject`

## Rafraichir

```bash
node scripts/extraire-contrat.mjs ../backprod
npm run gate:client
```

Le premier reecrit ce dossier, le second dit si `src/plateforme/contrat.ts` doit changer avec lui.
Les deux diffs se relisent : un champ qui disparait du contrat est une rupture pour Plan, et c'est
exactement ce que cette epingle sert a voir avant un client, pas apres.
