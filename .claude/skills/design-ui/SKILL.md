---
name: design-ui
description: Concevoir ou modifier l'interface de Plan (zones Z1 à Z9, composants React de src/zones/, feuille src/styles/app.css, descripteurs de champs de l'inspecteur). À charger avant d'ajouter un bouton, un panneau, un champ, un dialogue, une couleur ou une règle CSS, ou avant de déplacer une commande d'une zone à une autre.
---

# Design UI de Plan

Plan est un outil de travail pour chiffrer une terrasse, pas une vitrine. L'interface **déclenche
et affiche** ; elle ne calcule rien. Toute proposition d'IHM se juge à trois questions :

1. Dans quelle zone vit-elle, et y est-elle seule ? (`MD/spec-ihm-zones.md` §3)
2. Passe-t-elle par le registre de commandes ou les descripteurs de champs, sans code ad hoc ?
3. Laisse-t-elle les six empreintes de `tests/fixtures/golden/` intactes ?

Lire `MD/spec-ihm-zones.md` avant tout changement de structure. Ce skill en est le résumé
opérationnel, plus les conventions visuelles tirées de `src/styles/app.css`.

## 1. Placer : une commande, une zone

| Zone | Fichier | Ce qu'elle porte | Ce qu'elle ne porte jamais |
|---|---|---|---|
| Z1 Barre d'application | `zones/BarreApplication.tsx` | Projet, fichier, exports, affichage, vues, aide (menus `details.menu`) | Un réglage d'objet |
| Z2 Palette | `zones/Palette.tsx` | Outils sur le canevas : créer, éditer, coter, aligner | Un formulaire |
| Z3 Explorateur | `zones/Explorateur.tsx` | Objets par famille, visibilité, terrasses, calques, sélection du dossier | Une propriété d'objet |
| Z4 Canevas | `render/*`, `interaction/*`, `zones/Surimpression.tsx` | Le plan SVG, la 3D, la visionneuse ; en surimpression, la navigation seule | Un formulaire |
| Z5 Inspecteur | `zones/Inspecteur.tsx`, `ui/champs/*` | Les propriétés de la sélection, en sections contextuelles | Un résultat calculé |
| Z6 Résultats | `zones/Resultats.tsx`, `app/tiroir.ts` | BOM, débit, coupe, implantation, chantier, cotes, PLU, résumé — lecture seule sauf prix et cadences | Un réglage de construction |
| Z7 Barre d'état | `zones/BarreEtat.tsx` | Serveur, enregistrement, échelle, pointeur, sélection, version | Un clic (sauf l'indicateur d'enregistrement) |
| Z8 Dialogues | `zones/Dialogues.tsx`, `shell/dialogues.ts` | Parcours en plusieurs étapes, confirmations ; fermables par Échap | Un message informatif |
| Z9 Notifications | `zones/Notifications.tsx`, `shell/notifications.ts` | Toasts empilés, bandeau d'erreur fermable | Une question à l'utilisateur |

Règles :

- **Un geste n'existe qu'à un endroit**, plus au besoin une entrée de menu Z1 qui appelle la même
  commande. Si un bouton double une commande existante, supprimer l'un des deux.
- **Les zones ne se parlent pas.** Elles lisent le magasin (`app/magasin.ts`, Zustand) et émettent
  des commandes. Pas d'import d'une zone dans une autre, pas de `document.getElementById` d'une
  région voisine.
- **Terrasse est un contexte, pas une vue** : sélectionner une terrasse fait apparaître sa section
  dans Z5 et ses onglets dans Z6. Ne pas réintroduire de mode Terrasse.
- **Remplacer, c'est supprimer** : une région remplacée disparaît d'`index.html`, elle n'est pas
  masquée.

## 1 bis. Trois classes d'écran

Depuis la `2.1.0` (`MD/spec-ihm-mobile.md`), chaque zone a une forme par classe, posée par
`app/classe.ts` sur `<html data-classe>` et dans le magasin (`classe`) :

| Classe | Largeur | Forme |
|---|---|---|
| `compact` | < 600 px | plan plein écran, barre haute, barre de navigation ; les zones sont des **feuilles** (`<html data-feuille>`) |
| `moyen` | 600 – 1 023 px | plan plein écran, rail d'outils, explorateur et inspecteur flottants, tiroir en bas |
| `large` | ≥ 1 024 px | colonnes, comme avant la 2.1.0 |

- **Une commande ajoutée s'inscrit dans `app/exposition.ts`** avec un emplacement dans chacune des
  trois classes ; `tests/unit/app/exposition.test.ts` échoue sinon. `sansObjet` n'est admis que pour
  les commandes listées dans `SANS_OBJET_ADMIS`.
- **Un champ de l'inspecteur ne dépend jamais de la classe** : seule sa forme change (nombre → pas à
  pas, case → interrupteur, choix court → commande segmentée). Test : `inspecteur-champs.test.ts`.
- Une zone qui devient feuille rend `EnteteFeuille` (`zones/composants/Feuille.tsx`) en tête et son
  contenu dans `.corpsFeuille`. Le voile, Échap, le piège à focus et le retour du focus sont faits
  par `Voile`, une fois.
