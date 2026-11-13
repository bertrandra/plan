# Banc d’apprentissage des façades

Une application à part, rangée dans ce dépôt mais indépendante de Plan : son propre code (`banc/src/`), son propre
serveur PHP (`banc/public/api.php`), son propre mot de passe et ses propres données. Elle sert à constituer et
entretenir le jeu d’apprentissage d’un YOLO qui évalue les façades (fenêtres et ce qui les compose, portes, volets,
pignons…), du marquage brouillon à l’export au format natif d’Ultralytics.

- **Adresse** : `https://<hôte>/?banc` (la page est dans `public_html/banc/`, l’adresse `?banc` y mène par une règle du
  `.htaccess` de Plan, la seule chose qui les relie).
- **Mot de passe** : `banc-config.php`, à côté de `public_html/` (modèle : `banc/public/banc-config.exemple.php`).
- **Données** : `data/apprentissage/`, à côté de `banc-config.php`, hors de `public_html/`.

## Les étapes

| Étape | Écran | Ce qu’on y fait |
|---|---|---|
| 0 | Classes | L’arbre des objets, un **fichier de données** (`banc/data/apprentissage/classes.json`, livré dans `data/apprentissage/`, modifiable à l’écran) : nom, place dans l’arbre (un cadre se range dans sa fenêtre), forme (rectangle ou polygone), couleur du marquage, attributs à renseigner, « apprise » ou non, et ses **types** : le modèle voit la famille (fenêtre, porte, volet) et la qualifie (`fenetre_2v`, `porte_garage`, `volet_roulant`…). L’arbre de départ donne les vingt noms de `fenetre_1v` (0) à `loggia` (19), sous des **regroupements** qui classent sans se dessiner, tous sur la façade : Lignes et pointes de façade (égout, sol : des **lignes** ; pointes de pignon : des **points** ; jamais appris par YOLO, gardés dans le format du banc), Ouverture (fenêtre, lucarne, porte), Fermeture (volet), Saillie (balcon, garde-corps, loggia), Parties du mur (pignon, soubassement), Équipements (gouttière ; descente de gouttière, apprise, #23) ; le **Toit**, hors de la façade, regroupe toiture, cheminée (#20), lucarne (#9), panneau solaire (#21) et fenêtre de toit (#22) ; lucarne et fenêtre de toit sont **aussi** des ouvertures (une classe peut faire partie de plusieurs regroupements). Chaque nom appris a un **indice figé** dans le fichier : déplacer une classe dans l’arbre ne change plus les indices, et un nom nouveau sans indice vient à la suite ; les détails de la fenêtre (cadres, quadrillage, appui, coffre) se marquent pour mémoire, et cochés « appris » ils prennent leurs indices après les vingt. L’export porte `hierarchie.json` : le chemin de chaque nom dans l’arbre. |
| 1a | Import | Les photos de l’iPhone (ou de tout appareil) : position, date, cap, appareil et focale de l’EXIF gardés ; grand côté ramené à 3 200 px. |
| 1b | Import | Panoramax autour d’une adresse (plusieurs propositions du géocodage, ou des coordonnées tapées) et de **sa parcelle au cadastre de l’IGN** (Parcellaire Express, WFS de la Géoplateforme : la parcelle qui contient l’adresse, sinon la plus proche ; une autre se touche sur la petite carte), dans un rayon autour de ses bords, par lot ; les photos sont rapportées à la parcelle (distance, cap vers son milieu, si elle est dans le champ) et la gardent (`parcelle`, son identifiant) ; un panoramique 360 donne une vue de **chaque côté de la rue**, à 90° du sens de la prise de vue (là où sont les façades), ou le seul côté de l’adresse, ou la vue droit vers elle. La liste montre chaque 360 en entier, avec les vues qui seront importées ; « Choisir les vues » ouvre une fenêtre au-dessus de la liste (← → d’un 360 à l’autre, Échap) pour en ajouter, en retirer ou en tourner (gauche, droite, vers une maison). Une photo déjà importée ne revient pas. |
| 2 | Redressement | Vue de face par les points de fuite, en lot (avec son avancement) ; les échecs se retrouvent sous leur filtre, à reprendre par quatre coins d’un rectangle du mur posés à la main ; ou « de face ». On choisit des photos en les touchant : « Déjà de face » les passe telles quelles à la mosaïque ; **« Fusionner »** assemble les photos d’un même mur, choisies de gauche à droite, en une seule (`fusion.ts` : la pose grossière de la mosaïque de Plan, la place où leurs parties communes se ressemblent le plus, avec un décalage vertical et une échelle cherchés ; puis `fusionAlignement.ts` : des vignettes retrouvées d’une photo à l’autre au dixième de pixel, l’homographie qui les accorde (RANSAC, moindres carrés), une couture étroite au milieu du recouvrement et l’exposition égalisée ; les originales sont rejetées, au choix). |
| 2a | Mosaïque | Les photos redressées en mosaïque (à valider, validées, rejetées) : valider (V), rejeter (R), refaire (A), flèches ; **Entrée** ouvre la revue en grand, où la photo suivante vient d’elle-même après chaque geste. Les rejetées se suppriment avec leur dossier. |
| 3 | Brouillon | En lot sur les photos validées : les modèles YOLO actifs (ceux du dépôt `facade`, puis les vôtres) et l’algorithme de recherche des baies proposent des objets « auto ». |
| 4 | Marquage | Un **poste de relecture** : la barre du haut (la photo, ce qui reste à relire, Vérifiée, bloc, Enregistrer, **Valider et suivante**), une colonne d’outils à gauche (choisir, main, zoom, boîte, lasso, rectangle, polygone, ligne, point ; étiquettes, loupe, aide), la photo, l’inspecteur à droite (onglets **Objet** et **Liste** : la relecture du brouillon, l’objet ou la sélection, la palette des types) et le bandeau des photos du lot en bas (état et avancement). Au clavier : **Tab** l’objet à relire suivant, **A** l’accepter, **X** le supprimer, **1 à 9** lui donner un type, **Entrée** enregistrer, marquer vérifiée et passer à la suivante, flèches pour décaler au pixel ; **?** montre tous les raccourcis. Un curseur masque le brouillon sous un score ; « Accepter les N au-dessus » (Maj+A). « Relancer le brouillon » repasse les modèles actifs et la recherche des baies sur la photo ouverte : le travail fait à la main reste, le brouillon non relu est remplacé (Ctrl+Z le défait). Les étiquettes ne s’affichent qu’au survol et sur l’objet choisi (E : toutes). Le code : des contrôleurs (`editeur/useMarquage`, `useSelection`, `usePressePapiers`, `useRelecture`, `useRaccourcis`) et des vues ; la logique pure dans `relecture.ts` et `raccourcis.ts` (la même table pour le clavier et l’aide). |
| 5 | Marquage | Le catalogue : recherche (**/**), filtres par état, source, bloc, classe, vérification ; une pastille dit l’état de chaque photo (à marquer, à relire, corrigée, vérifiée, échantillon) et ses classes ; « Relire les N brouillons » les enchaîne dans l’éditeur, qui passe d’une photo à l’autre (N / B). |
| 6 | Export | **RF-DETR** (Roboflow, **Apache 2.0**, libre pour Plan) : le jeu au format COCO (`train/`, `valid/`, `test/`), `noms.txt`, un script et un carnet Colab qui exportent `modele-banc.onnx` (int8, 37 Mo pour Nano) à déposer à l’étape 3 avec sa résolution (384 Nano, 512 Small, 576 Medium). Pour comparer, les YOLO d’Ultralytics (**AGPL-3.0** : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence) — le jeu au format Ultralytics : `images/` et `labels/` par bloc, `data.yaml`, `entrainer.py`, `bilan.json`. En détection pour **YOLO26n** (par défaut) ou YOLOv10n (le modèle du dépôt `facade`, pour repartir de ses poids), en contours pour YOLO26n-seg ou YOLO11n-seg, **avec ou sans COCO** (poids pré-entraînés, ou l’architecture seule, de zéro), ou au format du banc (`annotations.json` : arbre, attributs et polygones). La machine se choisit : « Colab ou carte NVIDIA », ou « Mac à puce Apple » (la puce graphique `mps` sans argument, des lots de 16 photos, huit processus de chargement). L’export ONNX se fait sans NMS (`nms=False`) : de bout en bout, 300 détections ; le banc lit la sortie d’après sa forme (de bout en bout ou brute). |
| 7 | Blocs | train / val / test (70 / 20 / 10 par défaut) répartis **stratifiés par type** : chaque type, même rare, a sa part dans chaque bloc ; un tableau dit, type par type, ce qui manque (au moins 30 objets en train, un en val et en test). La réserve n’est jamais exportée ; un échantillon de chaque bloc à vérifier, et l’export peut ne prendre que les photos vérifiées. |

Seules les photos **corrigées** (marquage relu et enregistré) entrent dans le jeu : un brouillon jamais relu n’apprend rien.

Tous les écrans se ressemblent (`src/ui/Page.tsx`) : l’étape et son titre, l’aide repliée, le geste principal en haut à droite, un état
vide qui dit quoi faire ensuite. Les onglets portent le nombre de photos qui attendent chaque étape (`src/etapes.ts`). Chaque écran est
un dossier de `src/ecrans/` : un contrôleur (`useMosaique`, `useRedressement`, `useCatalogue`, `useBrouillon`, `useExport`, `useBlocs`,
`useClasses`, `useImport`) qui tient l’état et les gestes, et des vues qui ne font que montrer.

## Le cycle d’un modèle

1. Corriger et qualifier une première série, répartir les blocs (7), exporter en YOLO26n · détection (6), avec COCO ; pour choisir, entraîner une fois aussi YOLOv10n (poids `facade`) et la variante sans COCO, et comparer le mAP du bloc test.
2. Ouvrir `entrainer.ipynb` du zip dans Google Colab (GPU gratuit), ou `python3 entrainer.py 0` sur un PC avec GPU : il entraîne, mesure sur le test (mAP par type) et exporte `best.onnx`.
3. Déposer `best.onnx` à l’étape 3 avec la liste `names` : ses noms vont d’eux-mêmes vers les types du banc.
4. Le brouillon des photos non annotées pose et qualifie ; on corrige, la série grandit, on réentraîne.

Pour repartir du début d’entraînement du dépôt `facade` plutôt que de COCO, poser ses poids `.pt` (le modèle fenêtres/portes ou
volets, entraîné sur CMP Facade) sous le nom `depart.pt` à côté de `entrainer.py`, ou les envoyer dans la cellule prévue du carnet :
Ultralytics garde le tronc et refait la tête aux noms du jeu. Le dépôt `facade` ne garde que les `.onnx`, qui servent au brouillon
mais ne se réentraînent pas.

Les modèles du dépôt `facade` (YOLOv10n, AGPL-3.0) s’installent d’un geste : le serveur les télécharge une fois depuis
GitHub, à un commit fixé, puis la page les lit sur le serveur. Le moteur ONNX (onnxruntime-web 1.24.1) vient d’un CDN.

## Le code

- `banc/src/` : la page (React). Les modules sans DOM (`classes.ts`, `geometrie.ts`, `edition.ts`, `exif.ts`,
  `panoramax.ts`, `equirect.ts`, `blocs.ts`, `brouillon.ts`, `redressement.ts`, les décodeurs de `yolo.ts`) sont testés
  dans `banc/tests/`.
- `banc/src/plan/` : la copie figée du redressement par points de fuite et de la recherche des baies de Plan (voir son
  `LISEZMOI.md`). Le banc n’importe rien d’autre : `banc/tests/independance.test.ts` le vérifie.
- `banc/public/` : `api.php` (tout le serveur), `.htaccess` (sa politique de contenu), le modèle de configuration.

```bash
npm run build:banc                     # -> dist-banc/, copié dans livraison/banc/ par npm run livraison
npx vitest run banc/tests              # ses tests (l’API par php -S)
BANC_CONFIG=/chemin/banc-config.php php -S 127.0.0.1:5197 -t banc/public &   # l’API au développement
npm run dev:banc                       # la page sur http://localhost:5198/
```
