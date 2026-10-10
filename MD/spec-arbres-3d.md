# Arbres en 3D — spécification

**Version :** 1.0 — non publiée. Modules `model/arbre.ts`, `three/arbre3d.ts`.

## 1. Ce que fait la fonction

Un arbre du plan (fonction `arbre`, un cercle le plus souvent) est dessiné en 3D comme un arbre et
non plus comme une sphère sur un cylindre : un tronc conique, des branches, un **houppier en
lobes** dont la forme suit le **port** de l'arbre, coloré en **deux tons** (dessus clair, dessous
sombre), et une **essence** : un caduc est nu de novembre à mars, à la date de l'étude
d'ensoleillement. C'est pour l'ombre portée sur la terrasse qu'on dessine l'arbre, et cette ombre
change avec la saison.

Rien n'est chargé : pas d'image, pas de modèle. L'export GLB (et donc la réalité augmentée) emporte
l'arbre tel qu'il est vu.

### 1.1 Ce qui a été décidé

- **Procédural et déterministe** : le houppier est tiré de la clé de l'objet (`graineDe`, comme
  l'apparence des maisons du voisinage). Le même arbre a le même houppier à chaque ouverture, et
  deux arbres voisins diffèrent. L'empreinte GLB est donc stable.
- **Le diamètre annoncé est respecté** : les lobes tiennent dans le diamètre du feuillage réglé
  dans l'inspecteur, qui reste ce que le plan montre et ce que l'ombre suit.
- **Proposé, pas imposé** : un arbre importé reçoit un port et une essence d'après la nature de
  la zone BD TOPO ; l'inspecteur les change.
- **Ni panneaux croisés, ni modèles glTF** : les premiers demandent des images et donnent une ombre
  plate ; les seconds pèsent trop pour l'export et l'AR (voir la proposition dans le CHANGELOG).

## 2. Le modèle (`model/arbre.ts`)

| Champ | Valeurs | Défaut | Absent d'un ancien fichier |
|---|---|---|---|
| `portArbre` | `rond`, `etale`, `colonnaire`, `conique`, `parasol` | `rond` | lu comme `rond` |
| `essenceArbre` | `caduc`, `persistant` | `caduc` | lu comme `caduc` |

`diametreArbre`, `couleurArbre`, `textureArbre` et la hauteur de l'objet (le tronc) sont inchangés.
Sérialisés seulement quand ils sont posés (`io/serialisation.ts`) : un plan sans arbre réglé garde
exactement sa forme.

**Proportions par port** (hauteur du houppier pour un diamètre de 1, nombre de lobes, étalement) :

| Port | Hauteur | Lobes | Étalement | Aplatissement des satellites |
|---|---|---|---|---|
| rond | 1,0 | 7 | 0,32 | 1 |
| étalé | 0,6 | 9 | 0,42 | 0,65 |
| colonnaire | 2,6 | 6 | 0,12 | 1 |
| conique | 2,2 | 1 (un cône) | — | — |
| parasol | 0,45 | 8 | 0,40 | 0,5 |

`houppier(port, diametre, graine)` rend un lobe central (aussi haut que le houppier) et des lobes
satellites répartis autour et en hauteur, enfoncés dans le central ; chaque satellite reste dans
le diamètre (`dist ≤ r − rayon`). Une branche part du sommet du tronc vers chaque satellite.

`arbreNu(essence, dateStr)` : vrai pour un caduc quand le mois est de novembre à mars ; une date
illisible laisse l'arbre en feuilles.

`portParNature(nature)` : conifères → conique persistant ; verger → étalé ; haie → colonnaire
persistant ; peupleraie → colonnaire caduc ; le reste → rond caduc.

## 3. Le rendu (`three/arbre3d.ts`)

- **Tronc** : cylindre conique (rayon au pied = rayon du cercle du plan, 70 % en haut), couleur
  bois `#6b5236`. **Branches** : cylindres fins orientés du sommet du tronc vers chaque satellite.
- **Lobes** : une sphère (14 × 10) mise à l'échelle de l'ellipsoïde, déformée par un bruit radial
  de ± 7 % reproductible, colorée sommet par sommet : la couleur du feuillage × 1,22 au zénith de
  la normale, × 0,68 au nadir (`tonDuSommet`). Un conique est un cône (16 côtés). La texture
  Poly Haven, si « Texture » est cochée, se pose par-dessus les tons.
- **Saison** : le groupe `arbre-feuillage` est masqué si `arbreNu` ; `actualiserSaison(scene, date)`
  le rejoue à chaque changement de date (`three/soleilVue3d.ts::appliquer`), sans reconstruire la
  scène. L'export GLB n'emporte que le visible : un caduc exporté en janvier part nu.
- **Ombres** : les volumes sont pleins, les ombres sont celles du réglage en place.
- **Relief** : l'arbre est posé dans un groupe au sol en son centre, comme les autres objets.

