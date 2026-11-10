# Protocole de test du repérage des baies

Ce document garde **le test complet** du repérage des fenêtres et des portes de `facade.html` : ce
qui est mesuré, sur quelles images, avec quelles commandes, selon quelles règles de décision, et
les résultats obtenus le 10 novembre 2026. Il sert à **rejouer le test tel quel** (pour vérifier
qu'un changement n'abîme rien) et à **lancer un nouveau jeu d'images** plus tard, noté de la même
façon. `README.md` (même dossier) raconte l'histoire des détecteurs ; ici, c'est le mode d'emploi.

Tout se lance depuis la racine du dépôt. Il faut Node (esbuild vient de `node_modules`), Python 3
avec `numpy` et `Pillow` (et `opencv-python-headless` pour `reporter.py` seulement), et Playwright
avec Chromium pour les deux tests dans le navigateur.

## 1. Ce qui est mesuré

Le détecteur (`outils/facade/baies.ts`) reçoit une élévation redressée et rend des boîtes. Chaque
image annotée donne une note de 0 à 1 (`noter.mjs`, règles en tête de `evaluer.mjs`) :

- **objets** : une boîte rendue et une ouverture annotée s'apparient à partir d'un recouvrement
  (IoU) de 0,5 ; les pans d'une même baie vitrée (`groupe`) peuvent être trouvés d'un seul tenant ;
  une ouverture `difficile` ne compte ni pour ni contre ; une boîte dans une zone `ignorer`, ou
  contenue dans une ouverture déjà trouvée, n'est pas comptée fausse ;
- **pixels** : F1 entre la surface rendue et la surface annotée ;
- note de l'image = 0,5 × F1 objets + 0,5 × F1 pixels ; pour une façade synthétique (cotes
  connues) : 0,4 × F1 objets + 0,2 × F1 pixels + 0,4 × justesse des cotes (pleine note jusqu'à 2 cm
  d'erreur moyenne, zéro à 10 cm) ;
- note d'un ensemble d'images = 0,55 × maison + 0,35 × immeubles (`cmp`) + 0,10 × synthétiques,
  sur les groupes présents, chaque groupe étant la moyenne de ses images.

La boîte d'une ouverture est le **hors-tout de sa menuiserie, cadre compris**. Une fenêtre à
plusieurs vantaux et imposte dans un même cadre est une seule ouverture.

Le temps est un critère à part : un détecteur seul doit tenir dans `100 ms par mégapixel + 500 ms`
sous Node (`ranger.mjs` compte les images « hors budget » ; `evaluer.mjs --budget 3` pour le vote,
qui lance les trois détecteurs).

## 2. Les jeux d'images

Un échantillon = `<nom>.rgba` (RGBA brut), `<nom>.vu` (facultatif : 1 = pixel couvert par une
photo, 0 = remplissage) et `<nom>.json` (`{ nom, groupe, largeur, hauteur, pxParM, gt: [{ x, y, l,
h, classe, difficile?, groupe?, lM?, hM? }], ignorer: [{ x, y, l, h }] }`).

| Jeu | Images | Ce que c'est | Son rôle |
|---|---|---|---|
| `entrainement` | 25 | 3 vues de la maison (`maison-u` : la façade fusionnée de 16 Mpx, échelle fournie ; `maison-n` : la même depuis des photos compressées ; `maison-vue2` : une seule photo redressée), 20 façades d'immeubles du jeu public CMP, 2 façades synthétiques | mise au point |
| `miroir`, `demi`, `sombre` | 25 chacune | l'entraînement retourné, à demi-résolution, assombri | mise au point |
| `r70m` | 25 | l'entraînement à 70 % puis retourné | contrôle : on n'y règle rien |
| `extra` | 7 | la maison dans d'autres conditions (sans échelle, demi avec échelle, sombre et demi, sombre et miroir, 75 %) | mise au point |
| `decal` | 49 | 11 images de l'entraînement rognées de 1 à 10 px en haut à gauche | mise au point : la phase des grilles de réduction |
| `cmpval` | 40 | 40 autres façades CMP | mise au point |
| **mesure large** | **221** | les huit jeux ci-dessus réunis : 39 vues de la maison, 168 immeubles, 14 synthétiques | **la mesure de décision** |
| `page` | 13 | l'élévation que `facade.html` produit dans un navigateur à partir des trois photos de la maison (`maison-nav`, 3095 × 2312, ≈ 228 px/m), et douze variantes : avec échelle, rognées de 1, 2, 3, 5, 7 px, miroir, 50, 70 et 85 %, assombrie, 70 % en miroir | ce que l'utilisateur voit ; jugée à part |
| `ecart` | 47 | 40 autres façades CMP, deux autres vues de la maison (`maison-vue1`, `maison-vue3`), trois variantes de `maison-u`, deux synthétiques de biais | tenu à l'écart : départage des versions |
| `final` | 46 | 40 autres façades CMP, six variantes neuves de la maison | tenu à l'écart : dernier juge |

État des jeux tenus à l'écart, à savoir avant de s'en resservir : `ecart` a départagé les
approches puis les combinaisons (on n'y a réglé aucun seuil, mais on a choisi d'après lui) ;
`final` n'a servi à aucune mise au point, il a tranché **une** fois (le retrait d'une règle, §6) ;
deux règles du vote ont été conçues en regardant les défauts de `page`. **Pour une nouvelle
campagne de réglage, il faut un nouveau jeu final** (§8).

