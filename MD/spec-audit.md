# Mode audit — promenade de contrôle des toits et des façades

Statut : étape 1 livrée (`2.2.0`). Rédigée le 12 octobre 2026 ; points ouverts tranchés le 13 octobre
(§2). Ajouts du 13 octobre, non codés : captures opportunistes sur les photos (§12) et audit de la
parcelle principale (§13). Questions restantes au §11.

## 1. Le but

Se promener dans un quartier, téléphone en main, et noter les bâtiments dont le toit ou la façade
calculés sont faux. En fin de promenade, un fichier part à Claude, qui rejoue chaque cas hors
ligne, corrige la règle en cause, puis fige le résultat validé comme **cas de non-régression**.

**Deux exigences** (décision du 13 octobre, `spec-regles-toits.md` §1) :
- **Le voisinage** : le modèle automatique le plus juste possible, mais pas à 100 %. La promenade
  sert à **calibrer** cet horizon : elle mesure où le modèle se trompe et nourrit les règles.
- **La parcelle principale**, et très probablement les **mitoyens** : **100 %**. L'audit de la
  parcelle (§13) capture tout ce qu'il faut pour y arriver, et ce qui est validé est figé dans le
  projet.

Le mode audit ne produit pas de projet : il produit un **jeu de test terrain**. Il étend ce que font
déjà les scripts du skill `toits` (`village.mjs`, `banc.ts`) et le test d'AE 101 « au centimètre ».

## 2. Décisions de l'utilisateur

- `?mode=audit` dans l'adresse, **administrateur seulement**.
- **Pas de sauvegarde** de projet.
- GPS direct, Vue 3D directe.
- Rayon de **40 m** autour de la position ; la carte s'étend quand on se déplace (pas de 10 m).
- Toits et couleur des façades calculés comme dans l'application.
- Un tapotement sur une maison la passe en **rouge** : elle est à vérifier.
- **Un fichier par promenade** (pas un par cas), **partagé** par la fonction de partage du téléphone.
- Un cas corrigé garde ses références, pour éviter les régressions.
- **Couleur des façades** pendant la promenade : le matériau **BD TOPO** seulement (pas de photos de
  rue Panoramax, trop lourdes et rarement concluantes).
- **Catégories** : toit, façade, contour, hauteur, autre ; pour le toit, une liste de problèmes
  précis (§4.5).
- **Caméra** : vue « drone » qui suit, navigation libre au toucher.
- **Calcul entier** des toits pour tous les bâtiments du rayon.
- **Photo** jointe à un cas : admise, environ 300 Ko par image.
- *13 octobre* : **chaque photo est exploitée au maximum** (§12). Elle donne la couleur de la façade
  de tout bâtiment marqué. Sur un bâtiment de la parcelle principale, elle donne aussi la texture et
  les ouvertures réelles. Plusieurs photos par cas, chacune avec sa position GPS et son azimut.
- *13 octobre* : un **audit de la parcelle principale**, à part de la promenade, pour en capturer le
  plus d'informations possible (§13).
- *13 octobre* : **l'audit de la parcelle principale est ouvert à tout utilisateur**, dans son projet :
  il met à jour le modèle après proposition (§13.6). **La promenade reste réservée à
  l'administrateur.**

## 3. Accès et cycle de vie

