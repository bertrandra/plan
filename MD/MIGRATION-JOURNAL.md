# Journal de la migration TypeScript

Suivi d'exécution de [`spec-migration-typescript.md`](spec-migration-typescript.md) §4. Une ligne
par phase, avec le critère de sortie tel que la spec le formule et la preuve qu'il est atteint.

| Phase | État | Étiquette | Critère de sortie | Preuve |
|---|---|---|---|---|
| 0 — Filet de sécurité | ✅ 28/08/2026 | `v0-preTS` | les golden files se reproduisent à l'identique depuis le fichier étiqueté | 6 empreintes identiques par 3 chemins de calcul indépendants |
| 1 — Échafaudage, zéro logique déplacée | ✅ 28/08/2026 | `v1.0.1-alpha.1` | build mono-fichier fonctionnellement identique, golden files conformes, déployable à côté d'`api.php` | `dist/index.html` : 6 empreintes sur 6 identiques |
| 2 — Extraction des feuilles pures | ✅ 28/08/2026 | `v1.0.1-alpha.2` | ~1 800 lignes hors de `legacy.ts`, maths couvertes par des tests | 709 lignes sorties : la liste de la phase est épuisée (voir plus bas) ; 106 tests |
| 3 — Extraction du moteur | ✅ 28/08/2026 | `v1.0.1-alpha.3` | moteur terrasse pur, ≥ 80 % de couverture, BOM et débit conformes | 10 modules ; 91,5 % de couverture ; 18/18 sorties identiques bit à bit |
| 4 — Modèle et conteneur d'état | ✅ 09/09/2026 | `v1.1.0-alpha.14` | `legacy.ts` réduit aux panneaux UI et à la 3D | dépassé : `legacy.ts` **supprimé**. La fermeture `boot()` vit dans `src/app/boot.ts`, module typé et linté ; six empreintes sur six inchangées à version égale |
| 5 — Panneaux UI | 🟡 partielle 28/08/2026 | `v1.0.1-alpha.5` | (non formulé par la spec) | dialogues, sélecteur de textures et helpers DOM sortis ; les panneaux qui pilotent le plan attendent `render/**` |
| 6 — 3D et exports | ✅ 29/08/2026 | `v1.0.1-alpha.43` | (non formulé par la spec) | exports tous sortis (`export/**`) ; côté 3D, scène, navigation, soleil, chargeurs, visionneuse GLB, calque des couches et clôture sont sortis. Ne reste dans `legacy.ts` que le pilotage des modes, qui appartient à la coquille |
| 7 — Cran de rigueur et nettoyage | ✅ 20/09/2026 | `v1.1.0-alpha.15` | O1–O6 atteints, `legacy.ts` supprimé | `legacy.ts` supprimé (09/09/2026) ; `tsconfig.json` = configuration cible §9.1, 1 513 → 0 sur tout le dépôt ; six empreintes sur six inchangées à version égale |

---

## Phase 0 — 28 août 2026

Les quatre points de la §4, dans l'ordre : golden files réels déposés (six artefacts + empreinte
structurelle du GLB), liste de fumée de 25 gestes, renommage `history` → `undoStack` (A1), gel de
l'artefact dans `legacy/plan_interactif.html`.

Le renommage a été **prouvé inerte** : empreintes capturées avant, recapturées après, identiques.

Écart avec la spec : elle décrit le projet de référence comme « 12 objets, 2 terrasses » ; le jeu
par défaut en compte 35 depuis le recalage cadastral. Les fixtures figent l'état réel.

## Phase 1 — 28 août 2026

Découpage du fichier mono-page, sans déplacer une ligne de logique :

| Source | Destination | Contenu |
|---|---|---|
| lignes 1–5, 234–603 | `index.html` | coquille et balisage, `<script type="module" src="/src/main.ts">` |
| lignes 7–232 | `src/styles/app.css` | feuille de style, inchangée |
| lignes 605–1036 et 1040–13554 | `src/legacy.ts` | les deux blocs `<script>`, **verbatim**, sous `// @ts-nocheck` |
| lignes 13556–13568 | `src/main.ts` | amorçage et rattrapage d'erreur |

Trois différences structurelles seulement, toutes documentées en tête de `legacy.ts` : le
`try/catch` qui enveloppait le bloc 2 est remonté dans `main.ts`, l'appel final
`loadInitialProject().then(boot)` aussi, et trois symboles sont exportés.

**Pourquoi l'import est dynamique dans `main.ts` :** dans le fichier mono-page, une exception levée
par une instruction de premier niveau pendant la définition affichait le bandeau d'erreur. Avec un
`import` statique, elle serait levée avant que `main.ts` ne s'exécute et la page resterait blanche.
`await import()` restaure exactement l'ancien comportement. `main.ts` porte pour cela sa propre
copie minimale du bandeau : si c'est le module qui échoue, `showErrBanner` n'existe pas encore.

Chaîne d'outils : Vite 5 + `vite-plugin-singlefile` (le déploiement reste « copier un fichier »),
TypeScript 5.7 au **barreau 1** de l'échelle de rigueur (§9.2), ESLint 9 à plat, Vitest 2.

`npm run build` → `dist/index.html`, 432 ko (contre 779 ko pour la source), `api.php` copié à côté
par un greffon de fin de build plutôt qu'un doublon dans le dépôt.

**Vérifications :** les six golden files sont identiques au bit près depuis le build ; `tsc --noEmit`
et `eslint` passent ; `vitest` exécute trois tests dont un qui recalcule les empreintes des golden
files — la régression sera désormais détectée par `npm test`, pas par une relecture. Contrôles au
navigateur sur `dist/index.html` : 35 objets, duplication et annulation, confirmation de
réinitialisation, les cinq onglets, et la **vue 3D** (canvas 1216×419, three.js chargé depuis le
CDN — le point le plus risqué du passage en module).

## Phase 2 — 28 août 2026

Cinq lots, chacun vérifié avant le suivant : `tsc --noEmit`, `eslint`, `vitest`, puis les six
golden files recalculés depuis `dist/index.html`.

| Lot | Modules créés | Sortis de `legacy.ts` |
|---|---|---|
| 1 | `model/units.ts`, `model/types.ts`, `geometry/basic.ts`, `util/{escape,format,download}.ts` | 12 959 → 12 909 |
| 2 | `geometry/{segments,rect,polygon,rings,path}.ts` | 12 909 → 12 501 |
| 3 | `geo/projection.ts`, `geo/soleil.ts` | 12 501 → 12 443 |
| 4 | `model/version.ts`, `export/pdf/writer.ts`, `export/dxf.ts` | 12 443 → 12 312 |
| 5 | `model/demo.ts`, `model/defaults.ts` | 12 312 → 12 250 |

**709 lignes sorties, et non les ~1 800 annoncées par la spec.** L'écart n'est pas un travail
laissé de côté : la liste de la phase 2 est épuisée. Plusieurs fonctions qu'elle range dans
`geometry/` et `export/` ne lisent pas que leurs arguments, et la phase 2 est explicitement
réservée à celles qui le font :

| Fonction | Ce qu'elle lit en plus de ses arguments | Suite |
|---|---|---|
| `pathD`, `polyStr` | `toScreen()`, donc l'état de la vue | phase 4, avec une projection en paramètre |
| `buildExportDXF` | `objects`, `measures` | phase 4 |
| `buildExportPDF`, `buildDossierPDF` | idem | phase 4 |
| `lieuActuel` | la parcelle courante | phase 4 |

Le reste des ~1 800 lignes se trouve dans `geo/cadastre.ts`, `geo/bdtopo.ts`, `export/pdf/plan.ts`
et `dossier.ts` — des fichiers de la cible §3.2 que la phase 2 ne liste pas.

### Ce que le typage a fait remonter (aucun comportement corrigé, §10.3)

- `estRectangle` rend `obj && …`, donc `null`/`undefined` et jamais `false` sur une entrée vide.
  Tous les appelants la lisent comme une valeur falsy : le comportement est juste, le type le dit
  désormais. Le barreau 3 (`strictNullChecks`) fera remonter toute cette famille.
- `rectangleDepuisCote` peut rendre `null` (rectangle dégénéré refusé) : idem.
- `rings` dépendait implicitement de `distancePointSegment` et `simplifierContour` ; ces
  dépendances sont maintenant des imports.
- `pdfEchelleGraphique` dépendait de `niceStep`, partagée avec la grille du plan : elle est passée
  dans `util/format.ts`.

### Tests

79 tests unitaires ajoutés (106 au total), sur des invariants et non sur des valeurs recopiées :
aire signée et sens de parcours, `offsetZone` = somme de Minkowski avec un disque aux cordes près,
découpe d'une droite par un polygone concave, fusion de deux parcelles mitoyennes, aller-retour de
la projection locale au millimètre, hauteur du soleil aux deux solstices et bascule de l'heure
d'été, table xref et longueurs de flux du PDF assemblé.

Trois de mes attentes de test étaient fausses et le code avait raison : l'aire de `offsetZone`
(arcs inscrits, donc légèrement inférieure à la valeur exacte), l'échelle retenue par
`echelleQuiTient` (1/75 et non 1/100), et la répétition implicite des commandes SVG dans
`parseSvgPathPoints`. Corrigées côté test.


## Phase 3 — 28 août 2026

Le moteur terrasse sort de `legacy.ts` : 10 modules, 1 429 lignes, 12 250 → 10 839.

| Module | Contenu |
|---|---|
| `engine/constantes.ts` | prix, sections, plots, règles DTU |
| `engine/construction.ts` | `defaultConstruction`, `ensureConstruction` |
| `engine/lames.ts` | étendue, longueur réelle, emprise d'une lame |
| `engine/structure.ts` | portées admissibles, ossature, grille d'appuis, zones d'équipement |
| `engine/layers.ts` | calques d'une terrasse |
| `engine/bom.ts` | quantitatif et prix |
| `engine/debit.ts` | optimisation des coupes |
| `engine/implantation.ts` | repère de traçage et cotes |
| `engine/chantier.ts` | cadences et temps |
| `engine/parasol.ts` | ombre portée, cartes d'ombre, meilleure position |

### L'oracle, capturé avant de toucher au code

Les six golden files ne contiennent aucune sortie du moteur : il fallait un oracle. Une passerelle
temporaire, posée **à l'intérieur de `boot()`** — c'est là que vivait tout le moteur — a permis de
capturer, sur les deux terrasses de référence, les neuf calculs avec leurs artefacts de flottants
intacts (`269.3999999999999`, `3.5000000000000004`). Fixture : `tests/fixtures/golden/moteur-terrasses.json`,
180 ko, incluant la liste des 35 objets, sans quoi `findSpaZones` n'est pas rejouable.

### Les lectures d'état devenues des paramètres (spec §4)

Le balayage a montré un moteur déjà presque pur : **deux fonctions seulement** lisaient la fermeture.
Le fil a dû être tiré jusqu'aux appelants :

| Fonction | Avant | Après |
|---|---|---|
| `findSpaZones` | lisait `objects` | `(margeCm, objets)` |
| `computeStructure` | — | `(obj, objets)`, pour atteindre `findSpaZones` |
| `buildVisGrid`, `computeTerrasseLayers`, `optimiserParametres`, `evaluerStructure` | — | idem |
| `calculerCartesOmbre`, `ombreInstantanee`, `chercherMeilleurePositionParasol` | lisaient `parasolDateStr`, `parasolMinutes`, `lieuActuel()`, `objects` | reçoivent un `ContexteSoleil` et `objets` |
| `terrasseDuParasol` | lisait `objects` et `terrasseSelectedKey` | reçoit les deux |

`legacy.ts` compose ce contexte dans `contexteSoleilParasol()`, à partir des curseurs et du lieu de
la parcelle.

### La parité, prouvée là où elle a un sens

Premier essai : rejouer l'oracle sous Node. **Huit comparaisons sur dix-neuf échouaient — d'un ULP.**
`-4.020338010114908` contre `-4.020338010114907`. Ce n'est pas le calcul qui diffère, c'est
`Math.sin`/`Math.cos` d'une version de V8 à l'autre.

La preuve a donc été refaite sur le terrain où elle vaut : **navigateur contre navigateur**, en
recapturant les mêmes neuf calculs après le déplacement. **18 sorties sur 18 (2 terrasses × 9),
identiques bit à bit.** Le test Node conserve l'égalité **stricte** sur le BOM et le chantier — les
nombres qui partent chez un fournisseur, qui passent sans tolérance — et compare à 12 chiffres
significatifs ailleurs, avec le pourquoi écrit dans le fichier de test.

### Un dégât à signaler