### Remonter les jeux

Les images ne sont pas dans le dépôt. Le dépôt garde les **annotations** (`annotations/<jeu>.json`,
un échantillon par ligne), les quatre images synthétiques (`images/`) et les scripts qui refont
tout le reste **au bit près** (vérifié le 10 novembre 2026 : 720 fichiers, aucune différence).

Il faut deux sources d'images :

1. **le jeu public CMP Facade**, archive `CMP_facade_DB_base.zip` (Tyleček et Šára, GCPR 2013,
   cmp.felk.cvut.cz/~tylecr1/facade/) : son dossier `base/` ;
2. **les six images de la maison** (photos privées, hors dépôt) : `maison-u.png`, `maison-n.png`,
   `maison-vue1.png`, `maison-vue2.png`, `maison-vue3.png`, `maison-nav.png` — l'archive
   `banc-facades-maison.zip` (50 Mo, le canal alpha porte le masque `vu`). Les copier avec les
   quatre PNG de `images/` dans un même dossier, noté `$IMG`.

```bash
B=outils/facade/banc ; A=$B/annotations ; J=<dossier de travail> ; CMP=<…>/base ; IMG=<dossier des dix PNG>
python3 -I $B/jeu.py monter $A/entrainement.json $J/entrainement --images $IMG --cmp $CMP
python3 -I $B/jeu.py monter $A/cmpval.json       $J/cmpval --cmp $CMP
python3 -I $B/jeu.py monter $A/ecart.json        $J/ecart --images $IMG --cmp $CMP   # 3 variantes « sans image » : c'est attendu
python3 -I $B/variantes.py $J/entrainement $J/ecart                                    # … les voici (maison-u miroir, demi, sombre)
python3 -I $B/jeu.py monter $A/final.json        $J/final --cmp $CMP                  # 6 variantes « sans image » : attendu
python3 -I $B/variantes_final.py $J/final $J/entrainement $J/ecart
python3 -I $B/jeu.py monter $A/page.json         $J/page --images $IMG                # 12 variantes « sans image » : attendu
python3 -I $B/decliner.py $J/page maison-nav $J/page 228.1
python3 -I $B/familles.py $J/entrainement $J/familles                                  # miroir, demi, sombre, r70m, extra, decal
```

## 3. Lancer la mesure

Les trois détecteurs sont indépendants et le vote ne regarde pas l'image. On **range** donc une
fois les boîtes de chaque détecteur sur chaque image (3 minutes par détecteur), puis on **rejoue**
le vote dessus en une seconde. Le rejeu rend exactement les notes du banc réel (vérifié).

