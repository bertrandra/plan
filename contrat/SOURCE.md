# D'ou vient ce contrat

**Depot :** https://github.com/bertrandra/backprod
**Commit epingle :** `4c88d19d504f9eec03e1a4a3950533a752e90c67`
**Extrait le :** 2026-11-16

`backprod.openapi.json` n'est pas le contrat entier de la plateforme : c'est la fermeture
transitive des 17 operations que Plan appelle, produite par
[`../scripts/extraire-contrat.mjs`](../scripts/extraire-contrat.mjs). Le contrat complet fait
676 Ko et decrit cinq produits, une console, une facturation et une chaine de vente ; Plan n'en
utilise rien d'autre que ceci.

| | |
|---|---|
| Operations | 17 |
| Chemins | 13 |
| Schemas | 11 |

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
- `createProjectShare`
- `listProjectShares`
- `revokeProjectShare`
- `openSharedProject`

## Rafraichir

```bash
node scripts/extraire-contrat.mjs ../backprod
npm run gate:client
```

Le premier reecrit ce dossier, le second dit si `src/plateforme/contrat.ts` doit changer avec lui.
Les deux diffs se relisent : un champ qui disparait du contrat est une rupture pour Plan, et c'est
exactement ce que cette epingle sert a voir avant un client, pas apres.
