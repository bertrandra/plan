# Façade : calage, texture et fenêtres, de l'audit au modèle — spec

*Rédigée le 29 octobre 2026, sur `main` à la version 4.0.0 (commit `e9113ac2`), à la suite d'une discussion avec le propriétaire ; mise à jour le
même jour (la silhouette dérive du toit ; les corrections se font sur le corps concerné ; une façade peut en porter plusieurs).
Aucun code n'accompagne ce document : il fixe l'intention, le modèle de données, le déroulé et les lots. Les noms de fonctions
cités existent ; le nom fait foi sur les numéros de ligne.*

Lire d'abord : `CLAUDE.md`, [`spec-facades-calage-detection.md`](spec-facades-calage-detection.md) (la chaîne de calage et de
détection, §5 à §14), [`spec-releve-facade.md`](spec-releve-facade.md), [`spec-audit.md`](spec-audit.md),
[`spec-flux-batiment.md`](spec-flux-batiment.md) (qui écrit quoi, `model/protections.ts`) et le skill `facades` (le banc).

---

## 1. Intention

À partir de ce que l'on sait déjà d'un bâtiment (le plan, l'IGN, le LiDAR), **une photo de façade doit servir à trois choses** :

1. **Vérifier les proportions** de la façade : sa largeur, son égout, la forme de son haut (pignon, croupe, appentis) ;
2. **Donner la texture** du mur, pour que la 3D soit jolie et vraie ;
3. **Poser les fenêtres telles qu'elles sont**, pas telles que la disposition automatique les devine.

La forme lue sur l'image sert aussi à **ajuster le toit** : un triangle est un pignon, un trapèze une croupe, une rampe un appentis. Tout ce
qui se lit sur la photo revient à l'audit, qui propose ; le moteur de règles tranche.

**Le fait qui structure toute la spec** : la silhouette d'une façade **n'est pas une donnée indépendante, elle est la projection du toit**
(`gabarit = hautDeLaFacade(corps)`). Un écart entre le gabarit calculé et ce que montre la photo est donc d'abord une information sur le
**toit** (un pignon manquant, un pan pris pour un pignon…), pas seulement une erreur de calage. L'IA apporte la forme de la façade, donc un
**ajustement du toit** ; elle découvre aussi d'autres éléments à placer (cheminées, lucarnes…).

### Décisions de la personne (à ne pas rediscuter)

1. **Les dimensions viennent du plan et du LiDAR, jamais de la photo.** L'IGN et le cadastre donnent la largeur des façades et la hauteur
   du faîtage ; le LiDAR donne la hauteur totale, la hauteur à l'égout, et de nouveau la largeur et le sol. La photo ne donne que des
   **proportions et des positions relatives** (c'est déjà la décision du dépôt : « les repères ne disent que les directions, la dimension
   vient du calage », `facade/gabaritMur.ts`).
2. **Deux chemins, en série, pas en concurrence.** Le **déterministe** (arêtes, teinte, points de fuite : ce que travaille la
   calibration) donne la géométrie fine. **L'IA** (la session de Claude de l'audit) donne le sens et des positions grossières : « ici
   un pignon », « la porte est à gauche de la fenêtre », « cette baie est cintrée ». Le LiDAR fixe les hauteurs.
3. **L'IA propose, le moteur tranche.** Une lecture de l'image n'écrit jamais un toit : elle devient une observation que le moteur de
   règles relit (`corpsSousContrainte`). La forme lue sur la photo l'emporte sur celle du LiDAR (décision du 19 octobre 2026), jamais
   les hauteurs.
4. **Les images de la calibration restent**, pour rejouer les scénarios.
5. **La calibration rejoue chaque scénario avec une illustration de chaque étape, déterministe et IA.** Elle devient l'écran où l'on
   voit pourquoi un calage a réussi ou échoué.
6. **Les photos se prennent et se rangent dans l'audit.** La calibration lit les façades de l'audit et en fait des cas ; elle ne prend
   plus de photos pour elle.
