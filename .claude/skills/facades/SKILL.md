---
name: facades
description: Banc d'essai des façades (calage des photos et détection des ouvertures) : générateur de façades de synthèse difficiles, corpus tests/fixtures/facades/, script de mesure (précision, rappel, cotes, coins proposés, calage grossier et zones de recherche, calage fin) et chiffres de départ. À charger avant de toucher à src/facade/detection.ts, facade/analyse.ts (coinsProposes, mesurerHauteur, analyserReleve), facade/calage.ts, facade/calageFin.ts, facade/segments.ts, facade/pointsFuite.ts, facade/homographie.ts ou facade/mosaique.ts, avant tout lot de calage ou de détection (L6 à L15 du plan), et pour lancer le banc et lire son tableau.
---

# Banc de façades

La référence est `MD/spec-facades-calage-detection.md` (§2.2 : les limites L1 à L11 ; §14 : banc et
critères ; §16 : étapes). Le plan de mise en œuvre (`MD/plan-mise-en-oeuvre-audit.md`, lot **L5**) a
monté ce banc **avant** toute modification de la détection : sans chiffres de départ, aucun lot ne
peut montrer qu'il améliore quelque chose.

## 0. Impératifs

1. **Le tableau avant et après.** Toute PR qui touche au calage ou à la détection lance le banc sur
   `main` puis sur sa branche, et colle les deux tableaux (au moins les lignes « Ensemble » et les
   objectifs) dans la description de la PR.
2. **Les images d'origine restent justes à 1 ou 2 cm.** Les scènes `00-existante-enduit` et
   `01-existante-pignon` reprennent les images des tests d'origine (`facade.test.ts`,
   `analyse.test.ts`). `tests/unit/facade/banc.test.ts` exige 100 % de précision et de rappel et
   2 cm au plus sur chaque cote, sur l'élévation comme sur la photo.
3. **Des règles générales, jamais une scène réglée.** Une amélioration qui ne gagne que sur une
   scène, et en perd ailleurs, n'en est pas une. On ne retouche pas une scène pour faire passer un
   détecteur : le corpus est la vérité. Pour montrer un cas nouveau, on **ajoute** une scène.
4. **Le banc mesure, il ne règle pas.** Il rejoue `facade/detection.ts` et `facade/analyse.ts` tels
   qu'ils sont, sans réglage à lui.
5. Le circuit du dépôt s'applique (CLAUDE.md). Le banc ne touche ni aux toits ni aux quantités :
   AE 101 et les empreintes golden ne bougent pas.

## 1. Lancer le banc

```bash
npx tsx .claude/skills/facades/scripts/banc.ts                     # tout le corpus (15 s environ)
npx tsx .claude/skills/facades/scripts/banc.ts brique ombres       # les scènes dont le nom contient l'un des mots
npx tsx .claude/skills/facades/scripts/banc.ts --json /tmp/facades/apres.json   # le détail
npx tsx .claude/skills/facades/scripts/banc.ts --images /tmp/facades            # images de contrôle
npx tsx .claude/skills/facades/scripts/banc.ts --ecrire-coins      # après un changement de prise
npx tsx .claude/skills/facades/scripts/banc.ts --sans-renfort      # sans la section du renfort de Claude (§5 bis)
npx tsx .claude/skills/facades/scripts/simuler-claude.ts           # réécrit les réponses simulées de Claude (§5 bis)
```

- Le tableau sort en Markdown sur la sortie standard : il se colle tel quel dans une PR.
- `--images` écrit trois PNG par scène, à regarder avec l'outil de lecture d'images :
  - `<scène>-photo.png` : la photo, avec les coins vrais (croix vertes), les coins proposés par le
    relevé (croix jaunes), les coins prédits par le calage grossier avec les capteurs typiques et
    leurs zones de recherche (croix et rectangles cyan) ;
  - `<scène>-elevation.png` : l'élévation parfaite, avec la vérité (vert) et la détection (rouge) ;
  - `<scène>-redressee.png` : l'élévation redressée par `analyserLeMur` (la chaîne de production), mêmes couleurs.
- Avant / après : lancer avec `--json` sur `main` (un worktree détaché suffit) puis sur la branche,
  et comparer scène par scène (`vp`, `fp`, `fn`, `cotes`, `detectees`).

Le code : `tests/banc/facades/` (`synthese.ts` le générateur, `mesure.ts` les mesures, `banc.ts` le
rejeu et le tableau, `renfort.ts` le renfort de Claude, `png.ts` l'écriture des images), les scripts
`scripts/banc.ts` et `scripts/photos.ts` de ce skill, le corpus `tests/fixtures/facades/` et ses
réponses simulées `tests/fixtures/facades/claude/`.

**Depuis le 24 octobre 2026, le banc joue la chaîne de production** (`facade/analyseMur.ts::analyserLeMur`, celle de l'audit, du
relevé et de la calibration) au lieu de `analyserReleve` / `analyserVues` : une photo passe par son assemblage (redressée entière par
ses points de fuite, sinon par ses coins), plusieurs vues par l'assemblage puis leur fusion.

- Mesurée telle quelle, la chaîne faisait moins bien que `analyserReleve` sur une photo seule : précision 93 → 92 %, corrections
  1,8 → 1,9 par façade, une fausse baie de plus sur `12`, des cotes de 1 à 3 cm plus larges sur `00`, `01`, `09` et `21` (7 cm
  sur `21`, au-delà des 5 cm que garde `banc.test.ts`). La photo passait par son assemblage déjà rééchantillonné.
- Corrigé dans la chaîne (`analyseMur.ts::photoCommeAssemblage`) : une photo seule se redresse en une passe depuis la photo
  d'origine, le mur posé par les mêmes coins. Le tableau redevient celui de `analyserReleve`, scène par scène (précision 93 %,
  rappel 91 %, cotes 1 cm, 1,8 correction par façade) ; la fusion de vues (`16` à `19`) ne change pas.

## 1 bis. Mesurer les façades relevées (lot G11)

```bash
npx tsx .claude/skills/facades/scripts/mesures.ts                 # le corpus : vérité → relevé (80 s environ)
npx tsx .claude/skills/facades/scripts/mesures.ts garage brique   # quelques scènes
npx tsx .claude/skills/facades/scripts/mesures.ts --verite        # la vérité seule, instantané
npx tsx .claude/skills/facades/scripts/mesures.ts tests/fixtures/audit-parcelle/   # des audits de parcelle
```

`model/mesureFacade.ts::mesurerFacade` lit un relevé (ouvertures, grille du lot L15, largeur, hauteur,
partie basse) et rend ce que la spec §15.1 demande de mesurer, dans les termes de la disposition
automatique (`facade/ouvertures.ts`), pour que les profils (G12) et le taux de conformité (G13) les
comparent :

- **fenêtres** (type `fenetre` seul) : largeur, hauteur et appui médians ; l'appui compte depuis le
  plancher supposé de leur niveau (étage × hauteur d'un niveau, 2,70 m sous deux niveaux) ;
- **entraxe** : écart médian des centres de deux baies voisines d'une rangée, garages exclus (la porte
  y est : la disposition automatique la pose à la place d'une fenêtre) ;
- **part vitrée** (fenêtres et portes-fenêtres sur la surface du mur, la partie basse d'un mur en L
  retirée) et **part des baies** (toutes, portes et garages compris) ;
- **baies par niveau**, hauteur d'un niveau (écart médian des linteaux), **porte** (gauche, centre,
  droite ; « alignée » sous une baie d'étage), **garage**, **aveugle** ;
- **type** : `rue` (photo de rue, `sourceDistance: 'rue'`), `pignon` (le toit simple du cas figé
  monte au-dessus du mur, pas à hauteur constante), `arriere` (le mur qui tourne le dos à la rue),
  sinon inconnu ; **côté voisin** quand un autre bâtiment est à moins d'un mètre du milieu du mur
  (`facade/contexteFacade.ts`). La rue l'emporte sur le pignon : un pignon sur rue porte les baies de
  la rue.

Sur le corpus, la vérité est mesurée avec la grille que le relevé calculerait, puis ce que la chaîne du
relevé retient (ouvertures cochées, hauteur retenue). Au 14 octobre 2026 (20 scènes) : écart médian de
1 cm sur la largeur, la hauteur et l'appui des fenêtres, 0,5 cm sur l'entraxe, 0,3 point sur la part
vitrée ; baies par niveau justes 15/20, porte 16/20, garage 17/20. Les écarts restants viennent tous de
la détection sur une vue (voiture prise pour un garage en `07`, `16`, `18` ; tablier fermé en `06`) :
la mesure, elle, ne règle rien. `tests/unit/facade/mesuresBanc.test.ts` garde la vérité de chaque scène
et la chaîne de `02` au centimètre.

`tests/fixtures/audit-parcelle/` ne porte qu'un exemple **synthétique** (façades des scènes `02` et
`19`, un pignon aveugle contre un garage voisin) : les vrais audits de parcelle viendront du corpus
partagé (lot L21) et s'y rangeront tels quels.

