# Nom des rues — spécification

**Version :** 1.0 — non publiée. Modules `geo/rues.ts`, `model/rues.ts`, `render/rues.ts`,
`three/rues3d.ts` ; commande `projet.lireRues` ; case « Nom des rues » de la section « Voisinage (3D) ».

## 1. Ce que fait la fonction

Sur la parcelle du projet, la section **Voisinage (3D)** de l'inspecteur porte une case **« Nom
des rues »**. Cochée, le nom des rues voisines s'écrit **sur le plan**, le long de chaque voie, et
**au sol de la Vue 3D**, peint sur la chaussée. Il situe le projet dans son quartier ; il ne compte
dans aucune quantité et n'entre dans aucun export de chiffrage.

## 2. D'où viennent les rues

- La couche `BDTOPO_V3:troncon_de_route` de la BD TOPO (WFS `data.geopf.fr`), dans le carré de
  **250 m** autour du centre de la parcelle, **800 tronçons** au plus (`geo/rues.ts`).
- Le nom d'un tronçon est celui de la **Base Adresse Nationale** (`nom_voie_ban_gauche`, sinon
  `_droite`), sinon celui de la BD TOPO (`nom_1_gauche`, `_droite`). Les tronçons sans nom
  (chemins, bretelles) sont écartés. La BAN écrit parfois sans accents (« Allee des Limites ») :
  c'est son orthographe, gardée telle quelle plutôt que le nom abrégé en capitales de la BD TOPO.
- Les tronçons sont regroupés par nom et ramenés dans le repère du plan depuis son origine
  (`cadastre.origineLat/Lon`, posée par l'import cadastral), au centimètre.

**Quand.** La première fois qu'on coche la case, si le plan est calé et que la commande est
permise, la case demande la commande **`projet.lireRues`** (« Lire le nom des rues (IGN) »). Le
bouton **« Relire les rues (IGN) »**, sous la case, la relance. Rien ne relit le service tout seul.

**Ce que la lecture écrit.** `ruesVoisinage` sur la parcelle du projet :
`{ recupereLe, rayonM, rues: [{ nom, troncons: PtBrut[][] }] }`. C'est une modification du
projet : un pas d'annulation empilé au succès seulement, « projet modifié », refusée en lecture
seule, sous la capacité `plan.cadastre` (celle de l'import IGN). Un échec ne laisse ni étape ni
rues, et le dit. Le projet garde les rues : elles s'affichent à la réouverture, hors ligne.

**La case** est une préférence d'affichage (`voisinage3d.rues.afficher`), comme « Clôtures du
voisinage » : ni Ctrl+Z, ni « projet modifié », permise en lecture seule. Sa note dit « 19 rues
lues le 10/10/2026 », « Pas encore lues », ou que le plan n'est pas calé sur le cadastre.

## 3. Où poser un nom (`model/rues.ts`)

1. Les tronçons d'une rue sont **raboutés** en lignes continues (extrémités à moins de 50 cm),
   retournés au besoin.
2. Chaque ligne est **découpée au cadre visible** — l'écran du plan, en retrait de deux hauteurs de
   texte ; le sol dessiné de la 3D : le nom se pose au milieu de ce qu'on voit de la rue, jamais au
   milieu d'une rue qui sort du cadre.
3. Sur chaque morceau d'au moins **20 m**, un nom au milieu ; sur un morceau de plus de deux fois
   **120 m**, plusieurs, à intervalles égaux.
4. L'angle suit la voie sur une dizaine de mètres autour du point (un virage ne tourne pas le nom
   de travers), ramené dans ]−90°, 90°] : un nom ne se lit jamais la tête en bas.

## 4. Le rendu

- **Plan** (`render/rues.ts`) : un calque à lui (`ruesGroup`), sous les objets, au-dessus des
  courbes de niveau, que les clics traversent. L'encre du plan en italique, un peu effacée
  (opacité 0,72), sous le halo des étiquettes : lisible sur le fond clair comme sur l'orthophoto.
  La taille suit le zoom (2,4 m sur le terrain), bornée entre 9 et 16 px.
- **3D** (`three/rues3d.ts`) : une plaque couchée à 8 cm du sol (du relief s'il y en a), dans le
  sens de la voie, 3,2 m de haut ; le nom en clair cerné de sombre, une image par nom partagée par
  ses étiquettes. Ni ombre, ni écriture dans le tampon de profondeur : la plaque ne cache rien. Avec
  le reste du plan seulement (pas en isolement).
- Un objet masqué cache ce qu'il porte : la parcelle masquée, plus de noms.

## 5. Vérifié

- `tests/unit/model/rues.test.ts` : raboutage, découpage au cadre, milieu de ce qu'on voit, pas des
  répétitions, angle lisible.
- `tests/unit/geo/rues.test.ts` : priorité des noms, regroupement, projection, emprise et plafond
  de la requête.
- `tests/unit/app/ecouteurs/voisinage.test.ts` : la lecture écrit les rues en un pas, un échec
  n'écrit rien, refusée sans calage ou en lecture seule.
- `tests/unit/ui/champsVoisinage3d.test.ts` : la case lit la première fois et seulement alors, la
  note, le bouton.
- `tests/unit/render/rues.test.ts`, `tests/unit/three/rues3d.test.ts` : les étiquettes posées,
  tournées, coupées au cadre ; rien sans la case, sans rues ou la parcelle masquée.
- Au navigateur piloté, sur la démonstration (Le Vésinet) : 19 rues lues à l'IGN ; « Allee des
  Limites » et « Avenue des Courlis » sur le plan, « Allee des Limites » au sol de la 3D sur
  l'orthophoto.

## 6. Limites

- Les exports (plan.svg, PDF, DP2) n'écrivent pas encore le nom des rues : un plan de masse le
  demanderait volontiers ; ce serait un changement des exports, donc d'empreintes.
- Le rayon est fixe (250 m), indépendant du rayon du voisinage importé.
