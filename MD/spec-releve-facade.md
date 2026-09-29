# Relevé de façade — spécification

**Version :** 1.1 — non publiée (1.0 livrée en `2.2.0`, 28 septembre 2026) : hauteur mesurée sur la
photo, toit redéfini par chaque façade, LiDAR désactivé
**Statut :** spécification de référence du relevé photographique d'une façade
**Compagnons :** [`PLAN_Facade_Scan_Specification_V1_updated.md`](PLAN_Facade_Scan_Specification_V1_updated.md) (la vision produit),
[`spec-ihm-zones.md`](spec-ihm-zones.md), [`spec-ihm-mobile.md`](spec-ihm-mobile.md), [`RELEASE.md`](RELEASE.md),
[`../native/ios/README.md`](../native/ios/README.md)

---

## 1. Ce que fait la fonction

On sélectionne un bâtiment sur le plan, on choisit une de ses façades, et le téléphone la
photographie. Plan en tire, **dans le navigateur, sans serveur** :

1. la **hauteur du mur à l'égout**, mesurée — seule la largeur est connue, lue sur le plan (§6.0) ;
   et une **élévation redressée à l'échelle** — la photo, corrigée de sa perspective, à un nombre fixe
   de pixels par mètre ;
2. les **ouvertures** — fenêtres, portes-fenêtres, portes, portes de garage — avec leur position
   et leurs **dimensions au centimètre**, corrigeables au doigt ;
3. la **forme du toit** — plat, appentis, deux pans, quatre pans — et la hauteur de son faîtage,
   lues sur la silhouette au-dessus de l'égout ; sur un pignon, c'est le triangle du toit, dans le
   plan du mur et donc à la même échelle. **Le toit lu sur la façade remplace celui du bâtiment**
   (§8.3) ;
4. la **3D** : la photo plaquée sur le mur et sur son pignon, les ouvertures en relief, le toit
   posé sur le bâtiment ; et sur le **plan 2D**, les ouvertures du rez-de-chaussée à la manière d'un
   plan d'architecte.

Une **aide au positionnement** mesure la distance au mur — en réalité augmentée sur Android, sinon
estimée d'après la largeur du mur dans l'image — et dit ce qu'elle permet : une photo, plusieurs en
se décalant le long du mur quand on manque de recul, ou reculer ; une alerte quand rien ne mesure.
**Le LiDAR est désactivé** (§5.1).

### 1.1 Ce qui a été décidé avant d'écrire une ligne

| Question | Décision | Pourquoi |
|---|---|---|
| Le LiDAR de l'iPhone n'est pas accessible depuis une page web | **Les deux** : le web avec un repli (cadrage, WebXR sur Android), et un module natif iOS qui apporte le LiDAR | Le web fonctionne partout et se teste ici ; le natif apporte la mesure réelle sans rien changer à Plan |
| *Révisé en 1.1* : le LiDAR ne porte qu'à 5 m environ | **LiDAR désactivé** (`LIDAR_ACTIF`) ; le module natif reste dans le dépôt, la page ne s'en sert plus | Une façade avec son pignon se photographie le plus souvent de plus loin : le LiDAR se tait justement quand Plan conseille de reculer |
| Quelle taille met la photo à l'échelle ? | **La largeur seule**, lue sur le plan ; la hauteur se mesure (§6.0) | La hauteur du cadastre (celle de l'extrusion par défaut) est une estimation, souvent à un mètre près |
| Qui définit le toit ? | **Chaque façade relevée** : son toit remplace celui du bâtiment (§8.3) | La photo d'un pignon en donne le triangle exact ; c'est la meilleure information disponible |
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
| `ui/releve/` (niveau 5) | `camera.ts`, `profondeur.ts` | caméra, fichiers, JPEG ; WebXR, inclinaison ; LiDAR natif (désactivé) |
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
- la largeur, lue sur le plan : **c'est elle qui met la photo à l'échelle**. La hauteur, elle,
  n'est pas connue : le bâtiment est extrudé par défaut à la hauteur du cadastre, une estimation que
  le relevé remplace par une mesure (§6.0).

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
2. **Se placer** — la caméra arrière, la distance **mesurée** au mur et sa source, ce qu'elle
   permet (« une photo suffit », « 3 photos, de gauche à droite », ou l'alerte « reculez à au moins
   Y m »), une alerte quand rien ne mesure, l'aplomb du téléphone, le choix de l'objectif (0,5× / 1×).
   La hauteur à cadrer est l'égout estimé plus, sur un pignon d'un toit déjà connu, son triangle.
   Le déclencheur, et « Importer » pour une photo déjà prise. Voir §5.