La règle de suppression automatique (« de la déclaration jusqu'au `}` en colonne 0 ») ne
reconnaissait pas les constantes qui se terminent par `];`. Elle a donc avalé six déclarations
d'état au passage — `parasolDateStr`, `parasolMinutes`, `appMode`, `terrasseSelectedKey` et deux
bascules d'affichage. Détecté par un diff systématique entre l'avant et l'après, en écartant tout ce
qui se retrouvait dans les modules ; les six ont été rétablies dans `legacy.ts`, où elles ont leur
place — elles décrivent ce que l'utilisateur regarde, pas un calcul.

### Couverture et vérifications

`vitest --coverage` : **91,5 % sur `src/engine`** (critère de sortie : ≥ 80 %), 153 tests au total.
Les 34 nouveaux couvrent les portées admissibles (croissance avec la hauteur de section, racine
cubique de la charge, plafond DTU à 70 cm), les achats par boîte entière, le débit et ses chutes
réutilisables, et les ombres de parasol.

Navigateur : les six golden files restent identiques au bit près, et tous les panneaux pilotés par
le moteur affichent leurs chiffres — BOM (1 295 €), implantation (37 vis, comme l'oracle), chantier
(11,5 h), méthode, plan de coupe.


## Phase 4 — 28 août 2026 — **partielle**

Trois incréments livrés et vérifiés, sur les cinq que demande la phase. Le critère de sortie
(« `legacy.ts` ne contient plus que les panneaux UI et la couche 3D ») **n'est pas atteint** :
voir « Ce qui reste » plus bas.

### 4a — La séparation donnée / vue (§5.2) ✅

Les huit poignées SVG que chaque objet portait (`el`, `nameEl`, `pointEls`, `ptLabelEls`,
`edgeEls`, `segLabelEls`, `radiusHandle`, `camMarkerEl`) vivent désormais dans une carte indexée
par clé — `src/render/vues.ts`, avec `vue(obj)` et `detruireVue(obj)`. 118 accès remplacés, et les
deux boucles de démontage recopiées deviennent un seul appel.

Ce que ça ferme : la donnée du plan est **serialisable par construction**. La liste blanche de
`serializeObjects` existait d'abord pour ne pas embarquer de nœud DOM ; cette classe de bug
disparaît. Un commentaire de `duplicateSelectedObject` qui invoquait précisément cette raison est
devenu faux et a été corrigé — le détour par serialize/normalize reste utile, mais pour une autre
raison (les invariants de tableaux).

**Vérifié :** aucune fuite de nœuds sur trois cycles complets de réinitialisation — 19 polygones,
288 textes, 161 cercles, 167 lignes, 12 chemins, identiques à chaque cycle.

### 4b — La transformation de scène devient un objet nommé (§6.1) ✅

`scale` et `originScreen` étaient deux variables libres lues et écrites depuis une quarantaine
d'endroits. Elles forment un objet `scene`, et la conversion monde ↔ écran vit dans
`src/render/scene.ts` avec la scène **en paramètre**.

`W` et `H` restent dans `legacy.ts` : remplacer globalement deux identifiants d'une lettre serait
plus risqué que profitable tant que `render/**` n'est pas sorti.

**Vérifié :** zoom molette (100 → 110 px), retour exact au zoom arrière, « Ajuster à la sélection »
(100 → 413), grille redessinée.

### 4c — La pile d'annulation (§3.2, `core/history.ts`) ✅

`PileAnnulation` ne connaît ni le plan, ni le DOM, ni le rendu : empiler, dépiler, borner à 60.
`snapshotState()` et `restoreState()` restent dans `legacy.ts` — ce sont des orchestrateurs qui
démontent et reconstruisent la scène, pas de la gestion de pile ; ils partiront avec `render/**`.

**Vérifié au navigateur :** 65 duplications puis annulations en boucle → exactement **60 pas
d'annulation possibles**, 100 objets ramenés à 40. La borne se comporte comme le type le dit.

### Un bug produit, préexistant, consigné et non corrigé

**Après une annulation, plusieurs actions d'édition cessent silencieusement d'agir.** Constaté sur
deux gestes différents : « Dupliquer » ne crée plus rien (aucun objet, aucun message), et le
double-clic sur un côté n'insère plus de point. Les gestionnaires s'exécutent bel et bien - une
sonde temporaire l'a montré - mais l'effet ne se produit pas. Indice relevé au passage, à verser au
dossier : sur le côté double-cliqué, le gestionnaire part **deux fois**, la seconde avec une
sélection courante différente, ce qui suggère qu'un élément de poignée survit à la reconstruction.

Ce n'est **pas** une régression : les deux scénarios donnent exactement le même résultat sur
`legacy/plan_interactif.html`, l'artefact gelé d'avant migration - duplication (35 → 38 → 35 → 35)
et insertion de point (6 → 6 après une annulation, alors que 6 → 7 sur une page neuve). C'est
précisément à cela que sert ce fichier. Conformément à la §10.3, il est consigné et **non corrigé
pendant la migration** — le faire ici mélangerait un changement de comportement à un déplacement
de code, et brouillerait la seule chose que les golden files savent prouver.

### Ce qui reste de la phase 4

| Étape | État | Pourquoi |
|---|---|---|
| `core/state.ts` — l'`AppState` complet de la §6.1 | ⏳ | Demande de faire passer un contexte dans ~100 fonctions et tous leurs appels : c'est le gros du travail, et il ne se découpe pas en incréments vérifiables aussi nets que les précédents. |
| `render/**` — `render()`, `createObjectDOM`, `rebuildHandles`, `drawGrid`, les mesures, l'aperçu parasol | ⏳ | Ces fonctions lisent une dizaine de variables de la fermeture (`objects`, `selectedKey`, `highlight`, `svg`, `gridGroup`, `scene`…). Elles sortiront avec l'`AppState`, pas avant. |
| `interaction/**` — pointeur, édition, création | ⏳ | Même dépendance, plus l'état de glisser-déposer. |

Autrement dit : les deux morceaux que la phase 4 pouvait livrer **isolément** le sont ; le reste
forme un seul bloc dont le préalable est l'`AppState`. Le découper à la hache produirait un état
partagé à deux endroits — exactement ce que la §6.1 interdit (« pas de `let` au niveau module,
cela reproduit le problème avec une ergonomie pire »).


## Phase 5 — 28 août 2026 — **partielle, et bloquée par la spec elle-même**

La §4 est explicite : *« ne pas commencer `ui/**` avant que `render/**` soit sorti »*. `render/**`
est encore dans `legacy.ts` (phase 4 partielle), donc la phase 5 ne peut pas être menée dans
l'ordre prévu. Ce qui a été livré, ce sont les modules `ui/**` qui **ne dépendent pas du rendu** —
vérifié fonction par fonction, pas supposé.

### Livré

| Module | Contenu | Pourquoi il pouvait sortir |
|---|---|---|
| `ui/dialogs.ts` | `showToast`, `showConfirm`, `showPrompt`, `showErrBanner`, `showProjectLoadError` | Ne touchent ni au plan ni au rendu |
| `ui/texturePicker.ts` | catalogue Poly Haven + fenêtre de choix | Ouvre, laisse choisir, rappelle `onChoisi` : ce sont les appelants qui appliquent et redessinent |
| `ui/dom.ts` | `el()`, `elOpt()`, `els()`, `on()` (§7.1) | Aucune dépendance ; en place pour que le code neuf n'ajoute pas de `getElementById` non gardé |

**Un doublon supprimé au passage.** En phase 1, `main.ts` portait une copie du bandeau d'erreur,
parce que `showErrBanner` vivait dans `legacy.ts` et n'était donc pas disponible si c'est
justement le chargement de `legacy` qui échouait. Maintenant que le bandeau est dans un module
sans dépendances, `main.ts` l'importe statiquement et la copie disparaît.

### Écarté après vérification

`renderPanneauPlu` semblait indépendant du rendu — un premier test de dépendance le disait. Il
appelle en réalité `trouverParcelleCloture()`, qui lit `objects` : il attend donc `render/**`,
comme les autres panneaux. Le test de dépendance ne regardait que les identifiants cités
directement, pas ceux atteints par un appel.

### Tests

19 tests ajoutés (182 au total), tous sous **jsdom** — c'est la première fois que du code
d'interface est testé dans ce projet (spec §11.2), et il n'était tout simplement pas testable
tant qu'il vivait dans la fermeture de `boot()`.

Ce que les tests du sélecteur de textures ont demandé de comprendre : « Enregistrer » ne rappelle
pas le catalogue mais la **liste des fichiers** de la texture. Une simulation qui répond la même
chose aux deux URL fait croire qu'on teste l'enregistrement alors qu'on teste un échec.

### Ce qui reste de la phase 5

Tous les panneaux qui pilotent le plan — sélecteur d'objets, panneau d'attributs, tableau
d'affichage, mesures, PLU, barre de projet, configurateur de terrasse — appellent `render()` et
lisent l'état du plan. Ils sortiront quand `render/**` sera sorti, c'est-à-dire après l'`AppState`
de la phase 4. La spec ordonne ces deux phases dans ce sens précisément pour éviter qu'un panneau
se retrouve à porter une copie de l'état.


## Phase 4, suite — l'`AppState` (28 août 2026)

Le préalable des phases 4 et 5 restantes : **un seul objet d'état, explicite**, à la place des
variables libres de la fermeture de `boot()` (§6.1). `src/core/state.ts` définit `EtatApp` et
`creerEtat()`, et `boot()` le crée en première ligne.

### Ce qui a rejoint l'état

| Groupe | Variables | Usages réécrits |
|---|---|---|
| Données du plan | `objects`, `measures` | 207 |
| Sélection et onglets | `selectedKey`, `highlight`, `attrTab`, `panelTab` | 69 |
| Modes | `appMode`, `terrasseSelectedKey` | 52 |
| Bascules et édition | `showNorth`, `grilleVisible`, `voisinageVisible`, `dirty`, `newObjCounter` | 33 |
| Calque d'ombre | `parasolOmbreAffichee`, `parasolCarteAffichee`, `parasolDateStr`, `parasolMinutes` | 26 |

334 accès passent désormais par `etat.` — et `creerEtat` reçoit `normalizeObjects` en paramètre,
parce que la normalisation vit encore dans `legacy.ts` et que `core/` ne doit pas dépendre de
`legacy` (§3.3).

### Deux pièges rencontrés, dont un attrapé par les golden files

**1. Le nom de l'état existait déjà.** `ouvrirImportCadastre()` déclare son propre
`const etat = {…}` — l'état du dialogue d'import. Dans ses 750 lignes, l'état global était donc
**masqué** : une écriture `etat.objects` y aurait silencieusement visé le dialogue. Aucune de mes
réécritures n'était tombée dans cette plage (vérifié champ par champ), mais le piège restait
armé pour la suite : la variable locale s'appelle maintenant `etatImport`.

**2. Le SVG exporté a changé — et c'est le golden file qui l'a dit.** Mon remplacement ne
distinguait pas le code des chaînes de caractères : `id="measures-data"` et `data-measures` sont
devenus `id="etat.measures-data"` et `data-etat.measures`. Le round-trip interne aurait continué
de marcher (export et import utilisaient le même nom faux), mais **tout SVG exporté avant cette
version aurait perdu ses mesures à la réimportation**. Corrigé, puis vérifié pour de bon : le
`plan.svg` de `tests/fixtures/golden/`, produit avant la migration, se réimporte et ses mesures
sont reconnues.

C'est exactement ce que les fixtures de la phase 0 existent pour attraper — et le seul des cinq
groupes de variables qui ait cassé quelque chose.

### Vérifications

Après chaque groupe : `tsc`, `eslint`, build, puis contrôle au navigateur. Sélection et poignées,
onglets d'attributs, grille (167 → 129 → 167), flèche du Nord, aller-retour mode Terrasse,
duplication/annulation/réinitialisation, mesures, et les ombres de parasol qui se déplacent
correctement quand on passe du solstice d'été au solstice d'hiver. Les six golden files sont
identiques. 7 tests ajoutés sur `creerEtat` (189 au total).

### Ce qui reste libre dans `boot()`

54 variables : l'état d'interaction (glisser, pincement, double-clics), l'orthophoto, l'outil de
mesure en cours de saisie, la 3D, et `W`/`H`. Ce sont les états que `render/**` et
`interaction/**` emporteront avec eux — ils n'ont plus de raison structurelle de rester, juste
l'ordre de la migration.


## `render/**` et `interaction/**` — premiers modules (28 août 2026)

L'`AppState` étant en place, ces deux couches peuvent enfin sortir : une fonction de rendu qui
reçoit l'état **dit dans sa signature** ce dont elle a besoin.

| Module | Contenu | Dépendances rendues explicites |
|---|---|---|
| `render/theme.ts` | encres du plan SVG selon le thème système | — |
| `render/svg.ts` | `svgNS`, `creerSvg<K>()` typé, `attrs()` (§7.2) | — |
| `render/decor.ts` | flèche du Nord, échelle graphique | scène + bascule, groupe SVG reçu |
| `render/grille.ts` | grille du plan | scène + bascule, groupe SVG reçu |
| `render/measures.ts` | géométrie des cotes recalculée à chaque rendu | liste des objets |
| `interaction/editing.ts` | édition par longueur de côté et par angle | contour de contrainte |

`W` et `H` rejoignent `etat.scene` : la taille utile de la scène appartient à la transformation,
pas à une variable libre. Les appels existants passent par des enveloppes d'une ligne — le reste
de `legacy.ts` n'est pas touché tant que `render()` n'est pas sorti à son tour.

### Le piège des identifiants d'une lettre, cette fois réalisé

Renommer `W`/`H` a détourné **les variables locales de `renderImplantation()`** : cette fonction
déclare ses propres `W` et `H`, le format papier en millimètres. Après remplacement, elle
affichait la taille de la fenêtre à la place — l'implantation aurait annoncé un format faux, et
aucun test ne l'aurait vu, puisque les golden files ne couvrent pas ce panneau.

Repéré en cherchant les déclarations locales masquées avant de conclure, restauré sur la portée
exacte de la fonction, et vérifié à l'écran : *« sur papier : 69 × 90 mm — tient en A4 paysage »*.
C'est la troisième fois qu'un remplacement global mord au-delà de sa cible dans cette migration
(les `];` de la phase 3, les chaînes de caractères de l'`AppState`, les locales ici) : le
remplacement mécanique va vite, mais il ne se relit pas tout seul.

### Une fausse alerte, correctement diagnostiquée

Le `projet.json` de référence a divergé après un contrôle — sur `objects[0].affichage`, passé de
`null` à `{voisinage:true, grille:true}`. C'était **mon propre test** : basculer la grille
enregistre le réglage sur la parcelle, comme prévu. Revérifié sur une page neuve sans y toucher :
identique. Une divergence de golden file mérite un diff, pas une conclusion.

### Tests

22 tests ajoutés (221 au total), dont les invariants qui portent vraiment : la grille garde un pas
lisible de 4 à 220 px/m, l'échelle passe aux centimètres au bon moment, une cote survit à la
suppression de sa cible sans planter, et l'édition **refuse** au lieu de déformer — sommet gelé,
ou point candidat hors du contour.

Vérifié au navigateur : Nord affiché/masqué, grille, échelle, implantation, et une longueur de
côté portée de 2,84 à 6,72 m qui fait passer l'aire de la terrasse de 35,01 à 31,79 m², puis
annulation qui restaure 35,01.

### `render/objects.ts` — les elements SVG d'un objet

`createObjectDOM` et `rebuildHandles` sortent a leur tour. Deux changements de forme, aucun de
fond :

- la racine SVG et la scene sont des parametres ;
- le double-clic sur un cote est **delegue a l'appelant** par un rappel. Le module fabrique les
  poignees ; il ne sait pas quel objet est selectionne, ni comment convertir des pixels en metres.
  C'est `legacy.ts` qui le sait, et qui fournit le rappel.

Le typage a fait remonter une anomalie de plus, conservee telle quelle (§10.3) : le code pose
`el.title = '…'` sur des elements SVG pour obtenir une infobulle. Sur un element SVG, `title`
**n'est pas un attribut standard** : l'affectation cree une propriete JavaScript inerte et
n'affiche rien. Il faudrait un enfant `<title>`. Le comportement est conserve a l'identique
(fonction `titreInerte`, nommee pour ce qu'elle fait), l'anomalie est consignee.

**Verification serree, parce que ce morceau touche a tout :** 19 polygones, 12 chemins, 161
cercles, 288 textes, 127 poignees de sommet et 116 poignees de cote apres selection ; duplication
et annulation coherentes ; et surtout l'insertion d'un point par double-clic sur un cote, qui passe
desormais par le rappel : 6 sommets → 7, puis 6 apres annulation.


### Une régression que les golden files ne pouvaient pas voir

En sortant `pathD` et `polyStr` — les deux fonctions laissées en phase 2 faute de scène explicite —
j'ai découvert que **deux scènes coexistaient** : `etat.scene`, lue par les modules extraits, et un
`const scene` resté dans `legacy.ts`, écrit par le zoom et le déplacement. Exactement le double état
que la §6.1 interdit.

Symptôme : la molette modifiait une scène, le dessin lisait l'autre. **Le zoom ne faisait plus
rien.** Introduit en sortant le décor et la grille (commit `7fb5852`), présent dans les deux commits
suivants.

Pourquoi rien ne l'avait signalé : les six golden files sont des **exports**, et un export ne dépend
pas de la transformation d'écran — le SVG exporté est recalculé dans son propre repère. Les tests
unitaires, eux, passent la scène en paramètre, donc ils ne pouvaient pas voir deux scènes. Seul un
zoom réel dans le navigateur le montrait, et je n'avais vérifié que la barre d'échelle, qui
n'avait légitimement pas bougé à ce niveau de zoom.

Corrigé en supprimant la scène en double. Deux occurrences avaient échappé au remplacement, pour
des raisons instructives : `versEcran(scene, p)` n'est pas suivi d'un point, et dans
`{...scene.origine}` le point vu par le garde-fou était celui de l'opérateur de décomposition.

Vérifié après correction, contre les valeurs relevées en phase 4b : largeur 100 px, zoom avant 110,
retour exact à 100, « Ajuster à la sélection » 413, flèche du Nord présente, barre d'échelle « 2 m ».

**La leçon, pour la suite :** les golden files couvrent ce qui sort de l'application, pas ce qu'on
voit à l'écran. Tout déplacement touchant la transformation de vue doit être vérifié par un zoom et
un déplacement réels, pas seulement par les exports.



### `interaction/navigation.ts` — zoom, pincement, déplacement, cadrage

Le calcul de la navigation sort à son tour : `zoomerAutourDe`, `zoomMolette`, `debutPincement`,
`pincer`, `deplacer`, `milieuDe`, puis `empriseDe` et `cadrerSur`. Ces fonctions prennent une scène
et rendent la suivante ; le câblage des événements — identifiants de pointeur, rectangles du DOM —
reste dans `legacy.ts`.

Ce n'est pas un rangement cosmétique : c'est précisément ce morceau que la régression des deux
scènes avait rendu inerte, et que ni les golden files ni les tests unitaires ne pouvaient voir. Il
est désormais couvert par 23 tests, sur les invariants qui comptent :

- au zoom, le point visé reste **exactement** sous le curseur ;
- au pincement, le point saisi reste sous les doigts, y compris quand la main se déplace en
  pinçant ;
- l'échelle reste bornée entre 6 et 220 px/m quel que soit l'acharnement ;
- un aller-retour de molette revient exactement à l'échelle de départ.

**Un écart du fichier d'origine, figé plutôt que corrigé** (§10.3) : le cadrage plafonne à
400 px/m alors que la molette et le pincement s'arrêtent à 220. Cadrer sur un tout petit objet peut
donc dépasser ce que la molette autorise ensuite. Un test l'énonce explicitement — mieux vaut une
incohérence documentée qu'une cohérence supposée.

**Vérifié au navigateur, en pilotant de vrais événements de pointeur** : zoom 62 → 68 → 62 px de
large ; déplacement à trois doigts de 50 px demandés, 50 px obtenus, sans dérive d'échelle ;
pincement qui double l'écartement et double l'échelle au chiffre près (rapport 2,000), puis retour
exact ; cadrage d'une terrasse de 62 à 240 px dans une scène de 320.


### `render()` réduit à son orchestration

Le corps de `render()` — la boucle de 113 lignes qui place les éléments SVG de chaque objet — part
dans `render/objects.ts` sous le nom `positionnerObjet()`. Ce qui reste dans `render()` est la
séquence des sous-rendus, plus ce que le module ne peut pas savoir : la sélection courante, le
masquage, l'état du fond orthophoto, et le pointage en cours pour l'outil de mesure.

Le dessin des cotes suit (`dessinerCotes`), ainsi que deux fonctions qui portent une décision de
conception : `distanceSortiePolygone` et `ancrageHorsContour`. Une étiquette de cote se pose **hors
du contour**, du côté opposé au centre de la parcelle, et au-delà de la **dernière** sortie du
rayon — pas de la première. Sur une forme concave, viser la première sortie poserait l'étiquette
dans un vide intérieur. C'est le défaut qui avait été corrigé à la main dans le dossier PDF ; il
est maintenant figé par un test, sur une forme en C où le rayon ressort, rentre, puis ressort.

`angleInterieurDeg` rejoint `geometry/basic.ts` : comme `signedArea`, c'est le sens de parcours qui
y décide de quel côté se trouve l'intérieur.

**Vérifié branche par branche au navigateur**, parce que ce morceau touche tout ce qui se voit :
19 polygones, 12 chemins, 161 cercles, 288 textes au chargement ; étiquettes de nom et six cotes en
mètres ; sélection qui montre 6 poignées pour la terrasse et aucune pour les autres objets, trait à
3 px ; angles 0 → 6 en cochant la colonne « Angle » ; opacité du terrain 1 → 0,15 avec l'orthophoto
(4 tuiles) puis retour à 1 ; les quatre cotes avec leurs traits de rappel, et le basculement
perpendiculaire / le long qui fait apparaître une cote « ⊥ 14,85 m ».

Une variable morte du fichier d'origine (`const objCenter`, jamais lue) a été retirée — signalée
par eslint, maintenant que ce code est vérifié.

### Le glisser-déposer, et son principe de refus

`interaction/drag.ts` reprend les cinq gestes qui modifient la géométrie : déplacer une forme, un
cercle, un sommet, un côté, et changer un rayon. Le `pointermove` de `legacy.ts` passe de 87 lignes
à 6 : il ne fait plus que traduire l'événement en mètres et fournir le contour de contrainte.

Un principe traverse le module, et il méritait d'être écrit plutôt que déduit : **on refuse plutôt
que de déformer**. Chaque geste calcule un candidat, le teste entièrement contre le contour, et
n'applique rien s'il en sort. Rien n'est rogné ni ramené au bord — une forme qui s'arrêterait au
contour en changeant de proportions mentirait sur ce qu'on vient de dessiner. Le refus est en bloc :
si un seul sommet sortait, la forme entière reste où elle est.

Deux détails du fichier d'origine sont conservés tels quels et désormais documentés :

- **Le débordement d'un cercle se teste par seize points de son bord**, pas par une vraie
  intersection cercle/polygone. Un test le prouve : une fente de contour plus étroite que l'écart
  entre deux rayons échantillonnés laisse passer un cercle qui déborde réellement. Sur une parcelle
  aux côtés métriques le cas est théorique, et le calcul est payé à chaque image d'un glisser.
- **Un sommet dont un voisin est gelé ne peut plus que coulisser** sur sa direction d'origine depuis
  ce voisin, ce qui préserve l'angle ; avec ses deux voisins gelés, il ne bouge plus du tout. Un
  plancher de 0,05 m empêche le côté de s'annuler puis de se retourner quand le pointeur passe
  derrière l'ancre.

**Vérifié par événements de pointeur réels, contre le témoin figé `legacy/plan_interactif.html`**,
parce que ni les golden files ni les tests unitaires ne voient un glisser : un export est recalculé
dans son propre repère. Les deux versions donnent les mêmes chiffres, à la dernière décimale —
sommet tiré de (+12,7095 ; −8,1172) m avec les cinq autres sommets immobiles, côté translaté de 9 px
sur ses deux extrémités, cercle déplacé de (10 ; 6), rayon augmenté de 20,418 à centre fixe,
déplacement de vue de 40 px qui revient exactement à son point de départ. Y compris **le même
refus** : la terrasse de démonstration touche le bord de la parcelle et ne se translate pas, sur
l'une comme sur l'autre.

Fausse piste au passage : une première mesure montrait le cercle immobile sur le témoin et mobile
sur la version migrée. C'était l'état laissé par la sonde précédente sur la même page, pas un écart
de comportement — rejouée à froid, la mesure est identique. Une sonde qui modifie le plan doit
repartir d'un chargement neuf.

### Une suite de tests avait cessé de se charger sans que rien n'échoue

En ajoutant les tests du glisser, le total est passé de 254 à 278 alors que 24 tests seulement
étaient nouveaux. `tests/unit/render/measures.test.ts` — 15 tests — ne se chargeait plus depuis que
`dessinerCotes` avait fait entrer `render/theme.ts` dans ses imports : ce module lit
`window.matchMedia` au chargement, ce qui n'existe pas dans l'environnement Node des tests.

Le point à retenir n'est pas la correction (une garde `typeof window !== 'undefined'`, l'encre
claire hors navigateur) mais **la façon dont l'incident se cache** : une suite qui échoue au
chargement ne fait échouer aucun test. Le compte total avait silencieusement baissé de 254 à 239, et
la ligne `Tests` restait verte. Le nombre de tests est une donnée à surveiller, pas seulement leur
couleur.

### Les quatre tableaux qui doivent rester en phase

Une forme ne porte pas seulement ses points : elle porte le nom de chaque coin, le nom de chaque
côté, et l'état gelé de chaque coin. Ajouter ou retirer un sommet, c'est quatre `splice` au même
indice — et un oubli sur l'un des trois décale tous les noms suivants, ce qui affiche « Coin 3 » sur
le quatrième coin sans que rien ne signale l'erreur. `model/sommets.ts` fait cette chirurgie au même
endroit, une fois.

Deux comportements du fichier d'origine sont conservés et maintenant figés par des tests, parce
qu'ils ressemblent à des défauts et qu'une « correction » silencieuse changerait un export :

- **Le point inséré est projeté sur le côté**, pas posé là où on a cliqué : un double-clic vise un
  trait, et un sommet posé à côté du trait déformerait la forme au lieu de la subdiviser.
- **Les noms par défaut sont numérotés d'après le nouveau total**, pas d'après la position
  d'insertion : deux insertions peuvent donc produire deux « Coin 5 ». Ce sont des suggestions
  éditables, pas des clés.

La suppression d'un objet, elle, réutilise `detruireVue()` de `render/vues.ts` au lieu de refaire à
la main le retrait des huit familles d'éléments SVG. Le module oublie **en plus** l'entrée de sa
carte, que le code en place laissait derrière lui à chaque suppression — une fuite lente, invisible
à l'usage, que l'API du module ferme au passage.

**Vérifié sur les deux versions** : insertion 6 → 7 sommets avec les poignées et les côtés qui
suivent, point inséré exactement sur le trait (écart nul) et aux mêmes coordonnées à la quatrième
décimale — (197,6103 ; 141,9395) des deux côtés ; suppression d'un coin 7 → 6 avec les trois
tableaux en phase ; suppression d'un objet qui ne laisse plus aucun élément portant sa clé dans le
document. Les six empreintes sont inchangées.

### Une sonde qui croyait sélectionner, et désélectionnait

Ce morceau a produit une fausse alerte de régression : la version migrée n'insérait aucun sommet là
où le témoin en insérait six. La cause n'était ni dans l'une ni dans l'autre. **La terrasse est déjà
sélectionnée au chargement** ; le clic « sélectionne-la d'abord » de la sonde était donc un clic
simple sur un objet déjà sélectionné — c'est-à-dire, exactement comme prévu, une désélection. Tous
les clics suivants tombaient alors sur `ds.key !== etat.selectedKey` et ne faisaient rien.

Ce qui a permis de trancher, et qui vaut pour toute vérification par événements : **rejouer la même
sonde sur le témoin figé, à froid**. Un écart entre deux pages dont l'une a déjà servie ne prouve
rien. Depuis, la sonde lit l'état avant d'agir (`stroke-width === '3'`) au lieu de le supposer.

### Aligner, c'est se caler sur une droite — pas sur une direction

`geometry/alignement.ts` fait tourner une forme jusqu'à ce que l'un de ses côtés soit parallèle à un
côté désigné ailleurs sur le plan, puis, si on le demande, la pose à une distance donnée de cette
limite. C'est le geste qui sert à placer un abri « à 3 m de la clôture, dans son alignement ».

Trois décisions y sont écrites, parce qu'aucune ne se devine en lisant le calcul :

- **La rotation est repliée dans ±90°.** Un côté s'aligne sur une *droite*, pas sur une direction :
  tourner de 170° pour obtenir ce qu'une rotation de −10° obtient aussi bien retournerait l'objet
  bout pour bout, et un abri se retrouverait porte au fond.
- **Le pivot est le milieu du côté aligné**, celui qui bouge le moins. Pivoter autour du centre de
  la forme ferait glisser le côté qu'on cherchait justement à caler.
- **La translation garde la forme du côté où elle est déjà** : une distance est un écart, pas une
  position. Et elle se mesure depuis le côté aligné, pas depuis la forme entière — un carré de 4 m
  posé à 3 m d'une limite la dépasse donc de 1 m par son côté opposé. C'est bien ce qu'on demande ;
  c'est au contrôle du contour, chez l'appelant, de refuser si le résultat sort vraiment.

**Vérifié sur les deux versions**, six scénarios chacune : rotation seule, distance 2 m, distance
nulle, distance négative, distance illisible, et un objet dont l'alignement est refusé par le
contour. Toutes les coordonnées coïncident à la quatrième décimale — la table passe de
(113,8329 ; 201,4140) à (115,5514 ; 201,8332) des deux côtés en rotation seule, et à
(63,0123 ; 246,3911) avec 2 m. Les six empreintes sont inchangées.

Deuxième fausse alerte du même genre que la précédente, et elle mérite d'être notée : la version
migrée translatait là où le témoin ne faisait que tourner. En cause, **le champ « distance » gardait
la valeur d'une sonde antérieure** sur cette page-là. Rejouée à froid des deux côtés, la mesure est
identique. C'est deux fois de suite que l'état résiduel d'une page a imité une régression.

### Six copies d'une même règle, dont deux qui divergeaient exprès

Ce qui s'écrit le long d'un côté ou à côté d'un coin — le nom, la mesure, les deux joints, ou rien —
était décidé par le même enchaînement de trois lignes recopié **six fois** : à l'écran, dans les
deux mises à jour ciblées du panneau d'attributs, dans l'export SVG (polygone et chemin) et dans les
deux PDF. Deux de ces copies employaient une ponctuation différente : `-` au lieu de `—`, `deg` au
lieu de `°`.

Cette différence est voulue — un PDF écrit ses textes en WinAnsi, où le tiret cadratin et le signe
degré ne survivent pas — mais rien ne le disait, et rien n'empêchait qu'une copie « corrigée » par
mégarde casse un export. `model/etiquettes.ts` fait de la ponctuation un paramètre nommé
(`SEP_ECRAN` / `SEP_EXPORT`, `DEGRE_ECRAN` / `DEGRE_EXPORT`) : l'écart se lit au lieu de se deviner.

Le calcul de l'angle reste paresseux là où il l'était : ce rendu passe sur chaque point de chaque
objet à chaque image, et calculer un angle qu'on jette n'aurait rien coûté de visible mais aurait
été une régression gratuite.

### Les golden files n'exerçaient pas la branche que je modifiais

En vérifiant, un fait embarrassant : `plan.svg` contient **14** étiquettes de mesure seule et
**aucune** étiquette composée, ni **aucun** angle. Le jeu de démonstration a ces cases décochées.
Autrement dit, une régression sur la composition des étiquettes n'aurait fait bouger **aucune** des
six empreintes — le même angle mort que le zoom, sous une autre forme : là une transformation que
les exports ne voient pas, ici une branche que le jeu de démonstration n'emprunte pas.

La vérification a donc été faite à la main, sur les deux versions, toutes cases cochées sur tous les
objets : 265 textes dans le SVG dont 204 composés et 88 angles, et les longueurs cumulées des textes
identiques au caractère près (3 931 pour le SVG, 5 019 pour le PDF). Le contrôle et ses valeurs
attendues sont maintenant écrits dans [`EMPREINTES.md`](../tests/fixtures/golden/EMPREINTES.md) —
sans quoi il ne resterait que dans ce journal, et personne ne le rejouerait.

### Ce que la BD TOPO ne dit pas

`geo/bdtopo.ts` réunit les quatre règles qui comblent les trous de la donnée IGN — des choix
assumés, pas des mesures, et c'est justement ce qu'il fallait écrire quelque part :

- **Un bâtiment sans hauteur mesurée** prend celle déduite de son nombre d'étages (2,70 m par
  niveau), et à défaut 2,50 m. Beaucoup d'annexes — garages, abris — n'ont pas de hauteur dans la
  BD TOPO ; un bâtiment de hauteur nulle donnerait une Vue 3D plate et une ombre inexistante. Une
  estimation avouée vaut mieux qu'un zéro qui se fait passer pour une mesure.
- **Une zone de végétation** prend la hauteur typique de sa nature, 6 m si la nature est inconnue.
  Les libellés IGN sont accentués : un test le rappelle, parce qu'un libellé désaccentué ne
  correspondrait à rien et retomberait silencieusement sur 6 m.
- **Les arbres sont estimés, jamais relevés** : la BD TOPO donne des zones, pas des arbres isolés.
  On y répartit une grille décalée d'un bruit **déterministe** — une fonction de la position, pas un
  tirage — parce que rouvrir un projet ne doit pas déplacer les arbres et changer les ombres.
- **Le libellé d'une parcelle** nettoie les zéros de tête de l'IDU (`0101` → `101`) sans jamais
  rendre une chaîne vide : une parcelle numérotée `0` garde son zéro.

Les nombres de la BD TOPO arrivent en texte à virgule française (`5,2`), que `parseFloat` tronque à
`5` : `nombreFr` existe pour ça, et un test le fige.

### La chaîne cadastre, vérifiée en vrai

La limite annoncée au commit précédent — « l'import de bout en bout n'a pas été rejoué » — est
levée. Import réel joué **sur les deux versions**, contre les services IGN en ligne, à la même
adresse publique (la mairie de Rennes, pour ne viser aucun particulier) et avec les mêmes choix par
défaut à chaque étape : géocodage BAN → parcelle API Carto → bâtiments BD TOPO → `objetsDepuisCadastre`.

Résultat : **projet identique**, `84bc5173…`, 25 108 octets, mêmes hachés objet par objet — la
parcelle AC 530 de 418 m² et trois bâtiments dont les hauteurs mesurées (16 ; 15,5 ; 13,8 m)
traversent bien `hauteurBatiment`, et dont les noms passent par `libelleParcelle`.

Un détail qui a d'abord fait croire à un écart : les deux exports faisaient exactement la même
taille mais pas la même empreinte. La cause était un quatrième horodatage, `interrogeLe`, posé par
l'interrogation du PLU — de largeur fixe, donc invisible au comptage d'octets. C'est le même piège
que celui de `/CreationDate` dans les PDF, et il rappelle qu'une comparaison d'imports doit
neutraliser **quatre** champs, pas trois : `recupereLe`, `interrogeLe`, `exportedAt`, `writtenAt`.

### La Vue 3D était cassée depuis mon propre correctif du zoom

En sortant `buildThreeScene` dans `three/scene.ts`, TypeScript a refusé une ligne que personne ne
regardait : la fonction déclarait `const scene = new THREE.Scene()` puis ajoutait tout à
`etat.scene` — qui est la **transformation de vue du plan**, et n'a pas de méthode `add`.

C'est ma régression, et elle vient du commit qui réparait le zoom (« une seule scène ») : le
remplacement en masse de `scene.` par `etat.scene.` a aussi capturé les scènes **locales** de la 3D.
Trois autres fonctions étaient touchées — `attendreTexturesPretes`, `disposeThreeScene` et
`buildGlbViewerScene` — ce qui bloquait en plus l'export GLB.

Le symptôme était pourtant net dans la console (`TypeError: etat.scene.add is not a function`), mais
rien ne le regardait : les golden files ne couvrent pas la 3D, et **un `<canvas>` présent suffisait
à faire croire que la vue marchait**. C'est le troisième angle mort de la même famille, après le
zoom et la composition des étiquettes.

Corrigé aux 33 sites, en ne touchant que les accès qui sont des opérations Three (`add`, `remove`,
`traverse`, `background`) : les 29 accès restants à `etat.scene` sont bien `scale` / `origine` /
`W` / `H`. Vérifié par une mesure de **contenu** et non de présence — 13 couleurs distinctes dans un
carré de 20 px au centre du canvas (un aplat en donnerait une), et surtout un GLB de
41 473 604 octets dont l'empreinte structurelle est exactement celle du golden : 203 nœuds,
200 maillages, 288 matériaux, 178 textures, 1 scène, glTF 2.0.

Une correction de ma part, au passage : j'avais écrit un peu plus tôt que le GLB restait bloqué « à
cause des textures distantes que cet environnement ne sert pas ». C'était faux deux fois — la cause
était ce bug, et si le témoin figé semblait bloqué lui aussi, c'est que ma sonde attendait par une
boucle synchrone, qui empêche justement tout travail asynchrone d'aboutir.

### Les gros morceaux d'interface, un par un

Cinq extractions se sont enchaînées sur le même patron : la fonction reçoit `etat` et un `ctx` qui
porte ce qu'elle doit pouvoir déclencher, et le câblage reste dans `legacy.ts`.

- **`ui/attrPanel.ts`** (717 lignes) — le panneau qui pilote le plan. Sa règle, désormais écrite en
  tête : une saisie en cours ne doit jamais passer par `render()`, qui reconstruit la table et
  détruirait le champ qu'on est en train de remplir.
- **`ui/terrassePanels.ts`** (1 373 lignes) — les huit panneaux du mode Terrasse. Ils lisent la
  construction, ils ne la déduisent pas : tout le calcul reste dans `engine/`.
- **`ui/cadastreDialog.ts`** (753 lignes) — le dialogue d'import en trois étapes.
- **`ui/projectBar.ts`** (667 lignes) — barre de projet, actualisation IGN, panneau PLU.
- **`three/scene.ts`** (631 lignes) et **`three/etat3d.ts`** — la Vue 3D et son état.

Deux états partagés ont pris un module à eux plutôt que de voyager dans un contexte :
`interaction/outilAlignement.ts` (trois lecteurs, un écrivain) et `three/etat3d.ts`.

### Deux pièges de portée, tous deux invisibles à la compilation

Le premier est bénin et connu : `etat:` est aussi une **clé** d'objet dans les métadonnées BD TOPO
(« état de l'objet »), et le remplacement `etat` → `ctx.etat` l'avait renommée.

Le second a coûté cher. `src/legacy.ts` ressemble à un fichier plat, mais tout son corps vit dans
`boot(seed)` : `const etat = creerEtat(...)` y est **local**. La fabrique de contexte, insérée entre
les imports au niveau du module, ne le voyait pas. Le boot s'arrêtait donc sur un `ReferenceError`
juste avant le premier `render()` — objets SVG créés mais jamais positionnés, tous les `<text>`
vides, barre de projet absente.

Ce qui a permis de trancher : construire **HEAD puis la modification et mesurer dans le même onglet
neuf**. 4 éléments de barre / 288 textes / 29 remplis d'un côté, 0 / 278 / 0 de l'autre. Sans cette
comparaison j'ai d'abord accusé l'environnement — un vieil onglet, encore chargé de l'état de mes
propres sondes, donnait les mêmes chiffres dégradés pour une tout autre raison.

### Un contrôle de santé, après trois fois le même piège

Trois extractions de suite ont été cassées par la même chose : un remplacement global d'identifiant
qui atteint autre chose que du code. Une **clé d'objet** (`etat:` dans les métadonnées BD TOPO), puis
deux fois un **identifiant d'élément dans une chaîne** (`getElementById('glbViewerFilaire')`,
`getElementById('orthoOpacite')`). À chaque fois le boot s'arrêtait, et à chaque fois l'erreur était
invisible : `main.ts` l'attrape et l'affiche dans un bandeau, elle n'apparaît donc pas dans la
console.

D'où un contrôle de santé, joué après **chaque** déplacement, en un seul appel : bandeau d'erreur,
nombre de `<text>` et de textes remplis, éléments de la barre de projet, boutons du sélecteur,
lignes de la table d'affichage. Un plan sain donne 288 / 29 / 4 / 14 / 36. Le premier symptôme d'un
boot interrompu est 278 / 0 / 0 — les objets SVG créés mais jamais positionnés.

Ce contrôle a payé immédiatement : les deux dernières occurrences ont été trouvées en un appel, là
où la première avait demandé une quinzaine d'allers-retours.

### La 3D, la visionneuse GLB, et deux régressions de plus

`three/glbViewer.ts` réunit le chargement de Three.js à la demande, le démontage des scènes et la
visionneuse. Le démontage mérite sa place ici : `renderer.dispose()` ne libère ni les géométries ni
les textures déjà téléversées, et sans le parcours explicite, rouvrir la Vue 3D dix fois laisse dix
scènes en mémoire vidéo.

En sortant ce bloc, une constante partagée (`SOLEIL_ELEV_PLANCHER`) est partie avec lui : la
construction de la scène 3D échouait alors **à mi-course**, produisant une scène de 46 nœuds au lieu
de 203, sans aucune erreur visible. Elle a désormais son module, `three/lumiere.ts`, parce qu'elle
appartient aux deux scènes.

### Les événements de pointeur, et ce que le terrain leur a appris

`interaction/pointeur.ts` reçoit les 289 lignes qui décident **quel geste s'applique** — le calcul
de chacun vit déjà ailleurs. Deux détails y sont désormais écrits, parce qu'ils expliquent la forme
du code et qu'ils viennent de l'usage réel :

- **Un double-tap au doigt n'est pas un double-clic à la souris.** Le doigt couvre plusieurs
  dizaines de pixels, se lève et se repose plus lentement, et saute d'un tap à l'autre. D'où une
  fenêtre plus large au toucher (600 ms contre 400) et un test de proximité : deux taps éloignés sur
  la même forme sont deux intentions, pas un double-tap.
- **Le second tap atterrit rarement au même endroit que le premier.** Il tombe souvent sur une arête
  plutôt que sur le corps de la forme, si bien que le double-tap objet ne se déclenchait jamais au
  doigt. On l'accepte donc quel que soit l'élément touché, à condition que le tap précédent ait visé
  le même objet.

### Le contrôle de santé ne voit pas tout

L'extraction des tables du chiffrage l'a montré : le plan restait **sain** — 288 textes, barre à
quatre éléments — pendant que la table du métré était vide. L'erreur était avalée par l'appelant.

Il a fallu comparer au témoin figé, chiffre contre chiffre : 7 lignes de métré et 18 de débit d'un
côté, 0 et 0 de l'autre. La cause était une fabrique de contexte insérée là où je croyais, mais pas
là où elle était : un `-replace` qui supposait l'indentation avait échoué **en silence**, laissant
un identifiant libre que le build accepte sans broncher.

Deux règles en sont sorties, appliquées depuis : vérifier par un `grep` que l'insertion a bien eu
lieu, et vérifier **la fonctionnalité déplacée** en plus du contrôle de santé.

### L'historique, sorti tel quel pour être réécrit

`core/historique.ts` est le seul module déplacé **sans intention de le garder en l'état** : il doit
être réécrit, et l'extraction sert à rendre cette réécriture possible. D'où sa forme — le code n'a
pas bougé d'une ligne, et l'en-tête dit en sept points ce qu'une réécriture doit savoir. Les trois
qui coûteront le plus cher à redécouvrir :

- **L'instantané passe par la même liste blanche que l'enregistrement.** Un champ ajouté à une forme
  sans être ajouté à `serializeObjects` est perdu *aussi par une annulation*, pas seulement par une
  sauvegarde.
- **La restauration démonte tout et reconstruit.** C'est ce qui lui permet de faire revenir un objet
  supprimé — ce que l'ancienne implémentation « patch des champs connus » ratait en silence.
- **Il n'y a pas de rétablissement.** Annuler perd l'avenir.

Les 18 tests de caractérisation figent le comportement actuel, y compris une **absence** : un test
vérifie qu'il n'existe pas de `retablir`. Le jour où le rétablissement arrive, ce test doit échouer —
c'est le signal qu'on attend de lui.

### Quatre modules, et deux règles écrites en double

Les extractions suivantes ont sorti le client `api.php` (`io/api.ts`), les hauteurs
(`engine/hauteurs.ts`), le lieu (`model/lieu.ts`), le curseur « semaine » (`util/semaine.ts`) et le
soleil des deux vues 3D (`three/lumiere.ts`). Aucune n'avait le moindre test ; elles en ont
maintenant **70**.

Deux d'entre elles n'étaient pas des déplacements mais des **réunions** : la même règle était écrite
deux fois, ce qui est exactement la façon dont deux vues finissent par diverger.

- Le **décalage d'un cran de semaine** était dupliqué dans l'écouteur de la Vue 3D et dans celui de
  la visionneuse GLB. La règle qui compte : le décalage est *relatif* à la date courante — sept
  jours par cran. Une position absolue depuis le 1er janvier ferait sauter d'un nombre de jours
  irrégulier au premier cran, dès que la date ne tombe pas sur un multiple de sept. Et ce n'est
  **pas** la semaine ISO : le curseur sert à naviguer, pas à nommer une semaine.
- Le **soleil** était calculé séparément dans chaque vue — trente lignes de trigonométrie et trois
  règles d'éclairage, en double. Le commentaire de l'une disait déjà « mêmes règles que » l'autre.
  La seule différence réelle est devenue un paramètre : la Vue 3D est centrée sur l'origine, la
  visionneuse sur la boîte englobante de son modèle.

Ce que la réunion du soleil a permis d'écrire une seule fois, et qui ne se devine pas : la nuit, le
soleil direct s'éteint **vraiment** (0) au lieu de faiblir ; le multiplicateur d'intensité multiplie
le facteur jour, donc le monter ne rallume jamais un soleil couché ; et la case « lumière d'appoint »
coupe les *deux* lumières autres que le soleil — n'en couper qu'une laissait l'ambiante éclairer
seule en pleine nuit, ce qui contredisait la case.

### Vérifier un changement que les empreintes ne voient pas

Les six golden files ne voient rien de la 3D. Pour le soleil, la vérification a donc intercepté ce
qui est **réellement passé à Three.js** — position de la lumière, facteur jour — en remplaçant
`Vector3.prototype.set` et `Color.prototype.lerp` le temps de la sonde, sur la version migrée et sur
le témoin figé, avec la même suite de réglages : solstices, coucher de soleil, intensité, appoint
décoché, cran de semaine.

Neuf réglages, deux vues, identiques au dernier chiffre — y compris le facteur de nuit
`0,13700954863358605`. La visionneuse GLB a été vérifiée sur un modèle réellement exporté, donc avec
un centre non nul : sans quoi le paramètre qui distingue les deux vues n'aurait pas été exercé.

C'est la même leçon que les tables du métré, sous une autre forme : quand l'oracle ne couvre pas ce
qu'on touche, il faut fabriquer l'oracle — et le faire jouer des deux côtés, à froid.

### Deux pièges de la capture des empreintes

Rejouer les six exports depuis le navigateur a fait ressortir deux détails qui coûtent chacun une
capture ratée :

- **`#exportBox` est réutilisé.** Le bouton « Générer le résumé » y écrit le résumé, mais l'export
  DXF y écrit ensuite le DXF. Lire la zone après avoir déclenché les autres exports rend le DXF sous
  le nom du résumé — 5 362 caractères au lieu de 15 323.
- **Le dossier PDF ne s'exporte pas sans sa liste.** `dossierSelection` n'est remplie que par
  `renderDossierTerrasses`, appelée à l'ouverture de l'onglet « Export ». Cliquer le bouton sans
  avoir ouvert cet onglet affiche « coche au moins une terrasse » et ne produit rien — silencieux si
  l'on ne compte pas les blobs.

### Le bloc 3D et terrasse, en cinq morceaux

Le plus gros gisement restant a été vidé en cinq étapes, chacune vérifiée contre le témoin avant la
suivante : la navigation des deux vues (`three/navigation.ts`), le soleil de la Vue 3D et les
chargeurs (`three/soleilVue3d.ts`, `three/chargeurs.ts`), le calque des couches et la clôture
(`render/terrasseCouches.ts`, `ui/cloture.ts`), puis la visionneuse GLB et le sélecteur de terrasse.

Ce que le découpage a mis au jour, et qui vaut d'être retenu :

- **La conversion d'un point de vue vers le repère de la scène était écrite deux fois** — une pour
  chaque vue. C'est la troisième duplication trouvée dans ce bloc, après le libellé du lieu et le
  décalage de semaine. Un point de vue est un point *et* un vecteur : déplacer son second point
  réoriente la caméra, sans champ à tenir à jour. Le plan compte Y vers le nord, la scène Z vers le
  sud, d'où un retournement d'axe que rien ne signalait.
- **Un drapeau allait servir à deux scripts différents.** `exporteurGltf` distinguait mal l'exporteur
  (écrire un `.glb`) du lecteur (en relire un) ; chacun a maintenant le sien.
- **Les deux vues rangent enfin leur état de la même façon.** Le soleil de la Vue 3D vivait dans cinq
  variables locales, celui de la visionneuse dans un objet : leur séparation ressemblait à un
  accident. Elle est maintenant un choix visible.
- **La règle des traits qui maigrissent** dans le calque des couches est le seul réglage qui dépende
  de ce qui est coché ailleurs : à pleine épaisseur, deux couches superposées forment une bouillie.
- **Deux passes plutôt qu'un `find()` à deux critères** pour trouver la parcelle : depuis l'import
  cadastre, les parcelles *voisines* sont elles aussi `fonction === 'terrain'`, et un `find()` unique
  rattacherait la clôture — et la course du soleil — au terrain d'à côté.

La création d'objets, la normalisation et les contraintes de parasol sont sorties dans le même
mouvement, avec 44 tests. `model/creation.ts` sépare les **fabriques** (pures, testables : la forme
qu'un objet neuf doit avoir) de la **pose dans le plan** (sept gestes qui doivent tous avoir lieu ;
en oublier un donne un objet invisible, ou sélectionné sans poignées).

### Une erreur de méthode, et sa correction

Le fichier de tests de l'étape `alpha.39` a été commité **sans passer `tsc`** : j'avais lancé le
typecheck avant d'écrire le fichier, pas après. Les tests passaient, la compilation non. Corrigé à
l'étape suivante, et la leçon est celle qu'on croyait déjà acquise : la vérification vaut pour l'état
final de l'étape, pas pour un état intermédiaire qui lui ressemblait.

### `app/`, et trois choses qui n'en faisaient qu'une

Le pilotage des modes ouvre le dossier `app/`. Trois mécanismes y vivaient enchevêtrés, et le module
dit maintenant pourquoi ils le sont :

- **La « Vue 3D » n'est pas un troisième mode**, mais le mode Terrasse sur son sous-onglet `3d`, avec
  son propre bouton en haut de page. Ce choix évite de retoucher tout ce qui teste encore
  `appMode === 'terrasse'` ; il se paie en `classList` dispersés, puisque l'apparence des boutons
  doit alors être corrigée à la main après chaque bascule. Ces lignes étaient inexplicables sans ce
  contexte.
- **Le plan n'existe qu'une fois dans la page.** `#stage` est *déplacé* entre trois emplacements —
  sa place du mode Plan, le sous-onglet Canevas, un garage caché — plutôt que dupliqué ou laissé
  flottant. D'où la mémorisation de sa place d'origine au premier déplacement : c'est la seule façon
  de l'y remettre.
- **La visionneuse GLB est un panneau, pas un mode**, et tout retour vers Plan ou Terrasse doit la
  refermer — sinon son canevas reste actif derrière le panneau qu'on vient de rouvrir.

La vérification a porté sur neuf états de l'interface, comparés au témoin sur quatre axes chacun :
boutons actifs, affichage des sept zones, **parent réel du plan dans le DOM**, et onglets visibles.
C'est le troisième axe qui compte : le déménagement du plan ne se voit ni dans les empreintes ni dans
le contrôle de santé.

### Puis les démêler pour de bon

Décrire l'enchevêtrement ne le défait pas. L'étape suivante l'a défait, sans changer un comportement.

**La cause du désordre : deux comptes différents tenus au même endroit.** `etat.appMode` n'en connaît
que deux, `plan` et `terrasse`, parce que c'est ce que le reste du programme teste ; l'utilisateur,
lui, voit quatre boutons dont un seul doit être allumé. Les deux étaient tenus ensemble, à coups de
`classList.add` et `.remove` posés **après coup** pour rattraper ce que l'appel précédent venait de
faire — `goVue3D` allumait « Terrasse » via `setAppMode`, puis l'éteignait aussitôt pour allumer
« Vue 3D ».

Désormais `vueCourante` est la seule vérité sur ce qui est affiché, `appliquerVue()` le seul endroit
qui touche aux boutons et aux zones, et `etat.appMode` en est *dérivé*. Les quatre boutons se
déduisent d'une table ; aucune fonction ne corrige plus l'apparence laissée par une autre, et plus
une seule ligne de `legacy.ts` n'y touche.

**La visionneuse était un mode qui n'osait pas dire son nom** : elle manipulait elle-même les quatre
boutons et les six zones, pendant que `setAppMode` la refermait par un rappel. Elle est devenue la
quatrième vue ; `legacy.ts` ne garde que ce qui lui est propre — charger le modèle, libérer la scène.

**Et la place d'origine du plan** était retenue comme « ce parent et ce frère suivant », capturés
paresseusement au premier déplacement. Un nœud-ancre posé une fois pour toutes la remplace : il reste
valable même si le voisinage change, là où une référence de frère ne l'aurait plus été.

La vérification a repris les mêmes états — dix cette fois — en ajoutant deux axes : le `className`
complet des quatre boutons, et le **rang exact** du plan parmi ses frères, pas seulement son parent.
Dix lignes identiques au témoin, caractère pour caractère.

Une fausse alerte au passage, qui vaut d'être notée : le bouton du PLU semblait ne plus se désarmer
pendant l'interrogation. Un échantillonnage à 20 ms a montré qu'il l'était bien, dès 3 ms — le
premier relevé, pris 120 ms après le clic, était simplement tombé après la fin de la requête. Mesurer
un état transitoire à un seul instant ne prouve rien.

### Solder les points laissés en suspens

Trois choses avaient été signalées en passant, puis laissées. Les traiter a donné trois réponses
différentes, et c'est la distinction qui compte.

**`muter()` est supprimé.** Il enveloppait « instantané + mutation + rendu » pour qu'un appelant ne
puisse rien oublier — mais aucun appelant ne s'en servait. Du code mort qui se présente comme le
chemin sûr est pire que pas de chemin du tout : la prochaine personne l'aurait cru éprouvé. La
réécriture de l'historique repartira d'une ardoise propre sur ce point.

**L'horloge des clés devient injectable.** `EMPREINTES.md` la signalait depuis la phase 0 comme la
dernière source de non-déterminisme « non encore neutralisée », à injecter « en phase 4 » ; c'est
fait, avec `Date.now` pour défaut. Un scénario qui crée des objets peut désormais être comparé à
lui-même — un test le fait, en construisant deux fois la même suite et en comparant les clés. Au
passage, `dupliquer()` refaisait le calcul de clé à la main au lieu d'appeler `cle()` : deux
écritures de la même règle, dont une pouvait dériver.

**`altitude: 0` a été vérifié, pas corrigé.** Le commentaire du test laissait croire à une valeur
perdue ; le panneau d'attributs plafonne en réalité l'altitude par le bas à 0,10 m — `min='0.1'` *et*
un `Math.max(0.1, …)` à la saisie. `0` ne peut donc venir que d'un fichier écrit à la main, et le
repli sur 1,60 m y est le comportement le moins surprenant. Corriger aurait changé le comportement
d'un cas que l'interface interdit déjà, sans rien réparer. Le commentaire, lui, était faux : c'est
lui qui a été corrigé.

### La rupture : `plan.html` devient le build

Jusqu'ici, la version livrée en production était le fichier mono-page d'origine, et `src/` n'était
qu'un chantier. Le 29 août 2026, `plan.html` est devenu le build — 779 140 octets remplacés par
450 713 — et la version passe de `1.0.0` à `1.1.0-alpha.1`.

**C'est une rupture au sens exact**, parce que `APP_VERSION` est estampillée dans les six artefacts
exportés. L'invariant qui a tenu pendant toute la migration — « les six empreintes ne bougent pas » —
devient « elles ne bougent que par la version ». Les fixtures ont donc été recapturées.

Recapturer une référence est le geste le plus facile à faire de travers : il suffit de le faire après
coup, et toute régression accumulée devient la nouvelle norme. L'ordre a donc compté :

1. **D'abord prouver que rien d'autre n'a bougé**, à numéro de version inchangé. Le build estampillé
   `1.0.0` reproduisait les six empreintes de 2026-08-28 au bit près — c'est la vérification faite à
   chaque étape depuis la phase 1, et la dernière datait de quelques minutes.
2. **Ensuite seulement** changer le numéro, et vérifier ligne à ligne : **une seule ligne diffère**
   dans chacun des quatre artefacts texte, et c'est celle qui porte la version. Les deux PDF, dont
   tous les décalages internes bougent parce que la chaîne s'allonge de huit octets, ont été comparés
   sur leur contenu : 143 et 106 textes, 14 et 15 objets, 2 et 3 pages — aucun de ces nombres ne
   change, et seuls les textes portant la version diffèrent.
3. **Puis** déposer les nouvelles fixtures et mettre à jour leurs empreintes.

Le schéma du projet, lui, ne bouge pas : un fichier enregistré par la 1.0.0 s'ouvre dans la nouvelle
version et réciproquement. La rupture porte sur l'artefact livré, pas sur les données — ce qui est
exactement ce que RELEASE.md §8.4 demande de ne pas mélanger.

**Ce que cette version n'est pas.** Ce n'est pas la `1.1.0` : son critère de sortie (spec §14) exige
`legacy.ts` supprimé et la phase 7 terminée, et ni l'un ni l'autre n'est vrai. D'où la
pré-publication `-alpha.1`, qui dit ce qu'elle est — le nouvel artefact, pas encore la nouvelle
version.

### « Il ne reste plus de logique » — c'était faux

J'avais écrit, après le pilotage des modes, qu'il ne restait dans `legacy.ts` que du câblage. En
allant regarder plutôt qu'en me souvenant, il en restait :

- le **résumé texte**, 62 lignes écrites dans un écouteur de clic. C'est un des six artefacts de
  référence, le seul qu'un artisan lise vraiment, et il n'avait aucun test ;
- l'**ordre d'empilement**, où deux niveaux se superposent et où les confondre est la faute à
  éviter : la priorité classe grossièrement, l'ordre du tableau n'affine qu'à l'intérieur d'un même
  niveau, et la sélection ne change ni l'un ni l'autre ;
- l'**angle intérieur** d'un sommet, corrigé par l'aire signée — sans quoi un rectangle affiche
  quatre angles de 270° dès qu'il est dessiné dans l'autre sens ;
- puis les **onglets du panneau**, l'**alignement**, l'**export du projet** et l'**export GLB**.

Sept modules, 60 tests. `legacy.ts` ne contient plus aucune fonction de plus de quinze lignes en
dehors de `boot()`.

### La règle de dépendance était fausse, et quatre fichiers en étaient la cause

`architecture.md` énonçait « les flèches ne pointent que vers le bas ». Vérifié pour la première
fois : **neuf dépendances remontantes**. En les regardant une à une, huit venaient de fichiers mal
rangés, pas d'inversions réelles.

`dialogs`, `dom` et `download` ne sont ni des panneaux ni du pur : ce sont des primitives qui
touchent au DOM sans rien connaître du domaine. Six modules de couches basses en dépendaient, tous
pour la même raison — dire quelque chose à l'utilisateur. Ils vivent maintenant dans `shell/`, où
toutes les couches peuvent les atteindre. De même, `geometry/vue.ts` — la transformation
monde ↔ écran, trente lignes d'arithmétique — était rangée dans `render/`, ce qui faisait dépendre la
géométrie de la vue.

**Le test qui vérifie la règle l'a immédiatement payée** : il a trouvé un quatrième fichier mal
rangé, `util/download.ts`, que je n'avais pas vu. `tests/unit/architecture.test.ts` contrôle
désormais trois choses à chaque exécution — les flèches, la pureté de `geometry`, `model` et `util`
(aucun accès au DOM), et le fait que rien n'importe `legacy.ts`. Ce dernier point compte tant que
`legacy.ts` existe : la dépendance doit continuer d'aller dans l'autre sens, puisqu'il est censé se
vider, pas se remplir. Un dossier non classé fait échouer le test, pour qu'un nouveau ne puisse pas
échapper à la règle en silence.

### Cinquante-deux lignes de commentaires qui mentaient

Treize blocs décrivaient du code parti ailleurs : le dossier PDF, la liste blanche de sérialisation,
la fusion des parcelles contiguës, l'actualisation IGN, la fiche méthode. Chacun disait quelque chose
de vrai — et le dit toujours, à côté du code concerné. Ce qui restait ici n'en était que l'ombre : un
lecteur qui les suit cherche un code qui n'y est plus. Un commentaire qui décrit du code absent est
pire qu'un fichier sans commentaire, parce qu'il se lit comme une promesse.

Conservés en revanche, parce qu'ils servent à naviguer : les renvois « X vit dans `module.ts` », et
l'index des champs d'état (« `appMode` : dans `etat`, spec §6.1 ») qui dit où chaque variable est
partie pendant la migration.

### Ce qui reste

Le squelette de `legacy.ts` : le câblage des 87 écouteurs, les fabriques de contexte, 62 enveloppes
d'une ligne, et le `boot()` lui-même. **1 500 lignes**, contre 13 571 au début de la migration —
**89 %** en sont sortis, répartis en **99 modules** et 14 257 lignes.

Sont sortis depuis : les événements de pointeur (`interaction/pointeur.ts`), le chargement d'un
projet importé (`io/projet.ts`), les tables du dossier et du chiffrage (`ui/tables.ts`), et la
validation d'un fichier de projet (`io/validation.ts`) — cette dernière avec **19 tests**, alors
qu'elle n'en avait aucun. C'est pourtant la porte d'entrée : elle refuse un schéma trop récent, des
coordonnées en millimètres, un fichier sans objet exploitable ; et elle *ignore*, en les comptant,
les objets mal formés, pour qu'un fichier partiellement abîmé reste chargeable.

Sont également sortis depuis : le sélecteur d'objets et la table d'affichage
(`ui/selector.ts`), l'outil de cotation — son brouillon dans `interaction/outilMesure.ts`, son
panneau dans `ui/mesurePanel.ts` — et le fond orthophoto (`render/ortho.ts`), vérifié sur des tuiles
IGN réelles.

La sérialisation et l'import SVG sont partis dans `io/` : `serializeObjects` y est documentée pour
ce qu'elle est, une **liste blanche** — un champ qu'on ajoute à une forme sans l'ajouter là est
perdu au premier enregistrement.

Ce qui restait était alors **entièrement** de la coquille : 87 écouteurs d'événements, les fabriques
de contexte, une quarantaine d'enveloppes d'une ligne, et `boot()`. Les 87 écouteurs sont depuis
partis en dix modules de `app/ecouteurs/`, autour d'`app/atelier.ts` — la fermeture de `boot()`
devenue un objet nommé. `legacy.ts` en compte désormais **zéro** et tient en 928 lignes.

## Phase 7 — le cliquet de rigueur (29 août 2026)

L'échelle de rigueur du tsconfig commence — mesurée, pas estimée : `noImplicitAny` produit
**1 375 erreurs** (et non les 997 périmés qui figuraient ici), 2 138 en configuration pleinement
stricte. Le détail par barreau, par fichier et par nature est en spec §9.2.1.

### Ce que le compilateur ne savait pas garantir

La règle « un fichier déjà strict le reste » n'était qu'une intention. `tsconfig.json` ne sait pas
l'imposer : restreindre `include` ne restreint rien, puisque les fichiers importés entrent quand même
dans le programme. Un dossier nettoyé pouvait donc se re-salir sans que rien n'échoue.

`scripts/cliquet.mjs` (`npm run cliquet`) le fait à sa place : il lance `tsc` avec les drapeaux du
barreau visé et **échoue si une erreur vient d'un dossier déclaré propre**. Les autres sont comptés,
pas reprochés. C'est le même geste que `tests/unit/architecture.test.ts` pour les dépendances — une
règle qu'on écrit une fois et qu'un outil tient ensuite.

**Premier palier : `shell`, `geometry`, `model` rejoignent `core` et `util`.** 1 375 → **1 308**.

### Quatre types qui disaient faux

Le typage n'a pas seulement annoté ; il a contredit ce qui était écrit.

- `geometry/rings.ts` **annonçait `{ a, b }` et manipulait `[p0, p1]`**. L'annotation avait été posée
  à la main pendant l'extraction et jamais vérifiée ; le producteur et le seul consommateur, eux,
  s'accordaient sur des paires depuis toujours. Un lecteur, lui, pouvait croire le type.
- `render/measures.ts` déclarait **sa propre interface nommée `ObjetPlan`**, homonyme de celle du
  modèle et différente d'elle : deux vérités sous un seul nom. Elle s'appelle `ObjetCote` et dit ce
  qu'elle est — une exigence de quatre champs, que tout `ObjetPlan` satisfait.
- `EtatPlan` valait `any` dans `app/atelier.ts` alors que `core/state.ts` décrivait déjà l'état. Le
  câblage pouvait lire un champ inexistant sans que rien ne le signale.
- `Mesure` vivait dans `render/`, alors que c'est une donnée du projet : elle s'enregistre dans le
  fichier, et `core/state.ts` en tient la liste.

Aucune de ces quatre corrections ne change une ligne exécutée — les six empreintes le confirment.
Elles changent ce que le code affirme de lui-même.

### Le couplage, encore

La leçon de l'étalonnage (spec §9.2.2) s'est vérifiée deux fois. `model/creation.ts` ne prend pas
`EtatApp` mais un `EtatCreation` de cinq champs : `model/` n'a pas à connaître la pile d'annulation
ni la transformation de la scène, et un test peut alors monter un état en une ligne. Et
`normalizeObjects` est générique — `<T> ⟶ (T & ObjetBrut)[]` — parce que c'est exactement son
travail : elle n'enlève rien, elle ajoute. Rendre `T` seul aurait été faux dans l'autre sens, on ne
pourrait plus lire les noms de sommets qu'elle vient de poser.

Deux fichiers de test ont dû suivre, comme le « coût double » l'annonçait. Ils ont révélé que leurs
objets d'essai **n'avaient pas de nom** — alors que le programme en lit un à la duplication
(« … (copie) ») et à la suppression. Un objet sans nom n'avait jamais existé ailleurs que là.

### Une exception à l'ordre annoncé, et pourquoi

L'index `[autreChamp: string]: unknown` d'`ObjetPlan` devait tomber au premier pas. Il est resté :
le retirer relève de l'honnêteté du type, pas de `noImplicitAny`, et toucherait d'un coup les neuf
dossiers encore sales. Il attend que le cliquet ait plus de terrain acquis à protéger.

### Vérifications

Typecheck, `npm run lint`, **534 tests**, cliquet sans régression. Sur une page fraîche : relevé de
santé conforme (288 textes SVG, 29 remplis, `#projectBar` 4, `#selector` 14, `#dispTable` 36) et
**six empreintes sur six identiques** — résumé, SVG, DXF, projet JSON, PDF du plan, PDF du dossier —
tailles et SHA-256 inchangés.

### `engine/` — 315 erreurs, et une garde qui aurait coûté cher (30 août 2026)

Le moteur passe de **315 à 0**, et le dépôt de 1 308 à **952**. Un seul levier explique l'essentiel :
`Construction` n'existait pas. 53 champs — pose, charges, ossature, lames, débit, prix, chantier —
lus partout et décrits nulle part, dont `defaultConstruction()` était la seule définition, en creux.
Une fois le type écrit, les dix fichiers du moteur sont tombés presque mécaniquement.

**Ce que le type a révélé en s'écrivant :** `ensureConstruction` comble **40 de ces 53 champs**. Les
treize autres ne sont posés que par `defaultConstruction()`, donc sur une terrasse neuve seulement.
Ils datent tous de la première version et n'ont jamais eu besoin d'être rétro-remplis — mais rien ne
le disait, et le jour où l'un d'eux change de nom, c'est là qu'il faudra regarder.

#### Une garde « propre » qui aurait fait disparaître des saisies

En typant `cadenceDe`, j'ai écrit ceci :

```js
const table = (c.cadences && !Array.isArray(c.cadences)) ? c.cadences : {};
```

C'est faux, et il s'en est fallu d'une relecture. Les dictionnaires du projet — cadences, prix par
longueur, prix des plots — sont posés en `{}` par le défaut mais enregistrés en `[]` dans les
projets existants, **y compris le jeu de démonstration**. `ensureConstruction` les laisse passer
puisqu'un tableau *est* un objet. Et `cadences['piquetage'] = 7` sur un tableau pose bel et bien une
propriété que `cadences['piquetage']` relit : c'est du JavaScript ordinaire.

Écarter les tableaux aurait donc fait retomber une cadence saisie sur le barème — sans erreur, sans
trace, et invisible aux empreintes puisque la démo n'a aucune cadence saisie. `model/dictionnaire.ts`
fait maintenant l'indexation exacte d'avant, une seule fois, avec la raison écrite au-dessus.

La leçon est celle du typage lui-même : **un type qui gêne signale quelque chose, mais ce n'est pas
toujours le code qui a tort.** Ici la forme des données était bel et bien bancale ; la corriger
demandait une migration, pas un filtre au point de lecture.

#### Dix-neuf coercitions implicites, et un troisième type homonyme

Le typage a aussi rendu visibles 19 `input.value = <nombre>` — corrects en JavaScript, jamais dits.
Ils passent par `String(...)` ; la valeur et le grisage des 31 champs du panneau Terrasse ont été
comparés au témoin figé, identiques.

Et `render/parasolOverlay.ts` déclarait un `ObjetParasol` local de quatre champs — **troisième**
interface locale homonyme ou concurrente du modèle, après l'`ObjetPlan` de `render/measures.ts` et
l'`EtatPlan` d'`app/atelier.ts`. Trois fois le même geste : décrire sur place ce qui existait déjà
ailleurs, parce que le type partagé valait `any` et ne servait à rien.

#### Ce que le moteur demande vraiment

Quatre exigences nommées plutôt que l'objet entier : `TerrasseEtudiee`, `PorteurDeConstruction`,
`ObjetMesurable`, `ObjetCote`. Ce n'est pas de la commodité de test — `evaluerStructure` évaluait
déjà ses configurations candidates sur un `{ pts, construction }` fabriqué pour l'occasion, qui n'a
ni clef ni nom. Exiger `ObjetPlan` aurait forcé soit un mensonge de type, soit une clef inventée pour
satisfaire le compilateur. Le test de `hauteurs.ts` a dit la même chose en refusant d'inventer un nom
pour un objet dont on ne veut que la hauteur.

Deux types sont **dérivés** de leur fonction plutôt que réécrits (`Structure`, `CouchesTerrasse`) :
`geometry/rings.ts` a montré ce que coûte une description tenue à part de ce qu'elle décrit.

#### Vérifications

Les empreintes ont été relevées **d'abord à version inchangée** : six sur six identiques au bit près.
C'est ce qui prouve que le typage n'a rien déplacé — la recapture d'après, elle, ne prouve que le
changement de numéro. Puis, sur le témoin figé, sept relevés du mode Terrasse : les 31 champs de
configuration (valeur et grisage), Implantation, Chantier, BOM, Canevas, Plan de coupe et Méthode —
15 850 caractères pour le seul dernier. **Sept sur sept identiques.**

Une première version de cette sonde a comparé deux choses différentes, deux fois : elle tronquait le
texte **avant** de neutraliser le numéro de version, plus long de huit caractères, si bien que la
coupe tombait ailleurs ; et le second relevé partait d'une page où j'avais déjà cliqué, donc d'un
sous-onglet différent. Les deux donnaient un écart qui ressemblait à une régression et n'était que
ma propre sonde.

Typecheck, lint, **534 tests**, cliquet : `engine/` rejoint les dossiers protégés.

### `render/` — le quatrième homonyme, et une regression trouvee avant qu'elle ne parte (30 aout 2026)

`render/` passe de **33 à 0** ; le depot, de 952 a **919**.

`render/objects.ts` declarait sa propre interface `ObjetPlan` — champs requis (`fill`, `fillOpacity`,
`stroke`) la ou le modele les laisse facultatifs. C'est le **quatrieme** type local homonyme trouve
en phase 7, apres ceux de `render/measures.ts`, `app/atelier.ts` et `render/parasolOverlay.ts` :
meme geste a chaque fois, decrire sur place ce qui existait deja ailleurs, parce que le type partage
valait `any` et ne servait a rien. Renommee `ObjetRendu` et **derivee** du modele plutot que reecrite
— `ObjetPlan & Required<Pick<...>>` — avec un commentaire qui dit pourquoi ces trois champs sont
surs a cet endroit precis : tout objet vivant dans `etat.objects` les porte, poses par `creation.ts`
ou `normalisation.ts`, meme si le type du modele ne le garantit pas encore (spec §12).

Le typage a aussi trouve une regression **avant qu'elle n'existe vraiment** : en ajoutant les champs
`cadastre` et `ortho` a `ObjetPlan` (necessaires pour typer `render/ortho.ts`), un test de
`model/normalisation.ts` a cesse de compiler. Il utilisait ces deux noms comme placeholders
arbitraires pour verifier que le clonage profond des metadonnees est generique — `{ geom: {...} }`,
`{ url: 'x' }` — sans rapport avec leur vraie forme. Une fois les champs types, ces valeurs de test ne
correspondaient plus a rien de reel. Corrige en leur donnant leur forme reelle (`origineLat`,
`origineLon`, `actif`, `opacite`) : le test verifie toujours le meme mecanisme, avec des valeurs qui
existent vraiment.

#### Vérifications

Memes empreintes (six sur six a version inchangee, puis une ligne par artefact texte). Et un controle
que les empreintes ne peuvent pas faire : le jeu de demonstration n'active jamais le fond orthophoto,
donc rien dans les fixtures ne passe par `render/ortho.ts`. Active a la main, il pose quatre tuiles ;
comparees au temoin fige, **memes coordonnees au dernier chiffre decimal** sur les quatre.

Typecheck, lint, 534 tests, cliquet : `render/` rejoint les dossiers proteges.

### `io/` — un type qui mentait sur ce qu'il garantit (30 aout 2026)

`io/` passe de **57 a 0** ; le depot, de 919 a **862**.

Le fait notable n'est pas un nouveau type mais une correction d'un type deja pose : `Atelier.restoreState`
(app/atelier.ts, ecrit lors de la nomination de la fermeture) annoncait `{ objects: ObjetPlan[];
measures: Mesure[] }`. En typant `io/projet.ts`, l'appel `ctx.restoreState({ objects:
objsBase.concat(ajoutes), ... })` a refuse de passer : `objsBase`/`ajoutes` sont des donnees
serialisees (`ObjetSerialise`, alias de `Record<string, any>`), pas des `ObjetPlan`.

En remontant a l'implementation reelle (`core/historique.ts`), la raison est claire :
`restaurer(snap)` appelle `ctx.normalizeObjects(snap.objects)` **avant** de les poser dans l'etat.
`restoreState` n'a donc jamais garanti de recevoir des objets complets — c'est precisement le
contraire, c'est son travail de completer ce qu'on lui donne. Le type annoncait une garantie qu'aucun
appelant ne fournissait et que l'implementation ne demandait pas.

Corrige en elargissant le parametre a `ObjetBrut[]` — la forme reelle de ce qui transite, la meme
utilisee par `normalizeObjects` lui-meme. Le changement est **strictement plus permissif** : les deux
appels existants (l'annulation, qui repasse un `ObjetPlan[]` deja complet — un `Partial<T>` plus
strict reste satisfait par un `T` complet — et l'import, qui repasse des donnees serialisees)
continuent de passer, et le type dit enfin ce que la fonction fait.

Au passage, `affichage` (masquage du voisinage et de la grille) rejoint `ObjetPlan`, sur le meme
modele que `ortho` — et cette fois sans casser le test de `normalisation.ts`, puisque sa valeur de
test (`{ grille: true }`) tombe exactement dans la forme reelle.

#### Vérifications

Memes empreintes (six sur six a version inchangee, puis une ligne par artefact texte). Et un cycle
complet propre a ce module : export JSON du jeu de demonstration, puis reimport en mode
« remplacement » (simule via `DataTransfer` sur l'input cache, la vraie mecanique de selection de
fichier n'etant pas disponible hors navigateur reel). Toast : « 35 objet(s) importe(s). 11 mesure(s)
restauree(s). » Releve de sante identique a une page fraiche.

Une premiere tentative de cette sonde a mesure du vide : j'avais coche la mauvaise case
(`chkReplaceOnImport`, qui controle l'import SVG) au lieu de `chkJsonRemplace`, et le compte d'objets
inchange semblait d'abord signaler un import silencieusement rate.

Typecheck, lint, 534 tests, cliquet : `io/` rejoint les dossiers proteges.

### `interaction/` — un discriminant ambigu, et deux champs morts (30 aout 2026)

`interaction/` passe de **53 a 0** ; le depot, de 862 a **809**. Quatre des six fichiers du dossier
etaient deja propres (editing.ts, drag.ts, outilMesure.ts, navigation.ts, sortis lors de phases
anterieures) ; il ne restait que `outilAlignement.ts` (12) et `pointeur.ts` (41, le cablage complet
des evenements de pointeur — selection, glisser, double-tap, molette, pincement, pan a trois doigts).

**Un discriminant qui ne discriminait pas.** Le geste en cours (`activeDrag`) est soit un
`GlisserEnCours` (drag.ts), soit un pan a un doigt, propre a ce fichier. `GlisserEnCours` admet
lui-meme `'pan'` dans son propre champ `type` — une imprecision restee de son ecriture initiale, ou
`'pan'` figurait dans la liste sans jamais etre construit avec cette forme. En ecrivant l'union des
deux comme `GlisserEnCours | { type:'pan'; ... }`, ce chevauchement rendait le narrowing inoperant :
`if(activeDrag.type==='pan')` ne suffisait pas a exclure la branche `GlisserEnCours`, et
`startOrigin`/`startScreen` restaient inaccessibles juste apres le test qui aurait du les garantir.
Corrige en intersectant le premier membre avec le sous-ensemble reel de types qu'il couvre ici
(`'shapeMove'|'circleMove'|'point'|'edge'|'radius'`), ce qui rend le discriminant precis.

**Deux champs ecrits, jamais lus.** `startScreen` etait pose sur les gestes `circleMove` et
`shapeMove`, en plus de `startWorld` — mais seul le pan le lit (`deplacer(scene, startOrigin,
startScreen, curseur)`). Verifie par recherche exhaustive avant de les retirer : aucun autre
consommateur, dans ce fichier ni ailleurs. Retires plutot que castes, sur le meme principe que la
variable morte trouvee dans `engine/layers.ts` en phase 4 : un champ dont on prouve qu'il ne sert nulle
part se supprime, il ne se maquille pas en type.

Reste une imprecision non touchee, documentee sur place : `GlisserEnCours.obj` exige `pts`, y compris
pour un cercle qui n'en a jamais. C'est un defaut de `drag.ts`, hors de portee de ce palier — le
corriger (rendre `pts` facultatif) casserait `estRectangle(obj)`, qui l'exige aussi en interne, dans
ce meme fichier. Contourne par un cast local (`ObjetAPoints`), avec la raison ecrite au-dessus.

#### Vérifications

Memes empreintes. Et une sonde directe des gestes typés : un `PointerEvent` de glisser reel sur un
sommet deplace ce seul sommet, exactement du delta demande, les cinq autres restant identiques au
pixel pres ; un `WheelEvent` sur le plan redessine la scene.

Typecheck, lint, 534 tests, cliquet : `interaction/` rejoint les dossiers proteges.

### `app/` — le plus petit palier restant (30 aout 2026)

`app/` passe de **19 a 0** ; le depot, de 809 a **790**. Six fichiers, tous des interfaces de
contexte a completer — rien de nouveau methodologiquement, mais deux points valent d'etre notes.

`ObjetPlan` gagne quatre champs de cloture (`clotureActive`, `clotureHauteur`, `clotureCouleur`,
`clotureTexture`), sur le meme modele que `ortho` et `affichage` au palier `render/`. Le dernier
reste `unknown` : sa vraie forme appartient au selecteur de texture (`ui/texturePicker.ts`), dont la
propre fonction rend deja `unknown` — poser un type plus precis ici aurait ete l'inventer, pas le
lire, et l'aurait fait a un endroit qui n'est pas celui du palier `ui/` a venir.

Deuxieme point : la scene Three.js reste deliberement non typee (`SceneTrois = Record<string, any>`,
faute de `@types/three`). Un endroit en decoulait directement d'un `any` — le callback de
`canvas.toBlob()` dans `vue3d.ts`, dont le parametre ne pouvait pas s'inferer a travers la chaine
`any`. Annote a la main (`Blob | null`, la vraie forme de l'API canvas), avec la raison ecrite au-dessus.

#### Vérifications

Memes empreintes. Et une sonde du pilotage des vues : les quatre boutons (Plan, Terrasse, Vue 3D,
visionneuse) actionnes en sequence, chacun affichant les bonnes zones — la Vue 3D masquant bien la
rangee de sous-onglets, comme documente — et le bouton de grille bascule son etat visuel. Aucune
erreur.

Typecheck, lint, 534 tests, cliquet : `app/` rejoint les dossiers proteges.


### `geo/` — la ou les empreintes ne voient rien (30 aout 2026)

`geo/` passe de **127 a 0** ; le depot, de 790 a **638**. L'ecart de 152 est plus grand que le
compte du dossier, et c'est le fait marquant du palier : donner de vraies signatures a `apiIgn.ts`
a eteint **25 erreurs de plus dans `ui/projectBar.ts`**, sans y toucher autrement que pour poser
trois `import type` et quelques annotations. C'est §9.1 pris sur le fait — un `any` partage ne coute
rien la ou il est ecrit, il coute chez ceux qui l'appellent.

GeoJSON est decrit une fois pour toutes, parametre par le type des `properties`
(`FeatureGeoJSON<P>`, `CollectionGeoJSON<P>`) : les proprietes d'une parcelle cadastrale et celles
d'un batiment BD TOPO n'ont rien en commun, et c'est le seul endroit du programme ou la distinction
se voyait deja, implicitement.

Troisieme objet mort exhume par le typage, apres les deux `startScreen` d'`interaction/` :
`formeCommune(pts, c)` ne lisait jamais `c`. Verifie dans le corps, retire ; les deux appels
passaient une parcelle qui ne servait a rien.

#### Vérifications

Les six empreintes sont identiques a version inchangee, puis une ligne par artefact texte apres le
changement de numero. **Mais elles ne prouvent presque rien ici** : elles ne declenchent aucun appel
reseau, alors que `geo/` n'est a peu pres que cela. Elles disent seulement que le typage n'a pas
deborde ailleurs.

Le vrai controle est ailleurs, et il a ete fait : l'import cadastral « Place de la Mairie 35000
Rennes » rejoue **en direct** sur les deux versions a quelques minutes d'intervalle — le temoin fige
1.0.0 et le build fraichement type. Meme parcelle proposee (AC 530, 418 m², a 7,33 m de l'adresse),
meme classement des dix candidates, memes cases cochees par defaut a l'etape 3, memes trois
batiments (16 ; 15,5 ; 13,8 m), et surtout : **meme projet exporte au bit pres** apres neutralisation
des quatre horodatages et du numero de version — 25 232 octets,
`b93a3924b496529d9e4b3d17e522f0cf8a21bcaaa66680ef7b4d0aaf9ba321eb` des deux cotes. Toute la chaine y
passe : geocodage BAN, `apicarto/cadastre/parcelle` interroge sur une emprise, BD TOPO (batiment,
zone de vegetation, haie) en WFS, puis les neuf interrogations du GPU/PLU.

Au passage, une limite de la methode est devenue mesurable. Le releve d'import note le 28 aout
(25 108 octets) **ne se reproduit plus sur le temoin fige lui-meme** : +227 octets. A code
strictement identique. Ce sont les donnees du GPU qui ont bouge. Une empreinte qui depend d'un
service en ligne ne se conserve pas dans le temps ; ce qui se conserve, c'est l'egalite entre deux
versions rejouees le meme jour. `EMPREINTES.md` le dit maintenant a l'endroit ou la vieille valeur
etait notee, plutot que de la laisser passer pour un oracle.

Typecheck, lint, 534 tests, cliquet : `geo/` rejoint les dossiers proteges. Onze sur quatorze. Il
reste `ui` (372), `three` (128) et `export` (122).


### `three/` — quand la spec et le code se contredisaient (30 aout 2026)

Ce palier ne commence pas par du typage mais par un **ecart** : la spec §8.3 tranchait « Take
Option A » — `@types/three` en devDependency, `THREE` type sans que la bibliotheque soit
empaquetee — et le code faisait l'inverse, `declare const THREE: any` et
`SceneTrois = Record<string, any>`, avec un commentaire qui argumentait contre l'option A en la
decrivant comme « une dependance de type sans dependance de code ». C'est exactement ce que
l'option A est, et c'est exactement ce qui avait ete decide. Le code n'avait pas trouve une raison
de s'ecarter du plan : il avait re-derive la question sans se souvenir de la reponse.

L'ecart a ete referme dans le sens de la spec, apres avoir verifie les deux promesses au lieu de les
croire : `@types/three@0.128.0` existe et couvre les trois classes d'`examples/` ; et le fichier
produit ne contient **aucune** trace du paquet. La croissance mesuree du build (+128 octets sur
449 810) s'explique entierement par le code ecrit ici — les trois gardes de type et deux constantes
locales — pas par les typages, qui ne survivent pas a la compilation.

`three/` passe ensuite de **128 a 0** ; le depot, de 638 a **510**.

#### Ce que douze erreurs ont dit

Poser les vrais types fait apparaitre douze erreurs au barreau 1, avant meme de parler de
`noImplicitAny`. Elles valent d'etre lues :

- **`isMesh` / `isLight` / `isTexture` ne sont pas sur `Object3D`.** Ce sont des drapeaux poses par
  les sous-classes, et Three.js s'en sert **a la place** d'`instanceof`, volontairement : deux
  copies de la bibliotheque dans une meme page ont des constructeurs differents mais les memes
  drapeaux. Les trois gardes de `three/gardes.ts` reprennent le test deja ecrit, mot pour mot, et le
  rendent au verificateur.
- **`THREE.SRGBColorSpace` et `Texture.colorSpace` n'existent pas a la r128.** Ils datent de la
  r152. Le code les teste avant de s'en servir (`if(THREE.SRGBColorSpace) ...`), donc la ligne **ne
  fait rien** aujourd'hui. Elle reste telle quelle : c'est un garde-fou tourne vers l'avenir, qui
  s'allumera de lui-meme a une montee de version, et le remplacer par l'ancien couple
  `sRGBEncoding`/`encoding` changerait le rendu des tuiles orthophoto. Un palier de typage ne decide
  pas d'un rendu. Le commentaire dit maintenant tout cela sur place.
- **`GLTFExporter.parse` rend `object`** : sa signature r128 ne distingue pas les deux sorties que
  l'option `{ binary: true }` separe pourtant.

#### Deux types qui mentaient, encore

Meme famille que `geometry/rings.ts` et `Atelier.restoreState` aux paliers precedents.

`reglerSoleil(lum: SceneTrois, ...)` demandait une scene entiere. Son propre commentaire, juste
au-dessus, enumerait pourtant les cinq champs reellement lus — et l'appelant de la Vue 3D lui
construit un objet a quatre champs, sans scene. Le type est devenu `EclairageSoleil`.

`attendreTexturesPretes` declarait `new Set<SceneTrois>()` : un ensemble de **scenes**, pour y
ranger les cartes de couleur des materiaux. Les deux etaient invisibles tant que `SceneTrois` valait
`Record<string, any>`. C'est le point a retenir du palier : un type assez large pour tout accepter
ne dit plus rien de faux, il ne dit plus rien du tout.

`SceneTrois` devient d'ailleurs deux types reels — `SceneVue3d` (qui cadre un plan : `extent`,
`cen`) et `SceneGlb` (qui cadre un modele deja produit : `centre`, `rayon`) — au-dessus d'un
`SceneTroisBase` de huit champs, exactement ce que les deux vues partagent.

#### Verifications

Les six empreintes sont identiques a version inchangee, puis une ligne par artefact texte apres le
changement de numero. **Aucune des six n'ouvre la 3D**, donc elles ne disent ici qu'une chose : le
typage n'a pas deborde ailleurs.

Le controle reel est l'export GLB rejoue en direct, Vue 3D ouverte (Three.js r128 charge du CDN,
canevas rendu, aucune erreur) : 41 473 604 octets, et des compteurs structurels **identiques au
releve d'origine** — glTF 2.0, 203 noeuds, 200 maillages, 288 materiaux, 178 textures, 1 scene.
Puis la visionneuse, sur les chemins les plus retouches : bascule du fond clair/sombre dans les deux
sens (c'est le chemin qui passe par `estTexture` et libere l'ancienne texture), filaire coche puis
decoche (deux reconstructions completes de la scene). Il reste exactement un canevas, sans erreur ni
fuite.

#### Une limite trouvee, pas corrigee

`ObjetPlan` porte `[autreChamp: string]: unknown`. Les champs de texture ne sont donc pas declares
et se lisent en `unknown` — correct pour ce palier, la forme du catalogue Poly Haven appartenant au
selecteur (`ui/`). Mais cette signature d'index accepte aussi les fautes de frappe :
`o.textureHorizontal` compilerait. La retirer se paierait dans tous les dossiers a la fois ; c'est
un chantier du barreau 3, note ici pour ne pas le redecouvrir.

Typecheck, lint, 534 tests, cliquet : `three/` rejoint les dossiers proteges. Douze sur quatorze. Il
reste `ui` (372) et `export` (122) — `ui/` en dernier, comme prevu.

### `export/` — le plus gros fichier du palier 2, sans surprise (30 aout 2026)

`export/` passe de **122 a 0** ; le depot, de 510 a **387**. Treize dossiers proteges. Il ne reste
que `ui/` (371), et c'est exactement le plan trace des le debut de la phase 7 : cette couche-la va
en dernier, elle est la plus grosse et la moins testee.

Cinq fichiers : `pdf/writer.ts` (les primitives d'ecriture PDF a la main), `resume.ts` (le texte),
`pdfPlan.ts` et `svgPlan.ts` (le plan en PDF et en SVG), `dossierPdf.ts` (le dossier a l'artisan,
76 erreurs a lui seul - le plus gros fichier de tout le barreau 2). Rien de nouveau
methodologiquement : chaque fonction lit des objets du plan et ecrit du texte, sans etat partage
entre elles.

Deux types nommes par le besoin, pas par l'objet, dans la lignee de `TerrasseEtudiee` ou
`ObjetMesurable` aux paliers precedents :

- `ObjetASurface` (`type`, `pts`, `r`, `width`) pour `surfaceDe` — les tests l'appellent deja sur des
  objets partiels (`{ type: 'circle', r: 2 }`), ce qui a directement dicte le type : lui poser
  `ObjetPlan` complet aurait casse les tests sans rien changer au comportement.
- `Projeteur` (`(p: PtBrut) => {x,y}`) pour `cotationPolygone`/`anglesPolygone` : ces deux fonctions
  de cotation ne savent rien du plan, seulement d'un tableau de points et d'une fonction de
  projection vers le PDF. Le type le dit maintenant explicitement.

#### Verifications

Comme d'habitude : six empreintes identiques a version inchangee, puis une ligne par artefact texte
apres le changement de numero.

Verification propre a ce palier : les deux PDF sont l'endroit ou une erreur de mise en page se voit
le moins au premier coup d'oeil (un texte qui chevauche la ligne suivante ne casse rien
structurellement). Compares en compte de textes/objets/pages avant et apres : **143/14/2** pour
`plan.pdf`, **106/15/3** pour `dossier.pdf`, identiques au chiffre pres.

Typecheck, lint, 534 tests (aucun test a retoucher pour ce palier, une premiere depuis `render/`),
cliquet : `export/` rejoint les dossiers proteges.


### `ui/` — le dernier palier du barreau 2 (30 aout 2026)

`ui/` passe de **371 a 0** ; le depot, de 387 a **0**. `--noImplicitAny` est propre sur
l'integralite de `src/` : quatorze dossiers proteges par le cliquet, aucun reste. Le barreau 2 de
l'echelle de rigueur (spec §9.1) est termine.

Dix fichiers, du plus petit (`panelTabs.ts`, une erreur) au plus gros (`cadastreDialog.ts`, 104 —
le dialogue d'import cadastral en trois etapes, une seule fonction exportee avec tout un assistant
en fermetures internes). Rien de nouveau dans la methode, mais deux limites notees a des paliers
precedents se referment ici — et c'est la logique meme du sequencement `render/` → `geo/` →
`three/` → `export/` → `ui/` : un champ laisse `unknown` « en attendant le palier qui le lit
vraiment » finit toujours par arriver a ce palier-la.

#### Deux limites refermees

**Les quatre champs de texture.** `textureVerticale`, `textureHorizontale`, `textureArbre` et
`clotureTexture` passaient par l'index signature `[autreChamp: string]: unknown` d'`ObjetPlan`
depuis le palier `three/`, faute d'avoir type leur seul ecrivain (`ui/texturePicker.ts`). C'est
fait : ils deviennent `TextureAppliquee | null`. Le type vit dans `model/types.ts`, pas dans le
module qui le produit — la meme regle que `Mesure` au palier `model/` : une fois choisie, une
texture est une donnee du projet, pas une donnee du selecteur qui l'a proposee.

**Le zonage PLU.** `ObjetPlan.plu` quitte `unknown` pour `ZonagePlu | null`. La famille de sept
types (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`,
`CommunePlu`, `ZonagePlu`) demenage de `geo/apiIgn.ts` vers `model/types.ts`. Pas seulement pour
la coherence avec `TextureAppliquee` : `model/` ne peut pas importer de `geo/` sans fermer un
cycle, puisque `geo/apiIgn.ts` importe deja `PtBrut` depuis `model/types.ts`. `bdtopo`, lui, reste
`unknown` — deliberement, et ce n'est pas une limite a refermer : sa forme varie trop d'une couche
IGN a l'autre pour un type ecrit a la main (spec §12).

