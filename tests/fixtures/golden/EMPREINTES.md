# Golden files — oracle de régression de la migration TypeScript

Capturés sur le jeu de démonstration embarqué (parcelle AE 101, 35 objets, 2 terrasses, 11 mesures),
en mode local (aucun appel réseau sauf le GLB, qui charge Three.js).

- **28 août 2026**, `plan.html` v1.0.0 : capture d'origine, phase 0.
- **29 août 2026**, `plan.html` v1.1.0-alpha.1 : recapture à la rupture (voir plus bas).
- **29 août 2026**, `plan.html` v1.1.0-alpha.4 : recapture de rattrapage. Le numéro de version avait
  cessé de suivre le journal des modifications — `CHANGELOG.md` annonçait `alpha.2` et `alpha.3`
  alors qu'`APP_VERSION` et `package.json` étaient restés à `alpha.1`, si bien que ces deux versions
  n'ont jamais été estampillées dans un artefact. Remettre le numéro à sa place refait bouger les six
  empreintes, **et rien d'autre** : la preuve ligne à ligne décrite plus bas a été refaite à
  l'identique, avec le même résultat — une ligne, la version, dans chacun des quatre artefacts
  texte ; comptes de textes, d'objets et de pages inchangés dans les deux PDF.
- **30 août 2026**, `plan.html` v1.1.0-alpha.5 : typage complet de `engine/`. Les six empreintes ont
  d'abord été vérifiées **à version inchangée** — six sur six identiques au bit près, ce qui prouve
  que le typage du moteur n'a rien déplacé — puis recapturées après le changement de numéro, avec la
  même preuve ligne à ligne qu'aux deux recaptures précédentes.
- **30 août 2026**, `plan.html` v1.1.0-alpha.6 : typage complet de `render/`. Même protocole que la
  recapture précédente — six sur six identiques à version inchangée, puis une ligne par artefact
  texte après le changement de numéro. Vérification supplémentaire, propre à ce module : le fond
  orthophoto, activé à la main (le jeu de démonstration ne l'active pas, donc les empreintes ne le
  voient pas), pose les **quatre mêmes tuiles** — mêmes `x`/`y`/largeur/hauteur au dernier chiffre
  décimal — que sur le témoin figé.
- **30 août 2026**, `plan.html` v1.1.0-alpha.7 : typage complet de `io/`. Même protocole. Vérification
  supplémentaire, propre à ce module : un cycle export JSON → import (remplacement) sur le jeu de
  démonstration restaure les 35 objets et les 11 mesures, et le relevé de santé après import est
  identique à celui d'une page fraîche.
- **30 août 2026**, `plan.html` v1.1.0-alpha.8 : typage complet d'`interaction/`. Même protocole.
  Vérification supplémentaire : un glisser de sommet réel (`PointerEvent` synthétiques) déplace le
  sommet visé exactement du delta demandé et laisse les cinq autres inchangés ; un zoom molette
  redessine la scène.
- **30 août 2026**, `plan.html` v1.1.0-alpha.9 : typage complet d'`app/`. Même protocole. Vérification
  supplémentaire : le pilotage des quatre vues (Plan, Terrasse, Vue 3D, visionneuse) et la bascule de
  la grille testés en séquence, sans erreur.

