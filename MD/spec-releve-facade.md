# Relevé de façade — spécification

**Version :** 1.0 — livrée en `2.2.0` (28 septembre 2026)
**Statut :** spécification de référence du relevé photographique d'une façade
**Compagnons :** [`PLAN_Facade_Scan_Specification_V1_updated.md`](PLAN_Facade_Scan_Specification_V1_updated.md) (la vision produit),
[`spec-ihm-zones.md`](spec-ihm-zones.md), [`spec-ihm-mobile.md`](spec-ihm-mobile.md), [`RELEASE.md`](RELEASE.md),
[`../native/ios/README.md`](../native/ios/README.md)

---

## 1. Ce que fait la fonction

On sélectionne un bâtiment sur le plan, on choisit une de ses façades, et le téléphone la
photographie. Plan en tire, **dans le navigateur, sans serveur** :

1. une **élévation redressée à l'échelle** — la photo, corrigée de sa perspective, à un nombre fixe
   de pixels par mètre ;
2. les **ouvertures** — fenêtres, portes-fenêtres, portes, portes de garage — avec leur position
   et leurs **dimensions au centimètre**, corrigeables au doigt ;
3. la **forme du toit** — plat, appentis, deux pans, quatre pans — et la hauteur de son faîtage,
   lues sur la silhouette au-dessus de l'égout ;
4. la **3D** : la photo plaquée sur le mur et sur son pignon, les ouvertures en relief, le toit
   posé sur le bâtiment ; et sur le **plan 2D**, les ouvertures du rez-de-chaussée à la manière d'un
   plan d'architecte.

Une **aide au positionnement** guide la prise de vue à une distance cible (**3 m par défaut**),
avec la distance mesurée par le **LiDAR** quand Plan tourne dans le module natif iOS.

### 1.1 Ce qui a été décidé avant d'écrire une ligne

| Question | Décision | Pourquoi |
|---|---|---|
| Le LiDAR de l'iPhone n'est pas accessible depuis une page web | **Les deux** : le web avec un repli (cadrage, WebXR sur Android), et un module natif iOS qui apporte le LiDAR | Le web fonctionne partout et se teste ici ; le natif apporte la mesure réelle sans rien changer à Plan |
| Qui détecte les ouvertures et le toit ? | **Localement, dans le navigateur**, puis correction au doigt | Aucun serveur, aucun coût par photo, aucune donnée qui quitte l'appareil |
| Où ranger les photos ? | **Dans `projet.json`** : l'élévation redressée en JPEG, pas les photos brutes | Le relevé suit le projet, l'export JSON et la plateforme sans rien de plus |

### 1.2 Ce que cette version ne fait pas (voir aussi §11)

- Pas de reconstruction du bâtiment depuis les photos : la **géométrie reste celle du plan** (la
  vision produit, §23.11, le recommande aussi). La photo apporte l'apparence, les ouvertures et le
  toit.
- Une photo par façade. Plusieurs façades se relèvent l'une après l'autre.
- Pas de guidage de la position le long du mur (points P1 à P5 de la vision produit) : la page ne
  sait pas où est le téléphone sans suivi AR.

---

## 2. Où vit le code

| Couche | Fichier | Rôle |
|---|---|---|
| `facade/` (niveau 3, pur) | `geometrie.ts` | les façades d'un contour : gauche vue de dehors, normale, azimut, nom |
| | `cadrage.ts` | focale, distance par la taille apparente, consignes de distance et d'aplomb |
| | `homographie.ts` | homographie à quatre points, redressement bilinéaire |
| | `detection.ts` | ouvertures sur l'élévation, affinage au centimètre, classement |
| | `toit.ts` | plans du toit, pans et pignons, lecture de la silhouette, correction de fuite |
| | `analyse.ts` | l'enchaînement complet photo → relevé ; coins proposés |
| | `exif.ts` | focale 24×36 d'un JPEG importé |
| | `choix.ts` | le mur désigné avant d'ouvrir le relevé |
| `ui/releve/` (niveau 5) | `camera.ts`, `profondeur.ts` | caméra, fichiers, JPEG ; LiDAR natif, WebXR, inclinaison |
| `ui/champs/facade.ts` | | la section « Façades et toit » de l'inspecteur |
| `render/releve.ts` | | les ouvertures sur le plan à l'écran |
| `three/releve3d.ts` | | façades texturées, encadrements, pans et pignons |
| `app/releve.ts`, `app/ecouteurs/facade.ts` | | le service qui écrit dans le projet ; les deux commandes |
| `zones/Releve.tsx` | | le parcours plein écran (Z8) |
| `native/ios/` | | le module natif, hors de l'application web |

