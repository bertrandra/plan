# Spécification — Import cadastre depuis une adresse + Import/Export JSON

**Date : 26 août 2026**
**Cible : `plan.html` (mono-fichier) + `api.php` (persistance JSON fichier)**
**Statut : implémentée dans `plan.html` le 26/08/2026** — voir §9 pour les écarts assumés
entre cette spec et le code livré.

> Ce document complète `spec_address_to_cadastral_parcel_api.md`, qui décrit la cible SaaS
> (Node/PostGIS/Redis). Ici, la cible est **l'application réelle telle qu'elle existe** :
> un HTML unique, sans build, sans dépendance NPM, avec un backend PHP de 200 lignes.
> Toute la logique décrite ci-dessous s'écrit **en JavaScript dans `plan.html`**, les
> appels réseau partant du navigateur.

---

## 1. Périmètre

| # | Fonction | Résumé |
|---|---|---|
| **A** | Nouveau projet depuis une adresse | Saisie d'adresse → géocodage → parcelle cadastrale → **prévisualisation** → **sélection des parcelles adjacentes** → création du projet |
| **B** | Import / Export JSON | Export du projet dans un fichier `.json` **au format exact de la sauvegarde serveur**, avec **option « sans la parcelle »**, et réimport de ce fichier |

Hors périmètre : PLU/GPU, propriétaires, bâtiments BD TOPO, orthophoto, fusion de parcelles
(voir §7).

---

## 2. Rappels du socle existant (contraintes non négociables)

Ce qui suit est le comportement actuel du code ; la spec s'y conforme.

| Élément | Réalité dans `plan.html` | Ligne(s) |
|---|---|---|
| Repère du plan | Mètres. **X+ = Est, Y+ = Nord**. Origine (0,0) = **sommet le plus au nord de la parcelle** | 3618–3620, 1122 |
| Anneau polygonal | `pts:[{x,y}]` **non fermé** (le dernier point ne répète pas le premier) | 999–1003 |
| Aire | `shoelace()` en valeur absolue → **le sens de parcours est indifférent** | 999 |
| Parcelle | objet de clé `parcelle`, `fonction:'terrain'`, `locked:true`, `priority:0` | 759–765 |
| Recherche de la parcelle | `objects.find(o => o.key==='parcelle' OU o.fonction==='terrain')` — **premier match dans l'ordre du tableau** | 7901, 8303, 8396, 8460 |
| Contrainte `constrained` | Codée en dur sur `key==='parcelle'`, **7 points d'appel** | 1879, 1895, 2356, 2382, 2957, 3055, 4338 |
| Clôture, latitude/longitude, nomLieu | Portés **par l'objet parcelle**, pas par un état global | 7582–7595, 8458–8460 |
| Sérialisation | `serializeObjects()` est une **liste blanche de champs** : tout champ non listé est **silencieusement perdu** à la sauvegarde | 4809–4841 |
| Mesures | `{refObjKey, refSegIndex, startEnd, targetObjKey, targetPtIndex, show, displayMode}` — référencent des objets **par clé** | 4842–4849 |
| Format serveur | `load` → `{meta:{id,name,createdAt,updatedAt}, objects, measures}` ; `save` ← `{id?, name, objects, measures}` | api.php |
| Modales | `showPrompt / showConfirm / showToast / showErrBanner` (pas de `alert()` natif : bloqué en iframe) | 474–580 |
| Undo | `pushHistory()` **avant** toute mutation ; `markDirty()` après | 891–973 |
| Mode local | Si `api.php` est injoignable, l'appli tourne sur `DEMO_OBJECTS`, barre projet en `localMode` | 4850–4860 |

---

# 3 · A — Import cadastre depuis une adresse

## A1. Flux utilisateur

```text
Barre de projet
  [ + Depuis une adresse ]
        |
        v
 Étape 1 — Adresse
   saisie + autocomplétion  ->  choix d'une adresse
        |
        v
 Étape 2 — Parcelle
   aperçu SVG de la parcelle trouvée
   section / numéro / surface / commune
   [ Changer de parcelle ]  (clic sur une voisine dans l'aperçu)
        |
        v
 Étape 3 — Parcelles adjacentes
   aperçu SVG : parcelle principale + voisines cliquables
   liste à cocher, deux sens de sélection (carte <-> liste)
        |
        v
 Étape 4 — Création
   nom du projet proposé  ->  [ Créer le projet ]
        |
        v
 apiSave() -> redirection ?projet=<id>
```

Une seule modale, trois écrans successifs, bouton **Retour** actif à chaque étape.
La modale est annulable à tout moment sans effet de bord sur le projet courant.

## A2. Emplacement dans le code

| Élément | Emplacement |
|---|---|
| Bouton `+ Depuis une adresse` | `setupProjectBar()`, juste après `newBtn` (~4893) |
| Modale + étapes | nouvelle section `// ====== Import cadastre (adresse -> parcelle) ======` avant `// ====== Persistance : serialisation ======` |
| Styles | réutiliser les classes de modale existantes (`showConfirm`/`showPrompt`), pas de nouveau système |
| Désactivation | bouton **masqué** si `!seed.apiAvailable` **et** protocole `file:` (voir A10) |

## A3. Étape 1 — Géocodage (BAN — `api-adresse.data.gouv.fr`)

Service retenu : **Base Adresse Nationale**, un seul point d'entrée pour la recherche et
l'autocomplétion.

**Autocomplétion** (à la frappe) :

```text
GET https://api-adresse.data.gouv.fr/search/
    ?q=<saisie>
    &autocomplete=1
    &limit=5
```

**Résolution** (à la sélection d'une suggestion) :

```text
GET https://api-adresse.data.gouv.fr/search/
    ?q=<adresse complète>
    &limit=5
```

Réponse vérifiée le 26/08/2026 pour `2 allée des limites 78110 Le Vesinet` :

```json
{"type":"Feature",
 "geometry":{"type":"Point","coordinates":[2.132536,48.905067]},
 "properties":{"label":"2 Allee des Limites 78110 Le Vésinet","score":0.9596,
   "housenumber":"2","street":"Allee des Limites","postcode":"78110",
   "citycode":"78650","city":"Le Vésinet","context":"78, Yvelines, Île-de-France",
   "type":"housenumber","x":636411.41,"y":6867578.98,"id":"78650_0730_00002"}}
```

Règles :

- déclenchement à partir de **3 caractères**, debounce **250 ms** ;
- une seule requête en vol : `AbortController`, on annule la précédente ;
- champs retenus : `label`, `citycode`, `city`, `postcode`, `score`, `type`,
  `geometry.coordinates = [lon, lat]` ;
- `properties.citycode` sert à **filtrer les parcelles candidates** par commune (A4) ;
- `properties.x/y` sont en **Lambert-93 (EPSG:2154)** : information utile, mais **non
  utilisée** — le cadastre arrive en WGS84 et c'est lui qui fixe la projection (A5) ;
- si `properties.type !== 'housenumber'` (résultat au niveau rue, lieu-dit ou commune),
  avertir : « adresse résolue au niveau *rue* : la parcelle proposée est approximative » ;
- si `score < 0.4`, même avertissement, **sans bloquer** ;
- l'utilisateur peut coller **directement des coordonnées** `lat, lon`
  (regex `^\s*-?\d+[.,]\d+\s*[,; ]\s*-?\d+[.,]\d+\s*$`) : on saute le géocodage ;
- **repli** si la BAN est indisponible : `https://data.geopf.fr/geocodage/search?q=…&index=address`
  (même forme GeoJSON, mêmes champs `label`/`citycode`/`score`).

### A3.1 Par défaut, la position de l'appareil

À l'ouverture du dialogue, `importe.utiliserMaPosition(true)` lit la position de l'appareil
(`shell/geolocalisation.ts`, haute précision, 15 s au plus, une position d'une minute admise). Le
navigateur demande la permission ; le serveur la permet au site (`Permissions-Policy:
geolocation=(self)`, dans `deploy/htaccess.template` et `buildsg/app.js`).

- **Précise** (≤ `PRECISION_POSITION_MAX_M` = 50 m) : l'adresse la plus proche (BAN inverse,
  `geocoderInverseBAN`) s'écrit dans le champ, et la parcelle se cherche **sous le point de
  l'appareil** (`genre: 'position'`), filtrée par la commune de cette adresse. L'étape 2 dit
  « Adresse la plus proche » et « Votre position (à N m près) : dans la parcelle ».
- **Approximative** : l'adresse est proposée dans le champ, rien n'est cherché.
- **Refusée, indisponible, trop longue** : silencieux à l'ouverture.
- **Devancée** : une frappe dans le champ ou une adresse choisie pendant la lecture l'emportent.

Le bouton « Utiliser ma position » (`cadastre.maPosition`, affiché si le navigateur sait donner une
position) relance la lecture d'un geste : alors une position approximative est prise telle quelle,
et un refus se dit (« Position refusée par le navigateur… »).

## A4. Étape 2 — Recherche de la parcelle (API Carto Cadastre)

### A4.1 Le point d'adresse n'est PAS dans la parcelle

C'est le point dur de cette fonction, et il est **vérifié** (26/08/2026, adresse
`2 allée des Limites, 78110 Le Vésinet`, point BAN `2.132536, 48.905067`) :

```text
GET .../parcelle?geom={"type":"Point","coordinates":[2.132536,48.905067]}
  -> {"features":[], "numberReturned":0}
```

La BAN place le point **devant la porte**, donc sur la voirie — et la voirie n'est **pas
cadastrée**. Interroger le point d'adresse tel quel ne renvoie donc pas « la parcelle du
voisin » : il ne renvoie **rien du tout**. Sur une adresse en fond de cour ou en angle, il
peut au contraire renvoyer la parcelle **d'en face** ou celle **du voisin**.

> **Conséquence : la recherche part TOUJOURS d'une emprise (carré autour du point),
> jamais du point nu.** Le point nu ne sert qu'à *classer* les candidats.

### A4.2 Le paramètre `lon`/`lat` n'existe pas — piège silencieux

```text
GET .../parcelle?lon=2.132536&lat=48.905067
  -> 200 OK, numberReturned = 1000, 1re parcelle = 13001000AB0001 (Aix-en-Provence)
```

API Carto **ignore les paramètres inconnus** au lieu de renvoyer une erreur : sans filtre
reconnu, la requête dégénère en **vidage national plafonné à 1000 parcelles**, à l'autre
bout de la France. Aucun code HTTP ne le signale.

**Garde-fou obligatoire à l'implémentation** : après chaque réponse, vérifier que
`numberReturned < 200` **et** que le `code_insee` du premier candidat correspond au
`citycode` de la BAN. Sinon → erreur `REPONSE_SUSPECTE`, on n'affiche rien.

Les seuls filtres reconnus sont `geom` (GeoJSON encodé), `code_insee`, `section`,
`numero`, `code_dep`, `code_com`, `source_ign`, `_limit`, `_start`.

### A4.3 Requête retenue

```text
GET https://apicarto.ign.fr/api/cadastre/parcelle
    ?geom={"type":"Polygon","coordinates":[[ carré de ±R m autour du point ]]}
    &code_insee=<citycode BAN>
    &_limit=60
```

- `geom` encodé via `encodeURIComponent(JSON.stringify(geom))` ;
- `source_ign=PCI` est **optionnel** (PCI est la source par défaut) ;
- escalade de `R` tant que 0 candidat : **12 m → 25 m → 50 m** (arrêt) ;
- `R` retenu est conservé dans `cadastre.rayonM`.

