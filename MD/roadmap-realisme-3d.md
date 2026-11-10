# Roadmap — réalisme de la Vue 3D

Chantier ouvert le 14 octobre 2026, à la demande de l'utilisateur. La Vue 3D est juste dans ses
volumes (toits LiDAR, hauteurs, ouvertures), mais elle fait encore **maquette** :
- la lumière est plate et sans profondeur ;
- les fenêtres sont peintes à plat ;
- les matériaux sont uniformes ;
- les abords sont pauvres.

Le but est qu'une personne reconnaisse sa maison et sa rue au premier regard, sur la parcelle du
projet d'abord, puis dans le voisinage.

Références : `MD/spec-audit.md` (photos et élévations de l'audit), `MD/spec-toit-ign.md` §6 (couleurs
et textures des murs et des toits), skill `toits` (AE 101), skill `design-ui` (réglages d'affichage),
`MD/plan-vague-3-generaliser.md` (G17 : volets et balcons en 3D).

---

## 1. Les règles du chantier

- **Rien ne change dans les exports.** Les empreintes de `tests/fixtures/golden/` restent identiques, en
  particulier `glb-structure.json` et les vues du dossier (`dossier.pdf`). Le réalisme est une affaire
  d'**écran** : tout ce qui alourdit ou change un export reste hors de l'export (`HORS_EXPORT`), ou
  derrière une option d'export explicite.
- **Le poids du fichier livré** reste sous son budget de 5 Mo. Pas de banque de textures embarquée :
  les textures sont **générées** (comme `three/textureMur.ts`), ou chargées à la demande depuis une
  source déjà autorisée par la CSP (Poly Haven, IGN), avec un repli dessiné si elle ne répond pas.
- **La fluidité sur téléphone** est un critère d'acceptation. Chaque effet coûteux passe par un réglage
  **Qualité** (*Économe*, *Normale*, *Soignée*), choisi d'après l'appareil et réglable dans
  « Apparence ». C'est une préférence d'affichage : pas de Ctrl+Z, pas de « projet modifié »,
  permise en lecture seule, comme « Filaire ».
- **Le détail suit la distance**, comme la règle des toits :
  - tout le détail sur la parcelle du projet et ses mitoyens ;
  - un modèle allégé au-delà de `DETAIL_FIN_M`, soit 120 m.
- **AE 101 sert de banc visuel.** Chaque étape montre les mêmes vues avant et après dans sa PR :
  rue, jardin, à hauteur d'homme, en clair et en sombre, au téléphone et sur bureau.
- **Une étape, une PR**, avec le circuit de `CLAUDE.md` : vérifications, fumée, CHANGELOG, livraison.

## 2. D'où l'on part

| Déjà là | Où |
|---|---|
| Soleil réel : course selon le lieu, la date et l'heure, curseurs dans le panneau | `three/lumiere.ts`, `three/soleilVue3d.ts`, `geo/soleil.ts` |
| Ombres portées, en option (décochées par défaut) | `vue3d.ombres`, `three/scene.ts` |
| Textures de murs par matériau, à l'échelle, teintées par la couleur lue | `three/textureMur.ts` |
| Couvertures : tuile plate, tuile canal, ardoise, zinc, gravillons | `three/couverture.ts` |
| Fenêtres et portes : cadre et vitre à plat sur le mur ; soubassement, gouttière, cheminée simple | `three/detailsBatiment.ts` |
| Orthophoto sur le sol et le relief ; gazon dessiné sur la parcelle | `three/relief3d.ts`, `three/gazon.ts` |
| Arbres en cinq dessins, saison ; clôtures et haies par tronçon ; rues | `three/arbre3d.ts`, `three/cloture3d.ts`, `three/rues3d.ts` |
| Cheminées et toits-terrasses observés | `three/cheminees3d.ts`, `three/terrasse3d.ts` |
| Vue à hauteur d'homme pendant la prise de photos | `app/audit/parcelle/vuePrise.ts` |

---

## 3. Les étapes

### R0 — Mesurer et régler la qualité *(socle, petit)*

- **Banc visuel.** Un script rend les mêmes vues d'AE 101 et de sa rue, à 390 et 1 440 px, en clair et
  en sombre. Le dossier `tests/fixtures/visuel/` sert de référence relue à l'œil.
- **Mesure du coût.** Images par seconde et durée de construction de la scène, au téléphone (profil
  mobile de Playwright) et sur bureau.
- **Réglage Qualité.** Économe, Normale ou Soignée ; détecté d'après l'appareil, modifiable dans
  « Apparence ». Il pilote les ombres, l'occlusion, l'anticrénelage et la densité des détails.

*Preuve* : les chiffres de départ connus ; rien de visible ne change en Normale.

### R1 — La lumière *(le plus gros gain pour l'effort)*

- **Rendu photographique.** Tone mapping de type film, espace couleur sRGB bien posé, exposition
  réglée. Aujourd'hui les blancs brûlent et les couleurs sont plates.
- **Ciel.** Un ciel dégradé qui suit l'heure du soleil, puis une image d'environnement (HDRI légère
  ou générée) qui éclaire la scène et se reflète dans les vitres.
- **Ombres par défaut en Normale et Soignée**, douces, avec une carte d'ombre resserrée sur la parcelle
  pour qu'elles soient nettes au pied des murs.
- **Occlusion ambiante** (SSAO) en Soignée : les coins, le pied des murs et le dessous des débords
  s'assombrissent. C'est ce qui donne du volume.
- **Brume légère avec la distance** : le voisinage lointain se fond au lieu de s'arrêter net.

*Preuve* : banc visuel avant et après, coût mesuré par niveau de qualité, empreintes identiques.

### R2 — Les façades de près

- **Fenêtres en creux** :
  - la menuiserie posée 15 à 20 cm en retrait, avec tableau, appui saillant et linteau ;
  - une vitre sombre qui reflète le ciel de R1, et des petits bois selon l'époque ;
  - le détail fin sur la parcelle et les mitoyens, la version à plat au-delà.
- **Volets, balcons, garde-corps et baies cintrées** : le lot G17 de la vague 3a, repris ici pour
  le rendu.
- **Maçonnerie** : chaînes d'angle, bandeaux d'étage, corniche sous l'égout, appuis et seuils. Ce
  sont des réglages par profil de façade (lot G12), pas un dessin par maison.
- **Porte d'entrée et porte de garage** dessinées, d'après le relevé quand il existe.

*Preuve* : vues à hauteur d'homme d'AE 101 avant et après ; un relevé de façade et sa 3D côte à côte.

### R3 — Les matériaux vivants

- **Matériaux PBR** : rugosité et relief (normal maps générées) pour l'enduit, la brique, la meulière,
  la pierre, la tuile et l'ardoise. La lumière rasante les fait alors vivre.
- **Variation et vieillissement** :
  - une teinte qui varie tuile par tuile et pierre par pierre ;
  - des coulures sous les appuis, une salissure en pied de mur ;
  - de la mousse sur les tuiles au nord, en Soignée.
- **Toits** : tuiles de faîtage et de rive, épaisseur de la couverture au bord, descentes d'eau
  pluviale, couronnement des cheminées (dalle, mitrons).

*Preuve* : rendus des textures en 2 × 2 tuiles (sans couture visible, la méthode du skill `toits`
§4 bis) ; banc visuel.

### R4 — Les photos réelles sur la parcelle du projet *(le saut le plus spectaculaire)*

- **Les élévations redressées de l'audit** (lots L6 à L13 : calage, fusion de plusieurs vues) se
  posent comme **texture** sur les murs de la maison et des mitoyens audités. La zone masquée par
  une voiture ou une haie est comblée par le matériau dessiné.
- **Le toit** prend l'orthophoto recadrée sur son contour quand elle est nette ; sinon, la couverture
  dessinée de R3.
- **Le voisinage** : les photos Panoramax, déjà sélectionnées pour la couleur des murs, se posent de
  même là où une façade est vue de face et nettement. Repli sur la texture dessinée.
- **Une case « Photos réelles (3D) »** dans « Apparence » permet de comparer avec le modèle dessiné.

*Preuve* : AE 101 auditée, vue de la rue et du jardin, comparée aux photos ; un voisin couvert par
Panoramax.

*Dépend de* : vos audits de parcelle réels, la fusion des vues (L13) et les relevés.

### R5 — Les abords

- **Clôture et portail réels** : type, hauteur, soubassement et position, d'après l'audit (A§12).
- **Végétation** :
  - des haies continues le long des limites, au lieu d'arbres isolés ;
  - des arbres à la hauteur et au houppier **mesurés sur le LiDAR** (le MNH les voit déjà) ;
  - des massifs et des bordures, un gazon texturé à l'échelle.
- **Sol** :
  - l'orthophoto en plus haute définition sous la parcelle (voir R5 bis) ;
  - les allées et les terrasses dallées, d'après le plan ;
  - le trottoir, la bordure et le marquage de la rue (`rues3d.ts`).
- **Objets d'échelle**, en option : une voiture devant le garage, une silhouette. Ils donnent la taille
  des choses d'un coup d'œil.

*Preuve* : banc visuel de la rue d'AE 101 ; coût mesuré sur un voisinage de 2 km (la mesure des toits
de fond).