**`ContexteImportCadastre`**, troisieme cas du palier ou un `ctx` partage entre deux fichiers est
nomme une fois plutot que redefini deux fois : expose par `ui/projectBar.ts` (qui construit l'objet
et ouvre le dialogue), importe par `ui/cadastreDialog.ts` (qui le recoit). Les deux fichiers
s'accordaient deja en silence sur cinq membres identiques ; nommer le type rend l'accord verifiable.

#### Une lecon d'outillage, pas de code

Trois methodes en sucre syntaxique du litteral d'objet `etatImport`
(`parcellesPropriete(){ return this... }`) restaient signalees « `this` implicitement `any` »
malgre l'annotation `const etatImport: EtatImportCadastre = {...}`. Ce n'est pas un defaut de
l'annotation : TypeScript ne type contextuellement le `this` d'une methode de litteral d'objet que
sous `noImplicitThis` (famille `strict`, eteinte au barreau 1). Sous `noImplicitAny` seul, il faut
un parametre `this: T` explicite sur chaque methode — verifie sur un cas isole minimal avant d'etre
applique aux trois. Le barreau 3 (qui allumera `strict`) fera disparaitre le besoin de l'ecrire.

#### Verifications

Six empreintes identiques a version inchangee, puis une ligne par artefact texte apres le
changement de numero ; les deux PDF gardent leurs comptes exacts (143/14/2 et 106/15/3).

