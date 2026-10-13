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

### Deux exigences, selon où est le bâtiment

*Décision de l'utilisateur, 13 octobre 2026.*

| Bâtiments | Exigence | Comment on l'atteint |
|---|---|---|
| **Le voisinage** | Le modèle **automatique le plus juste possible, mais pas à 100 %**. Il fait l'horizon du projet : silhouettes, ombres, vues. | Les règles et les réglages, **calibrés par l'audit** : les promenades mesurent le taux de conformité (§13.5) et montrent où le modèle est faible. Une erreur isolée qu'aucune règle générale ne corrige est acceptée. |
| **La parcelle principale** (celle du projet) | **100 %** : chaque bâtiment tel qu'il est, toit, façades, cheminées. | Le calcul automatique d'abord, puis l'**audit de la parcelle** (`spec-audit.md` partie B, ouvert à tout utilisateur dans son projet), les faits, les relevés de façade et les questions posées à l'utilisateur. L'audit **propose**, l'utilisateur accepte, et ce qui est accepté met à jour le modèle et reste **figé dans le projet**. |
| **Les mitoyens** | **100 %** aussi, très probablement (à confirmer, `spec-audit.md` §25) : ils touchent la parcelle, portent l'ombre et la limite. | Comme la parcelle principale, avec ce qui se voit depuis la rue et depuis la parcelle. |

Ce qui en découle :
- Le 100 % ne s'obtient **jamais en tordant une règle** pour un bâtiment : sur la parcelle principale
  et les mitoyens, l'écart restant se corrige par un **fait** ou par une **valeur du projet**
  (relevé, choix de l'utilisateur), pas par un seuil.
- Un bâtiment validé à 100 % **n'est plus recalculé** par un changement de règle : la relecture des
  toits (§9.2, `VERSION_LECTURE_TOITS`) le saute. Elle dit seulement si le nouveau calcul serait
  d'accord, ce qui mesure la règle sans toucher au projet.
- Les cas d'audit du voisinage alimentent les **règles** ; ceux de la parcelle principale et des
  mitoyens alimentent d'abord le **projet**, puis le corpus (une vérité terrain complète vaut
  pour tous).

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

### 2.6 La cheminée

Aujourd'hui, Plan ne dessine pas de cheminée. Ses mesures sont **écrêtées** comme une saillie, et
l'ajustement robuste des corps les écarte : tout ce qui dépasse le pan de plus de 40 cm est mis de
côté.

**Ses parties**

| Partie | Définition |
|---|---|
| **Souche** | La partie maçonnée qui sort du toit, celle que l'on voit. |
| **Conduit** | Le passage des fumées. Une souche en porte un ou plusieurs, côte à côte : elle est alors allongée. |
| **Couronnement** | Le haut de la souche : une dalle qui déborde de quelques centimètres, un chapeau (tôle, pierre), ou des mitrons (petits tuyaux en terre cuite, un par conduit). |
| **Solin** | Le raccord étanche entre la souche et la couverture. Il n'est pas dessiné. |
| **Tubage métallique** | Un conduit inox de poêle ou de chaudière, de 15 à 30 cm, qui sort du pan. |

**Ses positions**

| Position | Où | Ce que le dessin en fait |
|---|---|---|
| `faitage` | à cheval sur le faîtage | souche centrée sur la ligne de faîtage |
| `pan` | dans un versant | la souche part du pan, son bas suit la pente |
| `pignon` | dans le mur de bout, la souche dans l'alignement du mur | la souche prolonge le mur au-dessus de la rive |
| `facade` | **adossée** à l'extérieur d'un mur, du sol (ou d'un étage) jusqu'au-dessus de l'égout | un volume collé au mur, sur toute sa hauteur : il se voit sur la façade, pas seulement sur le toit |

**Ses dimensions, et ce qui est vraisemblable**

- Section : de 40 × 40 cm (un conduit) à environ 60 × 150 cm (souche à plusieurs conduits).
- Hauteur : la règle de l'art (DTU 24.1) veut en général que le débouché dépasse le faîtage d'au moins
  40 cm. Une souche en bas de pan est donc haute, une souche au faîtage est courte.
- Matériau : brique, enduit, pierre, métal. Il suit souvent celui des murs.
- Un tubage métallique est trop fin pour le LiDAR : seule une observation ou la photo le donne.

**Ce que la mesure en voit**

| Source | Ce qu'elle donne |
|---|---|
| LiDAR (maille de 50 cm) | un pic **compact** de 1 à 6 mailles, de 0,5 à 2,5 m au-dessus du pan, dans le contour. C'est un paquet des points que l'ajustement écarte déjà : la détection les regroupe au lieu de les jeter. |
| Orthophoto | un petit carré, souvent rouge ou gris, et son **ombre portée** sur le pan |
| Photo de rue | la silhouette au-dessus de la ligne du toit : la source la plus sûre pour le nombre et la position |

Une cheminée se distingue d'un arbre, d'une lucarne ou d'un édicule par sa taille et sa place
(§3.4, confusions 4 et 8).

### 2.7 La toiture-terrasse

Plan en fait aujourd'hui un toit `plat` (moins de 30 cm de montée ou moins de 3°), couvert de
gravillons en 3D (`model/couleurToit.ts::materiauCouverture`). AE 103 en a une entre ses deux
quatre-pans. Le reste n'est pas lu.

**Ses types**

| Type | Ce que c'est | Revêtement |
|---|---|---|
| **Inaccessible** | on n'y monte que pour l'entretien | gravillons, membrane d'étanchéité apparente |
| **Accessible** | une terrasse où l'on vit, souvent depuis un étage | dalles sur plots, carrelage, **lames de bois** (c'est un chantier possible pour Plan) |
| **Végétalisée** | couverte de plantes (sedum, prairie) | substrat et végétation |
| **Technique** | porte des machines (climatisation, ventilation, panneaux solaires) | membrane, gravillons |

