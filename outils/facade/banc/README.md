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

Sur la façade de référence (16 Mpx) : 9 ouvertures sur 9, une fausse détection (un vide entre deux
barreaux de balustrade), 1,2 s sous Node. Restent imparfaits : le cadrage d'une baie vitrée à
plusieurs pans, une porte ou une porte-fenêtre dont le bas est caché (buisson, balustrade), les
fenêtres derrière un garde-corps ouvragé, les volets ouverts.