## 1 ter. Les profils de façades (lot G12)

La disposition automatique des ouvertures (`facade/ouvertures.ts`) lit ses dimensions et ses seuils
dans `regles/facades/reglages.json` (spec §15.2) : les `seuils` sont le **profil par défaut** (les
constantes d'avant), les `profils` en surchargent quelques-uns. Le banc ne les touche pas : il mesure
la détection et le calage, pas la disposition automatique.

- **Un profil naît d'un écart mesuré** sur des façades relevées (G13), jamais d'une intuition, et cite
  ces façades (`cas`). Un profil par PR (G14).
- **Vocabulaire fermé** : `departements`, `epoque` (année de `date_d_apparition`, plage `min` compris,
  `max` exclu), `usages` (`usage_1`), `etages` (plage), `mitoyennete` (`aucune`, `partielle`,
  `forte`). Le plus précis l'emporte ; deux profils de même précision qui peuvent se rencontrer font
  refuser le fichier (`tests/unit/model/reglagesFacades.test.ts`).
- **Changer le fichier** : ajouter à `LECTURES_FACADES` (`regles/facades/reglages.ts`) la ligne
  `{ version: n + 1, reglages: '<empreinte>' }` que le test donne. Les projets ouverts rechoisissent
  alors leurs profils en tâche de fond (`app/profilsFacadesFond.ts`), sauf la parcelle du projet et
  les bâtiments vérifiés sur place.
- **Les empreintes golden** : seule `glb-structure.json` voit les fenêtres (point de fumée 24). Un
  profil qui la fait bouger est un changement de version majeure (`MD/RELEASE.md`, `EMPREINTES.md`).
  Les mitoyens de la démonstration ne sont pas sur la parcelle du projet : un profil qui s'y applique bouge le GLB.
- Profils d'essai pour les tests : `tests/fixtures/regles-facades/profils-essai.json` (pas dans
  `tests/fixtures/facades/`, que le banc lit comme des scènes).

## 2. Lire le tableau

Trois sections, puis les objectifs.

**Détection seule** : `detecterOuvertures` sur l'**élévation parfaite**, vue de face, à 100 px/m,
voiture et haie peintes dans le plan du mur. C'est ce que vaut la détection quand le calage est
parfait.

**Chaîne du relevé** : `analyserReleve` sur la **photo**, avec les **coins vrais** : mesure de la
hauteur par la perspective, redressement, détection. L'écart avec la section précédente vient du
redressement (rééchantillonnage, flou) et de la hauteur mesurée.

| Colonne | Sens |
|---|---|
| Vraies, Trouvées | ouvertures de la vérité, ouvertures rendues par la détection |
| VP, FP, FN | retrouvées, fausses, manquées. Une vraie est retrouvée si une détectée la recouvre à **plus de 50 %** (intersection sur union), appariement un à un du meilleur recouvrement au moins bon |
| Précision, Rappel | VP / Trouvées, VP / Vraies ; « — » quand le dénominateur est nul |
| Cotes méd. | médiane des écarts absolus de x, y, l et h des ouvertures retrouvées, en cm |
| Types justes | ouvertures retrouvées au bon type (`classer`) |
| Corrections | gestes estimés : une par fausse (retirer), par manquée (ajouter), par retrouvée dont une cote s'écarte de plus de 5 cm (déplacer, redimensionner), par retrouvée au mauvais type |

La ligne **Ensemble** cumule les ouvertures de toutes les scènes (précision et rappel sur le total,
médiane sur toutes les cotes), et donne la moyenne des corrections par façade.

**Calage** : pour les prises par caméra, l'erreur de chacun des quatre coins proposés par le
relevé (haut gauche, haut droit, bas droit, bas gauche) : `facade/calage.ts::coinsDuReleve`, comme
`facade/releve/serie.ts::coinsDePrise`, avec la distance, le cap et l'attitude au déclenchement ; le
cadre à 12 % sans distance. Le coin proposé est ramené dans le plan du mur par l'homographie vraie,
et l'écart au vrai coin est donné en cm sur le mur. « ∞ » : un coin proposé au-delà de l'horizon du
mur. Un coin à **10 cm au plus** compte pour « trouvé sans geste ». La hauteur est celle que retient
`analyserReleve` moins la vraie : « mesurée » par la perspective si la focale est donnée, « estimée »
(la hauteur d'entrée) sinon.

**Calage grossier de l'audit** (lot L6) : `calageGrossier` depuis la prise de vue située (position,
azimut, inclinaison, roulis, focale), d'abord avec des **capteurs exacts** (ce que vaut le modèle
sténopé seul), puis avec des **capteurs typiques** (`CAPTEURS_BANC` dans `tests/banc/facades/banc.ts` :
boussole à 5°, GPS à 2 m pour 5 m annoncés, attitude à 1°, signes tirés de la graine, sans hasard).
« Dans la zone » : les coins vrais qui tombent dans leur zone de recherche. Les capteurs typiques
servent aussi au relevé (cap et attitude) : c'est ce qu'un téléphone donne vraiment.

**Calage fin** (lot L7) : `facade/calageFin.ts` sur la photo, depuis la prise du relevé
(`calageFinDuReleve` : distance mesurée, cap et attitude typiques) puis depuis celle de l'audit
(`calageFin` : GPS, boussole et attitude typiques). Pour chaque coin rendu, son erreur en cm sur le
mur et sa source : sans marque, **trouvé** sur les arêtes de la photo (plein dans l'éditeur) ; « p »,
**prédit** (en pointillé : pied caché, égout de pignon sans arête). La note de l'hypothèse retenue (de 0
à 1, seuil 0,5), et l'erreur de l'azimut lu sur les points de fuite (« — » : la boussole est gardée,
le point de fuite horizontal étant trop flou, ce qui arrive presque de face). Sous le seuil, les coins
rendus sont ceux du calage grossier, tous prédits. « Pleins justes » : parmi les coins pleins, ceux
qui sont à 10 cm au plus — un coin plein faux coûte plus cher qu'un pointillé, car on ne le vérifie
pas. Depuis le lot L7, la ligne « Coins trouvés sans geste » des objectifs lit le calage fin du relevé :
ce sont ses coins que l'éditeur propose.

