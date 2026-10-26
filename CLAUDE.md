# CLAUDE.md — Plan interactif

Consignes pour travailler dans ce dépôt. Le contexte complet est dans `README.md` et
`MD/architecture.md` ; ce fichier dit comment on travaille ici, ce qui a déjà été tranché, et les
pièges connus.

## Le projet en une phrase

Outil de conception et de chiffrage de terrasses bois : plan SVG à l'échelle, moteur de structure,
nomenclature chiffrée, 3D, exports. **Un nombre produit hier doit être reproductible aujourd'hui** :
une modification qui change une quantité ou un export est un événement de version majeure
(`MD/RELEASE.md`), jamais une correction discrète. Les empreintes de `tests/fixtures/golden/`
le vérifient ; si l'une bouge, le dire et le documenter dans `EMPREINTES.md`.

## Vérifier avant de pousser

Ce que lance la CI (`.github/workflows`, job `verifier`) — tout doit passer en local d'abord :

```bash
npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test
```

La CI construit ensuite le paquet (`BACKPROD_API_URL=http://plateforme.test npm run build`), lance
`npm run verifier-paquet` (aucun secret dans les fichiers livrés) et vérifie le budget de 5 Mo
(FF-5 : `dist/index.html` + `dist/assets/*.js`).

- `tests/unit/architecture.test.ts` impose les couches : `util/shell` → `geometry` →
  `model/plateforme/regles` → `engine/geo/facade` → `core/io/render/export/three/interaction` → `ui`
  → `app/zones`. Une couche n'importe jamais une couche plus haute.
- `tests/unit/plateforme/contrat.test.ts` ne dépend pas de `BACKPROD_API_URL` : la suite doit passer
  avec et sans la variable (elle reste exportée après un build).

## Fumée pilotée (navigateur)

```bash
BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort   # en arrière-plan
NODE_PATH=$(npm root -g) node scripts/fumee.mjs http://localhost:5199 [points…]
```

- Joue chaque point dans les trois classes d'écran (compact, moyen, large) et les deux thèmes.
  La liste et le journal sont dans `tests/CHECKLIST-FUMEE.md`.
- **Points 12 à 15** (cadastre IGN, voisinage, orthophoto, PLU) : ils jouent le vrai réseau quand
  `data.geopf.fr` répond, et rejouent sinon les données témoin de `tests/fixtures/fumee-reseau/`
  (`scripts/fumee-reseau.mjs`). `FUMEE_RESEAU=temoin|direct|enregistrer` force le mode ; réenregistrer
  quand ces points changent de requêtes.
- **Au quotidien** : seulement les points touchés, et `FUMEE_CLASSES=large FUMEE_THEMES=light` pour
  une classe et un thème. `FUMEE_PARALLELE=n` règle le nombre de parties jouées à la fois (par
  défaut une par tranche de quatre cœurs : une seule sur la machine du cloud, où deux parties
  simultanées rendent instables les points aux longues attentes).
- three.js, EZ-tree et pdf-lib sont servis par Vite depuis `node_modules`, aux chemins `assets/vendor/…` de la livraison
  (`deploy/bibliotheques.mjs`) ; `servirThreeLocal` ne couvre plus que les adresses du CDN qui restent (secours, model-viewer).
- **Lot `ci`** (job `fumee` de la CI, à chaque PR) : douze points du cœur, au bureau, thème clair,
  Vue 3D en Économe, réseau témoin (liste et raisons : `LOTS` dans `scripts/fumee.mjs`). En local comme
  la CI : `NODE_PATH=$(npm root -g) node scripts/fumee.mjs http://localhost:5199 ci`, environ deux minutes.
- Le point 40 ne joue rien par construction (couvert par le passage en thème sombre).
- Un passage complet reste long : lancer le serveur Vite avec un délai long, sinon il
  est coupé en route et les points suivants échouent en `ERR_CONNECTION_REFUSED`. Après un plantage
  du navigateur, rejouer seulement les points restants.
- Pour arrêter un serveur, chercher le processus par `ps aux | grep "[v]ite --port 5199"` : un
  `pkill -f` trop large tue aussi le shell qui le lance.

