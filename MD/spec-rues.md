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
(`roughness 1`, `metalness 0`) à la couleur de `--chaussee-3d` (§8) assombrie de 0,8 (`ATTENUATION_3D` : le soleil et la courbe de
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

## 8. Les trottoirs, la part trottoir / rue et les couleurs (5.44.0)

Retour du propriétaire (27 novembre 2026), sur maquette validée : la chaussée de la BD TOPO
débordait sur les parcelles là où la rue est étroite, et rien ne montrait les trottoirs. Plan les
dessine maintenant entre la chaussée et les parcelles, en 2D et en Vue 3D, et la chaussée se
réduit pour garder la proportion trottoir / rue.

**La règle** (`model/trottoirs.ts`, fonction pure `partagerRue`, testée dans
`tests/unit/model/trottoirs.test.ts`). E est l'espace entre la limite d'une parcelle et celle d'en
face, mesuré perpendiculairement au tronçon. Avec la part p réglée (20 % par défaut) :

| Étape | Calcul |
|---|---|
| Trottoir voulu | t = max(1,40 m, p × E) (`TROTTOIR_MIN_M` : le passage accessible) |
| Chaussée | c = min(largeur BD TOPO, max(3 m, E − 2t)) (`CHAUSSEE_MIN_M` ; une voie que la BD TOPO dit plus étroite que 3 m, un chemin, garde sa largeur) |
| Trottoirs | (E − c) / 2 chacun : plus larges quand la BD TOPO est plus étroite |
| Rue partagée | si E − 2 × 1,40 < 3 m (moins de 5,80 m) : pas de trottoir, chaussée = min(BD TOPO, E) |

Exemples : 10 m → 2 / 6 / 2 ; 8 m → 1,60 / 4,80 / 1,60 ; 6 m → 1,40 / 3,20 / 1,40 ; 5 m → sans
trottoir ; 16 m avec une BD TOPO de 7 m → 4,50 / 7 / 4,50.

**La mesure** (`profilerRues`). Chaque tronçon est mesuré en travers tous les 2 m
(`PAS_PROFIL_M`, aux sommets aussi, la normale sur la bissectrice d'un coude) : un rayon de chaque
côté jusqu'à la première limite de parcelle connue — celle du projet, et les parcelles voisines
importées du cadastre (`parcellesConnues`) —, à 20 m de l'axe au plus (`PORTEE_LIMITE_M` : au-delà,
le rayon traverse un carrefour ou longe une rue qui part). Un rayon qui croise d'abord l'axe d'une
autre rue ne compte pas : au-delà, ce n'est plus cette rue (un carrefour, la place entre deux rues
qui se rejoignent), et un trottoir posé là recouvrirait l'autre chaussée. Une médiane sur cinq mesures voisines
efface une entrée de garage ou un coin de parcelle ; une majorité de mesures sans limite garde
l'ouverture (un carrefour). Un axe posé dans une parcelle ne mesure rien à cet endroit.

- **Les deux limites connues** : la chaussée se pose **au milieu de l'espace** (elle ne suit plus
  l'axe de la BD TOPO s'il est décentré) et ne déborde plus ; un trottoir de chaque côté jusqu'à la
  limite.
- **Une seule** : la rue est supposée symétrique autour de son axe (E = 2 × la distance mesurée).
  Le trottoir ne se dessine que **le long de la parcelle du projet** ; le long d'une voisine seule,
  pas de trottoir, la chaussée tient dans l'espace supposé (min(BD TOPO, E)).
- **Aucune à portée** : la chaussée d'avant, sur l'axe, à sa largeur lue, sans trottoir.

