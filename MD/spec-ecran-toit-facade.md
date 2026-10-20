# Écran « Toit de face » — première conception

Maquette jouable : `MD/maquettes/toit-facade.html` (un seul fichier, sans dépendance, ouvrir dans un navigateur).
Elle reprend les jetons de `src/styles/jetons.ts` (clair et sombre). Rien dans `src/` n'est encore changé.

## Intention

Configurer le bâtiment **en le regardant de face**, sans formulaire : je vois, je touche, je choisis une
image, je pose, je redimensionne, je défais. Peu de mots, des images et des icônes ; le détail (largeur, pente,
hauteur, taille) n'apparaît que dans une pastille posée sur l'objet touché.

## Gestes

| Je veux | Je fais |
|---|---|
| Choisir une zone (corps, aile) | Toucher ses murs ou son toit : contour accent, poignées et pastille de cotes |
| Changer la forme de toit | Toucher une image de l'onglet *Forme* (ou la faire glisser sur une zone) |
| Régler la pente | Glisser la poignée ↕ au faîtage |
| Régler la largeur de la zone | Glisser la poignée ↔ du bord droit (les zones suivantes se décalent) |
| Ajouter un élément (cheminée, jacobine, chien-assis, fenêtre de toit, panneaux solaires) | Toucher une image de l'onglet *Éléments*, ou la faire glisser sur le toit |
| Positionner | Glisser l'élément : il suit la surface du pan le plus proche, d'une zone à l'autre |
| Redimensionner | Poignée ↗ de l'élément, ou − / + dans sa barre |
| Retourner, dupliquer, supprimer | Barre flottante de l'élément ; Suppr au clavier |
| Défaire | Annuler / Rétablir sans limite (Ctrl+Z, Ctrl+Maj+Z), Échap pendant un geste, *Tout défaire* (lui-même annulable) |

## Choix de dessin

- Vue oblique « de face » (profondeur vers le haut à droite) : une élévation pure ne montrerait pas la forme d'un
  toit à faîtage parallèle à la façade. Les vignettes sont dessinées **par le même code que la scène**, donc fidèles.
- Dix formes du catalogue (`MD/spec-regles-toits.md` §3.1) : plat, un pan, deux pans, croupes, pavillon,
  demi-croupe, Mansart, brisé (gambrel), papillon, berceau. Les autres (carène, coyau, shed, formes spéciales) suivent.
- Les éléments se posent sur la surface de pose de la forme (le brisis d'un Mansart, le pan visible d'un papillon…).

## Rattachement à l'application (à décider)

- Zone Z4 (canevas) pour la scène ; la rangée d'images est une **feuille** en `compact`/`moyen`, une colonne en `large`.
  Les cotes de la pastille sont des champs d'inspecteur (`ui/champs/`), pas du JSX ad hoc.