- `?mode=audit` n'a d'effet que si la personne administre (`app/acces.ts::confirmerAdministrateur`,
  qui relit le contexte de la plateforme quand il n'est pas en cache). Sinon, le paramètre est
  ignoré, un message le dit, et l'application s'ouvre normalement.
- Il s'ouvre depuis l'écran par **Admin › Mode audit (promenade)** : en admin des démos, vers
  `?admin&mode=audit` (le dépôt des démos n'est pas posé, rien ne s'y enregistre) ; pour
  l'administrateur de la plateforme, vers `?mode=audit`, seule entrée de son menu Admin.
- **Aucun projet plateforme** : ni création, ni enregistrement automatique, ni enregistrement
  final. Étape 1 : `main.ts` ne pose aucun dépôt de projets, le plan part vide (`graineAudit`) ;
  le menu Fichier n'est pas encore réduit (étape 2).
- La lecture des toits en tâche de fond (`app/toitsFond.ts`) n'est pas utilisée : le mode audit
  calcule lui-même ce qui entre dans le rayon (§4.2).
- **Brouillon local** (étape 2) : les marques et les cas figés sont écrits au fur et à mesure dans le
  téléphone (IndexedDB). Ce n'est pas une sauvegarde de projet : sans ce brouillon, un écran
  verrouillé ou un onglet tué par le système ferait perdre la promenade. À la réouverture de
  `?mode=audit`, s'il existe un brouillon : « Reprendre l'audit du … » ou « Le jeter ». Une fois le
  fichier partagé, le brouillon est effacé (après confirmation).

## 4. Sur le terrain

### 4.1 Démarrage

1. Lecture du GPS (`shell/geolocalisation.ts::suivrePositionGps`). Tant que la précision annoncée
   dépasse 30 m, l'écran dit « En attente d'un GPS précis (± n m) ».
2. La parcelle sous le premier point précis devient la « parcelle du projet » du plan en mémoire
   (`app/audit/chargement.ts::planDeDepart`). Beaucoup de fonctions en attendent une (centre de la
   scène, mitoyenneté), et elle sert de point de départ dans le fichier.
3. L'**origine** du repère est celle de son calage cadastral, comme à l'import (le sommet le plus
   au nord, `projecteurDuPlan`). Elle ne bouge plus de la promenade : toutes les coordonnées du
   fichier sont en mètres depuis elle, et le fichier la donne (`promenade.origine`).
4. Chargement du rayon de 40 m (§4.2), puis Vue 3D, caméra qui suit.

### 4.2 Chargement autour de vous

**Étape 1** (`app/audit/chargement.ts::chargerAutour`) : à chaque déplacement de plus de 10 m
depuis la dernière lecture, le disque de 70 m centré sur la position est relu (40 m à la
première version ; porté à 70 m pour couvrir ce que la vue « drone » montre devant vous)
(`app/actualisationIgn.ts::construireVoisinage`, option `centre`) ; ce qui est déjà chargé est
écarté par l'IDU et l'identifiant BD TOPO, seul le nouveau est ajouté, et ce qui est chargé reste.
Une lecture en cours met la suivante en attente. Les cases et le garde-fou ci-dessous viennent à
l'étape 2, si la mesure sur un long trajet le demande.

- Le terrain est découpé en **cases de 10 m** dans le repère de l'origine. Une case est lue quand
  son centre passe à moins de 40 m de la position, et ne l'est qu'une fois.
- On ne relit pas un disque à chaque pas : en marchant, seules les cases nouvelles sont demandées.
  La carte s'allonge le long du trajet, et ce qui est chargé reste.
- Pour chaque case : parcelles et bâtiments (cadastre, BD TOPO), dédoublonnés par l'IDU et
  l'identifiant BD TOPO, puis, pour chaque nouveau bâtiment :
  - toit LiDAR par la chaîne de l'import (`app/toitsLidar.ts::toitsDepuisLidar`), en **calcul
    entier** (celui du projet et des mitoyens : coupes, grille gardée), quatre lectures à la fois ;
  - couleur des murs par le matériau BD TOPO ;
  - couleur du toit sur l'orthophoto.
- Le régulateur (`app/regulateur.ts`) dose les lectures pendant un geste.
- Garde-fou : au-delà de 600 bâtiments chargés, les plus éloignés de la position sont retirés de
  la scène. Un bâtiment marqué ne l'est jamais.

### 4.3 La vue

- Vue 3D seule. Votre position y est montrée comme dans « Ma position (3D) »
  (`three/positionGps3d.ts`).
- Caméra : **vue « drone »** (`app/audit/camera.ts`). Son centre de rotation et de zoom est votre
  position : à chaque déplacement, il y revient, et la caméra garde le zoom et la rotation que vous
  lui avez donnés. Le déplacement latéral au doigt est coupé (il déplacerait ce centre).
- **« Me suivre »** recadre derrière vous, dans l'axe de votre **cap**, inclinée à 40°, assez haut pour
  voir **70 m devant** en haut de l'écran, puis suit ce cap. Le cap vient de la **boussole** du
  téléphone (`shell/boussole.ts` : `webkitCompassHeading` sur Safari, autorisation demandée par ce
  bouton ; `deviceorientationabsolute` sur Chrome), lissée, appliquée par pas de 3° ; sans boussole,
  du sens de la marche (pas de 4 m au moins). Tourner la vue d'un doigt lâche le cap ; le pincement
  (zoom) ne le lâche pas.
- Une barre dans la Vue 3D (`zones/vue3d/Vue3d.tsx`, commandes `audit.suivre` et `audit.cas`) :
  l'état (lecture, bâtiments chargés, précision du GPS), « Me suivre », « Cas notés (n) ». En bas
  de l'écran au doigt, au-dessus de la scène sur bureau.

### 4.4 Marquer un bâtiment

- **Tapoter** un bâtiment : il passe en rouge, marqué « à vérifier », catégorie « toit » par défaut.
  Le rouge est une couleur d'affichage posée par-dessus, comme `?mode=devroof`
  (`app/diagnostic.ts`) : rien n'est modifié.
- Tapoter un bâtiment marqué : la marque est retirée.
- **Appui long** sur un bâtiment (marqué au passage s'il ne l'était pas) : une fiche courte, en trois touches au plus :
  1. la catégorie (toit, façade, contour, hauteur, autre) ;
  2. un ou plusieurs problèmes précis de la liste du §4.5 (pastilles à cocher) ;
  3. une note libre et, si vous voulez, une **photo** prise avec le téléphone. La photo garde sa
     **prise de vue** (`PhotoCas.prise`) : position GPS (repère du plan et degrés, précision) et
     **azimut** de la boussole au retour de l'appareil photo (à défaut, le sens de la marche,
     `sourceAzimut`). La fiche l'écrit sous la photo : « Prise à ± 5 m, vers 245° (OSO), boussole ».