- Au doigt, **l'infobulle n'existe pas** : la raison d'un refus s'écrit sous le groupe, l'aide d'un
  champ grisé sous le champ.
- Cibles de 44 px sur `compact` et `moyen`, partout. Tout `position:fixed` d'une zone passe par les
  réserves `--reserve-haut` / `--reserve-bas` (encoche comprise) ; le plan mesure `#zoneCadre`.
- Vérifier à 390, 820 et 1 440 px, en clair et en sombre : `scripts/captures.mjs` (36 captures) et
  `scripts/fumee.mjs` (la liste de fumée pilotée).

## 2. Câbler : commandes et descripteurs, jamais d'écouteur isolé

- **Un bouton est une liaison vers une commande** de `app/commandes.ts` : identifiant stable
  (`groupe.verbe`), libellé, raccourci, condition d'activation. Le composant appelle
  `commandes.executer(id, e.currentTarget)` et lit `commandes.etat(id)`. Modèle : `Palette.tsx`.
- **Les trois refus s'affichent différemment** (`EtatCommande`) :
  - `capacite` → la commande **disparaît** (un outil de travail n'est pas une publicité) ;
  - `permission`, `quota` → **visible, grisée, et le message dans l'infobulle** ;
  - `contexte` → grisée, sans message (rien de sélectionné, rien à annuler).
- **Un champ de l'inspecteur est une donnée**, un descripteur de `ui/champs/` (`objet.ts`,
  `construction.ts`) : clé, libellé, type, unité, bornes, `visible(si)`, effets (`rendu`,
  `terrasse`, `scene3d`…). On n'écrit pas de JSX par champ. Une clé de `Construction` sans
  descripteur est une erreur de compilation : c'est voulu.
- Le rendu SVG et les gestes restent en **DOM natif** dans leur composant hôte. Ne pas les
  réécrire en React.

## 3. Dessiner : le langage visuel

### Couleurs — uniquement par les jetons de `:root`

Les valeurs vivent dans `src/styles/jetons.ts` et sont déclarées dans `app.css` (bloc `:root` clair,
bloc `prefers-color-scheme: dark`). `tests/unit/styles/jetons.test.ts` vérifie que les deux
concordent, que les paires texte/fond atteignent 4,5:1 (3:1 pour `--ok` et `--alerte`), et **qu'aucune
couleur hexadécimale ne traîne hors des blocs de jetons**.

