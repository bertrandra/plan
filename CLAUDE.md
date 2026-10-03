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

- `tests/unit/architecture.test.ts` impose les couches : `util/shell` → `geometry` → `model` →
  `engine/geo/facade` → `core/io/render/export/three/interaction` → `ui` → `app/zones`. Une couche
  n'importe jamais une couche plus haute.
- `tests/unit/plateforme/contrat.test.ts` ne dépend pas de `BACKPROD_API_URL` : la suite doit passer
  avec et sans la variable (elle reste exportée après un build).

## Fumée pilotée (navigateur)

```bash
BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort   # en arrière-plan
NODE_PATH=$(npm root -g) node scripts/fumee.mjs http://localhost:5199 [points…]
```

- Joue chaque point dans les trois classes d'écran (compact, moyen, large) et les deux thèmes.
  La liste et le journal sont dans `tests/CHECKLIST-FUMEE.md`.
- **Points 12 à 15** (cadastre IGN, voisinage, orthophoto, PLU) : ils demandent `data.geopf.fr`,
  bloqué dans l'environnement cloud. Leur échec y est attendu.
- three.js est servi depuis `node_modules/three` (`servirThreeLocal`) ; `FUMEE_CDN=1` revient aux CDN.
- Le point 40 ne joue rien par construction (couvert par le passage en thème sombre).
- Un passage complet dure plus de 30 minutes : lancer le serveur Vite avec un délai long, sinon il
  est coupé en route et les points suivants échouent en `ERR_CONNECTION_REFUSED`. Après un plantage
  du navigateur, rejouer seulement les points restants.
- Pour arrêter un serveur, chercher le processus par `ps aux | grep "[v]ite --port 5199"` : un
  `pkill -f` trop large tue aussi le shell qui le lance.

## Circuit d'une modification

1. Branche `claude/<sujet>` depuis `origin/main`. **Jamais de push direct sur `main`.**
2. Vérifications ci-dessus, puis fumée sur les points touchés.
3. Entrée dans `CHANGELOG.md`, sous `## [Non publié]` (Ajouté / Modifié / Corrigé), en français.
4. PR vers `main`, CI `verifier` verte, merge (commit de merge, pas de squash).
5. Livraison construite **depuis `main`** :
   ```bash
   BACKPROD_API_URL=https://www.raillard.org npm run livraison   # livraison/ et livraison.zip
   ```
   `livraison/` est versionné : le build réécrit au moins `LISEZMOI-DEPLOIEMENT.txt` (le commit
   cité). Construire dans un worktree à part (`git worktree add --detach … origin/main`, avec un
   lien vers `node_modules`) garde la copie de travail propre. `livraison.zip` est ignoré par git.

## Interface

- `/?palette` montre les couleurs et les polices (jetons de `src/styles/jetons.ts`) : s'y référer
  avant de choisir une couleur.
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

## Conventions

- Code et commentaires en français ; commentaires **sans accents** dans le code source, qui
  expliquent pourquoi. Textes de l'interface en français, avec accents, au vouvoiement.
- Messages de commit en français : un titre court, puis le pourquoi.
- Les tests vivent dans `tests/unit/<couche>/`, miroir de `src/`.

## Décisions déjà prises

- **« Filaire » (Vue 3D)** est une préférence d'affichage : pas de Ctrl+Z, pas de « projet
  modifié », permise en lecture seule. Elle reste rangée dans `construction.lames3dFilaire` pour
  être retrouvée à la réouverture.
- **Parcelle voisine** (import cadastre, `fonction: terrain`) : elle ne montre que sa référence
  cadastrale ; clôture et lieu appartiennent à la parcelle du projet.
- **Menu « Fonction »** : ne propose que les fonctions admises par la forme de l'objet ; la
  fonction en place reste proposée pour un ancien fichier.

## Questions ouvertes

- Cases de l'explorateur (masquer, étiquettes) : aujourd'hui elles écrivent le projet (annulables,
  « projet modifié ») même en lecture seule. Préférence d'affichage ou donnée du projet grisée en
  lecture seule ? À trancher avant d'y toucher.
