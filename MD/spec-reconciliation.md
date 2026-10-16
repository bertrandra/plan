# Réconciliation des sources : de l'IGN à la maison telle qu'elle est

Un bâtiment du plan se construit en couches, chacune corrigeant la précédente avec ce qu'elle sait mieux. Ce document dit
le contrat : les **sources**, les **attributs** qu'elles renseignent, le **moteur** qui arbitre quand elles divergent, et
la **décision** (automatique quand elle est sûre, manuelle quand elle ne l'est pas). Tout ce qui se règle est une donnée
(`regles/reconciliation.json`), pas du code : une règle d'arbitrage change par une PR sur ce fichier, et l'écran
Admin › Règles la montre.

## 1. Les sources

| Source | Ce qu'elle voit | Où elle vit | Ce qu'elle ne sait pas |
|---|---|---|---|
| `ign` | le contour (polygone), la hauteur à l'égout BD TOPO, les altitudes de toit, le matériau des fichiers fonciers | `bdtopo` de l'objet | une forme de toit, les ouvertures ; ses hauteurs sont à ±1 m |
| `lidar` | le sursol tous les 50 cm : l'égout, le faîtage, les corps et leurs bouts, la forme simple | `toitMesure`, `corpsToit`, `toit` | les arbres le trompent ; ne voit ni façade, ni lucarne fine |
| `photo` | la photo d'une façade redressée : sa hauteur, sa silhouette, ses ouvertures | mesures de l'audit (`audit/parcelle/mesures.ts`) | un toit hors cadre ; les dimensions sans les coins du mur |
| `claude` | tous les paramètres **sans dimension** : forme, bouts, silhouette, matériaux, couverture, éléments | analyse de l'audit | une cote ; sa réponse n'est un fait que corroborée |
| `terrain` | ce que la personne a vu sur place (« Ce que je vois ») | capture de l'audit | rien : elle est devant le bâtiment |
| `projet` | la valeur que le projet a aujourd'hui, et si une personne l'a choisie à la main | l'objet | ce n'est pas une mesure : c'est la valeur de départ |

`projet` n'est pas un électeur : c'est l'**avant**. Une valeur du projet choisie à la main (matériau, couverture, hauteur
saisie) est un **veto** : aucune source ne la remplace sans que la personne le décide.

## 2. Constat, attribut, arbitrage

- **Constat** : une source dit une valeur d'un attribut d'un objet, avec sa confiance (0 à 1, `null` si elle ne la donne pas),
  la règle qui l'a produite (`SEUIL_MARCHE_M`, `ECART_EGOUT_MIN_M`… : c'est ce qui fait surface des règles LiDAR) et ses
  indices (photo, phrase).
- **Attribut** : ce qui se compare, par objet : `hauteurEgout`, `hauteurTotale`, `formeToit`, `boutsToit`, `sensFaitage`,
  `silhouetteFacade`, `ouverturesFacade`, `materiauMurs`, `couverture`. Chacun dit comment deux valeurs s'accordent
  (`nombre` à une tolérance, `egal`, `ensemble`).
- **Arbitrage** : les constats d'un attribut d'un objet, regroupés par accord, comptés, et la décision.

## 3. Le moteur

1. Les constats qui s'accordent (à la tolérance de l'attribut) forment un **groupe**.
2. Chaque constat vaut `poids[source] × confiance` ; le **score** d'un groupe est la somme de ses constats.
3. Le groupe de plus haut score est le **retenu**. S'il dit ce que le projet a déjà (à la tolérance), il n'y a rien à
   proposer.
4. La décision est **automatique** quand, ensemble :
   - le score du retenu atteint `scoreAutoMin` ;
   - il dépasse le second groupe d'au moins `margeAutoMin` fois (ou il n'y en a pas de second) ;
   - aucun veto ne s'y oppose (une valeur choisie à la main) ;
   - le retenu n'a pas pour seule source une source qui n'a pas le droit d'être seule (`claude` : jamais seule).
   Sinon elle est **manuelle** : la ligne arrive décochée, avec la raison (« le LiDAR dit 6,2 m, la photo 5,4 m »), tous les
   constats listés, et la personne choisit une source, ou **force** une valeur.
5. Rien n'est écrit sans la validation de l'audit : une décision automatique **coche** la case, elle n'écrit pas.

Les poids, les seuils et l'ordre de confiance sont dans `regles/reconciliation.json`. Maximiser les décisions automatiques
justes, c'est régler ces nombres sur le corpus validé (`tests/fixtures/audit/`, audits reçus), jamais coder un cas.

## 4. Les règles LiDAR font surface

Le LiDAR n'écrit plus dans le projet sans le dire : sa lecture (`app/toitsLidar.ts`, `facade/toitCorps.ts`) produit des
constats avec la règle qui les a produits, et Admin › Règles montre, par module, les seuils et les étapes de la lecture
LiDAR (`regles/toits/reglages.json`) à côté des règles d'arbitrage.

## 5. Découpage

| Lot | Contenu |
|---|---|
| R1 | ce document, `regles/reconciliation.json`, son lecteur, l'écran Admin › Règles |
| R2 | le moteur pur (`facade/regles/reconciliation.ts`) et ses tests |
| R3 | les collecteurs de constats : IGN, LiDAR, photo, Claude, terrain, projet |
| R4 | le câblage dans l'audit : un arbitrage par attribut, des cases cochées par la décision |
| R5 | les règles LiDAR à l'écran (Admin › Règles, constats avec leur règle) |
| R6 | la décision manuelle : choisir une source, forcer une valeur, rangées dans le fichier de l'audit |
| R7 | le taux de décisions automatiques sur le corpus et les audits reçus |