- Au moment de la marque, le cas est **figé** (§5.2) ; la grille LiDAR et l'adresse le complètent
  dès qu'elles arrivent, et le partage les attend. Les précisions
  peuvent venir plus tard, sur place ou dans la liste de fin de promenade (§4.6).

### 4.5 Les problèmes à cocher

Chaque problème a un code stable, écrit dans le fichier : c'est lui que le script de rejeu et les
tests lisent. La dernière colonne dit où le chercher dans la chaîne (skill `toits`).

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

### 4.6 Fin de promenade

- « Cas notés (n) » ouvre la liste ; « Partager le fichier » construit le fichier de la promenade (§5) et ouvre le partage du
  téléphone (`navigator.share({ files })`, après `navigator.canShare`) : messagerie, Drive, mail.
- Sans partage de fichiers (ordinateur, ancien navigateur) : le fichier est téléchargé.
- Avant le partage, la **liste des cas** s'affiche : parcelle, adresse, catégorie et problèmes. Chaque
  cas s'y complète (« Modifier » rouvre sa fiche, qui ramène à la liste) ou s'y retire. Plus tard :
  un appui centre la Vue 3D sur le bâtiment.
- Après le partage : un message donne le nom du fichier. Plus tard : le nombre de cas par catégorie.

## 5. Le fichier de la promenade

### 5.1 Nom et forme

- Nom : `audit-AAAA-MM-JJ-HHMM-<commune>.json`, un fichier par promenade, JSON lisible (UTF-8).
- Taille : quelques dizaines de Ko par cas, surtout la grille LiDAR, plus la photo s'il y en a une.
  La photo est réduite à 1 280 px de large en JPEG (environ 300 Ko) et intégrée au fichier (en
  base64, environ 400 Ko). Trente cas sans photo tiennent dans 2 Mo ; avec une photo chacun, environ
  14 Mo.
- **Pas de trace GPS complète** dans le fichier (vie privée, taille) : seulement la position de
  chaque marque et l'emprise parcourue.

### 5.2 Structure

```jsonc
{
  "format": "plan-audit", "version": 1,
  "promenade": {
    "debut": "2026-10-13T09:12:00Z", "fin": "2026-10-13T10:05:00Z",
    "commune": "Le Vésinet", "origine": { "lat": 48.9053, "lon": 2.1328 },
    "emprise": { "xMin": -40, "xMax": 620, "yMin": -55, "yMax": 180 },
    "code": { "version": "2.2.0", "commit": "abc1234" },
    "regles": { "lectureToits": 1, "lectureMurs": 2 }
  },
  "cas": [{
    "id": "c1",
    "statut": "a_corriger",
    "constat": { "categorie": "toit", "problemes": ["toit.sens-faitage"], "note": "faîtage parallèle à la rue", "t": "…", "position": { "x": 12.4, "y": -3.1, "precisionM": 5 }, "photo": { "type": "image/jpeg", "base64": "…" } },
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
  }]
}
```

- **`entrees`** : tout ce qu'il faut pour rejouer le calcul **sans réseau**, et à l'identique même si
  l'IGN publie plus tard un autre millésime. Les champs suivent l'entrée `batiments[]` du fichier
  de village (`village.mjs`), que `banc.ts` sait déjà rejouer.
- **`sorties`** : ce que le code a produit ce jour-là, avec sa version et celle des règles.
- **`attendu`** : vide sur le terrain, rempli à la validation (§6).
- **`historique`** : chaque changement de statut ou d'attendu, avec sa date, le commit et une phrase.

## 6. Dans le dépôt

- Le fichier reçu est rangé tel quel dans `tests/fixtures/audit/`. Seuls `statut`, `attendu`,
  `historique` et, au besoin, `correction` sont modifiés ensuite.
- Statuts d'un cas :

| Statut | Sens |
|---|---|
| `a_corriger` | marqué sur le terrain, pas encore traité |
| `corrige` | une règle a été corrigée ; l'attendu proposé attend votre validation |
| `valide` | vous avez validé le résultat (sur images, ou sur place) : il devient référence |
| `sans_suite` | pas une erreur du code (contour BD TOPO faux, LiDAR absent, arbre…), avec la raison |

## 7. Rejouer et corriger (Claude)

