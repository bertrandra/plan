# Clôture, portails et portillons — spécification

**Version :** 1.0 — non publiée
**Statut :** spécification de référence de la clôture de la parcelle et de ses accès
**Compagnons :** [`spec-releve-facade.md`](spec-releve-facade.md) (le modèle « un côté du contour,
une abscisse le long du côté » dont celle-ci reprend les conventions), [`spec-ihm-zones.md`](spec-ihm-zones.md),
[`spec-ihm-mobile.md`](spec-ihm-mobile.md), [`RELEASE.md`](RELEASE.md)

---

## 1. Ce que fait la fonction

La parcelle du projet porte sa clôture. Jusqu'ici, c'était une bande uniforme sur tout le pourtour :
une hauteur, une couleur, une texture, rendue en 3D seulement. Désormais :

1. **chaque côté du contour** a son type de clôture — palissade bois, grillage, haie, mur, ou
   rien — avec sa hauteur, sa couleur et sa texture, et au besoin un **soubassement** maçonné
   (un muret sous un grillage, sous une palissade ou sous une haie). Les côtés qu'on ne règle pas
   suivent un **réglage par défaut** ;
2. des **portails et portillons**, en nombre quelconque, posés sur un côté à une distance d'un
   sommet, avec leurs dimensions, leur mode d'ouverture (un battant, deux battants, coulissant),
   leur sens, leur forme (droit, chapeau de gendarme, chapeau de gendarme inversé, bombé, concave),
   leur remplissage, leur matériau, leur couleur, leurs piliers, leur retrait par rapport à
   l'alignement, et une motorisation ;
3. la **3D** : chaque tronçon de clôture dans sa matière, les piliers, les vantaux — fermés ou
   ouverts, au choix de l'affichage ;
4. le **plan 2D à l'écran** : la clôture doublée le long de la limite, dans un trait propre à chaque
   type, et les accès à la manière d'un plan d'architecte (coupure du trait, arc de débattement
   d'un battant, course d'un coulissant) ;
5. un **garde-fou PLU** : une hauteur maximale sur rue et une en limite séparative, saisies par
   l'utilisateur d'après le règlement, et un avertissement quand un côté les dépasse ;
6. la **mitoyenneté** d'un côté, pour l'affichage et un chiffrage futur.

### 1.1 Ce qui a été décidé avant d'écrire une ligne

| Question | Décision | Pourquoi |
|---|---|---|
| La clôture est-elle un objet du plan ou un trait de la parcelle ? | **Un trait de la parcelle** (`ObjetPlan.cloture`), comme le lieu, le fond orthophoto et le PLU | Elle borne la parcelle ; un objet à part se désaligne d'elle au premier déplacement de sommet |
| Comment désigner un côté et une position ? | **Par l'indice du côté et une abscisse en mètres depuis le bord gauche vu de dehors**, exactement comme une ouverture de façade (`OuvertureFacade`) | Une seule convention pour tout ce qui s'accroche à un contour ; la 3D et le plan ont déjà le repère (`facade/geometrie.ts`) |
| Que deviennent les quatre anciens champs ? | **Ils restent écrits** et font office de réglage par défaut ; la structure `cloture` ne s'écrit que quand on l'a touchée | Un projet enregistré hier se relit au bit près (`projet.json` du témoin) et un lecteur ancien y retrouve sa clôture |
| La clôture entre-t-elle dans les exports ? | **Pas dans cette version** : le plan à l'écran seulement, comme les ouvertures relevées | Les exports SVG, PDF et DXF sont figés par leurs empreintes ; les y ajouter est un événement de version majeure (`RELEASE.md`) |
| Les portails sont-ils chiffrés ? | **Non** | La nomenclature chiffrée est celle de la terrasse ; un chiffrage de clôture changerait les quantités, donc une version majeure |
| Où saisir la hauteur maximale du PLU ? | **À la main**, sur la parcelle | La fiche PLU interrogée donne le règlement en lien, pas la hauteur en champ structuré |

### 1.2 Ce que cette version ne fait pas (voir §10)

- Pas de chiffrage, pas d'export.
- Pas d'accessoires (coffret de compteurs, boîte aux lettres, interphone).

---

## 2. Modèle de données

Tout vit sur la parcelle du projet (`model/fonctions.ts::parcelleDuProjet`), dans
`ObjetPlan.cloture`, typé dans `model/types.ts` et lu par `model/cloture.ts`, seul endroit qui
connaît les valeurs par défaut.