Verification propre a ce palier, et celle qui compte : les six empreintes n'ouvrent jamais le
reseau. L'import cadastral complet (adresse → parcelle → parcelles voisines → creation de projet) a
ete rejoue en direct sur « Place de la Mairie 35000 Rennes », les trois etapes de l'assistant
franchies comme un utilisateur le ferait : **meme resultat** qu'avant le typage du palier — 4
objets, memes hauteurs (16 ; 15,5 ; 13,8 m), meme IDU `35238000AC0530`, meme zonage PLU (dix cles),
aucune erreur console.

Typecheck, lint, 534 tests, cliquet : `ui/` rejoint les dossiers proteges. Quatorze sur quatorze.
**Le barreau 2 est clos.**

#### `tests/` — la dette laissee de cote, soldee le meme jour

Le rapport ci-dessus disait "22 erreurs dans `tests/`, hors perimetre du cliquet, dette du barreau
3". Vingt-deux, c'est peu : autant les regler tout de suite plutot que les laisser trainer jusqu'a
un barreau qui n'a pas encore de date.

Les vingt-deux se ramenaient a une seule cause, deja vue au palier `model/` avec `ObjetBrut` : un
litteral d'objet assigne d'abord a une variable (`const src = [{ pts: [], ... }]`), puis passe a une
fonction generique (`normalizeObjects<T extends ObjetBrut>`, `creerCreation(etat: EtatCreation, ...)`).
Passe directement en ligne (`normalizeObjects([{...}])`), le meme litteral s'infere sans probleme —
c'est le detour par la variable qui prive TypeScript du type contextuel, et `pts: []` devient
`any[]` faute de mieux. Verifie par un test A/B : le seul test qui echappait au correctif etait
justement celui qui passait son litteral en ligne.

