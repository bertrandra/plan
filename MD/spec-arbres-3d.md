# Arbres en 3D — spécification

**Version :** 2.0 — non publiée. Modules `model/especesArbre.ts`, `model/reglagesEz.ts`,
`three/ezTree.ts`, `three/arbre3d.ts`, `three/apercuArbre.ts`, `io/arbresServeur.ts`,
`zones/EcranArbres.tsx`. Remplace la 1.0 (lobes, ports, dessins A à E, feuilles instanciées), supprimée.

## 1. Ce que fait la fonction

Un arbre du plan (fonction `arbre`, un cercle) est dessiné en 3D par **EZ-tree**
(`@dgreenheck/ez-tree`, un générateur d'arbres procédural) à partir d'une **essence** : un nom, caduc
ou persistant, des dimensions proposées et les réglages d'EZ-tree. Les essences forment une
**bibliothèque que l'administrateur crée** dans l'écran Admin › Arbres et qui vit sur le serveur. Pour
l'utilisateur, rien ne change que la liste : il choisit une essence dans l'inspecteur, avec sa hauteur
et le diamètre de son feuillage.

C'est pour l'ombre portée sur la terrasse qu'on dessine l'arbre, et cette ombre change avec la saison :
un caduc est nu de novembre à mars, à la date de l'étude d'ensoleillement.

### 1.1 Ce qui a été décidé (15–16 octobre 2026)

- **Essences nommées, pas de correspondance.** L'inspecteur n'a plus Port, Essence (caduc/persistant),
  Dessin (3D) ni Texture du feuillage : une seule liste « Essence ». Les anciens champs
  (`portArbre`, `essenceArbre`, `styleArbre`) ne sont plus lus ; un ancien plan dessine ses arbres avec la
  première essence. Les anciens dessins sont supprimés.
- **Réglages publiés, génération dans la page.** Le serveur ne garde que les réglages d'EZ-tree (un JSON
  léger) ; chaque page génère les arbres qu'elle montre. EZ-tree (plus de 4 Mo, textures comprises) ne se
  charge **que si la bibliothèque n'est pas vide** et qu'on ouvre la 3D, ou dans l'écran admin.
- **Instances.** Les arbres d'une même essence et d'une même variante se partagent une `InstancedMesh`
  (branches) et une autre (feuilles) : cent chênes, deux maillages (§4).
- **Repli.** Sans essence ou sans EZ-tree (hors ligne), un arbre est un tronc et une boule à la taille
  voulue : ce qu'il faut pour voir où il est et projeter une ombre.

## 2. La bibliothèque (`model/especesArbre.ts`)

Un document `plan-arbres`, `data/admin/arbres.json` sur le serveur (`admin/arbres`, comme la palette :
**lisible sans session** par chaque page, écrit avec la session admin, 512 Ko au plus, 200 essences au plus).

| Champ d'une essence | Rôle |
|---|---|
| `id` | `[a-z0-9-]`, 40 signes au plus, stable : c'est ce que porte l'objet (`especeArbre`) |
| `nom` | ce que l'utilisateur voit (« Chêne ») |
| `caduc` | nu de novembre à mars ; `true` par défaut |
| `natures` | mots de la nature BD TOPO (« conif », « verger ») pour lesquels l'essence est proposée à l'import du cadastre ; sinon la première |
| `hauteurM`, `diametreM` | les dimensions proposées quand l'utilisateur choisit l'essence |
| `reglages` | `Tree.options` d'EZ-tree (graine, branches, écorce, feuilles…), des valeurs simples sur quatre niveaux |

### 2.1 La bibliothèque livrée (`data/admin/arbres.json`)

Plan livre **quarante essences, dix par taille**, dans un fichier de données : `data/admin/arbres.json`, celui que le
serveur sert (`admin/arbres`) et que l'écran Admin › Arbres lit et enregistre. **Le code n'a aucune essence** : sans
fichier (pas d'admin, hors ligne, 404, document vide), la bibliothèque est vide et les arbres se dessinent en repli
(tronc et boule). Un arbre du plan dont l'essence a disparu suit la première essence de la bibliothèque (le chêne
pédonculé, qui ouvre le fichier).

| Taille | Hauteur proposée | Les dix |
|---|---|---|
| Petits | jusqu'à 6 m | genêt, vigne, haie de charme, buis, hortensia, lilas, laurier-palme, érable du Japon, pêcher, pommier |
| Moyens | de 6 à 12 m | olivier, cerisier à fleurs, arbre de Judée, magnolia caduc, houx, thuya occidental, if, sorbier des oiseleurs, érable champêtre, bouleau de l'Himalaya |
| Grands | de 12 à 20 m | pin sylvestre, charme, bouleau verruqueux, noyer, robinier, saule pleureur, pin parasol, chêne vert, cyprès de Provence, eucalyptus |
| Très grands | plus de 20 m | chêne pédonculé, hêtre, peuplier noir, platane, érable sycomore, frêne, épicéa, cèdre du Liban, séquoia, peuplier d'Italie |

La taille n'est pas un champ : elle se déduit de la hauteur proposée (`tailleDe`, `TAILLES` dans `model/especesArbre.ts`),
si bien qu'une essence retouchée à 15 m change de classe. L'écran admin range sa liste par taille, et le choix
« Essence » de l'inspecteur la présente de même (groupes de la liste déroulante).