**Ses éléments**

| Élément | Définition | LiDAR |
|---|---|---|
| **Acrotère** | rebord maçonné en tête de mur, de 20 cm à plus d'un mètre au-dessus de la terrasse | ~ : un liseré plus haut d'une maille sur le pourtour |
| **Garde-corps** | barrière de sécurité d'une terrasse accessible (métal, verre, maçonnerie) | ✘, sauf un garde-corps maçonné (vu comme un acrotère haut) |
| **Édicule** | petite construction sur la terrasse : cage d'escalier, local technique, sortie d'ascenseur | ✔ : un bloc de 2 m de côté ou plus, 2 à 3 m au-dessus de la terrasse |
| **Lanterneau, coupole** | ouvrage vitré qui éclaire l'étage du dessous | ✘ (trop bas) ; visible sur orthophoto |
| **Évacuation, chéneau** | descente des eaux pluviales, gouttière derrière l'acrotère | ✘ |

**Les cas qui se présentent**

- **Terrasse partielle** : une partie seulement d'un bâtiment est plate (entre deux corps en pente,
  sur un garage, sur une extension). C'est un corps plat parmi les autres, comme à AE 103.
- **Terrasse sur annexe, accessible depuis l'étage** : le toit plat d'une partie basse sert de
  terrasse à la partie haute. Seule une observation dit qu'elle est accessible.
- **Mansart vu comme une terrasse** : le dessus d'un Mansart est presque plat (§3.4, confusion 2).
- **Végétalisée prise pour un arbre** : la végétation trouble la mesure de quelques dizaines de
  centimètres et l'orthophoto est verte. La hauteur reste **uniforme** et le contour net, à la
  différence d'un houppier (§3.2).

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
8. **Cheminée, édicule ou petit corps.** Ce sont tous des blocs plus hauts que le toit qui les porte.
   Une cheminée fait moins de 1,5 m de côté (jusqu'à 2,5 m pour une souche longue à plusieurs
   conduits). Un édicule fait 2 m de côté ou plus et ne se trouve que sur un toit plat. Un petit corps
   (tourelle, avant-corps) touche le contour et porte son propre toit en pente.

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
  /** Un corps plat : ce que l'on sait de la terrasse (§2.7). Absent : un toit plat sans plus. */
  terrasse?: Terrasse;
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

/** Une souche de cheminee (§2.6). Pour une position `facade`, (x, y) est contre le mur, du cote exterieur. */
interface Cheminee {
  /** Le centre de la souche, repere du plan ; sa section, orientee comme le corps. */
  x: number; y: number; largeurM: number; profondeurM: number;
  /** La hauteur du debouche au-dessus du sol (pas au-dessus du pan : elle se compare au faitage). */
  sommetM: number;
  position: 'faitage' | 'pan' | 'pignon' | 'facade';
  conduits?: number;
  materiau?: 'brique' | 'enduit' | 'pierre' | 'metal';
  couronnement?: 'dalle' | 'chapeau' | 'mitrons';
  source: 'lidar' | 'observation';
}

