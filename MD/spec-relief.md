# Relief du terrain — spécification

**Version :** 0.1 — proposée, non implémentée (schéma de projet 4)
**Statut :** spécification de référence : **le standard pour lire le relief à l'IGN, le ranger dans
le projet et s'en servir**
**Compagnons :** [`spec-toit-ign.md`](spec-toit-ign.md) (§9 : MNS LiDAR),
[`spec_import_cadastre_et_json.md`](spec_import_cadastre_et_json.md) (calage du plan),
[`RELEASE.md`](RELEASE.md) (§3 : schéma ; §2 : version majeure)

Les chiffres de ce document (formats, limites, temps, couverture) ont été vérifiés contre
`data.geopf.fr` le 6 octobre 2026. Ce qui n'a pas pu l'être est dit tel quel (§2.4).

---

## 1. Ce que fait la fonction

Aujourd'hui, le terrain de Plan est plat : la Vue 3D pose tout sur un plan horizontal
(`three/scene.ts`), la coupe d'une piscine trace le terrain naturel à `z = 0`
(`export/dossierPiscine.ts`), chaque poteau de pergola part de `z = 0` (`engine/pergola.ts`), et la
hauteur d'un plot est la même pour toute la terrasse (`engine/hauteurs.ts`).

Désormais, **un plan calé par le cadastre peut recevoir le relief de sa parcelle** :

1. une **grille d'altitudes** du sol nu, lue à l'IGN en une requête, couvre la parcelle et dix mètres
   d'abords ; elle vient du **LiDAR HD** (maille 50 cm) là où il est publié, du **RGE ALTI** (maille
   1 m) ailleurs ;
2. la grille est **enregistrée dans le projet**, avec sa source, sa date et sa précision ; elle n'est
   jamais redemandée au service sans qu'on le demande ;
3. le plan en tire la **pente et l'orientation** de la parcelle, le **dénivelé** entre deux points,
   des **courbes de niveau**, un **profil de coupe** (pièce DP3) et un **sol en relief** dans la
   Vue 3D ;
4. dans une version suivante (§6), les **hauteurs de chaque plot, vis et poteau** suivent le sol,
   et la nomenclature avec elles.

Le relief est une **mesure avouée** : l'inspecteur dit d'où il vient et à combien près. Pour régler
une terrasse au centimètre, il faut un relevé sur place ; le relief de l'IGN donne la tendance,
pas la cote d'exécution.

### 1.1 Ce qui a été décidé avant d'écrire une ligne

| Question | Décision | Pourquoi |
|---|---|---|
| D'où vient le relief ? | **WMS raster de la Géoplateforme**, en nombres bruts (`image/x-bil;bits=32`) : une requête, une grille | Vérifié : une requête de 100 × 70 m rend 28 ko en 0,7 s à 1 m, 112 ko à 50 cm ; CORS ouvert. Le service d'altimétrie point par point accepte 200 points par requête en GET et répond 500 en POST : une grille lui demanderait dix requêtes |
| Quel calque ? | **LiDAR HD MNT** à 50 cm si l'index des dalles couvre la parcelle, sinon **RGE ALTI** à 1 m par `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS` | Le calque évident `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES` est servi depuis une pyramide en degrés dont le dernier niveau vaut 3 à 5 m : il n'est pas à 1 m (§2.1) |
| Quand ? | **À la demande** (« Lire le relief »), jamais à l'import ni à l'actualisation IGN | Le relief change des nombres (§6) : il n'arrive pas dans un projet sans qu'on l'ait voulu. Un plan d'avant ne change pas |
| Rechargé à l'ouverture ? | **Non.** La grille vit dans le projet. « Actualiser le relief » la remplace, et c'est une modification annulable | L'IGN met ses données à jour ; le cache du service ne vaut que trois semaines. Sans grille enregistrée, un nombre produit hier pourrait changer demain |
| Où est-elle rangée ? | Dans la **parcelle du projet** (`parcelle.relief`), comme `cadastre` et `ortho` | Une parcelle, un relief ; la parcelle voisine n'en a pas |
| Quel zéro ? | **`zRef`**, altitude NGF du sol au point de référence de la terrasse (§3.3), fixée à la lecture | Tout Plan compte en mètres depuis le sol de la terrasse. `zRef` traduit ce zéro en altitude vraie une fois pour toutes |
| La précision ? | Lue dans le **masque de source** du RGE ALTI (`source_fra`, WFS) : origine, résolution, « Emq < 30 cm »… ; pour le LiDAR HD, la date de la dalle | Vérifié : le masque est un calque vecteur interrogeable par point, ses textes sont prêts à afficher |
| Les quantités ? | **Pas dans cette version.** V1 montre ; V2 (§6) compte, et c'est une version majeure | Règle du projet : une quantité qui bouge est un événement de version majeure, jamais une correction discrète |
| Une bibliothèque ? | **Non** : le BIL se lit avec un `Float32Array`, les courbes par marching squares, la pente par moindres carrés, en TypeScript | Trois dépendances dans le projet ; rien ici ne le justifie |

