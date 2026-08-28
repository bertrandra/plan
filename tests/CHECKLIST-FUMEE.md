# Liste de fumée — 25 interactions, à dérouler avant chaque fusion de phase

Source : [`../MD/spec-migration-typescript.md`](../MD/spec-migration-typescript.md) §11.3. Ces
gestes ne seront couverts par aucun test automatique : ils mettent en jeu le pointeur, three.js et
le rendu PDF. La liste est **fixe** — on ne l'allège pas d'une phase à l'autre, sinon elle cesse
d'être comparable.

Mode d'emploi : `pwsh -File servir.ps1`, ouvrir `http://localhost:8765/plan.html` sur le jeu de
démonstration, dérouler dans l'ordre. Un point qui échoue bloque la fusion.

## Manipulation directe du plan

| # | Geste | Attendu |
|---|---|---|
| 1 | Tirer un sommet de la terrasse | le sommet suit le pointeur, les cotes adjacentes se recalculent |
| 2 | Tirer une arête | l'arête se déplace parallèlement, les deux sommets suivent |
| 3 | Tirer le corps d'un objet | l'objet se déplace entier, sans déformation |
| 4 | Double-cliquer sur une arête | un point est inséré au clic |
| 5 | Double-cliquer sur un coin | le coin passe en gelé (et se dégèle au double-clic suivant) |
| 6 | Pincer pour zoomer (2 doigts) | zoom centré sur le milieu du pincement, sans saut |
| 7 | Déplacer à 3 doigts | la vue se déplace, l'échelle ne change pas |
| 8 | Activer la contrainte rectangle sur un objet | les angles se redressent, l'objet reste rectangulaire pendant les tirages |
| 9 | Annuler cinq fois de suite (Ctrl+Z ×5) | les cinq derniers gestes se défont dans l'ordre, le bouton se désactive quand la pile est vide |
| 10 | Alignement par rotation | l'objet pivote sur l'axe demandé sans changer de surface |

## Mesures, cadastre, calques

| # | Geste | Attendu |
|---|---|---|
| 11 | Créer une mesure avec deux cibles | la cote apparaît sur le plan et dans le tableau des mesures |
| 12 | Importer une parcelle par adresse | prévisualisation, parcelles voisines proposées, plan créé |
| 13 | Basculer l'affichage du voisinage | les objets voisins disparaissent du plan **et** des filtres au-dessus |
| 14 | Activer l'orthophoto, jouer sur les deux opacités | les tuiles s'affichent, la parcelle s'éclaircit, les réglages se sauvegardent |
| 15 | Interroger le PLU | zonage, servitudes, SPR et lien territoire renseignés |
| 16 | Ombre des parasols à deux dates | l'ombre change de longueur et de direction entre les deux dates |

## Terrasse : moteur de calcul

| # | Geste | Attendu |
|---|---|---|
| 17 | Modifier un paramètre de configuration | le BOM se recalcule immédiatement |
| 18 | Tables de débit | les longueurs proposées couvrent la surface, chutes réutilisables prises en compte |
| 19 | Coupe | la coupe reflète les épaisseurs et hauteurs configurées |
| 20 | Implantation | les plots sont positionnés selon l'entraxe courant |
| 21 | Chantier | la séquence et les quantités correspondent au BOM |

## 3D et exports

| # | Geste | Attendu |
|---|---|---|
| 22 | Vue 3D : curseur solaire, clôture | l'éclairage suit l'heure, la clôture apparaît à la bonne hauteur |
| 23 | Enregistrer un point de vue, puis le rappeler | la caméra revient exactement à la position enregistrée |
| 24 | Exporter en GLB, rouvrir dans la visionneuse | le modèle se recharge, compteurs conformes à `fixtures/golden/glb-structure.json` |
| 25 | Dossier PDF avec deux terrasses | 3 pages : plan de masse + une section par terrasse, cotes hors des contours |

## Journal des passages

| Date | Version / phase | Résultat | Notes |
|---|---|---|---|
| 2026-08-28 | v1.0.0 — phase 0 | partiel | Points 1 à 8, 10, 16, 17 à 23 : non rejoués (gestes au pointeur et rendu visuel). Points 9, 11, 13, 14, 15, 24, 25 : vérifiés lors de la QA du 27 août et de la capture des fixtures. |
| 2026-08-28 | v1.0.1-alpha.1 — phase 1 | partiel | Sur `dist/index.html` : points 9 (annuler ×5), 22 (vue 3D, canvas + three.js chargé), plus duplication, réinitialisation et les cinq onglets. Points 1 à 8, 10 à 21, 23 à 25 : non rejoués (gestes au pointeur, rendu visuel). Les six golden files sont identiques au bit près depuis le build. |
| 2026-08-28 | v1.0.1-alpha.3 — phase 3 | partiel | Points 17 à 21 (configuration → BOM, débit, coupe, implantation, chantier) rejoués sur `dist/index.html` : chiffres affichés conformes à l'oracle (37 vis, 11,5 h). Points 1 à 16 et 22 à 25 : non rejoués. Golden files identiques. |
| 2026-08-28 | v1.0.1-alpha.5 — phase 5 | partiel | Dialogues vérifiés au navigateur (notification d'export, confirmation de réinitialisation) et sous jsdom (11 tests). Sélecteur de textures couvert par 8 tests jsdom, non ouvert au navigateur : ses points d'entrée sont dans la 3D et la clôture. Golden files inchangés. |
| 2026-08-28 | v1.0.1-alpha.6 — AppState | partiel | Rejoués sur `dist/index.html` : sélection et poignées, onglets d'attributs, grille, Nord, aller-retour mode Terrasse, duplication/annulation/réinitialisation, mesures, ombres de parasol aux deux solstices (point 16), réimport du SVG d'avant migration. Golden files identiques après correction d'une régression sur `data-measures`. |
| 2026-08-28 | v1.0.1-alpha.8 — rendu et interactions | partiel | Points 6 et 7 (pincement, déplacement à trois doigts) rejoués pour la première fois, en pilotant de vrais événements de pointeur : pincement rapport 2,000 et retour exact, déplacement 50 px demandés / 50 px obtenus. Zoom molette 62 → 68 → 62. Points 1 à 5 et 8 à 25 : non rejoués. Golden files identiques. |
