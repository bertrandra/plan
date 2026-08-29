# Golden files — oracle de régression de la migration TypeScript

Capturés sur le jeu de démonstration embarqué (parcelle AE 101, 35 objets, 2 terrasses, 11 mesures),
en mode local (aucun appel réseau sauf le GLB, qui charge Three.js).

- **28 août 2026**, `plan.html` v1.0.0 : capture d'origine, phase 0.
- **29 août 2026**, `plan.html` v1.1.0-alpha.1 : recapture à la rupture (voir plus bas).

Ce dossier est la **phase 0** de [`../../../MD/spec-migration-typescript.md`](../../../MD/spec-migration-typescript.md) §4
et le gel exigé par [`../../../MD/RELEASE.md`](../../../MD/RELEASE.md) §2.3.

**Règle qui porte tout le reste :** une empreinte qui bouge sans qu'un changement voulu l'explique
est un changement MAJEUR, pas une correction (RELEASE.md §2.1). Elle a tenu sans exception pendant
toute la migration, et la seule fois où ces octets ont bougé, c'est parce qu'on l'a décidé.

## Les fichiers

| Fixture | Producteur | Octets | SHA-256 (normalisé) |
|---|---|---:|---|
| [`resume.txt`](resume.txt) | bouton « Générer le résumé » | 15 331 | `77cbccfd8eb0ebf5d62ca51c5b16d7931b9d6901b0c3f5d82faed3ffa2a5866d` |
| [`plan.svg`](plan.svg) | `buildExportSVG` | 25 117 | `8f35ee04c4f1d8e64427b6def09d1ff894dfdc25980a1b62e0d2d213e48ba14a` |
| [`plan.dxf`](plan.dxf) | `buildExportDXF` | 5 372 | `29814368f4a7f112bb3e93f7b4a3613bd72d7d133a3b448e919187d880857257` |
| [`projet.json`](projet.json) | `exportProjetJSON` | 71 982 | `87880303418ccde09fc52fbbdd688ec5511032f0effe275223304865d19828ea` |
| [`plan.pdf`](plan.pdf) | `buildExportPDF` (2 pages) | 16 178 | `c479f8216995a996a15d8d4721618365a9e46defc0f0cb1212ea5f0000913ced` |
| [`dossier.pdf`](dossier.pdf) | `buildDossierPDF` (3 pages) | 15 286 | `3a34765c8214a23e95e7a1e649584d55de76f40a28f8d267769fa20d01f81d6e` |
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
