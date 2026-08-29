# Journal de la migration TypeScript

Suivi d'exécution de [`spec-migration-typescript.md`](spec-migration-typescript.md) §4. Une ligne
par phase, avec le critère de sortie tel que la spec le formule et la preuve qu'il est atteint.

| Phase | État | Étiquette | Critère de sortie | Preuve |
|---|---|---|---|---|
| 0 — Filet de sécurité | ✅ 28/08/2026 | `v0-preTS` | les golden files se reproduisent à l'identique depuis le fichier étiqueté | 6 empreintes identiques par 3 chemins de calcul indépendants |
| 1 — Échafaudage, zéro logique déplacée | ✅ 28/08/2026 | `v1.0.1-alpha.1` | build mono-fichier fonctionnellement identique, golden files conformes, déployable à côté d'`api.php` | `dist/index.html` : 6 empreintes sur 6 identiques |
| 2 — Extraction des feuilles pures | ✅ 28/08/2026 | `v1.0.1-alpha.2` | ~1 800 lignes hors de `legacy.ts`, maths couvertes par des tests | 709 lignes sorties : la liste de la phase est épuisée (voir plus bas) ; 106 tests |
| 3 — Extraction du moteur | ✅ 28/08/2026 | `v1.0.1-alpha.3` | moteur terrasse pur, ≥ 80 % de couverture, BOM et débit conformes | 10 modules ; 91,5 % de couverture ; 18/18 sorties identiques bit à bit |
| 4 — Modèle et conteneur d'état | 🟡 avancée 28/08/2026 | `v1.0.1-alpha.8` | `legacy.ts` réduit aux panneaux UI et à la 3D | données/vue séparées, `AppState` en place, `render/**` et `interaction/**` amorcés (11 modules) ; `render()` et la création d'objets restent |
| 5 — Panneaux UI | 🟡 partielle 28/08/2026 | `v1.0.1-alpha.5` | (non formulé par la spec) | dialogues, sélecteur de textures et helpers DOM sortis ; les panneaux qui pilotent le plan attendent `render/**` |
| 6 — 3D et exports | ✅ 29/08/2026 | `v1.0.1-alpha.43` | (non formulé par la spec) | exports tous sortis (`export/**`) ; côté 3D, scène, navigation, soleil, chargeurs, visionneuse GLB, calque des couches et clôture sont sortis. Ne reste dans `legacy.ts` que le pilotage des modes, qui appartient à la coquille |
| 7 — Cran de rigueur et nettoyage | ⏳ | | O1–O6 atteints, `legacy.ts` supprimé | |

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

### Ce qui reste

Le squelette de `legacy.ts` : changement de mode, câblage des boutons, et le `boot()` lui-même.
**1 947 lignes**, contre 13 571 au début de la migration — 86 % en sont sortis.

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

Ce qui reste est désormais presque entièrement de la **coquille** : les écouteurs d'événements,
`boot()`, les fabriques de contexte et les enveloppes d'une ligne. Elles ne se sortent pas morceau
par morceau ; elles se réorganisent en `app/` d'un seul geste, quand on décidera de le faire.

Reste tout de même une poignée de choses extractibles au milieu : le pilotage des modes
(`setAppMode`, les sous-onglets terrasse, le déplacement du plan entre ses deux emplacements), et
l'onglet PLU.

Puis la phase 7, qui n'est pas commencée : l'échelle de rigueur du tsconfig. Mesure faite —
`noImplicitAny` seul produit aujourd'hui **997 erreurs**, essentiellement les paramètres des gros
modules déplacés tels quels. Ce n'est pas un travail mécanique : typer ces signatures, c'est
décider de la forme des données, et c'est précisément ce que la spec §5 demande.


### Point de vigilance

`plan.html` et `src/legacy.ts` contiennent désormais le même code à deux endroits. Toute correction
faite dans `plan.html` serait perdue pour la version construite. À partir d'ici, `plan.html` est un
fichier mort : il ne reste que parce qu'il est ce qui tourne encore en production, et il doit être
remplacé par `dist/index.html` au prochain déploiement.
