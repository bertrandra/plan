# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [1.1.0] — 2026-09-21

**La migration TypeScript est terminée.** Le fichier mono-page de 13 487 lignes (`1.0.0`, figé dans
`legacy/plan_interactif.html`) est devenu un graphe de 115 modules typés sous la configuration la
plus stricte du compilateur, et l'artefact livré reste un seul fichier `plan.html`, produit par le
build. La définition de fin (`MD/spec-migration-typescript.md` §14) est cochée en entier : `tsc`,
ESLint et 548 tests à zéro ; six artefacts exportés identiques au bit près à ceux de la `1.0.0`, à
la version près, prouvé à chaque palier ; checklist de fumée 25/25 sur le build ; déploiement de
test avec `api.php` ; carte des modules ; liste des défauts triée.

Ce que l'utilisateur voit changer par rapport à la `1.0.0`, tout est dans les paliers `alpha` ci-dessous :
trois corrections (`alpha.16`) et une construction complète à l'ouverture d'un projet ancien
(`alpha.17`). Aucune quantité, aucun octet exporté ne bouge pour un projet valide — d'où une version
MINEURE, comme `MD/RELEASE.md` §2.3 le prévoyait.

### Interne

- `BUILD_AT` passe au 21 septembre 2026 ; la pastille de version affiche `v1.1.0`.
- Le passage d'un numéro de pré-version au numéro final raccourcit la chaîne estampillée dans les
  six artefacts : les quatre fichiers texte sont identiques à ceux de l'`alpha.17` une fois le numéro
  neutralisé, et les deux PDF ont le même contenu (mêmes objets, pages et textes) : une fois neutralisés
  numéro, dates, décalages internes et longueurs de flux, une seule ligne diffère, le dictionnaire
  `/Producer … /Creator` qui porte la version et la date de build.

## [1.1.0-alpha.17] — 2026-09-21

**`ObjetPlan` est une union discriminée** (MD/DEFAUTS.md, D-3 ; spec §12). Polygone, chemin et
cercle sont trois types que `type` distingue : le compilateur ne laisse lire `pts` qu'après avoir
écarté le cercle, `center` et `r` qu'après l'avoir reconnu. Les quatre signatures d'index
(`ObjetPlan`, `Construction`, `LigneBom`, `Mesure`) ont disparu. Aucun octet exporté ne bouge :
six empreintes sur six inchangées à version égale.

### Corrigé

- **Un projet ancien s'ouvre avec une construction complète** (D-1). `ensureConstruction` ne
  comblait que 40 des 53 réglages ; les treize autres n'étaient posés que sur une terrasse neuve, et
  un projet enregistré avant leur existence arrivait au moteur avec `soliveSection`,
  `soliveEntraxe`, `lambourdeEntraxe`, `essenceBois`… à `undefined` — un débit bois titré
  « (undefined) », une marge de zone spa en `NaN`. Les douze sont comblés à l'ouverture avec la
  valeur que chaque lecture du moteur prenait déjà par `||` en leur absence, donc aucun nombre ne
  bouge ; l'essence reste « autre », le tarif que ces projets ont toujours eu. Seul `bom`, un
  résultat, reste à `computeBOM`.

### Interne

- `model/types.ts` : `ObjetCommun` porte ce qui est partagé ; `ObjetPolygone`, `ObjetChemin`,
  `ObjetCercle` ce qui distingue ; `ObjetPlan` est leur union, `ObjetAPoints` celle des deux
  premiers, `ObjetBrut` reste `Partial<ObjetPlan>`. `voisinage` et `Mesure.id`, lus depuis toujours
  et jamais déclarés, le sont.
- `model/formes.ts` : quatre aides — `estCercle`, `aDesSommets` (gardes), `sommetsDe` (`obj.pts || []`
  sous un nom), `enPoints`/`enCercle` (l'ancien `!` sous un nom qu'on peut chercher).
- **258 assertions `!` sur `pts`/`center`/`r` → 25**, toutes restantes sur des types partiels ou des
  interfaces locales, jamais sur l'union. La plupart sont tombées d'elles-mêmes dans des branches
  déjà écrites sur `type` ; les autres sont devenues une garde nommée de même valeur de vérité, ou
  `enPoints`/`enCercle` là où le contexte garantit la forme.
- Les vues partielles `ObjetCote` (render), `ObjetMesurable` (engine) et `ObjetASurface` (export)
  sont des formes structurelles explicites : un `Pick` sur l'union n'existe plus quand la clé manque
  à un membre.
- Le filtre des terrasses du dossier PDF est un prédicat de type ; `cerclePointsExtent` (three) prend
  un `ObjetCercle` ; `PointDeVue.pts` (three) dit `ObjetAPoints['pts']`.
- Ce que l'union a révélé sans le corriger — un parasol désigné par `fonction` et non par `type`,
  qui planterait si l'on faisait « parasol » d'un polygone (D-14) — est dans `MD/DEFAUTS.md`.
- 548 tests.

## [1.1.0-alpha.16] — 2026-09-20