### 1.2 Ce que cette version ne fait pas

- Pas de lecture du **MNS** ni du **MNH** LiDAR (hauteur réelle des arbres et des toits voisins) :
  même mécanisme, suite naturelle (§10).
- Pas de **nuage de points** brut.
- **Aucune quantité ne change** : plots, vis, poteaux, terrassement gardent leurs règles (§6).
- Pas de **terrain remblayé** ni de muret : la grille est le sol au moment du relevé IGN.
- Sous les **bâtiments**, le sol est interpolé par l'IGN : approximatif là où l'on construit souvent.

---

## 2. Ce qu'on lit à l'IGN

Tout vient de `https://data.geopf.fr`, déjà autorisé par les capacités `cadastre` et `ortho`
(`plateforme/capacites.ts`). Une capacité nouvelle `relief` (`plan.relief`, origine
`data.geopf.fr`) porte les commandes de §8.

### 2.1 La grille : WMS raster, format brut

Service `https://data.geopf.fr/wms-r/wms`, `GetMap` version 1.3.0, `FORMAT=image/x-bil;bits=32` :
la réponse est `WIDTH × HEIGHT` flottants 32 bits petit-boutiste, sans en-tête, ligne par ligne du
nord au sud, colonne par colonne d'ouest en est. Un `Float32Array` sur le `ArrayBuffer` suffit.

| Calque | Maille native | Sans donnée | Emprise |
|---|---|---|---|
| `IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93` | 50 cm | `-9999` | métropole ; outre-mer par calque frère (`…RGR92UTM40S` pour la Réunion) |
| `RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS` | 1 m | `-99999` | métropole ; `GLP`, `MTQ`, `GUF`, `REU`, `MYT`, `SPM` par calque frère |
| `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES` | **3 à 5 m servis** | `-99999` | **ne pas utiliser** |

- L'emprise se demande en **`CRS=CRS:84`** (longitude, latitude), ce que `projecteurLocal`
  (`geo/projection.ts`) sait produire depuis les mètres du plan : pas de Lambert dans Plan.
  `EPSG:4326` (latitude, longitude) et `EPSG:3857` rendent la même grille.
- Le service rééchantillonne à la taille demandée : on demande exactement **une colonne par
  cellule** de la grille voulue (§3.1), jamais plus fin que la maille native.
- Limite du service : 5 010 pixels de côté. Le plafond de §3.1 reste très en dessous.
- Altitudes **NGF-IGN69** en métropole (IGN78 en Corse, systèmes locaux outre-mer), en mètres.
- Le GeoTIFF flottant (`image/geotiff`, non compressé) marche aussi ; le BIL s'en passe.

### 2.2 La couverture LiDAR HD : WFS

Service `https://data.geopf.fr/wfs/ows`, calque `IGNF_LIDAR-HD_METADONNEE:metadata`, une entité par
dalle de 1 km² (507 791 dalles au 6 octobre 2026), interrogeable par `BBOX` en `EPSG:2154` ou
`CRS:84`. Champs utiles : `date_debut_acquisition`, `date_fin_acquisition`, `date_edition`,
`procede_classement`, `url_npl` (le nuage COPC), `url_mnt`.

