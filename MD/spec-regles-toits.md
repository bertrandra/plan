# Règles des toits — observations, réglages et non-régression

Statut : **spécification, aucun code**. Elle fait suite au mode audit (`MD/spec-audit.md`) et à la
discussion du 13 octobre 2026 : faire entrer dans Plan ce que l'on observe sur le terrain, **sans
casser un toit juste pour en corriger un autre**.

Référence du calcul actuel : `MD/spec-toit-ign.md` et le skill `toits` (`.claude/skills/toits/`).

---

## 1. Le principe

Le calcul **propose et chiffre** : pour chaque forme de toit possible, il dit à quel point elle
colle à la mesure LiDAR. Les **règles décident** : ce qu'un couvreur peut construire, à partir de
quel écart une forme compliquée l'emporte sur une simple, ce qui est invraisemblable (un arbre pris
pour un toit), et quand il vaut mieux poser une question.

Une observation de terrain (un cas d'audit) peut produire trois choses, et une seule :

| Niveau | Ce que c'est | Exemple | Où ça vit |
|---|---|---|---|
| **Fait** | Une vérité sur **un** bâtiment | « Le 13 bis bd de Belgique a deux pans, faîtage perpendiculaire à la rue » | `regles/toits/faits.json` |
| **Réglage** | La valeur d'un seuil, éventuellement par **profil** de bâti | « En Provence, un appentis l'emporte s'il fait au plus 1,1 fois l'écart du deux-pans » | `regles/toits/reglages.json` |
| **Règle** | Une logique nouvelle | « Une bande raide de moins de 1,5 m le long des murs, sous un pan doux, est un brisis » | code TypeScript ; son seuil dans `reglages.json` |

Chaque observation **validée** devient aussi un **test** : son attendu est ce que vous avez vu, pas
les nombres du calcul (§7). Toute modification d'un réglage ou d'une règle est rejouée sur tous les
cas validés ; un cas qui ne satisfait plus son observation bloque la CI.

---

## 2. Vocabulaire du toit

Le vocabulaire sert à trois choses : écrire une observation sans ambiguïté, nommer les éléments du
modèle de données (§4), et dire ce que la mesure peut voir ou non. Le tableau reprend les éléments
du schéma TCAZ que vous avez annoté, les complète, et précise trois termes dont le sens courant
diffère du libellé du schéma (repérés ⚠).

Colonnes :
- **LiDAR** : ce qu'une grille de hauteurs à 50 cm laisse voir. ✔ visible ; ~ visible s'il est
  assez grand (plus de 1,5 m) ; ✘ invisible (à plat dans la pente, plus petit que la maille, ou
  masqué) : il ne s'observe que sur photo.
- **Plan aujourd'hui** : ce que le modèle sait représenter (`model/types.ts`, `CorpsToit`).

### 2.1 Géométrie : surfaces

| Élément | Définition | LiDAR | Plan aujourd'hui |
|---|---|---|---|
| **Versant** (ou **pan**) | Surface inclinée plane qui reçoit et conduit l'eau. | ✔ | Oui : deux par corps (`egouts[0]`, `egouts[1]`) |
| **Croupe** (n°19) | Pan triangulaire (ou trapézoïdal) qui ferme le bout d'un toit, à la place d'un pignon. | ✔ | Oui (`croupes`) |
| **Demi-croupe** (ou croupette) | Croupe qui ne descend pas jusqu'à l'égout : un petit pignon dessous, la croupe au-dessus. | ~ | **Non** |
| **Brisis** (n°17) | Partie basse, très raide (60° à 80°), d'un toit brisé (à la Mansart). Porte souvent les lucarnes. | ~ (bande étroite le long des murs) | **Non** |
| **Terrasson** (n°20) | Partie haute, peu pentue (15° à 30°), d'un toit brisé. | ✔ | **Non** (lu comme un toit bas ou plat) |
| **Toiture-terrasse** | Toit plat (moins de 3° à 5°), souvent bordé d'un acrotère. | ✔ | Oui (`plat`) |
| **Renvers** (n°5) | Pan à contre-pente qui renvoie l'eau vers une noue ou un chéneau (toit « papillon », jonction de deux toits). | ~ | **Non** |
| **Déversée** (n°8) ⚠ | Terme du schéma : surface dont l'inclinaison est déportée pour évacuer l'eau plus vite. Sens à confirmer : absent des glossaires de couverture consultés. | ~ | Non |

### 2.2 Géométrie : lignes de rencontre

| Élément | Définition | LiDAR | Plan aujourd'hui |
|---|---|---|---|
| **Faîtage** (n°6) | Ligne horizontale la plus haute, où se rejoignent deux versants opposés. | ✔ | Oui (`faitage`, `posFaitage`) |
| **Égout** (n°4) | Bord bas d'un versant, où l'eau quitte le toit vers la gouttière. | ✔ | Oui (`egouts`) |
| **Arêtier** (n°3) | Ligne d'angle **saillant** entre deux pans (entre un long pan et une croupe). | ✔ (déduit) | Déduit des croupes, non stocké |
| **Noue** (n°9) | Ligne d'angle **rentrant** entre deux pans (jonction d'un bâtiment en L, d'une aile). | ✔ (déduit) | Implicite (deux corps qui se croisent, le plus haut l'emporte) |
| **Ligne de bris** (n°18) | Ligne horizontale entre le brisis et le terrasson. | ~ | **Non** |
| **Brisure** (n°7) ⚠ | Au sens strict, toute ligne de changement de pente (la ligne de bris en est une). Sur le schéma TCAZ, la flèche n°7 désigne la **cassure de la grande lucarne à deux pans** : la ligne où le toit de la lucarne rejoint le versant. Dans Plan : « brisure » = changement de pente ; la rencontre d'une lucarne avec le versant est décrite par la lucarne (§2.3). | ~ | Non |
| **Rive** (n°12, rive droite) | Bord latéral incliné d'un versant, le long d'un mur pignon. | ✔ (déduit) | Déduit |
| **Rive de tête** (n°14) | Bord **haut** d'un versant qui s'arrête contre un mur (appentis adossé, toit du porche contre la façade). | ~ | Implicite (appentis) |
| **Pignon** | Mur triangulaire qui porte les versants au bout d'un toit à deux pans ; au sens étendu, un avant-corps à deux pans perpendiculaire au faîtage (les « pignons depuis le faîtage » d'AE 101). | ✔ | Oui (bouts sans croupe ; `pignons` pour les avant-corps) |