3. **Placer les coins** — la photo (ou chaque photo de la série, en vignettes, §6.1), avec une marge tout autour : les quatre coins du mur (égout en
   haut, pied du mur en bas) sont proposés d'après la distance (§5.4), et se déplacent au doigt
   avec une **loupe**. Un coin caché ou hors cadre se place là où il serait. La largeur vient du
   plan ; la hauteur ne se saisit pas, elle se mesure d'après ces coins.
4. **Analyse** — une seconde environ (§6 à §8).
5. **Vérifier** — la façade redressée à l'échelle, chaque ouverture un cadre qu'on déplace, qu'on
   redimensionne par ses coins, dont on change la nature et les cotes au centimètre, qu'on retire ;
   « Ajouter une ouverture ». La **hauteur mesurée**, à côté de celle du bâtiment jusqu'ici
   (cadastre, ou relevé d'une autre façade), corrigeable : la
   façade s'étire alors en hauteur, ouvertures, partie basse, bande du pignon et toit compris (la
   largeur, elle, est celle du plan). Le toit lu sur la façade, avec sa pente et, sur un pignon, la
   hauteur de la façade au faîtage ; « Remplacer le toit du bâtiment par celui-ci » part cochée.
   **Valider** écrit le tout en **un seul pas d'historique**.

---

## 5. La distance au mur

### 5.1 Les sources (`ui/releve/profondeur.ts`)

| Source | Où | Comment |
|---|---|---|
| ~~**LiDAR**~~ | module natif iOS (`native/ios/`) — **désactivé** | médiane d'une fenêtre 7 × 7 au centre de la carte de profondeur ARKit, dix fois par seconde ; une mesure de confiance < 1 est ignorée |
| **Réalité augmentée** | Chrome Android (WebXR `immersive-ar` + `hit-test`) | rayon depuis le centre de l'écran jusqu'au premier plan touché ; distance horizontale |
| **Cadrage** | partout | la largeur réelle du mur (plan) et la place qu'elle occupe dans l'image |

**Le LiDAR est désactivé** (`LIDAR_ACTIF = false`). Safari n'y donne pas accès, et le module natif
qui l'apportait ne change pas l'essentiel : le LiDAR d'un iPhone ne porte qu'à **5 m environ**. Or
une façade se photographie le plus souvent de plus loin — un mur de 6 m jusqu'au faîtage demande
déjà 5 m de recul avec l'objectif principal, un mur de 10 m en une photo 11 m : le LiDAR se tait
précisément quand Plan conseille de reculer. `natifDisponible()` rend donc `false` et aucune
commande ne part vers le module ; dans le module natif, la page se comporte comme dans Safari
(caméra du navigateur, cadrage). Le code du canal reste, éteint : le rallumer rend au module la
visée AR et la photo à focale exacte.

WebXR n'a pas pu être essayé sur un appareil pendant le développement : le code est écrit contre
son API documentée.

### 5.2 Le cadrage (`facade/cadrage.ts`)

Modèle du sténopé : un objet de `T` mètres qui occupe `p` pixels est à `d = T · f / p`, avec la
focale en pixels `f = (grand côté / 2) / tan(champ / 2)`. Deux repères glissent sur la vidéo :
**les deux bords du mur**, parce que sa largeur est la seule taille connue. (Le mode « égout et
pied du mur » de la 1.0 supposait la hauteur connue ; il a disparu.) La vidéo garde toute l'image
(`object-fit: contain`) pour que les repères se posent sur l'image et non sur des bandes.