- `RESULTTYPE=hits` sur l'emprise de la grille : **au moins une dalle, et aucun `-9999` sur la
  parcelle** ⇒ source `lidar-hd`. Sinon `rge-alti`.
- Les deux conditions sont nécessaires : au centre de la Bretagne (Lambert 260000, 6800000), zéro
  dalle et le MNT LiDAR répond `-9999` ; ailleurs les dix points testés, de Paris aux Pyrénées,
  sont couverts.

### 2.3 La précision : le masque de source du RGE ALTI

Calque WFS `ELEVATIONGRIDCOVERAGE.HIGHRES.QUALITY:source_fra`, polygones avec `origine`,
`resolution`, `precision`, `code`. Interrogé par `BBOX` au point de référence (§3.3). Classes
rencontrées :

| `origine` | `resolution` | `precision` |
|---|---|---|
| Laser topo et laser topo/bathy | 1 m | Emq < 30 cm |
| Laser topo, laser bathy et sondeur multifaisceaux | 5 m | Emq < 50 cm |
| Laser topo | 1 m | Emq < 80 cm |
| Corrélation d'images | 5 m | Emq < 1 m |
| Corrélation d'images | 10 m | Emq < 1,20 m |
| Radar | 10 m | 1 m < Emq < 7 m |
| BD ALTI | — | 2 m < Emq < 8 m |

Pour une grille `lidar-hd`, la précision affichée est « LiDAR HD, de l'ordre de 10 cm (IGN) » avec
la date d'acquisition de la dalle : c'est la **spécification** de l'IGN, pas une mesure faite ici.

### 2.4 Ce qui a été vérifié, et ce qui ne l'a pas été

- **Vérifié** : les formats, les valeurs « sans donnée », les mailles réellement servies (comptées
  sur la grille), les temps, CORS, la couverture sur dix points, les champs des deux calques WFS,
  les limites du service point par point. À Lyon, sur la même emprise, le RGE ALTI 1 m et le LiDAR
  50 cm s'écartent de 14 cm en moyenne, 85 cm au pire.
- **Non vérifié** : la précision verticale du LiDAR HD (§2.3), l'interpolation faite par le service
  quand on rééchantillonne (plus proche voisin ou bilinéaire : la grille est demandée à la maille
  native, la question ne se pose pas), l'outre-mer.
- **Fiabilité** : pendant les essais, environ une requête sur huit a été coupée par le service
  (`connection reset`). Le client réessaie **une fois**, comme `fetchJSONReseau` (`geo/apiIgn.ts`),
  avec le même délai de 8 s.
- **Non retenu** : `elevationLine` du service d'altimétrie rend un profil le long d'une polyligne,
  jusqu'à 5 000 échantillons en 2,6 s. C'est la coupe DP3 toute faite, mais elle ne serait pas
  reproductible : le profil se calcule dans la grille enregistrée (§5.4).

---

## 3. Le modèle : la grille

### 3.1 L'emprise et le pas

- **Emprise** : le rectangle englobant de la parcelle du projet (`parcelleDuProjet`,
  `model/fonctions.ts`), élargi de **10 m** de chaque côté. Les abords servent au profil, aux
  courbes et au sol 3D, qui dépassent la clôture.
- **Pas** : la maille native de la source (0,5 m ou 1 m), **doublé tant que la grille dépasse
  40 000 cellules** (0,5 → 1 → 2 → 5 m). Une parcelle de 30 × 20 m avec ses abords tient en
  100 × 80 = 8 000 cellules à 50 cm ; un terrain de 2 ha passe à 1 m. Au-delà de 5 m, la lecture
  est refusée : « parcelle trop grande pour le relief ».
- **Alignement** : la grille est posée dans le repère du plan (mètres, même repère que `pts`),
  pas sur le Lambert : le centre de la cellule `(i, j)` est en
  `(x0 + i · pas, y0 − j · pas)`, `(x0, y0)` étant le coin nord-ouest. C'est le service qui
  rééchantillonne, une fois, à la lecture.

### 3.2 Les valeurs

