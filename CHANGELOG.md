# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [1.0.1-alpha.9] — 2026-08-28

`render()` est réduit à son orchestration : le positionnement des objets et le dessin des cotes
vivent dans `render/`. Aucun comportement ne change.

### Interne

- `render/objects.ts` : `positionnerObjet()` — la boucle de 113 lignes qui plaçait chaque objet.
- `render/measures.ts` : `dessinerCotes()`, plus `ancrageHorsContour()` et
  `distanceSortiePolygone()` — l'étiquette se pose hors du contour, au-delà de la dernière sortie
  du rayon.
- `geometry/basic.ts` : `angleInterieurDeg()`.
- Variable morte du fichier d'origine retirée (`const objCenter`, jamais lue).
- `legacy.ts` : 10 271 → 10 092 lignes. 254 tests.

## [1.0.1-alpha.8] — 2026-08-28

Le rendu et les interactions sortent de `legacy.ts`, module par module. Aucun comportement ne
change — mais une régression introduite en cours de route a été trouvée et corrigée.

### Interne

- `render/` : objets SVG d'un plan, calque des parasols, géométrie des cotes, thème, helper
  `creerSvg` typé, décor et grille.
- `interaction/` : édition par côté et par angle, zoom, pincement, déplacement, cadrage.
- `pathD` et `polyStr` rejoignent `geometry/path.ts` : la dette de la phase 2 est soldée.
- `legacy.ts` : 10 839 → 10 271 lignes. 249 tests.

### Corrigé avant publication

- **Le zoom ne faisait plus rien** depuis trois commits : deux scènes coexistaient, l'une écrite
  par la molette, l'autre lue par le dessin. Les golden files ne pouvaient pas le voir — un export
  est recalculé dans son propre repère. Corrigé, et la navigation est désormais couverte par
  23 tests.

### Connu, non corrigé

- Le cadrage plafonne à 400 px/m alors que la molette s'arrête à 220 : écart repris du fichier
  d'origine, figé par un test.
- Sur un élément SVG, `el.title` ne produit aucune infobulle : l'affectation crée une propriété
  inerte. Comportement conservé.

## [1.0.1-alpha.7] — 2026-08-28

Premiers modules de `render/**` et `interaction/**`, rendus possibles par l'état explicite.
Aucun comportement ne change.

### Interne

- `render/` : thème SVG, helper `creerSvg` typé (§7.2), flèche du Nord, échelle, grille,
  géométrie des cotes. `W` et `H` rejoignent `etat.scene`.
- `interaction/editing.ts` : édition par longueur de côté et par angle, contour de contrainte
  passé en paramètre.
- 22 tests ajoutés (221 au total).

### Corrigé avant publication

- Le renommage de `W`/`H` avait détourné les variables locales de `renderImplantation()` (format
  papier en mm) vers la taille de la fenêtre. Restauré et vérifié à l'écran.

## [1.0.1-alpha.6] — 2026-08-28

L'état de l'application tient désormais dans un seul objet explicite (`src/core/state.ts`), à la
place des variables libres de la fermeture de `boot()`. Aucun comportement ne change.

### Interne

- `EtatApp` / `creerEtat()` : données du plan, sélection, modes, bascules d'affichage, édition,
  calque d'ombre. 334 accès passent par `etat.`.
- La variable locale du dialogue d'import cadastre, qui s'appelait aussi `etat`, devient
  `etatImport` : elle masquait l'état global sur 750 lignes.
- 7 tests ajoutés (189 au total).

### Corrigé avant publication

- Le remplacement automatique avait renommé `data-measures` en `data-etat.measures` dans le SVG
  exporté. Un SVG produit par une version antérieure aurait perdu ses mesures à la réimportation.
  Détecté par les golden files, corrigé, et vérifié en réimportant le SVG d'avant migration.

## [1.0.1-alpha.5] — 2026-08-28

Phase 5 de la migration TypeScript, **partielle** : les modules d'interface qui ne dépendent pas
du rendu sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `src/ui/dialogs.ts` : notifications, confirmation, saisie, bandeau d'erreur, écran de reprise.
- `src/ui/texturePicker.ts` : catalogue Poly Haven et fenêtre de choix, typés.
- `src/ui/dom.ts` : helpers `el()` / `elOpt()` / `els()` / `on()` (§7.1), en place pour que le
  code neuf n'ajoute pas de `getElementById` non gardé.
- `main.ts` n'a plus sa copie du bandeau d'erreur : il importe celui du module.
- 19 tests ajoutés sous jsdom (182 au total) — première couverture d'interface du projet.

## [1.0.1-alpha.4] — 2026-08-28

Phase 4 de la migration TypeScript, **partielle** : la séparation donnée/vue est faite, la scène et
la pile d'annulation sont sorties. Aucun comportement ne change.

### Interne

- Les huit poignées SVG que portait chaque objet vivent dans une carte à côté
  (`src/render/vues.ts`) : la donnée du plan redevient sérialisable par construction.
- L'échelle et l'origine forment un objet `scene` ; la conversion monde ↔ écran vit dans
  `src/render/scene.ts`, la scène passée en paramètre.
- La pile d'annulation devient `PileAnnulation` (`src/core/history.ts`), bornée à 60 pas.
- 10 tests ajoutés (163 au total).

### Connu, non corrigé

- Après avoir déroulé toutes les annulations disponibles, « Dupliquer » ne fait plus rien. Le
  comportement est identique sur l'artefact gelé d'avant migration : bug préexistant, consigné pour
  après la migration comme l'impose la spec (§10.3).

## [1.0.1-alpha.3] — 2026-08-28

Phase 3 de la migration TypeScript : le moteur terrasse devient une bibliothèque pure et testée.
Aucun nombre ne change — la parité est prouvée bit à bit.