Corrige en cinq fichiers, par annotation de la variable intermediaire plutot que retouche du
litteral (`const src: ObjetBrut[] = [...]`) : `tests/unit/engine/moteur.test.ts`,
`export/resume.test.ts` (qui gagne aussi un `CTX: ContexteResume` explicite, au lieu de laisser
`refLabel`/`targetLabel` s'inferer chacun de son cote), `interaction/drag.test.ts` (cinq occurrences
identiques d'un cercle sans points), `model/creation.test.ts` (`EtatCreation`/`ContexteCreation`,
importes plutot que redevines) et `model/normalisation.test.ts`, ou deux acces a `bdtopo` (reste
`unknown` par choix, spec §12) ont du etre cast explicitement une fois `src` type.

Aucun fichier de `src/` touche : pas de nouveau build, pas de nouvelle version, les six empreintes
n'ont pas de raison de bouger et n'ont pas ete recapturees.

Le cliquet protege maintenant `tests/` comme un bloc, en plus des quatorze dossiers de `src/` :
**`--noImplicitAny` est a zero sur l'intégralité du depot**, la dette du barreau 3 n'existe plus.


### Point de vigilance

`plan.html` et `src/legacy.ts` contiennent désormais le même code à deux endroits. Toute correction
faite dans `plan.html` serait perdue pour la version construite. À partir d'ici, `plan.html` est un
fichier mort : il ne reste que parce qu'il est ce qui tourne encore en production, et il doit être
remplacé par `dist/index.html` au prochain déploiement.

