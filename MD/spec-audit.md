# Audit — parcelle principale et promenade

Statut : la promenade, étape 1, est livrée (`2.2.0`). Spec rédigée le 12 octobre 2026. Les points
ouverts ont été tranchés le 13 octobre (§2). Le reste n'est pas codé : outils communs nouveaux et
audit de la parcelle principale. Questions restantes au §25.

Le document suit la structure demandée par l'utilisateur le 13 octobre : **deux processus, les mêmes
outils**. La partie A décrit les outils, la partie B l'audit de la parcelle principale, la partie C la
promenade. La partie D décrit ce que deviennent leurs fichiers dans le dépôt.

## 1. Deux processus, les mêmes outils

| | **Audit de la parcelle principale** (partie B) | **Promenade** (partie C) |
|---|---|---|
| Pour qui | **tout utilisateur**, dans son projet | **administrateur** seulement |
| Où | la parcelle du projet, ses bâtiments et ses mitoyens | un quartier, en marchant |
| Exigence (`spec-regles-toits.md` §1) | **100 %** : chaque bâtiment tel qu'il est | le modèle automatique **le plus juste possible**, pas 100 % |
| Ce qu'on fait | trois phases : **capture** (le tour de la maison, avec une liste de contrôle), **analyse** (calculs dans le téléphone et batch Claude), **validation** des propositions dans la Vue 3D | marquer en passant les bâtiments mal calculés |
| Ce qui en sort | des **propositions** qui, validées, **mettent à jour le modèle** du projet | un **fichier** pour Claude, qui corrige les **règles** |
| Ce qui change dans Plan | le projet de l'utilisateur, après son accord | rien sur le moment ; les règles ensuite, par PR |
| Fichier pour le corpus | si l'utilisateur accepte de le partager | toujours |

**Les deux exigences** (décision du 13 octobre) :
- **Le voisinage** : le modèle automatique le plus juste possible, mais pas à 100 %. La promenade sert
  à **calibrer** cet horizon : elle mesure où le modèle se trompe et nourrit les règles.
- **La parcelle principale**, et très probablement les **mitoyens** : **100 %**. L'audit de la
  parcelle capture ce qu'il faut pour y arriver. Ce qui est accepté est figé dans le projet.

**Les outils communs** (partie A) :
- la Vue 3D qui suit la position et le cap ;
- le calcul entier des toits ;
- la photo située ;
- la lecture du mur et de sa couleur sur la photo ;
- le relevé de façade ;
- « Ce que je vois » et les problèmes à cocher ;
- le cas figé, qui se rejoue sans réseau ;
- le brouillon local et le partage.

Les deux processus étendent ce que font déjà les scripts du skill `toits` (`village.mjs`, `banc.ts`)
et le test d'AE 101 « au centimètre ».

## 2. Décisions de l'utilisateur

**Communes**
- Toits et couleur des façades calculés comme dans l'application, en **calcul entier** (§4).
- **Caméra** : vue « drone » qui suit, navigation libre au toucher (§3).
- **Photo** : admise, environ 300 Ko par image (§5).
- *13 octobre* : **chaque photo est exploitée au maximum** (§5 à §7). Plusieurs photos, chacune avec
  sa position GPS et son azimut.
- *13 octobre* : les **deux processus** ont les **mêmes outils** et des déroulés différents (ce
  document).

**Audit de la parcelle principale**
- *13 octobre* : capturer **le plus d'informations possible** sur la parcelle principale (partie B).
- *13 octobre* : **ouvert à tout utilisateur**, dans son projet. L'audit met à jour le modèle après
  proposition (§14).
- *13 octobre* : **trois phases** : capture des données (photos, observations), **batch Claude** qui
  produit les propositions, puis propositions montrées **en 3D** et validées pour mettre à jour le
  projet (§11).
- *13 octobre* : **à la prise de vue, Plan sait devant quelle façade vous êtes** (§6.1, §12.2).

**Promenade**
- `?mode=audit` dans l'adresse, **administrateur seulement**.
- **Pas de sauvegarde** de projet.
- GPS direct, Vue 3D directe.
- Rayon de **40 m** autour de la position, porté ensuite à 70 m ; la carte s'étend quand on se
  déplace (pas de 10 m).
- Un tapotement sur une maison la passe en **rouge** : elle est à vérifier.
- **Un fichier par promenade** (pas un par cas), **partagé** par la fonction de partage du téléphone.
- Un cas corrigé garde ses références, pour éviter les régressions.
- **Couleur des façades** pendant la promenade : le matériau **BD TOPO** seulement, pas les photos de
  rue Panoramax, trop lourdes et rarement concluantes. La couleur lue sur **vos** photos (§6) est
  autre chose.
- **Catégories** : toit, façade, contour, hauteur, autre ; pour le toit, une liste de problèmes
  précis (§8.2).

---

# Partie A — Les outils communs

## 3. La Vue 3D, la position et le cap

- Votre position est montrée comme dans « Ma position (3D) » (`three/positionGps3d.ts`), lue par
  `shell/geolocalisation.ts::suivrePositionGps`.
- **Essai sans sortir** : un départ sur une adresse au lieu du GPS (`&depart=<adresse>`). La position
  se déplace alors au doigt sur la Vue 3D. C'est utile pour essayer chez soi et pour les tests
  automatiques.
- Caméra : **vue « drone »** (`app/audit/camera.ts`). Son centre de rotation et de zoom est votre
  position : à chaque déplacement, il y revient, et la caméra garde le zoom et la rotation que vous
  lui avez donnés. Le déplacement latéral au doigt est coupé (il déplacerait ce centre).
- **« Me suivre »** recadre derrière vous, dans l'axe de votre **cap**, inclinée à 40°, assez haut
  pour voir **70 m devant** en haut de l'écran, puis suit ce cap.
  - Le cap vient de la **boussole** du téléphone (`shell/boussole.ts`) : `webkitCompassHeading` sur
    Safari, autorisation demandée par ce bouton ; `deviceorientationabsolute` sur Chrome.
  - Il est lissé, puis appliqué par pas de 3°.
  - Sans boussole, il vient du sens de la marche, sur des pas de 4 m au moins.
  - Tourner la vue d'un doigt lâche le cap ; le pincement (zoom) ne le lâche pas.
- Une barre dans la Vue 3D (`zones/vue3d/Vue3d.tsx`), en bas de l'écran au doigt, au-dessus de la scène
  sur bureau. Elle montre l'état (lecture, bâtiments chargés, précision du GPS) et les commandes du
  processus en cours.

## 4. Le chargement et le calcul

- **Ce qui est chargé** dépend du processus :
  - la parcelle du projet, une fois (partie B) ;
  - un disque qui suit la marche (promenade, §18.2).
- **Pour chaque bâtiment chargé** :
  - le toit LiDAR, par la chaîne de l'import (`app/toits/toitsLidar.ts::toitsDepuisLidar`), en **calcul
    entier**, celui du projet et des mitoyens (coupes, grille gardée), quatre lectures à la fois ;
  - la couleur des murs, par le matériau BD TOPO ;
  - la couleur du toit, sur l'orthophoto.
- La lecture des toits en tâche de fond (`app/toits/toitsFond.ts`) n'est pas utilisée : chaque processus
  calcule ce dont il a besoin.
- Le régulateur (`app/regulateur.ts`) dose les lectures pendant un geste.

## 5. La photo située

- Prise avec le téléphone, réduite à **1 280 px** au plus en JPEG, **300 Ko** au plus
  (`app/audit/photo.ts`).
- **Plusieurs photos** par cas ou par façade, jusqu'à six pour un cas de promenade.
- Chacune garde sa **prise de vue** (`PhotoCas.prise`, déjà livrée) :
  - la position GPS, dans le repère du plan et en degrés, et sa précision ;
  - l'**azimut** de la boussole, lu au retour de l'appareil photo, et sa source (`sourceAzimut` :
    boussole, sinon sens de la marche).
  La fiche l'écrit sous la photo : « Prise à ± 5 m, vers 245° (OSO), boussole ».