/** Une toiture-terrasse (§2.7). */
interface Terrasse {
  accessible?: boolean;
  revetement?: 'gravillons' | 'membrane' | 'dalles' | 'bois' | 'vegetalise';
  /** La hauteur de l'acrotere au-dessus de la terrasse ; 0 : pas d'acrotere. */
  acrotereM?: number;
  gardeCorps?: boolean;
  /** Les edicules : un rectangle et sa hauteur au-dessus du sol, avec un toit plat. */
  edicules?: { pts: PtBrut[]; sommetM: number }[];
  source: 'lidar' | 'observation';
}
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
| `cheminees` | `{ "nombre": 2 }`, `{ "min": 1 }`, ou par souche `{ "position": "faitage", "pres": [4.2, 7.0] }` | nombre exact ou fourchette ; position à ± 1 m |
| `terrasse` | `{ "accessible": true, "acrotere": { "min": 0.8, "max": 1.2 }, "edicules": 1 }` | exacte ; fourchette pour l'acrotère |
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
- cheminées : nombre, et pour chacune sa position (faîtage, pan, pignon, adossée en façade), et son
  matériau si on le voit ;
- toit-terrasse : accessible ou non, acrotère (oui, non, hauteur à vue), édicules, revêtement.

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

Un fichier de cas reprend le cas d'audit (`CasAudit`, `MD/spec-audit.md` §9) avec :
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
   Réponse : oui, par Claude, hors de l'application et sous validation (§14). Dans le calcul, la
   photo reste une preuve, pas une mesure.

---

## 13. Roadmap de transformation

Le §11 liste les chantiers. Cette roadmap les place dans une transformation : on part de règles
écrites **dans le code**, réglées à l'œil sur quelques villages, pour aller vers des règles
**nourries par le terrain** et protégées par un corpus. Chaque phase a un objectif, des livrables
et un **critère de passage** mesurable. On ne passe à la phase suivante qu'une fois ce critère
atteint. Les phases ne portent pas de date : leur rythme suit celui des promenades.

### 13.1 D'où l'on part, où l'on va

| | Aujourd'hui | Cible |
|---|---|---|
| **Règles** | dans le code, seuils en dur, commentés avec le cas qui les a montrés | logique dans le code, seuils dans `reglages.json`, chacun avec sa raison et ses cas |
| **Formes** | plat, appentis, deux pans, croupes, avant-corps à pignon | les 21 formes du §3.1 que la mesure peut voir, et les éléments du §2 |
| **Exceptions** | corrigées en touchant une règle, au risque d'en casser une autre | des faits par bâtiment (`faits.json`), sans toucher au modèle |
| **Contrôle** | AE 101 au centimètre ; banc des villages lu à la main | AE 101, corpus de cas observés en CI, banc comparé automatiquement |
| **Source de vérité** | la mesure LiDAR et l'œil du développeur | vos observations de terrain, avec photo, position et azimut |
| **Boucle** | un retour ponctuel (« ce toit est faux ») | promenade → fichier → skill → PR avec images → validation → corpus |

### 13.2 Les deux rôles de Claude

Claude intervient à deux titres très différents, à chaque phase :

- **Claude Code, le développeur** (cette session ou une suivante). Il écrit le code, les règles, les
  tests, le skill, et ouvre les PR avec leurs images. Tout ce qu'il produit passe par la CI et par
  votre validation, comme n'importe quelle contribution. Coût : la session de travail.
- **Claude analyste** : Claude Haiku 5.5 appelé par le skill `regles-toits` (§14). Il regarde les
  entrées d'un cas (photo, rendu du modèle, orthophoto, LiDAR) et propose une observation. Ce qu'il
  produit est une **donnée au statut `propose`**, jamais un calcul ni un attendu de test sans votre
  validation. Coût : environ un demi-centime par maison (§14.4).

Chaque phase ci-dessous dit ce que fait l'un et l'autre ; le tableau du §13.4 les résume.

### 13.3 Les phases

**Phase 0 — Outillage du terrain** *(fait)*

- Mode audit : promenade GPS, marque, fiche, photo avec position et azimut, fichier partagé.
- Boussole, vue à 70 m, accès par le menu Admin.
- Cette spec.

*Critère de passage atteint* : un fichier de promenade réel peut être produit et rejoué sans réseau.

*Claude Code* : a construit le mode audit, la boussole, la caméra et cette spec.
*Claude analyste* : pas encore.

**Phase 1 — Observer**

*Objectif : constituer la matière première.*

- Fiche d'audit « Ce que je vois » (§7.2) : forme, sens du faîtage, bouts, lucarnes, cheminées.
- Trois à cinq promenades réelles sur des bâtis différents :
  - pavillons d'Île-de-France ;
  - centre ancien à Mansart ;
  - village provençal ;
  - longères du Nord.
- Premier tri à la main des cas : hors toit, fait, réglage, règle, question.
- En passant, sans effort de plus : chaque photo d'un cas donne aussi la **couleur de la façade**.
  Sur la parcelle principale, elle donne aussi la **texture et les ouvertures réelles**. Un **audit de
  la parcelle principale** capture tout d'une maison en une visite (`spec-audit.md`, parties A et B). Ces
  captures nourrissent un corpus des façades, à côté de celui des toits. Pour les toits, l'audit de
  parcelle apporte des photos sous plusieurs angles et « Ce que je vois » complet.

