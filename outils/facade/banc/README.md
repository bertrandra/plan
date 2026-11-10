# Banc d'essai du repérage des baies

Le repérage des fenêtres et des portes (`../baies.ts`) est noté sur des façades redressées
annotées. C'est ce banc qui a départagé les approches ; il sert à vérifier qu'un changement
n'abîme rien.

```bash
node outils/facade/banc/evaluer.mjs outils/facade/baies.ts <dossier-du-jeu>                    # la note
node outils/facade/banc/evaluer.mjs outils/facade/baies.ts <dossier-du-jeu> --images <sortie>  # + un PNG par image
node outils/facade/banc/evaluer.mjs outils/facade/baies.ts <dossier-du-jeu> --seul maison      # un sous-ensemble
```

Sur les PNG : vert = ouverture trouvée, jaune = manquée, orange = difficile (ne compte pas), bleu
pointillé = zone ignorée ; rouge = détection juste, magenta = fausse, gris = doublon ou ignorée.

## Le jeu

Un échantillon = `<nom>.rgba` (RGBA brut), `<nom>.vu` (facultatif, 1 = pixel couvert par une photo)
et `<nom>.json` : `{ nom, groupe, largeur, hauteur, pxParM, gt: [{ x, y, l, h, classe, difficile?,
groupe?, lM?, hM? }], ignorer: [{ x, y, l, h }] }`. La boîte d'une ouverture est le **hors-tout de
sa menuiserie**, cadre compris.

Les images ne sont pas dans le dépôt (photos privées, jeu public à télécharger) :

| Groupe | Contenu | Comment l'obtenir |
|---|---|---|
| `maison` | une maison à colombages photographiée au téléphone : la façade fusionnée (16 Mpx), la même depuis des photos compressées, les vues d'une seule photo ; et ses variantes miroir, demi-résolution, assombrie | annotée à la main sur la façade fusionnée, reportée sur les autres vues par recalage ; `variantes.py` fabrique les variantes |
| `cmp` | 60 façades d'immeubles du jeu public CMP Facade (Tyleček et Šára, GCPR 2013), ≤ 1024 px | `CMP_facade_DB_base.zip` sur cmp.felk.cvut.cz/~tylecr1/facade/, puis `cmp_stats.py` et `cmp_convertir.py` (sélection reproductible : fenêtres ≥ 45 px, 3 à 40 fenêtres ; dans ce jeu `<x>` est la ligne et `<y>` la colonne) |
| `synth` | 4 façades synthétiques du banc de `../verifier.ts`, cotes connues au centimètre | rendues par le calcul de la page |

`voir_gt.py` trace une annotation, `zone.py` agrandit une zone avec une grille de coordonnées.

## La notation

Par image : `0,5 × F1 objets + 0,5 × F1 pixels`. Une détection et une ouverture s'apparient à
partir d'un recouvrement (IoU) de 0,5 ; les pans d'une même baie vitrée peuvent être trouvés d'un
seul tenant ; une ouverture « difficile » ne compte ni pour ni contre ; une détection contenue dans
une ouverture déjà trouvée n'est pas comptée fausse. Façades synthétiques : la justesse des cotes
entre pour 40 % (pleine note jusqu'à 2 cm d'erreur moyenne). Note globale :
`0,55 × maison + 0,35 × cmp + 0,10 × synth`.

## Ce que le banc a mesuré (novembre 2026)

Six approches ont été développées séparément sur 25 images d'entraînement, puis notées sur 47
images tenues à l'écart (autres façades, autres vues de la maison, miroir, demi-résolution, image
assombrie).