```bash
BX=$J/boites
FAM="entrainement=$J/entrainement miroir=$J/familles/miroir demi=$J/familles/demi sombre=$J/familles/sombre extra=$J/familles/extra r70m=$J/familles/r70m cmpval=$J/cmpval decal=$J/familles/decal page=$J/page ecart=$J/ecart final=$J/final"
node $B/ranger.mjs outils/facade/baies/propositions.ts P $FAM --boites $BX
node $B/ranger.mjs outils/facade/baies/mailles.ts      M $FAM --boites $BX
node $B/ranger.mjs outils/facade/baies/travees.ts      T $FAM --boites $BX     # chacun doit finir par « 0 erreurs, 0 hors budget »

LARGE="entrainement miroir demi sombre extra r70m cmpval decal"
node $B/rejouer.mjs outils/facade/baies.ts P M T $LARGE --boites $BX --detail --csv $J/large.csv
node $B/rejouer.mjs outils/facade/baies.ts P M T page   --boites $BX --csv $J/page.csv
node $B/rejouer.mjs outils/facade/baies.ts P M T ecart  --boites $BX --csv $J/ecart.csv
node $B/rejouer.mjs outils/facade/baies.ts P M T final  --boites $BX --csv $J/final.csv
(cat $J/large.csv ; tail -n +2 $J/page.csv ; tail -n +2 $J/ecart.csv ; tail -n +2 $J/final.csv) > $J/resultats.csv

node $B/comparer.mjs $B/resultats/2026-11-10.csv $J/resultats.csv     # par famille, puis les images qui bougent
```

Sans changement de code, la comparaison doit dire `+0.0000` partout : c'est le test de
non-régression. Les étiquettes `P`, `M`, `T` sont libres : ranger une variante d'un détecteur sous
une autre étiquette (`M2`) permet de rejouer le vote avec elle (`P M2 T`) sans rien refaire d'autre.

À lancer aussi, parce que la mesure ne les couvre pas :

```bash
npx tsc -p outils/facade --noEmit                       # types stricts
node outils/facade/construire.mjs --verifier             # banc synthetique de la page : 13 lignes « ok », cotes des baies a 3 cm
node $B/evaluer.mjs outils/facade/baies.ts $J/entrainement --budget 3 --images $J/vues    # le banc reel : PNG a REGARDER, temps
node outils/facade/construire.mjs                        # reconstruit facade.html
NODE_PATH=$(npm root -g) node $B/navigateur/page_baies.cjs $J/navigateur 5 <photo 1> <photo 2> <photo 3>   # la page, comme sur un telephone
NODE_PATH=$(npm root -g) node $B/navigateur/page_png.cjs $J/page-nouvelle.png <photo 1> <photo 2> <photo 3>
cmp $J/page-nouvelle.png $IMG/maison-nav.png             # la page produit-elle toujours la meme elevation ?
```

`page_baies.cjs` joue l'import des photos, la fusion, le repérage sans échelle (capture
`resultat.png`), la pose d'une échelle, puis les corrections à la main et l'export CSV ; il sort en
erreur si un de ses six contrôles échoue. Si `cmp` dit que l'élévation a changé (le redressement ou
la fusion ont bougé), `maison-nav` n'est plus ce que la page produit : refaire le jeu `page` (§8).

## 4. Les règles de décision

Ce sont elles, plus que les chiffres, qu'il faut garder.

1. **Une image seule ne prouve rien.** Rogner une image d'un pixel change une partie des baies :
   la note d'une image bouge de 0,05 en moyenne, jusqu'à 0,2. La note d'un jeu tient à trois à
   cinq vues de la maison (elles pèsent 0,55). On ne décide rien sur un seul jeu.
2. **On décide sur la mesure large** (221 images), en regardant les totaux par groupe (justes,
   fausses, manquées) et le nombre d'images qui montent et qui descendent, pas seulement la note.
3. **Un changement du vote doit tenir avec d'autres versions des détecteurs** (au moins deux
   autres combinaisons rangées) et **au bruit** (bords des boîtes déplacés de ± 4 %, une boîte sur
   dix retirée, cinq graines) : un vote réglé sur les boîtes exactes d'une version ne tient pas.