## Circuit d'une modification

1. Branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. Vérifications ci-dessus, puis fumée sur les points touchés.
3. Entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. PR vers `main`, CI `verifier` verte, merge (commit de merge, pas de squash).
5. Livraison construite **depuis `main`**, après avoir vérifié les requêtes du serveur contre la vraie API
   Claude (les tests ne voient qu'un faux Anthropic ; quelques centimes, plafonnés par le serveur) :
   ```bash
   ANTHROPIC_API_KEY=… npm run verifier:api-claude              # ou le workflow manuel « Vérifier l'API Claude »
   BACKPROD_API_URL=https://www.raillard.org npm run livraison   # livraison/ et livraison.zip
   ```
   `livraison/` est versionné : le build réécrit au moins `LISEZMOI-DEPLOIEMENT.txt` (le commit
   cité). Construire dans un worktree à part (`git worktree add --detach … origin/main`, avec un
   lien vers `node_modules`) garde la copie de travail propre. `livraison.zip` est ignoré par git.

## Moteur de règles

Le moteur est rangé sous un seul nom, `regles/`, un dossier par couche (`MD/architecture.md` §5.2.4) :
`src/regles/` (contrat et données validées : réglages, profils, faits, décisions), `src/facade/regles/`
(les règles : appliquer un fait, un profil, les garde-fous, rejouer un cas) et `src/app/regles/sujets/`
(ce que l'audit sait proposer, un module par sujet, enregistré dans `SUJETS`) ; ce que Claude lit de
chaque sujet est une description (`src/regles/sujets/descriptions/`), et **`deploy/prompt-analyse.md` et
`deploy/schema-analyse.json` sont générés** (`npm run regles:generer`, jamais à la main ; un texte changé
monte la version dans `versions.ts`). L'écran Admin › Règles (`?admin&ecran=regles`) les montre recalculés en
direct. Les données sont dans
`regles/` à la racine. Trois entrées qui ne se mélangent pas : une **règle** (code), un **réglage**
(`regles/*/reglages.json`, un seuil), un **fait** (`regles/toits/faits.json`, un bâtiment).
**Rien du moteur ne va hors de ces dossiers**, et ils ne contiennent rien d'autre. Ajouter un sujet à
l'audit (chien-assis, objet du jardin…) : la liste de `MD/architecture.md` §5.2.4. Une décision de
l'audit passe par le moteur (`corpsSousContrainte`) : elle n'écrit jamais une forme de toit de sa propre
main, ni dans `faits.json` (qui ne change que par PR). Charger le skill `toits` ou `regles-toits` avant
d'y toucher.

## Interface

- `/?palette` (admin, menu « Admin » de la barre) montre et règle les couleurs, les variables CSS
  et les polices. Les couleurs d'origine sont dans `src/styles/jetons.ts` (testées contre
  `app.css`) ; celles réglées par l'admin vivent dans un JSON sur le serveur (`admin/palette`),
  posé par-dessus au démarrage (`app/paletteServeur.ts`). Une couleur nouvelle de l'interface
  s'ajoute d'abord à `jetons.ts`, puis aux modèles (`node scripts/generer-modeles-palette.mjs`,
  vérifiés par `tests/unit/styles/modeles.test.ts`).
- **Charger le skill `design-ui`** (`.claude/skills/design-ui/SKILL.md`) avant tout changement
  d'IHM : zones Z1 à Z9, trois classes d'écran, jetons de couleur, tactile, accessibilité.
- Un bouton est une liaison vers une commande du registre (`app/commandes.ts`) et lit
  `commandes.etat(id)` : effacé si `capacite`, grisé avec la raison sinon (infobulle ; au doigt,
  la raison s'écrit sous le groupe). Jamais `obtenir(id).actif` seul, qui ignore les droits.
- Une commande nouvelle s'inscrit dans `app/exposition.ts` pour chaque classe d'écran.
- Un champ de l'inspecteur est un descripteur de `ui/champs/` : il déclare ce qu'il lit, écrit et
  déclenche. `sale: false` = réglage d'affichage (ni annulation, ni « projet modifié », permis en
  lecture seule). Un bouton déclare `agit` (`projet`, `interface` ou `{ commande }`).
- Ce que la fonction d'un objet lui donne (formes admises, sections propres) est décrit une fois,
  dans `src/model/fonctions.ts` : `estTerrasse` (un polygone), `estParasol` (un cercle),
  `estBatiment`, `estVueUtilisable`, `parcelleDuProjet`, `terrasseOuPremiere`. Ne pas réécrire ces
  tests à la main ailleurs.

## Toits

- **Charger le skill `toits`** (`.claude/skills/toits/SKILL.md`) avant de toucher aux toits ou aux
  hauteurs de murs (`facade/toits/toitCorps.ts`, `toitLidar.ts`, `model/toitMesure.ts`, `volumesToit.ts`,
  `app/toits/toitsLidar.ts`, `three/toitCorps3d.ts`, `facade/ouvertures.ts`) : règles, seuils, pièges, et
  les scripts de banc d'essai sur un village. **AE 101 (2 allée des Limites, Le Vésinet) ne doit pas
  bouger** : `npx tsx .claude/skills/toits/scripts/identite.ts`.

## Conventions

- Code et commentaires en français ; commentaires **sans accents** dans le code source, qui
  expliquent pourquoi. Textes de l'interface en français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/`.

## Décisions déjà prises

- **Un seul serveur, en PHP** (`deploy/*.php`, livré dans `livraison/`) : le second serveur Node (`buildsg/`) a été retiré le
  25 octobre 2026, ses deux copies d'un même contrat s'écartaient. Le calcul d'`analyse.php` vit dans
  `deploy/analyse-fonctions.php` (rien ne s'y exécute à l'inclusion) et se teste fonction par fonction
  (`tests/unit/deploy/analyseFonctions.test.ts`) ; les routes, par `php -S` derrière `tests/fixtures/deploy/routeur-admin.php`.
- **« Filaire » (Vue 3D)** est une préférence d'affichage : pas de Ctrl+Z, pas de « projet
  modifié », permise en lecture seule. Elle reste rangée dans `construction.lames3dFilaire` pour
  être retrouvée à la réouverture.
- **Parcelle voisine** (import cadastre, `fonction: terrain`) : elle ne montre que sa référence
  cadastrale ; clôture et lieu appartiennent à la parcelle du projet.
- **Menu « Fonction »** : ne propose que les fonctions admises par la forme de l'objet ; la
  fonction en place reste proposée pour un ancien fichier.
- **Cases de l'explorateur** (masquer un objet, ses étiquettes, et leurs « tous ») : préférences
  d'affichage, comme « Filaire » — pas de Ctrl+Z, pas de « projet modifié », permises en lecture
  seule (`app/explorateur.ts`, `app/ecouteurs/cibles.ts`). Elles restent rangées dans l'objet pour
  être retrouvées à la réouverture.
- **« Relief » et « Courbes de niveau »** (menu Affichage, section Relief) : préférences d'affichage
  sans Ctrl+Z, permises en lecture seule, mais qui **marquent le projet à enregistrer** (attribut
  `enregistre` des champs, `app/ecouteurs/relief.ts`) : l'utilisateur attend de les retrouver.
- **Audit de la parcelle** : les maisons voisines n'en font pas partie (ni liste, ni reconnaissance,
  ni analyse). Quand la parcelle porte plusieurs bâtiments, « verrouiller un bâtiment » est un geste
  volontaire de la personne, valable sur l'écran de prise seulement : le rendu pour Claude se dessine
  sur la scène épurée avec tous les bâtiments de la parcelle (`app/audit/parcelle/controleur.ts`).
  Le rendu pour Claude montre la façade entière, pas ce que le téléphone cadrait.
  Une façade **choisie** (touchée, ou prise dans la liste) fixe la vue de prise : la position ne suit
  plus le GPS, la caméra arrive en élévation devant la façade (perpendiculaire, à mi-hauteur, comme le rendu pour
  Claude) puis tourne sur l'axe vertical du bâtiment (`vuePrise.ts`, `orbite`, `poseFace`), avec les pas
  autour de lui ou au doigt sans GPS sûr ; ni zoom ni inclinaison.
  **L'avant/après de l'admin** (Admin › Audits, « Avant / Après ») est l'écran des propositions de
  l'audit, pas une copie : une session de consultation à part (`commande.ts::consulter`) dont la
  validation est figée sur le fichier (`validation.figer`), en lecture seule. Ne pas écrire un second
  aperçu 3D : toute évolution de l'avant/après (et plus tard les décisions) se fait dans
  `validation.ts` / `PropositionsAudit.tsx`, pour les deux.