- **À ajouter** :
  - **la focale**, lue dans l'EXIF *avant* la réduction, qui l'efface (`facade/vision/exif.ts::focale35mm`,
    `champDepuisFocale35`). À défaut, le champ par défaut du relevé : 67° sur le grand côté
    (`facade/vision/cadrage.ts::CHAMP_GRAND_COTE_DEFAUT`) ;
  - **l'inclinaison** du téléphone au retour de l'appareil photo (`beta` de l'orientation) : la
    projection d'un mur dans une photo prise vers le haut n'est pas celle d'une photo d'aplomb.
- **Limite à garder en tête** :
  - l'azimut est lu au retour de l'appareil photo, pas au déclenchement ;
  - la boussole d'un téléphone se trompe aussi de 5 à 15° près d'un mur ou d'une voiture.
  Tout ce qui suit tient compte de cette marge.

## 6. Le mur sur la photo, et la couleur de la façade

### 6.1 Quel mur est sur la photo

**Avant la photo, en direct.** Plan sait devant quelle façade vous êtes, par votre position et votre
cap :
1. **Les façades devant lesquelles vous êtes** : celles dont la normale extérieure pointe vers vous.
   Votre position est du côté extérieur du mur, à 3 à 40 m, sans autre bâtiment entre vous et lui
   (`vueCachee`).
2. **Celle que vous regardez** : parmi elles, celle dont le milieu est le plus près de l'axe de la
   boussole (`facade/geometrie.ts::facadeFaceAuCap`, à 50° près). À égalité, la plus proche.
3. Elle est **surlignée** dans la Vue 3D et nommée sur l'écran de prise : « Vous êtes devant la façade
   sud, 9,2 m ». La photo prise s'y **range d'elle-même**. « Ce n'est pas cette façade » en propose
   une autre.
4. Sans boussole, la façade la plus proche devant laquelle vous êtes. Sans position (photo importée
   sans EXIF), vous la choisissez dans la liste.

**Après la photo**, le calage fin (`spec-facades-calage-detection.md` §6) confirme la façade par les
points de fuite. S'il trouve un autre mur, il le dit et propose de ranger la photo ailleurs.

**Dans la promenade**, où l'on photographie après avoir marqué un bâtiment :
- Les murs qui regardent la prise de vue sont ceux que la lecture Panoramax sait déjà trouver
  (`render/couleurMurPhoto.ts::mursVisibles`, `vueCachee`). Ils doivent se trouver à 3 à 40 m, vus à
  moins de 70° de face, sans autre bâtiment devant.
- Le mur retenu est celui dont le milieu est le plus près de l'axe de la photo. Il est dessiné sur la
  photo, avec son orientation (« Façade sud-est, 9,2 m »). « Ce n'est pas ce mur » passe au suivant.
- Sans azimut (ni boussole ni marche), rien n'est proposé : la photo reste une photo.

### 6.2 La couleur de la façade

1. **Automatique.** Les points du mur sont posés sur la photo par la géométrie de la prise de vue
   (`pointsDuMur`, `pointDansImage` en photo plate, avec la focale et l'inclinaison).
   - Pour absorber l'erreur de la boussole, on ne garde que la **moitié centrale** du mur.
   - La règle des clôtures vaut aussi : pas de ligne de vue sous 2,5 m aux limites de parcelle
     (`hauteurAuxLimites`).
   - La teinte est décidée par `model/couleurMur.ts::couleurMurDepuisPixels`, comme pour Panoramax :
     une teinte cohérente, ou rien.
2. **Un toucher, si besoin.** Quand la lecture ne conclut pas, ou que l'azimut vient du sens de la
   marche, l'écran demande « Touchez la façade sur la photo ». On lit la teinte autour du point
   touché. Les fenêtres et les ombres sont écartées par le même filtre d'écart à la médiane que le
   relevé (`facade/analyse.ts::teinteMediane`).
3. **Ce qui est gardé** : la couleur, le mur (`cote`), la photo qui l'a donnée, le nombre de pixels lus
   et la source (`automatique` ou `toucher`).

Chaque couleur lue sur une photo de terrain est une **vérité terrain** pour la lecture Panoramax et
pour le repli sur le matériau BD TOPO (`spec-toit-ign.md` §6.5). On mesure enfin leur taux de
réussite (§22).

## 7. Le relevé d'une façade

Le relevé existant (`spec-releve-facade.md`), sur les photos situées. Les temps « Choisir le mur » et
« Se placer » sont guidés par la position (§6.1). **Le calage des photos et la détection des
ouvertures évoluent** : l'audit devient le moteur des façades. Le détail est dans
`spec-facades-calage-detection.md` : coins trouvés par les points de fuite, cap corrigé, fusion de
plusieurs vues, teinte locale, profils de contours, structure en niveaux et travées, confiance et
corrections tracées.

- **Le mur en face** : la boussole propose le mur que l'on regarde (`facade/geometrie.ts::facadeFaceAuCap`).
- **Se placer** : la distance au mur vient du GPS (à sa précision près), puis du cadrage. Le plan de
  prise dit « une photo suffit » ou « 3 photos, de gauche à droite » (`facade/vision/cadrage.ts::planDePrise`).
- **Coins proposés** d'après la prise de vue (`facade/analyse.ts::coinsProposes`, la distance venant du
  GPS). Ils s'ajustent au doigt, avec la loupe.
- **Plusieurs photos du même mur** :
  - de gauche à droite, assemblées en mosaïque quand le recul manque
    (`facade/vision/mosaique.ts::analyserMosaique`, `spec-releve-facade.md` §6.1) ;
  - de face et de biais, pour retrouver une ouverture cachée par un arbre ou une voiture sur l'une
    d'elles ;
  - un **gros plan du parement**, à un ou deux mètres, pour la texture du matériau.

**Ce qui est calculé**, dans le navigateur, sans serveur :

| Donnée | Comment | Code |
|---|---|---|
| hauteur à l'égout, mesurée | les quatre coins et la focale | `facade/analyse.ts::mesurerHauteur` |
| élévation redressée, texture du mur | homographie, mosaïque si plusieurs photos | `analyserReleve`, `analyserMosaique` |
| ouvertures réelles (type, x, y, l, h) | détection, puis correction au doigt | `facade/detection/detection.ts::detecterOuvertures` |
| couleur du mur | médiane de ce qui n'est pas une ouverture | `teinteMediane`, `couleurMurDepuisPixels` |
| matériau du parement | choisi par vous (pierre, meulière, brique, enduit, béton, bois) ; plus tard proposé par Claude analyste | `three/textureMur.ts` |
| **texture du matériau** | le gros plan, découpé au centre en tuile sans couture ; l'échelle vient du matériau (`TAILLE_M` : une brique, une pierre) | nouveau |
| toit vu de la façade | silhouette au-dessus de l'égout, triangle du pignon | `facade/toits/toit.ts` |
| mur en L | les deux points du décrochement | `facade/profil.ts` |

Le résultat est un `ReleveFacade` complet : la structure **déjà dans le projet**, que la 3D et le plan
affichent sans code nouveau. La texture de matériau tirée du gros plan est la seule partie nouvelle.
Elle remplace, pour ce bâtiment, la texture dessinée de `textureMur.ts`, teinte comprise.

Les élévations et les photos restent sur l'appareil (`io/photosLocales.ts`), comme celles d'un relevé
(`spec-releve-facade.md` §10.1).

## 8. Ce que l'on note

### 8.1 « Ce que je vois »

Le positif, écrit avec le vocabulaire de `spec-regles-toits.md` §2 et §3 (sa §7.2) :
- forme ;
- sens du faîtage par rapport à la rue ;
- bouts ;
- lucarnes : nombre et pan ;
- cheminées : nombre, position (faîtage, pan, pignon, adossée en façade), matériau, couronnement
  (`spec-regles-toits.md` §2.6) ;
- toiture-terrasse : accessible, revêtement, acrotère, garde-corps, édicules (`spec-regles-toits.md`
  §2.7) ;
- matériau des murs et de la couverture.

C'est le cœur de la liste de contrôle de l'audit de parcelle (§12). Dans la promenade, c'est une
section facultative de la fiche, qui devient l'attendu testable du cas.

### 8.2 Les problèmes à cocher

Le négatif, surtout pour la promenade. Chaque problème a un code stable, écrit dans le fichier :
c'est lui que le script de rejeu et les tests lisent. La dernière colonne dit où le chercher dans la
chaîne (skill `toits`).

**Toit**

| Code | Ce que vous voyez | Où chercher |
|---|---|---|
| `toit.sens-faitage` | le faîtage est dans le mauvais sens (pans tournés d'un quart de tour) | sens du corps, `ajusterCorps` |
| `toit.forme` | mauvaise forme : deux pans au lieu de quatre (croupes), appentis au lieu de deux pans, plat au lieu de pentu, ou l'inverse | formes, `avecCroupesSiMieux`, `unPanPlutotQuePlat` |
| `toit.position-faitage` | faîtage décentré, un pan bien plus large que l'autre | position du faîtage, `ajusterCorps` |
| `toit.hauteur` | égout ou faîtage trop haut ou trop bas : toit écrasé ou trop pointu | égouts, `egoutDansRect`, pente maxi |
| `toit.pignon-manquant` | un pignon ou une lucarne-pignon visible n'est pas dessiné | `detecterPignons` |
| `toit.pignon-en-trop` | un pignon dessiné n'existe pas | `detecterPignons` |
| `toit.morceaux` | un seul toit découpé en plusieurs morceaux, bandes ou marches qui n'existent pas | marches, refonte, bandes recouvertes |
| `toit.fusion` | deux toits distincts fondus en un : une aile ou une annexe plus basse avalée | coupe par le modèle, `meilleureCoupe` |
| `toit.trou` | une partie du bâtiment sans toit (un coin vide), ou un toit qui déborde du bâtiment | complétion, reprise d'un contour de biais |
| `toit.vegetation` | un arbre pris pour le toit : bosse, toit trop haut sous un arbre | végétation, `corpsVraisemblables` |
| `toit.cheval` | deux maisons mitoyennes avec un seul toit, ou une maison coupée en deux | bâtiment à cheval, `toitACheval` |
| `toit.absent` | aucun toit construit (boîte par défaut) alors que le toit est simple | lecture LiDAR, `toitsDepuisLidar` |
| `toit.cheminee` | cheminée absente, en trop, mal placée, ou souche adossée en façade non dessinée (étape 5) | souches, `spec-regles-toits.md` §2.6 |
| `toit.terrasse` | toit-terrasse mal lu : acrotère, édicule ou garde-corps manquant, terrasse accessible vue comme un toit (étape 5) | `spec-regles-toits.md` §2.7 |
| `toit.couverture` | mauvais matériau (tuile, ardoise, zinc, terrasse) ou mauvaise couleur du toit | `materiauCouverture`, couleur sur l'orthophoto |
| `toit.autre` | autre chose : à décrire dans la note | — |

**Façade, contour, hauteur**

| Code | Ce que vous voyez |
|---|---|
| `facade.couleur` | couleur des murs fausse |
| `facade.materiau` | mauvais matériau ou mauvaise texture (brique, pierre, enduit…) |
| `facade.fenetres` | fenêtres absentes, en trop ou mal placées |
| `contour.decale` | le bâtiment est décalé par rapport à la réalité |
| `contour.forme` | la forme du bâtiment est fausse (aile manquante, contour simplifié) |
| `contour.existence` | bâtiment absent, ou dessiné alors qu'il est démoli |
| `hauteur.murs` | les murs sont trop hauts ou trop bas |
| `autre` | à décrire dans la note |

Dans l'audit de parcelle, les problèmes ne se cochent pas : ils se **déduisent** de l'écart entre ce
que vous avez vu (§8.1) et ce que Plan avait calculé. Ce sont eux qui alimentent le corpus.

## 9. Le cas figé

Un bâtiment noté (marqué en promenade, audité sur la parcelle) est **figé** au moment où on le note.
La grille LiDAR et l'adresse le complètent dès qu'elles arrivent ; le partage les attend.

```jsonc
{
  "id": "c1",
  "statut": "a_corriger",
  "identite": { "cleBdtopo": "BATIMENT0000…", "idu": "78650000AE0101", "adresse": "2 allée des Limites" },
  "entrees": {
    "pts": [/* contour recalé, repère de l'origine */],
    "bdtopo": { /* attributs tels que lus */ },
    "grille": { /* grille MNH relue, comme village.mjs, au centimetre */ },
    "voisins": [{ "cle": "…", "pts": [/* contours à moins de 5 m */] }]
  },
  "sorties": { "mode": "entier", "elevation": 6.5, "toit": { /* … */ }, "corps": [/* … */], "toitMesure": { /* … */ }, "couleurMurs": "#…", "sourceMurs": "materiau" },
  "attendu": null,
  "historique": []
}
```

- **`entrees`** : tout ce qu'il faut pour rejouer le calcul **sans réseau**, et à l'identique même si
  l'IGN publie plus tard un autre millésime. Les champs suivent l'entrée `batiments[]` du fichier de
  village (`village.mjs`), que `banc.ts` sait déjà rejouer.
- **`sorties`** : ce que le code a produit ce jour-là, avec sa version et celle des règles.
- **`attendu`** : vide sur le terrain, rempli à la validation (§21).
- **`historique`** : chaque changement de statut ou d'attendu, avec sa date, le commit et une phrase.

Chaque processus y ajoute ce qu'il a vu :
- la promenade, son `constat` (§19) ;
- l'audit de parcelle, ses façades et ses propositions (§15).

## 10. Le brouillon local, et le partage

- **Brouillon local** (étape 2) : ce qui est en cours est écrit au fur et à mesure dans le téléphone
  (IndexedDB, `io/photosLocales.ts` pour les photos). Exemples : les marques, les cas figés, les
  photos, les relevés non encore acceptés. Sans ce brouillon, un écran verrouillé ou un onglet tué
  par le système ferait perdre une heure de visite. À la réouverture : « Reprendre l'audit du … » ou
  « Le jeter ».
- **Partage** : `shell/partage.ts`, la feuille de partage du système (`navigator.share({ files })`,
  après `navigator.canShare`) : messagerie, Drive, mail. Sans partage de fichiers (ordinateur, ancien
  navigateur), le fichier est téléchargé. Une fois le fichier partagé, le brouillon est effacé
  (après confirmation).
- **Vie privée** : pas de trace GPS complète dans un fichier, seulement la position de chaque cas et
  l'emprise parcourue. Rien ne part sans un geste de la personne.

---

# Partie B — Audit de la parcelle principale (tout utilisateur)

## 11. But, accès et déroulé

En une visite, capturer **le plus d'informations possible** sur la parcelle du projet, en général celle
du client. Le but est le **100 %** sur ses bâtiments, et sur les mitoyens qui se voient :
- toutes les façades de tous ses bâtiments ;
- ce que l'on voit des toits, cheminées et terrasses comprises ;
- les couleurs, les matériaux et les textures ;
- les ouvertures et les hauteurs mesurées ;
- la clôture côté rue et le portail.

**Accès**
- **Dans un projet**, par une commande du registre, `audit.parcelle` (« Auditer la parcelle… »),
  groupe `audit`.
  - Elle demande le droit d'écrire le projet (`projects.write`) : en lecture seule, elle est grisée
    avec sa raison.
  - Elle s'inscrit dans `app/exposition.ts` pour les trois classes d'écran : menu Projet en large,
    feuille du projet en compact et en moyen.
- Elle porte sur la **parcelle du projet** (`model/fonctions.ts::parcelleDuProjet`) : ses bâtiments et
  ses mitoyens, déjà chargés par l'import, en calcul entier (§4). Rien d'autre n'est lu. Sans parcelle
  cadastrale (plan dessiné à la main), la commande est grisée : « Importez d'abord la parcelle depuis
  son adresse. »
- L'administrateur peut ouvrir le même audit sur une parcelle hors projet (menu Admin,
  `?mode=audit&cible=parcelle`) : il en sort un fichier (§15).

**Trois phases**

| Phase | Où | Ce qui se passe | Ce qui change dans le projet |
|---|---|---|---|
| **1. Capture** (§12) | sur place, téléphone en main | photos situées, rangées d'elles-mêmes par façade ; observations « Ce que je vois » ; liste de contrôle | rien |
| **2. Analyse** (§13) | dans le téléphone, puis sur le serveur | calculs locaux (calage, détection, couleur, hauteur), puis un **batch Claude** qui relit photos et modèle et rédige les **propositions** | rien |
| **3. Validation** (§14) | sur place ou plus tard, sur n'importe quel appareil | les propositions **en 3D**, avant et après ; vous cochez, vous validez | le modèle est mis à jour, en un seul pas d'annulation |

On peut enchaîner les trois sur place, ou capturer aujourd'hui et valider demain au bureau. L'en-cours
(photos, observations, résultats d'analyse) est gardé dans le brouillon (§10) tant qu'il n'est pas
validé.

## 12. Phase 1 — Capture

### 12.1 La liste de contrôle

Un parcours plein écran (Z8) liste, pour chaque bâtiment de la parcelle :

| Ligne | Statuts | D'où |
|---|---|---|
| chaque **façade** : orientation, longueur | à photographier · photographiée (n photos) · inaccessible | `facade/geometrie.ts::facadesDuContour` |
| le **toit** : forme, sens du faîtage, bouts, lucarnes | à voir · vu | « Ce que je vois », §8.1 |
| les **cheminées** : nombre, position (faîtage, pan, pignon, adossée), matériau, couronnement | à voir · vues · aucune | `spec-regles-toits.md` §2.6 |
| la **toiture-terrasse**, s'il y en a une : accessible, revêtement, acrotère, garde-corps, édicules | à voir · vue | `spec-regles-toits.md` §2.7 |
| le **matériau** des murs et de la couverture | à voir · vu | `spec-regles-toits.md` §2, `textureMur.ts` |

Et pour la parcelle :

| Ligne | Ce qui est noté |
|---|---|
| **clôture côté rue** | type (mur, grillage, palissade, haie), hauteur, soubassement, une photo |
| **portail** | nature (portail ou portillon), position le long de la limite, largeur, une photo |

- Une façade sur une limite mitoyenne (`model/mitoyennete.ts`) est déjà marquée « mitoyenne, rien à
  photographier ». Une façade côté voisin ou cachée se marque « inaccessible » en une touche.
- **Les maisons voisines ne font plus partie de l'audit** (demande de l'utilisateur du 15 octobre
  2026). La liste, le compteur, « Ce qui manque », la reconnaissance, la touche dans la Vue 3D et
  l'analyse de Claude ne regardent que les bâtiments de la parcelle du projet. Les maisons voisines
  restent dans la scène, comme obstacles à la vue de la reconnaissance, mais ne se photographient
  plus : l'ancienne section « Bâtiments voisins, facultatif » est retirée. Une photo rangée chez un
  voisin par un ancien brouillon ou fichier n'entre plus ni dans le compte ni dans l'analyse. (Essai
  sur le terrain d'AE 101, 14 octobre : 7 bâtiments et 33 façades, dont 19 chez les voisins, et la
  reconnaissance proposait la maison d'à côté.) Le champ `mitoyen` du fichier de l'audit reste, à faux.
- Un bout de mur de moins de 1,5 m (un décroché) n'est pas une façade : il est sur la photo du mur
  qu'il décroche. Il reste dans la liste s'il a déjà des photos (`liste.ts`, `MUR_COURT_M`).
- Un compteur dit ce qui reste (« 7 façades sur 9, toit vu, clôture à faire »), pour la parcelle du
  projet seulement.
- Toucher une façade dans la Vue 3D ouvre sa ligne.

### 12.2 Photographier : Plan sait devant quelle façade vous êtes

> **Verrouiller un bâtiment** (15 octobre 2026). Quand la parcelle porte une annexe à côté de la maison,
> la reconnaissance passait de l'une à l'autre. L'écran de prise propose alors un bouton par bâtiment
> (« Verrouiller : Maison, Annexe ») : c'est un geste volontaire, jamais déduit. Verrouillé, seul ce
> bâtiment est reconnu et touché dans la Vue 3D, qui ne montre que lui et le sol ; les autres bâtiments
> restent des obstacles à la vue. Choisir une façade d'un autre bâtiment dans la liste déplace le verrou.
> Le verrou ne vaut que sur l'écran de prise (les propositions et l'analyse voient tous les bâtiments de
> la parcelle) et tombe à la fermeture de l'audit.

1. Vous marchez autour de la maison, l'écran de prise ouvert. **La façade que vous avez devant vous
   est reconnue en direct** (§6.1), surlignée **en rouge** dans la Vue 3D et nommée : « Vous êtes devant
   la façade sud, 9,2 m — 0 photo ».
   - **Pendant tout l'audit, la Vue 3D est épurée** : elle ne montre que les bâtiments de la parcelle
     (ou le seul bâtiment verrouillé, pendant la prise) et le sol, avec les voiles rouge et
     vert des façades et votre position. Arbres, bâtiments voisins, clôtures (celle de la parcelle et
     celles du voisinage), terrasse et objets d'échelle sont masqués le temps de l'audit et reviennent
     à sa fermeture. C'est un affichage : ni « projet modifié », ni Ctrl+Z, et le projet n'est pas
     touché (`three/scene.ts::epurerVue3d`). Demande de l'utilisateur du 15 octobre 2026.
   - La Vue 3D est **à hauteur d'homme** (1,7 m) quand une position et une façade visée sont connues :
     c'est la prise elle-même, et elle montre le mur tel que l'appareil photo le voit. Prise jusqu'à
     6 m derrière vous, jamais au travers d'un mur d'un bâtiment audité ; le regard monte vers le
     milieu de la façade visée (une façade choisie se regarde, quel que soit le cap). Elle **cadre la
     partie que l'écran de prise laisse voir** (champ de 50° au-dessus de lui, élargi jusqu'à 75° pour
     que la façade visée y tienne en entier). Elle **suit votre position et votre cap** (boussole,
     sinon sens de la marche) et glisse d'une pose à l'autre : ce n'est pas une image fixe. Un doigt
     qui la fait tourner la garde 6 s, puis le suivi reprend (`app/audit/parcelle/vuePrise.ts`).
   - **Une façade choisie fixe la vue** (touchée dans la 3D ou prise dans la liste ; demande de
     l'utilisateur du 16 octobre 2026). La position ne suit plus le GPS : la caméra se tient à distance
     fixe du bâtiment de cette façade, qui tient en entier dans l'image (regard incliné de 15° sur son
     centre), face à la façade choisie à l'arrivée. Ni zoom, ni déplacement, ni inclinaison : seule la
     **rotation sur l'axe vertical du bâtiment** bouge, pour voir défiler ses façades, soit **avec vos
     pas autour de lui** (l'angle où vous êtes, vu du centre, tourne la vue d'autant ; sous 2°, le
     tremblement du GPS ne la bouge pas), soit **au doigt** quand il n'y a pas de GPS ou qu'il se trompe
     (imprécision au-delà de 12 m, position sur le centre). Un doigt qui glisse prend la main ; la pause
     finie, la rotation repart de son regard. Choisir une autre façade repart face à elle ; « Suivre ma
     position » et « Ce n'est pas cette façade » rendent la vue (`vuePrise.ts::poseOrbite`,
     `suiviPieton.orbite`, `angleAutour`). Pas de trait renforcé en orbite : le bâtiment entier se
     reconnaît seul.
   - **De près, le trait se renforce** (demande de l'utilisateur du 15 octobre 2026) : à moins de 4 m
     de la façade visée, ou quand elle déborde du champ le plus large, les arêtes du bâtiment visé
     (angles, bas et haut des murs, contours des ouvertures, rives et faîtage) se dessinent en traits
     épais et sombres (jeton `--trait-3d`), par-dessus le voile sans le cacher ; le trait s'atténue en
     reculant et disparaît à 9 m (`vuePrise.ts::forceDuTrait`, `three/traitDePres.ts`). Les distances
     se comptent depuis vous, pas depuis la caméra. Lignes épaisses de three.js (chargées à la
     demande) ; hors ligne, un trait d'un pixel.
   - **Tant que rien n'est visé depuis votre position** (pas encore de position, position refusée,
     aucune façade devant vous), la Vue 3D est une **vue d'ensemble en grand angle** (champ de 60°,
     regard incliné de 35°) : tout le bâtiment audité, cadré dans ce que l'écran de prise laisse voir,
     pour **choisir une façade en la touchant**. La vue a hauteur d'homme, trop près, n'y montrait
     qu'un mur (second essai d'AE 101, 15 octobre). Elle regarde la façade choisie dans la liste,
     sinon le bâtiment depuis votre position ; ensuite, le doigt la tourne librement : la boussole ne
     la déplace pas. Toucher une façade la fixe en orbite (point précédent). Une façade reconnue qui se perd garde la vue à hauteur
     d'homme 2,5 s avant de passer à la vue d'ensemble, pour ne pas sauter à chaque pas.
   - Sur un écran en largeur (bureau, tablette, téléphone couché), l'écran de prise et celui des
     propositions sont un **panneau à droite** ; la Vue 3D cadre le bâtiment dans la partie gauche.
   - **La position** est lissée selon la précision annoncée (un filtre de Kalman, à 3 m/s de marche)
     et, quand elle tombe dans le jardin d'un voisin à portée de l'erreur, ramenée juste à l'intérieur
     de la parcelle du projet : l'audit se fait depuis la parcelle ou depuis la rue
     (`app/audit/parcelle/positionFiltree.ts`).
   - **La boussole**, téléphone debout pour photographier, donne le cap de l'appareil photo arrière,
     calculé sur les trois angles de l'orientation (Chrome Android) ; à plat, celui du haut du
     téléphone (`shell/boussole.ts::capAppareilPhoto`).
   - Si l'automatisme ne trouve pas la bonne façade, **toucher une façade dans la Vue 3D la choisit**
     (« Photo pour la façade … (choisie) ») ; « Suivre ma position » revient à la façade reconnue.
   - Les façades **déjà photographiées passent au vert**, visée comprise (rouge sur vert faisait du
     brun) : le rouge ne dit que « à photographier ». Elles restent reconnues et se touchent encore :
     on peut toujours en reprendre une (huit photos au plus par façade).
   - Le voile monte **jusque sous le toit**, étage compris, et suit le haut du mur par morceaux (une
     aile basse, puis l'étage) : `liste.ts::profilMurSousToit`, d'après les murs des corps.
   - Décision de l'utilisateur du 14 octobre 2026.
2. Le plan de prise (§7) dit combien de photos il faut : « une photo suffit » ou « 3 photos, de gauche
   à droite », plus un gros plan du parement.
3. Chaque photo est **située** (§5) et **rangée d'elle-même** sur la façade reconnue. La ligne de la
   liste passe à « photographiée (n photos) ».
4. Les vues de biais d'une même façade sont les bienvenues : la fusion s'en sert pour voir derrière une
   voiture ou un arbre (`spec-facades-calage-detection.md` §8).

Le toit, les cheminées, la terrasse et la clôture se notent dans leur ligne (« Ce que je vois »), avec
une photo si l'on veut. Une photo du toit prise depuis la rue est rangée sur le bâtiment, pas sur une
façade.

### 12.3 Fin de la capture

- « Lancer l'analyse » est proposé dès qu'une façade est photographiée. Il n'est pas nécessaire d'avoir
  tout fait : une seconde capture complètera l'audit plus tard.
- Ce qui manque est dit (« façade nord : pas de photo ; toit-terrasse du garage : non vu »), sans
  bloquer.

## 13. Phase 2 — Analyse

### 13.1 Dans le téléphone : les mesures

Tout ce qui se mesure se calcule **dans le navigateur**, sans serveur, de façon déterministe :
- le calage de chaque photo, la hauteur à l'égout, l'élévation redressée et la fusion des vues ;
- la détection des ouvertures, leur structure en niveaux et travées, leur confiance
  (`spec-facades-calage-detection.md`) ;
- la couleur de chaque façade (§6.2) et la texture du matériau (§7).

Ces calculs commencent dès la prise, pendant que vous photographiez la façade suivante.

**Depuis le lot F3** (`spec-facade-calage-audit.md` §4 ter, §6, §9 bis) : une façade se calcule par **l'orchestrateur de
l'enchaînement** (`facade/releve/enchainement.ts`, mode `audit`), le même que la calibration rejoue, dès sa première photo ; le relevé
sort de l'orchestrateur avec l'état de chaque étape (É0 à É9). L'audit montre **la même barre de progression** que la calibration,
sur la façade dépliée de la liste et en tête de l'écran de prise, en **mode discret** : une étape cachée qui a réussi (redressement,
assemblage, silhouette lue, texture) ne se montre pas ; une étape qui échoue ou doute apparaît aussitôt avec son geste de repli
(quatre repères sur une photo, le même geste que la calibration) ; seuls les points de validation et ce qui doute s'ouvrent.
« Rejouer la façade » rejoue l'orchestrateur, sans toucher aux photos ni aux corrections. Ce qui disait l'état du redressement et de
la fusion à part (le statut de chaque photo, l'avertissement de fusion à la prise) est remplacé par la barre.

### 13.2 Le batch Claude : les propositions

Ce qui demande de **regarder** (reconnaître, comparer, nommer) est confié à Claude analyste,
`spec-regles-toits.md` §14, par l'**API Batch** :

| Ce que Claude reçoit | Ce qu'il en tire |
|---|---|
| les photos de chaque façade, réduites, avec leur prise de vue | type et détails des ouvertures (volets, coffre, balcon, forme), ouvertures manquées ou en trop par la détection, matériau du parement |
| l'élévation de chaque façade mesurée (le **run d'une façade**, une requête de plus par façade, usage `facade`, lot F3) | les ouvertures en part du mur, leurs détails et leurs carreaux, le parement, la forme du haut : accordées par le moteur de règles avec la détection |
| le **rendu du modèle actuel** depuis la même prise de vue | les écarts entre le modèle et la photo, façade par façade |
| les photos du toit, l'orthophoto, la carte des hauteurs LiDAR et ses indices | forme, sens du faîtage, bouts, lucarnes, cheminées, toiture-terrasse |
| vos observations « Ce que je vois » | il ne les contredit pas ; il les complète et signale un désaccord |
| les mesures du §13.1 | il ne les recalcule pas ; il s'en sert comme indices |
| les photos dont le **calage** ou la **détection** n'est pas sûr (coins non trouvés, façade mal vue, ouvertures douteuses) | des coins et des ouvertures **proposés**, que Plan recale sur l'image avant de s'en servir (`spec-facades-calage-detection.md` §12 bis) |