Le carré se construit dans le repère local (A5) puis se reconvertit en degrés :
`dLon = R/kx`, `dLat = R/ky`.

### A4.4 Classement des candidats

Toutes les distances sont calculées **en mètres, après projection** (A5), jamais en degrés.

| Rang | Règle |
|---|---|
| 1 | le point d'adresse est **à l'intérieur** du polygone (`pointInPolygon`, déjà présent ligne 997 sq.) |
| 2 | sinon, **distance minimale point → bord** croissante |
| 3 | à égalité (< 0,30 m), la plus grande `contenance` |

**Sélection automatique** seulement si l'écart au deuxième candidat est **≥ 3 m** ;
sinon l'étape 2 s'ouvre en mode « choisissez la parcelle » avec tous les candidats
cliquables et **aucune** présélection implicite.

Mesures réelles sur l'adresse de test (voir annexe §8) :

```text
AE 0101   dist 1,26 m   716 m²   <- retenue automatiquement (écart au 2e = 4,96 m)
AE 0100   dist 6,22 m   693 m²
AE 0103   dist 6,23 m  1000 m²
AD 0128   dist 8,88 m   782 m²
AE 0098   dist 20,02 m  408 m²
```

Le point d'adresse est à l'extérieur des **cinq** candidats : la règle 1 ne se déclenche
jamais sur ce cas, et c'est bien la règle 2 qui donne le bon résultat.

### A4.5 Sélection manuelle par clic

Quand l'utilisateur clique une parcelle dans l'aperçu, on **ne devine pas** : on
réinterroge l'API avec un point à l'intérieur du polygone cliqué.

```text
GET .../parcelle?geom={"type":"Point","coordinates":[2.132811,48.905189]}
  -> numberReturned = 1, idu = 78650000AE0101, contenance = 716
```

C'est le seul usage légitime de `geom=Point` : un point **dont on sait** qu'il est
intérieur. (Vérifié le 26/08/2026.)

### A4.6 Propriétés exploitées

Structure vérifiée d'une `properties` :

```json
{"gid":1106394,"numero":"0101","feuille":1,"section":"AE","code_dep":"78",
 "nom_com":"Le Vésinet","code_com":"650","com_abs":"000","code_arr":"000",
 "idu":"78650000AE0101","contenance":716,"code_insee":"78650"}
```

| Champ API | Usage |
|---|---|
| `idu` | identifiant unique, **clé de déduplication** des voisines |
| `section`, `numero` | nom affiché (`AE 101`) et clé d'objet |
| `code_insee` | traçabilité **et** garde-fou A4.2 (comparaison au `citycode` BAN) |
| `nom_com` | nom de commune affiché |
| `contenance` | surface cadastrale officielle en m², **affichée à côté** de la surface calculée |
| `geometry` | **`MultiPolygon`** en pratique, même pour une parcelle simple (voir A6) |

## A5. Projection WGS84 → repère local (mètres)

Aucune bibliothèque de projection n'est disponible (pas de build, pas de CDN obligatoire).
On utilise une **projection plane locale tangente**, exacte au millimètre sur l'emprise
utile (< 1 km) :

```js
// Rayons de courbure WGS84 à la latitude de référence
const A = 6378137, E2 = 0.00669437999014;
function projecteurLocal(lat0, lon0){
  const p = lat0*Math.PI/180, s = Math.sin(p);
  const N = A / Math.sqrt(1 - E2*s*s);                    // rayon 1re verticale
  const M = A * (1-E2) / Math.pow(1 - E2*s*s, 1.5);       // rayon méridien
  const kx = N * Math.cos(p) * Math.PI/180;               // mètres par degré de longitude
  const ky = M * Math.PI/180;                             // mètres par degré de latitude
  return (lon, lat) => ({ x:(lon-lon0)*kx, y:(lat-lat0)*ky });
}
```

- `lat0/lon0` = **centroïde de la parcelle principale** (pas l'adresse : la parcelle est
  l'objet de référence, et le point d'adresse peut être en bordure de voirie) ;
- après projection, **translation** pour que le **sommet le plus au nord** (`y` max) de la
  parcelle principale devienne `(0,0)` — convention de l'appli, cf. §2 et ligne 3618 ;
- les **voisines utilisent le même projecteur et la même translation** : sans cela elles
  ne seraient pas contiguës ;
