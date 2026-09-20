# Plan interactif

Outil de conception et de chiffrage pour l'aménagement extérieur. À partir d'une adresse, on importe
la parcelle cadastrale (IGN), on dessine le terrain dans un plan SVG à l'échelle, on configure une
terrasse bois, et l'application produit la structure (plots ou vis, lambourdes, lames), la
nomenclature chiffrée, le plan de débit, le plan d'implantation, le planning de chantier, une vue 3D
et les exports : SVG, PNG, DXF, PDF, dossier PDF multipage, GLB, et le fichier projet JSON.

Les quantités servent à commander et à devisser. La contrainte qui structure tout le projet :
**un nombre produit il y a six mois doit être reproductible aujourd'hui**. Un changement qui déplace
un nombre est un événement de version majeure, pas une correction de bug (voir `MD/RELEASE.md`).

## État du projet

Version `1.1.0-alpha.16`, en cours de migration d'un fichier HTML unique de 13 500 lignes vers un
graphe de modules TypeScript (`MD/spec-migration-typescript.md`). L'artefact livré reste un seul
fichier `plan.html`, désormais **produit par le build** et non plus édité à la main. Le fichier
d'origine est figé dans `legacy/plan_interactif.html` et sert de témoin : les golden files de
`tests/fixtures/golden/` sont ceux qu'il produit, et chaque palier de la migration s'y compare au
bit près. Le détail des paliers est dans `CHANGELOG.md`.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run dev          # Vite sur index.html, rechargement à chaud
npm run build        # produit dist/index.html (fichier unique) et dist/api.php
npm test             # 547 tests Vitest, dont la comparaison aux golden files
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint sur src/ et tests/
npm run cliquet      # le cliquet de rigueur, voir ci-dessous
```

Pour ouvrir `plan.html` tel quel, sans Vite, il faut un serveur HTTP : en `file://` les navigateurs
bloquent les appels aux API IGN, donc l'import cadastre, le PLU et l'orthophoto. Le script fourni
suffit :

```bash
pwsh -File servir.ps1     # puis http://localhost:8765/plan.html
```

### Le cliquet de rigueur

Les drapeaux stricts du compilateur ont été montés barreau par barreau, dossier par dossier, et
l'échelle est gravie : `tsconfig.json` porte la configuration cible de la spec (`strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, locals et paramètres inutilisés interdits).
`scripts/cliquet.mjs` lance `tsc` et échoue si une erreur vient d'un dossier déclaré propre : tous
le sont, et aucun ne peut régresser sans que le script le remarque.

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `src/engine/`, `src/geometry/` | Le cœur pur : données en entrée, données en sortie, ni DOM, ni réseau, ni horloge. C'est ce qui rend les quantités testables à l'égalité exacte. |
| `src/model/` | Le document projet (objets, cotes, construction, méta) et sa chaîne de migration de schéma. |
| `src/geo/` | Projection locale, cadastre et PLU via la Géoplateforme IGN, géocodage BAN, course du soleil. |
| `src/render/`, `src/interaction/` | Rendu SVG du plan et gestes d'édition. |
| `src/export/` | SVG, DXF, PDF (écrivain PDF fait main dans `pdf/`), dossier PDF, résumé. Aucune dépendance entrante. |
| `src/three/` | Vue 3D avec three.js, chargé à la demande depuis un CDN. |
| `src/ui/`, `src/shell/`, `src/styles/` | Panneaux, barre de projet, mise en page. |
| `src/app/` | La racine de composition : `boot.ts` câble les écouteurs sur l'état. |
| `src/core/`, `src/io/`, `src/util/` | État, historique d'annulation, lecture et écriture de projet, utilitaires. |
| `tests/unit/` | Un dossier par module de `src/`. |
| `tests/fixtures/golden/` | Les artefacts de référence et leurs empreintes (`EMPREINTES.md`). |
| `api.php`, `data/` | Persistance minimale : un fichier JSON par projet, pas de base de données. |
| `legacy/` | Le fichier HTML d'origine, figé, jamais modifié. |
| `MD/` | Toute la documentation, voir ci-dessous. |

## Déploiement

Copier trois choses sur un hébergement PHP : `dist/index.html` (renommé `plan.html` si l'URL doit
rester la même), `dist/api.php` et un dossier `data/` accessible en écriture. Rien d'autre. Le
`plan.html` à la racine du dépôt est cette même sortie de build, copiée à chaque palier. Les dépendances externes (IGN, BAN, CDN three.js, textures
Poly Haven) sont des dépendances de disponibilité, pas de données : sans IGN, pas d'import cadastre
mais un éditeur complet ; sans CDN, pas de 3D mais tout le reste.

## Documentation

`MD/architecture.md` est le point d'entrée. Les autres documents en découlent.

| Document | Ce qu'il couvre |
|---|---|
| `MD/architecture.md` | Comment le système est assemblé et pourquoi : acteurs, exigences, principes, attributs de qualité. |
| `MD/spec-migration-typescript.md` | Le passage du fichier unique au graphe de modules typés, phase par phase. |
| `MD/MIGRATION-JOURNAL.md` | Le journal de bord de cette migration, palier par palier. |
| `MD/RELEASE.md` | Politique de version : application (SemVer), schéma du projet, API. |
| `MD/roadmap.md` | Trois horizons : exploiter, croître, transformer. |
| `MD/DEFAUTS.md` | Les défauts connus, trouvés et non corrigés, triés en trois priorités. |
| `MD/spec-plateforme-multitenant.md` | Multi-organisations, authentification, catalogue de fonctionnalités, marque blanche. |
| `MD/spec-data-strategy.md` | Ce qui est stocké où, performance et évolution. |
| `MD/spec_import_cadastre_et_json.md` | Import cadastral IGN et format du fichier projet. |
| `MD/spec_address_to_cadastral_parcel_api.md` | De l'adresse à la parcelle. |
| `MD/PLAN_Facade_Scan_Specification_V1_updated.md` | Relevé de façade. |
| `MD/wbs-claude-code.md` | Découpage du travail. |
| `MD/QA_*.md`, `MD/RELEASE-1.0.0.md` | Revues qualité du fichier d'origine et notes de la 1.0.0. |

## Versionnement

Trois numéros indépendants : l'application (`package.json`, SemVer), le schéma du projet
(`src/model/schema.ts`, entier monotone) et l'API (préfixe d'URL). La règle qui porte tout :
**tout écart dans les golden files qui n'est pas expliqué par une fonctionnalité voulue est une
version majeure.** Le vocabulaire du domaine reste en français (lambourde, entraxe, débit, plot,
vis), traçable au NF DTU 51.4.