### R5 bis — L'orthophoto haute résolution *(à confirmer : questions ci-dessous)*

**D'où l'on part.** Plan lit la couche `ORTHOIMAGERY.ORTHOPHOTOS` de l'IGN (BD ORTHO), par le WMTS
de la Géoplateforme, jusqu'au zoom 20 (`render/ortho.ts`, `ORTHO_ZOOM_MAX`). Au Vésinet, un pixel du
zoom 20 couvre environ 10 cm au sol. L'image source est prise à environ 20 cm, parfois 15 : au-delà,
Plan agrandit sans gagner de détail. C'est le flou que l'on voit sur le canevas et sous la 3D.

**Les sources plus fines** (non vérifiées ici : `data.geopf.fr` est bloqué dans l'environnement de
développement) :

| Source | Pixel | Couverture | Accès |
|---|---|---|---|
| Orthophoto haute résolution de l'IGN (couche `HR.ORTHOIMAGERY.ORTHOPHOTOS`, nom à confirmer) | 5 à 15 cm | partielle, par territoire | même WMTS, même licence ouverte, déjà admis par la CSP |
| PCRS image des collectivités (orthophoto du plan de corps de rue simplifié) | environ 5 cm | beaucoup de secteurs d'Île-de-France | variable selon le producteur (région, département, syndicat d'énergie) ; licence à vérifier |
| Google, Bing | — | — | exclus : licence et CSP |