4. **Une règle se juge sur des images qu'elle n'a pas vues.** Après la mise au point, la version
   est rejouée sur `ecart` et `final`. Un gain sur la mesure large qui devient une perte sur un jeu
   tenu à l'écart est rejeté, même s'il est grand (§6 : + 0,007 d'un côté, − 0,015 de l'autre).
   Regarder d'où vient un gain : s'il tient à cinq variantes de la même image, c'est un indice.
5. **Une correction de robustesse entre si elle ne change pas les boîtes** (ou si chaque boîte
   changée s'explique) : exception, valeur non finie, boîte hors image, temps non borné.
6. **Regarder les images.** Le rejeu donne des chiffres ; `evaluer.mjs --images` et la capture du
   navigateur montrent ce que l'utilisateur verra. Deux défauts de la campagne n'ont été vus que là.
7. **Celui qui écrit ne juge pas.** Chaque fichier a été relu par un relecteur, chaque constat
   reproduit par un vérificateur avant d'être corrigé, et le rendu contrôlé par un tiers qui
   recalcule tout. Les chiffres d'un auteur sont toujours recalculés.

## 5. Résultats de référence (10 novembre 2026)

Version livrée : `baies.ts` et `baies/*.ts` du commit qui ajoute ce fichier. Résultats image par
image : `resultats/2026-11-10.csv` (327 lignes) ; ceux du premier vote, sur les mêmes images :
`resultats/2026-11-09-premier-vote.csv`.

| Jeu | Note | Maison : note, rappel, précision | Immeubles | Synthétiques |
|---|---|---|---|---|
| `entrainement` | 0,8754 | 0,915 — 95 %, 91 % | 0,777 — 74 %, 80 % | 1,000 |
| `miroir` | 0,8920 | 0,953 — 100 %, 100 % | 0,766 — 72 %, 81 % | 1,000 |
| `demi` | 0,8910 | 0,960 — 100 %, 100 % | 0,752 — 70 %, 81 % | 0,999 |
| `sombre` | 0,8571 | 0,908 — 91 %, 87 % | 0,736 — 68 %, 80 % | 1,000 |
| `extra` | 0,9397 | 0,940 — 98 %, 98 % | | |
| `r70m` | 0,8825 | 0,930 — 100 %, 100 % | 0,774 — 73 %, 82 % | 0,999 |
| `cmpval` | 0,7205 | | 0,721 — 66 %, 74 % | |
| `decal` | 0,8432 | 0,905 — 94 %, 92 % | 0,701 — 62 %, 70 % | 1,000 |
| **mesure large** | **0,8666** | 0,9220 — 289 justes, 18 fausses, 12 manquées | 0,7415 — 2517 / 734 / 1163 | 0,9996 — 70 / 0 / 0 |
| `page` | 0,9398 | 115 justes, 5 fausses, 2 manquées | | |
| `ecart` | 0,8329 | 0,878 — 34 / 5 / 3 | 0,723 — 500 / 176 / 256 | 0,971 — 7 / 0 / 1 |
| `final` | 0,8534 | 0,917 — 40 / 2 / 1 | 0,754 — 532 / 150 / 229 | |

D'une version à l'autre (mêmes images) :

| Version | Mesure large | `page` | `ecart` | `final` |
|---|---|---|---|---|
| premier détecteur (régions lisses et sombres), sur l'entraînement seul : 0,34 | | | 0,36 | 0,26 |
| premier vote, trois détecteurs d'origine (9 novembre) | 0,8145 | 0,8366 | 0,7999 | 0,7649 |
| vote réécrit, détecteurs d'origine | 0,8593 | 0,9024 | 0,8422 | 0,8293 |
| vote réécrit, `mailles` et `travees` corrigés (second tour) | 0,8659 | 0,9304 | 0,8341 | 0,8533 |
| troisième tour avec la règle d'arbitrage (**non livré**) | 0,8738 | 0,9406 | 0,8337 | 0,8383 |
| **troisième tour, livré** | **0,8666** | **0,9398** | **0,8329** | **0,8534** |

Le jeu `page`, image par image (note, justes / fausses / manquées) :

| Image | Premier vote | Livré |
|---|---|---|
| `maison-nav` (sans échelle) | 0,869 — 9 / 2 / 0 | 0,970 — 9 / 0 / 0 |
| `maison-nav-ech` | 0,838 — 9 / 3 / 0 | 0,963 — 9 / 0 / 0 |
| `maison-nav-moins1` | 0,889 — 9 / 1 / 0 | 0,944 — 9 / 0 / 0 |
| `maison-nav-moins2` | 0,871 — 9 / 2 / 0 | 0,959 — 9 / 0 / 0 |
| `maison-nav-moins3` | 0,902 — 9 / 1 / 0 | 0,972 — 9 / 0 / 0 |
| `maison-nav-moins5` | 0,892 — 9 / 1 / 0 | 0,948 — 9 / 0 / 0 |
| `maison-nav-moins7` | 0,889 — 9 / 2 / 0 | 0,962 — 9 / 0 / 0 |
| `maison-nav-miroir` | 0,852 — 9 / 3 / 0 | 0,960 — 9 / 0 / 0 |
| `maison-nav-demi` | 0,764 — 8 / 4 / 1 | 0,875 — 8 / 1 / 1 |
| `maison-nav-r70` | 0,831 — 9 / 3 / 0 | 0,949 — 9 / 0 / 0 |
| `maison-nav-r85` | 0,783 — 8 / 5 / 1 | 0,888 — 8 / 1 / 1 |
| `maison-nav-r70-miroir` | 0,807 — 9 / 4 / 0 | 0,946 — 9 / 0 / 0 |
| `maison-nav-sombre` | 0,689 — 7 / 5 / 2 | 0,880 — 9 / 3 / 0 |
| **total** | 113 / 36 / 4 | 115 / 5 / 2 |

Autres mesures du même jour :

- **Temps** : 981 passages d'image (trois détecteurs, 327 images), aucun hors budget, aucune
  exception ; `maison-u` (16 Mpx) : 1,1 s pour le vote entier sous Node ; les deux façades qui
  mettaient 2,0 s et 0,9 s dans `travees` : 0,35 s et 0,45 s. Le vote seul : moins de 10 ms sur une
  image réelle, 0,5 s au pire pour 3 000 boîtes par détecteur.
- **Robustesse** : `mailles`, 93 cas dégénérés sans défaut ; `travees`, 1 127 cas dégénérés et
  500 images au hasard sans défaut ; `propositions`, 400 scènes au hasard sans boîte hors image ;
  le vote ne lève plus sur une entrée mal formée et ne dépend plus de l'ordre des boîtes.
- **Banc synthétique de la page** (`construire.mjs --verifier`) : 13 contrôles sur 13 ; baies à
  3 cm près (porte 90 × 215, fenêtres 121 × 135 et 121 × 60).
- **Navigateur** (Chromium, émulation d'iPhone 13, les trois photos) : 9 baies sans échelle,
  aucune fausse, porte d'entrée et porte-fenêtre du porche entières, 1,9 s ; les six contrôles de
  `page_baies.cjs` au vert ; l'élévation produite est identique au bit près à `maison-nav`.
  **Pas testé sur un vrai téléphone.**
- **Suite du dépôt** : `typecheck`, `lint`, `cliquet`, `gate:client`, 5 213 tests.

Ce qui reste imparfait, à surveiller dans une prochaine campagne :

- la porte-fenêtre du porche s'arrête à la lisse de la balustrade sur certaines variantes de
  `page` (`-moins1`, `-r70`, absente sur `-r85`), et dans le navigateur une fois l'échelle posée
  (1,55 m de haut au lieu de 2,10 m) ;
- deux détecteurs qui se trompent ensemble l'emportent sur le troisième : fenêtres d'étage prises
  avec leur encadrement de colombage, ou sans leur imposte (`maison-n`, étage) ;
- une image sombre garde des fausses baies dans la balustrade (`maison-nav-sombre` : 3) ;
- sur les immeubles : un cinquième des fenêtres ne sont vues par aucun des trois détecteurs (707
  sur 3 680), et sans échelle le sol reste incertain (deux portes sur trois sortent « fenêtre ») ;
- les marges de temps de `travees` sont minces sur ses pires cas (0,83 à 0,92 du budget).

## 6. Ce qui a été essayé et écarté

Pour ne pas le réessayer sans raison nouvelle. Écarts donnés sur la mesure large, sauf mention.

| Essai | Résultat | Pourquoi écarté |
|---|---|---|
| **Vote : arbitrage à trois voix par le rang** (donner raison à la seule boîte qui a la taille d'une baie sûre du même rang, contre la médiane) | + 0,0072 ; `page` + 0,001 ; `ecart` + 0,001 ; **`final` − 0,0151** | cinq rognages de la même maison faisaient 97 % du gain ; il ne tient pas sur des images neuves |
| Vote : arbitrage par le rang **ou la colonne** | + 0,0015, mais − 0,006 avec deux autres combinaisons | tient à une version des détecteurs |
| Vote : dissoudre les grappes d'accord faible ; arbitrage par la fratrie | − 0,003 à + 0,002 selon la combinaison | gain porté par une vue, immeubles et `page` en baisse |
| Vote : règle 3 (le tout et ses parties) seulement à partir de deux baies réunies | + 0,0004, − 0,0013 ailleurs, bruit − 0,0004 | le signe ne tient pas |
| Vote : descendre une baie jusqu'au sol quand un détecteur y voit le bas | − 0,0009 partout | 12 vues de la maison descendent pour une qui monte |
| `propositions` : rugosité des images peu réduites, symétrie corrigée | − 0,0003 au vote | rien de mesurable ; coûte du temps |
| `propositions` : cases non vues retirées des sommes | 0 sur la mesure large ; perd une ouverture synthétique dans `ecart` | une correction ne doit pas coûter de baie |
| `mailles` : sens de lecture canonique (le miroir rend le miroir) | − 0,0032, une ouverture de la maison perdue | propriété juste, mais elle change la phase de dix images |
| `mailles` : réunions exigeant un cadre de chaque côté | + 0,0001 seule ; avec « un morceau ne sert qu'une fois », perd un pan de baie vitrée sur `page` | gardé l'autre, neutre sur la maison |
| `travees` : réduction symétrique | vote 0,846 sur l'entraînement (0,863 avant) | la maison retombe sur toutes les phases |
| `travees` : rugosité centrée, réunion à 7 % | ± 0,001 | de la chance déplacée d'une image à l'autre |
| Faire voter six détecteurs au lieu de trois | + 0,007 pour le double du temps | pas rentable |

Retenu malgré un bilan partagé : les **montants chaînés** de `travees` (+ 0,007 sur la mesure
large, − 0,011 sur l'entraînement seul) parce qu'ils rendent la baie vitrée entière avec ses
impostes, et qu'ils gagnent sur `final`.

## 7. L'organisation de la campagne

Trois tours, chacun mené par des agents distincts pour chaque rôle :

1. **Concours** : six approches développées séparément sur l'entraînement, départagées sur `ecart` ;
   les trois meilleures (`propositions`, `mailles`, `travees`) votent.
2. **Relecture** : pour chacun des quatre fichiers, un relecteur (8 constats au plus, chacun avec
   une reproduction exécutable), un vérificateur qui tente de les reproduire (32 confirmés sur 32),
   un responsable qui corrige et perfectionne. Puis combinaison et mesure de toutes les
   combinaisons (2 × 3 × 3 versions de détecteurs) sur la mesure large.
3. **Intégration** : versions « sûres » des détecteurs (corrections de robustesse, mêmes boîtes),
   relecture et vérification du vote réécrit (8 constats confirmés), analyse des erreurs
   restantes, correction, contrôle par un tiers, puis arbitrage sur `ecart` et `final`.

Critères d'acceptation utilisés pour un changement du vote : mesure large meilleure (ou égale pour
une correction) ; pas plus de 0,002 de baisse avec quatre autres combinaisons de détecteurs ; aucun
groupe en baisse de plus de 0,003 ; la maison ne perd aucune ouverture juste au total ; la règle
se dit en une phrase générale ; elle tient au bruit.

## 8. Lancer un nouveau jeu

Un nouveau jeu sert soit à **élargir la mise au point** (d'autres maisons : aujourd'hui toutes les
vues de maison viennent de la même), soit à **remplacer le jeu final**, qui a déjà tranché une
fois. Dans le second cas, ne pas le regarder avant d'avoir figé la version à juger.

1. **Les images.** Pour une maison photographiée : ouvrir `facade.html`, importer les photos,
   « Assembler », bouton « PNG (sans perte) » — ou, sans téléphone,
   `NODE_PATH=$(npm root -g) node $B/navigateur/page_png.cjs <sortie.png> <photos…>`. C'est
   l'élévation que le détecteur recevra. Viser plusieurs maisons de styles différents (enduit,
   brique, pierre, bardage ; volets, garde-corps, véranda) plutôt que plusieurs vues d'une seule.
   Pour des immeubles : d'autres façades du jeu CMP (`cmp_stats.py`, `cmp_convertir.py`).
2. **L'annotation.** Un fichier `{ "<nom>": { "nom", "groupe": "maison", "largeur", "hauteur",
   "pxParM": null ou la valeur, "gt": [...], "ignorer": [...] } }`, comme `annotations/page.json`.
   Chaque ouverture : `{ "nom", "classe": "fenetre" | "porte", "x", "y", "l", "h" }` en pixels, au
   hors-tout de la menuiserie ; `"difficile": true` pour ce qui est caché ou minuscule ;
   `"groupe": "<nom commun>"` sur les pans d'une même baie vitrée ; `ignorer` pour ce qui n'est pas
   la façade (annexe, voisin). `zone.py` agrandit une zone avec une grille pour lire les
   coordonnées, `voir_gt.py` trace l'annotation pour la vérifier. Si la même façade est déjà
   annotée sur une autre élévation, `reporter.py` reporte l'annotation par points homologues
   (c'est ainsi que `maison-nav` a été annotée, à 2 px près : vérifier l'aperçu).
3. **Le jeu.** Mettre les PNG dans un dossier, puis
   `python3 -I $B/jeu.py monter <annotations.json> $J/<jeu> --images <dossier des PNG>`, et, pour
   chaque image, `python3 -I $B/decliner.py $J/<jeu> <nom> $J/<jeu> <pxParM ou 0>` (douze variantes :
   une image seule ne prouve rien). `python3 -I $B/jeu.py annoter $J/<jeu> $A/<jeu>.json` range
   ensuite toutes les annotations, variantes comprises, dans le dépôt.
4. **La mesure.** Ajouter `<jeu>=$J/<jeu>` aux trois commandes `ranger.mjs` du §3, puis
   `node $B/rejouer.mjs outils/facade/baies.ts P M T <jeu> --boites $BX --detail --csv $J/<jeu>.csv`.
   Regarder les images (`evaluer.mjs … --images`).
5. **La trace.** Copier le CSV dans `resultats/<date>-<jeu>.csv`, ajouter une ligne au tableau du
   §5 et, si le jeu a servi à décider quelque chose, le dire au §2 : un jeu qui a tranché n'est plus
   vierge. Garder les PNG hors du dépôt, avec les autres (`jeu.py archiver` les refait depuis un
   dossier de jeu).

Ordres de grandeur pour interpréter un nouveau jeu (version livrée, 327 images) : sur une vue de
maison, la note médiane est 0,94, neuf sur dix sont au-dessus de 0,84, la plus basse à 0,75 ; sur un
immeuble, la médiane est 0,77, de 0,12 à 0,99 selon la façade. En dessous de 0,85 sur une maison,
regarder l'image : c'est le plus souvent une baie vitrée morcelée, une porte coupée par un
obstacle, ou des fausses baies dans une balustrade.
