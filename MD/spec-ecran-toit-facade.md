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