Le calcul (`facade/`) ne touche ni au DOM ni au réseau : tout se teste sous Node, sur des images
synthétiques projetées en perspective (`tests/unit/facade/`).

---

## 3. Les façades d'un bâtiment

Un bâtiment est un polygone de fonction `batiment` (ou `annexe`) extrudé à sa hauteur d'égout.
**Chaque côté est une façade.** Pour chacune, `facadesDuContour` donne :

- la **gauche vue de dehors** : le point de départ du repère de la façade. Elle ne se devine pas
  sur le sens de saisie — un contour horaire met l'extérieur à gauche du côté, un contour
  trigonométrique à droite ; c'est l'aire signée qui tranche ;
- la **normale sortante** et l'**azimut** (0 = nord, sens horaire), d'où le nom « Sud », « Nord-Est »… ;
- la largeur, lue sur le plan : **c'est elle qui met la photo à l'échelle**.

Un côté de moins de 10 cm est un reliquat de saisie : il est écarté, sans renuméroter les autres.

**Repère d'une façade.** `x` en mètres depuis la gauche vue de dehors, `y` en mètres depuis le
sol. Tout le relevé s'exprime dans ce repère.

---

## 4. Le parcours

### 4.1 Entrée

L'inspecteur (Z5) d'un bâtiment porte une section **« Façades et toit »** : un bouton « Relever une
façade… », puis une ligne par mur — orientation, nom du côté, longueur, nombre d'ouvertures
relevées — avec **Relever** (ou **Refaire**) et **Retirer**. Suivent les champs du toit : forme,
hauteur du faîtage (avec la pente calculée), direction du faîtage, couleur de la couverture.

Deux commandes, groupe `facade`, permission `projects.write`, placées `inspecteur` dans les trois
classes d'écran (`app/exposition.ts`) :