```ts
type TypeCloture = 'aucune' | 'palissade' | 'grillage' | 'haie' | 'mur';
type ParementMur = 'enduit' | 'pierre' | 'brique' | 'parpaing' | 'bardage';
type EssenceHaie = 'laurier' | 'thuya' | 'charme' | 'photinia' | 'troene' | 'champetre';
type Limite = 'rue' | 'separative';

interface ReglageCloture {
  type: TypeCloture;
  hauteur: number;                      // m, hors soubassement
  couleur?: string;
  texture?: TextureAppliquee | null;
  lames?: 'horizontales' | 'verticales';   // palissade
  occultante?: boolean;                 // palissade, grillage (brise-vue)
  grillage?: 'souple' | 'rigide';
  essence?: EssenceHaie;                // haie
  epaisseur?: number;                   // haie (0,6 m), mur (0,2 m)
  taillee?: boolean;                    // haie
  parement?: ParementMur;               // mur
  couvertine?: boolean;                 // mur
  soubassement?: { hauteur: number; parement: ParementMur; couleur?: string; texture?: TextureAppliquee | null } | null;
}

interface CoteCloture extends ReglageCloture {
  cote: number;                         // indice du côté : de pts[cote] à pts[cote + 1]
  limite?: Limite;                      // sur rue ou en limite séparative
  mitoyenne?: boolean;
}

type OuverturePortail = 'battant-1' | 'battant-2' | 'coulissant';
type FormePortail = 'droit' | 'chapeau-de-gendarme' | 'chapeau-inverse' | 'bombe' | 'concave';
type RemplissagePortail = 'plein' | 'ajoure' | 'semi';
type MateriauPortail = 'aluminium' | 'pvc' | 'bois' | 'fer';

interface Portail {
  nature: 'portail' | 'portillon';
  cote: number;
  x: number;                            // m depuis le bord gauche du côté, vu de dehors
  largeur: number;
  hauteur: number;
  ouverture: OuverturePortail;
  sens: 'interieur' | 'exterieur';      // battants
  refoulement: 'gauche' | 'droite';     // coulissant : de quel côté le vantail se range
  petitVantail: 'aucun' | 'gauche' | 'droite';   // deux battants inégaux (un tiers / deux tiers)
  forme: FormePortail;
  fleche: number;                       // m : hauteur de la courbe, formes non droites
  remplissage: RemplissagePortail;
  materiau: MateriauPortail;
  couleur: string;
  texture?: TextureAppliquee | null;
  piliers: { largeur: number; hauteur: number; parement: ParementMur; couleur?: string; chapeau: boolean } | null;
  retrait: number;                      // m depuis l'alignement, vers l'intérieur
  motorise: boolean;
  ouvert?: boolean;                     // réglage d'affichage de la 3D
}

interface Cloture {
  active: boolean;
  defaut: ReglageCloture;
  cotes: CoteCloture[];                 // seulement les côtés réglés à part
  portails: Portail[];
  hauteurMaxRue?: number;               // m, d'après le PLU
  hauteurMaxSeparative?: number;
}
```

Règles :

- **Lecture** : `clotureDe(parcelle)` rend toujours une `Cloture` complète. Sans `cloture`, elle se
  construit des quatre anciens champs (`clotureActive`, `clotureHauteur`, `clotureCouleur`,
  `clotureTexture`) : une palissade de leur hauteur, de leur couleur et de leur texture. Le réglage
  d'un côté se lit par `reglageDuCote(cloture, i)` : son entrée, sinon le défaut.
- **Écriture** : la première écriture de l'inspecteur pose `cloture` sur la parcelle (par
  `clotureDe` en mode « créer »). Les quatre anciens champs sont **tenus à jour** avec `active` et
  le défaut, pour les lecteurs qui ne connaissent que ceux-là.
- **Fichier** : `io/serialisation.ts` n'écrit `cloture` que présent, copié en profondeur (même
  règle que `facades` et `toit`) ; `model/normalisation.ts` le copie de même à la lecture. Un
  projet qui n'en a pas garde au bit près la forme d'avant.
- **Valeurs par défaut** par type (`model/cloture.ts`) : palissade 1,80 m brun, grillage 1,50 m
  gris rigide, haie 1,80 m vert épaisseur 0,60 m, mur 1,80 m enduit épaisseur 0,20 m. Un portail
  naît à 3,50 × 1,60 m, deux battants vers l'intérieur, droit, plein, aluminium gris anthracite,
  avec deux piliers de 0,30 m ; un portillon à 1,00 × 1,60 m, un battant.
- **Cohérence** : un accès dont `x + largeur` dépasse la longueur du côté, ou un coulissant sans
  place de refoulement, reste enregistré mais signalé par une alerte ; la 3D et le plan le tronquent
  au côté. Supprimer un sommet renumérote les côtés : les entrées `cotes` et `portails` qui pointent
  au-delà du dernier côté sont ignorées à la lecture, jamais effacées.

---

## 3. Inspecteur (Z5)