| Détecteur | Entraînement | Jeu tenu à l'écart | Maison | Immeubles |
|---|---|---|---|---|
| régions lisses et sombres (le détecteur d'avant) | 0,34 | 0,36 | 0,39 | 0,17 |
| régions, corrigées | 0,65 | 0,55 | 0,67 | 0,39 |
| le mur comme fond | 0,76 | 0,55 | 0,66 | 0,42 |
| rectangles d'arêtes | 0,71 | 0,64 | 0,65 | 0,53 |
| travées et alignements (`baies/travees.ts`) | 0,76 | 0,71 | 0,77 | 0,55 |
| mailles de menuiserie (`baies/mailles.ts`) | 0,78 | 0,72 | 0,80 | 0,54 |
| propositions notées (`baies/propositions.ts`) | 0,78 | 0,73 | 0,72 | 0,69 |
| **vote des trois derniers (`baies.ts`)** | **0,86** | **0,80** | **0,82** | **0,71** |

(Maison et immeubles : sur le jeu tenu à l'écart.) Les deux approches qui modélisent l'apparence
(régions, mur) sont celles qui se sont le moins bien transportées d'une image à l'autre ; les trois
retenues raisonnent sur les arêtes. Faire voter les six ne gagnait que 0,007 pour le double du temps.

## Second et troisième tours : relecture, corrections, nouveau vote

Les quatre fichiers ont ensuite été relus un par un : un relecteur cherche les défauts réels, un
vérificateur tente de reproduire chaque constat (32 confirmés sur 32), un responsable corrige. Le
vote, réécrit au second tour, a été relu à son tour au troisième (8 constats confirmés), ses erreurs
restantes classées, puis contrôlé par un agent qui n'avait pas écrit le code. Les rendus ont été
combinés et mesurés ; n'est gardé que ce qui tient à la mesure.

Une image seule bouge de 0,05 d'un cadrage à l'autre (rogner un pixel suffit) et la note d'un jeu
est dominée par trois à cinq vues de la maison : la décision se prend donc sur une **mesure large**,
huit familles d'images (l'entraînement, ses miroirs, demi-résolutions, images assombries, rognées,
réduites à 70 %, 40 autres façades d'immeubles), 221 images, notes regroupées par groupe. Les boîtes
de chaque détecteur y sont rangées une fois, et le vote rejoué dessus.

Les outils :

```bash
# 1. Ranger les boites d'une version d'un detecteur sur chaque famille (3 minutes pour 221 images)
node outils/facade/banc/ranger.mjs outils/facade/baies/mailles.ts M entrainement=<jeu> miroir=<jeu-miroir> ...
# 2. Rejouer un vote sur une combinaison de boites rangees (une seconde) : notes par famille, puis la mesure large
node outils/facade/banc/rejouer.mjs outils/facade/baies.ts P M T entrainement miroir ... --detail
```

`decliner.py` fabrique une famille de variantes d'un échantillon (rognages de 1 à 7 px, miroir,
réductions, image assombrie) ; `reporter.py` reporte une annotation posée à la main sur une autre
élévation de la même façade (points homologues, homographie) — c'est ainsi que l'élévation produite
par la page dans un navigateur (bouton « PNG ») est entrée dans le banc, annotée à 2 px près.

| Version | Mesure large | Maison (39 vues) : note, justes / fausses / manquées | Immeubles (168) | Jeu tenu à l'écart | Jeu final | Images de la page |
|---|---|---|---|---|---|---|
| vote d'origine, détecteurs d'origine | 0,81 | 0,83 — 275 / 66 / 26 | 0,73 | 0,80 | 0,76 | 0,84 |
| nouveau vote, détecteurs d'origine | 0,86 | 0,91 — 285 / 18 / 16 | 0,73 | 0,84 | 0,83 | 0,90 |
| second tour : nouveau vote, `mailles` et `travees` corrigés | 0,87 | 0,92 — 289 / 18 / 12 | 0,74 | 0,83 | 0,85 | 0,93 |
| **troisième tour (livré)** | **0,87** | 0,92 — 289 / 18 / 12 | 0,74 | 0,83 | 0,85 | 0,94 |

(Jeu final : 46 images qui n'ont servi à aucune mise au point. Images de la page : l'élévation que
`facade.html` produit dans un navigateur à partir des trois photos de la maison, et douze variantes —
rognées, en miroir, réduites, assombrie : 113 ouvertures justes, 36 fausses, 4 manquées avec le
premier vote ; 115, 5 et 2 aujourd'hui.)

- **Le vote** (`baies.ts`) est réécrit : grappes par recouvrement décroissant (plus de « première
  grappe venue »), boîte d'une grappe selon la nature de l'accord (plus de moyenne de deux boîtes),
  réunion du tout et de ses parties, baies à une voix gardées seulement si la façade les confirme,
  sol situé par la plus basse des portes, filtre de ce qui est posé au sol sans la hauteur d'une
  porte (les vides de balustrade, même vus par les trois détecteurs), prolongement par les morceaux
  voisins (imposte, bas de porte). C'est lui qui porte le gain. Au troisième tour : le sol n'est
  plus annoncé quand le résultat le contredit (sur les immeubles, 39 sols faux ou inventés → 17),
  une porte vue par un seul détecteur ne situe plus le sol au-dessus d'une baie votée, le temps est
  borné (20 à 50 s pour des milliers de boîtes, 0,5 s après), une entrée mal formée ne fait plus
  lever d'exception, les cotes ne dépendent plus de l'ordre des boîtes.
- **Une règle essayée et retirée** : à trois voix, donner raison à la seule boîte qui a la taille
  d'une baie sûre du même rang, contre la médiane. Elle gagnait 0,007 sur la mesure large (cinq
  rognages de la même maison faisaient 97 % du gain) et perdait 0,015 sur le jeu final : une règle
  se juge sur des images qu'elle n'a pas vues.
- **`baies/mailles.ts`** : portes pleines cherchées par dichotomie (51 s sur une image de bruit avec
  une échelle fausse, 0,4 s après), recalage des bords au sens du contraste (le cadre n'est plus
  retiré : 3 à 5 cm d'erreur sur 13 configurations synthétiques sur 20, aucune après), échelle de
  travail des images moyennes, un morceau voisin ne sert qu'à une baie, plafonds et sortie anticipée
  sur une image saturée d'arêtes (93 cas dégénérés sans défaut). Le miroir exact (sens de lecture
  canonique) a été essayé et laissé de côté : il coûtait à la mesure.
- **`baies/travees.ts`** : la lenteur pathologique est corrigée (2,0 s pour 0,67 Mpx, 0,35 s après),
  plus de budget qui écarte des candidats en silence, montants chaînés par-dessus une traverse (la
  baie vitrée sort entière, impostes comprises). Contrôlé à part : 1 127 cas dégénérés et 500 images
  au hasard sans défaut ni dépassement.
- **`baies/propositions.ts`** : le recalage ne sort plus de l'image, et le bord de l'image n'est
  plus traité comme du remplissage ; mêmes boîtes sur les 327 images. Ses autres corrections
  (rugosité des images peu réduites, symétrie) n'apportaient rien de mesurable au vote.

Sur la façade de référence (16 Mpx) : 9 ouvertures sur 9, aucune fausse, la porte d'entrée et la
porte-fenêtre du porche entières, la baie vitrée avec ses impostes ; 1,1 s sous Node. Sur
l'élévation que la page tire des trois photos compressées, sans échelle : les mêmes 9 ouvertures
(les deux pans de la baie vitrée d'un seul tenant), aucune fausse. Restent imparfaits : le résultat
dépend du cadrage au pixel près et de l'échelle donnée (c'est la première cause d'erreur : la
porte-fenêtre du porche s'arrête encore à la lisse de la balustrade sur certaines variantes, et
dans le navigateur une fois l'échelle posée) ; deux détecteurs qui se trompent ensemble l'emportent sur le
troisième (fenêtres d'étage prises avec leur encadrement de colombage, ou sans leur imposte) ; une
image sombre garde des fausses baies dans la balustrade ; les fenêtres derrière un garde-corps
ouvragé, les volets ouverts ; sur les immeubles, un cinquième des fenêtres ne sont vues par aucun
des trois détecteurs, et sans échelle le sol y reste incertain (deux portes sur trois sortent
« fenêtre »).