*Critère de passage* : au moins 50 cas observés, dont 10 sur des formes que Plan ne sait pas encore
faire. Le tri dit quelles formes et quels problèmes reviennent le plus.

*Risque* : des observations trop vagues pour devenir des tests. *Parade* : la fiche n'accepte que le
vocabulaire du §2 et du §3.

*Claude Code* : ajoute « Ce que je vois » à la fiche et l'import des fichiers de promenade. Il fait
le premier tri des cas avec vous, cas par cas, dans la session.
*Claude analyste* : **en ombre**. Le skill l'appelle sur chaque cas reçu, mais sa réponse n'est
montrée à personne et ne sert à rien d'autre que d'être comparée plus tard à vos observations. Il
s'agit d'une version 0 du prompt du §14.3, sans exemples annotés (il n'y a pas encore de cas
validés). Coût : quelques centimes pour 50 cas.

**Phase 2 — Mesurer sans rien changer**

*Objectif : savoir où l'on en est avant de toucher à une règle.*

- `reglages.json` : les seuils sortent du code avec leurs valeurs actuelles (étape 2 du §11).
- Corpus `tests/fixtures/toits/cas/` et `regles.test.ts`, importés depuis les fichiers de promenade
  (étape 3 du §11).
- Comparaison automatique du banc des villages avec `main`, dont le tableau s'affiche dans chaque PR.
- Un **taux de conformité** : la part des cas observés dont le calcul actuel satisfait déjà
  l'observation, par forme et par problème.

*Critère de passage* :
- empreintes, banc et AE 101 identiques au bit près ;
- tous les cas de la phase 1 rejoués en CI ;
- le taux de conformité de départ est connu, et c'est la référence de la suite.

*Risque* : un seuil externalisé qui change de valeur sans le dire. *Parade* : la PR d'externalisation
ne change aucune valeur, et le banc le prouve.

*Claude Code* : sort les seuils dans `reglages.json`, monte le corpus, le test de CI et la
comparaison du banc.
*Claude analyste* : **mesuré**. Le prompt passe en version 1 : la grille de critères complète et
4 à 6 exemples annotés pris parmi les cas validés de la phase 1. On calcule le **taux d'accord** de
Claude avec vos observations, attribut par attribut (forme, sens du faîtage, bouts, lucarnes,
cheminées), sur des cas qui ne servent pas d'exemples. C'est sa référence de départ, comme le taux
de conformité l'est pour le calcul. Les attributs à plus de 95 % d'accord sont candidats à la
pré-acceptation de la phase 3 ; les autres restent des propositions.

*Critère de passage, pour Claude* : le taux d'accord par attribut est connu, sur au moins 30 cas hors
exemples.

**Phase 3 — Corriger par les faits**

*Objectif : régler tout de suite les exceptions, sans risque pour le modèle.*

- `faits.json` appliqué, en contrainte puis en remplacement (étape 4 du §11).
- Skill `regles-toits` (étape 5 du §11) : il traite une promenade de bout en bout jusqu'à la PR
  avec images.
- Les cas classés « fait » passent en `valide`.

*Critère de passage* : une promenade traitée par le skill de bout en bout, validée par vous. Les cas
« fait » sont corrects en 3D dans tous les projets qui les contiennent.

*Risque* : tout ranger en « fait » par facilité, et ne jamais améliorer le modèle. *Parade* : le skill
compte les faits par forme ; quand plus de cinq faits disent la même chose, c'est une règle qui
manque, et elle passe en phase 4.

*Claude Code* : écrit l'application de `faits.json` et le skill `regles-toits`.
*Claude analyste* : **en service**, usages 1 et 2 du §14.5.
- **Pré-remplissage** : à chaque promenade reçue, il propose « Ce que je vois » pour chaque cas. Les
  attributs à plus de 95 % d'accord arrivent pré-cochés ; vous relisez et corrigez.
- **Tri** : il propose le niveau de chaque cas (hors toit, fait, réglage, règle, question) avec ses
  indices et ses images, dans la PR du skill.

Chaque correction que vous faites recalcule le taux d'accord.

*Critère de passage, pour Claude* : sur une promenade complète, le pré-remplissage fait gagner du
temps (moins de corrections que de champs remplis), sans que le taux d'accord baisse.

**Phase 4 — Généraliser : les formes**

*Objectif : que le calcul trouve seul ce que les faits disaient.*

- Formes nouvelles, une par PR, dans l'ordre de ce que les phases 1 et 3 ont trouvé (étape 6 du §11).
  L'ordre attendu :
  1. lucarnes ;
  2. Mansart et gambrel ;
  3. demi-croupe ;
  4. cheminées (souches au faîtage, dans le pan, en pignon, adossées) et toits-terrasses (acrotère,
     édicules) ;
  5. asymétrique ;
  6. le reste.