Le **champ** du grand côté vaut 67° par défaut (objectif principal 26 mm équivalent) ; il se règle
dans la visée, et le réglage reste sur l'appareil (`localStorage`, jamais dans le projet).

### 5.3 La focale exacte, quand on la connaît

- Photo importée : la balise EXIF `FocalLengthIn35mmFilm` donne le champ (`facade/exif.ts`).
- Module natif (désactivé, §5.1) : les intrinsèques ARKit donnaient la focale en pixels, livrée
  avec la photo.

La focale sert aussi à **mesurer la hauteur du mur** (§6.0) : un champ mal réglé fausse la
hauteur mesurée d'une photo prise de biais (de face, les proportions n'en dépendent pas).

### 5.4 La distance mesurée, et ce qu'elle permet

Il n'y a **pas de distance cible** : on mesure où l'on est, et Plan calcule ce que cette distance
permet (`planDePrise`, `consignePrise` dans `facade/cadrage.ts`). L'image couvre
`d · largeurPx / f` × `d · hauteurPx / f` mètres de mur ; d'où trois cas :

| À cette distance | Consigne |
|---|---|
| tout le mur tient (10 % de marge) | « Tout le mur tient dans l'image : une photo suffit. » |
| la hauteur tient, pas la largeur | « Le mur ne tient pas en largeur : N photos, de gauche à droite (ou reculez à X m pour une seule). » puis, photo après photo, « décalez-vous d'environ P m vers la droite, en gardant un tiers de la photo précédente » (§6.1) |
| la hauteur ne tient pas | **alerte** : « La hauteur du mur ne tient pas : l'image n'en couvre que H m. Reculez à au moins Y m (ou passez au grand-angle). » — les photos s'assemblent côte à côte, pas l'une au-dessus de l'autre |

La géométrie de l'image est celle de la vidéo dans la page ; dans le module natif, sans vidéo, c'est
celle que le module envoie avec chaque mesure (taille de la photo livrée et focale).

Le plan de prise vise la **hauteur à cadrer** : l'égout estimé (cadastre) et, si le mur est un
pignon du toit déjà connu, son triangle (`hauteurPignon`, `facade/toit.ts`) — sans lui, ni la
hauteur de la façade au faîtage ni le toit ne se lisent.

**Sans mesure, une alerte.** Si aucun capteur ne répond — tout iPhone, puisque le LiDAR est
désactivé —, la visée l'annonce : « Distance non mesurée : estimez-la avec les repères. » (« mesurez-la
en réalité augmentée, ou estimez-la avec les repères » quand WebXR est là). Les repères du cadrage
(§5.2) restent en secours, et leur distance est affichée « estimée, non mesurée ».

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
ne sont jamais choisies pour cette raison. Elles sont reconnues **avant** le grand-angle : en
français, la « Dual Wide » s'appelle « Caméra arrière double grand-angle », et la 1.0 la prenait
pour l'ultra grand-angle (le bouton 0,5× ne changeait alors rien). Parmi plusieurs candidates, un
nom en « ultra » l'emporte. Si le grand-angle ne s'ouvre pas, la visée revient au principal et le
dit.

**Limite.** Un grand-angle déforme davantage : les murs droits se courbent un peu vers les bords de
l'image. iOS corrige d'office la distorsion de son ultra grand-angle ; tous les Android ne le font
pas, et le redressement (un modèle sans distorsion) ne la rattrape pas. Garder le mur au centre de
l'image, loin des bords, limite l'écart. Le module natif iOS (désactivé) restait sur l'objectif principal : c'est
celui dont ARKit aligne la carte de profondeur LiDAR.

---

## 6. Le redressement (`facade/homographie.ts`, `facade/analyse.ts`)

### 6.0 La hauteur du mur, mesurée