7. **La Façade stocke** : ses **dimensions**, sa **forme** (gabarit et silhouette lue) et sa **texture** (l'image **calée** sur le mur).
8. **Les fenêtres hors automatique sont dans la façade objet** : celles qui viennent de la photo, de Claude ou de la main. Les
   fenêtres automatiques ne sont pas stockées : la 3D les recalcule.
9. **La silhouette dérive du toit ; son écart avec la photo est un diagnostic de toit.** On cale le mur sur ce qui ne dépend pas du
   toit (angles, égout, sol), puis on compare la silhouette lue au gabarit : ce qui reste est une proposition de toit (§5 bis).
10. **Toute proposition de toit venue de la photo est confirmée par la personne**, tant que le corpus réel compte moins d'une vingtaine
    de cas validés. Rien ne s'applique seul, même quand les deux chemins s'accordent.
11. **Périmètre des éléments découverts, au départ** : pignon, appentis, cheminée, lucarne. Le reste du catalogue (fenêtre de toit,
    galerie, bow-window…) viendra quand ces quatre-là tiennent.
12. **Hauteurs : le LiDAR l'emporte, la photo signale.** Quand la photo contredit le LiDAR sur la hauteur d'une pointe, on garde le LiDAR
    et on le dit (alerte) ; la correction de hauteur reste un geste de la personne (poignée « hauteur à l'égout », « Rendre au calcul »).
13. **Les corrections de toit se font sur le corps concerné, et une façade peut en inclure plusieurs.** Un diagnostic est rattaché au
    corps dont le mur porte la partie de silhouette en cause ; une proposition s'écrit dans le repère de ce corps (§5 ter).
14. Textes de l'interface en français avec accents et vouvoiement ; commentaires de code en français sans accents, qui disent pourquoi.

---

## 2. Ce qui existe déjà (relevé du 29 octobre 2026)

| Brique | Où | Ce qu'elle fait |
|---|---|---|
| Audit de la parcelle | `model/auditParcelle.ts` (`FacadeCapturee`, `BatimentCapture`), `app/audit/parcelle/` | Les photos par côté du contour (`facades[rang].photos`), les corrections de redressement, le bilan du redressement et de la fusion |
| Chaîne unique | `facade/releve/chaine.ts`, `facade/analyseMur.ts::analyserLeMur`, `fondreLesVues` | Une photo ou plusieurs : redressement, assemblage, mur, détection, texture. Le même code pour l'audit, le relevé et la calibration |
| Calage du mur | `facade/releve/coinsAuto.ts::murSurLAssemblage`, `vision/mosaiqueFuites.ts` (`rectangleSurLesAretes`, `rectangleDuMur`, `affinerEgoutEtSol`, `silhouetteDuMur`) | Les bouts, l'égout et le sol sur l'assemblage, par les arêtes puis par la teinte du mur |
| Gabarit | `facade/gabaritMur.ts` (`hautDeLaFacade`, `gabaritDesCorps`, `gabaritSurLaVue`) | Le haut de toute la façade vue de dehors, tous corps compris, en parts de la largeur (`u`) et de l'égout (`v`) |
| Silhouette → toit | `model/silhouetteFacade.ts`, `facade/regles/toits/silhouettes.ts`, `silhouetteDesCorps.ts` | `triangle`, `trapeze`, `rampe`, `ligne-droite`, `marches`, `plusieurs-sommets` ; lue sur la photo (par Claude ou par `classerProfil`), relue en observation par le moteur |
| Façade relevée | `model/typesReleve.ts::ReleveFacade`, `OuvertureFacade` | `largeur`, `hauteur`, `texture` (JPEG redressé), `photoLocale`, `hauteurTexture`, `ouvertures`, `calage`, `grille`, `depuisAudit` |
| Fenêtres automatiques | `facade/ouvertures.ts::ouverturesAutomatiques`, `three/detailsBatiment.ts::poserOuvertures` | Recalculées à chaque dessin ; un mur relevé n'en reçoit pas |
| IA | `model/analyseClaude.ts` (`FacadeAnalyse`, `FacadeVotee`), `deploy/schema-analyse.json` (**généré**), `facade/detection/renfort.ts` | Boîtes, coins, silhouette, bout ; trois passes votées, recalées sur l'image |
| Calibration | `zones/EditeurCasCalibration.tsx`, `zones/CalageSilhouette.tsx`, `zones/VueFacade3d.tsx`, `facade/releve/casCalibration.ts`, `facade/corpusReel.ts` | Un cas = une façade photographiée et annotée ; neuf images d'étapes ; calage de la silhouette (étapes 5 et 6) |
| Banc | `.claude/skills/facades/scripts/` (`banc.ts`, `egout-sol.ts`, `reel.ts`), `tests/fixtures/facades/` (23 scènes de synthèse), `tests/fixtures/facades-reel/` (**vide**) | Mesure la chaîne scène par scène |

**Mesures de départ** (banc de synthèse, `egout-sol.ts`, 29 octobre 2026) : égout trouvé 44/44, sol 43/44, bouts 86/88, gabarit posé à
2 % de la largeur 39/44. Ce banc ne contient aucune façade réelle.

### Le défaut qui motive cette spec (façade sud d'AE 101)

La façade sud d'AE 101 a deux pignons et un appentis (fixture `tests/fixtures/toits/vesinet-ae101.json`, corps `corpsAvecFaits`) : largeur
8,96 m, égout de l'appentis à 2,4 m, rapport hauteur/largeur 0,268, gabarit à deux pointes autour de `u` = 0,11 et 0,80, à environ 3,2 fois
l'égout. Sur la mosaïque réelle de cette façade, le calage automatique retient **un mur de 302 px (x de 451 à 752)** au lieu d'environ 610 px
(x de 140 à 750) : un seul bloc de pignon. Les bouts, l'égout et le sol sont faux ensemble, **et les drapeaux « trouvé » restent vrais**.
Causes : le haut de l'image ne se lit pas à la teinte (enduit, ciel et nuages presque neutres ; colombages verts, rives sombres, ardoise du
porche, arbre) ; le rectangle des arêtes s'arrête sur un bloc ; rien ne vérifie que la pose explique la silhouette de l'image. Un essai
d'ajustement du gabarit sur le haut lu à la teinte a échoué pour la première raison (il a remplacé une mauvaise pose par une autre) : il
a été abandonné, pas livré.

---

## 3. Modèle cible

### 3.1 Qui sait quoi, et qui l'emporte

| Donnée | Source qui fait foi | La photo peut… | Marque |
|---|---|---|---|
| Largeur du mur | cadastre / LiDAR (le contour) | jamais la changer ; vérifier | — |
| Hauteur à l'égout, hauteur totale, sol | LiDAR (`egoutChoisi` si la personne l'a fixée) | jamais les changer ; signaler un écart | `batiment.egoutChoisi` |
| Forme du haut (pignon, croupe, rampe) | le **toit** (corps, moteur de règles) ; la photo le **diagnostique** | proposer un ajustement, par corps ; la personne confirme, le moteur décide | observation du moteur |
| Texture | photo calée | la fournir | `texture`, `depuisAudit` |
| Ouvertures | photo (détection, Claude, main) | les fournir | `source` de chaque ouverture |
| Ouvertures automatiques | disposition automatique | — | rien (recalculées) |

