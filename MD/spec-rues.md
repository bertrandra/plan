# Nom des rues — spécification

**Version :** 1.1 — non publiée. Modules `geo/rues.ts`, `model/rues.ts`, `render/rues.ts`,
`three/rues3d.ts`, `render/chaussees.ts`, `three/chaussees3d.ts` ; commandes `projet.lireRues` et
`affichage.chaussees` ; case « Nom des rues » de la section « Voisinage (3D) », option « Rues » du
menu Affichage (§7).

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

- Les noms seuls ne disent pas où passe la rue : posés sur la photo aérienne, et plus encore
  drapés sur le relief en 3D, ils restent difficiles à lire. Pour voir les rues elles-mêmes, deux
  réponses : le fond **Plan IGN** (menu Affichage, « Fond » ; `MD/spec_import_cadastre_et_json.md`
  §11.5 bis), la carte de l'IGN posée sous le plan et drapée sur le relief ; et l'option **« Rues »**
  (§7), qui dessine les chaussées sur n'importe quel fond, plus lisible en 3D où les rues du Plan
  IGN restent des bandes pâles, et les petites rues blanches sur blanc.
- Les exports (plan.svg, PDF, DP2) n'écrivent pas encore le nom des rues : un plan de masse le
  demanderait volontiers ; ce serait un changement des exports, donc d'empreintes.
- Le rayon est fixe (250 m), indépendant du rayon du voisinage importé.

## 7. Les rues dessinées : l'option « Rues » (5.41.0)

Retour du propriétaire (25 novembre 2026) : même avec le Plan IGN, les rues restent difficiles à
lire en 3D. Plan les dessine donc lui-même, en géométrie vectorielle, en 2D et posées sur le relief
en 3D.

**L'option.** « Rues », dans le menu Affichage (au-dessus de « Noms des rues » ; feuille Projet au
téléphone), commande `affichage.chaussees`, **décochée par défaut**. Visible dès que le projet a une
parcelle. C'est une préférence d'affichage qui suit la règle de « Relief » et « Courbes de niveau » :
ni Ctrl+Z, permise en lecture seule, mais elle **marque le projet à enregistrer** pour être retrouvée
à la réouverture. Rangée sur la parcelle du projet, à côté de la case du nom des rues :
`voisinage3d.rues.tracer: true`. Seule la valeur cochée s'écrit ; décochée, elle s'efface, et une
parcelle qui n'avait aucun réglage du voisinage retrouve exactement sa forme d'avant
(`model/rues.ts`, `tracerRues`). Un ancien fichier s'ouvre exactement comme avant, sans passer à
« modifié ».

**Les données.** La même requête que le nom des rues (§2), rien de plus demandé à l'IGN. Le WFS de
la BD TOPO rend, relevé au Vésinet le 25 novembre 2026 : `nature` (« Route à 1 chaussée »,
« Rond-point », « Route empierrée »…), `largeur_de_chaussee` (nombre, en mètres ; 0 ou absent quand
inconnu), `nombre_de_voies`, `importance` (texte, « 1 » à « 5 », parfois « NC »), `fictif`,
`position_par_rapport_au_sol` (texte, « -1 » en souterrain), `etat_de_l_objet`. Chaque tronçon
retenu devient une chaussée `{ nature, largeurM, importance?, nom?, pts }` dans
`ruesVoisinage.chaussees`, au centimètre dans le repère du plan, **nommé ou non**
(`geo/rues.ts`, `chausseesDepuisTroncons`) :

| Nature | Largeur sans largeur lue ni voies |
|---|---|
| Type autoroutier | 7 m |
| Route à 2 chaussées, Rond-point | 6 m |
| Route à 1 chaussée | 5 m |
| Bretelle | 4 m |
| Route empierrée | 3 m |
| Chemin | 2,5 m |

La largeur est, dans l'ordre : celle lue (bornée entre 1 et 30 m), sinon 3 m par voie, sinon celle
de la nature. Ne se dessinent pas : les sentiers, escaliers, pistes cyclables et bacs (ce ne sont
pas des rues), un tronçon **fictif** (il traverse une place ou un carrefour pour la topologie), en
**souterrain**, ou pas encore **en service**. Les plus importants sont rangés en dernier : dessinés
par-dessus les petits.