**Distorsion du grand-angle** (lot L8) : pour chaque prise dont la focale équivalente connue est sous
20 mm (ou dont l'objectif déforme), `facade/distorsion.ts` comme le relevé l'appelle. Le banc rejoue
la chaîne **avec** la correction (c'est ce que montrent les autres sections) et **sans** elle, et
écrit les deux côte à côte (« avant → après ») : coefficient vrai et estimé, arêtes presque verticales
retenues, leur écart à la droite (sur la photo, puis sur l'image corrigée, où elles sont détectées à
nouveau), rappel, précision, cotes, hauteur, coins du calage fin. L'erreur d'un coin rendu sur l'image
corrigée se mesure sur le sténopé vrai : la correction estimée est défaite, puis la distorsion vraie
de l'objectif retirée, ce qui ne favorise pas la correction.

**Fusion de plusieurs vues** (lot L13) : pour chaque scène qui porte des `vues` (d'autres prises du mur
entier), `facade/fusion.ts::analyserVues` sur toutes les vues, coins vrais décalés de `decalageCoins`
pixels sur les vues de plus, comparée à la chaîne du relevé sur la seule vue principale (« une vue →
fusion ») : rappel, précision, corrections ; part du mur cachée sur la vue principale (vérité du
générateur, `cacheDepuis`) et, parmi ces pixels, ceux que l'élévation montre comme le mur (à moins de
30 niveaux du mur peint sans obstacle) ; masque restant ; recalage trouvé pour chaque vue de plus.
Depuis le recalage ORB + RANSAC (octobre 2026), `analyserVues` recale les vues par des points ORB
(`facade/orb.ts`) et une similitude RANSAC (`facade/ransac.ts`), acceptée seulement si elle tient les
`CRITERES_FUSION` de `facade/recalageOrb.ts` (points communs, part d'inliers, échelle, rotation,
erreur, déplacement, corrélation). Le banc ne doit pas baisser : ensemble 80 % → 100 % de rappel,
80 % → 96 % de précision, 2,8 → 0,3 correction par façade, 13 % → 59 % de rendu au mur (c'est le
chiffre de l'ancien recalage en deux dimensions, retrouvé). Seuil RANSAC 4 px et erreur 3,5 px : à 2,5 px
la scène `18-` (deux vues seulement) n'était plus fusionnée. L'audit de la parcelle redresse **toutes** les
photos d'une façade (`app/audit/parcelle/mesures.ts`, verticales sous `SEUIL_VERTICALES_DEG`) et les fusionne dès deux
photos sans échec ; « Rejouer redressement + fusion » (liste de contrôle) refait ces dérivés sans toucher
aux photos ni aux corrections manuelles (`FacadeCapturee.corrections`).
**Vote entre vues** (`facade/voteVues.ts`) : chaque vue du groupe fusionné est aussi lue seule ; une baie de la fusion
que plusieurs vues voient mais que peu retrouvent (une haie, une voiture) perd de la confiance (`VOTE`), une baie
retrouvée par toutes en gagne un peu, une baie que plusieurs vues voient et que la fusion a ratée est ajoutée. Le banc de
synthèse n'a plus de faux positif à retirer sur les scènes à vues : le gain se juge sur le **corpus réel** (ci-dessous).

**Calibrer depuis l'admin** (`?admin&ecran=calibration`, `facade/corpusReel.ts::calibrer`) : des photos prises dans l'écran, annotées,
puis une descente par coordonnée sur les réglages nommés de `detection.ts` et `structure.ts` ; le résultat s'enregistre dans
`data/admin/calibration.json` (`admin/calibration`) et se superpose aux valeurs livrées (`regles/facades/surcharges.ts`), sans jamais
les remplacer dans le dépôt. Un seuil qui se justifie sur plus de vingt cas validés peut ensuite être reporté dans le code.

**Redressement par les points de fuite** (`facade/redressementFuites.ts`, `facade/mosaiqueFuites.ts`, `facade/releve/coinsAuto.ts::coinsAutoDeSerie`,
octobre 2026) : pour la calibration, où les photos réelles montrent rarement le mur entier. Chaque photo est tournée de face par
ses points de fuite vertical et horizontal (rotation pure K R K⁻¹, focale d'un téléphone supposée, sans coins ni distance), les vues
redressées s'assemblent par ORB + RANSAC de similitude à échelle libre (et, sous 15 points communs, une corrélation de la partie
commune), le mur est lu sur la mosaïque (égout : plus longue horizontale du haut ; pied : plus basse longue horizontale, à au moins le
cinquième de la largeur sous l'égout), puis ses coins sont reportés dans chaque photo. Depuis la version 7 de la chaîne, l'audit et le relevé passent aussi par
l'assemblage (`facade/analyseMur.ts::analyserLeMur`). Sur les 4 cas du bac à sable (Hardencourt,
16 photos) : 16/16 redressées (contre 1 aux coins trouvés), deux cas fusionnés entièrement. Ce qui reste fragile : un mur sans
gouttière nette (véranda), et un cas qui mélange plusieurs murs. `tests/unit/facade/redressementFuites.test.ts` le garde sur les
scènes `08` et `16`. Le banc des façades (`banc.ts`) joue `analyserLeMur` (la chaîne de production) avec les coins vrais ; la recherche du mur
sur l'assemblage, elle, se mesure par `egout-sol.ts`, et le toit par `toit-facade.ts`.

**L'égout et le sol sur l'assemblage** (`facade/releve/coinsAuto.ts::murSurLAssemblage`, `facade/mosaiqueFuites.ts::affinerEgoutEtSol`,
octobre 2026) : après le redressement par les repères ou les points de fuite (audit, calibration), le mur se cherche sur l'assemblage.
`npx tsx .claude/skills/facades/scripts/egout-sol.ts [mots] [--images dossier]` le mesure sur les scènes à prise par caméra. Chaque
scène est redressée par ses points de fuite, puis par quatre repères aux coins de sa première ouverture. Un bord est juste à 2 % de la
largeur du mur près.
- Départ : égout 8/40, sol 24/40. Les arêtes prenaient le haut des tuiles et un bandeau d'étage.
- Après l'affinage par la teinte du mur : égout 37/40, sol 37/40, bouts 78/80.
- Avec la silhouette du haut du mur lue sur l'image (`mosaiqueFuites.ts::silhouetteDuMur`, a ne pas confondre avec
  `regles/toits/silhouetteDesCorps.ts::silhouetteDuMur`, celle des corps du LiDAR), sur 22 scènes dont deux pignons ajoutés (`22`, `23`) : égout 44/44, sol
  43/44, silhouette à 2 % 39/42. La colonne « Silhouette » du tableau est le plus grand écart, sur 21 colonnes, à la vraie.
- Restent le pignon sous l'ombre d'un arbre (`11`) et le grand-angle à forte distorsion (`13`).

`tests/unit/zones/coinsAuto.test.ts` garde `02`, `03`, `07` et `18` à 2 %. Le banc des façades (`banc.ts`) pose les coins vrais : il ne joue pas cette recherche.

**Le gabarit** (`facade/gabaritMur.ts`) : la silhouette du plan et du LiDAR, une forme fixe. `egout-sol.ts` pose le gabarit vrai de
chaque scène, comme le LiDAR le donnerait : égout 44/44, sol 43/44, gabarit posé à 2 % 39/44. L'écart du gabarit vient de l'égout et
du sol trouvés. Le profil lu pour caler un sol caché a été essayé, puis retiré : il dégradait la rampe `23`.

**Le toit par la silhouette.** `npx tsx .claude/skills/facades/scripts/toit-facade.ts [mots]` compare, scène par scène, le toit lu
par la bande au-dessus de l'égout (l'avis de la photo seule) et celui que dit le gabarit vrai de la scène, posé entre les vrais coins
(ce que le LiDAR donnerait). Pignons justes
(forme, hauteur à 10 %) : 1/3 par la bande, 3/3 par la silhouette ; les murs gouttereaux (silhouette plate) gardent la bande.

**Corpus réel** (`tests/fixtures/facades-reel/`, `scripts/reel.ts`, `tests/banc/facades/reel.ts`) : photos réelles
annotées, mesure avec et sans fusion + vote, et **fiabilité de la confiance** (un 0,8 doit valoir 80 % de baies justes).
Sur le banc de synthèse (120 baies), l'écart de calibration est de 0,03 mais la tranche 0,6–0,8 ne vaut que 38 % de baies
justes pour une confiance moyenne de 0,70 (8 baies, surtout des devinées) : à confirmer sur le réel avant de toucher à la formule.
Les scènes `16-` à `18-` sont faites pour cela : chaque partie cachée sur une vue se voit sur une
autre, sauf ce qui est caché partout (le milieu de la voiture de `16-`), qui doit finir dans le masque.

**Objectifs** (spec §14, première version) : 70 % des coins sans geste, rappel d'au moins 85 %,
précision d'au moins 90 %, erreur médiane des cotes de 5 cm au plus, moins de trois corrections par
façade. Ils se lisent sur la chaîne du relevé.

## 3. Le corpus

Une scène par fichier JSON dans `tests/fixtures/facades/`, rendue à la demande. Aucun tirage n'est
séquentiel : le bruit, les briques, les pierres et les feuilles passent par un hachage de la position
et de la graine. Le rendu est donc identique d'une machine à l'autre, et le corpus ne porte aucune
image.

