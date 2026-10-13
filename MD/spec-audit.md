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
  - le toit LiDAR, par la chaîne de l'import (`app/toitsLidar.ts::toitsDepuisLidar`), en **calcul
    entier**, celui du projet et des mitoyens (coupes, grille gardée), quatre lectures à la fois ;
  - la couleur des murs, par le matériau BD TOPO ;
  - la couleur du toit, sur l'orthophoto.
- La lecture des toits en tâche de fond (`app/toitsFond.ts`) n'est pas utilisée : chaque processus
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
  - **la focale**, lue dans l'EXIF *avant* la réduction, qui l'efface (`facade/exif.ts::focale35mm`,
    `champDepuisFocale35`). À défaut, le champ par défaut du relevé : 67° sur le grand côté
    (`facade/cadrage.ts::CHAMP_GRAND_COTE_DEFAUT`) ;
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
  prise dit « une photo suffit » ou « 3 photos, de gauche à droite » (`facade/cadrage.ts::planDePrise`).
- **Coins proposés** d'après la prise de vue (`facade/analyse.ts::coinsProposes`, la distance venant du
  GPS). Ils s'ajustent au doigt, avec la loupe.
- **Plusieurs photos du même mur** :
  - de gauche à droite, assemblées en mosaïque quand le recul manque
    (`facade/mosaique.ts::analyserMosaique`, `spec-releve-facade.md` §6.1) ;
  - de face et de biais, pour retrouver une ouverture cachée par un arbre ou une voiture sur l'une
    d'elles ;
  - un **gros plan du parement**, à un ou deux mètres, pour la texture du matériau.

**Ce qui est calculé**, dans le navigateur, sans serveur :

| Donnée | Comment | Code |
|---|---|---|
| hauteur à l'égout, mesurée | les quatre coins et la focale | `facade/analyse.ts::mesurerHauteur` |
| élévation redressée, texture du mur | homographie, mosaïque si plusieurs photos | `analyserReleve`, `analyserMosaique` |
| ouvertures réelles (type, x, y, l, h) | détection, puis correction au doigt | `facade/detection.ts::detecterOuvertures` |
| couleur du mur | médiane de ce qui n'est pas une ouverture | `teinteMediane`, `couleurMurDepuisPixels` |
| matériau du parement | choisi par vous (pierre, meulière, brique, enduit, béton, bois) ; plus tard proposé par Claude analyste | `three/textureMur.ts` |
| **texture du matériau** | le gros plan, découpé au centre en tuile sans couture ; l'échelle vient du matériau (`TAILLE_M` : une brique, une pierre) | nouveau |
| toit vu de la façade | silhouette au-dessus de l'égout, triangle du pignon | `facade/toit.ts` |
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
- Les **mitoyens** apparaissent dans la liste, avec ce qui se voit depuis la rue et depuis la parcelle :
  leur toit, leurs cheminées, la façade sur la limite. Le reste est « inaccessible ».
- Un compteur dit ce qui reste (« 7 façades sur 9, toit vu, clôture à faire »).
- Toucher une façade dans la Vue 3D ouvre sa ligne.

### 12.2 Photographier : Plan sait devant quelle façade vous êtes

1. Vous marchez autour de la maison, l'écran de prise ouvert. **La façade que vous avez devant vous
   est reconnue en direct** (§6.1), surlignée dans la Vue 3D et nommée : « Vous êtes devant la façade
   sud, 9,2 m — 0 photo ».
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

### 13.2 Le batch Claude : les propositions

Ce qui demande de **regarder** (reconnaître, comparer, nommer) est confié à Claude analyste,
`spec-regles-toits.md` §14, par l'**API Batch** :

| Ce que Claude reçoit | Ce qu'il en tire |
|---|---|
| les photos de chaque façade, réduites, avec leur prise de vue | type et détails des ouvertures (volets, coffre, balcon, forme), ouvertures manquées ou en trop par la détection, matériau du parement |
| le **rendu du modèle actuel** depuis la même prise de vue | les écarts entre le modèle et la photo, façade par façade |
| les photos du toit, l'orthophoto, la carte des hauteurs LiDAR et ses indices | forme, sens du faîtage, bouts, lucarnes, cheminées, toiture-terrasse |
| vos observations « Ce que je vois » | il ne les contredit pas ; il les complète et signale un désaccord |
| les mesures du §13.1 | il ne les recalcule pas ; il s'en sert comme indices |
| les photos dont le **calage** ou la **détection** n'est pas sûr (coins non trouvés, façade mal vue, ouvertures douteuses) | des coins et des ouvertures **proposés**, que Plan recale sur l'image avant de s'en servir (`spec-facades-calage-detection.md` §12 bis) |