**Trois corrections que le typage strict avait mises au jour** (voir `MD/MIGRATION-JOURNAL.md`,
« Phase 7 — l'échelle gravie », « ce qui ressemble à un bug »). Aucune ne touche un artefact
exporté : les six empreintes sont inchangées à version égale.

### Corrigé

- **Les cotes lues d'un fichier sont vérifiées avant d'entrer dans l'état.** L'import SVG annonçait
  une vérification « ligne à ligne » mais ne contrôlait que l'existence des deux objets référencés :
  `refSegIndex`, `startEnd` et `targetPtIndex` étaient recopiés tels quels, et l'import JSON faisait
  de même. Une cote au-delà du polygone, sur un cercle pris pour référence, ou sans indice, entrait
  dans `etat.measures` pour ne jamais se dessiner. `model/mesures.ts::referencesDeCote` est
  désormais le seul juge, pour les deux imports : objets présents, cote de référence sur un polygone
  et dans ses bornes, sommet cible dans les bornes (ou n'importe quel entier positif sur un cercle,
  dont le point coté est le centre), `startEnd` normalisé en `A`/`B` comme le rendu le lit. Ce qui
  est refusé est compté dans le message d'import. 12 tests, dont l'import du SVG doré (11 cotes
  restaurées, références intactes) et une copie abîmée de ses cotes.
- **Actualiser depuis l'IGN exige les deux coordonnées du point de calage.** La garde ne vérifiait
  que la latitude : une longitude absente aurait projeté tout le voisinage en `NaN`, en silence.
- **Un bâtiment BD TOPO sans `properties` ne fait plus lever la boîte d'import cadastral.** La liste
  des hauteurs « sur la propriété » lisait `props` sans garde ; il prend la hauteur par défaut,
  comme l'import lui-même le faisait déjà.

### Interne

- Le message de l'import JSON dit « objet de référence absent ou indice hors du plan ».
- 547 tests (535 + 12).
- **La définition de fin de migration (spec §14) est cochée en entier** : checklist de fumée déroulée
  25/25 sur le build (`tests/CHECKLIST-FUMEE.md`), déploiement PHP local avec `api.php` vérifié sur
  les quatre actions et un projet de production, GLB revérifié structurellement, carte des modules
  à jour (`MD/architecture.md` §5.2.2), liste des défauts triée (`MD/DEFAUTS.md`).

## [1.1.0-alpha.15] — 2026-09-20

**Phase 7 : l'échelle de rigueur est gravie.** `tsconfig.json` porte désormais la configuration cible
de la spec §9.1 — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Mesurées
en cumulatif au départ du palier : **1 513 erreurs**, dont 300 dans `ui/`, 218 dans `tests/`, 201
dans `geometry/`, 168 dans `engine/`, 141 dans `three/`, 132 dans `export/`, 100 dans `render/`,
81 dans `app/`. À l'arrivée : **0**. Aucun des six artefacts exportés ne bouge à version égale.

### Interne

- **Uniquement des types.** Assertions non nulles `!` là où le code environnant garantit déjà
  l'invariant (indice borné par la boucle, `find` précédé d'un `some`, `pts` sous un
  `type === 'polygon'`, élément du DOM d'`index.html`) ; `catch (e)` lu via `(e as Error)` ;
  paramètres inutilisés préfixés `_` ; imports et variables mortes retirés. Le diff de `geometry/`,
  une fois les `!` ôtés, est identique à l'original ligne pour ligne. Aucun `if`, `return`, valeur
  par défaut ou `??` ajouté nulle part.
- **Des signatures qui mentaient, corrigées** : `ContexteHistorique` disait `unknown[]` pour des
  objets du plan et des cotes — il est générique sur leur forme, comme l'appelant la connaît ;
  `ContexteAttrPanel.startPick` et `measureSegCoords` disent les unions réelles ;
  `appliquerProjetImporte` reçoit un `ProjetValide`, pas `unknown` (`app/ecouteurs/fichiers.ts`,
  `ui/projectBar.ts`) ; `ContexteVue3d.setMode3D` prend un `Mode3D` ; `ContexteMesurePanel.refLabel`
  accepte `null`, ce que l'implémentation faisait déjà ; `chargerTuileOrtho` rend `Promise<string>`
  (le `has` précède le `get`) ; `nomProjet` accepte `null` ; `geocoderBAN` lit un `[number, number]` ;
  `export/pdf/writer.ts` nomme `Rgb01` ; `three/etat3d.ts` : `dernierExporte.date` est une `Date`.
- **Types élargis pour `exactOptionalPropertyTypes`**, là où le code assigne `undefined` en
  clair : `Construction.prixVisUnite`, `TextureAppliquee.vignette`, `SourcesDIdentite.horloge`/`alea`,
  `AppuiSurLigne.n`, `TerrasseEtudiee.pts`, `PointDeVue.pts`/`altitude`, `SeedProjectBar.meta`.
- **Deux symboles morts de plus** : le paramètre `lamesAngle` d'`evaluerStructure` n'est jamais lu
  (renommé `_lamesAngle`, position conservée) ; `GlisserEnCours.startR` n'est lu nulle part.
- **Le cliquet** (`scripts/cliquet.mjs`) n'a plus de drapeaux à monter : `tsconfig.json` porte tout,
  il reste le rapport par dossier et la garde contre une régression. Il lance `tsc` avec le Node
  courant plutôt que par `npx` sous `shell: true`, que Node 22 signalait (DEP0190).
- `plan.html` : 450 063 → 450 058 octets. 535 tests, inchangés.

Ce que le typage a révélé sans le corriger — des invariants tenus par `normalizeObjects` ou
`ensureConstruction` et non par les types, une validation d'import annoncée mais absente — est
consigné dans `MD/MIGRATION-JOURNAL.md`, « Phase 7 — l'échelle gravie ».


## [1.1.0-alpha.14] — 2026-09-09

**Phase 4 : la fermeture `boot()` quitte `legacy.ts`, et `legacy.ts` disparaît.**
Le dernier fichier sous `@ts-nocheck` du dépôt est supprimé. Les ~900 lignes de câblage qu’il
portait vivent désormais dans `src/app/boot.ts`, la racine de composition (spec §6), vérifiée par
le compilateur comme le reste. Aucun des six artefacts exportés ne bouge.

### Corrigé

- **L'import SVG ne fonctionnait plus.** Le contexte passé à `importSVGString` citait
  `filtrerSansParcelle` en abrégé d’objet, alors que la fonction avait quitté ce fichier pour
  `io/exportProjet.ts` en phase 2 **sans que l’import soit ajouté**. Construire cet objet levait
  donc un `ReferenceError` avant même l’appel, et le `try/catch` de `app/ecouteurs/fichiers.ts` le
  changeait en bandeau « Erreur import SVG » — un geste mort en silence pendant plusieurs paliers,
  qu’aucun golden ne pouvait voir (ils n’exercent que les **exports**).

  Le typage a fait tomber la cause et le remède ensemble : `importSVGString` ne lit **aucune** des
  quatre propriétés que ce littéral lui passait en trop (`markDirty`, `fitToObject`,
  `filtrerSansParcelle`, `trouverParcelleCloture`). Les retirer répare le geste sans rien ajouter.
  Vérifié en direct sur les trois versions avec le même fichier : le témoin figé 1.0.0 et le build
  corrigé donnent le même résultat exact (14 → 15 objets, 288 → 566 textes, aucune erreur) ; le
  build d'avant correction n'importe rien et affiche le bandeau.

### Interne

- `src/legacy.ts` **supprimé**. `src/app/boot.ts` le remplace : mêmes instructions, même ordre
  d'exécution, portée désormais vérifiée. `main.ts` charge `./app/boot.js`.
- **280 symboles morts retirés** — 272 spécificateurs d’import que plus rien ne lisait (dont 32
  lignes d’import devenues vides) et 8 déclarations locales (`cancelPick`, `updateUndoBtn`,
  `selectorDiv`, `bringToFront`, `measurePointCoord`, `IMPORT_JSON_TAILLE_MAX`,
  `rebuildTerrasseSubTabs`, `updateStagePlacement`), plus `worldFromEvent`, dont le seul lecteur
  était une propriété morte. ESLint ne voyait rien de tout cela : sa configuration excluait
  `src/legacy.ts`. Le fichier n’étant plus exclu, la couche de câblage est lintée comme le reste.
- Cinq autres littéraux de contexte allégés des propriétés que leur destinataire ne lit pas
  (`brancherPointeur`, `construireScene3D`, et les trois appels de la visionneuse GLB).
- Deux passages nommés une seule fois, au lieu d’un `as` dispersé : `normaliserEnObjetsDuPlan`
  (« ce qui arrive de dehors » → objets du plan, ce que la signature de `creerEtat` réclame) et
  `aPoints` / `aDessiner` (les formes que la géométrie et le rendu exigent complètes).
- `ProjetResume` (io/api.ts) et `ProjetMeta` (ui/projectBar.ts) décrivaient la même ligne de
  serveur et **avaient divergé** (`name` obligatoire d’un côté, facultatif de l’autre). Une seule
  description reste, là où la donnée arrive ; `ProjetServeur` dit maintenant ce que le serveur rend.
- `serializeMeasures` déclarait rendre des `ObjetSerialise[]` : elle rend des cotes. Le type
  `MesureSerialisee` le dit (alias de type et non interface, pour rester assignable à `Mesure`).
- `renderTerrasseSelector` demandait les neuf fonctions de `ContexteTerrassePanels` ; elle en lit
  deux. Sa signature le dit désormais (`ContexteSelecteurTerrasse`).
- Le test d’échafaudage change d’objet : il vérifiait que `legacy.ts` commençait par `@ts-nocheck`,
  il vérifie maintenant que `legacy.ts` n'existe plus **et** qu'aucun fichier de `src/` ne porte la
  directive. 535 tests (534 + celui-là).

## [1.1.0-alpha.13] — 2026-08-30

**Phase 7, dixième et dernier palier du barreau 2 : `ui/` est typé de bout en bout.**
371 → 0 erreurs sous `noImplicitAny` ; total du dépôt 387 → **0**. `--noImplicitAny` est désormais
propre sur **l'intégralité de `src/`** — quatorze dossiers sur quatorze protégés par le cliquet.

### Interne

- Les dix fichiers de `ui/` typés : `panelTabs.ts`, `cloture.ts`, `texturePicker.ts`,
  `mesurePanel.ts`, `selector.ts`, `attrPanel.ts`, `tables.ts`, `projectBar.ts`, `terrassePanels.ts`
  et `cadastreDialog.ts` (104 erreurs, le plus gros fichier du palier).
- Une limite notée depuis le palier `three/` est refermée : `ObjetPlan` déclare maintenant
  `textureVerticale`, `textureHorizontale`, `textureArbre` et `clotureTexture` comme
  `TextureAppliquee | null` plutôt que de les laisser passer par l'index signature en `unknown`.
  `TextureAppliquee` vit dans `model/types.ts`, pas dans `ui/texturePicker.ts` qui la produit — même
  raison que `Mesure` : c'est une donnée du projet.
- Le zonage PLU (`ObjetPlan.plu`) quitte `unknown` pour `ZonagePlu | null`. La famille de types
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`) déménage de `geo/apiIgn.ts` vers `model/types.ts` pour la même raison — `bdtopo`
  reste `unknown`, sa forme variant trop d'une couche IGN à l'autre (spec §12).
- `ContexteImportCadastre`, exporté depuis `projectBar.ts` et importé par `cadastreDialog.ts` :
  troisième cas de ce palier où un `ctx` partagé entre deux fichiers a été nommé une fois plutôt que
  redéfini deux fois.
- Une leçon d'outillage, pas de code : les méthodes en sucre syntaxique d'un littéral d'objet
  (`{ foo() { return this.x; } }`) ne reçoivent **pas** le type de `this` depuis l'annotation de la
  variable (`const o: T = {...}`) sous `noImplicitAny` seul — `noImplicitThis` (famille `strict`,
  éteint ici) est ce qui active cette inférence. Il faut un paramètre `this: T` explicite sur chaque
  méthode. Découvert sur les trois méthodes de l'état du dialogue cadastral
  (`EtatImportCadastre.parcellesPropriete`/`estPropriete`/`voisinesRetenues`).
- Vérifié en plus des empreintes habituelles — et c'est le contrôle qui compte ici, les six
  empreintes n'ouvrant jamais le réseau : l'import cadastral complet (adresse → parcelle →
  voisines → création) rejoué en direct rend le même projet (4 objets, mêmes hauteurs, même IDU,
  même zonage PLU) qu'avant le typage du palier.

### Dette soldée (même jour, sans nouveau build)

`tests/` portait 22 erreurs `noImplicitAny` restées hors du périmètre du cliquet (qui ne gate que
`src/`) — des littéraux d'objet passés à des fonctions génériques (`normalizeObjects<T>`,
`creerCreation(etat: EtatCreation, ...)`) sans annotation, où `pts: []` ou `terrasseLieeKey: null`
s'inféraient en `any` faute de type contextuel. Corrigées dans `tests/unit/{engine/moteur,
export/resume, interaction/drag, model/creation, model/normalisation}.test.ts` en typant
explicitement les variables intermédiaires (`const src: ObjetBrut[] = [...]`) plutôt que les
littéraux inline, qui n'en avaient pas besoin. Aucun fichier de `src/` touché, donc aucun impact sur
`dist/index.html` — pas de nouveau build, pas de nouvelle version.

Le cliquet (`scripts/cliquet.mjs`) protège désormais `tests/` comme un bloc unique, en plus des
quatorze dossiers de `src/` : **`--noImplicitAny` est à zéro sur l'ensemble du dépôt**, tests
compris.

## [1.1.0-alpha.12] — 2026-08-30

**Phase 7, neuvième palier : `export/` est typé de bout en bout.** 122 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 510 → **387**. Treize dossiers sur quatorze sont tenus par le
cliquet. Seul `ui/` (371) reste — volontairement en dernier, la couche la plus grosse et la moins
testée.

### Interne

- `export/pdf/writer.ts`, `export/resume.ts`, `export/pdfPlan.ts`, `export/svgPlan.ts` et
  `export/dossierPdf.ts` (76 erreurs à lui seul, le plus gros fichier du palier) typés.
- `ObjetASurface` dans `resume.ts` : `surfaceDe` ne lit que `type`, `pts`, `r`, `width` — les tests
  l'appellent sur des objets partiels, ce qui a guidé le type plutôt que d'imposer `ObjetPlan`
  complet.
- `Projeteur`, `MetaDossier`, `OptionsCotation` et `OptionsAngles` dans `dossierPdf.ts` : les
  fonctions de cotation (`cotationPolygone`, `anglesPolygone`) ne dépendent d'aucune forme du plan,
  seulement d'un tableau de points et d'une fonction de projection — exactement ce que les types
  disent maintenant.
- `MetaSvg` dans `svgPlan.ts`, exportée aux côtés de `MetaPdf` (déjà posée au palier `render/`) :
  même paire `appVersion`/`schemaVersion`, deux fois parce que les deux producteurs vivent dans des
  fichiers séparés.
- Vérifié en plus des empreintes habituelles : les deux PDF (`plan.pdf`, `dossier.pdf`) gardent
  exactement leurs comptes de textes, d'objets et de pages (143/14/2 et 106/15/3) après le typage —
  la mise en page n'a pas bougé d'un point.

## [1.1.0-alpha.11] — 2026-08-30

**Phase 7, huitième palier : `three/` est typé de bout en bout**, et l'écart entre la spec et le
code sur les typages Three.js est refermé. 128 → 0 erreurs sous `noImplicitAny` ; total du dépôt
638 → **510**. Douze dossiers sur quatorze sont tenus par le cliquet ; restent `ui` (372) et
`export` (122).

### Interne

- **`@types/three@0.128.0` en devDependency.** La spec §8.3 prescrivait cette option A depuis le
  début ; le code faisait l'inverse (`declare const THREE: any`), avec un commentaire qui
  argumentait contre une décision déjà prise. C'est la dépendance de **type** sans dépendance de
  code : la bibliothèque continue d'arriver du CDN à l'ouverture de la Vue 3D, aucun `import` de
  valeur ne pointe vers `three`, et le build ne contient toujours aucune trace du paquet — vérifié
  sur les octets produits.
- `SceneTrois` n'est plus `Record<string, any>` mais deux formes réelles : `SceneVue3d` (qui cadre
  un plan : `extent`, `cen`) et `SceneGlb` (qui cadre un modèle déjà produit : `centre`, `rayon`),
  au-dessus d'un `SceneTroisBase` de huit champs — exactement ce que les deux vues partagent.
- Trois gardes de type dans `three/gardes.ts` (`estMesh`, `estLumiere`, `estTexture`), qui reprennent
  **le test déjà écrit** (`o.isMesh`, `o.isLight`, `v.isTexture`) et le rendent au vérificateur.
  Three.js répond à ces questions par des drapeaux plutôt que par `instanceof`, et c'est volontaire
  de sa part : deux copies de la bibliothèque dans une même page ont des constructeurs différents.
- Deux types qui mentaient, corrigés : `reglerSoleil(lum: SceneTrois, …)` demandait une scène
  entière alors que son propre commentaire décrivait cinq champs (`EclairageSoleil` désormais), et
  l'appelant de la Vue 3D lui construit un objet à quatre champs sans jamais passer de scène ; et
  `attendreTexturesPretes` déclarait `new Set<SceneTrois>()` — un ensemble de *scènes* — pour y
  ranger des textures.
- Un homonyme évité de justesse : `CameraConservee`, écrit d'abord dans `app/ecouteurs/visionneuse.ts`,
  vit dans `three/glbViewer.ts` avec les autres types de la visionneuse.
- Trouvé sans le corriger, parce que le corriger changerait le rendu : `if(THREE.SRGBColorSpace)
  tex.colorSpace = …` dans `three/scene.ts` **ne fait rien** — ces deux noms n'existent qu'à partir
  de la r152, et le CDN sert la r128. Le garde-fou est tourné vers l'avenir ; il s'allumera de
  lui-même à une montée de version. Le typage l'a rendu visible, il est maintenant documenté sur
  place.
- Vérifié en plus des empreintes — et c'est ce qui compte ici, car aucune des six n'ouvre la 3D :
  l'export GLB refait en direct rend les **mêmes compteurs structurels** qu'au relevé d'origine
  (glTF 2.0, 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène), et la visionneuse
  supporte bascule du fond et filaire sans fuite de canevas ni erreur.

## [1.1.0-alpha.10] — 2026-08-30

**Phase 7, septième palier : `geo/` est typé de bout en bout.** 127 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 790 → **638** (le typage d'`apiIgn.ts` a aussi éteint 25 erreurs
dans `ui/`, qui lisait ses retours). Onze dossiers sont maintenant tenus par le cliquet.

### Interne

- `geo/apiIgn.ts`, `geo/cadastreObjets.ts` et `geo/soleil.ts` typés. GeoJSON décrit une fois pour
  toutes (`Anneau`, `GeometrieGeoJSON`, `FeatureGeoJSON<P>`, `CollectionGeoJSON<P>`,
  `EmpriseGeoJSON`), plus les types du domaine : `ParcelleCadastrale`, `ParcellePrincipale`,
  `ObjetBdTopo`, `AdresseRecherchee`, `ProjecteurCadastre`, `ImportCadastral`, et la famille PLU
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`).
- Un paramètre mort retiré : `formeCommune(pts, c)` ne lisait jamais `c`. Trouvé en écrivant la
  signature, vérifié non lu dans le corps, ôté ; les deux appels passaient une parcelle qui ne
  servait à rien (spec §10.3).