- arrondi à **3 décimales** (millimètre) pour ne pas polluer le JSON ;
- Y+ = Nord : **aucune inversion** (contrairement à l'import SVG, ligne 4648).

Un facteur d'échelle constant (`kx`, `ky` calculés une seule fois) suffit : sur 200 m, la
variation de `kx` avec la latitude reste sous le dixième de millimètre.

## A6. Normalisation de la géométrie

**Imbriquation réelle** : l'API renvoie un `MultiPolygon` **même pour une parcelle simple**.
L'anneau extérieur se lit donc en `geometry.coordinates[0][0]`, et chaque sommet est
`[lon, lat]`. Un code écrit pour `coordinates[0]` (cas `Polygon`) part sur un niveau de
profondeur faux et échoue par « ce n'est pas un nombre » — supporter **les deux** types.

```text
GeoJSON Polygon/MultiPolygon
   | MultiPolygon -> coordinates[0][0] ; si plusieurs polygones, on garde le plus grand
   |                 (+ avertissement)
   | Polygon      -> coordinates[0]
   | trous (anneaux intérieurs) -> ignorés (+ avertissement)
   | suppression du point de fermeture (dernier == premier)
   | suppression des points doublons à moins de 1 cm
   | simplification optionnelle : sommets dont l'écart à la corde < 2 cm
   | sens de parcours forcé en HORAIRE (cohérence avec les projets existants)
   v projection + translation (A5)
```

Rejet si, après normalisation : moins de 3 points, coordonnées non finies, ou aire nulle.

**Simplification** : mesurée sur le secteur de test, une parcelle pavillonnaire arrive avec
**6 à 22 sommets** — c'est directement exploitable, la simplification n'est donc **pas**
critique. Elle reste utile sur les parcelles longues bordées de voirie (sommets quasi
colinéaires en série). Seuil **2 cm**, case `Simplifier les contours` cochée par défaut,
décochable. L'anneau brut est conservé dans `cadastre.geometrieSource` (WGS84) pour ne
jamais perdre la donnée officielle.

## A7. Étape 3 — Parcelles adjacentes

**Deux requêtes, pas une.** La première (§A4.3) est centrée sur le point d'adresse et sert à
*trouver* la parcelle ; elle ne peut pas servir à lister les mitoyennes, parce qu'une parcelle
fait couramment 30 à 40 m de long alors que le point d'adresse est en bordure de voirie : le
fond de terrain sort de la boîte. Mesuré sur la parcelle de test : **5 parcelles** vues depuis
la boîte d'adresse (±12 m), **13** depuis la boîte de la parcelle (±20 m), et **4 mitoyennes
réelles** au lieu de 2.

**Requête voisinage** — bbox de la parcelle principale élargie de **20 m**, envoyée comme
polygone. Elle est rejouée à chaque changement de parcelle principale (une seule fois par
parcelle : y revenir ne redemande rien), et ses résultats sont fusionnés aux candidates
existantes par `idu` :

```text
GET https://apicarto.ign.fr/api/cadastre/parcelle
    ?geom={"type":"Polygon","coordinates":[[[lonMin,latMin],[lonMax,latMin],
                                            [lonMax,latMax],[lonMin,latMax],[lonMin,latMin]]]}
    &source_ign=PCI
    &_limit=60
```

**Filtre d'adjacence** (dans le repère local, en mètres — jamais en degrés) :

une candidate est *adjacente* si la **distance minimale segment-à-segment** entre son
anneau et celui de la parcelle principale est **inférieure à 0,50 m**, `idu` différent de
la principale.

- classement par **longueur de frontière commune décroissante** (somme des portions de
  segments à moins de 0,50 m), puis par surface ;
- affichage limité à **20** voisines ; au-delà, message « périmètre trop dense, affinez » ;
- les candidates non adjacentes (dans la bbox mais séparées par une rue) sont
  **conservées dans un second groupe replié** « Autres parcelles du secteur », décochées.

**Prévisualisation** (étapes 2 et 3, même composant) :

- SVG dédié dans la modale, `viewBox` ajusté sur l'union des géométries + 5 % de marge ;
- parcelle principale : remplissage `#FBF3D9`, contour `#3B2E1F`, étiquette `AE 101 — 716 m²` ;
- voisines non sélectionnées : contour pointillé gris, remplissage transparent ;
- voisines sélectionnées : remplissage `#EDE3CB`, contour plein ;
- **survol** : surbrillance simultanée dans la carte et dans la liste ;
- **clic** sur une voisine = bascule de sélection, strictement équivalent à la case à cocher
  (liaison bidirectionnelle, une seule source de vérité : le `Set` d'`idu` sélectionnés) ;
- deux raccourcis au-dessus de la liste : **« Cocher toutes les mitoyennes »** et
  **« Tout décocher »** — le cas courant est de vouloir tout le voisinage direct, ou rien ;
- bouton **« en faire la parcelle principale »** sur chaque voisine : permute principale et
  voisine, ce qui **relance la projection** (l'origine change) — recalcul complet de toutes
  les géométries, jamais un patch partiel ;
- surface affichée : `contenance` (cadastre) et surface calculée ; si l'écart dépasse **3 %**,
  afficher les deux avec la mention « surface cadastrale / surface calculée ».
  *(Écarts mesurés sur les 5 parcelles de test : 0,9 % / 0,9 % / 2,0 % / 0,5 % / 2,5 % —
  l'écart est normal, la `contenance` est arrondie et issue d'un autre mode de calcul.)*

## A8. Objets produits

**Parcelle principale** — reprend exactement la forme de `DEMO_OBJECTS[0]` :

```js
{
  key:'parcelle', type:'polygon', name:'Parcelle AE 101',
  fill:'#FBF3D9', fillOpacity:1, stroke:'#3B2E1F',
  pts:[...],                                   // A5/A6
  vertexNames:['Point 1', ...],                // générés
  segmentNames:['Cote 1', ...],                // générés
  frozenVertices:[false, ...],
  showName:true, showSegNames:false, showVertNames:false,
  showDims:true, showAngles:false, constrained:false,
  fonction:'terrain', matiere:'', priority:0, locked:true,
  // lieu : alimente la course du soleil (parasol, 3D) - déjà lu par lieuActuel()
  // -> centroïde de la parcelle, pas le point d'adresse (qui est sur la voirie)
  latitude:48.905189, longitude:2.132811, nomLieu:'Le Vésinet',
  // traçabilité
  cadastre:{
    idu:'78650000AE0101', codeInsee:'78650', commune:'Le Vésinet',
    section:'AE', numero:'0101', contenanceM2:716,
    source:'IGN/API Carto/PCI', recupereLe:'2026-08-26T19:39:40Z',
    adresse:'2 Allee des Limites 78110 Le Vésinet',
    adresseLon:2.132536, adresseLat:48.905067, adresseScore:0.96,
    rayonM:12, distanceBordM:1.26,             // le point d'adresse est HORS parcelle
    origineLat:48.90536640, origineLon:2.13287759,  // sommet le plus au nord -> (0,0)
    simplifieM:0.02,
    geometrieSource:{type:'Polygon',coordinates:[[...]]}   // WGS84, non simplifiée
  }
}
```

**Parcelles adjacentes** — un objet par parcelle retenue :

```js
{
  key:'parcelle-AE-0102', type:'polygon', name:'AE 102',
  fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
  pts:[...], vertexNames:[...], segmentNames:[...], frozenVertices:[...],
  showName:true, showSegNames:false, showVertNames:false,
  showDims:false,            // sinon le plan est illisible dès 3 voisines
  showAngles:false, constrained:false,
  fonction:'terrain', matiere:'', priority:0, locked:true,
  cadastre:{ ... }           // idem, sans les champs d'adresse
}
```

Règles :

- clé = `parcelle-<section>-<numero>`, **normalisée** (`[^a-z0-9-]` → `-`) et suffixée `-2`,
  `-3`… en cas de collision ;
- la **parcelle principale est poussée en premier** dans `objects` : `trouverParcelleCloture()`
  parcourt le tableau dans l'ordre et retiendrait sinon une voisine (voir A11) ;
- `locked:true` : une parcelle de référence ne se déplace pas par mégarde ; l'utilisateur
  peut la déverrouiller dans le panneau d'attributs.

## A9. Création du projet

```js
const created = await apiSave({ name, objects: nouveauxObjets, measures: [] });
localStorage.setItem(LS_LAST_PROJECT, created.id);
location.href = withProjectParam(created.id);
```

- nom proposé : `AE 101 — 2 Allee des Limites` (tronqué à 60 caractères ; `slugify()` côté
  PHP s'occupe de l'`id`) ;
- le projet courant **n'est pas modifié** : on crée un projet neuf, comme `+ Nouveau projet` ;
- si `dirty` est vrai, `showConfirm()` d'abord (mêmes termes que le changement de projet) ;
- **mode local** (`api.php` absent) : pas de création serveur possible. On propose alors de
  **remplacer le plan en mémoire** (même mécanique que l'import JSON en mode remplacement,
  §B4) avec un message explicite : « Mode local : le plan est chargé mais ne sera pas
  enregistré. Utilisez Export JSON pour le conserver. »

## A10. Réseau, CORS et repli

Les deux services sont publics et exposent CORS ; l'appel part **directement du navigateur**.
Contraintes :

- `timeout` de **8 s** par requête (`AbortController` + `setTimeout`) ;
- **1 seule** nouvelle tentative, sur erreur réseau ou HTTP 5xx uniquement ;
- pas d'appel en boucle : l'escalade de rayon (A4) est bornée à 4 requêtes ;
- en `file://`, `fetch` vers `https://` peut être bloqué (origine `null`) : intercepter
  l'échec et afficher « Import cadastre indisponible en ouverture locale du fichier ;
  servez la page via un serveur web. »

**Repli optionnel (recommandé si CORS pose problème en production)** : ajouter à `api.php`
une action de proxy, strictement limitée :

```text
GET api.php?action=cadastre&url=<url encodée>
```

- **liste blanche d'hôtes** : `apicarto.ign.fr`, `data.geopf.fr` — tout autre hôte → 400 ;
- schéma `https` obligatoire, longueur d'URL ≤ 2000 ;
- timeout 8 s, réponse relayée telle quelle en `application/json` ;
- cache fichier optionnel dans `data/cache/` (clé = sha1 de l'URL, TTL 30 jours) : la
  géométrie cadastrale bouge très rarement, et cela protège l'API publique.

## A11. Modifications à faire dans le code existant

| # | Fichier / ligne | Modification | Raison |
|---|---|---|---|
| M1 | `serializeObjects()` ~4809 | ajouter `cadastre: o.cadastre || null` à la liste blanche | sans cela, **toutes** les métadonnées cadastrales sont perdues au premier enregistrement, silencieusement |
| M2 | `normalizeObjects()` ~1093 | `if(c.cadastre) c.cadastre = JSON.parse(JSON.stringify(c.cadastre));` | l'undo et le rechargement partagent sinon la même référence |
| M3 | `trouverParcelleCloture()` 8460 | `objects.find(o=>o.key==='parcelle') || objects.find(o=>o.fonction==='terrain')` | avec des voisines en `fonction:'terrain'`, l'ordre du tableau décide sinon quelle parcelle porte la clôture et le lieu du soleil |
| M4 | idem 7901, 8396 | remplacer les copies de la règle par un appel à `trouverParcelleCloture()` | trois copies de la même règle, corrigées une seule fois |
| M5 | GLB/3D 8303 | inchangé : les voisines en `terrain` deviennent du sol, ce qui est le rendu voulu | — |
| M6 | Panneau d'attributs 2036 | inchangé : `terrain` figure déjà dans la liste des fonctions | — |

**Points de vigilance à documenter dans l'UI** (`hint` sous le bouton) :

1. `constrained` reste attaché à `key==='parcelle'` (7 points d'appel) : un objet contraint
   **ne peut pas** être déplacé sur une parcelle adjacente. Pour construire à cheval,
   décocher « contraint à la parcelle ». *(Généraliser la contrainte à l'union des `terrain`
   est un chantier V2 : cela suppose un `parcelleBounds()` unique et un test
   d'appartenance multi-polygone.)*
2. L'**outil d'alignement par rotation** ne fait tourner qu'un objet à la fois, et refuse les
   objets verrouillés — la parcelle importée arrive `locked:true`, donc protégée par défaut.
   Le risque ne subsiste que si l'utilisateur la déverrouille : faire tourner une parcelle
   cadastrale **désaligne le plan du nord réel**, donc l'ombre du parasol et la Vue 3D.
   Avertir dès que l'objet aligné porte un `cadastre`.
3. Mention légale obligatoire dans la modale, non masquable :
   « Le plan cadastral (PCI, IGN) est un document fiscal de référence : **il ne vaut pas
   bornage**. Les limites réelles de propriété ne peuvent être établies que par un
   géomètre-expert. »

## A12. Erreurs

| Code interne | Message utilisateur |
|---|---|
| `ADRESSE_VIDE` | Saisissez une adresse (au moins 3 caractères). |
| `GEOCODAGE_ECHEC` | Impossible de géocoder cette adresse (service IGN injoignable). |
| `GEOCODAGE_AUCUN` | Aucune adresse trouvée. Essayez sans le numéro, ou avec le code postal. |
| `PARCELLE_AUCUNE` | Aucune parcelle cadastrale trouvée dans un rayon de 50 m. |
| `PARCELLE_AMBIGUE` | Plusieurs parcelles possibles : choisissez-en une sur l'aperçu. |
| `REPONSE_SUSPECTE` | Réponse incohérente du service cadastre (filtre ignoré) : import interrompu. |
| `GEOMETRIE_INVALIDE` | La géométrie renvoyée est inexploitable (moins de 3 sommets). |
| `API_TIMEOUT` | Le service IGN ne répond pas (8 s). Réessayez. |
| `API_HTTP` | Le service cadastre a renvoyé une erreur (HTTP nnn). |
| `CORS_LOCAL` | Import cadastre indisponible en ouverture locale du fichier ; servez la page via un serveur web. |

Toutes passent par le bandeau de la modale ou `showErrBanner()` — **jamais** `alert()`.

---

# 4 · B — Import / Export JSON

## B1. Format du fichier

Le fichier est **exactement** la réponse de `api.php?action=load` :

```json
{
  "meta": { "id":"parcelle-ae-101", "name":"Parcelle AE 101",
            "createdAt":"2026-08-01T09:12:00Z", "updatedAt":"2026-08-26T14:08:00Z" },
  "objects": [ "sortie de serializeObjects()" ],
  "measures": [ "sortie de serializeMeasures()" ]
}
```

- **aucun champ propriétaire supplémentaire obligatoire** : un fichier exporté doit pouvoir
  être reposté tel quel à `action=save` après remise à plat (`{name, objects, measures}`) ;
- l'import accepte **les deux formes** : `{meta,objects,measures}` (export / `load`) et
  `{name,objects,measures}` (payload `save`) ;
- champs additionnels tolérés et ignorés :
  `meta.exportedAt`, `meta.exportedBy:"plan.html"`, `meta.sansParcelle:true`, `meta.lieu`.

Nom de fichier : `<slug(meta.name)>-<AAAAMMJJ>.json`, suffixé `-sans-parcelle` le cas échéant.

## B2. UI

Onglet **Export**, sous le bloc d'import SVG existant :

```html
<div class="controls">
  <button id="exportJsonBtn" class="secondary">Exporter le projet (JSON)</button>
  <label><input type="checkbox" id="chkExportSansParcelle"> Exporter sans la parcelle</label>
</div>
<div class="controls">
  <button id="importJsonBtn" class="secondary">Importer un projet (JSON)</button>
  <input type="file" id="importJsonFile" accept=".json,application/json" style="display:none;">
  <label><input type="checkbox" id="chkJsonRemplace" checked> Remplacer le plan actuel</label>
</div>
<div class="hint">Le JSON est le format de sauvegarde de l'application : un export réimporté
redonne le plan à l'identique (formes, noms, mesures, terrasse, textures, clôture).</div>
<div class="hint">« Sans la parcelle » retire la parcelle et les parcelles voisines, ainsi que
les mesures qui s'y appuient et la clôture qui leur est attachée : utile pour transmettre un
aménagement sans divulguer la localisation.</div>
```

Téléchargement : `Blob` + `URL.createObjectURL` + `<a download>` + `revokeObjectURL`,
comme les exports SVG/DXF existants (~3419). L'`<input type="file">` doit être remis à
`''` dans `onload` **et** dans `onerror`, sinon réimporter le même fichier ne déclenche
plus d'événement `change` (piège déjà rencontré sur l'import SVG, ligne 4559).

## B3. Option « sans la parcelle » — cascade obligatoire

Retirer la parcelle **sans nettoyer ce qui la référence** produit un fichier qui casse à
l'import (mesures orphelines, `terrasseLieeKey` mort). L'ordre est imposé :

```text
1. objets retirés = { key==='parcelle' } U { fonction==='terrain' }
     -> couvre la principale ET les voisines cadastrales
2. mesures retirées = celles dont refObjKey OU targetObjKey est un objet retiré
     -> cas le plus fréquent : les mesures perpendiculaires prennent un côté de
        parcelle comme référence (cf. hint ligne 469)
3. terrasseLieeKey pointant un objet retiré  ->  null
4. le lieu (latitude/longitude/nomLieu) et la clôture vivent SUR la parcelle :
     - clôture : perdue, c'est voulu (elle décrit la limite de propriété)
     - lieu : recopié dans meta.lieu = {latitude, longitude, nomLieu}
       -> conserve la course du soleil (parasol, 3D) sans la géométrie de la parcelle
5. constrained:true sur les objets restants : LAISSÉ TEL QUEL
     -> sans parcelle, `bound` vaut null et la contrainte ne s'applique pas
        (lignes 1879 et suivantes) ; la valeur redevient utile si une parcelle
        est réintroduite plus tard
6. compter et annoncer : « Export sans parcelle : n objet(s) et m mesure(s) retiré(s). »
```

L'option **n'affecte que le fichier** : le plan en mémoire et la sauvegarde serveur sont
intacts, et `dirty` ne bouge pas.

## B4. Import

```text
choix fichier
   | taille > 5 Mo            -> refus
   | JSON.parse               -> échec = refus, message avec la position d'erreur
   | validation de schéma     -> refus si invalide (B5)
   | pushHistory()            -> l'import est annulable par Ctrl+Z
   | mode « Remplacer »  ou  mode « Ajouter »
   | reconstruction DOM
   | rebuildSelector / reapplyStackingOrder / renderMeasureResults / render
   | markDirty()  - rien n'est écrit sur le serveur automatiquement
   v showToast(bilan)
```

**Mode Remplacer** (par défaut) :

- purge DOM identique à l'import SVG (lignes 4654–4667 : `el`, `nameEl`, `pointEls`,
  `ptLabelEls`, `edgeEls`, `segLabelEls`, `radiusHandle`, `camMarkerEl`), puis
  `objects.length = 0; measures.length = 0; selectedKey = null;` ;
- objets rechargés via `normalizeObjects()` puis `createObjectDOM()` + `rebuildHandles()` ;
- mesures reprises telles quelles **après vérification** que les deux clés existent ;
- si `meta.lieu` est présent et qu'une parcelle existe sans `latitude`, réappliquer le lieu ;
- **le nom et l'id du projet courant ne changent pas** : on importe un contenu, pas une
  identité. Le `meta` du fichier est ignoré sauf `meta.lieu`. L'utilisateur enregistre
  ensuite dans le projet courant, ou fait `+ Nouveau projet` pour dériver ;
- `selectedKey` : la parcelle si elle existe, sinon le premier objet.

**Mode Ajouter** :

- collisions de clés : suffixe `-2`, `-3`… ; la table de correspondance `ancienne clé →
  nouvelle clé` est appliquée **aussi** aux mesures et à `terrasseLieeKey` ;
- un objet `parcelle` importé alors qu'une parcelle existe déjà est **renommé**
  (`parcelle-2`, `fonction:'terrain'`) : jamais deux objets de clé `parcelle` ;
- décalage optionnel : si l'emprise importée recouvre exactement l'existante, proposer
  « décaler les objets importés de 10 m vers l'est » (case à cocher, décochée).

**Avertissements post-import** (réutiliser la formulation existante ligne 4797) :

- aucun objet de clé `parcelle` → « certaines fonctions (mesures, alignement, contrainte à
  la parcelle) seront limitées tant qu'une parcelle n'existe pas » ;
- `n` mesure(s) ignorée(s) car leurs objets de référence sont absents.

## B5. Validation

| Règle | Action si violée |
|---|---|
| Taille ≤ 5 Mo | refus `FICHIER_TROP_GROS` |
| JSON valide | refus `JSON_INVALIDE` (indiquer la position) |
| `objects` est un tableau non vide | refus `AUCUN_OBJET` |
| chaque objet a `key` (chaîne non vide) et `type` parmi `polygon`, `path`, `circle` | objet ignoré, compté |
| `polygon`/`path` : `pts` tableau de 2 éléments minimum, coordonnées finies | objet ignoré, compté |
| `circle` : `center.x/y` finis, `r > 0` | objet ignoré, compté |
| clés dupliquées dans le fichier | dédoublonnage par suffixe, compté |
| `measures` est un tableau (ou absent) | traité comme `[]` |
| coordonnée supérieure à 100 000 m en valeur absolue | refus `COORDONNEES_ABERRANTES` (fichier probablement dans une autre unité) |

Bilan systématique dans le toast : `n objet(s) importé(s), m ignoré(s), k mesure(s) restaurée(s).`

## B6. Aller-retour (exigence de non-régression)

Export puis réimport en mode Remplacer, sur un projet contenant terrasse construite,
textures, clôture, parasol lié, points de vue et mesures, doit redonner un plan
**strictement identique**. Test : comparer `JSON.stringify(serializeObjects(objects))`
avant export et après import — égalité stricte attendue.

---

## 5. Critères d'acceptation

**Import cadastre**

- A1 — Une adresse française valide produit une parcelle affichée avec section, numéro,
  commune, surface cadastrale et surface calculée.
- A1b — **Cas de référence** : `2 allée des Limites, 78110 Le Vésinet` retourne **AE 101,
  716 m²**, sélectionnée automatiquement, alors que le point d'adresse est **hors de toute
  parcelle**. C'est le test de non-régression du chemin A4.1/A4.4.
- A1c — Une réponse contenant plus de 200 parcelles, ou dont le `code_insee` diffère du
  `citycode` de la BAN, **n'affiche jamais de résultat** : elle produit `REPONSE_SUSPECTE`
  (garde-fou du piège `lon`/`lat`, A4.2).
- A2 — L'aperçu montre la parcelle et ses voisines avant toute écriture ; annuler la modale
  ne modifie **rien** (ni mémoire, ni serveur, ni `dirty`).
- A3 — Cocher une voisine dans la liste la met en évidence sur l'aperçu, et réciproquement.
- A3b — La liste des mitoyennes est **complète** : elle vient d'une requête centrée sur la
  parcelle, pas sur le point d'adresse. Sur le cas de référence, 4 mitoyennes (AE 100, 103,
  102, 99) — une recherche limitée à la boîte d'adresse n'en voit que 2.
- A4 — Les parcelles importées sont **contiguës** dans le plan (aucun jeu ni recouvrement
  supérieur à 5 cm sur les limites communes).
- A5 — L'origine `(0,0)` du plan est le sommet le plus au nord de la parcelle principale ;
  Y+ pointe vers le nord réel (vérification : flèche Nord et ombre du parasol cohérentes).
- A6 — La surface calculée par `shoelace()` est à moins de 3 % de la `contenance` cadastrale
  (AE 101 : 723 m² calculés pour 716 m² cadastraux, soit 0,9 %).
- A7 — Après création, enregistrement, puis rechargement de la page : les métadonnées
  `cadastre` sont **toujours présentes** sur la parcelle (garde-fou contre l'oubli de M1).
- A8 — La clôture et la position du soleil s'appliquent à la parcelle **principale**, même
  avec 5 voisines importées (garde-fou M3).
- A9 — Sans réseau, la modale affiche une erreur explicite et l'application reste utilisable.
- A10 — La mention « ne vaut pas bornage » est visible avant la création du projet.

**Import / Export JSON**

- B1 — Le fichier exporté est accepté tel quel par `api.php?action=save` après remise à plat.
- B2 — Aller-retour export/import : plan strictement identique (§B6).
- B3 — Export « sans la parcelle » : le fichier ne contient **aucun** objet
  `fonction:'terrain'`, **aucune** mesure orpheline, **aucun** `terrasseLieeKey` mort.
- B4 — Ce fichier, réimporté dans un projet vierge, se charge sans erreur console.
- B5 — Un JSON malformé, tronqué ou issu d'un autre logiciel produit un message clair et
  **laisse le plan courant intact**.
- B6 — L'import est annulable par Ctrl+Z (un seul `pushHistory()`).
- B7 — En mode Ajouter, aucune clé dupliquée ne subsiste et les mesures importées pointent
  les bons objets renommés.
- B8 — L'import ne déclenche **aucune** écriture serveur ; le projet passe en
  « Modifications non enregistrées ».

---

## 6. Ordre d'implémentation conseillé

```text
1. B (export/import JSON)          - autonome, sans réseau, testable immédiatement
     et sert de filet de sécurité pour tester A (sauvegarder/restaurer des états)
2. M1 + M2 (liste blanche + clone) - préalable indispensable à A
3. A5/A6 (projection + normalisation) avec un GeoJSON figé en fixture
4. A3/A4 (géocodage + parcelle) + modale étapes 1-2
5. A7 (voisines + prévisualisation interactive)
6. A9 (création projet) + M3/M4 + mentions légales
```

---

## 7. Hors périmètre

Livré depuis (voir §10) : bâtiments BD TOPO avec hauteur, haies, zones de végétation,
arbres estimés, zonage PLU/GPU et lien règlement.

Reste hors périmètre :

- servitudes d'utilité publique et SPR détaillés ;
- orthophoto WMTS en calque ;
- fusion de parcelles en une emprise unique (union géométrique) ;
- généralisation de `constrained` à l'union des parcelles ;
- projection Lambert-93 exacte (inutile en dessous du kilomètre) ;
- historique cadastral et parcelles supprimées.

---

## 8. Annexe — Relevé réel (jeu de test de référence)

Requêtes exécutées le **26 août 2026** contre les services publics, à conserver comme
fixture de test (aucune clé, aucun quota constaté).

**Adresse (BAN)**

```text
GET https://api-adresse.data.gouv.fr/search/?q=2 allée des limites 78110 Le Vesinet
-> label   : "2 Allee des Limites 78110 Le Vésinet"
   score   : 0,9596      type : housenumber
   lon/lat : 2.132536, 48.905067
   citycode: 78650       x/y (L93) : 636411.41, 6867578.98
```

**Comportement du cadastre sur ce point**

| Requête | Résultat |
|---|---|
| `geom={"type":"Point","coordinates":[2.132536,48.905067]}` | **0 parcelle** (point sur la voirie, non cadastrée) |
| `lon=2.132536&lat=48.905067` | **1000 parcelles**, la 1re à **Aix-en-Provence** — paramètres ignorés |
| `geom=<carré ±20 m>` | **5 parcelles** (résultat exploitable) |
| `geom={"type":"Point","coordinates":[2.132811,48.905189]}` (centroïde AE 101) | **1 parcelle** : AE 101 |

**Les 5 candidats du carré ±20 m**, classés par distance au point d'adresse
(distances et aires calculées avec la projection §A5) :

| IDU | Section / n° | `contenance` | Aire calculée | Écart | Distance au point | Sommets |
|---|---|---:|---:|---:|---:|---:|
| 78650000AE0101 | AE 0101 | 716 m² | 723 m² | 0,9 % | **1,26 m** | 6 |
| 78650000AE0100 | AE 0100 | 693 m² | 687 m² | 0,9 % | 6,22 m | 8 |
| 78650000AE0103 | AE 0103 | 1000 m² | 1020 m² | 2,0 % | 6,23 m | 22 |
| 78650000AD0128 | AD 0128 | 782 m² | 786 m² | 0,5 % | 8,88 m | 20 |
| 78650000AE0098 | AE 0098 | 408 m² | 418 m² | 2,5 % | 20,02 m | 8 |

Le point d'adresse est **hors des cinq** polygones. L'écart entre le 1er et le 2e candidat
(4,96 m) dépasse le seuil de 3 m : sélection automatique de **AE 101**, qui est bien la
parcelle du projet de démonstration existant (`Parcelle AE 101`, 716 m²).

**Géométrie AE 101** (WGS84, `MultiPolygon` → `coordinates[0][0]`, anneau fermé, avant
simplification) :

```json
[[2.13260294,48.90503255],[2.13249541,48.90511613],[2.13287759,48.90536640],
 [2.13303283,48.90533406],[2.13297032,48.90515545],[2.13288675,48.90512787],
 [2.13260294,48.90503255]]
```

Après retrait du point de fermeture : **6 sommets**, prêts pour `pts` (§A5/A6).

---

## 9. Écarts entre la spec et le code livré

Trois points ont été tranchés autrement à l'implémentation, après essai réel.

| # | Spec | Code livré | Pourquoi |
|---|---|---|---|
| 1 | Bouton `+ Depuis une adresse` masqué hors mode serveur (§A2) | Bouton **toujours présent** ; sans `api.php`, la création charge le plan **en mémoire** (même chemin que l'import JSON) et le dit dans un toast | Un bouton absent sans explication est pire qu'un bouton qui annonce sa limite. Le plan reste récupérable par Export JSON. |
| 2 | Clic sur une parcelle de l'aperçu → nouvelle requête `geom=Point` intérieur (§A4.5) | **Aucune requête** : la géométrie et les attributs de toutes les candidates sont déjà chargés par la requête d'emprise | Re-interroger l'API pour une donnée déjà en main ajoute une latence et un mode d'échec pour rien. `geom=Point` reste la bonne forme si le besoin réapparaît (point **connu intérieur** — vérifié). |
| 3 | Liste des voisines re-rendue à chaque bascule (§A7) | Seuls l'aperçu et l'état des cases sont mis à jour ; la liste n'est pas reconstruite | Reconstruire remplace les `<input>` en cours d'utilisation : le clavier perd sa position, et toute référence gardée sur une case pointe un nœud détaché — bug constaté au premier essai (une seule des deux voisines cochées arrivait dans le projet). |

**Vérifié en fonctionnement** (adresse de test, appels réels aux deux services) : AE 101
sélectionnée automatiquement à 1,26 m ; **4 mitoyennes** trouvées par la requête centrée sur
la parcelle — AE 100 (41,4 m de limite commune), AE 103 (32,1 m), AE 102 (22,3 m), AE 99
(13,6 m) — les 8 autres parcelles du secteur (dont AD 128, séparée par la rue) reléguées dans
« autres » ; les cinq parcelles importées sont contiguës (distance minimale entre contours
0 à 2 mm, soit l'arrondi au millimètre) ;
origine du plan = sommet le plus au nord ; aires calculées 723 / 687 / 1020 m² conformes au
relevé de l'annexe ; aller-retour export/import JSON strictement identique ; undo restaure le
plan précédent.

**Non vérifié dans cet environnement** : la création côté serveur (`apiSave` + redirection),
faute de PHP en local. Ce chemin est exactement celui du bouton `+ Nouveau projet` déjà en
service (même `apiSave`, même `withProjectParam`).

---

## 10. BD TOPO, PLU et Vue 3D sans terrasse (27/08/2026)

### 10.1 Sources

| Donnée | Service | Couche / endpoint |
|---|---|---|
| Bâtiments (emprise + hauteur) | WFS Géoplateforme | `BDTOPO_V3:batiment` |
| Zones de végétation | WFS Géoplateforme | `BDTOPO_V3:zone_de_vegetation` |
| Haies | WFS Géoplateforme | `BDTOPO_V3:haie` |
| Zonage PLU + règlement | API Carto GPU | `zone-urba`, `municipality`, `prescription-surf` |

Deux pièges du WFS, vérifiés :

1. en `urn:ogc:def:crs:EPSG::4326`, l'ordre du `BBOX` est **lat, lon** — pas lon, lat ;
2. les valeurs numériques arrivent en **texte à virgule française** (`"5,2"`) : `parseFloat`
   seul tronque à `5`. D'où `nombreFr()`.

Les géométries BD TOPO portent une **3ᵉ coordonnée** (altitude) : `anneauVersPts()` n'en lit
que les deux premières, l'altitude reste dans les attributs (`altitude_minimale_sol`).

### 10.2 Attributs capturés (champ `bdtopo` de l'objet)

`cleabs`, `nature`, `usage_1`/`usage_2`, `hauteur` (et `hauteurRetenueM`),
`nombre_d_etages`, `nombre_de_logements`, `altitude_minimale_sol`, `altitude_minimale_toit`,
`construction_legere`, `etat_de_l_objet`, `date_d_apparition`, `identifiants_rnb`,
plus `surParcellePrincipale` et `recupereLe`.

**Hauteur retenue** : `hauteur` si renseignée ; sinon `nombre_d_etages × 2,7 m` (beaucoup
d'annexes n'ont pas de hauteur mesurée) ; sinon 2,5 m. Elle alimente `elevation`, donc
directement le volume en Vue 3D.

### 10.3 Objets produits

| Source | `fonction` | Verrouillé | Hauteur |
|---|---|---|---|
| Bâtiment **sur la parcelle** | `batiment` | non — on aligne une terrasse dessus | BD TOPO |
| Bâtiment **voisin** | `batiment` | oui — donnée de référence | BD TOPO |
| Haie | `massif` | non | `hauteur` BD TOPO, sinon 2 m |
| Zone de végétation | `massif` | non | par nature (forêt fermée 15 m, bois 12 m, verger 4 m…) |
| Arbre **estimé** | `arbre` (cercle r = 2,5 m) | non | hauteur de la zone |

Aucun n'est `constrained` : un bâtiment mitoyen déborde légitimement la limite, et la
contrainte le déformerait au premier déplacement.

**Arbres estimés** — la BD TOPO ne cartographie pas les arbres isolés. Une grille d'un arbre
pour 64 m² est répartie dans les zones de végétation, décalée d'un bruit **déterministe** :
deux imports de la même parcelle donnent exactement les mêmes arbres. C'est un ordre de
grandeur du couvert, jamais un relevé — dit explicitement dans l'infobulle, case décochée
par défaut, plafond de 60 arbres.

### 10.4 Rattachement aux parcelles

Un élément appartient à **toutes** les parcelles qu'il recouvre (`polygonesSeTouchent` :
sommet dans l'autre polygone, dans un sens ou dans l'autre, ou centroïde à l'intérieur) —
une annexe à cheval sur la limite arrive donc aussi bien avec la parcelle principale qu'avec
la voisine cochée. Les compteurs de l'étape 3 se recalculent à chaque coche : cocher une
voisine peut faire entrer son bâtiment dans le lot.

### 10.5 Onglet PLU

Nouvel onglet du panneau (Édition / Affichage / Mesure / **PLU** / Export) : commune, zone
(`libelle`, `libelong`, `typezone`), lien direct vers le **règlement PDF** (`urlfic`),
prescriptions surfaciques, date d'interrogation, et un lien vers le Géoportail de
l'urbanisme centré sur la parcelle. Le zonage est stocké **sur l'objet parcelle** (champ
`plu`), comme la clôture et le lieu : il se sauvegarde avec le projet et suit l'export JSON.
Un bouton permet de (re)lancer l'interrogation sur un projet existant.

`serializeObjects()` gagne donc **`bdtopo`** et **`plu`** dans sa liste blanche, et
`normalizeObjects()` les clone — même piège que `cadastre` (§A11/M1).

### 10.6 Vue 3D sans terrasse

`buildThreeScene(obj)` accepte désormais `obj = null` : seule la modélisation de la structure
(plots, solives, lambourdes, lames, contour) est sautée. Le centre de scène retombe sur la
parcelle, « tous les objets » devient implicite, et le point de vue enregistrable relit le
centre stocké dans `threeScene.cen` au lieu d'un centroïde de terrasse. Le sous-onglet 3D
reste accessible quand aucun objet n'a `fonction: 'terrasse'`, avec la mention
« Plan sans terrasse — vue 3D du terrain et des objets ». Les autres sous-onglets
(Construction, BOM, Coupe…) restent derrière le message d'accueil : ils n'auraient rien à
décrire.

### 10.7 Vérifié en fonctionnement

Adresse de test `2 allée des Limites` (urbain dense) :

- **7 bâtiments** importés avec les 5 mitoyennes cochées ; hauteurs 5,2 / 6,8 / 7,0 / 5,1 /
  2,7 / 4,9 / 2,7 m ; celui de la parcelle (5,1 m) déverrouillé, les 6 autres verrouillés ;
  identifiants RNB conservés ;
- PLU **UFb — « Quartier residentiel a parcellaire plus resserre »** + règlement PDF ;
- haies et végétation : **0** (couches vides en tissu pavillonnaire — cas nominal, pas une panne).

Point boisé `48.90714, 2.13011` (saisie de coordonnées, sans géocodage) :

- **5 bâtiments** (7,3 / 6,6 / 6,1 / 3,5 / 2,7 m), **1 zone de végétation** « Forêt fermée de
  feuillus » (hauteur retenue 15 m), **60 arbres estimés** ; PLU zone **UV** ;
- projet créé : 67 objets (1 terrain, 5 bâtiments, 1 massif, 60 arbres), aucune erreur console.

Vue 3D sans terrasse : scène construite et rendue après suppression de la terrasse du plan de
démonstration, puis sur un plan cadastral pur (parcelles + bâtiments), soleil et ombres portées
opérationnels dans les deux cas.

---

## 11. Propriété multi-parcelles, SUP/SPR, orthophoto (27/08/2026)

### 11.1 Une propriété, plusieurs parcelles

L'étape 3 de l'import propose deux cases par parcelle voisine :

| Case | Effet |
|---|---|
| **propriété** | la parcelle est **fusionnée** avec la principale : un seul objet terrain |
| **importer** | la parcelle reste un objet distinct, verrouillé, en décor de référence |

« Propriété » implique « importer » (case cochée et désactivée). Un résumé permanent annonce,
**avant** la création, la surface fusionnée réelle et le nombre de limites internes.

**Fusion par parcours d'arêtes**, pas par un moteur booléen : les parcelles cadastrales
mitoyennes partagent leur limite au centimètre près (mesuré : 0,000 m), donc

```text
1. redécoupage : un sommet du voisin tombant au milieu de mon arête la coupe en deux
   (sans quoi les deux arêtes ne se reconnaissent pas)
2. deux anneaux voisins parcourus dans le même sens traversent leur limite commune
   en sens OPPOSÉ -> une arête qui trouve sa jumelle inversée est interne, on la retire
3. les arêtes restantes se chaînent en un contour extérieur
4. échec (chaîne rompue, arêtes orphelines) -> AUCUNE fusion : les parcelles restent
   distinctes et le message le dit. Un contour faux serait pire qu'une absence de fusion.
```

Les arêtes retirées deviennent des objets **`fonction:'limite'`** : `type:'path'`, verrouillés,
tracés **en pointillé** (`stroke-dasharray`) et **ignorés par la 3D** — une limite cadastrale
est une information de plan, pas un ouvrage ; la modéliser poserait un ruban en travers du
terrain. Les segments sont recollés bout à bout en un trait par limite.

Un bâtiment est « chez soi » (donc déverrouillé) s'il touche **n'importe quelle** parcelle de
la propriété, plus seulement la principale.

Vérifié : `AE 101 + AE 100` → 1410 m² (723 + 687), 1 limite ; `AE 101 + AE 100 + AE 103` →
2430 m² (723 + 687 + 1020), 2 limites, contour à 23 sommets. Les sommes sont exactes.

### 11.2 Cadrage par défaut

Le cadrage d'ouverture suit le terrain quand il vient du cadastre (`parcelle.cadastre`
présent) : une propriété de 2 400 m² et une terrasse de 20 m² n'ont pas la même échelle. Un
plan dessiné à la main garde son cadrage historique — ses coordonnées ont été posées avec.
L'emprise de l'orthophoto suit la même règle : elle se calcule sur l'étendue réelle des objets
du plan, donc sur la sélection de parcelles.

### 11.3 Sélecteur d'objets groupé

Un plan cadastral en compte facilement 60 (les arbres estimés à eux seuls) : la rangée à plat
occupait la moitié de l'écran. Les objets sont désormais groupés par fonction — une rangée de
familles avec compteurs (`Tout 67`, `Terrain 1`, `Bâtiment 7`, `Arbre 60`…), puis les boutons
de la famille dépliée, dans une liste bornée à 5,4 rem et scrollable. Chaque objet reste un
bouton. Sélectionner un objet d'une famille repliée (clic sur le plan, undo) rouvre « Tout »,
sinon la sélection serait invisible. Mesuré : 61 px de haut au total.

### 11.4 Servitudes d'utilité publique et SPR

Ajout de `assiette-sup-s/l/p` (l'emprise qui touche la parcelle) joint à `generateur-sup-s`
(ce qui la produit) par `idgen` : c'est le générateur qui porte le type réel. Ajout aussi de
`info-surf` (informations, ex. droit de préemption) et `document`.

**Le SPR n'a pas d'endpoint dédié** : c'est une servitude de type **AC4**, reconnue comme
telle et affichée à part, avec la mention que tous les travaux visibles depuis l'espace public
passent par l'Architecte des Bâtiments de France.

Vérifié sur Le Vésinet : **AC4 « Site patrimonial remarquable du Vésinet »** (périmètre du
SPR, limite « plus précise que le cadastre », acte
`AC4_Site-patrimonial-remarquable-du-Vesinet_20180125_act.pdf`) et **AC2 « Secteur résidentiel
d'habitations individuelles »** (site inscrit).

⚠️ `acte-sup` **ignore le paramètre `geom`** (5000 résultats renvoyés) : il ne se filtre que par
`partition`, et même là il rend tous les actes du département. Il n'est donc pas interrogé —
les actes se téléchargent depuis la page territoire.

**Lien territoire** : `https://www.geoportail-urbanisme.gouv.fr/territoire/<INSEE>` (ex.
`78650`), ajouté à l'onglet PLU. C'est la seule page qui rassemble règlement, annexes et actes
des servitudes — l'API ne donne pas d'URL directe pour les actes.

### 11.5 Orthophoto WMTS en calque

```text
https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0
  &LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM
  &FORMAT=image/jpeg&TILEMATRIX=<z>&TILEROW=<y>&TILECOL=<x>
```

Sans clé, avec `access-control-allow-origin: *`.

- **Calage** : le plan est en mètres dans un repère local, les tuiles en longitude/latitude. Le
  raccord se fait par l'origine (0,0) du plan, dont la position réelle est enregistrée à
  l'import (`cadastre.origineLat/Lon`). Sans import cadastre, repli sur le lieu déclaré de la
  parcelle calé sur son centroïde — annoncé comme approximatif dans le message.
- **Niveau de zoom** : le plus détaillé qui tienne en 36 tuiles, puis **descente automatique**.
  La couverture ne va pas au même zoom partout : sur cette commune le **niveau 20 répond 404**
  alors que le 19 sert l'image, et un niveau absent ne se signale que par des 404 sur toutes
  ses tuiles. Une **tuile d'essai** est donc demandée avant les autres — sinon seize 404 par
  tentative noieraient les vraies erreurs de la console.
- **Tuiles en data URI**, jamais en `href` distant : une image d'un autre domaine « salit » le
  canevas et ferait échouer l'export PNG, et l'export SVG ne serait plus autonome. Vérifié :
  PNG exporté à 587 Ko avec le fond actif.
- **Non enregistrée avec le projet** : les tuiles sont retéléchargées à l'affichage (projet
  resté à 14 Ko), et le calque se règle en opacité (20–100 %).
- **En 3D** : les mêmes tuiles deviennent le sol, une dalle par tuile, en matériau **éclairé**
  pour que la photo suive le soleil — une image en pleine lumière sur une scène de nuit
  trahirait l'heure choisie.

Vérifié : 4 tuiles au niveau 19 sur une parcelle seule, 6 sur la propriété fusionnée ; emprise
du fond contenant tout le plan ; une seule 404 dans la console (la tuile d'essai du niveau 20).

### 11.6 Transparence de la parcelle sous le fond, et persistance des réglages

**Le problème** : un terrain rempli à 100 % masque exactement ce que le fond aérien est venu
montrer. Le remplissage du terrain devient donc réglable — **15 % par défaut**, valeur
proposée comme « conseillée » et rappelable d'un bouton : en dessous de 10 % la parcelle
disparaît, au-delà de 30 % la photo devient laiteuse.

Points de conception :

- la transparence est appliquée **à l'affichage**, dans `render()`, sans toucher au
  `fillOpacity` de l'objet. Le projet n'est pas modifié par le fait de regarder une photo, et
  décocher le fond rend au terrain son remplissage d'origine ;
- elle vise **tous les terrains** (`key === 'parcelle'` ou `fonction === 'terrain'`), donc
  aussi les parcelles voisines importées ;
- le **contour et les cotes ne bougent pas** : c'est le contour qui porte l'information, pas
  l'aplat de couleur.

**Emplacement des commandes** : la case d'activation est en haut de page, dans la barre des
modes (à droite) — c'est une bascule qu'on actionne souvent, depuis n'importe quel onglet. Les
réglages fins (opacité de la photo, remplissage de la parcelle) restent dans l'onglet
**Affichage**.

**Persistance** : `actif`, `opacite` et `parcelleOpacite` sont rangés dans un champ `ortho` sur
l'objet parcelle — comme la clôture, le lieu et le zonage PLU. Ils se sauvegardent avec le
projet, suivent l'export/import JSON, et le fond se rallume tout seul à l'ouverture d'un projet
qui l'avait actif. Les **tuiles**, elles, ne sont pas enregistrées : elles se retéléchargent
(projet resté à 11 Ko).

Deux garde-fous :

- `enregistrerConfigOrtho()` ne marque le projet modifié **que si une valeur change vraiment** :
  sans cela, la restauration au chargement repasserait par là avec les valeurs enregistrées et
  tout projet à fond actif s'ouvrirait en « modifications non enregistrées » ;
- au chargement d'un projet **sans** réglage enregistré, le fond est éteint plutôt que laissé
  tel quel : les tuiles du projet précédent étaient calées sur une autre parcelle.

`referenceGeoPlan()` passe par `lieuActuel()` et non par `parcelle.latitude` en direct : sur un
plan qui n'a jamais servi au soleil ni à la 3D, les champs de lieu ne sont pas encore posés sur
la parcelle, et les lire crus faisait répondre « aucune parcelle géolocalisée » à un plan qui a
pourtant une position déclarée.

Vérifié : fond activé → parcelle à 0,15 ; curseur à 40 % → 0,4 ; bouton conseillé → 0,15 ; fond
décoché → remplissage d'origine (1) ; export JSON portant `ortho:{actif:true, opacite:0.7,
parcelleOpacite:0.3}` ; réimport → fond rallumé, 6 tuiles, curseur à 30 %.

---

## 12. Recalage d'un plan existant sur le cadastre, et actualisation IGN (27/08/2026)

### 12.1 Le problème

Un plan dessiné à la main a un contour de parcelle approximatif, et **tout son contenu est
positionné par rapport à ce contour**. Remplacer simplement le polygone par le contour
cadastral déplacerait la maison, la terrasse et les chemins par rapport à leur terrain.

### 12.2 Recalage par ICP (similitude)

```text
1. contour cadastral -> mètres, origine = sommet le plus au nord (convention de l'appli)
2. ancien contour échantillonné tous les 0,5 m (les côtés longs doivent peser
   autant que les coins)
3. ICP : 72 rotations de départ x 30 itérations, correspondance point -> point le
   plus proche du contour cadastral, ajustement d'une similitude (rotation, échelle,
   translation) à chaque tour, on garde le meilleur résidu
4. la transformation trouvée s'applique à TOUT le plan ; la parcelle, elle, prend la
   géométrie cadastrale exacte
```

Ce qui suit la transformation, au-delà des sommets : les centres et rayons de cercles, la
largeur des chemins, **l'angle du mât de parasol** (`matAngleDeg`, 0 = Est), et les **vues 3D
enregistrées** (`construction.vues3d`) dont les positions vivent dans le repère de la scène
(X = Est, Z = Sud) et tournent donc de −θ. Les hauteurs (élévation, altitude, hauteur de
clôture, diamètre d'arbre) ne sont **pas** mises à l'échelle : 0,4 % sur une hauteur ne veut
rien dire et ressemblerait à une corruption de données.

Les noms donnés par l'utilisateur (« Sud-Ouest (rue) », « Coin Nord »…) sont reportés sur le
nouveau contour par proximité — sommet à moins de 4 m, côté dont le milieu est le plus proche
et la direction à moins de 35°. C'est du contenu : il ne doit pas disparaître au recalage.

**Résultat mesuré** sur `parcelle-ae-101-20260827.json` → AE 101 :

| | |
|---|---|
| Rotation | **16,03°** |
| Échelle | **1,00412** (+0,4 %) |
| Écart moyen au contour cadastral | **6,4 cm** |
| Transformé | 126 sommets, 6 cercles, 5 vues 3D |
| Noms de côtés reportés | 5 sur 6 |
| Aire | 718,7 m² (dessin) → **723 m²** (cadastre, contenance 716 m²) |

Les seuls objets qui dépassent après recalage sont ceux qui étaient dessinés **sur** l'ancienne
limite : 4 à 8 cm au-delà de la limite cadastrale, soit le résidu du recalage.

### 12.3 Le projet par défaut de l'application

`DEMO_OBJECTS` n'est plus le jeu de démonstration d'origine mais **ce plan recalé** (35 objets),
accompagné d'un nouveau `DEMO_MEASURES` (11 mesures — l'ancien bloc de démo n'en avait aucune).
Le projet embarque son zonage PLU, donc l'application s'ouvre sans réseau sur un plan complet
et déjà « propre » : contour cadastral exact, point de calage enregistré (donc orthophoto
calée au centimètre), PLU/SPR/servitudes consultables hors ligne.

### 12.4 Actualisation depuis l'IGN

Bouton **« ↻ Actualiser IGN »** dans la barre de projet.

**Règle** : on remplace ce qui vient de l'API — contour cadastral (relu par
`code_insee`+`section`+`numero`, pas par emprise), objets porteurs d'un champ `bdtopo`, zonage
PLU — et **on n'importe rien de nouveau**. Un bâtiment jamais importé ne doit pas apparaître
d'un coup en doublon de celui dessiné à la main ; pour ajouter des couches, c'est l'import
depuis une adresse qui sert.

Points de conception :

- **le repère ne bouge pas** : la reprojection se cale sur `cadastre.origineLat/Lon`, le point
  (0,0) du plan. Sans cela, tout le contenu se décalerait par rapport à sa parcelle à chaque
  actualisation. Vérifié : après actualisation, déplacement des objets utilisateur = **0,0000 m** ;
- une **propriété fusionnée** garde son contour : le remplacer par celui d'une seule de ses
  parcelles amputerait le terrain ;
- nom, couleurs, verrouillage et textures d'un objet IGN sont des choix de l'utilisateur :
  l'actualisation ne touche qu'à la géométrie et aux attributs IGN (dont la hauteur) ;
- un objet dont l'identifiant a disparu de la base est **conservé** et signalé (bâtiment démoli,
  ou remaniement d'identifiants), jamais supprimé en silence ;
- l'opération passe par `pushHistory()` : elle s'annule au Ctrl+Z.

Vérifié sur le projet par défaut : « parcelle actualisée (écart max 0 cm) ; PLU : zone UFb »,
35 objets avant et après, aucune erreur console.

### 12.5 Deux pièges PowerShell rencontrés en produisant ce recalage

Sans rapport avec l'application, mais ils ont coûté deux passes chacun :

- la **virgule lie plus fort** que les opérateurs arithmétiques : `@( $a*$b, $c*$d )` se lit
  `@( $a * ($b,$c) * $d )` et échoue sur « Object[] ne contient pas op_Multiply ». Chaque
  élément d'un tableau littéral doit être parenthésé ;
- les **noms de variables sont insensibles à la casse** : `$P` et `$p` sont la même variable,
  donc `foreach($p in …)` écrase le tableau `$P` — silencieusement si les types sont
  compatibles.

### 12.6 Passe de non-régression sur le nouveau jeu par défaut

Le projet par défaut n'est plus le petit jeu de démonstration mais un plan réel (35 objets,
11 mesures, terrasse construite avec BOM, textures, clôture, 6 points de vue). Vérifié
intégralement après la bascule :

| Fonction | Résultat |
|---|---|
| Démarrage | 35 objets, 11 mesures, aucune erreur console |
| Mode Terrasse | les 7 sous-onglets rendent du contenu (BOM, Coupe, Implantation, Chantier, Méthode…) |
| Exports | SVG 24 Ko, DXF 5 Ko, PDF 16 Ko, PNG 707 Ko, résumé texte |
| Export GLB + visionneuse | 40,6 Mo générés puis relus, lieu affiché = 48,9052 N / 2,1328 E (le vrai, désormais) |
| Annuler (Ctrl+Z) | état restauré à l'identique après ajout d'un objet |
| Orthophoto | 4 tuiles niveau 19, **calage exact** (plus de mention « approximatif »), parcelle à 15 % |
| Vue 3D | scène construite, sol orthophoto, soleil à 44° SE |
| Actualiser IGN | « parcelle actualisée (écart max 0 cm) ; PLU : zone UFb », 0,0000 m de déplacement |

Un fichier `servir.ps1` accompagne désormais le projet : en `file://`, les navigateurs bloquent
les appels aux API IGN (origine `null`), donc l'import cadastre, le PLU et l'orthophoto sont
indisponibles. `pwsh -File servir.ps1` puis `http://localhost:8765/plan.html` lève cette limite.

### 12.7 Le bouton « en faire la parcelle principale » (§A7), enfin implémenté

Il était prescrit en §A7 depuis la première version de la spec et n'avait jamais été écrit :
seule l'étape 2 permettait de changer de parcelle principale. Or c'est à l'**étape 3** qu'on
voit le voisinage en entier, donc là qu'on se rend compte d'avoir désigné la mauvaise parcelle.

Chaque ligne de voisine porte désormais un bouton **« ↑ principale »**. Le changement relance
tout — voisinage requêté autour de la nouvelle parcelle, adjacences recalculées, éléments
BD TOPO rerattachés, nom du projet mis à jour, et origine du plan reprise à la création —
jamais un remplacement partiel de géométrie.

Vérifié : depuis AE 101 (mitoyennes AE 100, 103, 102, 99), un clic sur « ↑ principale » d'AE 103
donne AE 103 en principale avec AE 101 et AE 102 comme mitoyennes, et le nom du projet passe à
« AE 103 — 2 Allee des Limites ». Le retour à AE 101 par le même bouton restitue l'état de
départ, et la création produit bien une parcelle AE 101 de 723 m², origine au sommet le plus au
nord (48,9053664 N / 2,1328776 E).

**Défaut trouvé en testant** : le résumé de propriété (« Propriété : AE 101 seule… ») restait
vide à l'arrivée sur l'étape 3 — il n'était rempli que par `rafraichirVue()`, donc au premier
clic. C'est la ligne qui annonce quelle parcelle est la principale et la surface qui sera créée :
elle est maintenant remplie à la construction de l'étape.

### 12.8 Filtres du sélecteur : correction et défaut sur « Terrain »

Les boutons de famille ne filtraient rien. La cause était un garde-fou écrit pour la
sélection : « si l'objet sélectionné n'appartient pas à la famille affichée, repasser sur
Tout ». Comme la sélection courante (la terrasse, à l'ouverture) n'est presque jamais dans la
famille qu'on vient de choisir, le filtre était annulé dans la foulée du clic — la rangée
complète revenait, et les boutons de famille paraissaient inertes.

Corrigé en inversant la règle : le filtre tient, et c'est **l'objet sélectionné qui s'ajoute**
à la liste s'il en est absent, avec un **contour en pointillé** et une infobulle « sélectionné,
hors du filtre courant » pour qu'il ne passe pas pour un membre de la famille. Sa sélection
reste donc toujours visible et cliquable, sans casser le filtrage.

Le filtre d'ouverture est désormais **« Terrain »** : c'est la parcelle qu'on regarde en
arrivant, et sur un plan cadastral les 60 autres boutons n'ont pas à occuper l'écran avant
qu'on les demande.

Vérifié : à l'ouverture, 2 boutons (Parcelle AE 101 + la terrasse sélectionnée, en pointillé)
au lieu de 35 ; filtre Chemin avec la Maison sélectionnée → 5 chemins + Maison en pointillé ;
sélectionner un chemin → 5 boutons, aucun hors filtre ; le filtre survit aux clics sur les
objets.

### 12.9 Sélecteur : catégorie, option, sélection courante

Trois niveaux de lecture désormais distincts :

```text
CATÉGORIE   [ TOUT 35 ] [ TERRAIN 1 ] [ BÂTIMENT 2 ] [ CHEMIN 5 ] …   pastilles arrondies,
                                                                       sans serif, majuscules
┌───────────────┐
│ TERRASSE      │   [ Terrasse ] [ Table ]            objets de la catégorie, boutons serif
│ **Terrasse**  │                                     comme le reste du document
└───────────────┘
 sélection courante, à gauche, place fixe
```

- la **catégorie** se choisit en haut, en pastilles arrondies sans serif et en majuscules, avec
  son compteur en gris ; les **objets** gardent le bouton serif du reste du document ;
- la **sélection courante** quitte la liste et prend une place fixe à gauche : on sait ce qu'on
  édite sans le chercher, quel que soit le filtre. Elle affiche la catégorie de l'objet
  au-dessus de son nom, et un clic bascule le filtre sur **sa** catégorie ;
- un objet **hors du filtre n'apparaît plus** dans la liste (l'ajout en pointillé de la version
  précédente disparaît : la pastille de gauche joue ce rôle, et mieux).

⚠️ Piège CSS : `.objbtn` est déclaré **plus bas** dans la feuille de style. À spécificité égale
(`.fambtn` vs `.objbtn`) c'est lui qui l'emporte, et la pastille reprenait la police serif et
les angles droits d'un bouton d'objet — les deux niveaux se confondaient à nouveau. D'où le
sélecteur descendant `.selectorFamilles .fambtn`.

Vérifié : catégorie en Helvetica 10,9 px, majuscules, rayon 11 px ; objet en Georgia 12,2 px,
rayon 2 px ; sélection à gauche de la liste ; à l'ouverture (catégorie Terrain) la liste ne
contient que « Parcelle AE 101 » alors que la terrasse est sélectionnée ; hauteur totale du
sélecteur 60 px.

### 12.10 Actualisation : portée au choix, import du voisinage, masquage

**Le bouton ouvre désormais un dialogue** au lieu d'agir aussitôt. Actualiser le seul contour
cadastral n'a pas le même effet que rejouer toutes les couches, et *ajouter le voisinage est un
import* — cela ne doit jamais partir d'un simple clic sur un bouton nommé « actualiser ».

| Choix | Effet |
|---|---|
| **La parcelle seule** (défaut) | contour cadastral + zonage PLU. Rien d'autre n'est interrogé. |
| **Tout ce qui vient de l'IGN** | + les objets BD TOPO déjà présents dans le plan (compte affiché) |
| ☐ **Ajouter les parcelles adjacentes** | import de voisinage, avec trois sous-options : bâti principal et annexes, haies et végétation, arbres estimés |

L'import de voisinage projette dans le repère du plan (origine enregistrée), donc **rien de ce
qui existe ne bouge**, et écarte les doublons par identifiant (`idu` cadastral, `id` BD TOPO) :
rejouer l'opération n'ajoute rien la seconde fois — vérifié, « voisinage : rien de nouveau à
ajouter ».

**Marquage et masquage.** Tout objet arrivé par cet import porte `voisinage: true`. Une case
**🏘️ Voisinage** en haut à droite (à côté du fond orthophoto) le masque d'un coup, sur le plan
**et en 3D**. Trois précautions :

- le champ `hidden` propre à chaque objet n'est pas touché : décocher puis recocher ne
  ressusciterait pas des objets que l'utilisateur avait masqués lui-même. Le masquage passe par
  un `objetMasque(o)` unique, seule porte d'entrée du rendu 2D et de la boucle objets de la 3D ;
- la case n'apparaît **que s'il y a du voisinage** à masquer — une bascule sans effet visible
  ferait douter de ce qu'elle commande — et son infobulle annonce le nombre d'objets concernés ;
- le réglage se range dans `parcelle.affichage.voisinage`, donc il se sauvegarde avec le projet,
  comme la configuration de l'orthophoto.

**Vérifié** sur le plan par défaut : import de voisinage → **4 parcelles adjacentes et 6
bâtiments** ajoutés (35 → 45 objets, catégories Terrain 5 / Bâtiment 8) ; la case masque
exactement 10 objets (45 → 35 formes dessinées) et les restitue ; relance sans doublon ;
`affichage:{voisinage:false}` présent dans l'export JSON.

Pour la 3D, la luminance moyenne ne bouge pas assez pour trancher (les bâtiments voisins pèsent
peu dans un cadrage large dominé par le sol et le ciel). La mesure décisive est le **GLB, qui est
construit depuis la scène 3D** : 41 498 336 octets voisinage affiché contre 41 473 500 masqué,
soit **24 836 octets de géométrie en moins** — la scène 3D exclut bien le voisinage.

### 12.11 Grille du plan : bascule sur le canevas

Bouton **▦** posé sur le canevas 2D lui-même (coin haut-gauche), pas dans un panneau : c'est un
réglage qu'on actionne en regardant le plan. La grille sert à estimer les distances pendant le
travail et gêne dès qu'on regarde le plan pour lui-même — fond orthophoto, capture d'écran,
présentation. Le bouton s'éteint visuellement quand la grille est masquée, et son infobulle dit
l'action à venir (« Masquer » / « Afficher »).

Le réglage rejoint `parcelle.affichage` à côté du masquage du voisinage — un seul
`enregistrerAffichage()` pour les deux, qui n'écrit rien tant que tout est aux valeurs par
défaut (sinon un projet qui n'y a jamais touché gagnerait le champ, et son rechargement le
ferait passer en « modifications non enregistrées »).

Les exports ne dessinent pas de grille (SVG, PDF, DXF n'en ont jamais eu) ; le PNG, qui
rastérise le SVG vivant, suit donc la bascule sans traitement particulier.

**Défaut trouvé en testant** : après import d'un projet enregistré grille masquée, le bouton
revenait bien éteint… et la grille restait affichée. `restaurerAffichageDuProjet()` remettait
l'état et l'apparence du bouton, mais l'import avait déjà dessiné le plan avec les valeurs
précédentes et rien ne redessinait ensuite. La fonction termine désormais par un rendu (et une
reconstruction de la scène 3D, que le masquage du voisinage affecte aussi).

Vérifié : 38 lignes de grille au démarrage → 0 masquée → 38 réaffichées ; `affichage:{grille:
false}` dans l'export JSON ; réimport → bouton éteint **et** 0 ligne.

### 12.12 Passage en Vue 3D : suppression du blocage

**Mesuré avant de toucher au code** (`PerformanceObserver`, entrées `longtask`) : le passage en
Vue 3D produisait **une seule tâche synchrone de 1 208 ms**, canevas affiché à 1 694 ms. Pendant
cette tâche la page est figée — c'est le « big delay before being able to navigate ».

Attribution du coût, par différence sur des reconstructions successives (chaque bascule de case
reconstruit la scène) :

| | coût |
|---|---:|
| Reconstruction complète | 527 ms |
| … sans les textures | 471 ms |
| … sans les autres objets du plan | 374 ms |
| … sans la clôture | 363 ms |

Autrement dit **~360 ms pour la seule structure de la terrasse** (une pièce de bois = un mesh,
il y en a plusieurs centaines), ~100 ms pour les 35 objets du plan, ~55 ms pour les textures.
Les téléchargements de textures, eux, ne bloquent rien (asynchrones, et déjà en cache).

**Correction** : la structure de la terrasse est isolée dans `construireStructureTerrasse()` et
exécutée **après le premier rendu**, en `setTimeout(…, 0)`. Le terrain, les bâtiments, le sol et
la caméra sont prêts avant : on navigue pendant que le platelage se pose.

Deux précautions :

- `setTimeout` et non `requestAnimationFrame` : rAF ne se déclenche pas quand l'onglet est en
  arrière-plan, et la terrasse ne serait alors jamais construite ;
- garde d'identité (`threeScene !== sceneCourante`) : la scène peut avoir été remplacée entre
  temps (retour au plan, case cochée) et construire dans une scène morte laisserait des meshes
  orphelins et un canevas noir. Testé par un aller-retour Plan → 3D → Plan dans le même tick :
  aucune erreur.
- les ombres sont réappliquées après la construction différée, sinon les pièces arrivées ensuite
  ne projetteraient rien.

**Résultat mesuré** :

| | avant | après |
|---|---:|---:|
| Canevas affiché | 1 694 ms | **518 ms** |
| Plus longue tâche bloquante | 1 208 ms | **260 ms** |
| Blocage à chaque reconstruction | 527 ms | **284 ms** |

Preuve que la structure différée est bien construite : le GLB exporté depuis la scène 3D contient
**200 maillages / 203 nœuds** pour 35 objets de plan — les ~180 autres sont les pièces de bois de
la terrasse. (Les mesures de luminance ou de teinte ne tranchaient pas : trop de bruit entre deux
reconstructions.)

### 12.13 Dossier PDF : plan de masse + une section par terrasse

**Où l'implémenter.** L'export PDF existant sort *une* vue du plan à l'échelle demandée, avec ses
deux pages numérotées en dur dans l'écrivain PDF. Le dossier est un autre document : format A4
fixe, nombre de pages variable. Il est donc posé à côté, dans l'onglet **Export**, avec un
assembleur PDF générique (`assemblerPDF(pages)`) qui calcule la numérotation des objets ; l'export
existant n'est pas touché.

**Contenu produit**

| Page | Contenu |
|---|---|
| 1 | Plan de masse : parcelle, bâtiments, terrasses retenues repérées **S1, S2…**, emprise des équipements ; flèche Nord, échelle graphique et échelle numérique, cartouche (projet, parcelle, commune, surface) |
| 2…n | Une section par terrasse : son plan **coté sur chaque côté** (texte orienté dans le sens du côté, décalé vers l'extérieur), l'emprise des équipements nommés, Nord et échelle, puis le **tableau des dimensions** |

Le tableau donne, côté par côté, le nom donné par l'utilisateur et sa longueur ; puis une ligne
terrasse (périmètre, surface, hauteur finie) ; puis une ligne par équipement (emprise — diamètre
pour un cercle, L × l pour un polygone —, surface, hauteur) et le total d'emprise en % de la
terrasse.

**Équipement « sur la terrasse »** : tout objet dont le centre tombe dans le polygone, hors
terrain, limite cadastrale, point de vue, chemin et autres terrasses. Le spa, le mobilier et le
parasol en font donc partie. Case pour les exclure entièrement.

**Échelle** : choisie automatiquement par page dans une liste normalisée (1/10 à 1/2000) — la
plus détaillée qui tienne dans la zone de dessin — et rappelée sous le dessin avec une échelle
graphique. Une page de terrasse est donc bien plus détaillée que le plan de masse.

**Vérifié** sur le plan par défaut (2 terrasses, 3 équipements) :

- 3 pages, `/Kids [4 0 R 6 0 R 8 0 R]`, 14 objets, **0 offset de table xref invalide** (le défaut
  classique d'un PDF écrit à la main), 3 flux dont la `/Length` correspond exactement, `%%EOF` ;
- **aucune coordonnée hors de la boîte A4** sur les 202 tracés des 3 pages ;
- page 1 : repères S1/S2, Nord, « Echelle 1/250 » ; page 2 : 6 côtés cotés (4,72 / 2,84 / 2,52 /
  3,12 / 3,50 / 11,81 m) repris dans le tableau ; page 3 : la Table (3,01 × 4,02 m) et son
  parasol ;
- variantes : sans équipements → 3 pages / 0 équipement coté ; une seule terrasse → 2 pages ;
  aucune terrasse cochée → refus explicite, pas de fichier vide.

⚠️ Non vérifié : le **rendu visuel** du PDF. La validation porte sur la structure, les
coordonnées et les textes ; l'aspect (chevauchement de cotes sur une forme très découpée, par
exemple) demande un œil sur le document.

### 12.14 Dossier PDF : cotation reportée, angles, parasols et mesures

Cinq corrections après première lecture du dossier :

1. **Parasols retirés** des équipements cotés : la toile d'un parasol n'est pas une emprise au
   sol, la coter sur un plan d'exécution induirait en erreur. Le plan de test passe ainsi de
   3 équipements à 1 (le spa), et la Table n'en a plus.
2. **Colonne « Hauteur » supprimée** du tableau, et la hauteur finie retirée du sous-titre —
   remplacée par le périmètre.
3. **Angles en degrés** : à chaque sommet, posé à l'intérieur du contour sur la bissectrice, et
   repris dans le tableau en regard du côté qui démarre à ce sommet (c'est celui qu'on trace en
   premier sur place). Mesuré : 67°, 89°, 90°… sur les deux terrasses.
4. **Cotation reportée à l'extérieur** : ligne de cote parallèle au côté, décalée de 17 pt vers
   l'extérieur du contour, avec ses lignes d'attache ; le texte est centré sur cette ligne, jamais
   à l'envers, et n'est plus posé sur le segment lui-même — où il se confondait avec le trait de
   la terrasse dès que la forme se complique.
5. **Mesures du projet sur le plan de masse** : celles dont l'affichage est coché dans l'onglet
   Mesure (7 sur le plan de test), avec leur trait fin pointillé vers l'extérieur de la parcelle
   et leur valeur au bout — même convention et mêmes helpers (`computeMeasureGeom`,
   `measureOutsideAnchor`) que le plan vivant et l'export PDF existant.

**Deux débordements de page corrigés au passage**, tous deux invisibles à la lecture du code :

- l'échelle était choisie sur le seul polygone, sans compter la cotation qui déborde d'environ
  25 pt de chaque côté : sur une forme qui remplit la zone de dessin, les cotes sortaient de la
  feuille. La zone utile est maintenant réduite d'autant avant le choix de l'échelle ;
- la flèche Nord était placée par rapport à la zone de dessin **recentrée** (`decY + dispoH`) :
  avec un petit objet, le décalage de centrage la poussait à y ≈ 850 sur une feuille de 842 pt.
  Elle est désormais calée sur la page.

Vérifié : 3 pages, 0 offset xref invalide, **0 coordonnée hors page sur les 280 tracés**, 0
mention de hauteur, 0 parasol ; échelles 1/250 (masse), 1/75 et 1/50 (terrasses).

### 12.15 Type « Annexe », cotation de la parcelle, correction de la cotation

**Nouveau type d'objet `annexe`** (abri de jardin, garage, local technique) : ajouté à la liste
des fonctions, au dictionnaire des libellés du sélecteur, et aux hauteurs par défaut de la 3D
(2,5 m). Le plan de masse du dossier dessine les annexes au même titre que les bâtiments.
L'abri de jardin du plan par défaut passe en `annexe` — il apparaît donc dans sa propre
catégorie du sélecteur.

**Plan de masse** : les mesures du projet sont retirées, remplacées par la **cotation des côtés
de la parcelle** (6 côtés sur le plan de test : 12,19 / 39,49 / 11,94 / 20,38 / 6,85 / 23,35 m).

**La cotation devient une brique commune** aux deux types de page (`cotationPolygone`,
`anglesPolygone`), ce qui corrige le défaut signalé :

> ⚠️ La normale sortante était choisie **en comparant au centroïde** du polygone. Sur une forme
> concave, le centroïde peut tomber du mauvais côté d'un côté rentrant : la cote partait alors
> vers l'intérieur et se posait sur le trait. Elle se déduit maintenant du **sens de parcours**
> (aire signée), ce qui est correct pour tout polygone simple, concave compris. Le texte est en
> outre décalé de 5 pt au-dessus de la ligne de cote, au lieu de 3,5.

**Vérifié par test géométrique sur le PDF produit** (extraction des chemins et des matrices de
texte du flux, puis point-dans-polygone) : **0 cote à l'intérieur du contour** sur les trois
pages — 6 sur la parcelle, 6 sur la Terrasse, 4 sur la Table.

**Échelle de la page terrasse** déplacée à droite et 34 pt au-dessus du tableau : posée juste
au-dessus de lui, sa mention « Echelle 1/x » se superposait au titre « Dimensions ».

### 12.16 Plan de masse : ni parcelle ni bâti secondaires

Un plan de masse montre **la propriété**, pas le quartier. Le dossier ne trace donc que la
parcelle principale et le bâti qui lui appartient. Le bâti secondaire se reconnaît à trois
marqueurs, selon la façon dont il est entré dans le plan :

| Marqueur | Origine |
|---|---|
| `voisinage === true` | import de voisinage depuis « ↻ Actualiser IGN » |
| `bdtopo.surParcellePrincipale === false` | import cadastre initial, parcelles voisines cochées |
| centre hors de la parcelle principale | bâtiment dessiné à la main, sans métadonnée |

Le troisième critère rattrape les deux premiers : un objet sans aucune métadonnée IGN est jugé
sur sa position, ce qui reste vrai quelle que soit son origine.

**Vérifié** : sur le plan par défaut, le plan de masse contient 5 formes (parcelle 6 sommets,
maison 14, abri 6, deux terrasses 6 et 4) à l'échelle 1/250. Après un import de voisinage qui
ajoute **4 parcelles adjacentes et 6 bâtiments** au projet (35 → 45 objets), le plan de masse
contient **exactement les mêmes 5 formes, à la même échelle** : le cadrage ne s'élargit même pas
au voisinage.

### 12.17 Voisinage masqué : disparition du sélecteur aussi

Masquer le voisinage le retire désormais **des catégories et de la liste d'objets** au-dessus du
plan, pas seulement du dessin : proposer de sélectionner un objet qu'on ne voit pas n'a pas de
sens, et les compteurs annonceraient un plan qui n'est pas celui affiché.

Distinction importante : un objet masqué **individuellement** (case du tableau « Affichage par
objet ») reste listé — c'est de là qu'on le démasque. Seul le lot voisinage, qui a sa propre
bascule en haut de page, disparaît du sélecteur.

Si la sélection courante portait sur un objet du voisinage au moment du masquage, elle se replie
sur la parcelle : éditer un objet devenu invisible n'aurait pas de sens.

**Vérifié** après un import de voisinage (4 parcelles + 6 bâtiments) :

| | voisinage affiché | voisinage masqué |
|---|---|---|
| Catégories | Tout 45, Terrain 5, Bâtiment 7 | **Tout 35, Terrain 1, Bâtiment 1** |
| Liste « Terrain » | Parcelle AE 101, AE 100, AE 103, AE 102, AE 99 | **Parcelle AE 101** |
| Sélection (mise sur AE 99) | AE 99 | **repliée sur Parcelle AE 101** |

Réaffichage : les compteurs reviennent à 45 / 5 / 7.