- Pour chaque forme : le modèle de données (§4), le dessin 3D, la détection, les cas du corpus.
- Les faits que la règle rend inutiles sont retirés : le calcul les retrouve seul, le test le prouve.

*Critère de passage, par forme* :
- les cas observés de cette forme passent ;
- aucun cas validé ne régresse ;
- le banc montre que la forme apparaît là où on l'attend, et pas ailleurs (la liste des bâtiments qui changent est relue sur les cartes) ;
- AE 101 reste identique.

*Risque* : une forme détectée à tort, par exemple un Mansart vu dans chaque toit plat. *Parade* :
- les faux positifs se comptent sur le banc ;
- une forme nouvelle commence prudente (seuils hauts) ;
- elle s'assouplit cas par cas.

*Claude Code* : écrit chaque forme (modèle, détection, dessin 3D) et sa PR, avec les cartes et les
vues des bâtiments qui changent.
*Claude analyste* : usage 3 du §14.5, **observer sans marcher**.
- **Avant la règle** : il parcourt les photos de rue Panoramax d'un ou deux villages et repère les
  bâtiments qui ont probablement la forme visée (des Mansart à Paris, des demi-croupes en Alsace).
  On obtient ainsi des cas candidats, au statut `propose`, pour tester la règle au-delà de vos
  promenades.
- **Après la règle** : pour chaque bâtiment dont le toit change sur le banc, il compare le nouveau
  rendu à la photo de rue. Il signale les faux positifs probables, que vous tranchez sur les images
  de la PR.

**Phase 5 — Généraliser : les profils**

*Objectif : traiter la diversité régionale sans multiplier les exceptions.*

- Profils dans `reglages.json`, déclenchés par des faits mesurables (étape 7 du §11).
- Chaque profil naît d'une contradiction entre cas (§8.3) : deux observations qu'aucun seuil commun
  ne satisfait.

*Critère de passage* : les contradictions connues sont résolues par un profil ou par une question
posée à l'utilisateur, et non par un compromis. Le taux de conformité progresse dans chaque région
sans baisser ailleurs.

*Claude Code* : écrit les profils, et les mesure sur le corpus et le banc.
*Claude analyste* : pour deux cas qui se contredisent, il compare leurs photos et leurs indices.
Il propose les caractéristiques **visibles** qui les distinguent (matériau, époque apparente,
mitoyenneté, largeur). Claude Code cherche ensuite si l'une d'elles est **mesurable** (fichiers
fonciers, BD TOPO) et peut déclencher un profil. Le profil n'est retenu que si la mesure le confirme.

**Phase 6 — Régime de croisière**

*Objectif : une boucle d'amélioration continue, sans effort de coordination.*

- Chaque promenade suit le même circuit : fichier, skill, PR avec images, validation, corpus.
- Changer une règle relance la lecture des toits en tâche de fond dans les projets (§9.2).
- Le tableau de conformité suit le taux par forme, région et problème. Il sert à choisir la
  prochaine promenade, là où le modèle est le plus faible.

*Claude Code* : traite chaque promenade avec le skill, entretient le corpus et les règles.
*Claude analyste* : **systématique**.
- Il analyse chaque promenade dès sa réception.
- Il balaye Panoramax sur les zones où le taux de conformité est le plus bas, pour préparer la
  prochaine promenade.
- Son taux d'accord est remesuré à chaque changement de modèle ou de prompt, avant toute mise en
  service.
- Le skill affiche le coût réel de chaque lot.

### 13.4 Qui fait quoi, phase par phase

| Phase | Vous | Claude Code (développeur) | Claude analyste (Haiku 5.5, skill) | CI |
|---|---|---|---|---|
| 0 Outillage | — | mode audit, boussole, spec | — | tests, empreintes, AE 101 |
| 1 Observer | promenades, observations, tri des cas | « Ce que je vois », import, tri avec vous | **en ombre** : répond sur chaque cas, réponse non montrée | idem |
| 2 Mesurer | valider les premiers cas | `reglages.json`, corpus, test, banc comparé | **mesuré** : prompt v1, taux d'accord par attribut | corpus validé bloquant |
| 3 Faits | relire les propositions, valider les PR | `faits.json`, skill `regles-toits` | **en service** : pré-remplit et trie (usages 1 et 2) | idem |
| 4 Formes | trancher les faux positifs sur images | une forme par PR, avec images | **Panoramax** : cas candidats avant, contrôle des faux positifs après | idem, et banc relu |
| 5 Profils | valider les profils | profils, mesurés | propose ce qui distingue deux cas contradictoires | idem |
| 6 Croisière | promenades ciblées, validations | entretien | **systématique**, ciblage Panoramax, coût suivi | idem |

