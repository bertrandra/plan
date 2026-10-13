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
```

- Le tableau sort en Markdown sur la sortie standard : il se colle tel quel dans une PR.
- `--images` écrit trois PNG par scène, à regarder avec l'outil de lecture d'images :
  - `<scène>-photo.png` : la photo, avec les coins vrais (croix vertes), les coins proposés par le
    relevé (croix jaunes), les coins prédits par le calage grossier avec les capteurs typiques et
    leurs zones de recherche (croix et rectangles cyan) ;
  - `<scène>-elevation.png` : l'élévation parfaite, avec la vérité (vert) et la détection (rouge) ;
  - `<scène>-redressee.png` : l'élévation redressée par `analyserReleve`, mêmes couleurs.
- Avant / après : lancer avec `--json` sur `main` (un worktree détaché suffit) puis sur la branche,
  et comparer scène par scène (`vp`, `fp`, `fn`, `cotes`, `detectees`).

Le code : `tests/banc/facades/` (`synthese.ts` le générateur, `mesure.ts` les mesures, `banc.ts` le
rejeu et le tableau), le script `scripts/banc.ts` de ce skill, le corpus `tests/fixtures/facades/`.

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
`zones/releve/serie.ts::coinsDePrise`, avec la distance, le cap et l'attitude au déclenchement ; le
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
- **Prise** :
  - `camera` : un sténopé à `distance` m du milieu du mur, `biais` (degrés, positif à droite),
    `ecartCap` (visée décentrée), `tangage`, `roulis`, `oeil` (1,5 m), `focale35`, `bruit`, `flou`.
    `focaleConnue: false` donne à l'analyse les 67° par défaut (pas d'EXIF). `distanceConnue: false`
    donne le cadre à 12 %. `hauteurEstimee` est la hauteur que croit l'application (BD TOPO).
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

## 6. Pièges

- **Moiré** : la photo lit l'élévation au plus proche voisin, à 1 cm. Sur la brique, cela fait des
  moirés, comme un vrai capteur. Ce n'est pas un défaut du générateur.
- **Recouvrement à 50 % pile** : il ne compte pas (« plus de 50 % »). Une baie avec ses volets
  battants est pile à la limite.
- **Coins proposés bruts** : le banc compare `coinsDuReleve` tel quel. `zones/releve/serie.ts`
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