### 2.3 Ouvertures et éléments en saillie

| Élément | Définition | LiDAR | Plan aujourd'hui |
|---|---|---|---|
| **Lucarne** (précision du n°7) | Ouvrage en saillie sur le versant, qui porte une fenêtre verticale. Types : **jacobine** (deux pans, petit pignon en façade), **capucine** (trois pans, une croupe en façade), **chien-assis** (un pan en pente inverse du versant), **rampante** (un pan dans le sens du versant, moins pentu), **meunière** / **gerbière** (en façade, coupant l'égout, souvent pour monter les charges), **œil-de-bœuf** (ronde ou ovale), **outeau** (petite ouverture triangulaire de ventilation). | ~ (lucarne de plus de 1,5 m de large) ; ✘ pour l'œil-de-bœuf et l'outeau | **Non** (une grande jacobine passe aujourd'hui pour un « pignon ») |
| **Châssis d'éclairage** (n°1) | Fenêtre plane, fixe ou à tabatière, dans le plan du versant. | ✘ | Non |
| **Fenêtre de toit** (type Velux) | Ouvrant vitré moderne, à ras de la pente. | ✘ | Non |
| **Verrière** | Grande surface vitrée en toiture (véranda, atelier). | ✘ (hauteur) ; visible sur orthophoto | Non |
| **Souche de cheminée** (n°11, passage de cheminée) | Maçonnerie qui sort du toit pour évacuer les fumées, souvent au faîtage ou en pignon. | ~ (pic de 0,5 à 1,5 m de côté, de 1 à 2 m au-dessus du toit) | Non (écrêtée comme une saillie) |
| **Acrotère** | Rebord maçonné en tête de mur autour d'une toiture-terrasse. | ~ | Non |

### 2.4 Bords et débords

| Élément | Définition | LiDAR | Plan aujourd'hui |
|---|---|---|---|
| **Débord d'égout** | Avancée du toit au-delà du mur, côté égout. | ✘ (sous la maille, et masqué par le recalage) | Dessiné : 35 cm par défaut |
| **Saillie de rive** (n°13) | Avancée du toit au-delà du mur pignon. | ✘ | Dessinée : 20 cm par défaut |
| **Queue de vache** (n°16) ⚠ | Au sens courant, **débord d'égout où les chevrons dépassent du mur, apparents**, sans coffrage. Le schéma l'associe à un relèvement de l'égout ; ce relèvement s'appelle un **coyau**. | ✘ | Non (débord uniforme) |
| **Coyau** | Adoucissement de la pente en bas du versant, qui relève l'égout et rejette l'eau loin de la façade. Courant sur les toits anciens. | ✘ | Non |
| **Chéneau** | Gouttière en fond de noue ou derrière un acrotère. | ✘ | Non |

### 2.5 Ce que le vocabulaire implique

- Les éléments ✘ (fenêtres de toit, débords, coyau, queue de vache) ne se **détectent** pas : ils ne
  peuvent venir que d'une **observation** (un fait, §5) ou de la photo. Ils n'entrent pas dans le
  calcul des formes, seulement dans le dessin.
- Les éléments ~ (brisis, lucarnes, cheminées, demi-croupes) sont **détectables sous condition de
  taille** : une règle doit dire à partir de quand on y croit, et l'observation dit si on a eu raison.