**Seule la largeur du mur est connue** : elle se lit sur le plan. La hauteur à laquelle le bâtiment
est extrudé par défaut vient du cadastre (BD TOPO) : c'est une estimation, qui ne sert plus qu'à
viser, à proposer les coins et de repli.

Les quatre coins posés sur la photo sont l'image d'un rectangle. Avec la focale (point principal au
centre de l'image), la perspective en fixe les proportions : `rapportRectangle`, d'après Zhang et He
(« Whiteboard scanning », 2004). La largeur du plan met ce rapport à l'échelle, d'où la hauteur à
l'égout (`mesurerHauteur`, arrondie au centimètre). Pour un mur en L, c'est la hauteur du rectangle
englobant, donc l'égout haut ; la partie basse se mesure ensuite à cette échelle.

- **Repli.** Des coins qui ne se prêtent pas à la mesure (quadrilatère dégénéré, hauteur hors de
  1 à 60 m) laissent l'estimation en place, et l'étape Vérifier le dit.
- **Avis.** Une hauteur mesurée à plus de 25 % de celle du bâtiment jusqu'ici (cadastre, ou relevé
  d'une autre façade) est signalée : c'est le plus souvent un coin mal placé, ou un champ d'objectif
  mal réglé.
- **Correction.** La hauteur se corrige à l'étape Vérifier. La largeur étant celle du plan, c'est la
  hauteur seule qui était fausse : la façade s'étire en hauteur, ouvertures, partie basse, bande du
  pignon et toit lu dessus, tous du même facteur.

Sur les images de test (mur de 8 m, 4 m à l'égout, cadastre à 5,5 m ; mur en L de 6 m, cadastre à
7,5 m), la hauteur est retrouvée à 3 cm près ; dans l'application, sur une photo générée à 13 m
(5,20 m à l'égout, cadastre à 6,00 m, pignon de 3 m), 5,20 m et un faîtage à 2,98 m.

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

### 6.1 Plusieurs photos pour un mur

Sans recul, on photographie le mur par morceaux qui se recouvrent, de gauche à droite
(`facade/mosaique.ts`). Chaque morceau est un rectangle du mur — de l'égout au pied, entre deux
verticales : la première photo tient le coin gauche, la dernière le coin droit, celles du milieu
deux verticales quelconques près des bords de l'image.

1. **La largeur de chaque morceau, en hauteurs de mur.** Tous les morceaux ont la même hauteur
   (sol → égout) ; le rapport largeur/hauteur de chacun se lit sur la photo parce que la focale est
   connue (§6.0). Chaque morceau est redressé, avec la bande au-dessus de l'égout, à la même échelle.
2. **Sa place.** Deux morceaux voisins se recouvrent : leur décalage est celui où leurs pixels
   communs se ressemblent le plus (corrélation normalisée), cherché à 10 px/m puis affiné au pixel.
   Les six meilleurs pics locaux de la recherche grossière sont tous affinés : le pic d'un mur uni
   percé de baies nettes est plus étroit qu'une case de 10 cm, et un vrai décalage tombé entre deux
   cases y paraît médiocre. Dans un recouvrement, chaque morceau pèse d'autant plus qu'on s'éloigne
   de son bord.
3. **La hauteur du mur.** Une première passe à la hauteur estimée donne la largeur de
   l'assemblage ; tout y est proportionnel à la hauteur supposée, donc le rapport à la largeur du
   plan donne la hauteur mesurée. Une seconde passe redresse à cette hauteur, et le petit écart qui
   reste (décalages au pixel près) est recalé sur la largeur du plan.

L'assemblage rend ce qu'il a trouvé à redire, affiché avant validation : deux photos qui se
ressemblent mal sur leur partie commune (corrélation < 0,5 : « reprenez-en une en gardant un tiers
de mur en commun »), une seconde passe à plus de 6 % de la largeur du plan (« vérifiez les coins »),
ou une hauteur loin de celle du cadastre (§6.0).
Ensuite tout se passe comme pour une photo : ouvertures (§7), toit (§8), texture.

Au pas-à-pas, l'étape des coins montre la série en vignettes (reprendre, retirer, choisir la photo
à ajuster), dit combien de photos restent d'après la distance mesurée, et propose « Ajouter une
photo » tant qu'il en manque. Sur les images de test (trois photos à 5 m d'un mur de 8 m, prises de
biais de −3 à +4°), les ouvertures sont retrouvées à 1–2 cm.

