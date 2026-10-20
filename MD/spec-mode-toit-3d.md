# Spec : le mode Toit dans la Vue 3D

Document de reprise. Il permet de lancer, dans une **session neuve** (autre compte Claude compris), le chantier « mode Toit » sans rien
connaître de la conversation qui l'a préparé. Tout ce qui a été décidé, tout ce qui existe déjà dans le dépôt, tout ce qui reste à faire, et
la façon de le vérifier, est ici.

Lire d'abord : `CLAUDE.md` (règles du dépôt), `README.md`, `MD/architecture.md`, `MD/spec-ecran-toit-facade.md` (les huit versions de la maquette, la
v8 est la référence), puis ce fichier. Charger les skills `design-ui` (toute IHM) et `toits` (tout ce qui touche aux toits, `identite.ts`).

---

## 1. Intention

Pour la personne qui configure sa maison (référence : AE 101, 2 allée des Limites, Le Vésinet) : **choisir la forme du toit en images, ajouter ce qui se pose
dessus ou sur la façade, le placer, le régler, tout annuler — sans formulaire, avec le moins de mots possible.** « Je vois, je clique, je sélectionne, je
positionne, je redimensionne, j'annule tout. »

Ce n'est **pas** un modèle métier : les règles de toit vivent déjà dans Plan (`regles/toits/`, lecture LiDAR, faits, profils). Ce chantier est
**la meilleure IHM possible** pour retoucher ce que les règles ont lu, ou pour décrire un bâtiment que le LiDAR ne sait pas lire.

### Décisions de la personne (à ne pas rediscuter)

1. L'outil (« Règles » et catalogue du toit) est **utilisable en 3D et uniquement en 3D** : il s'active par une option de la Vue 3D, il n'est plus dans la palette du plan.
2. Les fonctions UX sont **celles de la maquette v8** (`MD/maquettes/toit-ihm-ae101.html`), toutes, **sauf le plan de coupe** (mode « Coupe ») : exclu.
3. On **adapte la Vue 3D existante** (une seule scène, une seule maintenance). On ne crée pas une seconde vue 3D.
4. **Règles = « Lecture automatique ON/OFF »** : coupée, le bâtiment est figé (`toitFige`) et aucune lecture ne le réécrit ; rallumée, Plan relit le toit et remplace
   ce qui avait été réglé.