Dans tous les cas, ce que propose Claude analyste reste une proposition. Seule votre validation en
fait un attendu de test ou un fait.

### 13.5 Indicateurs

| Indicateur | Ce qu'il mesure | Sens attendu |
|---|---|---|
| Taux de conformité des cas observés | part des cas dont le calcul satisfait l'observation | ↑ à chaque phase, jamais ↓ sur les cas validés |
| Cas par niveau (fait / réglage / règle / question) | où se loge la connaissance | les faits montent en phase 3, puis baissent en phase 4 |
| Faits rendus inutiles | faits que le calcul retrouve seul | ↑ en phase 4 |
| Suspects et sans-corps du banc | qualité sur les villages de référence | ↓ |
| Formes produites par le calcul | couverture du catalogue §3.1 | de 4 à 15 ou plus |
| Conformité de la parcelle principale et des mitoyens | part des attributs observés que le projet satisfait (calcul, faits et valeurs du projet compris) | **100 %**, toujours (§1) |
| Taux d'accord de Claude analyste, par attribut | fiabilité de ses propositions (§14.2) | ↑ ; un attribut n'est pré-accepté qu'au-dessus de 95 % |
| Coût par maison analysée | coût réel des lots | ≈ 0,004 $ en nominal (§14.4) |
| AE 101 | non-régression absolue | identique au centimètre, toujours |
| Empreintes golden | quantités et exports | identiques, toujours |

### 13.6 Ce qui ne change pas en route

- **AE 101 ne bouge pas.** Les quantités et les exports non plus : une règle de toit ne touche que
  le toit.
- **Le voisinage vise le plus juste, la parcelle principale le 100 %** (§1). Un changement de règle
  ne recalcule jamais un bâtiment validé du projet ou d'un mitoyen.
- **Une règle reste générale.** Un bâtiment nommé dans le code est un fait déguisé : il va dans
  `faits.json`.
- **Un cas validé ne change qu'avec votre accord**, avec images et ligne d'historique.
- **Le doute se pose en question** plutôt que de se cacher dans un seuil.
- **Une PR, un sujet.** Une forme, un réglage ou un lot de faits par PR. Le circuit du dépôt
  s'applique à chacune (vérifications, CHANGELOG, PR, merge, livraison).

---

## 14. Analyse assistée par Claude

Un skill confie à Claude l'analyse des entrées d'un cas (photo de rue, orthophoto, LiDAR, modèle
actuel) pour **compléter l'observation automatiquement**. Le principe ne change pas : le calcul
de Plan reste déterministe. Claude **produit des données** (une observation, une proposition de
fait), que l'on valide puis fige dans le JSON. Il n'intervient jamais dans le calcul d'un toit.

### 14.1 Les entrées, et ce que Claude en tire

| Entrée | Préparation (déterministe, par Plan ou le skill) | Ce que Claude en tire | Ce qu'on ne lui demande pas |
|---|---|---|---|
| **Photo de rue** | réduite à 1 024 px ; position GPS et azimut de la prise (`PhotoCas.prise`) | forme, sens du faîtage par rapport à la rue, lucarnes (type, nombre), cheminées, brisis, et les éléments ✘ du §2 (fenêtres de toit, coyau, débords) | hauteurs, angles |
| **Rendu du modèle Plan** depuis la même position et le même azimut | Vue 3D posée sur la caméra de la photo, 1 024 px | les **écarts** entre le rendu et la photo : c'est la question la plus fiable qu'on puisse lui poser | — |
| **Orthophoto** | recadrée sur le contour, 512 px, contour tracé | lignes de faîtage et d'arêtiers, croupes, matériau, verrières | hauteurs |
| **Carte des hauteurs LiDAR** | rendue comme `rendu.py` (bleu bas, rouge haut, contour, échelle), 512 px | reconnaître une signature du §3.2 (bande raide, creux, bosses) | mesurer |
| **Indices LiDAR chiffrés** | calculés par Plan : largeur de la bande raide le long des murs, présence d'un creux, nombre de sommets, écart des formes candidates | les confronter à ce qu'il voit | les recalculer |
| **Modèle actuel** | les corps de Plan en JSON compact | dire ce qui diffère de son observation | — |

### 14.2 Rendre la réponse aussi stable que possible

L'analyse de Claude n'est pas reproductible au bit près : sur un cas ambigu, deux passes peuvent
diverger. Claude Haiku 5.5 n'accepte pas de température réglée (une valeur non par défaut renvoie une
erreur), donc la stabilité vient de la structure, pas d'un réglage.

1. **Réponse fermée.** Sortie structurée (`output_config.format`, schéma JSON). Les mêmes champs que
   l'observation du §7, avec le vocabulaire du §2 et du §3 seulement, et la valeur
   `"indetermine"` partout. Le schéma garantit un JSON valide.
