# Toit d'un bâtiment IGN — spécification

**Version :** 1.0 — implémentée, non publiée (schéma de projet 3)
**Statut :** spécification de référence : **le standard pour construire ou actualiser un bâtiment
depuis l'IGN**, toit compris
**Compagnons :** [`spec-releve-facade.md`](spec-releve-facade.md) (§8 : le toit lu sur une photo),
[`spec_import_cadastre_et_json.md`](spec_import_cadastre_et_json.md), [`RELEASE.md`](RELEASE.md) (§3 : schéma)

---

## 1. Ce que fait la fonction

Aujourd'hui, un bâtiment importé de la BD TOPO est son contour extrudé à la hauteur d'égout : un
bloc plat. Seul un relevé de façade lui donne un toit.

Désormais, **tout bâtiment construit ou actualisé depuis l'IGN reçoit un toit**, sans photo :

1. la **hauteur du toit** `H`, de l'égout au faîtage, est lue dans la BD TOPO :
   `H = altitude_maximale_toit − altitude_minimale_toit` ;
2. la **forme** est celle d'un toit à croupes posé sur le contour réel, quel qu'il soit (rectangle,
   L, T, U…) : le **squelette droit** du contour (§3) ;
3. la **pente** est celle qui amène le point le plus haut du squelette à `H` :
   `pente = atan(H / dmax)`, où `dmax` est la profondeur du squelette (§3.2) ;
4. la **couverture est rouge** (tuile) par défaut.

Le toit ainsi posé est une **estimation avouée** (`source: 'bdtopo'`), au même titre que la hauteur
de 2,5 m d'un bâtiment sans mesure (`geo/bdtopo.ts`). Un relevé de façade le remplace (§5.3), une
saisie aussi.

### 1.1 Ce qui a été décidé avant d'écrire une ligne

| Question | Décision | Pourquoi |
|---|---|---|
| D'où vient la hauteur du toit ? | **BD TOPO** : `altitude_maximale_toit − altitude_minimale_toit` | Déjà téléchargée avec chaque bâtiment ; aucun appel de plus |
| Quelle forme ? | **Squelette droit** du contour, tous les murs en égout, même pente | Seule construction qui donne un toit juste sur un L, un T ou un U (une aile, un faîtage ; des noues aux angles rentrants). Sur un rectangle, c'est exactement le « quatre pans » actuel |
| Quelle pente ? | **Déduite** : `atan(H / dmax)`, bornée (§4) | Deux nombres BD TOPO et le contour suffisent ; rien à saisir |
| Quelle couleur ? | **Rouge tuile** `#B0432F`, pour tout toit sans couleur choisie | Demande produit ; c'est aussi la couverture la plus courante des maisons |
| Quels bâtiments ? | **Tous** ceux qu'on importe ou actualise : la propriété et le voisinage | Les ombres portées et la vue 3D du voisinage en profitent autant |
| Quand est-il calculé ? | **À l'import et à l'actualisation**, puis enregistré dans le bâtiment ; **et une fois, à l'ouverture d'un plan d'une version précédente** (migration 2 → 3, §5.6). Jamais au rendu | Un plan d'avant reçoit ses toits sans rien demander. Le jeu de démonstration n'est pas importé de l'IGN : la migration ne le touche pas ; sa maison porte un toit saisi |
| Qui l'emporte ? | Photo et saisie **sur** BD TOPO | La photo mesure, la BD TOPO estime (§5.3) |
| Une bibliothèque ? | **Non** : `geometry/squelette.ts`, en TypeScript | Le projet n'a que trois dépendances ; un contour de maison compte rarement plus de 30 sommets après simplification (`SIMPLIF_M`) |

### 1.2 Ce que cette version ne fait pas

- Pas de **pignon** déduit : la BD TOPO ne dit pas quels murs sont des pignons. Tous les murs sont
  des égouts ; un relevé de façade sur un pignon le corrige (§5.3).
- Pas de lecture du **LiDAR HD** ni du **MNS** de l'IGN (§9).
- Rien en **2D** : le plan garde le remplissage du bâtiment ; faîtages et noues n'y sont pas dessinés.

---

## 2. Ce qu'on lit dans la BD TOPO

Couche `BDTOPO_V3:batiment`, par bâtiment :

| Champ | Sens | Usage |
|---|---|---|
| `hauteur` | du sol à l'égout, en m | hauteur du prisme (inchangé, `hauteurBatiment`) |
| `altitude_minimale_toit` | altitude NGF de l'égout, en m | bas du toit |
| `altitude_maximale_toit` | altitude NGF du point le plus haut du toit, en m | **nouveau** : haut du toit |
| `construction_legere` | `True` / `False` | toit plat forcé (§4) |

`H = altitude_maximale_toit − altitude_minimale_toit`, arrondi au centimètre. Ces altitudes viennent
de la photogrammétrie : **comptez un mètre d'incertitude**. Une cheminée, une lucarne ou un
belvédère peuvent porter le maximum : c'est la raison de l'écrêtage (§3.3).

Enregistré dans `bdtopo` (à côté de `altitudeToitM`, qui est le minimum) :
`altitudeToitMaxM: nombreFr(p.altitude_maximale_toit)`.

> **À vérifier avant d'implémenter** : aucun extrait réel de la BD TOPO n'est dans le dépôt, et le
> service n'était pas joignable depuis l'environnement où cette spec a été écrite. Relever une
> dizaine de bâtiments connus (§8.1) confirme que le champ est rempli et donne l'ordre de grandeur
> de l'écart.

---

## 3. Le modèle : le squelette droit

### 3.1 La définition

Faites avancer chaque mur vers l'intérieur à la même vitesse. Le toit est la trace de cette
avancée : à l'instant `t`, le front est à la hauteur `z = t · tan(pente)`. Les sommets du front
dessinent les **arêtiers** (angle sortant), les **noues** (angle rentrant) et, là où deux fronts
opposés se rencontrent, le **faîtage**.

Sur un contour en L, cela donne un faîtage par aile, une croupe au bout de chaque aile, deux
arêtiers qui partent de l'angle sortant, et une noue qui part de l'angle rentrant et rejoint les
deux faîtages.

Chaque mur engendre **un pan** : le polygone balayé par son front. Sur un contour convexe, c'est
exactement l'enveloppe basse des plans de chaque mur ; sur un contour en L, en T ou en U, **non** :
un plan venu de l'autre aile couperait celle-ci. C'est pourquoi le squelette est nécessaire.

Sur un rectangle, le squelette donne le « quatre pans » de `plansDuToit` (croupes de même pente que
les longs pans) : c'est le test de non-régression (§8).

### 3.2 La pente

`dmax` est l'instant du dernier événement du squelette : la plus grande distance que parcourt un
front, c'est-à-dire la demi-largeur de l'aile la plus large. Pour que le point le plus haut soit à
`H` :

```
tan(pente) = H / dmax
z(point)   = t(point) · H / dmax
```

Une aile plus étroite a un faîtage plus bas, à la même pente : c'est ce qu'on voit sur une maison
réelle.

### 3.3 L'écrêtage

Si la pente calculée dépasse **55°**, `H` ne décrit sans doute pas la couverture (cheminée,
tourelle, erreur de mesure). La pente est alors fixée à **45°** et le toit est **écrêté à `H`** :
chaque pan est coupé à `z = H`, et le front à l'instant `t = H / tan 45°` devient un pan
horizontal. Si ce front est vide (le toit culmine avant `H`), rien n'est coupé : le faîtage reste
plus bas que `H`.

### 3.4 L'algorithme

`geometry/squelette.ts`, fonctions pures, en mètres locaux :

```ts
/** Le squelette droit d'un polygone simple, sommets dans le sens trigonométrique. */
export function squeletteDroit(pts: readonly PtBrut[]): Squelette | null;

interface Squelette {
  /** Un pan par mur : pans[i] est balayé par le mur pts[i] → pts[i+1]. */
  pans: { cote: number; contour: { x: number; y: number; t: number }[] }[];
  /** Instant du dernier événement : la profondeur du squelette. */
  dmax: number;
}
```