```jsonc
{
  "nom": "03-brique-volets-battants",
  "description": "…",
  "difficultes": ["brique", "volets-battants", "biais"],
  "verite": {
    "largeur": 9, "hauteur": 5.6,            // le mur, du sol à l'égout, en mètres
    "coins": [{ "x": …, "y": … }, …],        // sur la photo : HG, HD, BD, BG (écrits par --ecrire-coins)
    "ouvertures": [
      { "type": "fenetre", "x": 6.6, "y": 0.9, "l": 1.2, "h": 1.3,   // x depuis la gauche, y = appui
        "rendu": { "volets": { "type": "battants", "couleur": [70, 112, 92] } } }
    ]
  },
  "synthese": {
    "graine": 3, "bruit": 4,
    "mur": { "parement": { "type": "brique", … }, "soubassement": …, "bandeaux": […], "pignon": …, "toit": …, "degrade": … },
    "balcons": […], "ombres": […], "devant": […],
    "prise": { "type": "camera", "distance": 11, "biais": 12, "tangage": 5, "focale35": 26, "largeurPx": 1280, "hauteurPx": 960, … }
  }
}
```

- **La vérité** est la baie de maçonnerie, dormant compris. Les volets battants sont **à côté**
  d'elle (ouverts contre le mur) et n'en font pas partie. Le coffre d'un volet roulant est
  **au-dessus** d'elle et n'en fait pas partie (spec §11 : il est retiré de la hauteur). Une
  porte-fenêtre d'étage reste une `porte-fenetre`, même si `classer` la prend pour une fenêtre.
- **Parements** : `enduit` (taches lissées), `brique` (22 × 5,5 cm, joints de 1 cm, appareil
  décalé), `pierre` (assises et longueurs tirées, joints clairs ; sert au soubassement et à la
  meulière).
- **Ombres** : `debord` (bande sous l'égout, pente possible), `quad` (un polygone), `arbre` (un
  houppier troué de lumière), et l'ombre d'un balcon. Une ombre multiplie la couleur : elle garde la
  chromaticité (spec §9 C).
- **Devant** : `voiture` et `haie`, de vrais plans à `recul` mètres du mur. Sur la photo, ils
  cachent ce qu'ils cachent selon le point de vue.
- **Vues** (lot L13) : `synthese.vues`, d'autres prises `camera` du mur entier (de biais, d'un autre
  endroit) ; leurs coins se calculent (`coinsVrais(s, vue)`), `decalageCoins` les décale de quelques
  pixels comme des coins posés au doigt. `photographier(s, px, vue)` les rend.
- **Prise** :
  - `camera` : un sténopé à `distance` m du milieu du mur, `biais` (degrés, positif à droite),
    `ecartCap` (visée décentrée), `tangage`, `roulis`, `oeil` (1,5 m), `focale35`, `bruit`, `flou`.
    `focaleConnue: false` donne à l'analyse les 67° par défaut (pas d'EXIF). `distanceConnue: false`
    donne le cadre à 12 %. `hauteurEstimee` est la hauteur que croit l'application (BD TOPO).
    `distorsion` (lot L8) : le barillet de l'objectif, en forme **polynomiale** (un point du sténopé
    au rayon r, en demi-diagonales, tombe au rayon r (1 + k r²)) ; volontairement pas la forme
    « division » de la correction, pour que le banc paie l'écart entre l'objectif et le modèle.
    `verite.coins` est alors sur la photo déformée (`coinsVrais`), `coinsStenope` donne ceux du
    sténopé.
  - `coins` : l'homographie des tests d'origine, donnée par ses quatre coins.
- **Ajouter une scène** : copier la plus proche, changer `nom` (préfixe numéroté), `graine` et ce qui
  la rend difficile, lancer `--ecrire-coins`, regarder les PNG de `--images`, puis lancer le test
  `banc.test.ts`. Garder les ouvertures dans le mur (`y + h` ≤ `hauteur`).
- **Photos réelles** (à venir, lots L19 et L21) : la même `verite` (coins posés, ouvertures
  corrigées), avec la photo réduite à côté au lieu de `synthese`. Il faudra un décodeur JPEG côté
  Node, que le dépôt n'a pas encore.

## 4. Chiffres de départ

Mesurés le 13 octobre 2026 sur `main` (`33f6d69`), avant tout lot de détection.

| Critère (chaîne du relevé) | Objectif | Départ |
|---|---|---|
| Coins trouvés sans geste | 70 % | **0 %** (0/40, médiane 146 cm) |
| Rappel | ≥ 85 % | **65 %** |
| Précision | ≥ 90 % | **78 %** |
| Erreur médiane des cotes | ≤ 5 cm | **1 cm** |
| Corrections par façade | < 3 | **4,2** |

Le tableau complet :

#### Détection seule (élévation parfaite, `detecterOuvertures`)

| Façade | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cotes méd. (cm) | Types justes | Corrections |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 00-existante-enduit | 3 | 3 | 3 | 0 | 0 | 100 % | 100 % | 0 | 3/3 | 0 |
| 01-existante-pignon | 3 | 3 | 3 | 0 | 0 | 100 % | 100 % | 0 | 3/3 | 0 |
| 02-enduit-uni-face | 6 | 6 | 6 | 0 | 0 | 100 % | 100 % | 0 | 6/6 | 0 |
| 03-brique-volets-battants | 6 | 6 | 2 | 4 | 4 | 33 % | 33 % | 8 | 2/2 | 10 |
| 04-soubassement-pierre-bandeau | 6 | 3 | 3 | 0 | 3 | 100 % | 50 % | 0 | 3/3 | 3 |
| 05-ombres-debord-balcon | 6 | 2 | 2 | 0 | 4 | 100 % | 33 % | 4 | 2/2 | 5 |
| 06-volets-roulants-ton-sur-ton | 6 | 5 | 5 | 0 | 1 | 100 % | 83 % | 6 | 5/5 | 6 |
| 07-voiture-haie-devant | 8 | 7 | 6 | 1 | 2 | 86 % | 75 % | 0 | 6/6 | 4 |
| 08-prise-de-biais-forte | 6 | 6 | 4 | 2 | 2 | 67 % | 67 % | 0 | 4/4 | 7 |
| 09-focale-inconnue-grand-angle | 6 | 6 | 6 | 0 | 0 | 100 % | 100 % | 0 | 6/6 | 0 |
| 10-meuliere-garage-ton-sur-ton | 7 | 6 | 6 | 0 | 1 | 100 % | 86 % | 5,5 | 6/6 | 7 |
| 11-pignon-ombre-arbre | 3 | 2 | 0 | 2 | 3 | 0 % | 0 % | — | — | 5 |
| **Ensemble** (12) | 66 | 55 | 46 | 9 | 20 | **84 %** | **70 %** | **0** | 46/46 | **3,9** / façade |

#### Chaîne du relevé (photo, coins vrais, `analyserReleve`)

| Façade | Vraies | Trouvées | VP | FP | FN | Précision | Rappel | Cotes méd. (cm) | Types justes | Corrections |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 00-existante-enduit | 3 | 3 | 3 | 0 | 0 | 100 % | 100 % | 0 | 3/3 | 0 |
| 01-existante-pignon | 3 | 3 | 3 | 0 | 0 | 100 % | 100 % | 0 | 3/3 | 0 |
| 02-enduit-uni-face | 6 | 6 | 6 | 0 | 0 | 100 % | 100 % | 1 | 6/6 | 0 |
| 03-brique-volets-battants | 6 | 6 | 3 | 3 | 3 | 50 % | 50 % | 0,5 | 3/3 | 7 |
| 04-soubassement-pierre-bandeau | 6 | 3 | 3 | 0 | 3 | 100 % | 50 % | 1 | 3/3 | 3 |
| 05-ombres-debord-balcon | 6 | 2 | 2 | 0 | 4 | 100 % | 33 % | 3,5 | 2/2 | 5 |
| 06-volets-roulants-ton-sur-ton | 6 | 5 | 5 | 0 | 1 | 100 % | 83 % | 5 | 5/5 | 6 |
| 07-voiture-haie-devant | 8 | 7 | 5 | 2 | 3 | 71 % | 63 % | 1 | 5/5 | 5 |
| 08-prise-de-biais-forte | 6 | 6 | 1 | 5 | 5 | 17 % | 17 % | 1 | 1/1 | 10 |
| 09-focale-inconnue-grand-angle | 6 | 6 | 6 | 0 | 0 | 100 % | 100 % | 1,5 | 6/6 | 3 |
| 10-meuliere-garage-ton-sur-ton | 7 | 6 | 6 | 0 | 1 | 100 % | 86 % | 0 | 6/6 | 6 |
| 11-pignon-ombre-arbre | 3 | 2 | 0 | 2 | 3 | 0 % | 0 % | — | — | 5 |
| **Ensemble** (12) | 66 | 55 | 43 | 12 | 23 | **78 %** | **65 %** | **1** | 43/43 | **4,2** / façade |