Les chaussées ne se gardent que si l'option les demande (cochée, ou des chaussées déjà lues, qu'une
relecture tient à jour) : une lecture pour les seuls noms garde la forme d'avant. Cocher l'option la
première fois, plan calé et commande permise, demande `projet.lireRues` — comme la case du nom des
rues, une modification du projet (une étape d'annulation au succès, refusée en lecture seule). Sur la
démonstration : 62 chaussées, 12 Ko de plus dans le projet.

**Le plan** (`render/chaussees.ts`, calque `chausseesGroup`) : au-dessus du fond et de la grille,
sous les courbes de niveau, le nom des rues et les objets ; les clics le traversent. Chaque tronçon
est un trait SVG à la largeur de sa chaussée à l'échelle (2,5 px au moins, pour qu'une rue se voie
de loin), bouts et coudes arrondis, cerné d'un bord de 1,2 px. Tous les bords d'abord, puis toutes
les chaussées : à un carrefour, les rubans se fondent. Seuls les tronçons qui touchent l'écran
s'écrivent, un chemin SVG par largeur. Couleurs : les jetons `--chaussee` (ambre, `#F2C14E` en
clair, `#B8862B` en sombre) et `--chaussee-bord` (`#6B4A12`, `#0F0B06`), dans `styles/jetons.ts`,
`app.css`, `render/theme.ts` et les modèles de palette (les mêmes dans chaque modèle : elles se
posent sur la photo et la carte, pas sur l'interface). Un ambre de carte routière : il se détache de
la photo (gris, verts, tuiles) comme du Plan IGN (blanc et gris), et le nom des rues, l'encre sous
son halo, reste lisible par-dessus. La couleur ne porte rien seule : le nom des rues est à côté.

**La Vue 3D** (`three/chaussees3d.ts`) : les mêmes chaussées, en une maille. Chaque tronçon est le
ruban drapé des chemins (`geometrieRubanDrape`), recoupé en mailles de 2 m au plus en long comme en
travers, chaque sommet à la hauteur du sol sous lui (`SolRelief.hauteur`, le lecteur de la scène)
plus 6 cm ; un disque ferme chaque bout de tronçon, pour des carrefours sans encoche. Matériau mat
(`roughness 1`, `metalness 0`) à la couleur de `--chaussee` assombrie de 0,8 (`ATTENUATION_3D` : le soleil et la courbe de
film de la scène éclaircissent un sol face au ciel, et l'ambre paraissait délavé, presque blanc sur le Plan IGN), dans la couche de profondeur des
chemins (`COUCHES_SOL.chemin`, décalage de polygone) : il gagne contre le sol, la photo et le Plan
IGN, sans scintiller. Découpé au sol dessiné (un ruban hors du sol flotterait). Il reçoit les ombres
et n'en porte pas ; aucune lumière n'est ajoutée. Il est retenu « hors objets » : la vue épurée (le
rendu de l'audit pour Claude, le photomontage) ne le montre pas. **Il ne part pas dans l'export GLB**
(`HORS_EXPORT`), comme le fond : c'est un repère à l'écran. Avec le reste du plan seulement (pas en
isolement), et le voisinage masqué l'emporte, comme le nom des rues.

**Les noms sur les rues dessinées.** Quand le ruban est posé, chaque plaque de nom se couche sur lui :
inclinée dans le sens de la pente (le sol lu aux deux bouts du nom), au-dessus du ruban, et rangée
une couche de profondeur au-dessus de lui. Sans l'option, les plaques restent exactement comme avant.

**Les exports.** Aucun ne change, que l'option soit cochée ou non : le SVG, le PNG et le PDF se
construisent depuis les objets (le nom des rues n'y est pas non plus, §6), et le GLB écarte le ruban.
Les empreintes de `tests/fixtures/golden/` ne bougent pas.

**Vérifié.** `tests/unit/geo/rues.test.ts` (largeurs, natures écartées, chaussées, lecture avec ou
sans), `tests/unit/model/rues.test.ts` (l'option et sa forme dans le fichier),
`tests/unit/render/chaussees.test.ts`, `tests/unit/three/chaussees3d.test.ts` (drapé, découpe,
disques, matériau, noms inclinés), `tests/unit/app/ecouteurs/affichage.test.ts` et
`voisinage.test.ts` (sans Ctrl+Z, « modifié », lecture la première fois, en lecture seule). Fumée :
point 197.
