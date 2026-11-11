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
| 0 | Classes | L’arbre des objets : nom, place dans l’arbre (un cadre se range dans sa fenêtre), forme (rectangle ou polygone), couleur du marquage, attributs à renseigner (type de fenêtre, vantaux, matériau…), « apprise » ou non. L’ordre de l’arbre donne les indices YOLO. |
| 1a | Import | Les photos de l’iPhone (ou de tout appareil) : position, date, cap, appareil et focale de l’EXIF gardés ; grand côté ramené à 3 200 px. |
| 1b | Import | Panoramax autour d’une adresse (ou de coordonnées tapées), dans un rayon donné, par lot ; un panoramique 360 est ramené à la vue plate tournée vers l’adresse. Une photo déjà importée ne revient pas. |
| 2 | Redressement | Vue de face par les points de fuite, en lot ; sinon quatre coins d’un rectangle du mur posés à la main ; ou « déjà de face ». |
| 2a | Mosaïque | Les photos redressées en mosaïque : valider (V), rejeter (R), refaire (A). |
| 3 | Brouillon | En lot sur les photos validées : les modèles YOLO actifs (ceux du dépôt `facade`, puis les vôtres) et l’algorithme de recherche des baies proposent des objets « auto ». |
| 4 | Marquage | Corriger : choisir (V), rectangle (R), polygone (P), déplacer, tirer un coin ou un sommet, ajouter ou retirer un sommet, supprimer (Suppr), annuler (Ctrl+Z), enregistrer (Ctrl+S). Classe, parent et attributs dans le panneau. |
| 5 | Marquage | Le catalogue : filtres par état, source, bloc, classe, vérification ; l’éditeur passe d’une photo à l’autre (N / B). |
| 6 | Export | Le jeu au format Ultralytics : `images/` et `labels/` par bloc, `data.yaml`, `entrainer.py`, `bilan.json`. En détection pour YOLOv10n (le modèle du dépôt `facade`), en contours pour YOLO11n-seg, ou au format du banc (`annotations.json` : arbre, attributs et polygones). |
| 7 | Blocs | train / val / test par un tirage à graine fixe (le même dans la page et au serveur), figeable ; la réserve n’est jamais exportée ; un échantillon de chaque bloc à vérifier, et l’export peut ne prendre que les photos vérifiées. |

Seules les photos **corrigées** (marquage relu et enregistré) entrent dans le jeu : un brouillon jamais relu n’apprend rien.

## Le cycle d’un modèle

1. Exporter le jeu (étape 6), le dézipper, lancer `python3 entrainer.py` (Ultralytics 8.4 ; CPU par défaut, `0` pour un GPU).
2. Le script produit `runs/banc/weights/best.onnx` ; le déposer à l’étape 3 avec la liste `names` de `data.yaml`.
3. Le nouveau modèle propose le brouillon des photos suivantes ; on corrige, on réexporte, on réentraîne.

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
