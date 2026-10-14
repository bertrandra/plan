---
name: toits
description: Toits et hauteurs de murs des bâtiments IGN (BD TOPO, LiDAR HD, corps et pignons, croupes, appentis, toits plats, recalage, végétation, contours de biais, dessin 3D, fenêtres). À charger avant de toucher à src/facade/toitCorps.ts, facade/toitLidar.ts, model/toitMesure.ts, model/volumesToit.ts, app/toitsLidar.ts, three/toitCorps3d.ts ou facade/ouvertures.ts, avant d'analyser un toit « bizarre », et avant de vérifier les toits sur un quartier ou un village.
---

# Toits et hauteurs de murs

La référence complète est `MD/spec-toit-ign.md` (§2 à §4 : BD TOPO ; §10 : LiDAR ; §11 : corps par
rectangles ; §12 : surface mesurée ; §13 : corps et pignons, voisinage, reprise). Ce skill en est le
résumé opérationnel, avec les règles, les seuils, les pièges déjà rencontrés et la méthode de travail
sur le terrain (scripts de `scripts/`).

## 0. Impératifs

1. **AE 101 ne bouge pas.** Le 2 allée des Limites, 78110 Le Vésinet (parcelle AE 101), est la maison
   de référence de l'utilisateur. Ses corps et ses volumes doivent rester identiques **au
   centimètre** après toute modification. On le vérifie avant chaque commit :
   ```bash
   npx tsx .claude/skills/toits/scripts/identite.ts > /tmp/toits/avant.txt   # avant de modifier
   npx tsx .claude/skills/toits/scripts/identite.ts | diff /tmp/toits/avant.txt -   # après
   ```
   Le test `toitCorpsReprise.test.ts` (« AE 101 : les corps d'avant, au centimètre ») le vérifie aussi.
   Depuis le 14 octobre 2026, AE 101 porte un fait (la galerie de sa façade sud, `regles/toits/faits.json`,
   décision de l'utilisateur) : `identite.ts` compare le calcul seul à `corps` et le calcul sous ses
   faits à `corpsAvecFaits` (quatre corps, l'appentis en plus). Les deux doivent rester identiques.
2. **Des règles générales, jamais un cas codé.** Une correction s'écrit comme une règle de couvreur,
   avec un seuil nommé et commenté. Le commentaire dit pourquoi et cite le cas qui l'a montrée
   (« Hucqueliers », « AE 98 »). On la valide sur plusieurs villages (§6), pas sur le seul bâtiment.
3. **Décisions de l'utilisateur, à ne pas remettre en cause :**
   - Le recalage déplace **le bâtiment entier** (`pts` translaté), jamais les corps un par un, et
     sans changer sa forme.
   - La 3D garde **la forme du plan 2D** : un contour de biais n'est pas dessiné en escalier.
   - « Toits en corps et pignons » (voisinage) est **coché par défaut**.
   - La Vue 3D cadre par défaut **la parcelle du projet et ses mitoyennes**, pas plus.
   - La surface brute du LiDAR (« Tel que mesuré ») ne se montre **qu'à la demande** : par défaut on
     montre un toit construit.
   - Un toit qui manque sur un bout de contour (un triangle sans toit) n'a pas de sens : il faut
     compléter.
4. Le circuit du dépôt s'applique (CLAUDE.md) : vérifications, CHANGELOG, PR, merge, livraison. Une
   règle de toit ne change ni quantité ni export (les empreintes golden ne bougent pas) ; si elles
   bougent, c'est un autre sujet.

## 1. Les sources

| Source | Ce qu'elle donne | Où | Fiabilité |
|---|---|---|---|
| BD TOPO `batiment` | `hauteur` (du sol à l'**égout**), `altitude_minimale_toit` / `_maximale_toit`, `construction_legere`, `nombre_d_etages` | `geo/bdtopo.ts`, `geo/cadastreObjets.ts` | ±1 m sur les altitudes ; hauteurs parfois fausses (l'église d'Hucqueliers : 4,7 m) |
| MNH LiDAR HD (WMS `IGNF_LIDAR-HD_MNH_ELEVATION…LAMB93`) | hauteur du sursol tous les 50 cm | `geo/mnh.ts` (`lireGrilleSous`, `lireHauteursSous`) | fidèle, mais voit aussi les arbres et le sol entre deux toits |

- `hauteurBatiment` : hauteur mesurée, sinon `étages × 2,7 m`, sinon 2,5 m (une estimation avouée).
  Le résultat est rangé dans `bdtopo.hauteurRetenueM`.
- Grille MNH : emprise + 1 m, pas de 0,5 m (plus grossier au-delà de 10 000 cellules), cellules à
  plus de 0,25 m des murs (`RETRAIT_MNH_M`). Sans dalle LiDAR, rien n'est lu (`dallesLidarSur`) :
  Saint-Aybert et Gommegnies (Nord) n'ont pas de couverture.
- Les lectures se font dans le repère du plan construit (`projecteurDuPlan`), pas celui de l'adresse.

## 2. La chaîne, dans l'ordre

`app/toitsLidar.ts::toitsDepuisLidar` (import depuis une adresse et actualisation IGN). Les plus
proches d'abord, au plus 30 bâtiments en 20 s, quatre lectures à la fois ; les autres en tâche de
fond (`app/toitsFond.ts`), en file continue, chaque bâtiment lu marqué `toitLidarLu` (`MD/roadmap-toits-fond.md`).

1. **Forme simple** (`facade/toitLidar.ts::ajusterToit`) : plat, appentis, deux pans, croupes, quatre
   pans, sur trois axes. On fait les moindres carrés sur `z = e + H·f(q)`. Au moins 20 mesures et un
   écart sous 0,8 m (sous 0,4 m pour un appentis), sinon on garde la BD TOPO. Si les hauteurs se
   séparent en deux paquets à plus d'un mètre (`deuxCorps`), on renonce.
2. **Recalage** (projet et mitoyens) : `recalerSurLidar` → `decalageSurMesure`. Il se déclenche si
   plus de 12 % des cellules sous le contour sont non bâties (< 2,5 m). La grille est alors relue 3 m
   plus large, et on cherche un décalage de pas 25 cm, à ±3 m au plus. Le score : bâti dedans, vide
   dans la bande de 0,5 à 1,5 m autour. AE 103 a été décalé de (−1 ; −1,75) m ; AE 101 (5,5 %) ne
   l'est pas.
3. **Surface mesurée** (`model/toitMesure.ts::toitMesureDepuisGrille`) : grille recadrée sur le
   contour, puis nettoyée. Sont retirés le sol (< 0,5 m), les arbres (au-delà du 9e décile + 1 m) et
   ce qui est sous l'égout − 0,3 m. Les trous sont bouchés par médiane, les saillies (+2 m) écrêtées,
   puis on lisse par médiane 3 × 3. L'égout est le 10e centile à plus de 0,5 m des murs.
4. **Végétation** (`corpsVraisemblables`, `mesureVraisemblable`) : un corps dont l'égout dépasse la
   hauteur BD TOPO de plus de 3 m est un houppier (`DEPASSEMENT_VEGETATION_M`), il est écarté. Si
   toute la surface est dans ce cas, ni surface ni forme ajustée ne sont gardées.
5. **Corps et pignons** (`facade/toitCorps.ts::reconstruireCorps`, §3).
6. **Ce que la 3D montre** (`modeToitActif`) : `modeToit` choisi ; sinon les corps, sinon les
   volumes, sinon la forme simple. `'mesure'` seulement si l'utilisateur la choisit.

Voisinage : sur une parcelle **mitoyenne** (au moins 1 m de limite commune, `model/mitoyennete.ts`),
le calcul est entier et la grille est gardée. Plus loin, c'est la version **allégée** :
`coupes: false`, sans grille gardée.

## 3. La reconstruction des corps (`reconstruireCorps`)

### Contour qui se découpe (`rectanglesDuContour` non nul)

1. **Rectangles maximaux** (`model/volumesToit.ts`) : mise à l'équerre à 15° près, décrochés de
   moins de 1,2 m lissés, couverture par rectangles maximaux. **Ils se chevauchent par
   construction** (une aile qui pénètre un corps ; dans la 3D, le plus haut l'emporte).
2. **Marches** (`decouperParHauteurs`) : on coupe là où la couverture saute d'au moins 0,8 m
   (`SEUIL_MARCHE_M`), d'un coup (1,6 fois plus que sur le mètre voisin). Un bloc fait au moins
   1,5 m.
3. **Ailes recouvertes** : une aile qui a plus de la moitié de sa surface sous un rectangle plus
   grand (`PART_SOUS_PLUS_GRAND`) n'est pas coupée aux marches si son toit entier tient la mesure
   à la tolérance des bandes (1,6) avec des égouts d'au moins 2 m. Les marches qu'on y lit sont les
   pentes du toit qui la couvre.
4. **Refonte** (`refondre`) : le toit lu par les formes sur le rectangle entier l'emporte si son
   écart (symétrique, borné à 1,2 m) est au plus 1,15 fois celui des morceaux (`TOLERANCE_REFONTE`).
   La tolérance passe à 1,6 si un morceau fait moins de 3 m (`LARGEUR_BANDE_M`, `TOLERANCE_BANDE`).
   Il l'emporte toujours s'il n'y a **aucune marche** aux coupes : saut médian de la grille sous
   0,6 m (`CONTINUITE_M`, `sautAuCote`). Les paires de blocs qui partagent un côté entier sont
   ensuite refondues à la même règle.
5. **Coupe par le modèle** (`meilleureCoupe`, deux fois au plus, pas en version allégée) : on garde
   deux toits plutôt qu'un si l'écart tombe aux 2/3, qu'il valait au moins 25 cm et que les deux toits
   diffèrent d'au moins 60 cm.
6. **Toit du corps** (`ajusterCorps`) : chaque sens et chaque position de faîtage tous les 25 cm,
   murs compris (un appentis). L'ajustement est robuste vers le haut : ce qui dépasse le pan de plus
   de 40 cm est écarté (pignon, arbre, lucarne). Pente au plus 60°, égouts au moins 1,5 m.
7. **Pignons** (`detecterPignons`) : le long d'un mur de façade, la mesure dépasse le pan de 80 cm,
   sur 1,5 à 6 m, et reste à hauteur vers l'intérieur sur au moins 1,5 m. Le corps est réajusté sans
   eux. **Pas de pignon sur un appentis.**
8. **Croupes** (`avecCroupesSiMieux`) : la lecture des formes l'emporte si elle donne des croupes et
   un écart d'au plus 0,8 fois celui des pignons de bout (`GAIN_CROUPES`). Exemple : AE 100, un
   quatre-pans qui se lisait en appentis à 5,5 m.
9. **Bandes recouvertes** (`sansBandesRecouvertes`) : une bande de moins de 3 m qui a plus de 90 % de
   sa surface sous les autres corps est retirée, la plus recouverte d'abord (la plus étroite à
   égalité). Un corps plus large reste, même recouvert : c'est souvent lui le bon toit, et les
   bandes ses morceaux.

### Contour de biais (reprise, `corpsDeReprise`)

`contourEquerre` (chaque biais devient une marche au droit d'un autre sommet, dans l'axe qui aligne
le plus de côtés : `axeDesCotes`) → `rectanglesEnTranches` → `corpsDepuisFormes` par tranche (à
défaut, le modèle des corps) → `completerSurContour`. En dernier recours, `corpsSurBoite` : un seul
corps sur la boîte orientée, avec `lectureDeSecours`. L'appentis y est admis s'il bat d'un dixième la
meilleure forme à faîtage : c'est le toit à un pan des maisons de village provençales.

**Complétion** : un corps avance ses côtés libres pour couvrir le contour (pas de 25 cm, 8 m au
plus), seulement si :
- la bande devant lui est pour au moins 10 % du contour sans toit (`PART_COMPLETION_MIN`) ;
- en travers, aucun égout ne tombe sous 2 m (`EGOUT_ETENDU_MIN_M`) ;
- la mesure y est à sa hauteur, pas à plus d'un mètre sous son égout (`SOUS_EGOUT_ETENDU_M`), donc
  pas sur une annexe basse.

Le long du faîtage, celui-ci s'allonge. En travers, les pans descendent à leur pente
(`corpsEtendu`).

### Les quatre formes, une seule règle

| Forme | Données (`CorpsToit`) | Règle |
|---|---|---|
| deux pans | `posFaitage` intérieur, `egouts: [e0, e1]` (chaque pan son égout) | pignons de bout, pignons depuis le faîtage |
| quatre pans | idem + `croupes: [h0, h1]` | croupes à la pente des pans |
| un pan (appentis) | `posFaitage` = 0 ou W | faîtage à moins de 1 m d'un mur (`PAN_MIN_M`) : l'appentis l'emporte s'il fait au plus 1,1 × l'écart + 5 cm |
| plat | faîtage = égouts | moins de 30 cm de montée (`HAUTEUR_PLAT_M`) ou moins de 3° (`PENTE_PLAT_DEG`) |

Les formes simples rendent plat sous 10° (règle BD TOPO). Pour un corps, `unPanPlutotQuePlat` garde
l'appentis s'il monte d'au moins 30 cm, à 3° au moins, et si son écart fait au plus 0,9 fois celui du
plat. Ainsi un garage à 6° reste un pan, et la terrasse d'AE 103 (4,6°) reste plate.

### Bâtiment à cheval sur deux parcelles : on demande

Un contour BD TOPO qui franchit une limite de parcelle couvre souvent deux maisons mitoyennes. Si un
corps passe par-dessus la limite (au moins 4 m² de chaque côté), la mesure ne tranche pas entre « un
seul toit » et « deux toits de même hauteur ». **Plan ne devine pas : il pose la question**
(`app/toitsACheval.ts`, dialogue de choix Z8, bâtiment sélectionné sur le plan).
- Les parts : `model/aCheval.ts::partsACheval` (8 m² et 15 % au moins par part).
- Le doute : `douteACheval`, noté par `app/toitsLidar.ts::toitAChevalApresCalcul` pour le projet et
  les mitoyens, dans `toitACheval`.
- La réponse : `toitACheval.reponse`, soit `'un'` (les corps restent), soit `'parParcelle'` (les
  corps sont relus sur chaque part par `corpsParParcelle`). Elle est réappliquée à chaque calcul ;
  Échap la remet à la prochaine ouverture.
- Règle à garder pour la suite : **quand un doute sur un toit dépend d'un fait que seul
  l'utilisateur connaît, on lui pose une question précise** plutôt que d'ajouter un seuil de plus.

## 4. Les hauteurs de murs

| Hauteur | D'où | Règle |
|---|---|---|
| `elevation` (le prisme) | BD TOPO `hauteur` (sol → égout) | remplacée par l'égout LiDAR s'il s'en écarte d'au moins 0,3 m et reste entre 2 et 40 m (`app/toitsLidar.ts`, `ECART_EGOUT_MIN_M`) |
| égout d'un corps | `egoutDansRect` (10e centile, loin des murs) ou ajustement | jamais sous 1,5 m (corps), 1,8 m (surface) ; la végétation au-delà de BD TOPO + 3 m est écartée |
| murs d'un volume (`VolumeToit.hauteursMurs[i]`, mur `pts[i]→pts[i+1]`) | `hauteurMurMesuree` : 10e centile le long du mur, à 50 cm en retrait | tenue entre égout et faîte ; l'inspecteur dit « murs de 3,9 à 7,2 m » si l'écart dépasse 30 cm |
| murs d'un corps | `hauteursMursCorps(c)` = `[egouts[0], bas, egouts[1], bas]` | prisme à l'égout le plus bas ; au-dessus, en couleur de mur, le mur du pan haut et les murs de bout jusqu'au faîtage (pignon, mur haut d'un appentis) ; un bout sous une croupe s'arrête aux égouts |
| contour de biais | `three/toitCorps3d.ts::facettesSurContour` | prisme = le contour lui-même à l'égout le plus bas ; toits découpés sur le contour (Sutherland–Hodgman) ; murs montés pas à pas jusqu'au toit |
| mur d'une façade pour les fenêtres | `facade/ouvertures.ts::hauteurDuMur` | le volume qui contient le mur, ou à défaut celui dont un mur passe à moins de 0,8 m ; puis son mur le plus proche |

Fenêtres : niveaux de 2,7 m (`HAUTEUR_ETAGE_M`), rien sous 2,2 m (`HAUTEUR_NIVEAU_MIN_M`) ni sur un
mur de moins de 2 m. Une fenêtre de pignon se pose si le triangle fait au moins 1,8 m
(`HAUTEUR_PIGNON_FENETRE_M`), jamais sous une croupe ni sur un appentis.

Dessin des pans : débord de 35 cm à l'égout et rive de 20 cm aux bouts, **sur les façades
seulement** (contre un autre corps, le toit s'arrête au mur). Un appentis déborde aussi au-delà de son
mur haut. Pas de débord en reprise.

## 4 bis. La couleur des murs et des toits

Même règle pour les deux :
- une lecture sur photo quand elle est cohérente, sinon un repli ;
- la source est enregistrée ;
- une valeur choisie à la main n'est jamais touchée par une actualisation.

**Les toits** : la couleur est lue sur l'orthophoto (§6.1). Quand la photo ne conclut pas, on se
rabat sur une couverture rouge, brune ou grise, que le matériau de toiture des fichiers fonciers
départage (`repliSelonMateriau`).

**Les couvertures en 3D** (§6.2, `materiauCouverture`) : un toit-terrasse est en gravillons. Ensuite
le matériau de toiture des fichiers fonciers décide (ardoise, zinc, tuile), puis la couleur. Une tuile
est plate à 40° et plus, canal à 25° et moins au sud du 46e parallèle, romane sinon. Pour un
bâtiment en corps, c'est la pente du plus grand corps en pente qui compte. Piège vu : sans latitude,
les annexes peu pentues du Nord passaient en tuile canal. Problème ouvert : à Gordes, beaucoup de
toits sans matériau ont une couleur lue grise sur l'orthophoto (tuiles anciennes) et deviennent des
ardoises.

**Les murs** (§6.5) :
- **Matériau** : `bdtopo.materiauxMurs`, deux chiffres (1 pierre, 2 meulière, 3 béton, 4 brique,
  5 aggloméré, 6 bois, 0 indéterminé, 9 autre). Il vaut pour tous les bâtiments, sans appel réseau,
  mais n'est renseigné que pour 30 à 75 % d'entre eux.
- **Photo Panoramax** (`render/couleurMurPhoto.ts`) : prioritaire quand elle est concluante. Les
  points du mur sont projetés dans l'image. On écarte les murs cachés par un autre bâtiment, les
  lignes de vue sous 2,5 m aux limites de parcelle (clôtures, haies), ainsi que le ciel, le
  feuillage et l'ombre. Garde-fous : au plus 20 % des points sur le ciel (`PART_CIEL_MAX`, ciel de la
  photo compris : `lectureDuMur`), pas de teinte froide, façade lue sur ce qui en reste si 30 points
  et le quart sont lisibles. À l'import, les 150 plus proches ; la lecture de fond par zones
  (`app/mursFond.ts`) existe mais est arrêtée (`LECTURE_MURS_EN_FOND`). Passer `VERSION_LECTURE_MURS`
  quand une règle conclut plus souvent : les murs restés sans lecture concluante sont relus.
- **Rendement mesuré (octobre 2026)** : 10 murs lus sur 486 bâtiments au Vésinet (300 m), 1 sur 257
  à Rennes (200 m). Recalage du cap sur la ligne des toits essayé : inutile en banlieue arborée. Les photos tombent bien sur la façade, mais un enduit gris par temps couvert ou
  de brouillard est pris pour une ombre (`estOmbre`) ; des photos grand angle au crépuscule sont mal
  calées (points dans le ciel). C'est la règle de lecture à reprendre, pas la géométrie.
- **Choix** : « Murs en 3D » dans « Apparence » (automatique, photo, matériau ou couleur du plan),
  rangé dans `couleurMurs.source`.
- **Pièges vus** : en banlieue, la façade est en retrait derrière une haie ou une palissade, et une
  première version lisait la clôture. Une haie de thuyas à l'ombre est olive (#464631), pas verte.
  Un enduit beige à l'ombre devient gris (92, 90, 93). Les photos de tableau de bord (Gordes) sont
  un peu sous-exposées.
- **Textures** (§6.6, `three/textureMur.ts`) : une par matériau, dessinée en gris et teintée par la
  couleur retenue. Elles sont à l'échelle réelle (brique 1 m, pierre 2 m, meulière 1,5 m) et sans
  couture. Elles se posent sur le prisme et sur les murs hauts des corps (`uvDuMur`). Une texture
  choisie dans l'inspecteur l'emporte. Pour les contrôler, rendre chaque texture en 2 × 2 tuiles :
  c'est ce qui a montré une meulière « peau de girafe » à corriger.
- **Diagnostic** : dessiner les points lus sur la photo (projection, `pixelsDuMur`) avant de toucher
  aux seuils. C'est ce qui a montré que la géométrie était juste et que les erreurs venaient des
  clôtures.

## 5. Typologies vues sur le terrain

| Lieu | Bâti | Ce qui a été appris |
|---|---|---|
| Le Vésinet, allée des Limites | pavillons | AE 101 : deux pans à 7,5 m, deux pignons depuis le faîtage, annexe et aile basses. AE 100 : quatre pans. AE 103 : contour décalé, deux quatre-pans et un toit plat entre eux. AE 98 et sa mitoyenne : deux-pans que la pente coupait en morceaux (→ refonte, continuité). Abri de 2,70 m vu à 15 m sous un arbre (→ végétation). 57 maisons : 117 corps avant la continuité, 105 après. |
| Gordes, Aix, Saint-Rémy (Provence) | village perché, trapèzes, mitoyenneté | contours aux angles non droits (→ reprise, boîte orientée, toit à un pan). Château : plat construit au lieu d'un relief en vagues. Gordes : 52 bâtiments sans toit construit avant, 13 après. |
| Hucqueliers (Pas-de-Calais) | longères en brique, pavillons hauts aux bouts d'un corps bas, église, annexes basses | complétion qui suivait une lisière de biais (égout à −1,3 m) ou couvrait une annexe à 3 m d'un toit à 8,6 m (→ trois garde-fous de la complétion). Ailes presque confondues débitées en bandes, pignons en double (→ ailes et bandes recouvertes). Église : nef à deux pans 7/7 m. |

Chiffres de référence du banc (code de `main` au 14 octobre 2026, bf39898, sur les JSON de
`/tmp/toits`), à comparer après une modification. Les quatre premières colonnes de compteurs sont
celles d'avant le banc des formes, inchangées ; seule Hucqueliers a un suspect de plus que la
version précédente de ce tableau (33, branche `claude/toits-nord`) : 37248618 a pris un écart de
0,53 m avec le faîtage « dans le sens que lit la mesure » (42eeef2, 11 octobre). Les formes sont
celles des bâtiments (corps principal, §6.1) : plat, appentis (1p), deux-pans (2p), croupes (4p),
pavillon (pav.), sans corps ou sans mesure (—).

| Village | Bâtiments | Corps | Suspects | Sans corps | Reprise | plat | 1p | 2p | 4p | pav. | — |
|---|---|---|---|---|---|---|---|---|---|---|---|
| vesinet (AE 101, 100 m) | 58 | 100 | 30 | 1 | 5 | 6 | 6 | 35 | 10 | 0 | 1 |
| hucqueliers | 69 | 118 | 34 | 2 | 14 | 12 | 21 | 31 | 3 | 0 | 2 |
| gordes | 152 | 216 | 95 | 13 | 74 | 12 | 74 | 48 | 4 | 1 | 13 |
| aix | 51 | 86 | 27 | 4 | 5 | 13 | 10 | 19 | 5 | 0 | 4 |
| stremy | 75 | 126 | 34 | 4 | 5 | 9 | 16 | 42 | 3 | 1 | 4 |
| versailles (D16) | 98 | 190 | 61 | 12 | 31 | 14 | 23 | 41 | 5 | 3 | 12 |
| eguisheim (D16) | 327 | 401 | 241 | 52 | 125 | 19 | 100 | 140 | 12 | 4 | 52 |
| beuvron (D16) | 119 | 206 | 80 | 17 | 27 | 8 | 39 | 47 | 7 | 0 | 17 |

Les trois villages de D16 ont été capturés le 14 octobre 2026 (§6.2) ; aucune forme nouvelle n'y
est encore produite, c'est leur point de départ. À Versailles, les toits à la Mansart à terrasson
plat se lisent aujourd'hui en pavillon ou en croupes (28283510, 28283290) : ce sont les premiers
candidats du lot Mansart. À Eguisheim, 44 bâtiments n'ont pas de surface mesurée (petites annexes
serrées) : à regarder avant d'y juger une forme.

« Suspect » ne veut pas dire faux : c'est une liste de bâtiments à regarder.

## 6. Méthode : vérifier sur un village

Les scripts de `.claude/skills/toits/scripts/` écrivent dans `$TOITS_DOSSIER` (par défaut `/tmp/toits`).
`village.mjs` affiche aussi les bâtiments à cheval et la question posée, et en fait une capture.
`REPONSE_CHEVAL=principal` ou `secondaire` répond à chaque question ; sans cette variable, Échap.

```bash
# 1. Serveur de dev (en arriere-plan), puis le village tel qu'un utilisateur le cree
BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort
NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "Place de la Mairie 62650 Hucqueliers" 100 hucqueliers
# 2. Banc : reconstruction avec le code courant, suspects tries
npx tsx .claude/skills/toits/scripts/banc.ts hucqueliers > /tmp/toits/banc-hucqueliers.txt
# 3. Cartes des hauteurs des suspects, en planche (a lire avec l'outil Read)
python3 .claude/skills/toits/scripts/rendu.py --montage planche.png 37248484 37248520 37248524
# 4. Un batiment en detail, puis le recouvrement de ses corps
npx tsx .claude/skills/toits/scripts/diag.ts 37248520
python3 .claude/skills/toits/scripts/recouvrement.py 37248484
# 5. Une vue 3D precise (cible en coordonnees du plan, dz > 0 : depuis le sud)
SANS_DUMP=1 VUES='[["sud",16,-3,0,14,24]]' NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "<adresse>" 100 hucqueliers
```

- Le JSON du village contient les **contours recalés** (ceux de l'application) et la grille relue
  1 m plus large. `banc.ts` rejoue donc la reconstruction sans réseau, en quelques secondes : c'est
  la boucle de travail. On relance `village.mjs` seulement pour la 3D.
- Lire une carte : le bleu est bas, le rouge haut. Le contour est en noir, les corps en magenta et
  le faîtage en noir avec sa hauteur. Le blanc est le sol ou une absence de mesure. Une bande rouge
  le long d'un mur, c'est souvent un faîtage décentré ou un pignon. Un bloc rouge rond, une tour ou
  un arbre.
- Avant de modifier, enregistrer `banc-<nom>.txt` **et** la référence des formes (§6.1). Après,
  faire un `diff` des listes **et** regarder les bâtiments qui changent, sur les cartes : une règle
  qui améliore un bâtiment peut en abîmer un autre. Le banc n'affiche que les 40 premiers suspects ;
  `--tous` les affiche tous.
- `data.geopf.fr` peut être bloqué dans l'environnement cloud (CLAUDE.md). Les fixtures et un JSON
  de village déjà relevé suffisent alors pour travailler. Le 14 octobre 2026, il passait par le
  mandataire de l'environnement, navigateur de `village.mjs` compris : essayer avant de renoncer.

### 6.1 Le banc des formes (lot G2, spec des règles §8.2)

Chaque forme nouvelle de la vague 3b (lucarnes, Mansart, demi-croupe…) dit combien de bâtiments elle
fait changer de forme, et lesquels : une forme qui apparaît partout est un faux positif.

```bash
# Avant de modifier : la reference des formes de chaque village (dans $TOITS_DOSSIER)
npx tsx .claude/skills/toits/scripts/banc.ts hucqueliers --enregistrer formes-hucqueliers.json
# Apres : compteurs qui bougent, batiments dont la forme change, planche de leurs cartes
npx tsx .claude/skills/toits/scripts/banc.ts hucqueliers --reference formes-hucqueliers.json
```

- Sous la ligne des compteurs, le banc écrit les **formes des bâtiments** (celle du corps principal,
  le plus grand, comme l'observation) et les **formes des corps**, dans le vocabulaire du catalogue
  (§3.1 de la spec : `plat`, `appentis`, `deux-pans`, `croupes`, `pavillon`…), puis `sans corps`
  (surface mesurée, aucun corps) et `sans mesure`. Les jetons `[2p 1p plat]` des lignes de suspects
  restent ceux d'avant (plat sous 5 cm de montée) : les listes d'hier se comparent toujours par `diff`.
- La forme se déduit des corps par `model/formeToit.ts` (lot G1) quand il est dans la branche, sinon
  par sa copie dans `tests/banc/toits/formes.ts` (plat sous `HAUTEUR_PLAT_M`, appentis, croupes,
  pavillon : faîtage de moins de 1 m sur un plan presque carré). La ligne `deduction des formes` dit
  laquelle ; la copie et G1 donnent les mêmes formes sur les 646 corps des cinq villages, et
  `tests/unit/facade/bancFormes.test.ts` le revérifie dès que G1 est là.
- Avec `--reference` : `compteurs : identiques` (ou `suspects 33 -> 34`), `formes qui changent : n`
  avec le bilan (`appentis -> deux-pans 1`) et la liste, puis les bâtiments de même forme dont un
  corps change. La planche `formes-<nom>.png` (40 cartes au plus, la forme dans la légende) se lit
  avec l'outil Read ; `--planche autre.png` la renomme. Pour comparer deux versions du code sur des
  cartes avant/après, lancer chacune avec son propre `$TOITS_DOSSIER`.
- Exemple réel : la référence enregistrée avec le code du 10 octobre (18b6ca0), relue avec celui de
  `main`, donne à Hucqueliers `suspects 33 -> 34` et `bati-batiment-37248533 appentis -> deux-pans` :
  c'est le faîtage « dans le sens que lit la mesure » (42eeef2).

### 6.2 Ajouter un village au banc (décision D16)

Trois villages choisis pour leurs formes, dans `scripts/villages.json` (adresse, rayon, formes
attendues, repli approximatif pour la couverture si le géocodage ne répond pas) :

| Nom | Lieu | Adresse | Rayon | Formes attendues |
|---|---|---|---|---|
| versailles | Versailles, quartier Notre-Dame | Place du Marché Notre-Dame 78000 Versailles | 100 m | Mansart, lucarnes dans le brisis |
| eguisheim | Eguisheim (Haut-Rhin) | Place du Château Saint-Léon 68420 Eguisheim | 100 m | demi-croupes, pans très pentus |
| beuvron | Beuvron-en-Auge (Calvados) | Place Michel Vermughen 14430 Beuvron-en-Auge | 100 m | lucarnes, demi-croupes, colombages |
| riquewihr | Riquewihr (réserve d'Eguisheim) | Rue du Général de Gaulle 68340 Riquewihr | 100 m | demi-croupes |
| lyons | Lyons-la-Forêt (réserve de Beuvron) | Place Isaac Benserade 27480 Lyons-la-Forêt | 100 m | lucarnes, demi-croupes |

```bash
# 1. Couverture LiDAR HD (dallesLidarSur, la fonction de l'application) et commande de capture
npx tsx .claude/skills/toits/scripts/couverture.ts            # tous les villages de villages.json
npx tsx .claude/skills/toits/scripts/couverture.ts "<adresse>" 100
# 2. Capture (serveur Vite lance), puis banc et reference des formes
NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "Place Michel Vermughen 14430 Beuvron-en-Auge" 100 beuvron
npx tsx .claude/skills/toits/scripts/banc.ts beuvron --enregistrer formes-beuvron.json
```

- Un village sans dalle (`PAS DE DALLE`) est écarté : l'application n'y lit aucun toit. Une
  requête qui échoue est dite `indetermine`, jamais « pas de LiDAR ». Les cinq villages de la table
  étaient couverts le 14 octobre 2026.
- `village.mjs` écrit le JSON **avant** les captures 3D : si la Vue 3D d'un grand village dépasse
  le délai de capture (Versailles, 98 bâtiments), le JSON est déjà là et suffit au banc.
- La ligne d'un village nouveau entre dans le tableau du §5, avec ses formes. Versailles, Eguisheim
  et Beuvron-en-Auge y sont depuis le 14 octobre 2026 ; leurs JSON sont dans `/tmp/toits` tant que
  le conteneur les garde, sinon les recapturer par les commandes ci-dessus (le LiDAR et la BD TOPO
  évoluent : les chiffres peuvent alors bouger un peu, sans que le code y soit pour rien).
- Si la page se recharge pendant la création (`window.__plan` indéfini juste après), c'est Vite qui
  a vu un fichier de `src/` réécrit (une suite de tests en parallèle réécrit
  `src/plateforme/contrat.ts`) : relancer la capture une fois les tests finis.

## 6 bis. Relire tous les toits après un changement de règle

Chaque bâtiment lu sur le LiDAR porte `toitLidarLu` : la version de la lecture qui l'a traité
(`app/toitsLidar.ts::VERSION_LECTURE_TOITS`). La tâche de fond (`app/toitsFond.ts`) ne relit que les
bâtiments sans marque ou marqués d'une version plus ancienne.
- La version se lit dans `LECTURES_TOITS` (`app/toitsLidar.ts`) : chaque ligne porte une version,
  l'empreinte des réglages qu'elle lisait (§6 ter) et celle des faits (`faits`, absente : aucun fait ;
  §6 quinquies).
- Une règle qui change visiblement les toits déjà lus (une forme, un recalage) : **ajouter une ligne
  `{ version: n + 1, reglages: <même empreinte> }`** dans la même PR. Les projets existants se
  relisent seuls à leur prochaine ouverture, du plus proche au plus loin.
- Un seuil changé dans `regles/toits/reglages.json` : ajouter la ligne avec la nouvelle empreinte
  (le test `tests/unit/model/reglagesToits.test.ts` la donne). Oubliée, la CI est rouge, et
  l'application relit de toute façon (version suivante).
- Un fait ajouté ou changé dans `regles/toits/faits.json` : la ligne avec l'empreinte des faits
  (`npx tsx .claude/skills/regles-toits/scripts/faits.ts` l'écrit).
- Une correction qui ne concerne que des cas encore jamais lus, ou un détail de dessin 3D (qui se
  recalcule depuis les corps enregistrés) : ne pas la passer, la relecture coûte des minutes sur un
  grand voisinage.
- Le dire dans le CHANGELOG (« les toits déjà lus seront relus à l'ouverture »).
- **Un bâtiment vérifié sur place** (`verifieSurPlace`, posé par la validation d'un audit de la
  parcelle ; `model/toitVerifie.ts`) **n'est jamais recalculé** par la relecture : sa copie est lue
  et comparée à ce qui est dans le plan (`lectureDAccord` : contour, égout, forme, corps un à un, à
  `SEUIL_ACCORD_M` = 30 cm), seule la marque `toitLidarLu` s'écrit, et le bilan dit si « le nouveau
  calcul serait d'accord ». C'est la mesure d'une règle sur le 100 % du projet, sans y toucher.
  `toitsDepuisLidar` l'écarte de même (option `verifies: 'garder'`, défaut) ; « Fichier › Actualiser
  le projet » le conserve sauf case cochée (`app/actualiserProjet.ts`).

## 6 ter. Les réglages : `regles/toits/reglages.json`

Les seuils de la lecture (§1 à §4 : surface mesurée, rectangles, formes simples, corps et pignons,
recalage, complétion, végétation, à cheval) vivent dans `regles/toits/reglages.json`, chacun avec sa
valeur, son unité, le module qui le lit (`ou`), sa raison et les cas qui le justifient
(`MD/spec-regles-toits.md` §6). Les modules gardent leurs noms (`SEUIL_MARCHE_M`…) mais lisent la
valeur dans `model/reglagesToits.ts`, qui importe le fichier : il est compilé dans le fichier livré.
- **Changer un seuil** se fait dans le fichier, jamais dans le code (un test refuse `NOM = 0.8` dans
  les modules). Banc avant et après, AE 101, corpus d'audit, ligne de `LECTURES_TOITS` (§6 bis).
- **Un seuil nouveau** s'ajoute au fichier avec sa raison, puis se lit par `R.NOM` ; les constantes de
  calcul numérique (passes, epsilon) restent dans le code.
- **Les modules lisent `S.NOM`** (`SEUILS_TOITS`, la table en vigueur) **à chaque appel**, jamais une
  copie prise au chargement : le nom exporté (`export const SEUIL_MARCHE_M = R.SEUIL_MARCHE_M`) ne
  sert qu'aux tests et à la documentation. Un test refuse `const NOM = R.…` et un nom exporté lu dans
  le code. Sinon un profil ne changerait rien.
- **Les profils** (surcharges par région, §6 de la spec ; lot G15) : `model/profilsToits.ts` lit et
  vérifie `profils` (vocabulaire fermé : `departements`, `latitude`, `materiauxMurs`,
  `materiauxToiture`, `hauteur`, `surface`, `mitoyennete`, `formeContour`, `epoque` ; deux cas cités
  au moins ; seuils connus), choisit seuil par seuil le plus précis, et refuse deux profils de même
  précision sur le même seuil qui peuvent toucher le même bâtiment. `facade/profilsToits.ts` décrit le
  bâtiment (lieu du projet, BD TOPO, contour, voisins) et fait le calcul sous ses seuils
  (`avecProfilsDuBatiment`, `avecSeuilsToit` : un calcul **synchrone**, jamais à cheval sur une
  attente réseau). Branché à l'import, en tâche de fond, au recalage, à la réponse « à cheval », au
  rejeu des cas et au banc (`banc.ts <village> --profils essai.json` essaie une liste de profils,
  et chaque ligne dit les profils appliqués). Le fichier livré n'en déclare **aucun** : AE 101, banc
  et empreintes identiques, version de lecture restée 1. Le premier profil change l'empreinte des
  réglages : ajouter sa ligne à `LECTURES_TOITS` (le test la donne).
- La première extraction (lot L19) n'a changé aucune valeur : banc des quatre villages et AE 101
  identiques au bit près, version de lecture restée 1.

## 6 quater. Le corpus d'audit : rejouer une promenade

Un fichier de promenade (mode audit, `MD/spec-audit.md` §19) se range **tel quel** dans
`tests/fixtures/audit/` ; seuls `statut`, `attendu`, `historique` et `correction` se modifient ensuite
(§21). Statuts : `a_corriger`, `corrige`, `valide`, `sans_suite`.

```bash
npx tsx .claude/skills/toits/scripts/audit.ts tests/fixtures/audit/          # tout le corpus
npx tsx .claude/skills/toits/scripts/audit.ts ~/audit-2026-10-13-0912-le-vesinet.json
python3 .claude/skills/toits/scripts/rendu.py --montage audit.png bati-<cle> bati-<cle>-terrain
```

- Le script relit les versions 1 et 2 (`model/audit.ts::lireFichierPromenade`), rejoue chaque cas sans
  réseau (`facade/audit.ts::rejouerCas` : calcul entier, comme la promenade ; mêmes garde-fous que
  l'import, `facade/vraisemblance.ts`), puis compare aux `sorties` du terrain et à l'`attendu`. Il
  écrit `q/bati-<cle>.json` (rejeu) et `q/bati-<cle>-terrain.json` (sorties notées) pour `rendu.py`.
- Un fichier d'**audit de parcelle** (`plan-audit-parcelle`, lot L21), seul ou dans le dossier, n'a
  pas de cas de toit : le script mesure ses façades relevées (lot G11, `model/mesureFacade.ts`), une
  ligne par façade, comme `.claude/skills/facades/scripts/mesures.ts` (skill `facades`, §1 bis).
- Il **propose** `facade.couleur` (sans le cocher) quand une façade lue sur une photo du cas s'écarte
  de la couleur des murs retenue de plus que `ECART_TEINTE` (`model/couleurMur.ts`, §18.4).
- Ne se rejouent pas sans réseau, et restent tels que notés : la couleur Panoramax, la réponse à la
  question « à cheval », le toit BD TOPO d'un bâtiment qu'aucune forme n'explique.
- `tests/unit/facade/audit.test.ts` rejoue chaque cas `valide` en CI (corps au centimètre, couleur et
  source des murs) et liste les autres en `it.todo` (« prêt à valider » quand l'attendu est déjà
  satisfait). Un attendu qui doit changer se change dans la PR qui le fait bouger, avec une ligne
  d'historique.
- Circuit d'un cas (§22) : diagnostic sur les cartes, règle générale (jamais un cas codé), banc et
  AE 101, puis `corrige` avec l'attendu proposé et `correction: { commit, regle }`, images avant et
  après dans la PR ; `valide` après l'accord de l'utilisateur.
- **Taux de conformité** (lot G3, spec §13.5) : `npx tsx .claude/skills/toits/scripts/conformite.ts`
  juge chaque cas sur ce que vous avez vu (attendu validé, « Ce que je vois ») et donne le taux par
  forme, région et problème ; `--ecrire` réécrit `regles/conformite.json`, que l'écran Admin ›
  Conformité montre et que `tests/unit/facade/conformite.test.ts` garde à jour. Une règle qui change
  le taux le relance dans sa PR. Départ : 50 % (AE 101 conforme, la longère d'Hucqueliers non).
- Les deux premiers fichiers sont reconstitués depuis des relevés réels (AE 101, validé ; pavillon est
  de la longère d'Hucqueliers, à corriger), pas encore une promenade.

## 6 quinquies. Les faits : `regles/toits/faits.json`

Une vérité observée sur **un** bâtiment, par sa clé BD TOPO (`cleabs`) : `model/faitsToits.ts` lit et
vérifie le fichier (compilé dans le fichier livré), `facade/faitsToits.ts` l'applique. Ordre de la
spec §9.1 : le calcul, puis le fait (`contrainte` : le corps principal relu parmi les formes et le
sens admis, hauteurs de la mesure ; `remplacement` : un corps aux dimensions du fait, sans lecture ni
garde-fou, même sans LiDAR), puis les garde-fous de vraisemblance. Il s'applique à l'import, en tâche
de fond (`app/toitsLidar.ts::corpsLus`, `toitDuFait`) et au rejeu des cas (`facade/audit.ts`).
**Le skill `regles-toits` dit quand écrire un fait plutôt qu'un réglage ou une règle**, et traite un
fichier de promenade jusqu'à la PR. Mode d'essai : `?regles=local`, menu Admin (spec §9.2).

## 7. Tests et fixtures

- `tests/fixtures/toits/*.json` : relevés réels (`contour`, `toitMesure`, `corps` attendus, `grille`,
  parfois `grilleLarge` pour le recalage). `vesinet-ae101/100/103/98`, `vesinet-ae98-voisin`,
  `vesinet-28267713` (grand deux-pans du voisinage), `gordes-16860179/16860044`,
  `hucqueliers-37248520/37248524` (complétion), `hucqueliers-37248484/37248548` (ailes recouvertes). Une règle nouvelle
  née d'un cas réel ajoute sa fixture (contour recalé et grille tirés du JSON du village) et un test
  qui décrit le toit attendu en mots de couvreur.
- `tests/unit/facade/toitCorpsReprise.test.ts` (AE 101 au centimètre, reprise, recalage, Gordes),
  `toitCorps.test.ts`, `toitLidar.test.ts`, `fenetresPignons.test.ts`, `ouvertures.test.ts`,
  `tests/unit/model/toitMesure.test.ts`, `volumesToit.test.ts`, `mitoyennete.test.ts`,
  `tests/unit/three/toitCorps3d.test.ts`, `tests/unit/model/aCheval.test.ts`,
  `tests/unit/app/toitsACheval.test.ts` (question à cheval), `tests/unit/app/toitsLidar.test.ts` (recalage,
  végétation, voisinage), `tests/unit/ui/champsToitMode.test.ts` (mode, carte, descriptions).
- Documenter la règle dans `MD/spec-toit-ign.md` (§13.x) et dans `CHANGELOG.md`.

## 8. Pièges déjà rencontrés

- **Modifier `decouperParHauteur`** (centile bas → haut) change AE 101 : c'est refusé.
- **Un ajustement de croupes dans le modèle des corps** était lent et donnait de mauvais résultats.
  Les croupes passent par les formes simples.
- **Recaler les corps un par un** : refusé. On recale le bâtiment entier.
- **Dessiner les corps d'un contour de biais en rectangles** : la 3D perdait la forme du plan.
  D'où `facettesSurContour`. Un corps plat posé au niveau du prisme scintillait : on ne le dessine pas.
- **Comparer les écarts entre bandes et toit entier** favorise toujours les bandes : sur un deux-pans
  coupé au faîtage, chaque bande est un appentis presque parfait. Le critère est structurel
  (`sautAuCote`).
- **L'écart de l'ajustement est asymétrique** (il compte peu ce qui dépasse le pan) et préfère un toit
  écrasé. Pour comparer deux lectures, utiliser l'écart symétrique (`ecartAuCorps`).
- **Une tolérance relative seule** échoue sur des données synthétiques parfaites : ajouter un terme
  absolu (5 cm).
- **Retirer le corps le plus recouvert, quelle que soit sa taille**, enlevait le bon pavillon (11 m)
  et gardait ses bandes. Seules les bandes de moins de 3 m peuvent être retirées.
- **Ne jamais recouper une aile recouverte** donnait des égouts à 1,7 m (37248548). Le toit entier
  doit tenir la mesure, avec des égouts d'au moins 2 m.
- **La complétion suivait n'importe quel point libre** : une lisière de quelques centimètres l'a
  menée sur 5 m (Hucqueliers). Il faut une part de bande, une hauteur cohérente et un égout plancher.
- **Une hauteur BD TOPO fausse** (église à 4,7 m) déclenche « égout > h » dans le banc : ce n'est
  pas un défaut du toit. Le filtre de végétation (+3 m) peut en revanche écarter à tort un corps
  d'un bâtiment dont la hauteur BD TOPO est trop basse.

## 9. Chantiers ouverts

- **Pavillon est de la longère d'Hucqueliers** (37248484) : ses ailes restent recoupées (le toit
  entier ne tient pas la mesure), avec une bande de 2,4 m qui n'est couverte qu'en partie. Piste :
  ajuster une aile sur sa seule partie propre (`ajusterCorps(…, exclure)` avec les rectangles plus
  grands).
- **Chœur d'église en abside** : lu en deux pans dissymétriques (égouts 7,4 / 10,2 m).
- **Clocher, tour** : un corps rond n'a pas de forme. Il reste dans la surface ou dans un corps voisin.
