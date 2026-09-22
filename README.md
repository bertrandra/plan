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

Version `1.2.0`, **l'interface est reconstruite par zones** (`MD/spec-ihm-zones.md`, cochée en
entier). **La migration TypeScript est terminée** en `1.1.0` (21 septembre 2026). Le fichier
HTML unique de 13 500 lignes est devenu un graphe de 115 modules typés sous la configuration stricte du
compilateur (`MD/spec-migration-typescript.md`, journal dans `MD/MIGRATION-JOURNAL.md`). L'artefact
livré reste un seul fichier `plan.html`, **produit par le build** et non plus édité à la main. Le fichier
d'origine est figé dans `legacy/plan_interactif.html` et sert de témoin : les golden files de
`tests/fixtures/golden/` sont ceux qu'il produit, et chaque palier de la migration s'y compare au
bit près. Le détail des paliers est dans `CHANGELOG.md`.

## Démarrer

Prérequis : Node 20 ou plus.

```bash
npm ci
npm run dev          # Vite sur index.html, rechargement à chaud
npm run build        # produit dist/index.html (fichier unique) et dist/api.php
npm test             # 554 tests Vitest, dont la comparaison aux golden files
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
| `src/model/` | Le document projet : `ObjetPlan` en union discriminée (polygone, chemin, cercle), cotes, construction, méta, et sa chaîne de migration de schéma. |
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
| `deploy/htaccess.template` | La configuration Apache de la racine web, complétée au build par les empreintes des scripts. |
| `legacy/` | Le fichier HTML d'origine, figé, jamais modifié. |
| `MD/` | Toute la documentation, voir ci-dessous. |

## Déploiement

Copier quatre choses sur un hébergement PHP : `dist/index.html` (renommé `plan.html` si l'URL doit
rester la même), `dist/api.php`, `dist/.htaccess` et un dossier `data/` accessible en écriture.
Rien d'autre. Le `plan.html` et le `.htaccess` à la racine du dépôt sont ces mêmes sorties de build,
copiées à chaque palier.

**Le `.htaccess` n'est pas optionnel.** Il est produit par le build à partir de
[`deploy/htaccess.template`](deploy/htaccess.template), et il porte trois choses qu'une copie de
fichiers seule ne donne pas :

- **Il refuse `data/`.** `api.php` range les projets à côté de lui, donc dans la racine web :
  sans cette règle, `GET /data/<id>.json` rend le projet entier sans passer par l'API. Constaté en
  ligne le 22 septembre 2026.
- **Il coupe le cache sur `plan.html`.** Le fichier livré porte toujours le même nom : c'est
  exactement celui qu'il ne faut pas mettre en cache. Il était servi avec six mois de validité, donc
  une mise en ligne n'atteignait pas les gens qui reviennent.
- **Il pose les en-têtes de sécurité**, dont une politique de contenu qui nomme le programme par son
  empreinte SHA-256 plutôt que d'autoriser l'inline en bloc. L'empreinte change à chaque build,
  d'où la génération : un `.htaccess` recopié d'un build précédent empêche la page de s'exécuter.

Après chaque mise en ligne, onze contrôles vérifient ce que le serveur rend vraiment — l'empreinte
du fichier servi, les en-têtes, le cache, et `data/` fermé :

```bash
npm run verifier-deploiement https://plan1.raillard.org
```

Les dépendances externes (IGN, BAN, CDN three.js, textures Poly Haven) sont des dépendances de
disponibilité, pas de données : sans IGN, pas d'import cadastre mais un éditeur complet ; sans CDN,
pas de 3D mais tout le reste. Chacune est nommée dans la politique de contenu, et une origine
ajoutée au code sans être ajoutée au modèle casse la fonction en production seulement.

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
| `MD/spec-ihm-zones.md` | Le découpage de l'interface en neuf zones pour sa reconstruction : inventaire, affectation de chaque commande, contrat avec le Core, ordre de mise en œuvre. |
| `MD/spec-connexion-plateforme.md` | Connexion à la plateforme backprod : Plan est un de ses produits, pas une plateforme. |
| `MD/spec-plateforme-multitenant.md` | *Remplacée.* Ce que l'on avait prévu de construire avant cette décision. |
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
