# Feuille de route — les points faibles de l'architecture

**Statut :** ouverte le 26 octobre 2026, à partir d'une revue de `main` (675 fichiers, 110 000 lignes de `src/`). Elle reprend
les dettes encore ouvertes de `MD/architecture.md` §11 (AD-1, AD-6, AD-15, AD-19) et ce que la revue a mesuré en plus. Une
étape se ferme par une PR qui la cite ; la ligne de son tableau dit alors **fait**, avec le numéro de la PR.

**Ce qui tient déjà, et que ce plan ne doit pas défaire :**
- les couches imposées par `tests/unit/architecture.test.ts` ;
- aucun cycle d'imports de valeurs ;
- ni `any` ni `eslint-disable` dans `src/` ;
- les nombres gardés par les empreintes de `tests/fixtures/golden/` ;
- six régions chargées à la demande depuis aujourd'hui (AD-10 : audit, moteur 3D, mode Toit, relevé, PDF, démonstration). Le
  programme chargé à l'ouverture passe ainsi de 2 729 Ko à 1 722 Ko.

## Les points faibles, du plus risqué au moins risqué

| # | Point faible | Mesure | Ce que ça coûte | Dette |
|---|---|---|---|---|
| P1 | Un ancien projet peut changer de nombres | les valeurs posées par `ensureConstruction` partagent leurs constantes avec les réglages d'aujourd'hui ; la migration 2 → 3 appelle l'algorithme de toit actuel | la promesse « un nombre produit hier est reproductible aujourd'hui » ne tient que par un témoin qui casse ; améliorer un défaut ou les toits devient un événement de version | AD-19 |
| P2 | Des couches pures lisent des entrées de session | calibration, faits essayés, essences d'arbres, encres du thème ; 48 fichiers gardent un `let` de module | le même projet peut donner deux résultats selon la session | AD-15 |
| P3 | Le plan est redessiné en entier à chaque changement | 97 appels à `render()` ; la démonstration a 147 objets, au-delà des ~100 prévus ; un frein (`RENDU_LENT_MS = 30`) au lieu d'un rendu incrémental | les gestes ralentissent sur téléphone avec un voisinage importé | AD-1 (W3) |
| P4 | `app/` est un fourre-tout | 23 400 lignes (21 % de `src/`), 65 entrées à la racine, neuf écrans d'admin mêlés au cœur ; `boot/plan.ts` importe 33 modules, `audit/controleur.ts` 32 | une modification ne dit pas quel domaine elle touche ; les frontières tiennent par discipline | — |
| P5 | La complexité est dans le métier critique | `toitCorps.ts` 1 057 lignes, `piscine.ts` 957, `fusion.ts` 856, `calageFin.ts` 766 ; `model/types.ts` 896 lignes et 216 champs facultatifs pour un seul modèle d'objet | chaque fonction nouvelle touche le même type et ses migrations ; les toits ne tiennent que par AE 101 et le banc | — |
| P6 | L'interface se vérifie surtout à la main | tests : 26 % des lignes de `zones/`, 29 % de `ui/` (45 à 65 % ailleurs) ; une fumée complète prend environ 45 min, la CI n'en joue que 12 points | un point peut rester rouge sur `main` sans que personne ne le voie : c'est arrivé au point 90 | — |
| P7 | L'exploitation dépend de gestes manuels et du réseau | vérification de l'API Claude manuelle, et impossible sans le secret `ANTHROPIC_API_KEY_TEST` ; three.js, EZ-tree et pdf-lib viennent du CDN ; pas de mode hors ligne ; des lectures-modifications-écritures de l'admin sans verrou (les écritures elles-mêmes sont atomiques) | une régression du serveur passe à la livraison ; l'audit, qui se fait dehors au téléphone, tombe sans réseau | AD-6 |

## Les phases

Chaque phase est utile seule et ne demande pas la suivante. Les phases 0 et 1 sont engagées ; les autres attendent leur
déclencheur, écrit dans leur tableau.

