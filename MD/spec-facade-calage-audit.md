# Façade : calage, texture et fenêtres, de l'audit au modèle — spec

*Rédigée le 29 octobre 2026, sur `main` à la version 4.0.0 (commit `e9113ac2`), à la suite d'une discussion avec le propriétaire ; mise à jour le
même jour (la silhouette dérive du toit ; les corrections se font sur le corps concerné ; une façade peut en porter plusieurs ; un seul run
IA par façade, qui rend aussi les ouvertures et leurs carreaux ; le moteur de redressement et de fusion reste tel quel).
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
(`gabarit = gabaritDesCorps(silhouetteDeFace(corps))`, le même calcul que la silhouette du Mode Toit depuis le 29 octobre 2026). Un écart entre le gabarit calculé et ce que montre la photo est donc d'abord une information sur le
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
14. **Un seul run IA par façade.** Une requête, une réponse, un schéma : elle rend le calage (angles, pointes, corps), les éléments de toit
    vus, **les ouvertures et le type de leurs carreaux**. Plus d'appels séparés (calage, puis renfort, puis détails). Voir §8.
15. **L'IA récupère aussi, pour la suite, les ouvertures et leurs carreaux** : le type de division du vitrage (petits bois, nombre de
    carreaux, imposte). On l'enregistre dans la façade objet **maintenant** ; son rendu en 3D est un lot ultérieur (§3.3, F8).
16. **Le moteur de redressement et de fusion reste tel quel.** Le redressement (`vuesDeFace`, `redresserParFuites`, `redresserParReperes`),
    l'assemblage (`mosaiqueDesVues`), la fusion des vues (`fondreLesVues`, vote des baies) et la version sans ombres ne sont **ni modifiés
    ni réglés** par cette spec : elle s'appuie dessus et agit **autour** (calage du mur, forme, diagnostic, ouvertures, rejeu). Voir §4 bis.
17. **Chaque étape est un contrat : entrant, action automatique avec son objectif, sortant, option manuelle quand l'objectif n'est pas
    atteint.** L'automatique est le chemin normal ; le manuel est une option de repli, jamais un passage obligé. Voir §4 ter.
18. **Certaines étapes sont des points de validation** (le mur, le toit, la façade), les autres tournent **en arrière-plan**. **L'audit
    est plus discret** : quand seul le résultat compte, l'étape reste cachée et ne se montre que si elle échoue ; **la calibration montre
    tout**. Voir §4 ter.
19. **Aucun code mort dans la migration.** Chaque morceau de code indépendant (audit, relevé, calibration) qui est absorbé par
    l'enchaînement est **supprimé dans la même PR** que son remplaçant : ni pont, ni doublon, ni « à nettoyer plus tard ». Voir §8 bis.
20. **L'audit et la calibration montrent la même barre de progression, en haut de l'écran.** Elle dit où en est l'enchaînement de la façade
    (étapes faites, étape en cours, étapes à confirmer ou en échec), lue sur les états de l'orchestrateur : un seul composant, deux écrans.
    Voir §4 ter.5.
21. Textes de l'interface en français avec accents et vouvoiement ; commentaires de code en français sans accents, qui disent pourquoi.

---

## 2. Ce qui existe déjà (relevé du 29 octobre 2026)