**Réglé le 29 août 2026.** `plan.html` n'est plus le fichier mono-page d'origine : c'est le build.
Le témoin 1.0.0 reste en place sous `legacy/plan_interactif.html`, où il joue le seul rôle qui lui
restait — servir d'oracle pour tout ce que les empreintes ne voient pas. Il n'y a donc plus deux
copies du même code, mais une version livrée et un témoin figé, ce qui est une autre chose.

## Phase 4 — la fin : `legacy.ts` supprimé (9 septembre 2026)

La spec (§6, « Killing the boot() closure ») demandait de sortir la fermeture. Elle est sortie —
mais pas comme la spec l'imaginait, et la différence mérite d'être écrite, parce qu'elle a fait
gagner du temps.

### Ce qui a été fait, et ce qui a été laissé de côté

§6.3 esquissait un bus d'événements (`AppEvent`, `emit()`) pour découpler les ~90 appels directs à
`render()`. Elle s'autorisait aussi explicitement à ne pas le faire (« Keep that — do not introduce
reactivity »). C’est cette permission qui a été prise. Introduire un bus aurait changé **l’ordre
des effets** — le seul invariant que les golden files surveillent vraiment — et l’aurait changé
partout à la fois. Rien ne l’exigeait : ce qui rendait `legacy.ts` insécable n’était pas le couplage
des appels, c’était **la portée**. Toutes ces fonctions fermaient sur `etat`, sur la racine SVG et
sur une soixantaine d’enveloppes.