**Limite.** À courte distance et téléphone d'aplomb, le haut de l'image s'arrête souvent sous le
pignon : le toit n'est alors pas proposé (§8.2), plutôt que deviné.

### 6.2 Un mur à deux hauteurs d'égout (en L)

Une partie à étage prolongée, sur le même alignement, par une partie basse — garage, extension :
vu de face, le mur est un L (`facade/profil.ts`). À l'étape des coins, **« En L, bas à gauche /
à droite »** (une photo) ajoute deux poignées : on pose les quatre coins visibles du L (le pied aux
deux bouts, l'égout haut au bout haut, l'égout bas au bout bas) et **les deux points du
décrochement**, sur l'égout haut et l'égout bas là où la hauteur change.

- **Le coin caché** du rectangle englobant, au-dessus de la partie basse, n'est pas à deviner :
  c'est l'intersection de la ligne d'égout haute prolongée et de l'arête verticale du bout bas — une
  perspective conserve les droites et leurs intersections. Le rectangle englobant (du sol à l'égout
  haut) se redresse comme d'habitude.
- **La mesure** : les deux points du décrochement, ramenés dans le plan du mur, donnent sa position
  et la hauteur d'égout de la partie basse (`partieBasse` du relevé : début, fin, hauteur).
  Corrigeables avant validation.
- **L'analyse** ignore ce qui monte au-dessus de l'égout bas sur la partie basse (sa toiture, le
  ciel) : ce n'est pas une baie. Le toit se lit au-dessus de la partie haute seulement. La
  couverture ne compte que le L ; la zone vide est voilée dans l'éditeur.
- **La 3D** coupe le bâtiment en deux volumes. La partie basse va du décrochement au bout bas, et
  **sa profondeur est celle du pignon adjacent** : le mur du contour qui part du coin C du bout bas
  vers le sommet suivant E. Avec S le décrochement sur la façade, la partie basse est S, C, E,
  S′ = E + (S − C) ; la partie haute est le contour où C et E sont remplacés par S et S′, l'encoche.
  Un contour qui porte déjà l'encoche (garage moins profond que la maison) retombe sur ses propres
  murs ; sur un contour rectangle, le pignon adjacent est tout le côté. La photo se pose en L, le
  toit coiffe la partie haute, la partie basse garde un toit plat, et les murs de la partie basse
  (son pignon, son mur arrière) prennent sa hauteur.

Sur les images de test (mur de 10 m, partie haute à 6 m, garage à 3 m, vu de biais), le
décrochement et l'égout bas sont retrouvés exacts au centimètre ; dans l'application, avec des
poignées posées au doigt, 4,99 m pour 5,00 et 3,00 m pour 3,00.

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

### 8.3 Chaque façade redéfinit le toit

Le bâtiment par défaut est le contour du cadastre extrudé à la hauteur du cadastre, avec le toit
qu'on lui connaît (ou aucun). **Chaque façade relevée le redéfinit** : sa hauteur à l'égout mesurée
remplace celle du bâtiment (§10), et **le toit lu sur la façade remplace celui du bâtiment** — y
compris un toit saisi à la main, ou lu sur une façade relevée avant. La case « Remplacer le toit du
bâtiment par celui-ci » part donc cochée ; la décocher garde l'ancien. Sans toit lisible (moins
d'un tiers de la bande vu), le toit du bâtiment reste tel quel.