| Commande | Active quand | Effet |
|---|---|---|
| `facade.relever` | un bâtiment est sélectionné (même verrouillé : le verrou fige la position, pas ce qu'on sait des murs) | ouvre le parcours, sur le mur désigné ou sur le choix du mur |
| `facade.retirer` | le bâtiment a au moins un relevé | retire le relevé du mur désigné ; Ctrl+Z le rend |

Une commande ne prend pas d'argument : le bouton d'une ligne **désigne** d'abord son mur
(`facade/choix.ts`), puis exécute la commande, qui le reprend — le même schéma que la cible
d'alignement.

### 4.2 Les cinq temps (`zones/Releve.tsx`)

Plein écran, dans les trois classes, fermable par Échap ou la croix. **Rien n'est écrit dans le
plan avant « Valider »** : fermer ne laisse aucune trace.

1. **Choisir le mur** — le contour du bâtiment, nord en haut, chaque côté une cible de 44 px, et la
   même liste en boutons. Sauté si l'inspecteur a désigné le mur.
2. **Se placer** — la caméra arrière, la distance au mur et sa source, la consigne (« 3,8 m :
   avancez de 0,8 m », « 3,1 m, bonne distance »), l'aplomb du téléphone. Le déclencheur, et
   « Importer » pour une photo déjà prise. Voir §5.
3. **Placer les coins** — la photo, avec une marge tout autour : les quatre coins du mur (égout en
   haut, pied du mur en bas) sont proposés d'après la distance (§5.4), et se déplacent au doigt
   avec une **loupe**. Un coin caché ou hors cadre se place là où il serait. La hauteur à l'égout
   se corrige ici ; la largeur vient du plan.
4. **Analyse** — une seconde environ (§6 à §8).
5. **Vérifier** — la façade redressée à l'échelle, chaque ouverture un cadre qu'on déplace, qu'on
   redimensionne par ses coins, dont on change la nature et les cotes au centimètre, qu'on retire ;
   « Ajouter une ouverture ». Le toit proposé, avec sa pente, qu'on applique ou non, et qu'on
   corrige. **Valider** écrit le tout en **un seul pas d'historique**.

---

## 5. La distance au mur

### 5.1 Trois sources, de la meilleure à la plus modeste (`ui/releve/profondeur.ts`)

| Source | Où | Comment |
|---|---|---|
| **LiDAR** | module natif iOS (`native/ios/`) | médiane d'une fenêtre 7 × 7 au centre de la carte de profondeur ARKit, dix fois par seconde ; une mesure de confiance < 1 est ignorée |
| **Réalité augmentée** | Chrome Android (WebXR `immersive-ar` + `hit-test`) | rayon depuis le centre de l'écran jusqu'au premier plan touché ; distance horizontale |
| **Cadrage** | partout | la taille réelle du mur (plan) et la place qu'il occupe dans l'image |

Le module natif et WebXR n'ont pas pu être essayés sur un appareil pendant le développement : le
code est écrit contre leurs API documentées, et le côté page du module natif est vérifié en
simulant son canal (voir §12).

### 5.2 Le cadrage (`facade/cadrage.ts`)

Modèle du sténopé : un objet de `T` mètres qui occupe `p` pixels est à `d = T · f / p`, avec la
focale en pixels `f = (grand côté / 2) / tan(champ / 2)`. Deux repères glissent sur la vidéo :
**les deux bords du mur** (sa largeur est connue), ou **l'égout et le pied du mur** (sa hauteur
l'est). La vidéo garde toute l'image (`object-fit: contain`) pour que les repères se posent sur
l'image et non sur des bandes.

Le **champ** du grand côté vaut 67° par défaut (objectif principal 26 mm équivalent) ; il se règle
dans la visée, et le réglage reste sur l'appareil (`localStorage`, jamais dans le projet).

### 5.3 La focale exacte, quand on la connaît

- Photo importée : la balise EXIF `FocalLengthIn35mmFilm` donne le champ (`facade/exif.ts`).
- Module natif : les intrinsèques ARKit donnent la focale en pixels, livrée avec la photo.

### 5.4 La distance cible et les coins proposés

La cible est **3 m** par défaut, réglable par pas de 0,5 m, avec une tolérance de ± 0,25 m. La
visée dit aussi à partir de quelle distance le mur entier tient dans l'image : à 3 m, un mur à étage
déborde, et **c'est prévu** — ses coins se placeront au-delà de la photo, et la partie non vue est
complétée à la teinte du mur (§6).

À distance connue et téléphone d'aplomb, le mur se projette en un rectangle centré, le sol à
hauteur d'œil (1,5 m) sous l'horizon : ce sont les coins proposés. Les repères du cadrage, quand
ils ont servi, l'emportent (ils disent exactement où sont les bords). Les coins sont ramenés dans
la marge saisissable.

### 5.5 L'aplomb

L'inclinaison avant-arrière (`deviceorientation`, `beta`) : 90° ± 6° est « Téléphone droit ».
Sur iOS, la permission se demande par un geste (« Activer le niveau »).

### 5.6 Le grand-angle (0,5×)

À 3 m, l'objectif principal (≈ 67° sur le grand côté) voit 4 m de mur ; le grand-angle d'un
téléphone (13 mm équivalent, ≈ 108°) en voit 8. La page ne reçoit pourtant que « la caméra
arrière » : elle va chercher le grand-angle elle-même (`facade/objectifs.ts`,
`ui/releve/camera.ts`) :

| Téléphone | Comment | Champ retenu |
|---|---|---|
| iPhone (Safari) | caméra à part dans `enumerateDevices`, reconnue à son nom (« Back Ultra Wide Camera », « ultra grand-angle ») une fois la permission donnée ; ouverte par son identifiant | 108° par défaut |
| Android (Chrome) | zoom inférieur à 1 sur la caméra principale (`getCapabilities().zoom.min`, souvent 0,5 ou 0,6), appliqué à la piste | déduit du champ du principal : `2·atan(tan(champ/2) / zoom)`, 96° pour 67° à 0,6 |

Le choix **« 0,5× grand-angle / 1× »** n'apparaît que si l'une des deux voies existe ; il est
retenu sur l'appareil, et **le champ se règle et se mémorise par objectif** (ce n'est pas le même
verre). La photo emporte le champ de l'objectif qui l'a prise, et les coins proposés en dépendent.
Les caméras « Dual » et « Triple » d'un iPhone sont virtuelles (iOS y change d'objectif seul) : elles
ne sont jamais choisies pour cette raison.

