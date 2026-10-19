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