La règle de priorité entre écrivains reste celle de `model/protections.ts` (« Qui l'emporte », `spec-flux-batiment.md`). Les nouveaux
champs s'y inscrivent comme **groupes** : `facade.dimensions`, `facade.forme`, `facade.texture`, `facade.ouvertures`, chacun avec ses
écrivains (`audit`, `releve`, `main`, `calibration`) et son niveau. Aucun écrivain ne lit les marques à la main.

### 3.2 La Façade (un enregistrement par côté du contour)

La Façade **est** `ReleveFacade` (`batiment.facades[]`, par `cote`), étendue : on n'ajoute pas un second objet. Tous les ajouts sont
**facultatifs** ; un projet d'aujourd'hui garde son sens (relecture à l'identique, test d'aller-retour de fichier ancien).

```ts
interface ReleveFacade {
  // inchange : cote, largeur, hauteur, texture, photoLocale, hauteurTexture, ouvertures, distance, sourceDistance,
  // releveLe, depuisAudit, partieBasse, calage, grille

  /** Les dimensions retenues, et d'ou elles viennent. La photo n'en change aucune : elle les verifie. */
  dimensions?: {
    largeurM: number;                 // le mur (cadastre, LiDAR)
    egoutM: number;                   // hauteur a l'egout de reference (LiDAR, ou choisie)
    faitageM?: number;                // le point haut de la facade (LiDAR / IGN)
    source: 'cadastre' | 'lidar' | 'ign' | 'saisie';
    /** L'ecart que la photo constate (en part), 0 quand elle confirme. Une alerte au-dela de 0,10, jamais une correction. */
    ecartPhoto?: { largeur?: number; egout?: number };
  };

  /** La forme de la facade : le gabarit du plan et du LiDAR, et ce que la photo en lit. */
  forme?: {
    gabarit: { u: number; v: number }[];          // facade/gabaritMur.ts : u en part de la largeur, v en part de l'egout
    silhouetteLue?: SilhouetteFacade;             // model/silhouetteFacade.ts, lue sur la photo
    bout?: BoutVu;                                // pignon, croupe, demi-croupe, brisis, sans-objet
    pointes?: { u: number; v: number; source: 'ia' | 'deterministe' | 'doigt' }[];   // les sommets lus (pignons)
    /** Les corps que la facade porte, de gauche a droite : chacun avec la part du mur (u0 a u1) qu'il couvre (§5 ter). */
    corps?: { mur: { gauche: PtBrut; droite: PtBrut }; u0: number; u1: number }[];
    source: 'plan' | 'photo' | 'ia' | 'doigt';
  };

  /** La texture : l'image calee sur le mur. */
  textureCalee?: {
    pxParM: number;                   // la precision reelle de l'image
    cadre: { x0: number; y0: number; x1: number; y1: number };   // le mur sur l'assemblage, en pixels
    coinsPhotos: P2[][];              // les coins du mur sur chaque photo (calage, `sourceCoins` par point)
    sansOmbres?: boolean;
  };
}
```

Les **diagnostics et propositions de toit** (§5 bis) ne sont pas rangés dans la Façade : ce sont des propositions de l'audit
(`PropositionsAudit`, avant/après), qui n'écrivent le toit que par le moteur, après confirmation. La Façade ne garde que ce qui a été
validé (`forme`, `pointes`).

`texture` (le JPEG) et `photoLocale` ne changent pas de sens : la plateforme refuse les photos embarquées, le document n'en porte que la
clé et la texture redressée. `textureCalee` dit **comment** cette texture est posée sur le mur ; elle ne duplique pas l'image.

### 3.3 La façade objet (les fenêtres hors automatique)

**Une ouverture hors automatique est un objet de la façade** : elle a sa vie propre (retirer, déplacer, verrouiller), un identifiant
stable et une provenance. Les ouvertures automatiques n'y sont pas.

```ts
interface OuvertureFacade {
  // inchange : type, x, y, l, h (metres, x depuis la gauche du mur vu de dehors, y = appui)
  id: string;                               // stable : une correction retrouve son ouverture apres un rejeu
  source: 'detectee' | 'devinee' | 'claude' | 'ajoutee' | 'corrigee';   // jamais 'auto' : l'auto n'est pas stockee
  confiance?: number;
  niveau?: number; travee?: number;
  details?: { volets?: …; ferme?: boolean; allege?: …; forme?: 'rect' | 'cintre' | 'rond' };
  verifieeLe?: string;                      // posee par la personne : plus aucun rejeu ne la deplace
}
```

- **Règle de la 3D** (déjà en place, à garder) : un mur qui a une façade objet n'a **pas** de fenêtres automatiques ; un mur sans façade
  objet garde la disposition automatique.
- **Un rejeu ne détruit pas le travail de la personne** : les ouvertures `corrigee`, `ajoutee` ou `verifieeLe` sont gardées et appariées
  aux nouvelles détections par recouvrement (> 50 %, comme le banc) ; les autres sont remplacées.
- **Où elles apparaissent** : l'inspecteur (liste de la façade, par niveau et travée), la 3D (`three/detailsBatiment.ts`), le plan
  (coupures du trait, `render/releve.ts`), la DP2 et les exports qui lisent déjà `ouvertures`.

### 3.4 Fichier, migration, version

- Champs facultatifs, validés à la lecture (`model/typesReleve` + validateurs voisins de `corpsToitEtendu.ts`), compactés à l'écriture
  (un champ absent reste absent), relus à l'identique pour un fichier ancien.
- Un **schéma** du fichier : les nouveaux champs s'écrivent au schéma suivant (`model/migrations.ts`, `CHAMPS_DEPUIS`) ; un projet qui
  n'en porte aucun reste au plus petit schéma qui le décrit.
- **Version** : une modification qui change ce que la 3D montre d'un bâtiment relevé est un événement de version majeure
  (`MD/RELEASE.md`). La seule empreinte golden qui voit les fenêtres est `glb-structure.json` (point 24 de la fumée) ; un lot qui la fait
  bouger le dit et le documente dans `EMPREINTES.md`.

---

## 4. Le déroulé, étape par étape

Chaque étape dit ce qui entre, ce que fait chaque chemin, qui arbitre, ce qui sort, et **l'illustration que la calibration en montre**.

### É0 · Préparation (plan + LiDAR)

- **Entrée** : le contour, les corps du toit, les hauteurs.
- **Sortie** : pour chaque côté, `dimensions`, `forme.gabarit` (`gabaritDesCorps`), le rapport hauteur/largeur, la liste des pointes attendues
  (leurs `u` et `v`).
- **Illustration** : le gabarit seul, en mètres, avec ses cotes et ses pointes numérotées.

### É1 · Prises (audit)

- Les photos se prennent et se rangent **dans l'audit**, par côté du contour (`BatimentCapture.facades[rang].photos`). Voir §6.
- **Sortie** : `PhotoCas` + prise (position, cap, attitude, focale), photos gardées sur l'appareil (`io/photosLocales.ts`).

### É2 · Redressement

- **Déterministe** : par les repères posés, sinon par les points de fuite (`vuesDeFace`, `redresserParFuites`).
- **IA** : néant (la géométrie n'est pas son travail).
- **Illustration** : chaque photo redressée, avec ses verticales et ses horizontales.

### É3 · Assemblage

- **Déterministe** : mosaïque ORB + RANSAC de similitude (`mosaiqueDesVues`), image prise pour tout le reste.
- **Illustration** : l'assemblage, le masque `vu`, les photos restées à part avec leur motif.

### É4 · Calage du mur (bouts, égout, sol) — l'étape à gagner

C'est le maillon faible : tout le reste en dépend. **On cale d'abord sur ce qui ne dépend pas du toit** : les deux angles du mur, la ligne
d'égout et le sol. Le gabarit vient du toit calculé, qui est peut-être faux ; s'en servir pour caler fausse le calage et masque l'écart que
l'on cherche à voir (§5 bis). Il ne sert qu'ensuite, à lire la silhouette.

- **Déterministe** (existant) : le rectangle des arêtes aux proportions du plan, affiné par la teinte du mur. Le gabarit ne **pose** plus
  le mur : il n'est posé qu'une fois le mur trouvé. Il produit une pose **et un score d'explication** (§5), calculé sur les ancres
  indépendantes du toit.
- **IA** (nouveau) : Claude lit l'assemblage et rend **quelques points, en parts du mur**, pas en pixels :
  - les deux **angles du mur** (gauche, droit), au niveau du sol et de l'égout si visibles ;
  - la **pointe de chaque pignon** (position horizontale, hauteur relative) ;
  - le **départ et la fin de l'appentis** ou du porche s'il y en a un ;
  - une **confiance** par point, et ce qui est caché (arbre, haie, voiture).
  Les **angles** donnent l'échelle et la place du mur ; les **pointes** servent ensuite de **mesure du toit** (§5 bis), pas d'ancre :
  quand le gabarit a des pointes à des `u` connus et que l'IA en voit aux mêmes places, c'est une confirmation indépendante de la pose ;
  quand elles divergent, c'est un diagnostic de toit.
- **Arbitre** : voir §5. Le déterministe **vérifie** la pose proposée par l'IA sur les arêtes (verticales aux angles, horizontale à
  l'égout, transition mur/sol) et la **corrige au pixel** ; si les deux s'accordent, on garde le meilleur score ; sinon la personne
  confirme un ou deux points d'un geste.
- **Sortie** : `x0`, `x1`, `égout`, `sol` sur l'assemblage, `forme.pointes`, la source de chaque point.
- **Illustration** : trois calques sur l'assemblage, activables : la pose déterministe (rouge), les points de l'IA (bleu), la pose retenue
  (vert), avec le score de chacune et l'écart entre elles en pourcentage de la largeur.

### É5 · Silhouette lue, par corps

- **Déterministe** : `silhouetteDuMur`, `classerProfil` : le haut du mur lu entre les bouts retenus (deux rampes, un triangle, des marches),
  **découpé selon les corps que la façade porte** (§5 ter) : chaque partie de la silhouette est rattachée au corps dont le mur la porte.
- **IA** : le mot (`silhouette`, `bout` du schéma d'analyse) par côté, et les `pointes` par corps quand elle les voit.
- **Sortie** : `forme.silhouetteLue`, `forme.bout`, `forme.corps` (la part du mur de chaque corps), `forme.pointes` ; **aucune
  observation n'est encore émise** : l'étape suivante compare à la silhouette du gabarit.
- **Illustration** : le haut lu sur l'image, le gabarit posé par-dessus, les corps en couleurs distinctes, le mot retenu par corps et sa
  provenance.

### É5 bis · Diagnostic de forme (nouveau)

- **Entrée** : la silhouette lue (É5) et le gabarit calculé (É0), posés sur le mur calé par les ancres seules (É4).
- **Traitement** : l'écart entre les deux, **corps par corps**, rangé dans la taxonomie du §5 bis. On teste un petit nombre de variantes de
  toit du corps (un pignon de plus, un de moins, un pan à la place, une croupe) et l'on garde celles qui expliquent mieux l'image que le
  toit calculé, avec le gain de chacune.
- **Sortie** : une liste de **propositions de toit**, chacune avec son corps, sa nature, sa place (en parts du mur du corps), son gain
  d'explication, sa provenance (déterministe, IA, les deux), et des **alertes** (hauteur de pointe qui contredit le LiDAR).
- **Illustration** : la silhouette de l'image, le gabarit calculé, et pour chaque proposition le gabarit **modifié**, avec le gain en
  pourcentage ; les alertes en marge.

### É6 · Texture

- **Déterministe** : l'élévation calée sur le mur (`pxParM`), la fusion des vues (vote des baies, occultations, meilleure vue par pixel),
  la version sans ombres (`vision/sansOmbres.ts`).
- **Sortie** : `texture`, `textureCalee`, `hauteurTexture` (la bande au-dessus de l'égout, que la 3D plaque sur le pignon).
- **Illustration** : l'image calée sur la silhouette ; la même sans ombres ; la façade en 3D vue de face (`VueFacade3d`).

### É7 · Ouvertures

- **Déterministe** : candidats, classement, structure (grille niveaux × travées), détails (volets, allège, forme).
- **IA** (renfort existant, `facade/detection/renfort.ts`) : trois passes votées ajoutent, retirent, nomment ; leurs boîtes sont recalées sur
  l'image.
- **Arbitre** : le vote ; une baie que plusieurs vues voient et que peu retrouvent perd de la confiance ; une ouverture de la personne
  n'est jamais déplacée.
- **Sortie** : les ouvertures de la **façade objet** (§3.3), avec leur `source` et leur `confiance`.
- **Illustration** : l'image avec les boîtes (trait plein : détectées ; tirets : devinées ; couleur par source).

### É8 · Toit (par le moteur, sur le corps concerné, après confirmation)

- **Entrée** : les propositions confirmées de l'É5 bis, chacune sur **un corps** ; les éléments de toit lus (cheminée, lucarne).
- **Confirmation** : **toujours demandée à la personne** (décision 10), dans l'avant/après de l'audit : chaque proposition est une ligne
  décochée par défaut, avec son image avant/après et son gain.
- **Sortie** : une **observation** du moteur par proposition, **adressée au corps** par son mur (`facade/regles/toits/murDuCorps.ts`, qui
  retrouve le corps dont un côté longe le mur donné : le rang d'un corps change à chaque relecture, son mur non). `corpsSousContrainte`
  la relit comme tout fait. Les pignons que posent aujourd'hui les faits ne vont que sur le **corps principal**
  (`facade/regles/toits/pignons.ts`) : **il faut les étendre à n'importe quel corps** (§5 ter).
- **Hauteurs** : celles du LiDAR (décision 12) ; une alerte les signale, la personne les règle à la main si besoin.
- **Illustration** : le toit avant et après l'observation (le rendu de l'avant/après de l'admin), le corps concerné en évidence.

### É9 · Validation

- La personne valide la façade (ou la corrige) dans l'audit ; la validation écrit `dimensions`, `forme`, `texture`, `textureCalee`, la
  façade objet, en **une étape d'historique** (comme la validation du Mode Toit). Annuler la défait d'un coup.

---

## 5. Arbitrer le déterministe et l'IA

Principe : **l'IA propose le sens, le déterministe prouve la géométrie, la personne tranche en dernier recours.**

1. **Chaque chemin rend sa pose et un score d'explication, calculé sans le toit.** Pour le calage du mur : la couverture des deux angles
   par des verticales, de l'égout par une horizontale, la transition mur/sol, et la plausibilité des proportions (rapport du plan à 30 %
   près). Le gabarit n'entre pas dans ce score : il vient du toit, qui est ce que l'on met en question (§5 bis).
   **Le haut de l'image** (par le ciel quand il est bleu, par la matière du mur sinon) sert ensuite à comparer des **variantes de toit** :
   un gabarit à pointes doit expliquer ce haut au moins deux fois mieux qu'une ligne droite, sinon rien ne dit qu'il y a des pointes.
2. **Les deux s'accordent** (écart des bouts et de l'égout sous 3 % de la largeur) : on garde la pose au meilleur score, corrigée au pixel
   par les arêtes.
3. **Elles divergent** : on garde celle qui **explique le mieux** si son score passe le seuil, et on **demande un geste** sinon : la
   silhouette posée, deux ou trois poignées claires (les angles, les pointes), un seul bouton « Valider ». Jamais de formulaire.
4. **Aucune des deux ne passe le seuil** : la pose reste celle du plan seul (largeur du contour, hauteur du LiDAR, centrée), dite
   **supposée** ; la façade n'est pas validée tant que la personne n'a pas posé au moins les deux angles.
5. **Les drapeaux disent la vérité** : `egout`, `pied`, `cotes` ne valent « trouvé » que si la pose a passé le test d'explication. (Sur
   AE 101 aujourd'hui, ils étaient vrais pour une pose fausse.)
6. **Les seuils sont des réglages**, pas du code (`regles/facades/reglages.json`), un seuil par PR, justifié par des cas (`cas`), jamais
   par une seule image. On ne règle rien sur moins d'une vingtaine de cas validés.

**Coordonnées de l'IA** : toujours en **parts du mur** (`u` le long de la largeur, `v` en part de l'égout), jamais en pixels de la
photo : elles ne dépendent ni de la résolution ni du redressement, et se comparent directement au gabarit. Le calage les ramène en pixels.

---

## 5 bis. La silhouette dérive du toit : le diagnostic de forme

Le gabarit d'une façade est calculé à partir des corps (`gabaritDesCorps`) ; la silhouette lue sur la photo est ce que le toit **réel** y
dessine. Quand le mur est calé par ses ancres (angles, égout, sol), leur écart est un **diagnostic du toit calculé**. Chaque écart se range
dans une taxonomie ; chaque case est une proposition, **sur le corps concerné** (§5 ter), jamais une écriture.

| La photo montre… | …là où le gabarit a… | Proposition sur le corps | Éléments (périmètre initial) |
|---|---|---|---|
| un triangle | une ligne plate | **ajouter un pignon** (place, largeur, hauteur relative) | pignon |
| une ligne plate ou une rampe | un triangle | **retirer le pignon**, ou le remplacer par un pan | pignon |
| un triangle | un trapèze (croupe) | croupe → pignon | pignon |
| un trapèze | un triangle | pignon → croupe | pignon |
| une rampe | un deux-pans | un **appentis** (un seul pan) | appentis |
| une marche | un seul niveau | un **second corps** (aile, appentis) | appentis |
| un pignon plus étroit, plus large, décalé | un pignon ailleurs | **déplacer ou redimensionner** le pignon | pignon |
| une bosse étroite sur la ligne du haut | rien | une **cheminée** ou une **lucarne** | cheminée, lucarne |
| une pointe plus haute ou plus basse | la même pointe, une autre hauteur | **aucune** : on garde le LiDAR et on **signale** | — |

Règles :

1. **Une proposition n'existe que si elle explique mieux l'image que le toit calculé** (gain d'explication au-dessus d'un seuil, §5.6), et
   si le déterministe ne dit pas « non » (une arête qu'il voit contredit la variante).
2. **Pan ou pignon** : à un bout du faîtage, un triangle de la couleur du mur est un pignon ; un trapèze (croupe) ou une rampe n'en est pas
   un. Le moteur sait déjà lire ces mots (`silhouettes.ts` : sens du faîtage, bouts) ; la proposition réutilise **ses observations**, elle
   n'invente pas de vocabulaire.
3. **Une proposition modifie un toit calculé, pas un toit fait à la main** : si le bâtiment est `toitFige` ou retouché à la main, la
   proposition est **décochée** et dit ce qu'elle remplacerait (le comportement de l'audit, `spec-flux-batiment.md`).
4. **La boucle ne tourne qu'une fois par validation** : une fois le toit modifié, le gabarit est recalculé et le diagnostic se rejoue sur
   la même pose ; une proposition acceptée ne peut pas en rappeler une autre en cascade sans nouvelle confirmation.
5. **L'IA peut inventer un pignon** que le toit n'a pas (un colombage en triangle, un arbre) : sa proposition vaut ce que le
   déterministe confirme sur l'image ; seule, elle reste proposée, décochée.

## 5 ter. Une façade, plusieurs corps

Une façade du contour (un côté de `pts`) n'est pas un corps : elle peut longer le mur du **corps principal**, celui d'une **aile**, d'un
**appentis**, d'un **bow-window** ou d'une **galerie**, à des profondeurs différentes. Le gabarit, lui, est le haut de **tous** les corps,
le plus haut l'emportant (`hautDeLaFacade`). Pour corriger un toit, il faut savoir **à quel corps appartient chaque partie de la
silhouette**.

- **Découpage de la façade en tronçons de corps.** Pour chaque abscisse `u` du mur, on garde le corps qui porte le haut visible : celui dont
  le mur est le plus proche, ou le plus haut s'il est derrière un plus bas (un pignon d'un corps en retrait se voit au-dessus d'un appentis
  devant). Le résultat est la liste `forme.corps` (§3.2) : pour chaque corps, son mur sur la façade (`gauche`, `droite`) et la part
  `u0` à `u1` qu'il couvre.
- **Repère de la correction.** Une proposition porte le corps, par le **mur de ce corps sur la façade** (`murDuCorps(corps, gauche, droite)`
  le retrouve, quelle que soit la renumérotation des corps) ; sa place est ramenée dans le repère du corps : `s` le long de son faîtage
  depuis `pts[0]`, pan 0 ou 1 (le côté du mur regardé). C'est le repère de `PignonToit` (`pan`, `debut`, `fin`, `faitage`), de `Lucarne`
  et de `Cheminee`, que le Mode Toit sait déjà poser.
- **Silhouette d'un seul corps** : `facade/regles/toits/silhouetteDesCorps.ts` lit déjà le haut du mur **d'un seul corps**, celui qui le
  porte ; il sert au diagnostic par corps. `gabaritMur.ts::hautDeLaFacade`, qui montre toute la façade, sert à caler et à illustrer.
  Les deux ne se fondent pas (leurs verdicts changeraient : `silhouetteDesCorps.ts` le dit).
- **Ce qui est à étendre** : les pignons que posent les faits ne vont aujourd'hui que sur le corps principal
  (`facade/regles/toits/pignons.ts`, `pignonsAuxBouts`) ; il faut les adresser à n'importe quel corps, par son mur. Même chose pour les
  lucarnes et les cheminées lues.
- **Un diagnostic ne traverse pas deux corps** : une pointe n'est jamais « à cheval » ; si une marche tombe à la frontière de deux corps,
  la proposition est un second corps, pas un déplacement de pignon.
- **Illustration** : chaque corps en couleur sur la silhouette et sur la 3D ; la proposition se montre sur le corps concerné seulement.

## 5 quater. Les éléments que l'IA découvre

L'IA ne se limite pas à la forme du haut : elle voit des choses à placer. Chacune a **un seul endroit où atterrir**.

| Ce qu'elle voit | Atterrit dans | Par où | Périmètre |
|---|---|---|---|
| un pignon, un appentis | le **toit** du corps concerné | observation du moteur, après confirmation (§5 bis) | **initial** |
| une cheminée | le toit du corps (`Cheminee`) | observation / élément posé | **initial** |
| une lucarne, un chien-assis | le toit du corps (`Lucarne`) | observation / élément posé | **initial** |
| une fenêtre de toit, un panneau solaire | le toit du corps (`ElementDeToit`) | idem | plus tard |
| une galerie, un bow-window | le toit (une `saillie` du corps) | idem | plus tard |
| baies, portes, portes-fenêtres, garage | la **façade objet** (§3.3) | ouvertures `source: 'claude'` | existant |
| volets, allège, balcon, garde-corps, forme (cintre, rond) | `details` d'une ouverture de la façade objet | existant | existant |
| soubassement, bandeaux, colombages, parement | la **texture** (et le profil de la façade) | pas d'objet : c'est de l'image | existant |

Règles : **un seul endroit** (une cheminée n'est jamais à la fois dans la façade objet et dans le toit) ; **la personne confirme** tout ce
qui va dans le toit ; **les éléments posés à la main** (Mode Toit, `toitFige`) **ne sont jamais déplacés** par un rejeu.

---

## 6. L'audit : où vont les photos

- **Ce qui bouge** : la prise des photos de façade, leur redressement, leur assemblage et leur rangement vivent **dans l'audit**
  (`app/audit/parcelle/`, écrans de la parcelle). Le relevé de façade (`zones/Releve.tsx`) devient un **éditeur** de la façade déjà
  auditée (corriger le mur, les ouvertures), plus un second chemin de capture.
- **Ce qui ne bouge pas** : la chaîne (`analyserLeMur`) est la même ; l'écran de calibration ne prend plus de photos.
- **Stockage** : les photos restent sur l'appareil (`photoLocale`) ; le document porte la clé, la texture redressée, `textureCalee`. Une
  photo est une donnée personnelle : on ne copie dans le dépôt (corpus de calibration) que celles que l'on peut y conserver.
- **Migration** : `FacadeCapturee` (photos, corrections, `inaccessible`) ne change pas ; `ReleveFacade.depuisAudit` garde son sens. Un
  projet qui a des façades relevées sans audit les garde telles quelles ; elles se rejouent depuis leur photo locale quand elle est là.
- **Parcours** : l'audit propose les côtés du contour, la personne choisit un côté (la vue de prise existante, élévation devant la
  façade), prend une à huit photos du mur entier, l'assemblage et la pose s'affichent, la personne valide (§4 É9).
- **Aucun écran n'est supprimé d'un coup** : le relevé garde son entrée tant que l'audit ne l'a pas remplacé (lot F6).

---

## 7. La calibration : rejouer chaque scénario, étape par étape

**Rôle** : un outil de développeur (Admin › Calibrer la détection), qui rejoue des cas et montre **chaque étape, pour le déterministe et
pour l'IA**, avec la mesure contre la vérité. On y règle les seuils sur des cas validés.

### 7.1 Les cas

- Un **cas** = une façade photographiée et annotée (`facade/corpusReel.ts::CasStocke`) : photos, dimensions réelles, gabarit, calage vrai
  (les quatre coins), ouvertures vraies, statut (`brouillon`, `valide`), `difficultes`.
- **Naissance d'un cas** : depuis une **façade de l'audit** (« Créer un cas depuis cette façade »), qui reprend les photos, les
  dimensions et le gabarit, comme le fait déjà « depuis un bâtiment d'un projet ». Les images sont **gardées** : c'est ce qui permet de
  rejouer.
- **Le premier cas à poser** : la façade sud d'AE 101 (deux pignons et l'appentis), avec ses photos, sa largeur 8,96 m, son égout 2,4 m,
  son gabarit et les quatre coins vrais posés à la main. Elle sert d'étalon pour l'É4.