**Ce qui serait fait**, si les questions y répondent oui :
- interroger la couverture de la couche haute résolution (limites des niveaux dans les capacités du
  WMTS) ;
- la charger jusqu'au zoom 21 sur la parcelle et ses mitoyens, l'orthophoto actuelle restant pour le
  voisinage ; repli automatique là où elle manque ;
- l'utiliser sur le canevas 2D, sous la Vue 3D et pour les lectures sur image (couleur des toits,
  repérage des cheminées, cadrage de l'analyse par Claude) ;
- une case « Orthophoto haute résolution » dans « Apparence », préférence d'affichage enregistrée
  avec le projet, comme « Relief ».

**Questions à répondre avant de décider (pertinence)** :

| # | Question | Comment y répondre | Ce qui en dépend |
|---|---|---|---|
| O1 | La couche haute résolution couvre-t-elle Le Vésinet, et les secteurs où Plan est le plus utilisé ? | zoomer au maximum sur geoportail.gouv.fr et comparer les couches de photographies aériennes ; puis lire les capacités du WMTS depuis un poste qui a le réseau | sans couverture là où sont les projets, R5 bis s'arrête là |
| O2 | Le gain se voit-il vraiment à l'échelle où l'on travaille (parcelle entière à l'écran, terrasse de 30 m²) ? | captures côte à côte d'AE 101 aux zooms 19, 20 et 21, sur téléphone et sur bureau | si le gain n'apparaît qu'en zoom extrême, la case reste décochée par défaut |
| O3 | La date de prise de vue est-elle récente, et en saison où les arbres ne cachent pas tout ? | métadonnées de la couche ; comparaison avec la situation actuelle de la parcelle | une image plus fine mais plus ancienne peut montrer un état faux (piscine absente, extension) |
| O4 | L'image est-elle bien calée sur le cadastre et sur le LiDAR, à moins de 20 cm près ? | superposer contour cadastral, bâtiments BD TOPO et ortho HR sur AE 101 et ses voisins | un décalage visible rend l'image plus nuisible qu'utile pour dessiner une terrasse |
| O5 | Que coûte-t-elle en temps de chargement et en mémoire sur téléphone ? | mesure du banc R0 : nombre de tuiles, octets, durée, au zoom 21 sur la parcelle et ses mitoyens | limite au zoom 21 sur la seule parcelle, ou désactivation en qualité Économe |
| O6 | Améliore-t-elle les lectures automatiques (couleur des toits, cheminées, analyse par Claude) ? | rejouer la couleur des toits et la détection des cheminées sur le corpus, avec et sans | si oui, elle sert aussi le calcul, pas seulement l'écran : plus forte priorité |
| O7 | Le PCRS image est-il accessible pour les Yvelines, et sous quelle licence ? | trouver le producteur et ses conditions de diffusion | une seconde source, à n'intégrer que si la licence permet la diffusion dans Plan |
| O8 | Change-t-elle un export ? | vérifier les empreintes golden (plan, dossier, GLB) | si un export intègre l'orthophoto, la haute résolution reste hors export, ou derrière une option |

*Preuve*, si elle est retenue : les captures d'O2 et la superposition d'O4 dans la PR ; le coût mesuré
(O5) ; les empreintes golden identiques (O8).

### R6 — La caméra et la présentation

- **Focale proche de l'œil** (50 à 60°) en vue à hauteur d'homme ; la vue aérienne garde la sienne.
- **Anticrénelage soigné** sur les arêtes fines : rives, clôtures, menuiseries.
- **Mode présentation**, en Soignée et à la demande :
  - un léger flou de profondeur sur le lointain ;
  - une heure dorée en un geste ;
  - une capture en haute définition pour le client.
- **Promenade enregistrée** : quelques points de vue repris en fondu, pour montrer le projet.

*Preuve* : captures de présentation relues ; aucun export touché.

---

## 4. L'ordre, et ce qui peut avancer en parallèle

```
R0 ──► R1 ──► R2 ──► R3
         │       │
         │       └──► R4 (avec les audits réels, après L13)
         └──► R5 (indépendant après R0)        R6 (après R1)
              └──► R5 bis (après les réponses O1 à O8)
```

- **R0, puis R1** : c'est la plus grande différence visible pour le moins d'effort, sans aucune donnée
  nouvelle.
- **R2** juste après : de près, les fenêtres à plat sont le défaut le plus visible.
- **R4** demande les audits réels : il suivra vos premiers audits de parcelle, comme les formes de toit
  de la vague 3b.
- **R5** et **R6** peuvent avancer en parallèle, dès que R0 a posé le réglage Qualité.

## 5. Les décisions, et les défauts retenus

| # | Question | Défaut retenu |
|---|---|---|
| V1 | Qualité par défaut | détectée d'après l'appareil : Économe au téléphone ancien, Normale ailleurs ; Soignée à la demande |
| V2 | Ombres | cochées par défaut en Normale et Soignée (aujourd'hui décochées) |
| V3 | Photos réelles en texture | montrées par défaut sur la parcelle auditée ; décochables (« Photos réelles (3D) ») ; seule leur absence s'écrit, comme pour « Gazon (3D) » |
| V4 | Textures chargées en ligne (Poly Haven) | non par défaut : textures générées, pour le poids et le hors-ligne ; essai possible en Soignée |
| V5 | Objets d'échelle (voiture, silhouette) | décochés par défaut |
| V6 | Ce qui entre dans l'export GLB | rien de cette roadmap sans option d'export explicite (empreintes golden) |
| V7 | Orthophoto haute résolution | pas avant les réponses O1 à O8 ; si elle est retenue, utilisée sur la parcelle et ses mitoyens là où elle existe, case cochée par défaut seulement si O2 montre un gain visible |

## 6. Les risques, et leur parade

| Risque | Parade |
|---|---|
| Téléphone qui chauffe ou rame | réglage Qualité, mesure à chaque étape (R0), effets coûteux en Soignée seulement |
| Fichier livré trop lourd | textures générées, chargement à la demande, budget de 5 Mo vérifié par le build |
| Une empreinte golden qui bouge | tout le réalisme hors export (`HORS_EXPORT`) ; empreintes vérifiées à chaque PR |
| Photo mal calée qui « glisse » sur le mur (R4) | texture seulement si le calage a trouvé les coins (L7) ; sinon le matériau dessiné |
| Effet « jeu vidéo » trop chargé | réglages sobres, comparaison au banc visuel et aux photos réelles, une étape à la fois |
| Orthophoto haute résolution plus ancienne ou mal calée (R5 bis) | questions O3 et O4 avant d'intégrer ; repli sur l'orthophoto actuelle |
| Vie privée (photos sur la parcelle) | les photos de l'audit restent dans le projet de l'utilisateur ; rien ne part sans l'accord déjà donné (D2, D7) |

## 7. Le premier pas

1. **R0** : banc visuel d'AE 101, mesure du coût, réglage Qualité.
2. **R1** : tone mapping, ciel, ombres par défaut, occlusion et brume. Les images d'avant et d'après
   dans la PR.
3. Puis **R2** : fenêtres en creux, en même temps que G17 (volets et balcons).

Je peux lancer R0 et R1 dès votre feu vert. Ils n'attendent aucune donnée de terrain.

## 8. Avancement (15 octobre 2026)

Livré sur la branche `claude/amazing-archimedes-np6jza`, une étape par commit, chacune vérifiée par la
suite de tests, le banc visuel d'AE 101 (`scripts/banc-visuel.mjs`, références dans
`tests/fixtures/visuel/`) et le point 24 de la fumée (empreinte `glb-structure.json` inchangée).

| Étape | Fait | Pas fait, et pourquoi |
|---|---|---|
| R0 | Réglage Qualité (Économe, Normale, Soignée), préférence de l'appareil ; banc visuel et mesures par niveau | — |
| R1 | Courbe de film ACES appliquée au rendu (couleurs des matériaux intactes) ; ciel dégradé qui suit le soleil ; brume ; ciel comme éclairage (Normale, Soignée) ; occlusion estompée avec la distance (Soignée) ; carte d'ombre resserrée sur la parcelle | Image d'environnement HDRI : le ciel généré suffit, sans fichier à charger |
| R2 | Baies en creux (encadrement, appui, linteau, menuiserie, petits bois selon l'époque) ; porte à panneaux, porte de garage à lames ; corniche, bandeaux, chaînes d'angle selon l'époque | Baies cintrées en creux (restent à plat) ; réglages par profil de façade (G12) : les règles sont par époque, en dur |
| R3 | Relief (normal maps) tiré des textures dessinées des murs et des toits ; coulures, salissure, descentes d'eau pluviale | Rugosité par matériau et mousse au nord : l'une changerait les valeurs exportées, l'autre ajouterait des couleurs de sommets au .glb ; tuiles de faîtage et de rive, couronnement des cheminées |
| R4 | — | Laissé de côté (décision du 14 octobre 2026) : attend les audits réels |
| R5 | Objets d'échelle (voiture côté rue, silhouette), décochés par défaut | Trottoir, bordure, marquage : les rues ne sont connues que par leur axe, sans largeur ; haies, arbres LiDAR et gazon existaient déjà ; allées dallées |
| R5 bis | — | Laissé de côté (décision du 14 octobre 2026) : attend les réponses O1 à O8 |
| R6 | Focale de l'œil à hauteur d'homme ; heure dorée ; capture HD ; promenade entre les points de vue | Flou de profondeur : coûteux, pour un gain discutable ; l'anticrénelage soigné tient à la définition pleine de Soignée |

Coût mesuré (Chromium sans carte graphique, à comparer d'une étape à l'autre seulement) : en Normale,
une image coûte environ 60 % de plus qu'avant R1, pour l'essentiel à cause de l'éclairage par le ciel,
très lent en rendu logiciel ; Économe, qui n'a que le ciel et la brume, coûte de 10 % (téléphone) à
30 % (bureau) de plus. Chiffres dans `tests/fixtures/visuel/mesures.json`.