Front d'onde à événements (Felkel & Obdržálek) : **événements d'arête** (un morceau de front se
réduit à rien) et **événements de partage** (un sommet rentrant perce un côté d'en face). À chaque
pas, tous les événements sont recalculés et le plus proche est traité (O(n³), sans importance à
trente sommets) ; à égalité, l'arête passe avant le partage. Un anneau du front **d'aire nulle** —
deux morceaux opposés se sont rejoints — est clos : ses morceaux deviennent le faîtage. Le résultat
est **vérifié** : chaque point d'un pan est à la distance `t` de son mur (le pan est un plan), et
les aires des pans se somment à celle du contour. Un contour qui ne se résout pas, ou dont le
squelette ne se vérifie pas (auto-intersection, sommets confondus, plus de 200 sommets), rend
`null`. Essayé sur 4 954 contours simples tirés au hasard (étoiles, escaliers orthogonaux tournés
et déplacés à 650 km de l'origine) : aucun échec ; 300 d'entre eux sont rejoués par les tests.

**Repli** : `null` → le « quatre pans » actuel (`plansDuToit`, faîtage sur `angleDuPlusLongCote`),
même `H`. Le toit est toujours posé, jamais une exception.

`facade/toit.ts` expose le squelette sous la même interface que les autres formes :
`facettesToit(pts, toit)` rend `{ pans, pignons }` ; pour `forme: 'croupes'`, `pignons` est vide
(tous les murs sont des égouts). `three/releve3d.ts` et `hauteurPignon` ne changent pas.

---

## 4. Les règles, dans l'ordre

La première règle qui s'applique décide. `h` est la hauteur d'égout retenue (`hauteurBatiment`).

| # | Condition | Toit |
|---|---|---|
| 1 | Le bâtiment porte un toit `source: 'photo'` ou `'saisie'` | **Inchangé** (§5.3) |
| 2 | `construction_legere` vaut `True` | **plat** |
| 3 | `altitude_maximale_toit` ou `altitude_minimale_toit` absente | la **forme du contour** (ci-dessous), pente **35°**, `estime: true` |
| 4 | `H < 0,5 m` | **plat** (toit-terrasse, ou bâtiment trop bas pour qu'on distingue) |
| 5 | pente calculée `< 10°` | **plat** |
| 6 | pente calculée `> 55°` | la forme du contour à 45° : croupes écrêtées à `H` (§3.3) ; deux pans ramenés à la hauteur de 45°, `estime: true` |
| 7 | sinon | la **forme du contour**, `hauteur: H` |

**La forme du contour** (`geometry/faitage.ts::rectangleOriente`) : un contour qui remplit à 86 %
(`REMPLISSAGE_RECTANGLE`) son rectangle orienté selon le plus long côté, et dont ce rectangle est
allongé d'au moins 1,25 (`ELONGATION_MIN`), est une maison rectangulaire : **deux pans** à pignons,
faîtage dans l'axe du long côté — c'est ce qu'on voit sur neuf maisons sur dix, et la BD TOPO ne sait
pas le dire. Tout autre contour (un carré, un L, un T) reçoit des **croupes** (§3). Avant octobre
2026, tout recevait des croupes : un pavillon à pignons apparaissait avec quatre pans.

Dans les cas 2, 4 et 5, le toit enregistré est `{ forme: 'plat', source: 'bdtopo' }` : la 3D garde
le dessus du prisme (`poserToit` ne pose rien pour un toit plat), mais l'actualisation sait qu'elle
l'a décidé et pourra le revoir.

Au cas 3, la hauteur enregistrée est celle qu'une pente de 35° donne au squelette
(`dmax · tan 35°`) : la 3D la montre ; `estime: true` dit à l'inspecteur qu'elle n'est pas lue.

---

## 5. Construire et actualiser un bâtiment : le standard

### 5.1 Une seule fonction

Import (`geo/cadastreObjets.ts`, `batiments`) et actualisation (`app/actualisationIgn.ts`) appellent
la même fonction, pour qu'un bâtiment importé et un bâtiment actualisé soient identiques :

```ts
// geo/bdtopo.ts
/** Le toit d'un bâtiment BD TOPO, selon les règles de spec-toit-ign §4. */
export function toitBdTopo(pts: readonly PtBrut[], props: Record<string, unknown>): Toit;
```

### 5.2 À l'import

`formeIgn(..., 'batiment', ...)` reçoit `toit: toitBdTopo(pts, p)` dans `extra`. Voisins compris.

### 5.3 À l'actualisation

Le contour est remplacé (inchangé). Le toit :

| Toit existant | Après actualisation |
|---|---|
| absent | `toitBdTopo(ptsNeufs, p)` |
| `source: 'bdtopo'` | recalculé : `toitBdTopo(ptsNeufs, p)`, **en gardant `couleur`** si l'utilisateur l'a changée |
| `source: 'photo'` ou `'saisie'` | **gardé tel quel** — c'est un choix de l'utilisateur, comme le nom et les couleurs |

Le bilan de l'actualisation compte les toits posés : « 12 toit(s) déduit(s) de la BD TOPO ».

### 5.4 « Aucun toit » devient un choix

Aujourd'hui, choisir la forme vide dans l'inspecteur **supprime** `toit`. Un bâtiment sans toit
recevrait alors un toit BD TOPO à la prochaine actualisation. Désormais ce choix enregistre
`{ forme: 'plat', source: 'saisie' }`, que l'actualisation respecte (règle 1). Le libellé du menu
devient « Toit plat » ; l'entrée vide disparaît.

### 5.5 Le relevé de façade

Inchangé (`spec-releve-facade.md` §8.3) : le toit lu sur la façade remplace le toit du bâtiment,
celui de la BD TOPO compris. La case « Remplacer le toit du bâtiment par celui-ci » part cochée.

### 5.6 Un plan d'une version précédente

Un projet de schéma 1 ou 2 est lu à travers la chaîne des migrations (`model/migrations.ts`). La
migration **2 → 3** pose `toitBdTopo` sur chaque objet dont `bdtopo.couche` est
`BDTOPO_V3:batiment` et qui n'a pas de toit ; elle ne touche ni un toit existant (photo, saisie),
ni un objet dessiné, ni la végétation. `altitudeToitMaxM` n'était pas enregistré avant le schéma 3 :
ces toits tombent sous la règle 3 (35°, `estime: true`) jusqu'à la prochaine actualisation IGN, qui
lit la vraie hauteur. Une construction légère enregistrée comme telle reste plate.

Le document ainsi lu porte des toits `croupes` : il s'enregistre au schéma 3 à la modification
suivante (`schemaAEcrire`). Le dialogue « Mettre à jour le modèle ? » n'a pas lieu d'être : le
contenu demande déjà le schéma 3.

---

## 6. Données et persistance

```ts
export type FormeToit = 'plat' | 'appentis' | 'deux-pans' | 'quatre-pans' | 'croupes';

export interface Toit {
  forme: FormeToit;
  hauteur: number;          // du faîtage (ou de l'écrêtage) au-dessus de l'égout, en m
  angleFaitage: number;     // ignoré par 'croupes' : le squelette n'a pas de faîtage unique
  couleur?: string;         // absent : COULEUR_TOIT_DEFAUT
  source?: 'photo' | 'bdtopo' | 'saisie';
  /** 'croupes' : la pente est fixée (écrêtage, §3.3) au lieu d'être déduite de hauteur. */
  pente?: number;           // en degrés
  /** La hauteur n'a pas été lue (règle 3) : l'inspecteur le dit. */
  estime?: boolean;
}
// bdtopo : + altitudeToitMaxM
```

- **La pente n'est pas enregistrée**, sauf écrêtage : elle se déduit de `hauteur` et du contour. Si
  l'utilisateur déplace un sommet, le toit suit, et son point le plus haut reste à `hauteur`.
- **`COULEUR_TOIT_DEFAUT` passe de `#9a5b44` à `#B0432F`** (rouge tuile). Tout toit sans couleur
  choisie devient rouge, ceux d'un relevé compris.
- **Schéma 3.** Un lecteur de schéma 2 ne connaît pas `'croupes'` : `plansDuToit` le prendrait pour
  un quatre-pans sur l'enveloppe, faux sur un L. Suivant `RELEASE.md` §3.1, `SCHEMA_VERSION` passe
  à 3 ; `schemaMinimal` rend 3 dès qu'un toit a la forme `'croupes'`. Migration 2 → 3 : le toit des
  bâtiments BD TOPO (§5.6).
- **Conséquence plateforme.** Tout plan créé depuis une adresse porte désormais un toit, donc un
  schéma 3. Une plateforme qui n'accepte pas encore 3 le refusera (`422
  UNSUPPORTED_SCHEMA_VERSION`) : **la plateforme doit accepter le schéma 3 avant la livraison**.
  `contrat/plan-produit.json` le déclare (`schema_versions: [1, 2, 3]`) ; il reste à le recopier
  dans backprod.
- **Poids** : quelques dizaines d'octets par bâtiment. Rien à surveiller.
- **Démonstration** : elle n'est pas importée de l'IGN, et la migration ne lui donne rien. Mais sa
  maison porte désormais un toit **saisi** — croupes, 3 m (`model/demo.ts`) : la démonstration
  s'écrit au schéma 3. Témoins recapturés ou calculés en conséquence
  (`tests/fixtures/golden/EMPREINTES.md`, 30 septembre 2026). Le témoin de l'import cadastral
  (`tests/fixtures/golden/cadastre-objets.json`) a été recapturé : ses deux bâtiments portent
  désormais leur toit et `altitudeToitMaxM`, rien d'autre ne change.

### 6.1 La couleur lue sur l'orthophoto

La couverture n'est plus rouge par principe : elle est **lue sur l'orthophoto IGN**
(`ORTHOIMAGERY.ORTHOPHOTOS`, niveau 19, ~20 cm/pixel ; repli au 18), à la création d'un plan depuis
une adresse et à chaque actualisation IGN.

1. **Les pixels** : ceux qui tombent sous le contour, **à 0,6 m en retrait des murs** (rive,
   gouttière, ombre du mur). Un contour trop étroit pour ce retrait est lu entier
   (`render/couleurToitOrtho.ts`).
2. **La cohérence** (`model/couleurToit.ts`) : la teinte dominante est la médiane des pixels qui ne
   sont pas du feuillage. Elle est retenue telle quelle si :
   - au moins **40 pixels** sont lus ;
   - le feuillage couvre **au plus 20 %** du toit ;
   - **au moins 60 %** des pixels sont à moins de 42 (distance RGB) de la teinte dominante — deux pans,
     l'un au soleil, l'autre à l'ombre, échouent ici ;
   - la teinte n'est **ni une ombre** (luminance < 40) **ni un éblouissement** (> 235).
3. **Sinon, le repli** : la couverture courante la plus proche de la teinte dominante.

| Couverture | Couleur | Quand |
|---|---|---|
| Tuile rouge | `#B0432F` | terre cuite vive (teinte < 22° ou ≥ 340°, saturation ≥ 0,35, assez claire) ; aussi sans aucun pixel |
| Tuile brune | `#6E4B36` | terre cuite sombre ou tirant sur l'ocre (teinte < 50°) |
| Couverture grise | `#6F7275` | peu saturée (< 0,2) — ardoise, zinc, bac acier — ou d'une teinte qui n'est pas celle d'une terre cuite |

Le toit enregistre `couleur` et **`origineCouleur`** (`'orthophoto' | 'rouge' | 'brun' | 'gris'`).
Une couleur **sans** `origineCouleur` a été choisie dans l'inspecteur : ni la lecture ni
l'actualisation ne la touchent. Une couleur posée par Plan est relue à l'actualisation.

**Un toit-terrasse ne se rabat jamais sur une tuile** : quand la photo n'est pas concluante, sa
couverture est grise (`couleurToitDepuisPixels(pixels, plat)`). En 3D, il est couvert d'une surface
de sa couleur, 2 cm au-dessus du prisme et en retrait de 20 cm des murs (le dessus des murs se lit
comme un acrotère), avec un décalage de profondeur (`poserEnCouche`) pour qu'elle ne scintille pas contre
le prisme vu de loin ; un toit plat qu'une lecture antérieure avait rabattu sur une tuile rouge ou
brune s'y dessine gris (`couleurToitPlat`). Avant, le dessus d'un toit-terrasse prenait la couleur
des murs.

Un WMTS injoignable ne bloque rien : au bout de 20 s, les toits restants gardent la tuile rouge par
défaut (`COULEUR_TOIT_DEFAUT`), sans `couleur` enregistrée. Le champ est facultatif : il ne change
pas le schéma (un lecteur de schéma 3 garde le toit tel quel).

### 6.2 Tuiles ou ardoises en 3D

La couverture porte une **texture** dans la Vue 3D (et l'export GLB), teintée par sa couleur :

| Couverture | Texture |
|---|---|
| repli `rouge` ou `brun` | **tuiles** romanes : 4 tuiles et 3 rangs par mètre, bombées, ombre du rang supérieur |
| repli `gris` | **ardoises** : 4 par mètre, 8 rangs, joints croisés, nuance par ardoise |
| lue sur l'orthophoto, ou choisie | celle de son repli (`couvertureRepli`) : ardoise si la teinte est grise, tuile sinon |
| sans couleur | tuiles (rouge par défaut) |

`materiauCouverture` (`model/couleurToit.ts`) choisit ; `three/couverture.ts` dessine la texture sur
un canevas, sans réseau ; `uvDuPan` (`facade/toit.ts`) la pose sur chaque pan, en mètres : `u` le
long de l'égout, `v` dans la pente en vraie grandeur. Les rangs suivent ainsi l'égout de chaque pan.
Case « Texture » décochée : la couleur unie, comme avant.

### 6.3 Les détails du bâtiment en 3D

Un prisme coiffé de ses pans reste un cube avec un chapeau. `three/detailsBatiment.ts` ajoute, sans
donnée nouvelle, ce qui fait « maison » — par-dessus le prisme de `scene.ts` et le relevé de
`releve3d.ts`, pour tout polygone de fonction `batiment` :

| Détail | Règle |
|---|---|
| **Débord de toit** | une bande de `DEBORD_TOIT_M` = 0,4 m au-delà de chaque mur, dans le prolongement des pans (elle descend le long d'un égout, suit le profil d'un pignon), épaisse de 0,15 m : dessus en couverture, sous-face claire, planche de rive. L'ombre portée sous l'égout vient du soleil de la scène. Coins en onglet (`contourDecale`). |
| **Gouttière** | un profilé zinc le long des seuls égouts (profil nul et plat sur le mur) ; pas sur un pignon. |
| **Angles** | des verticales seulement, aux vrais angles (changement de direction d'au moins 25° : un contour BD TOPO a beaucoup de sommets presque alignés), dans la teinte du mur assombrie (× 0,82), opaques. Ni trait à l'égout (il se voyait à travers le débord du toit) ni sur le toit (les pans se lisent par la lumière) : trop de traits faisaient bande dessinée. Sur un sol en relief, elles partent du point le plus bas du sol sous le bâtiment. |
| **Soubassement** | une bande au pied des murs, en saillie de 3 cm, de la couleur du mur assombrie (× 0,72). Sur sol plat, de 0 à 0,45 m. Sur un sol en relief, du point le plus bas du sol sous le bâtiment jusqu'à 0,45 m au-dessus du sol à chaque sommet : elle suit la pente et ne laisse pas de vide sous le mur. La porte se pose sur le sol devant elle. |
| **Fenêtres** | à chaque niveau, sur les murs sans relevé de façade et d'au moins 2 m : une fenêtre de 1 × 1,2 m par entraxe de 2,4 m, centrées (`abscissesFenetres`), appui à 0,9 m. Les niveaux : `nombreEtages` de la BD TOPO, sinon la hauteur du mur sur 2,7 m ; aucun niveau sous 2,2 m (`niveaux`). Une porte de 0,9 × 2,1 m remplace la fenêtre du milieu au rez-de-chaussée du plus long mur. Cadre gris chaud, vitre bleu-gris, vantail bois : une seule maille à trois groupes. |
| **Cheminée** | sur un toit en pente d'au moins 40 m² : un carré de 0,5 m, 0,8 m au-dessus du pan, à un tiers du faîtage depuis le centre ; brique sous les tuiles, gris sous l'ardoise. |

**De loin** (plus de `DETAIL_FIN_M` = 120 m du centre de la scène), seuls le débord (sans
gouttière) et les arêtes sont posés : un voisinage de deux mille bâtiments ne supporterait pas six
mailles de plus chacun. Rien n'est enregistré : ce sont des règles de rendu, et la structure du
GLB exporté change avec elles (témoin `glb-structure.json`, `EMPREINTES.md`).

**Les fenêtres d'un bâtiment du projet se règlent** (section « Fenêtres (3D) » de l'inspecteur,
`ui/champs/fenetres3d.ts`, rangées dans `fenetres3d` sur le bâtiment, `model/fenetres3d.ts`) :

- **Toutes pareilles** (défaut) : largeur, hauteur, hauteur d'appui, entraxe et couleur des vitres,
  communs à toutes ; la disposition automatique (`facade/ouvertures.ts::ouverturesAutomatiques`)
  s'en sert. Les défauts sont ceux du tableau ci-dessus.
- **Une par une** : la liste part de la disposition automatique ; chaque ouverture (fenêtre ou
  porte) se déplace sur son mur, se taille, change de mur ; on en ajoute (à droite de celle en
  cours), on en supprime, on revient à l'automatique. La position est bornée au mur.
- Ces champs écrivent le projet (Ctrl+Z, « projet modifié ») : la 3D et l'export GLB en dépendent.
  Un mur photographié garde les ouvertures de son relevé. Une maison du voisinage n'a pas cette
  section : son apparence vient de §6.4.

### 6.4 L'apparence du voisinage en 3D

Section « Voisinage (3D) » de l'inspecteur, sur la parcelle du projet (`ui/champs/voisinage3d.ts`),
rangée dans `voisinage3d` sur la parcelle (`model/voisinage3d.ts`) comme le fond orthophoto. Ce
sont des **préférences d'affichage** (`sale: false`) : ni Ctrl+Z, ni « projet modifié », permises en
lecture seule, enregistrées avec le projet au prochain enregistrement. Rien n'est écrit sur les
parcelles voisines. Les défauts sont le rendu d'avant ce réglage.

| Groupe | Réglages | Défaut |
|---|---|---|
| **Murs des maisons** | couleur du plan (celle de chaque bâtiment importé), une couleur, ou une nuance tirée au hasard le long de deux ou trois couleurs (`nuancer`, par morceaux) pour casser l'uniformité | couleur du plan |
| **Vitres** | une couleur, ou une nuance tirée entre deux | `#6F8AA6`, unique |
| **Fenêtres** | largeur, hauteur et entraxe (la densité), chacun entre un minimum et un maximum tirés par maison ; un minimum ne dépasse pas son maximum | 1 × 1,2 m, entraxe 2,4 m, sans variation |
| **Clôtures du voisinage** | afficher ; type (palissade, grillage, haie, mur : la hauteur est celle du type) ; couleur, qui suit le type tant qu'elle n'a pas été choisie | affichées, grillage gris vert clair translucide |

Ce qui est tiré au hasard l'est **par un tirage reproductible depuis la clé de l'objet**
(`apparenceVoisin`) : la scène ne change pas d'une ouverture à l'autre, ni entre la Vue 3D et
l'export GLB. La scène (`three/scene.ts`) applique la couleur tirée au prisme, au relevé et aux
détails ; la clôture du voisinage (`three/clotureVoisinage.ts`) prend le type et la couleur. Avant,
la case « Clôtures du voisinage » vivait dans les réglages de la Vue 3D : elle a rejoint ce groupe.

---

## 7. L'interface

Section « Façades et toit » de l'inspecteur (`ui/champs/facade.ts`), charger `design-ui` avant de la
toucher :

- **Forme** : « Croupes (pans sur chaque mur) » s'ajoute aux quatre formes. L'entrée « Non modélisé »
  n'est proposée qu'à un bâtiment sans toit ; ensuite, « Toit plat » dit « pas de toit » (§5.4).
- **Hauteur au faîtage** : note « déduite de la BD TOPO (± 1 m) » quand `source: 'bdtopo'`,
  « estimée : pas de hauteur dans la BD TOPO » quand `estime: true`. Modifier la hauteur fait
  passer la source à `'saisie'`.
- **Pente** : affichée (`penteDeg`, étendue au squelette), en lecture seule pour `'croupes'`.
- **Orientation du faîtage** : cachée pour `'croupes'`.
- **Couleur** : lue sur l'orthophoto (§6.1), rouge tuile à défaut ; la note dit « lue sur
  l'orthophoto » ou « tuile rouge / brune, couverture grise : orthophoto peu lisible ». La changer
  efface `origineCouleur`.

- **Toit en 3D** (bâtiment de la parcelle du projet, §11 à §13) : « Corps et pignons (LiDAR) » quand
  les corps ont été reconstruits, « Tel que mesuré (LiDAR) » quand une surface mesurée existe, « Un
  toit par corps » quand le contour s'est découpé, « Un seul toit » toujours. Le défaut est le premier
  proposé. Sous le choix, dès qu'une surface mesurée existe, la **carte des hauteurs** et du
  découpage (§13.4). En corps et pignons, la ligne « Corps » décrit chaque corps ; en surface
  mesurée, « Mesure » dit l'égout, le faîte et la grille ; en un toit par corps, « Toits » décrit
  chaque volume ; les réglages du toit unique ne se montrent qu'en « Un seul toit ».

La section s'affiche pour tout bâtiment qui porte un toit, même sans façade relevée.

---

## 8. Comment c'est vérifié

### 8.1 Avant d'écrire le code : la précision

Sur **10 bâtiments** au toit connu (maisons relevées en photo, ou mesurées) :

- `altitude_maximale_toit` est rempli sur au moins 8 ;
- `|H_BDTOPO − H_réel| ≤ 1 m` sur au moins 8 ;
- noter les cas de cheminée ou de lucarne qui portent le maximum.

Les dix feuilles GeoJSON brutes vont dans `tests/fixtures/bdtopo/` : ce sont aussi les entrées des
tests de §8.2. Si le critère échoue, la règle 7 passe à « pente 35° » partout et `H` ne sert plus
que d'écrêtage : à rediscuter avant d'implémenter.

### 8.2 Tests unitaires

`tests/unit/geometry/squelette.test.ts`, `tests/unit/model/toitBdTopo.test.ts`,
`tests/unit/model/migrations.test.ts`, `tests/unit/three/releve3d.test.ts` :

- **rectangle** : pans et hauteurs égaux au « quatre pans » de `plansDuToit` à 1 mm près ;
- **carré** : une pyramide, un seul sommet à `H` ;
- **L, T, U** : un faîtage par aile, une noue par angle rentrant, point le plus haut à `H` ;
- **contour à sommets alignés, contour dans le sens horaire** : même résultat ;
- **contour dégénéré** : `null`, puis repli sur le quatre-pans ;
- **les sept règles de §4**, chacune sur un bâtiment de fixture ;
- **écrêtage** : pan horizontal à `H`, aucun point au-dessus ;
- **actualisation** : toit `photo` gardé, toit `bdtopo` recalculé avec sa couleur gardée, toit absent
  ajouté ;
- **schéma** : 3 dès qu'un toit `'croupes'` existe, 1 ou 2 sinon ; migration 2 → 3 : toit posé sur
  un bâtiment BD TOPO, rien d'autre touché, rien rejoué sur un document déjà au schéma 3.

### 8.3 Dans l'application

**Fait** (serveur de développement, plateforme simulée, 1 440 px, Three.js r128 servi localement) :
un projet de schéma 2 portant trois bâtiments BD TOPO sans toit — en L, en T, un rectangle —
s'ouvre avec trois toits à croupes rouges, 2,10 m estimés (demi-largeur 3 m, 35°), aucune erreur ;
Vue 3D : un faîtage par aile, noues aux angles rentrants ; inspecteur : « Croupes (pans sur chaque
mur) », « pente 35° · estimée : pas de hauteur dans la BD TOPO », pas d'orientation de faîtage.

**Reste à faire** (réseau IGN requis) :

Nouveau plan depuis une adresse d'un pavillon en L : vue 3D, toit rouge sur les deux ailes, noue à
l'angle ; actualisation : toits recalculés, bilan qui les compte ; relevé d'un pignon : le toit
photo remplace le toit BD TOPO, puis une actualisation le garde. Enregistrement sur la plateforme
simulée, rechargement : toit relu à l'identique.

---

## 9. Limites connues et suites

| Limite | Effet | Suite possible |
|---|---|---|
| Pas de pignon dans la BD TOPO | une maison à deux pans apparaît à croupes | **fait (§10)** : le MNH LiDAR HD distingue deux pans, croupes et quatre pans, là où il existe ; sinon une façade relevée |
| `H` à ± 1 m, maximum pris sur une cheminée | faîtage trop haut ; l'écrêtage n'attrape que les cas extrêmes | **fait (§10)** : hauteur et égout mesurés sur le LiDAR, cheminées et arbres écartés comme aberrants |
| Un seul volume par bâtiment | un corps haut et une annexe basse sous le même contour reçoivent un seul toit | **fait (§11, §12)** : sur la parcelle du projet, le toit se garde tel que le LiDAR le mesure, et le contour se découpe en corps |
| Pas de pignon sans LiDAR | une maison rectangulaire du voisinage apparaissait à croupes | **fait (§4)** : la forme du contour décide — deux pans sur un rectangle allongé |
| Relevé de façade = une forme globale | une photo de pignon remplace le squelette par un deux-pans sur l'enveloppe | le relevé marque le mur photographié comme pignon (squelette pondéré, poids 0) au lieu de changer de forme |
| Rien en 2D | faîtages et noues invisibles sur le plan | les tracer en trait fin, en option |

---

## 10. Le toit mesuré sur le LiDAR HD (MNH)

### 10.1 Ce qu'on lit

Le **MNH** LiDAR HD de l'IGN (modèle numérique de hauteur, MNS − MNT) donne tous les 50 cm la
hauteur du sursol au-dessus du sol. Sur l'emprise d'un bâtiment, c'est la hauteur de sa couverture,
mesurée, et non deux altitudes photogrammétriques à un mètre près. Couche WMS
`IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93` (vérifiée au GetCapabilities ; sur une
maison du Vésinet : 0 au sol, 5 m à l'égout, 7,5 m au faîtage), lue comme le relief (`geo/relief.ts`) :
même service, même BIL 32 bits, même grille.

`geo/mnh.ts` lit **une petite grille par bâtiment** (son emprise plus 1 m, au pas de 50 cm ; au-delà
de 10 000 cellules, 1, 2 ou 5 m ; `lireGrilleSous` la rend entière, `lireHauteursSous` en tire les
mesures) et garde les cellules sous le contour, à plus de 0,25 m des murs (`RETRAIT_MNH_M` : la rive
n'est pas la couverture ; à 0,6 m, le retrait mangeait le bas des pans et ne distinguait plus un
pignon d'une croupe) — entier si le retrait ne laisse rien. `dallesLidarSur` compte d'abord les dalles LiDAR sur l'emprise des bâtiments retenus : sans
dalle, rien n'est lu.

### 10.2 L'ajustement

`facade/toitLidar.ts::ajusterToit(contour, mesures)` : chaque forme que Plan dessine, à hauteur
unité, donne un profil `f(q)` sur le contour ; les mesures `z = e + H · f(q)` rendent par moindres
carrés l'égout `e` et la hauteur de faîtage `H` (`H ≥ 0`). Candidats : plat, appentis (quatre
sens), croupes (squelette), deux pans et quatre pans sur chaque **axe** : le plus long mur, sa
perpendiculaire, et l'axe que les mesures dessinent elles-mêmes (`axeDesMesures` : la direction
de plus faible variance de la hauteur, retenue si elle s'écarte de 8° des deux autres — un faîtage
qui ne suit pas le mur). Une mesure à plus de 1,5 m du toit ajusté (`RESIDU_ABERRANT_M` : arbre,
cheminée, lucarne) est écartée, et l'ajustement refait. La forme au plus petit écart quadratique
moyen l'emporte, sans prime : à mesures égales, c'est la première de la liste. Un appentis n'est
retenu qu'à moins de 0,4 m d'écart (`ECART_MAX_APPENTIS_M`) : au-delà, il n'explique qu'une marche
entre deux corps. Et si les hauteurs se séparent en deux paquets à plus d'un mètre l'un de l'autre,
d'au moins un quart des mesures chacun (`deuxCorps`), on renonce d'emblée : deux corps sous un
contour, pas un toit. `diagnostiquerToit` liste les candidats et leur écart, pour comprendre un cas.

Garde-fous : au moins `ECHANTILLONS_MIN` = 20 mesures ; écart final sous `ECART_MAX_M` = 0,8 m,
sinon **aucune forme simple n'explique les mesures** (deux corps de hauteurs différentes sous un
contour, une tourelle) et le toit BD TOPO reste ; `H` sous `HAUTEUR_TOIT_MIN_M` ou pente sous
`PENTE_MIN_DEG` → plat ; pente au-delà de `PENTE_MAX_DEG` → on renonce (§4, mêmes seuils).

### 10.3 Quand, et ce qui est écrit

`app/toitsLidar.ts::toitsDepuisLidar`, après la couleur des toits (§6.1), à l'import depuis une
adresse (« Forme des toits sur le LiDAR HD… ») et à l'actualisation (ligne du bilan). Les deux
lectures se font dans le **repère du plan construit** (`importCadastre::projecteurDuPlan` : origine
au calage cadastral, le sommet nord de la parcelle) — jusqu'en octobre 2026, l'import les faisait
avec le projecteur du point de l'adresse, décalé de plusieurs dizaines de mètres : elles tombaient
à côté. Seuls les
bâtiments dont le toit vient de la BD TOPO ou d'une lecture LiDAR antérieure (`toitAAjuster`) ; un
toit lu sur une photo ou saisi n'est pas touché, et `toitActualise` (§5.3) recalcule un toit LiDAR
comme un toit BD TOPO avant la relecture. Les plus proches de la parcelle du projet d'abord, au plus
`MAX_BATIMENTS_LIDAR` = 150, dans `DELAI_TOITS_LIDAR_MS` = 20 s, quatre lectures à la fois.

Écrit : `toit = { forme, hauteur, angleFaitage, source: 'lidar' }`, la couleur et son origine
conservées. L'égout mesuré corrige `elevation` (la hauteur du prisme) quand il s'en écarte d'au moins
0,3 m et reste entre 2 et 40 m. L'inspecteur dit « ajustée sur le LiDAR HD de l'IGN ». Un service
muet ne bloque rien. Pour un bâtiment de la parcelle du projet (`bdtopo.surParcellePrincipale`), la
grille entière est lue (`lireGrille`) : elle donne les mesures de l'ajustement, le toit mesuré (§12)
et l'égout de chaque corps (§11) ; le bilan compte ces toits « gardés tels que mesurés ».

### 10.4 Vérifié

`tests/unit/facade/toitLidar.test.ts` (formes, bruit, arbre, renoncements), `tests/unit/geo/mnh.test.ts`
(grille demandée, retrait, service muet), `tests/unit/app/toitsLidar.test.ts` (éligibilité, ordre,
délai, bilan, toits gardés).

---

## 11. Un toit par corps de bâtiment (parcelle du projet)

Un bâtiment en L, en T ou en U n'a pas un toit mais plusieurs : un corps, une aile, chacun son
faîtage, son égout, parfois sa hauteur. Sur la parcelle du projet, celle qu'on regarde de près, le
contour est **découpé en corps** (`model/volumesToit.ts`) ; le voisinage garde un toit par bâtiment.

### 11.1 Le découpage

`decomposerEnRectangles(contour)` : le contour est tourné dans l'axe du plus long côté, **mis à
l'équerre** (`equerrer` : chaque côté ramené à 0° ou 90° s'il en est à moins de 15°, les côtés de
même sens fusionnés ; un contour biais rend `null`), ses **décrochés** de moins de 1,2 m lissés
(`lisserDecroches` : un ressaut, un conduit, une avancée de perron ne font pas un corps). Puis la
**couverture par rectangles maximaux** (`couvertureRectangles`) : sur la grille des abscisses et
ordonnées du contour, tout rectangle de cellules entièrement dedans qu'aucun autre ne contient ;
du plus grand au plus petit, ceux qu'il faut pour couvrir chaque cellule. Deux rectangles **se
chevauchent** — c'est voulu : un corps et une aile qui le pénètre ont chacun leur toit entier, le
plus haut l'emporte dans la 3D, et les noues naissent de leur rencontre. On renonce (`null`) si le
contour n'est pas rectiligne, si l'équerre change l'aire de plus de 15 %, s'il n'y a qu'un
rectangle, ou si l'un fait moins de 1,5 m de large (`LARGEUR_MIN_M`).

### 11.2 Les blocs par les hauteurs mesurées

Les murs d'une maison n'ont pas tous la même hauteur, et un rectangle du contour peut cacher deux
blocs : un corps à deux niveaux et une annexe à un seul, un toit-terrasse accolé à un toit en pente.
Quand la surface mesurée existe (§12), chaque rectangle — y compris le seul rectangle d'une maison
rectangulaire (`rectanglesDuContour`) — est **recoupé là où la couverture fait une marche**
(`model/toitMesure.ts::decouperParHauteur`) : sur la grille des cellules du rectangle, chaque
colonne puis chaque ligne a sa hauteur basse (dixième centile) ; une coupe est une position où
cette hauteur saute d'au moins 1,5 m (`SEUIL_MARCHE_M`) sur un mètre **et** où les deux côtés,
pris en entier, diffèrent d'autant — un pan en pente monte doucement, une marche d'un coup. La
coupe la plus franche l'emporte, jusqu'à deux fois par rectangle (`decouperParHauteurs`) ; un bloc
fait au moins 1,5 m (`LARGEUR_BLOC_MIN_M`). Un morceau qui tient aux trois quarts dans un autre
rectangle de départ (un corps recoupé à la marche de l'aile qui le pénètre) n'est pas un bloc de
plus : il est oublié.

Chaque bloc prend alors son égout (`egoutDansRect`) et **la hauteur de chacun de ses murs**
(`hauteurMurMesuree` : le dixième centile des hauteurs de la surface le long du mur, à 50 cm en
retrait — l'égout sous un pan, le dessus d'un mur qui monte jusqu'à un toit plat, le bas d'un
pignon), tenue entre l'égout et le faîte : `VolumeToit.hauteursMurs[i]` pour le mur de `pts[i]` à
`pts[i + 1]`. L'inspecteur le dit (« murs de 3,9 à 7,2 m ») quand ils diffèrent d'au moins 30 cm.

### 11.3 Les toits des corps

Chaque rectangle reçoit le toit de sa forme (`toitDuRectangle`) : **deux pans** dans son axe s'il
est allongé d'au moins 1,25, **quatre pans** sinon, à la **pente du toit du bâtiment**
(`penteDuToit` : celle de la BD TOPO, 35° à défaut), `estime: true`. À l'import (`cadastreObjets`)
et à l'actualisation, ce sont ces volumes par défaut (`volumesParDefaut`). Après la lecture LiDAR
(`app/toitsLidar.ts::volumesDepuisLidar`), chaque corps est **ajusté sur les mesures qui tombent
dedans** (§10.2) et prend son **égout** : lu dans la surface mesurée (§12, dixième centile des
cellules du rectangle) quand on l'a, sinon celui de l'ajustement. Un corps que le LiDAR n'explique
pas garde son toit par défaut.

### 11.4 Données et 3D

`ObjetPlan.volumesToit: VolumeToit[] | null` (`{ pts, toit, egout? }`) ; `modeToit` dit ce que la
3D montre (§12.3). Sérialisé et copié tels quels. La couleur de couverture reste celle du `toit` du
bâtiment, réglée une fois (`toitDuVolume`). En 3D (`three/scene.ts`), **un prisme par corps** à son
égout, un toit par corps (`releve3d::poserToit`), un débord et une gouttière par corps, la cheminée
sur le premier (le plus grand) ; les fenêtres suivent la hauteur du mur de leur corps
(`hauteurDuMur`). `volumesActifs(o)` rend les corps à dessiner : au moins deux, sauf « Un seul
toit ». L'inspecteur décrit chaque corps (`decrireVolumes` : « Corps 12,0 × 8,0 m : deux pans ·
égout 6,0 m »).

### 11.5 Vérifié

`tests/unit/model/toitMesure.test.ts` (murs, marches, blocs), `tests/unit/facade/ouvertures.test.ts`
(hauteur d'un mur mesuré, fenêtres qui montent avec lui), `tests/unit/model/volumesToit.test.ts` (équerre, L, T, U, rotation, renoncements, toits et
descriptions), `tests/unit/app/toitsLidar.test.ts` (égouts par corps), `tests/unit/three/scene.test.ts`
et `detailsBatiment.test.ts` (prismes, toits et débords par corps).

---

## 12. Le toit tel que le LiDAR le mesure (parcelle du projet)

### 12.1 Pourquoi

Les formes simples ne décrivent pas toutes les maisons. Le 2 allée des Limites au Vésinet : un
corps dont le pan nord-ouest monte de 3,6 m à 7,8 m puis un dessus presque plat jusqu'au mur
sud-est, une aile basse à un pan de 4,3 m à 2,5 m. Aucun des gabarits n'y colle (meilleur écart
0,68 m), et le découpage en corps ne rend ni le dessus plat ni le faîtage décentré. Or le MNH
donne, tous les 50 cm, la hauteur réelle de la couverture : pour les bâtiments de la parcelle du
projet, **on garde cette grille et la 3D la dessine telle quelle**. Les formes simples restent pour
le voisinage, et comme repli sans LiDAR.

### 12.2 La grille nettoyée

`model/toitMesure.ts::toitMesureDepuisGrille(grille, contour)` : la grille du MNH (§10.1) est
**recadrée** sur les cellules du contour (les autres n'existent pas : au mur, la surface prolonge
les cellules présentes), puis **nettoyée** (`nettoyer`). Deviennent des **trous** : une cellule
sans donnée, sous 0,5 m (`SOL_M`, le sol vu entre deux toits), ou au-dessus du neuvième décile des
hauteurs de plus de 1 m (`DEPASSEMENT_M` : un arbre sur le toit domine le gros du toit — au Vésinet,
des houppiers de 10 à 13 m sur un coin d'un toit de 7,8 m), et, l'égout connu, une cellule plus
basse que lui de 0,3 m (`SOUS_EGOUT_M` : le mur vu de biais). Les trous sont **bouchés de proche en
proche** (`boucher`) : chaque cellule nulle prend la médiane de ses voisines présentes (au moins
trois), passe après passe, jusqu'à ce qu'il n'en reste plus — un houppier de 4 × 4 cellules se
comble depuis la couverture autour. Puis, en deux passes, une cellule plus haute de 2 m
(`SAILLIE_M`) que la médiane de ses voisines (une cheminée, le bord d'un houppier) est ramenée à
elles. Enfin **lissée** (`lisser`) : une médiane 3 × 3, de quoi effacer les marches de 50 cm sans
arrondir les faîtages (une moyenne fondait les arêtes : le toit avait l'air coulé). L'**égout** est le dixième centile des cellules à
plus de 0,5 m des murs (`RETRAIT_EGOUT_M` : au bord, le MNH mêle la couverture et le mur), le
**faîte** le maximum. Il faut au moins 20 cellules valides (`CELLULES_MIN`) et la moitié des
cellules du contour, sinon `null` : le LiDAR n'y voit pas de toit. `hauteurToitMesure(t, x, y)`
interpole entre les quatre cellules autour d'un point, les manquantes prenant les présentes ;
`egoutDansRect(t, rect, contour)` lit l'égout d'un corps, loin des murs.

Données : `ObjetPlan.toitMesure: ToitMesure | null` — `{ pas, x0, y0, nx, ny, z: (number | null)[],
egout, faite, source: 'lidar' }`, lignes du nord au sud, en mètres au-dessus du sol, dans le repère
du plan. Quelques centaines de cellules par maison ; sérialisé et copié tel quel ; remis à `null` par
l'actualisation quand le contour change (le LiDAR le relit ensuite). L'égout du toit entier devient
`elevation` (la hauteur du prisme hors corps) quand il s'en écarte d'au moins 0,3 m.

### 12.3 En 3D

`three/toitMesure3d.ts::ajouterToitMesure3d` : le contour est triangulé (`trianguler`), chaque
triangle **subdivisé** par les milieux de ses côtés jusqu'à 50 cm (`PAS_MAILLE_M`), et chaque
sommet prend la hauteur mesurée là — **jamais sous l'égout du corps** qui le porte (§11), ni sous
`elevation` hors corps, plus 5 cm (`LEVEE_M` : posée exactement sur le dessus du prisme, la surface
se battrait avec lui) : la surface se pose sur les murs. Les sommets sont partagés au centimètre,
la couleur et la matière sont celles du `toit` du bâtiment (§6.2, un carreau de tuiles par mètre).
Le long de chaque mur, entre l'égout et la surface — 5 cm, ou un pignon, un mur qui monte jusqu'à
un dessus plat — une **rehausse** verticale en couleur de mur comble l'écart (`NOM_REHAUSSE`), par
bandes de 50 cm. Les prismes montent à l'égout de chaque corps ; les formes
simples, le débord, la gouttière et la cheminée ne se posent pas (`sansToit`) ; les arêtes, le
soubassement et les fenêtres restent — et les fenêtres suivent **la hauteur mesurée de leur mur**
(§11.2, `facade/ouvertures.ts::hauteurDuMur` : le mur du bloc le plus proche du milieu de la
façade) : deux rangs sur le mur qui monte jusqu'au dessus plat, un seul sous le pan. La surface
est ombrée **par facettes** (`flatShading`) : chaque triangle de 50 cm est un plan, et un pignon
qui avance depuis le faîtage se lit comme des pans, là où l'ombrage lissé en faisait une bosse.

`modeToitActif(o)` choisit ce que la 3D montre : `modeToit` quand il est tenable, sinon la **surface
mesurée** quand elle existe, sinon **un toit par corps** quand il y en a deux, sinon le **toit
unique**. L'inspecteur le règle (§7, « Toit en 3D »).

### 12.4 Vérifié

`tests/unit/model/toitMesure.test.ts` (recadrage, arbre, trou, sol, deux corps et leurs égouts,
renoncements, interpolation, mode), `tests/unit/three/toitMesure3d.test.ts` (maille, hauteurs,
rehausses, égout par corps), `tests/unit/app/toitsLidar.test.ts` (grille lue pour la parcelle du
projet seule, toit mesuré écrit, bilan), `tests/unit/ui/champsToitMode.test.ts` (le choix et ce qu'il
cache). Vu à l'œil sur le 2 allée des Limites (Le Vésinet) et à Saint-Cloud.

---

## 13. Corps et pignons, reconstruits sur la mesure (parcelle du projet)

### 13.1 Pourquoi

La surface mesurée (§12) est fidèle, mais elle ne dit pas ce qu'elle montre : ni où sont les murs,
ni où passe le faîtage, ni ce qui est un pignon. Au 2 allée des Limites, la lecture d'un couvreur est
nette (carte du §13.4) : un corps principal à deux pans, faîtage à 7,6 m dans la longueur ; deux
pignons qui partent du faîtage pour venir dresser leur triangle sur la façade sud-est ; une annexe
basse à 4,3 m ; une aile à 4,5 m. C'est ce que Plan reconstruit et dessine, **par défaut** dès que la
surface mesurée existe (`modeToit: 'corps'`). « Tel que mesuré » reste proposé.

### 13.2 La reconstruction (`facade/toitCorps.ts::reconstruireCorps`)

1. **Les corps.** Les rectangles du contour (`model/volumesToit.ts::rectanglesDuContour` — un seul
   pour une maison rectangulaire), coupés aux **marches** de la couverture (§11.2,
   `decouperParHauteurs`). Le seuil de marche passe de 1,5 m à **0,8 m** (`SEUIL_MARCHE_M`) : une
   marche se reconnaît à sa brutalité, la hauteur changeant sur le mètre qui la franchit au moins
   1,6 fois plus que sur le mètre d'avant ou d'après — un pan raide change autant partout, un faîtage
   ne change pas. Puis, deux fois au plus, la **coupe par le modèle** (`meilleureCoupe`) : deux toits
   simples plutôt qu'un quand l'écart tombe aux deux tiers (`GAIN_COUPE`), qu'il valait au moins
   25 cm, et que les deux toits diffèrent de 60 cm (faîtage ou égout) ; les mesures des pignons du
   rectangle entier n'y comptent pas — un pignon n'est pas un corps.
2. **Le toit d'un corps** (`ajusterCorps`). Pour chaque sens de faîtage et chaque position du faîtage
   dans la largeur (tous les 25 cm, murs compris : un appentis), la hauteur du faîtage et l'égout de
   chaque pan par moindres carrés. L'ajustement est **robuste vers le haut** : ce qui dépasse le toit
   ajusté de plus de 40 cm (`DEPASSEMENT_GARDE_M`) est écarté, passe après passe — un pignon, un
   arbre, une lucarne ajoutent toujours de la hauteur au pan. Sans cela, au Vésinet, les deux pignons
   qui couvrent près de la moitié du pan sud-est le relevaient d'un mètre et n'étaient plus vus.
   Garde-fous : pente au plus 60°, égouts au moins 1,5 m ; un toit dont aucun pan ne monte de 30 cm
   est **plat**. L'écart se compare d'une position à l'autre sur toutes les mesures, ce qui dépasse
   le pan comptant peu, ce qui passe dessous pleinement.
3. **Les pignons qui partent du faîtage** (`detecterPignons`). Le long du mur de chaque pan, à 50 cm
   en retrait, les tronçons où la mesure dépasse le pan de 80 cm (`SURPLUS_PIGNON_M`), larges de 1,5
   à 6 m (et pas plus des trois quarts du mur) ; chacun est retenu si son mur est une **façade**
   (dehors juste devant : `geometry/facadeExterieure.ts`) et si, vers l'intérieur, la mesure reste à
   sa hauteur, nettement au-dessus du pan, sur 1,5 m au moins, jusqu'à ce que le pan le rattrape. Sa
   hauteur est le 80e centile du profil le long du mur ; sa profondeur, celle où il rencontre le pan
   (jusqu'au faîtage quand il en part). Le corps est ensuite **réajusté sans ses pignons**, et les
   pignons relus sur le toit réajusté (`corpsAvecPignons`).

Données : `ObjetPlan.corpsToit: CorpsToit[] | null` — `{ pts (pts[0] → pts[1] le long du faîtage),
posFaitage, faitage, egouts: [côté pts[0]-pts[1], côté opposé], pignons: { pan, debut, fin,
faitage, profondeur }[], ecart }`. Écrit par `app/toitsLidar.ts` avec le toit mesuré, sérialisé et
copié tel quel, remis à `null` par l'actualisation quand le contour change. Champ facultatif : une
version précédente l'ignore et montre la surface mesurée.

Au Vésinet : corps principal 9,9 × 6,5 m, deux pans, faîtage 7,6 m, égouts 6,1 / 5,4 m, deux pignons
de 2,5 et 2,9 m partant du faîtage sur la façade sud-est ; annexe 4,2 × 9,9 m, faîtage 4,3 m ; aile
5,9 × 7,8 m, faîtage 4,5 m.

**Les croupes** (`avecCroupesSiMieux`). Le modèle des corps n'a que des pignons de bout : un
quatre-pans s'y lisait en appentis presque plat (AE 100 : 5,5 m au lieu de 7,7 m). Chaque corps sans
pignon est donc comparé à la lecture des formes simples du même rectangle (`corpsDepuisFormes`,
§13.7). Quand celle-ci donne des croupes et que son écart à la mesure tombe aux quatre cinquièmes,
elle l'emporte. L'écart de comparaison est symétrique (borné à 1,2 m dans les deux sens). Celui de
l'ajustement, qui compte peu ce qui dépasse le pan, préférait un toit écrasé. AE 101 garde ses corps
au centimètre (test sur le relevé réel).

### 13.3 Le dessin (`three/toitCorps3d.ts`)

- **Un prisme par corps** à son égout le plus bas ; au-dessus, en couleur de mur, le mur d'un pan plus
  haut que l'autre, et les **murs de bout** jusqu'au faîtage (le pignon, ou le mur haut d'un
  appentis).
- **Les pans**, prolongés d'un débord à l'égout (35 cm) et d'une rive aux bouts (20 cm) — **sur les
  façades seulement** : contre un autre corps, le toit s'arrête au mur, sans quoi le débord
  traversait le mur voisin. La même règle vaut désormais pour le débord du mode « Un toit par
  corps » (`detailsBatiment::poserDebord`).
- **Chaque pignon** : ses deux pans perpendiculaires, du mur jusqu'à ses **noues** (de son pied sur
  le mur au bout de son faîtage), et son triangle sur la façade. Le grand pan est **entaillé** le
  long des mêmes noues, débord compris : il ne passe plus sous le pignon pour ressortir devant son
  triangle. Un pignon qui touche le bout du corps s'arrête au nu du mur de bout. Le grand pan,
  non convexe, se triangule par oreilles.
- **Les fenêtres** se posent sur les murs des corps qui donnent dehors, à la hauteur de chacun
  (niveaux comptés sur la hauteur du mur), avec une fenêtre dans chaque pignon qui part du faîtage
  et dans chaque pignon de bout d'un deux-pans, centrées dans le triangle au-dessus de l'égout,
  quand il fait au moins 1,8 m de haut (`facade/ouvertures.ts::fenetresDesPignons`) ; la porte
  d'entrée sur le premier corps seul. Ni débord simple ni cheminée : la reconstruction les remplace.

En mode « Tel que mesuré », les murs suivent désormais le **contour lui-même**, montés à l'égout le
plus bas puis jusqu'à la surface par les rehausses : des prismes par rectangle laissaient la surface
pendre dans le vide là où un rectangle ne couvrait pas le contour. Les fenêtres y suivent la hauteur
mesurée de chaque mur.

### 13.4 La carte des hauteurs (`ui/champs/carteToit.ts`, `zones/composants/CarteToit.tsx`)

Sous « Toit en 3D », un champ `carte` sur toute la largeur : les cellules de la surface mesurée sous
le contour, du bleu (le plus bas) au rouge (le plus haut), dans l'**axe du bâtiment** (son plus long
côté à l'horizontale) avec une flèche du nord ; par-dessus, le contour, les corps en tirets, leurs
faîtages (avec leur hauteur), les pignons et leur faîtage. Une légende nomme chaque trait et donne
l'étendue des hauteurs : la couleur ne parle jamais seule. Chaque cellule dit sa hauteur au survol.
Les traits passent par les jetons (`--ink`, `--ok`, `--accent`) ; seules les couleurs des cellules
sont calculées.

### 13.5 Vérifié

`tests/unit/app/toitsLidar.test.ts` (corps du voisin, option décochée), `tests/unit/facade/toitCorps.test.ts` (deux pans symétrique et décalé, appentis, plat, pignons d'un
long pan, pas de pignon sur un mur intérieur, corps et annexe à la marche, coupe par le modèle,
contour de biais), `tests/unit/three/toitCorps3d.test.ts` (pans, mur haut, entaille du pignon,
débord sur façade seulement), `tests/unit/facade/fenetresPignons.test.ts`,
`tests/unit/ui/champsToitMode.test.ts` (défaut, options, carte, descriptions),
`tests/unit/zones/inspecteur-champs.test.ts` (le champ carte rendu dans les trois classes). Vu à l'œil
sur le 2 allée des Limites.

### 13.6 Le voisinage

Une case de la section « Voisinage (3D) » de la parcelle, **« Toits en corps et pignons », cochée par
défaut** (`ReglagesVoisinage3d.toits.corps`), étend la reconstruction aux maisons voisines. À l'import
et à l'actualisation, `app/toitsLidar.ts` lit alors la grille entière sous chaque maison voisine (la
même requête que ses mesures), et pose ses `corpsToit`.

- Sur une **parcelle mitoyenne** — une parcelle qui partage au moins 1 m de limite avec celle du
  projet, à 50 cm près (`batimentsMitoyens`, `model/mitoyennete.ts`) —, le **calcul entier**, celui de la maison du projet :
  coupe par le modèle comprise, et la grille gardée (`toitMesure`) : la carte des hauteurs et
  « Tel que mesuré » s'y offrent aussi. Ce sont les maisons qu'on voit de près depuis le jardin.
  Une maison mitoyenne dont aucun corps ne se lit (un toit sous les arbres) ne garde pas sa grille :
  dessinée telle quelle, elle montrerait le feuillage ; elle revient à la forme simple.
- Plus loin, la **version allégée** : sans la coupe par le modèle, de loin la part la plus lourde
  (482 ms au Vésinet, 51 ms sans, pour le même résultat : `reconstruireCorps(…, { coupes: false })`),
  et sans garder la grille, qui alourdirait le projet de quelques kilo-octets par maison. Les plus proches d'abord, dans le délai et le nombre de maisons de la lecture LiDAR
(§10.3) ; le bilan les compte (« n toit(s) du voisinage en corps et pignons »).

Les mêmes mitoyennes bornent le cadrage par défaut de la Vue 3D (`procheDuProjet`, dans
`etendueDeLaScene`) : la parcelle du projet, ses objets, les mitoyennes et leurs maisons ; le reste du
voisinage importé se voit en reculant.

Décochée : rien n'est lu de plus, et la 3D montre les formes simples même pour une maison qui porte
déjà ses corps — c'est un réglage d'affichage (`sale: false`, pas d'annulation, permis en lecture
seule). Cochée sur un plan dont aucun voisin n'a encore de corps, la note dit qu'ils seront « lus à
la prochaine actualisation IGN ». Une maison voisine en corps reçoit ses fenêtres sur les murs de ses
corps, aux dimensions tirées par la section (§6.4). Le critère de voisinage est celui de la BD
TOPO : un bâtiment importé hors de la parcelle du projet (`model/fonctions.ts::surParcelleDuProjet`).

**La végétation** (`app/toitsLidar.ts::corpsVraisemblables`). Le LiDAR voit la cime d'un arbre qui
couvre un bâtiment : un corps dont l'égout dépasse de plus de 3 m la hauteur BD TOPO du bâtiment
(`hauteurRetenueM`, à défaut `hauteurM`) est écarté. Exemple : un abri de 2,70 m à côté d'AE 101
devenait une tour de 15 m. Sans corps restant, le bâtiment garde sa forme simple, et une maison
mitoyenne ne garde pas sa grille. Quand l'égout de toute la surface dépasse ce seuil
(`mesureVraisemblable`), ni la surface ni la forme ajustée ne sont gardées : pas de relief de
feuillage, pas de hauteur d'égout tirée d'un houppier. Sans hauteur BD TOPO, rien n'est écarté.

### 13.7 Les contours de biais, le recalage et les croupes

Le modèle des corps (§13.2) part des rectangles du contour. Un contour BD TOPO qui a un côté de
biais ne se découpe pas (`rectanglesDuContour` rend null), et la 3D montrait alors la surface brute.
Exemple : 2 allée des Limites, parcelle AE 103.

- **Recalage d'un bloc** (`facade/toitCorps.ts::decalageSurMesure`, appelé par
  `app/toitsLidar.ts::recalerSurLidar`). Pour la maison du projet et les maisons mitoyennes, si
  plus de 12 % des cellules sous le contour sont non bâties (moins de 2,5 m), la grille est relue
  3 m plus large. Le décalage retenu, au pas de 25 cm et à 3 m au plus, maximise ce qui est bâti
  sous le contour et non bâti dans une bande de 0,5 à 1,5 m autour. Le bâtiment entier se déplace
  alors d'un bloc : `pts` est translaté, sa forme ne change pas, et le plan suit. AE 103 : 15 % de
  non bâti, décalage (−1 ; −1,75) m. AE 101 : 5,5 %, aucun recalage. Le bilan compte les bâtiments
  recalés.
- **Mise à l'équerre** (`contourEquerre`). L'axe retenu est celui qui aligne la plus grande
  longueur de côtés (le plus long côté peut être le biais). Chaque côté de biais devient une
  marche, dont le ressaut tombe au droit d'un autre sommet du contour, à défaut au milieu.
- **Tranches** (`model/volumesToit.ts::rectanglesEnTranches`). Le contour à l'équerre est coupé
  perpendiculairement à l'un de ses axes ; les rectangles maximaux y tiraient une bande d'un bout à
  l'autre de la maison.
- **Formes simples** (`corpsDepuisFormes`). Chaque tranche est lue par `facade/toitLidar.ts::
  ajusterToit` sur la grille brute : deux pans, croupes ou quatre pans (faîtage dans la longueur,
  croupes à la pente des pans : `CorpsToit.croupes`), appentis (plat en deçà de 10°), plat. À
  défaut, le modèle des corps. Le modèle des corps, lui, n'a pas changé : les contours qui se
  découpaient gardent leurs corps au centimètre (test sur le relevé réel d'AE 101,
  `tests/unit/facade/toitCorpsReprise.test.ts`).
- **Complétion** (`completerSurContour`, `corpsEtendu`). La marche rend d'un côté du biais ce qu'elle
  prend de l'autre : le triangle pris n'était sous aucun corps, donc sans toit. Chaque corps, du plus
  haut au plus bas, avance ses côtés libres (que les autres ne bordent pas pour moitié) tant que la
  bande devant lui contient du contour qu'aucun autre ne couvre. Étendu le long du faîtage, il
  l'allonge (croupes et hauteurs restent) ; en travers, ses pans descendent à leur pente.
- **Dessin** (`three/toitCorps3d.ts::facettesSurContour`). Des corps lus en reprise ne suivent plus
  le contour : le prisme est le contour lui-même, à l'égout le plus bas ; les toits des corps sont
  découpés sur lui, sans débord ; les murs montent jusqu'au toit, pas à pas, le long du contour ; les
  fenêtres suivent les murs du contour. Le bâtiment garde ainsi la forme du plan. Une croupe est un
  triangle, son mur de bout s'arrête aux égouts, et un bout sous une croupe n'a pas de fenêtre de
  pignon. La carte trace les arêtiers.