- Altitudes en mètres NGF, **arrondies au centimètre** à l'enregistrement : au-delà, c'est du bruit,
  et l'empreinte du projet n'a pas à dépendre du septième chiffre d'un flottant.
- « Sans donnée » (`-9999`, `-99999`) devient `null`. Une cellule `null` **sur la parcelle** refuse
  la source (§2.2) ; sur les abords (mer, frontière), elle reste `null` et les calculs l'évitent.
- Lecture d'une altitude en un point `z(x, y)` : **bilinéaire** entre les quatre cellules
  voisines ; hors de l'emprise ou sur un `null`, `null`. Toute la suite (§5, §6) passe par cette
  seule fonction, `model/relief.ts`.

### 3.3 Le zéro du plan : `zRef`

Plan compte les hauteurs depuis le sol de la terrasse. Le relief doit donc dire **où est ce sol** :

- `zRef` = `z(pRef)`, où `pRef` est le centroïde de `terrasseOuPremiere` (`model/fonctions.ts`)
  s'il y a une terrasse, sinon le centroïde de la parcelle ;
- fixé **à la lecture**, enregistré, jamais recalculé tant que la grille vit. Déplacer la terrasse
  ne déplace pas le zéro : les nombres restent reproductibles. « Actualiser le relief » le recalcule
  avec la grille ;
- tout ce que Plan montre est relatif : `zLocal(x, y) = z(x, y) − zRef`. L'inspecteur montre aussi
  l'altitude vraie, parce que le PLU et la DP en parlent (« hauteur mesurée depuis le terrain
  naturel »).

---

## 4. Les règles, dans l'ordre

1. **Pas de calage, pas de relief.** « Lire le relief » exige `cadastre.origineLat` sur la parcelle
   (`referenceGeoPlan(...).exact`, `render/ortho.ts`). Sinon la commande est grisée : « Plan non
   calé par le cadastre ».
2. **Capacité.** Sans `plan.relief`, les trois commandes de §8 sont grisées avec la raison, et la
   page ne parle pas à `data.geopf.fr` pour cela. Un projet qui porte déjà un relief le garde et
   l'affiche : la capacité porte sur la lecture, pas sur la donnée.
3. **Source.** LiDAR HD si §2.2 le permet, sinon RGE ALTI ; si le RGE ALTI rend `null` sur la
   parcelle : « Pas de relief IGN pour cette parcelle », rien n'est écrit.
4. **Une lecture est une modification du projet** : annulable, « projet modifié », refusée en
   lecture seule. Elle écrit `parcelle.relief` entier, d'un bloc.
5. **Rien ne relit le service tout seul** : ni l'ouverture, ni l'import, ni `projet.actualiserIgn`
   (qui actualise les bâtiments, pas le sol). Seul « Actualiser le relief » le fait, et il remplace
   la grille, `zRef` compris.
6. **« Supprimer le relief »** retire `parcelle.relief` ; le plan redevient plat, ses nombres
   redeviennent ceux d'avant.
7. **Les réglages d'affichage** (courbes, sol 3D, équidistance) sont des préférences d'affichage au
   sens de `CLAUDE.md` : `sale: false`, pas de Ctrl+Z, permises en lecture seule, rangées dans
   `relief.affichage` pour être retrouvées à la réouverture.
8. **La grille ne porte que le sol.** Un objet du plan n'enregistre jamais une altitude copiée de
   la grille ; il la lit par `z(x, y)` quand il en a besoin. Une seule vérité, un seul endroit.

---

## 5. Ce qu'on en tire dans cette version

### 5.1 Pente et dénivelé (inspecteur)

Sur les cellules **à l'intérieur de la parcelle** : un plan ajusté par moindres carrés donne la
**pente moyenne** (en %) et son **orientation** (point cardinal vers lequel elle descend) ; le
dénivelé est `max − min`. Affichés dans la section « Relief » de la parcelle (§8), en lecture.
Un terrain à moins de 1 % se dit « sensiblement plat ».

### 5.2 Dénivelé entre deux points

L'outil de mesure existant, quand un relief existe, ajoute à sa distance le **dénivelé** entre ses
deux extrémités (`z(b) − z(a)`, signé) et la pente du segment. Affichage seulement.