#### Calage (`coinsProposes`, hauteur retenue par `analyserReleve`)

| Façade | Coins proposés (cm : HG, HD, BD, BG) | Coins justes | Hauteur (cm) | Temps (ms) |
|---|---|--:|--:|--:|
| 00-existante-enduit | — | — | 0 (estimée) | 471 |
| 01-existante-pignon | — | — | 0 (estimée) | 545 |
| 02-enduit-uni-face | 150, 150, 127, 127 | 0/4 | 0 (mesurée) | 867 |
| 03-brique-volets-battants | 181, 71, 105, 104 | 0/4 | 0 (mesurée) | 944 |
| 04-soubassement-pierre-bandeau | 99, 317, 179, 153 | 0/4 | 0 (mesurée) | 943 |
| 05-ombres-debord-balcon | 197, 115, 130, 129 | 0/4 | 0 (mesurée) | 1167 |
| 06-volets-roulants-ton-sur-ton | 127, 253, 147, 146 | 0/4 | 0 (mesurée) | 1004 |
| 07-voiture-haie-devant | 176, 114, 120, 117 | 0/4 | 0 (mesurée) | 1677 |
| 08-prise-de-biais-forte | 464, 87, 111, 220 | 0/4 | 0 (mesurée) | 1030 |
| 09-focale-inconnue-grand-angle | 1336, 776, 230, 429 | 0/4 | +10 (mesurée) | 887 |
| 10-meuliere-garage-ton-sur-ton | 98, 153, 106, 110 | 0/4 | 0 (mesurée) | 1034 |
| 11-pignon-ombre-arbre | 232, 135, 160, 169 | 0/4 | 0 (mesurée) | 866 |
| **Ensemble** | médiane **146,3** | **0/40** | médiane **0** | |

#### Objectifs de la première version (spec §14), sur la chaîne du relevé

| Critère | Objectif | Mesuré | |
|---|---|---|---|
| Coins trouvés sans geste (≤ 10 cm) | 70 % | 0 % | non atteint |
| Rappel | ≥ 85 % | 65 % | non atteint |
| Précision | ≥ 90 % | 78 % | non atteint |
| Erreur médiane des cotes | ≤ 5 cm | 1 cm | atteint |
| Corrections par façade | < 3 | 4,2 | non atteint |

### Après le lot L6 (calage grossier)

Mesuré le 13 octobre 2026 sur `claude/lot-L6-calage-grossier`. La détection ne change pas : les deux
premières sections sont identiques à celles du départ.

| Critère | Départ | Après L6 |
|---|---|---|
| Coins du relevé, médiane | 146 cm | **36 cm** |
| Coins du relevé sans geste (≤ 10 cm) | 0/40 | **4/40** |
| Calage grossier, capteurs exacts | — | **36/40**, médiane 0 cm (tous sauf `09`, focale inconnue) |
| Calage grossier, capteurs typiques | — | 0/40, médiane 148 cm |
| Coins vrais dans leur zone de recherche | — | **40/40** |

#### Calage (coins proposés par le relevé)

| Façade | Coins proposés (cm) | Coins justes |
|---|---|--:|
| 02-enduit-uni-face | 9, 50, 34, 30 | 1/4 |
| 03-brique-volets-battants | 17, 45, 22, 37 | 0/4 |
| 04-soubassement-pierre-bandeau | 8, 60, 48, 19 | 1/4 |
| 05-ombres-debord-balcon | 17, 50, 27, 37 | 0/4 |
| 06-volets-roulants-ton-sur-ton | 9, 54, 39, 23 | 1/4 |
| 07-voiture-haie-devant | 19, 53, 33, 39 | 0/4 |
| 08-prise-de-biais-forte | 209, 86, 95, 230 | 0/4 |
| 09-focale-inconnue-grand-angle | 693, 392, 283, 485 | 0/4 |
| 10-meuliere-garage-ton-sur-ton | 7, 53, 36, 27 | 1/4 |
| 11-pignon-ombre-arbre | 22, 28, 19, 36 | 0/4 |
| **Ensemble** | médiane **36,3** | **4/40** |

#### Calage grossier de l'audit

| Façade | Exacts (cm) | Justes | Typiques (cm) | Justes | Dans la zone |
|---|---|--:|---|--:|--:|
| 02-enduit-uni-face | 0, 0, 0, 0 | 4/4 | 56, 100, 99, 43 | 0/4 | 4/4 |
| 03-brique-volets-battants | 0, 0, 0, 0 | 4/4 | 302, 186, 193, 311 | 0/4 | 4/4 |
| 04-soubassement-pierre-bandeau | 0, 0, 0, 0 | 4/4 | 198, 352, 346, 204 | 0/4 | 4/4 |
| 05-ombres-debord-balcon | 0, 0, 0, 0 | 4/4 | 103, 98, 60, 85 | 0/4 | 4/4 |
| 06-volets-roulants-ton-sur-ton | 0, 0, 0, 0 | 4/4 | 158, 81, 84, 139 | 0/4 | 4/4 |
| 07-voiture-haie-devant | 0, 0, 0, 0 | 4/4 | 65, 168, 138, 12 | 0/4 | 4/4 |
| 08-prise-de-biais-forte | 0, 0, 0, 0 | 4/4 | 157, 97, 91, 163 | 0/4 | 4/4 |
| 09-focale-inconnue-grand-angle | 621, 498, 313, 403 | 0/4 | 1862, 541, 248, 1371 | 0/4 | 4/4 |
| 10-meuliere-garage-ton-sur-ton | 0, 0, 0, 0 | 4/4 | 195, 428, 409, 195 | 0/4 | 4/4 |
| 11-pignon-ombre-arbre | 0, 0, 0, 0 | 4/4 | 126, 81, 69, 117 | 0/4 | 4/4 |
| **Ensemble** | médiane **0** | **36/40** | médiane **147,9** | **0/40** | **40/40** |

Ce qu'ils disent :