| Brique | Où | Ce qu'elle fait |
|---|---|---|
| Audit de la parcelle | `model/auditParcelle.ts` (`FacadeCapturee`, `BatimentCapture`), `app/audit/parcelle/` | Les photos par côté du contour (`facades[rang].photos`), les corrections de redressement, le bilan du redressement et de la fusion |
| Chaîne unique | `facade/releve/chaine.ts`, `facade/analyseMur.ts::analyserLeMur`, `fondreLesVues` | Une photo ou plusieurs : redressement, assemblage, mur, détection, texture. Le même code pour l'audit, le relevé et la calibration |
| Calage du mur | `facade/releve/coinsAuto.ts::murSurLAssemblage`, `vision/mosaiqueFuites.ts` (`rectangleSurLesAretes`, `rectangleDuMur`, `affinerEgoutEtSol`, `silhouetteDuMur`) | Les bouts, l'égout et le sol sur l'assemblage, par les arêtes puis par la teinte du mur |
| Gabarit | `facade/gabaritMur.ts` (`gabaritDesCorps`, `contourDuGabarit`, `gabaritSurLaVue`), tiré de `facade/regles/toits/silhouetteDesCorps.ts::silhouetteDeFace` | Le haut de toute la façade vue de dehors, tous corps compris, en parts de la largeur (`u`) et de l'égout (`v`) ; `u` peut sortir de 0..1 quand le mur d'un corps continue la façade au-delà de son côté (la détection ne lit que 0..1) |
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
  details?: {
    volets?: …; ferme?: boolean; allege?: …; forme?: 'rect' | 'cintre' | 'rond';
    /** La division du vitrage, lue par l'IA (decision 15). Enregistree maintenant ; dessinee en 3D plus tard (F8). */
    carreaux?: {
      vantaux?: 1 | 2 | 3;                                     // nombre de vantaux visibles
      grille?: { colonnes: number; rangees: number };           // carreaux par vantail (ex. 3 x 2) ; 1 x 1 : vitrage d'un seul tenant
      petitsBois?: 'aucun' | 'fins' | 'epais';
      imposte?: { hauteurM: number; grille?: { colonnes: number; rangees: number } };   // partie haute a petits carreaux (AE 101)
      vitrage?: 'clair' | 'depoli' | 'teinte' | 'vitrail';
      source: 'ia' | 'doigt';
    };
  };
  verifieeLe?: string;                      // posee par la personne : plus aucun rejeu ne la deplace
}
```

- `carreaux` est **facultatif** et sans effet sur ce que la 3D dessine aujourd'hui : un fichier sans lui garde son sens, et la façade garde
  ses fenêtres actuelles (`fenetres3d`). Il est rangé avec l'ouverture pour que le rendu des carreaux (F8) n'ait pas besoin de rappeler l'IA.
- Les valeurs sont un **vocabulaire fermé** (comme `silhouetteFacade.ts`) : l'IA choisit dans la liste, jamais d'un texte libre ; un mot
  inconnu relu devient `indetermine`, jamais une erreur. La liste se complète avec les premiers cas réels (l'imposte de la façade
  d'AE 101 en est le premier exemple).

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

### É2 · Redressement *(inchangé, §4 bis)*

- **Déterministe** : par les repères posés, sinon par les points de fuite (`vuesDeFace`, `redresserParFuites`).
- **IA** : néant (la géométrie n'est pas son travail).
- **Illustration** : chaque photo redressée, avec ses verticales et ses horizontales.

### É3 · Assemblage *(inchangé, §4 bis)*

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

### É6 · Texture *(le moteur de fusion est inchangé, §4 bis)*

- **Déterministe** : l'élévation calée sur le mur (`pxParM`), la fusion des vues (vote des baies, occultations, meilleure vue par pixel),
  la version sans ombres (`vision/sansOmbres.ts`).
- **Sortie** : `texture`, `textureCalee`, `hauteurTexture` (la bande au-dessus de l'égout, que la 3D plaque sur le pignon).
- **Illustration** : l'image calée sur la silhouette ; la même sans ombres ; la façade en 3D vue de face (`VueFacade3d`).

### É7 · Ouvertures

- **Déterministe** : candidats, classement, structure (grille niveaux × travées), détails (volets, allège, forme).
- **IA** : **le même run que le calage** (§8) rend les ouvertures vues, leur type, leurs `details` et leurs **carreaux** ; leurs boîtes sont
  recalées sur l'image par le recalage existant (`facade/detection/renfortRecalage.ts`). Le **vote à trois passes** du renfort
  (`facade/detection/renfort.ts`) n'est plus le mode par défaut : voir §8, « Un run, pas de vote ».
- **Arbitre** : l'accord avec la détection déterministe (une boîte de l'IA que la détection retrouve gagne en confiance ; une boîte
  seule reste décochée) et le vote entre vues de la fusion (existant, inchangé) ; une ouverture de la personne n'est jamais déplacée.
- **Sortie** : les ouvertures de la **façade objet** (§3.3), avec leur `source`, leur `confiance` et leurs `carreaux`.
- **Illustration** : l'image avec les boîtes (trait plein : détectées ; tirets : devinées ; couleur par source) ; au toucher d'une boîte, la
  division du vitrage lue (grille, petits bois, imposte) dessinée en surimpression.

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

## 4 bis. Ce qui ne bouge pas : le redressement, l'assemblage, la fusion

Décision 16. Le moteur d'**image** reste tel quel, avec ses chiffres :

- **Redressement** (É2) : par les repères posés, sinon par les points de fuite ; une photo seule se redresse en une passe depuis la photo
  d'origine (`analyseMur.ts::photoCommeAssemblage`) ; plusieurs vues passent par l'assemblage.
- **Assemblage** (É3) : mosaïque ORB + RANSAC de similitude, avec ses critères (`CRITERES_MOSAIQUE`, `CRITERES_FUSION`).
- **Fusion** (É6) : `fondreLesVues`, le vote entre vues (`facade/detection/voteVues.ts`), les occultations par la parallaxe, la meilleure vue pixel
  par pixel ; la version sans ombres (`vision/sansOmbres.ts`).

Conséquences :

1. **Aucun seuil de ces étapes n'est touché** par les lots F0 à F8. Les tests `redressementFuites`, `mosaiqueFuites`, `fusion`, `voteVues`,
   `banc.test.ts` et le tableau du banc (sections « chaîne du relevé » et « fusion de plusieurs vues ») **ne doivent pas bouger**.
2. **La spec agit autour** : elle ajoute des étapes **après** l'assemblage (calage du mur par ses ancres, diagnostic, ouvertures) et un
   **rejeu** qui les illustre ; elle ne rééchantillonne rien, ne change ni l'échelle ni la résolution de l'assemblage.
3. **Si le calage du mur se corrige**, c'est dans `murSurLAssemblage` et ce qui le suit, jamais en retouchant l'image redressée ou la
   mosaïque pour que le mur « tombe juste ».
4. **Un défaut du redressement ou de la fusion** que la calibration révélerait est **noté** (cas, étape, image) et traité à part, dans sa
   propre PR, avec le banc avant/après (`SKILL.md` du skill `facades`) : jamais glissé dans un lot de cette spec.
5. **La calibration illustre ces étapes sans les modifier** : elle les rejoue telles quelles et montre leurs images (redressée, mosaïque,
   fusion).

---

## 4 ter. L'enchaînement global

Une façade traverse les étapes É0 à É9. Chacune est un **contrat** : ce qui entre, ce que l'automatique en fait **et l'objectif qu'il doit
atteindre**, ce qui sort, et ce que la personne peut faire à la main quand l'objectif n'est pas atteint.

### 4 ter.1 Le contrat d'une étape

- **Entrant** : les données dont l'étape a besoin, et d'où elles viennent (étape précédente, plan, LiDAR, photos).
- **Action automatique** : ce que la chaîne fait seule (déterministe, IA, ou les deux).
- **Objectif** : un critère **mesurable** qui dit que l'automatique a réussi (un score, un seuil, un taux). Il est écrit dans les réglages
  (`regles/facades/reglages.json`, un seuil par PR, §5.6), pas dans l'écran.
- **Sortant** : ce que l'étape rend, et que la suivante lit ; jamais plus que ce qui est validé.
- **Option manuelle** : le geste minimal de repli, **proposé seulement quand l'objectif n'est pas atteint** (ou à la demande de la personne).
  C'est un outil existant chaque fois que c'est possible (voir le tableau), jamais un formulaire.
- **État** : `ok` (objectif atteint), `a-confirmer` (atteint de justesse, ou deux chemins qui divergent), `echec` (non atteint),
  `saute` (inutile ici). L'état est **dérivé** (comme `BilanRedressement`) : jamais source de vérité, recalculé à chaque rejeu.
- **Mode d'audit** : `cache` (tourne en arrière-plan, ne se montre pas), `resume` (une ligne et une vignette, validée par exception) ou
  `valider` (un point d'arrêt : la personne confirme). Voir §4 ter.3.

### 4 ter.2 Le tableau de l'enchaînement

| Étape | Entrant | Action automatique | Objectif (réussi quand…) | Sortant | Option manuelle | Audit |
|---|---|---|---|---|---|---|
| **É0** Préparation | contour, corps du toit, LiDAR, cadastre | dimensions, gabarit, rapport, pointes attendues | un gabarit existe par côté (rectangle sinon) | `dimensions`, `forme.gabarit` | — (corriger le plan ailleurs) | `cache` |
| **É1** Prises | le côté choisi, le téléphone | prise, prise de vue située (position, cap, attitude, focale) | ≥ 1 photo du mur entier, prise lisible | `PhotoCas` + prise | ajouter, retirer, refaire une photo | `valider` (c'est le geste) |
| **É2** Redressement | photos, repères | points de fuite, sinon repères posés | chaque photo redressée, ou son motif dit | vues de face | poser 4 repères (un rectangle du mur) | `cache` ; `resume` si une photo échoue |
| **É3** Assemblage | vues de face | mosaïque ORB + RANSAC | toutes les vues assemblées, sinon motif | assemblage, masque `vu` | retirer une photo, la mettre à part | `cache` ; `resume` si des photos restent seules |
| **É4** Calage du mur | assemblage, rapport, **run IA** (angles) | arêtes + teinte, vérifiées par l'IA, arbitre (§5) | bouts, égout, sol à 3 % de la largeur ; score d'explication ≥ seuil | `x0`, `x1`, égout, sol ; `forme.pointes` | poser 2 angles, l'égout, le sol (poignées de `AjusterMur` / `CalageSilhouette`) | `resume` ; **`valider`** si divergence ou score faible |
| **É5** Silhouette lue | assemblage calé, corps (§5 ter) | haut du mur, mot, découpage par corps | silhouette lue sur ≥ la moitié des colonnes, corps attribués | `forme.silhouetteLue`, `forme.corps` | désigner les pointes sur l'image | `cache` |
| **É5 bis** Diagnostic | silhouette lue, gabarit, **run IA** (pointes, corps) | variantes de toit par corps | une proposition n'existe que si elle explique mieux l'image (gain ≥ seuil) | propositions de toit, alertes de hauteur | cocher/décocher, ouvrir le Mode Toit | **`valider`** (toujours, décision 10) |
| **É6** Texture | assemblage calé | élévation calée, fusion, sans ombres | écart de teinte et liserés sous le seuil | `texture`, `textureCalee`, `hauteurTexture` | recadrer, activer/désactiver « sans ombres » | `cache` ; aperçu en `resume` |
| **É7** Ouvertures | assemblage calé, grille, **run IA** (boîtes, carreaux) | détection, accord avec l'IA, grille | rappel ≥ 85 %, précision ≥ 90 %, cotes ≤ 5 cm, < 3 corrections par façade | ouvertures de la **façade objet**, `carreaux` | ajouter, retirer, déplacer, redimensionner (éditeur du relevé) | `resume` : seules les boîtes **décochées** demandent un geste |
| **É8** Toit | propositions **confirmées**, faits, marques | observations du moteur, sur le corps concerné | observation acceptée par le moteur ; **hauteurs du LiDAR inchangées** | toit ajusté (par le moteur) | Mode Toit pour tout régler à la main | `valider` (avant/après) |
| **É9** Validation | tout ce qui précède | assemble le bilan de la façade | personne a validé ; une étape d'historique | `dimensions`, `forme`, `texture`, façade objet écrits | corriger n'importe quel sortant | **`valider`** (une validation, un Ctrl+Z) |

### 4 ter.3 Les points de validation, et l'audit discret

L'audit ne déroule pas dix écrans. Il se tient à **quatre points d'arrêt**, et ne montre le reste que s'il échoue.

| Point | Après l'étape | Ce que la personne voit | Ce qu'elle fait |
|---|---|---|---|
| **V1 · Le mur** | É4 | l'assemblage, le mur posé, les angles | confirme, ou tire un angle / l'égout / le sol ; **n'apparaît que si** les deux chemins divergent ou si le score est faible (sinon une ligne « Mur posé ✓ ») |
| **V2 · Le toit** | É5 bis | l'avant/après de chaque proposition, par corps | coche les propositions qu'elle accepte (toujours demandé) |
| **V3 · Les ouvertures** | É7 | la façade avec les boîtes **décochées** en évidence | accepte, retire ou corrige ; les cochées passent sans geste |
| **V4 · La façade** | É9 | le bilan : dimensions, forme, texture, ouvertures | valide d'un geste |

- **Étapes en arrière-plan** (`cache`) : É0, É2, É3, É5, É6. Seul leur **résultat** compte : elles rendent leur sortant sans se montrer. Une
  étape cachée **passe en `resume` dès qu'elle échoue** (une photo restée à part, un redressement impossible, une texture avec liserés)
  et propose son option manuelle.
- **Un échec arrête la suite** (pas de calage fondé sur un assemblage manquant) ; ou, quand la suite peut continuer sur une valeur
  **supposée** (le sol à la hauteur du plan), elle continue en le disant (`a-confirmer`, drapeau « supposé » visible).
- **La calibration montre tout** : toutes les étapes, quel que soit leur mode d'audit, avec leurs calques (§7.3). Le mode d'audit est un
  **réglage d'affichage**, pas une propriété de l'étape.
- **Le Mode Toit** est l'option manuelle de V2 : « tout régler à la main » ouvre la session du toit sur le corps concerné.

```mermaid
flowchart TD
  P["É0 Préparation (plan + LiDAR)"] --> C["É1 Prises"]
  C --> R["É2 Redressement"]
  R --> A["É3 Assemblage"]
  A --> M["É4 Calage du mur"]
  M -->|"ok, accord"| S["É5 Silhouette lue (par corps)"]
  M -->|"divergence ou score faible"| V1(["V1 Le mur : la personne tire les angles"])
  V1 --> S
  S --> D["É5 bis Diagnostic de forme"]
  D --> V2(["V2 Le toit : confirmer les propositions"])
  V2 --> T["É8 Toit par le moteur, sur le corps concerné"]
  M --> X["É6 Texture"]
  M --> O["É7 Ouvertures + carreaux"]
  O -->|"boites decochees"| V3(["V3 Les ouvertures"])
  T --> F(["V4 La façade : valider"])
  X --> F
  V3 --> F
  O -->|"toutes cochees"| F