- **30 août 2026**, `plan.html` v1.1.0-alpha.10 : typage complet de `geo/`. Même protocole — six sur
  six identiques à version inchangée, puis une ligne par artefact texte après le changement de
  numéro (143 textes / 14 objets / 2 pages pour `plan.pdf`, 106 / 15 / 3 pour `dossier.pdf` :
  inchangés). Vérification supplémentaire, propre à ce module et plus forte que les empreintes : les
  goldens ne passent par **aucun** appel réseau, alors que `geo/` n'est presque que cela. L'import
  cadastral « Place de la Mairie 35000 Rennes » a donc été rejoué **en direct** sur les deux
  versions à quelques minutes d'intervalle — le témoin figé 1.0.0 et le build fraîchement typé. La
  chaîne complète est sollicitée : géocodage BAN, `apicarto/cadastre/parcelle` sur emprise, BD TOPO
  (bâtiment, zone de végétation, haie) en WFS, puis les neuf interrogations du GPU/PLU. Résultat
  **identique au bit près** après neutralisation des quatre horodatages et du numéro de version :
  25 232 octets, SHA-256 `b93a3924b496529d9e4b3d17e522f0cf8a21bcaaa66680ef7b4d0aaf9ba321eb`,
  parcelle AC 530 de 418 m² (IDU `35238000AC0530`) et trois bâtiments de 16 ; 15,5 et 13,8 m. Le
  relevé du 28 août (25 108 octets) n'est plus reproductible : le témoin figé lui-même rend
  aujourd'hui 227 octets de plus, c'est-à-dire que ce sont les données du GPU qui ont bougé, pas le
  code. C'est bien pour cela que la comparaison qui compte est celle des deux versions entre elles.

- **30 août 2026**, `plan.html` v1.1.0-alpha.11 : typage complet de `three/`, rendu possible par
  l'adoption de `@types/three@0.128.0` (spec §8.3, option A : une dépendance de **type** sans
  dépendance de code — la bibliothèque continue d'arriver du CDN, et le build ne grossit d'aucun
  octet à cause d'elle). Même protocole — six sur six identiques à version inchangée, puis une ligne
  par artefact texte après le changement de numéro.

  Vérification supplémentaire, propre à ce module : les six empreintes **n'ouvrent jamais la 3D**.
  C'est `glb-structure.json` qui la voit, et il a été recapturé en direct — Vue 3D ouverte
  (Three.js r128 chargé du CDN, canevas rendu, aucune erreur), puis export GLB de 41 473 604 octets
  dont l'en-tête et les compteurs sont **identiques au relevé d'origine** : glTF 2.0, 203 nœuds,
  200 maillages, 288 matériaux, 178 textures, 1 scène. La visionneuse a été éprouvée dans la foulée
  sur les chemins les plus retouchés : bascule du fond clair/sombre (qui libère l'ancienne texture,
  donc passe par le nouveau garde `estTexture`) dans les deux sens, puis filaire coché/décoché — la
  scène est reconstruite deux fois et il reste exactement un canevas, sans erreur.

- **30 août 2026**, `plan.html` v1.1.0-alpha.12 : typage complet d'`export/`, treizième et
  avant-dernier palier. Même protocole — six sur six identiques à version inchangée, puis une ligne
  par artefact texte après le changement de numéro ; les deux PDF gardent exactement leurs comptes
  de textes, d'objets et de pages (143/14/2 et 106/15/3). Seul `ui/` (371) reste hors du cliquet,
  volontairement en dernier — c'est la couche la plus grosse et la moins testée.

- **30 août 2026**, `plan.html` v1.1.0-alpha.13 : typage complet d'`ui/`, quatorzième et dernier
  palier du barreau 2 — `--noImplicitAny` est desormais a zero sur **tout** `src/`. Même protocole —
  six sur six identiques à version inchangée, puis une ligne par artefact texte après le changement
  de numéro ; les deux PDF gardent leurs comptes exacts (143/14/2 et 106/15/3). Vérification
  supplémentaire, propre à ce palier : l'import cadastral complet (adresse → parcelle → parcelles
  voisines → création) a été rejoué en direct sur « Place de la Mairie 35000 Rennes » — mêmes
  quatre objets, mêmes hauteurs, même IDU `35238000AC0530`, mêmes dix clés du zonage PLU — aucune
  erreur console. C'est le chemin le plus riche en `ctx` partagés du fichier (`ContexteImportCadastre`,
  exporté depuis `ui/projectBar.ts` et importé par `ui/cadastreDialog.ts` plutôt que redéfini) et
  celui que les six empreintes ne peuvent pas voir, puisqu'il dépend du réseau.

