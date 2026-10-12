# Mode audit — promenade de contrôle des toits et des façades

Statut : **spécification**, aucun code encore (12 octobre 2026). À valider avant l'étape 1.

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

## 3. Accès et cycle de vie

- `?mode=audit` n'a d'effet que si `estAdministrateur()` (`app/acces.ts`) est vrai. Sinon, le
  paramètre est ignoré et l'application s'ouvre normalement.
- **Aucun projet plateforme** : ni création, ni enregistrement automatique, ni enregistrement
  final. Le menu Fichier est réduit à « Terminer et partager » et « Abandonner ».
- La lecture des toits en tâche de fond (`app/toitsFond.ts`) n'est pas utilisée : le mode audit
  calcule lui-même ce qui entre dans le rayon (§4.2).
- **Brouillon local** : les marques et les cas figés sont écrits au fur et à mesure dans le
  téléphone (IndexedDB). Ce n'est pas une sauvegarde de projet : sans ce brouillon, un écran
  verrouillé ou un onglet tué par le système ferait perdre la promenade. À la réouverture de
  `?mode=audit`, s'il existe un brouillon : « Reprendre l'audit du … » ou « Le jeter ». Une fois le
  fichier partagé, le brouillon est effacé (après confirmation).

## 4. Sur le terrain

### 4.1 Démarrage

1. Lecture du GPS (`shell/geolocalisation.ts::suivrePositionGps`). Tant que la précision annoncée
   dépasse 30 m, l'écran dit « En attente d'un GPS précis (± n m) ».
2. Le premier point précis fixe l'**origine** du repère (`projecteurLocal`). Elle ne bouge plus de
   la promenade : toutes les coordonnées du fichier sont en mètres depuis elle.
3. La parcelle sous les pieds devient la « parcelle du projet » du plan en mémoire. Beaucoup de
   fonctions en attendent une (centre de la scène, mitoyenneté), et elle sert de point de départ
   dans le fichier.
4. Chargement du rayon de 40 m (§4.2), puis Vue 3D, caméra qui suit.

### 4.2 Chargement par cases de 10 m

- Le terrain est découpé en **cases de 10 m** dans le repère de l'origine. Une case est lue quand
  son centre passe à moins de 40 m de la position, et ne l'est qu'une fois.
- On ne relit pas un disque à chaque pas : en marchant, seules les cases nouvelles sont demandées.
  La carte s'allonge le long du trajet, et ce qui est chargé reste.
- Pour chaque case : parcelles et bâtiments (cadastre, BD TOPO), dédoublonnés par l'IDU et
  l'identifiant BD TOPO, puis, pour chaque nouveau bâtiment :
  - toit LiDAR par la chaîne de l'import (`app/toitsLidar.ts::toitsDepuisLidar`), en **calcul
    entier** (celui du projet et des mitoyens : coupes, grille gardée), quatre lectures à la fois ;
  - couleur des murs par le matériau BD TOPO (§11, point 1) ;
  - couleur du toit sur l'orthophoto.
- Le régulateur (`app/regulateur.ts`) dose les lectures pendant un geste.
- Garde-fou : au-delà de 600 bâtiments chargés, les plus éloignés de la position sont retirés de
  la scène. Un bâtiment marqué ne l'est jamais.

### 4.3 La vue

- Vue 3D seule. Votre position y est montrée comme dans « Ma position (3D) »
  (`three/positionGps3d.ts`).
- Caméra : **vue « drone »** derrière la position, à 30 m environ, qui suit. Toucher la scène passe
  en navigation libre ; un bouton « Me suivre » y revient (§11, point 3).
- Barre d'état : bâtiments chargés, en calcul, marqués ; précision du GPS.

### 4.4 Marquer un bâtiment

- **Tapoter** un bâtiment : il passe en rouge, marqué « à vérifier », catégorie « toit » par défaut.
  Le rouge est une couleur d'affichage posée par-dessus, comme `?mode=devroof`
  (`app/diagnostic.ts`) : rien n'est modifié.
- Tapoter un bâtiment marqué : la marque est retirée.
- **Appui long** : choix de la catégorie (toit, façade, contour, hauteur, autre) et note libre.
- Au moment de la marque, le cas est **figé** (§5.2) et écrit dans le brouillon.

### 4.5 Fin de promenade

- « Terminer et partager » construit le fichier de la promenade (§5) et ouvre le partage du
  téléphone (`navigator.share({ files })`, après `navigator.canShare`) : messagerie, Drive, mail.
- Sans partage de fichiers (ordinateur, ancien navigateur) : le fichier est téléchargé.
- Un résumé s'affiche : nombre de cas par catégorie, et la liste des parcelles.

## 5. Le fichier de la promenade

### 5.1 Nom et forme

- Nom : `audit-AAAA-MM-JJ-HHMM-<commune>.json`, un fichier par promenade, JSON lisible (UTF-8).
- Taille : quelques dizaines de Ko par cas, surtout la grille LiDAR. Trente cas tiennent dans
  2 Mo environ.
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
    "constat": { "categorie": "toit", "note": "faîtage dans le mauvais sens", "t": "…", "position": { "x": 12.4, "y": -3.1, "precisionM": 5 } },
    "identite": { "cleBdtopo": "BATIMENT0000…", "idu": "78650000AE0101", "adresse": "2 allée des Limites" },
    "entrees": {
      "pts": [/* contour recalé, repère de l'origine */],
      "bdtopo": { /* attributs tels que lus */ },
      "grille": { /* grille MNH relue, comme village.mjs */ },
      "materiauMurs": "…", "materiauToit": "…",
      "voisins": [{ "cle": "…", "pts": [/* contours à moins de 5 m */] }],
      "photos": [/* références Panoramax, si une façade a été lue */]
    },
    "sorties": { "mode": "entier", "toit": { /* … */ }, "corps": [/* … */], "couleurMurs": { /* … */ }, "couleurToit": "#…" },
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
| 1 | Accès admin, aucune sauvegarde, GPS et caméra qui suit, chargement initial 40 m, toits et matériau, marquage, fichier de promenade, partage | tests unitaires, fumée sur GPS simulé (Playwright), une promenade réelle |
| 2 | Carte qui s'étend par cases de 10 m, garde-fou de 600 bâtiments, brouillon local et reprise | GPS simulé sur un trajet de 500 m |
| 3 | Script `audit.ts`, test de non-régression, circuit écrit dans le skill `toits` | premier fichier réel rejoué |
| 4 | Plus tard : façade Panoramax à la demande, photo du téléphone jointe au cas, note vocale | — |

## 11. Points ouverts (à confirmer avant l'étape 1)

1. **Couleur des façades pendant la promenade** : proposé, le matériau BD TOPO seulement. Panoramax
   télécharge des centaines de Mo et conclut rarement (2 bâtiments sur 31 au Vésinet). Il serait
   lu à la demande sur un cas marqué « façade », ou à la correction.
2. **Catégories** : toit, façade, contour, hauteur, autre.
3. **Caméra** : vue « drone » qui suit par défaut, navigation libre au toucher.
4. **Calcul entier** pour tous les bâtiments du rayon, alors qu'un projet normal calcule le
   voisinage lointain en version allégée. L'audit éprouve la chaîne complète ; le mode est noté dans
   `sorties.mode` pour comparer.
5. **Photo jointe** (étape 4) : elle alourdit le fichier (environ 300 Ko chacune).
