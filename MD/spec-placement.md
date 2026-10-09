# La place d'un ouvrage neuf — spécification

**Version :** 1.0 — non publiée. Module `model/placement.ts`, appelé par `model/creation.ts`.

## 1. Ce que fait la fonction

Avant, tout ouvrage créé depuis la palette naissait au centre de la parcelle (une pergola et un
parasol au centre de la terrasse). Maintenant, chaque ouvrage naît **là où on le construirait**,
puis `rectangleLibre` trouve la place libre la plus proche dans la parcelle. Sans parcelle, sans
maison, sans rue connue, la règle ne s'applique pas et le centre de la parcelle vaut, comme avant.

| Ouvrage | Centre souhaité |
|---|---|
| **Terrasse** (4 × 3 m) | contre la **façade au soleil** de la maison : le mur d'au moins 3 m dont la normale regarde le plus vers le sud, à 10 cm du mur (`facadeAuSoleil`, `contreLaMaison`) |
| **Pergola** | le centre de la terrasse (sélectionnée, sinon la première) ; sans terrasse, là où elle irait |
| **Parasol** | idem |
| **Piscine** (8 × 4 m) | **au jardin** : sur une grille d'un mètre dans la parcelle, le point le mieux noté — à plus de `RETRAIT_PISCINE_M` = 3 m des limites (plus la demi-taille), à plus de 4 m de la maison, hors de son emprise ; la note récompense l'éloignement des limites (jusqu'à 6 m) et de la maison (jusqu'à 8 m), pénalise le nord de la maison (son ombre) et la distance à la terrasse |
| **Carport** (3 × 5 m) | **près de la rue** : au milieu du côté sur rue deviné (`geo/coteRue.ts`, passé par `ContexteCreation.coteRue`), un mètre en retrait vers l'intérieur |

La **maison** est le plus grand bâtiment du projet (pas du voisinage) dont le centre est dans la
parcelle (`maisonDe`). Le sud est `(0, −1)` dans le repère du plan (Y vers le nord).

## 2. Ce que ça ne change pas

Ni la taille des ouvrages, ni leur nom, ni leur construction ; ni les projets existants (rien n'est
réécrit). Les six empreintes de `tests/fixtures/golden/` ne voient pas la création. Tests :
`tests/unit/model/placement.test.ts`, `tests/unit/geo/coteRue.test.ts`.