1. Script `.claude/skills/toits/scripts/audit.ts <fichier>` : rejoue chaque cas avec le code
   courant, puis compare aux `sorties` (ce qui a été vu sur le terrain) et à l'`attendu`. Il écrit
   un tableau et les fichiers de `rendu.py` (cartes des hauteurs), comme `banc.ts`.
2. Diagnostic sur les cartes et en 3D (méthode du skill `toits`, §6).
3. Correction par **une règle générale**, jamais un cas codé. Elle est validée sur les villages du
   banc, AE 101 ne bouge pas (`identite.ts`), et elle est notée dans `CHANGELOG.md`.
4. Le cas passe à `corrige`, avec l'attendu proposé et `correction: { commit, regle }`. Images
   avant/après dans la PR.
5. Après votre accord : `valide`.

Façade : le script relit les photos Panoramax référencées, quand il y en a.

## 8. Non-régression

- Test `tests/unit/facade/audit.test.ts`. Il charge tous les fichiers de `tests/fixtures/audit/` et
  rejoue chaque cas `valide`. Il compare au centimètre, comme AE 101 :
  - les corps à l'attendu ;
  - la couleur et la source des murs.
- Les cas `a_corriger` et `corrige` sont listés en `test.todo` : ils ne bloquent pas la CI.
- Un attendu qui doit changer (une amélioration voulue) se change dans la PR qui le fait bouger,
  avec une ligne d'`historique`. Une PR qui le fait bouger sans le dire est rouge en CI.
- Les cas d'audit rejoignent le banc des villages dans le skill `toits` (§5 et §6 du skill).

## 9. Ce que le mode audit ne fait pas

- Pas d'édition du plan, pas de terrasse, pas d'export autre que le fichier de promenade. (L'audit
  de la parcelle, lui, se fait dans le projet et le met à jour après proposition, §13.)
- Pas de correction sur place : il note, il ne corrige pas.
- Pas d'envoi automatique à un serveur : le partage passe par vous.

## 10. Étapes

| Étape | Contenu | Vérifié par |
|---|---|---|
| 1 | Accès admin, aucune sauvegarde, GPS ou adresse de départ, caméra qui suit, lecture de 40 m à chaque pas de 10 m, toits en calcul entier et matériau BD TOPO, marquage, fiche (catégorie, problèmes, note, photo), liste de fin, fichier de promenade, partage | tests unitaires, fumée Playwright (adresse de départ et GPS simulé), une promenade réelle |
| 2 | Cases de 10 m et garde-fou de 600 bâtiments si la mesure le demande, brouillon local et reprise, menu Fichier réduit | GPS simulé sur un trajet de 500 m |
| 3 | Script `audit.ts`, test de non-régression, circuit écrit dans le skill `toits` | premier fichier réel rejoué |
| 4 | Plus tard : façade Panoramax à la demande sur un cas, note vocale | — |
| 5 | Captures opportunistes (§12.1 à §12.3) : plusieurs photos par cas, focale et inclinaison de la prise, mur proposé sur la photo, couleur de la façade lue | tests sur des photos générées dont la prise de vue est connue, une promenade réelle |
| 6 | Relevé depuis une fiche, sur la parcelle principale (§12.4) : texture, ouvertures, hauteur mesurée | les images de test du relevé, une façade réelle |
| 7 | Audit de la parcelle dans le projet, pour tout utilisateur (§13) : commande, liste de contrôle, photos, propositions, mise à jour du modèle, bâtiments validés | une parcelle réelle, toutes façades ; Ctrl+Z ; rien de saisi à la main écrasé sans accord |
| 8 | Partage de l'audit pour le corpus (§13.7), import d'un audit dans un autre projet | un fichier rejoué sans réseau |

## 11. Questions (réponses de l'utilisateur)

1. **Plusieurs problèmes par cas** : la fiche permet d'en cocher plusieurs (« sens du faîtage » et
   « pignon manquant » sur la même maison). Réponse : oui.
2. **Essai sans sortir** : un départ sur une adresse au lieu du GPS (`?mode=audit&depart=…`), la
   position se déplaçant au doigt sur la Vue 3D. Utile pour vous, pour essayer chez vous, et pour
   les tests automatiques. Réponse : oui, même accès admin (fait).
3. **Validation d'une correction** : je montre dans la PR, pour chaque cas corrigé, l'image avant et
   l'image après (vue 3D et carte des hauteurs) ; vous répondez « validé » ou non. Réponse : oui.
4. **Photo à l'étape 1 ou 2** : réponse de l'utilisateur, dès l'étape 1 (fait : JPEG de 1 280 px au
   plus, 300 Ko au plus, `app/audit/photo.ts`).