5. **Catalogue : les trois familles** (Toit, Sur le toit, Façade) en images, plus l'onglet Corps. Le modèle s'étend au besoin.
6. **Toutes les façades**, y compris celles qui ne sont pas perpendiculaires (bâtiment polygone, corps tourné d'un angle quelconque).
7. **Les corps de toit peuvent se superposer.**
8. Une façade est **un côté de corps** (4 par corps). Un élément posé sur un mur (pignon, galerie, bow-window…) peut **couper la façade en morceaux** : la vue
   la traite d'un seul tenant.
9. **Un bâtiment qui en cache un autre** : ce qui cache perd son volume et ne garde que son **contour en pointillé** (la transparence seule était « illisible »).
   Un œil « Isoler » masque tout le reste.
10. Titre du plateau : **« Ajouter un élément »**. Le **pignon** est rangé dans « Sur le toit » (pas dans « Façade »).
11. Un bow-window a sa **propre hauteur** (« Hauteur à l'égout ») en plus des niveaux **« Un étage »** et **« Jusqu'à l'égout de la maison »**.
12. Textes de l'interface en français, avec accents, vouvoiement. Commentaires de code en français **sans accents**, qui disent pourquoi.

---

## 2. Ce qui existe déjà (livré, fusionné dans `main`, PR #374)

### 2.1 Modèle (`src/model/types.ts`)

- `ObjetPlan.toitFige?: boolean` : « Règles coupées » pour ce bâtiment. Protégé de la relecture : `app/toitsLidar.ts::toitAAjuster` (`if (o.toitFige) return false`),
  `app/actualisationIgn.ts` (`garde`). Sérialisé par `io/serialisation.ts` (`if (o.toitFige) out.toitFige = true`), normalisé par `model/normalisation.ts`.
- `CorpsToit` (déjà : `pts` rectangle, `posFaitage`, `faitage`, `egouts`, `pignons`, `croupes`, `profil`, `bouts`, `lucarnes`, `cheminees`, `terrasse`, `speciale`,
  `ouvert`) a reçu :
  - `retraitM?: number` : recul des poteaux d'un appentis ouvert depuis le bord de l'égout (absent = 12 cm, le dessin d'avant) ;
  - `saillie?: SaillieFacade` : cet élément est posé sur un mur d'un autre corps ;
  - **`baie?: BaieToit`** : ajouté par `main` en parallèle (PR #372, bay window **lue dans le cadastre**, forme/pose/source). **Les deux notions coexistent et ne sont pas unifiées** :
    `baie` = lue (cadastre, `source`), `saillie` = posée à la main. À réconcilier plus tard si besoin (§7, question 3).
- `SaillieFacade` : `genre` (`'bow-window' | 'galerie' | 'appentis'`), `hote` (rang du corps porteur dans `corpsToit`), `mur` (côté `pts[mur]→pts[mur+1]` de l'hôte),
  `centreM` (milieu le long du mur depuis `pts[mur]`), `largeurM`, `profondeurM`, `forme` (`'rectangle' | 'arc' | 'conge'`), `niveau` (`'rdc' | 'toit'`), `toit`
  (`'pan' | 'pavillon' | 'plat'`), `hauteurM?: number | undefined` (hauteur à l'égout réglée ; absente = celle du niveau).
  Validation à la lecture : `model/corpsToitEtendu.ts::saillieValide` (et `retraitM`).
- **Un élément posé est un corps du toit** : son rectangle `pts` est **toujours calculé** (`rectangleDeSaillie`), jamais déplacé à la main.

### 2.2 Géométrie pure — `src/facade/regles/toits/saillies.ts` (couche `facade`, sans three ni DOM)

`murDuCorps(h, i)` (bouts, longueur, vecteur, normale sortante), `bornerSaillie`, `rectangleDeSaillie`, `corpsDeSaillie(hote, saillie)` (rectangle + hauteurs + toit propre ;
galerie = appentis ouvert `retraitM 0,3`, appentis = fermé), `estBowWindow`, `separerBowWindows`, `replacerSaillie(corps, rang, changement)`, `murLibre`, `empriseDeSaillie`
(rectangle / demi-ellipse 12 pas / congé 4 pas par coin), `facettesBowWindow` (murs du sol à l'égout sauf le mur de la maison, toit propre **avec débord 20 cm**),
`vitresBowWindow` (fenêtres : une par entraxe 1,6 m, 1,1 m de large, appui 0,9 m, linteau 0,3 m sous l'égout, un quadrilatère par côté), `retirerSaillie`, `murLePlusProche`,
`NOM_SAILLIE`, constantes (`HAUTEUR_RDC_M` 2,7, `DEBORD_BOW_M` 0,2, `HAUTEUR_BOW_MAX_M` 12, `RETRAIT_GALERIE_M` 0,3, `DEFAUTS_SAILLIE`).

### 2.3 Gestes et vignettes — couche `three` (les deux dépendent de `three/catalogueToits.ts`, déplacé là par `main`)

- `src/three/gestesToits.ts` : `PIECES` (formes du catalogue sauf tourelles, `sur:pignon`, `sur:cheminee`, lucarnes, `facade:bow-rectangle|bow-arc|bow-conge|galerie|appentis-ferme`),
  `piecesDe(famille)`, `raisonIndisponible(o, id)`, `appliquerPiece(o, id)`, `reprendreLectureAuto(o)`, `corpsPrincipal`, `corpsDepuisExemple` (remet un corps du catalogue à l'échelle du
  bâtiment : rectangle englobant, égout, montée du toit), `corpsDepuisToitSimple`. Garde-fou : un contour **en L / en U sans corps** (aire < 90 % de son rectangle
  englobant) refuse les gestes qui s'ajoutent et demande d'abord la forme du toit.
- `src/three/vueSaillie.ts` : `vueDeSaillie(nom)` = vignette isométrique d'un élément de façade calculée par les mêmes fonctions que la 3D (`vueIsometrique(exemple, plus)`).
- `src/three/toitCorps3d.ts` : `ajouterBowWindows3d` (murs, toit, vitres), `poteauxDAppentis` lit `retraitM`. `src/three/scene.ts` (`ajouterUnObjet`) sépare les bow-windows des
  corps ordinaires par `separerBowWindows` : **pas de prisme ni de fenêtres de maison pour eux**. ⚠ `ajouterUnObjet` est à 148 lignes pour une limite eslint de 150 :
  toute addition doit sortir du code dans une fonction voisine.

### 2.4 Commandes (`src/app/ecouteurs/toitCatalogue.ts`, branché dans `src/app/boot.ts`, groupe `toit` de `GroupeCommande`)

- `toit.regles` : bascule Règles (sur un bâtiment, ou sur tous ceux de la parcelle du projet si la parcelle est sélectionnée). Empile l'historique, `markDirty`, toast.
- `toit.poser` : pose la pièce nommée par `data-piece` du bouton qui l'a déclenchée (`source.dataset.piece`). Un élément de façade posé est **armé**.
- `toit.murSur3d` : arme l'élément visé (`viserSaillie(rang)` puis la commande). Le **toucher suivant** sur le bâtiment dans la Vue 3D replace l'élément sur le mur le plus proche
  (`murLePlusProche`). Écouteurs `pointerdown/up` sur `hotes3d.vue3d` (un déplacement de plus de 5 px n'est pas un toucher), Échap désarme. `src/facade/choixSaillie.ts` porte l'état armé.
- `batimentsVises(objets, cle)` et `reglesAllumees(batiments)` (exportés) : ce que la palette lit.
- Exposition obligatoire dans `src/app/exposition.ts` (`'toit.regles'`, `'toit.poser'` : `outil()` ; `'toit.murSur3d'` : `partout('inspecteur')`) et description dans la déclaration.

### 2.5 Interface actuelle (à **déplacer** dans le mode Toit, étape 1 et 3)

- `src/zones/Palette.tsx` : `GroupeToit` (interrupteur « Règles allumées/coupées » `aria-pressed`, onglets Toit / Sur le toit / Façade, vignettes `VignetteToit` et `VignetteVue`
  de `src/zones/EcranChaine.tsx`, raison d'indisponibilité en infobulle et, au doigt, sous le groupe). CSS dans `src/styles/app.css` (`.paletteToit`, `.toitRegles`, `.toitOnglets`,
  `.toitCatalogue`, `.toitPiece`).
- `src/ui/champs/facade.ts` : `sectionReleve` → `champsSaillies(c)` : **une ligne par élément** (mur, forme, niveau, hauteur à l'égout, toit, largeur, saillie, position, retrait
  de galerie, « Choisir le mur dans la 3D », Retirer). Chaque écriture appelle `replacerSaillie` et fige le toit. `indicesAppentis` ignore les éléments à `saillie`.
- Tests : `tests/unit/three/gestesToits.test.ts`, `tests/unit/facade/saillies.test.ts`, `tests/unit/ui/champsSaillies.test.ts`.

### 2.6 Autres briques réutilisables

- **Toucher en 3D** : `three/scene.ts::objetSousLePointeur(ndc, retenir?)` → `{ cle, point (repère du plan) }` ; `hotes3d.vue3d` (`three/etat3d.ts`).
- **Caméra de face** : `app/audit/parcelle/vuePrise.ts` (`cadreDe`, `poseFace`, `distanceFace`, `poseOrbite`, `OEIL_M`, `CHAMP_VISIBLE_DEG`) — la vue en élévation devant une façade
  existe déjà pour l'audit. `three/navigation.ts` (orbite, zoom molette).
- **Isoler** : commande `terrasse.isoler` (`three/etat3d.ts`, `Vue3d.tsx` : `libIsoler`), logique `model/fonctions.ts::visibleEnIsolement`.
- **Façades d'un contour** : `facade/geometrie.ts::facadesDuContour`, `facade/choix.ts` (façade désignée), `geometry/facadeExterieure.ts` (`segmentEnFacade`).
- **Historique** : `atelier.pushHistory/markDirty/render`, `core/historique.ts` (Ctrl+Z).
- **Catalogue 3D** : `three/catalogueToits.ts` (`EXEMPLES_TOITS`, `corpsDeLExemple`, `vueIsometrique`), affiché aussi dans Admin › Chaîne.
- **Fiches de règles** : `src/regles/`, `src/facade/regles/`, `deploy/prompt-analyse.md` **générés** — ne jamais les éditer à la main (`npm run regles:generer`).

---

## 3. La maquette v8 : inventaire complet (`MD/maquettes/toit-ihm-ae101.html`, ouvrable dans un navigateur)

La maquette est autonome (three.js r128 UMD, aucun réseau requis hors CDN). **Trois écrans** :

### Écran A — la 3D du terrain (`#vue3d`)
- Bascule **Dessus / 3D** (`#v-top`, `#v-3d`).
- On touche un bâtiment : surlignage (arêtes d'accent + lueur), barre d'action `#abar` : **« Modifier cette façade »** (crayon) pour le bâtiment du projet, **cadenas** (« Maison voisine,
  non modifiable ») pour un voisin, et **œil « Isoler ce bâtiment »** (`#a-eye`, `aria-pressed`).
- Occlusion : le bâtiment choisi est visé par des rayons (3 × 2 × 2 points de son volume) ; le premier autre bâtiment touché devient **fantôme** (contour pointillé, `setGhost(1)`),
  ou disparaît si on isole (`setGhost(2)`). Le bâtiment choisi reste touchable à travers lui. Recalculé à chaque mouvement de caméra.
- **Indice « main »** (`#hint3`) au-dessus du bâtiment tant que rien n'a été touché ; disparaît au premier geste.
- Un toucher mémorise le point touché (`lastHit`) : « Modifier » ouvre l'écran B sur **la façade la plus proche de ce point** (`facadeProche`).
- Un toucher est un appui-relâché de moins de 6 px.

### Écran B — l'éditeur de façade (`#scene`)
- **Barre** `.bar` : Retour (`#b-retour`), titre (icône + « Façade »), **Annuler / Rétablir / Revenir au départ (annulable)** (`#b-undo`, `#b-redo`, `#b-reset`), **Valider** (`#b-ok`,
  toast « Façade validée »), séparateur, **thème clair/sombre** (`#b-theme`, reconstruit la 3D). Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y, Suppr/Retour arrière (supprime la sélection), Échap
  (annule le glisser en cours, sinon désélectionne ; ferme la boîte de dialogue ; quitte la 3D).
- **Retour avec des changements** → dialogue modal `#dlg` « **Abandonner les changements ?** » : Abandonner (danger) / Continuer (focus par défaut).
- **Scène** : la façade choisie, vue **oblique alignée sur le mur** (`#cv-face`, canvas three.js, caméra orthographique à matrice de projection oblique), **la maison tourne** pour que la
  façade choisie fasse face, quel que soit l'angle du corps. Au-dessus : un **calque SVG** (`#svg`, `#ov`) porte les **poignées**, les **guides** (`.guide`) et le **chip** de cotes (`#chip`).
- **Sélecteur de vue** (`#fm`, à gauche) : **Plan** (`#fm-plan`), **Façade** (`#fm-face`), ~~Coupe~~ (`#fm-coupe`, **exclu**), **3D** (`#fm-3d`, ouvre l'écran C), **Isoler ce corps** (`#fm-eye`, visible
  en Façade seulement : masque les autres corps).
- **Navigateur** (`#nav`, en haut à droite) : **le plan en petit** ; chaque corps est un polygone, **chaque côté de corps est une arête cliquable** ; la façade courante est en évidence (`.ne.on`) avec
  un **repère de point de vue** (triangle `.nv` devant le milieu du côté). Cliquer une arête choisit cette façade ; cliquer un corps prend sa façade la plus proche de la vue actuelle (`bestSide`).
- **Chip de cotes** (`.chip`, bulle posée au-dessus de la sélection) : pastilles `puce(clé, valeur)` — largeur, angle, hauteur, saillie (« prof »), retrait, rotation.
  Sans sélection : largeur / angle / hauteur de la façade ; avec un pignon : largeur, angle du pan (`atan2(apex − égout, largeur/2)`), hauteur du faîte, saillie ; bow-window : largeur, saillie, hauteur ;
  appentis/galerie : largeur, angle, saillie, retrait (si > 2 cm).
- **Indice « main »** (`#hint`) sur le corps principal tant que rien n'a été fait.
- **Plateau** (`#tray`, titre **« Ajouter un élément »**) : quatre onglets `role="tab"` à images :
  - **Corps** : *Aile*, *Retour*, *Biaise* (grisés si aucun emplacement libre : `emplacement(k)`).
  - **Toit** : 10 formes dans l'ordre `plat, appentis (« Un pan »), deux-pans, croupes, pavillon, demi-croupe, mansart, brisé, papillon, berceau`, la forme courante `aria-pressed`.
  - **Sur le toit** : *Pignon* (grisé avec la raison « Pas de pignon sur cette façade » si la façade n'a pas de profil à pignon ou n'est pas un côté long), puis les éléments de toit
    *Cheminée* (0,75 m), *Jacobine* (1,5 m), *Chien-assis* (1,5 m), *Fenêtre de toit* (« velux », 1 m), *Solaire* (2,55 m).
  - **Façade** : *Appentis*, *Galerie*, *Bow-window*.
  Toutes les images sont **calculées par le même dessin que la scène** (pas des icônes dessinées à part). Un geste = toucher l'image. Ajouter un corps passe en mode Plan ; ajouter un pignon
  passe en Façade + onglet « Sur le toit » ; un bow-window / appentis / galerie passe en Façade + onglet « Façade ».
- **Inspecteur contextuel** (`#insp`, pas de formulaire, **boutons-images à choix exclusif** `.sg`, `aria-pressed`) :
  | Sélection | Groupes |
  |---|---|
  | Bow-window | **forme** (pans coupés · rectangle · arc de cercle · rectangle arrondi) ; **niveau** (sous le premier étage · monte jusqu'au toit) ; **toit** (un pan · plat · en pointe) |
  | Appentis / galerie | **sur poteaux / fermée** ; **retrait** du mur (0 · ½ · 1 m) |
  | Pignon | **hauteur** (monte au faîtage · plus bas que le faîtage) |
  | Élément de toit | **taille − / +** (échelle 0,5 à 2,2, pas 0,15) |
  | Tous (sauf appentis/galerie pour « dupliquer ») | **Dupliquer**, **Supprimer** (danger) |
  | Aucun élément (le corps) | **Tourner ⟲ ⟳** (± 15°), **Supprimer ce corps** (sauf le principal) |
- **Poignées** (SVG, glisser) : élément de toit → taille ; **corps** → hauteur du faîtage (verticale), longueur de la façade (horizontale, on garde le bout gauche en place) ; **pignon** → position
  (aimantée aux bords et aux autres pignons, ±0,25 m), largeur (1,4 à 8 m, colle au bout du mur à ±0,25 m), hauteur du faîte (au moins 0,8 m au-dessus de l'égout, se « réduit » au faîtage à moins de 0,25 m),
  saillie (0 à 2,5 m) ; **bow-window** → position (aimantée aux bords et au centre), largeur (1,2 à 6 m), saillie (0,2 à 1,5 m, 1,2 m max si « sous le premier étage ») ; **appentis/galerie** → bords gauche/droit (1,2 m
  minimum entre les deux, colle au bout à 0,25 m), hauteur d'égout (1,6 m à égout de la maison − 0,9 m), déplacement entier, retrait. Pendant un glisser : chip de cotes + guides en pointillé.
  Un glisser = **un seul instantané** d'historique.
- **Mode Plan** (`#svg3`) : poser, déplacer, étirer, tourner les corps ; lignes de faîtage dessinées par forme ; marqueurs des éléments posés ; chip largeur/profondeur/rotation. **Le faîtage se met
  dans le sens de la longueur tout seul** tant que le corps n'a ni pignon, ni appentis, ni bow (`autoDir`).
- **Vignettes d'ajout de corps** : positions candidates calculées (`emplacement`) : *Aile* à droite du dernier corps (3 m de large) ; *Retour* en équerre à l'arrière du principal
  (3 × 5 m, 3 emplacements testés) ; *Biaise* tournée de 35° devant (4 × 3,2 m) ; bornes de la scène `LARGEUR_MAX 17,2` × `PROF_MAX 13`.
- ~~**Mode Coupe**~~ (`#svg2`, profil du toit avec l'angle) : **exclu de ce chantier**.

### Écran C — la 3D de l'ensemble modifié
Bouton 3D du sélecteur de vue ; Échap revient. La 3D montre la maison **validée** (`committedStr`) dans son terrain (parcelle, 3 voisins), pas la session en cours.

### Données d'exemple de la maquette (AE 101)
Corps principal 9,9 × 7 m deux-pans (égout 4,6, hauteur 2,9), deux pignons de 3,7 m au faîtage, une galerie sur poteaux (retrait 0,5), une cheminée ; aile gauche en appentis avec un bow-window
(2,2 m, saillie 0,65, pans coupés) ; aile droite en croupes ; un retour (3 × 5 m, sens perpendiculaire) qui entre dans le toit ; une aile biaise tournée de 35°.

---

## 4. Architecture cible

### 4.1 Une scène, deux caméras

- **La Vue 3D reste la seule scène** (`three/scene.ts`, `affichage3d`, `vue3d` de `three/etat3d.ts`, `zones/vue3d/Vue3d.tsx`). Le mode Toit change **seulement la caméra** (perspective libre →
  **orthographique oblique alignée sur un mur**, comme `#cv-face` de la maquette : matrice de projection oblique personnalisée, la maison tournée pour que le mur choisi fasse face) et superpose
  un **calque SVG** pour poignées, guides et cotes. Les points SVG se placent par **projection de points 3D** par la caméra ; le toucher d'un élément passe par le rayon
  (`objetSousLePointeur`, ou un lancer de rayon dédié aux éléments d'un bâtiment).
- **Contraintes de couches** (`tests/unit/architecture.test.ts`) : `util/shell → geometry → model → engine/geo/facade → core/io/render/export/three/interaction → ui → app/zones`. Ce qui dépend du catalogue 3D
  (`three/catalogueToits.ts`) vit dans `three/` ; la géométrie pure (placement, emprises, hauteurs) reste dans `facade/regles/toits/`. Un module `ui/` ne peut pas importer `app/`.
- **Session d'édition** : à l'entrée, copie profonde des champs de toit du bâtiment (`corpsToit`, `toit`, `modeToit`, `toitFige`, `volumesToit`) ; toutes les retouches se font sur cette copie
  avec **un historique de session** (annuler / rétablir / revenir au départ). **Valider** écrit la copie dans le projet en **un seul** instantané (`pushHistory`) + `markDirty`, fige le toit
  (`toitFige`). **Abandonner** jette la copie. Pendant la session, la scène 3D montre la copie (comme `modelFaces` de la maquette), le reste du projet est en lecture seule.
- **Réglage d'affichage** : l'activation du mode est un réglage d'affichage (pas de Ctrl+Z, pas de « projet modifié », permis en lecture seule — comme « Filaire »). La **validation**, elle, modifie
  le projet : refusée en lecture seule.
- **Commandes** (registre `app/commandes.ts`, `permission: PERMISSION_ECRITURE` pour celles qui écrivent) : prévoir au minimum `toit.modifier` (entrer), `toit.valider`, `toit.abandonner`,
  `toit.annulerSession`, `toit.retablirSession`, `toit.depart`, `toit.facade` (choisir une façade, paramètre), `toit.isoler`, plus celles de §2.4. **Chaque commande s'inscrit dans
  `app/exposition.ts` pour les trois classes** (`compact`, `moyen`, `large`) et porte une description ; `tests/unit/app/exposition.test.ts` lit le code source : l'identifiant doit
  **apparaître littéralement** (`'toit.valider'`) dans le fichier de l'emplacement choisi (par exemple `src/zones/vue3d/Vue3d.tsx` pour `vue3d`), et les identifiants de commande doivent être
  des chaînes littérales `id: '…'` dans `src/app/`.
- **Contrôles** : tout `data-controle` est inventorié (`app/controlesInterface.ts`) et testé (`tests/unit/app/controlesInterface.test.ts`) : classer chaque nouveau contrôle (nature, zone, `ecrit`).

### 4.2 Modèle à étendre (étape 3 et 5)

- **Éléments de toit** : ajouter `fenetre-toit` (velux, 1 m) et `solaire` (panneau, 2,55 m) à côté de `Lucarne`/`Cheminee` ; échelle `s` (0,5 à 2,2). Dessin 3D (`three/toitCorps3d.ts`, `facade/toitFormes.ts`).
  Ils doivent se **relire à l'identique** d'un fichier ancien (champ facultatif, validé dans `model/corpsToitEtendu.ts`, compacté à l'écriture).
- **Pignon enrichi** : `PignonToit` a `pan`, `debut`, `fin`, `faitage`, `profondeur` ; ajouter ce que la maquette règle : **largeur, position, hauteur du faîte (monte au faîtage / plus bas), saillie** (déjà `profondeur`).
  « Pas de pignon sur un appentis » (règle existante, skill `toits`) ; « pas de pignon sur une façade sans profil à pignon / sur un côté court ».
- **Retrait de galerie à trois valeurs** : 0 / ½ / 1 m (le champ `retraitM` existe).
- **Éléments sur un mur quelconque** : `SaillieFacade.hote` peut viser n'importe quel corps non-saillie (déjà vrai), `murLibre` choisit le plus long mur sans élément.
- **Corps à poser** (étape 5) : une *Aile*, un *Retour*, une *Biaise* sont des `CorpsToit` ordinaires avec rotation libre (les `pts` suivent la rotation : rectangle tourné) ; les corps **se superposent**
  (le plus haut l'emporte dans le dessin, c'est déjà le cas des rectangles maximaux). Ne pas casser la lecture LiDAR : un bâtiment posé à la main est `toitFige`.
- **Bay window du cadastre (`baie`)** : ne pas la supprimer ; décider avec la personne (§7) s'il faut convertir `baie` en `saillie` à l'ouverture.

### 4.3 AE 101 ne bouge pas
`npx tsx .claude/skills/toits/scripts/identite.ts` doit afficher `AE 101 : corps identiques` après chaque étape. Les empreintes `tests/fixtures/golden/` ne doivent pas bouger (sinon : événement de version majeure,
`MD/RELEASE.md`, `EMPREINTES.md`).

---

## 5. Les étapes

Chaque étape est **livrable seule** : CI verte, CHANGELOG (`## [Non publié]`, Ajouté/Modifié/Corrigé, en français), fumée sur les points touchés, PR vers `main`, merge (commit de merge, pas de squash).
Branche `claude/<sujet>` depuis `origin/main`. Jamais de push direct sur `main`.

### Étape 1 — Le mode Toit et le choix de façade
**Livrable :** un bouton « Modifier la toiture » dans les commandes de la Vue 3D, actif sur un bâtiment **du projet** sélectionné (les voisins : cadenas, infobulle « Maison voisine, non modifiable »).
- Écran A de la maquette : surlignage du bâtiment choisi, barre d'action (Modifier · Isoler), contours en pointillé pour ce qui cache le bâtiment choisi (`setGhost` : maille masquée + `LineSegments`/`EdgesGeometry` en `LineDashedMaterial`),
  œil « Isoler ce bâtiment » (réutiliser `terrasse.isoler`), indice « main ».
- Choix de la façade : toucher un mur (`facadeProche` : le côté de corps le plus proche du point touché ; calculer sur **tous** les corps, façades de biais comprises).
- Caméra oblique de façade sur la même scène ; la maison tourne pour que la façade choisie fasse face (`viewFor` de la maquette) ; retour à la 3D par un bouton et par Échap.
- Session d'édition (copie), Valider (un instantané), Abandonner (dialogue « Abandonner les changements ? » en Z8, `shell/dialogues.ts` + `zones/Dialogues.tsx`), Annuler/Rétablir/Revenir au départ de session, raccourcis.
- Le groupe « Toit » (Règles + catalogue) **sort de la palette du plan** et n'existe que dans le mode ; `GroupeToit` de `Palette.tsx` est repris, pas réécrit ; `exposition.ts` mis à jour.
- Mode activé = réglage d'affichage ; lecture seule : on peut regarder, pas valider.
**Critères :** entrer / sortir ne modifie pas le projet ; abandon = projet identique au bit près ; valider = 1 seul Ctrl+Z ; trois classes d'écran ; thème clair et sombre.
**Tests :** machine à états de session (unitaire pur), `facadeProche` sur un rectangle, un L, un corps tourné ; exposition ; contrôles.

### Étape 2 — Le navigateur de façades et les vues
- Plan en petit en haut à droite, chaque côté de corps cliquable, façade courante en évidence, repère de point de vue ; clic sur un corps = sa façade la plus proche de la vue (`bestSide`).
- Sélecteur de vue : Façade · Plan · 3D (ouvre la 3D de l'ensemble validé), œil « Isoler ce corps » (Façade seulement).
- Un bâtiment qui en cache un autre dans la façade : contour pointillé, le choisi reste touchable à travers.
**Critères :** toutes les façades d'un polygone et d'un corps tourné sont atteignables ; AE 101 (4 corps) naviguable.

### Étape 3 — Le plateau « Ajouter un élément » et l'inspecteur contextuel
- Plateau à quatre onglets d'images (Corps · Toit · Sur le toit · Façade) avec les vignettes calculées par le dessin 3D (§2.3), états `aria-pressed` / désactivé avec raison.
- Inspecteur contextuel **en boutons-images à choix exclusif** (jamais de formulaire) : tableau du §3. La ligne `champsSaillies` actuelle de l'inspecteur du plan reste (réglages fins en chiffres) ; l'inspecteur du mode en est la version « images ».
- Extensions de modèle du §4.2 : fenêtre de toit, solaire, pignon enrichi, retrait à trois valeurs. Dessin 3D, validation à la lecture, compactage à l'écriture, tests d'aller-retour de fichier ancien.
- Dupliquer, supprimer, taille − +.
**Critères :** un fichier ancien se relit identique ; les nouvelles pièces se dessinent en 3D et dans leur vignette ; AE 101 identique.

### Étape 4 — Les poignées sur la façade
- Calque SVG sur la scène (projection de points 3D), poignées du §3 (hauteur de façade, longueur de façade, pignon, bow-window, appentis/galerie, taille d'un élément) ; chip de cotes ; guides ; aimantation à 0,25 m.
- Un glisser = un instantané de session. Échap annule le glisser. Cibles tactiles ≥ 44 px au doigt.
- **Commencer par le bow-window** (déjà modélisé) pour valider la chaîne projection → poignée → écriture → redessin, puis généraliser.
**Critères :** poignée sous le doigt et à la souris, cotes justes au centimètre, aimantation, pas d'écriture au simple survol.

### Étape 5 — Les corps et le mode Plan
- Onglet Corps : *Aile*, *Retour*, *Biaise* (emplacements candidats §3), rotation ± 15°, suppression (sauf le principal), déplacement/étirement dans le plan, **superposition** admise, faîtage dans le sens de la longueur (`autoDir`).
- Mode Plan (en petit dans le navigateur et en grand) avec lignes de faîtage par forme et marqueurs des éléments posés.
**Critères :** rotation libre, façades de biais éditables, AE 101 (multi-corps) refait à la main possible ; contour en L/U décrit par corps.

### Étape 6 — Finitions, mobile, livraison
- Thème sombre complet, indice « main » (disparaît au premier geste), toast « Façade validée », trois classes d'écran (téléphone : le plateau passe en feuille, le navigateur se replie ; tablette : rail).
- Fumée pilotée sur tous les points touchés (§6), mise à jour de `tests/CHECKLIST-FUMEE.md` (nouveaux points), `MD/spec-ihm-zones.md` si une commande change de zone, `MD/spec-ecran-toit-facade.md` (renvoi vers cette spec), CHANGELOG.
- Livraison depuis `main` : `BACKPROD_API_URL=https://www.raillard.org npm run livraison` dans un worktree à part (`git worktree add --detach /tmp/livraison-wt origin/main`, lien `node_modules`), `livraison.zip` ignoré par git.

### Hors périmètre
Le **mode Coupe** (profil du toit en travers avec l'angle). Pas de modèle métier nouveau pour les règles de toit. Pas de seconde Vue 3D.

---

## 6. Comment vérifier

```bash
npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test    # ce que lance la CI
npx tsx .claude/skills/toits/scripts/identite.ts                                           # AE 101 identique
```

- **Pièges de CI** : `max-lines-per-function` 150 (voir `scene.ts::ajouterUnObjet`) ; `tests/unit/app/exposition.test.ts` (ids littéraux + emplacement qui nomme la commande) ; `tests/unit/app/descriptions.test.ts` (chaque commande a une
  description) ; `tests/unit/architecture.test.ts` (couches) ; `controlesInterface.test.ts` (contrôles classés) ; `exactOptionalPropertyTypes` : un champ optionnel mis à `undefined` doit être déclaré `x?: T | undefined`.
- **Fumée pilotée** :
  ```bash
  BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort    # en arrière-plan
  NODE_PATH=$(npm root -g) node scripts/fumee.mjs http://localhost:5199 1 22   # points ; FUMEE_CLASSES=large FUMEE_THEMES=light pour aller vite
  ```
  Points utiles : 1 (plan, trois classes), 22 (Vue 3D). Les points 41 et 45 de `tests/CHECKLIST-FUMEE.md` (relevé de façade) **ne sont pas joués** par le script. Arrêter le serveur par
  `ps aux | grep "[v]ite --port 5199"` puis `kill` — **jamais `pkill -f`** (tue aussi le shell qui le lance).
- **Essai réel dans un navigateur** (ce qui a servi à valider le bow-window) : un script `.mjs` Playwright (`NODE_PATH=$(npm root -g)`, `chromium` avec `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`),
  `import('/…/scripts/captures.mjs')` pour `ouvrirDemo(page)` (la démonstration **éditable**, `?mode=demo` est en lecture seule) et `import('/…/scripts/fumee-reseau.mjs')` pour `servirThreeLocal(page)`.
  Poignées de test exposées en dev par `window.__plan` : `executer(id)` (sans élément source : pour une commande qui lit `source.dataset`, **cliquer le vrai bouton** du DOM), `etat()`, `selectionnerCle(cle)`,
  `scene3d()` (`camera`, `controls`, `cen` : plan.x = v.x + cen.x ; plan.y = cen.y − v.z), `magasin()`, `ouvrirFeuille`, `ouvrirResultats`. Pour regarder un objet précis : placer `controls.target` et
  `camera.position` puis `controls.update()`, et viser un point par `Vector3.project(camera)` → pixels du `#terrasse3dCanvasHost`. Dans la démonstration, `maison` est le bâtiment du projet (contour de 14 sommets :
  pour un essai simple, remplacer `pts` par un rectangle, vider `facades`, `corpsToit`, `segmentNames` et les `measures`, sinon l'inspecteur lève des « Indice N hors du tableau » sans rapport avec le chantier).
- La Vue 3D se charge en modules ES depuis jsDelivr (`three` 0.186.1) : tester hors ligne exige `servirThreeLocal`.

## 7. Questions ouvertes (à poser à la personne avant l'étape concernée)

1. **Éléments de toit** : confirmer les dimensions et le dessin de la *fenêtre de toit* et du *solaire* (la maquette ne donne que leur largeur 1 m / 2,55 m).
2. **Plan de coupe** : exclu ici ; sera-t-il demandé plus tard ? (Le profil par pan existe déjà : `ProfilPan`.)
3. **`baie` (cadastre) et `saillie` (main)** : les unifier à l'ouverture (une `baie` devient une `saillie` modifiable) ou garder deux notions ?
4. **Le contour en L/U** : proposer le découpage en corps automatiquement (`rectanglesDuContour`) à l'entrée du mode, ou laisser la personne poser ses corps (étape 5) ?
5. **Voisins** : le mode Toit reste réservé aux bâtiments de la parcelle du projet (`surParcelleDuProjet`) — confirmer.
6. **Mobile** : sur téléphone, le glisser sert à tourner la vue ; les poignées exigent un mode « Modifier » explicite — confirmer l'ergonomie (deux doigts pour la vue, un doigt pour la poignée ?).
7. **Livraison** : à quelle étape faire la première livraison zip ?

## 8. Rappels de méthode (CLAUDE.md, extraits utiles)

- Messages de commit en français : un titre court, puis le pourquoi. Fin de message : lignes d'attribution demandées par la session.
- Un nombre produit hier doit être reproductible aujourd'hui : une modification qui change une quantité ou un export est un événement de version majeure ; les empreintes golden le vérifient.
- Un bouton est une liaison vers une commande du registre et lit `commandes.etat(id)` : effacé si `capacite`, grisé avec la raison sinon ; jamais `obtenir(id).actif` seul.
- Un champ de l'inspecteur est un descripteur de `ui/champs/` (`sale: false` = réglage d'affichage ; un bouton déclare `agit`).
- Ce que la fonction d'un objet lui donne est décrit une fois dans `src/model/fonctions.ts` (`estBatiment`, `estTerrasse`, `surParcelleDuProjet`…) : ne pas réécrire ces tests ailleurs.
- Une décision de l'audit ne réécrit jamais une forme de toit de sa propre main (moteur de règles `corpsSousContrainte`) ; ce chantier est l'édition **manuelle**, elle fige (`toitFige`).
- Ne pas créer de PR sans demande ; ne jamais pousser sur `main`.