- **Le relevé** gagne surtout par l'**inclinaison** : le tangage de 5 à 10° des scènes décalait les
  coins centrés de plus d'un mètre. Ce qui reste vient de l'erreur de la boussole sur le biais (5°
  font environ 40 cm au bout d'un mur de 10 m vu à 12 m) et de l'arrondi de l'attitude au degré
  (20 cm à 12 m). Sans le cap, la médiane serait de 50 cm et aucun coin juste : le cap aide, même
  faux de 5°, parce que la visée reste sur le milieu du mur.
- **Le calage grossier de l'audit** est exact quand les capteurs le sont : le modèle sténopé est le
  bon. Avec des capteurs réels, il se trompe d'un à quatre mètres, parce que 2 m de GPS et 5° de
  boussole déplacent l'image du mur latéralement. Il ne suffit donc **jamais seul** (spec §5) : ses
  zones de recherche, qui contiennent tous les coins vrais, bornent le calage fin (lot L7).
- **Focale inconnue** (`09`) : avec les 67° par défaut sur un 16 mm, même la prise exacte est fausse
  de plusieurs mètres. La zone de recherche, élargie de ±50 % sur la focale, contient pourtant les
  coins vrais.

### Après le lot L7 (calage fin)

Mesuré le 13 octobre 2026 sur `claude/lot-L7-calage-fin`, avec la scène `12-haie-pied-cache-roulis`
ajoutée (une haie sur toute la largeur cache le pied ; biais, roulis, visée décentrée, hauteur du
cadastre trop forte de 10 %). La détection ne change pas.

| Critère | Après L6 | Après L7 |
|---|---|---|
| Coins proposés par le relevé sans geste (≤ 10 cm) | 4/44, médiane 38 cm | **44/44**, médiane 0,5 cm |
| dont pleins (trouvés sur la photo) | — | 40, tous justes ; 4 prédits (pied caché de `12`, égout de `03`), justes aussi |
| Calage fin de l'audit, capteurs typiques | 0/44 (grossier), médiane 132 cm | **44/44**, médiane 0,6 cm |
| Azimut corrigé par le point de fuite | — | 10 prises sur 11, erreur médiane 0,1° (`11` : horizontales trop rares sur le pignon, boussole gardée) |
| Temps (Node, photo de 1 280 px) | — | 100 à 270 ms, dont 50 à 90 pour les segments |

Rejoué aussi avec des capteurs bien pires que `CAPTEURS_BANC` (boussole à 15°, GPS à 6 m, attitude à
3°) : 44/44 dans les deux cas, aucun coin plein faux. Sur une photo sans mur (fond uni avec une
fenêtre), la fenêtre n'est pas prise pour la façade : la position qu'elle suppose sort de
l'incertitude de la prise, et les coins restent prédits.

Ce qu'ils disent, et ce qu'ils ne disent pas :

- **Le corpus est synthétique** : des arêtes nettes, un ciel et un gazon unis, un objectif à 1,5 m
  exactement. Un vrai mur mitoyen, un arbre devant un angle, une gouttière qui déborde ou un trottoir
  en pente feront baisser ces chiffres. Les règles sont générales (segments, points de fuite, contraste
  et chromaticité, hauteur de l'objectif), aucune n'est réglée sur une scène ; les photos réelles des
  audits (lots L19 et L21) diront ce qu'elles valent.
- **Le pied caché** est prédit d'après la hauteur de l'objectif (1,5 m) et la place de la caméra que
  donnent les deux côtés trouvés : juste au centimètre ici, il ne l'est qu'à la hauteur réelle du
  téléphone près (10 à 20 cm). C'est pourquoi il reste en pointillé.
- **L'égout d'un mur sous une bande de tuiles** se distingue du faîte de la bande parce que le dedans
  d'un côté doit avoir la chromaticité du mur ; l'ombre d'un débord, qui assombrit le mur sans changer
  sa teinte, ne trompe pas ce test, mais la limite de l'ombre perd contre le vrai égout parce que son
  dehors a encore la teinte du mur.
- **Focale inconnue** (`09`) : les coins sont trouvés malgré les 67° par défaut ; la hauteur mesurée,
  elle, reste fausse de la focale (spec §4).

### Après le lot L8 (distorsion du grand-angle)

Mesuré le 13 octobre 2026 sur `claude/lot-L8-distorsion`, avec trois scènes ajoutées : `13` (13 mm à
5 m, barillet de 15 % au coin), `14` (16 mm de biais, barillet de 7 %), `15` (13 mm déjà corrigé par
le téléphone, le témoin). Les treize scènes d'avant donnent exactement les mêmes chiffres : aucune
n'est sous 20 mm de focale connue (`09` est un 16 mm, mais sans EXIF : l'application croit 26 mm et
n'y touche pas).

| Scène | k vrai → estimé | Arêtes verticales (px) | Cotes méd. | Coins du calage fin (cm) |
|---|---|---|---|---|
| `13` | −0,15 → −0,19 | 1,23 → 0,25 | 6 → 1 cm | 10, 167, 109, 28 → 2, 2, 1, 2 |
| `14` | −0,07 → −0,075 | 0,63 → 0,25 | 1 cm | 4, 4, 4, 3 → 0, 1, 0, 1 |
| `15` | 0 → 0,003 (non corrigée) | 0,28 | 1 cm | 0, 0, 2, 1 |

- L'estimation prend 40 à 60 ms sur une photo de 1 280 px (traces, puis une grille sur k1).
- Sur les treize scènes sans distorsion, le meilleur k1 reste sous 0,05 et le gain sous 1,5 : aucune
  ne serait corrigée, même si sa focale était connue sous 20 mm.
- Le k1 estimé (forme division) ne vaut pas celui du générateur (forme polynomiale) : le meilleur
  accord entre les deux formes dépend du rayon. Ce qui compte, ce sont les arêtes redevenues droites et
  les coins.
- La mesure s'appuie sur la **ligne médiane** de chaque trace (le barycentre par rangée de pixels) :
  sur les pixels bruts, l'épaisseur de l'arête, que la correction d'un barillet étire au bord de
  l'image, faisait préférer un coefficient de mauvais signe.

### Après le lot L14 (candidats ouvertures)

Mesuré le 13 octobre 2026 sur `claude/lot-L14-candidats` (empilée sur L13), sans scène ajoutée.
Chaîne du relevé, avant → après :

| Critère | Objectif | Avant (L13) | Après |
|---|---|---|---|
| Rappel | ≥ 85 % | 71 % | **90 %** |
| Précision | ≥ 90 % | 84 % | **93 %** |
| Erreur médiane des cotes | ≤ 5 cm | 1 cm | 1 cm |
| Corrections par façade | < 3 | 3,2 | **1,9** |

Détection seule : précision 88 → 95 %, rappel 75 → 91 %. Les scènes d'origine (`00`, `01`, `02`) et
les grands-angles (`13` à `15`) gardent toutes leurs ouvertures, sans fausse.

- **Le code** : `facade/detection.ts` enchaîne ; `detectionCartes.ts` (réduction à 5 cm, morphologie,
  taches, médianes glissantes par histogrammes) ; `detectionFond.ts` (objets nets mis de côté, fond de
  rang, fond local, seuils zone par zone, écart de teinte seule) ; `detectionIndices.ts` (ombre,
  gradients et soutien des arêtes, volets battants, affinage) ; `reglagesDetection.ts` (les seuils
  nommés `facades.detection.*`, avec leur raison). `detecterOuvertures(img, px, vu, { reglages })`
  accepte des surcharges : pour essayer un seuil sur le banc, jamais pour régler une scène.
- **Fond local** : le fond de rang (bande de 50 cm sur toute la largeur) fait du soubassement, du
  bandeau, de l'ombre du débord le fond de leur rang (`04`) ; le fond local se lit sur 1,5 m de large
  et la hauteur du rang. Une fenêtre carrée, à 20 cm d'un soubassement uni, en prenait la teinte pour
  l'enduit au-dessus et recollait les fenêtres au soubassement.
- **Teinte seule** : sur la meulière (`10`), le grain de la pierre (luminance) relève le seuil d'écart
  de couleur au point de couper le haut des vitrages, bleutés ; l'écart de chromaticité a son propre
  seuil et les rend entiers.
- **Ombre** : un pixel plus sombre de même chromaticité que son fond est retiré avant les taches ; le
  vitrage dans l'ombre garde la sienne (`05`, `11`). Une tache d'ombre seule n'est gardée que si ses
  deux tableaux sont des arêtes franches (porte grise sur enduit gris).
- **Volets battants** : trois segments de colonnes, deux volets unis de même teinte d'environ la
  moitié de la baie ; le bord de la baie est la première colonne qui ne ressemble plus au volet, et il
  en faut une près de chaque coupure (sinon c'est un meneau entre deux vantaux) (`03`, `08`, `11`).
- **Brique** (`03`) : une ouverture d'un pixel avant la fermeture coupe les joints qui soudaient les
  baies entre elles ; l'affinage veut un bord tenu sur 3 cm de suite (un joint fait 1 cm).
- **Petites taches** : sous 0,4 m², quatre arêtes nettes sont exigées (roue, touffe de haie).
- **Ce qui reste** : le ton sur ton du tablier de volet roulant (`06`, la baie à 40 % fermée est à la
  limite des 50 % de recouvrement, perdue sur l'élévation seule) et le coffre sont pour L15 ; les
  occlusions d'une seule vue (`07`, `12`, `16` à `18`) relèvent de la fusion (L13). La détection prend
  150 à 200 ms par élévation (contre 100 ms avant).

### Après le lot G17 (détails des ouvertures)

Mesuré le 14 octobre 2026 sur `claude/g17-details-ouvertures-3d`, avec la scène
`20-details-cintres-persiennes-garde-corps` ajoutée (plein cintre, persiennes fermées au pas de 7 cm,
balcon, œil-de-bœuf, garde-corps sans dalle). Les vingt scènes d'avant gardent leurs chiffres au
centimètre près ; seuls les faux « cintre » de `07` et `17` disparaissent.

- **La section « Détails des ouvertures »** du tableau : pour les volets, l'allège et la forme, les
  détails lus justes sur vrais, puis ceux lus à tort (là où il n'y a rien, un autre, ou sur une
  détection fausse). La vérité est `synthese.ts::detailsVrais` : le rendu de la scène (volets
  battants, roulants, persiennes ; un tablier fermé aux neuf dixièmes compte fermé), ses balcons
  (avec dalle : `balcon` ; `epaisseur: 0` : `garde-corps`), `rendu.forme` (`cintre`, `rond`) ; une
  ouverture vraie peut imposer ses `details`. Le générateur peint les baies cintrées (plein cintre,
  ou arc de flèche 0,4 h sur une baie basse) et rondes, et les persiennes.
- **Chiffres** (chaîne du relevé, 21 scènes) : volets 11/16 (les roulants ton sur ton de `06` ne
  sont jamais lus ; un « battants » de trop sur la haie de `12`), allège 1/3 (le balcon et le
  garde-corps de `20` ne sont pas lus sur la photo ; sur l'élévation, le balcon est pris pour un
  garde-corps), forme 2/2 sans faux (avant : un faux « cintre » sur `07`, deux sur l'élévation avec
  `17`).
- **Le faux cintre** : une baie posée sur une haie plus large qu'elle fait une tache en T, dont le haut
  « descend » d'un coup ; `formeDeTache` refuse désormais une marche franche loin des tableaux
  (`facades.classement.cintreBordPart`, `cintreMarcheMaxPart`).
- **Photos de synthèse au navigateur** : `npx tsx .claude/skills/facades/scripts/photos.ts <scène>
  <dossier>` écrit les vues d'une scène en PNG et leurs coins vrais (`coins.json`). La fumée s'en sert
  (points 68, 80, 81) : de vraies prises, coins posés au doigt, plutôt que des dessins au canevas. Au
  navigateur, l'œil-de-bœuf de `20` n'est pas toujours lu « rond » (mur de la maison de 10,14 m, coins
  au pixel près) : la forme ronde d'une petite baie reste fragile.

### Après le lot « ébrasements » (baies en retrait)

Mesuré le 18 octobre 2026 sur `claude/fuite-fenetres`, avec la scène `21-ebrasements-profonds-biais`
ajoutée (pierre calcaire, baies en retrait de 40 cm, prise à 35° de biais, fenêtres du rez-de-chaussée à
hauteur d'œil). Le générateur pose une baie en retrait (`rendu.ebrasement`) : la vitre au fond, les quatre
faces entre le nu du mur et elle, rendues au lancer de rayons (leurs arêtes fuient vers la normale du mur).

- **Points de fuite** : malgré les arêtes des ébrasements, le calage fin reste à 4/4, azimut à 0°. Un reflet
  dans une vitre ne trompe pas non plus : un miroir plan garde les directions parallèles au mur, le reflet
  d'une façade d'en face vise le même point de fuite. Rien à changer dans `pointsFuite.ts` tant que le banc
  ne montre pas d'erreur.
- **Détection** : la face d'ébrasement visible était retirée par le filtre d'ombre (même teinte, autre
  luminosité) et la baie se réduisait à la vitre. `facade/detectionEbrasements.ts` étend la baie sur une bande
  unie, de la teinte du mur, collée à **un seul** côté (deux côtés : des volets ou le mur). Seuls les côtés se
  lisent : une ligne le long du linteau ne traverse qu'une assise, et un grand bloc de pierre uni y prenait
  l'aspect d'une face (élévation de la scène 21). Scène 21, chaîne du relevé : cotes 11,5 → **4 cm**,
  corrections 6 → **4**, 6/6 sans fausse ; les 21 autres scènes identiques, élévation et photo.
- **Ce qui reste** : le dessous du linteau et le dessus de l'appui (vus quand l'objectif est loin au-dessous
  ou au-dessus de la baie) ne s'ajoutent pas encore ; une colonne de transition entre la vitre et la face
  (l'arête vive) est tolérée, pas deux.

### Essai : la photo en haute définition pour redresser, fusionner et détecter

Mesuré le 18 octobre 2026 sur `main` (6ca4cff), sans rien changer au dépôt : les 22 scènes rejouées avec des
photos de synthèse à deux fois plus de pixels (`largeurPx` et `hauteurPx` des scènes doublés, `pxParM` du
rendu à 200). Question posée : relever sur la photo HD gardée sur l'appareil, et ne stocker et envoyer à
Claude que les copies réduites, est-il plus précis ?

- **A** (en service) : photo de 1 280 px (`COTE_PHOTO_MAX_PX`), élévation à 1 024 px au plus.
- **B** : photo de 2 560 px, élévation gardée à 1 024 px.
- **C** : photo de 2 560 px, élévation à 2 048 px au plus et 200 px/m (`resolutionTexture`).

| | A (1 280) | B (HD) | C (HD + élévation 2 048) |
|---|---|---|---|
| Photo seule : précision / rappel | 95 % / 91 % | 95 % / 92 % | 95 % / 92 % |
| Chaîne du relevé : précision / rappel | 93 % / 90 % | 92 % / 90 % | 93 % / 90 % |
| Corrections par façade | 2,0 | 2,1 | 1,9 |
| Calage fin, écart médian | 0,6 cm | 0,4 cm | 0,4 cm |
| Fusion de vues : corrections restantes | 0,3 | 0,3 | 0,8 |
| Temps par scène (PC), médiane / pire | 1,5 s / 6 s | 3,8 s / 12 s | 4,7 s / 18 s |

- **Pas de gain utile** : le calage gagne 2 mm sur un écart déjà sous le centimètre ; la détection travaille
  sur des cartes réduites à 5 cm le pixel (`PX_PAR_M`) et ne voit pas les pixels de plus. Les écarts sont
  de ±1 baie sur trois scènes, dans les deux sens (`03`, `12`, `16`).
- **La fusion se dégrade** avec une élévation plus fine (C) : 0,8 correction restante au lieu de 0,3.
- **Le coût** : temps × 2,5 à 3 sur un PC, mémoire de décodage × 4 ; sur un téléphone, c'est le relevé qui
  ralentit.
- **Décision** : on garde 1 280 px pour la photo, 1 024 px pour l'élévation et pour Claude. Le banc ne
  mesure ni le JPEG, ni le bruit, ni les détails fins d'une vraie photo : si la lecture des détails
  (petits bois, ouvrant) bute un jour sur la résolution, la piste est un recadrage HD de chaque baie
  pour Claude, pas une chaîne entière en HD.

### Façades sans ombres (Vue 3D)

Mesuré le 19 octobre 2026 (`facade/sansOmbres.ts`, réglages `facades.texture.*` dans
`facade/regles/facades/texture.ts`). Chaque scène est rendue deux fois, avec et sans ses ombres (ombres
portées, ombres des balcons, dégradé) ; on compare la texture du relevé corrigée à celle du mur sans
ombre, sur le mur hors des baies.

| Scène | Mur entier | Dans l'ombre |
|---|---|---|
| 05 débord et balcon | 17,1 → 9,5 % | 34,3 → 13,8 % |
| 11 ombre d'un arbre | 6,8 → 3,1 % | 35,1 → 14,7 % |
| 02 enduit uni (petite ombre) | 1,1 → 1,0 % | 19,9 → 17,9 % |
| 04 soubassement en pierre, 10 meulière, 03 brique | 0 → ≤ 0,5 % | — |

- **Ce qui a été essayé et écarté** : une fenêtre d'éclairage de 0,3 m suivait les pierres d'une meulière
  (1,8 % d'écart sur un mur sans ombre) ; 0,5 m ne corrigeait plus les petites ombres ; 0,4 m est retenu.
  Un test du grain du parement (écart type relatif) pour reconnaître une pierre bloquait aussi les ombres
  pommelées d'un arbre : retiré au profit de la règle du soubassement (une bande sombre sur la moitié de la
  largeur au moins, depuis le pied).
- **Liserés** : le gain ne porte jamais un pixel au-delà du mur au soleil (+5 %), à 5 cm et au pixel ;
  sans ce plafond, le côté éclairé du bord d'une ombre s'éclaircissait en un trait blanc.
- **Ce qui reste** : un ourlet pâle au bord net d'une ombre (une fenêtre de 0,4 m), le motif d'une ombre
  pommelée très atténué mais visible, et une petite ombre (moins d'une fenêtre) à peine corrigée.

## 5. Ce que disent les chiffres de départ

- **Coins proposés (L1)** : aucun coin à moins de 10 cm, même de face (`02`). `coinsProposes`
  suppose le téléphone d'aplomb et le mur centré. Un tangage de 6° à 12 m décale déjà le mur de
  1,3 m. Sans focale (`09`), l'erreur dépasse 13 m. C'est le terrain des lots L6 et L7 (voir
  « Après le lot L6 » ci-dessus).
- **Hauteur mesurée** : juste au centimètre quand la focale est vraie. Avec les 67° par défaut sur
  un 16 mm (`09`), elle reste à 10 cm, mais cela suffit à faire sortir des cotes de la tolérance
  de 5 cm (trois corrections).
- **Volets battants (L10)** : la baie et ses deux volets forment une seule tache, deux fois trop
  large. Le recouvrement est de 50 % tout juste, donc la baie n'est pas retrouvée (`03`, `08`, `11`).
- **Ombres (L5)** : l'ombre du débord colle aux fenêtres d'étage, et l'ombre du balcon colle à la
  baie du dessous. Les taches fusionnent et sont écartées (`05` : rappel de 33 %). Les houppiers
  d'arbre font des taches de la taille d'un garage (`11`).
- **Soubassement en pierre (L4)** : la teinte unique du mur relève le seuil, et les fenêtres et la
  porte du rez-de-chaussée disparaissent (`04`).
- **Ton sur ton (L7)** : un tablier baissé raccourcit la baie, et un tablier presque fermé la fait
  disparaître (`06`). Sur la meulière, les petits bois et la pierre raccourcissent les fenêtres
  d'environ 40 cm (`10`). La porte de garage couleur pierre n'est pas vue.
- **Occlusions (L6)** : la voiture se fond avec la porte de garage en une baie de 5,3 m, et la haie se
  fond avec la fenêtre qu'elle cache en un « garage » (`07`).
- **Ce qui marche** : un enduit uni, des baies sombres, une prise de face (`00`, `01`, `02`). Les
  cotes des baies retrouvées sont au centimètre : c'est le rappel et la précision qu'il faut gagner,
  pas la précision des bords.

## 5 bis. Le renfort de Claude (lot L18)

Le script ajoute une section **« Renfort de Claude »** au tableau (`--sans-renfort` la retire) :
l'algorithme seul (chaîne du relevé, coins vrais), puis avec les trois passes **simulées** de
`tests/fixtures/facades/claude/<scène>.json`, votées (`facade/renfort.ts`) puis appliquées
(`facade/renfortRecalage.ts`) comme dans le relevé et l'audit.

- **Les réponses sont simulées, pas celles de Claude** : `tests/banc/facades/renfort.ts` imite ses
  erreurs typiques de façon déterministe (coins à quelques dixièmes de repère, boîtes à 10–20 cm
  près, une passe qui oublie ou hésite, une fenêtre inventée dans deux passes sur trois d'un mur nu,
  une autre dans une seule). Elles mesurent le **recalage des graines**, pas Claude. Les vraies
  réponses viendront du corpus des audits (lots L19, L21) et prendront leur place, au même format.
- **Écrire les réponses** : `npx tsx .claude/skills/facades/scripts/simuler-claude.ts [mots]`, après
  avoir ajouté ou changé une scène. Elles portent les ouvertures numérotées du jour (`ouverturesPlan`)
  ; le banc les renumérote sur la détection du moment, par recouvrement.
- **Lire la section** : Boîtes = graines votées → ajoutées cochées (dont vraies) / en pointillé (dont
  vraies) / baies devinées confirmées / rejetées ; Retirées = fausses détections écartées (dont
  vraiment fausses) ; Coins = erreur des graines en cm sur le mur, brutes puis recalées (« r » :
  rejetée, le coin de l'algorithme reste).
- **Chiffres du 14 octobre 2026** (20 scènes) : rappel 89 % → 96 %, précision 93 % → 96 %,
  corrections 1,8 → 1,4 par façade ; 14 graines de boîtes → 7 ajoutées cochées (7 vraies), 4 en
  pointillé (3 vraies), 3 rejetées ; 4 retraits, tous justes ; coins : 27 cm (médiane) bruts, 0,3 cm
  recalés, 64 sur 80 rattachés, 57 à 10 cm au plus.
- **Ce qui reste fragile** : sur la brique et la meulière (`03`, `10`), une graine de coin se rattache
  parfois à un mauvais croisement (30 à 40 cm) ; le pied caché par une haie (`12`, `17`) aussi. Un
  coin recalé ne remplace dans le relevé qu'un coin **prédit** : jamais un coin trouvé ni posé au doigt.
- `tests/unit/facade/bancRenfort.test.ts` rejoue `07` et `18` : aucune fausse baie cochée, la
  fenêtre inventée rejetée, les corrections jamais en hausse.

## 6. Pièges

- **Une seule chaîne** : l'audit (`app/audit/parcelle/mesures.ts`), le relevé (`zones/Releve.tsx`) et la calibration
  (`zones/EditeurCasCalibration.tsx`, `facade/corpusReel.ts`) redressent, fusionnent et cotent par `facade/releve/chaine.ts`
  (coins, replis, report, fusion) et `facade/analyseMur.ts` (une photo, des morceaux, des vues). Un repli, un seuil ou une
  étape de plus s'y ajoute, jamais dans un écran : `tests/unit/zones/chaine.test.ts` vérifie que le relevé et la calibration
  rendent le même mur. Le banc, lui, appelle `analyserReleve` et `analyserVues` directement : il mesure l'algorithme seul.
  La lecture du mur sur l'assemblage des vues (`lireSurLAssemblage`) ne sert qu'à la calibration : à l'audit, elle comptait
  des coins pour trouvés et posait le relevé tout seul (point 62 de la fumée).
- **Moiré** : la photo lit l'élévation au plus proche voisin, à 1 cm. Sur la brique, cela fait des
  moirés, comme un vrai capteur. Ce n'est pas un défaut du générateur.
- **Recouvrement à 50 % pile** : il ne compte pas (« plus de 50 % »). Une baie avec ses volets
  battants est pile à la limite.
- **Coins proposés bruts** : le banc compare `coinsDuReleve` tel quel. `facade/releve/serie.ts`
  ramène ensuite les coins hors cadre dans une marge de 20 %, ce qui ne change rien à l'erreur
  au-delà de cette marge.
- **Repère du calage** : le générateur pose le mur de (0, 0) à (largeur, 0), la rue vers -Y ; le
  calage lit ce repère comme celui du plan (Y au nord) : la façade regarde au sud (azimut 180). Le
  roulis positif est horaire vu de derrière le téléphone, comme `shell/boussole.ts`.
- **Temps** : une seconde environ par scène (peinture, photo, analyse). Le test unitaire n'en rejoue
  que quelques-unes ; le script les rejoue toutes.
- **Coordonnées** : sur la photo, le pixel (i, j) couvre [i, i + 1] × [j, j + 1], comme dans
  `redresser`. Le point principal est au centre de l'image, comme le suppose `mesurerHauteur`.
- **Calage fin, horizon** : la limite du gazon et du ciel derrière le mur est une droite qui vise
  le point de fuite horizontal ; prise pour le pied, elle donne un quadrilatère aux bonnes proportions.
  C'est la hauteur de l'objectif qu'il suppose (le birapport avec le point de fuite vertical) qui
  l'écarte : un objectif posé au sol. Ne pas retirer ce terme de la note.
- **Calage fin, de face** : l'azimut se lit mal sur les horizontales presque parallèles (3° ne
  penchent l'égout que d'un degré) ; `azimutParPointFuite` garde alors la boussole. Les coins, eux, se
  trouvent quand même : les droites sont ajustées sur leurs pixels, pas imposées par le point de fuite.
