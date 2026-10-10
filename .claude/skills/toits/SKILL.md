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
proches d'abord, au plus 150 bâtiments en 20 s, quatre lectures à la fois.

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
3. **Refonte** (`refondre`) : le toit lu par les formes sur le rectangle entier l'emporte si son
   écart (symétrique, borné à 1,2 m) est au plus 1,15 fois celui des morceaux (`TOLERANCE_REFONTE`).
   La tolérance passe à 1,6 si un morceau fait moins de 3 m (`LARGEUR_BANDE_M`, `TOLERANCE_BANDE`).
   Il l'emporte toujours s'il n'y a **aucune marche** aux coupes : saut médian de la grille sous
   0,6 m (`CONTINUITE_M`, `sautAuCote`). Les paires de blocs qui partagent un côté entier sont
   ensuite refondues à la même règle.
4. **Coupe par le modèle** (`meilleureCoupe`, deux fois au plus, pas en version allégée) : on garde
   deux toits plutôt qu'un si l'écart tombe aux 2/3, qu'il valait au moins 25 cm et que les deux toits
   diffèrent d'au moins 60 cm.
5. **Toit du corps** (`ajusterCorps`) : chaque sens et chaque position de faîtage tous les 25 cm,
   murs compris (un appentis). L'ajustement est robuste vers le haut : ce qui dépasse le pan de plus
   de 40 cm est écarté (pignon, arbre, lucarne). Pente au plus 60°, égouts au moins 1,5 m.
6. **Pignons** (`detecterPignons`) : le long d'un mur de façade, la mesure dépasse le pan de 80 cm,
   sur 1,5 à 6 m, et reste à hauteur vers l'intérieur sur au moins 1,5 m. Le corps est réajusté sans
   eux. **Pas de pignon sur un appentis.**
7. **Croupes** (`avecCroupesSiMieux`) : la lecture des formes l'emporte si elle donne des croupes et
   un écart d'au plus 0,8 fois celui des pignons de bout (`GAIN_CROUPES`). Exemple : AE 100, un
   quatre-pans qui se lisait en appentis à 5,5 m.

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

## 5. Typologies vues sur le terrain

| Lieu | Bâti | Ce qui a été appris |
|---|---|---|
| Le Vésinet, allée des Limites | pavillons | AE 101 : deux pans à 7,5 m, deux pignons depuis le faîtage, annexe et aile basses. AE 100 : quatre pans. AE 103 : contour décalé, deux quatre-pans et un toit plat entre eux. AE 98 et sa mitoyenne : deux-pans que la pente coupait en morceaux (→ refonte, continuité). Abri de 2,70 m vu à 15 m sous un arbre (→ végétation). 57 maisons : 117 corps avant la continuité, 105 après. |
| Gordes, Aix, Saint-Rémy (Provence) | village perché, trapèzes, mitoyenneté | contours aux angles non droits (→ reprise, boîte orientée, toit à un pan). Château : plat construit au lieu d'un relief en vagues. Gordes : 52 bâtiments sans toit construit avant, 13 après. |
| Hucqueliers (Pas-de-Calais) | longères en brique, pavillons hauts aux bouts d'un corps bas, église, annexes basses | complétion qui suivait une lisière de biais (égout à −1,3 m) ou couvrait une annexe à 3 m d'un toit à 8,6 m (→ trois garde-fous de la complétion). Église : nef à deux pans 7/7 m. |

Chiffres de référence du banc (code de la branche `claude/toits-nord`), à comparer après une
modification :

| Village | Bâtiments | Corps | Suspects | Sans corps | Reprise |
|---|---|---|---|---|---|
| hucqueliers | 69 | 130 | 35 | 2 | 14 |
| gordes | 152 | 222 | 95 | 13 | 74 |
| aix | 51 | 88 | 28 | 4 | 5 |
| stremy | 75 | 133 | 35 | 4 | 5 |

« Suspect » ne veut pas dire faux : c'est une liste de bâtiments à regarder.

## 6. Méthode : vérifier sur un village

Les scripts de `.claude/skills/toits/scripts/` écrivent dans `$TOITS_DOSSIER` (par défaut `/tmp/toits`).

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
- Avant de modifier, enregistrer `banc-<nom>.txt`. Après, faire un `diff` des listes **et** regarder
  les bâtiments qui changent, sur les cartes : une règle qui améliore un bâtiment peut en abîmer un
  autre. Le banc n'affiche que les 40 premiers suspects ; `--tous` les affiche tous.
- `data.geopf.fr` peut être bloqué dans l'environnement cloud (CLAUDE.md). Les fixtures et un JSON
  de village déjà relevé suffisent alors pour travailler.

## 7. Tests et fixtures

- `tests/fixtures/toits/*.json` : relevés réels (`contour`, `toitMesure`, `corps` attendus, `grille`,
  parfois `grilleLarge` pour le recalage). `vesinet-ae101/100/103/98`, `vesinet-ae98-voisin`,
  `vesinet-28267713` (grand deux-pans du voisinage), `gordes-16860179/16860044`. Une règle nouvelle
  née d'un cas réel ajoute sa fixture (contour recalé et grille tirés du JSON du village) et un test
  qui décrit le toit attendu en mots de couvreur.
- `tests/unit/facade/toitCorpsReprise.test.ts` (AE 101 au centimètre, reprise, recalage, Gordes),
  `toitCorps.test.ts`, `toitLidar.test.ts`, `fenetresPignons.test.ts`, `ouvertures.test.ts`,
  `tests/unit/model/toitMesure.test.ts`, `volumesToit.test.ts`, `mitoyennete.test.ts`,
  `tests/unit/three/toitCorps3d.test.ts`, `tests/unit/app/toitsLidar.test.ts` (recalage,
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
- **La complétion suivait n'importe quel point libre** : une lisière de quelques centimètres l'a
  menée sur 5 m (Hucqueliers). Il faut une part de bande, une hauteur cohérente et un égout plancher.
- **Une hauteur BD TOPO fausse** (église à 4,7 m) déclenche « égout > h » dans le banc : ce n'est
  pas un défaut du toit. Le filtre de végétation (+3 m) peut en revanche écarter à tort un corps
  d'un bâtiment dont la hauteur BD TOPO est trop basse.

## 9. Chantiers ouverts

- **Rectangles qui se chevauchent presque entièrement** (Hucqueliers 37248484, le mitoyen du
  projet) : deux pavillons hauts aux bouts d'un corps bas. Les rectangles maximaux des ailes se
  recouvrent, les marches les débitent en bandes de 2 m couvertes à 100 % par d'autres corps, et la
  3D montre des pignons en double. Piste : retirer un corps couvert à 90 % ou plus par les autres
  (`recouvrement.py`), ou exclure des mesures d'une aile la zone d'un rectangle plus grand. Vérifier
  AE 101 à chaque essai.
- **Chœur d'église en abside** : lu en deux pans dissymétriques (égouts 7,4 / 10,2 m).
- **Clocher, tour** : un corps rond n'a pas de forme. Il reste dans la surface ou dans un corps voisin.