- Vérifié en plus des empreintes habituelles — et c'est la vérification qui compte ici, car les
  goldens ne font **aucun** appel réseau : l'import cadastral « Place de la Mairie 35000 Rennes »
  rejoué en direct sur le témoin figé 1.0.0 et sur le build typé, à quelques minutes d'intervalle,
  rend le **même projet au bit près** (25 232 octets normalisés, même SHA-256). Toute la chaîne y
  passe : BAN, API Carto cadastre, BD TOPO en WFS, GPU/PLU.

## [1.1.0-alpha.9] — 2026-08-30

**Phase 7, sixième palier : `app/` est typé de bout en bout.** 19 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 809 → **790**.

### Interne

- Cinq fichiers de `app/ecouteurs/` (affichage, clôture, divers, visionneuse, Vue 3D) et
  `app/modes.ts` (le pilotage des quatre vues) typés.
- `ObjetPlan` gagne `clotureActive`, `clotureHauteur`, `clotureCouleur`, `clotureTexture` (ce dernier
  reste `unknown` : sa forme réelle appartient au sélecteur de texture, non encore typé, palier
  `ui/`).
- Vérifié en plus des empreintes habituelles : le pilotage des quatre vues (Plan, Terrasse, Vue 3D,
  visionneuse) et la bascule de la grille, en séquence, sans erreur.

## [1.1.0-alpha.8] — 2026-08-30

**Phase 7, cinquième palier : `interaction/` est typé de bout en bout.** 53 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 862 → **809**.

### Interne