**Limite.** Un grand-angle déforme davantage : les murs droits se courbent un peu vers les bords de
l'image. iOS corrige d'office la distorsion de son ultra grand-angle ; tous les Android ne le font
pas, et le redressement (un modèle sans distorsion) ne la rattrape pas. Garder le mur au centre de
l'image, loin des bords, limite l'écart. Le module natif iOS reste sur l'objectif principal : c'est
celui dont ARKit aligne la carte de profondeur LiDAR.

---

## 6. Le redressement (`facade/homographie.ts`, `facade/analyse.ts`)

Un mur plan photographié de biais est une **homographie** de son élévation : quatre coins suffisent
à la retrouver (système 8 × 8, pivot partiel). On redresse **une seule fois, du sol jusqu'à une
bande au-dessus de l'égout** (`hauteurBande` : 60 % de la largeur, entre 3 et 8 m) : le pignon est
dans le plan du mur, il est donc redressé à la même échelle.

- Résolution : 100 px/m, bornée pour que le grand côté ne dépasse pas 1 024 px.
- Échantillonnage bilinéaire ; ce que la photo n'a pas vu est rempli de la teinte moyenne et marqué
  dans un masque.
- La photo est d'abord réduite à 2 400 px au plus sur son grand côté.
- **Dans la bande au-dessus de l'égout, le ciel est repeint à la teinte du mur.** La 3D plaque
  cette bande sur le pignon modélisé ; s'il déborde de celui de la photo (faîtage décentré sur un
  contour irrégulier, pente corrigée à la main), il montre du mur, pas un morceau de ciel.

---

## 7. Les ouvertures (`facade/detection.ts`)

Un mur est une grande surface à peu près uniforme ; une baie s'en détache.

1. Réduction à 20 px/m (5 cm).
2. **Teinte du mur** : la médiane canal par canal de ce qui a été vu.
3. **Écart** de chaque pixel à cette teinte ; seuil robuste : trois fois l'écart médian, jamais
   moins de 28 niveaux (en dessous, on détecterait les ombres de la gouttière).
4. Fermeture puis ouverture morphologiques (recoller les carreaux séparés par les petits bois,
   effacer les grains), composantes 4-connexes.
5. Filtres : 0,35 à 5,5 m de large, 0,4 à 3,2 m de haut, boîte remplie à 55 % au moins ; une bande
   qui traverse 85 % de la façade est un soubassement ; une tache collée en haut, l'ombre du débord.
6. **Affinage au centimètre** : chaque bord est recherché à la résolution de l'élévation, de
   l'extérieur vers l'intérieur, là où la moitié des pixels du milieu du bord s'écartent du mur.
7. **Alignement** : linteaux et appuis à 7 cm près ramenés à la même cote.
8. **Classement** : au sol et ≥ 1,8 m de haut → porte (≥ 1,1 m de large : porte-fenêtre ; ≥ 2,1 m :
   garage) ; appui < 0,45 m et ≥ 1,9 m de haut → porte-fenêtre ; sinon fenêtre.

C'est une **proposition** : elle doit surtout ne pas inventer. Sur les images de test, les cotes
sont exactes au centimètre sur l'élévation, à 1–2 cm après une photo en perspective et des coins
posés au doigt.

---

## 8. Le toit (`facade/toit.ts`)

### 8.1 Le modèle