- **Silhouette d'une façade (audit, calibration)** : un gabarit tiré du plan et du LiDAR (`facade/gabaritMur.ts`), jamais lu sur
  la photo ni déformé : le haut de toute la façade, tous corps du toit compris, en mètres ramenés à la hauteur du mur. Il se pose
  entre l'égout, le sol et les bouts trouvés, et seule son échelle suit. Les repères ne disent que les directions ; la dimension
  vient de ce calage. Aucune vue ne coupe la photo au mur. L'assemblage des photos redressées entières est l'image prise pour la
  suite (mur, détection, texture, toit), pour l'audit, le relevé et la calibration (`analyseMur.ts::analyserLeMur`). Avec
  plusieurs vues du mur entier, l'assemblage pose le mur et l'image du mur se compose par la fusion de ces mêmes photos (vote des
  baies, occultations par la parallaxe, meilleure vue pixel par pixel : `analyseMur.ts::fondreLesVues`), dans le même cadre.
- **Arbres (Vue 3D)** : générés par EZ-tree à partir de la **bibliothèque d'essences** : celle de l'admin
  (`admin/arbres`, `model/especesArbre.ts`, écran `?admin&ecran=arbres`) si elle en a enregistré, sinon les
  quarante essences livrées dans `data/admin/arbres.json` (dix par taille : petits, moyens, grands, très grands ; le code n'a aucune essence, sans fichier les arbres se dessinent en repli) ; les témoins GLB et cadastre se capturent sans bibliothèque (`poserEspeces([])`) ; l'utilisateur choisit une essence
  et ses dimensions, rien d'autre. Les anciens dessins (ports, lobes, feuilles) sont supprimés, sans
  correspondance. Un arbre du plan est un groupe sans maille, dessiné par des lots `InstancedMesh`
  refaits par `synchroniserArbres` (`three/arbre3d.ts`) : tout code qui pose, retire ou masque un arbre doit
  repasser par `rafraichirArbres` (scene.ts). Les textures d'EZ-tree se lisent en `NoColorSpace`. Le témoin
  GLB se capture **sans bibliothèque** (repli : tronc et boule).
- **Gazon de la parcelle du projet (Vue 3D)** : montré par défaut, au-dessus de la photo aérienne
  (`three/gazon.ts`, texture dessinée). La case « Gazon (3D) » (Apparence) suit la même règle que
  « Relief » ; une texture horizontale choisie l'emporte. Seul son retrait s'écrit (`gazon3d: false`).
- **three.js 0.186.1, en modules ES servis par la livraison** (`src/three/bibliotheque.ts`, seul fournisseur du
  global `THREE`) : pas empaqueté, mais copié de `node_modules` dans `assets/vendor/three@0.186.1/` au build
  (`deploy/bibliotheques.mjs`, mêmes octets et mêmes empreintes que jsDelivr) ; table d'import inline dans `index.html`
  (même URL que `URL_THREE`, testé). Pas de secours au CDN pour three.js (une seule adresse dans la table d'import) ;
  EZ-tree et pdf-lib, copiés aussi, retombent sur jsDelivr si leur copie ne se charge pas.
  Pour garder le rendu de la r128 : `ColorManagement.enabled = false`, sortie linéaire, **toute intensité de
  lumière se pose × `ECHELLE_LUMIERE` (π)**, la courbe de film reste la nôtre (`rendu.ts`). Un exemple de
  three (`chargerExemple`) se charge à la demande et se pose sur `THREE`. Monter de version = rejouer le banc
  visuel (`BANC_QUALITE_VUES=normale` puis `soignee`) et le point 24 (le `.glb` bouge : `EMPREINTES.md`).