La réponse tient donc en une phrase : **la fermeture reste une fermeture, mais elle vit dans un
module typé.** `src/legacy.ts` → `src/app/boot.ts`, mêmes instructions, même ordre, et un
compilateur qui regarde. `app/atelier.ts` décrivait déjà, depuis la phase 6, la forme de l’objet
nommé que `boot()` construit et que les groupes d’écouteurs reçoivent.

### Ce que le compilateur a trouvé en arrivant

Le fichier portait `@ts-nocheck` depuis la phase 1 : personne ne l'avait jamais lu. En le retirant,
38 erreurs de type, puis 66 paramètres implicitement `any`, puis — une fois ESLint autorisé à le
lire, sa configuration l’excluant nommément — **280 symboles morts**.

Une de ces erreurs n'était pas cosmétique. Le contexte passé à `importSVGString` citait
`filtrerSansParcelle` en abrégé d’objet ; la fonction avait quitté ce fichier pour
`io/exportProjet.ts` en phase 2 **sans que l’import soit ajouté**. Construire l’objet levait donc un
`ReferenceError` — avant l’appel, pas pendant — et le `try/catch` de `app/ecouteurs/fichiers.ts` le
transformait en bandeau. **L’import SVG était cassé depuis la phase 2, en silence.**

Ce que les paliers précédents auraient pu voir, et n’ont pas vu :

- les golden files n’exercent que les **exports** — aucun n’importe quoi que ce soit ;
- le `try/catch` transformait une panne en message, donc rien ne remontait ;
- `@ts-nocheck` empêchait la seule vérification qui l’aurait attrapée immédiatement.

Le typage a donné la cause **et** le remède : `importSVGString` ne lit aucune des quatre propriétés
que ce littéral lui passait en trop. Les retirer répare le geste sans rien ajouter. Vérifié en
direct sur les trois versions avec le même fichier — le témoin figé 1.0.0 et le build corrigé
donnent le même résultat exact ; le build d’avant correction n’importe rien.

### Ce que 280 symboles morts disent

272 spécificateurs d’import et 8 déclarations locales : `legacy.ts` avait gardé une référence vers
presque tout ce qui en était sorti pendant treize paliers, sans que rien ne les relise. Ce n’est pas
une négligence de l’extraction, c’est ce qui arrive quand **l’outil qui l’aurait dit était éteint** :
la configuration ESLint excluait `src/legacy.ts` nommément, « tant qu'il contient le code d'origine ».
La leçon est petite et générale : une exclusion d’outil posée « en attendant » survit à ce qu’elle
attendait, et elle ne se signale jamais elle-même.

### Quatre types remis d’aplomb au passage

Aucun n’était visible tant que le fichier ne compilait pas :

- `ProjetResume` (io/api.ts) et `ProjetMeta` (ui/projectBar.ts) décrivaient la **même** ligne de
  serveur et avaient divergé : `name` obligatoire d’un côté, facultatif de l’autre. Une seule
  description reste, là où la donnée arrive.
- `serializeMeasures` déclarait rendre des `ObjetSerialise[]`. Elle rend des cotes.
- `renderTerrasseSelector` exigeait les neuf fonctions de `ContexteTerrassePanels` ; elle en lit deux.
- Cinq littéraux de contexte passaient des propriétés que leur destinataire ne lit pas.

### La preuve

Le protocole habituel, avec une preuve d’après-recapture **plus forte que d’ordinaire** : `alpha.13`
et `alpha.14` ayant la même longueur, remettre l’ancien numéro dans les octets fraîchement capturés
reproduit les six empreintes précédentes **au bit près, les deux PDF compris** — ce que les
recaptures antérieures ne pouvaient pas établir. Détail dans
[`../tests/fixtures/golden/EMPREINTES.md`](../tests/fixtures/golden/EMPREINTES.md).

Le test d’échafaudage change d’objet plutôt que de disparaître : il vérifiait que `legacy.ts`
commençait par `@ts-nocheck` ; il vérifie maintenant que `legacy.ts` n’existe plus **et** qu’aucun
fichier de `src/` ne porte la directive. C’est le critère de sortie §14, gardé par un test.

## Phase 7 — l'échelle gravie (20 septembre 2026)

Les barreaux 3 à 7 de la spec §9.2 ont été franchis en une seule passe, et `tsconfig.json` porte
désormais la configuration cible de la §9.1. Mesure cumulée au départ, sur le dépôt entier :

