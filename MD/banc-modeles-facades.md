# Banc des modèles sur la lecture des façades (Haiku, Sonnet, Opus)

Mesure du **30 octobre 2026**, sur la lecture **5.1.0** : le prompt et le schéma du run d'une façade (`deploy/prompt-facade.md`
v2, `deploy/schema-facade.json` v2) et les règles qui lisent la réponse (`facade/regles/facades/ia.ts`, `regles/facades/ia.json`), tels
qu'au commit **1ea13701** (Version 5.1.0) et sans changement jusqu'à **a863b05a** (main du 30 octobre, livraison 5.1.0). Ce document
mesure ; il ne recommande rien. Le choix du modèle de production reste au propriétaire.

**Rien ne change en production.** Le modèle de l'usage `facade` reste `claude-haiku-5-5` (`MODELE_PAR_USAGE`,
`deploy/analyse-fonctions.php`), et ni le prompt, ni le schéma, ni les règles ne bougent.

## 1. Les mesures

| Modèle | Identifiant | Run | Branche (commit) | Coût réel du run¹ |
|---|---|---|---|--:|
| Haiku 1 | `claude-haiku-5-5` | [40998593930](https://github.com/bertrandra/plan/actions/runs/40998593930) | `main` (1ea13701) | 0,169 $ |
| Haiku 2 | `claude-haiku-5-5` | [41012308826](https://github.com/bertrandra/plan/actions/runs/41012308826) | `claude/garde-fou-lecture` (9e3bc2be)² | 0,163 $² |
| Haiku 3 | `claude-haiku-5-5` | [41014104555](https://github.com/bertrandra/plan/actions/runs/41014104555) | `claude/garde-fou-lecture` (222fc16e)² | 0,163 $² |
| Sonnet 1 | `claude-sonnet-5-5` | [41019772877](https://github.com/bertrandra/plan/actions/runs/41019772877) | `claude/mesure-modeles-facades` (91868c77)³ | 1,503 $ |
| Sonnet 2 | `claude-sonnet-5-5` | [41020570412](https://github.com/bertrandra/plan/actions/runs/41020570412) | `claude/mesure-modeles-facades` (91868c77)³ | 1,499 $ |
| Opus 1 | `claude-opus-5-5` | [41021369128](https://github.com/bertrandra/plan/actions/runs/41021369128) | `claude/mesure-modeles-facades` (91868c77)³ | 2,781 $ |
| Opus 2 | `claude-opus-5-5` | [41022323955](https://github.com/bertrandra/plan/actions/runs/41022323955) | `claude/mesure-modeles-facades` (91868c77)³ | 2,735 $ |

1. Le coût journalisé par le serveur pour le run entier : les requêtes de vérification (analyse, run d'une façade, PLU, jardin, au
   modèle choisi) et la mesure ×1 / ×3. Les quatre runs Sonnet et Opus ont coûté **8,52 $** en tout.
2. Les runs Haiku 2 et 3 viennent de la branche du garde-fou de la lecture (PR #513), au même code de lecture que main : cette branche
   ne touche qu'au workflow, au comparateur et à sa référence. On n'en garde que la **première mesure**, avant la relance du
   garde-fou, et le coût indiqué est celui de cette première mesure (la relance a coûté en plus).
3. **La branche de mesure `claude/mesure-modeles-facades` ne sera jamais fusionnée.** Elle part de main (a863b05a) et ne change que
   trois choses, nécessaires pour faire tourner le workflow avec Sonnet et Opus :
   - `PLAFOND_MAX` de `scripts/verifier-api-claude.mjs` relevé de 2 à 8 $ : une mesure complète avec Sonnet (estimée à 3 $ environ
     avant le premier run) ou avec Opus (5,5 $ environ) dépasse le plafond de 2 $ que le vérificateur pose au serveur ;
   - `claude-opus-5-5` ajouté à `MODELES` (`deploy/analyse-fonctions.php`) : le serveur de production n'admet que Haiku et Sonnet ;
   - une ligne de tarif pour Opus dans `deploy/claude-tarifs.json` (4 $ et 20 $ par million de tokens en entrée et en sortie, cache
     à 5 $, 8 $ et 0,20 $), pour que le serveur compte le coût et tienne le plafond.

   Le code de lecture y est celui de main. Les tests qui figent la liste des modèles et des tarifs y échouent, ce qui est attendu.

## 2. Le protocole

- **Le workflow** « Vérifier l'API Claude » (`.github/workflows/verifier-api.yml`), case « mesure des façades » cochée, avec la clé
  de test rangée dans les secrets GitHub. L'entrée `modele` (déjà présente) impose le modèle à toutes les requêtes du vérificateur, la
  mesure des façades comprise (`scripts/verifier-api-claude.mjs --modele`, `mesurerFacades`). Vide, chaque usage garde le modèle du
  serveur : Haiku pour `facade`.
- **Les scènes** : les **22 scènes de synthèse** du banc qui ont une vérité utilisable par la lecture, de `02-enduit-uni-face` à
  `23-pignon-rampe-appentis` (`tests/fixtures/facades/`, skill `facades` §5 ter). Chaque scène est préparée sans clé
  (`ia-x1-x3.ts --preparer`) : l'image prise pour la suite telle que la calibration la compose (≤ 1 024 px), le texte qui
  l'accompagne et la vérité (le mur en pixels, les baies avec leur genre et leurs carreaux peints, les pointes). Au total : 126 baies
  (97 fenêtres, 7 portes-fenêtres, 20 portes, 2 portes de garage), 44 angles de mur, 21 baies à carreaux, 2 pointes de pignon.
- **×1 et ×3** : chaque scène part une fois en **×1** (une passe) et une fois en **×3** (trois passes, le mode de production depuis
  le 29 octobre 2026, réglage `facades.ia.passes`). Les trois passes partent ensemble.
- **Le vote** (`voterObservations`, `facade/regles/facades/ia.ts`) : une baie, un élément ou une étendue ne reste que si plus de la
  moitié des passes la voit (deux sur trois). Deux baies de passes différentes sont la même si leurs boîtes se recouvrent à 30 % au
  moins (`facades.ia.voteMemeBaie`) ; la boîte gardée prend la médiane de chaque bord, le genre est celui de la majorité, les carreaux
  ceux de la majorité. Un angle et une pointe prennent la médiane.
- **La lecture** des réponses se fait hors ligne, en lecture seule, par `tests/banc/facades/gardeLecture.ts::mesurerLecture` (le garde-fou
  de la lecture, PR #513, lu à son commit 09cb0f3e, identique à main depuis sa fusion), sur les artefacts `mesure-facades-x1-x3` de chaque
  run. C'est le chemin de production : la réponse relue comme un run enregistré, le vote, puis les règles.

Ce que veut dire « juste » pour chaque ligne :

| Ligne | Juste quand |
|---|---|
| Rappel, précision | Une boîte retrouve une baie vraie quand elle la recouvre à **plus de 50 %** (le jugement du banc, `juger`). Rappel : baies vraies retrouvées sur baies vraies. Précision : boîtes qui retrouvent une baie sur boîtes rendues. |
| Genres justes | Pour chaque genre (fenêtre, porte-fenêtre, porte, garage) : les baies vraies de ce genre qu'une boîte **du même genre** retrouve. |
| Carreaux justes / lus | Une boîte qui recouvre à plus de 50 % une baie vraie à carreaux et qui dit ses carreaux : juste quand vantaux × colonnes et rangées sont ceux de la baie. « Lus » compte les baies à carreaux dont la lecture a dit les carreaux. |
| Angles justes / lus | Un angle du mur (gauche, droit) est juste quand son bord, son égout et son sol tombent à **2 % de la largeur du mur** près (`ANGLE_JUSTE_PART`). |
| Pointes | Une pointe de pignon est juste à 0,08 près en `u` et à 10 % de sa hauteur près en `v`. « En plus » : une pointe que la règle juge en trop. |
| Parement | Le parement principal lu (`surface.principale`) est celui de la scène. |
| Passes illisibles | Passes dont la sortie ne se lit pas (JSON invalide ou hors schéma). |
| Pose | Information : l'écart du pire bord de la pose déduite des angles, en part de la largeur (médiane des scènes). |
| Coût, durée | Coût journalisé par le serveur pour la mesure de ce mode (22 façades) ; durée : moyenne, par façade, du temps d'un appel (×3 : les trois passes, qui partent ensemble). |

## 3. Les résultats

### Mode ×3 (le mode de production)

| Ligne | Haiku 1 | Haiku 2 | Haiku 3 | Sonnet 1 | Sonnet 2 | Opus 1 | Opus 2 |
|---|--:|--:|--:|--:|--:|--:|--:|
| Rappel (baies) | 99,2 % | 99,2 % | 99,2 % | 91,3 % | 93,7 % | 72,2 % | 73,8 % |
| Précision (baies) | 100,0 % | 100,0 % | 100,0 % | 93,5 % | 94,4 % | 72,8 % | 75,6 % |
| Baies VP / vraies / trouvées | 125 / 126 / 125 | 125 / 126 / 125 | 125 / 126 / 125 | 115 / 126 / 123 | 118 / 126 / 125 | 91 / 126 / 125 | 93 / 126 / 123 |
| Genres justes (F, PF, P, G) | 96/97, 7/7, 20/20, 2/2 | 96/97, 5/7, 20/20, 2/2 | 96/97, 7/7, 20/20, 2/2 | 87/97, 7/7, 19/20, 2/2 | 90/97, 7/7, 19/20, 2/2 | 62/97, 7/7, 20/20, 2/2 | 65/97, 7/7, 19/20, 2/2 |
| Genres justes, total | 125 / 126 | 123 / 126 | 125 / 126 | 115 / 126 | 118 / 126 | 91 / 126 | 93 / 126 |
| Carreaux justes / lus | 7 / 21 | 2 / 21 | 10 / 21 | 15 / 21 | 14 / 21 | 12 / 12 | 15 / 15 |
| Angles justes / lus | 38 / 44 | 38 / 44 | 34 / 44 | 35 / 44 | 35 / 44 | 37 / 44 | 35 / 44 |
| Pointes justes / attendues (+ en plus) | 2 / 2 (+0) | 2 / 2 (+0) | 2 / 2 (+0) | 1 / 2 (+0) | 1 / 2 (+0) | 2 / 2 (+0) | 2 / 2 (+0) |
| Parement juste | 22 / 22 | 22 / 22 | 21 / 22 | 22 / 22 | 22 / 22 | 22 / 22 | 22 / 22 |
| Passes illisibles | 0 / 66 | 0 / 66 | 0 / 66 | 0 / 66 | 0 / 66 | 0 / 66 | 0 / 66 |
| Pose, pire bord (médiane) | 0,8 % | 0,8 % | 0,8 % | 0,8 % | 0,8 % | 0,8 % | 0,7 % |
| Coût de la mesure | 0,1028 $ | 0,1017 $ | 0,1023 $ | 1,0422 $ | 1,0486 $ | 1,8954 $ | 1,8838 $ |
| Coût par façade | 0,00467 $ | 0,00462 $ | 0,00465 $ | 0,04737 $ | 0,04766 $ | 0,08616 $ | 0,08563 $ |
| Durée par façade (appel, toutes passes) | 13,8 s | 13,7 s | 13,4 s | 8,7 s | 8,7 s | 10,1 s | 9,9 s |

### Mode ×1

| Ligne | Haiku 1 | Haiku 2 | Haiku 3 | Sonnet 1 | Sonnet 2 | Opus 1 | Opus 2 |
|---|--:|--:|--:|--:|--:|--:|--:|
| Rappel (baies) | 92,9 % | 94,4 % | 97,6 % | 86,5 % | 84,9 % | 81,8 % | 76,2 % |
| Précision (baies) | 99,2 % | 100,0 % | 100,0 % | 87,2 % | 85,6 % | 82,4 % | 76,8 % |
| Baies VP / vraies / trouvées | 117 / 126 / 118 | 119 / 126 / 119 | 123 / 126 / 123 | 109 / 126 / 125 | 107 / 126 / 125 | 103 / 126 / 125 | 96 / 126 / 125 |
| Genres justes (F, PF, P, G) | 89/97, 7/7, 19/20, 2/2 | 91/97, 7/7, 19/20, 2/2 | 95/97, 6/7, 19/20, 2/2 | 82/97, 7/7, 18/20, 2/2 | 79/97, 7/7, 19/20, 2/2 | 74/97, 7/7, 20/20, 2/2 | 67/97, 7/7, 20/20, 2/2 |
| Genres justes, total | 117 / 126 | 119 / 126 | 122 / 126 | 109 / 126 | 107 / 126 | 103 / 126 | 96 / 126 |
| Carreaux justes / lus | 0 / 21 | 7 / 19 | 2 / 21 | 10 / 21 | 13 / 19 | 15 / 15 | 15 / 15 |
| Angles justes / lus | 34 / 42 | 35 / 42 | 36 / 42 | 35 / 44 | 35 / 44 | 36 / 44 | 35 / 44 |
| Pointes justes / attendues (+ en plus) | 2 / 2 (+0) | 2 / 2 (+0) | 2 / 2 (+0) | 1 / 2 (+0) | 1 / 2 (+0) | 1 / 2 (+0) | 2 / 2 (+0) |
| Parement juste | 21 / 22 | 21 / 22 | 21 / 22 | 22 / 22 | 22 / 22 | 22 / 22 | 22 / 22 |
| Passes illisibles | 0 / 22 | 0 / 22 | 0 / 22 | 0 / 22 | 0 / 22 | 0 / 22 | 0 / 22 |
| Pose, pire bord (médiane) | 0,8 % | 0,8 % | 0,7 % | 0,8 % | 0,8 % | 0,8 % | 0,7 % |
| Coût de la mesure | 0,0342 $ | 0,0336 $ | 0,0331 $ | 0,3386 $ | 0,3423 $ | 0,6393 $ | 0,6404 $ |
| Coût par façade | 0,00155 $ | 0,00153 $ | 0,00150 $ | 0,01539 $ | 0,01556 $ | 0,02906 $ | 0,02911 $ |
| Durée par façade (appel, toutes passes) | 12,7 s | 12,5 s | 11,9 s | 7,9 s | 7,8 s | 9,6 s | 9,9 s |

### Les scènes où les lectures ×3 divergent

Une scène figure ici dès qu'une des sept mesures ×3 diffère des autres sur une ligne (les scènes absentes sont lues de la même façon par
toutes). Notation : `B vp/vraies +fp` les baies (retrouvées sur vraies, et les boîtes en trop) ; `G` les genres justes s'ils diffèrent
de `vp` ; `C` les carreaux justes / lus ; `A` les angles justes / lus ; `Pt` les pointes justes / attendues ; le parement n'est écrit
que s'il est faux.

| Scène | Haiku 1 | Haiku 2 | Haiku 3 | Sonnet 1 | Sonnet 2 | Opus 1 | Opus 2 |
|---|---|---|---|---|---|---|---|
| Scène | Haiku 1 | Haiku 2 | Haiku 3 | Sonnet 1 | Sonnet 2 | Opus 1 | Opus 2 |
|---|---|---|---|---|---|---|---|
| 02-enduit-uni-face | B 6/6 · C 5/5 · A 2/2 | B 6/6 · C 0/5 · A 2/2 | B 6/6 · C 5/5 · A 2/2 | B 6/6 · C 5/5 · A 2/2 | B 6/6 · C 5/5 · A 2/2 | B 3/6 +3 · C 2/2 · A 2/2 | B 3/6 +3 · C 2/2 · A 2/2 |
| 04-soubassement-pierre-bandeau | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 3/6 +3 · A 2/2 | B 3/6 +3 · A 2/2 |
| 05-ombres-debord-balcon | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 4/6 +2 · A 2/2 | B 4/6 · A 2/2 |
| 06-volets-roulants-ton-sur-ton | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 · parement indetermine | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 |
| 07-voiture-haie-devant | B 8/8 · A 2/2 | B 8/8 · A 2/2 | B 8/8 · A 2/2 | B 3/8 +3 · A 2/2 | B 8/8 · A 2/2 | B 3/8 +5 · A 2/2 | B 4/8 +4 · A 2/2 |
| 08-prise-de-biais-forte | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 5/6 +1 · A 2/2 | B 3/6 +3 · A 2/2 | B 6/6 · A 2/2 |
| 09-focale-inconnue-grand-angle | B 6/6 · C 0/2 · A 1/2 | B 6/6 · C 0/2 · A 1/2 | B 6/6 · C 0/2 · A 0/2 | B 6/6 · C 0/2 · A 1/2 | B 6/6 · C 2/2 · A 1/2 | B 3/6 +3 · C 2/2 · A 1/2 | B 3/6 +3 · C 2/2 · A 1/2 |
| 10-meuliere-garage-ton-sur-ton | B 7/7 · C 0/5 · A 2/2 | B 7/7 · C 0/5 · A 2/2 | B 7/7 · C 0/5 · A 2/2 | B 7/7 · C 5/5 · A 2/2 | B 7/7 · C 5/5 · A 2/2 | B 4/7 +3 · C 2/2 · A 2/2 | B 4/7 +3 · C 2/2 · A 2/2 |
| 11-pignon-ombre-arbre | B 3/3 · A 2/2 · Pt 1/1 | B 3/3 · A 2/2 · Pt 1/1 | B 3/3 · A 1/2 · Pt 1/1 | B 1/3 +2 · A 1/2 · Pt 0/1 | B 1/3 +2 · A 1/2 · Pt 0/1 | B 3/3 · A 1/2 · Pt 1/1 | B 3/3 · A 1/2 · Pt 1/1 |
| 12-haie-pied-cache-roulis | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 0/2 | B 3/6 +3 · A 0/2 | B 3/6 +3 · A 0/2 | B 6/6 · A 2/2 | B 3/6 +3 · A 0/2 |
| 13-grand-angle-distorsion-forte | B 6/6 · C 2/2 · A 2/2 | B 6/6 · C 2/2 · A 2/2 | B 6/6 · C 2/2 · A 2/2 | B 6/6 · C 0/2 · A 2/2 | B 6/6 · C 0/2 · A 2/2 | B 3/6 +3 · C 2/2 · A 2/2 | B 3/6 +3 · C 2/2 · A 2/2 |
| 14-grand-angle-distorsion-legere-biais | B 5/5 · A 2/2 | B 5/5 · A 2/2 | B 5/5 · A 2/2 | B 5/5 · A 2/2 | B 5/5 · A 2/2 | B 3/5 +2 · A 2/2 | B 2/5 +3 · A 2/2 |
| 15-grand-angle-deja-corrige | B 6/6 · C 0/2 · A 0/2 | B 6/6 · C 0/2 · A 0/2 | B 6/6 · C 0/2 · A 0/2 | B 6/6 · C 0/2 · A 0/2 | B 6/6 · C 0/2 · A 0/2 | B 3/6 +3 · C 2/2 · A 0/2 | B 3/6 +3 · C 2/2 · A 0/2 |
| 19-vues-haie-haute-baie-cachee | B 5/6 · A 1/2 | B 5/6 · A 1/2 | B 5/6 · A 1/2 | B 5/6 · A 1/2 | B 4/6 +1 · A 1/2 | B 5/6 · A 1/2 | B 5/6 · A 1/2 |
| 20-details-cintres-persiennes-garde-corps | B 6/6 · A 2/2 | B 6/6 · G 4 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 6/6 · A 2/2 | B 5/6 +1 · A 2/2 | B 5/6 +1 · A 2/2 |
| 21-ebrasements-profonds-biais | B 6/6 · C 0/5 · A 1/2 | B 6/6 · C 0/5 · A 1/2 | B 6/6 · C 3/5 · A 1/2 | B 6/6 · C 5/5 · A 1/2 | B 6/6 · C 2/5 · A 1/2 | B 3/6 +3 · C 2/2 · A 1/2 | B 5/6 +1 · C 5/5 · A 1/2 |

## 4. Lecture des résultats

**Le bruit d'abord.** Trois mesures de Haiku au même code donnent la mesure de la dispersion d'un même modèle. En ×3, le rappel et la
précision ne bougent pas (99,2 % et 100 %, 125 baies sur 126 dans les trois runs), mais les **carreaux** passent de 7 à 2 puis à
10 justes sur 21, les **angles** de 38 à 38 puis à 34 sur 44, les genres de 125 à 123 puis à 125, et le parement de 22 à 22 puis à 21.
Un écart de cet ordre entre deux modèles, sur ces lignes-là, ne se distingue pas du bruit. En ×1, Haiku varie davantage : rappel de
92,9 % à 97,6 %.

**Les baies : ni Sonnet ni Opus ne font mieux que Haiku sur ce banc, ils font moins bien, et de façon répétable.**

- **Sonnet** : 91,3 % et 93,7 % de rappel en ×3 (Haiku : 99,2 % trois fois), précision 93,5 % et 94,4 %. Les deux mesures se
  ressemblent. Les pertes se concentrent sur les scènes où le pied du mur est caché : `12-haie-pied-cache-roulis` (3 baies sur 6 aux
  deux mesures), `11-pignon-ombre-arbre` (1 sur 3, la pointe manquée aux deux mesures), `07-voiture-haie-devant` (3 sur 8 à la
  première mesure). Sur `12`, Sonnet prend le haut de la haie pour le sol : les baies du rez-de-chaussée arrivent entre `v` 0 et 0,20
  au lieu de 0,17 et 0,38, et ses angles posent le sol au même endroit (0 angle juste sur 2). Le vote ne corrige pas : les trois passes
  font la même erreur.
- **Opus** : 72,2 % et 73,8 % de rappel en ×3, et **moins en ×3 qu'en ×1** (81,8 % et 76,2 %). Sur 8 à 9 des 20 scènes qui ont un étage,
  Opus place les baies de l'étage nettement trop bas : le linteau lu vaut de 0,73 à 0,84 fois le vrai (médiane des passes), alors que
  Haiku le lit à 0,97–1,02 sur toutes les scènes, et Sonnet aussi, à une scène près par mesure (`07` ou `17`). Sur `02-enduit-uni-face`, par exemple, les fenêtres de l'étage sont vraies entre `v` 0,66 et
  0,89 et Opus les place, aux trois passes, entre 0,48 et 0,65 : moins de 50 % de recouvrement, donc trois baies manquées et trois
  boîtes en trop. Ses angles (dans le repère de l'image) restent justes (37 et 35 sur 44) : c'est l'échelle de `v`, le repère du mur
  où l'égout vaut 1, qui est lue autrement. Comme l'erreur est la même à chaque passe, le vote la confirme au lieu de l'effacer, et le
  regroupement à 30 % fait perdre en ×3 des baies qu'une passe seule retrouvait.

**Les carreaux : là, Sonnet et Opus apportent quelque chose.**

- Sonnet : 15 et 14 justes sur 21 en ×3 (Haiku : 7, 2, 10), et 10 et 13 en ×1 (Haiku : 0, 7, 2). Les deux mesures Sonnet sont au-dessus
  des trois mesures Haiku : l'écart dépasse le bruit observé. Les scènes qui font la différence : `10-meuliere-garage-ton-sur-ton` (5
  sur 5 contre 0 sur 5 aux trois Haiku), `21-ebrasements-profonds-biais` (5 et 2 sur 5, Haiku 0, 0, 3). Sonnet manque en revanche les
  carreaux de `13-grand-angle-distorsion-forte` (0 sur 2 aux deux mesures, Haiku 2 sur 2 trois fois).
- Opus : **tous les carreaux qu'il lit sont justes** (12 sur 12 et 15 sur 15 en ×3, 15 sur 15 deux fois en ×1). Mais il en lit moins,
  parce qu'il manque les baies de l'étage sur lesquelles les carreaux se jugent : en ×3, 12 et 15 justes sur 21, au niveau de Sonnet.

**Le reste ne départage pas les modèles.** Angles : 34 à 38 sur 44 pour tous, dans le bruit de Haiku. Pointes : Haiku 2 sur 2 aux
trois mesures, Opus 2 sur 2, Sonnet 1 sur 2 aux deux mesures (celle de `11-pignon-ombre-arbre`, à l'ombre de l'arbre). Parement :
22 sur 22 pour Sonnet et Opus, 21 ou 22 pour Haiku (`06-volets-roulants-ton-sur-ton` lu `indetermine` une fois sur trois). Aucune passe
illisible, pour aucun modèle. La sortie structurée est refusée par l'API pour les trois modèles (« The compiled grammar is too large »),
et la réponse se lit sans elle, comme en production.

**Le prix et le temps.**

| Par façade, en ×3 | Haiku | Sonnet | Opus |
|---|--:|--:|--:|
| Coût (moyenne des mesures) | 0,0046 $ | 0,0475 $ | 0,0859 $ |
| Rapport à Haiku | 1 | ≈ 10 | ≈ 18,5 |
| Durée d'un appel (trois passes ensemble) | 13,6 s | 8,7 s | 10,0 s |

Sonnet coûte environ dix fois Haiku par façade, Opus environ dix-huit fois. Les prix par token sont 20 et 40 fois ceux de Haiku, mais
Sonnet et Opus écrivent beaucoup moins : en ×3, 3 900 tokens de sortie par façade en moyenne pour Sonnet et 3 500 pour Opus, contre
8 400 pour Haiku, réflexion comprise (runs 41019772877, 41021369128 et 40998593930). Sonnet et Opus répondent plus vite que Haiku sur ce banc.

**En résumé, sans recommandation.** Sur ces 22 scènes, Haiku en ×3 retrouve le plus de baies, avec leur genre, et le fait à chaque mesure.
Sonnet lit mieux les carreaux, au-delà du bruit, pour dix fois le prix, et perd des baies quand le pied du mur est caché. Opus ne se
trompe pas sur les carreaux qu'il lit, mais il lit l'échelle verticale du mur autrement sur près de la moitié des scènes à étage, et
perd ainsi plus d'un quart des baies, pour dix-huit fois le prix. Ces constats valent pour la lecture 5.1.0 et pour des scènes de synthèse :
un autre prompt (par exemple un repère `v` dit autrement) ou des photos réelles peuvent les changer.

## 5. Refaire la mesure

1. Pour Haiku (le modèle de production) : lancer le workflow « Vérifier l'API Claude » sur `main`, case « mesure des façades »
   cochée, `modele` vide, `plafond` 0.25. Le garde-fou de la lecture juge alors la mesure contre ses planchers.
   Avec `modele` rempli, le garde-fou ne juge pas (ses planchers sont ceux de Haiku), ne relance rien et ne fait pas finir le job en
   rouge : le workflow mesure seulement.
2. Pour Sonnet : même chose avec `modele` = `claude-sonnet-5-5` et `plafond` 4. Le vérificateur refuse un plafond au-dessus de 2 $
   (`PLAFOND_MAX`) : il faut le lancer depuis une branche où ce plafond est relevé, comme `claude/mesure-modeles-facades`.
3. Pour Opus : `modele` = `claude-opus-5-5`, `plafond` 7, depuis une branche qui admet Opus au serveur (`MODELES`) et lui donne un
   tarif (`deploy/claude-tarifs.json`), comme `claude/mesure-modeles-facades`. Sur main, le vérificateur s'arrête avant toute requête
   (« modèle non admis par le serveur »).
4. Relire chaque artefact `mesure-facades-x1-x3` (hors ligne, sans clé) : appeler `mesurerLecture(<dossier>)` de
   `tests/banc/facades/gardeLecture.ts` sur le dossier `mesure-facades` de l'artefact. Il y faut les `*.verite.json` à côté des
   `*.reponses.json` : l'artefact les contient depuis le garde-fou ; pour un run plus ancien, les préparer avec
   `npx tsx .claude/skills/facades/scripts/ia-x1-x3.ts --preparer <dossier>`. Le tableau du workflow
   (`ia-x1-x3.ts --evaluer`) donne déjà le rappel, la précision, les carreaux, les pointes et le coût. Les genres, les angles et le
   parement viennent de `mesurerLecture`.

Avant de relancer Opus ou Sonnet, estimer le coût à partir de ce document : environ 1,5 $ par run pour Sonnet et 2,8 $ pour Opus,
vérification comprise.