5. **Couleur opportuniste** (§12.3) : lecture automatique depuis la prise de vue, ou toujours un
   toucher sur la façade pour la confirmer ? Proposition : automatique ; on demande un toucher
   seulement quand la lecture ne conclut pas ou que l'azimut vient du sens de la marche.
6. **Relevé sur place ou à la fin** (§12.4) : poser les coins et vérifier les ouvertures prend une à
   deux minutes par façade. Proposition : photos sur place, relevé depuis la liste de fin, pour ne pas
   ralentir la marche.
7. **Import dans le projet** (§13.6) : l'audit de parcelle s'importe-t-il dans le projet de la même
   parcelle ? Réponse de l'utilisateur (13 octobre) : l'audit se fait **dans le projet** et **met à
   jour le modèle après proposition**. L'import d'un fichier ne sert plus qu'au cas d'un audit fait
   ailleurs (§13.7).
8. **Ce que l'audit de parcelle couvre** (§13.3) : façades, toits, clôture côté rue et portail ;
   arbres plus tard ? Proposition : oui.
9. **Accès à l'audit de parcelle** : administrateur seulement, comme la promenade, ou plus tard ouvert
   à tous comme relevé complet d'une maison ? Réponse de l'utilisateur (13 octobre) : **ouvert à tout
   utilisateur**, parce qu'il met à jour le modèle après proposition ; la promenade reste
   administrateur.

## 12. Captures opportunistes, pendant la promenade

Rien de plus à faire sur le terrain : **chaque photo jointe à un cas est exploitée au maximum**, en
tâche de fond, sans bloquer la marche. Ce qui en est tiré est rangé dans le cas (`lectures`, §12.5),
comme une **proposition**. La Vue 3D de la promenade ne change pas : le mode audit note, il ne
corrige pas (§9). Au rejeu, ces lectures sont comparées à ce que Plan avait calculé (§7).

### 12.1 Plusieurs photos par cas, chacune située

- Une fiche accepte **jusqu'à six photos**. Chacune garde sa prise de vue (`PhotoCas.prise`, déjà
  livrée) :
  - la position GPS et sa précision ;
  - l'azimut et sa source (boussole ou sens de la marche).
