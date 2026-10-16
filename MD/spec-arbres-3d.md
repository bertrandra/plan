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
**lisible sans session** par chaque page, écrit avec la session admin, 256 Ko au plus, 40 essences au plus).

| Champ d'une essence | Rôle |
|---|---|
| `id` | `[a-z0-9-]`, 40 signes au plus, stable : c'est ce que porte l'objet (`especeArbre`) |
| `nom` | ce que l'utilisateur voit (« Chêne ») |
| `caduc` | nu de novembre à mars ; `true` par défaut |
| `natures` | mots de la nature BD TOPO (« conif », « verger ») pour lesquels l'essence est proposée à l'import du cadastre ; sinon la première |
| `hauteurM`, `diametreM` | les dimensions proposées quand l'utilisateur choisit l'essence |
| `reglages` | `Tree.options` d'EZ-tree (graine, branches, écorce, feuilles…), des valeurs simples sur quatre niveaux |

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
- Témoins : `glb-structure.json` et `cadastre-objets.json` recapturés, notés dans `EMPREINTES.md`.
