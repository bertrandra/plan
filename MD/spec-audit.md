# Mode audit — promenade de contrôle des toits et des façades

Statut : **spécification**, aucun code encore. Rédigée le 12 octobre 2026 ; points ouverts tranchés
le 13 octobre (§2), questions restantes au §11.

## 1. Le but

Se promener dans un quartier, téléphone en main, et noter les bâtiments dont le toit ou la façade
calculés sont faux. En fin de promenade, un fichier part à Claude, qui rejoue chaque cas hors
ligne, corrige la règle en cause, puis fige le résultat validé comme **cas de non-régression**.

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

## 3. Accès et cycle de vie

- `?mode=audit` n'a d'effet que si la personne administre (`app/acces.ts::confirmerAdministrateur`,
  qui relit le contexte de la plateforme quand il n'est pas en cache). Sinon, le paramètre est
  ignoré, un message le dit, et l'application s'ouvre normalement.
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
depuis la dernière lecture, le disque de 40 m centré sur la position est relu
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
- Caméra : **vue « drone »** derrière la position (40 m au-dessus, 42 m au sud ; jusqu'à 1,6 fois
  plus loin sur un écran en hauteur), qui suit. Glisser sur la scène passe en navigation libre ;
  « Me suivre » y revient.
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
  3. une note libre et, si vous voulez, une **photo** prise avec le téléphone.
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

- Pas d'édition du plan, pas de terrasse, pas d'export autre que le fichier de promenade.
- Pas de correction sur place : il note, il ne corrige pas.
- Pas d'envoi automatique à un serveur : le partage passe par vous.

## 10. Étapes

| Étape | Contenu | Vérifié par |
|---|---|---|
| 1 | Accès admin, aucune sauvegarde, GPS ou adresse de départ, caméra qui suit, lecture de 40 m à chaque pas de 10 m, toits en calcul entier et matériau BD TOPO, marquage, fiche (catégorie, problèmes, note, photo), liste de fin, fichier de promenade, partage | tests unitaires, fumée Playwright (adresse de départ et GPS simulé), une promenade réelle |
| 2 | Cases de 10 m et garde-fou de 600 bâtiments si la mesure le demande, brouillon local et reprise, menu Fichier réduit | GPS simulé sur un trajet de 500 m |
| 3 | Script `audit.ts`, test de non-régression, circuit écrit dans le skill `toits` | premier fichier réel rejoué |
| 4 | Plus tard : façade Panoramax à la demande sur un cas, note vocale | — |

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