| Barreau | Drapeau ajouté | Erreurs |
|---|---|---:|
| 3 | `strictNullChecks` | 602 |
| 4 | `strict` complet | 636 |
| 5 | `noUncheckedIndexedAccess` | 1 472 |
| 6 | `exactOptionalPropertyTypes` | 1 508 |
| 7 | `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | 1 513 |

À l'arrivée : 0. Le barreau 5 était bien le plus gros poste, comme la §9.2 l'annonçait : les
tableaux parallèles à `pts` et les indices bornés par une boucle représentent plus de la moitié
des 1 513.

### La méthode : couche par couche, en parallèle, sous une même règle

La §9.2.3 prévoyait de gravir les barreaux « couche par couche dans le même ordre, et non drapeau
par drapeau ». C'est ce qui a été fait, avec une différence de rythme : les quinze dossiers ont été
traités **en même temps**, chacun par un passage indépendant, parce que les corrections sont
locales. Une règle unique pour tous, et elle tient en une phrase : **aucun changement de
comportement à l'exécution**. Donc uniquement des types — `!` là où le code environnant garantit
déjà l'invariant, `| undefined` là où une propriété facultative reçoit `undefined` en clair, `as`
là où une garantie existe que le compilateur ne voit pas — et jamais un `if`, un `return`, une
valeur par défaut ou un `??` de plus. Un passage ne modifiait que son dossier et ses tests ; les
types partagés (`model/types.ts`) n'ont bougé qu'à deux endroits, signalés par le passage `ui/` et
appliqués ensuite : `prixVisUnite` et `vignette` acceptent `undefined`.

La règle est vérifiable, et elle a été vérifiée : le diff de `geometry/`, une fois les `!` ôtés,
est identique à l'original ligne pour ligne. Celui d'`ui/`, une fois `!`, `(e as Error)` et deux
casts retirés, aussi.

`app/` est passé en dernier et seul, parce que c'est la racine de composition : c'est là que les
contextes fournis aux autres dossiers se comparent aux interfaces qu'ils exigent, et c'est là que
les signatures fausses se voient.

### Ce que le compilateur a trouvé : des signatures qui disaient faux

`strictFunctionTypes` compare les paramètres dans le bon sens, et c'est lui qui a fait tomber les
interfaces écrites « pour compiler » :

- **`ContexteHistorique` disait `unknown[]`** pour des objets du plan et des cotes. Il est désormais
  générique sur leur forme : la racine de composition y met `ObjetPlan` et `Mesure`, un test y met
  la doublure minimale qu'il veut. L'historique ne lit que `key`, et son type le dit enfin.
- **`appliquerProjetImporte` recevait `unknown`** dans `app/ecouteurs/fichiers.ts` et dans
  `ui/projectBar.ts` alors qu'elle exige un `ProjetValide` — le type que `validerProjetJSON` rend.
  L'appel de `cadastreDialog.ts` construit bien un `ProjetValide` ; il compile sans changement.
- `ContexteAttrPanel.startPick` et `measureSegCoords` disaient `string` et `| null` là où les
  unions réelles (`Pointage['mode']`, `CoteDesigne`) existaient déjà ; `ContexteVue3d.setMode3D`
  prend un `Mode3D` ; `ContexteMesurePanel.refLabel` accepte `null`, ce que son implémentation
  faisait depuis le début.
- `chargerTuileOrtho` annonçait `Promise<string | undefined>` alors que le `has` précède le `get` :
  elle rend `Promise<string>`. `three/etat3d.ts` disait `unknown` pour une `Date`.
- `ContexteEmpilement` est générique sur le type d'élément ; à la racine, l'ajout au SVG suppose
  `el` posé, exactement comme l'appel direct le supposait — c'est écrit une fois, là où c'est vrai.

Et deux symboles morts de plus, dans la lignée des 280 du 9 septembre : le paramètre `lamesAngle`
d'`evaluerStructure`, jamais lu (l'angle est recalculé en amont), et `GlisserEnCours.startR`.

### Ce que le compilateur n'a pas corrigé, et qu'il faut savoir

Une assertion `!` ne rend pas un invariant vrai : elle dit qu'il l'est **ailleurs**. Les passages
ont relevé où cet ailleurs est fragile. Rien n'a été corrigé — ce palier ne change pas de
comportement — mais tout est ici, groupé par ce qui tient l'invariant :

**Tenu par `normalizeObjects`, pas par le type.** « `type === 'polygon'` implique `pts` présent »,
« `type === 'circle'` implique `center` et `r` », « `vertexNames`/`segmentNames` alignés sur `pts` » :
une soixantaine de sites dans `attrPanel.ts`, et partout dans `render/`, `export/`, `three/`,
`engine/parasol.ts`. C'est le chantier de l'union discriminée que `types.ts` annonce depuis la
phase 4 (spec §12), et ce palier le rend plus visible, pas plus urgent.

**Tenu par `ensureConstruction`, sauf quatre champs.** `soliveSection`, `soliveEntraxe`,
`lambourdeEntraxe`, `essenceBois` ne sont posés que par `defaultConstruction()`, jamais comblés à
l'ouverture (le commentaire de `Construction` le dit). Sur un projet enregistré sans eux,
`computeDebitsBois` produirait `section: undefined` et un titre « (undefined) ». C'est le
comportement actuel ; les `!` le laissent passer.

**Tenu par l'appelant.** `rect.ts` suppose `pts.length === 4`, garanti par `estRectangle` chez
l'appelant ; `alignement.ts` et `interaction/editing.ts` reçoivent un indice de l'interface sans le
borner ; `render/objects.ts` suppose que `reconstruirePoignees` ramène `pointEls` à la bonne
longueur ; `tables.ts` suppose « `calcule` implique `prixReel` posé », tenu par `engine/bom`.

**Des `!` qui mentent, et le disent.** `io/importSvg.ts` : sur un SVG étranger,
`parseFloat(el.getAttribute(...))` reçoit réellement `null`, et c'est le `NaN` qui en sort que
`Number.isFinite` attend en aval. `geometry/path.ts::num` lit au-delà de la fin sur un chemin
tronqué, rattrapé par le même `isFinite`. Ces deux-là sont commentés : si quelqu'un retire un jour
la garde aval, le compilateur ne préviendra plus.

**Ce qui ressemble à un bug, à traiter hors de ce palier.** `io/importSvg.ts` l.179 : le
commentaire annonce une vérification « ligne à ligne » des mesures restaurées, seule l'existence
des deux objets est contrôlée — `refSegIndex`, `startEnd`, `targetPtIndex` sont recopiés tels
quels. `ui/projectBar.ts` l.387 : la garde ne vérifie qu'`origineLat` avant de projeter avec
`origineLon`. `ui/cadastreDialog.ts` l.303 : `hauteurBatiment(b.props!)` alors que `props` est
facultatif et lu sans garde. `three/scene.ts` : un objet sans `fill` arrive à `MeshStandardMaterial`
comme `undefined`, que Three r128 ignore avec un avertissement. `three/exportGlb.ts` : si la scène
WebGL n'a pas pu se créer, l'export GLB échoue sur un `TypeError` rattrapé en bannière, message
peu explicite. `util/semaine.ts`, `three/lumiere.ts`, `engine/parasol.ts` : une date qui n'a pas
trois segments donne `NaN` en silence.

### La preuve

Le protocole habituel, dans l'ordre. D'abord **à version inchangée** : le build fraîchement typé
reproduit les six empreintes d'`alpha.14` au bit près — le typage n'a rien déplacé, alors que le
build lui-même a changé de cinq octets (imports morts, paramètre renommé). Ensuite le numéro passe
à `alpha.15` et les six sont recapturées. Enfin la preuve forte du 9 septembre, refaite :
`alpha.14` et `alpha.15` ayant la même longueur, remettre l'ancien numéro dans les six octets frais
reproduit **les six empreintes précédentes au bit près, les deux PDF compris**. Détail dans
[`../tests/fixtures/golden/EMPREINTES.md`](../tests/fixtures/golden/EMPREINTES.md).

535 tests, inchangés. `tsc --noEmit`, ESLint et le cliquet à zéro sur `src/` et `tests/`. Le
cliquet n'a plus de drapeaux à monter : il reste le rapport par dossier, et la garde.

### Trois corrections, le même jour (20 septembre 2026, `1.1.0-alpha.16`)

Les trois points de « ce qui ressemble à un bug » ci-dessus ont été corrigés dans la foulée, en un
palier séparé pour que la phase 7 reste ce qu'elle promet : des types, rien d'autre.

- **Les cotes importées.** Le défaut était partagé par les deux imports, SVG et JSON : seule
  l'existence des deux objets était vérifiée, les indices passaient tels quels. Plutôt que deux
  gardes, un seul juge : `model/mesures.ts::referencesDeCote` ne lit que ce que
  `render/measures.ts::geometrieMesure` lira, et refuse ce qui ne se dessinerait pas — objet absent,
  cercle pris pour référence (il n'a pas de côté), indice hors du polygone, indice qui n'est pas un
  entier positif. `startEnd` est normalisé en `A`/`B`, ce que le rendu distingue ; un fichier qui
  portait autre chose se dessinait déjà depuis `A`. Le test rejoue l'import du SVG doré (35 objets,
  11 cotes, références intactes) puis une copie de ses cotes abîmées de six façons : deux
  survivent, celles qui le doivent.
- **Le point de calage.** Une garde qui ne vérifie qu'une coordonnée sur deux est une garde qui
  ment ; elle vérifie les deux, et le `!` sur `origineLon` disparaît avec.
- **Les bâtiments sans propriétés.** La boîte d'import lisait `props` sans garde là où l'import
  lui-même faisait déjà `b.props || {}` : même repli.

Six empreintes sur six inchangées à version égale, recapturées en `alpha.16` avec la preuve forte.
Ce palier est ce que RELEASE.md §2.1 appelle un correctif : aucun nombre, aucun octet exporté ne
bouge. 547 tests.

## Durcissement — `ObjetPlan` devient une union discriminée (21 septembre 2026, `1.1.0-alpha.17`)

Le premier chantier de la spec §12, et le seul que la phase 7 désignait par son nom : D-3 de
`MD/DEFAUTS.md`. Jusqu'ici `ObjetPlan` disait « peut-être des sommets, peut-être un centre et un
rayon » d'une seule forme à champs facultatifs, plus un index `[autreChamp: string]: unknown` qui
laissait passer n'importe quel nom. Ce que le programme savait — un polygone a toujours `pts`, un
cercle toujours `center` et `r` — n'était écrit que dans `normalizeObjects`, et 258 assertions `!`
sur `pts`, `center` et `r` le répétaient à sa place.

### Deux marches

**L'index d'abord.** Retirer les quatre signatures d'index (`ObjetPlan`, `Construction`,
`LigneBom`, `Mesure`) n'a cassé que 35 sites, et ce qu'ils lisaient tenait en deux champs jamais
déclarés : `ObjetPlan.voisinage` (posé par « Actualiser IGN », lu par la bascule) et `Mesure.id`
(posé par `idMesure()` à chaque création, lu par la sérialisation). Déclarés. Les colonnes du
sélecteur indexaient l'objet par une clé libre : elles nomment maintenant les cinq bascules
booléennes qu'elles sont.

**L'union ensuite.**

    interface ObjetCommun { key; name; vertexNames?; ... }          // tout ce qui est partagé
    interface ObjetPolygone extends ObjetCommun { type: 'polygon'; pts: PtBrut[] }
    interface ObjetChemin   extends ObjetCommun { type: 'path';    pts: PtBrut[] }
    interface ObjetCercle   extends ObjetCommun { type: 'circle';  center: PtBrut; r: number }
    type ObjetPlan = ObjetPolygone | ObjetChemin | ObjetCercle;

Poser l'union a produit 317 erreurs — bien moins que craint, parce que la plupart du code
branchait déjà sur `type` et se rétrécit tout seul. Les cinq dossiers de base ont été traités par
le coordinateur, les autres en parallèle par quatre passages (moteur, exports, UI et application,
3D et tests), sous la règle de la phase 7 : aucun changement de comportement.

### Comment les assertions ont disparu, par ordre de préférence

1. **Le code branchait déjà sur `type`** : le `!` tombe, rien d'autre ne bouge. C'est le cas le plus
   fréquent (attrPanel, render/objects, serialisation, scene, dossierPdf…).
2. **Le code testait la présence du champ** (`obj.pts ? …`, `obj.center ? …`, `obj.pts || []`) : une
   garde nommée de `model/formes.ts` la remplace — `aDesSommets`, `estCercle`, `sommetsDe` — avec
   la même valeur de vérité après `normalizeObjects`.
3. **Le code lisait `pts` sans brancher**, parce que le contexte garantit un polygone (la parcelle
   trouvée par sa clé, la terrasse du panneau, un objet déjà filtré) : `enPoints(obj).pts`, ou
   `enCercle(par)` pour un parasol. Un cast sous un nom, rien à l'exécution — mais un nom qu'on peut
   chercher, là où le `!` se fondait dans le décor.
4. Un `Pick<ObjetPlan, 'pts'>` sur l'union n'existe plus (la clé manque à un membre) : les trois
   vues partielles — `ObjetCote` (render), `ObjetMesurable` (engine), `ObjetASurface` (export) —
   sont devenues des formes structurelles explicites, auxquelles tout membre reste assignable.

**258 → 25.** Les vingt-cinq qui restent portent toutes sur autre chose que l'union : des types
partiels (`ObjetBrut` dans `normalisation` et `validation`, ce qui arrive d'un fichier), des
interfaces locales à champs facultatifs (`dxfPlan`, `structure.TerrasseEtudiee`, `drag.FormeGlissable`,
`etat3d.PointDeVue`) ou les formes structurelles ci-dessus, qui acceptent volontairement des objets
incomplets pour les tests.

### Ce que l'union a révélé

Rien de faux à l'exécution, et quatre endroits où le type ne peut pas prouver ce que le code
suppose :

- `attrPanel.ts`, « Placer au mieux », et `three/scene.ts` sélectionnent un parasol par
  `fonction === 'parasol'` et lisent `center` : un parasol naît cercle, mais la liste des fonctions
  permet de dire « parasol » d'un polygone, qui planterait alors. `enCercle` le couvre comme le `!`
  le couvrait ; c'est **D-14** dans `MD/DEFAUTS.md`.
- `ecouteurs/objets.ts`, « Position initiale », lit `init.center` ou `init.pts` selon le `type` de
  l'objet *courant*, pas de l'état initial. Sûr tant que rien ne réaffecte `type`.
- `three/scene.ts`, ruban de sol : un objet « terrain » circulaire passait `undefined` à
  `addRibbonFlat`, qui l'accepte. Comportement conservé, invariant nommé.
- `engine/debit.ts` passait un `pts` peut-être absent à `longueurLameReelle`, dont l'amont avait
  déjà déréférencé `pts` : un cercle n'y arrivait jamais. Écrit maintenant.

### La preuve

Même protocole : six empreintes sur six identiques à version inchangée sur le build typé, puis
recapture en `alpha.17` avec la preuve forte (ancien numéro remis dans les octets frais, six
anciennes empreintes retrouvées au bit près). 548 tests, `tsc`, ESLint et le cliquet à zéro.

## La migration est terminée — `1.1.0`, 21 septembre 2026

Vingt-quatre jours après la phase 0. Le fichier mono-page de 13 487 lignes est un graphe de 115
modules, sous la configuration la plus stricte du compilateur, et l'artefact livré est toujours un
seul fichier `plan.html` — celui que `npm run build` produit, copié à la racine à chaque palier. La
définition de fin (`spec-migration-typescript.md` §14) est cochée en entier, et la grille de sortie
de `RELEASE.md` §2.3 pour la `1.1.0` était précisément celle-là.

### Le dernier passage de version

Passer d'`alpha.17` à `1.1.0` raccourcit de neuf octets la chaîne estampillée dans les six
artefacts. La preuve forte des recaptures précédentes (même longueur, ancien numéro remis dans les
octets frais) ne s'applique donc pas ; c'est la preuve de la rupture du 29 août qui a été refaite :

- les quatre artefacts texte sont **identiques** à ceux de l'`alpha.17` une fois le numéro
  neutralisé — une ligne diffère dans le résumé, le SVG et le DXF, trois dans le JSON (version et
  horodatages) ;
- les deux PDF ont le même contenu : 14 objets, 2 pages, 143 textes pour `plan.pdf` ; 15, 3, 107
  pour `dossier.pdf` ; et une fois neutralisés le numéro, les dates, les décalages de la table
  `xref`, `startxref` et les longueurs de flux, **une seule ligne diffère** dans chacun — le
  dictionnaire `/Producer … /Creator (plan.html build …)`, qui porte la version et la date de build,
  passée du 29 août au 21 septembre avec `BUILD_AT`.

Puis la checklist de fumée a été redéroulée sur le build `1.1.0`, 25/25, mêmes valeurs qu'en
`alpha.16` (`tests/CHECKLIST-FUMEE.md`), et le GLB revérifié : huit compteurs identiques.

### Ce que la migration laisse

- **Un oracle.** Six artefacts, une empreinte normalisée chacun, un test qui les garde, et un
  protocole de recapture qui prouve avant de remplacer. Le moteur a son propre oracle
  (`tests/unit/engine/moteur-oracle.test.ts`). C'est ce qui a permis de déplacer 13 487 lignes en
  vingt-quatre jours sans qu'un nombre bouge.
- **Des règles que l'outil impose**, pas des conventions : sens des dépendances entre couches,
  pureté de `geometry`, `model` et `util`, configuration stricte, cliquet par dossier.
- **Une liste de dettes triée** (`MD/DEFAUTS.md`) : ce que le typage a rendu visible sans le corriger,
  chacune avec ce qui la tient aujourd'hui et ce qui la fermerait.
- **Ce qui manque encore à `RELEASE.md`** et n'était pas dans le périmètre de la migration :
  l'injection de la version au build (§5.1), l'échec du build sur arbre sale ou étiquette
  discordante, la proposition automatique de bump (§7). `APP_VERSION` et `BUILD_AT` restent écrits
  à la main dans `model/version.ts`, comme depuis le 29 août.

### Les étiquettes

Le dépôt n'en portait aucune, alors que ce journal en citait deux depuis la phase 0. Elles sont
posées ce jour, après coup, sur les commits qu'elles désignent : `v1.0.0` et `v0-preTS` sur le gel
du 28 août (`599b570`), `v1.1.0-alpha.1` sur la rupture du 29 août (`108389a`), `v1.1.0` sur la
publication. Annotées, non signées : aucune clé de signature n'est configurée sur ce poste.

## Reconstruction de l'IHM — étape 0 : le registre des commandes et le magasin (21 septembre 2026, `1.2.0-alpha.1`)

Premier palier de `MD/spec-ihm-zones.md` §6, et le seul qui ne change rien à l'écran. Les décisions
prises le même jour (§7) le cadrent : React avec Zustand, fichier unique conservé, tactile comme
critère d'acceptation, la terrasse comme contexte du plan et non comme vue, les résultats dans un
tiroir en bas du canevas.

### Le registre

`app/commandes.ts` : une commande a un identifiant stable en `groupe.action`, un libellé, un
groupe, parfois un raccourci et une condition d'activation. Le registre refuse un identifiant déjà
pris — un geste, une commande, autant de liaisons qu'on veut — et lie un élément du DOM à une
commande sans que l'écouteur sache ce qu'elle fait.

Les neuf groupes d'écouteurs qui portaient des boutons passent par lui : **47 commandes** dans
douze groupes (`objet` 12, `3d` 9, `export` 7, `visionneuse` 6, `vue` 5, `fichier` 3, `mesure` 2,
`affichage` 2, `cloture` 2, `projet` 1, `terrasse` 1, `plu` 1). Il ne reste dans `app/` qu'un seul
`addEventListener('click')` hors registre, celui des sous-onglets de terrasse construits à la volée
dans `app/modes.ts` — ils disparaissent à l'étape 3 avec le mode Terrasse. Les cases à cocher et
les curseurs (`change`, `input`) ne sont pas des commandes mais des réglages ; ils rejoindront le
magasin zone par zone.

Le recâblage est un remplacement ligne à ligne : chaque `el('x').addEventListener('click', f)`
devient `cmd.bouton('x', { id, libelle, groupe, executer: f })`, `f` inchangé. Les deux écouteurs
qui lisaient `this` (générer et régénérer le GLB, interroger le PLU) reçoivent l'élément en
`source`. Aucun `if`, aucune valeur, aucun ordre n'a bougé.

### Le magasin

`app/magasin.ts` : un store Zustand *vanilla* qui tient la référence vivante d'`EtatApp` et un
compteur de version que `render()` incrémente. C'est un pont, pas une réécriture : tout le
programme continue de muter l'état en place, et un composant React qui s'abonnera au compteur se
redessinera à chaque rendu du plan en lisant l'état tel qu'il est. Personne ne s'y abonne encore.
Les champs migreront vers un état immuable zone par zone, quand une zone en aura besoin.

### L'outillage

React, React DOM et Zustand sont des dépendances ; le greffon React de Vite est branché et
`tsconfig.json` accepte le JSX. Rien n'en utilise encore : React n'entre pas dans le build. Le
fichier livré passe de 451 221 à 454 316 octets — Zustand et le registre, trois kilo-octets.

### La preuve

Six tests unitaires sur le registre et le magasin (`tests/unit/app/commandes.test.ts`) : 554 tests.
Les six artefacts sont comparés aux golden files de la `1.1.0` avec la preuve de la rupture, le
numéro ayant changé de longueur : quatre fichiers texte identiques hors numéro, deux PDF au même
contenu, une seule ligne différente une fois neutralisés numéro, dates, décalages et longueurs de
flux. Puis les gestes qui passent par un bouton — points 1 à 11, 16 à 24 de la checklist — rejoués
sur le build.

## Reconstruction de l'IHM — étape 1 : la coquille (21 septembre 2026, `1.2.0-alpha.2`)

Les deux premières zones React entourent le canevas existant : **Z1, la barre d'application**
(`zones/BarreApplication.tsx`) et **Z7, la barre d'état** (`zones/BarreEtat.tsx`). Trois régions
d'`index.html` disparaissent — `#projectBar`, `#modeBar` et le `<h1>` — remplacées par un
conteneur `#zoneBarre` en tête et un `<footer id="zoneEtat">` fixé en bas de la fenêtre.

### Ce qui a bougé, et où c'est allé

- **La barre de projet** était construite à la main dans `ui/projectBar.ts::setupProjectBar` :
  chaque bouton, une fermeture qui fabriquait son élément. Sa logique est maintenant `app/projet.ts`,
  sans un nœud DOM — cinq commandes (`projet.nouveau`, `projet.enregistrer`, `projet.supprimer`,
  `projet.depuisAdresse`, `projet.actualiserIgn`) et un objet `Projet` dont la seule méthode,
  `ouvrir(id)`, sert au `<select>`. Le statut d'enregistrement n'écrit plus dans un `<span>` : il
  est publié dans le magasin (`projet.statut`, `enregistreA`), et l'historique le rafraîchit comme
  avant, par `definirRafraichisseurStatut`. `ui/projectBar.ts` ne garde que ce qui parle du
  cadastre et du PLU, et son en-tête le dit.
- **Les quatre boutons de vue** sont rendus par Z1 depuis `magasin.vue` ; `app/modes.ts` ne
  cherche plus d'élément par identifiant pour l'allumer, il *signale* la vue courante
  (`signalerVue`). Les commandes `vue.*` sont déclarées sans liaison DOM.
- **Le titre et le lieu** : Z1 les lit dans le magasin (`projet.courant.name`, `lieu`) ;
  `syncLieuTitre` publie au lieu d'écrire dans `#titreLieu`.
- **Le pointeur** : le plan publie sa position en mètres à chaque `pointermove`, Z7 l'affiche avec
  l'échelle, l'objet sélectionné, le statut et la version. Elle lit l'état du plan à travers le
  compteur de version du magasin — elle se redessine à chaque rendu, comme le plan.
- **Les bascules Voisinage et Orthophoto**, qui vivaient dans la barre de vues, sont déplacées dans
  l'onglet Affichage, inchangées ; elles rejoindront le menu Affichage de Z1 à l'étape 2.

Les identifiants `projectSelect`, `saveProjectBtn`, `projectStatus`, `appVersion`,
`modePlanBtn`… sont conservés sur les éléments React : la checklist de fumée et le test de
déploiement les cherchent, et ils n'ont aucune raison de changer.

### Ce que ça coûte

Le fichier livré passe de 454 316 à 679 862 octets : React DOM y entre. Le budget est de 1,2 Mo
(`spec-migration-typescript.md` §14) ; il en reste 520 Ko pour les sept zones suivantes, qui
n'ajoutent que du code à nous. `zones/` est une couche de niveau 6, comme `app/` — le test
d'architecture parcourt désormais aussi les `.tsx`.

### Ce qui n'a pas bougé

La terrasse est encore une vue : sa disparition comme mode (décision 4) touche `app/modes.ts`,
`#terrasseTopBar`, `#stageParking` et le déplacement physique du `<svg>` ; elle appartient à
l'étape 3, avec l'explorateur qui la remplacera par un contexte de sélection.

### La preuve

Six empreintes identiques à celles de l'`alpha.1` par la preuve forte (même longueur de numéro,
ancien numéro remis dans les octets frais). Sur le build : les quatre vues depuis Z1, le pointeur et
la sélection dans Z7, les dialogues d'import et d'actualisation ouverts depuis Z1, les bascules
retrouvées dans Affichage. Sur le déploiement PHP : la liste des projets dans le `<select>`, le
statut « Modifications non enregistrees » après une duplication, « Enregistrement… » pendant
l'appel, « Enregistre a … » après, et l'objet de plus côté serveur. 554 tests.

## Reconstruction de l'IHM — étape 2 : la palette et le canevas (21 septembre 2026, `1.2.0-alpha.3`)

**Z2, la palette d'outils** (`zones/Palette.tsx`) remplace la rangée `#planActions` qui vivait sous
le plan : quatre groupes — Historique, Créer, Éditer, Outils — treize boutons, chacun une commande
du registre. Un bouton dont la commande n'est pas active est grisé : plus de « Sélectionne d'abord un
objet » en réponse à un clic, le bouton le dit avant. L'annulation lit l'état de la pile dans le
magasin, que l'historique lui signale (`signalerPile`) — le bouton `#undoBtn` que l'historique
désarmait n'existe plus dans le balisage.

**Z4, les surimpressions du canevas** (`zones/Surimpression.tsx`) : la grille et le cadrage sur la
sélection gardent leur place sur le plan et leurs identifiants, mais leur état se lit dans le
magasin. `render/pipeline.ts` et `app/modes.ts` n'écrivent plus `display` sur `#fitBtn` ; le rendu
ne touche plus un bouton.

**Le menu Affichage** de Z1 : Flèche Nord, Grille, Voisinage (quand il y a du voisinage), Fond
orthophoto — quatre commandes qui inversent l'état, cochées d'après lui. Les cases de l'onglet
Affichage exécutent les mêmes commandes, et restent : elles partiront avec l'onglet à l'étape 3.

**Deux outils nouveaux dans la palette**, qui n'étaient jusque-là accessibles qu'au fond d'un
panneau : `mesure.nouvelle` ouvre l'onglet Mesure et attend le côté de référence ; `objet.aligner`
ouvre l'onglet Objet et attend le côté cible. `ui/panelTabs.ts` expose pour cela `activerOnglet`,
ce que faisait un clic sur un onglet, disponible par programme.

Le plan a perdu la largeur de la palette : `computeSize` la retranche au-dessus de 1 024 px ; en
dessous, la palette s'escamote et le plan reprend tout.

### Ce que ça change d'usage

Le plan est plus haut sur la page — la rangée de boutons ne le pousse plus vers le bas — et les
gestes de création sont à portée constante, à gauche, quelle que soit la hauteur du panneau.
Dupliquer, Supprimer, Reculer, Position initiale et Aligner sont gris tant que rien n'est
sélectionné ; Annuler, tant que la pile est vide.

### La preuve

Six empreintes identiques à celles de l'`alpha.2` par la preuve forte. Sur le build : création des
six formes depuis la palette, duplication, suppression avec confirmation, annulation jusqu'au vide
avec le bouton qui se grise, grille et cadrage depuis la surimpression, les quatre bascules du menu
Affichage, la cote et l'alignement depuis la palette. 554 tests.