EZ-tree n'a que quatre feuilles et quatre écorces : une essence se distingue par ses **réglages** (partis d'un preset
d'EZ-tree 1.1.0), ses proportions proposées (un cyprès de Provence fait 18 m sur 2,5 m, un cèdre du Liban 22 m sur
20 m), l'ouverture de ses branches (le saule pleureur retombe, le peuplier d'Italie se dresse), la teinte du feuillage
et de l'écorce, et sa caducité. Ce sont des maquettes pour l'ombre portée, pas des portraits botaniques. Les `natures`
couvrent les zones de végétation BD TOPO (feuillus, conifères, mixte, forêt, peupleraie, verger, haie, lande, vigne) ;
l'ordre du fichier compte pour les huit premières, le chêne pédonculé étant l'essence de repli. Le témoin GLB et
`cadastre-objets.json` se capturent **sans bibliothèque** (`poserEspeces([])`, fumée 24) : ils ne dépendent ni de ce
fichier ni du réseau.

**Installer le fichier.** La livraison (`livraison/data/admin/arbres.json`) le pose avec les autres données ; une
installation qui a déjà un `data/` ne l'écrase pas (ce sont ses données) : copier ce seul fichier dans `data/admin/`,
après avoir gardé l'ancien s'il a été retouché.

La lecture est **tolérante** : une essence sans identifiant valide ou sans réglages est ignorée, jamais
l'interface (`lireDocumentArbres`). L'essence d'un objet (`especeDe`) est celle qu'il porte, sinon la
première, sinon rien.

Côté serveur : `deploy/admin.php` et `buildsg/demosAdmin.mjs`, même contrat (`GET admin/arbres` sans
session, `PUT` avec session et `X-Plan-Admin`, `.bak` de la version précédente).

## 3. L'objet du plan

- `especeArbre` : l'essence. `diametreArbre` : la largeur du houppier. `elevation` : la **hauteur de
  l'arbre** (plus celle du tronc seul). `couleurArbre` : une teinte des feuilles (blanc : aucune).
- Choisir une essence dans l'inspecteur pose aussi sa hauteur et son diamètre proposés.
- L'import du cadastre (arbres estimés : hauteur de la végétation, diamètre 5 m) propose l'essence par la
  nature de la zone (`especeParNature`).

## 4. Le rendu

- **`three/ezTree.ts`** — génère le *modèle* d'une essence (geometrie des branches et des feuilles, deux
  matériaux) : **une génération par essence et par variante** (`NB_VARIANTES = 3` graines autour de celle de
  l'essence), en cache hors des scènes. Les matériaux d'EZ-tree sont refaits (sans son code de vent) ; ses
  cartes de couleur sont lues telles quelles (`NoColorSpace`), comme le reste de la scène (sortie linéaire,
  `three/bibliotheque.ts`).
- **`three/arbre3d.ts`** — l'arbre du plan est un groupe `arbre` **sans maille** (pied, rotation tirée de la
  clé, dimensions dans `userData.arbre`) ; `synchroniserArbres` en déduit les lots d'instances
  (`arbres-branches`, `arbres-feuilles`, une matrice par arbre, la teinte par instance pour les feuilles) et
  les refait quand la scène change (arbre posé, retiré, masqué par la vue épurée). Le plan reste la source
  de vérité. Un rayon qui touche une instance remonte à son groupe (`arbreDeLInstance`).
- **Saison** : `actualiserSaison` masque le lot de feuilles d'un caduc (`userData.caduc`) de novembre à mars ;
  un persistant garde les siennes.
- **Ombres** : les feuilles sont des plans à transparence (`alphaTest`), l'ombre est celle de leur découpe.
- **Export GLB** : les lots partent en `EXT_mesh_gpu_instancing` (obligatoire pour qui lit le fichier ;
  la visionneuse de Plan et model-viewer la lisent) ; l'écorce n'emporte que sa couleur ; les JPEG restent
  des JPEG. Une essence ajoute environ 1,8 Mo de textures au fichier.
- **Coût** : mesuré sur `oak_small` : 6 800 triangles par variante, générés en 30 ms ; `oak_medium` : 13 800.
  L'écran admin affiche les chiffres de l'essence en cours et prévient au-delà de 30 000 triangles.

## 5. L'écran Admin › Arbres (`?admin&ecran=arbres`)

Menu Admin › « Arbres (bibliothèque) ». À gauche, la liste des essences, « Ajouter à partir d'un modèle »
(les quinze presets d'EZ-tree) ou vierge, la fiche (nom, caduc, dimensions, natures BD TOPO) et les
réglages d'EZ-tree par groupe (forme, écorce, tronc et branches, finesse du maillage, feuilles), plus une
zone JSON pour tout le reste. À droite, l'aperçu 3D (sa propre scène, mêmes lumières que la Vue 3D) avec
triangles, sommets, durée de génération et dimensions du modèle, et une case « arbre nu ». « Enregistrer »
écrit sur le serveur ; la page elle-même prend la nouvelle bibliothèque, les autres pages au chargement.

## 6. Vérifié

- `tests/unit/model/especesArbre.test.ts` : lecture tolérante, document, bibliothèque chargée, nature, saison.
- `tests/unit/three/arbre3d.test.ts` : groupe sans maille, repli, lots d'instances (taille, partage, masque,
  teinte, retrouver l'arbre touché), saison. EZ-tree y est remplacé par un faux générateur.
- `tests/unit/{deploy/adminPhp,buildsg/demosAdmin}.test.ts` : la route `admin/arbres`, côté PHP et côté Node.
- Fumée 91 (les arbres en instances, la saison) et 92 (l'écran admin).
- `tests/unit/model/bibliothequeLivree.test.ts` : le fichier `data/admin/arbres.json` (dix essences par taille,
  identifiants valides et uniques, lecture sans perte, document sous 256 Ko, essence pour chaque nature BD TOPO, silhouettes).
- Témoins : `glb-structure.json` et `cadastre-objets.json` recapturés, notés dans `EMPREINTES.md`.