2. **Une grille de critères.** Les signatures du §3.2 deviennent des questions oui / non par forme. La
   réponse cite, pour chaque attribut, les **indices** vus, et sur quelle image.
3. **Trois passes et un vote.** Trois analyses indépendantes, à la majorité, attribut par attribut.
   Un attribut sans majorité passe en `indetermine` et le cas revient à la personne.
4. **Contrôle croisé.** Une réponse qui contredit un indice LiDAR chiffré (Mansart annoncé, aucune
   bande raide mesurée) est marquée `contradiction` et part en revue humaine.
5. **Mesurer avant de faire confiance.** Le skill rejoue Claude sur les cas déjà `valide` et calcule
   le **taux d'accord** par attribut. Seuls les attributs au-dessus de 95 % d'accord peuvent être
   pré-acceptés ; les autres restent des propositions. Le taux est recalculé à chaque changement de
   modèle ou de prompt.
6. **Escalade.** Un cas sans majorité ou en contradiction peut être repassé une fois à Claude
   Sonnet 5.5 (plus fin, environ 20 fois plus cher, §14.4) avant d'arriver chez la personne.

### 14.3 Le prompt « béton »

Il est écrit une fois, versionné dans le skill (`.claude/skills/regles-toits/prompt-analyse.md`),
et **mis en cache** : seule la partie propre à la maison change d'un appel à l'autre.

**Partie fixe, en cache** (de l'ordre de 25 000 tokens) :
1. **Rôle et limite.** « Tu observes un toit. Tu décris ce que tu vois, tu ne mesures rien. Sans
   indice visible, réponds `indetermine`. »
2. **Vocabulaire fermé.** Les tableaux du §2 et du §3.1, chaque terme avec sa définition. Un mot hors
   de cette liste est refusé par le schéma.
3. **Grille de critères.** Pour chaque forme, les questions oui / non tirées du §3.2. Pour chaque
   confusion du §3.4, ce qui la tranche.
4. **Règles de lecture des images** :
   - photo : la façade la plus proche est au premier plan ; un arbre masque, il n'est pas un toit ;
   - carte LiDAR : le bleu est bas, le rouge haut, et la carte a une échelle ;
   - rendu : c'est le modèle actuel, pas la réalité.
5. **Quatre à six exemples annotés**, avec leurs images : un deux-pans, un Mansart, une
   demi-croupe, une lucarne prise pour un pignon, un cas `indetermine`, un cas en contradiction.
   Ce sont des cas du corpus déjà validés.
6. **Le format de sortie** et l'ordre dans lequel remplir les champs (indices d'abord, conclusion
   ensuite).

