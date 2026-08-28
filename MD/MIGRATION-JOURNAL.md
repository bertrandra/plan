# Journal de la migration TypeScript

Suivi d'exécution de [`spec-migration-typescript.md`](spec-migration-typescript.md) §4. Une ligne
par phase, avec le critère de sortie tel que la spec le formule et la preuve qu'il est atteint.

| Phase | État | Étiquette | Critère de sortie | Preuve |
|---|---|---|---|---|
| 0 — Filet de sécurité | ✅ 28/08/2026 | `v0-preTS` | les golden files se reproduisent à l'identique depuis le fichier étiqueté | 6 empreintes identiques par 3 chemins de calcul indépendants |
| 1 — Échafaudage, zéro logique déplacée | ✅ 28/08/2026 | `v1.0.1-alpha.1` | build mono-fichier fonctionnellement identique, golden files conformes, déployable à côté d'`api.php` | `dist/index.html` : 6 empreintes sur 6 identiques |
| 2 — Extraction des feuilles pures | ✅ 28/08/2026 | `v1.0.1-alpha.2` | ~1 800 lignes hors de `legacy.ts`, maths couvertes par des tests | 709 lignes sorties : la liste de la phase est épuisée (voir plus bas) ; 106 tests |
| 3 — Extraction du moteur | ✅ 28/08/2026 | `v1.0.1-alpha.3` | moteur terrasse pur, ≥ 80 % de couverture, BOM et débit conformes | 10 modules ; 91,5 % de couverture ; 18/18 sorties identiques bit à bit |
| 4 — Modèle et conteneur d’état | 🟡 avancée 28/08/2026 | `v1.0.1-alpha.6` | `legacy.ts` réduit aux panneaux UI et à la 3D | données/vue séparées, `AppState` en place (334 accès), scène et pile sorties ; `render/**` et `interaction/**` restent |
| 5 — Panneaux UI | 🟡 partielle 28/08/2026 | `v1.0.1-alpha.5` | (non formulé par la spec) | dialogues, sélecteur de textures et helpers DOM sortis ; les panneaux qui pilotent le plan attendent `render/**` |
| 6 — 3D et exports | ⏳ | | | |
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

Après avoir déroulé **toutes** les annulations disponibles, le bouton « Dupliquer » ne fait plus
rien : aucun objet créé, aucun message. Le bouton est bien le même élément, toujours attaché, et
son gestionnaire s'exécute.

Ce n'est **pas** une régression : le même scénario donne exactement le même résultat sur
`legacy/plan_interactif.html`, l'artefact gelé d'avant migration (35 → 38 → 35 → 35). C'est
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


### Point de vigilance

`plan.html` et `src/legacy.ts` contiennent désormais le même code à deux endroits. Toute correction
faite dans `plan.html` serait perdue pour la version construite. À partir d'ici, `plan.html` est un
fichier mort : il ne reste que parce qu'il est ce qui tourne encore en production, et il doit être
remplacé par `dist/index.html` au prochain déploiement.
