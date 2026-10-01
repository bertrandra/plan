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
| 3 | `altitude_maximale_toit` ou `altitude_minimale_toit` absente | **croupes**, pente **35°**, `estime: true` |
| 4 | `H < 0,5 m` | **plat** (toit-terrasse, ou bâtiment trop bas pour qu'on distingue) |
| 5 | pente calculée `< 10°` | **plat** |
| 6 | pente calculée `> 55°` | **croupes** à 45°, écrêté à `H` (§3.3) |
| 7 | sinon | **croupes**, `hauteur: H` |

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
| Pas de pignon | une maison à deux pans apparaît à croupes | lire les pignons sur le MNS, ou sur une façade relevée (déjà possible) |
| `H` à ± 1 m, maximum pris sur une cheminée | faîtage trop haut ; l'écrêtage n'attrape que les cas extrêmes | ajuster le squelette sur le MNS LiDAR HD de l'IGN (grille 50 cm) : quelques paramètres par moindres carrés, comme `classerProfil` |
| Un seul volume par bâtiment | un corps haut et une annexe basse sous le même contour reçoivent un seul toit | découper par volumes (le relevé en L le fait déjà pour la partie basse) |
| Relevé de façade = une forme globale | une photo de pignon remplace le squelette par un deux-pans sur l'enveloppe | le relevé marque le mur photographié comme pignon (squelette pondéré, poids 0) au lieu de changer de forme |
| Rien en 2D | faîtages et noues invisibles sur le plan | les tracer en trait fin, en option |