Un toit simple est **l'enveloppe basse de quelques plans** : deux pans, le plus bas de deux plans
qui montent du bord vers le faîtage ; quatre pans, de quatre (croupes de même pente) ; un appentis,
un seul plan ; un toit plat, l'égout. Le repère est celui du faîtage : `u` le long, `v` en travers ;
les étendues du contour sur ces axes donnent la demi-largeur et la demi-longueur. Ainsi décrit, le
toit vaut **pour n'importe quel contour**, pas seulement un rectangle :

- chaque **pan** est le morceau du contour où son plan est le plus bas (découpe par demi-plans,
  triangulation par oreilles) ;
- les **pignons** sont les murs sous lesquels la hauteur du toit n'est pas nulle, avec les cassures
  du profil là où deux plans s'égalent.

Enregistré : `forme`, `hauteur` du faîtage au-dessus de l'égout, `angleFaitage` (degrés depuis
l'est, modulo 180), `couleur`, `source` (`photo`, `saisie`).

### 8.2 La lecture sur la photo

Dans la bande au-dessus de l'égout, chaque colonne est « bâtie » jusqu'à la première ligne où la
majorité de ses pixels ne sont plus du ciel (ciel : ressemble au haut de l'image quand celui-ci en
a l'air, ou très clair et peu saturé, ou franchement bleu ; le non-vu compte comme du ciel). Le
profil, filtré par une médiane sur cinq colonnes, est ajusté à quatre modèles :

| Profil | Toit |
|---|---|
| nul | plat |
| triangle centré | deux pans, faîtage **perpendiculaire** au mur (on voit le pignon) |
| bande constante | deux pans, faîtage **parallèle** (on voit le long pan depuis l'égout) |
| trapèze | quatre pans |
| rampe | appentis |

Un long pan **fuit** : vu d'en bas à `d` mètres du mur, son faîtage à `D` mètres derrière le mur se
projette plus bas qu'il n'est. `corrigerFuite` remonte la hauteur apparente avec la distance
mesurée et la demi-largeur du bâtiment. Moins d'un tiers de la bande vu : aucun toit n'est proposé,
plutôt que de conclure à un toit plat.

Un toit **saisi à la main** n'est pas écrasé d'office par une estimation : la case « Appliquer »
part décochée.

---

## 9. Le rendu

### 9.1 La 3D (`three/releve3d.ts`)

Le bâtiment reste le prisme de `scene.ts` ; le relevé l'habille :

- la photo sur un plan collé au mur (1 cm devant), jusqu'à l'égout ; **la suite de la texture sur
  le pignon** du même mur, qui est dans le même plan ;
- chaque ouverture un encadrement en relief (linteau, montants, appui des fenêtres) ; sans photo,
  une vitre ou un vantail ;
- les pans du toit (terre cuite par défaut) et les pignons (couleur du mur).

**Rien n'est ajouté à un bâtiment sans relevé ni toit** : la scène du jeu de démonstration garde
exactement ses mailles, donc la structure du GLB (fumée, point 24). Un bâtiment relevé s'exporte en
GLB avec sa texture, puisque l'export prend la scène vivante.

### 9.2 Le plan (`render/releve.ts`)

Convention d'architecte, **coupe à 1,10 m** : les baies qui la traversent coupent le trait du mur,
bornées par leurs tableaux ; une fenêtre a son trait de vitre, une porte son vantail et son arc de
débattement. Les baies de l'étage n'y sont pas. **Seul le plan à l'écran** les montre : l'export
SVG garde sa forme, figée par son empreinte.

---

## 10. Données et persistance

```ts
interface ReleveFacade {
  cote: number;               // indice du côté : de pts[cote] à pts[cote + 1]
  largeur: number; hauteur: number;
  texture: string | null;     // data:image/jpeg;base64,… — l'élévation redressée
  hauteurTexture?: number;    // au-delà de hauteur : la bande du pignon
  ouvertures: { type, x, y, l, h }[];
  distance: number | null; sourceDistance: 'lidar' | 'webxr' | 'cadrage' | null;
  releveLe: string;
}
// sur ObjetPlan : facades?: ReleveFacade[] | null ; toit?: Toit | null
```

- `serializeObjects` (liste blanche) **n'écrit `facades` et `toit` que s'ils existent** : un projet
  sans relevé garde au bit près la forme d'avant — c'est ce qui laisse les empreintes intactes.
  `normalizeObjects` les copie en profondeur (un instantané d'historique ne partage rien).
- **`SCHEMA_VERSION` passe de 1 à 2** (`RELEASE.md` §3.1 : toute évolution de la forme persistée).
  Un fichier de schéma 1 s'ouvre sans migration (les champs sont facultatifs) ; un fichier de
  schéma 2 est refusé par la `2.1.0`, qui en perdrait les relevés au premier enregistrement.
- Poids : 60 à 120 Ko de JPEG par façade (qualité 0,82, 1 024 px au plus). La plateforme refuse un
  document trop gros (413) : une dizaine de façades reste loin de cette limite, mais ce sera la
  première à surveiller si les relevés se multiplient (§11).
- La hauteur d'égout retenue au redressement remplace l'élévation du bâtiment.

---

## 11. Limites connues et suites

| Limite | Effet | Suite possible |
|---|---|---|
| Une photo par façade | à 3 m, un mur à étage déborde ; ses coins se placent hors photo et le non-vu est complété à la teinte du mur | assemblage de plusieurs photos le long du mur |
| Détection par écart à la teinte du mur | un volet de la couleur de l'enduit, une baie à contre-jour claire peuvent échapper ; une grande ombre portée peut être prise pour une baie | la correction au doigt est là pour ça ; un modèle de segmentation (serveur) plus tard |
| Toit sur l'enveloppe du contour entier | sur un contour en L, une seule toiture couvre les deux ailes | toitures par volume |
| Pignon de la photo et pignon modélisé | sur un contour irrégulier, le faîtage n'est pas au milieu du mur photographié : la photo s'étire, le ciel est repeint en mur | faîtage décalé sur le mur relevé |
| Textures dans `projet.json` | le document grossit d'environ 100 Ko par façade | stockage d'actifs de la plateforme (`contrat/backprod.openapi.json` : « Large assets … belong in storage ») |
| Module natif non compilé | écrit sous Windows, sans Xcode | le compiler et le signer (`native/ios/README.md`) |
| WebXR non essayé | aucun appareil Android ARCore disponible pendant le développement | le dérouler sur un téléphone Android |

---

## 12. Comment c'est vérifié

- **Tests unitaires** (`tests/unit/facade/`, `io/serialisation-releve.test.ts`,
  `three/releve3d.test.ts`) : géométrie des façades dans les deux sens de saisie, cadrage et
  étalonnage, homographie, redressement d'une photo synthétique en perspective, ouvertures
  retrouvées au centimètre, pignon reconnu et faîtage orienté, correction de fuite, EXIF dans les
  deux boutismes, sérialisation conditionnelle et copie profonde, mailles 3D et coordonnées de
  texture du mur et du pignon.
- **Dans l'application** (navigateur intégré, plateforme simulée, classes `compact` et `large`) :
  section de l'inspecteur, parcours complet sur une photo de maison à étage générée en
  perspective, coins posés par de vrais glisser, cotes lues (fenêtres 121 × 121 et 121 × 136 pour
  120 × 120 et 120 × 135, porte 95 × 216 pour 95 × 215), correction d'une cote, validation,
  **enregistrement sur la plateforme puis rechargement** (relevé, texture et toit relus à
  l'identique), vue 3D (mur et pignon texturés, toit), plan 2D (baies du rez-de-chaussée). Le
  canal du module natif est simulé (`window.webkit.messageHandlers.planCapture`) : distances LiDAR
  et consignes, mesure de faible confiance ignorée, photo livrée par `plan:photo`, séquence
  `demarrer` → `photo` → `arreter`.
- **Empreintes** : les six artefacts du jeu de démonstration, recapturés à la `2.2.0` ; l'ancien
  numéro, l'ancienne date de build et l'ancien numéro de schéma remis dans les octets frais rendent
  les six empreintes de la `2.0.2` au bit près (`tests/fixtures/golden/EMPREINTES.md`).
