# IHM par zones — découpage de l'interface pour la reconstruction

**Version :** 0.1 — proposition à discuter, 21 septembre 2026
**Statut :** document vivant ; à faire évoluer avec la maquette
**Point de départ :** `1.1.0`, migration terminée. Le Core (`model`, `geometry`, `engine`, `geo`,
`export`) ne dépend ni du DOM ni d'un cadre d'affichage ; tout ce que ce document redistribue est
dans `ui/` (4 867 lignes, dix modules), `app/` (la racine de composition et dix groupes
d'écouteurs) et `index.html` (le balisage).
**Cible :** l'App Shell de `architecture-v2-react-typescript-php-saas.md` §22 — TopBar, Tools,
Canvas, Properties, Status — et son modèle de commandes (§6).

---

## 1. Ce que ce document fait, et ne fait pas

Il **inventorie** ce que l'interface actuelle donne à voir et à faire, **découpe** l'écran en zones
à responsabilité unique, **affecte** chaque commande et chaque affichage existant à une zone, et
**décrit le contrat** entre chaque zone et le Core, pour que la reconstruction puisse se faire zone
par zone sans toucher au moteur ni aux exports.

Il ne choisit pas les composants (shadcn/ui, Tailwind), ne dessine pas la maquette et ne fixe pas
les textes. Il prépare le terrain sur lequel ces choix se posent.

**Ce qui ne bouge pas.** Les six artefacts exportés et leurs empreintes
(`tests/fixtures/golden/`) restent l'oracle : une IHM reconstruite qui produit les mêmes SVG, DXF,
PDF, dossier, résumé et JSON sur le jeu de démonstration est une IHM qui n'a rien cassé. C'est ce
qui rend le chantier sûr — l'IHM ne calcule rien, elle déclenche et affiche.

---

## 2. L'existant : sept régions empilées

L'interface actuelle est une colonne centrée de 1 600 px au plus, empilant sept régions. Elle a
grandi par accumulation : chaque fonction a ajouté un bouton là où il y avait de la place.

| # | Région (`index.html`) | Contenu | Piloté par |
|---|---|---|---|
| R1 | `#projectBar` | Liste des projets, Nouveau, Depuis une adresse, Actualiser IGN, Enregistrer, Supprimer, statut d'enregistrement, pastille de version | `ui/projectBar.ts` |
| R2 | `#modeBar` + `<h1>` | Quatre vues : Plan, Terrasse, Vue 3D, Visionneuse GLB ; titre du plan et lieu | `app/modes.ts`, `app/ecouteurs/modes.ts` |
| R3 | `#selector` | Filtres par catégorie (Tout, Terrain, Terrasse, Chemin, Bâtiment…), liste des objets, bascule voisinage | `ui/selector.ts` |
| R4 | `#terrasseTopBar` | Sélecteur de la terrasse courante, surface et hauteur finie | `ui/terrassePanels.ts::renderTerrasseSelector` |
| R5 | `#stage` + `#planActions` | Le plan SVG, avec Ajuster et Grille en surimpression ; en dessous, la rangée Annuler, + Polygone, + Rectangle, + Chemin, + Cercle, + Parasol, + Point de vue, Dupliquer, Supprimer, Reculer | `render/*`, `interaction/*`, `app/ecouteurs/objets.ts` |
| R6 | `#terrassePanel` (mode Terrasse) et `#glbViewerPanel` (visionneuse) | Huit sous-onglets : Construction, BOM, Canevas, Vue 3D, Plan de coupe, Implantation, Chantier, Méthode ; la visionneuse a son propre canevas et ses réglages | `ui/terrassePanels.ts`, `ui/tables.ts`, `three/*`, `app/ecouteurs/vue3d.ts`, `visionneuse.ts`, `cloture.ts`, `soleil.ts` |
| R7 | `#panelTabs` + `#panel` | Cinq onglets : Édition (attributs de l'objet sélectionné, Objet / Côtés / Coins), Affichage (table de visibilité, Nord, orthophoto), Export (résumé, SVG, PNG, DXF, PDF, dossier, GLB, import/export JSON et SVG), PLU, Mesure | `ui/attrPanel.ts`, `ui/selector.ts::renderDispTable`, `app/ecouteurs/exports.ts`, `fichiers.ts`, `ui/projectBar.ts::renderPanneauPlu`, `ui/mesurePanel.ts` |
| — | Dialogues | Import cadastre en trois étapes, actualisation IGN, sélecteur de textures, confirmations, invites, bandeaux d'erreur, toasts | `ui/cadastreDialog.ts`, `ui/projectBar.ts`, `ui/texturePicker.ts`, `shell/dialogs.ts` |

Trois défauts de structure, que le découpage doit corriger :

1. **Le même geste est à deux endroits.** « Point de vue » se crée depuis R5 et depuis la Vue 3D ;
   la texture de clôture se règle dans la Vue 3D alors que la clôture est une propriété de la
   parcelle ; la sélection de la terrasse est dans R4 alors que la sélection d'objet est dans R3.
2. **Le contexte de la sélection est loin de la sélection.** On sélectionne dans R3 ou sur le plan
   (R5), on édite dans R7, deux régions plus bas.
3. **Les résultats du moteur et les réglages sont mêlés** dans R6 : Construction (des réglages) et
   BOM, Débit, Coupe, Implantation, Chantier (des résultats) sont des onglets frères.

---

## 3. Le découpage cible : neuf zones

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Z1  Barre d'application : Projet · Fichier · Exporter · Affichage · Aide     │
│     [Nom du projet ▾]  [Plan] [Terrasse] [3D] [Visionneuse]     Enregistré · v1.1.0 │
├────────┬──────────────────────────────────────────────┬──────────────────────┤
│ Z2     │                                              │ Z5  Inspecteur       │
│ Palette│                                              │  ─ Objet             │
│  ─ Sél.│                 Z4  Canevas                  │  ─ Géométrie         │
│  ─ +   │           plan SVG · scène 3D · GLB          │  ─ Apparence         │
│  ─ Mes.│                                              │  ─ Terrasse (constr.)│
│  ─ Ali.│   [Ajuster] [Grille] [Nord]   [☀ heure ──]   │  ─ Parasol · Clôture │
├────────┤                                              ├──────────────────────┤
│ Z3     │                                              │ Z6  Résultats        │
│ Explor.│                                              │  BOM · Débit · Coupe │
│ calques│                                              │  Implantation ·      │
│ objets │                                              │  Chantier · Mesures  │
│ terr.  │                                              │  PLU                 │
├────────┴──────────────────────────────────────────────┴──────────────────────┤
│ Z7  Barre d'état : mode local/serveur · échelle · pointeur (x, y) · sélection │
└──────────────────────────────────────────────────────────────────────────────┘
   Z8  Dialogues (import cadastre, actualisation IGN, textures, confirmations)
   Z9  Notifications (toasts, bandeau d'erreur, indicateur d'enregistrement)
```

Chaque zone a **une** responsabilité et **un** contrat avec le Core (§5). Une commande n'apparaît
que dans une zone, plus éventuellement dans un menu de Z1 pour le clavier et la découvrabilité.

| Zone | Responsabilité | Règle |
|---|---|---|
| **Z1 Barre d'application** | Ce qui concerne le projet et le fichier, les vues, l'identité | Menus ; jamais un réglage d'objet |
| **Z2 Palette d'outils** | Ce qu'on fait *sur le canevas* : sélectionner, créer, mesurer, aligner | Outils modaux (un actif à la fois) + actions immédiates ; icônes, libellés au survol |
| **Z3 Explorateur** | Ce qu'il y a dans le plan : objets par catégorie, terrasses, calques, visibilité, voisinage | Sélectionner ici = sélectionner sur le canevas ; masquer ici = masquer partout |
| **Z4 Canevas** | Le plan, la scène 3D, la visionneuse — une seule surface, trois rendus | Aucun formulaire ; seulement des commandes de navigation en surimpression |
| **Z5 Inspecteur** | Les propriétés de *ce qui est sélectionné* | Contextuel : sections qui apparaissent selon le type et la fonction |
| **Z6 Résultats** | Ce que le moteur calcule : nomenclature, débit, coupe, implantation, chantier, cotes, PLU | Lecture seule, sauf les prix saisis et les cadences |
| **Z7 Barre d'état** | Où l'on en est : serveur, enregistrement, échelle, pointeur, sélection | Jamais cliquable, sauf pour ouvrir Z9 |
| **Z8 Dialogues** | Les parcours en plusieurs étapes et les confirmations | Modaux, fermables par Échap |
| **Z9 Notifications** | Ce qui vient d'arriver | Non bloquant, empilable |

---

## 4. Affectation : chaque commande et chaque affichage, dans une zone

### 4.1 Z1 — Barre d'application

| Menu | Commande | Aujourd'hui | Contrat |
|---|---|---|---|
| Projet | Nouveau projet | `projectBar` « + Nouveau projet » | `apiSave` d'une copie |
| Projet | Ouvrir… (liste) | `#projectSelect` | `apiList`, `withProjectParam` |
| Projet | Depuis une adresse… | `projectBar` → Z8 import cadastre | `ouvrirImportCadastre` |
| Projet | Actualiser depuis l'IGN… | `projectBar` → Z8 actualisation | `ouvrirDialogueActualisation` |
| Projet | Enregistrer | `#saveProjectBtn` | `apiSave` |
| Projet | Supprimer | `projectBar` « Supprimer » → Z8 confirmation | `apiDelete` |
| Fichier | Importer un projet JSON… / Importer un SVG… | Onglet Export, `importJsonBtn`, `importSvgBtn` + cases « remplacer » | `validerProjetJSON` + `appliquerProjetImporte`, `importSVGString` |
| Fichier | Exporter le projet JSON | `exportJsonBtn` + « sans parcelle » | `exportProjetJSON` |
| Exporter | SVG · PNG · DXF · PDF (échelle) · Dossier PDF (terrasses cochées, équipements) · GLB · Résumé | Onglet Export | `buildExportSVG/DXF/PDF`, `construireDossierPDF`, `genererGlb`, `construireResume` |
| Affichage | Nord · Grille · Voisinage · Orthophoto (+ deux opacités) · Plein écran | `chkNorth`, `gridBtn`, `chkVoisinage`, `chkOrtho`, curseurs, `terrasse3dFullPageBtn` | `etat.showNorth`, `grilleVisible`, `voisinageVisible`, `ortho.*` |
| Vues | Plan · Terrasse · Vue 3D · Visionneuse | `#modeBar` | `app/modes.ts::appliquerVue` |
| Aide | Méthode de calcul · Version | sous-onglet Méthode, pastille | `renderMethode`, `versionLongue` |

Le nom du projet et le lieu (`<h1>` + « 📍 Le Vésinet ») deviennent le titre de Z1 ; le lieu se
modifie depuis l'inspecteur de la parcelle.

### 4.2 Z2 — Palette d'outils

| Groupe | Outil | Aujourd'hui | Contrat |
|---|---|---|---|
| Sélection | Sélectionner / déplacer (outil par défaut) | implicite dans `interaction/pointeur.ts` | `etat.selectedKey`, `appliquerGlisser` |
| Sélection | Annuler | `undoBtn`, Ctrl+Z | `historique.annuler` |
| Créer | Polygone · Rectangle · Chemin · Cercle · Parasol · Point de vue | `add*Btn` | `atelier.addNewObject/…` |
| Éditer | Dupliquer · Supprimer · Reculer d'un plan | `dupObjBtn`, `delObjBtn`, `backObjBtn` | `duplicateSelectedObject`, `deleteSelectedObject`, `sendObjectBackward` |
| Mesurer | Cote (référence puis coins) | onglet Mesure, `startPick` | `interaction/outilMesure.ts` |
| Aligner | Aligner par rotation sur un côté cible | onglet Objet, « Choisir un segment cible » | `interaction/outilAlignement.ts` |
| Navigation | Ajuster à la sélection · Grille | `fitBtn`, `gridBtn` (surimpression du canevas) | `fitToObject`, `grilleVisible` |

Mesurer et Aligner sont des **outils modaux** : l'état `mesure.pointage` existe déjà et dit ce
que le prochain clic sur le canevas signifie. La palette le rend visible ; le canevas garde le
comportement actuel.

### 4.3 Z3 — Explorateur

| Bloc | Aujourd'hui | Contrat |
|---|---|---|
| Objets par catégorie, avec le compte (Tout 35, Terrain 1…) | `#selector` | `etat.objects`, `selectedKey` |
| Visibilité par objet (nom, noms de côtés, de coins, dimensions, angles, masqué) | onglet Affichage, `dispTable` | `show*`, `hidden` |
| Bascule voisinage | `voisinageToggle` | `voisinageVisible` |
| Terrasses : laquelle est courante, surface, hauteur finie | `#terrasseSelector` | `terrasseSelectedKey` |
| Calques de la terrasse (structure, lames…) sur le canevas | `terrasseLayerTabs` | `render/terrasseCouches.ts` |
| Terrasses retenues pour le dossier PDF | `dossierTerrasses` | `dossierSelection` |

### 4.4 Z4 — Canevas

Une surface, trois rendus, choisis par Z1 : le **plan SVG** (`render/*`, `interaction/*`), la
**scène 3D** (`three/scene.ts`), la **visionneuse GLB** (`three/glbViewer.ts`). En surimpression,
uniquement de la navigation : Ajuster, Grille, zoom ±, niveau des yeux, orbite/pan/zoom, et le
**curseur solaire** (date, semaine, heure, intensité, lumière d'appoint — `app/ecouteurs/soleil.ts`,
aujourd'hui dupliqué entre Vue 3D et visionneuse : une seule instance, deux états).

Le sous-onglet **Canevas** du mode Terrasse disparaît : c'est le plan lui-même avec les calques de
la terrasse, choisis dans Z3.

### 4.5 Z5 — Inspecteur (contextuel)

| Section | Apparaît pour | Aujourd'hui | Contrat |
|---|---|---|---|
| Objet | tout objet | onglet Objet : nom, fonction, matière, priorité, verrouillé, contraint | `attrPanel.ts` |
| Géométrie | polygone, chemin | onglets Côtés (longueurs, noms) et Coins (angles, gel) ; mode rectangle | `applyLengthEdit`, `applyAngleEdit`, `frozenVertices` |
| Apparence | tout objet | remplissage, contour, opacité, textures | `fill`, `stroke`, `texture*` |
| Point de vue | fonction caméra | altitude, direction, « Aller à cette vue » | `allerAuPointDeVue` |
| Parasol | fonction parasol | hauteur, mât déporté, angle, terrasse liée, date et heure de l'ombre, « Placer au mieux » | `engine/parasol.ts` |
| Parcelle | clé `parcelle` | lieu (lat, lon, nom), cadastre (fiche), clôture (active, hauteur, couleur, texture), orthophoto | `model/lieu.ts`, `ui/cloture.ts` |
| Terrasse — construction | fonction terrasse | le configurateur (53 réglages), l'optimisation | `renderTerrasseConfigurator`, `optimiserParametres` |
| Terrasse — vue 3D | fonction terrasse, vue 3D active | filaire, tous les objets, opaques, textures, ombres | `vue3d.*` |

L'inspecteur est **la** zone que le découpage du configurateur en descripteurs de champs
(`spec-migration-typescript.md` §6.4, `MD/DEFAUTS.md` D-12) rend possible : chaque section est
une liste de champs `{ clé, libellé, type, unité, bornes, visible(si) }` rendue par un seul
composant. Une propriété ajoutée à `Construction` sans descripteur devient une erreur de
compilation.

### 4.6 Z6 — Résultats

| Onglet | Aujourd'hui | Contrat | Saisie ? |
|---|---|---|---|
| Nomenclature (BOM) | sous-onglet BOM, `terrasseBomTable`, totaux | `computeBOM` | prix réels par ligne |
| Débit | `terrasseDebitBox`, `terrasseDebitBoisBox` | `optimiserDebitLames`, débit bois | longueurs disponibles, prix |
| Coupe | `terrasseCoupeWrap` | `renderTerrasseCoupe` | non |
| Implantation | `terrasseImplantWrap` (échelle 1/50 à 1/200) | `computeImplantation` | échelle |
| Chantier | `terrasseChantierWrap` | `computeChantier` | équipe, heures/jour, cadences |
| Cotes | onglet Mesure, `measureResultsTable` | `geometrieMesure` | afficher, mode, supprimer |
| PLU | onglet PLU | `interrogerPlu` | non |
| Résumé | `exportBox` | `construireResume` | non (copiable) |

Z6 est **repliable** : en mode Plan on l'ouvre pour les cotes et le PLU, en mode Terrasse pour le
reste. Sa hauteur est un réglage de l'utilisateur, mémorisé localement.

### 4.7 Z7 — Barre d'état

Mode local ou serveur, « Enregistré à 18:38 » ou « modifications non enregistrées », échelle du
plan (`etat.scene.scale`), position du pointeur en mètres (`toWorld`), objet sélectionné, version
(`versionLongue()`). Rien n'y est cliquable, sauf l'indicateur d'enregistrement qui déclenche
Enregistrer.

### 4.8 Z8 — Dialogues et Z9 — Notifications

Les trois parcours restent des dialogues : import cadastre (trois étapes, `cadastreDialog.ts`),
actualisation IGN (`ouvrirDialogueActualisation`), sélecteur de textures (`texturePicker.ts`).
Confirmations et invites (`shell/dialogs.ts`) deviennent le composant Dialog du design system ;
`showToast` et `showErrBanner` deviennent Z9.

---

## 5. Le contrat entre les zones et le Core

Le point clé de la reconstruction : **les zones ne se parlent pas entre elles**. Elles lisent un
état et émettent des commandes ; c'est ce que `app/atelier.ts` fait déjà, en 21 fonctions passées
aux écouteurs.

```
Zone (Z1…Z9)  ──lit──▶  État (EtatApp + états de vue)  ◀──écrit──  Commande
   │                                                                   ▲
   └──────────────────── émet ──────────────────────────────────────────┘
                                          │
                                          ▼
                     Core : model · geometry · engine · geo · export · three
```

### 5.1 L'état que les zones lisent

`core/state.ts::EtatApp` porte déjà l'essentiel : objets, cotes, sélection, mode, onglet, scène
(échelle, origine), bascules d'affichage, `dirty`, parasol (date, heure). Trois états de vue vivent
ailleurs et doivent rejoindre un état observable : `mesure` (`interaction/outilMesure.ts`), la
cible d'alignement (`outilAlignement.ts`), `vue3d` et `glb` (`three/etat3d.ts`), `dossierSelection`
(`ui/tables.ts`), `ortho` (`render/ortho.ts`). Dans la cible V2, c'est le store Zustand (§7) ; en
attendant, un `bus` d'événements (`architecture.md` §5.2 le prévoit) suffit à notifier les zones.

### 5.2 Les commandes que les zones émettent

Le modèle de commandes de V2 (§6) est la bonne unité : une commande a un identifiant, un libellé,
une icône, un raccourci, une condition d'activation et une exécution. La liste initiale se lit
dans les écouteurs actuels — **88 écouteurs** `click`/`change`/`input`, soit une **soixantaine de
commandes distinctes** une fois regroupés les doublons (le soleil et le zoom existent deux fois,
pour la Vue 3D et pour la visionneuse) et les sous-contrôles d'un même geste (le bouton et le
champ de fichier d'un import, le curseur et son affichage) :

| Groupe | Écouteurs | Source actuelle |
|---|---|---|
| Projet et fichier | 15 | `projectBar.ts` (10), `ecouteurs/fichiers.ts` (5) |
| Exports | 8 | `ecouteurs/exports.ts` |
| Création et édition d'objets | 14 | `ecouteurs/objets.ts` |
| Vues, navigation, terrasse | 10 | `ecouteurs/modes.ts` (5), `divers.ts` (5) |
| Affichage | 7 | `ecouteurs/affichage.ts` |
| Vue 3D, visionneuse, soleil, clôture | 34 | `vue3d.ts` (15), `visionneuse.ts` (8), `cloture.ts` (6), `soleil.ts` (5, branché deux fois) |

Chaque commande est aujourd'hui un `addEventListener` sur un id ; la reconstruction en fait une
table (`commandes.ts`), et les zones ne connaissent que la table. C'est aussi ce qui donne les
raccourcis clavier (il n'y en a que deux aujourd'hui : Ctrl+Z et Échap) et les menus de Z1 sans
dupliquer de code.

### 5.3 Ce que le Core garantit déjà

- **Aucune fonction du Core ne touche le DOM** — vérifié par `tests/unit/architecture.test.ts`.
- **Le rendu SVG est un module** (`render/pipeline.ts`) qui prend l'état et une racine `<svg>` :
  Z4 peut l'héberger dans n'importe quel conteneur.
- **Les exports prennent l'état, pas l'écran** : Z1 les appelle sans que Z4 soit visible.
- **Les six empreintes sont l'oracle** : la reconstruction est finie quand le jeu de démonstration
  exporte les mêmes octets.

---

## 6. Ordre de mise en œuvre proposé

Zone par zone, chaque étape laissant l'application utilisable et les empreintes intactes.

| Étape | Livrable | Ce qui bouge | Preuve |
|---|---|---|---|
| 0 | La table des commandes (`commandes.ts`) et l'état observable | `app/ecouteurs/*` deviennent des lignes de table ; aucun changement d'écran | 548 tests, six empreintes |
| 1 | La coquille (Z1, Z7) autour du canevas existant | `index.html` : barre d'application et barre d'état ; R1, R2 et le titre disparaissent | Checklist de fumée |
| 2 | Z2 Palette et Z4 surimpressions | `#planActions`, `fitBtn`, `gridBtn`, le curseur solaire unifié | Points 1 à 11, 22 |
| 3 | Z3 Explorateur | `#selector`, `dispTable`, `terrasseSelector`, calques, sélection dossier | Points 13, 25 |
| 4 | Z5 Inspecteur par descripteurs | `attrPanel.ts` et `renderTerrasseConfigurator` réécrits en descripteurs (D-12) | Points 8, 10, 16, 17 ; oracle du moteur |
| 5 | Z6 Résultats | les sous-onglets BOM…Chantier, Mesure, PLU, Résumé | Points 18 à 21, 11, 15 |
| 6 | Z8 et Z9 | dialogues et notifications sur le design system | Points 12, 14, 23, 24 |

À chaque étape, la région remplacée est supprimée d'`index.html` — pas masquée — pour que la
carte des modules (`architecture.md` §5.2.2) reste vraie.

---

## 7. Décisions à prendre avant l'étape 1

1. **Le cadre.** V2 dit React + Tailwind + shadcn/ui. Le découpage ci-dessus s'applique aussi bien
   en DOM natif (les zones sont des modules qui rendent dans un conteneur) ; ce qui change est
   l'étape 0 — store Zustand ou bus d'événements. À trancher avant d'écrire la première zone.
2. **Le fichier unique.** ASR-3 exige un déploiement « copier un fichier ». `vite-plugin-singlefile`
   sait embarquer React ; le budget de 1,2 Mo tient (450 Ko aujourd'hui, React ≈ 45 Ko gzippé). À
   confirmer ou à abandonner avec la 2.0.0 (serveur Node).
3. **Le tactile.** L'interface actuelle est utilisable au doigt (pincement, trois doigts, double-tap
   objet). La palette Z2 et l'inspecteur Z5 doivent l'être aussi : largeur des cibles ≥ 44 px,
   panneaux escamotables en dessous de 1 024 px.
4. **Les vues.** Plan, Terrasse, Vue 3D et Visionneuse sont-elles quatre *vues* de Z1, ou Terrasse
   est-elle un *contexte* (une terrasse sélectionnée) du mode Plan ? La seconde lecture supprime un
   mode et rapproche l'inspecteur du canevas ; elle change la façon dont Z3 et Z5 s'articulent.
5. **Les résultats.** Z6 en bas (repliable) ou en onglet de Z5 ? En bas, on lit le BOM en regardant
   le plan ; en onglet, on gagne de la largeur pour le canevas.

---

## 8. Ce que cela laisse au Core

Rien dans ce document n'exige une modification de `model`, `geometry`, `engine`, `geo`, `export` ou
`three`. Trois chantiers de `MD/DEFAUTS.md` deviennent en revanche naturels au passage :
D-12 (descripteurs de champs, étape 4), D-14 (un parasol est un cercle : la section Parasol de
l'inspecteur n'apparaît que pour un cercle), D-13 (le lien de secours des exports, qui disparaît
avec Z9).