- **Le cas porte aussi la vraie forme du toit, corps par corps** (pignons : pan, début, fin, hauteur ; appentis ; cheminées ; lucarnes),
  relue sur la photo par la personne : c'est la vérité du diagnostic (É5 bis) et de l'É8. Sans elle, on mesure le calage mais pas ce que le
  toit gagne ou perd. La façade sud d'AE 101 la donne : deux pignons (3,7 m au faîtage, `faits.json`) et l'appentis.

### 7.2 Rejouer

- Un bouton **« Rejouer »** exécute É2 à É8 dans **deux modes** :
  - **déterministe** : la chaîne seule ;
  - **IA** : avec les réponses de Claude **enregistrées** pour ce cas (comme `tests/fixtures/facades/claude/` pour le banc), donc sans
    appel réseau ni coût ; un second bouton **« Rappeler Claude »** refait l'appel, en disant son coût, et enregistre la nouvelle réponse
    à côté de l'ancienne (jamais en l'écrasant).
- Un rejeu est **reproductible** : mêmes photos, mêmes réponses enregistrées, mêmes seuils, même résultat. La version de la chaîne et
  celle des réglages sont inscrites dans le résultat.

### 7.3 Ce que l'écran montre

Une **frise d'étapes** (É2 à É8), chacune avec sa vignette ; toucher une étape l'ouvre en grand avec ses **calques** :