- **Réponse fermée** : sortie structurée (schéma JSON), vocabulaire de `spec-regles-toits.md` §2 et §3,
  `indetermine` partout. **Trois passes et un vote**, contrôle croisé avec les indices LiDAR, escalade
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
- **Où** : le serveur de la plateforme envoie le batch ; la clé d'API ne quitte jamais le serveur. Les
  photos partent avec l'accord de l'utilisateur, donné au lancement de l'analyse (question 12). Elles
  ne servent qu'à cette analyse : le partage pour le corpus est un autre accord (§15).
- **Sans réseau, ou sans accord** : seules les mesures du §13.1 deviennent des propositions. L'audit
  marche, avec moins de détails.

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
| `usage` | `analyse` (phase 2), `escalade`, `renfort` (calage et détection), `immediat` |
| `modele` | l'identifiant exact du modèle appelé (Claude Haiku 5.5, Sonnet 5.5 en escalade…) |
| `batch` | vrai si l'appel est passé par l'API Batch |
| `passe` | 1, 2 ou 3 (le vote) |
| `tokens` | entrée, écriture du cache, lecture du cache, sortie, tels que renvoyés par l'API |
| `images` | nombre d'images envoyées |
| `cout` | le coût en dollars, calculé avec la **table des tarifs** en vigueur à cette date |
| `statut` | réussi, échoué, expiré, refusé par le plafond |

**La table des tarifs** (`claude/tarifs.json`) est datée. Chaque modèle y a ses
prix par million de tokens (entrée, sortie, écriture et lecture du cache), avec la remise Batch. Un
changement de prix ajoute une ligne datée et ne réécrit pas le passé : un coût d'hier reste celui
d'hier. Les prix sont vérifiés sur la page officielle d'Anthropic à chaque modification, et la date de
vérification est notée.

**L'écran** : **Admin › Consommation Claude** (`?admin&ecran=consommation`), administrateur seulement,
lu par `GET admin/consommation` (session admin, filtres en paramètres). Il règle aussi les tarifs et
les plafonds (`GET|PUT admin/claude/tarifs`, `GET|PUT admin/claude/plafonds`, session admin, en-tête
`X-Plan-Admin: 1` exigé sur toute écriture, comme les autres routes de `admin.php`).

| Vue | Ce qu'elle montre |
|---|---|
| **Dans le temps** | tokens et coût par jour, semaine ou mois, en aires empilées **par modèle** ; bascule tokens ou dollars |
| **Par parcelle** | une ligne par parcelle : adresse, IDU, nombre d'audits, tokens par modèle, part du cache, coût total, coût par façade, date du dernier audit ; tri sur chaque colonne |
| **Par usage** | répartition entre analyse, escalade, renfort et immédiat, et part du Batch |
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

## 15. Le fichier, pour le corpus

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
    Plan », décoché par défaut). Ses photos sont celles de sa maison : rien ne part sans son accord
    (question 11).
- Les validations et les refus mesurent le **taux d'accord** de Claude par attribut
  (`spec-regles-toits.md` §14.2) et la précision du détecteur d'ouvertures
  (`spec-facades-calage-detection.md` §14).
- **Fichier › Importer un audit de parcelle** applique un fichier à un projet de la même parcelle
  (même IDU) : il reprend à la phase 3. C'est le cas d'un audit fait par l'administrateur pour un
  client.

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
  position est relu (`app/actualisationIgn.ts::construireVoisinage`, option `centre`) ;
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
  - six photos par cas pèsent environ 2,4 Mo, une élévation redressée environ 150 Ko. Le résumé de
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
| 3 | corpus | Script `audit.ts`, test de non-régression, circuit écrit dans le skill `toits` | premier fichier réel rejoué |
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
    elle, rien ne quitte l'appareil.
12. **Envoi des photos à l'analyse** (§13.2) : l'analyse par Claude envoie les photos de la maison au
    serveur de la plateforme, puis à l'API. Accord demandé à chaque lancement, ou une fois pour toutes
    dans le projet ? Proposition : une fois par projet, rappelé au lancement, révocable ; sans accord,
    l'audit se contente des mesures.
13. **Batch ou réponse immédiate** (§13.2) : le batch coûte deux fois moins cher mais rend en minutes,
    parfois en heures. Proposition : batch par défaut ; « Analyser tout de suite » au tarif normal si
    vous êtes sur place et voulez valider avant de partir.