Noms des mailles : `arbre` (groupe, `userData.essence`), `arbre-tronc`, `arbre-branche`,
`arbre-feuillage` (groupe), `arbre-lobe`, `arbre-feuilles` (instanciée, §3.1).

### 3.1 Les feuilles, de près (`three/feuilles.ts`)

De loin, les lobes suffisent ; de près, un houppier lisse ressemble à une boule. Sur la surface des
lobes, `feuillesDuHouppier` (`model/arbre.ts`) tire de petites feuilles :

- **Placement** : sur chaque lobe au prorata de son aire (formule de Thomsen), sans celles qui
  tomberaient dans un autre lobe ; un peu écartées vers l'extérieur. Sur un conique, des
  **aiguilles** sur le flanc du cône. Une suite de tirage à part de celle du houppier : changer le
  nombre de feuilles ne déplace pas les lobes.
- **Nombre et taille** : 14 feuilles par m² de houppier, **900 au plus** par arbre ; leur longueur
  couvre le houppier au tiers (entre 8 et 40 cm), une aiguille 1,4 fois plus longue et bien plus
  fine.
- **Forme** : quatre sommets, la pointe levée de 0,6 rad vers l'extérieur (`LEVEE_FEUILLE`) ; la
  normale d'éclairage reste celle de la surface du houppier, pour qu'une feuille levée s'éclaire
  comme le houppier sous elle au lieu de virer au noir. Une rotation et une inclinaison (± 0,2 rad)
  propres à chaque feuille, une taille de 0,75 à 1,25, une nuance de 0,9 à 1,15 ; la moitié du ton
  deux tons de sa place.
- **Rendu** : **une seule maille instanciée par arbre** (`InstancedMesh`), une matrice et une
  couleur par feuille, dans le groupe du feuillage : elles tombent avec lui en hiver. Jamais
  écartée du champ par Three (sa boîte ne serait qu'une feuille à l'origine).
- **De près seulement** : `actualiserFeuillesProches`, à chaque image, les montre quand la caméra
  est à moins de **30 m** de l'arbre et les cache au-delà de 33 m (sans cette marge, elles
  clignoteraient à la limite).
- **Pas d'ombre** : l'ombre reste celle des lobes, la même quelle que soit la place de la caméra.

**L'export.** `GLTFExporter` de three r128 ne connaît pas l'instanciation : il écrirait une feuille
par arbre. `cuireFeuillesPourExport` (appelé par `three/exportGlb.ts`, comme le masquage des
gabarits) remplace, le temps de l'export, chaque maille instanciée par une maille ordinaire
`arbre-feuilles-cuites` qui contient toutes ses feuilles, avec une couleur par sommet, puis remet
tout. Seuls les arbres en feuilles (pas un caduc l'hiver) à moins de **40 m** du centre de la scène
sont cuits, **12 000 feuilles au plus** en tout, les plus proches d'abord : un voisinage de soixante
arbres ne doit pas faire un fichier de dix mégaoctets. La visionneuse et la réalité augmentée
montrent donc les feuilles. Les données des feuilles vivent hors de `userData`, que l'exporteur
écrit dans le fichier (`extras`) : elles y faisaient 1,5 Mo de JSON au premier essai.

Coût : moins de 2 000 triangles de feuilles par arbre, en une passe de dessin ; à l'export, environ
140 Ko par arbre de 800 feuilles.

Coût : environ 7 lobes × 14 × 10 segments, soit moins de 2 000 triangles par arbre.

## 4. L'interface

Section **Arbre** de l'inspecteur (`ui/champs/objet.ts`) : Diamètre du feuillage, **Port**,
**Essence**, Couleur du feuillage, Texture du feuillage. Effet `scene3d`.

## 5. Vérifié

- `tests/unit/model/arbre.test.ts` : défauts, nature BD TOPO, saison, proportions par port,
  reproductibilité, lobes dans le diamètre, branches.
- `tests/unit/three/arbre3d.test.ts` : structure des mailles avec un THREE minimal, cône du
  conifère, nudité en janvier, reproductibilité, texture seulement avec les textures,
  `actualiserSaison`, tons.
- `tests/unit/model/arbre.test.ts` (feuilles) : reproductibles, plafonnées, sur la surface d'un lobe
  et hors des autres, aiguilles sur le cône, taille qui suit le houppier.
- `tests/unit/three/feuilles.test.ts` : gabarit, matrices orthonormées, couleur, cuisson ; la maille
  instanciée (cachée, sans ombre, jamais écartée du champ), l'affichage de près avec sa marge, la
  cuisson à l'export et sa remise, un caduc nu exporté sans feuilles, rien dans `userData`.
- Témoins : `cadastre-objets.json` (les arbres estimés portent port et essence) et
  `glb-structure.json` (les arbres de la démonstration ont plus de mailles), recapturés et notés
  dans `EMPREINTES.md`. La fumée 24 fixe la date au 21 juin pour que le témoin ne dépende pas du
  jour où elle se joue.