| Jeton | Rôle |
|---|---|
| `--ink`, `--ink-soft` | Texte, texte secondaire (libellés, notes, unités) |
| `--on-ink` | Texte posé sur `--ink` (bouton principal, choix actif) |
| `--paper`, `--paper-deep` | Fond de page, fonds en retrait (barre d'état, onglets inactifs) |
| `--panel-bg`, `--panel-2`, `--segment-bg` | Panneaux et feuilles ; tuiles, chiffres clés, boutons − et + ; fond d'une commande segmentée |
| `--stage-bg`, `--stage-trame`, `--input-bg` | Canevas et sa trame ; champs |
| `--border`, `--rule`, `--hairline` | Bordures de panneaux ; contours de commandes et filets de titre ; filets entre lignes |
| `--accent`, `--on-accent` | État actif, sélection, bouton Créer, total ; le texte posé dessus |
| `--accent-light`, `--on-accent-light` | État actif doux, pastilles, survol ; le texte posé dessus |
| `--ok`, `--danger`, `--danger-bg`, `--alerte` | Enregistré ; suppression et erreurs ; bordure des alertes |
| `--toast-bg`, `--on-toast` | Notifications |
| `--zebra`, `--zebra-hover` | Alternance des lignes de tableau |
| `--ombre`, `--ombre-flottante`, `--ombre-menu`, `--ombre-forte`, `--ombre-feuille`, `--scrim` | Ombres et voile |
| `--r-champ`, `--r-bouton`, `--r-tuile`, `--r-panneau`, `--r-feuille` | Rayons (10, 12, 14, 16, 22) |

- Un nouveau jeton se déclare dans `jetons.ts` **et** dans les deux blocs de `app.css`.
- **Jamais de couleur en dur** dans la feuille : le test le refuse. Texte blanc sur l'accent ou
  sur l'encre : `--on-accent`, `--on-ink` (en sombre ils deviennent foncés).
- Le plan à l'écran lit ses encres dans `src/render/theme.ts` (trait, grille, halo) ; les couleurs des
  objets sont celles du projet ; **les exports gardent leurs propres encres** (empreintes).
- **La couleur ne porte jamais seule** une information : un mot ou une icône l'accompagne.

### Typographie — deux familles, deux rôles

- Les familles passent par `--serif`, `--sans`, `--mono` (piles système : décision 1 de
  `MD/spec-ihm-mobile.md` §14).
- **Serif** (`Georgia`, `Iowan Old Style`) : le document et ses titres — noms d'objets, titres de
  panneaux, boutons principaux, onglets de résultats, indications en italique (`.hint`).
- **Sans** (`Helvetica Neue`, Arial) : l'instrument — menus, palette, barre d'état, libellés de
  champs, en-têtes de section en petites capitales (`0.62–0.64rem`, `letter-spacing:.1em`,
  `text-transform:uppercase`, couleur `--ink-soft`).
- **Monospace** : seulement ce qui se recopie (résumé, références de requête, bandeau d'erreur).
- Tout nombre qui change ou s'aligne en colonne prend `font-variant-numeric: tabular-nums`.
- Échelle en `rem`, compacte : corps `0.8rem`, notes `0.68–0.74rem`, titres de boîte `1.05–1.15rem`.

### Formes et densité

- Rayons : 6 px pour les petits contrôles du bureau, 10 à 16 px pour les panneaux et cartes, 22 px
  pour le haut des feuilles, `999px` pour les pastilles ; les nouveaux composants passent par les
  jetons `--r-*`.
- **Icônes** : `src/zones/icones.tsx`, un seul jeu en trait sur 24 px, `currentColor`, toujours
  `aria-hidden`. Plus de glyphes Unicode ni d'émojis dans les boutons.
- Ombres douces et chaudes : `0 1px 3px rgba(59,46,31,0.06–0.2)` ; `0 4px 12px` pour un menu
  ouvert ; les dialogues seuls ont une ombre franche.
- Interface **dense** : c'est un logiciel métier. Champ de l'inspecteur = grille
  `118px | 1fr`, hauteur ≥ 32 px ; libellé à gauche, commande et note à droite, unité après le
  nombre (`.champNombre .unite`).
- Tableaux : `table.attrTable`, en-têtes en capitales couleur accent, zébrure `--zebra`. Sur des
  tableaux de vingt à cent lignes, l'alternance n'est pas décorative.
- Sections repliables : `<details>` avec chevron `›` qui pivote (voir `.inspecteurSection`).
- Boutons : `button` plein (`--ink`) pour l'action principale, `.secondary` pour le reste,
  `.small` pour les actions de ligne, `.danger` pour l'irréversible — toujours derrière une
  confirmation Z8.

### Tactile et petits écrans — critère d'acceptation, pas option

- Cibles **≥ 44 px** dans Z2 et Z5 (`min-width/min-height:44px` sur les outils) ; ≥ 32 px partout
  ailleurs, cases à cocher 18–20 px.
- **Sous 1 024 px** (`@media (max-width: 1023px)`) : palette et explorateur s'escamotent,
  l'inspecteur passe sous le plan, la barre d'application se replie sur deux lignes. Toute nouvelle
  colonne doit dire ce qu'elle devient à cette largeur.
- Les gestes pincer (2 doigts) et déplacer (3 doigts) du canevas ne doivent jamais être capturés
  par une surimpression : `touch-action:none` reste sur `#stage`.

### Accessibilité

- Un choix est un `<button>`, pas une `div` cliquable (voir `.premierChoix`).
- Bouton à glyphe seul : `aria-label` et `title` (libellé + raccourci + motif de refus), glyphe en
  `aria-hidden="true"`. Bascule : `aria-pressed`. Groupes : `role="group"` et `aria-label`.
- Échap ferme dialogues et menus ; le focus ne se perd pas pendant la saisie dans l'inspecteur.

## 4. Écrire : le ton

- Français, vouvoiement dans les messages à l'utilisateur, phrases courtes et concrètes.
- Un refus **dit quoi faire** (« Un administrateur de votre organisation peut vous donner ce
  droit. »), jamais seulement « Action impossible ».
- Pas de message « Sélectionnez d'abord un objet » : on grise la commande.
- Les commentaires CSS et TS expliquent **pourquoi** (voir ceux de `app.css`), en français sans
  accents dans le code source, comme le reste du dépôt.

## 5. Vérifier avant de livrer

```bash
npm run typecheck && npm run lint && npm test   # dont architecture.test.ts, exposition, jetons, empreintes
npm run cliquet
BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 &
node scripts/captures.mjs                        # 36 captures : 390 / 820 / 1 440 px, clair et sombre
node scripts/fumee.mjs                           # la liste de fumée pilotée, dans les trois classes
```

- Relire les captures dans les deux thèmes et les trois classes.
- Dérouler les points concernés de `tests/CHECKLIST-FUMEE.md` ; un point qui échoue bloque.
- Les empreintes golden doivent rester identiques hors numéro de version : **une modification
  d'IHM qui change un export n'est pas une modification d'IHM**.
- Noter le changement dans `CHANGELOG.md`, et dans `MD/spec-ihm-zones.md` si une commande change
  de zone.

## Anti-modèles

- Ajouter un bouton « là où il y a de la place » : c'est ainsi que l'ancienne IHM a grandi en sept
  régions empilées.
- Mêler réglages et résultats dans le même groupe d'onglets.
- Introduire une bibliothèque de composants, Tailwind ou une icônothèque sans décision écrite :
  le fichier livré est unique et son budget est de 5 Mo.
- Styles en ligne (`style={{…}}`) pour autre chose qu'une valeur calculée (couleur d'un calque,
  hauteur mesurée).
- Animation au-delà d'une transition de 0,12–0,2 s.