```

### 4 ter.4 Ce que ça demande au code

- **Un orchestrateur** (`facade/releve/enchainement.ts`, pur) qui déroule les étapes dans l'ordre du tableau, calcule l'état de chacune
  (objectif atteint ou non), dit laquelle bloque, et ce que la suivante peut faire sur une valeur supposée. Il **appelle** la chaîne
  existante (`analyserLeMur`, `murSurLAssemblage`…) sans la modifier (décision 16).
- **Un contrat par étape** : un type (`EtapeFacade` : entrant, sortant, objectif, option manuelle, mode d'audit) dans `model/`, les objectifs
  dans `regles/facades/reglages.json`, le mode d'audit dans un réglage d'interface (`affichage`), jamais dans la chaîne.
- **L'audit** lit les états et ne montre que V1 à V4 et les étapes en échec ; **la calibration** lit les mêmes états et montre tout. Un
  seul calcul, deux affichages, et **une seule barre de progression** (§4 ter.5) qui les rend l'un et l'autre.
- **Le rejeu** (§7.2) exécute le même orchestrateur sur un cas : mêmes entrants, mêmes réponses enregistrées, mêmes objectifs, mêmes états.

---

### 4 ter.5 La barre de progression (audit et calibration)

L'audit et la calibration montrent **une barre de progression en haut de l'écran**, la même. Elle se lit en un coup d'œil : où en est la
façade, ce qui est fait, ce qui attend la personne.

- **Un seul composant**, `BarreProgressionFacade` (`zones/composants/`), qui lit les **états de l'orchestrateur** (§4 ter.1) et rien d'autre.
  Aucun écran ne calcule sa propre progression des étapes de la façade (décision 19 : les indicateurs « étape n sur m » propres au relevé,
  à l'audit ou à la calibration pour cet enchaînement sont **supprimés** dans les lots qui les remplacent, §8 bis).
  *(La « progression » de la descente des réglages de la calibration (`avance` de `EcranCalibration.tsx`) et celle de la lecture des toits
  de la barre d'état sont d'autres traitements : elles ne changent pas.)*
- **Les segments** : une barre à **huit segments**, qui regroupent les étapes pour rester lisible :

  | Segment | Étapes | Point de validation sur le segment |
  |---|---|---|
  | 1 · Prise | É1 | — (c'est le geste) |
  | 2 · Image | É2 redressement, É3 assemblage | — (caché, passe en résumé s'il échoue) |
  | 3 · Mur | É4 calage | **V1** |
  | 4 · Forme | É5 silhouette lue, É5 bis diagnostic | **V2** |
  | 5 · Texture | É6 | — |
  | 6 · Ouvertures | É7 | **V3** |
  | 7 · Toit | É8 | — (suit V2) |
  | 8 · Façade | É9 | **V4** |

  (É0, la préparation, est instantanée et n'a pas de segment.) Les points de validation sont marqués d'un **repère** sur leur segment.
- **L'état de chaque segment** (le pire état de ses étapes) : *à venir* (neutre), *en cours* (animé, sans mouvement avec
  `prefers-reduced-motion`), *ok* (accent), *à confirmer* (attention), *échec* (danger), *sauté* (hachuré). Jamais la couleur seule : chaque état a
  aussi une **forme** (coche, point d'exclamation, croix, tiret) et un texte, pour le thème sombre et le daltonisme. Les couleurs sont des
  **jetons** (`styles/jetons.ts` d'abord, puis les modèles de palette), pas des valeurs en dur.
- **Sous la barre**, deux lignes : le **nom de l'étape en cours** (« Mur : calage ») et le **résultat de la dernière étape finie** en une
  phrase (« Mur posé, bouts à 1,2 % de la largeur »). Sur téléphone, la barre se réduit à un **fin ruban** et au libellé « 3 sur 8 · Mur ».
- **Pendant un calcul**, la barre avance au fil des événements de l'orchestrateur (étape, part faite) : le redressement, l'assemblage et le run
  IA durent plusieurs secondes sur téléphone ; ils tournent hors du fil de l'interface (le worker existant), et un bouton **« Arrêter »** apparaît
  à droite de la barre tant que quelque chose tourne.
- **Dans l'audit**, la barre montre toutes les étapes mais **n'ouvre que** les points de validation et les étapes en échec ou à confirmer ; une
  étape cachée qui a réussi n'est pas cliquable. C'est elle qui fait voir qu'une étape cachée a bien tourné.
- **Dans la calibration**, **tous** les segments sont ouvrables : toucher un segment ouvre l'étape avec ses calques (§7.3). « Rejouer » repart de
  la première étape ; **« Rejouer depuis cette étape »** repart de l'étape choisie, avec les sorties des précédentes.
- **Un échec** se lit sur le segment (croix, texte) ; le toucher dit pourquoi (une ligne sous la barre, pas une infobulle seule : le doigt n'a pas
  de survol) et propose l'**option manuelle** de l'étape.
- **Accessibilité** : une liste ordonnée (`ol`) de huit éléments, `aria-current="step"` sur l'étape en cours, un texte lu à voix haute
  (« Étape 3 sur 8, Mur, à confirmer ») ; les segments ouvrables sont des **boutons de 44 px au moins** (le segment est mince, sa zone de
  toucher ne l'est pas).
- **Commandes** : un segment ouvrable est un bouton lié à une commande du registre (`facade.etape`, paramètre `data-etape`), inscrite dans
  `app/exposition.ts` pour les trois classes d'écran, décrite au glossaire (`app/descriptions.ts`) et classée dans `app/controlesInterface.ts` ;
  il lit `commandes.etat(id)` (grisé avec la raison, jamais `obtenir(id).actif` seul).
- **Place** : en haut du contenu de l'écran (sous la barre d'application Z1), **collée** quand on défile. Ce n'est pas une zone de plus : c'est un
  bandeau de l'écran qui le porte (le parcours de l'audit, l'éditeur de cas de la calibration).

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

**Deux silhouettes, deux mots** (décision de la personne, 29 octobre 2026). On ne les confond plus :

| | **Silhouette du corps** | **Silhouette de la façade complète** |
|---|---|---|
| Ce que c'est | le haut d'**un** mur d'**un** corps : son pignon, sa croupe, la rampe d'un appentis | ce que montre **la photo** : toutes les silhouettes de corps visibles depuis la façade, projetées sur son plan, la plus haute l'emportant |
| Calcul | `silhouetteDuCorps(corps, mur)` | `silhouetteDeFace(façade, corps)`, faite des silhouettes de corps |
| Où elle se voit | le Mode Toit 3D, sur le corps choisi | le gabarit de l'audit, du relevé et de la calibration, calé sur l'assemblage |
| À quoi elle sert | au diagnostic **par corps** et aux corrections, dans le repère du corps (`murDuCorps`) | au **calage** du mur (bouts, égout, sol) et à la comparaison avec la **silhouette lue** |
| Bornes | les bouts du mur de ce corps | les bouts de ce qui se voit : le côté du contour, ou plus loin quand le mur d'un corps continue la façade |

La silhouette lue sur la photo se compare à la **silhouette de la façade complète** ; l'écart se découpe en tronçons (`forme.corps`), et chaque
tronçon renvoie à la **silhouette du corps** qui le porte : c'est là que s'écrit la proposition de toit. Une correction ne s'écrit jamais sur
la silhouette de la façade complète : elle n'est qu'une projection, recalculée à partir des corps.

Une façade du contour (un côté de `pts`) n'est pas un corps : elle peut longer le mur du **corps principal**, celui d'une **aile**, d'un
**appentis**, d'un **bow-window** ou d'une **galerie**, à des profondeurs différentes. Le gabarit, lui, est le haut de **tous** les corps,
le plus haut l'emportant (`silhouetteDeFace`). Pour corriger un toit, il faut savoir **à quel corps appartient chaque partie de la
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
  porte ; il sert au diagnostic par corps (`silhouetteDesCorps`, `motDuHaut` : le verdict de forme lu sur le LiDAR). Le gabarit de
  toute la façade, qui sert à caler et à illustrer, est depuis le 29 octobre 2026 (bertrandra/plan#483) **la même projection que la
  silhouette du Mode Toit** : `silhouetteDuCorps(c, mur)` pour chaque mur de corps qui fait face à la façade (à 60° près), projeté sur
  son plan, le plus haut l'emportant ; un corps plus haut en retrait se voit au-dessus d'un plus bas devant ; un mur à plus d'un mètre
  devant la façade n'en est pas (`DEVANT_FACE_M`) ; un mur dans le plan de la façade qui la dépasse se voit entier
  (`MUR_CORPS_DISTANCE_M`). Le verdict de forme et le gabarit restent deux lectures (fondre le verdict changerait ses réponses :
  `silhouetteDesCorps.ts` le dit), mais ils partent des mêmes corps. **Le découpage `forme.corps` part de là** : `silhouetteDeFace`
  sait, à chaque abscisse, quel mur de corps porte le haut visible ; il reste à le rendre (aujourd'hui elle ne rend que `x0`, `x1` et
  `haut`).
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
- **La barre de progression** (décision 20, §4 ter.5) se tient en haut de l'écran de la façade : l'audit n'y ouvre que les points de validation et les étapes
  qui échouent.
- **Mode discret** (décision 18) : l'audit ne montre que les points de validation V1 à V4 (§4 ter.3) et les étapes qui échouent ; le redressement,
  l'assemblage, la silhouette lue et la texture tournent en arrière-plan. La personne ne voit que le résultat.
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

En haut, **la barre de progression** (§4 ter.5), dont tous les segments s'ouvrent. Dessous, une **frise d'étapes** (É2 à É8), chacune avec sa vignette ; toucher une étape l'ouvre en grand avec ses **calques** :

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

## 8. Contrat avec l'IA : un seul run par façade

- **Où** : le sujet « façades » de l'audit (`app/regles/sujets/facades.ts`) et le schéma d'analyse. Le prompt et le schéma sont
  **générés** : `npm run regles:generer`, jamais à la main ; un texte changé monte la version dans `versions.ts`.
- **Un run, une réponse.** Pour chaque façade, **une** requête à Claude sur l'image prise pour la suite (l'assemblage) rend **tout** :
  1. **le calage** (champ `calage`) : `angles` (gauche et droite, en `u` de 0 à 1 sur l'image assemblée), `pointes` (pour chaque pignon vu,
     `u` et `v`, hauteur relative à l'égout à 10 % près, ou `absent`), `appentis` (début et fin en `u`), `corps` (les parties de la
     silhouette qui lui paraissent d'un autre volume, début et fin en `u` : une **aide** au découpage par corps du §5 ter, tenue pour une
     hypothèse), `cache` (arbre, haie, voiture, et où) ;
  2. **la forme** : `silhouette` et `bout` par côté (existant) ;
  3. **les éléments de toit** vus sur la ligne du haut (`elements` : cheminée, lucarne, avec leur `u`, périmètre initial §5 quater) ;
  4. **les ouvertures** : type (fenêtre, porte-fenêtre, porte, garage…), boîte, niveau et travée si elle les voit, `confiance` ;
  5. **leurs détails** : volets, allège, forme, et **les carreaux** (§3.3) : vantaux, grille, petits bois, imposte, vitrage ;
  6. **une confiance** par élément, et ce qu'elle ne voit pas.
  Les coordonnées sont celles de l'image prise pour la suite, **normalisées** (`u` le long du mur, `v` en part de l'égout) : l'IA ne voit
  ni les pixels ni les dimensions réelles.
- **Un run, pas de vote.** Le renfort existant lance trois passes qu'il vote (`facade/detection/renfort.ts`). Avec un seul run, la
  protection contre l'invention (« une fenêtre inventée dans une passe sur trois ») passe par **l'accord avec le déterministe** : une
  boîte de l'IA que la détection retrouve, ou que la grille de la façade (niveaux × travées) rend plausible, est cochée ; une boîte seule
  reste **décochée**, avec son image. Le vote à trois passes reste **disponible** comme option du rejeu (« Rappeler Claude ×3 »), pour
  mesurer ce qu'il apporte contre son coût (§11).
- **Ce que Claude ne fait pas** : il n'écrit ni hauteur, ni largeur, ni forme de toit ; il ne corrige pas le plan. Quand il voit une
  pointe plus haute ou plus basse que prévu, il le dit (`v`), et la spec le traite en **alerte**, jamais en correction (décision 12).
- **Où va chaque champ** : le calage → É4 ; la forme et les `elements` → É5 bis et É8 (propositions confirmées) ; les ouvertures et
  leurs détails → É7, **façade objet** ; les carreaux → `details.carreaux` (sans rendu avant F8).
- **Reproductibilité** : la réponse du run est **enregistrée** avec la version du prompt et du schéma ; la calibration la rejoue (§7.2) sans
  appel réseau. Un seul run à enregistrer par cas et par version : le rejeu est plus simple et moins cher qu'avec trois passes.
- **Coût** : **une** requête par façade (au lieu d'une pour le calage et trois pour le renfort) mais une réponse plus longue ; à mesurer
  (jetons, secondes) sur les cas, et à plafonner par le serveur comme les autres.

---

## 8 bis. La migration : un seul enchaînement, rien qui traîne

Aujourd'hui, **trois morceaux de code indépendants** enchaînent chacun à sa façon les mêmes étapes : l'audit (`app/audit/parcelle/mesures.ts`),
le relevé (`zones/Releve.tsx`, ~350 lignes de glue dans l'écran) et la calibration (`facade/releve/casCalibration.ts`, `EditeurCasCalibration.tsx`).
Ils partagent déjà le moteur (`analyserLeMur`, `redresserEtFusionner`, `murSurLAssemblage`), pas l'enchaînement. La migration les fait tous
passer par **l'orchestrateur** du §4 ter.4 et **supprime** ce qui devient inutile.

### 8 bis.1 Les règles (décision 19)

1. **Un seul chemin.** Une fonction d'enchaînement a une seule maison : l'orchestrateur. Les trois entrées (audit, relevé, calibration)
   l'appellent ; aucune ne réordonne les étapes elle-même.
2. **Un lot supprime ce qu'il remplace, dans la même PR.** Pas de « à supprimer dans un prochain lot », pas de `TODO` de nettoyage, pas de
   code commenté. La PR dit ce qu'elle supprime (« bilan de suppression » : fichiers, fonctions, lignes) et la CI le vérifie (règle 5).
3. **Pas de couche de compatibilité.** Aucun `export … from` de remplacement, aucun adaptateur gardé « pour l'ancien appelant », aucun
   `@deprecated` : un déplacement est un `git mv` avec tous les appelants corrigés dans la PR.
4. **Pas de drapeau de bascule permanent.** Un interrupteur ancien/nouveau n'existe qu'**à l'intérieur d'un lot** et disparaît avant la
   fusion ; une PR ne fusionne jamais avec les deux chemins vivants. Quand deux consommateurs ne peuvent pas migrer ensemble, c'est
   **l'ordre des lots** qui les sépare (§8 bis.3), pas un pont.
5. **Un cliquet des orphelins.** Un test d'architecture (`tests/unit/architecture/orphelins.test.ts`) parcourt les exports des dossiers
   concernés (`facade/releve`, `facade/detection`, `facade/calage`, `app/releve`, `app/audit/parcelle`, `zones/releve`, et les zones de la
   calibration) et échoue pour **tout export ou fichier qu'aucun autre fichier de `src/` n'importe** (hors points d'entrée déclarés).
   Les orphelins déjà présents sont dans une liste (`tests/fixtures/architecture/orphelins-autorises.json`) qui **ne peut que raccourcir** :
   un orphelin qui disparaît doit sortir de la liste (le test échoue sinon), un nouveau fait échouer la CI. À la fin de la migration, la liste
   est vide pour ces dossiers. *(Limites : un import dynamique et un type utilisé dans son seul fichier se déclarent à la main.)*
6. **Les données anciennes se lisent, ne s'écrivent plus.** Un champ qui n'est plus écrit n'est lu que par `model/migrations.ts`, avec son
   test d'aller-retour de fichier ancien : jamais par un écran.
7. **Ce qui entoure le code part avec lui** : les commandes (`app/exposition.ts`, `app/descriptions.ts`), les contrôles
   (`app/controlesInterface.ts`), les points de la fumée (`scripts/fumee.mjs`, `tests/CHECKLIST-FUMEE.md`), les règles CSS, les textes
   d'aide, les tests. Un test d'un code supprimé est **supprimé ou déplacé**, jamais `skip`. Le CHANGELOG a une ligne « Supprimé ».
8. **Contrôle de fin de lot, « rien ne traîne »** : (a) un `grep` des noms supprimés ne renvoie plus rien dans `src/`, `tests/`, `scripts/`,
   `MD/` ; (b) le cliquet des orphelins passe ; (c) le tableau du banc (redressement, fusion) est identique ; (d) la PR liste les lignes
   supprimées et les lignes ajoutées.

### 8 bis.2 Le relevé de l'existant : où va chaque morceau

*Relevé par imports et tailles de fichiers, 29 octobre 2026 : à reconfirmer par `grep` en tête de chaque lot (c'est sa première tâche).*

| Morceau | Taille | Rôle aujourd'hui | Destin | Lot |
|---|---|---|---|---|
| `facade/analyseMur.ts` (`analyserLeMur`, `fondreLesVues`) | 162 | une photo, des morceaux, des vues | **reste**, moteur gelé (décision 16) ; appelé par l'orchestrateur | — |
| `facade/releve/chaine.ts` (`redresserEtFusionner`, `morceauRedresse`, `champDesFuites`, `verticaliteDeg`, `VERSION_CHAINE_FACADES`…) | 397 | redressement, replis, report, fusion | la **partie moteur reste** telle quelle ; ce qui est de l'**ordre des étapes** passe à l'orchestrateur | F0 |
| `facade/vision/*` (redressement, mosaïque, fusion, vote, sans ombres) | — | le moteur d'image | **reste**, intact | — |
| `facade/releve/coinsAuto.ts` (`murSurLAssemblage`, `coinsAutoDeSerie`, `reporterCoins`) | 150 | le mur sur l'assemblage | reste ; `murSurLAssemblage` reçoit le calage par ancres | F1 |
| `facade/releve/serie.ts`, `app/releve/rechercheCoins.ts`, `calageFin.worker.ts`, `facade/calage/*` | 297+90+23 | les coins par la prise de vue (calage grossier, fin) | restent, **chemin déterministe de l'É4** pour une photo avec capteurs ; appelés par l'orchestrateur seul | F1 |
| `facade/releve/analyseSerie.ts` (`analyserSerie`, `calageDeSerie`, `etirerEnHauteur`, `releveDuMur`, `avisFusion`) | 158 | colle l'analyse, le calage et le relevé | **fonctions d'étape** appelées par l'orchestrateur seul ; les appels de `zones/Releve.tsx` et de `mesures.ts` disparaissent | F3, F6 |
| `facade/releve/casCalibration.ts` (`preparerSurLAssemblage`, `coinsDeSerie`, `etapesDe`, `assemblageDeLaSerie`, `facadeSurLAssemblage`) | 181 | l'enchaînement propre à la calibration | **supprimé** : les états et les images d'étapes viennent de l'orchestrateur | F0 |
| `facade/corpusReel.ts` (`preparerCas`, `calibrer`, la mesure) | 365 | cas, descente des réglages | `preparerCas` → orchestrateur ; la descente (`calibrer`) et la mesure **restent** | F0 |
| `zones/EditeurCasCalibration.tsx`, `EcranCalibration.tsx` | 403+292 | éditeur de cas, étapes | deviennent l'écran de rejeu (frise d'étapes) ; l'enchaînement inline **disparaît** | F0, F2 |
| `zones/CalageSilhouette.tsx` et `zones/releve/AjusterMur.tsx` | 102+135 | **deux composants du même geste** (poser bouts, égout, sol) | **un seul** : l'option manuelle de l'É4 ; l'autre est supprimé | F1 |
| `zones/releve/Coins.tsx`, `EtapeCoins.tsx` | 142+225 | poser 4 repères | **une seule version**, option manuelle de l'É2, pour l'audit, le relevé et la calibration | F3 |
| `zones/Releve.tsx` + `zones/releve/*` (`Visee`, `ChoixMethode`, `PhotosRue`, `ChoixMur`, `Elevation`, `EtapeResultat`, aides, `capteurs`, `commun`, `ouvertures`) | ~1 900 | le relevé : capture + chaîne + éditeur | la capture → l'audit ; la chaîne → l'orchestrateur ; **ce qui reste est l'éditeur** du mur et des ouvertures ; le reste est supprimé (écrans, commandes, aides, CSS, fumée) | F6 |
| `app/releve/releve.ts`, `casDeReleve.ts`, `renfortReleve.ts` | 156+57+150 | écrire le relevé, créer un cas, renfort du relevé | l'écriture → la validation V4 ; `casDeReleve` → « Créer un cas depuis cette façade » ; `renfortReleve` **supprimé** (run unique) | F2, F5, F6 |
| `app/audit/parcelle/mesures.ts`, `redressement.ts`, `rejeu.ts` | 233+… | l'audit calcule sa façade | appellent l'orchestrateur ; leur glue **disparaît** ; « Rejouer » = rejeu de l'orchestrateur | F3 |
| `app/audit/parcelle/entreesRenfort.ts`, `escalade.ts`, `facade/detection/renfort.ts`, `renfortRecalage.ts` | — | les trois passes votées du renfort | remplacées par le run unique ; le **vote ×3 ne reste que comme option du rejeu** (son seul appelant) ; s'il est jugé inutile après mesure (§11), supprimé en bloc | F2, F3 |
| Indicateurs d'étape propres à chaque écran (`zones/releve/AideEtapes.tsx`, les textes « étape n sur m » de l'audit et de la calibration, **pour cet enchaînement**) | — | dire où l'on en est | remplacés par **la barre de progression** unique ; supprimés (à confirmer au `grep`) | F0, F3, F6 |
| `deploy/schema-analyse.json`, `deploy/prompt-analyse.md` (générés) | — | ce que Claude lit et rend | **régénérés** (`npm run regles:generer`) ; un champ qu'aucun lecteur n'utilise est retiré du schéma | F2 |

### 8 bis.3 L'ordre : un consommateur à la fois, du plus sûr au plus exposé

1. **La calibration d'abord** (F0 à F2) : c'est un outil de développeur, sans utilisateur final, qui montre chaque étape. Elle devient
   le **premier consommateur** de l'orchestrateur ; son enchaînement propre est supprimé dans la même PR. Elle sert de banc de non-régression
   pour les deux suivants.
2. **L'audit ensuite** (F3, F4, F5) : il appelle l'orchestrateur, prend le mode discret et le run IA unique ; sa glue (`mesures.ts`) et le
   renfort à trois passes disparaissent.
3. **Le relevé en dernier** (F6) : il ne perd rien tant que l'audit n'a pas l'équivalent. Quand l'audit sait prendre, assembler et valider
   une façade, le relevé devient un éditeur et ses écrans de capture sont supprimés.

Chaque lot a donc **un premier consommateur dans sa propre PR** : aucun morceau n'arrive avant d'être appelé (pas de code « en attente »).
C'est pourquoi un champ du modèle (`dimensions`, `forme`, `textureCalee`) n'est ajouté que **dans le lot qui l'écrit et le lit** (F5), et
l'orchestrateur n'est livré qu'avec la calibration qui l'appelle (F0).

### 8 bis.4 Le bilan de suppression de chaque lot

Chaque PR de lot porte, dans sa description, le tableau suivant, rempli avec les vraies lignes :

| Supprimé | Fichiers | Fonctions / composants | Lignes | Remplacé par |
|---|---|---|---|---|
| … | … | … | … | … |

Et la mention « cliquet des orphelins : liste raccourcie de N entrées », « grep des noms supprimés : vide ».

---

## 9. Étapes de livraison

Chaque lot est livrable seul : CI verte, CHANGELOG (`## [Non publié]`, avec une ligne « Supprimé »), fumée sur les points touchés, PR, merge par
commit de merge. **Chaque lot a un premier consommateur et supprime ce qu'il remplace** (§8 bis). `AE 101` ne bouge pas (`identite.ts`) sauf décision
écrite ; les empreintes golden non plus ; le tableau du banc (redressement, fusion) est identique avant et après.

| Lot | Livre | Supprime, dans la même PR | Critère d'acceptation |
|---|---|---|---|
| **F0 — Orchestrateur + calibration** | L'orchestrateur pur et le type `EtapeFacade` (§4 ter.4), les états d'étape, les objectifs en réglages ; **la calibration devient son premier consommateur** (déterministe) : **barre de progression**, frise d'étapes, images de chaque étape ; le cas d'étalon AE 101 posé au corpus réel (avec sa vraie forme de toit par corps) | `casCalibration.ts` (enchaînement propre), le glue d'`EditeurCasCalibration.tsx`, `preparerCas` de `corpusReel.ts`, les indicateurs d'étape propres à la calibration pour la chaîne | Le rejeu d'un cas du banc donne les mêmes sorties qu'avant ; l'état de chaque étape est calculé ; AE 101 montre la pose actuelle fausse (302 px au lieu de ~610), étape par étape, reproductible |
| **F1 — Calage par ancres** | L'É4 : score d'explication **sans le toit** (angles, égout, sol), règle d'accord/divergence/repli, drapeaux honnêtes ; **un seul composant** de calage manuel (poignées bouts, égout, sol) | `CalageSilhouette.tsx` **ou** `AjusterMur.tsx` (l'un des deux), la silhouette posée avant le calage dans `murSurLAssemblage` | Banc de synthèse : égout 44/44, sol 43/44, silhouette à 2 % ≥ 39/44 (**ne baisse pas**) ; AE 101 : bouts à 3 % près ; aucun drapeau « trouvé » sur une pose qui échoue au test |
| **F2 — Un run IA par façade** | Un schéma unique (calage, forme, `elements`, ouvertures, détails, `carreaux`), une requête par façade, réponse enregistrée ; mode « IA » du rejeu, « Rappeler Claude » (×1, ×3) | `renfortReleve.ts` ; les champs du schéma qu'aucun lecteur n'utilise ; le vote ×3 n'est gardé que comme option du rejeu | Les points de l'IA s'affichent à l'É4, les boîtes et leurs carreaux à l'É7 ; coût et version affichés ; **mesure ×1 contre ×3** (§11) : si le vote n'apporte rien, `renfort.ts` est supprimé dans ce lot |
| **F3 — L'audit sur l'orchestrateur** | L'audit appelle l'orchestrateur ; **mode discret** (V1 à V4, étapes cachées) avec **la même barre de progression** ; « Rejouer » = rejeu de l'orchestrateur ; **une seule version** du geste « 4 repères » | les indicateurs d'étape propres à l'audit, la glue de `mesures.ts`, `entreesRenfort.ts`, `escalade.ts` (si le vote est parti), les appels directs à `analyserSerie`/`calageDeSerie`/`releveDuMur` | Une façade se calcule dans l'audit par l'orchestrateur, à résultat identique ; une étape cachée apparaît dès qu'elle échoue ; trois classes d'écran |
| **F4 — Diagnostic de forme et toit par corps** | Découpage de la façade en tronçons de corps ; diagnostic (taxonomie du §5 bis, variantes) ; propositions confirmées dans l'avant/après ; observations **adressées au corps** par son mur ; `pignons.ts` étendu à tout corps ; alertes de hauteur | l'unique corps principal codé en dur dans `pignons.ts` | Sur AE 101 sud : la proposition juste est faite sur le **bon corps**, décochée ; accepter change le toit **par le moteur seulement** ; hauteurs du LiDAR inchangées ; AE 101 identique sans proposition acceptée |
| **F5 — La Façade et la façade objet** | `dimensions`, `forme`, `textureCalee`, et les ouvertures en objets (`id`, `verifieeLe`, `carreaux` rangés), **écrits à la validation V4**, lus par la 3D, l'inspecteur, le plan, le Mode Toit ; groupes de `protections.ts` ; migration du fichier | les champs du relevé qu'ils remplacent, leurs validateurs et leurs écrivains locaux | Un fichier ancien se relit à l'identique ; aller-retour testé ; un rejeu ne déplace pas une ouverture vérifiée ; empreinte `glb-structure.json` : dite si elle bouge |
| **F6 — Photos dans l'audit** | Prise, redressement, assemblage et rangement des photos de façade dans l'audit ; « Créer un cas depuis cette façade » ; le relevé devient **éditeur** | `zones/Releve.tsx` (la capture et la glue), `Visee`, `ChoixMethode`, `PhotosRue`, `EtapeCoins` (si doublon), leurs aides, commandes, CSS, points de fumée ; `casDeReleve.ts`, la part « capture » de `releve.ts` | Parcours complet sur téléphone, trois classes d'écran ; migration d'un projet existant sans perte ; **plus aucun écran de capture hors de l'audit** |
| **F7 — Éléments découverts** | Cheminées et lucarnes lues sur la ligne du haut, posées par le moteur sur le corps concerné après confirmation | — (ajout) | Un élément n'est jamais à la fois dans la façade objet et dans le toit ; les éléments posés à la main ne bougent pas au rejeu |
| **F8 — Carreaux en 3D** | Les carreaux (`details.carreaux`) dessinés dans les fenêtres de la 3D (`three/detailsBatiment.ts`) | le dessin de fenêtre sans carreaux si le nouveau le remplace | Un fichier sans carreaux se dessine comme avant ; empreinte `glb-structure.json` dite si elle bouge (version majeure) ; vérifié sur la façade d'AE 101 |

Ordre : F0 à F8 dans cet ordre, parce que **chaque lot suppose le précédent** (§8 bis.3). F8 attend que des cas réels aient confirmé le vocabulaire des
carreaux.

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
- **Le cliquet des orphelins** (§8 bis.1, règle 5) : `npm test` échoue sur tout export ou fichier sans importeur dans les dossiers de la migration, et sur une liste d'orphelins autorisés qui ne raccourcit pas quand elle le doit.
- **Le bilan de suppression** est dans chaque PR de lot (§8 bis.4) ; `grep` des noms supprimés : vide.
- **Le moteur de redressement et de fusion ne doit pas bouger** (§4 bis) : les sections « chaîne du relevé » et « fusion de plusieurs vues » du
  banc, `redressementFuites.test.ts`, `mosaiqueFuites`, `fusion`, `voteVues.test.ts` sont identiques avant et après, à la décimale.
- **Pièges de CI** : `max-lines-per-function` 150 ; couches (`tests/unit/architecture.test.ts`) ; exposition des commandes
  (`app/exposition.ts`, trois classes d'écran) ; contrôles classés (`controlesInterface.ts`) ; `exactOptionalPropertyTypes`.
- **Fumée** : un point nouveau pour la barre de progression et la frise de calibration, un pour la prise dans l'audit (la barre y est aussi) ; points existants touchés : 54, 58, 59, 62,
  63, 65, 67 (chaîne des façades) et 24 (GLB, fenêtres).
- **Garde-fou de zones** : tout calque qui suit la caméra ou l'image se tient hors du rendu de React (nœud stable, contenu écrit à la main)
  pour ne pas faire échouer la comparaison des clés de version (`zones/composants/abonnement.ts`).

---

## 11. Risques et questions ouvertes

1. **Le haut de l'image est la donnée la plus fragile** : colombages, ardoise, arbre, ciel couvert. Le score d'explication peut échouer
   sur des façades réelles que le banc de synthèse ne montre pas ; d'où le repli (§5.4) et le geste de confirmation. *À mesurer sur les
   premiers cas réels.*
2. **Un seul run, plus de vote** : une boîte ou un carreau inventé n'est plus filtré par trois passes. L'accord avec le déterministe et la
   grille remplace le vote, et les boîtes seules restent décochées. *À mesurer au rejeu (×1 contre ×3) avant de retirer le vote
   du mode par défaut.* Et l'IA peut se tromper de manière corrélée (les trois passes verraient la même erreur) : le déterministe doit pouvoir
   dire « non » (verticale absente à l'angle annoncé).
2 bis. **Carreaux** : le vocabulaire (vantaux, grille, petits bois, imposte) est posé avant le moindre cas réel ; il se complétera. Enregistrer
   sans dessiner (F8) évite de figer un rendu avant de savoir ce que l'IA lit juste.
3. **Le coût** d'une passe de plus par façade : plafond serveur et mesure (§8).
4. **Les photos** sont des données personnelles : ce qui entre dans le dépôt (corpus) et ce qui part vers le serveur d'analyse doit être
   décidé cas par cas. *Question ouverte : y a-t-il un format réduit (recadrage de la façade seule) accepté pour le corpus ?*
5. **Façade objet : granularité.** Un objet par ouverture (proposé) ou un objet par façade qui porte sa liste ? Le premier simplifie les
   rejeux et l'inspecteur ; le second reste plus proche du fichier actuel. *À trancher avant F5.*
6. **Fenêtres automatiques sur un mur relevé** : aujourd'hui aucune. Faut-il en poser sur les parties **non vues** d'un mur relevé (un
   mur à moitié caché par une haie) ? Hors périmètre de cette spec.
7. **Le Mode Toit** (`spec-mode-toit-3d.md`) montre déjà un profil de façade à l'échelle (essai, branche `claude/profil-facade-essai`,
   non fusionné). Faut-il le fusionner avec la forme de la Façade (§3.2) ou l'abandonner ? *Proposition : le reprendre une fois F5 posé,
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
12. **Migration en trois consommateurs** : l'ordre calibration, audit, relevé (§8 bis.3) évite les ponts, mais le relevé garde son code tant que l'audit n'a pas
    l'équivalent : il ne doit rien perdre en route (parcours, cas particuliers). *Chaque lot commence par un `grep` qui relève ce que l'ancien chemin fait et que le
    nouveau doit refaire.*
13. **Le cliquet des orphelins est un test d'imports, pas un analyseur** : un import dynamique ou un export utilisé dans son seul fichier lui échappe ; ceux-là se
    déclarent à la main, et le bilan de suppression de la PR reste le filet.
14. **Deux chemins de capture** : le relevé garde son entrée tant que F6 n'est pas livré ; la chaîne est commune et l'enchaînement unique (F3), donc seule
    l'**interface** de capture coexiste, jusqu'à la suppression de F6.

---

## 12. Glossaire et plan du code

- **Mur** : un côté du contour, de `pts[cote]` à `pts[cote+1]`. **Façade** : l'enregistrement qui le décrit (§3.2).
- **Assemblage** : l'image redressée et fusionnée des photos d'un mur ; l'image prise pour la suite.
- **Silhouette du corps** : le haut d'un mur d'un seul corps (`silhouetteDuCorps`), celle du Mode Toit ; le repère des corrections (§5 ter).
- **Silhouette de la façade complète** : ce que la photo montre, toutes les silhouettes de corps visibles projetées, la plus haute l'emportant
  (`silhouetteDeFace`) ; le gabarit en est la forme normalisée (§5 ter).
- **Gabarit** : la silhouette de la façade complète en parts de la largeur (`u`) et de l'égout (`v`), du plan et du LiDAR (`gabaritDesCorps`).
- **Silhouette lue** : le haut du mur lu sur l'image, comparé à la silhouette de la façade complète (`triangle`, `trapeze`, `rampe`, `ligne-droite`, `marches`, `plusieurs-sommets`).
- **Façade objet** : les ouvertures hors automatique d'une façade (§3.3).
- **État d'étape** : `ok`, `a-confirmer`, `echec`, `saute` ; dérivé de l'objectif de l'étape, jamais enregistré comme vérité (§4 ter.1).
- **Mode d'audit** : `cache`, `resume` ou `valider` ; un réglage d'affichage de l'audit, la calibration montre tout (§4 ter.3).
- **Point de validation** : V1 le mur, V2 le toit, V3 les ouvertures, V4 la façade (§4 ter.3).
- **Run IA** : l'unique requête par façade qui rend le calage, la forme, les éléments de toit, les ouvertures et leurs carreaux (§8).
- **Carreaux** : la division du vitrage d'une ouverture (vantaux, grille, petits bois, imposte), lue par l'IA et rangée dans `details.carreaux`.
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
