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
| 1b | Import | Panoramax, **depuis la carte** : on part de la France entière et l’on zoome jusqu’à la rue, ou l’on tape une adresse (plusieurs propositions du géocodage, ou des coordonnées) et la carte y vole. À l’échelle d’un quartier (600 m de large au plus), les photos de la vue s’affichent, à cocher une à une ; à l’échelle de la rue, les parcelles du **cadastre de l’IGN** (Parcellaire Express, WFS de la Géoplateforme). Toucher une parcelle la **vise** (une adresse vise la sienne : celle qui la contient, sinon la plus proche) : les photos se cherchent alors dans un rayon autour de ses bords, par lot, rapportées à elle (distance, cap vers son milieu, si elle est dans le champ) et la gardent (`parcelle`, son identifiant) ; la toucher encore la lâche. Sans parcelle visée, l’import ne porte pas de `parcelle`, et l’`adresse` seulement pour une photo prise à moins de 300 m de l’adresse cherchée ; la **carte** prend toute la largeur : un fond de l’IGN (Plan IGN v2 et ses noms de rues, photo aérienne, ou sans fond ; WMTS de la Géoplateforme, sans clé), les parcelles en transparence lues sur ce que la carte montre (par pages ; elle dit quand le cadastre est tronqué ou le fond absent), le rayon de recherche dessiné autour de la parcelle visée, et chaque photo à sa place avec un secteur par vue à importer ; elle se zoome et se déplace (molette, pincement, double clic ou double toucher, glisser, + / − / recentrer, flèches du clavier ; les tuiles ne se lisent que pour ce qui est montré, un vol garde le niveau le plus grossier de son trajet) ; survoler ou toucher un point montre à côté (dessous au téléphone) l’**aperçu des façades** telles qu’elles seront importées, toucher l’épingle, le toucher encore coche ou décoche la photo (au clavier : Tab, Entrée, Espace) ; les photos sont rapportées à la parcelle (distance, cap vers son milieu, si elle est dans le champ) et la gardent (`parcelle`, son identifiant) ; un panoramique 360 donne une vue de **chaque côté de la rue**, à 90° du sens de la prise de vue (là où sont les façades), ou le seul côté de l’adresse, ou la vue droit vers elle. La liste montre chaque 360 en entier, avec les vues qui seront importées ; « Choisir les vues » ouvre une fenêtre au-dessus de la liste (← → d’un 360 à l’autre, Échap) pour en ajouter, en retirer ou en tourner (gauche, droite, vers une maison). Une photo déjà importée ne revient pas. Chaque vue gardée par le tri écrit le **mur** qu’elle montre dans ses métadonnées (`mur` : bâtiment de la BD TOPO, côté, segment du contour et sa direction, distance, incidence, note, nature, usage, hauteur) ; **un mur déjà dans le banc ne se propose plus coché** (« déjà dans le banc », case « Sans les murs déjà dans le banc » pour le lever). **Le cadre de chaque vue d’un 360** se calcule pour sa façade (`cadrage.ts` : champ de 40° à 100°, tangage de 0° à 35°, d’après la hauteur de la BD TOPO relevée de la part du toit, la distance et le contour vu ; jamais plus serré que ce que le panoramique contient ; 75° et 8° sans hauteur connue, ou la case « Cadrer sur la façade » décochée) : l’aperçu le dit sous chaque vue (« 52° · ↑9° », « coupée » quand un immeuble vu de trop près ne tient pas), la carte et l’import s’en servent, « Choisir les vues » le retouche (− + et ▼ ▲). **« Redresser sur le mur »** (décochée) rend la vue face au mur visé, l’axe perpendiculaire au côté du contour, verticales droites : nette en ville, neutre sur les pavillons, floue en haut d’un immeuble vu de près ; les métadonnées le notent (`cadrage.plan`) et l’étape 2 propose de passer ces vues telles quelles. **« Préférer l’hiver »** (cochée) : de novembre à mars la note gagne 8 points, sans rien écarter. **« Proposer un marquage »** (décochée ; il faut un modèle actif de l’étape 3 et « Redresser sur le mur ») : chaque vue rendue face au mur est enregistrée telle quelle comme redressée et reçoit les objets « auto » des modèles actifs ; elle arrive à l’étape 4 comme un brouillon à relire, sans l’étape 2 ni la mosaïque. Mesuré sur 20 vues avec les modèles du dépôt `facade` : fenêtres d’immeuble justes à 95 %, trouvées à 80–85 % ; volets justes une fois sur deux ; portes presque jamais ; pavillons flous, deux fois moins bien. **Toute instance fédérée de Panoramax se lit, sans nouvelle version** : les hôtes listés (`HOTES`, `panoramax.ts`, les mêmes que la politique de contenu) se lisent en direct ; les photos de tout autre hôte passent par le **relais** du serveur du banc (voir plus bas), auteur, licence et identifiant inchangés. Si le relais échoue, ces photos ne sont pas proposées et la carte dit combien et pourquoi. **« Seulement les façades »** (cochée par défaut) ne propose que les vues où un bâtiment est dans le cadre : les emprises de la BD TOPO de l’IGN (`BDTOPO_V3:batiment`, WFS de la Géoplateforme) lues là où des photos sont montrées, et pour chaque vue ce que ses 75° de champ en rencontrent (`facadesVues.ts` : au moins 20 m², de 3 à 40 m, vu à plus de 35° du mur, un quart du champ ; une photo plate, qu’on ne tourne pas : la moitié de son champ, une façade à moins de 30 m qui remplit 30 % de l’image, et un cap sûr — sans boussole et presque à l’arrêt dans sa séquence, son cap n’est que le bruit du GPS) ; une vue de côté d’un 360 se tourne vers sa façade (±35° autour des 90°), les vues choisies à la main ne bougent pas ; sans BD TOPO (panne, tronquée) rien n’est trié et la carte le dit. **Pas des maisons** (`pasUneMaison`) : ce que la BD TOPO dit du bâtiment (nature, usages, hauteur, logements) écarte serres, silos, hangars agricoles, ateliers, gymnases, garages et petites annexes, et les petits locaux bas sans logement (un local technique, un transformateur) ; tout ce qui loge quelqu’un se garde, et un usage « Indifférencié » n’écarte rien à lui seul ; un bâtiment écarté cache quand même ce qui est derrière lui. Chaque vue gardée porte une **note de 0 à 100** (`noteDeVue` : distance à la façade, façade vue de face, part du cadre qu’elle remplit, date de la photo), dite dans l’aperçu et sur la carte de la liste, triée par défaut « meilleures d’abord » (ou plus proches, plus récentes). **Un bâtiment, une fois** (`meilleuresVues.ts` ; demande du propriétaire : « Avoid having 2 times the same building ») : les vues se regroupent par façade visée — le bâtiment (son identifiant BD TOPO) et le côté par lequel on le voit (0 à 3, par quarts de tour depuis son plus long mur : les quatre faces d’une maison sont quatre façades, pas des doublons) ; par défaut une seule vue par façade se propose, la mieux notée (réglage « Vues par bâtiment » : 1, 2, 3, toutes) ; les autres restent visibles, décochées, marquées « doublon » (cadre gris en pointillé), dans une même photo comme d’une photo à l’autre, avec ou sans parcelle visée ; une vue sans bâtiment n’est jamais un doublon. « Tout cocher » ne coche pas les doublons (« Avec les doublons » le fait, exprès) ; le bouton d’import annonce « N façades de N bâtiments » ; les vues choisies à la main ne sont jamais décochées, et si deux vues cochées montrent la même façade l’écran le dit avant l’import (« 3 bâtiments en double »), sans bloquer. L’état dit les comptes (photos, façades, bâtiments, doublons, écartées). **La maison se voit-elle ?** (`vueDegagee.ts`) : la géométrie ne modélise ni haies ni arbres, alors l’aperçu de chaque vue proposée d’un panoramique est lu, sans modèle ni réseau — dans la zone du cadre où la géométrie place le bâtiment (`Regard.zone`), au-dessus de l’horizon, ce qui a la couleur du bâti moins ce qui a celle de la végétation, fois la hauteur de la zone. Une façade lue cachée (haie, arbres, clôture) est dite « façade cachée », perd la moitié de sa note et passe donc après les vues dégagées du même bâtiment ; la case « Écarter les façades cachées » (décochée par défaut, retenue par le navigateur) ne les propose plus. Mesuré sur 76 vues du Vésinet étiquetées à l’œil (`banc/tests/fixtures/vue-degagee/`, photos geovelo, etalab-2.0) : 65 justes (86 %), 4 façades dégagées sur 32 dites cachées, 7 cachées sur 44 dites dégagées (murs, portails) ; le hasard ferait 58 %. La lecture se fait en tâche de fond, une photo à la fois, sur la version réduite déjà montrée par la liste (`fileLectures.ts` : file de 40, les 60 premières photos de la liste seulement, tout s’arrête quand la liste change). Limites : arbres nus l’hiver, façades vertes ou à l’ombre, murs de pierre ; les photos plates et les vues choisies à la main ne sont pas lues. **La couverture de Panoramax** se dessine à tous les zooms, en orange, entre le fond et les parcelles (bouton « Couverture Panoramax ») : la grille de densité de loin, les tracés des rues photographiées à partir du niveau 7 (tuiles vectorielles `api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt`, lues par `mvt.ts`, sans dépendance) ; la carte dit où zoomer, ou qu’il n’y a aucune photo dans la zone. À l’échelle de la rue (une vue de 800 m de large au plus), les tronçons **sans façade à portée** (aucun mur de maison ou d’immeuble à 40 m) se dessinent en **gris** (`couvertureFacades.ts`) : les bâtiments de la BD TOPO se lisent par cases de 800 m gardées en mémoire (`casesBatiments.ts` : 24 cases, deux lectures à la fois, une seule lecture par case pour la couverture et pour le tri des photos) ; de plus loin rien ne change, et si les bâtiments ne répondent pas (ou sont tronqués) tout reste orange et la légende le dit. |
| 1c | Import | Panoramax, **une zone en lot** : une commune (son contour par le WFS de la Géoplateforme), des coordonnées (un pavé de 300 m autour), ou une zone dessinée sur la carte (rectangle, polygone), et une cible (100 façades par défaut, 500 au plus). Le banc parcourt la zone par pavés de 300 m (`lot.ts` : 300 au plus, ordre éparpillé), une requête à la fois avec 0,7 s de pause ; un service qui limite : il attend, réessaie, puis s’arrête en le disant et reprend au même pavé. Il garde la meilleure vue de chaque bâtiment : jamais deux fois le même, aucun que le banc a déjà, cinq au plus par tronçon de rue, un plafond par pavé. Récapitulatif avant l’import (compte, types de bâtiment, poids estimé, douze aperçus), puis import en tâche de fond avec sa jauge, qui s’arrête et se reprend sans rien perdre ; les façades lues cachées dans l’image sont écartées (case cochée). |
| 2 | Redressement | Vue de face par les points de fuite, en lot (avec son avancement) ; les échecs se retrouvent sous leur filtre, à reprendre par quatre coins d’un rectangle du mur posés à la main ; ou « de face ». On choisit des photos en les touchant : « Déjà de face » les passe telles quelles à la mosaïque ; quand l’import a lu le mur de plusieurs photos, « Mur 1 », « Mur 2 »… les rangent à la suite et les choisissent d’un geste, de gauche à droite ; **« Fusionner »** assemble les photos d’un même mur, choisies de gauche à droite, en une seule (`fusion.ts` : l’assemblage de la mosaïque de Plan, la place où leurs parties communes se ressemblent le plus puis un fondu, avec en plus un décalage vertical et une échelle cherchés ; les originales sont rejetées, au choix). Sur chaque carte, quatre icônes (leur nom dans l’infobulle) : redresser automatiquement, à la main, déjà de face, et la **poubelle**, sans confirmation mais en différé : la photo disparaît, « Annuler » la rend pendant six secondes, puis le serveur efface son dossier (`suppressions.ts` ; la page fermée avant la fin du délai n’envoie rien, la photo revient). |
| 2a | Mosaïque | Les photos redressées en mosaïque (à valider, validées, rejetées) : valider (V), rejeter (R), refaire (A), flèches ; **Entrée** ouvre la revue en grand, où la photo suivante vient d’elle-même après chaque geste. Les rejetées se suppriment avec leur dossier. |
| 3 | Brouillon | En lot sur les photos validées : les modèles YOLO actifs (ceux du dépôt `facade`, puis les vôtres) et l’algorithme de recherche des baies proposent des objets « auto ». **Un modèle entraîné par le script de l’étape 6 arrive ici tout seul** (l’écran relit les modèles à son ouverture et quand on revient sur la page), **inactif** : ses noms sont déjà reliés aux types du banc, sa résolution est posée, et sa carte dit d’où il vient (date du dépôt, jeu, mAP du bloc test, mAP par type). Il ne reste qu’à l’activer. « Déposer un modèle entraîné » reste là pour le dépôt à la main (fichier, noms, architecture, résolution). |
| 4 | Marquage | Un **poste de relecture** : la barre du haut (la photo, ce qui reste à relire, Vérifiée, bloc, Enregistrer, **Valider et suivante**), une colonne d’outils à gauche (choisir, main, zoom, boîte, lasso, rectangle, polygone, ligne, point ; étiquettes, loupe, aide), la photo, l’inspecteur à droite (onglets **Objet** et **Liste** : la relecture du brouillon, l’objet ou la sélection, la palette des types) et le bandeau des photos du lot en bas (état et avancement). Au clavier : **Tab** l’objet à relire suivant, **A** l’accepter, **X** le supprimer, **1 à 9** lui donner un type, **Entrée** enregistrer, marquer vérifiée et passer à la suivante, flèches pour décaler au pixel ; **?** montre tous les raccourcis. Un curseur masque le brouillon sous un score ; « Accepter les N au-dessus » (Maj+A). Les étiquettes ne s’affichent qu’au survol et sur l’objet choisi (E : toutes). Le code : des contrôleurs (`editeur/useMarquage`, `useSelection`, `usePressePapiers`, `useRelecture`, `useRaccourcis`) et des vues ; la logique pure dans `relecture.ts` et `raccourcis.ts` (la même table pour le clavier et l’aide). |
| 5 | Marquage | Le catalogue : recherche (**/**), filtres par état, source, bloc, classe, vérification ; une pastille dit l’état de chaque photo (à marquer, à relire, corrigée, vérifiée, échantillon) et ses classes ; « Relire les N brouillons » les enchaîne dans l’éditeur, qui passe d’une photo à l’autre (N / B). |
| 6 | Export | **« Entraîner sur mon Mac »** : un bouton fige le jeu sur le serveur, crée une **clé d’entraînement** (voir plus bas) et télécharge un script `.sh` déjà rempli (l’adresse du banc, la clé) ; l’écran donne la commande à coller dans le Terminal du Mac. Le script installe ce qu’il lui faut dans un dossier à lui, lit le jeu sur le banc, entraîne (puce Apple Silicon, sinon le processeur), mesure le test, exporte l’ONNX et le dépose à l’étape 3, sans zip à ouvrir ni noms à recopier (voir « Entraîner sur le Mac »). L’écran liste les clés vivantes (en attente, jeu lu, modèle déposé) et les révoque. Dessous, « Ou à la main » : le même jeu en .zip, avec son script `entrainer.py`. **RF-DETR** (Roboflow, **Apache 2.0**, libre pour Plan) : le jeu au format COCO (`train/`, `valid/`, `test/`), `noms.txt` et un script qui exporte `modele-banc.onnx` (int8, 37 Mo pour Nano) à déposer à l’étape 3 avec sa résolution (384 Nano, 512 Small, 576 Medium). Pour comparer, les YOLO d’Ultralytics (**AGPL-3.0** : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence) — le jeu au format Ultralytics : `images/` et `labels/` par bloc, `data.yaml`, `entrainer.py`, `bilan.json`. En détection pour **YOLO26n** (par défaut) ou YOLOv10n (le modèle du dépôt `facade`, pour repartir de ses poids), en contours pour YOLO26n-seg ou YOLO11n-seg, **avec ou sans COCO** (poids pré-entraînés, ou l’architecture seule, de zéro), ou au format du banc (`annotations.json` : arbre, attributs et polygones). L’export ONNX se fait sans NMS (`nms=False`) : de bout en bout, 300 détections ; le banc lit la sortie d’après sa forme (de bout en bout ou brute). |
| 7 | Blocs | train / val / test (70 / 20 / 10 par défaut) répartis **stratifiés par type** : chaque type, même rare, a sa part dans chaque bloc ; un tableau dit, type par type, ce qui manque (au moins 30 objets en train, un en val et en test). La réserve n’est jamais exportée ; un échantillon de chaque bloc à vérifier, et l’export peut ne prendre que les photos vérifiées. |
| 8 | Équilibre | Ce que le banc contient déjà, pour voir où importer ensuite : une **carte** des photos à leur place (fond Plan IGN ; les photos voisines regroupées en ronds qui disent leur nombre, toucher un rond s’en approche), et des **comptes** par région et département (déduits de la position par des contours simplifiés à un kilomètre, `departements.ts`, sans service), saison et année (de la date), type de vue (tirée d’un 360 ou plate), source, état d’avancement et **type de bâtiment** (maison, immeuble, commerce : une heuristique sur ce que la BD TOPO dit du bâtiment visé) ; pour toutes les photos ou pour le seul jeu (corrigées, hors réserve). Une ligne à zéro reste montrée : c’est elle qu’on cherche. **Doublons** : les murs que le banc a en plusieurs images (le même bâtiment vu par le même côté), montrés ensemble, celle à garder en tête ; « Écarter » les passe « rejetées », rien ne part d’office. **Où importer ensuite** : trois à cinq zones là où le jeu est pauvre (région, puis type de bâtiment) et où Panoramax a des photos, parmi vingt-six communes — une heuristique simple, sans modèle (`ouImporter.ts`) ; un bouton ouvre l’import en lot sur chacune. **Images sans mur connu** : le rattrapage retrouve le mur des images importées avant, par leur position et leur cap (40 par lancement, lancé à la main). En bas, ce que l’écran ne peut pas dire : les photos sans position ou sans date, et ce que l’import ne garde pas encore (type de bâtiment, mur visé, matériau). |

Seules les photos **corrigées** (marquage relu et enregistré) entrent dans le jeu : un brouillon jamais relu n’apprend rien.

Tous les écrans se ressemblent (`src/ui/Page.tsx`) : l’étape et son titre, l’aide repliée, le geste principal en haut à droite, un état
vide qui dit quoi faire ensuite. Les onglets portent le nombre de photos qui attendent chaque étape (`src/etapes.ts`). Chaque écran est
un dossier de `src/ecrans/` : un contrôleur (`useMosaique`, `useRedressement`, `useCatalogue`, `useBrouillon`, `useExport`, `useBlocs`,
`useClasses`, `useImport`, `useEquilibre`) qui tient l’état et les gestes, et des vues qui ne font que montrer.

## Le cycle d’un modèle

1. Corriger et qualifier une première série, répartir les blocs (7), exporter en YOLO26n · détection (6), avec COCO ; pour choisir, entraîner une fois aussi YOLOv10n (poids `facade`) et la variante sans COCO, et comparer le mAP du bloc test.
2. « Entraîner sur mon Mac » (6) : coller dans le Terminal la commande que l’écran donne. Le script lit le jeu, entraîne, mesure le test (mAP par type), exporte l’ONNX et le dépose.
3. Activer le modèle arrivé à l’étape 3 : ses noms sont déjà reliés aux types du banc.
4. Le brouillon des photos non annotées pose et qualifie ; on corrige, la série grandit, on réentraîne.

**À la main** (le repli) : télécharger le zip, l’ouvrir, et lancer `python3 entrainer.py` dans son dossier (`mps` à la suite sur
un Mac Apple Silicon, `0` ou `cuda` sur une machine à carte NVIDIA) ; puis déposer `modele-banc.onnx` (ou `best.onnx`) à l’étape 3
avec la liste des noms, l’architecture et la résolution. Le script de la clé s’y replie de lui-même : si son dépôt échoue, il
dit où est le modèle sur le Mac et affiche les noms et la résolution à donner.

Les gestes, comptés : à la main, une douzaine (télécharger le zip, l’ouvrir, installer Python et le paquet d’entraînement, lancer
`entrainer.py`, retrouver le modèle, copier les noms, revenir à l’étape 3, ouvrir « Déposer », choisir le fichier, l’architecture,
la résolution, coller les noms, déposer) ; avec la clé, quatre (« Entraîner sur mon Mac », ouvrir le Terminal, y coller la
commande, activer le modèle), plus l’installation de Python la première fois s’il manque.

## Entraîner sur le Mac

**Ce qu’il faut**

- Un Mac sous macOS. Une puce Apple Silicon (M1 et suivantes) entraîne sur sa puce graphique (`mps`) ; un Mac Intel entraîne sur
  son processeur (`cpu`), beaucoup plus lentement.
- **Python 3.10 ou plus récent.** Celui que macOS propose avec ses outils de développement est trop ancien (3.9) : installez-le
  depuis <https://www.python.org/downloads/macos/> (le programme d’installation « macOS 64-bit universal2 »), ou par Homebrew
  (`brew install python@3.12`). Le script cherche `python3.12`, `python3.13`, `python3.11`, `python3.10`, puis `python3` ; s’il n’en
  trouve aucun qui convienne, il s’arrête en le disant. Rien d’autre à installer à la main.
- **De la place** : comptez 5 Go libres, ordre de grandeur non mesuré sur un Mac (l’environnement Python et PyTorch, les poids de
  départ, le jeu, les sorties de l’entraînement). Seuls chiffres mesurés, sur Linux : 6 Go pour l’environnement YOLO et 6,6 Go pour
  celui de RF-DETR, dont les bibliothèques NVIDIA qu’un Mac n’installe pas ; 1 Go pour le dossier d’un entraînement RF-DETR Nano.
- **Du temps**, et le banc joignable depuis le Mac (c’est le Mac qui l’appelle, en https). La durée n’a pas été mesurée : comme
  ordre de grandeur, attendez de quelques dizaines de minutes à quelques heures sur Apple Silicon pour une centaine de photos, et
  nettement plus (peut-être une nuit, ou davantage) sur un Mac Intel. Laissez le Mac branché ; le script empêche sa mise en
  veille automatique tant qu’il tourne (`caffeinate`), mais pas celle d’un portable qu’on referme. La clé vit 72 h, le plus long permis : si
  l’entraînement dure plus longtemps, le modèle reste sur le Mac et se dépose à la main à l’étape 3. Une clé plus courte se
  règle par `jetonHeures` dans `banc-config.php` (de 1 à 72) avant de la créer.

**Les gestes**

1. À l’étape 6, choisir le format et toucher « Entraîner sur mon Mac » : le script `entrainer-banc-<modèle>-<date>.sh` se
   télécharge (dans Téléchargements). **Il contient la clé : ne le partagez pas.**
2. Ouvrir l’application Terminal.
3. Y coller la commande que l’écran affiche (« Copier la commande »), `bash ~/Downloads/entrainer-banc-….sh`, et valider.
4. Quand le script dit « Terminé », activer le modèle à l’étape 3.

**Ce que fait le script**, en le disant à chaque pas : il trouve Python (1/6), crée un environnement Python isolé (2/6,
`python3 -m venv` : rien n’est installé dans le Python du Mac, ni avec `sudo`), y installe le paquet d’entraînement (3/6 :
`rfdetr[train,loggers,onnx]==1.12.*`, ou `ultralytics==8.4.*` avec `onnx`, `onnxslim` et `onnxruntime` ; un à plusieurs Go à
télécharger la première fois), vérifie sa clé et lit le jeu (4/6), entraîne (5/6 : mêmes réglages qu’avant — époques, patience,
taille d’image, lot, graine, poids de départ —, seul l’appareil de calcul change), puis dépose le modèle (6/6). Il n’affiche
jamais la clé en entier (ses onze premiers caractères seulement, ceux que l’étape 6 montre aussi).

**Le relancer** (la même commande) reprend où il s’était arrêté : l’environnement et l’installation sont gardés, le jeu n’est pas
retéléchargé, un modèle déjà entraîné est seulement déposé. Un entraînement interrompu (Ctrl+C, Mac éteint) repart en revanche
de son début. **Quand il s’arrête**, il dit pourquoi et quoi faire : Python introuvable (comment l’installer), clé expirée ou
révoquée (en créer une autre à l’étape 6 : l’installation est gardée), banc injoignable (vérifier la connexion, relancer), dépôt
refusé (où est le modèle, avec quels noms et quelle résolution le déposer à la main), erreur pendant l’entraînement (la trace,
et `BANC_APPAREIL=cpu` pour réessayer sur le processeur si la puce graphique est en cause).

**Où sont les fichiers** : tout est dans `~/banc-entrainement`, et rien ailleurs — le script y dirige aussi les caches de pip, de
PyTorch, de Hugging Face, de Roboflow et d’Ultralytics (vérifié sur Linux ; sur un Mac, à constater au premier lancement) :

| Chemin | Ce que c’est |
|---|---|
| `env-rfdetr/`, `env-yolo/` | l’environnement Python de chaque famille de modèles, créé une fois |
| `cache/` | ce que les outils téléchargent (poids de départ, polices, réglages) ; les paquets téléchargés par pip sont effacés une fois installés |
| `banc-<modèle>-<date>/` | le jeu d’une clé, les sorties de l’entraînement, le modèle (`modele-banc.onnx` ou `runs/…/best.onnx`) et `resultat-banc.json` |
| `entrainer_banc.py` | le Python que le script y écrit à chaque lancement ; il ne porte pas la clé |
| `depart.pt` | facultatif, posé par vous : des poids de départ pour un YOLO (voir plus bas) |

**Tout effacer** : `rm -rf ~/banc-entrainement`, puis mettre à la corbeille les scripts `entrainer-banc-….sh` de Téléchargements
(ils portent une clé ; échue ou révoquée, elle ne vaut plus rien). Rien n’est installé ailleurs sur le Mac.

**Réglages** (facultatifs, devant la commande) : `BANC_DOSSIER=/un/dossier` range ailleurs ; `BANC_PYTHON=/chemin/python3` impose
un Python ; `BANC_APPAREIL=cpu` impose le processeur. Pour un essai seulement : `BANC_EPOQUES=1` raccourcit l’entraînement à une
époque (le modèle déposé ne vaut rien) et `BANC_ESSAI_MODELE=/chemin/x.onnx` n’installe et n’entraîne rien et dépose ce fichier
(c’est ce que jouent les tests et la fumée). Exemple : `BANC_EPOQUES=1 bash ~/Downloads/entrainer-banc-….sh`.

**Ce qui a été essayé, et ce qui ne l’a pas été.** Le script est joué en entier sur Linux par les tests et la fumée, sans
entraînement (`BANC_ESSAI_MODELE`). Il a aussi été lancé pour de vrai, le 21 novembre 2026, sur une machine Linux sans carte
graphique, raccourci à une époque (`BANC_EPOQUES=1`) sur quatorze photos de synthèse : installation, jeu, entraînement sur `cpu`,
mesure du test, export ONNX et dépôt ont abouti pour RF-DETR Nano, YOLO26n parti de COCO et YOLO26n de zéro, sans rien écrire
hors du dossier de travail. **Il n’a été lancé ni sur un Mac, ni avec `mps`** : la recherche de Python sous macOS,
l’installation de PyTorch pour Mac, l’entraînement sur la puce Apple Silicon (RF-DETR surtout, dont certaines opérations peuvent
ne pas exister sur `mps` : le script pose `PYTORCH_ENABLE_MPS_FALLBACK=1` pour qu’elles retombent sur le processeur) et les durées
restent à vérifier au premier lancement réel.

Pour repartir du début d’entraînement du dépôt `facade` plutôt que de COCO, poser ses poids `.pt` (le modèle fenêtres/portes ou
volets, entraîné sur CMP Facade) sous le nom `depart.pt` à côté de `entrainer.py` (le script de la clé les prend dans `~/banc-entrainement/depart.pt`, posé là
avant de le lancer) :
Ultralytics garde le tronc et refait la tête aux noms du jeu. Le dépôt `facade` ne garde que les `.onnx`, qui servent au brouillon
mais ne se réentraînent pas.

Les modèles du dépôt `facade` (YOLOv10n, AGPL-3.0) s’installent d’un geste : le serveur les télécharge une fois depuis
GitHub, à un commit fixé, puis la page les lit sur le serveur. Le moteur ONNX (onnxruntime-web 1.24.1) vient d’un CDN.

## Le relais des images Panoramax

`GET api.php?r=relais&id=<identifiant de la photo>&taille=hd|sd|vignette`, connexion requise comme le reste de l’API. Il sert les
photos des instances que la page ne lit pas en direct, pour qu’une instance nouvelle du méta-catalogue marche sans ajouter son hôte à
la politique de contenu (qui reste fermée : ni joker, ni `https:`).

- **Ce qu’il ouvre** : à une session connectée au banc, la lecture d’une image publique du catalogue Panoramax, désignée par son
  identifiant. Le serveur demande lui-même la photo à `https://api.panoramax.xyz/api/search?ids=…` et suit l’adresse de l’image que
  le catalogue rend.
- **Ce qu’il n’ouvre pas** : aucune adresse au choix de l’appelant (la route ne lit que `id`, un UUID, et `taille`) ; aucun hôte
  privé, local ou lien-local (chaque hôte est résolu, toutes ses adresses doivent être publiques, et la connexion se fait à l’adresse
  vérifiée) ; rien d’autre que du `https` sur le port 443, sans identifiants ; pas plus de trois redirections, suivies à la main et
  chacune revérifiée de la même façon ; rien qui ne soit une image (l’en-tête le dit, les premiers octets le confirment : JPEG, PNG
  ou WebP ; ni SVG, ni HTML) ; rien de plus gros que 25 Mo en `hd` (un 360 mesuré pèse de 0,8 à 6,9 Mo), 4 Mo en `sd`, 1 Mo pour
  une vignette ; des délais courts (5 s pour se connecter, 8 à 30 s pour lire) ; 180 images par session et par minute.
- **Ce qu’il rend** : l’image, typée d’après ses octets, avec `X-Content-Type-Options: nosniff`, `Content-Security-Policy:
  default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, gardée une heure par le navigateur seul. Le serveur
  n’écrit aucune image relayée sur son disque. Il faut cURL en PHP (501 sinon, dit à l’écran).

Ses garde-fous sont essayés un à un dans `banc/tests/relais.test.ts` (faux DNS et faux catalogue : `tests/fixtures/relais-essai.php`).

## La clé d’entraînement (le jeton du script)

`POST api.php?r=jetons` (session connectée) crée une clé pour un export et rend le script qui la porte ; `GET api.php?r=jetons` liste
les clés vivantes, `DELETE api.php?r=jeton&id=…` en révoque une. Le script, lui, n’a que trois routes, sans session, sa clé dans
l’en-tête `X-Banc-Jeton` : `GET api.php?r=entrainement-etat` (ce qu’il reste à vivre à la clé, son jeu, si elle a déjà déposé ;
ne compte pas une lecture), `GET api.php?r=entrainement-jeu` et `POST api.php?r=entrainement-modele` (`&partie=N` pour un
morceau, `&fin=1` pour conclure).

- **Ce qu’elle ouvre** : lire **le jeu de son export** — une archive figée à la création de la clé et rangée sous elle
  (`data/apprentissage/jetons/<id>.zip`), pas le jeu du jour : une photo corrigée après n’y est pas — et déposer **un** modèle.
- **Ce qu’elle n’ouvre pas** : tout le reste de l’API (aucune autre route ne lit l’en-tête : photos, marquage, export, modèles,
  classes, clés répondent « Connexion requise ») ; une photo hors de cette archive ; une seconde écriture (une clé qui a déposé
  ne dépose plus et ne lit plus, son jeu est effacé) ; l’activation du modèle : il arrive **inactif**, une personne l’active.
- **Comment elle est faite** : créée seulement par une session connectée (et l’en-tête `X-Banc`) ; 32 octets de `random_bytes`,
  précédés d’un identifiant public ; le serveur n’en garde que le SHA-256 (`jetons/<id>.json`), comparé par `hash_equals`, contre un
  haché factice quand l’identifiant n’existe pas ; jamais dans une adresse (les journaux gardent les adresses), jamais journalisée.
  Elle ne sort qu’une fois, dans le script téléchargé : **ce script contient une clé, ne le partagez pas** (l’écran et le script le
  disent ; le script ne l’affiche jamais en entier, et la passe à son Python par l’environnement, pas par la ligne de commande). Elle vit 72 h par défaut (`jetonHeures` dans `banc-config.php`, de 1 à 72), se révoque depuis l’écran, et cinq clés au plus vivent à
  la fois (chacune garde une copie du jeu).
- **Comment elle se refuse** : inconnue, fausse, mal écrite, échue ou révoquée, la réponse est la même (`401`, « Jeton refusé. ») ;
  vingt essais manqués par adresse en quinze minutes ferment les trois routes (`429`) ; le jeu se lit vingt fois au plus par clé, un
  dépôt compte 2 000 envois au plus.
- **Ce qu’un dépôt doit être** : des morceaux dans l’ordre (le n° 0 recommence), 128 Mo au plus en tout (un RF-DETR Nano quantifié
  pèse 37 Mo, sa pleine précision 118 Mo), rangés sous la clé puis dans `data/apprentissage/modeles/`, hors de `public_html/`, sous
  un nom **choisi par le serveur** (`entrainement-<date>-<hasard>.onnx` ; le nom, l’identifiant, le seuil ou l’activation qu’enverrait
  l’appelant ne sont pas lus) ; la taille et le SHA-256 annoncés doivent être ceux des octets reçus ; le fichier doit être un ONNX,
  vérifié sans le charger ni l’exécuter : un `ModelProto` protobuf bien formé de bout en bout, fait des seuls champs du format, avec
  sa version, son jeu d’opérateurs et un seul graphe, lui-même bien formé, qui a des nœuds, une entrée et une sortie (un script, une
  page, une archive, une image, un ONNX tronqué ou suivi d’autre chose sont refusés, et effacés) ; l’architecture et la résolution
  doivent être celles de l’export de la clé (384, 512, 576 ou 640) ; les noms : 200 au plus, 40 caractères au plus, minuscules,
  chiffres, `_` et `-`, sans double ; le bilan : des nombres entre 0 et 1 pour des noms du modèle, le reste est laissé. Le serveur
  n’exécute jamais un modèle : la page le lit dans le WebAssembly du navigateur, une fois activé.
- **Les limites de l’hébergement** : les morceaux partent en corps brut (pas en formulaire : `upload_max_filesize` ne joue pas), et
  leur taille est écrite dans le script d’après `post_max_size` du serveur (4 Mo, moins s’il est plus bas : 64 Ko de marge) ; aucun
  réglage de PHP à changer avec les 8 Mo par défaut. Il faut l’extension `zip` (comme l’export). Les requêtes viennent du Mac de
  la personne, par sa connexion à Internet, en https : rien à ouvrir à un service tiers, aucune règle de partage entre sites
  (CORS) — le script n’est pas une page. Le serveur du banc n’appelle personne : aucun accès sortant de plus. La politique de
  contenu du `.htaccess` ne change pas (la page télécharge le script par un lien `blob:`).

Ses garde-fous sont essayés un à un dans `banc/tests/jetons.test.ts` (par `php -S`, avec un faux fichier ONNX fabriqué sur place et
des clés créées à la volée) ; le script y est joué en entier par bash contre ce serveur (Python trouvé, environnement créé, clé
vérifiée, jeu lu, dépôt, reprise, arrêts), le shell passé à `bash -n` et son Python à `py_compile`. **L’entraînement lui-même
n’y est pas joué, ni rien sur un Mac.**

## Le code

- `banc/src/` : la page (React). Les modules sans DOM (`classes.ts`, `geometrie.ts`, `edition.ts`, `exif.ts`,
  `panoramax.ts`, `parcelles.ts`, `facadesVues.ts` (les vues qui montrent une façade, ce qui n’est pas une maison, la note d’une vue), `meilleuresVues.ts` (les doublons d’un bâtiment, l’ordre de la liste), `vueDegagee.ts` et `fileLectures.ts` (la façade se voit-elle, lue dans l’aperçu, en tâche de fond), `couvertureFacades.ts` et `casesBatiments.ts` (la couverture grise, les bâtiments lus par cases), `mvt.ts` et `couverture.ts` (les tuiles de couverture de Panoramax), `carte.ts` (la projection des tuiles, la vue et ses gestes, les secteurs), `cache.ts`, `equirect.ts`, `blocs.ts`, `brouillon.ts`, `redressement.ts`, `suppressions.ts` (la suppression différée d’une photo, annulable), `equilibre.ts` (les comptes de l’écran d’équilibre, le département d’une position), `cadrage.ts` (le champ et le tangage d’une vue d’un 360, la vue face au mur), `lot.ts` (l’import d’une zone en lot : pavés, sélection, parcours à débit borné) et `ouImporter.ts` (où le jeu est pauvre), `importMarquage.ts` (quelles vues importées reçoivent un brouillon), `entrainement.ts` (ce que l’écran dit d’une clé d’entraînement, du script qui la porte et du modèle qu’il dépose), `murVise.ts` (le mur qu’une vue regarde, écrit dans ses métadonnées ; le rattrapage) et `murs.ts` (les murs déjà dans le banc, les doublons, les images d’un même mur de gauche à droite, le type de bâtiment), les décodeurs de `yolo.ts`) sont testés
  dans `banc/tests/`.
- `banc/src/plan/` : la copie figée du redressement par points de fuite et de la recherche des baies de Plan (voir son
  `LISEZMOI.md`). Le banc n’importe rien d’autre : `banc/tests/independance.test.ts` le vérifie.
- `banc/public/` : `api.php` (tout le serveur, relais des images et clés d’entraînement compris), `.htaccess` (sa politique de contenu), le modèle de configuration.

```bash
npm run build:banc                     # -> dist-banc/, copié dans livraison/banc/ par npm run livraison
npx vitest run banc/tests              # ses tests (l’API par php -S)
BANC_CONFIG=/chemin/banc-config.php php -S 127.0.0.1:5197 -t banc/public &   # l’API au développement
npm run dev:banc                       # la page sur http://localhost:5198/
```

## La fumée (navigateur piloté)

`scripts/fumee-banc.mjs` joue l’écran d’import Panoramax, un import en lot de deux façades, l’écran d’équilibre, le redressement (les icônes des cartes, une photo supprimée, rendue, puis supprimée pour de bon), puis « Entraîner sur mon Mac » (une clé créée, son script téléchargé, la commande à coller, le script lancé par bash dans le rôle du Mac — sans entraîner — qui lit le jeu et dépose un faux modèle, le modèle apparu à l’étape 3 puis activé, une seconde clé révoquée ; il y faut bash et un Python 3.10 ou plus récent), dans un vrai navigateur, sur le paquet construit, servi par `php -S` comme en
ligne (`?banc`, la politique de contenu du `.htaccess`, l’API) ; la CI le joue à chaque PR (job `fumee`), sur un réseau témoin
(`banc/tests/fumee/` : le routeur, les réponses rejouées, auteur et licence des photos gardées).

```bash
npm run build:banc
NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs                              # bureau clair et téléphone sombre, ~35 s
FUMEE_BANC_PASSAGES=tous NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs     # les huit passages de la CI, ~2 min
FUMEE_RESEAU=enregistrer NODE_PATH=$(npm root -g) node scripts/fumee-banc.mjs     # refaire le témoin sur le vrai réseau
```

Playwright vient de l’installation globale (`npm root -g`), comme pour la fumée de Plan ; sur la machine du cloud, ajouter
`PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK=1`. `FUMEE_BANC_CAPTURES=dossier` garde une capture par moment,
`FUMEE_BANC_AUDIT=1` relève tous les défauts de contraste et de mise en page. Ce qu’il vérifie : `tests/CHECKLIST-FUMEE.md`.
Changer la mise en page de l’écran d’import ne demande pas de refaire le témoin (une emprise voisine retrouve le sien) ; changer
ses requêtes (une autre adresse, un autre service), si.