### 5.3 Courbes de niveau sur le plan

- Calculées dans la grille par **marching squares** (`geometry/isolignes.ts`), lissées par la
  bilinéaire de §3.2, coupées à l'emprise de la grille.
- **Équidistance** choisie d'après le dénivelé de la parcelle : 10 cm sous 1 m, 25 cm sous 3 m,
  50 cm sous 10 m, 1 m au-delà ; réglable (préférence d'affichage). Une courbe sur quatre est
  maîtresse, étiquetée en altitude NGF.
- Dessinées **sous** la parcelle (couche `terrain` de `COUCHES_SOL`), trait fin, couleur nouvelle
  `relief.courbe` dans `styles/jetons.ts` puis dans les modèles de palette.
- **Présentes dans `plan.svg` et le plan de masse (DP2)** quand elles sont affichées : un plan de
  masse montre le relief. Les témoins de `tests/fixtures/golden/` n'ont pas de relief : leurs
  empreintes ne bougent pas. Le dire dans `EMPREINTES.md` quand même.

### 5.4 Le profil de coupe

- Un **profil** le long d'une ligne : l'utilisateur la trace (deux clics, comme une mesure), ou
  prend celle que propose Plan, dans le sens de la plus grande pente passant par `pRef`.
- Échantillonné dans la grille tous les `pas / 2`, par `z(x, y)` : reproductible, sans réseau.
- Montré dans un panneau de résultats « Profil » (`zones/resultats/`), à côté de « Coupe » : sol en
  trait fort, terrasse ou piscine en coupe à leur hauteur, altitudes NGF et locales aux deux bouts.
- **Pièce DP3** : le dossier piscine la produit déjà avec un terrain plat (`pageCoupe`,
  `export/dossierPiscine.ts`). Avec un relief, le trait du terrain naturel suit le profil de la
  grille le long de l'axe de la coupe AA, et la page le dit : « terrain naturel : IGN, LiDAR HD,
  2021 ». Le dossier terrasses et abris (`export/dossierMairie.ts`) **gagne une pièce DP3** sur le
  même modèle, seulement quand un relief existe : un dossier d'aujourd'hui garde ses pages.

### 5.5 Le sol en relief dans la Vue 3D

- Le plan vert de `monterScene` (`three/scene.ts`) devient une **`PlaneGeometry` subdivisée à la
  grille**, chaque sommet à `zLocal` ; hors de l'emprise, le sol continue plat à la hauteur du bord.
  Les dalles de l'orthophoto épousent le même relief (mêmes sommets, mêmes `uv`).
- **Les objets suivent le sol** : un prisme (bâtiment, abri, arbre) part du **point le plus bas** du
  sol sous son contour et monte jusqu'à `z(centroïde) + elevation` ; il n'est ni enterré ni en
  l'air. La terrasse reste à sa hauteur finie au-dessus de `zRef` : en aval, on **voit le vide**
  sous les lambourdes. C'est voulu : c'est ce que V2 remplit (§6).
- Préférence d'affichage « Sol en relief » (`relief.affichage.sol3d`, vrai par défaut), rangée
  comme « Filaire » (`construction.lames3dFilaire`).
- Rien dans le GLB exporté : `glb-structure.json` ne décrit que la structure.

---

## 6. La version suivante : les quantités (V2, version majeure)

Tout ce qui suit **change des nombres** pour un projet qui porte un relief, et aucun pour un projet
qui n'en porte pas. Suivant `RELEASE.md` §2, c'est une **version majeure**, livrée seule, annoncée,
documentée dans `EMPREINTES.md` avec un témoin nouveau « projet avec relief ».

| Objet | Aujourd'hui | Avec le relief (V2) |
|---|---|---|
| Terrasse sur plots ou vis (`engine/hauteurs.ts`, `engine/structure.ts`) | une hauteur d'appui pour tous | la hauteur réglée est celle du **point le plus haut** du sol sous la terrasse ; chaque plot ou vis `p` reçoit `hauteurAppui + (zHaut − z(p))`. Au-delà de la hauteur admise d'un plot, le moteur propose des poteaux, comme la plage de piscine (`PLOT_HAUTEUR_DTU_CM`) ; une vis trop courte est signalée |
| Pergola (`engine/pergola.ts`) | poteaux de `z = 0` à `sousPoutre(p)` | poteaux de `zLocal(p)` à `sousPoutre(p)` : longueur réelle, achetable |
| Plage de piscine (`engine/piscine.ts`) | `dessus − …` depuis un sol plat | même règle que la terrasse, par poteau |
| Terrassement de la piscine | volume depuis `z = 0` | volume entre le sol réel et le fond : déblai vrai, et remblai si le sol descend |
| Hauteur au sens du PLU (`plu`, DP2) | depuis `z = 0` | depuis le terrain naturel **au point le plus bas** sous l'ouvrage, comme l'exigent les règlements ; l'avertissement de hauteur maximale en tient compte |

Le point de référence de la terrasse (`zHaut`) remplace `zRef` comme zéro de la terrasse dans ces
calculs ; `zRef` reste le zéro du plan. Le reste de la mécanique (grille, lecture, affichage) ne
change pas entre V1 et V2 : c'est pour cela que V1 enregistre déjà tout.

---

## 7. Données et persistance

```ts
export interface Relief {
  source: 'lidar-hd' | 'rge-alti';
  couche: string;            // le calque WMS exact, pour « Actualiser » et pour l'archive
  dateLecture: string;       // ISO, jour de la lecture
  dateDonnees?: string;      // LiDAR HD : date_fin_acquisition de la dalle ; RGE ALTI : absent
  origine: string;           // texte du masque de source, ou « LiDAR HD »
  precision: string;         // « Emq < 30 cm », « de l'ordre de 10 cm (IGN) »
  systemeAltimetrique: string; // « NGF-IGN69 », « IGN78 »…
  pas: number;               // en m : 0.5, 1, 2 ou 5
  x0: number; y0: number;    // centre de la cellule nord-ouest, repère du plan (m)
  nx: number; ny: number;    // colonnes, lignes
  z: (number | null)[];      // nx × ny altitudes NGF au cm, du nord au sud, d'ouest en est
  zRef: number;              // altitude NGF du zéro du plan (§3.3)
  affichage?: { courbes?: boolean; equidistance?: number; sol3d?: boolean };
}
// ObjetCommun : + relief?: Relief | null   (porté par la parcelle du projet seulement)
```

- **Sérialisation** (`io/serialisation.ts`) : `relief` s'ajoute à la liste blanche, **écrit
  seulement s'il existe**, comme `toit` ou `cloture` : l'empreinte d'un projet sans relief ne bouge
  pas. L'ordre des clés est celui du type ci-dessus.
- **Poids** : 8 000 cellules × ~7 caractères ≈ 60 ko ; le plafond de 40 000 cellules ≈ 300 ko.
  Acceptable pour un projet JSON ; la plateforme n'impose pas de limite plus basse. Si cela devait
  gêner, `z` passerait en entiers de centimètres relatifs à `zRef` en base64 ; pas avant.
- **Schéma 4.** Un champ nouveau dans la forme persistée : suivant `RELEASE.md` §3,
  `SCHEMA_VERSION` passe à 4 ; migration 3 → 4 **identité** (comme 1 → 2) ; `schemaMinimal` rend 4
  dès qu'une parcelle porte un `relief`. Un projet sans relief s'écrit toujours au schéma 3.
- **Conséquence plateforme.** Tout projet qui a lu le relief s'enregistre au schéma 4 ; la
  plateforme doit l'accepter avant la livraison (`contrat/plan-produit.json`, `schema_versions:
  [1, 2, 3, 4]`, puis `project_schema_versions` dans backprod, sinon `422
  UNSUPPORTED_SCHEMA_VERSION`). Même circuit que pour le schéma 3.
- **Démonstration** : elle n'est pas calée par le cadastre, elle ne reçoit pas de relief. Ses témoins
  ne bougent pas.
- **Capacité** : `CAPACITES.relief = { code: 'plan.relief', libelle: 'Relief du terrain', commandes:
  ['relief.lire', 'relief.actualiser', 'relief.supprimer'], origines: ['https://data.geopf.fr'] }`.

---

## 8. L'interface

Charger `design-ui` avant d'y toucher. Tout passe par le registre (`app/commandes.ts`) et
`commandes.etat(id)` ; chaque commande s'inscrit dans `app/exposition.ts` pour les trois classes
d'écran.

**Commandes** (`capacite: 'plan.relief'`, `permission: PERMISSION_ECRITURE`, `ecrit: 'projet'`) :

| Id | Libellé | Grisée quand |
|---|---|---|
| `relief.lire` | Lire le relief (IGN) | pas de parcelle calée ; un relief existe déjà (alors « Actualiser ») |
| `relief.actualiser` | Actualiser le relief | pas de relief |
| `relief.supprimer` | Supprimer le relief | pas de relief |

Pendant la lecture (une à trois secondes), le bouton montre l'attente ; une coupure réseau après
la reprise dit : « L'IGN n'a pas répondu ; réessayez. » et n'écrit rien.

**Section « Relief » de l'inspecteur de la parcelle** (`ui/champs/relief.ts`), sous
« Orthophoto » :

- sans relief : une ligne « Terrain plat (pas de relief lu) » et le bouton « Lire le relief » ;
- avec relief, en lecture : « LiDAR HD, 50 cm · acquis en 2021 · de l'ordre de 10 cm (IGN) » ou
  « RGE ALTI, 1 m · corrélation d'images · Emq < 1 m », l'altitude NGF du zéro, la pente moyenne
  et son orientation, le dénivelé ;
- préférences d'affichage (`sale: false`, `agit: 'interface'`) : « Courbes de niveau » (case),
  « Équidistance » (choix : auto, 10 cm, 25 cm, 50 cm, 1 m), « Sol en relief (3D) » (case) ;
- boutons « Actualiser » et « Supprimer » (`agit: { commande }`).

**Panneau « Profil »** (zone des résultats) : la ligne de coupe se trace sur le plan avec l'outil de
mesure, bouton « En faire le profil » ; le panneau montre le profil, et « Dans le sens de la pente »
le remet sur la ligne proposée.

**Écran compact** : la section « Relief » se réduit à la ligne de source et au bouton ; les courbes
suivent la préférence, le profil est accessible mais sans tracé au doigt dans cette version.

---

## 9. Comment c'est vérifié

### 9.1 Avant d'écrire le code : la précision

Sur **cinq parcelles** dont on connaît le terrain (relevé de géomètre, ou niveau à bulle et mire sur
au moins trois points) :

- l'écart entre `z(x, y)` et le relevé est **≤ 30 cm sur au moins quatre** avec le LiDAR HD ;
- la pente moyenne de §5.1 est du même signe et à **± 2 points** de la pente relevée ;
- noter les cas de muret, de talus et de remblai qui disparaissent.

Les cinq réponses BIL brutes et les deux réponses WFS vont dans `tests/fixtures/relief/` : ce sont
aussi les entrées des tests de §9.2. Si le critère échoue, le relief reste un affichage, et §6 ne
s'écrit pas : à rediscuter avant d'implémenter V2.

### 9.2 Tests unitaires

`tests/unit/geo/relief.test.ts`, `tests/unit/model/relief.test.ts`,
`tests/unit/geometry/isolignes.test.ts`, `tests/unit/model/migrations.test.ts`,
`tests/unit/io/serialisation.test.ts`. Le réseau est injecté comme dans `carteSituation`
(`rechercher: typeof fetch = fetch`) ; aucun test ne le touche.

- **décodage** : un BIL de fixture 120 × 80 donne la grille attendue, `-9999` et `-99999` deviennent
  `null`, arrondi au centimètre ;
- **choix de la source** : dalles > 0 et aucun `null` sur la parcelle ⇒ `lidar-hd` ; zéro dalle ⇒
  `rge-alti` ; `null` sur la parcelle avec les deux ⇒ refus, rien d'écrit ;
- **emprise et pas** : parcelle + 10 m ; 0,5 m jusqu'à 40 000 cellules, puis 1, 2, 5 ; refus au-delà ;
- **`z(x, y)`** : bilinéaire exacte sur une grille plane (`z = a·x + b·y + c`), `null` hors emprise
  et sur un trou ;
- **pente** : sur une grille plane, pente et orientation retrouvées à 0,1 % et 1° près ; grille
  bruitée à ± 2 cm : pente à ± 0,2 % ;
- **courbes** : sur une grille plane, des droites parallèles, perpendiculaires à la pente, à
  l'équidistance ; équidistance automatique par palier de dénivelé ;
- **profil** : sur une grille plane, une droite ; échantillon tous les `pas / 2` ;
- **`zRef`** : au centroïde de la terrasse, sinon de la parcelle ; inchangé quand la terrasse bouge,
  recalculé par « Actualiser » ;
- **reprise réseau** : une coupure puis une réponse ⇒ grille écrite ; deux coupures ⇒ message, rien
  d'écrit ;
- **sérialisation** : `relief` absent ⇒ clé absente, empreinte d'un projet sans relief inchangée ;
  présent ⇒ relu à l'identique, `z` au centimètre ;
- **schéma** : 4 dès qu'un relief existe, 3 sinon ; migration 3 → 4 identité, rien rejoué sur un
  document déjà au schéma 4 ;
- **architecture** : `model/relief.ts` ne dépend que de `geometry` ; `geo/relief.ts` fait les
  requêtes ; `three`, `export`, `render` lisent `model/relief.ts`. `tests/unit/architecture.test.ts`
  le vérifie sans rien de plus.

### 9.3 Dans l'application

Point nouveau de `tests/CHECKLIST-FUMEE.md`, **réseau `data.geopf.fr` requis** (il échoue dans
l'environnement cloud, comme les points 12 à 15) :

nouveau plan depuis une adresse d'un terrain en pente ; « Lire le relief » ; l'inspecteur donne la
source, la date, la précision, une pente du bon sens ; courbes de niveau sur le plan, dans les trois
classes d'écran et les deux thèmes ; Vue 3D : le sol monte, la maison n'est ni enterrée ni en l'air,
le vide se voit sous la terrasse en aval ; profil : panneau, puis pièce DP3 du dossier ;
enregistrement sur la plateforme simulée, rechargement **sans réseau** : tout est relu à l'identique,
pas d'appel à `data.geopf.fr`. Ctrl+Z après « Lire » : plan plat ; « Supprimer » : idem.

---

## 10. Limites connues et suites

| Limite | Effet | Suite possible |
|---|---|---|
| Sol interpolé sous les bâtiments et à leur pied | la pente au ras du mur est lissée, là où la terrasse se pose | relevé de façade (`spec-releve-facade.md`) : la cote du seuil ; ou le nuage COPC |
| Petits reliefs absents (muret, marche, talus < 1 m au RGE ALTI) | une terrasse à cheval sur un muret voit une pente douce | le LiDAR 50 cm les tient en partie ; le nuage brut les tient tous |
| Terrain remblayé depuis le relevé IGN | relief faux, nombres faux en V2 | l'inspecteur date la donnée ; « Supprimer » rend le plan plat ; saisie manuelle de points en suite |
| Pas de LiDAR HD partout (centre Bretagne au 6 octobre 2026) | repli RGE ALTI à 5 m de source, Emq < 1 m | « Actualiser » quand la dalle paraît : l'index WFS le dit |
| Hauteur des arbres et des toits voisins toujours estimée | ombres et vues 3D approximatives | **MNH et MNS LiDAR** par le même WMS : prochaine spécification, celle que `spec-toit-ign.md` §9 attend |
| Rien au centimètre | pas une cote d'exécution | relevé sur place ; V2 le dit sur la nomenclature (« hauteurs selon relief IGN, à vérifier sur place ») |
| Nuage de points brut | non lu | téléchargement Géoplateforme : requêtes partielles et CORS vérifiés, dalle de 98 Mo ; COPC lisible par morceaux depuis le navigateur, au prix d'une bibliothèque LAZ |