- **9 septembre 2026**, `plan.html` v1.1.0-alpha.14 : fin de la **phase 4** — la fermeture `boot()`
  a quitté `legacy.ts`, qui a été supprimé. Six sur six identiques **à version inchangée** avant le
  changement de numéro : déplacer 900 lignes de câblage dans un module typé, retirer 280 symboles
  morts et supprimer le dernier `@ts-nocheck` ne bougent aucun des six artefacts.

  La preuve d’après recapture est cette fois **plus forte que la comparaison ligne à ligne**, et
  par un hasard heureux : `alpha.13` et `alpha.14` ont la même longueur. Remettre l'ancien numéro
  dans les octets fraîchement capturés reproduit donc les six empreintes précédentes **au bit
  près — les deux PDF compris**, ce que les recaptures précédentes ne pouvaient pas établir (la
  chaîne changeait de longueur et décalait toute la table xref). La version apparaît une fois dans
  chacun des quatre artefacts texte, deux fois dans `plan.pdf`, quatre fois dans `dossier.pdf` :
  ce sont les seuls octets qui diffèrent.

  Vérifications supplémentaires, propres à ce palier — les empreintes ne voient que des **exports**,
  or ce palier ne touche qu'au **câblage** :

  - **Un bug d'import réparé, et daté.** `filtrerSansParcelle` était cité dans le contexte passé à
    `importSVGString`, mais n'avait plus été importée depuis sa sortie vers `io/exportProjet.ts` en
    phase 2. L'objet levait donc un `ReferenceError` avant même l'appel, et le `try/catch` de
    `app/ecouteurs/fichiers.ts` le transformait en bandeau : **l'import SVG ne marchait plus**. Les
    trois versions ont été comparées en direct sur le même fichier (`plan.svg` du dossier doré) :
    le témoin figé 1.0.0 et le build corrigé donnent **le même résultat exact** — 14 → 15 objets,
    288 → 566 textes, aucune erreur ; le build d’avant correction affiche
    `Erreur import SVG: filtrerSansParcelle is not defined` et n’importe rien. Le typage a montré
    que les quatre propriétés en question (dont celle-là) ne sont **lues nulle part** par
    `importSVGString` : les retirer répare le geste sans rien ajouter.

  - **Relevé de santé identique au témoin, geste par geste.** Grille allumée/éteinte, onglets
    Affichage et Mesure, mode Terrasse puis retour au mode Plan : `1.1.0-alpha.14` et le témoin
    figé 1.0.0 donnent la **même** série de nombres (36 lignes d’affichage, 2 terrasses, 14 boutons
    de sélection, 305 textes après l’aller-retour), sans erreur console de part et d’autre.

  - **Les deux scènes 3D, qui sont du câblage pur.** Vue 3D ouverte : un canevas 600×418, sept
    points de vue dans la liste. Visionneuse GLB : génération complète puis affichage, et les trois
    bascules qui passent par `rafraichirVisionneuseGlb(caméra courante)` — filaire, ombres, lumière
    d'appoint — reconstruisent la scène six fois en laissant exactement un canevas, sans erreur.