- Elle garde en plus :
  - **la focale**, lue dans l'EXIF *avant* la réduction, qui l'efface (`facade/exif.ts::focale35mm`,
    `champDepuisFocale35`) ; à défaut, le champ par défaut du relevé (67° sur le grand côté,
    `facade/cadrage.ts::CHAMP_GRAND_COTE_DEFAUT`) ;
  - **l'inclinaison** du téléphone au retour de l'appareil photo (`beta` de l'orientation) : la
    projection d'un mur dans une photo prise vers le haut n'est pas celle d'une photo d'aplomb.
- Limite à garder en tête : l'azimut est lu au retour de l'appareil photo, pas au déclenchement. La
  boussole d'un téléphone se trompe aussi de 5 à 15° près d'un mur ou d'une voiture. Tout ce qui
  suit tient compte de cette marge.

### 12.2 Quel mur est sur la photo

- Les murs du bâtiment marqué qui regardent la prise de vue sont ceux que la lecture Panoramax
  sait déjà trouver (`render/couleurMurPhoto.ts::mursVisibles`, `vueCachee`). Ils doivent se
  trouver à 3 à 40 m, vus à moins de 70° de face, sans autre bâtiment devant.
- Le mur retenu est celui dont le milieu est le plus près de l'axe de la photo. La fiche le
  dessine sur la photo, avec son orientation (« Façade sud-est, 9,2 m »). « Ce n'est pas ce mur »
  passe au suivant.
- Sans azimut (ni boussole ni marche), rien n'est proposé : la photo reste une photo.

### 12.3 La couleur de la façade (tout bâtiment marqué)

1. **Automatique.** Les points du mur sont posés sur la photo par la géométrie de la prise de vue
   (`pointsDuMur`, `pointDansImage` en photo plate, avec la focale et l'inclinaison). Pour absorber
   l'erreur de la boussole, on ne garde que la **moitié centrale** du mur. On garde aussi la règle
   des clôtures : pas de ligne de vue sous 2,5 m aux limites de parcelle (`hauteurAuxLimites`). La
   teinte est décidée par `model/couleurMur.ts::couleurMurDepuisPixels`, comme pour Panoramax :
   teinte cohérente, ou rien.
2. **Un toucher, si besoin.** Quand la lecture ne conclut pas, ou que l'azimut vient du sens de la
   marche, la fiche demande « Touchez la façade sur la photo ». On lit la teinte autour du point
   touché. Les fenêtres et les ombres sont écartées par le même filtre d'écart à la médiane que le
   relevé (`facade/analyse.ts::teinteMediane`).
3. **Ce qui est rangé** : la couleur, le mur (`cote`), la photo qui l'a donnée, le nombre de pixels
   lus et la source (`automatique` ou `toucher`).

Ce que cela apporte :
- **Au rejeu** : si l'écart de teinte avec `sorties.couleurMurs` dépasse le seuil de
  `model/couleurMur.ts`, le problème `facade.couleur` est **proposé** sur le cas (pas coché).
- **Au corpus** : chaque couleur lue sur une photo de terrain est une **vérité terrain** pour la
  lecture Panoramax et pour le repli sur le matériau BD TOPO (§6.5 de `spec-toit-ign.md`). On mesure
  enfin leur taux de réussite.

### 12.4 Sur la parcelle principale : texture et ouvertures réelles

La **parcelle principale** est celle du départ (§4.1). Sur un bâtiment de cette parcelle, la fiche
propose en plus **« Relever cette façade »**. Elle ouvre le relevé existant (`spec-releve-facade.md`)
sur les photos du cas, sans le temps « Choisir le mur » (§12.2 l'a fait) ni « Se placer » (les
photos sont prises) :

- **Coins proposés** d'après la prise de vue : la distance au mur vient du GPS, et les coins de
  `facade/analyse.ts::coinsProposes`, puis s'ajustent au doigt avec la loupe, comme dans le relevé.
- **Plusieurs photos du même mur**, prises de gauche à droite : assemblées en mosaïque
  (`facade/mosaique.ts::analyserMosaique`).
- **Ce qui en sort**, un `ReleveFacade` complet :
  - l'**élévation redressée** à l'échelle, qui devient la texture du mur ;
  - les **ouvertures réelles** (type, position, dimensions au centimètre, `facade/detection.ts`),
    vérifiées au doigt ;
  - la **hauteur à l'égout mesurée** ;
  - la partie basse d'un mur en L ;
  - le toit lu sur la façade.
- Le relevé peut attendre la **liste de fin** (« À relever », §4.6) : sur le terrain, les photos
  suffisent.
- Pas de relevé sur les autres parcelles. On y lit la couleur (§12.3), pas le détail d'une façade
  qui n'est pas celle du client (vie privée et taille du fichier).

### 12.5 Dans le fichier de la promenade

Version 2 du format (`"version": 2`). Un fichier de version 1 se relit tel quel : sa `photo` unique
devient `photos[0]`.

```jsonc
"constat": {
  "photos": [{ "type": "image/jpeg", "base64": "…",
               "prise": { "x": 12.4, "y": -3.1, "lat": 48.9, "lon": 2.13, "precisionM": 5,
                          "azimutDeg": 245, "sourceAzimut": "boussole",
                          "inclinaisonDeg": 4, "focale35": 26, "champDeg": 69.4 } }]
},
"lectures": {
  "facades": [{ "cote": 2, "couleur": "#c9b49a", "source": "automatique", "photo": 0, "pixels": 412 }],
  "releves": [{ "cote": 2, "photos": [0, 1], "coins": [/* par photo */], "releve": { /* ReleveFacade */ } }]
}
```

Taille : une élévation redressée fait 1 024 px au plus en JPEG, environ 150 Ko. Six photos par cas
pèsent environ 2,4 Mo en base64 : le résumé de fin le dit avant le partage.

## 13. Audit de la parcelle principale

### 13.1 Le but

En une visite, capturer **le plus d'informations possible sur une parcelle**, en général celle du
client. Le but est le **100 %** sur ses bâtiments (§1), et sur les mitoyens qui se voient :
- toutes les façades de tous ses bâtiments ;
- ce que l'on voit des toits ;
- les couleurs, les matériaux et les textures ;
- les ouvertures et les hauteurs mesurées ;
- la clôture côté rue et le portail.

C'est un mode **à part** de la promenade : on ne marche pas dans un quartier, on fait le tour d'une
maison, avec une liste de contrôle qui dit ce qui manque. Il est **ouvert à tout utilisateur**, dans
son projet : ce qu'il capture devient des **propositions** qui, acceptées, **mettent à jour le
modèle** du projet (§13.6). La promenade, elle, reste réservée à l'administrateur.

### 13.2 Accès et départ

- **Dans un projet**, par une commande du registre, `audit.parcelle` (« Auditer la parcelle… »),
  groupe `audit`. Elle demande le droit d'écrire le projet (`projects.write`) : en lecture seule, elle
  est grisée avec sa raison. Elle s'inscrit dans `app/exposition.ts` pour les trois classes d'écran :
  menu Projet en large, feuille du projet en compact et en moyen.
- Elle porte sur la **parcelle du projet** (`model/fonctions.ts::parcelleDuProjet`) : ses bâtiments
  et ses mitoyens, déjà chargés par l'import, en calcul entier. Rien d'autre n'est lu. Sans parcelle
  cadastrale (plan dessiné à la main), la commande est grisée : « Importez d'abord la parcelle depuis
  son adresse. »
- Vue 3D centrée sur la parcelle, votre position GPS montrée si vous êtes sur place. On peut aussi
  auditer **de chez soi** avec des photos déjà prises : la position et l'azimut viennent alors de
  l'EXIF quand il les porte, sinon de la façade choisie dans la liste.
- Ce qui est en cours (photos, relevés non encore acceptés) est gardé sur l'appareil
  (`io/photosLocales.ts`, brouillon) : une visite peut durer une heure, et l'onglet peut être tué.
  Rien n'entre dans le projet avant d'être accepté (§13.6).
- L'administrateur peut ouvrir le même audit sur une parcelle hors projet (`?mode=audit&cible=parcelle`,
  menu Admin) ; il en sort un fichier (§13.7).

### 13.3 La liste de contrôle

Un parcours plein écran (Z8) liste, pour chaque bâtiment de la parcelle :

| Ligne | Statuts | D'où |
|---|---|---|
| chaque **façade** : orientation, longueur | à photographier · photographiée (n photos) · relevée · inaccessible | `facade/geometrie.ts::facadesDuContour` |
| le **toit** : « Ce que je vois » (forme, sens du faîtage, bouts, lucarnes) | à voir · vu | `spec-regles-toits.md` §7.2 |
| les **cheminées** : nombre, position (faîtage, pan, pignon, adossée), matériau, couronnement | à voir · vues · aucune | `spec-regles-toits.md` §2.6 |
| la **toiture-terrasse**, s'il y en a une : accessible, revêtement, acrotère, garde-corps, édicules | à voir · vue | `spec-regles-toits.md` §2.7 |
| le **matériau** des murs et de la couverture | à voir · vu | les choix du §2 de `spec-regles-toits.md` et de `textureMur.ts` |

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

### 13.4 Photographier une façade

Le relevé existant, guidé par la position :

1. **Le mur en face** : la boussole propose le mur que l'on regarde (`facadeFaceAuCap`) ; la liste
   permet d'en choisir un autre.
2. **Se placer** : la distance au mur vient du GPS (à sa précision près), puis du cadrage. Le plan de
   prise dit « une photo suffit » ou « 3 photos, de gauche à droite » (`facade/cadrage.ts::planDePrise`).
3. **Les photos**, chacune située (§12.1). Plusieurs photos par façade :
   - la **mosaïque** quand le recul manque (`spec-releve-facade.md` §6.1) ;
   - des **photos de face et de biais**, pour retrouver une ouverture cachée par un arbre ou une
     voiture sur l'une d'elles ;
   - un **gros plan du parement**, à un ou deux mètres, pour la texture du matériau (§13.5).
4. **Le relevé** (coins, analyse, vérification) se fait sur place ou plus tard dans la liste.

### 13.5 Ce qui est calculé, par façade

Tout se calcule dans le navigateur, sans serveur, avec le code du relevé :

| Donnée | Comment | Code |
|---|---|---|
| hauteur à l'égout, mesurée | les quatre coins et la focale | `facade/analyse.ts::mesurerHauteur` |
| élévation redressée, texture du mur | homographie, mosaïque si plusieurs photos | `analyserReleve`, `analyserMosaique` |
| ouvertures réelles (type, x, y, l, h) | détection puis correction au doigt | `facade/detection.ts::detecterOuvertures` |
| couleur du mur | médiane de ce qui n'est pas une ouverture | `teinteMediane`, `couleurMurDepuisPixels` |
| matériau du parement | choisi par vous (pierre, meulière, brique, enduit, béton, bois) ; plus tard proposé par Claude analyste | `three/textureMur.ts` |
| **texture du matériau** | le gros plan, découpé au centre en tuile sans couture ; l'échelle vient du matériau (`TAILLE_M` : une brique, une pierre) | nouveau |
| toit vu de la façade | silhouette au-dessus de l'égout, triangle du pignon | `facade/toit.ts` |
| mur en L | les deux points du décrochement | `facade/profil.ts` |

La texture de matériau tirée du gros plan est la seule partie nouvelle. Elle remplace, pour ce
bâtiment, la texture dessinée de `textureMur.ts`, teinte comprise.

### 13.6 Les propositions, puis la mise à jour du modèle

Ce que l'audit capture n'entre pas tout seul dans le projet : Plan le **propose**, vous acceptez.

1. **Après chaque façade relevée**, et à la fin de l'audit, une liste de propositions, une ligne par
   changement, avec l'avant et l'après :
   - « Façade sud : 6 ouvertures relevées (Plan en avait mis 4), texture de la photo » ;
   - « Façade sud : 5,82 m à l'égout, mesurés (le bâtiment a 6,00 m) » ;
   - « Murs : enduit beige #c9b49a, lu sur vos photos (au lieu de la couleur du matériau) » ;
   - « Toit : deux cheminées au faîtage, brique » ;
   - « Toit-terrasse du garage : accessible, acrotère de 1 m » ;
   - « Clôture côté rue : mur de 1,60 m, portail de 3,50 m ».
2. Chaque ligne se **coche ou se décoche** ; « Tout appliquer » et « Appliquer la sélection ».
   La Vue 3D montre l'après en aperçu avant que vous validiez.
3. **Appliquer** écrit tout en **un seul pas d'historique** (Ctrl+Z le défait), et le projet est
   marqué modifié.
4. **Une valeur que vous aviez choisie à la main** (couleur, matériau, relevé d'une façade, forme du
   toit) n'est jamais remplacée en silence. Sa ligne est **décochée par défaut** et le dit : « remplace
   votre choix : brique rouge ».
5. Un bâtiment dont le toit et les façades ont été vus et acceptés est marqué **« vérifié sur
   place »**, avec la date. C'est le 100 % du §1. Les changements de règle ne le recalculent plus
   (`spec-regles-toits.md` §1). Une actualisation IGN (Fichier › Actualiser) non plus, sauf si vous le
   demandez.

Ce qui est écrit utilise les structures **déjà dans le projet** :
- `ReleveFacade` pour chaque façade (texture, ouvertures, hauteur, partie basse, toit lu) : la 3D et
  le plan l'affichent sans code nouveau ;
- `couleurMurs` (source `photo`) et la texture de matériau ;
- les cheminées et la terrasse dans le corps du toit (`spec-regles-toits.md` §4) ;
- la clôture et le portail de la parcelle.

Les élévations et les photos restent sur l'appareil (`io/photosLocales.ts`), comme celles d'un relevé
(`spec-releve-facade.md` §10.1).

L'audit ne touche pas au code des toits : AE 101 et les empreintes ne bougent pas.

### 13.7 Le fichier, pour le corpus

- Nom : `audit-parcelle-AAAA-MM-JJ-<idu>.json`, format `plan-audit-parcelle`, version 1.
- Contenu :
  - la parcelle (IDU, adresse, origine), la version du code et des règles ;
  - pour chaque bâtiment : les `entrees` et les `sorties` d'un cas (§5.2), le toit vu, et pour chaque
    façade ses photos (avec prise et coins), son `ReleveFacade`, sa couleur, son matériau et son gros
    plan ;
  - la clôture et le portail ;
  - pour chaque proposition, si elle a été acceptée ou refusée.
- Taille : dix façades à trois photos font environ 9 Mo d'images, plus 1,5 Mo d'élévations, soit
  environ 14 Mo en base64.
- **Qui le produit** :
  - l'administrateur, toujours (audit hors projet, menu Admin) ;
  - un utilisateur, **seulement s'il accepte de le partager** (« Partager cet audit pour améliorer
    Plan », décoché par défaut). Ses photos sont celles de sa maison : rien ne part sans son accord
    (question 11).