**Les réglages** (`ui/champs/rues.ts`), dans le menu Affichage **sous « Rues »**, visibles quand
elle est cochée (feuille Projet au doigt) : « Trottoirs / rue », un curseur de 10 % à 30 % par pas
de 5 % (`PART_TROTTOIRS_MIN`, `_MAX`, `_PAS`) qui se lit « Trottoirs 20 % · Chaussée 60 % » ; et
« Couleurs des rues », **Plan** (défaut : chaussée ambre `--chaussee`, trottoir pierre claire
`--trottoir`, bordure brune `--chaussee-bord`) ou **Réelles** (enrobé `--chaussee-reelle`, béton
`--trottoir-reel`, granit `--bordure-reelle`), pour le plan et la Vue 3D. Ce sont des descripteurs
de champs rendus par le composant de l'inspecteur, écrits par son service : ils suivent la règle
de « Rues » (préférence d'affichage, ni Ctrl+Z, permis en lecture seule, **projet à enregistrer**,
`sale: false` et `enregistre`). Rangés à côté de l'option, sur la parcelle :
`voisinage3d.rues.partTrottoirs` (seulement s'il diffère de 20) et `voisinage3d.rues.couleurs:
'reelles'` (seulement « Réelles ») ; décocher « Rues » les garde pour la prochaine fois. Un projet
existant garde son allure : l'ambre, plus les trottoirs. Les jetons sont dans `styles/jetons.ts`,
`app.css`, `render/theme.ts` (`encresDesRues`) et les modèles de palette (les mêmes dans chaque
modèle) ; la palette de l'admin les montre, famille « Traits ».

**Le plan** (`render/chaussees.ts`) : les chaussées en polygones entre leurs bords (2,5 px au moins
de loin), un disque à chaque bout de tronçon, cernées d'un bord de 1,2 px, puis les trottoirs par
dessus, puis un trait de bordure de 1,2 px entre trottoir et chaussée (groupes `chausseesBords`,
`chausseesPleins`, `trottoirs`, `trottoirsBordures`). Les profils sont gardés d'un dessin à l'autre
(`core/profilsRues.ts`) tant que les chaussées, la part et les contours des parcelles sont les mêmes.
Le nom des rues suit sa chaussée décalée (`etiquettesSurChaussees`).

**La Vue 3D** (`three/chaussees3d.ts`) : la chaussée drapée entre ses bords à 6 cm du sol ; les
trottoirs drapés 15 cm plus haut (`HAUTEUR_TROTTOIR_M`), de la chaussée à la limite de la parcelle,
avec une face de bordure montant du bord de la chaussée, coiffée d'une bande de 15 cm à la couleur
de la bordure, et une face qui descend au sol à la limite. Trois mailles mates (`rues-chaussees`,
`rues-trottoirs`, `rues-bordures`), dans la couche des chemins, hors export, sans ombre portée.
Les plaques des noms se posent au milieu de la chaussée et tiennent dans sa largeur (3,20 m au plus,
1,50 m au moins, `hauteurPlaque`).

**Les couleurs de la Vue 3D** (retour du propriétaire, 27 novembre 2026 : « rendu 3D éclairci en mode
sombre »). La 3D a ses propres jetons, famille « Scènes » de la palette : `--chaussee-3d`,
`--trottoir-3d`, `--bordure-3d` (Plan) et `--chaussee-reelle-3d`, `--trottoir-reel-3d`,
`--bordure-reelle-3d` (Réelles), toujours assombris de 0,8 (`ATTENUATION_3D`). **Ils ne suivent pas
le thème** : la scène a son soleil et son ciel, les mêmes en clair et en sombre (toits, murs et
gazon ne changent pas). En lisant les jetons sombres du plan, faits pour la photo sous une
interface sombre, la chaussée « Réelle » sortait presque noire et la bordure « Plan » noire. Les
valeurs sont celles du plan clair, sauf les pierres claires (trottoirs, granit), un peu plus
chaudes : le ciel de la scène (`scene.environment`) leur rend environ 3 % de bleu de plus que de
rouge, et la pierre se lisait gris-bleu. Les mêmes dans chaque modèle de palette.

| Jeton | Vue 3D, clair et sombre | Plan clair | Plan sombre |
|---|---|---|---|
| `--chaussee-3d` | `#F2C14E` | `#F2C14E` | `#B8862B` |
| `--trottoir-3d` | `#E4DCCB` | `#E4DED2` | `#4A443B` |
| `--bordure-3d` | `#6B4A12` | `#6B4A12` | `#0F0B06` |
| `--chaussee-reelle-3d` | `#5A5E63` | `#5A5E63` | `#3E4246` |
| `--trottoir-reel-3d` | `#C8C1AF` | `#C8C2B5` | `#8E897F` |
| `--bordure-reelle-3d` | `#EDE8DC` | `#EDEAE3` | `#C9C4BA` |

Le plan 2D ne change pas.

**Les exports.** Aucun ne change : ni les quantités, ni les empreintes de `tests/fixtures/golden/`.

**Vérifié.** `tests/unit/model/trottoirs.test.ts`, `tests/unit/core/profilsRues.test.ts`,
`tests/unit/render/chaussees.test.ts`, `tests/unit/three/chaussees3d.test.ts`,
`tests/unit/ui/champsRues.test.ts`. Fumée : points 197 et 200.