**Partie propre à la maison** (de l'ordre de 4 000 tokens). Chaque image vient avant le texte, avec
une étiquette (« Image 1 : photo de rue, prise à 12 m, vers 245° »…) :
- les quatre images ;
- les indices LiDAR chiffrés ;
- le modèle actuel en JSON compact.

**Réglages** : Claude Haiku 5.5, effort `low` (passer à `medium` seulement si la mesure du §14.2.5 le
justifie), aucune température.

### 14.4 Coût estimé par maison

Tarifs de la page officielle au 13 octobre 2026, en dollars par million de tokens (MTok), pour des
prompts de moins de 100 000 tokens :

| Claude Haiku 5.5 | Entrée | Écriture en cache (5 min) | Lecture du cache | Sortie |
|---|---|---|---|---|
| API standard | 0,10 $ | 0,125 $ | 0,01 $ | 0,50 $ |
| API Batch (−50 %, différé) | 0,05 $ | — | — | 0,25 $ |

Haiku 5.5 est dans le palier d'images haute résolution : une image coûte
⌈largeur / 28⌉ × ⌈hauteur / 28⌉ tokens, au plus 4 784.

**Tokens d'une passe, pour une maison** :

| Poste | Taille | Tokens |
|---|---|---|
| Photo de rue | 1 024 × 768 px | 1 036 |
| Rendu du modèle, même point de vue | 1 024 × 768 px | 1 036 |
| Orthophoto recadrée | 512 × 512 px | 361 |
| Carte des hauteurs LiDAR | 512 × 512 px | 361 |
| Texte : étiquettes, indices LiDAR, modèle en JSON | — | ~1 200 |
| **Entrée propre à la maison** | | **~4 000** |
| Partie fixe, lue dans le cache | | ~25 000 |
| Sortie : réflexion (effort `low`) et JSON avec indices | | ~1 500 |

**Coût d'une passe** (API standard, cache chaud) :

| Poste | Calcul | Coût |
|---|---|---|
| Lecture du cache | 25 000 × 0,01 $ / MTok | 0,00025 $ |
| Entrée | 4 000 × 0,10 $ / MTok | 0,00040 $ |
| Sortie | 1 500 × 0,50 $ / MTok | 0,00075 $ |
| **Une passe** | | **≈ 0,0014 $** |

L'écriture du cache (25 000 × 0,125 $ / MTok ≈ 0,003 $) se paie une fois par lot, tant que les appels
se suivent à moins de 5 minutes : elle est négligeable sur un village.

**Par maison, selon le scénario** :

| Scénario | Détail | Par maison | 150 maisons (un village) | 1 000 maisons |
|---|---|---|---|---|
| Économe | 1 passe, pas de vote | ≈ 0,0014 $ | ≈ 0,21 $ | ≈ 1,40 $ |
| **Nominal** | 3 passes et vote | **≈ 0,0042 $** | **≈ 0,63 $** | **≈ 4,20 $** |
| Nominal en Batch | 3 passes, différé ; avec ou sans cache (non garanti en Batch) | ≈ 0,0021 à 0,0055 $ | ≈ 0,32 à 0,83 $ | ≈ 2,10 à 5,50 $ |
| Haute définition | photo et rendu à 2 576 px (4 784 tokens chacun), effort `medium` (~2 500 tokens de sortie), 3 passes | ≈ 0,0080 $ | ≈ 1,20 $ | ≈ 8,00 $ |
| Nominal + escalade | 15 % des cas repassés une fois à Claude Sonnet 5.5 (≈ 0,033 $ la passe) | ≈ 0,0092 $ | ≈ 1,40 $ | ≈ 9,20 $ |

**À retenir** :
- Une maison coûte de l'ordre d'**un demi-centime** en nominal, et moins d'un centime avec escalade. Un village complet se compte en **dizaines de centimes**, du même ordre en euros.
- La **sortie** pèse plus de la moitié du coût : garder une réponse courte (indices, puis conclusion) et l'effort `low` compte plus que la taille des images.
- Sans cache, la partie fixe coûterait 25 000 × 0,10 $ / MTok = 0,0025 $ par passe, soit près de trois fois plus : le cache est indispensable.
- Ces chiffres sont une **estimation**. Le premier lot réel les mesure (`usage` de chaque réponse, `count_tokens` sur des images représentatives). Le skill affiche le coût réel du lot à la fin.

### 14.5 Les trois usages, du plus sûr au plus ambitieux

1. **Pré-remplir la fiche d'audit.** À la réception d'une promenade, Claude propose « Ce que je vois »
   pour chaque cas, à partir de la photo ; vous corrigez en un clic. Risque nul : tout passe par vous.
2. **Trier les cas.** Claude propose le niveau (hors toit, fait, réglage, règle, question) et le
   justifie, images à l'appui, dans la PR du skill. Vous validez.
3. **Observer sans marcher.** Le skill parcourt les photos de rue Panoramax d'un village, rend le
   modèle depuis chaque prise de vue, et propose des cas.

### 14.6 Statuts et garde-fous

- **Statut `propose`.** Une observation de Claude porte `source: "claude"`, le modèle, la version du
  prompt et le résultat du vote. Elle n'est jamais un attendu de test (§7) tant qu'elle n'est pas
  `valide`.
- **Pré-acceptation.** Seuls les attributs au taux d'accord mesuré supérieur à 95 % peuvent l'être, et
  toujours relus en lot dans la PR.
- **Jamais dans l'application.** Claude n'est pas appelé pendant le calcul d'un toit : pas de coût
  par utilisateur, pas de délai, pas de photo envoyée à l'extérieur depuis un projet, pas de résultat
  qui varie d'un jour à l'autre. Si un jour on le voulait, ce serait un service à part, dont les
  réponses seraient gardées et versionnées comme des faits.
- **Photos.** Elles partent vers l'API d'Anthropic, qui ne les utilise pas pour entraîner ses
  modèles. Les photos de personnes sont floutées par Panoramax. Les vôtres ne montrent que des
  façades depuis la rue.

### 14.7 Place dans la roadmap

| Phase (§13.3) | Ce que Claude y apporte |
|---|---|
| 1 Observer | en ombre : il répond sur chaque cas, sans que sa réponse soit montrée ni utilisée ; on constitue les cas qui serviront à le mesurer |
| 2 Mesurer | **taux d'accord de Claude** mesuré sur les cas validés, par attribut, en même temps que le taux de conformité du calcul |
| 3 Corriger par les faits | usage 1 (pré-remplissage) et usage 2 (tri) dans le skill `regles-toits` |
| 4 et 5 Généraliser | usage 3 (Panoramax) pour trouver où chaque nouvelle forme apparaît, et ses faux positifs |
| 6 Régime de croisière | analyse systématique de chaque promenade ; suivi du coût réel par lot |