- **Ce qu'il apporte** : chaque façade relevée est une vérité terrain, comparée au rejeu (§7) avec ce
  que Plan calcule seul :
  - la couleur Panoramax ou celle du matériau BD TOPO ;
  - les ouvertures automatiques (`facade/ouvertures.ts::ouverturesAutomatiques`) ;
  - la hauteur des murs ;
  - le toit.

  Le test de non-régression (§8) s'étend aux façades : couleur, nombre et position des ouvertures.
  Une proposition **refusée** est aussi une information : Plan s'est trompé dans sa lecture.
- **Fichier › Importer un audit de parcelle** applique un fichier à un projet de la même parcelle
  (même IDU), avec les mêmes propositions (§13.6). C'est le cas d'un audit fait par l'administrateur
  pour un client.

### 13.8 Ce que l'audit de parcelle ne fait pas

- Pas de reconstruction de la géométrie depuis les photos : le contour reste celui du plan, comme
  dans le relevé.
- Pas d'intérieur, pas de mesure du terrain.
- Pas de photo détaillée des parcelles voisines.
- Pas d'envoi automatique : le partage passe par vous.
- Pas de changement du modèle sans votre accord : tout passe par les propositions (§13.6).
10. **Mitoyens à 100 %** (§1) : l'exigence de la parcelle principale vaut-elle aussi pour les
    bâtiments mitoyens ? Votre réponse du 13 octobre : « probablement ». Proposition : oui. L'audit
    de parcelle les liste avec ce qui se voit depuis la rue et depuis la parcelle ; ce qui ne se voit
    pas reste au calcul.
11. **Partage de l'audit d'un utilisateur** (§13.7) : un utilisateur peut-il partager son audit pour
    améliorer les règles, et sous quelle forme ? Proposition : une case « Partager cet audit pour
    améliorer Plan », décochée par défaut, qui envoie le fichier au serveur de la plateforme ; sans
    elle, rien ne quitte l'appareil.