Sur un **pignon**, la façade porte le triangle du toit (le trapèze d'un appentis vu de côté) : il
est dans le plan du mur, redressé à la même échelle que lui, et sa hauteur s'ajoute à celle de
l'égout — l'étape Vérifier donne la hauteur de la façade au faîtage. C'est la lecture la plus sûre
du toit : aucune fuite à corriger.

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
- La hauteur d'égout **mesurée** sur la photo (§6.0), ou corrigée à la main, remplace l'élévation
  du bâtiment (celle du cadastre). `sourceDistance` peut encore valoir `lidar` dans un projet relevé
  en `2.2.0` ; plus aucun relevé ne l'écrit.

---

## 11. Limites connues et suites

| Limite | Effet | Suite possible |
|---|---|---|
| Photos côte à côte seulement | un mur trop haut pour la distance disponible ne s'assemble pas en hauteur ; la visée demande de reculer | assemblage en hauteur, photos inclinées |
| Détection par écart à la teinte du mur | un volet de la couleur de l'enduit, une baie à contre-jour claire peuvent échapper ; une grande ombre portée peut être prise pour une baie | la correction au doigt est là pour ça ; un modèle de segmentation (serveur) plus tard |
| Mur en L : un seul décrochement, une seule photo | un mur en U (partie basse au milieu) ou à trois hauteurs ne se relève pas ; un L trop long pour une photo non plus | plusieurs décrochements, L en plusieurs photos |
| Partie basse à toit plat | le toit d'un garage (appentis) n'est pas lu | lire sa silhouette au-dessus de l'égout bas |
| Toit sur l'enveloppe du contour entier | sur un contour en L, une seule toiture couvre les deux ailes | toitures par volume |
| Pignon de la photo et pignon modélisé | sur un contour irrégulier, le faîtage n'est pas au milieu du mur photographié : la photo s'étire, le ciel est repeint en mur | faîtage décalé sur le mur relevé |
| Textures dans `projet.json` | le document grossit d'environ 100 Ko par façade | stockage d'actifs de la plateforme (`contrat/backprod.openapi.json` : « Large assets … belong in storage ») |
| LiDAR désactivé | sur iPhone, la distance est toujours estimée au cadrage ; la hauteur, elle, se mesure sans lui (§6.0) | le rallumer (`LIDAR_ACTIF`) pour une mesure de près, sous 5 m, si le besoin s'en fait sentir |
| Hauteur mesurée d'une seule façade | le bâtiment prend la hauteur de la dernière façade relevée ; un terrain en pente (égouts différents d'une façade à l'autre) n'est pas rendu | une hauteur par mur dans la 3D |
| Toit redéfini par la dernière façade | une façade vue depuis l'égout (faîtage corrigé de sa fuite) remplace un toit lu, plus sûrement, sur un pignon | décocher la case ; ou combiner les lectures de plusieurs façades |
| Module natif non compilé | écrit sous Windows, sans Xcode ; désactivé depuis la 1.1 | le compiler et le signer (`native/ios/README.md`) s'il est rallumé |
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
- **Version 1.1** : tests unitaires de la hauteur mesurée (une photo, plusieurs, mur en L, cadastre
  faux de 1,5 m), de la focale absente (l'estimation reste), des coins dégénérés, et de
  `hauteurPignon`. Dans l'application (serveur de développement, plateforme simulée, 1 280 et
  390 px) : photo générée d'un mur de 8 m à 5,20 m d'égout, cadastre à 6,00 m, pignon de 3 m, coins
  posés par de vrais glisser : hauteur mesurée 5,20 m, faîtage 2,98 m, ouvertures 120 × 136,
  120 × 120 et 90 × 216 pour 120 × 135, 120 × 120 et 90 × 215 ; correction à 6,00 m puis retour,
  cotes rendues à l'identique ; validation : élévation 5,20 m, toit à deux pans remplacé. La visée
  n'annonce plus le LiDAR ; le canal natif n'est plus appelé.
- **Empreintes** : les six artefacts du jeu de démonstration, recapturés à la `2.2.0` ; l'ancien
  numéro, l'ancienne date de build et l'ancien numéro de schéma remis dans les octets frais rendent
  les six empreintes de la `2.0.2` au bit près (`tests/fixtures/golden/EMPREINTES.md`).