- `interaction/outilAlignement.ts` et `interaction/pointeur.ts` (le câblage des événements de
  pointeur — sélection, glisser, double-tap, molette, pincement, pan à trois doigts) typés.
- Deux champs `startScreen` (posés sur les gestes `circleMove`/`shapeMove`, jamais lus nulle part —
  seul le pan lit le sien) retirés : trouvés en écrivant le type du geste, vérifiés morts, ôtés.
- Vérifié en plus des empreintes habituelles : un glisser de sommet simulé par de vrais
  `PointerEvent` déplace le sommet visé exactement du delta demandé et laisse les cinq autres
  inchangés ; un zoom molette redessine la scène.

## [1.1.0-alpha.7] — 2026-08-30

**Phase 7, quatrième palier : `io/` est typé de bout en bout.** 57 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 919 → **862**.

### Corrigé

- `Atelier.restoreState` (et son équivalent local dans `io/projet.ts`) annonçait `ObjetPlan[]` alors
  que `core/historique.ts` passe toujours ces objets par `normalizeObjects` en les restaurant — un
  import de fichier ou un cadastre nouvellement créé n'a jamais cette forme complète. Le paramètre
  attend désormais `ObjetBrut[]`, ce que le type garantit réellement ; un `ObjetPlan[]` déjà complet
  (le cas de l'annulation) le satisfait toujours.

### Interne

- `ObjetPlan` gagne `affichage` (masquage du voisinage et de la grille, rattachés à la parcelle comme
  le fond orthophoto).
- `io/validation.ts` type la porte d'entrée d'un fichier de projet (`ProjetValide`), en passant par un
  type `ProjetBrut` intermédiaire pour la même raison qu'ailleurs dans ce module : rien n'est garanti
  avant vérification champ par champ.
- `io/serialisation.ts`, `io/exportProjet.ts`, `io/importSvg.ts`, `io/projet.ts` typés ; réutilisent
  `ObjetSerialise` (model/creation.ts) pour les données post-liste-blanche.
- Vérifié en plus des empreintes habituelles : un cycle export JSON → import (remplacement) sur le jeu
  de démonstration restaure exactement les 35 objets et 11 mesures, relevé de santé identique.

## [1.1.0-alpha.6] — 2026-08-30

**Phase 7, troisième palier : `render/` est typé de bout en bout.** 33 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 952 → **919**.

### Corrigé

- `render/objects.ts` déclarait sa propre interface `ObjetPlan` — **quatrième** type local homonyme
  du modèle trouvé en phase 7, après `ObjetPlan` dans `render/measures.ts`, `EtatPlan` dans
  `app/atelier.ts` et `ObjetParasol` dans `render/parasolOverlay.ts`. Renommée `ObjetRendu` et dérivée
  du modèle (`ObjetPlan & Required<Pick<...>>`) plutôt que réécrite.
- Un test de `model/normalisation.ts` utilisait `cadastre`/`ortho` comme noms de champs arbitraires
  pour vérifier le clonage générique des métadonnées. Le typage de ces deux champs (ci-dessous) a
  rendu ses valeurs de test invalides ; corrigé en leur donnant leur forme réelle plutôt qu'inventée.

### Interne

- `ObjetPlan` gagne `construction`, `cadastre` (partiel — seuls les deux champs lus par le fond
  orthophoto), `ortho`, et les champs de parasol/lieu déjà posés au palier précédent.
- `render/ortho.ts` type le fond WMTS de bout en bout : `ContexteOrtho`, `TuileOrtho`,
  `ConfigOrthoComplete`, `ReferenceGeo`, `ResultatChargementOrtho`.
- `render/pipeline.ts` (`ContexteRendu`) et `render/terrasseCouches.ts` typés ; `Segment`/`Appui`
  (engine/structure.ts) réutilisés pour le calque des couches d'une terrasse.
- Vérifié en plus des empreintes habituelles : le fond orthophoto, activé à la main (le jeu de
  démonstration ne l'active pas), pose les quatre mêmes tuiles — mêmes coordonnées au dernier chiffre
  décimal — que sur le témoin figé.

## [1.1.0-alpha.5] — 2026-08-30

**Phase 7, deuxième palier : `engine/` est typé de bout en bout.** 315 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 1 308 → **952**.

### Corrigé

- **Une garde que j'avais introduite au palier précédent aurait perdu des saisies.** `cadenceDe`
  filtrait `c.cadences` quand ce n'était pas un objet « propre » — or les projets enregistrés portent
  `[]` là où le défaut pose `{}` (c'est le cas du jeu de démonstration), et écrire
  `cadences['piquetage'] = 7` sur un tableau y pose bel et bien une propriété relisible. Le filtre
  aurait fait disparaître une cadence saisie, sans erreur ni trace. Remplacé par
  `model/dictionnaire.ts`, qui indexe exactement comme avant.
- `render/parasolOverlay.ts` déclarait sa propre interface `ObjetParasol` de quatre champs, coupée du
  modèle — troisième type local homonyme trouvé par le typage, après `ObjetPlan` dans
  `render/measures.ts`.

### Interne

- `Construction` (53 champs), `LigneBom`, `VueEnregistree`, `Mesure`, `Segment`, `PrixParLongueur`
  rejoignent `model/types.ts` ; les champs de parasol et le lieu deviennent explicites sur
  `ObjetPlan`. C'est le levier qui a fait tomber les 315 erreurs.
- `engine/` gagne ses types de calcul : `Structure`, `CouchesTerrasse`, `Debit`, `GroupeDebit`,
  `Appui`, `ZoneEquipement`, `CandidatStructure`, `EchantillonSoleil`, `GeometrieOmbre`,
  `CarteOmbre`, `PosteChantier`. Les deux derniers **dérivés** de leur fonction plutôt que réécrits.
- `computeChantier` déclare ses quantités en `Record<PosteChantier, number>` : ajouter une cadence
  sans sa quantité devient une erreur de compilation au lieu d'un poste compté à zéro en silence.
- Quatre exigences nommées plutôt que l'objet entier — `TerrasseEtudiee`, `PorteurDeConstruction`,
  `ObjetMesurable`, `ObjetCote` : ces fonctions ne lisent ni clef ni nom, et l'optimiseur évalue déjà
  des configurations sur un objet fabriqué pour l'occasion.
- 19 affectations `input.value = <nombre>` deviennent explicites (`String(...)`). Elles reposaient sur
  la coercition implicite ; le comportement est identique, la valeur des 31 champs du panneau
  Terrasse a été comparée au témoin figé.
- `structureVide()` remplace l'ossature vide que les panneaux se fabriquaient à la main.

## [1.1.0-alpha.4] — 2026-08-29

**Phase 7 — le cliquet de rigueur.** Premier palier de l'échelle du tsconfig : `shell`, `geometry` et
`model` sont à zéro erreur sous `noImplicitAny`, et ne peuvent plus régresser.

### Corrigé

- **Le numéro de version avait cessé de suivre ce journal.** `alpha.2` et `alpha.3` y étaient
  annoncés alors qu'`APP_VERSION` et `package.json` étaient restés à `alpha.1` : ces deux versions
  n'ont jamais été estampillées dans un artefact livré. Le numéro repart d'`alpha.4`, et les six
  empreintes sont recapturées — après avoir prouvé, ligne à ligne, que **seule** la ligne de version
  bouge (EMPREINTES.md, « recapture de rattrapage »).
- `geometry/rings.ts` annonçait `{ a, b }` là où il manipulait des paires `[p0, p1]`. Le type était
  faux depuis son écriture ; le code, lui, était cohérent. Aucun comportement modifié.
- `render/measures.ts` déclarait sa propre interface **nommée `ObjetPlan`**, différente de celle du
  modèle. Renommée `ObjetCote` : ce n'est pas un type de donnée mais une exigence de quatre champs.

### Interne

- `scripts/cliquet.mjs` (`npm run cliquet`) : lance `tsc` avec les drapeaux du barreau visé et échoue
  si une erreur vient d'un dossier déclaré propre. `tsconfig.json` ne sait pas le faire — restreindre
  `include` ne restreint rien, les fichiers importés entrent quand même dans le programme.
- Types partagés consolidés : `Mesure` passe de `render/` à `model/types.ts` (c'est une donnée du
  projet, et `core/state.ts` en tient la liste) ; `EtatApp.objects` et `.measures` cessent d'être des
  `Record<string, unknown>[]` ; `EtatPlan` cesse d'être un `any` et désigne `EtatApp` ; `ObjetBrut`
  nomme un objet **avant** normalisation.
- `normalizeObjects` devient générique — `<T> ⟶ (T & ObjetBrut)[]` — ce qui est littéralement son
  travail : elle n'enlève rien, elle ajoute.
- `model/creation.ts` prend un `EtatCreation` de cinq champs au lieu de l'état entier : `model/` n'a
  pas à connaître la pile d'annulation ni la transformation de la scène.
- 1 375 → **1 308** erreurs au barreau 2. L'index `[autreChamp: string]: unknown` d'`ObjetPlan`
  n'est **pas** retiré : c'est un chantier orthogonal à `noImplicitAny` (spec §9.2.4).

## [1.1.0-alpha.3] — 2026-08-29

Les quatre dernières fonctions de logique sortent de `legacy.ts`.

### Interne

- `ui/panelTabs.ts`, `interaction/outilAlignement.ts` (l'alignement rejoint le côté de référence
  qu'il lisait déjà), `io/exportProjet.ts`, `three/exportGlb.ts`.
- `shell/download.ts` gagne `telechargerBinaire` : le même détour ancre-invisible que pour le texte,
  qui était recopié à la main dans l'export GLB.
- `legacy.ts` : 1 625 → 1 500 lignes. Plus aucune fonction de plus de quinze lignes hors `boot()`.

## [1.1.0-alpha.2] — 2026-08-29

Le résumé et l'ordre d'empilement sortent de `legacy.ts` ; les couches sont rangées et la règle de
dépendance devient vérifiable.

### Interne

- `export/resume.ts` (**18 tests** — un des six artefacts de référence, jusqu'ici sans aucun test),
  `render/empilement.ts` (**14 tests**), `geometry/angles.ts`.
- **`shell/`** : `dialogs`, `dom` et `download` n'étaient ni des panneaux ni du pur. Ils quittent
  `ui/` et `util/`. `geometry/vue.ts` (transformation monde ↔ écran) quitte `render/`.
- `tests/unit/architecture.test.ts` vérifie désormais la règle de dépendance, la pureté de
  `geometry`/`model`/`util`, et qu'aucun module n'importe `legacy.ts`. Il a trouvé un quatrième
  fichier mal rangé dès sa première exécution.
- 52 lignes de commentaires orphelins retirées — ils décrivaient du code parti ailleurs.

## [1.1.0-alpha.1] — 2026-08-29

**La version livrée n'est plus le fichier mono-page d'origine : c'est le build.** `plan.html` passe
de 779 140 à 450 713 octets. Le témoin figé reste sous `legacy/plan_interactif.html`.

### Modifié

- `APP_VERSION` : `1.0.0` → `1.1.0-alpha.1`, `BUILD_AT` → `2026-08-29`.
- **Les six empreintes de référence changent**, et c'est voulu : la version est estampillée dans les
  six artefacts exportés. Prouvé avant recapture — à numéro inchangé le build reproduisait les
  anciennes empreintes au bit près, et après changement une seule ligne diffère par artefact texte
  (l'en-tête du résumé, `data-app-version` du SVG, la signature du DXF, `meta.appVersion` du JSON).
  Les deux PDF ont été comparés sur leur contenu : nombres de textes, d'objets et de pages
  inchangés. Voir `tests/fixtures/golden/EMPREINTES.md`, section « La rupture ».
- `export-pdf.test.ts` acceptait `[\d.]+` comme numéro de version : il accepte désormais un SemVer
  complet, pré-publication comprise.

### Non modifié

- **Le schéma du projet reste à 1.** Un fichier enregistré par la 1.0.0 s'ouvre dans cette version,
  et réciproquement. La rupture porte sur l'artefact livré, pas sur les données.

### Ce que cette version n'est pas

Ce n'est pas la `1.1.0` : son critère de sortie exige `legacy.ts` supprimé et la phase 7 terminée.

## [1.0.1-alpha.46] — 2026-08-29

Les trois points laissés en suspens sont soldés.

### Supprimé

- `muter()`, dans l'historique : personne ne l'appelait. Du code mort qui se présente comme le
  chemin sûr est pire que pas de chemin du tout.

### Interne

- L'horloge des clés d'objets devient injectable (`ContexteCreation.horloge`, `Date.now` par
  défaut) — la dernière source de non-déterminisme que `EMPREINTES.md` signalait depuis la phase 0.
  Un scénario qui crée des objets peut désormais être comparé à lui-même.
- `dupliquer()` refaisait le calcul de clé à la main au lieu d'appeler `cle()` : une seule écriture
  de la règle désormais.
- **5 tests**, 490 au total.

### Vérifié plutôt que corrigé

- `altitude: 0` retombe sur 1,60 m. Ce n'est pas une valeur perdue : le panneau d'attributs plafonne
  l'altitude par le bas à 0,10 m, donc `0` ne peut venir que d'un fichier écrit à la main.

## [1.0.1-alpha.45] — 2026-08-29

Les trois mécanismes enchevêtrés du pilotage des vues sont démêlés. Aucun comportement ne change.

### Interne

- `vueCourante` devient la seule vérité sur ce qui est affiché, `appliquerVue()` le seul endroit qui
  touche aux boutons et aux zones, et `etat.appMode` en est dérivé. Plus aucune fonction ne corrige
  après coup l'apparence laissée par une autre.
- La visionneuse GLB devient la quatrième vue au lieu d'un panneau qui pilotait lui-même les boutons.
- La place d'origine du plan est marquée par un nœud-ancre, au lieu d'une référence de frère capturée
  au premier déplacement.
- Vérifié contre le témoin sur dix états, dont le `className` complet des boutons et le rang exact du
  plan parmi ses frères. `legacy.ts` : 1 789 → 1 769 lignes.

## [1.0.1-alpha.44] — 2026-08-29

Le pilotage des modes sort de `legacy.ts` et ouvre le dossier `app/`.

### Interne

- `app/modes.ts` : modes Plan et Terrasse, sous-onglets, déménagement du plan entre ses trois
  emplacements. La « Vue 3D » n'est pas un troisième mode mais le mode Terrasse sur son sous-onglet
  `3d` — ce qui explique les corrections d'apparence à la main après chaque bascule.
- L'interrogation du PLU rejoint `ui/projectBar.ts`, à côté du panneau qu'elle remplit.
- Vérifié contre le témoin sur neuf états de l'interface, dont le parent réel du plan dans le DOM.
- `legacy.ts` : 1 947 → 1 789 lignes, soit **87 %** du fichier d'origine sorti, en 93 modules.

## [1.0.1-alpha.43] — 2026-08-29

### Interne

- La visionneuse GLB rejoint `three/glbViewer.ts`, le sélecteur de terrasse `ui/terrassePanels.ts`.
  Sans aucune terrasse, la Vue 3D reste accessible ; les autres sous-onglets restent derrière
  l'accueil. `legacy.ts` : 2 023 → 1 947 lignes, soit 86 % du fichier d'origine sorti.

## [1.0.1-alpha.42] — 2026-08-29

### Interne

- `render/terrasseCouches.ts` : chaque couche a sa case, et non un onglet exclusif — d'où les traits
  qui maigrissent dès qu'il y en a plus d'une.
- `ui/cloture.ts` : deux passes pour trouver la parcelle, parce que les parcelles voisines importées
  sont elles aussi `fonction === 'terrain'`.

## [1.0.1-alpha.41] — 2026-08-29

### Interne

- `three/soleilVue3d.ts` et `three/chargeurs.ts`. L'état du soleil rejoint `etat3d.ts`, dans les
  mêmes champs que celui de la visionneuse.

### Corrigé avant publication

- Un même drapeau allait servir à l'exporteur glTF et au lecteur, qui sont deux scripts distincts.

## [1.0.1-alpha.40] — 2026-08-29

### Interne

- `three/navigation.ts` : zoom, mode du glisser, hauteur des yeux, points de vue, plein page. La
  conversion d'un point de vue vers le repère de la scène était écrite deux fois ; **10 tests**.

### Corrigé avant publication

- Le fichier de tests d'`alpha.39` ne passait pas `tsc` : le typecheck avait été lancé avant son
  écriture, pas après.

## [1.0.1-alpha.39] — 2026-08-29

La normalisation, la création d'objets et les contraintes de parasol sortent de `legacy.ts`.

### Interne

- `model/normalisation.ts`, `model/creation.ts` (fabriques pures séparées de la pose dans le plan),
  et la contrainte « pied en bordure » dans `engine/parasol.ts` — c'est le **pied** qu'on projette
  sur le pourtour, pas le centre de la toile.
- **44 tests**, 476 au total. `legacy.ts` : 2 584 → 2 354 lignes.

## [1.0.1-alpha.38] — 2026-08-29

La Vue 3D et la visionneuse GLB partagent enfin un seul soleil.

### Interne

- `three/lumiere.ts` : `reglerSoleil()` porte le calcul qui était écrit deux fois — trente lignes de
  trigonométrie et trois règles d'éclairage. La seule différence réelle entre les deux vues devient
  un paramètre : la Vue 3D est centrée sur l'origine, la visionneuse sur son modèle.
- Vérifié contre le témoin figé en interceptant ce qui est réellement passé à Three (position du
  soleil, facteur jour) : neuf réglages, deux vues, identiques au dernier chiffre.
- `legacy.ts` : 2 606 → 2 584 lignes.

## [1.0.1-alpha.37] — 2026-08-29

Le lieu et le curseur « semaine » sortent, avec leurs doublons.

### Interne

- `util/semaine.ts` : le décalage d'un cran était dupliqué dans les deux vues 3D. Il est **relatif**
  à la date courante (sept jours par cran) et ne suit **pas** la numérotation ISO.
- `model/lieu.ts` : le lieu est rattaché à la parcelle, donc enregistré avec le projet. Une longitude
  de 0 est une position, pas une absence.
- **20 tests**, 432 au total. `legacy.ts` : 2 634 → 2 606 lignes.

## [1.0.1-alpha.36] — 2026-08-29

Les hauteurs sortent de `legacy.ts`, en une seule définition.

### Interne

- `engine/hauteurs.ts` : hauteur d'appui, hauteur finie, élévation — lues par le plan de coupe, la
  3D, le dossier PDF et le chiffrage. Une vis de fondation est enterrée, seul son dépassement de tête
  soulève ; un plot est posé, toute sa hauteur compte.
- **18 tests**, 412 au total. Hauteur finie identique au témoin : 27 cm sur les deux terrasses de la
  démonstration. `legacy.ts` : 2 661 → 2 634 lignes.

## [1.0.1-alpha.35] — 2026-08-29

Le client `api.php` sort de `legacy.ts`.

### Interne

- `io/api.ts` : la règle qui portait tout est maintenant explicite — on ne retombe sur le jeu de
  démonstration que si **ce navigateur n'a jamais ouvert aucun projet**. Dès qu'un identifiant est
  connu, un échec est remonté : substituer la démonstration faisait croire qu'un vrai projet avait
  été perdu.
- **14 tests** jsdom, 394 au total. `legacy.ts` : 2 727 → 2 661 lignes.

## [1.0.1-alpha.34] — 2026-08-29

L'historique sort **tel quel**, pour être réécrit ensuite.

### Interne

- `core/historique.ts` : le code n'a pas bougé d'une ligne ; l'en-tête dit en sept points ce qu'une
  réécriture doit savoir. **18 tests de caractérisation**, dont un qui vérifie une *absence* : il
  n'existe pas de rétablissement, et ce test doit échouer le jour où il arrivera.
- `legacy.ts` : 2 914 → 2 727 lignes.

## [1.0.1-alpha.33] — 2026-08-29

### Interne

- `render/pipeline.ts` : l'orchestration du dessin sort de `legacy.ts`.

## [1.0.1-alpha.32] — 2026-08-29

### Interne

- Le débit de bois rejoint les autres tables dans `ui/tables.ts`.

## [1.0.1-alpha.31] — 2026-08-29

La validation d'un fichier de projet sort de `legacy.ts`, et gagne les tests qu'elle n'avait pas.

### Interne

- `io/validation.ts` : les trois refus (schéma trop récent, coordonnées au-delà de 100 km, aucun
  objet exploitable) sont documentés pour ce qu'ils protègent. **19 tests**, 362 au total.
- `legacy.ts` : 3 119 → 3 086 lignes.

## [1.0.1-alpha.30] — 2026-08-29

Les tables du dossier et du chiffrage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/tables.ts` : liste des terrasses du dossier, métré, débit de bois. Aucune ne calcule.
- `legacy.ts` : 3 253 → 3 119 lignes.

### Corrigé avant publication

- La table du métré est restée vide un moment : une fabrique de contexte n'avait pas été insérée là
  où je croyais. Le contrôle de santé ne l'a pas vu — il a fallu comparer au témoin (7 et 18 lignes
  contre 0 et 0).

## [1.0.1-alpha.29] — 2026-08-29

Le chargement d'un projet importé sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/projet.ts`. La séquence compte : remplacer les données, reconstruire les vues, **puis**
  restaurer les réglages rangés sur la parcelle.
- `legacy.ts` : 3 345 → 3 253 lignes.

## [1.0.1-alpha.28] — 2026-08-29

Les événements de pointeur sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/pointeur.ts` (289 lignes) : sélection, glisser, double-clic, molette, pincement,
  déplacement à trois doigts. Deux différences doigt/souris y sont documentées.
- Vérifié contre le témoin figé, à froid : sommet tiré de (+12,7095 ; −8,1172) m, molette,
  insertion de sommet.
- `legacy.ts` : 3 599 → 3 345 lignes.

## [1.0.1-alpha.27] — 2026-08-29

Le fond orthophoto sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `render/ortho.ts` : tuiles WMTS de l'IGN, cache, calage sur le repère du plan, réglages. Vérifié
  sur des tuiles réelles — 4 tuiles, opacité du terrain 1 → 0,15 puis retour.
- `legacy.ts` : 3 816 → 3 599 lignes.

## [1.0.1-alpha.26] — 2026-08-29

L'outil de cotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/outilMesure.ts` : le brouillon d'une cote en cours de pose, partagé par le
  `pointerdown` du plan, le panneau et le rendu. Il ne vit pas dans `etat` : rien ne s'enregistre
  tant que la cote n'est pas validée.
- `ui/mesurePanel.ts` : son affichage.
- `legacy.ts` : 3 931 → 3 816 lignes.

## [1.0.1-alpha.25] — 2026-08-29

Le sélecteur d'objets et la table d'affichage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/selector.ts`. Le filtre par famille descend avec le sélecteur : ce n'est ni une donnée du plan
  ni une préférence enregistrée.
- `legacy.ts` : 4 098 → 3 931 lignes.

## [1.0.1-alpha.24] — 2026-08-29

La visionneuse GLB et le chargement de Three.js sortent de `legacy.ts`.

### Corrigé avant publication

- `SOLEIL_ELEV_PLANCHER`, partagée entre la Vue 3D et la visionneuse, était partie avec cette
  dernière : la construction de la scène 3D échouait **à mi-course** — 46 nœuds au lieu de 203, sans
  erreur visible. Elle a désormais son module, `three/lumiere.ts`.
- Un renommage global avait atteint un identifiant d'élément dans une chaîne
  (`getElementById('glbViewerFilaire')`), ce qui cassait le boot.

### Interne

- `three/glbViewer.ts`, `three/lumiere.ts`, et l'état de la visionneuse dans `three/etat3d.ts`.
- `legacy.ts` : 4 365 → 4 098 lignes.

## [1.0.1-alpha.23] — 2026-08-29

La sérialisation et l'import SVG sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/serialisation.ts` : `serializeObjects` est une **liste blanche** — un champ qui n'y est pas
  nommé disparaît au premier enregistrement.
- `io/importSvg.ts` : le pendant exact de `export/svgPlan.ts`.
- `legacy.ts` : 4 576 → 4 365 lignes.

## [1.0.1-alpha.22] — 2026-08-29

La barre de projet, l'actualisation cadastrale et le panneau PLU sortent de `legacy.ts`.

### Interne

- `ui/projectBar.ts` : `setupProjectBar()`, `renderPanneauPlu()`, `actualiserDepuisIgn()`,
  `ouvrirDialogueActualisation()`, `construireVoisinage()`.
- `legacy.ts` : 5 214 → 4 576 lignes.

### Corrigé avant publication

- Le boot s'arrêtait juste avant le premier `render()` : la fabrique de contexte avait été insérée
  au niveau du module, alors que `etat` est une **locale de `boot()`**. Plan sans étiquettes et
  barre vide. Trouvé en comparant HEAD et la modification dans le même onglet neuf.

## [1.0.1-alpha.21] — 2026-08-29

Les huit panneaux du mode Terrasse sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/terrassePanels.ts` : configurateur, paramètres de calcul, plan de coupe, débit de bois,
  implantation, chantier, méthode, optimisation — 1 373 lignes.
- `legacy.ts` : 6 585 → 5 214 lignes. Vérifié panneau par panneau contre le témoin figé, au
  caractère près.

## [1.0.1-alpha.20] — 2026-08-29

La Vue 3D sort de `legacy.ts` — et une régression sérieuse en sort avec elle.

### Corrigé

- **La Vue 3D était vide et l'export GLB ne se terminait jamais**, depuis le correctif « une seule
  scène » de l'alpha.8 : le remplacement en masse `scene.` → `etat.scene.` avait aussi capturé les
  scènes **locales** de la 3D. `TypeError: etat.scene.add is not a function`, qu'aucun golden file
  ne pouvait voir. Corrigé aux 33 sites concernés. Le GLB retrouve exactement l'empreinte
  structurelle du golden : 203 nœuds, 200 maillages, 288 matériaux, 178 textures.

### Interne

- `three/scene.ts` et `three/etat3d.ts`. `legacy.ts` : 7 209 → 6 585 lignes.

## [1.0.1-alpha.19] — 2026-08-29

Le panneau d'attributs sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/attrPanel.ts` (717 lignes) et `interaction/outilAlignement.ts` pour la cible de l'outil
  d'alignement, partagée par trois endroits.
- `legacy.ts` : 7 912 → 7 209 lignes.

## [1.0.1-alpha.18] — 2026-08-29

Le dialogue d'import cadastral sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/cadastreDialog.ts` (753 lignes). La fonction était passée **en callback** à `showConfirm` :
  avec un paramètre de contexte, elle aurait reçu l'argument du confirm. Six appels asynchrones
  lancés sans attente sont désormais marqués `void`.
- `legacy.ts` : 8 663 → 7 912 lignes.

## [1.0.1-alpha.17] — 2026-08-29

L'acquisition IGN sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/apiIgn.ts` : géocodage BAN, cadastre API Carto, BD TOPO, PLU. Ce module ne connaît ni le DOM
  ni l'état.
- `geometry/proximite.ts` : distances entre contours — des critères de classement, jamais des
  mesures publiées.
- Un doublon disparaît : `aireSignee` était `signedArea`.
- `legacy.ts` : 9 011 → 8 663 lignes.

## [1.0.1-alpha.16] — 2026-08-29

Les quatre constructeurs d'export sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `export/dxfPlan.ts`, `export/svgPlan.ts`, `export/pdfPlan.ts`, `export/dossierPdf.ts`, plus
  `export/separateurs.ts` (contrat entre l'export et l'import SVG).
- `model/types.ts` gagne `ObjetPlan`.
- `legacy.ts` : 9 699 → 9 011 lignes.

## [1.0.1-alpha.15] — 2026-08-29

La conversion des données cadastrales sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/cadastreObjets.ts` et `geo/constantesCadastre.ts`. Le paramètre s'appelle `importe` et non
  `etat` : il portait exactement le nom de l'état de l'application.
- Vérifié par un import réel contre les services IGN : projet identique, `84bc5173…`.
- `legacy.ts` : 9 928 → 9 699 lignes.

## [1.0.1-alpha.14] — 2026-08-28

Les règles qui comblent les trous de la BD TOPO sortent de `legacy.ts`. Aucun comportement ne
change.

### Interne

- `geo/bdtopo.ts` : `hauteurBatiment()`, `hauteurVegetation()`, `arbresEstimes()`,
  `libelleParcelle()` et les deux plafonds d'arbres estimés. Ce sont des choix, pas des mesures :
  les tests servent surtout à ce que personne ne les prenne pour de la donnée et ne les « corrige ».
- `legacy.ts` : 9 971 → 9 928 lignes. 343 tests.

### Vérification

- Ces règles ne servent qu'à l'import cadastral, qui appelle les services IGN en ligne : les golden
  files ne les couvrent pas et l'import de bout en bout n'a pas été rejoué. Déplacement littéral,
  couvert par 18 tests unitaires, application et dialogue d'import vérifiés au navigateur.

## [1.0.1-alpha.13] — 2026-08-28

La composition des étiquettes de côtes et de coins est réunie en un seul endroit. Aucun comportement
ne change.

### Interne

- `model/etiquettes.ts` : `etiquetteComposee()`, `longueurEnMetres()`, `angleEnDegres()`. La règle
  était recopiée à six endroits, dont deux avec une ponctuation ASCII volontaire (les PDF écrivent
  en WinAnsi) que rien ne signalait. La ponctuation est désormais un paramètre nommé.
- `legacy.ts` : 9 988 → 9 971 lignes. 325 tests.

### Documentation

- `tests/fixtures/golden/EMPREINTES.md` : nouvelle section « Ce que ces empreintes ne voient pas ».
  Le jeu de démonstration n'affiche ni nom de côté ni angle — les six empreintes ne couvrent donc
  pas la composition des étiquettes. Le contrôle complémentaire et ses valeurs attendues y sont
  écrits.

## [1.0.1-alpha.12] — 2026-08-28

L'alignement par rotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geometry/alignement.ts` : `alignerSurCote()`, `rotationDAlignement()`, `tourner()`. Trois
  décisions y sont désormais écrites — rotation repliée dans ±90° (un côté s'aligne sur une droite,
  pas sur une direction), pivot au milieu du côté aligné, distance mesurée depuis ce côté et
  conservant la forme du côté où elle est déjà.
- `legacy.ts` : 10 016 → 9 988 lignes. 308 tests.

## [1.0.1-alpha.11] — 2026-08-28

L'ajout et le retrait de sommets sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `model/sommets.ts` : `insererSommet()`, `supprimerSommet()`, `minimumSommets()` — les quatre
  tableaux d'une forme (points, noms de coins, noms de côtés, coins gelés) restent en phase au même
  endroit.
- La suppression d'un objet passe par `detruireVue()`, qui oublie en plus l'entrée de la carte des
  vues — une fuite lente que le code en place laissait derrière lui.
- `legacy.ts` : 10 024 → 10 016 lignes. 291 tests.

### Connu, non corrigé

- Les noms de sommets par défaut sont numérotés d'après le nouveau total, pas d'après la position
  d'insertion : deux insertions peuvent produire deux « Coin 5 ». Comportement du fichier d'origine,
  figé par un test.

## [1.0.1-alpha.10] — 2026-08-28

Le glisser-déposer sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/drag.ts` : les cinq gestes qui modifient la géométrie (forme, cercle, sommet, côté,
  rayon). Le `pointermove` passe de 87 lignes à 6. Principe du module : on refuse plutôt que de
  déformer, et le refus est en bloc.
- `render/theme.ts` ne lit plus `window.matchMedia` sans garde : ce module pouvait empêcher toute
  suite de tests qui l'importe de se charger — 15 tests ne tournaient plus sans qu'aucun n'échoue.
- `legacy.ts` : 10 092 → 10 024 lignes. 278 tests.

### Connu, non corrigé

- Le débordement d'un cercle hors du contour est testé par seize points de son bord, pas par une
  vraie intersection : une fente de contour plus étroite que l'écart entre deux rayons
  échantillonnés laisse passer un cercle qui déborde. Comportement du fichier d'origine, figé par
  un test.

## [1.0.1-alpha.9] — 2026-08-28

`render()` est réduit à son orchestration : le positionnement des objets et le dessin des cotes
vivent dans `render/`. Aucun comportement ne change.

### Interne

- `render/objects.ts` : `positionnerObjet()` — la boucle de 113 lignes qui plaçait chaque objet.
- `render/measures.ts` : `dessinerCotes()`, plus `ancrageHorsContour()` et
  `distanceSortiePolygone()` — l'étiquette se pose hors du contour, au-delà de la dernière sortie
  du rayon.
- `geometry/basic.ts` : `angleInterieurDeg()`.
- Variable morte du fichier d'origine retirée (`const objCenter`, jamais lue).
- `legacy.ts` : 10 271 → 10 092 lignes. 254 tests.

## [1.0.1-alpha.8] — 2026-08-28

Le rendu et les interactions sortent de `legacy.ts`, module par module. Aucun comportement ne
change — mais une régression introduite en cours de route a été trouvée et corrigée.

### Interne

- `render/` : objets SVG d'un plan, calque des parasols, géométrie des cotes, thème, helper
  `creerSvg` typé, décor et grille.
- `interaction/` : édition par côté et par angle, zoom, pincement, déplacement, cadrage.
- `pathD` et `polyStr` rejoignent `geometry/path.ts` : la dette de la phase 2 est soldée.
- `legacy.ts` : 10 839 → 10 271 lignes. 249 tests.

### Corrigé avant publication

- **Le zoom ne faisait plus rien** depuis trois commits : deux scènes coexistaient, l'une écrite
  par la molette, l'autre lue par le dessin. Les golden files ne pouvaient pas le voir — un export
  est recalculé dans son propre repère. Corrigé, et la navigation est désormais couverte par
  23 tests.

### Connu, non corrigé

- Le cadrage plafonne à 400 px/m alors que la molette s'arrête à 220 : écart repris du fichier
  d'origine, figé par un test.
- Sur un élément SVG, `el.title` ne produit aucune infobulle : l'affectation crée une propriété
  inerte. Comportement conservé.

## [1.0.1-alpha.7] — 2026-08-28

Premiers modules de `render/**` et `interaction/**`, rendus possibles par l'état explicite.
Aucun comportement ne change.

### Interne

- `render/` : thème SVG, helper `creerSvg` typé (§7.2), flèche du Nord, échelle, grille,
  géométrie des cotes. `W` et `H` rejoignent `etat.scene`.
- `interaction/editing.ts` : édition par longueur de côté et par angle, contour de contrainte
  passé en paramètre.
- 22 tests ajoutés (221 au total).

### Corrigé avant publication

- Le renommage de `W`/`H` avait détourné les variables locales de `renderImplantation()` (format
  papier en mm) vers la taille de la fenêtre. Restauré et vérifié à l'écran.

## [1.0.1-alpha.6] — 2026-08-28

L'état de l'application tient désormais dans un seul objet explicite (`src/core/state.ts`), à la
place des variables libres de la fermeture de `boot()`. Aucun comportement ne change.

### Interne

- `EtatApp` / `creerEtat()` : données du plan, sélection, modes, bascules d'affichage, édition,
  calque d'ombre. 334 accès passent par `etat.`.
- La variable locale du dialogue d'import cadastre, qui s'appelait aussi `etat`, devient
  `etatImport` : elle masquait l'état global sur 750 lignes.
- 7 tests ajoutés (189 au total).

### Corrigé avant publication

- Le remplacement automatique avait renommé `data-measures` en `data-etat.measures` dans le SVG
  exporté. Un SVG produit par une version antérieure aurait perdu ses mesures à la réimportation.
  Détecté par les golden files, corrigé, et vérifié en réimportant le SVG d'avant migration.

## [1.0.1-alpha.5] — 2026-08-28

Phase 5 de la migration TypeScript, **partielle** : les modules d'interface qui ne dépendent pas
du rendu sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `src/ui/dialogs.ts` : notifications, confirmation, saisie, bandeau d'erreur, écran de reprise.
- `src/ui/texturePicker.ts` : catalogue Poly Haven et fenêtre de choix, typés.
- `src/ui/dom.ts` : helpers `el()` / `elOpt()` / `els()` / `on()` (§7.1), en place pour que le
  code neuf n'ajoute pas de `getElementById` non gardé.
- `main.ts` n'a plus sa copie du bandeau d'erreur : il importe celui du module.
- 19 tests ajoutés sous jsdom (182 au total) — première couverture d'interface du projet.

## [1.0.1-alpha.4] — 2026-08-28

Phase 4 de la migration TypeScript, **partielle** : la séparation donnée/vue est faite, la scène et
la pile d'annulation sont sorties. Aucun comportement ne change.

### Interne

- Les huit poignées SVG que portait chaque objet vivent dans une carte à côté
  (`src/render/vues.ts`) : la donnée du plan redevient sérialisable par construction.
- L'échelle et l'origine forment un objet `scene` ; la conversion monde ↔ écran vit dans
  `src/render/scene.ts`, la scène passée en paramètre.
- La pile d'annulation devient `PileAnnulation` (`src/core/history.ts`), bornée à 60 pas.
- 10 tests ajoutés (163 au total).

### Connu, non corrigé

- Après avoir déroulé toutes les annulations disponibles, « Dupliquer » ne fait plus rien. Le
  comportement est identique sur l'artefact gelé d'avant migration : bug préexistant, consigné pour
  après la migration comme l'impose la spec (§10.3).

## [1.0.1-alpha.3] — 2026-08-28

Phase 3 de la migration TypeScript : le moteur terrasse devient une bibliothèque pure et testée.
Aucun nombre ne change — la parité est prouvée bit à bit.

### Interne

- 10 modules `src/engine/**` (1 429 lignes hors de `legacy.ts`, qui passe à 10 839) : constantes,
  construction, lames, structure, calques, BOM, débit, implantation, chantier, parasols.
- Les deux fonctions qui lisaient l'état global le reçoivent désormais en paramètre, ainsi que
  leurs appelants ; les fonctions d'ombre reçoivent un contexte solaire explicite.
- Oracle du moteur capturé avant déplacement (`tests/fixtures/golden/moteur-terrasses.json`,
  deux terrasses de référence, neuf calculs chacune, artefacts de flottants compris).
- Couverture `src/engine` : 91,5 % (critère de sortie de la spec : ≥ 80 %). 153 tests au total.

## [1.0.1-alpha.2] — 2026-08-28

Phase 2 de la migration TypeScript : extraction des fonctions pures. Aucun comportement ne change,
les six golden files restent identiques au bit près à chaque lot.

### Interne

- 16 modules typés sortent de `legacy.ts` (12 959 → 12 250 lignes) : `model/{units,types,defaults,demo,version}`,
  `geometry/{basic,segments,rect,polygon,rings,path}`, `geo/{projection,soleil}`,
  `export/pdf/writer`, `export/dxf`, `util/{escape,format,download}`.
- 79 tests unitaires ajoutés (106 au total) : géométrie, projection locale, position du soleil,
  structure du PDF assemblé.
- Ce que le typage a fait remonter sans le corriger : `estRectangle` rend `null`/`undefined` et
  jamais `false` sur une entrée vide, `rectangleDepuisCote` peut rendre `null`. Les types le disent
  désormais ; le comportement est inchangé.

## [1.0.1-alpha.1] — 2026-08-28

Phases 0 et 1 de la migration TypeScript
([`MD/spec-migration-typescript.md`](MD/spec-migration-typescript.md) §4) : filet de sécurité, puis
échafaudage **sans déplacer une ligne de logique**. L'application construite est fonctionnellement
identique et produit les six golden files au bit près.

### Modifié

- `history` renommé en `undoStack` (changement A1 accepté par la spec §10.3 : une fois les modules
  en place, la collision avec `window.history` deviendrait silencieuse). Prouvé inerte — les six
  empreintes de référence sont identiques avant et après.

### Interne

- Golden files déposés dans `tests/fixtures/golden/` : résumé, SVG, DXF, projet JSON, PDF plan,
  PDF dossier, plus une empreinte structurelle du GLB (le binaire pèse 41,5 Mo et l'exporteur
  three.js n'est pas déterministe).
- Liste de fumée de 25 interactions (`tests/CHECKLIST-FUMEE.md`), à dérouler avant chaque fusion.
- Artefact gelé dans `legacy/plan_interactif.html`, étiquette `v0-preTS`.
- Chaîne d'outils : Vite 5 avec `vite-plugin-singlefile` (le déploiement reste « copier un
  fichier »), TypeScript 5.7 au barreau permissif, ESLint 9, Vitest 2.
- `plan.html` découpé en `index.html`, `src/styles/app.css`, `src/legacy.ts` (les deux blocs
  `<script>` verbatim, sous `@ts-nocheck`) et `src/main.ts` (amorçage).
- `npm test` recalcule les empreintes des golden files : une régression d'export est désormais
  détectée par la chaîne de test, plus par une relecture.
- `npm run build` produit `dist/index.html` (432 ko) avec `api.php` à côté.
- Le serveur de développement accepte `POST /_fixture/<nom>` pour déposer un golden file au bit
  près : un PDF qui transite par une chaîne JavaScript n'est plus le même fichier.
## [1.0.0] — 2026-08-28

Première version numérotée. Elle **fige l'application mono-page existante telle qu'elle est** et
lui donne une identité de version : aucune fonction du plan, aucun calcul et aucune géométrie ne
changent par rapport à l'état du 27 août. Les empreintes de référence sont capturées dans
`tests/fixtures/golden/`.

### Ajouté

- Numéro de version affiché à droite de la barre de projet (`v1.0.0`), avec le détail — build,
  version de schéma, version d'API — dans l'infobulle.
- Estampille de version dans les fichiers de projet : `meta.appVersion`, `meta.schemaVersion` et
  `meta.writtenAt`, à l'export JSON comme à l'enregistrement serveur.
- Estampille dans les exports : commentaire `999` en tête du DXF, attributs `data-app-version` et
  `data-schema-version` sur la racine SVG, dictionnaire `/Info` (`/Producer`, `/Creator`,
  `/CreationDate`) et pied de page sur chaque page des PDF, première ligne du résumé texte.
- En-têtes `X-App-Version` et `X-Schema-Version` sur toutes les requêtes vers `api.php`.
- Refus explicite d'un fichier de projet enregistré par une version plus récente : le plan en
  cours est laissé intact et le message invite à recharger la page. Charger partiellement un tel
  fichier puis l'enregistrer effacerait sans bruit les champs inconnus.
- Confirmation avant « Réinitialiser tout », qui efface d'un clic tout le travail fait depuis le
  chargement, mesures comprises.

### Corrigé

- Plantage au démarrage sur un plan contenant des objets de voisinage : trois variables d'état
  d'affichage étaient déclarées après la fonction qui les lit pendant le boot.
- Le tableau « Affichage par objet » se reconstruisait à chaque case cochée, détachant du DOM la
  case en cours d'utilisation et faisant perdre le focus clavier.

### Interne

- Empreintes de référence des six exports et fixture des quantités calculées
  (`tests/fixtures/golden/`), servant de garde-fou aux versions suivantes.
- `api.php` conserve la version du client qui a écrit chaque projet.
