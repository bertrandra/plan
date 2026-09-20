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
| 2026-08-28 | v1.0.1-alpha.9 — render() | partiel | Positionnement des objets vérifié branche par branche : étiquettes, cotes, angles (0 → 6), sélection (6 poignées, trait 3 px), opacité du terrain sous orthophoto (1 → 0,15 → 1). Cotes : 4 valeurs, traits de rappel, bascule perpendiculaire / le long. Points de glisser-déposer : non rejoués. Golden files identiques. |
| 2026-09-20 | v1.1.0-alpha.16 — phase 7 finie | **complet, 25/25** | Premier passage intégral, sur `dist/index.html` (jeu de démonstration, puis un plan importé par adresse pour 12 à 15) et sur un déploiement PHP local pour le cycle serveur. Gestes au pointeur pilotés par de vrais `PointerEvent` sur les poignées. **1** sommet suivi à 30/20 px près ; **2** arête : ses deux sommets à +10/+10, les autres à 0 ; **3** corps : six sommets déplacés du même vecteur (15, −10) ; **4** 6 → 7 sommets ; **5** coin gelé (poignée pleine, rayon 7,5) puis dégelé à l'identique ; **6** pincement rapport 2,000 et retour 1,000 ; **7** trois doigts : 50 px demandés / 50 obtenus, échelle × 1,000 ; **8** dalle : quatre angles à 90,0° avant, après activation, et après tirage d'un coin (les deux voisins glissent, l'opposé reste) ; **9** huit annulations en ordre, bouton désactivé à la pile vide, sommet revenu à sa position d'origine au dixième de pixel ; **10** dalle pivotée parallèle au côté 0 de la maison (163,1°), surface 444,8 → 444,8 ; **11** référence « Dalle béton : Côté 1 », deux coins de la terrasse, table 12 → 14 lignes, trois traits de plus ; **12** « Place de la Mairie 35000 Rennes » → AC 530, 418 m², dix parcelles proposées, plan créé avec ses trois bâtiments BD TOPO (puis treize objets avec deux mitoyennes) ; **13** après « Actualiser IGN » avec mitoyennes : filtres 13 → 4 objets et retour, neuf éléments masqués sur le plan ; **14** quatre tuiles posées, parcelle 1 → 0,15 → 0,60, curseurs 40 % / 60 % enregistrés dans le projet (`ortho: {actif, 0.4, 0.6}` à l'export JSON) ; **15** zone psmv type U, servitudes, SPR, lien territoire ; **16** ombre du parasol 18 → 77 px de long et −56,5° → −59,8° entre les deux solstices, retour exact ; **17** entraxe solives 65 → 55 cm : 37 → 45 vis, totaux 3 040 € → 3 258 € et retour à l'identique ; **18** débit lames et bois avec chutes ≥ 50 cm et abouts sur appui ; **19** coupe : vis 40 cm, solive 63×175, lambourde 45×70, lame 25 mm ; **20** 38 plots à l'échelle 1/200 ; **21** 21 lignes, « Appuis 11,5 h » comme l'oracle ; **22** three r128 depuis le CDN, canevas 965×419, soleil 09:00 ↑ 12° E (104°) / 15:00 ↑ 39° SO (205°) / 18:00 ↑ 17° O (250°), clôture activée à 2 m ; **23** rappel d'un point de vue : image du canevas identique au pixel près à celle d'avant le zoom, et « Point de vue 8 » créé sur le plan ; **24** GLB en 9,7 s, 41 473 612 octets : 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 651 accesseurs, 829 vues tampon, 1 scène — compteurs identiques à `glb-structure.json` (8 octets de plus, exporteur non déterministe), visionneuse rouverte sur le modèle (600×420) ; **25** dossier de 3 pages capturé au bit près lors de la recapture des empreintes. Limites : l'éclairage (22) est vérifié par la position du soleil affichée, pas par les pixels ; les cotes hors des contours (25) par les empreintes, pas à l'œil. Cycle serveur (PHP 8.3, `dist/` + `api.php`) : liste, chargement, duplication + enregistrement (24 → 25 objets), rechargement identique, création et suppression d'un projet, `.bak` côté serveur, aucune erreur console. |
