# Défauts connus — trouvés, non corrigés, triés

**Statut :** liste vivante, exigée par la définition de fin de la migration
(`spec-migration-typescript.md` §14, « issue list of defects found-but-not-fixed is filed and
triaged »). Ouverte le 20 septembre 2026 à la fin de la phase 7, à partir de ce que le typage
strict a mis au jour (`MIGRATION-JOURNAL.md`, « Phase 7 — l'échelle gravie »). Les trois défauts
corrigés le même jour (`1.1.0-alpha.16`) n'y figurent pas.

**Triage.** Trois niveaux, par ce que coûte le défaut s'il se produit :

- **P1** — un nombre faux ou un fichier abîmé sans que rien ne le signale ;
- **P2** — une erreur visible, un message trompeur, une fonction qui ne répond pas ;
- **P3** — un invariant tenu par le code et non par les types : rien ne casse aujourd'hui, mais la
  prochaine modification peut le casser sans que le compilateur prévienne.

Une ligne se ferme par un commit qui la cite. Rien ici ne bloque la `1.1.0` : ce sont des chantiers
du durcissement (spec §12), pas de la migration.

| # | Priorité | Où | Quoi | Depuis |
|---|---|---|---|---|
| D-2 | P2 | `three/exportGlb.ts` | Si la scène WebGL n'a pas pu se créer (contexte refusé), l'export GLB échoue sur un `TypeError` rattrapé en bannière : « Cannot read properties of null ». Le flux est correct, le message ne dit pas la cause. | phase 7 |
| D-4 | P3 | `geometry/rect.ts`, `geometry/alignement.ts`, `interaction/editing.ts` | `rect.ts` suppose `pts.length === 4`, garanti par `estRectangle` chez l'appelant ; `alignement.ts` et `editing.ts` reçoivent un indice de l'interface sans le borner. Un tuple `[PtBrut, PtBrut, PtBrut, PtBrut]` et une borne à l'entrée diraient la vérité. | phase 7 |
| D-5 | P3 | `render/objects.ts`, `ui/tables.ts` | `positionnerObjet` suppose que `reconstruirePoignees` a ramené `pointEls` à `pts.length` ; `tables.ts` suppose « `calcule` implique `prixReel` posé », tenu par `engine/bom`. Invariants d'appelant, non exprimés. | phase 7 |
| D-6 | P3 | `io/importSvg.ts`, `geometry/path.ts` | Deux familles de `!` qui mentent en le disant : `parseFloat(el.getAttribute(...))` reçoit réellement `null` sur un SVG étranger, et `path.ts::num` lit au-delà de la fin sur un chemin tronqué ; dans les deux cas c'est le `Number.isFinite` en aval qui rattrape. Si quelqu'un retire la garde aval, le compilateur ne préviendra plus. | phase 7 |
| D-7 | P3 | `util/semaine.ts`, `three/lumiere.ts`, `engine/parasol.ts` | Une date qui n'a pas trois segments `aaaa-mm-jj` donne `NaN` à `Date.UTC` en silence (et `toISOString()` lèverait dans `dateDecaleeDeSemaines`). Les trois lecteurs devraient partager un seul analyseur qui refuse. | phase 7 |
| D-8 | P3 | `three/scene.ts` | Un objet sans `fill` arrive à `MeshStandardMaterial({ color: undefined })` : Three r128 l'ignore avec un avertissement console et garde sa couleur par défaut. `normalisation.ts` ne pose pas de `fill` par défaut ; un `as CouleurTrois` commenté couvre le site. | phase 7 |
| D-9 | P3 | `geo/apiIgn.ts` | `Anneau = number[][]` : cinq `c[0]!`/`c[1]!`. Un `[number, number, ...number[]][]` dirait la vérité GeoJSON, mais le type est lu par `ui/cadastreDialog.ts` et `geo/cadastreObjets.ts` — à changer d'un bloc. | phase 7 |
| D-10 | P3 | `geo/cadastreObjets.ts` | `distanceBordM` lit `c.distance!` sur la parcelle principale, que `construireCandidats` pose toujours ; une principale reconstruite « minimale » (comme `ParcellePrincipale` l'autorise pour `trierVoisines`) donnerait `NaN`. | phase 7 |
| D-11 | P3 | `interaction/pointeur.ts` | `ContextePointeur.sendObjectBackward` est typé `(obj: ObjetPlan)` alors que `objByKey` peut rendre `undefined` si l'élément DOM survit à l'objet ; `reculerObjet` tolère `undefined` à l'exécution. `GlisserEnCours.startR` n'est lu nulle part. | phase 7 |
| D-12 | P3 | `ui/*.ts` | Les quatre fonctions surdimensionnées de la spec §6.4 — `ouvrirImportCadastre` (`cadastreDialog.ts`), `renderAttrTable` (`attrPanel.ts`), `renderTerrasseConfigurator` (`terrassePanels.ts`), `buildThreeScene` (`three/scene.ts`) — sont toujours monolithiques. Le découpage du configurateur en descripteurs de champs typés est le plus utile : il rend le panneau vérifié par le compilateur contre `Construction`. **Fait pour les deux panneaux le 22/09/2026 (`1.2.0-alpha.5`, étape 4 de la reconstruction) : `ui/champs/`, `CHAMPS_CONSTRUCTION` indexé par toutes les clés de `Construction`.** `ouvrirImportCadastre` a disparu le 27/09/2026 : l'import est un contrôleur (`app/importCadastre.ts`, cinq fonctions sous 150 lignes) et un composant (`zones/parcours/ImportCadastre.tsx`). Reste `buildThreeScene`. | phase 5 |
| D-14 | P3 | `ui/attrPanel.ts`, `three/scene.ts`, `render/parasolOverlay.ts` | Un parasol est reconnu par `fonction === 'parasol'` et lu comme un cercle (`enCercle`), alors que la liste des fonctions du panneau Objet permet de dire « parasol » d'un polygone : « Placer au mieux » et la Vue 3D planteraient sur `center` absent. Soit la liste refuse « parasol » hors cercle, soit ces lecteurs filtrent aussi sur `type`. Révélé par l'union discriminée. **Corrigé le 22/09/2026 (`1.2.0-alpha.7`) : la section Parasol, la Vue 3D et le calque des ombres filtrent sur `type === 'circle'`.** | alpha.17 |
| D-15 | **P1** | `three/navigation.ts`, `app/ecouteurs/vue3d.ts` | **Le rappel d'un point de vue ne déplaçait pas la caméra sur un plan sans terrasse.** Le geste commençait par chercher une terrasse et abandonnait sans, par un message qui en réclamait une — alors que la Vue 3D s'ouvre sur une parcelle nue et que « Enregistrer la vue » y crée des points de vue. Plan fabriquait donc des points de vue auxquels il refusait de revenir. Deux défauts voisins trouvés avec lui : le centre était **recalculé** sur cette terrasse au lieu d'être repris de la scène, alors que c'est ce centre-là qui a servi à enregistrer le point de vue ; et la liste déroulante ne se remplissait qu'à la construction de la scène, si bien qu'un point de vue tout juste créé n'y figurait pas. Trouvé par l'item 23 de la liste de fumée, le 23 septembre 2026, sur un plan importé par adresse — l'item passait en `1.2.0` parce qu'il y était joué sur le jeu de démonstration, qui a une terrasse. **Corrigé le 23/09/2026 : aucune terrasse n'est exigée, le centre vient de `scene.cen`, la clé de la scène sans terrasse est nommée une seule fois (`CLE_SANS_TERRASSE`), et la visionneuse GLB mesure depuis le centre parti avec le modèle.** | 2.0.0 |
| D-13 | P3 | `app/ecouteurs/exports.ts` | Défaut d'origine documenté sur place : l'URL d'un export est révoquée une seconde après le clic, donc le lien de secours qui la réutilise cesse de fonctionner passé ce délai. Corriger demande de révoquer les deux usages séparément. **Corrigé le 22/09/2026 (`1.2.0-alpha.7`) : le lien de secours disparaît, un toast dit le fichier qui part.** | 1.0.0 |
| D-17 | P2 | `app/ecouteurs/vue3d.ts` | **« Enregistrer la vue comme point de vue » crée un objet sans exiger `projects.write`** : la commande `3d.enregistrerPointDeVue` n'a pas de permission, alors qu'elle empile un instantané et ajoute un objet au plan. En lecture seule, elle modifie un plan qu'on ne peut pas enregistrer. Relevé par l'inventaire mobile (D7). | 2.0.2 |
| D-18 | P2 | `interaction/pointeur.ts` | **Un double toucher sur un autre élément du même objet le recule d'un plan sans vérifier la lecture seule**, alors que le double-clic de la souris la vérifie. Relevé par l'inventaire mobile (D9). | 2.0.2 |

## Fermés

| # | Fermé le | Comment |
|---|---|---|
| D-16 | 2026-09-27 | Les panneaux du tiroir sont des composants React (`zones/resultats/`) qui écrivent par un seul service, `app/resultats.ts` : `saisir` empile un instantané, écrit, marque le projet modifié et refait le chiffrage ; les cotes passent par `ecrireCotes`, qui fait de même. Vérifié au navigateur : un prix de vis saisi passe le statut à « modifié », Ctrl+Z rend la valeur d'avant. |
| D-3 | 2026-09-21 | `ObjetPlan = ObjetPolygone | ObjetChemin | ObjetCercle` (`model/types.ts`), quatre aides dans `model/formes.ts`, index retirés ; 258 assertions sur `pts`/`center`/`r` → 25, toutes hors de l'union. Journal : « Durcissement — ObjetPlan devient une union discriminée ». |
| D-1 | 2026-09-21 | `ensureConstruction` comble désormais les douze réglages que seule `defaultConstruction()` posait, avec la valeur que chaque lecture du moteur prenait déjà en leur absence ; l'essence reste « autre », le tarif que ces projets ont toujours eu. Test dans `tests/unit/engine/moteur.test.ts`. |