### Interne

- 10 modules `src/engine/**` (1 429 lignes hors de `legacy.ts`, qui passe à 10 839) : constantes,
  construction, lames, structure, calques, BOM, débit, implantation, chantier, parasols.
- Les deux fonctions qui lisaient l'état global le reçoivent désormais en paramètre, ainsi que
  leurs appelants ; les fonctions d'ombre reçoivent un contexte solaire explicite.
- Oracle du moteur capturé avant déplacement (`tests/fixtures/golden/moteur-terrasses.json`,
  deux terrasses de référence, neuf calculs chacune, artefacts de flottants compris).
- Couverture `src/engine` : 91,5 % (critère de sortie de la spec : ≥ 80 %). 153 tests au total.

## [1.0.1-alpha.2] — 2026-08-28

Phase 2 de la migration TypeScript : extraction des fonctions pures. Aucun comportement ne change,
les six golden files restent identiques au bit près à chaque lot.

### Interne

- 16 modules typés sortent de `legacy.ts` (12 959 → 12 250 lignes) : `model/{units,types,defaults,demo,version}`,
  `geometry/{basic,segments,rect,polygon,rings,path}`, `geo/{projection,soleil}`,
  `export/pdf/writer`, `export/dxf`, `util/{escape,format,download}`.
- 79 tests unitaires ajoutés (106 au total) : géométrie, projection locale, position du soleil,
  structure du PDF assemblé.
- Ce que le typage a fait remonter sans le corriger : `estRectangle` rend `null`/`undefined` et
  jamais `false` sur une entrée vide, `rectangleDepuisCote` peut rendre `null`. Les types le disent
  désormais ; le comportement est inchangé.

## [1.0.1-alpha.1] — 2026-08-28

Phases 0 et 1 de la migration TypeScript
([`MD/spec-migration-typescript.md`](MD/spec-migration-typescript.md) §4) : filet de sécurité, puis
échafaudage **sans déplacer une ligne de logique**. L'application construite est fonctionnellement
identique et produit les six golden files au bit près.

### Modifié

- `history` renommé en `undoStack` (changement A1 accepté par la spec §10.3 : une fois les modules
  en place, la collision avec `window.history` deviendrait silencieuse). Prouvé inerte — les six
  empreintes de référence sont identiques avant et après.

### Interne

- Golden files déposés dans `tests/fixtures/golden/` : résumé, SVG, DXF, projet JSON, PDF plan,
  PDF dossier, plus une empreinte structurelle du GLB (le binaire pèse 41,5 Mo et l'exporteur
  three.js n'est pas déterministe).
- Liste de fumée de 25 interactions (`tests/CHECKLIST-FUMEE.md`), à dérouler avant chaque fusion.
- Artefact gelé dans `legacy/plan_interactif.html`, étiquette `v0-preTS`.
- Chaîne d'outils : Vite 5 avec `vite-plugin-singlefile` (le déploiement reste « copier un
  fichier »), TypeScript 5.7 au barreau permissif, ESLint 9, Vitest 2.
- `plan.html` découpé en `index.html`, `src/styles/app.css`, `src/legacy.ts` (les deux blocs
  `<script>` verbatim, sous `@ts-nocheck`) et `src/main.ts` (amorçage).
- `npm test` recalcule les empreintes des golden files : une régression d'export est désormais
  détectée par la chaîne de test, plus par une relecture.
- `npm run build` produit `dist/index.html` (432 ko) avec `api.php` à côté.
- Le serveur de développement accepte `POST /_fixture/<nom>` pour déposer un golden file au bit
  près : un PDF qui transite par une chaîne JavaScript n'est plus le même fichier.
## [1.0.0] — 2026-08-28

Première version numérotée. Elle **fige l'application mono-page existante telle qu'elle est** et
lui donne une identité de version : aucune fonction du plan, aucun calcul et aucune géométrie ne
changent par rapport à l'état du 27 août. Les empreintes de référence sont capturées dans
`tests/fixtures/golden/`.

### Ajouté

- Numéro de version affiché à droite de la barre de projet (`v1.0.0`), avec le détail — build,
  version de schéma, version d'API — dans l'infobulle.
- Estampille de version dans les fichiers de projet : `meta.appVersion`, `meta.schemaVersion` et
  `meta.writtenAt`, à l'export JSON comme à l'enregistrement serveur.
- Estampille dans les exports : commentaire `999` en tête du DXF, attributs `data-app-version` et
  `data-schema-version` sur la racine SVG, dictionnaire `/Info` (`/Producer`, `/Creator`,
  `/CreationDate`) et pied de page sur chaque page des PDF, première ligne du résumé texte.
- En-têtes `X-App-Version` et `X-Schema-Version` sur toutes les requêtes vers `api.php`.
- Refus explicite d'un fichier de projet enregistré par une version plus récente : le plan en
  cours est laissé intact et le message invite à recharger la page. Charger partiellement un tel
  fichier puis l'enregistrer effacerait sans bruit les champs inconnus.
- Confirmation avant « Réinitialiser tout », qui efface d'un clic tout le travail fait depuis le
  chargement, mesures comprises.

### Corrigé

- Plantage au démarrage sur un plan contenant des objets de voisinage : trois variables d'état
  d'affichage étaient déclarées après la fonction qui les lit pendant le boot.
- Le tableau « Affichage par objet » se reconstruisait à chaque case cochée, détachant du DOM la
  case en cours d'utilisation et faisant perdre le focus clavier.

### Interne

- Empreintes de référence des six exports et fixture des quantités calculées
  (`tests/fixtures/golden/`), servant de garde-fou aux versions suivantes.
- `api.php` conserve la version du client qui a écrit chaque projet.