- **20 septembre 2026**, `plan.html` v1.1.0-alpha.15 : **l'échelle de rigueur est gravie**.
  `tsconfig.json` porte la configuration cible de la spec §9.1 (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`) : 1 513 erreurs → 0 sur `src/` et `tests/`. Même protocole — six
  sur six identiques à version inchangée sur le build fraîchement typé, puis recapture après le
  changement de numéro. Et la preuve forte de la recapture précédente, refaite : `alpha.14` et
  `alpha.15` ont la même longueur, donc remettre l'ancien numéro dans les six octets frais reproduit
  **les six empreintes précédentes au bit près, les deux PDF compris**. Une ligne diffère dans
  `resume.txt`, `plan.svg` et `plan.dxf` (la version), trois dans `projet.json` (version et les
  deux horodatages, neutralisés par la normalisation). Le build passe de 450 063 à 450 058 octets :
  des imports morts en moins et un paramètre renommé, rien qui s'exécute.

  Ce palier ne change **que des types** : assertions non nulles là où l'invariant est tenu par le
  code environnant, types élargis là où une signature mentait, imports morts retirés. Ce que le
  compilateur a trouvé en chemin — des signatures fausses et une trentaine d'invariants que seul
  `normalizeObjects` ou `ensureConstruction` garantit — est consigné dans
  [`../../../MD/MIGRATION-JOURNAL.md`](../../../MD/MIGRATION-JOURNAL.md), « Phase 7 — l'échelle
  gravie ».


- **20 septembre 2026**, `plan.html` v1.1.0-alpha.16 : trois corrections revelees par le typage strict
  (cotes importees verifiees, point de calage a deux coordonnees, batiment sans proprietes), aucune
  ne touchant un export. Meme protocole, meme preuve forte : ancien numero remis dans les octets
  frais, six anciennes empreintes retrouvees au bit pres.

- **21 septembre 2026**, `plan.html` v1.1.0-alpha.17 : `ObjetPlan` devient une union discriminée
  (polygone, chemin, cercle) et les signatures d'index disparaissent ; `ensureConstruction` comble
  douze réglages de plus. Même protocole — six sur six identiques à version inchangée sur le build
  typé, puis recapture, puis la preuve forte : ancien numéro remis dans les octets frais, six anciennes
  empreintes retrouvées au bit près.

- **21 septembre 2026**, `plan.html` v1.1.0 : **la migration est terminée**. Le numéro raccourcit de neuf
  octets, donc la preuve de la rupture du 29 août est refaite plutôt que la preuve forte : les quatre
  artefacts texte sont identiques à ceux de l'`alpha.17` une fois le numéro neutralisé (une ligne
  diffère, trois dans le JSON avec ses horodatages) ; les deux PDF ont le même contenu — 14 objets,
  2 pages, 143 textes ; 15, 3, 107 — et, neutralisés numéro, dates, décalages `xref`, `startxref` et
  longueurs de flux, une seule ligne diffère dans chacun, le dictionnaire `/Producer … /Creator`, qui
  porte la version et la date de build (`BUILD_AT`, passée au 21 septembre). GLB revérifié, huit
  compteurs identiques.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.1 : reconstruction de l'IHM, étape 0 (registre des
  commandes, magasin ; l'écran ne change pas). Preuve de la rupture, le numéro changeant de longueur :
  quatre fichiers texte identiques hors numéro, deux PDF au contenu identique une fois neutralisés
  numéro, dates, décalages et longueurs de flux — aucune ligne ne diffère.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.2 : reconstruction de l'IHM, étape 1 (barre d'application
  et barre d'état en React). Même protocole, preuve forte : ancien numéro remis dans les octets frais,
  six anciennes empreintes retrouvées au bit près.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.3 : reconstruction de l'IHM, étape 2 (palette d'outils,
  surimpressions du canevas, menu Affichage). Même protocole, preuve forte : les six anciennes empreintes
  retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.4 : reconstruction de l'IHM, étape 3 (explorateur ;
  la terrasse devient un contexte du plan, le mode Terrasse disparaît). Même protocole, preuve forte :
  les six anciennes empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.5 : reconstruction de l'IHM, étape 4 (inspecteur par
  descripteurs de champs, D-12). Même protocole, preuve forte : les six anciennes empreintes retrouvées
  au bit près — après avoir remis le panneau du bas sur Affichage, l'onglet Terrasse réécrivant le
  chiffrage dans le projet à l'ouverture.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.6 : reconstruction de l'IHM, étape 5 (tiroir des
  résultats sous le plan). Même protocole, preuve forte : les six anciennes empreintes retrouvées au bit près.

Ce dossier est la **phase 0** de [`../../../MD/spec-migration-typescript.md`](../../../MD/spec-migration-typescript.md) §4
et le gel exigé par [`../../../MD/RELEASE.md`](../../../MD/RELEASE.md) §2.3.

**Règle qui porte tout le reste :** une empreinte qui bouge sans qu'un changement voulu l'explique
est un changement MAJEUR, pas une correction (RELEASE.md §2.1). Elle a tenu sans exception pendant
toute la migration, et la seule fois où ces octets ont bougé, c'est parce qu'on l'a décidé.

## Les fichiers

| Fixture | Producteur | Octets | SHA-256 (normalisé) |
|---|---|---:|---|
| [`resume.txt`](resume.txt) | bouton « Générer le résumé » | 15 331 | `e1fe5427857e9880c4a9c3bd42d29eb762d8e6b3dc7dcbd9bc11c0a3ab88dcf1` |
| [`plan.svg`](plan.svg) | `buildExportSVG` | 25 117 | `6c9606760a8d7e022aee39bbd95628bc8eb4e34aba1a10bc96ac506a83a7990a` |
| [`plan.dxf`](plan.dxf) | `buildExportDXF` | 5 372 | `49776db35fef722286b80bac68949897a9598384897863c36517db0336bd66d2` |
| [`projet.json`](projet.json) | `exportProjetJSON` | 71 982 | `b29ddfc258b2f665de30c6d3a1ef4fa02e0fe3e334871be31d46810dd6cb02da` |
| [`plan.pdf`](plan.pdf) | `buildExportPDF` (2 pages) | 16 178 | `c40a03b9afe9445e7a5e3915afb36a10d19d1cc19d425ed508c49ab10c97803a` |
| [`dossier.pdf`](dossier.pdf) | `buildDossierPDF` (3 pages) | 15 286 | `377fb67bd9ae94a7d819d3a3e65d8121d8792060f1b93686a8a6d631d756e5d3` |
| [`glb-structure.json`](glb-structure.json) | `genererGlb`, **empreinte structurelle** | 462 | `d7f8ccbf4a29d92a5bd96add6c06d1c4e2374018d8577b165c65466532b0d5da` |
| [`quantites-demo.txt`](quantites-demo.txt) | extrait du résumé | 2 130 | — |

## La rupture du 29 août 2026

`APP_VERSION` est estampillée dans les six artefacts. Passer de `1.0.0` à `1.1.0-alpha.1` — la
livraison du build à la place du fichier mono-page d'origine — **change donc ces octets**, et
l'invariant de la migration passe de « les empreintes ne bougent pas » à « elles ne bougent que par
la version ».

Ce que cela vaut a été établi **avant** de recapturer, pas après, et par deux chemins :

1. Le même build, encore estampillé `1.0.0`, reproduisait les six empreintes de la version figée au
   bit près — c'est la vérification faite à chaque étape depuis la phase 1.
2. Après le changement de numéro, une comparaison **ligne à ligne** avec les anciennes fixtures ne
   montre qu'**une seule ligne différente** dans chacun des quatre artefacts texte, et c'est celle
   qui porte la version :

   | Fixture | Ce qui change |
   |---|---|
   | `resume.txt` | ligne 1, l'en-tête |
   | `plan.svg` | ligne 1, l'attribut `data-app-version` |
   | `plan.dxf` | ligne 2, la signature |
   | `projet.json` | ligne 9, `meta.appVersion` |

   Les deux PDF ne peuvent pas se comparer ligne à ligne — la chaîne s'allonge de 8 octets, donc
   tous les décalages internes bougent. Ils ont été comparés sur leur **contenu** : 143 textes,
   14 objets, 2 pages pour `plan.pdf` ; 106 textes, 15 objets, 3 pages pour `dossier.pdf`. Aucun de
   ces nombres ne change, et les seuls textes qui diffèrent (1 et 3 respectivement) sont ceux qui
   portent la version.

Le **schéma du projet ne bouge pas** : un fichier enregistré par la 1.0.0 s'ouvre dans la nouvelle
version, et l'inverse aussi. La rupture porte sur l'artefact livré, pas sur les données.

Le témoin figé [`../../../legacy/plan_interactif.html`](../../../legacy/plan_interactif.html) reste
en 1.0.0 : c'est lui qui sert d'oracle pour tout ce que ces empreintes ne voient pas, et les
comparaisons avec lui doivent désormais neutraliser la version en plus de la date.

## Le GLB se compare structurellement, pas octet par octet

Le binaire pèse 41,5 Mo et la sortie de `THREE.GLTFExporter` n'est pas déterministe : elle dépend
du moment où les textures ont fini de charger (spec §10.1). `glb-structure.json` fige donc ce qui
doit rester stable : 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène, en-tête glTF 2.

Limite connue : l'exporteur n'attribue de nom ni aux maillages ni aux matériaux, donc la comparaison
porte sur les compteurs, pas sur les noms que la spec évoque. Un écart de compteur signale une
scène différente ; il ne dit pas *quel* objet a changé.

Revérifié le **20 septembre 2026** en `1.1.0-alpha.16`, en direct sur `dist/index.html` : export en 9,7 s,
41 473 612 octets (8 de plus que la capture, l'exporteur n'est pas déterministe), et les **huit compteurs
identiques** — 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 178 images, 651 accesseurs, 829
vues tampon, 1 scène. La visionneuse rouvre le modèle généré.

## Normalisation avant hachage

Trois substitutions, appliquées au contenu **binaire** du fichier avant le SHA-256. Chaque motif de
remplacement a exactement la longueur du motif remplacé, sinon les décalages internes du PDF (table
xref) changeraient et rendraient l'empreinte inutilisable :

```
s{\d{2}/\d{2}/\d{4}}{JJ/MM/AAAA}g                          dates affichées
s{D:\d{14}}{D:AAAAMMJJHHMMSS}g                             /CreationDate du PDF
s{"(exportedAt|writtenAt)":\s*"[^"]*"}{"$1":"HORODATAGE"}g  horodatages du projet JSON
```

Les autres sources de non-déterminisme sont **neutralisables depuis le 29 août 2026**, et elles sont
désormais réunies dans [`../../../src/model/cles.ts`](../../../src/model/cles.ts) :

- `Date.now()` dans les clés d'objets (`obj…_1`, `path…_6`), que la spec §10.1 avait repérée ;
- **`Math.random()` dans les identifiants de cotes** (`m…_a4f2b`), qu'elle n'avait *pas* repérée :
  les cotes n'ont pas de compteur, c'est un tirage qui distingue deux cotes posées dans la même
  milliseconde.

Les deux s'injectent (`horloge`, `alea`), avec les vraies sources par défaut. Elles n'apparaissent
pas dans ces fixtures — la capture ne crée ni objet ni cote — mais un scénario qui en crée peut
maintenant être comparé à lui-même, ce que font `tests/unit/model/cles.test.ts` et
`tests/unit/model/creation.test.ts`.

`newObjCounter` n'a pas besoin d'être injecté : il repart de zéro à chaque chargement, donc il est
déjà reproductible.

## Ce que ces empreintes ne voient pas

Elles sont capturées sur le jeu de démonstration **tel qu'il est**, c'est-à-dire avec la plupart des
cases d'affichage décochées. Conséquence mesurée le 28 août 2026 : `plan.svg` contient **14**
étiquettes de mesure seule, et **aucune** étiquette composée (`nom - valeur`) ni **aucun** angle.
La règle qui compose ces textes existe pourtant à six endroits du programme — écran, SVG, PDF du
plan, PDF du dossier — et deux d'entre eux emploient volontairement une ponctuation ASCII.

**Une régression sur la composition des étiquettes ne ferait donc bouger aucune de ces empreintes.**
C'est le même angle mort que celui du zoom (une transformation de vue que les exports ne voient pas,
spec §10.1) : ici, une branche de code que le jeu de démonstration n'emprunte pas.

Contrôle complémentaire, à rejouer quand on touche aux étiquettes — cocher « Nom segment », « Nom
coin », « Dimension » et « Angle » sur **tous** les objets de la table d'affichage, puis exporter :

| Mesure | Valeur attendue |
|---|---:|
| `<text>` dans `plan.svg` | 265 |
| dont étiquettes composées (` - `) | 204 |
| dont angles (`deg`) | 88 |
| longueur cumulée des textes SVG | 3 931 |
| longueur cumulée des textes PDF (`( … ) Tj`) | 5 019 |

Relevé identique sur `dist/index.html` et sur le témoin figé `legacy/plan_interactif.html`.

## Comparer deux imports cadastraux

L'import depuis une adresse ne peut pas être figé ici : il dépend des services IGN en ligne. Il se
compare en le rejouant sur les deux versions, à la même adresse et avec les mêmes choix. Quatre
champs doivent être neutralisés — un de plus que pour les exports, et c'est le piège :

```
"(recupereLe|interrogeLe|exportedAt|writtenAt)":\s*"[^"]*"   →   "$1":"HORODATAGE"
```

`interrogeLe` vient de l'interrogation du PLU. Comme les trois autres, il fait 24 caractères : deux
exports peuvent donc avoir **exactement la même taille** et deux empreintes différentes.

Relevé du 28 août 2026, « Place de la Mairie 35000 Rennes », choix par défaut à chaque étape
(parcelle AC 530, bâtiments et haies et végétation cochés, arbres décochés) : projet de
**25 108 octets**, SHA-256 `84bc517386e0a0201b8445d57eb0c4ae84fe3ff70ed9f0dfabfdb76b84f4b6c3`,
4 objets — la parcelle de 418 m² et trois bâtiments de 16 ; 15,5 et 13,8 m.

**Cette empreinte-là ne se conserve pas, et c'est mesuré.** Rejoué le 30 août 2026 sur le témoin
figé lui-même — donc à code strictement identique — le même import rend **25 335 octets** : 227 de
plus. Le contenu du GPU/PLU a bougé entre les deux dates. La taille et le SHA-256 ci-dessus ne
valent donc que comme repère historique ; ce qui se vérifie, c'est **l'égalité entre deux versions
rejouées le même jour**, comme au palier `geo/` (voir plus haut, v1.1.0-alpha.10). Ce qui reste
stable dans le temps, ce sont les quatre objets, la parcelle AC 530 de 418 m² et les hauteurs
16 ; 15,5 et 13,8 m.

## Quantités

[`quantites-demo.txt`](quantites-demo.txt) fige les surfaces et longueurs calculées, objet par
objet. C'est le fichier à regarder en premier quand une empreinte bouge : il dit **quel nombre** a
changé, là où le SHA-256 dit seulement que quelque chose a changé.

Emprise totale hors parcelle de référence : **408,4 m² (56,5 % de la parcelle)**.

## Rejouer la capture

Sans Node ni chaîne de test à ce stade, la capture passe par le navigateur et le serveur de
développement du dépôt :

1. `pwsh -File servir.ps1`, puis ouvrir `http://localhost:8765/plan.html` (jeu de démonstration).
2. Intercepter `URL.createObjectURL` pour récupérer les blobs et neutraliser le clic des ancres
   `download`, puis déclencher les six exports.
3. Poster chaque blob sur `POST /_fixture/<nom>` : le serveur écrit les octets bruts dans ce
   dossier. Ce détour existe parce qu'un PDF qui transite par une chaîne de caractères JavaScript
   n'est plus le même fichier.
4. Comparer : `perl -0777 -pe '<les trois substitutions>' fichier | sha256sum`.

Toute divergence se compare d'abord à `quantites-demo.txt`, ensuite au diff de l'export lui-même.