- Données : un corps = `CorpsToit` (forme du catalogue, `posFaitage`, égouts, bouts) ; un élément = superstructure
  (§2.3 : lucarne, cheminée, fenêtre de toit) — **le modèle n'en sait aujourd'hui représenter aucune** (« Plan aujourd'hui : Non »).
  Avant de câbler : ajouter ces éléments au modèle et à un **fait** de `regles/toits/faits.json` (une décision de la personne,
  jamais une règle), sans bouger AE 101 ni les empreintes golden.
- Chaque geste est une commande du registre (`app/commandes.ts`, `app/exposition.ts`) pour les trois classes d'écran.
- Préférence d'affichage ou modification ? Ici tout est une modification (Ctrl+Z, « projet modifié »).

## Questions ouvertes

1. Partir de la lecture automatique (LiDAR + audit) et laisser la personne corriger, ou de zéro ?
2. Ajouter / supprimer une zone (une aile) : geste « + » au bord du bâtiment ?
3. Vue de face seule, ou bascule 3/4 (la 3D existante) ?

## Version 2 : la façade d'AE 101 (`MD/maquettes/toit-facade-ae101.html`)

Demande : modifier un toit **comme AE 101**, d'un geste, par exemple les deux pignons ajoutés sur la façade avec
le toit en appentis. L'écran part donc d'AE 101 (deux pans, deux pignons traversants de 3,7 m au faîtage, galerie
sur toute la façade sud) et chaque pièce se manie de la même façon : **je touche, je déplace, je tire une poignée**.

| Pièce | Je la pose | Je la déplace | Poignées | Barre |
|---|---|---|---|---|
| Pignon traversant | image *Pignon*, tapée ou glissée sur la façade | glisser (aimant : bords, symétrie) | ↔ largeur · ↕ hauteur (aimant au faîtage) · ↗ saillie | dupliquer, supprimer |
| Appentis adossé | image *Appentis* | glisser | ↔ ↔ bouts · ↕ égout · ↗ profondeur | sur poteaux / fermé, supprimer |
| Élément (cheminée, lucarne…) | onglet *Éléments* | glisser sur le pan | ↗ taille | − +, retourner, dupliquer, supprimer |

La pastille de cotes (largeur, angle, hauteur, saillie ou profondeur) apparaît sur la pièce touchée, jamais ailleurs.

**Ce que l'écran écrit : un fait.** Les gestes se traduisent dans le vocabulaire de `MD/spec-regles-toits.md` §5, sans rien de nouveau :

- pignon → `pignons: [{ facade: { azimutDeg }, position: "bouts", haut: "faitage", largeurM }]` ; la hauteur coupée sous le
  faîtage et la saillie n'existent pas encore dans le vocabulaire (à ajouter) ;
- appentis → `appentis: [{ facade: { azimutDeg }, longueur: "toute", profondeurM, egoutM, hautM }]` ; `hautM` suit
  `egoutM + 0,6 × profondeurM` dans la maquette (≈ 31°), AE 101 mesure 3,2 m pour 2,4 m d'égout et 1,25 m de profondeur ;
  `longueur` partielle (deux bouts libres) n'existe pas encore (§5.1 : « Un seul pan par façade ») ;
- ouvert / fermé → `ouvert: true` du corps produit.

Le départ de l'écran est la lecture du bâtiment (calcul puis fait, §9.1) ; ce que la personne change devient un fait
`contrainte` ou `remplacement`, proposé puis validé, jamais écrit en silence (`regles-toits` : « un fait est une
observation, pas une hypothèse »). Dernier garde-fou : AE 101 reste identique au centimètre tant que la personne n'y touche pas.

## Version 3 : on part de la 3D (`MD/maquettes/toit-3d-facade.html`)

Trois écrans qui se répondent (three.js, les mêmes faces que le dessin de façade, donc rien de dessiné deux fois) :

| Écran | Ce que je vois | Ce que je fais |
|---|---|---|
| **A. 3D du terrain** (départ) | la parcelle, ma maison, les maisons voisines ; Dessus / 3D | je touche une **silhouette** : elle prend ses arêtes et une teinte d'accent, et *Modifier* apparaît ; un voisin montre un cadenas |
| **B. Façade** | la façade (version 2) et, en haut à droite, une **vignette 3D** qui suit chaque geste | je modifie ; **✓ Valider** renvoie en A avec la façade validée ; ← revient en A (si j'ai changé quelque chose, une question : abandonner ou continuer) |
| **C. Vignette en grand** | la maison en cours, seule, avec Dessus / 3D et l'orbite au doigt | ← revient à la façade |

- Valider écrit dans le projet (ici : `committedStr`) ; *Revenir au départ* de B revient à la dernière façade validée.
- Seule la façade sud est modifiable dans la maquette ; choisir une autre façade (toucher un mur en A) reste à dessiner.
- Les voisins ne se modifient pas (cadenas), comme la parcelle voisine de CLAUDE.md.

## Version 4 : une séquence d'éléments de départ (`MD/maquettes/toit-sequence-ae101.html`)

**La clé : les éléments définis au départ.** La maison n'est ni des façades ni des blocs, c'est une suite d'éléments
choisis dans un catalogue. Un élément est une **recette** : il peut ajouter un volume, un toit, *et découper la façade*.

- Exemple vécu, AE 101 : la **galerie coloniale** coupe la façade sud. Sa recette = un appentis adossé + des poteaux +
  un **retrait** du mur du rez-de-chaussée (le décroché d'environ 50 cm du fait). Sans cet élément, le mur serait d'un seul tenant.
- Le catalogue de la maquette : *Volume* (aile) · *Toit* (pignon, appentis, jacobine, chien-assis, fenêtre de toit,
  solaire, cheminée) · *Façade* (galerie coloniale). Un nouvel élément s'ajoute au catalogue (images, paramètres, recette)
  sans changer l'écran : porche, bow-window, lucarne rampante, balcon… seront d'autres recettes.

**La séquence.** Bande d'étapes en vignettes, numérotées dans l'ordre de construction : AE 101 =
1 corps · 2-3 pignons · 4 galerie · 5-6 ailes · 7 cheminée. Toucher une étape l'ouvre dans la vue qui lui convient :

| Étape | Vue | Poignées |
|---|---|---|
| Corps, aile | **Face** ou **Coupe** (bascule en haut à gauche) ; la coupe montre toujours la forme entière | forme (images), faîtage, égout, profondeur |
| Pignon | Face | largeur, hauteur (colle au faîtage), saillie |
| Galerie coloniale | Face | bouts, égout, profondeur, **retrait** du mur |
| Cheminée, lucarnes | Face (position) | taille |

Les étapes **suivantes s'estompent** pendant qu'on règle une étape plus ancienne ; la vignette 3D montre la fusion.
**+** ouvre le catalogue ; un élément se supprime avec son étape ; tout reste annulable.

**Ce qui découpe la façade** est une propriété de la recette (`retrait`), pas un cas particulier du dessin : le mur de face
est tracé par morceaux autour du retrait (`frontWall`), les fenêtres du rez-de-chaussée reculent avec lui, et la 3D reçoit les mêmes faces.

**À décider avant de coder** : l'ordre des étapes ne compte que pour les recettes qui retranchent (retrait, cour) ; il faut
dire s'il se déplace à la main ou s'il est déduit (volumes d'abord, découpes ensuite, éléments à la fin).

## Version 5 : plusieurs corps (`MD/maquettes/toit-multicorps-ae101.html`)

La v4 alignait les corps le long de la façade. Une maison à plusieurs corps (L, T, U, aile en retour) demande de les
**poser librement en plan**, d'où la vue **Plan**, point d'entrée de chaque étape-corps (Plan · Face · Coupe).

- Un corps = un rectangle au sol (`x`, `z0` = décalage en profondeur, largeur `w`, profondeur `d`) + un sens de faîtage
  (`dir` : x, parallèle à la façade, ou z, vers le fond) + sa forme de toit. Il se déplace (aimant aux bords des autres corps,
  jamais de chevauchement), s'étire (↔ ↕), se tourne d'un quart de tour (⟳, seulement s'il n'a ni pignon, ni galerie, ni élément).
- Le catalogue pose un corps à une place libre : **Aile** (dans la ligne, à droite) ou **Retour** (derrière le corps principal,
  faîtage vers le fond). AE 101 démarre avec une aile en retour **d'exemple** (pas relevée sur place) pour montrer le multi-corps.
- Le plan dessine le faîtage de chaque forme (une ligne, des arêtiers pour les croupes, un X pour le pavillon) et l'emprise
  des pièces (pignons en pointillé, galerie, cheminée).
- **Un seul dessin par corps.** Le corps se dessine toujours dans son repère propre (faîtage selon x, face vers z = 0) ; la
  pose dans le monde (`worldPt`) ajoute un décalage ou une symétrie d'un quart de tour. Une symétrie garde les faces visibles
  visibles : façade, plan et 3D reprennent les mêmes faces. Les corps se peignent du fond vers l'avant.
- Les pignons, la galerie et les éléments restent attachés à un corps parallèle à la façade (`dir` x). Un corps tourné n'en porte pas encore.

**Limites connues** : les corps se touchent mais ne se pénètrent pas (pas de noue entre deux faîtages qui se croisent dans la
façade dessinée ; la 3D, elle, les superpose correctement) ; un corps tourné ne reçoit ni pignon ni galerie ; la hauteur d'un
retour n'est pas encore contrainte par celle du corps principal.

## Version 6 : la façade d'un seul tenant, avec un bow-window (`MD/maquettes/toit-bow-ae101.html`)

Problème : un bow-window (trois facettes en saillie) découpe visuellement la façade en morceaux. Réponse : **une pièce n'est jamais un
morceau de façade, c'est un élément porté par elle.**

- **Une façade = un côté de la maison** (regroupement par azimut avec tolérance, comme `facade.azimutDeg` des faits). Tous les corps
  dont le mur est de ce côté, alignés ou décalés, en sont des tronçons. Rien ne la coupe.
- **Un bow-window est un élément de la recette « façade »** : trois facettes, petit toit en lean-to, hauteur, saillie. Ses facettes sont
  les siennes (poignées largeur ↔, hauteur ↕, saillie ↗) ; le mur derrière reste un seul mur.
- **Le développé** (bandeau en bas de la vue Face) met la façade à plat : un tronçon par corps (plus bas s'il est en retrait),
  un repère par pièce (pignon, galerie, bow, cheminée). Toucher un repère ouvre son étape ; l'étape choisie y est surlignée, les
  suivantes estompées. C'est la règle continue sur laquelle on se repère.
- **L'hôte se déduit tout seul** (« Auto ») : on glisse le bow le long de la façade, il change de corps sans geste (aimant au centre
  et aux bords du tronçon) et se réduit s'il ne tient pas. La noue d'un pignon traversant se calcule de même, jamais à la main.
- Le bow se pose depuis le catalogue (*Façade*). Un exemple est posé sur l'aile gauche d'AE 101 : **ce n'est pas un relevé**.

À décider : un bow à cheval sur deux corps (se coupe-t-il, ou refuse-t-on ?) ; le bow fermé par le haut (balcon, étage en surplomb).

## Version 7 : les corps de toit se superposent (`MD/maquettes/toit-superposition-ae101.html`)

Règle du moteur reprise telle quelle : les corps **se chevauchent par construction** (`volumesToit`), le plus haut l'emporte.

- **Plus de contrainte de non-chevauchement** en plan : un corps se pose où l'on veut, par-dessus un autre ; l'aimant aux bords aide mais n'interdit rien. Le plan montre les recouvrements en transparence (les plus grands dessous).
- **L'union se calcule, elle ne se dessine pas.** Noues, arêtes et pénétrations (un retour qui traverse le pan arrière du corps principal, un pignon qui sort d'un toit) naissent du tampon de profondeur : le toit visible en chaque point est le plus haut.
- **La façade est la même scène 3D** que la vue 3D, regardée par une caméra oblique (`x + K·z`, `y + M·z`) : même géométrie, aucun second dessin. Les poignées, pastilles et le développé restent en SVG par-dessus (mêmes coordonnées), le toucher passe par un rayon dans la scène. Une étape suivante s'estompe (transparence), l'étape choisie reçoit ses arêtes.
- Exemple dans AE 101 : le **retour** (étape 8) entre de 1,5 m dans le corps principal et le dépasse en toit ; ce n'est pas un relevé.
- Conséquence pour le modèle : un **pignon traversant** est un cas particulier de corps superposé (faîtage perpendiculaire, monté au faîtage du principal). Il pourrait cesser d'être une pièce à part et devenir un corps du catalogue, ce qui supprime la limite « un corps tourné ne porte pas de pignon ».

À surveiller : faces coplanaires de deux corps superposés (scintillement), noues d'un même niveau, hauteur d'égout du corps le plus bas qui ressort dans l'autre.
