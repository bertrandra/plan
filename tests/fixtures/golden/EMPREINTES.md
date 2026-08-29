# Golden files — oracle de régression de la migration TypeScript

Capturés le **28 août 2026** sur le jeu de démonstration embarqué (parcelle AE 101, 35 objets,
2 terrasses, 11 mesures), `plan.html` v1.0.0, en mode local (aucun appel réseau sauf le GLB, qui
charge Three.js).

Ce dossier est la **phase 0** de [`../../../MD/spec-migration-typescript.md`](../../../MD/spec-migration-typescript.md) §4
et le gel exigé par [`../../../MD/RELEASE.md`](../../../MD/RELEASE.md) §2.3.

**Règle qui porte tout le reste :** aucune phase de migration n'a le droit de changer ces octets
(spec §4 et §10.1). Une empreinte qui bouge sans qu'une fonctionnalité voulue l'explique est un
changement MAJEUR, pas une correction (RELEASE.md §2.1).

## Les fichiers

| Fixture | Producteur | Octets | SHA-256 (normalisé) |
|---|---|---:|---|
| [`resume.txt`](resume.txt) | bouton « Générer le résumé » | 15 323 | `318d0cf113f2c681cbe82c54a0fe00029b7153e86d4b4202fd1cbf2145a082e6` |
| [`plan.svg`](plan.svg) | `buildExportSVG` | 25 109 | `f5922c20f4ca4df1e43f0d998c7fad28760189671644a2fe784b0f71e9c42a34` |
| [`plan.dxf`](plan.dxf) | `buildExportDXF` | 5 364 | `ec7a1e32267514a52016e60c06dd535f41d54649a07b4b2dadbb95d7c48608ec` |
| [`projet.json`](projet.json) | `exportProjetJSON` | 71 974 | `bb9719159d0b1a75aa6e853c0391f6c9902fd1e4e9df7cf8f80b3654917d06a6` |
| [`plan.pdf`](plan.pdf) | `buildExportPDF` (2 pages) | 16 162 | `c956c8813f165966f6a2cf5a79f6884e9f17ec035f2909a2cfc6994a4ffd857d` |
| [`dossier.pdf`](dossier.pdf) | `buildDossierPDF` (3 pages) | 15 254 | `ea303be4e40a535137b9b09067fb898435fc61b9a71d329129db981e049b0dc2` |
| [`glb-structure.json`](glb-structure.json) | `genererGlb`, **empreinte structurelle** | 462 | `d7f8ccbf4a29d92a5bd96add6c06d1c4e2374018d8577b165c65466532b0d5da` |
| [`quantites-demo.txt`](quantites-demo.txt) | extrait du résumé | 2 130 | — |

Les empreintes ont été obtenues trois fois par des chemins indépendants — deux captures dans le
navigateur et un calcul depuis les fichiers déposés — avec le même résultat.

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
