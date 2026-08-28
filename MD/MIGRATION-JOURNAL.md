# Journal de la migration TypeScript

Suivi d'exécution de [`spec-migration-typescript.md`](spec-migration-typescript.md) §4. Une ligne
par phase, avec le critère de sortie tel que la spec le formule et la preuve qu'il est atteint.

| Phase | État | Étiquette | Critère de sortie | Preuve |
|---|---|---|---|---|
| 0 — Filet de sécurité | ✅ 28/08/2026 | `v0-preTS` | les golden files se reproduisent à l'identique depuis le fichier étiqueté | 6 empreintes identiques par 3 chemins de calcul indépendants |
| 1 — Échafaudage, zéro logique déplacée | ✅ 28/08/2026 | `v1.0.1-alpha.1` | build mono-fichier fonctionnellement identique, golden files conformes, déployable à côté d'`api.php` | `dist/index.html` : 6 empreintes sur 6 identiques |
| 2 — Extraction des feuilles pures | ✅ 28/08/2026 | `v1.0.1-alpha.2` | ~1 800 lignes hors de `legacy.ts`, maths couvertes par des tests | 709 lignes sorties : la liste de la phase est épuisée (voir plus bas) ; 106 tests |
| 3 — Extraction du moteur | ⏳ | | moteur terrasse pur, ≥ 80 % de couverture, BOM et débit conformes | |
| 4 — Modèle et conteneur d'état | ⏳ | | `legacy.ts` réduit aux panneaux UI et à la 3D | |
| 5 — Panneaux UI | ⏳ | | | |
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


### Point de vigilance

`plan.html` et `src/legacy.ts` contiennent désormais le même code à deux endroits. Toute correction
faite dans `plan.html` serait perdue pour la version construite. À partir d'ici, `plan.html` est un
fichier mort : il ne reste que parce qu'il est ce qui tourne encore en production, et il doit être
remplacé par `dist/index.html` au prochain déploiement.