### Phase 0 — Voir avant de changer (filets)

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 0.1 | **Fumée complète chaque nuit** (P6) : un workflow programmé joue tous les points, trois classes et deux thèmes, réseau témoin, et garde le journal et les captures des échecs | le workflow tourne sur `main`, un échec fait échouer l'exécution (GitHub prévient le propriétaire) et le journal est téléchargeable | **fait** : `.github/workflows/fumee-nuit.yml`, six tâches parallèles de 12 à 30 min |
| 0.2 | **Banc du rendu du plan** (P3) : temps d'un rendu complet à 147, 300 et 600 objets, au bureau et au téléphone (processeur ralenti ×4), et le profil de ce qui coûte | `scripts/banc-rendu.mjs` ; ses chiffres dans `MD/architecture.md` (W3, AD-1) ; la phase 2 réécrite sur eux | **fait** |
| 0.3 | **Vérification de l'API Claude** (P7) : poser le secret `ANTHROPIC_API_KEY_TEST`, puis lancer le workflow « Vérifier l'API Claude » avant chaque livraison | le workflow passe une fois | à faire, par le propriétaire du dépôt (secret) |
| 0.4 | **Réparer les points rouges que la première nuit a trouvés** (P6). Premier passage complet, le 26 octobre 2026 :<br>– toujours rouges, dans toutes les classes : 69, 70, 74 (analyse par Claude et partage d'un audit), 76 (Admin › Conformité), 82 (masque d'occlusion du relevé), 93 (Admin › Règles) ;<br>– rouge en compact seulement : 10 (cible d'alignement) ;<br>– instables au bureau : 23 (rappel d'un point de vue), 75 (import d'un audit, délai dépassé).<br>Tous étaient déjà rouges avant le 26 octobre (rejoués sur `9d50a29`, la livraison précédente) : aucun passage complet ne les jouait. Pour chacun, savoir si c'est le script ou l'application, et corriger | la fumée de la nuit passe en entier | à faire |

### Phase 1 — Les nombres d'un ancien fichier ne bougent plus (reproductibilité)

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 1.1 | **Figer le remplissage des anciens projets** (P1, AD-19) : ce que `ensureConstruction` pose quand un champ manque devient une table de valeurs littérales, figée, séparée des constantes et des réglages d'une terrasse neuve | la table ne cite aucune constante ; changer un réglage par défaut d'aujourd'hui ne change plus le témoin `defauts-construction.json` ; un test l'interdit | **fait** : `engine/remplissageFige.ts` |
| 1.2 | **Figer la migration 2 → 3** (P1, AD-19) : elle ne fait plus appel à l'algorithme de toit d'aujourd'hui, mais à sa copie figée au schéma 3 (`model/migrations/`), que rien d'autre n'importe | changer `toitBdTopo`, le squelette ou le faîtage ne change plus `migration-2-3.json` ; le test d'architecture interdit d'importer la copie figée ailleurs | **fait** : `model/fige/toitSchema3.ts` |
| 1.3 | **Les entrées de session hors des couches pures** (P2, AD-15) : chaque calcul reçoit en argument ce qu'il lisait dans l'ambiance (calibration, faits essayés, essences, encres) | aucun module de `engine/`, `model/`, `facade/` ne lit un `let` posé par `app/` ou `io/` ; un test le vérifie | après 1.1 et 1.2 |
| 1.4 | **Ce que l'ambiance a fixé s'enregistre avec le projet** (P2) : la calibration et les faits qui ont servi sont écrits avec les nombres, pour qu'un rejeu donne les mêmes | rouvrir un projet rend les mêmes nombres sur une autre session ; un test le vérifie sur la démonstration | après 1.3 ; événement de version (schéma) |

### Phase 2 — Le plan reste fluide (performance)

Déclencheur **atteint** (banc 0.2, 26 octobre 2026). À 147 objets, un rendu complet coûte 82 ms au bureau et 506 ms au
téléphone, pour un budget de 16 et 33 ms. Le dessin SVG du plan n'en prend que 4,7 et 26 ms (10,7 et 56 ms à 600 objets). Le
reste vient des zones, qui refont des calculs dérivés à chaque notification du magasin :
- les champs de construction de l'inspecteur recalculent la hauteur des appuis, donc le sol sous l'emprise, donc un passage
  point par point sur la grille du relief (environ 35 ms par rendu) ;
- l'entrée « doublons » du menu sérialise tout le projet (environ 12 ms).

Le rendu incrémental du SVG passe donc après.

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 2.1 | Calculer une fois par version de l'état ce que les zones relisent à chaque rendu : la hauteur des appuis et le sol sous l'emprise (relief), la recherche des doublons, l'état des champs de construction | le banc à 147 objets passe sous 33 ms au bureau ; le profil ne montre plus ces fonctions ; empreintes inchangées | **fait en partie** : la lecture de la construction une fois par rendu, les doublons sans la parcelle et triés par forme (13,7 → 3,7 ms). Banc à 147 objets : 82 → 38 ms au bureau, 506 → 343 ms au téléphone ; le reste est le rendu des zones par React, mesuré en mode développement |
| 2.2 | Ne redessiner que les objets qui ont changé (une clé de version par objet, le nœud SVG gardé sinon) | le banc à 600 objets passe sous 33 ms au téléphone | si le banc le demande après 2.1 |
| 2.3 | Retirer le frein `RENDU_LENT_MS` une fois 2.1 et 2.2 mesurés | plus aucun rendu sauté au banc | après 2.2 |

### Phase 3 — Des domaines dans `app/` (structure)

Déclencheur : la prochaine fonction transversale, ou une modification qui touche plus de trois dossiers de `app/` sans raison.

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 3.1 | Ranger `app/` par domaine : `app/admin/` (les neuf `ecran*.ts`), `app/cadastre/` (import, actualisation IGN), `app/toits/` (fond, LiDAR, à cheval), le cœur restant à la racine | `app/` n'a plus que le cœur à sa racine ; rien ne change à l'écran | à faire |
| 3.2 | Une règle par domaine (dependency-cruiser ou le test d'architecture) : un domaine n'importe pas un autre domaine, seulement le cœur | la règle est en CI et passe | après 3.1 |
| 3.3 | Alléger les modules carrefours (`boot/plan.ts`, `audit/controleur.ts`) en passant leurs dépendances par le registre des commandes ou des services | plus aucun module de `app/` n'importe plus de 20 modules | après 3.2 |

### Phase 4 — Le métier critique se lit par morceaux (modèle et gros modules)

Déclencheur : la prochaine forme de toit, ou la prochaine fonction d'objet.

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 4.1 | Découper `facade/toits/toitCorps.ts` (1 057 lignes) par étape de la lecture : contour, corps, pignons, hauteurs | aucun fichier de `facade/toits/` ne dépasse 500 lignes ; AE 101 identique (`identite.ts`), banc des toits inchangé | à faire |
| 4.2 | Découper `engine/piscine.ts` (957 lignes) : structure, terrassement, chiffrage | empreintes `moteur-piscine-pergola.json` inchangées | à faire |
| 4.3 | Ranger les champs propres à une fonction (piscine, pergola, clôture, toit) dans un sous-objet par fonction de `ObjetPlan` | `model/types.ts` sous 600 lignes ; aucune empreinte ne bouge | événement de version (schéma) : à préparer avec la plateforme |

### Phase 5 — L'exploitation tient sans geste manuel ni réseau parfait

| Étape | Quoi | Fait quand | État |
|---|---|---|---|
| 5.1 | Un verrou autour des lectures-modifications-écritures de l'admin (`deploy/admin.php` : palette, arbres, contrôleurs, règles), comme `donnees.php` et le journal | deux écritures simultanées ne perdent rien (test `php -S`) | à faire |
| 5.2 | three.js, EZ-tree, pdf-lib servis depuis `assets/` de la livraison, le CDN en secours | la Vue 3D s'ouvre CDN coupé | à faire |
| 5.3 | Mode hors ligne pour l'audit (service worker sur les morceaux déjà découpés) | un audit commencé se poursuit sans réseau et s'envoie au retour | déclencheur AD-6 : plaintes d'utilisateurs sur le terrain |

## Ordre retenu

0.1, 0.2 et 1.1 + 1.2 sont engagés dès maintenant, dans cet ordre : les filets d'abord, puis la reproductibilité. 0.3 attend le
secret. 2.1 vient ensuite : son déclencheur est atteint. Le reste suit son déclencheur.