Deux sections sur la parcelle du projet, rangées dans la famille **Construction** au doigt
(`familleDe`), et visibles sur elle seule : une parcelle voisine n'a ni clôture ni accès.

### 3.1 Section « Clôture » (`cloture`)

| Champ | Type | Note |
|---|---|---|
| Clôture autour de la parcelle | case | `active` |
| Hauteur maximale sur rue, en limite séparative | nombre | d'après le PLU ; vides = pas de contrôle |
| Un côté par ligne : orientation, longueur, résumé (« Mur 1,80 m · sur rue · mitoyen ») | ligne | bouton **Régler** (le côté passe en réglage propre, copié du défaut) ; **Comme le défaut** (retire l'entrée) |
| Réglage en cours : « Tous les côtés » ou « Côté N (orientation) » | choix | choix d'affichage (`sale: false`) : ce que les champs suivants modifient |
| Type | choix | aucune, palissade, grillage, haie, mur |
| Limite, Mitoyenne | choix, case | côté seul |
| Hauteur | nombre | hors soubassement |
| Couleur, Texture | couleur, texture | |
| Lames, Occultante | choix, case | palissade |
| Grillage, Occultante | choix, case | grillage |
| Essence, Épaisseur, Taillée | choix, nombre, case | haie |
| Parement, Épaisseur, Couvertine | choix, nombre, case | mur |
| Soubassement | case | palissade, grillage, haie |
| Hauteur, Parement, Couleur, Texture du soubassement | | soubassement coché |
| Alerte | alerte | « Le côté N dépasse la hauteur maximale sur rue (2,00 m). » |

### 3.2 Section « Portails et portillons » (`portails`)

| Champ | Type | Note |
|---|---|---|
| Ajouter un portail, Ajouter un portillon | bouton | sur le côté « sur rue » s'il y en a un, sinon le plus long, au milieu |
| Un accès par ligne : résumé (« Portail 3,50 m · côté 2 · à 4,20 m ») | ligne | **Régler**, **Supprimer** |
| Accès en cours | choix | choix d'affichage |
| Placer sur le plan… | bouton | un pointage (`purpose: 'acces'`, `interaction/pointeur.ts`) : le clic sur un côté de la parcelle pose l'accès en cours centré sur le point cliqué, sans sortir du côté ; Échap annule |
| (sur le plan) | glisser | chaque accès porte une poignée invisible (`data-role="acces"`, `render/cloture.ts`) : on le fait glisser le long de la clôture, d'un côté à l'autre en passant un angle, sans sortir du côté (`interaction/glisserAcces.ts`) ; un pas d'annulation par geste, la 3D suit au relâcher |
| Côté | choix | « Côté N — orientation, longueur » |
| Position, Largeur, Hauteur | nombre | |
| Ouverture | choix | un battant, deux battants, coulissant |
| Sens | choix | battants : vers l'intérieur, vers l'extérieur |
| Petit vantail | choix | deux battants : aucun, à gauche, à droite |
| Refoulement | choix | coulissant : à gauche, à droite |
| Forme, Flèche | choix, nombre | |
| Remplissage, Matériau, Couleur, Texture | | |
| Piliers, Largeur, Hauteur, Parement, Chapeau | | |
| Retrait, Motorisé | nombre, case | |
| Montrer ouvert | case | réglage d'affichage (`sale: false`), comme « Filaire » |
| Accoler au portail à gauche / à droite | bouton | portillon seul : `x` contre le portail le plus proche du même côté |
| Alertes | alerte | dépasse le côté ; coulissant sans place de refoulement ; ouverture sur rue vers l'extérieur |

Les écritures passent par les descripteurs : `historique` implicite, « projet modifié », effets
`rendu` et `scene3d`. Aucune commande nouvelle n'est nécessaire : les boutons agissent en `projet`.
La pose par clic est le seul geste hors descripteur : le pointeur empile l'instantané, marque le
projet modifié, redessine le plan et reconstruit la Vue 3D si elle est ouverte (`model/cloture.ts::poserAcces`).

---

## 4. Vue 3D (`three/cloture3d.ts`)

Remplace la bande unique de `scene.ts`. Pour chaque côté dont le réglage n'est pas `aucune` :

- le côté est découpé en **tronçons** entre les accès (`tronconsDuCote`) ; chaque tronçon reçoit sa
  clôture, et chaque accès son ouverture ;
- **palissade** : bande de 5 cm, couleur ou texture, un poteau carré de 9 cm tous les 2 m ;
- **grillage** : bande de 2 cm, grise, translucide (`opacity` 0,35), un poteau tous les 2,50 m ;
  occultante → opaque ;
- **haie** : bande de son épaisseur, verte, texture au choix ;
- **mur** : bande de son épaisseur, couleur du parement, couvertine 4 cm plus large de chaque côté ;
- **soubassement** : un mur de sa hauteur sous la clôture, qui commence au-dessus ;
- **portail** : deux piliers (prismes carrés) de part et d'autre du passage, en retrait s'il y en a
  un, reliés à l'alignement par deux retours de clôture ; chaque vantail est un panneau de 4 cm
  dont le contour suit la forme (courbe échantillonnée sur 12 points, `profilDuVantail`) ; les
  vantaux d'un battant pivotent de 90° autour de leur pilier quand « Montrer ouvert » est coché,
  dans le sens choisi ; un coulissant glisse de sa largeur du côté du refoulement ;
  le remplissage `ajoure` baisse l'opacité à 0,5, `semi` dessine un soubassement plein sur le tiers
  bas ;
- la bande est **mitrée** aux angles comme avant (`safeOffset` de la parcelle entière) : les tronçons
  sont des parts de l'anneau, bornés par les abscisses des accès.

Les mailles sont nommées (`cloture-troncon`, `cloture-pilier`, `cloture-vantail`) pour les tests de
structure, comme celles du relevé.

### 4.1 Les clôtures du voisinage (`three/clotureVoisinage.ts`)

Une case des réglages de la Vue 3D, **« Clôtures du voisinage », cochée par défaut** (sans elle, les
parcelles voisines ne se distinguaient pas en 3D). C'est une
préférence d'affichage, comme « Ombre portée » : rien n'est écrit sur les parcelles voisines, qui ne
portent ni clôture ni lieu (décision produit). Elle pose un **grillage générique** — 1,5 m,
gris vert clair, translucide (30 %), sans ombre portée — sur les limites des parcelles voisines
visibles :

- chaque limite une fois (sommets arrondis à 20 cm, sens fixe pour que deux panneaux confondus
  soient éclairés pareil) ;
- pas sur une limite commune avec la parcelle du projet quand celle-ci a sa clôture ;
- sur un sol en relief, en panneaux de 3 m au plus qui suivent la pente ;
- **une seule maille** (`cloture-voisinage`) pour tout le voisinage : deux mille parcelles en
  panneaux séparés ne tiendraient pas ;
- avec le reste du plan seulement (« Afficher tous les objets »), pas en isolement.

---

## 5. Plan à l'écran (`render/cloture.ts`)

Un groupe SVG à part, redessiné à chaque rendu après les relevés, et seulement si la parcelle a une
clôture active. Rien ne change dans les exports (§1.1).

- Chaque tronçon est un trait **15 cm à l'intérieur** de la limite, de la couleur du réglage :
  mur plein 2,2 px ; palissade plein 1,4 px avec un tiret tous les 2 m ; grillage tiret-point
  0,9 px ; haie pointillé arrondi 2,6 px.
- Un accès coupe le trait ; deux tableaux perpendiculaires marquent les piliers ; un battant reçoit
  son vantail et son arc de débattement (deux pour deux battants), vers l'intérieur ou l'extérieur ;
  un coulissant reçoit un trait parallèle à la clôture sur la longueur de son refoulement, flèche vers
  le côté de rangement. Un retrait décale l'accès vers l'intérieur et dessine les deux retours.

---

## 6. Tests

| Fichier | Ce qu'il vérifie |
|---|---|
| `tests/unit/model/cloture.test.ts` | lecture depuis les anciens champs, réglage d'un côté, tronçons entre accès, alertes, accolement d'un portillon |
| `tests/unit/io/serialisation-cloture.test.ts` | `cloture` écrit seulement présent, copié en profondeur, relu à l'identique ; anciens champs tenus à jour |
| `tests/unit/three/cloture3d.test.ts` | nombre de mailles par type, piliers et vantaux, rien sans clôture active |
| `tests/unit/render/cloture.test.ts` | tronçons, coupure, arcs d'un battant, course d'un coulissant |
| `tests/unit/ui/champsCloture.test.ts` | sections visibles sur la parcelle du projet seule, champs par type, écritures |
| `tests/unit/echafaudage.test.ts` | les six empreintes ne bougent pas |

---

## 7. Fumée

Point à ajouter à `tests/CHECKLIST-FUMEE.md` : sélectionner la parcelle, régler un côté en mur, poser
un portail à deux battants et un portillon accolé, cocher « Montrer ouvert », ouvrir la Vue 3D ;
vérifier sur le plan la coupure et les arcs, dans les trois classes et les deux thèmes.

---

## 10. Suite possible

- Poignée de déplacement d'un accès le long de la limite.
- Export SVG, PDF, DXF de la clôture et des accès (version majeure).
- Chiffrage de la clôture (version majeure).
- Accessoires sur rue : coffret de compteurs, boîte aux lettres, interphone.
- Lecture de la hauteur maximale dans le règlement du PLU.
