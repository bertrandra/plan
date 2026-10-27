# Les ouvrages — un domaine par type d'objet, un contrôleur qui sait ce qui change

*Octobre 2026. Feuille de route d'architecture, phase 6. Décidé avec le propriétaire du projet le 27 octobre 2026 : « une terrasse
n'a pas les mêmes règles de construction qu'un chemin ».*

## Le constat

Un objet du plan est un `ObjetPlan` : une forme (`polygon`, `circle`, `path`) et une `fonction` (terrasse, piscine, pergola…). Ce
que la fonction donne à l'objet vit aujourd'hui en trois endroits :

- **un profil** (`model/fonctions.ts`) : les formes admises et les sections propres de l'inspecteur ;
- **des sous-objets** (`model/champsFonction.ts`, schéma 5) : `batiment`, `arbre`, `parasol`, `piscine`, `pergola`, `cloture` ;
- **des tests épars** : 90 comparaisons `fonction === '…'` réparties dans onze couches (33 dans `app/`, 16 dans `model/`, 12 dans
  `export/`, 7 dans `three/`…), et une centaine d'appels aux prédicats (`estTerrasse`, `estPiscine`…).

Les règles de construction, elles, sont rangées par moteur (`engine/structure.ts`, `layers.ts`, `bom.ts` pour la terrasse ;
`pergola.ts` pour l'abri ; `piscine/` ; `parasol.ts`) sans qu'aucun module ne dise : *voici ce qu'est une terrasse, voici ce
qu'est un chemin*. Pour ajouter un ouvrage (un jacuzzi qui n'est plus un « équipement », un carport qui n'est plus une pergola),
il faut retrouver tous les endroits qui comparent la fonction.

Deuxième constat, mesuré (banc du rendu, étape 2.2) : **le code ne sait pas quel objet a changé**. Une soixantaine de sites
écrivent directement dans les objets (gestes, inspecteur, commandes, préférences d'affichage, tâches de fond), et `render()` ne
prend pas d'argument. Le plan redessine donc ses 600 objets à chaque image, au téléphone 70 à 90 ms, alors qu'en conception un
seul objet bouge : celui qu'on dessine. « Si je fais une pergola, je ne fais pas une terrasse. »

## La cible

### 1. Un ouvrage par type, un registre par couche

Le test d'architecture impose des couches (`model` → `engine` → `core/render/three/export` → `ui` → `app` → `zones`) : un même
fichier ne peut pas porter le modèle d'une terrasse et son dessin 3D. Chaque couche a donc **son registre d'ouvrages**, un module
par type, rangé sous le même nom :

| Couche | Dossier | Ce qu'un ouvrage y déclare |
|---|---|---|
| modèle | `model/ouvrages/` | son identité (fonction, libellé), ses formes admises, ses sections, ses valeurs à la création, ses associés (la plage d'une piscine), ce qu'il perce (bassin, trémie), s'il occupe le sol, s'il s'isole |
| moteur | `engine/ouvrages/` | ses règles de construction : ce qui se calcule, ce qui se chiffre, ce qui se vérifie |
| plan | `render/ouvrages/` | ce que le plan dessine en plus de sa forme (couches de la terrasse, ombre du parasol, bassin) |
| 3D | `three/ouvrages/` | son volume dans la Vue 3D |
| inspecteur | `ui/champs/` (déjà par section) | ses sections propres, déclarées par l'ouvrage du modèle |

Les ouvrages, et leur famille de règles :

| Famille | Ouvrages | Règles de construction |
|---|---|---|
| **Construit, calculé** | terrasse | structure (cadre, solives, lambourdes, appuis), lames, nomenclature, prix, note de calcul |
| | pergola, carport | cadre suivant le contour, poteaux aux sommets, poutres ; mêmes règles, défauts différents |
| | piscine | bassin, terrassement, margelles, filtration, chiffrage |
| | parasol | mât, toile, ombre portée |
| **Bâti relevé** | bâtiment, annexe | toit (BD TOPO, LiDAR, corps), façades, relevé |
| **Surface simple** | dalle, chemin, massif, mobilier, équipement (jacuzzi) | une géométrie, une surface ou un linéaire, une matière ; pas de structure (« proche de la géométrie simple pour l'instant ») |
| **Ouverture** | trémie | perce la terrasse qu'elle chevauche |
| **Contexte** | terrain (parcelle, voisines), limite, arbre, point de vue, autre | ce qui situe le projet ; aucune règle de construction |

Un ouvrage absent ou inconnu (un ancien fichier) se comporte comme `autre`, comme aujourd'hui. **Aucun nombre ne bouge** :
chaque étape déplace des règles, elle n'en change aucune ; les empreintes de `tests/fixtures/golden/` le vérifient.

### 2. Un contrôleur des objets : le seul à dire « cet objet a changé »

`core/controleurObjets.ts` tient **une version par objet** (une `WeakMap` : un objet recréé — annulation, ouverture, import — n'a
pas de version, donc il est neuf) et une **version d'ensemble** :

- `toucher(obj)` : cet objet a changé. Le contrôleur touche aussi ce qui en dépend, d'après le registre des ouvrages : une
  piscine ou une trémie qui bouge touche la terrasse qu'elle perce.
- `toucherTout()` : on ne sait pas quel objet a changé ; tout est neuf. C'est le repli de toute écriture qui ne nomme pas son
  objet (`marquerModifie()` sans argument), donc le défaut sûr.
- `version(obj)` : la clé que lisent le dessin du plan et les calculs.

Les points de passage, d'après l'inventaire des écritures (27 octobre 2026) — huit couvrent l'usage courant :

1. le glisser (`interaction/pointeur.ts`, après `appliquerGlisser`) : `geste.obj` ;
2. l'inspecteur (`app/inspecteur.ts::appliquer`) : l'objet sélectionné, ou tous les chemins pour « appliquer à tous » ;
3. l'historique (`empiler`, `preparer`, `marquerModifie`) : un objet nommé s'il est passé, sinon `toucherTout()` ;
4. `rebuildHandles(obj)`, appelé après chaque édition structurelle (sommet ajouté, retiré, angle, longueur) ;
5. l'explorateur (`definirVisibilite`, `definirVisibiliteTous`) ;
6. la lecture des toits en tâche de fond (`redessinerObjets(cles)`, `apresLot`) ;
7. les décisions de l'audit (`appliquerPropositions`, qui rend ses clés) ;
8. la restauration (`historique.restaurer`) et l'import SVG : les objets sont neufs.

### 3. Le dessin du plan ne refait que ce qui a changé

`rendreObjets` garde, par objet, la clé de son dernier dessin : sa version, celle de ce qui le perce, et l'état d'ensemble qu'il
lit (cadrage et échelle, sélection, isolement, voisinage montré, pointage d'une cote, photo aérienne, thème). Clé inchangée : le
nœud SVG reste tel quel, sans un calcul. En conception, un rendu ne redessine que l'objet en cours.

### 4. Le garde-fou : la fumée vérifie chaque clé

Une clé fausse se verrait : un objet changé sans avoir été touché resterait dessiné à son ancienne place. En développement (le
serveur que joue la fumée), le plan **redessine quand même** les objets dont la clé n'a pas bougé et signale toute valeur qui
aurait changé (`[cle de version]` dans la console). La fumée fait échouer un point qui en produit. Un chemin d'écriture oublié
par l'inventaire se trouve donc par la fumée, pas par un client.

## Les étapes

| # | Étape | Critère de fin |
|---|---|---|
| 6.1 | Le contrôleur des objets, la version par objet aux huit points de passage, le dessin du plan qui saute un objet inchangé, le garde-fou en développement | au banc, à 600 objets au téléphone, le dessin du plan sous 10 ms quand rien ne change ; fumée complète sans `[cle de version]` |
| 6.2 | Le registre des ouvrages du modèle (`model/ouvrages/`) : profils, défauts de création, associés, ouvertures ; les comparaisons de `model/` et d'`engine/` passent par lui | empreintes inchangées ; plus aucun `fonction === '…'` dans `model/` et `engine/` hors du registre (cliquet du test d'architecture) |
| 6.3 | Les règles de construction par ouvrage (`engine/ouvrages/`) : terrasse, abri, piscine, parasol, surfaces simples ; le chiffrage et les dossiers lisent l'ouvrage | empreintes inchangées |
| 6.4 | Le dessin, la 3D, les exports et l'inspecteur par ouvrage : leurs comparaisons passent par le registre de leur couche | plus aucun `fonction === '…'` hors des registres (cliquet) ; fumée complète |
| 6.5 | Les écritures des commandes et des gestes nomment leur objet (`controleur.modifier(obj, …)`) ; le chiffrage et les cotes se gardent d'un rendu à l'autre sur la version de ce qu'ils lisent | au banc, à 600 objets au téléphone, un rendu sans changement sous 33 ms (l'étape 2.2) |