| Étape | Vignette | Calques (déterministe / IA / retenu) | Mesure contre la vérité |
|---|---|---|---|
| É2 Redressement | la photo redressée | verticales, horizontales | écart des coins (cm sur le mur) |
| É3 Assemblage | la mosaïque | photos assemblées, à part (motif) | recouvrement, échelle, rotation |
| É4 Calage | le mur posé | pose des arêtes, points de l'IA, pose retenue | écart de chaque bout/égout/sol en % de la largeur ; score d'explication |
| É5 Silhouette | le haut lu, par corps | silhouette lue, gabarit, corps en couleurs, mot | mot juste / faux, corps bien attribués |
| É5 bis Diagnostic | l'écart gabarit / image | propositions de toit (gabarit modifié), gain, alertes de hauteur | propositions justes / fausses / manquées, contre la vraie forme du toit |
| É6 Texture | l'image calée | avec et sans ombres, 3D de face | écart de teinte, liserés |
| É7 Ouvertures | les boîtes | détectées, devinées, IA, retirées | VP, FP, FN, cotes médianes |
| É8 Toit | avant / après, sur le corps concerné | observation, forme obtenue | forme du toit juste / fausse par corps ; hauteurs inchangées |

Les mesures du cas alimentent un **tableau** (cas × étape × chemin) que l'on colle dans une PR, comme le banc de synthèse.