- Les lignes (arêtier, noue, rive, ligne de bris) ne sont pas stockées : elles **découlent** des
  corps. Elles servent à écrire une observation (« le faîtage est perpendiculaire à la rue »,
  « il n'y a pas de noue ») et à dessiner.

---

## 3. Catalogue des formes

Une forme est une **composition** : un ou plusieurs **corps** (rectangles du contour), chacun avec
un **profil en travers** (la coupe perpendiculaire au faîtage), des **extrémités** (pignon, croupe,
demi-croupe, brisis), et des **superstructures** (lucarnes, cheminées). Le catalogue décrit chaque
forme par ce que la carte des hauteurs montre (sa **signature**) et par les formes avec lesquelles
elle se confond.

### 3.1 Catalogue, du plus simple au plus rare

Les formes courantes viennent en tête, puis les géométries architecturales et régionales. La liste
reste ouverte : une forme vue en audit qui n'y figure pas s'y ajoute, avec sa signature (§3.2).

| # | Forme | Catégorie | Pans | Caractéristiques | Plan aujourd'hui |
|---|---|---|---|---|---|
| 1 | **Plat** (toit-terrasse) | Standard | 1, pente < 5 % | Pente minimale pour l'écoulement, souvent bordé d'un acrotère ; terrasse ou toiture végétalisée. | Oui (`plat`) |
| 2 | **Monopente** (appentis, à pupitre) | Standard | 1 | Un seul pan. Adossé à un mur (rive de tête) ou libre ; extensions, garages, maisons de village provençales. | Oui (`appentis`) |
| 3 | **Deux pans à pignons** (« en bâtière ») | Standard | 2 | La forme classique en V renversé, deux murs pignons aux bouts ; combles simples à aménager. | Oui (`deux-pans`) |
| 4 | **Croupe** (quatre pans) | Standard | 4 | Deux grands pans et deux croupes triangulaires aux bouts ; bonne tenue au vent. | Oui (`croupes`) |
| 5 | **Pavillon** (pyramide) | Standard | 4 | Quatre pans triangulaires égaux réunis en un point ; plan carré. | Approché (croupes à faîtage nul) |
| 6 | **Demi-croupe** | Standard | 2 à 4 | Deux pans dont le haut des bouts est fermé par une courte croupe, un petit pignon dessous ; Normandie, Alsace, Jura. | **Non** |
| 7 | **Mansart** (mansardé, toit brisé) | Standard | 4 brisés | Chaque face a deux pentes : terrasson en haut, brisis en bas ; brisis aussi aux bouts. Volume habitable maximal ; lucarnes dans le brisis. Paris, Île-de-France, villes. | **Non** |
| 8 | **Asymétrique** (« saltbox ») | Spécifique | 2 inégaux | Deux pans, l'un nettement plus long, qui descend plus bas (parfois jusqu'au rez-de-chaussée). | Représentable (faîtage décentré, égouts inégaux) ; non reconnu comme tel |
| 9 | **Deux pans décalés** | Spécifique | 2 | Deux pans dont les faîtages sont à des hauteurs différentes, séparés par une bande verticale (souvent vitrée). | Approché (deux corps) |
| 10 | **Toit en M** (double pignon) | Spécifique | 4 | Deux toits à deux pans parallèles et accolés, réunis par une noue centrale. | Approché (deux corps) |
| 11 | **Papillon** (en V) | Spécifique | 2 inversés | Deux pans inclinés vers l'intérieur, noue centrale ; contemporain, verrières hautes. | **Non** |
| 12 | **Gambrel** | Spécifique | 2 brisés | Double pente du Mansart, mais sur les deux longs côtés seulement, avec des murs pignons (grange américaine ; « Mansart à deux brisis »). | **Non** |
| 13 | **Coyau** (toit retroussé) | Spécifique | 2 ou 4 | Le bas de chaque pan s'évase et s'adoucit vers l'extérieur ; éloigne l'eau des murs. Fermes et maisons anciennes. | **Non** (variante du bord, §2.4) |
| 14 | **Shed** (dents de scie) | Spécifique | multiples | Appentis répétés : pan court vitré (souvent au nord), pan long aveugle ; bâtiments industriels, ateliers. | Approché (plusieurs corps) |
| 15 | **Berceau** (voûte) | Spécifique | 1 courbe | Toit en demi-cylindre ou en arc surbaissé ; hangars, halles, gymnases. | **Non** |
| 16 | **Carène** (Philibert de l'Orme) | Spécifique | 2 ou 4 courbes | Silhouette convexe en coque de bateau renversée ; grand volume intérieur, style d'époque. | **Non** |
| 17 | **Conique** (poivrière) | Spécifique | 1 cône | Cône sur une tourelle ronde ou polygonale. | **Non** |
| 18 | **Polygonal** | Spécifique | 5 et plus | Pavillon sur un plan hexagonal ou octogonal (kiosque, tour). | **Non** |
| 19 | **Flèche** | Spécifique | 4 à 8, très aigus | Pyramide ou cône très élancé (clocher, tourelle d'angle). | **Non** |
| 20 | **Dôme** (coupole) | Spécifique | base ronde | Hémisphère ou calotte sur une base ronde ou polygonale ; monuments, tourelles. | **Non** |
| 21 | **Impériale** (bulbe) | Spécifique | courbe convexe puis concave | Galbe en S, d'abord bombé puis effilé ; clochers de l'Est, kiosques. | **Non** |

Variantes qui ne sont pas des formes à part, mais des **éléments** d'une forme (§2) :
- **Pignon à redents** (à gradins, Flandres) : un pignon dont le mur dépasse le toit en marches. C'est un **bout**, sans effet sur la forme.
- **Toiture végétalisée** : un toit plat (ou faiblement pentu) couvert de végétation. C'est une **couverture** ; attention, le LiDAR et l'orthophoto peuvent la prendre pour de la végétation.
- **Lucarnes, cheminées, acrotère** : des **superstructures**.

### 3.2 Ce que la mesure en voit, et ce qui se confond

En termes de modèle (§4) : le **profil** est la coupe en travers d'un pan, les **bouts** ferment le faîtage.

| Forme | Profil / bouts | Signature dans la carte des hauteurs | Se confond avec |
|---|---|---|---|
| Plat | horizontal | hauteur uniforme à ± 0,3 m ; acrotère en liseré plus haut | monopente très faible (règle : moins de 30 cm de montée ou moins de 3°) ; toiture végétalisée prise pour de la végétation |
| Monopente | une pente ; rives | rampe d'un mur à l'autre, faîtage sur un mur | deux-pans à faîtage très décentré ; plat |
| Deux pans à pignons | deux pentes ; pignons | arête, hauteur constante le long du faîtage jusqu'aux murs de bout | croupe courte |
| Croupe | deux pentes ; croupes | arête raccourcie, la hauteur baisse vers les deux bouts | pavillon, deux-pans, demi-croupe |
| Pavillon | quatre pentes ; — | un sommet, quatre arêtiers ; plan presque carré | croupe à faîtage court (même dessin) |
| Demi-croupe | deux pentes ; demi-croupes | aux bouts, la hauteur baisse sur le haut seulement, puis un palier (le petit pignon) d'une ou deux mailles | croupe, pignon : **la mesure hésite**, l'observation tranche |
| Mansart | brisé ; brisis aux bouts | bande étroite et raide le long de **tous** les murs (2 à 3 m de haut sur moins de 1,5 m), dessus doux ou presque plat ; bosses régulières des lucarnes dans la bande | **toit plat sur murs hauts** (le brisis pris pour le mur) ; croupe basse |
| Gambrel | brisé ; pignons | même bande raide, mais sur les deux longs côtés seulement ; murs de bout pleine hauteur | deux-pans très pentu ; Mansart |
| Asymétrique | deux pentes inégales | faîtage décentré, un égout nettement plus bas que l'autre | monopente plus annexe ; deux corps |
| Deux pans décalés | deux pentes ; marche au faîtage | deux arêtes parallèles proches, une marche verticale entre elles | deux corps (c'est une lecture acceptable) |
| Toit en M | deux deux-pans ; noue centrale | deux arêtes parallèles, un creux au milieu | papillon (même creux, mais pas d'arêtes) ; deux corps |
| Papillon | deux pentes inversées | creux au milieu, plus haut sur les deux murs | toit en M ; deux monopentes adossés |
| Coyau | pente adoucie au bas | invisible à 50 cm (moins d'une maille de large) | deux-pans : seule l'observation ou la photo le donne |
| Shed | monopentes répétés | rampes parallèles, chacune finie par une hausse verticale | plusieurs corps en appentis (lecture acceptable) |
| Berceau, carène | courbe | dessus bombé sans arête vive ; une coupe en travers suit un arc | deux-pans à faible pente ; plat bombé |
| Conique, polygonal, flèche | sommet unique | pic sur un contour rond ou polygonal ; la hauteur décroît en tout sens | pavillon ; arbre (un arbre est irrégulier et déborde du contour) |
| Dôme, impériale | courbe autour d'un axe | calotte arrondie, sans arête | conique ; arbre |

### 3.3 Compositions

| Composition | Ce que c'est | Signature | Plan aujourd'hui |
|---|---|---|---|
| **Corps et aile** (en L, en T) | deux corps qui se rejoignent par une noue | deux faîtages perpendiculaires, la noue en creux à l'angle | Oui (rectangles maximaux, le plus haut l'emporte) |
| **Avant-corps à pignon** (« pignon depuis le faîtage ») | un corps perpendiculaire qui part du faîtage vers une façade | le long d'une façade, la mesure dépasse le pan sur 1,5 à 6 m et reste haute vers l'intérieur | Oui (`pignons`) |
| **Corps à hauteurs différentes** | une partie haute et une partie basse (annexe, garage) | une marche nette de plus de 0,8 m | Oui (coupe aux marches) |
| **Mitoyens à cheval** | deux maisons sous un seul contour BD TOPO | un corps qui franchit une limite de parcelle | Question posée (« à cheval ») |

### 3.4 Les confusions qui comptent, et ce qui les tranche

Ce sont celles qui produisent les erreurs de l'audit ; chacune appelle une règle ou une question.

1. **Grande lucarne jacobine ou avant-corps à pignon.** Les deux font une bosse le long d'une façade.
   L'avant-corps **monte jusqu'au faîtage** du corps (ou le touche) ; la lucarne **s'arrête en
   dessous**, et son propre faîtage est plus bas que celui du corps. Aujourd'hui, les deux sont
   lus comme des « pignons ».
2. **Mansart ou toit plat sur murs hauts.** Indices :
   - l'égout lu sur le LiDAR dépasse de 2 m ou plus la hauteur BD TOPO (qui se mesure à l'égout, en bas du brisis) ;
   - une rampe raide de moins de 1,5 m le long des murs ;
   - des bosses régulières dans cette rampe (les lucarnes) ;
   - et, sur une photo de rue, des fenêtres verticales dans la pente.
3. **Demi-croupe ou croupe.** Le petit pignon sous la demi-croupe tient sur une ou deux mailles : la
   mesure seule hésite. C'est le cas typique où **le fait** (observation) l'emporte.
4. **Cheminée ou arbre ou lucarne.** Une cheminée est un pic **étroit** (moins de 1,5 m de côté),
   souvent sur le faîtage ou un pignon. Un arbre est **large et irrégulier**, souvent au-delà du
   contour. Une lucarne est **alignée** sur l'égout ou dans la pente, avec un profil à pans.
5. **Pavillon ou quatre-pans.** Un quatre-pans dont le faîtage fait moins de 1 m sur un plan presque
   carré est un pavillon. Ce n'est qu'une question de nom : le dessin est le même.
6. **Toit en M, papillon ou deux corps.** Les trois font un creux au milieu. Le toit en M a deux
   arêtes ; le papillon n'en a pas (ses pans descendent vers le creux) ; deux corps séparés ont une
   marche ou un mur mitoyen entre eux.
7. **Gambrel ou Mansart.** La bande raide longe les deux longs côtés seulement (gambrel) ou tous les
   murs (Mansart) : ce sont les bouts qui tranchent.

---

## 4. Le modèle de données visé

Le modèle actuel (`CorpsToit` : un rectangle, un faîtage, deux égouts, des croupes, des pignons) reste
valable. Il s'**étend** sans casser les fichiers existants : chaque ajout est facultatif, et un
corps sans ces champs garde exactement son sens d'aujourd'hui.

```ts
interface CorpsToit {
  // inchange : pts, posFaitage, faitage, egouts, pignons, croupes, ecart
  /** Le profil en travers, de chaque cote du faitage. Absent : une pente droite (aujourd'hui). */
  profil?: [ProfilPan, ProfilPan];
  /** Ce qui ferme chaque bout. Absent : deduit de `croupes` (aujourd'hui). */
  bouts?: [BoutToit, BoutToit];
  /** Les superstructures detectees ou observees. */
  lucarnes?: Lucarne[];
  cheminees?: Cheminee[];
  /** Les bords, quand une observation les precise ; sinon les defauts du dessin. */
  bords?: { debordEgoutM?: number; saillieRiveM?: number; coyau?: boolean; queueDeVache?: boolean };
}

/**
 * La coupe en travers d'un pan, de l'egout au faitage : droite (aujourd'hui), brisee (Mansart,
 * gambrel : le brisis depuis l'egout, puis le terrasson), retroussee (coyau) ou courbe (berceau, carene).
 */
type ProfilPan =
  | { type: 'droit' }
  | { type: 'brise'; largeurBrisisM: number; hauteurBrisM: number }    // ligne de bris : a cette distance du mur, a cette hauteur
  | { type: 'coyau'; largeurM: number; penteDeg: number }              // le bas du pan, adouci
  | { type: 'courbe'; flecheM: number };                               // l'ecart de l'arc a la corde

type BoutToit =
  | { type: 'pignon' }
  | { type: 'croupe'; profondeurM: number }
  | { type: 'demi-croupe'; profondeurM: number; hauteurPignonM: number }
  | { type: 'brisis'; largeurM: number }                               // Mansart (brisis aux bouts)
  | { type: 'redents' };                                               // pignon a gradins : un mur, sans effet sur le toit

interface Lucarne {
  type: 'jacobine' | 'capucine' | 'chien-assis' | 'rampante' | 'meuniere' | 'inconnue';
  pan: 0 | 1;
  /** Le long du faitage, en metres depuis pts[0] ; puis largeur, hauteur de son faitage, avancee. */
  debutM: number; finM: number; faitageM: number; profondeurM: number;
  source: 'lidar' | 'observation';
}

interface Cheminee { x: number; y: number; coteM: number; hauteurM: number; source: 'lidar' | 'observation' }
```

- Un corps rectangulaire couvre les formes 1 à 16 du §3.1 : l'asymétrique est un deux-pans à faîtage
  décentré et égouts inégaux, le papillon un faîtage **plus bas** que les égouts, le toit en M et le
  shed des corps accolés. Les formes à **sommet unique** ou **à axe** (conique, polygonal, flèche,
  dôme, impériale) demandent un autre type de corps, centré sur un point :
  `{ type: 'axial'; centre; rayonM; profil: 'cone' | 'dome' | 'imperiale'; faitageM; egoutM; cotes? }`.
- La **forme** d'ensemble (`Toit.forme`) gagne `'demi-croupes'`, `'pavillon'`, `'mansart'`,
  `'gambrel'`, `'asymetrique'`, `'papillon'`, `'coyau'`, `'shed'`, `'berceau'`, `'carene'`,
  `'conique'`, `'dome'`… Elle se **déduit** des corps (un corps à profil brisé avec des brisis aux
  bouts est un Mansart ; avec des pignons, un gambrel) : elle n'est pas saisie à part. Une
  observation l'écrit avec le même vocabulaire.
- Les **éléments ✘** (fenêtres de toit, châssis, verrière) ne sont pas dans le corps : ils sont
  propres au dessin et ne viennent que d'une observation. Ils seront ajoutés le jour où la 3D les
  dessinera.
- Le dessin 3D (`three/toitCorps3d.ts`) apprend chaque forme dans l'ordre du §10, **une par PR**.
  Une forme que la 3D ne sait pas dessiner n'est pas produite par le calcul.

---

## 5. Les faits : `regles/toits/faits.json`

Un fait est une vérité observée sur **un** bâtiment, identifié par sa clé BD TOPO (`cleabs`), qui
survit aux mises à jour du contour.

```json
{
  "version": 1,
  "faits": {
    "BATIMENT0000000322509199": {
      "observation": {
        "forme": "deux-pans",
        "faitage": { "par": "rue", "sens": "perpendiculaire", "toleranceDeg": 15 },
        "bouts": ["pignon", "pignon"],
        "lucarnes": { "nombre": 2, "type": "jacobine", "pan": "rue" },
        "corps": { "min": 1, "max": 1 }
      },
      "application": "contrainte",
      "preuve": { "promenade": "audit-2026-10-13-0905-le-vesinet.json", "cas": "c2", "photo": true },
      "adresse": "16 boulevard de Belgique, 78110 Le Vésinet",
      "historique": [{ "t": "2026-10-14", "texte": "observé sur le terrain, validé" }]
    }
  }
}
```

- **Application `contrainte`** (par défaut) : le fait **restreint les candidats** du calcul (seules
  les formes compatibles avec l'observation restent), puis le calcul ajuste les dimensions sur la
  mesure. Le fait reste vrai si le contour bouge ou si la grille est relue.
- **Application `remplacement`** : le fait donne aussi les dimensions (un bâtiment sans LiDAR,
  une mesure trompeuse). À réserver aux cas où la mesure ne peut rien dire.
- Un fait s'applique **à tous les projets** qui contiennent ce bâtiment (vérité terrain partagée).
- Un fait ne fait jamais tomber un test : il **est** l'attendu de son propre cas (§7).
- Il est rangé dans le dépôt, relu par la CI, et versionné avec le code (§9).

---

## 6. Les réglages : `regles/toits/reglages.json`

Les seuils nommés du code (`SEUIL_MARCHE_M`, `TOLERANCE_REFONTE`, `DEPASSEMENT_VEGETATION_M`…)
sortent dans un fichier, **avec leur raison et les cas qui les justifient**. Le code lit le fichier ;
il ne porte plus de nombre en dur.

```json
{
  "version": 7,
  "seuils": {
    "SEUIL_MARCHE_M": {
      "valeur": 0.8, "unite": "m",
      "pourquoi": "Une marche plus basse est une pente de toit, pas un changement de corps.",
      "cas": ["vesinet/AE98", "hucqueliers/37248520"]
    },
    "TOLERANCE_REFONTE": {
      "valeur": 1.15, "unite": "rapport",
      "pourquoi": "Un toit entier presque aussi bon que ses morceaux l'emporte.",
      "cas": ["vesinet/AE98"]
    }
  },
  "profils": [
    {
      "id": "provence-village",
      "quand": { "departements": ["04", "13", "84"], "mitoyennete": "forte" },
      "surcharges": { "APPENTIS_CONTRE_DEUX_PANS": 1.1 },
      "pourquoi": "Toits à un pan des maisons de village, contours en trapèze.",
      "cas": ["gordes/…"]
    }
  ]
}
```

- **Un profil se déclenche sur des faits mesurables**, avec un vocabulaire fermé : département,
  latitude, matériau des murs ou de la toiture (fichiers fonciers), hauteur, surface, mitoyenneté,
  forme du contour (biais, trapèze), époque si la BD TOPO la donne. Jamais sur une adresse ni sur un
  bâtiment : ce serait un fait déguisé.
- Deux profils qui touchent le même seuil : le plus précis (le plus de conditions) l'emporte ; à
  précision égale, la CI refuse le fichier.
- **Externaliser sans changer** : la première PR sort les seuils avec leurs valeurs actuelles ; les
  empreintes, le banc des villages et AE 101 doivent rester identiques au bit près.

---

## 7. L'observation, attendu testable

L'attendu d'un cas n'est **pas** le résultat du calcul ce jour-là : c'est **ce que vous avez vu**,
écrit dans le vocabulaire du §2 avec des tolérances. Ainsi, une amélioration sans rapport ne casse
pas le cas, et une régression réelle le casse.

### 7.1 Les assertions

| Assertion | Exemple | Tolérance par défaut |
|---|---|---|
| `forme` | `"deux-pans"`, ou une liste admise `["deux-pans", "croupes"]` | exacte |
| `faitage` (sens) | perpendiculaire à la rue, parallèle au plus long côté, ou un angle | ± 15° |
| `corps` (nombre) | `{ "min": 1, "max": 2 }` | exacte |
| `bouts` | `["pignon", "croupe"]` (dans l'ordre du faîtage, ou `"symetrique"`) | exacte |
| `egout`, `faitageM` | `{ "min": 5, "max": 6.5 }` | la fourchette donnée |
| `profil` | `"brise"` (Mansart) | exacte |
| `lucarnes` | `{ "nombre": 2, "pan": "rue" }` ou `{ "min": 1 }` | exacte ou fourchette |
| `cheminees` | `{ "min": 1 }` | fourchette |
| `couvert` | tout le contour a un toit (pas de coin sans toit) | 2 % de la surface |
| `pasDe` | `["vegetation", "noue"]` : ce qui ne doit pas apparaître | — |

Une assertion absente n'est pas vérifiée : on n'écrit que ce que l'on a **vu**.

### 7.2 D'où vient l'observation

La fiche d'audit note aujourd'hui des **problèmes** (« sens du faîtage faux »). Pour un attendu, il
faut aussi le **positif** (« il est perpendiculaire à la rue »). La fiche gagne une section
« Ce que je vois » :
- forme : boutons, avec les formes du §3.1 (les plus courantes d'abord, les autres dans « Autres formes ») ;
- sens du faîtage par rapport à la rue ;
- bouts ;
- lucarnes : nombre et pan ;
- cheminées.

La photo, avec sa position et son azimut, sert de **preuve** à la validation. Elle n'entre pas dans le calcul.

---

## 8. Le corpus et la non-régression

### 8.1 Rangement

```
tests/fixtures/toits/cas/
  vesinet-2026-10-13-c2.json     un cas : entrees figees + observation + statut + historique
  ...
tests/unit/facade/regles.test.ts  rejoue tout le dossier
```

Un fichier de cas reprend le cas d'audit (`CasAudit`, `MD/spec-audit.md` §5.2) avec :
- `entrees` : le contour, la BD TOPO, la grille LiDAR et les voisins à moins de 5 m, figés au moment de la marque ;
- `observation` : les assertions du §7 ;
- `statut` : `a_corriger`, `corrige`, `valide` ou `sans_suite` ;
- `regle` : le niveau qui l'a traité (fait, réglage ou règle) et la PR.

La photo n'y est pas : elle reste dans le fichier de promenade, archivé à part.

### 8.2 Ce que la CI vérifie

1. **Les cas `valide`** : rejoués avec les réglages et faits courants, ils doivent satisfaire leur
   observation. Un échec bloque.
2. **Les cas `a_corriger`** : rejoués, ils sont listés en `test.todo` avec les assertions qui
   échouent encore. Un cas qui se met à passer est signalé : il est prêt à être validé.
3. **AE 101** : au centimètre, comme aujourd'hui (`identite.ts`).
4. **Le banc des villages** (Le Vésinet, Hucqueliers, Gordes, Aix, Saint-Rémy) : les compteurs de
   corps, suspects, sans-corps et reprises sont comparés à ceux de `main`. Un écart n'est pas un
   échec mais doit être expliqué dans la PR, avec les cartes des bâtiments qui changent.

### 8.3 La règle du jeu

- Une PR qui touche un réglage ou une règle **liste tous les cas dont le résultat change**, visés ou
  non, avec les images avant et après. Changer un cas validé demande votre validation explicite
  et une ligne d'`historique`.
- **Deux cas qui se contredisent** (aucune valeur d'un seuil ne satisfait les deux) ne se règlent
  pas par un compromis. Il faut chercher la caractéristique mesurable qui les distingue (et créer un
  profil), sinon en faire une question posée à l'utilisateur, sinon passer l'un des deux en fait.

---

## 9. Dans le logiciel

### 9.1 Ordre d'application

1. Le calcul produit les candidats et leurs écarts (inchangé).
2. Les **règles** du code arbitrent, avec les seuils de `reglages.json`, surchargés par le **profil**
   du bâtiment.
3. Un **fait** sur ce bâtiment restreint ou remplace le résultat.
4. Les garde-fous de vraisemblance (végétation, complétion, bandes recouvertes) passent en dernier,
   sauf sur un toit en `remplacement`.

### 9.2 Reproductibilité

- `faits.json` et `reglages.json` sont **dans le dépôt** et **compilés dans le fichier livré** : pas
  de lecture réseau, un toit calculé hier se recalcule à l'identique.
- Leur empreinte entre dans la version de lecture des toits (`VERSION_LECTURE_TOITS`). Un changement
  relance la lecture en tâche de fond sur les projets ouverts. Les toits choisis à la main ne sont
  jamais touchés.
- Un mode d'essai pour l'admin (`?regles=local`) charge un JSON depuis le poste, sans l'enregistrer :
  pour essayer un réglage sur un vrai projet avant d'ouvrir une PR.
- Rien ne change de quantité ni d'export : les empreintes golden ne bougent pas. Si l'une bougeait,
  ce serait un autre sujet (`MD/RELEASE.md`).

---

## 10. Le skill `regles-toits`

Un skill dédié (`.claude/skills/regles-toits/SKILL.md`), qui s'appuie sur le skill `toits` et ses
scripts (`banc.ts`, `rendu.py`, `diag.ts`).

**Entrée** : un fichier de promenade (`audit-….json`).

**Pour chaque cas** :
1. **Rejouer** le cas sans réseau : carte des hauteurs, corps calculés, vue 3D depuis la position et
   l'azimut de la photo. Mettre la photo à côté.
2. **Classer**, dans cet ordre :
   - **hors toit** : contour faux, bâtiment démoli. C'est un fait sur le contour, ou un signalement à l'IGN ;
   - **fait** : l'exception est propre à ce bâtiment, ou la mesure ne peut pas trancher (demi-croupe, élément ✘) ;
   - **réglage** : un seuil existant, mal placé pour ce cas et pour ses semblables. Vérifier sur le banc que les semblables le confirment ;
   - **règle** : rien d'existant ne décrit ce que l'on voit (Mansart, lucarne). Écrire la règle, son seuil nommé dans le JSON, un commentaire qui cite le cas ;
   - **question** : un doute que seule la personne peut lever.
3. **Écrire l'attendu** : les assertions du §7, depuis l'observation de la fiche.
4. **Rejouer tout le corpus** et le banc ; lister ce qui change.
5. **Ouvrir la PR** : pour chaque cas touché, la photo, la carte et la 3D avant et après, le niveau
   choisi et pourquoi. Le statut passe à `valide` quand vous répondez « validé ».

**Ce que le skill ne fait jamais** :
- coder un bâtiment dans une règle (un `if cleabs ==` est un fait, il va dans `faits.json`) ;
- changer un cas validé sans le dire ;
- toucher à AE 101.

---

## 11. Étapes

| Étape | Contenu | Vérifié par |
|---|---|---|
| 1 | Cette spec ; fiche d'audit « Ce que je vois » (forme, faîtage, bouts, lucarnes, cheminées) | fumée de l'audit |
| 2 | `reglages.json` : seuils sortis du code **sans changer de valeur** | empreintes, banc, AE 101 identiques |
| 3 | Corpus `tests/fixtures/toits/cas/` et `regles.test.ts` ; import d'un fichier de promenade | premiers cas réels |
| 4 | `faits.json` appliqué (contrainte, remplacement) | cas observés |
| 5 | Skill `regles-toits` | une promenade traitée de bout en bout |
| 6 | Formes nouvelles, une par PR, dans l'ordre de ce que l'audit trouve : **lucarnes** (et séparation lucarne / avant-corps), **Mansart et gambrel** (profil brisé), **demi-croupe**, **cheminées**, **asymétrique** (reconnaissance seule : déjà représentable), puis papillon, toit en M, coyau (sur observation), berceau et carène, formes axiales (conique, dôme, flèche, impériale) | cas du corpus, banc |
| 7 | Profils | cas qui se contredisent |

L'ordre de l'étape 6 suit ce que l'audit trouve le plus souvent ; il sera revu après les premières
promenades.

---

## 12. Questions ouvertes

1. **Faits partagés entre comptes** : un fait observé par l'admin s'applique à tous les projets qui
   contiennent le bâtiment. Proposé : oui.
2. **Où vivent les JSON** : dans le dépôt, livrés avec le code. Proposé : oui, avec le mode d'essai
   `?regles=local` pour l'admin. L'alternative (sur le serveur, modifiables comme la palette) ferait
   perdre la reproductibilité et le passage par la CI.
3. **Les trois termes ⚠ du schéma** :
   - Déversée : quel sens ?
   - Queue de vache : chevrons apparents, ou relèvement (coyau) ?
   - Brisure : ligne de bris, ou rencontre de la lucarne ?

   Le tableau du §2 propose une lecture ; à confirmer.
4. **Fenêtres de toit et châssis** (invisibles au LiDAR) : faut-il les noter en audit et les
   dessiner en 3D ? Proposé : plus tard, après les formes.
5. **Photo et vues de rue** : faut-il, à terme, lire la forme sur la photo (lucarnes, brisis) ?
   Proposé : non pour l'instant ; la photo reste une preuve, pas une mesure.