- **Réponse fermée** : schéma JSON, vocabulaire de `spec-regles-toits.md` §2 et §3, `indetermine`
  partout. Le schéma part à la suite du prompt et le serveur y ramène la réponse (voir
  `spec-regles-toits.md` §14.2, point 1). **Trois passes et un vote**, contrôle croisé avec les indices LiDAR, escalade
  d'un cas douteux vers un modèle plus fin : les garde-fous de `spec-regles-toits.md` §14.2.
- **Ce qui revient** : une liste de propositions, chacune avec son objet (façade, ouverture, toit,
  cheminée…), l'avant, l'après, les **indices** vus et sur quelle image, et une confiance.
- **Délai** : le batch rend en général en quelques minutes, au plus en 24 heures. Une notification
  dit quand les propositions sont prêtes. Sur place, les mesures du §13.1 sont déjà visibles en
  attendant.
- **Coût**, estimé avec Claude Haiku 5.5 au tarif Batch (`spec-regles-toits.md` §14.4) :
  - une trentaine de photos (environ 1 600 tokens chacune en 1 280 px) et le prompt en cache font
    environ 60 000 tokens d'entrée par passe, soit environ 0,003 $ ; la sortie, environ 0,001 $ ;
  - avec trois passes, **de l'ordre de 1 à 2 centimes par parcelle** ;
  - quelques dizaines de centimes si une partie passe à l'escalade.
  - **Mesuré sur le rejeu d'AE 101 (16 octobre 2026, Haiku 5.5, batch)** : 0,011 $ pour deux bâtiments
    (0,003 $ l'abri de jardin, 0,008 $ la maison de seize photos). La sortie pèse 60 % du coût, l'entrée
    33 %, le cache 7 % (partie fixe : 8 917 tokens, écrite une fois et lue cinq fois, même en batch).
    La réponse de la maison varie de 5 000 à plus de 8 000 tokens selon la passe : `max_tokens` est à
    16 000. Chaque mur porte une étiquette unique pour le vote (orientation, et « (côté N) » quand le
    bâtiment en a plusieurs de même orientation) ; sans rendu du modèle joint, le texte le dit.
  - **Depuis le 15 octobre 2026, le modèle rapide (Haiku) est de nouveau celui de tous les usages par
    défaut, sauf l'escalade (Sonnet depuis le 29 octobre 2026)** (voir ci-dessous) ; les plafonds par défaut (1 $ par jour, 10 $ par mois) et l'estimation
    par requête (0,005 $) lui correspondent. Un usage passé au modèle plus fin (Sonnet) dans
    « Réglages » coûte vingt fois plus, soit **de l'ordre de 20 à 40 centimes par parcelle** pour
    l'analyse : l'administrateur relève alors les plafonds.
- **Le modèle de chaque usage** (*demande de l'utilisateur, 14 octobre 2026*) est un réglage du serveur, choisi par l'administrateur dans
  le tableau de bord (§13.3, onglet « Réglages ») et gardé dans `claude/modeles.json`
  (`GET|PUT admin/claude/modeles`, session admin, version précédente en `.bak`). Il ne propose que les
  modèles que le serveur admet (`MODELES` de `deploy/analyse-fonctions.php`) et
  refuse les autres. Par défaut, le modèle rapide pour tous les usages : analyse des audits,
  run d'une façade, aide immédiate et cas candidats (`spec-regles-toits.md`) (*décision de
  l'utilisateur, 15 octobre 2026*) ; **sauf l'escalade, au modèle plus fin** (`claude-sonnet-5-5`,
  *décision de l'utilisateur, 29 octobre 2026*) : elle ne part qu'à la demande (une maison dont les
  passes se désaccordent, une façade après ses trois lectures votées), et une passe de plus du même
  modèle rapide n'y apportait presque rien. Le « rien trouvé » d'un vrai audit, qui avait fait passer l'analyse
  au modèle plus fin le 14 octobre, venait du schéma que l'API refusait (sortie structurée trop grande,
  §13.2 point « Réponse fermée »), pas du modèle. L'administrateur passe un usage au modèle plus fin
  s'il le faut. Un modèle réglé que
  le serveur n'admet plus retombe sur le défaut. Une demande qui nomme son modèle le garde, comme
  avant. Le réglage vaut pour les envois suivants : un batch déjà créé garde le modèle écrit dans sa
  fiche.
- **Où** : le serveur de la plateforme envoie le batch ; la clé d'API ne quitte jamais le serveur. Les
  photos partent avec l'accord de l'utilisateur, donné au lancement de l'analyse (question 12). Elles
  ne servent qu'à cette analyse : le partage pour le corpus est un autre accord (§15).
- **Sans réseau, ou sans accord** : seules les mesures du §13.1 deviennent des propositions. L'audit
  marche, avec moins de détails.

**Fait (lot L17, le client)** : `app/audit/parcelle/analyseClaude.ts` (accord, envoi, suivi, résultats,
notification), `entreesAnalyse.ts` (images étiquetées puis texte : indices LiDAR, modèle compact,
mesures, observations), `propositionsClaude.ts` (vote, contrôle croisé, propositions `claude`) et
`model/analyseClaude.ts` (schéma version 1, vote, indices chiffrés). L'accord (décision D2) est
demandé dans l'écran des propositions, gardé par projet sur l'appareil (pas dans le projet), rappelé
à chaque envoi et révocable ; la case « Partager cet audit pour améliorer Plan » (D7) est cochée par
défaut. Le serveur s'ouvre aux utilisateurs de la plateforme par leur jeton (D1), plafonds et journal
par organisation, façades comptées par ligne. Ce que le projet sait écrire est proposé : couverture,
cheminées, toiture-terrasse, matériau des murs ; tout arrive décoché tant que le taux d'accord n'est
pas mesuré (lots L19 à L21). Restent : la forme du toit, les lucarnes et les détails des ouvertures
(règles des toits et lot L15), l'escalade vers un modèle plus fin, et les coins et ouvertures proposés
pour le calage (lot L18). Points de fumée 69 et 70.

**Corrigé (essai sur téléphone, « il ne trouve rien »)** :
- **Les observations.** Ce que le vote établit sans que le projet sache l'écrire se montre, à part
  des propositions, en lignes à lire sans case (`app/audit/parcelle/observationsClaude.ts`) : forme
  du toit (comparée au modèle), profil, sens du faîtage, bouts (pignon, croupe, demi-croupe, brisis,
  vus de la rue), lucarnes (nombre, types, pan), éléments, volets, balcon et forme des baies de chaque
  façade, ouvertures manquées ou en trop et écarts au modèle (`ecartsEnClair`), et ce que l'accord du
  run de chaque façade a fait des ouvertures, par type. Chacune dit sur quelle image et avec quelle part des passes d'accord.
  Le schéma version 1 ne donne pour une façade que des **comptes** d'ouvertures manquées ou en trop ;
  leurs **types** (fenêtre, porte-fenêtre, porte, garage) viennent du run de la façade. Le fichier de l'audit
  (§15) ne les porte pas : son format n'a pas de place pour elles.
- **« Prêtes » dit combien** : « N propositions et M observations », ou que Claude n'a rien vu à
  proposer ni à signaler.
- **Les images d'une requête** sont plafonnées à 40, la limite du serveur (`IMAGES_PAR_REQUETE`,
  `deploy/analyse-fonctions.php`), qui refuse toute la demande au-delà. Ordre de
  priorité : orthophoto et carte LiDAR, meilleure photo de chaque façade et du toit (prise à la
  boussole d'abord), leur rendu, puis les autres photos tour à tour et leurs rendus. Un refus du
  serveur s'affiche avec son message.

### 13.3 Le tableau de bord de la consommation

*Demande de l'utilisateur, 13 octobre 2026.* Un écran dit combien de tokens chaque parcelle a
consommé, avec quel modèle, et comment cela évolue dans le temps.

**Où c'est stocké** (décision de l'utilisateur, 13 octobre) : **les JSON de l'admin sont stockés sur
le serveur de Plan**, comme la palette (`admin/palette`) et les démos (`deploy/admin.php`), dans le
dossier de données de l'admin, hors du dossier publié. Rien de cela ne va sur la plateforme.

| Fichier | Contenu | Qui l'écrit |
|---|---|---|
| `claude/journal-AAAA-MM.jsonl` | une ligne par appel à l'API (tableau ci-dessous) | `analyse.php`, à chaque appel |
| `claude/tarifs.json` | la table des tarifs datée | l'administrateur, depuis l'écran ; une première version est livrée avec Plan |
| `claude/plafonds.json` | les plafonds par organisation, par jour et par mois | l'administrateur, depuis l'écran |
| `claude/modeles.json` | le modèle de chaque usage (§13.2) ; absent, les défauts du serveur | l'administrateur, depuis l'écran |

Écriture atomique et version précédente gardée en `.bak`, comme les autres fichiers de l'admin.

**D'où viennent les chiffres.** `deploy/analyse.php` écrit une ligne de **journal** pour chaque appel à
l'API. Le navigateur ne
compte rien : un compte que l'utilisateur peut modifier n'est pas un compte. Les chiffres viennent
du champ `usage` que l'API renvoie, jamais d'une estimation.

| Champ | Contenu |
|---|---|
| `t` | date et heure de l'appel |
| `organisation`, `projet` | identifiants de la plateforme (l'administrateur hors projet : `admin`) |
| `idu`, `adresse` | la parcelle auditée |
| `audit` | l'identifiant de l'audit (une capture et son analyse) |
| `usage` | `analyse` (phase 2), `escalade`, `facade` (le run d'une façade, lots F2 et F3), `immediat` ; `renfort` sur une ligne d'avant le lot F3 (le renfort à trois passes, retiré) |
| `modele` | l'identifiant exact du modèle appelé (Claude Haiku 5.5, ou Sonnet 5.5 pour un usage que l'administrateur y a passé) |
| `batch` | vrai si l'appel est passé par l'API Batch |
| `idBatch` | l'identifiant du batch (hors batch : vide) ; la vue « Par modèle » compte les batches |
| `passe` | 1, 2 ou 3 (le vote) |
| `tokens` | entrée, écriture du cache, lecture du cache, sortie, tels que renvoyés par l'API |
| `images` | nombre d'images envoyées |
| `cout` | le coût en dollars, calculé avec la **table des tarifs** en vigueur à cette date |
| `statut` | réussi, échoué, expiré, refusé par le plafond |
| `trouve` | ce que la réponse contient, en **comptes** lus par le serveur quand il la relit (depuis le 14 octobre 2026 ; vide sur une ligne d'avant, ou sans réponse lisible) : ouvertures (comptées niveau par niveau par l'analyse, gardées par le renfort), manquées signalées, en trop (ou retirées par le renfort), pignons et croupes, lucarnes, éléments de toit, écarts au modèle, coins situés (renfort), attributs tranchés, et `vide` quand la réponse ne dit rien |

**La table des tarifs** (`claude/tarifs.json`) est datée. Chaque modèle y a ses
prix par million de tokens (entrée, sortie, écriture et lecture du cache), avec la remise Batch. Un
changement de prix ajoute une ligne datée et ne réécrit pas le passé : un coût d'hier reste celui
d'hier. Les prix sont vérifiés sur la page officielle d'Anthropic à chaque modification, et la date de
vérification est notée.

**L'écran** : **Admin › Consommation Claude** (`?admin&ecran=consommation`), administrateur seulement,
lu par `GET admin/consommation` (session admin, filtres en paramètres). Son onglet « Réglages » règle
le modèle de chaque usage, les tarifs et les plafonds (`GET|PUT admin/claude/modeles`,
`GET|PUT admin/claude/tarifs`, `GET|PUT admin/claude/plafonds`, session admin, en-tête
`X-Plan-Admin: 1` exigé sur toute écriture, comme les autres routes de `admin.php`). Le modèle de chaque
usage (« Analyse des audits », « Run d’une façade » (audit, calibration, relevé), « Aide immédiate », « Escalade », « Cas
candidats ») se choisit dans une liste déroulante : les modèles admis par le serveur, leur nom et leur
prix d'entrée et de sortie au million de tokens en vigueur ; « Enregistrer les modèles » rappelle que
les analyses déjà lancées gardent le leur.

| Vue | Ce qu'elle montre |
|---|---|
| **Dans le temps** | tokens et coût par jour, semaine ou mois, en aires empilées **par modèle** ; bascule tokens ou dollars |
| **Par parcelle** | une ligne par parcelle : adresse, IDU, nombre d'audits, tokens par modèle, part du cache, coût total, coût par façade, date du dernier audit ; tri sur chaque colonne |
| **Par usage** | répartition entre analyse, escalade, renfort et immédiat, et part du Batch |
| **Par modèle** | les modèles comparés sur la période et les filtres : la part des **réponses vides** (en barres), requêtes, batchs, appels immédiats, images, tokens, coût, coût par façade examinée, échecs, puis ce que les réponses contiennent (champ `trouve`), en total ou par réponse lue ; les réponses sans comptes (journal d'avant) sont dites et laissées hors du calcul |
| **Par organisation** | coût du mois, plafond, part consommée |
| **Chiffres clés** | coût moyen par parcelle comparé à l'estimation (1 à 2 centimes, §13.2), part de l'escalade, part des tokens lus en cache, coût par proposition validée |

- **Filtres** : période, organisation, modèle, usage, parcelle.
- **Le coût et la qualité ensemble** : à côté du coût par parcelle, le taux d'accord de Claude sur
  les propositions validées ou refusées (`spec-regles-toits.md` §14.2). Un changement de modèle ou de
  prompt se juge sur les deux.
- **Alertes** : une organisation à 80 % de son plafond du jour ou du mois ; un coût moyen par parcelle
  qui dépasse deux fois l'estimation sur sept jours ; un taux d'échec au-dessus de 5 %.
- **Export** : CSV de la vue affichée.
- **Graphiques** : SVG dessiné par la page, jetons de couleur de l'interface, lisibles en clair et en
  sombre ; une couleur par modèle, accompagnée de son nom (la couleur ne porte jamais seule
  l'information).
- **Vie privée** : le journal ne garde ni photo ni contenu de réponse, seulement les compteurs et
  l'identité de la parcelle. Il est gardé 24 mois.

Pour l'utilisateur, la fin de l'analyse dit seulement que les propositions sont prêtes. Le coût
n'est montré qu'à l'administrateur, tant que Plan ne facture pas l'analyse (`spec-connexion-plateforme.md`
§7).

Claude **propose**, il ne décide pas et ne calcule pas : un toit ou une façade ne change que par votre
validation (§14).

## 14. Phase 3 — Propositions en 3D, et validation

1. **Les propositions, en 3D.** La Vue 3D montre le modèle **après** les propositions, chaque
   changement surligné. Une bascule « Avant / Après » compare au modèle actuel. Toucher un changement
   montre sa ligne, la photo qui le justifie et les indices de Claude.
   - **L'écran des propositions laisse voir la parcelle** (essai d'AE 101, 15 octobre : il la
     couvrait). Au doigt, une carte en bas, haute au plus de 46 % de l'écran : le titre, le compte,
     « Avant / Les deux / Après » et les boutons restent en place, la liste défile entre eux, et **« Replier »**
     la range. Sur un écran en largeur, un panneau à droite. **« Fermer »** sort de l'audit depuis la
     prise comme depuis les propositions, à droite du titre (demande de l'utilisateur du 16 octobre) :
     la liste n'est plus l'unique sortie, et rien n'est perdu (la capture reste dans le brouillon). La Vue 3D, épurée comme pendant la prise,
     cadre la parcelle et ses bâtiments en vue d'ensemble dans ce que l'écran laisse voir (une seule
     vue : « Avant » ou « Après » seul).

   **Les deux vues** (demande de l'utilisateur du 15 octobre 2026 : « Je dois pouvoir avoir deux vues
   3D, avant / après, afin de pouvoir décider »). L'écran s'ouvre sur « Les deux » :
   - deux vues de la **même** Vue 3D, « Avant » (le projet) et « Après » (les propositions cochées),
     étiquetées dans leur coin bas gauche ; elles prennent la part du canevas que l'écran des
     propositions laisse libre (le plus grand bandeau à côté de lui), côte à côte ou l'une au-dessus
     de l'autre selon ce qui donne à chacune la forme la plus proche du 4:3 — l'une au-dessus de
     l'autre au téléphone ; l'écran des propositions est la carte du bas au doigt et le panneau de droite sur un écran en
     largeur, et les deux vues prennent le reste ; la caméra ne se décale pas en plus (les vues
     évitent déjà l'écran) ;
   - **une seule caméra**, rendue deux fois par image dans un seul contexte WebGL (viewport et
     scissor), cadrée sur la forme de l'une des vues (`vuePrise.ts::rapportVisible`) pour que la maison
     la remplisse : tourner, zoomer ou déplacer dans l'une fait de même dans l'autre, par construction. La
     molette vise le point de la vue sous le curseur ;
   - les bâtiments que les cases cochées changent passent sur une couche « Avant », leurs copies sur
     une couche « Après » ; le reste de la scène est commun. La clôture proposée s'y compare aussi,
     sur une copie de la parcelle ;
   - chaque case, chaque nouveau calcul des propositions (mesures, réponses de Claude) met « Après »
     à jour ; la scène rebâtie, les deux vues s'y reposent ; l'écran fermé, la vue unique revient ;
   - à l'arrêt, la vue ne se redessine que quand la caméra bouge (et quelques fois par seconde pour
     une texture arrivée) ; l'occlusion de la qualité Soignée est mise de côté le temps des deux vues ;
   - rien n'est écrit avant « Valider », qui referme les deux vues avant d'écrire.
2. **La liste**, une ligne par changement, avec l'avant, l'après et l'origine (mesure ou Claude) :
   - « Façade sud : 6 ouvertures relevées (Plan en avait mis 4), texture de la photo » ;
   - « Façade sud : 5,82 m à l'égout, mesurés (le bâtiment a 6,00 m) » ;
   - « Façade sud : volets battants sur les 4 fenêtres de l'étage (Claude) » ;
   - « Murs : enduit beige #c9b49a, lu sur vos photos (au lieu de la couleur du matériau) » ;
   - « Toit : deux cheminées au faîtage, brique (Claude, confirmé par le LiDAR) » ;
   - « Toit-terrasse du garage : accessible, acrotère de 1 m » ;
   - « Clôture côté rue : mur de 1,60 m, portail de 3,50 m ».
3. **Cocher** :
   - chaque ligne se coche ou se décoche, et la 3D suit ;
   - une proposition de faible confiance, ou de Claude seul sur un attribut à moins de 95 % d'accord
     (`spec-regles-toits.md` §14.2), arrive **décochée** ;
   - **une valeur que vous aviez choisie à la main** (couleur, matériau, relevé d'une façade, forme du
     toit) n'est jamais remplacée en silence. Sa ligne est décochée par défaut et le dit : « remplace
     votre choix : brique rouge ».
   Les corrections d'ouvertures se font dans l'éditeur du relevé, ouvert depuis la ligne de la façade
   (`spec-facades-calage-detection.md` §12).
4. **Valider** écrit tout ce qui est coché en **un seul pas d'historique** (Ctrl+Z le défait). Le projet
   est marqué modifié.
5. **Vérifié sur place** : un bâtiment dont le toit et les façades ont été vus et validés est marqué
   « vérifié sur place », avec la date. C'est le 100 % du §1.
   - Les changements de règle ne le recalculent plus (`spec-regles-toits.md` §1).
   - Une actualisation IGN (Fichier › Actualiser) non plus, sauf si vous le demandez.

Ce qui est écrit utilise les structures **déjà dans le projet** :
- `ReleveFacade` pour chaque façade (§7), enrichi du calage et de la grille
  (`spec-facades-calage-detection.md` §13) ;
- `couleurMurs` (source `photo`) et la texture de matériau ;
- les cheminées et la terrasse dans le corps du toit (`spec-regles-toits.md` §4) ;
- la clôture et le portail de la parcelle.

L'audit ne touche pas au code des toits : AE 101 et les empreintes ne bougent pas.

**Ce que Claude a vu sans le proposer** suit la liste, bâtiment par bâtiment, sous le titre « Vu par
Claude, à vérifier sur place » : des lignes à lire, sans case, qui ne changent rien au projet (forme
du toit vue, pignons, lucarnes, éléments, ouvertures manquées ou en trop, écarts au modèle ; §13.2).

**Le run de chaque façade** (`spec-facade-calage-audit.md` §8, lot F3 ; il a remplacé le renfort à trois passes votées) se propose
en deux lignes par façade, toutes deux décochées : le relevé « avec l'aide de Claude » (baies devinées confirmées, détails ajoutés),
puis, s'il y en a, les boîtes que Claude voit seul, que la détection ne retrouve pas, « vues par Claude, non confirmées sur la photo ».
La seconde contient la première : cochée seule ou avec elle, elle écrit le même relevé. Trois lectures par façade mesurée, dans le
batch de l'analyse, sur l'élévation du mur (décision du 29 octobre 2026, réglage `facades.ia.passes`) ; leurs réponses sont
enregistrées ensemble (versions, modèle, tokens, coût), le moteur de règles les vote puis les accorde (`facade/regles/facades/ia.ts`,
`voterObservations`, `accorderOuvertures`) : le vote ne coche rien, la protection contre l'invention reste l'accord avec la détection.
Sous la barre de chaque façade, une ligne dit sa lecture et son coût, et **« Escalader »** (commande `facade.escalader`, à la demande
seulement, son coût annoncé) envoie une requête de plus au modèle de l'usage `escalade` ; sa réponse, gardée dans le run, est pesée par
le moteur contre le vote (`escaladerObservations`), et l'accord de la façade est refait. L'accord demande le relevé mesuré de la façade (§13.1) : il attend les mesures, façade par façade, et ne note jamais un
accord vide ; les réponses sont gardées dans la capture, si bien qu'un brouillon repris avec un batch déjà fini accorde chaque façade
quand sa mesure arrive. Claude ne retire jamais une baie détectée.

**Fait (lot L11, sans Claude)** : les mesures du téléphone (`app/audit/parcelle/mesures.ts`) et les
observations deviennent des propositions (`regles/decisions.ts`, source `mesure`, prêtes pour la
source `claude`) ; Avant / Après dans la Vue 3D sur des copies des bâtiments, puis les deux ensemble
(`three/comparaison3d.ts`, `regles/decisions.ts::projetApres`, point de fumée 90) ; cases, choix à la main
décochés (« Remplace votre choix : … ») ; « Valider » en un pas d'historique ; `verifieSurPlace`.
Restent : la forme du toit vue (forme, faîtage, bouts, lucarnes), qui attend les règles et Claude ;
la photo et les indices touchés depuis la 3D ; l'éditeur du relevé ouvert depuis la ligne d'une
façade ; la mosaïque de plusieurs photos d'un mur dans les mesures (lots L13 à L15) ; la texture du
gros plan du parement.

**Fait (lot L12, le 100 % protégé)** : `model/toitVerifie.ts`. La relecture des toits en tâche de
fond saute le bâtiment vérifié (sa copie est lue et comparée, rien ne s'écrit que la marque de
lecture ; le bilan dit si le nouveau calcul serait d'accord). Fichier › Actualiser le projet le
conserve tel quel, sauf la case « Recalculer aussi… » de la question ; Fichier › Actualiser depuis
l'IGN le conserve aussi, sans case. Point de fumée 64.

## 15. Le fichier, pour le corpus

### 15.1 Le format, et qui le produit

- Nom : `audit-parcelle-AAAA-MM-JJ-<idu>.json`, format `plan-audit-parcelle`, version 1.
- Contenu :
  - la parcelle (IDU, adresse, origine), la version du code et des règles ;
  - pour chaque bâtiment, un cas figé (§9), « Ce que je vois » (§8.1), et pour chaque façade ses photos
    (avec prise et calage), son `ReleveFacade`, sa couleur, son matériau et son gros plan ;
  - la clôture et le portail ;
  - les propositions (mesure ou Claude), avec leurs indices, et pour chacune si elle a été **validée
    ou refusée** ; les corrections faites dans l'éditeur du relevé. Une proposition refusée est aussi
    une information : Plan, ou Claude, s'est trompé.
- Taille : dix façades à trois photos font environ 9 Mo d'images, plus 1,5 Mo d'élévations, soit
  environ 14 Mo en base64.
- **Qui le produit** :
  - l'administrateur, toujours (audit hors projet) ;
  - un utilisateur, **seulement s'il accepte de le partager** (« Partager cet audit pour améliorer
    Plan »). **Décision de l'utilisateur (13 octobre) : la case est cochée par défaut**, et elle se
    décoche à tout moment : décocher retire du serveur le fichier déjà parti. Elle est posée avec
    l'accord de l'analyse par Claude (lot L17) quand cette question l'est, puis montrée seule sur
    l'écran des propositions, avec ce qui partira (« le fichier de l'audit, photos comprises ») ;
    rien ne part avant « Valider », ni sans réseau, ni sans session admin ou jeton de la plateforme
    (question 11).
- Les validations et les refus mesurent le **taux d'accord** de Claude par attribut
  (`spec-regles-toits.md` §14.2) et la précision du détecteur d'ouvertures
  (`spec-facades-calage-detection.md` §14).
- **Fichier › Importer un audit de parcelle** applique un fichier à un projet de la même parcelle
  (même IDU) : il reprend à la phase 3. C'est le cas d'un audit fait par l'administrateur pour un
  client.

### 15.2 Fait (lot L21)

- `model/fichierAuditParcelle.ts` écrit et relit le format `plan-audit-parcelle` version 1 ; il
  recopie sans recalculer. Chaque validation garde les propositions telles qu'elles étaient
  (`DecisionAudit.propositions`) : une proposition écrite ne se propose plus, le fichier la redit
  avec sa décision. `app/audit/parcelle/fichier.ts` fige chaque bâtiment comme un cas (§9), grille
  LiDAR relue à l'écriture (sans réseau, le cas part sans grille).
- L'administrateur a le bouton « Fichier de l'audit » sur l'écran des propositions (feuille de
  partage du système, sinon téléchargement).
- L'import refuse un fichier d'une autre parcelle en le disant. Un projet de la même parcelle peut
  donner d'autres clés aux mêmes bâtiments : ils sont retrouvés par leur identifiant BD TOPO. Les
  mesures du fichier tiennent lieu de calcul tant que les photos de leur façade ne changent pas ;
  les cases suivent la dernière validation du fichier, sans jamais cocher une ligne qui remplacerait
  un choix fait à la main dans ce projet. Une capture déjà sur l'appareil n'est remplacée qu'après
  confirmation. Un audit importé arrive avec la case du partage décochée : son auteur l'a déjà.
- Le partage va sur le serveur de Plan, dans les données de l'admin : `admin/audits`
  (`deploy/analyse.php`), par la session admin ou le
  jeton de la plateforme vérifié auprès d'elle (`plateformeUrl`). Le fichier est rangé tel qu'il est
  arrivé dans `audits/`, avec une fiche (IDU, adresse, organisation, taille). L'envoi rend un secret
  de retrait, gardé avec la capture sur l'appareil ; le serveur n'en garde que l'empreinte. Chaque
  validation renvoie le fichier et retire le précédent. La liste et la lecture sont à
  l'administrateur seul.

### 15.3 Sauvegarde pendant la capture, et catalogue de l'administrateur

Demande de l'administrateur du
14 octobre : « il faut pouvoir pousser un audit parcelle pour le rejouer ; si problème, on perd
tout ».

- Le brouillon de l'appareil se perd avec le téléphone ou le navigateur. Quand quelqu'un peut envoyer
  (même condition que le corpus : session admin ou jeton de la plateforme), le fichier de l'audit
  part aussi au serveur de Plan **pendant la capture** (`app/audit/parcelle/sauvegarde.ts`) :
  cinq secondes après la dernière photo rangée ou retirée (une rafale fait un envoi ; une note tapée
  n'en fait aucun), à « Lancer l'analyse », et à la demande par la commande « Envoyer l'audit au
  serveur » (`audit.envoyerParcelle`), sous la liste de contrôle, qui dit l'état : « Envoyé à 17:42 »,
  « En attente de réseau, nouvel essai à 17:45 », l'erreur du serveur en clair, ou la taille.
- **Le même dépôt est remplacé à chaque envoi** : `PUT admin/audits/<id>`, par le secret de retrait
  gardé avec la capture (`CaptureParcelle.sauvegarde`, sur l'appareil seulement, comme celui du
  corpus) ou par la session admin ; un dépôt retiré entre-temps est refait par un `POST`. La grille
  LiDAR d'un bâtiment n'est relue qu'une fois par session (contour inchangé).
- **Hors ligne**, l'envoi réessaie à 15 s, 30 s, 1 min, 2 min puis toutes les 5 min, et dès que le
  navigateur retrouve le réseau ; un serveur indisponible (5xx, 408, 429) de même ; un refus (401,
  403, 400) se dit sans insister. La capture n'attend jamais.
- **Taille** : huit photos de 1 280 px (300 Ko au plus chacune, ~400 Ko en base64) par façade, soit
  ~3,2 Mo la façade au plus ; dix façades pleines font ~32 Mo, sous les **48 Mo** que les deux
  serveurs acceptent (`TAILLE_MAX`). Au-delà, rien ne part et la ligne le dit (« L'audit pèse 52 Mo :
  le serveur de Plan en accepte 48 Mo au plus. Retirez quelques photos… »). Sur l'hébergement PHP,
  `post_max_size` (8 Mo par défaut) ne coupe pas un corps JSON lu par `php://input` (vérifié en
  PHP 8.3 : un audit de 4 Ko passe un plafond de 2 Ko ; PHP n'en écrit qu'un avertissement au
  journal) ; une configuration qui le jetterait quand même laisse un corps vide, et `analyse.php`
  répond alors 413 « … post_max_size = 8M dans sa configuration, à porter à 64M », montré tel quel.
  La vraie borne est **`memory_limit`** (128 Mo par défaut) : le texte et son JSON décodé tiennent
  ensemble en mémoire, environ trois fois la taille du fichier. À régler sur l'hébergement :
  `memory_limit = 256M`, et `post_max_size = 64M` pour ne pas remplir le journal d'avertissements.
- **Sauvegarde ou corpus** : le dépôt porte sa marque, en-tête `X-Plan-Depot: sauvegarde` ;
  sans en-tête (les pages d'avant), c'est un partage `corpus`. Le fichier lui-même ne change pas : la
  marque dit pourquoi il a été déposé, pas ce qu'il contient, et un fichier se rejoue à l'octet près
  quelle que soit sa marque. La fiche du serveur la garde, avec les photos, la phase (`capture` tant
  que `finCapture` est vide) et le début de la visite. Le partage D7 reste ce qu'il était, cochable
  et retirable, un dépôt à part après « Valider » ; l'écran Conformité ignore les sauvegardes (une
  capture inachevée n'a rien validé, et un audit partagé ensuite compterait deux fois).
- **L'accord** (§16, « pas d'envoi de photos sans votre accord ») : l'envoi automatique est celui de
  l'administrateur, ou d'un utilisateur qui laisse cochée la case du partage (cochée par défaut :
  c'est l'accord d'envoyer le fichier, photos comprises, au serveur de Plan). Décocher la case retire
  aussi la sauvegarde d'un utilisateur ; ensuite rien ne part sans le bouton. L'administrateur garde
  toujours la sienne, et sa case le dit (« La sauvegarde de l'audit reste sur le serveur de Plan »).
- **Admin › « Audits de parcelle »**, devenu « Audits » (15.4) (`admin.auditsParcelle`, menu Admin à côté de « Conformité »,
  admin des démos seulement) : un parcours de Z8 (`zones/parcours/AuditsParcelle.tsx`), et non un écran
  plein page comme la Conformité, parce qu'il rouvre un audit dans le projet ouvert dessous. Une carte
  par audit reçu, du plus récent au plus ancien : date de réception, sauvegarde ou partage, capture en
  cours ou terminée, parcelle (IDU), adresse, photos, taille, organisation. Pour chacun :
  - « Ouvrir dans ce projet », si le projet est sur la même parcelle (sinon grisé, avec la raison
    écrite sous les boutons) : le fichier est lu sur le serveur et repris par le chemin de l'import,
    question de remplacement comprise, **à la phase où il en était** — sur la liste de contrôle
    quand la capture n'était pas finie (`captureDuFichier` lit `finCapture`), sur les propositions
    sinon. Une sauvegarde rouverte reste la même : les envois suivants de l'administrateur la
    remplacent (par sa session), au lieu d'en créer une autre ;
  - « Télécharger » le fichier tel qu'il est arrivé (`audit-parcelle-<jour>-<idu>.json`) ;
  - « Retirer », confirmé sur la carte même (« Retirer définitivement » ou « Garder ») : une question
    de Z8 s'ouvrirait sous le parcours.
- Contrat (`deploy/analyse.php`, scénario
  `tests/fixtures/deploy/scenarioAudits.ts`) : `PUT admin/audits/<id>` (secret ou admin, et comme le
  dépôt une session ou un jeton ; identifiant, secret et organisation du premier envoi gardés ;
  404 s'il n'existe plus), `X-Plan-Depot` (`corpus` ou `sauvegarde`, sinon 400), fiche augmentée de
  `marque`, `photos`, `phase`, `debut` ; 413 qui dit `post_max_size` quand PHP a jeté le corps. Client : `io/auditsServeur.ts` (`envoyer`, `remplacer`,
  `retirer`, `lister`, `lire`). Fumée : point 85.
- Restent : verser les audits reçus au corpus du dépôt (§21), et les corrections faites dans l'éditeur
  du relevé, qui attendent son ouverture depuis la ligne d'une façade.

### 15.4 Les données du serveur, et l'écran « Audits »

Demandes de l'administrateur du 15 octobre : « les fichiers contenant des données : dans un répertoire
en dessous de public_html, comme tous les fichiers de données — sous la racine un répertoire `data`
avec toutes les données, et des sous-répertoires » ; « les audits eux-mêmes sont dans data, classés
dans des répertoires pour faciliter » ; « regrouper les audits promenade et audit parcelle dans
l'écran audit en les séparant, accès aux données et conclusion, action prise ou non » ; « c'est mon
outil pour travailler à mon bureau suite à des audits. Je veux pouvoir tout analyser, entrant,
sortant… » ; « je ne jette rien, tout est utile pour l'instant ».

- **Un seul dossier `data/`**, frère de `public_html/` (à côté de `plan-admin-config.php`), jamais
  servi : `deploy/donnees.php`. Réglage `dossierDonnees` de la
  configuration, par défaut `data/` à côté de la racine web, même quand Plan est
  dans un sous-dossier. Sous-dossiers : `demo/` (les démos de l'admin et de la vitrine
  `?mode=demo`), `admin/` (palette, registre des contrôleurs, échecs de connexion), `claude/`
  (journal, tarifs, plafonds, modèles, batches), `audits/`, `conformite/`, et `migration.json`.
- **Compatibilité** : une configuration qui ne dit que `dossierDemos` (celles d'avant) garde
  l'ancienne disposition telle quelle (tout dans ce dossier, `.palette.json` à sa racine) : une mise
  en ligne ne déplace rien sans que l'administrateur le demande. Avec `dossierDonnees`, au premier
  passage, l'ancien dossier (`dossierDemos` s'il est encore là, puis `plan-demos/` à côté de la
  configuration ou de la racine web, puis `demos/` à côté d'`admin.php`) est **déplacé** dans `data/`,
  élément par élément, sous verrou, une fois : les démos dans `demo/`, `.palette.json` et
  `.controleurs.json` dans `admin/`, `claude/`, `audits/` et `conformite/` tels quels. Rien n'est
  écrasé : un élément déjà présent dans `data/` reste, et l'ancien aussi. `data/migration.json` dit ce
  qui a été déplacé et ce qui est resté, l'ancien dossier reçoit `DEPLACE-VERS-DATA.txt`, le journal
  d'erreurs de PHP (ou la console de Node) une ligne, et `GET admin/claude/etat` le montre à
  l'administrateur (`donnees`). Les sessions PHP restent où PHP les range (`session.save_path`, hors
  du site sur SiteGround).
- **Chaque audit a son dossier**, classé pour s'y retrouver à la main (gestionnaire de fichiers,
  FTP) : `audits/parcelle/<IDU>/<id>/` et `audits/promenade/<commune>/<id>/` — `audit.json` (le
  fichier tel qu'il est arrivé, à l'octet près), `fiche.json`, `decisions.json` (la conclusion,
  lisible : chaque proposition, sa source et sa décision ; chaque cas d'une promenade et son statut),
  `analyses/` et `images/` (15.5). L'`<id>` commence par la date et l'heure de réception
  (`AAAAMMJJ-HHMMSS-xxxxxxxx`) ; les noms sont en ASCII sans espaces (`nomSur`, même table d'accents
  dans les deux serveurs). `audits/index.json` garde les fiches sans les secrets : la liste se lit
  d'un coup ; supprimé, il se reconstruit en relisant l'arborescence. Les audits rangés à plat avant
  ce rangement (`audits/<id>.json` et `<id>.fiche.json`) y sont rangés au premier passage. Le format
  du fichier d'audit ne change pas.
- **Les promenades des toits** (`plan-audit`, `model/audit.ts`) se déposent aussi sur le serveur, par
  l'administrateur seul (« Ajouter un fichier d'audit… » de l'écran, qui envoie aussi bien un audit
  de parcelle) ; leur fiche dit la commune, les cas et leur nombre par statut. Elles ne s'ouvrent pas
  dans un projet et ne se rejouent pas par Claude.
- **L'audit validé repart au serveur avec ses décisions** : après « Valider », le partage (D7) et la
  sauvegarde quand elle part d'elle-même (administrateur, ou accord du partage) ; la fiche compte les
  propositions (`propositions` : total, Claude, mesures, validées, refusées, en attente).
- **Admin › « Audits »** (`admin.auditsParcelle`, l'ancien « Audits de parcelle ») : deux sections,
  « Audits de parcelle » et « Promenades des toits ». La carte dit en une ligne la conclusion (« 3
  propositions (Claude 2, mesures 1) : 1 validée, 1 refusée, 1 en attente », ou « À corriger 1,
  Validé 1 »). « Détails » l'ouvre sur ses **données** (les photos en vignettes, bâtiment par bâtiment
  et façade par façade avec ce que les mesures en ont tiré ; cas par cas pour une promenade), sa
  **conclusion** (tableau des propositions : objet, avant, après, source, décision ; pour une
  promenade, statut et « fait écrit » d'après `regles/toits/faits.json`) et, pour un audit de
  parcelle, ses **analyses** (15.5). Sur grand écran le dialogue s'élargit (1 180 px) ; au doigt, les
  tableaux défilent dans leur boîte. « Retirer » reste confirmé et emporte le dossier entier.
- **L'avant et l'après d'un audit reçu** (demande de l'utilisateur du 16 octobre ; la base des
  décisions que l'administrateur prendra plus tard). Sur la carte d'un audit de parcelle, **« Avant /
  Après »** ouvre l'écran des propositions de l'audit, **le même** : la même Vue 3D en deux vues
  (« Avant », « Les deux », « Après »), les mêmes lignes, la même caméra. Une seule source : la
  consultation est une **session d'audit à part** (`creerSessionAuditParcelle`, sans capteurs, brouillon,
  analyse ni partage) dont la validation est **figée** sur les propositions et les décisions du fichier
  (`validation.figer`) ; l'aperçu (`apercuDe`, `projetApres`) est celui de la validation, et rien n'est
  dupliqué. En lecture seule : cases grisées (cochée = validée par l'audit, avec « Décision de l'audit :
  Validée / Refusée / En attente »), ni « Valider », ni liste, ni partage ; « Retour aux audits » rouvre
  le catalogue, « Fermer » sort. Sans aucune décision dans le fichier, les cases par défaut de l'audit.
  Il faut que le projet ouvert soit sur la même parcelle (grisé avec sa raison sinon) ; les bâtiments du
  fichier sont rapprochés de ceux du projet comme à l'import. Le projet et l'audit en cours de
  l'administrateur ne sont pas touchés (`app/audit/parcelle/commande.ts::consulter`).
- Pas de purge automatique : rien ne s'efface sans « Retirer » (administrateur, ou le secret de
  retrait de la personne qui reprend son accord, D7).

### 15.5 Garder l'entrant et le sortant, rejouer et comparer

Rejouer l'analyse par Claude d'un audit stocké, avec le prompt et le schéma actuels
(`deploy/prompt-*.md`, `deploy/schema-*.json`, versionnés) et le modèle choisi, sans refaire la
visite, pour comparer les réponses d'une version du prompt à l'autre et d'un modèle à l'autre.

- **La trace** : un batch qui nomme son audit (`depot`, l'identifiant du serveur) garde, dans le
  dossier de l'audit, `analyses/<AAAAMMJJ-HHMMSS>-<modele>-<xxxx>/` :
  - `entrant.json` : pour chaque usage, la version du prompt et du schéma et **le texte complet
    envoyé en system** (prompt puis schéma, `promptAvecSchema`) ; `max_tokens`, effort ; chaque
    requête (identifiant, passe, usage, modèle, façades, images) et ses blocs dans l'ordre — le texte
    tel quel, chaque image par son nom `images/<sha256>.<ext>` et sa taille. Les images sont gardées
    une fois par audit (deux rejeux envoient les mêmes photos réduites : un seul fichier). On garde
    l'image **envoyée** (réduite à 1 024 px, rendu du modèle, orthophoto, carte LiDAR), qui n'est pas
    celle du fichier d'audit : c'est elle que Claude a vue ;
  - `sortant.json` : pour chaque requête, le statut, l'arrêt, l'erreur (type, message), **le texte
    brut de Claude** tel qu'il l'a écrit, la sortie ramenée au schéma (`conformer`), les tokens, le
    coût, le tarif, les comptes (`trouve`) ; le batch et l'heure de fin ;
  - `resume.json` : nature (`analyse` ou `rejeu`), état (`en_cours`, `termine`), dates, batch,
    organisation, usage, modèle, effort, versions, nombre de requêtes et d'images, puis les comptes,
    tokens et coût de chaque requête. C'est ce que la liste montre.
  Le journal de `claude/` ne change pas : il ne garde toujours ni photo ni réponse.
- **Qui nomme son audit** : l'analyse de la session, quand l'audit a déjà un dépôt sur le serveur
  (sa sauvegarde, sinon son partage) — si ce dépôt a été retiré ou n'est pas celui de l'organisation,
  l'analyse part quand même, sans trace ; et le **rejeu**, qui l'exige (404 sinon).
- **Le rejeu** (`app/audit/parcelle/rejeu.ts`) : depuis la carte ouverte, « Rejouer l'analyse » avec
  le modèle choisi dans la liste des modèles que le serveur admet (`MODELES`, lus dans
  `admin/claude/etat`). Il demande le projet ouvert de la même parcelle (le modèle actuel, l'orthophoto,
  le relief et le rendu de la Vue 3D en viennent, comme à l'analyse ; sans Vue 3D construite, pas de
  rendu). Les photos, les mesures et « Ce que je vois » viennent du fichier (`captureDuFichier`,
  `mesuresDuFichier`), les entrées de `preparerDemande`, trois passes par bâtiment. Le renfort des
  façades n'est pas rejoué. La demande part en batch, usage **`rejeu`** (modèle par défaut celui des
  autres usages, réglable dans Réglages › Modèles ; ici toujours explicite), `depot` et `modele`
  nommés : **les mêmes plafonds qu'une analyse** (dépense du jour et du mois, engagé, estimation), et
  le tableau de bord en dit le coût à part (« Rejeu des audits »). Réservé à l'administrateur (403
  pour un jeton) ; un rejeu ne porte que l'analyse des maisons (400 sinon) ; pas d'appel immédiat.
- **Le suivi** : la carte ouverte relit les analyses ; celles en cours voient leur batch relu toutes
  les vingt secondes (et à « Relire les analyses ») ; un batch fini est lu (`resultats`), ce qui
  complète la trace côté serveur (une fois, avec le journal). Un batch fini pendant que personne ne
  regarde est aussi lu au batch suivant de la même organisation (`engagements`).
- **La comparaison** (`export/benchmarkAnalyses.ts`) : une ligne par analyse ou rejeu, dans l'ordre
  des essais — date, nature, modèle, versions du prompt et du schéma, réussies sur requêtes, réponses
  vides, puis ouvertures, pignons, lucarnes, écarts, déterminés, coût, durée (de l'envoi à la fin du
  batch). Les comptes d'une analyse sont, pour chaque bâtiment, la **médiane de ses passes lues**
  (le vote), additionnée sur les bâtiments ; une passe en échec ne compte pas. « Exporter en CSV »
  rend le tableau au format du tableau de bord (`;`, virgule décimale, BOM).
- **Le détail d'une analyse** (« Voir ») : l'entrant (le texte du prompt envoyé, chaque requête avec
  ses textes et ses images en vignettes), le sortant (pour chaque requête : statut, arrêt, erreur,
  tokens, coût, ce qui a été trouvé, la réponse brute et la sortie remise en forme), le vote par
  bâtiment ; « Exporter (JSON) » donne le tout (`plan-audit-analyse-complete`) pour le travailler
  ailleurs. Les propositions et leur décision sont celles de l'audit (sa conclusion) : un rejeu ne
  modifie pas l'audit et ne recalcule pas de propositions.
- Routes (`deploy/analyse.php`, administrateur seul, en lecture) :
  `GET admin/audits/<id>/analyses`, `GET admin/audits/<id>/analyses/<trace>`,
  `GET admin/audits/<id>/images/<sha256>.<ext>` ; `POST admin/claude/batches` accepte `depot`
  (identifiant d'audit) et rend `trace`. Client : `io/analysesAudits.ts`. Scénario commun
  `tests/fixtures/deploy/scenarioDonnees.ts` (dont : rien n'est écrit hors de `data/`). Fumée :
  points 85 et 86.
- Restent : le rejeu par Claude des promenades (il faudrait construire les entrées depuis les cas,
  sans projet) et celui du renfort des façades ; les propositions qu'un rejeu donnerait (il faudrait
  rejouer `propositionsClaude` sur le projet) ; la comparaison de deux réponses brutes côte à côte.

## 16. Ce que l'audit de parcelle ne fait pas

- Pas de reconstruction de la géométrie depuis les photos : le contour reste celui du plan, comme dans
  le relevé.
- Pas d'intérieur, pas de mesure du terrain.
- Pas de photo détaillée des parcelles voisines.
- Pas de changement du modèle sans votre validation : tout passe par les propositions (§14).
- Pas de calcul par Claude : il regarde et propose ; les mesures sont faites par Plan.
- Pas d'envoi de photos sans votre accord.

---

# Partie C — Promenade (administrateur)

## 17. But et accès

Se promener dans un quartier, téléphone en main, et noter les bâtiments dont le toit ou la façade
calculés sont faux. En fin de promenade, un fichier part à Claude. Il rejoue chaque cas hors ligne,
corrige la règle en cause, puis fige le résultat validé comme **cas de non-régression** (partie D).
La promenade ne produit pas de projet : elle produit un **jeu de test terrain**, qui calibre le
voisinage (§1).

**Accès et cycle de vie**
- `?mode=audit` n'a d'effet que si la personne administre (`app/acces.ts::confirmerAdministrateur`,
  qui relit le contexte de la plateforme quand il n'est pas en cache). Sinon, le paramètre est ignoré,
  un message le dit, et l'application s'ouvre normalement.
- Il s'ouvre depuis l'écran par **Admin › Mode audit (promenade)** :
  - en admin des démos, vers `?admin&mode=audit` (le dépôt des démos n'est pas posé, rien ne s'y
    enregistre) ;
  - pour l'administrateur de la plateforme, vers `?mode=audit`, seule entrée de son menu Admin.
- **Aucun projet plateforme** : ni création, ni enregistrement automatique, ni enregistrement final.
  Étape 1 : `main.ts` ne pose aucun dépôt de projets, le plan part vide (`graineAudit`). Le menu
  Fichier n'est pas encore réduit (étape 2).

## 18. Sur le terrain

### 18.1 Démarrage

1. Lecture du GPS (§3). Tant que la précision annoncée dépasse 30 m, l'écran dit « En attente d'un GPS
   précis (± n m) ».
2. La parcelle sous le premier point précis devient la « parcelle du projet » du plan en mémoire
   (`app/audit/chargement.ts::planDeDepart`). Beaucoup de fonctions en attendent une (centre de la
   scène, mitoyenneté), et elle sert de point de départ dans le fichier.
3. L'**origine** du repère est celle de son calage cadastral, comme à l'import (le sommet le plus au
   nord, `projecteurDuPlan`). Elle ne bouge plus de la promenade : toutes les coordonnées du fichier
   sont en mètres depuis elle, et le fichier la donne (`promenade.origine`).
4. Chargement autour de vous (§18.2), puis Vue 3D, caméra qui suit (§3).

### 18.2 Chargement autour de vous

**Étape 1** (`app/audit/chargement.ts::chargerAutour`) :
- à chaque déplacement de plus de 10 m depuis la dernière lecture, le disque de 70 m centré sur la
  position est relu (`app/cadastre/actualisationIgn.ts::construireVoisinage`, option `centre`) ;
- 40 m à la première version, porté à 70 m pour couvrir ce que la vue « drone » montre devant vous ;
- ce qui est déjà chargé est écarté par l'IDU et l'identifiant BD TOPO : seul le nouveau est ajouté,
  et ce qui est chargé reste ;
- une lecture en cours met la suivante en attente.

Chaque nouveau bâtiment est calculé comme au §4.

**Étape 2**, si la mesure sur un long trajet le demande :
- **Cases de 10 m** dans le repère de l'origine. Une case est lue quand son centre passe à moins de
  40 m de la position, et une seule fois. En marchant, seules les cases nouvelles sont demandées.
- **Garde-fou** : au-delà de 600 bâtiments chargés, les plus éloignés de la position sont retirés de la
  scène. Un bâtiment marqué ne l'est jamais.

### 18.3 Marquer un bâtiment

- Les commandes `audit.suivre` (« Me suivre ») et `audit.cas` (« Cas notés (n) ») sont dans la barre
  de la Vue 3D (§3).
- **Tapoter** un bâtiment : il passe en rouge, marqué « à vérifier », catégorie « toit » par défaut. Le
  rouge est une couleur d'affichage posée par-dessus, comme `?mode=devroof` (`app/diagnostic.ts`) :
  rien n'est modifié.
- Tapoter un bâtiment marqué : la marque est retirée.
- **Appui long** sur un bâtiment (marqué au passage s'il ne l'était pas) : une fiche courte, en trois
  touches au plus :
  1. la catégorie (toit, façade, contour, hauteur, autre) ;
  2. un ou plusieurs problèmes précis (§8.2, pastilles à cocher) ;
  3. une note libre et, si vous voulez, des **photos** situées (§5).
  « Ce que je vois » (§8.1) s'y ajoute en section facultative.
- Au moment de la marque, le cas est **figé** (§9). Les précisions peuvent venir plus tard, sur place
  ou dans la liste de fin (§18.5).

### 18.4 Captures opportunistes

Rien de plus à faire sur le terrain : **chaque photo jointe à un cas est exploitée au maximum**, en
tâche de fond, sans bloquer la marche.
- **Tout bâtiment marqué** : le mur sur la photo et la **couleur de la façade** (§6). Au rejeu, si
  l'écart de teinte avec `sorties.couleurMurs` dépasse le seuil de `model/couleurMur.ts`, le problème
  `facade.couleur` est **proposé** sur le cas (pas coché).
- **Bâtiment de la parcelle de départ** : la fiche propose en plus « Relever cette façade » (§7), sur
  place ou depuis la liste de fin.
- **Pas de relevé sur les autres parcelles** : on y lit la couleur, pas le détail d'une façade qui
  n'est pas celle du client (vie privée et taille du fichier).

Ce qui en est tiré est rangé dans le cas (`lectures`, §19), comme une **proposition**. La Vue 3D de la
promenade ne change pas : la promenade note, elle ne corrige pas.

### 18.5 Fin de promenade

- « Cas notés (n) » ouvre la **liste des cas** : parcelle, adresse, catégorie et problèmes. Chaque cas
  s'y complète (« Modifier » rouvre sa fiche, qui ramène à la liste) ou s'y retire. Les façades à
  relever y attendent (« À relever »). Plus tard : un appui centre la Vue 3D sur le bâtiment.
- « Partager le fichier » construit le fichier de la promenade (§19) et ouvre le partage (§10).
- Après le partage : un message donne le nom du fichier. Plus tard : le nombre de cas par catégorie.

## 19. Le fichier de la promenade

- Nom : `audit-AAAA-MM-JJ-HHMM-<commune>.json`, un fichier par promenade, JSON lisible (UTF-8).
- Taille :
  - quelques dizaines de Ko par cas, surtout la grille LiDAR ;
  - une photo fait environ 300 Ko, soit environ 400 Ko en base64 ;
  - trente cas sans photo tiennent dans 2 Mo ; avec une photo chacun, environ 14 Mo ;
  - huit photos par cas pèsent environ 3,2 Mo, une élévation redressée environ 150 Ko. Le résumé de
    fin le dit avant le partage.
- **Version 2** du format, avec les photos multiples et les lectures (étape 5). Un fichier de version 1
  se relit tel quel : sa `photo` unique devient `photos[0]`.

```jsonc
{
  "format": "plan-audit", "version": 2,
  "promenade": {
    "debut": "2026-10-13T09:12:00Z", "fin": "2026-10-13T10:05:00Z",
    "commune": "Le Vésinet", "origine": { "lat": 48.9053, "lon": 2.1328 },
    "emprise": { "xMin": -40, "xMax": 620, "yMin": -55, "yMax": 180 },
    "code": { "version": "2.2.0", "commit": "abc1234" },
    "regles": { "lectureToits": 1, "lectureMurs": 2 }
  },
  "cas": [{
    /* le cas figé du §9 : id, statut, identite, entrees, sorties, attendu, historique */
    "constat": {
      "categorie": "toit", "problemes": ["toit.sens-faitage"], "note": "faîtage parallèle à la rue",
      "t": "…", "position": { "x": 12.4, "y": -3.1, "precisionM": 5 },
      "vu": { /* « Ce que je vois », facultatif (§8.1) */ },
      "photos": [{ "type": "image/jpeg", "base64": "…",
                   "prise": { "x": 12.4, "y": -3.1, "lat": 48.9, "lon": 2.13, "precisionM": 5,
                              "azimutDeg": 245, "sourceAzimut": "boussole",
                              "inclinaisonDeg": 4, "focale35": 26, "champDeg": 69.4 } }]
    },
    "lectures": {
      "facades": [{ "cote": 2, "couleur": "#c9b49a", "source": "automatique", "photo": 0, "pixels": 412 }],
      "releves": [{ "cote": 2, "photos": [0, 1], "coins": [/* par photo */], "releve": { /* ReleveFacade */ } }]
    }
  }]
}
```

## 20. Ce que la promenade ne fait pas

- Pas d'édition du plan, pas de terrasse, pas d'export autre que le fichier de promenade.
- Pas de correction sur place : elle note, elle ne corrige pas.
- Pas d'envoi automatique à un serveur : le partage passe par vous.

---

# Partie D — Le corpus

Les fichiers des deux processus suivent le même circuit. La promenade apporte surtout des cas
`a_corriger`. L'audit de parcelle apporte des vérités terrain complètes : chaque façade relevée, et
chaque proposition acceptée ou refusée.

## 21. Dans le dépôt

- Le fichier reçu est rangé tel quel dans `tests/fixtures/audit/`. Seuls `statut`, `attendu`,
  `historique` et, au besoin, `correction` sont modifiés ensuite.
- Statuts d'un cas :

| Statut | Sens |
|---|---|
| `a_corriger` | noté sur le terrain, pas encore traité |
| `corrige` | une règle a été corrigée ; l'attendu proposé attend votre validation |
| `valide` | vous avez validé le résultat (sur images, ou sur place) : il devient référence |
| `sans_suite` | pas une erreur du code (contour BD TOPO faux, LiDAR absent, arbre…), avec la raison |

Un cas d'audit de parcelle dont « Ce que je vois » a été accepté arrive directement `valide` pour ce
qui a été vu : c'est l'utilisateur qui l'a validé sur place.

## 22. Rejouer et corriger (Claude)

1. Script `.claude/skills/toits/scripts/audit.ts <fichier>` : rejoue chaque cas avec le code courant,
   puis compare aux `sorties` (ce que le code avait produit sur le terrain) et à l'`attendu`. Il écrit
   un tableau et les fichiers de `rendu.py` (cartes des hauteurs), comme `banc.ts`.
2. Diagnostic sur les cartes et en 3D (méthode du skill `toits`, §6).
3. Correction par **une règle générale**, jamais un cas codé. Elle est validée sur les villages du
   banc, AE 101 ne bouge pas (`identite.ts`), et elle est notée dans `CHANGELOG.md`.
4. Le cas passe à `corrige`, avec l'attendu proposé et `correction: { commit, regle }`. Images
   avant/après dans la PR.
5. Après votre accord : `valide`.

**Façades.** Le script relit les photos Panoramax référencées, quand il y en a. Les façades relevées
et les couleurs lues sur les photos de terrain sont comparées à ce que Plan calcule seul :
- la couleur Panoramax, ou celle du matériau BD TOPO ;
- les ouvertures automatiques (`facade/ouvertures.ts::ouverturesAutomatiques`) ;
- la hauteur des murs ;
- le toit.

## 23. Non-régression

- Test `tests/unit/facade/audit.test.ts`. Il charge tous les fichiers de `tests/fixtures/audit/` et
  rejoue chaque cas `valide`. Il compare au centimètre, comme AE 101 :
  - les corps à l'attendu ;
  - la couleur et la source des murs ;
  - pour les façades relevées : couleur, nombre et position des ouvertures.
- Les cas `a_corriger` et `corrige` sont listés en `test.todo` : ils ne bloquent pas la CI.
- Un attendu qui doit changer (une amélioration voulue) se change dans la PR qui le fait bouger, avec
  une ligne d'`historique`. Une PR qui le fait bouger sans le dire est rouge en CI.
- Les cas d'audit rejoignent le banc des villages dans le skill `toits` (§5 et §6 du skill).

---

## 24. Étapes

| Étape | Processus | Contenu | Vérifié par |
|---|---|---|---|
| 1 | promenade | Accès admin, aucune sauvegarde, GPS ou adresse de départ, caméra qui suit, lecture à chaque pas de 10 m, toits en calcul entier et matériau BD TOPO, marquage, fiche (catégorie, problèmes, note, photo), liste de fin, fichier, partage *(fait)* | tests unitaires, fumée Playwright (adresse de départ et GPS simulé), une promenade réelle |
| 2 | commun | Brouillon local et reprise (§10) ; pour la promenade : cases de 10 m et garde-fou de 600 bâtiments si la mesure le demande, menu Fichier réduit | GPS simulé sur un trajet de 500 m |
| 3 | corpus | Script `audit.ts`, test de non-régression, circuit écrit dans le skill `toits` *(fait, lot L19 ; corpus de départ reconstitué depuis des relevés réels)* | premier fichier réel rejoué |
| 4 | — | Plus tard : façade Panoramax à la demande sur un cas, note vocale | — |
| 5 | commun | Photo située complète (§5 : plusieurs photos, focale, inclinaison), mur sur la photo et couleur de la façade (§6), « Ce que je vois » (§8.1) ; pour la promenade, captures opportunistes et fichier version 2 | tests sur des photos générées dont la prise de vue est connue, une promenade réelle |
| 6 | commun | Relevé guidé par la position (§7), texture du matériau ; pour la promenade, depuis la fiche, sur la parcelle de départ | les images de test du relevé, une façade réelle |
| 7 | parcelle | Phase 1 et phase 3 : commande `audit.parcelle`, liste de contrôle, façade reconnue à la prise de vue, propositions issues des mesures en 3D, validation, bâtiments « vérifiés sur place » | une parcelle réelle, toutes façades ; Ctrl+Z ; rien de saisi à la main écrasé sans accord |
| 8 | parcelle | Phase 2 : batch Claude par le serveur de la plateforme, propositions avec indices, notification, accord de l'utilisateur ; journal des appels et tableau de bord de la consommation (§13.3) | une parcelle réelle analysée ; taux d'accord mesuré sur les validations ; coûts du tableau égaux à ceux de la console Anthropic |
| 9 | parcelle | Fichier pour le corpus (partage avec accord), import d'un audit dans un projet (§15) | un fichier rejoué sans réseau |

## 25. Questions (réponses de l'utilisateur)

1. **Plusieurs problèmes par cas** : la fiche permet d'en cocher plusieurs (« sens du faîtage » et
   « pignon manquant » sur la même maison). Réponse : oui.
2. **Essai sans sortir** : un départ sur une adresse au lieu du GPS (`&depart=…`), la position se
   déplaçant au doigt sur la Vue 3D. Réponse : oui, même accès admin (fait, §3).
3. **Validation d'une correction** : je montre dans la PR, pour chaque cas corrigé, l'image avant et
   l'image après (vue 3D et carte des hauteurs) ; vous répondez « validé » ou non. Réponse : oui.
4. **Photo à l'étape 1 ou 2** : réponse de l'utilisateur, dès l'étape 1 (fait : JPEG de 1 280 px au
   plus, 300 Ko au plus, `app/audit/photo.ts`).
5. **Couleur lue sur la photo** (§6.2) : lecture automatique depuis la prise de vue, ou toujours un
   toucher sur la façade pour la confirmer ? Proposition : automatique ; on demande un toucher
   seulement quand la lecture ne conclut pas ou que l'azimut vient du sens de la marche.
6. **Relevé sur place ou plus tard** (§7, §13, §18.4) : poser les coins et vérifier les ouvertures
   prend une à deux minutes par façade. Proposition : photos sur place, relevé quand on veut, depuis
   la liste.
7. **Import dans le projet** : réponse de l'utilisateur (13 octobre), l'audit de parcelle se fait
   **dans le projet** et **met à jour le modèle après proposition** (§14). L'import d'un fichier ne sert
   plus qu'au cas d'un audit fait ailleurs (§15).
8. **Ce que l'audit de parcelle couvre** (§12) : façades, toits, cheminées, terrasses, clôture côté rue
   et portail ; arbres plus tard ? Proposition : oui.
9. **Accès à l'audit de parcelle** : réponse de l'utilisateur (13 octobre), **ouvert à tout
   utilisateur**, parce qu'il met à jour le modèle après proposition ; la promenade reste réservée à
   l'administrateur.
10. **Mitoyens à 100 %** (§1) : l'exigence de la parcelle principale vaut-elle aussi pour les
    bâtiments mitoyens ? Votre réponse du 13 octobre : « probablement ». Proposition : oui. L'audit de
    parcelle les liste avec ce qui se voit depuis la rue et depuis la parcelle ; ce qui ne se voit pas
    reste au calcul.
11. **Partage de l'audit d'un utilisateur** (§15) : un utilisateur peut-il partager son audit pour
    améliorer les règles, et sous quelle forme ? Proposition : une case « Partager cet audit pour
    améliorer Plan », décochée par défaut, qui envoie le fichier au serveur de la plateforme ; sans
    elle, rien ne quitte l'appareil. **Réponse de l'utilisateur (13 octobre) : la case, mais cochée
    par défaut**, et révocable ; le fichier va sur le serveur de Plan, dans les données de l'admin
    (fait, lot L21, §15).
12. **Envoi des photos à l'analyse** (§13.2) : l'analyse par Claude envoie les photos de la maison au
    serveur de la plateforme, puis à l'API. Accord demandé à chaque lancement, ou une fois pour toutes
    dans le projet ? Proposition : une fois par projet, rappelé au lancement, révocable ; sans accord,
    l'audit se contente des mesures. **Réponse de l'utilisateur (13 octobre) : oui, la proposition.**
13. **Batch ou réponse immédiate** (§13.2) : le batch coûte deux fois moins cher mais rend en minutes,
    parfois en heures. Proposition : batch par défaut ; « Analyser tout de suite » au tarif normal si
    vous êtes sur place et voulez valider avant de partir.