### 7.4 Le corpus réel

- `tests/fixtures/facades-reel/` reçoit les cas validés (aujourd'hui vide). Un cas non validé n'y compte pas.
- Objectif de variété : brique, enduit, pierre, colombages, pignons, appentis et porche, haie ou voiture devant, ton sur ton, grand-angle.
- **Aucun seuil ne se règle sur moins d'une vingtaine de cas validés** ; d'ici là, les chiffres du banc de synthèse restent le garde-fou
  (ils ne doivent pas baisser).

---

## 8. Contrat avec l'IA (la session de l'audit)

- **Où** : le sujet « façades » de l'audit (`app/regles/sujets/facades.ts`) et le schéma d'analyse. Le prompt et le schéma sont
  **générés** : `npm run regles:generer`, jamais à la main ; un texte changé monte la version dans `versions.ts`.
- **Ce que Claude doit rendre en plus, par côté** (champ `calage`) :
  - `angles` : gauche et droite, en `u` (0 à 1 sur l'image assemblée) ;
  - `pointes` : pour chaque pignon vu, `u` et `v` (hauteur relative à l'égout, à 10 % près), ou `absent` ;
  - `appentis` : début et fin en `u`, s'il y en a un ;
  - `corps` : pour chaque partie de la silhouette qui lui paraît d'un autre volume (un retrait, une aile, un appentis), son début et sa
    fin en `u` — une **aide** au découpage par corps du §5 ter, que le déterministe tient pour une hypothèse, pas pour une vérité ;
  - `elements` : cheminées et lucarnes vues sur la ligne du haut, avec leur `u` (périmètre initial, §5 quater) ;
  - `cache` : ce qui masque (arbre, haie, voiture) et où ;
  - `confiance` par élément.
  Les coordonnées sont celles de **l'image prise pour la suite** (l'assemblage), normalisées : l'IA ne voit ni les pixels ni les
  dimensions réelles.
- **Ce que Claude ne fait pas** : il n'écrit ni hauteur, ni largeur, ni forme de toit ; il ne corrige pas le plan. Quand il voit une
  pointe plus haute ou plus basse que prévu, il le dit (`v`), et la spec le traite en **alerte**, jamais en correction (décision 12).
- **Reproductibilité** : chaque réponse est enregistrée avec la version du prompt et du schéma ; la calibration les rejoue (§7.2).
- **Coût** : une passe de plus par façade ; à mesurer (jetons, secondes) sur les cas, et à plafonner par le serveur comme les autres.

---

## 9. Étapes de livraison

Chaque lot est livrable seul : CI verte, CHANGELOG (`## [Non publié]`), fumée sur les points touchés, PR, merge par commit de merge.
`AE 101` ne bouge pas (`identite.ts`) sauf décision écrite ; les empreintes golden aussi.

| Lot | Contenu | Critère d'acceptation |
|---|---|---|
| **F1 — Modèle et stockage** | `dimensions`, `forme`, `textureCalee`, `id` et `verifieeLe` des ouvertures ; validation, compactage, migration, groupes de `protections.ts` | Un fichier ancien se relit à l'identique ; aller-retour testé ; aucun champ nouveau écrit tant que rien ne le pose |
| **F2 — Cas AE 101 et rejeu** | Le cas d'étalon dans le corpus réel ; le bouton « Rejouer » (déterministe) et la frise d'étapes de la calibration avec ses calques | Le rejeu d'AE 101 montre la pose actuelle fausse (302 px au lieu de ~610), étape par étape ; reproductible |
| **F3 — Contrat IA du calage** | Champ `calage` du schéma d'analyse, réponses enregistrées, mode « IA » du rejeu, « Rappeler Claude » | Les points de l'IA s'affichent sur l'É4 ; coût et version affichés |
| **F4 — Arbitre du calage** | Score d'explication **sans le toit** (angles, égout, sol), règle d'accord/divergence/repli, drapeaux honnêtes, réglages | Banc de synthèse : égout 44/44, sol 43/44, silhouette à 2 % ≥ 39/44 (**ne baisse pas**) ; AE 101 : bouts à 3 % près ; aucun drapeau « trouvé » sur une pose qui échoue au test |
| **F5 — Diagnostic de forme et toit par corps** | Découpage de la façade en tronçons de corps ; diagnostic (taxonomie du §5 bis, variantes de toit testées) ; propositions confirmées dans l'avant/après ; observations adressées au corps par son mur ; `pignons.ts` étendu à tout corps ; alertes de hauteur | Sur AE 101 sud : la proposition juste (le pignon manquant s'il manque) est faite sur le **bon corps**, décochée ; accepter une proposition change le toit **par le moteur seulement** ; les hauteurs du LiDAR ne bougent pas ; AE 101 identique sans proposition acceptée |
| **F6 — Photos dans l'audit** | Prise, redressement, assemblage et rangement des photos de façade dans l'audit ; « Créer un cas depuis cette façade » ; le relevé devient éditeur | Parcours complet sur téléphone, trois classes d'écran ; migration d'un projet existant sans perte |
| **F7 — Façade objet** | Les ouvertures hors automatique en objets (id, source, vérification), appariement au rejeu, inspecteur, 3D | Un rejeu ne déplace pas une ouverture vérifiée ; la 3D et le plan lisent les mêmes ; empreinte `glb-structure.json` : dite si elle bouge |
| **F8 — Éléments découverts** | Cheminées et lucarnes lues sur la ligne du haut, posées par le moteur sur le corps concerné après confirmation (puis, plus tard, le reste du catalogue) | Un élément n'est jamais à la fois dans la façade objet et dans le toit ; les éléments posés à la main ne bougent pas au rejeu |

Ordre conseillé : F1, F2, F3, F4 (le calage d'abord, parce que tout en dépend), **F5 ensuite** (la boucle toit est le cœur : la forme de la
façade n'a de valeur que si elle ajuste le toit), puis F6, F7, F8. F2 peut précéder F1 si le cas d'étalon est posé avant le modèle.

---

## 10. Vérifier

```bash
npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test      # la CI
npx tsx .claude/skills/toits/scripts/identite.ts                                              # AE 101 : corps identiques
npx tsx .claude/skills/facades/scripts/banc.ts                                                # le banc : avant / apres dans la PR
npx tsx .claude/skills/facades/scripts/egout-sol.ts                                           # bouts, egout, sol, gabarit pose
NODE_PATH=$(npm root -g) npx tsx .claude/skills/facades/scripts/reel.ts mesurer               # le corpus reel (quand il existe)
```

- Toute PR qui touche au calage ou à la détection colle le **tableau avant et après** du banc (au moins les lignes « Ensemble »).
- **Pièges de CI** : `max-lines-per-function` 150 ; couches (`tests/unit/architecture.test.ts`) ; exposition des commandes
  (`app/exposition.ts`, trois classes d'écran) ; contrôles classés (`controlesInterface.ts`) ; `exactOptionalPropertyTypes`.
- **Fumée** : un point nouveau pour la frise de calibration et un pour la prise dans l'audit ; points existants touchés : 54, 58, 59, 62,
  63, 65, 67 (chaîne des façades) et 24 (GLB, fenêtres).
- **Garde-fou de zones** : tout calque qui suit la caméra ou l'image se tient hors du rendu de React (nœud stable, contenu écrit à la main)
  pour ne pas faire échouer la comparaison des clés de version (`zones/composants/abonnement.ts`).

---

## 11. Risques et questions ouvertes

1. **Le haut de l'image est la donnée la plus fragile** : colombages, ardoise, arbre, ciel couvert. Le score d'explication peut échouer
   sur des façades réelles que le banc de synthèse ne montre pas ; d'où le repli (§5.4) et le geste de confirmation. *À mesurer sur les
   premiers cas réels.*
2. **L'IA se trompe de manière corrélée** (les trois passes voient la même erreur) : le vote ne protège pas. Le déterministe doit pouvoir
   dire « non » (verticale absente à l'angle annoncé).
3. **Le coût** d'une passe de plus par façade : plafond serveur et mesure (§8).
4. **Les photos** sont des données personnelles : ce qui entre dans le dépôt (corpus) et ce qui part vers le serveur d'analyse doit être
   décidé cas par cas. *Question ouverte : y a-t-il un format réduit (recadrage de la façade seule) accepté pour le corpus ?*
5. **Façade objet : granularité.** Un objet par ouverture (proposé) ou un objet par façade qui porte sa liste ? Le premier simplifie les
   rejeux et l'inspecteur ; le second reste plus proche du fichier actuel. *À trancher avant F7.*
6. **Fenêtres automatiques sur un mur relevé** : aujourd'hui aucune. Faut-il en poser sur les parties **non vues** d'un mur relevé (un
   mur à moitié caché par une haie) ? Hors périmètre de cette spec.
7. **Le Mode Toit** (`spec-mode-toit-3d.md`) montre déjà un profil de façade à l'échelle (essai, branche `claude/profil-facade-essai`,
   non fusionné). Faut-il le fusionner avec la forme de la Façade (§3.2) ou l'abandonner ? *Proposition : le reprendre une fois F1 posé,
   en lisant `forme.gabarit`.*
8. **Circularité** : la silhouette dérive du toit, qui est ce qu'on veut corriger. Si le calage s'appuie sur le gabarit, une erreur de toit
   déforme le calage et cache l'écart (§4 É4, §5). Garde-fou : le score d'explication du calage ne contient jamais le gabarit.
9. **Un faux pignon** (colombage en triangle, arbre) proposé par l'IA ou le déterministe : toute proposition est décochée et vérifiée par
   l'autre chemin (§5 bis, règle 5).
10. **Plusieurs corps** : l'attribution d'une partie de silhouette au bon corps peut se tromper (un corps en retrait plus haut, un
    appentis devant un pignon). Une proposition qui touche une frontière de corps devient un second corps, pas un déplacement (§5 ter) ;
    et le rejeu doit montrer **quel corps** est visé avant toute confirmation.
11. **`pignons.ts` ne connaît que le corps principal** : l'étendre aux autres corps change ce que le moteur peut poser ; AE 101 doit rester
    identique tant qu'aucune proposition n'est acceptée (`identite.ts`).
12. **Calibration seule ou aussi relevé** : le relevé garde son entrée tant que F6 n'est pas livré ; deux chemins de capture coexistent
   un temps (acceptable, la chaîne est commune).

---

## 12. Glossaire et plan du code

- **Mur** : un côté du contour, de `pts[cote]` à `pts[cote+1]`. **Façade** : l'enregistrement qui le décrit (§3.2).
- **Assemblage** : l'image redressée et fusionnée des photos d'un mur ; l'image prise pour la suite.
- **Gabarit** : le haut de toute la façade, du plan et du LiDAR (`u` part de la largeur, `v` part de l'égout).
- **Silhouette lue** : le haut du mur lu sur l'image (`triangle`, `trapeze`, `rampe`, `ligne-droite`, `marches`, `plusieurs-sommets`).
- **Façade objet** : les ouvertures hors automatique d'une façade (§3.3).
- **Calage du mur** : bouts, égout et sol du mur sur l'assemblage.
- **Diagnostic de forme** : l'écart entre la silhouette lue et le gabarit calculé, rangé par corps ; il donne des propositions de toit (§5 bis).
- **Corps concerné** : le corps dont le mur porte la partie de silhouette en cause ; il se retrouve par son mur (`murDuCorps`), pas par son rang.
- **Score d'explication** : la part du haut de l'image que la pose explique, comparée à un gabarit plat (§5).

| Sujet | Code |
|---|---|
| Chaîne et assemblage | `facade/analyseMur.ts`, `facade/releve/chaine.ts`, `facade/releve/coinsAuto.ts`, `facade/vision/mosaiqueFuites.ts` |
| Gabarit et silhouette | `facade/gabaritMur.ts`, `facade/regles/toits/silhouettes.ts`, `silhouetteDesCorps.ts`, `model/silhouetteFacade.ts` |
| Modèle | `model/typesReleve.ts`, `model/auditParcelle.ts`, `model/protections.ts`, `model/migrations.ts` |
| IA | `model/analyseClaude.ts`, `app/regles/sujets/facades.ts`, `deploy/schema-analyse.json` (généré), `facade/detection/renfort.ts` |
| Calibration | `zones/EditeurCasCalibration.tsx`, `zones/CalageSilhouette.tsx`, `zones/VueFacade3d.tsx`, `facade/releve/casCalibration.ts`, `facade/corpusReel.ts` |
| Audit | `app/audit/parcelle/`, `zones/parcours/` |
| 3D et plan | `three/detailsBatiment.ts`, `facade/ouvertures.ts`, `render/releve.ts` |
| Banc | `.claude/skills/facades/scripts/`, `tests/banc/facades/`, `tests/fixtures/facades/`, `tests/fixtures/facades-reel/` |
