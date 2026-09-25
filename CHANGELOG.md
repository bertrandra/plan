# Journal des modifications

Format [Keep a Changelog 1.1](https://keepachangelog.com/fr/1.1.0/), versionnement selon
[`MD/RELEASE.md`](MD/RELEASE.md). Les versions les plus récentes en premier.

## [Non publié]

### Interne

- **Les quarante points de la liste de fumée se jouent, réseau compris.** Huit d'entre eux — import
  cadastre, voisinage, orthophoto, PLU, vue 3D, rappel de point de vue, export GLB et éclairage sur
  téléphone — rendaient « non joué » **sans rien tenter** : une constante du pilote le décrétait,
  parce que la recette de la `2.1.0` tournait sans réseau sortant. Ils ont maintenant une vraie
  implémentation, et un environnement sans réseau les verra échouer avec la mesure qui dit où ça
  s'est arrêté. Un refus mesuré se lit ; un refus décrété se recopie d'un passage à l'autre sans
  que personne ne le rejoue jamais.

  **44 passés, 0 échec, 0 non joué sur 44**, dans les trois classes d'écran et les deux thèmes. Les
  valeurs sont celles des passages manuels de la `1.1.0` et de la `1.2.0` — AC 0530 et 418 m² pour
  l'adresse, neuf objets de voisinage masqués d'un coup, quatre tuiles d'orthophoto, zone psmv
  type U — donc les campagnes redeviennent comparables. Le point 23 tient désormais le défaut D-15,
  qui n'était prouvé que par une vérification à la main.

  Sept corrections ont été nécessaires, **toutes dans le pilote et aucune dans le produit**. La plus
  instructive : le drapeau qui rend un objet masquable vient de l'actualisation IGN et non de
  l'import cadastre, ce que le type du modèle disait déjà.

- **Le témoin `glb-structure.json` est recapturé**, et la note qui annonçait son mouvement est
  corrigée. Le fichier passe de 41 473 604 à 3 234 100 octets, avec 8 images au lieu de 178, comme
  prévu. Mais les vues tampon baissent aussi, de 829 à 659, ce que l'annonce avait omis : chaque
  image embarquée occupe la sienne. Le point 24 vérifie cette arithmétique au lieu de l'immobilité.

## [2.1.0] — 2026-09-25

**L'interface s'adapte au téléphone, à la tablette et au bureau, en clair et en sombre**
(`MD/spec-ihm-mobile.md`). Neuf paliers `alpha`, puis une recette. Rien n'a été perdu : une carte
d'exposition vérifiée par test place chacune des 59 commandes dans chaque classe d'écran, et un
autre test vérifie que l'inspecteur rend les mêmes champs partout. Aucun nombre n'a bougé : les six
artefacts exportés sont identiques aux témoins hors numéro de version.

### En bref

- **Téléphone** : le plan occupe l'écran ; une barre haute (projet, statut, Annuler, Exporter) et
  une barre de navigation (Objets, Coter, **+**, Propriétés, Résultats) ; chaque zone devient une
  feuille qui monte du bas ; une feuille de sélection résume l'objet touché ; les champs sont
  tactiles ; un bandeau recalcule le chiffrage à chaque réglage ; les tableaux deviennent des cartes.
- **Tablette** : rail d'outils, explorateur et inspecteur flottants, tiroir en bas.
- **Bureau** : la disposition en colonnes, avec la nouvelle palette et les icônes.
- **Défauts corrigés** : « Ajuster à la sélection » invisible partout (D1), aucun moyen de sortir
  d'un pointage de cote (D3), filet copiable des exports écrit dans un onglet fermé (D5), Ctrl+S
  affiché mais sans effet (D2), Ctrl+Z hors registre (D6), fond orthophoto visible sans la capacité
  (D8), libellés périmés (D10), dialogues qu'Échap ne fermait pas (D11).

### Corrigé par la recette

- **Valider un nombre par Entrée écrivait deux fois** : Entrée validait, puis la sortie du champ
  validait à nouveau, avec deux instantanés d'annulation — un Ctrl+Z semblait alors ne rien faire.
  Présent depuis la `1.2.0`. Entrée quitte désormais le champ, et c'est la sortie qui valide ; un
  test le verrouille.
- Sur tablette, le tiroir des résultats ouvert recouvrait le bas de l'inspecteur et du rail, et le
  bandeau de pointage : les panneaux passent au-dessus du tiroir, le bandeau se pose en haut du plan.
- Le bouton des réglages 3D n'apparaissait qu'une fois la bibliothèque 3D chargée : il est sorti
  du cadre de la scène.
- Sur téléphone, « Ajuster à la sélection » cadre l'objet au-dessus de la feuille de sélection.
- Tourner le téléphone avec un champ en cours de saisie ne replie plus l'inspecteur et garde le
  brouillon.

### Recette

- **La liste de fumée passe à 40 points**, joués dans les trois classes et les deux thèmes :
  **134 passés, aucun échec, 45 non joués** sur 179 — les points qui demandent le réseau (cadastre,
  voisinage, orthophoto, PLU, 3D, GLB), que l'environnement de recette n'avait pas. Ils restent à
  passer à la main. Détail dans `tests/CHECKLIST-FUMEE.md`.
- `scripts/fumee.mjs` pilote la liste avec de vrais évènements de pointeur, de doigts et de clavier,
  et mesure chaque geste dans l'état du plan ; `scripts/captures.mjs` produit 36 captures de
  référence.
- Trois défauts relevés et laissés hors du périmètre sont inscrits à `MD/DEFAUTS.md` (D-16 à D-18).
- **Empreintes** : `plan.svg`, `plan.dxf`, `resume.txt`, `plan.pdf` et `dossier.pdf`, rejoués depuis
  l'interface, sont identiques au bit près aux témoins une fois le numéro neutralisé ; `projet.json`
  porte les mêmes objets et les mêmes mesures. Les témoins ne sont pas recapturés.
- 736 tests (709 + 27). Fichier livré : 787 Ko.

## [2.1.0-alpha.9] — 2026-09-25

**IHM mobile, étape M8** : la vue 3D et la visionneuse sur téléphone et tablette.

### Modifié

- **Sur téléphone et tablette, la scène 3D prend l'écran** sous la barre haute, au lieu d'un cadre
  de 420 px. Les commandes de caméra (zoom, tourner, déplacer, zoom au glisser, PNG, hauteur des
  yeux) sont une colonne de boutons de 44 px posée sur la scène, avec un bouton ⚙ qui ouvre les
  **réglages** — feuille sur téléphone, panneau sur tablette : filaire, objets, opacité, textures,
  ombres, date et semaine, intensité, lumière d'appoint, points de vue, aide. **L'heure a sa propre
  barre** en bas de la scène, pour la faire défiler au pouce. Même disposition pour la visionneuse.
- Sur bureau, le cadre de la scène suit la hauteur de la fenêtre (420 px au moins), et le plein
  écran reste. Sur téléphone et tablette, le plein écran n'a plus d'objet et disparaît.
- Les émojis des boutons 3D deviennent des icônes ; le mode actif (tourner, déplacer, zoom) se
  colore selon le thème.

### Corrigé

- Libellés périmés de l'aide 3D (D10) : « Mode Plan », « + Point de vue », et les émojis ⟳ ✋ 🔍
  cités dans le texte.

### Preuve

- **Les exports n'ont pas bougé.** Rejoués depuis l'interface sur le jeu de démonstration, numéro de
  version neutralisé : `plan.svg`, `plan.dxf` et `resume.txt` sont identiques au bit près aux
  témoins ; `plan.pdf` et `dossier.pdf` ne diffèrent que par le numéro, les longueurs de flux et la
  table des décalages qu'il décale de huit octets ; `projet.json` a les mêmes objets et les mêmes
  mesures, son bloc `meta` ne différant que par l'identité, les dates et le numéro.

## [2.1.0-alpha.8] — 2026-09-25

**IHM mobile, étape M7** : les menus de Z1 et le clavier. La feuille Projet (téléphone) et son
panneau déroulant (tablette) sont arrivés aux étapes M3 et M4 ; la carte d'exposition place
maintenant chaque entrée des menus dans la feuille Projet sur téléphone.

### Corrigé

- **Ctrl+S enregistre** (Cmd+S sur Mac). Le raccourci était affiché dans le menu Fichier sans que
  rien ne l'écoute : le navigateur ouvrait « Enregistrer la page » (D2).
- **Ctrl+Z passe par la commande Annuler**, avec ses conditions, au lieu d'appeler l'historique à
  côté du registre (D6). Le geste ne change pas.
- **Le fond orthophoto s'efface du menu Affichage quand l'organisation n'a pas la fonction**, comme
  toute entrée de menu ; il restait visible (D8).

### Interne

- `app/clavier.ts` : table des raccourcis, branchée sur le registre ; `core/historique.ts` n'écoute
  plus le clavier.

## [2.1.0-alpha.7] — 2026-09-25

**IHM mobile, étape M6** : dialogues, notifications, porte et premier pas sur téléphone.

### Modifié

- **Sur téléphone, une confirmation monte du bas**, boutons pleine largeur de 48 px, action
  principale au-dessus. Les parcours — import cadastre en trois étapes, sélecteur de textures —
  prennent l'écran entier ; les boutons de l'import restent collés en bas pendant qu'on défile.
  L'actualisation IGN devient une feuille.
- Les toasts se posent au-dessus de la barre de navigation ; le bandeau d'erreur passe en haut de
  l'écran, le bas étant pris.
- La porte et le premier pas prennent la largeur du téléphone, champs et boutons de 48 px.
- Les boîtes imperatives passent sur les jetons : elles suivent enfin le thème sombre.

### Corrigé

- **L'actualisation IGN et le sélecteur de textures se ferment par Échap**, comme les autres
  dialogues (D11).
- Libellés périmés (D10) : les toasts de l'actualisation IGN citaient « + Depuis une adresse »
  (c'est « Fichier › Nouveau plan depuis une adresse »), et la note sur le voisinage parlait d'une
  case « en haut à droite » qui n'existe plus.

## [2.1.0-alpha.6] — 2026-09-25

**IHM mobile, étape M5** : les propriétés et les résultats sur téléphone et tablette.

### Ajouté

- **La feuille Propriétés** (téléphone) : l'inspecteur entier, ses quatorze sections dans le même
  ordre, précédées de pastilles qui mènent à chaque section. Sur téléphone et tablette, **les
  champs prennent une forme tactile** sans changer de descripteur : un nombre devient un pas à pas
  (− et + de 44 px ; la valeur reste saisissable, virgule comprise ; un appui maintenu répète, et
  ne laisse qu'un instantané d'annulation par appui), une case un interrupteur, un choix de trois
  options courtes une commande segmentée. L'aide d'un champ grisé s'écrit sous lui.
- **Le bandeau de chiffrage** en pied de l'inspecteur d'une terrasse : appuis, lames, fourchette
  estimée, recalculés à chaque réglage, et un geste vers la nomenclature. La boucle
  réglage → chiffrage se voit sur un seul écran de téléphone.
- **La feuille Résultats** (téléphone) : les onglets en pastilles défilantes, le sélecteur de
  terrasse (« 1 sur 2 »), et **les tableaux en cartes** — une ligne, une carte, chaque valeur
  précédée du nom de sa colonne ; les prix, longueurs, cadences et boutons des cotes restent
  éditables dans la carte. Sur tablette, les tableaux gardent leurs colonnes et défilent.
- **Un bouton Copier** dans l'onglet Résumé.

### Corrigé

- **Le filet copiable des exports SVG et DXF s'écrivait dans un onglet fermé** : l'onglet Résumé
  s'ouvre désormais quand il sert (D5).

### Interne

- `ui/tableau.ts` pose sur chaque cellule le nom de sa colonne (`data-label`) après chaque rendu des
  panneaux, sans toucher à leur calcul ni à leurs écouteurs.

## [2.1.0-alpha.5] — 2026-09-25

**IHM mobile, étape M4** : les outils et l'explorateur sur téléphone et tablette.

### Ajouté

- **La feuille Outils** (téléphone, bouton **+**) : les six créations en tuiles, puis « Éditer ·
  *la sélection* » (Dupliquer, Supprimer en rouge, Reculer, Position initiale), puis Cote et
  Aligner. Un outil refusé par un droit ou un quota reste visible, grisé avec un cadenas, et **la
  raison est écrite sous le groupe** : au doigt, l'infobulle ne s'affiche pas. Choisir un outil
  referme la feuille.
- **La feuille Objets** (téléphone) : l'explorateur entier — familles en pastilles défilantes,
  liste, œil par objet, masquer tout, étiquettes, voisinage, terrasses, cases du dossier, calques de
  la terrasse. Toucher un objet le sélectionne et referme la feuille. **Un objet masqué se réaffiche**
  depuis cette liste : sur téléphone, c'était impossible.
- **Sur tablette**, le plan occupe l'écran : la palette devient un **rail d'outils** posé à gauche,
  l'explorateur et l'inspecteur des **panneaux flottants** repliés en poignée à l'ouverture, le
  tiroir des résultats se pose en bas au-dessus de la barre d'état. Le bouton ☰ ouvre les menus dans
  un panneau déroulant.

### Corrigé

- **Sur téléphone et petite tablette, la palette et l'explorateur étaient masqués sans
  remplacement** : pas d'Annuler, pas de création, ni duplication ni suppression d'objet, pas de
  sélection par nom.
- Le menu Étiquettes de l'explorateur se ferme par Échap et par un clic ailleurs, comme ceux de la
  barre (D11, en partie).

## [2.1.0-alpha.4] — 2026-09-25

**IHM mobile, étape M3** : le plan et la navigation du téléphone.

### Ajouté

- **Sur téléphone, le plan occupe l'écran** entre une barre haute et une barre de navigation.
  La barre haute porte le nom du projet, son statut d'enregistrement, **Annuler** et Exporter ; le
  bouton ☰ ouvre la **feuille Projet**, qui porte les menus Fichier, Exporter, Affichage et Aide
  avec les mêmes entrées, les mêmes cases et le même ordre. La barre de navigation ouvre les
  feuilles Objets, Outils (**+**), Propriétés et Résultats, et lance **Coter**.
- **Les feuilles** : une zone existante posée en bas de l'écran, avec une poignée qu'on glisse pour
  passer de l'aperçu à mi-hauteur puis au plein écran (ou pour fermer), un voile qui la ferme au
  toucher, Échap, et le focus qui y entre puis revient au bouton d'origine.
- **La feuille de sélection** : nom, fonction, trois chiffres (surface, hauteur finie, estimation du
  chiffrage pour une terrasse), Dupliquer, Supprimer, Désélectionner, et les boutons Propriétés et
  Chiffrage. Sur tablette, une carte en bas à gauche.
- **Sur le plan, un groupe flottant** Ajuster, Grille, Nord, et une pastille d'échelle qui donne
  aussi la position du doigt pendant un glisser.
- **Un bandeau pendant un pointage** (Cote, Aligner) : il dit quoi désigner, et **Annuler** ou
  **Terminer** en sortent. Échap aussi, sur toutes les tailles d'écran.

### Corrigé

- **« Ajuster à la sélection » était invisible partout** : le bouton était rendu, puis masqué par
  la feuille de style. La commande `vue.ajuster` n'avait donc aucun point d'accès (D1).
- **Rien ne permettait de sortir d'un pointage de cote** : tout clic hors d'un côté était avalé, et
  le glisser de la vue bloqué, jusqu'à ce qu'on désigne un côté (D3).

### Interne

- `zones/BarreNavigation.tsx`, `zones/FeuilleSelection.tsx`, `zones/composants/Feuille.tsx`
  (entête et voile), `zones/statut.ts` (le statut en mots, partagé avec la barre d'état),
  `ui/chiffrage.ts` (le résumé du BOM, calculé sans rien écrire et mis en cache).
- La carte d'exposition place Annuler dans la barre haute, Coter dans la navigation, Dupliquer et
  Supprimer dans la feuille de sélection, Nord dans le groupe flottant.

## [2.1.0-alpha.3] — 2026-09-25

**IHM mobile, étape M2** : la page se déclare mobile, et connaît sa classe d'écran.

### Corrigé

- **Sur téléphone, la page n'est plus rendue en réduction.** Faute de balise `viewport`, un
  téléphone l'affichait sur 980 px virtuels puis la rétrécissait d'environ 0,4× : les boutons de
  44 px tombaient vers 17 px. La page occupe maintenant la largeur réelle de l'écran, et le plan
  toute cette largeur. Le zoom de la page reste permis ; le pincement sur le plan reste capturé.

### Interne

- `app/classe.ts` : trois classes d'écran, `compact` sous 600 px, `moyen` jusqu'à 1 023 px, `large`
  au-delà, posées sur `<html data-classe>` et dans le magasin, recalculées au redimensionnement.
- Le magasin gagne `classe`, `feuille` et `hauteurFeuille` (les feuilles du téléphone arrivent aux
  étapes suivantes) ; la feuille ouverte se lit aussi sur `<html data-feuille>`.
- `computeSize` mesure, sur téléphone et tablette, un cadre que la feuille de style place
  (`#zoneCadre`) au lieu de retrancher des largeurs de colonnes codées en dur ; le bureau garde sa
  règle. Le clavier virtuel qui s'ouvre sous un champ ne redessine plus le plan.

## [2.1.0-alpha.2] — 2026-09-25

**IHM mobile, étape M1** : les jetons et le thème. L'interface change de teinte, pas de place.

### Modifié

- **Une palette rafraîchie, en clair et en sombre**, qui garde la famille papier, encre et bois :
  encre plus profonde, panneaux ivoire, accent bois `#7A5C31` (ambre `#E0B564` en sombre). Les
  valeurs vivent dans `src/styles/jetons.ts` et `app.css` les déclare ; un test vérifie que les deux
  concordent et que chaque paire texte/fond atteint 4,5:1.
- **Plus aucune couleur en dur dans la feuille de style** : les blancs, le rouge des erreurs, le
  brun des toasts passent par des jetons (`--on-accent`, `--on-ink`, `--danger`, `--toast-bg`…).
  Cela corrige au passage le **bouton principal en thème sombre**, qui écrivait en blanc sur un fond
  devenu clair.
- **Les glyphes et émojis des boutons deviennent des icônes SVG en trait** (`zones/icones.tsx`) :
  palette, grille, œil de l'explorateur. Elles suivent la couleur du texte et l'état grisé.
- Polices par variables (`--serif`, `--sans`, `--mono`) sur les piles système ; rayons plus doux.
- Les encres du plan à l'écran (trait, grille, halo) suivent les jetons ; les couleurs des objets
  restent celles du projet, et les exports gardent les leurs.
- Le skill `design-ui` décrit les nouveaux jetons.

## [2.1.0-alpha.1] — 2026-09-25

**IHM mobile, étape M0** (`MD/spec-ihm-mobile.md` §12) : les garde-fous avant tout changement
d'écran. Rien ne bouge à l'écran ; les six artefacts sont identiques hors numéro de version.

### Interne

- `app/exposition.ts` : la **carte d'exposition** dit, pour chacune des **59 commandes** du registre,
  où elle s'expose sur téléphone, sur tablette et sur bureau. Elle décrit ici l'existant, identique
  dans les trois classes ; chaque étape suivante la fait évoluer dans le même commit que l'écran.
- `tests/unit/app/exposition.test.ts` lit le registre dans le code et échoue quand une commande
  déclarée n'a pas de ligne, quand une classe n'a aucun emplacement pour elle, ou quand l'emplacement
  nommé ne cite pas la commande dans son code.
- `tests/unit/zones/inspecteur-champs.test.ts` monte l'inspecteur dans jsdom avec un champ de chaque
  type et vérifie que chacun est rendu une fois dans chaque classe : le téléphone changera la forme
  d'un champ, jamais sa présence. Les lignes de champ portent `data-cle`.
- `tests/unit/zones/identifiants.test.ts` tient la liste des identifiants DOM des écouteurs hors
  registre (3D, visionneuse, soleil, fichiers, panneaux du tiroir) : ils changeront de place, jamais
  de nom.
- `scripts/captures.mjs` : 36 captures de référence (trois largeurs, clair et sombre, six états),
  plateforme simulée par Playwright ; `window.__plan` expose en développement seulement les gestes
  qu'il rejoue.

## [2.0.2] — 2026-09-25

### Ajouté

- **À l'ouverture, quand il n'y a aucun plan, Plan demande par quoi commencer.** Il fabriquait le
  jeu de démonstration en silence : quelqu'un qui arrivait avec une vraie parcelle en tête trouvait
  donc un plan qui n'était pas le sien, sans qu'on lui ait rien demandé, et devait comprendre seul
  qu'il fallait le remplacer. Deux options, et elles ne sont pas symétriques — **partir d'une
  adresse** est l'action principale, puisque c'est ce qu'on veut faire pour de bon, et elle ouvre
  directement la boîte du cadastre sur un plan vierge ; **ouvrir le plan de démonstration** reste là
  pour qui veut regarder sans rien saisir.
- **La même question se pose quand l'organisation n'a que des projets d'un autre produit.** La
  ressource de la plateforme est partagée, et rien n'oblige un projet à être un plan. Vu de la
  personne, c'est la même situation : rien à ouvrir. Seule la phrase change.
- **Une impasse est dite comme telle.** Une place de lecture ne peut rien créer, et un quota atteint
  non plus : l'écran l'explique au lieu de montrer deux boutons qui échouent. Les taire aurait fait
  croire que c'est le geste qui rate.

  L'import cadastre s'ouvre par la **commande**, pas par la fonction : elle porte la capacité, la
  permission et le quota, et un premier pas ne doit pas être le seul chemin qui les contourne.

### Corrigé — deux défauts que le plan vide a réveillés

- **Le démarrage tombait sur un plan sans objets.** Le cadrage d'ouverture cherchait la parcelle et
  lisait ses points sans vérifier qu'elle existe. L'assertion posée là n'avait jamais menti tant que
  Plan ouvrait toujours un projet ; elle a menti le jour où l'atelier a pu s'ouvrir sur le vide.
  Sans parcelle, le cadrage par défaut suffit : il n'y a rien à cadrer.
- **L'en-tête nommait un projet qui n'était pas ouvert.** Son repli était « Parcelle AE 101 », le
  nom du jeu de démonstration. Il dit maintenant « nouveau plan ».

### Modifié — le déploiement, pas l'application

- **La page livrée s'appelle `index.html`**, et l'adresse canonique de Plan devient la racine de son
  sous-domaine. C'est celle que la plateforme distribue : elle range une **origine** pour le produit,
  sans chemin ni nom de fichier, et un navigateur résout une origine nue vers l'index du répertoire.
  Tant que la page s'appelait `plan.html`, cette résolution tenait à une seule ligne `DirectoryIndex`
  embarquée dans un fichier qui doit être redéployé à chaque build : le perdre, ou passer à nginx ou
  à un CDN, et l'adresse même que la plateforme donne cessait de répondre.
- **L'ancienne adresse redirige définitivement**, en reportant la chaîne de requête, si bien qu'un
  lien profond `/plan.html?projet=<uuid>` arrive entier. Le vérificateur de déploiement le contrôle,
  et il interroge désormais la racine plutôt qu'un nom de fichier — demander `/index.html` passerait
  à côté d'un `DirectoryIndex` absent, qui est précisément le défaut à attraper.
- **Les deux fichiers à déposer vivent dans `livraison/`**, et nulle part ailleurs : `index.html` et
  `.htaccess`. Ils partent ensemble, comme toujours.

  **Le fichier livré n'a pas bougé d'un octet** : ce sont les octets de la `2.0.1`. C'est un
  changement de déploiement, pas de produit, et il ne porte donc pas de numéro à lui.

  N'a **pas** suivi le renommage, délibérément : le littéral `plan.html` dans ce que Plan exporte —
  le `/Creator` des deux PDF et le champ `exportedBy` du projet JSON. Il identifie l'artefact, pas
  une URL, et il est figé dans deux des six témoins.

### Interne

- **Les six témoins d'export sont recapturés, et la dette de la `2.0.1` est refermée.** Ils
  portaient encore le numéro de la `2.0.0`, faute d'une session ouverte sur la plateforme de
  démonstration. La capture passe désormais par un décor d'essai qui répond aux quatre routes
  nécessaires et sert le témoin lui-même comme unique projet : plus aucun mot de passe en jeu.

  Ce que vaut une capture derrière un décor qu'on écrit soi-même ? Rien, prise isolément. C'est la
  preuve forte qui lui donne sa valeur : l'ancien numéro remis dans les octets frais rend les six
  empreintes du 23 septembre **au bit près**, et celles-là avaient été capturées derrière une vraie
  plateforme, sur un projet réellement stocké. Le décor est donc prouvé équivalent pour ce que les
  témoins mesurent. Les six tailles sont identiques à l'octet et les deux PDF gardent leurs comptes.

## [2.0.1] — 2026-09-24

### Corrigé

- **La vue 3D faisait planter le navigateur sur téléphone.** Chaque matériau demandait sa propre
  copie de texture : le plan de démonstration ne référence que huit images, et la scène en
  fabriquait 178, une par face de lame, de solive, de lambourde. Une image 1024 × 1024 occupe 4 Mio
  en mémoire graphique, près de 5,3 Mio avec ses niveaux de détail — soit environ 950 Mio au lieu
  de 43. Un onglet de téléphone en a quelques centaines, et le dépassement ne lève aucune erreur
  rattrapable : le système met fin au processus, ce qui se voit comme un plantage à l'affichage.

  Les textures sont désormais partagées par URL. **Elles appartiennent au chargeur, plus à la
  scène** : la démolition de scène libérait toute texture rencontrée et aurait retiré à la scène
  suivante celle qu'elle attend, ce qui aurait échangé un plantage contre une terrasse noire. Un
  ensemble faible dit lesquelles sont empruntées, et le seul moment où elles sont rendues est le
  retour au plan, quand aucune scène 3D n'est vivante.

  La règle du carreau (combien de mètres réels une image représente) a suivi la texture chez le
  chargeur, puisque c'est lui qui possède l'instance. C'est ce qui rendait le partage possible :
  cette répétition avait cessé de dépendre de la taille de l'objet. Elle dépend en revanche de la
  nature de ses coordonnées de texture, et **la répétition fait donc partie de la clé du cache** :
  un mur, dont les coordonnées sont des mètres, et un arbre, dont la sphère est normalisée, ne
  partagent pas la même instance d'une même image. Sans cela, la correction du plantage aurait été
  payée par deux objets mal texturés.

  **Les trois chemins sont couverts d'un seul geste.** La vue 3D directement ; l'export GLB parce
  qu'il sérialise cette scène-là et que l'exportateur indexe ses textures par instance, donc les
  images cessent d'y être écrites en double ; la visionneuse parce qu'elle ne relit que ce que Plan
  vient d'exporter. Elle fabrique ses propres textures et n'en emprunte aucune, si bien que sa
  démolition reste inchangée.

  **Conséquence à connaître :** l'export GLB écrit une image par instance de texture. Le fichier va
  donc maigrir fortement, et les compteurs `textures`, `images` et `octetsTotal` du témoin
  `glb-structure.json` vont baisser. Tous les autres doivent rester identiques. C'est écrit dans
  `tests/fixtures/golden/EMPREINTES.md` avant le mouvement, pour que personne ne le prenne pour une
  régression.

  C'est aussi pourquoi cette version n'est pas une simple correction au sens strict de
  `MD/RELEASE.md` §2.1 : des octets exportés changent. Aucun outil en aval n'en casse — le fichier
  reste un glTF valide, de même géométrie et de mêmes matériaux, avec moins d'images en double — et
  le numéro retenu est donc un correctif.

### Non fait, et su

- **Les six témoins d'export n'ont pas été recapturés à ce numéro.** Ils restent estampillés
  `2.0.0` et `2026-09-23`. La capture demande une session ouverte sur la plateforme de
  démonstration, et celle du poste a été révoquée. L'écart attendu est écrit dans
  `tests/fixtures/golden/EMPREINTES.md` : deux substitutions de même longueur, et rien d'autre.

## [2.0.0] — 2026-09-23

**Plan demande qui vous êtes.** L'accès anonyme est terminé : l'application est un produit de la
plateforme backprod, elle s'ouvre sur une porte, et les projets ne vivent plus dans un dossier à
côté du programme mais dans la ressource `projects` de la plateforme. C'est la rupture qui donne son
numéro majeur à cette version. Un plan enregistré par la `1.2.0` s'ouvre tel quel — le schéma du
fichier de projet ne bouge pas — mais l'URL d'où on l'ouvrait, elle, a disparu.

Ce que Plan **calcule** n'a pas bougé d'un octet. Les six témoins ont été recapturés à ce numéro, et
la preuve a été faite avant : l'ancien numéro remis dans les octets frais retrouve les six anciennes
empreintes au bit près, et à version neutralisée aucune ligne ne diffère dans aucun des six.

### Décidé

- **Plan est un produit de la plateforme backprod, pas une plateforme.** La nouvelle
  [`MD/spec-connexion-plateforme.md`](MD/spec-connexion-plateforme.md) remplace
  `MD/spec-plateforme-multitenant.md`, qui construisait comptes, mots de passe, TOTP, rôles,
  catalogue et schéma PostgreSQL — tout ce que le contrat de la plateforme interdit à un produit.
  L'identité, l'organisation et les droits se lisent en direct sur `/me/context` ; les projets
  vivent dans la ressource `projects` de la plateforme, qui stocke déjà un document opaque avec sa
  version de schéma. `api.php` et `data/` disparaissent, et Plan n'a besoin d'aucune base.
- **Le droit s'accroche à la commande**, pas au bouton : les 47 commandes du registre issu de la
  `1.2.0` portent une capacité et une permission. Une capacité non achetée efface la commande ;
  une permission manquante la laisse visible et s'explique.
- La `2.0.0` passe de 28 jours à 23, et la `2.2.0` (marque blanche) quitte la feuille de route
  faute de décision. `MD/roadmap.md` et `MD/spec-data-strategy.md` sont amendées en conséquence :
  les forfaits, le paiement et la facturation ne sont plus le travail de ce dépôt.
- **L'ordre de mise en œuvre est posé en sept étapes**, chacune laissant l'application utilisable et
  les six empreintes intactes. Un drapeau de configuration rend les quatre premières livrables avant
  que la plateforme ne porte le produit — et il est supprimé du code à l'étape 4, pas seulement de la
  configuration, parce qu'un déploiement qui l'oublierait garderait `api.php` et `data/` ouverts.
- **Correction d'une affirmation fausse de la spec** : une capacité ne réduit pas le fichier livré.
  Le build inline tout, y compris les morceaux derrière un `import()` dynamique — `src/main.ts` en
  utilise déjà un et la page bâtie ne contient qu'un script en ligne et aucun script distant. Ce
  qu'une capacité empêche vraiment, c'est l'appel au réseau : three.js et ses trois aides ne
  quittent pas le CDN, les appels IGN n'ont pas lieu, le catalogue de textures n'est pas demandé.

### Ajouté — étape 0 de la connexion à la plateforme

- **Le contrat de la plateforme est épinglé et engendre le client.** `contrat/` porte la fermeture
  transitive des treize opérations que Plan appelle, extraite de backprod au commit `ce0642c` :
  34 Ko relisibles plutôt que les 676 Ko du contrat entier, qui décrit cinq produits, une console et
  une chaîne de vente. `src/plateforme/contrat.ts` en est engendré et suivi par git — on veut voir
  le diff. `npm run gate:client` échoue si les deux ne correspondent plus, et un test le prouve en
  abîmant le fichier exprès.
- **Deux constantes de build**, les deux seuls faits publics que le paquet porte sur la plateforme.
  Vides, Plan se comporte exactement comme en `1.2.0`. `npm run verifier-paquet` refuse une clé
  produit, un secret de webhook ou un jeton figé dans le fichier livré, et il tourne alors qu'aucune
  clé n'existe encore : le jour où il y en aura une, la question ne sera plus s'il faut vérifier.
- **L'origine de la plateforme rejoint `connect-src`** quand une plateforme est branchée, et rien
  n'est ajouté sinon — une source vide dans une politique de contenu est invalide, pas permissive.

**Le fichier livré n'a pas bougé d'un octet.** C'est la preuve que l'étape demandait : rien à
l'écran, aucune empreinte déplacée. 582 tests.

Deux erreurs de la spécification trouvées en la mettant en œuvre, ce à quoi cette étape sert :
enregistrer un projet est un `PATCH` et non un `PUT`, et le contrat mélange les deux conventions
de nullabilité — douze `nullable: true` contre onze types-tableaux — si bien qu'un générateur qui
n'en lit qu'une produit un `email: string` là où la plateforme rend `null`.

### Ajouté — étapes 1 à 4 de la connexion à la plateforme

- **La session** (`src/plateforme/session.ts`). Le jeton ne quitte jamais la mémoire, un `401` donne
  droit à un renouvellement et un seul, l'expiration est convertie en instant dès la réponse.
- **La porte** : rien ne s'affiche avant que `/me/context` ait répondu. Trois écrans — le formulaire,
  « ce compte ne tient pas Plan », le bandeau de panne — chacun avec son `request_id`.
- **Les droits sur le registre des commandes.** Une capacité non achetée efface la commande, une
  permission manquante ou un quota épuisé la laissent visible et s'expliquent.
- **Les projets vivent chez la plateforme.** `api.php` et `data/` sont retirés, le drapeau qui faisait
  de l'absence de plateforme un mode est supprimé du code : le build refuse une origine vide.
- `scripts/migrer-projets.mjs`, à blanc par défaut, qui relit et compare chaque projet migré.

**Cinq des six artefacts sont identiques au bit près** depuis un projet réel migré de
`plan1.raillard.org` vers une plateforme, puis rouvert par Plan. `projet.json` gagne 57 octets, qui
sont l'identité du projet : un vrai identifiant, un vrai nom, une vraie date, là où le témoin avait
été capturé sur le jeu de démonstration sans projet ouvert. Rien de calculé n'a bougé.

Quatre découvertes, faites en branchant :

- **Il n'existe aucune capacité `plan.access`.** Ce qui vaut accès, c'est que `/me/context` réponde.
- **Enregistrer un projet est un `PATCH`**, pas le `PUT` que la spécification annonçait.
- **`jsonb` ne préserve pas l'ordre des clés**, contrairement à ce que le contrat promet. Même
  longueur, première divergence au 31ᵉ caractère. Cela n'atteint aucun export.
- **Le contrat mélange deux conventions de nullabilité**, si bien qu'un générateur qui n'en lit
  qu'une déclare obligatoire une adresse que la plateforme rend nulle.

### Ajouté — étapes 5 et 6, le mécanisme sans les codes

- **La table des capacités** que Plan propose au catalogue, avec pour chacune les commandes qu'elle
  gouverne et les origines qu'elle fait taire. Un test prouve qu'une commande refusée n'exécute rien
  et n'appelle donc rien : le chargement de three.js, les appels IGN et le catalogue de textures
  partent tous de l'exécution d'une commande, et un seul refus les arrête tous.
- **Les codes sont attachés, une fois le catalogue créé.** Ils ne l'étaient pas au premier jet, et
  délibérément : le contexte ne distingue pas « pas acheté » de « pas au catalogue », si bien
  qu'attacher la capacité 3D avant que le catalogue la porte aurait retiré la vue 3D à tous les
  locataires qui l'utilisent. L'opérateur a créé les sept codes le 22 septembre, et un test vérifie
  désormais que chacun a sa prise. Il en reste un sans : passer en vue 3D est un bouton de mode, pas
  une commande, et c'est justement la capacité dont le gain réseau serait le plus réel.
- **Le vérificateur de déploiement est réécrit pour la `2.0.0`** : il refuse un hôte qui sert encore
  l'ancienne API ou son dossier de données, et il vérifie que la politique de contenu nomme bien
  l'origine de la plateforme du paquet servi. Sans elle, chaque appel est bloqué par le navigateur,
  et seulement en production.

Un constat de plus : **passer en vue 3D est un bouton de mode, pas une commande.** C'est la seule
capacité dont le gain réseau serait réel, puisque three.js vient d'un CDN, et c'est justement celle
qui n'a aucune prise tant que ce basculement n'est pas une commande.

### Ajouté — ce que la porte montre et ce qu'on peut en faire

- **Un mode lecture seule.** Une personne sans le droit d'écrire, ou qui tient un siège de lecture,
  voit le plan entier et ne peut rien y changer. La règle est posée **à un seul endroit** : la barre
  d'état et la palette de commandes en dérivent toutes les deux, après s'être contredites une fois —
  badge « Lecture seule » et palette entière, un lecteur ajoutait un rectangle puis découvrait qu'il
  ne pouvait ni le déplacer ni l'enregistrer. Les gestes au pointeur refusent **avant** d'empiler
  l'historique : un pas d'annulation posé pour un déplacement qui n'a pas eu lieu se défait en ne
  faisant rien. Regarder, sélectionner, déplacer la vue et exporter restent permis.
- **Un témoin vert ou rouge sur la boîte de connexion**, qui dit si la plateforme répond. Il
  interroge `/auth/jwks` sans cache : la première version lisait une réponse en cache et annonçait
  « connectée » devant une plateforme arrêtée.
- **« Mes projets » et « Se déconnecter »** dans la barre d'application. Le premier ouvre l'écran des
  projets de l'organisation connectée, dans un nouvel onglet. Le second révoque la famille de jetons
  côté plateforme, et demande confirmation si le plan porte des modifications non enregistrées.
- **Le mot de passe oublié se règle sur la plateforme**, pas ici. Le lien pointe vers sa racine : un
  produit n'a pas à savoir réinitialiser un mot de passe qu'il ne détient pas.

### Corrigé

- **Revenir à un point de vue enregistré ne déplaçait pas la caméra sur un plan sans terrasse**
  (D-15). Le geste réclamait une terrasse, alors que la Vue 3D s'ouvre sur une parcelle nue et que
  « Enregistrer la vue » y crée des points de vue : Plan fabriquait des points de vue auxquels il
  refusait de revenir. Deux défauts voisins corrigés avec lui — le centre était recalculé sur cette
  terrasse au lieu d'être repris de la scène, qui est le nombre ayant servi à enregistrer le point
  de vue ; et la liste déroulante ne se remplissait qu'à la construction de la scène, si bien qu'un
  point de vue tout juste créé n'y figurait pas.
- **L'annulation laissait le tiroir des résultats périmé** : le chiffrage revenait en arrière sans
  que la table le suive.

### Corrigé — le serveur

- **Le build produit un `.htaccess`**, à partir de `deploy/htaccess.template`, qui se dépose à côté
  de `plan.html` et d'`api.php`. Il corrige les trois défauts constatés plus bas, et il doit être
  redéployé à chaque palier : les empreintes qu'il contient changent avec le build.
- **`data/` n'est plus servi.** Les projets ne se lisent que par l'API. Le dossier est à côté
  d'`api.php`, donc dans la racine web, et `GET /data/<id>.json` rendait le projet entier — 106 062
  octets en clair, vérifiés en ligne.
- **`plan.html` passe en `no-cache`.** Il était servi avec six mois de validité : une mise en ligne
  n'atteignait pas les gens qui reviennent. `api.php` passe en `no-store`.
- **Les en-têtes de sécurité sont posés** : `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security` en HTTPS. Aucun n'était
  présent.
- **Une politique de contenu qui nomme le programme par son empreinte SHA-256** plutôt que
  d'autoriser l'inline en bloc — le build produit un fichier unique, donc tout le programme est un
  script en ligne, et `'unsafe-inline'` aurait désactivé la seule protection utile. Chaque origine
  externe est nommée avec la fonction qui en dépend : les deux CDN pour three.js, IGN et la BAN pour
  le cadastre, l'orthophoto et le PLU, Poly Haven pour les textures. Éprouvée au navigateur sous les
  en-têtes réels avant livraison : vue 3D, export GLB, orthophoto, adresse, cadastre, PLU et
  textures, sans une seule violation.

### Constaté en production

- `plan1.raillard.org/api.php?action=list` rend la liste des projets **à qui la demande**. C'est la
  raison d'être de la `2.0.0`.
- `plan.html` est servi avec `Cache-Control: max-age=15552000` : un visiteur qui revient garde
  l'ancienne application six mois. À passer en `no-cache`.
- Aucun en-tête de sécurité sur les deux hôtes, et `plan1.raillard.org` n'a aucune protection.

### Schéma projet

- Inchangé, version 1. Un plan enregistré par la `1.2.0` s'ouvre dans la `2.0.0`, et l'inverse aussi.
  La rupture porte sur l'accès et sur l'endroit où le fichier est rangé, pas sur ce qu'il contient.

### Ce qui reste ouvert

- **Quatre des vingt-cinq points de la liste de fumée n'ont pas été rejoués** sur ce build : ceux qui
  demandent de saisir une poignée de sept pixels. Le détail et la raison sont dans le journal de
  `tests/CHECKLIST-FUMEE.md`.
- **Le dossier PDF n'est vendu qu'à partir de Scale**, et aucun locataire du jeu de démonstration n'y
  est : personne ne peut l'exercer là-bas. La grille des capacités fonctionne comme voulu ; c'est le
  palier qu'il faudra revoir si on veut garder ce point testable.
- **Quatre décisions de la spécification restent à prendre** : les quotas, la marque, l'événement
  d'annulation d'abonnement, et les codes de permission propres à Plan.

## [1.2.0] — 2026-09-22

**L'interface est reconstruite par zones.** Neuf paliers `alpha` en deux jours, chacun prouvé par les
six artefacts exportés — identiques à ceux de la `1.1.0` à la version près — et vérifié sur le build.
`MD/spec-ihm-zones.md` est cochée en entier : les six étapes de son §6 et les menus de son §4.1.

Ce que l'utilisateur voit changer par rapport à la `1.1.0` :

- **Une barre d'application** sur une ligne : le projet, les menus Fichier, Exporter, Affichage et
  Aide, les trois vues — Plan, Vue 3D, Visionneuse — et le titre avec le lieu.
- **Une palette d'outils** à gauche du plan, grisée selon ce qui a un sens.
- **Un explorateur**, repliable : les objets par catégorie, la sélection dans les deux sens avec le
  canevas, le masquage, les étiquettes, le voisinage, et pour une terrasse sélectionnée sa
  structure sur le plan et sa place au dossier.
- **Un inspecteur**, repliable, à droite du plan : tout ce qui décrit l'objet sélectionné en
  sections, et pour une terrasse ses six sections de construction — décrites par des descripteurs
  de champs que le compilateur vérifie contre le modèle. La saisie garde le focus.
- **Un tiroir de résultats** sous le plan, en trois hauteurs mémorisées : BOM, plan de coupe,
  implantation, chantier, méthode pour la terrasse sélectionnée ; cotes, PLU, résumé.
- **Plus de mode Terrasse** : la terrasse est un contexte du plan, qui reste modifiable.
- **Des notifications** qui s'empilent et s'effacent, un bandeau d'erreur qui se ferme, des dialogues
  fermables par Échap.
- Le budget du fichier livré passe à 5 Mo ; il fait 687 Ko.

Aucune quantité, aucun octet exporté ne bouge pour un projet valide — d'où une version MINEURE,
comme `MD/RELEASE.md` §2.3 le prévoit. Trois défauts de `MD/DEFAUTS.md` sont clos au passage : D-12
pour les deux panneaux, D-13, D-14. Le détail est dans les paliers `alpha` ci-dessous.

### Corrigé

- **Une annulation rafraîchit le tiroir** : annuler un champ de construction remettait sa valeur
  d'avant dans l'inspecteur, mais le BOM gardait les quantités de l'état annulé. La restauration
  refait les panneaux de résultats. Le défaut ne se voyait pas avant la `1.2.0`, où ces panneaux
  n'étaient visibles qu'en mode Terrasse ; il se voit dès qu'ils sont toujours là.

### Interne

- `BUILD_AT` passe au 22 septembre 2026 ; la pastille affiche `v1.2.0`.
- Le numéro final est plus court que `1.2.0-alpha.10` : les quatre fichiers texte sont identiques
  hors numéro, et les deux PDF ont le même contenu une fois neutralisés numéro, dates, décalages et
  longueurs de flux.

## [1.2.0-alpha.10] — 2026-09-22

### Modifié

- **La section Terrasses de l'explorateur n'apparaît que pour une terrasse sélectionnée** — sa
  structure sur le plan disparaît avec la sélection, comme les onglets du tiroir. Le reste du temps,
  la catégorie Terrasse des objets suffit à en choisir une. Les six artefacts sont identiques à ceux
  de l'`alpha.9`.

## [1.2.0-alpha.9] — 2026-09-22

Deux retours d'usage sur la nouvelle interface. Les six artefacts sont identiques à ceux de l'`alpha.8`.

### Corrigé

- **L'explorateur replié ne se rouvrait pas.** Le composant rendait un panneau portant le même
  identifiant que son conteneur ; au repli, le panneau passait à 22 px mais le conteneur gardait ses
  240 px, la rangée de l'atelier débordait et la poignée sortait de l'écran par la gauche. Le repli
  est désormais une classe du conteneur, posée par le service ; les panneaux de l'explorateur et de
  l'inspecteur n'ont plus d'identifiant en double.

### Ajouté

- **Un clic sur le titre de l'inspecteur replie ou déplie toutes ses sections** : repliées si
  l'une au moins est ouverte, dépliées sinon.
- **L'inspecteur se replie**, comme l'explorateur : une poignée à droite de son en-tête, et le plan
  reprend sa largeur.
- **L'en-tête tient sur une ligne** : menus à gauche, vues au milieu, titre et lieu à droite, au lieu
  de trois rangées ; le plan gagne la hauteur.
- **L'explorateur et l'inspecteur ne dépassent plus la hauteur du plan** : ils défilent en dedans,
  et leur en-tête reste visible pendant qu'ils défilent.
- **Les menus se referment** quand on clique ailleurs ou par Échap, et en ouvrir un ferme les autres.
- **L'explorateur ne met en avant une terrasse, et ne propose sa structure sur le plan, que tant
  qu'elle est sélectionnée.**

## [1.2.0-alpha.8] — 2026-09-22

**Reconstruction de l'IHM : les menus de la barre d'application** (`MD/spec-ihm-zones.md` §4.1).
Fichier, Exporter, Affichage et Aide ; le tiroir ne garde que les résultats. Les six artefacts sont
identiques à ceux de l'`alpha.7`.

### Modifié

- **Fichier** : nouveau projet, enregistrer (Ctrl+S), supprimer — quand il y a un serveur — ;
  nouveau plan depuis une adresse, actualiser depuis l'IGN ; importer un SVG, importer ou exporter le
  projet JSON, avec leurs options (remplacer, sans la parcelle) en cases du menu. Les boutons de
  l'ancienne barre de projet disparaissent ; restent le choix du projet et Enregistrer.
- **Exporter** : résumé (qui ouvre l'onglet Résumé du tiroir), SVG, PNG, DXF, PDF avec son échelle,
  dossier PDF des terrasses avec l'option des équipements, GLB.
- **Affichage** gagne les deux opacités du fond orthophoto et le remplissage conseillé, qui
  étaient au fond de l'onglet Affichage.
- **Aide** : la méthode de calcul (l'onglet du tiroir, pour une terrasse sélectionnée) et la
  version.
- **Le tiroir** ne porte plus que Cotes, PLU, Résumé et, pour une terrasse sélectionnée, ses
  résultats. Il s'ouvre sur Cotes.

### Interne

- `zones/BarreApplication.tsx` : les quatre menus ; les réglages qui accompagnent une commande
  (échelle du PDF, cases des imports, curseurs du fond) sont des champs non contrôlés qui gardent
  leur identifiant, par lequel la commande les lit au moment d'agir.
- Les commandes d'export, d'import et de fond sont déclarées sans bouton (`app/ecouteurs/exports.ts`,
  `fichiers.ts`, `affichage.ts`) ; les curseurs sont deux commandes qui lisent leur `source`.
  `render/ortho.ts` tolère l'absence de la case du fond.
- `zones/monter.tsx` rend les zones en `flushSync` : le démarrage lit les curseurs des menus par
  leur identifiant juste après.
- Supprimés d'`index.html` : `#panelAffichage`, `#panelExport` ; les deux champs de fichier cachés
  remontent en tête de page.

## [1.2.0-alpha.7] — 2026-09-22

**Reconstruction de l'IHM, étape 6 : les dialogues et les notifications** (`MD/spec-ihm-zones.md`
§4.8), et les deux chantiers que §8 laissait au passage — D-13 et D-14 de `MD/DEFAUTS.md`. Les six
artefacts sont identiques à ceux de l'`alpha.6`.

### Modifié

- **Les notifications** (Z9) : les toasts s'empilent au-dessus de la barre d'état et s'effacent
  seuls ; une erreur de programme reste en bandeau jusqu'à ce qu'on la ferme, au lieu de
  s'accumuler en bas de page sans bouton.
- **Les dialogues** (Z8) : confirmations, invites et écran de reprise sont un composant, modal, un
  seul à la fois, fermable par Échap ou par un clic sur le voile. L'écran de reprise, lui, ne se
  ferme pas. Les trois parcours — import cadastre, actualisation IGN, textures — restent des
  dialogues à part et prennent le même voile.
- **Les onglets de terrasse du tiroir ne s'affichent que pour une terrasse sélectionnée** (BOM,
  Plan de coupe, Implantation, Chantier, Méthode), comme la décision 4 le dit. Ils suivaient la
  terrasse *courante*, qui survit à la sélection d'un parasol : un plan qui en avait une montrait son
  chiffrage en permanence. Un onglet de terrasse ouvert se replie sur Cotes dès que la sélection
  n'en est plus une.

### Corrigé

- **D-13** — le lien de secours des exports SVG et PDF réutilisait une URL révoquée une seconde
  après le clic : il ne fonctionnait jamais. Il disparaît ; un toast dit le nom du fichier qui part.
- **D-14** — un parasol est un cercle. La section Parasol de l'inspecteur, la Vue 3D et le calque
  des ombres n'y voient plus un polygone dont la fonction dirait « parasol ».

### Interne

- `shell/notifications.ts` et `shell/dialogues.ts` : deux listes observables au niveau zéro ;
  `shell/dialogs.ts` y confie ses cinq fonctions et garde un repli en DOM brut pour le point
  d'entrée, qui doit afficher un échec de chargement avant que l'application n'ait démarré.
- `zones/Notifications.tsx`, `zones/Dialogues.tsx` ; `#zoneDialogues`, `#zoneNotifications` ;
  styles `.dialogueVoile`, `.dialogueBoite`, `.toast`, `.bandeauErreur`.
- `core/contexteTerrasse.ts` : `terrasseSelectionnee(etat)` ; `app/tiroir.ts` : `synchroniser` à
  chaque rendu.

## [1.2.0-alpha.6] — 2026-09-22

**Reconstruction de l'IHM, étape 5 : le tiroir des résultats** (`MD/spec-ihm-zones.md` §4.6, option A
de §7.1). Les onglets du panneau du bas deviennent un tiroir sous le plan, repliable en trois
hauteurs mémorisées. Les six artefacts sont identiques à ceux de l'`alpha.5`.

### Modifié

- **Le tiroir** (Z6), pleine largeur sous le plan : BOM, Plan de coupe, Implantation, Chantier,
  Méthode quand une terrasse est courante, puis Cotes, PLU, Résumé. Trois hauteurs — replié (la
  barre d'onglets seule), mi-hauteur, plein — mémorisées dans le navigateur. Cliquer un onglet
  d'un tiroir replié le déplie.
- **Les onglets de terrasse suivent le contexte** : ils n'existent que s'il y a une terrasse, et
  un onglet de terrasse ouvert se replie sur Cotes quand la dernière terrasse change de fonction.
- **Le Résumé** a son onglet ; il n'est plus au fond d'Export.
- **Affichage et Export / Import** restent dans le tiroir, à part et en italique : ce sont des
  réglages, attendus dans les menus de la barre d'application (§4.1). Rien n'est perdu.

### Interne

- `app/tiroir.ts` : la liste des onglets, leur visibilité, ce qu'ils rafraîchissent à l'ouverture,
  la hauteur et sa mémoire locale (`plan.tiroir`). `zones/Resultats.tsx` rend la barre ; les
  panneaux restent du balisage que `ui/` remplit.
- `app/modes.ts` ne porte plus de sous-onglets ; le magasin porte `tiroir`.
- Supprimés : `ui/panelTabs.ts`, `#panelTabs`, `#panel`, `#panelTerrasse`, `#terrasseSubTabs`,
  `#terrasseEmpty`. Les panneaux `terrasseTab*` deviennent `panelBom`, `panelCoupe`,
  `panelImplantation`, `panelChantier`, `panelMethode` ; `panelResume` apparaît.

## [1.2.0-alpha.5] — 2026-09-22

**Reconstruction de l'IHM, étape 4 : l'inspecteur par descripteurs de champs** (`MD/spec-ihm-zones.md`
§4.5, `MD/DEFAUTS.md` D-12). Le panneau d'attributs et le configurateur de terrasse — huit cents lignes
de DOM impératif, un bloc par champ — deviennent des descripteurs rendus par un seul composant, dans
une colonne à droite du plan. Les six artefacts sont identiques à ceux de l'`alpha.4`.

### Modifié

- **L'inspecteur** (Z5), à droite du plan : les propriétés de ce qui est sélectionné, par sections
  repliables — Objet, Parcelle (lieu, cadastre, clôture), Apparence, Parasol, Point de vue, Côtés,
  Coins, Alignement, et pour une terrasse Fondation et appuis, Structure porteuse, Lames et sens de
  pose, Finitions du tour, Optimisation, Paramètres de calcul. Chaque champ garde son infobulle et
  la note du métier que le configurateur affichait.
- **Les champs texte et nombre gardent le focus** pendant la frappe : le nom, un côté, une longueur
  se corrigent sans que le panneau ne se reconstruise sous le curseur. Un nombre se valide par
  Entrée ou en quittant le champ, et revient à sa valeur si elle est refusée (rayon ou rectangle qui
  sortirait de la parcelle).
- **La clôture se règle sur la parcelle**, dans l'inspecteur, et non plus dans la Vue 3D.
- **Le panneau du bas** n'a plus d'onglet Édition ; son onglet Terrasse ne porte plus que les
  résultats (BOM, Plan de coupe, Implantation, Chantier, Méthode). Il s'ouvre sur Affichage : l'onglet
  Terrasse recalcule le chiffrage et l'écrit dans le projet dès qu'il s'ouvre, comme l'ancien mode.
- Le mode Terrasse ne pouvant plus verrouiller le plan, « Aligner par rotation » de la palette lance
  directement le pointage du côté cible.

### Interne

- `ui/champs/types.ts` : les descripteurs (`texte`, `nombre`, `case`, `choix`, `couleur`, `date`,
  `curseur`, `lecture`, `texture`, `bouton`, `alerte`, `hote`, `ligne`), leur contexte et leurs
  effets (`rendu`, `inspecteur`, `terrasse`, `scene3d`, `empilement`, `poignees`).
- `ui/champs/objet.ts` : les sections de l'objet ; `ui/champs/construction.ts` :
  `CHAMPS_CONSTRUCTION`, un objet indexé par **toutes** les clés de `Construction` — une propriété
  ajoutée au modèle sans descripteur, ni mention de l'onglet qui l'édite, ne compile pas.
- `app/inspecteur.ts` applique une écriture : historique si le champ le demande, marquage
  « modifié », effets déclarés. `zones/Inspecteur.tsx` rend les sections.
- Supprimés : `ui/attrPanel.ts`, `renderTerrasseConfigurator` et `renderParametresCalcul`
  (`ui/terrassePanels.ts`), `syncClotureControls` (`ui/cloture.ts`), les commandes de clôture de
  `app/ecouteurs/cloture.ts`, `etat.attrTab`, `#panelEdition`, le sous-onglet Construction et les
  contrôles de clôture de la Vue 3D dans `index.html`.
- `computeSize` retranche la largeur de l'inspecteur au plan ; sous 1 024 px il passe sous le plan.

## [1.2.0-alpha.4] — 2026-09-22

**Reconstruction de l'IHM, étape 3 : l'explorateur, et la terrasse comme contexte du plan**
(`MD/spec-ihm-zones.md` §6, décision 4 de §7). Le sélecteur d'objets au-dessus du plan, la table
d'affichage et le mode Terrasse disparaissent ; une colonne à gauche du plan les remplace. Les six
artefacts sont identiques à ceux de l'`alpha.3`.

### Modifié

- **L'explorateur** (Z3), entre la palette et le plan : les objets par catégorie avec leur compte,
  la sélection (qui est celle du canevas, dans les deux sens), le masquage par objet et pour tous,
  les cinq étiquettes de l'objet sélectionné et de tous, le voisinage, les terrasses avec leur
  surface et leur hauteur finie, la terrasse courante, les terrasses du dossier PDF, et la structure
  de la terrasse courante dessinée sur le plan, couche par couche. Il se replie d'un clic et rend sa
  largeur au plan ; sous 1 024 px il s'escamote.
- **Plus de mode Terrasse.** Il n'y a que trois vues : Plan, Vue 3D, Visionneuse. La terrasse
  courante suit la sélection — sélectionner une terrasse sur le plan ou dans l'explorateur la rend
  courante, sélectionner autre chose la garde — et son onglet **Terrasse** du panneau (Construction,
  BOM, Plan de coupe, Implantation, Chantier, Méthode) la décrit. La Vue 3D est une vue à part
  entière, sans terrasse s'il n'y en a pas.
- **Le plan reste modifiable quand une terrasse est courante** : le verrou du mode Terrasse (formes,
  points et côtés bloqués) n'a plus lieu d'être. La sélection reste dessinée.
- **La structure d'une terrasse ne s'affiche que sur demande** (« Structure sur le plan » dans
  l'explorateur) ; le mode Terrasse la dessinait d'office sur son sous-onglet Canevas, qui disparaît.

### Interne

- `core/contexteTerrasse.ts` : la règle de la terrasse courante, appliquée avant chaque rendu ;
  `etat.appMode` disparaît, `etat.calquesVisibles` apparaît.
- `app/explorateur.ts` (ce que la zone demande au plan), `zones/Explorateur.tsx`. `ui/selector.ts`
  disparaît ; `ui/tables.ts` garde la sélection du dossier et expose `clesDossier`, réparée à la
  lecture (rien de coché veut dire toutes) ; `ui/terrassePanels.ts` perd la barre de choix.
- `app/modes.ts` ne pilote plus que trois vues et les sous-onglets de l'onglet Terrasse ; le
  déplacement physique du `<svg>` (`#stageParking`, `#stageHost`) disparaît, comme `#terrasseTopBar`,
  `#selector`, `#dispTable`, `#dossierTerrasses` et le sous-onglet Canevas. `#terrasseTab3d` devient
  `#vue3dPanel`, `#terrassePanel` devient `#panelTerrasse` dans le panneau.
- Le magasin porte `explorateurOuvert` ; `computeSize` retranche la largeur de l'explorateur déplié.

## [1.2.0-alpha.3] — 2026-09-21

**Reconstruction de l'IHM, étape 2 : la palette d'outils et le canevas** (`MD/spec-ihm-zones.md` §6).
La rangée de boutons sous le plan disparaît ; une palette verticale à gauche du plan la remplace,
et la barre d'application gagne un menu Affichage. Les six artefacts sont identiques à ceux de
l'`alpha.2`.

### Modifié

- **La palette** (Z2) : Historique, Créer (polygone, rectangle, chemin, cercle, parasol, point de
  vue), Éditer (dupliquer, supprimer, reculer, position initiale), Outils (cote, aligner). Un bouton
  est grisé quand sa commande n'a pas de sens — rien de sélectionné, rien à annuler — au lieu de
  répondre par un message. Sous 1 024 px, elle s'escamote et le plan reprend sa largeur.
- **Deux outils désormais à portée de main** : la cote et l'alignement par rotation, qui ne
  s'atteignaient qu'au fond d'un onglet, ouvrent l'onglet voulu et attendent le clic sur le plan.
- **Le menu Affichage** : Flèche Nord, Grille, Voisinage, Fond orthophoto, cochés d'après l'état.
- **Le budget du fichier livré passe à 5 Mo** (décision du 21 septembre, `spec-ihm-zones.md` §7,
  `RELEASE.md` §8.2).

### Interne

- `zones/Palette.tsx`, `zones/Surimpression.tsx` ; le menu dans `zones/BarreApplication.tsx`.
- Les commandes d'objet sont déclarées sans bouton et portent leur condition d'activation ; les
  bascules d'affichage (`affichage.nord`, `affichage.voisinage`, `affichage.orthophoto`,
  `affichage.grille`) sont des commandes que les cases de l'onglet et le menu exécutent.
- `core/historique.ts` signale l'état de sa pile (`signalerPile`) ; le magasin porte `peutAnnuler`.
- `ui/panelTabs.ts` expose `activerOnglet`. `render/pipeline.ts` et `app/modes.ts` n'écrivent plus
  le `display` du bouton de cadrage.
- `index.html` : `#planActions` disparaît, `#zoneAtelier` réunit `#zonePalette` et `#stage`, qui
  contient `#zoneSurimpression`. Le plan retranche la largeur de la palette au-dessus de 1 024 px.

## [1.2.0-alpha.2] — 2026-09-21

**Reconstruction de l'IHM, étape 1 : la coquille** (`MD/spec-ihm-zones.md` §6). Deux zones React
entourent le canevas existant — **Z1, la barre d'application** (projet, vues, titre) et **Z7, la
barre d'état** (serveur, enregistrement, sélection, échelle, pointeur, version). Les régions
`#projectBar`, `#modeBar` et le `<h1>` d'`index.html` disparaissent. Les six artefacts sont
identiques à ceux de l'`alpha.1`.

### Modifié

- **Une barre d'état en bas de la fenêtre** : mode local ou statut d'enregistrement, objet
  sélectionné, échelle du plan (« 1 m = 11 px »), position du pointeur en mètres, version.
- **Les bascules Voisinage et Fond orthophoto** passent de la barre de vues à l'onglet Affichage,
  inchangées.

### Interne

- `app/projet.ts` : la logique de la barre de projet (ouvrir, créer, enregistrer, supprimer, depuis
  une adresse, actualiser IGN) devient cinq commandes et un objet `Projet`, sans DOM ; le statut est
  publié dans le magasin. `ui/projectBar.ts` ne garde que le cadastre et le PLU.
- `app/magasin.ts` porte, à côté du pont vers `EtatApp`, des champs immuables : la vue courante,
  le lieu, le projet et son statut, le pointeur.
- `zones/` : `BarreApplication.tsx`, `BarreEtat.tsx`, `monter.tsx` — couche de niveau 6 dans le
  test d'architecture, qui parcourt désormais aussi les `.tsx`. Les identifiants d'éléments
  (`projectSelect`, `saveProjectBtn`, `modePlanBtn`…) sont conservés.
- `app/modes.ts` signale la vue courante au magasin au lieu d'allumer des boutons par identifiant.
- Le fichier livré passe à 679 862 octets : React DOM y entre. Budget 1,2 Mo.

## [1.2.0-alpha.1] — 2026-09-21

**Reconstruction de l'IHM, étape 0** (`MD/spec-ihm-zones.md` §6) : le registre des commandes et le
magasin existent, tous les boutons passent par le registre, et l'écran ne change pas. Les six
artefacts sont identiques à ceux de la `1.1.0` hors numéro de version.

### Interne

- `app/commandes.ts` : une commande a un identifiant stable (`objet.dupliquer`), un libellé, un groupe,
  parfois un raccourci et une condition d'activation ; le registre refuse un doublon et lie un élément
  du DOM à une commande. **47 commandes** dans douze groupes remplacent les `addEventListener('click')`
  des neuf groupes d'écouteurs, ligne à ligne, sans qu'un geste change.
- `app/magasin.ts` : un store Zustand qui tient la référence vivante d'`EtatApp` et un compteur de
  version incrémenté par `render()` — le pont vers React, sans réécrire une mutation.
- React, React DOM et Zustand sont des dépendances ; le greffon React de Vite est branché et le JSX
  accepté. Rien ne les utilise encore : le fichier livré grossit de trois kilo-octets (Zustand et le
  registre), React n'y entre pas.
- Décisions consignées dans la spec : React avec Zustand, fichier unique conservé, tactile comme critère
  d'acceptation, la terrasse comme contexte du plan, les résultats dans un tiroir en bas du canevas.
- 554 tests (548 + 6).

## [1.1.0] — 2026-09-21

**La migration TypeScript est terminée.** Le fichier mono-page de 13 487 lignes (`1.0.0`, figé dans
`legacy/plan_interactif.html`) est devenu un graphe de 115 modules typés sous la configuration la
plus stricte du compilateur, et l'artefact livré reste un seul fichier `plan.html`, produit par le
build. La définition de fin (`MD/spec-migration-typescript.md` §14) est cochée en entier : `tsc`,
ESLint et 548 tests à zéro ; six artefacts exportés identiques au bit près à ceux de la `1.0.0`, à
la version près, prouvé à chaque palier ; checklist de fumée 25/25 sur le build ; déploiement de
test avec `api.php` ; carte des modules ; liste des défauts triée.

Ce que l'utilisateur voit changer par rapport à la `1.0.0`, tout est dans les paliers `alpha` ci-dessous :
trois corrections (`alpha.16`) et une construction complète à l'ouverture d'un projet ancien
(`alpha.17`). Aucune quantité, aucun octet exporté ne bouge pour un projet valide — d'où une version
MINEURE, comme `MD/RELEASE.md` §2.3 le prévoyait.

### Interne

- `BUILD_AT` passe au 21 septembre 2026 ; la pastille de version affiche `v1.1.0`.
- Le passage d'un numéro de pré-version au numéro final raccourcit la chaîne estampillée dans les
  six artefacts : les quatre fichiers texte sont identiques à ceux de l'`alpha.17` une fois le numéro
  neutralisé, et les deux PDF ont le même contenu (mêmes objets, pages et textes) : une fois neutralisés
  numéro, dates, décalages internes et longueurs de flux, une seule ligne diffère, le dictionnaire
  `/Producer … /Creator` qui porte la version et la date de build.

## [1.1.0-alpha.17] — 2026-09-21

**`ObjetPlan` est une union discriminée** (MD/DEFAUTS.md, D-3 ; spec §12). Polygone, chemin et
cercle sont trois types que `type` distingue : le compilateur ne laisse lire `pts` qu'après avoir
écarté le cercle, `center` et `r` qu'après l'avoir reconnu. Les quatre signatures d'index
(`ObjetPlan`, `Construction`, `LigneBom`, `Mesure`) ont disparu. Aucun octet exporté ne bouge :
six empreintes sur six inchangées à version égale.

### Corrigé

- **Un projet ancien s'ouvre avec une construction complète** (D-1). `ensureConstruction` ne
  comblait que 40 des 53 réglages ; les treize autres n'étaient posés que sur une terrasse neuve, et
  un projet enregistré avant leur existence arrivait au moteur avec `soliveSection`,
  `soliveEntraxe`, `lambourdeEntraxe`, `essenceBois`… à `undefined` — un débit bois titré
  « (undefined) », une marge de zone spa en `NaN`. Les douze sont comblés à l'ouverture avec la
  valeur que chaque lecture du moteur prenait déjà par `||` en leur absence, donc aucun nombre ne
  bouge ; l'essence reste « autre », le tarif que ces projets ont toujours eu. Seul `bom`, un
  résultat, reste à `computeBOM`.

### Interne

- `model/types.ts` : `ObjetCommun` porte ce qui est partagé ; `ObjetPolygone`, `ObjetChemin`,
  `ObjetCercle` ce qui distingue ; `ObjetPlan` est leur union, `ObjetAPoints` celle des deux
  premiers, `ObjetBrut` reste `Partial<ObjetPlan>`. `voisinage` et `Mesure.id`, lus depuis toujours
  et jamais déclarés, le sont.
- `model/formes.ts` : quatre aides — `estCercle`, `aDesSommets` (gardes), `sommetsDe` (`obj.pts || []`
  sous un nom), `enPoints`/`enCercle` (l'ancien `!` sous un nom qu'on peut chercher).
- **258 assertions `!` sur `pts`/`center`/`r` → 25**, toutes restantes sur des types partiels ou des
  interfaces locales, jamais sur l'union. La plupart sont tombées d'elles-mêmes dans des branches
  déjà écrites sur `type` ; les autres sont devenues une garde nommée de même valeur de vérité, ou
  `enPoints`/`enCercle` là où le contexte garantit la forme.
- Les vues partielles `ObjetCote` (render), `ObjetMesurable` (engine) et `ObjetASurface` (export)
  sont des formes structurelles explicites : un `Pick` sur l'union n'existe plus quand la clé manque
  à un membre.
- Le filtre des terrasses du dossier PDF est un prédicat de type ; `cerclePointsExtent` (three) prend
  un `ObjetCercle` ; `PointDeVue.pts` (three) dit `ObjetAPoints['pts']`.
- Ce que l'union a révélé sans le corriger — un parasol désigné par `fonction` et non par `type`,
  qui planterait si l'on faisait « parasol » d'un polygone (D-14) — est dans `MD/DEFAUTS.md`.
- 548 tests.

## [1.1.0-alpha.16] — 2026-09-20

**Trois corrections que le typage strict avait mises au jour** (voir `MD/MIGRATION-JOURNAL.md`,
« Phase 7 — l'échelle gravie », « ce qui ressemble à un bug »). Aucune ne touche un artefact
exporté : les six empreintes sont inchangées à version égale.

### Corrigé

- **Les cotes lues d'un fichier sont vérifiées avant d'entrer dans l'état.** L'import SVG annonçait
  une vérification « ligne à ligne » mais ne contrôlait que l'existence des deux objets référencés :
  `refSegIndex`, `startEnd` et `targetPtIndex` étaient recopiés tels quels, et l'import JSON faisait
  de même. Une cote au-delà du polygone, sur un cercle pris pour référence, ou sans indice, entrait
  dans `etat.measures` pour ne jamais se dessiner. `model/mesures.ts::referencesDeCote` est
  désormais le seul juge, pour les deux imports : objets présents, cote de référence sur un polygone
  et dans ses bornes, sommet cible dans les bornes (ou n'importe quel entier positif sur un cercle,
  dont le point coté est le centre), `startEnd` normalisé en `A`/`B` comme le rendu le lit. Ce qui
  est refusé est compté dans le message d'import. 12 tests, dont l'import du SVG doré (11 cotes
  restaurées, références intactes) et une copie abîmée de ses cotes.
- **Actualiser depuis l'IGN exige les deux coordonnées du point de calage.** La garde ne vérifiait
  que la latitude : une longitude absente aurait projeté tout le voisinage en `NaN`, en silence.
- **Un bâtiment BD TOPO sans `properties` ne fait plus lever la boîte d'import cadastral.** La liste
  des hauteurs « sur la propriété » lisait `props` sans garde ; il prend la hauteur par défaut,
  comme l'import lui-même le faisait déjà.

### Interne

- Le message de l'import JSON dit « objet de référence absent ou indice hors du plan ».
- 547 tests (535 + 12).
- **La définition de fin de migration (spec §14) est cochée en entier** : checklist de fumée déroulée
  25/25 sur le build (`tests/CHECKLIST-FUMEE.md`), déploiement PHP local avec `api.php` vérifié sur
  les quatre actions et un projet de production, GLB revérifié structurellement, carte des modules
  à jour (`MD/architecture.md` §5.2.2), liste des défauts triée (`MD/DEFAUTS.md`).

## [1.1.0-alpha.15] — 2026-09-20

**Phase 7 : l'échelle de rigueur est gravie.** `tsconfig.json` porte désormais la configuration cible
de la spec §9.1 — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Mesurées
en cumulatif au départ du palier : **1 513 erreurs**, dont 300 dans `ui/`, 218 dans `tests/`, 201
dans `geometry/`, 168 dans `engine/`, 141 dans `three/`, 132 dans `export/`, 100 dans `render/`,
81 dans `app/`. À l'arrivée : **0**. Aucun des six artefacts exportés ne bouge à version égale.

### Interne

- **Uniquement des types.** Assertions non nulles `!` là où le code environnant garantit déjà
  l'invariant (indice borné par la boucle, `find` précédé d'un `some`, `pts` sous un
  `type === 'polygon'`, élément du DOM d'`index.html`) ; `catch (e)` lu via `(e as Error)` ;
  paramètres inutilisés préfixés `_` ; imports et variables mortes retirés. Le diff de `geometry/`,
  une fois les `!` ôtés, est identique à l'original ligne pour ligne. Aucun `if`, `return`, valeur
  par défaut ou `??` ajouté nulle part.
- **Des signatures qui mentaient, corrigées** : `ContexteHistorique` disait `unknown[]` pour des
  objets du plan et des cotes — il est générique sur leur forme, comme l'appelant la connaît ;
  `ContexteAttrPanel.startPick` et `measureSegCoords` disent les unions réelles ;
  `appliquerProjetImporte` reçoit un `ProjetValide`, pas `unknown` (`app/ecouteurs/fichiers.ts`,
  `ui/projectBar.ts`) ; `ContexteVue3d.setMode3D` prend un `Mode3D` ; `ContexteMesurePanel.refLabel`
  accepte `null`, ce que l'implémentation faisait déjà ; `chargerTuileOrtho` rend `Promise<string>`
  (le `has` précède le `get`) ; `nomProjet` accepte `null` ; `geocoderBAN` lit un `[number, number]` ;
  `export/pdf/writer.ts` nomme `Rgb01` ; `three/etat3d.ts` : `dernierExporte.date` est une `Date`.
- **Types élargis pour `exactOptionalPropertyTypes`**, là où le code assigne `undefined` en
  clair : `Construction.prixVisUnite`, `TextureAppliquee.vignette`, `SourcesDIdentite.horloge`/`alea`,
  `AppuiSurLigne.n`, `TerrasseEtudiee.pts`, `PointDeVue.pts`/`altitude`, `SeedProjectBar.meta`.
- **Deux symboles morts de plus** : le paramètre `lamesAngle` d'`evaluerStructure` n'est jamais lu
  (renommé `_lamesAngle`, position conservée) ; `GlisserEnCours.startR` n'est lu nulle part.
- **Le cliquet** (`scripts/cliquet.mjs`) n'a plus de drapeaux à monter : `tsconfig.json` porte tout,
  il reste le rapport par dossier et la garde contre une régression. Il lance `tsc` avec le Node
  courant plutôt que par `npx` sous `shell: true`, que Node 22 signalait (DEP0190).
- `plan.html` : 450 063 → 450 058 octets. 535 tests, inchangés.

Ce que le typage a révélé sans le corriger — des invariants tenus par `normalizeObjects` ou
`ensureConstruction` et non par les types, une validation d'import annoncée mais absente — est
consigné dans `MD/MIGRATION-JOURNAL.md`, « Phase 7 — l'échelle gravie ».


## [1.1.0-alpha.14] — 2026-09-09

**Phase 4 : la fermeture `boot()` quitte `legacy.ts`, et `legacy.ts` disparaît.**
Le dernier fichier sous `@ts-nocheck` du dépôt est supprimé. Les ~900 lignes de câblage qu’il
portait vivent désormais dans `src/app/boot.ts`, la racine de composition (spec §6), vérifiée par
le compilateur comme le reste. Aucun des six artefacts exportés ne bouge.

### Corrigé

- **L'import SVG ne fonctionnait plus.** Le contexte passé à `importSVGString` citait
  `filtrerSansParcelle` en abrégé d’objet, alors que la fonction avait quitté ce fichier pour
  `io/exportProjet.ts` en phase 2 **sans que l’import soit ajouté**. Construire cet objet levait
  donc un `ReferenceError` avant même l’appel, et le `try/catch` de `app/ecouteurs/fichiers.ts` le
  changeait en bandeau « Erreur import SVG » — un geste mort en silence pendant plusieurs paliers,
  qu’aucun golden ne pouvait voir (ils n’exercent que les **exports**).

  Le typage a fait tomber la cause et le remède ensemble : `importSVGString` ne lit **aucune** des
  quatre propriétés que ce littéral lui passait en trop (`markDirty`, `fitToObject`,
  `filtrerSansParcelle`, `trouverParcelleCloture`). Les retirer répare le geste sans rien ajouter.
  Vérifié en direct sur les trois versions avec le même fichier : le témoin figé 1.0.0 et le build
  corrigé donnent le même résultat exact (14 → 15 objets, 288 → 566 textes, aucune erreur) ; le
  build d'avant correction n'importe rien et affiche le bandeau.

### Interne

- `src/legacy.ts` **supprimé**. `src/app/boot.ts` le remplace : mêmes instructions, même ordre
  d'exécution, portée désormais vérifiée. `main.ts` charge `./app/boot.js`.
- **280 symboles morts retirés** — 272 spécificateurs d’import que plus rien ne lisait (dont 32
  lignes d’import devenues vides) et 8 déclarations locales (`cancelPick`, `updateUndoBtn`,
  `selectorDiv`, `bringToFront`, `measurePointCoord`, `IMPORT_JSON_TAILLE_MAX`,
  `rebuildTerrasseSubTabs`, `updateStagePlacement`), plus `worldFromEvent`, dont le seul lecteur
  était une propriété morte. ESLint ne voyait rien de tout cela : sa configuration excluait
  `src/legacy.ts`. Le fichier n’étant plus exclu, la couche de câblage est lintée comme le reste.
- Cinq autres littéraux de contexte allégés des propriétés que leur destinataire ne lit pas
  (`brancherPointeur`, `construireScene3D`, et les trois appels de la visionneuse GLB).
- Deux passages nommés une seule fois, au lieu d’un `as` dispersé : `normaliserEnObjetsDuPlan`
  (« ce qui arrive de dehors » → objets du plan, ce que la signature de `creerEtat` réclame) et
  `aPoints` / `aDessiner` (les formes que la géométrie et le rendu exigent complètes).
- `ProjetResume` (io/api.ts) et `ProjetMeta` (ui/projectBar.ts) décrivaient la même ligne de
  serveur et **avaient divergé** (`name` obligatoire d’un côté, facultatif de l’autre). Une seule
  description reste, là où la donnée arrive ; `ProjetServeur` dit maintenant ce que le serveur rend.
- `serializeMeasures` déclarait rendre des `ObjetSerialise[]` : elle rend des cotes. Le type
  `MesureSerialisee` le dit (alias de type et non interface, pour rester assignable à `Mesure`).
- `renderTerrasseSelector` demandait les neuf fonctions de `ContexteTerrassePanels` ; elle en lit
  deux. Sa signature le dit désormais (`ContexteSelecteurTerrasse`).
- Le test d’échafaudage change d’objet : il vérifiait que `legacy.ts` commençait par `@ts-nocheck`,
  il vérifie maintenant que `legacy.ts` n'existe plus **et** qu'aucun fichier de `src/` ne porte la
  directive. 535 tests (534 + celui-là).

## [1.1.0-alpha.13] — 2026-08-30

**Phase 7, dixième et dernier palier du barreau 2 : `ui/` est typé de bout en bout.**
371 → 0 erreurs sous `noImplicitAny` ; total du dépôt 387 → **0**. `--noImplicitAny` est désormais
propre sur **l'intégralité de `src/`** — quatorze dossiers sur quatorze protégés par le cliquet.

### Interne

- Les dix fichiers de `ui/` typés : `panelTabs.ts`, `cloture.ts`, `texturePicker.ts`,
  `mesurePanel.ts`, `selector.ts`, `attrPanel.ts`, `tables.ts`, `projectBar.ts`, `terrassePanels.ts`
  et `cadastreDialog.ts` (104 erreurs, le plus gros fichier du palier).
- Une limite notée depuis le palier `three/` est refermée : `ObjetPlan` déclare maintenant
  `textureVerticale`, `textureHorizontale`, `textureArbre` et `clotureTexture` comme
  `TextureAppliquee | null` plutôt que de les laisser passer par l'index signature en `unknown`.
  `TextureAppliquee` vit dans `model/types.ts`, pas dans `ui/texturePicker.ts` qui la produit — même
  raison que `Mesure` : c'est une donnée du projet.
- Le zonage PLU (`ObjetPlan.plu`) quitte `unknown` pour `ZonagePlu | null`. La famille de types
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`) déménage de `geo/apiIgn.ts` vers `model/types.ts` pour la même raison — `bdtopo`
  reste `unknown`, sa forme variant trop d'une couche IGN à l'autre (spec §12).
- `ContexteImportCadastre`, exporté depuis `projectBar.ts` et importé par `cadastreDialog.ts` :
  troisième cas de ce palier où un `ctx` partagé entre deux fichiers a été nommé une fois plutôt que
  redéfini deux fois.
- Une leçon d'outillage, pas de code : les méthodes en sucre syntaxique d'un littéral d'objet
  (`{ foo() { return this.x; } }`) ne reçoivent **pas** le type de `this` depuis l'annotation de la
  variable (`const o: T = {...}`) sous `noImplicitAny` seul — `noImplicitThis` (famille `strict`,
  éteint ici) est ce qui active cette inférence. Il faut un paramètre `this: T` explicite sur chaque
  méthode. Découvert sur les trois méthodes de l'état du dialogue cadastral
  (`EtatImportCadastre.parcellesPropriete`/`estPropriete`/`voisinesRetenues`).
- Vérifié en plus des empreintes habituelles — et c'est le contrôle qui compte ici, les six
  empreintes n'ouvrant jamais le réseau : l'import cadastral complet (adresse → parcelle →
  voisines → création) rejoué en direct rend le même projet (4 objets, mêmes hauteurs, même IDU,
  même zonage PLU) qu'avant le typage du palier.

### Dette soldée (même jour, sans nouveau build)

`tests/` portait 22 erreurs `noImplicitAny` restées hors du périmètre du cliquet (qui ne gate que
`src/`) — des littéraux d'objet passés à des fonctions génériques (`normalizeObjects<T>`,
`creerCreation(etat: EtatCreation, ...)`) sans annotation, où `pts: []` ou `terrasseLieeKey: null`
s'inféraient en `any` faute de type contextuel. Corrigées dans `tests/unit/{engine/moteur,
export/resume, interaction/drag, model/creation, model/normalisation}.test.ts` en typant
explicitement les variables intermédiaires (`const src: ObjetBrut[] = [...]`) plutôt que les
littéraux inline, qui n'en avaient pas besoin. Aucun fichier de `src/` touché, donc aucun impact sur
`dist/index.html` — pas de nouveau build, pas de nouvelle version.

Le cliquet (`scripts/cliquet.mjs`) protège désormais `tests/` comme un bloc unique, en plus des
quatorze dossiers de `src/` : **`--noImplicitAny` est à zéro sur l'ensemble du dépôt**, tests
compris.

## [1.1.0-alpha.12] — 2026-08-30

**Phase 7, neuvième palier : `export/` est typé de bout en bout.** 122 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 510 → **387**. Treize dossiers sur quatorze sont tenus par le
cliquet. Seul `ui/` (371) reste — volontairement en dernier, la couche la plus grosse et la moins
testée.

### Interne

- `export/pdf/writer.ts`, `export/resume.ts`, `export/pdfPlan.ts`, `export/svgPlan.ts` et
  `export/dossierPdf.ts` (76 erreurs à lui seul, le plus gros fichier du palier) typés.
- `ObjetASurface` dans `resume.ts` : `surfaceDe` ne lit que `type`, `pts`, `r`, `width` — les tests
  l'appellent sur des objets partiels, ce qui a guidé le type plutôt que d'imposer `ObjetPlan`
  complet.
- `Projeteur`, `MetaDossier`, `OptionsCotation` et `OptionsAngles` dans `dossierPdf.ts` : les
  fonctions de cotation (`cotationPolygone`, `anglesPolygone`) ne dépendent d'aucune forme du plan,
  seulement d'un tableau de points et d'une fonction de projection — exactement ce que les types
  disent maintenant.
- `MetaSvg` dans `svgPlan.ts`, exportée aux côtés de `MetaPdf` (déjà posée au palier `render/`) :
  même paire `appVersion`/`schemaVersion`, deux fois parce que les deux producteurs vivent dans des
  fichiers séparés.
- Vérifié en plus des empreintes habituelles : les deux PDF (`plan.pdf`, `dossier.pdf`) gardent
  exactement leurs comptes de textes, d'objets et de pages (143/14/2 et 106/15/3) après le typage —
  la mise en page n'a pas bougé d'un point.

## [1.1.0-alpha.11] — 2026-08-30

**Phase 7, huitième palier : `three/` est typé de bout en bout**, et l'écart entre la spec et le
code sur les typages Three.js est refermé. 128 → 0 erreurs sous `noImplicitAny` ; total du dépôt
638 → **510**. Douze dossiers sur quatorze sont tenus par le cliquet ; restent `ui` (372) et
`export` (122).

### Interne

- **`@types/three@0.128.0` en devDependency.** La spec §8.3 prescrivait cette option A depuis le
  début ; le code faisait l'inverse (`declare const THREE: any`), avec un commentaire qui
  argumentait contre une décision déjà prise. C'est la dépendance de **type** sans dépendance de
  code : la bibliothèque continue d'arriver du CDN à l'ouverture de la Vue 3D, aucun `import` de
  valeur ne pointe vers `three`, et le build ne contient toujours aucune trace du paquet — vérifié
  sur les octets produits.
- `SceneTrois` n'est plus `Record<string, any>` mais deux formes réelles : `SceneVue3d` (qui cadre
  un plan : `extent`, `cen`) et `SceneGlb` (qui cadre un modèle déjà produit : `centre`, `rayon`),
  au-dessus d'un `SceneTroisBase` de huit champs — exactement ce que les deux vues partagent.
- Trois gardes de type dans `three/gardes.ts` (`estMesh`, `estLumiere`, `estTexture`), qui reprennent
  **le test déjà écrit** (`o.isMesh`, `o.isLight`, `v.isTexture`) et le rendent au vérificateur.
  Three.js répond à ces questions par des drapeaux plutôt que par `instanceof`, et c'est volontaire
  de sa part : deux copies de la bibliothèque dans une même page ont des constructeurs différents.
- Deux types qui mentaient, corrigés : `reglerSoleil(lum: SceneTrois, …)` demandait une scène
  entière alors que son propre commentaire décrivait cinq champs (`EclairageSoleil` désormais), et
  l'appelant de la Vue 3D lui construit un objet à quatre champs sans jamais passer de scène ; et
  `attendreTexturesPretes` déclarait `new Set<SceneTrois>()` — un ensemble de *scènes* — pour y
  ranger des textures.
- Un homonyme évité de justesse : `CameraConservee`, écrit d'abord dans `app/ecouteurs/visionneuse.ts`,
  vit dans `three/glbViewer.ts` avec les autres types de la visionneuse.
- Trouvé sans le corriger, parce que le corriger changerait le rendu : `if(THREE.SRGBColorSpace)
  tex.colorSpace = …` dans `three/scene.ts` **ne fait rien** — ces deux noms n'existent qu'à partir
  de la r152, et le CDN sert la r128. Le garde-fou est tourné vers l'avenir ; il s'allumera de
  lui-même à une montée de version. Le typage l'a rendu visible, il est maintenant documenté sur
  place.
- Vérifié en plus des empreintes — et c'est ce qui compte ici, car aucune des six n'ouvre la 3D :
  l'export GLB refait en direct rend les **mêmes compteurs structurels** qu'au relevé d'origine
  (glTF 2.0, 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène), et la visionneuse
  supporte bascule du fond et filaire sans fuite de canevas ni erreur.

## [1.1.0-alpha.10] — 2026-08-30

**Phase 7, septième palier : `geo/` est typé de bout en bout.** 127 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 790 → **638** (le typage d'`apiIgn.ts` a aussi éteint 25 erreurs
dans `ui/`, qui lisait ses retours). Onze dossiers sont maintenant tenus par le cliquet.

### Interne

- `geo/apiIgn.ts`, `geo/cadastreObjets.ts` et `geo/soleil.ts` typés. GeoJSON décrit une fois pour
  toutes (`Anneau`, `GeometrieGeoJSON`, `FeatureGeoJSON<P>`, `CollectionGeoJSON<P>`,
  `EmpriseGeoJSON`), plus les types du domaine : `ParcelleCadastrale`, `ParcellePrincipale`,
  `ObjetBdTopo`, `AdresseRecherchee`, `ProjecteurCadastre`, `ImportCadastral`, et la famille PLU
  (`ZoneUrba`, `PrescriptionPlu`, `InformationPlu`, `ServitudePlu`, `DocumentPlu`, `CommunePlu`,
  `ZonagePlu`).
- Un paramètre mort retiré : `formeCommune(pts, c)` ne lisait jamais `c`. Trouvé en écrivant la
  signature, vérifié non lu dans le corps, ôté ; les deux appels passaient une parcelle qui ne
  servait à rien (spec §10.3).
- Vérifié en plus des empreintes habituelles — et c'est la vérification qui compte ici, car les
  goldens ne font **aucun** appel réseau : l'import cadastral « Place de la Mairie 35000 Rennes »
  rejoué en direct sur le témoin figé 1.0.0 et sur le build typé, à quelques minutes d'intervalle,
  rend le **même projet au bit près** (25 232 octets normalisés, même SHA-256). Toute la chaîne y
  passe : BAN, API Carto cadastre, BD TOPO en WFS, GPU/PLU.

## [1.1.0-alpha.9] — 2026-08-30

**Phase 7, sixième palier : `app/` est typé de bout en bout.** 19 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 809 → **790**.

### Interne

- Cinq fichiers de `app/ecouteurs/` (affichage, clôture, divers, visionneuse, Vue 3D) et
  `app/modes.ts` (le pilotage des quatre vues) typés.
- `ObjetPlan` gagne `clotureActive`, `clotureHauteur`, `clotureCouleur`, `clotureTexture` (ce dernier
  reste `unknown` : sa forme réelle appartient au sélecteur de texture, non encore typé, palier
  `ui/`).
- Vérifié en plus des empreintes habituelles : le pilotage des quatre vues (Plan, Terrasse, Vue 3D,
  visionneuse) et la bascule de la grille, en séquence, sans erreur.

## [1.1.0-alpha.8] — 2026-08-30

**Phase 7, cinquième palier : `interaction/` est typé de bout en bout.** 53 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 862 → **809**.

### Interne

- `interaction/outilAlignement.ts` et `interaction/pointeur.ts` (le câblage des événements de
  pointeur — sélection, glisser, double-tap, molette, pincement, pan à trois doigts) typés.
- Deux champs `startScreen` (posés sur les gestes `circleMove`/`shapeMove`, jamais lus nulle part —
  seul le pan lit le sien) retirés : trouvés en écrivant le type du geste, vérifiés morts, ôtés.
- Vérifié en plus des empreintes habituelles : un glisser de sommet simulé par de vrais
  `PointerEvent` déplace le sommet visé exactement du delta demandé et laisse les cinq autres
  inchangés ; un zoom molette redessine la scène.

## [1.1.0-alpha.7] — 2026-08-30

**Phase 7, quatrième palier : `io/` est typé de bout en bout.** 57 → 0 erreurs sous `noImplicitAny` ;
total du dépôt 919 → **862**.

### Corrigé

- `Atelier.restoreState` (et son équivalent local dans `io/projet.ts`) annonçait `ObjetPlan[]` alors
  que `core/historique.ts` passe toujours ces objets par `normalizeObjects` en les restaurant — un
  import de fichier ou un cadastre nouvellement créé n'a jamais cette forme complète. Le paramètre
  attend désormais `ObjetBrut[]`, ce que le type garantit réellement ; un `ObjetPlan[]` déjà complet
  (le cas de l'annulation) le satisfait toujours.

### Interne

- `ObjetPlan` gagne `affichage` (masquage du voisinage et de la grille, rattachés à la parcelle comme
  le fond orthophoto).
- `io/validation.ts` type la porte d'entrée d'un fichier de projet (`ProjetValide`), en passant par un
  type `ProjetBrut` intermédiaire pour la même raison qu'ailleurs dans ce module : rien n'est garanti
  avant vérification champ par champ.
- `io/serialisation.ts`, `io/exportProjet.ts`, `io/importSvg.ts`, `io/projet.ts` typés ; réutilisent
  `ObjetSerialise` (model/creation.ts) pour les données post-liste-blanche.
- Vérifié en plus des empreintes habituelles : un cycle export JSON → import (remplacement) sur le jeu
  de démonstration restaure exactement les 35 objets et 11 mesures, relevé de santé identique.

## [1.1.0-alpha.6] — 2026-08-30

**Phase 7, troisième palier : `render/` est typé de bout en bout.** 33 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 952 → **919**.

### Corrigé

- `render/objects.ts` déclarait sa propre interface `ObjetPlan` — **quatrième** type local homonyme
  du modèle trouvé en phase 7, après `ObjetPlan` dans `render/measures.ts`, `EtatPlan` dans
  `app/atelier.ts` et `ObjetParasol` dans `render/parasolOverlay.ts`. Renommée `ObjetRendu` et dérivée
  du modèle (`ObjetPlan & Required<Pick<...>>`) plutôt que réécrite.
- Un test de `model/normalisation.ts` utilisait `cadastre`/`ortho` comme noms de champs arbitraires
  pour vérifier le clonage générique des métadonnées. Le typage de ces deux champs (ci-dessous) a
  rendu ses valeurs de test invalides ; corrigé en leur donnant leur forme réelle plutôt qu'inventée.

### Interne

- `ObjetPlan` gagne `construction`, `cadastre` (partiel — seuls les deux champs lus par le fond
  orthophoto), `ortho`, et les champs de parasol/lieu déjà posés au palier précédent.
- `render/ortho.ts` type le fond WMTS de bout en bout : `ContexteOrtho`, `TuileOrtho`,
  `ConfigOrthoComplete`, `ReferenceGeo`, `ResultatChargementOrtho`.
- `render/pipeline.ts` (`ContexteRendu`) et `render/terrasseCouches.ts` typés ; `Segment`/`Appui`
  (engine/structure.ts) réutilisés pour le calque des couches d'une terrasse.
- Vérifié en plus des empreintes habituelles : le fond orthophoto, activé à la main (le jeu de
  démonstration ne l'active pas), pose les quatre mêmes tuiles — mêmes coordonnées au dernier chiffre
  décimal — que sur le témoin figé.

## [1.1.0-alpha.5] — 2026-08-30

**Phase 7, deuxième palier : `engine/` est typé de bout en bout.** 315 → 0 erreurs sous
`noImplicitAny` ; total du dépôt 1 308 → **952**.

### Corrigé

- **Une garde que j'avais introduite au palier précédent aurait perdu des saisies.** `cadenceDe`
  filtrait `c.cadences` quand ce n'était pas un objet « propre » — or les projets enregistrés portent
  `[]` là où le défaut pose `{}` (c'est le cas du jeu de démonstration), et écrire
  `cadences['piquetage'] = 7` sur un tableau y pose bel et bien une propriété relisible. Le filtre
  aurait fait disparaître une cadence saisie, sans erreur ni trace. Remplacé par
  `model/dictionnaire.ts`, qui indexe exactement comme avant.
- `render/parasolOverlay.ts` déclarait sa propre interface `ObjetParasol` de quatre champs, coupée du
  modèle — troisième type local homonyme trouvé par le typage, après `ObjetPlan` dans
  `render/measures.ts`.

### Interne

- `Construction` (53 champs), `LigneBom`, `VueEnregistree`, `Mesure`, `Segment`, `PrixParLongueur`
  rejoignent `model/types.ts` ; les champs de parasol et le lieu deviennent explicites sur
  `ObjetPlan`. C'est le levier qui a fait tomber les 315 erreurs.
- `engine/` gagne ses types de calcul : `Structure`, `CouchesTerrasse`, `Debit`, `GroupeDebit`,
  `Appui`, `ZoneEquipement`, `CandidatStructure`, `EchantillonSoleil`, `GeometrieOmbre`,
  `CarteOmbre`, `PosteChantier`. Les deux derniers **dérivés** de leur fonction plutôt que réécrits.
- `computeChantier` déclare ses quantités en `Record<PosteChantier, number>` : ajouter une cadence
  sans sa quantité devient une erreur de compilation au lieu d'un poste compté à zéro en silence.
- Quatre exigences nommées plutôt que l'objet entier — `TerrasseEtudiee`, `PorteurDeConstruction`,
  `ObjetMesurable`, `ObjetCote` : ces fonctions ne lisent ni clef ni nom, et l'optimiseur évalue déjà
  des configurations sur un objet fabriqué pour l'occasion.
- 19 affectations `input.value = <nombre>` deviennent explicites (`String(...)`). Elles reposaient sur
  la coercition implicite ; le comportement est identique, la valeur des 31 champs du panneau
  Terrasse a été comparée au témoin figé.
- `structureVide()` remplace l'ossature vide que les panneaux se fabriquaient à la main.

## [1.1.0-alpha.4] — 2026-08-29

**Phase 7 — le cliquet de rigueur.** Premier palier de l'échelle du tsconfig : `shell`, `geometry` et
`model` sont à zéro erreur sous `noImplicitAny`, et ne peuvent plus régresser.

### Corrigé

- **Le numéro de version avait cessé de suivre ce journal.** `alpha.2` et `alpha.3` y étaient
  annoncés alors qu'`APP_VERSION` et `package.json` étaient restés à `alpha.1` : ces deux versions
  n'ont jamais été estampillées dans un artefact livré. Le numéro repart d'`alpha.4`, et les six
  empreintes sont recapturées — après avoir prouvé, ligne à ligne, que **seule** la ligne de version
  bouge (EMPREINTES.md, « recapture de rattrapage »).
- `geometry/rings.ts` annonçait `{ a, b }` là où il manipulait des paires `[p0, p1]`. Le type était
  faux depuis son écriture ; le code, lui, était cohérent. Aucun comportement modifié.
- `render/measures.ts` déclarait sa propre interface **nommée `ObjetPlan`**, différente de celle du
  modèle. Renommée `ObjetCote` : ce n'est pas un type de donnée mais une exigence de quatre champs.

### Interne

- `scripts/cliquet.mjs` (`npm run cliquet`) : lance `tsc` avec les drapeaux du barreau visé et échoue
  si une erreur vient d'un dossier déclaré propre. `tsconfig.json` ne sait pas le faire — restreindre
  `include` ne restreint rien, les fichiers importés entrent quand même dans le programme.
- Types partagés consolidés : `Mesure` passe de `render/` à `model/types.ts` (c'est une donnée du
  projet, et `core/state.ts` en tient la liste) ; `EtatApp.objects` et `.measures` cessent d'être des
  `Record<string, unknown>[]` ; `EtatPlan` cesse d'être un `any` et désigne `EtatApp` ; `ObjetBrut`
  nomme un objet **avant** normalisation.
- `normalizeObjects` devient générique — `<T> ⟶ (T & ObjetBrut)[]` — ce qui est littéralement son
  travail : elle n'enlève rien, elle ajoute.
- `model/creation.ts` prend un `EtatCreation` de cinq champs au lieu de l'état entier : `model/` n'a
  pas à connaître la pile d'annulation ni la transformation de la scène.
- 1 375 → **1 308** erreurs au barreau 2. L'index `[autreChamp: string]: unknown` d'`ObjetPlan`
  n'est **pas** retiré : c'est un chantier orthogonal à `noImplicitAny` (spec §9.2.4).

## [1.1.0-alpha.3] — 2026-08-29

Les quatre dernières fonctions de logique sortent de `legacy.ts`.

### Interne

- `ui/panelTabs.ts`, `interaction/outilAlignement.ts` (l'alignement rejoint le côté de référence
  qu'il lisait déjà), `io/exportProjet.ts`, `three/exportGlb.ts`.
- `shell/download.ts` gagne `telechargerBinaire` : le même détour ancre-invisible que pour le texte,
  qui était recopié à la main dans l'export GLB.
- `legacy.ts` : 1 625 → 1 500 lignes. Plus aucune fonction de plus de quinze lignes hors `boot()`.

## [1.1.0-alpha.2] — 2026-08-29

Le résumé et l'ordre d'empilement sortent de `legacy.ts` ; les couches sont rangées et la règle de
dépendance devient vérifiable.

### Interne

- `export/resume.ts` (**18 tests** — un des six artefacts de référence, jusqu'ici sans aucun test),
  `render/empilement.ts` (**14 tests**), `geometry/angles.ts`.
- **`shell/`** : `dialogs`, `dom` et `download` n'étaient ni des panneaux ni du pur. Ils quittent
  `ui/` et `util/`. `geometry/vue.ts` (transformation monde ↔ écran) quitte `render/`.
- `tests/unit/architecture.test.ts` vérifie désormais la règle de dépendance, la pureté de
  `geometry`/`model`/`util`, et qu'aucun module n'importe `legacy.ts`. Il a trouvé un quatrième
  fichier mal rangé dès sa première exécution.
- 52 lignes de commentaires orphelins retirées — ils décrivaient du code parti ailleurs.

## [1.1.0-alpha.1] — 2026-08-29

**La version livrée n'est plus le fichier mono-page d'origine : c'est le build.** `plan.html` passe
de 779 140 à 450 713 octets. Le témoin figé reste sous `legacy/plan_interactif.html`.

### Modifié

- `APP_VERSION` : `1.0.0` → `1.1.0-alpha.1`, `BUILD_AT` → `2026-08-29`.
- **Les six empreintes de référence changent**, et c'est voulu : la version est estampillée dans les
  six artefacts exportés. Prouvé avant recapture — à numéro inchangé le build reproduisait les
  anciennes empreintes au bit près, et après changement une seule ligne diffère par artefact texte
  (l'en-tête du résumé, `data-app-version` du SVG, la signature du DXF, `meta.appVersion` du JSON).
  Les deux PDF ont été comparés sur leur contenu : nombres de textes, d'objets et de pages
  inchangés. Voir `tests/fixtures/golden/EMPREINTES.md`, section « La rupture ».
- `export-pdf.test.ts` acceptait `[\d.]+` comme numéro de version : il accepte désormais un SemVer
  complet, pré-publication comprise.

### Non modifié

- **Le schéma du projet reste à 1.** Un fichier enregistré par la 1.0.0 s'ouvre dans cette version,
  et réciproquement. La rupture porte sur l'artefact livré, pas sur les données.

### Ce que cette version n'est pas

Ce n'est pas la `1.1.0` : son critère de sortie exige `legacy.ts` supprimé et la phase 7 terminée.

## [1.0.1-alpha.46] — 2026-08-29

Les trois points laissés en suspens sont soldés.

### Supprimé

- `muter()`, dans l'historique : personne ne l'appelait. Du code mort qui se présente comme le
  chemin sûr est pire que pas de chemin du tout.

### Interne

- L'horloge des clés d'objets devient injectable (`ContexteCreation.horloge`, `Date.now` par
  défaut) — la dernière source de non-déterminisme que `EMPREINTES.md` signalait depuis la phase 0.
  Un scénario qui crée des objets peut désormais être comparé à lui-même.
- `dupliquer()` refaisait le calcul de clé à la main au lieu d'appeler `cle()` : une seule écriture
  de la règle désormais.
- **5 tests**, 490 au total.

### Vérifié plutôt que corrigé

- `altitude: 0` retombe sur 1,60 m. Ce n'est pas une valeur perdue : le panneau d'attributs plafonne
  l'altitude par le bas à 0,10 m, donc `0` ne peut venir que d'un fichier écrit à la main.

## [1.0.1-alpha.45] — 2026-08-29

Les trois mécanismes enchevêtrés du pilotage des vues sont démêlés. Aucun comportement ne change.

### Interne

- `vueCourante` devient la seule vérité sur ce qui est affiché, `appliquerVue()` le seul endroit qui
  touche aux boutons et aux zones, et `etat.appMode` en est dérivé. Plus aucune fonction ne corrige
  après coup l'apparence laissée par une autre.
- La visionneuse GLB devient la quatrième vue au lieu d'un panneau qui pilotait lui-même les boutons.
- La place d'origine du plan est marquée par un nœud-ancre, au lieu d'une référence de frère capturée
  au premier déplacement.
- Vérifié contre le témoin sur dix états, dont le `className` complet des boutons et le rang exact du
  plan parmi ses frères. `legacy.ts` : 1 789 → 1 769 lignes.

## [1.0.1-alpha.44] — 2026-08-29

Le pilotage des modes sort de `legacy.ts` et ouvre le dossier `app/`.

### Interne

- `app/modes.ts` : modes Plan et Terrasse, sous-onglets, déménagement du plan entre ses trois
  emplacements. La « Vue 3D » n'est pas un troisième mode mais le mode Terrasse sur son sous-onglet
  `3d` — ce qui explique les corrections d'apparence à la main après chaque bascule.
- L'interrogation du PLU rejoint `ui/projectBar.ts`, à côté du panneau qu'elle remplit.
- Vérifié contre le témoin sur neuf états de l'interface, dont le parent réel du plan dans le DOM.
- `legacy.ts` : 1 947 → 1 789 lignes, soit **87 %** du fichier d'origine sorti, en 93 modules.

## [1.0.1-alpha.43] — 2026-08-29

### Interne

- La visionneuse GLB rejoint `three/glbViewer.ts`, le sélecteur de terrasse `ui/terrassePanels.ts`.
  Sans aucune terrasse, la Vue 3D reste accessible ; les autres sous-onglets restent derrière
  l'accueil. `legacy.ts` : 2 023 → 1 947 lignes, soit 86 % du fichier d'origine sorti.

## [1.0.1-alpha.42] — 2026-08-29

### Interne

- `render/terrasseCouches.ts` : chaque couche a sa case, et non un onglet exclusif — d'où les traits
  qui maigrissent dès qu'il y en a plus d'une.
- `ui/cloture.ts` : deux passes pour trouver la parcelle, parce que les parcelles voisines importées
  sont elles aussi `fonction === 'terrain'`.

## [1.0.1-alpha.41] — 2026-08-29

### Interne

- `three/soleilVue3d.ts` et `three/chargeurs.ts`. L'état du soleil rejoint `etat3d.ts`, dans les
  mêmes champs que celui de la visionneuse.

### Corrigé avant publication

- Un même drapeau allait servir à l'exporteur glTF et au lecteur, qui sont deux scripts distincts.

## [1.0.1-alpha.40] — 2026-08-29

### Interne

- `three/navigation.ts` : zoom, mode du glisser, hauteur des yeux, points de vue, plein page. La
  conversion d'un point de vue vers le repère de la scène était écrite deux fois ; **10 tests**.

### Corrigé avant publication

- Le fichier de tests d'`alpha.39` ne passait pas `tsc` : le typecheck avait été lancé avant son
  écriture, pas après.

## [1.0.1-alpha.39] — 2026-08-29

La normalisation, la création d'objets et les contraintes de parasol sortent de `legacy.ts`.

### Interne

- `model/normalisation.ts`, `model/creation.ts` (fabriques pures séparées de la pose dans le plan),
  et la contrainte « pied en bordure » dans `engine/parasol.ts` — c'est le **pied** qu'on projette
  sur le pourtour, pas le centre de la toile.
- **44 tests**, 476 au total. `legacy.ts` : 2 584 → 2 354 lignes.

## [1.0.1-alpha.38] — 2026-08-29

La Vue 3D et la visionneuse GLB partagent enfin un seul soleil.

### Interne

- `three/lumiere.ts` : `reglerSoleil()` porte le calcul qui était écrit deux fois — trente lignes de
  trigonométrie et trois règles d'éclairage. La seule différence réelle entre les deux vues devient
  un paramètre : la Vue 3D est centrée sur l'origine, la visionneuse sur son modèle.
- Vérifié contre le témoin figé en interceptant ce qui est réellement passé à Three (position du
  soleil, facteur jour) : neuf réglages, deux vues, identiques au dernier chiffre.
- `legacy.ts` : 2 606 → 2 584 lignes.

## [1.0.1-alpha.37] — 2026-08-29

Le lieu et le curseur « semaine » sortent, avec leurs doublons.

### Interne

- `util/semaine.ts` : le décalage d'un cran était dupliqué dans les deux vues 3D. Il est **relatif**
  à la date courante (sept jours par cran) et ne suit **pas** la numérotation ISO.
- `model/lieu.ts` : le lieu est rattaché à la parcelle, donc enregistré avec le projet. Une longitude
  de 0 est une position, pas une absence.
- **20 tests**, 432 au total. `legacy.ts` : 2 634 → 2 606 lignes.

## [1.0.1-alpha.36] — 2026-08-29

Les hauteurs sortent de `legacy.ts`, en une seule définition.

### Interne

- `engine/hauteurs.ts` : hauteur d'appui, hauteur finie, élévation — lues par le plan de coupe, la
  3D, le dossier PDF et le chiffrage. Une vis de fondation est enterrée, seul son dépassement de tête
  soulève ; un plot est posé, toute sa hauteur compte.
- **18 tests**, 412 au total. Hauteur finie identique au témoin : 27 cm sur les deux terrasses de la
  démonstration. `legacy.ts` : 2 661 → 2 634 lignes.

## [1.0.1-alpha.35] — 2026-08-29

Le client `api.php` sort de `legacy.ts`.

### Interne

- `io/api.ts` : la règle qui portait tout est maintenant explicite — on ne retombe sur le jeu de
  démonstration que si **ce navigateur n'a jamais ouvert aucun projet**. Dès qu'un identifiant est
  connu, un échec est remonté : substituer la démonstration faisait croire qu'un vrai projet avait
  été perdu.
- **14 tests** jsdom, 394 au total. `legacy.ts` : 2 727 → 2 661 lignes.

## [1.0.1-alpha.34] — 2026-08-29

L'historique sort **tel quel**, pour être réécrit ensuite.

### Interne

- `core/historique.ts` : le code n'a pas bougé d'une ligne ; l'en-tête dit en sept points ce qu'une
  réécriture doit savoir. **18 tests de caractérisation**, dont un qui vérifie une *absence* : il
  n'existe pas de rétablissement, et ce test doit échouer le jour où il arrivera.
- `legacy.ts` : 2 914 → 2 727 lignes.

## [1.0.1-alpha.33] — 2026-08-29

### Interne

- `render/pipeline.ts` : l'orchestration du dessin sort de `legacy.ts`.

## [1.0.1-alpha.32] — 2026-08-29

### Interne

- Le débit de bois rejoint les autres tables dans `ui/tables.ts`.

## [1.0.1-alpha.31] — 2026-08-29

La validation d'un fichier de projet sort de `legacy.ts`, et gagne les tests qu'elle n'avait pas.

### Interne

- `io/validation.ts` : les trois refus (schéma trop récent, coordonnées au-delà de 100 km, aucun
  objet exploitable) sont documentés pour ce qu'ils protègent. **19 tests**, 362 au total.
- `legacy.ts` : 3 119 → 3 086 lignes.

## [1.0.1-alpha.30] — 2026-08-29

Les tables du dossier et du chiffrage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/tables.ts` : liste des terrasses du dossier, métré, débit de bois. Aucune ne calcule.
- `legacy.ts` : 3 253 → 3 119 lignes.

### Corrigé avant publication

- La table du métré est restée vide un moment : une fabrique de contexte n'avait pas été insérée là
  où je croyais. Le contrôle de santé ne l'a pas vu — il a fallu comparer au témoin (7 et 18 lignes
  contre 0 et 0).

## [1.0.1-alpha.29] — 2026-08-29

Le chargement d'un projet importé sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/projet.ts`. La séquence compte : remplacer les données, reconstruire les vues, **puis**
  restaurer les réglages rangés sur la parcelle.
- `legacy.ts` : 3 345 → 3 253 lignes.

## [1.0.1-alpha.28] — 2026-08-29

Les événements de pointeur sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/pointeur.ts` (289 lignes) : sélection, glisser, double-clic, molette, pincement,
  déplacement à trois doigts. Deux différences doigt/souris y sont documentées.
- Vérifié contre le témoin figé, à froid : sommet tiré de (+12,7095 ; −8,1172) m, molette,
  insertion de sommet.
- `legacy.ts` : 3 599 → 3 345 lignes.

## [1.0.1-alpha.27] — 2026-08-29

Le fond orthophoto sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `render/ortho.ts` : tuiles WMTS de l'IGN, cache, calage sur le repère du plan, réglages. Vérifié
  sur des tuiles réelles — 4 tuiles, opacité du terrain 1 → 0,15 puis retour.
- `legacy.ts` : 3 816 → 3 599 lignes.

## [1.0.1-alpha.26] — 2026-08-29

L'outil de cotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/outilMesure.ts` : le brouillon d'une cote en cours de pose, partagé par le
  `pointerdown` du plan, le panneau et le rendu. Il ne vit pas dans `etat` : rien ne s'enregistre
  tant que la cote n'est pas validée.
- `ui/mesurePanel.ts` : son affichage.
- `legacy.ts` : 3 931 → 3 816 lignes.

## [1.0.1-alpha.25] — 2026-08-29

Le sélecteur d'objets et la table d'affichage sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/selector.ts`. Le filtre par famille descend avec le sélecteur : ce n'est ni une donnée du plan
  ni une préférence enregistrée.
- `legacy.ts` : 4 098 → 3 931 lignes.

## [1.0.1-alpha.24] — 2026-08-29

La visionneuse GLB et le chargement de Three.js sortent de `legacy.ts`.

### Corrigé avant publication

- `SOLEIL_ELEV_PLANCHER`, partagée entre la Vue 3D et la visionneuse, était partie avec cette
  dernière : la construction de la scène 3D échouait **à mi-course** — 46 nœuds au lieu de 203, sans
  erreur visible. Elle a désormais son module, `three/lumiere.ts`.
- Un renommage global avait atteint un identifiant d'élément dans une chaîne
  (`getElementById('glbViewerFilaire')`), ce qui cassait le boot.

### Interne

- `three/glbViewer.ts`, `three/lumiere.ts`, et l'état de la visionneuse dans `three/etat3d.ts`.
- `legacy.ts` : 4 365 → 4 098 lignes.

## [1.0.1-alpha.23] — 2026-08-29

La sérialisation et l'import SVG sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `io/serialisation.ts` : `serializeObjects` est une **liste blanche** — un champ qui n'y est pas
  nommé disparaît au premier enregistrement.
- `io/importSvg.ts` : le pendant exact de `export/svgPlan.ts`.
- `legacy.ts` : 4 576 → 4 365 lignes.

## [1.0.1-alpha.22] — 2026-08-29

La barre de projet, l'actualisation cadastrale et le panneau PLU sortent de `legacy.ts`.

### Interne

- `ui/projectBar.ts` : `setupProjectBar()`, `renderPanneauPlu()`, `actualiserDepuisIgn()`,
  `ouvrirDialogueActualisation()`, `construireVoisinage()`.
- `legacy.ts` : 5 214 → 4 576 lignes.

### Corrigé avant publication

- Le boot s'arrêtait juste avant le premier `render()` : la fabrique de contexte avait été insérée
  au niveau du module, alors que `etat` est une **locale de `boot()`**. Plan sans étiquettes et
  barre vide. Trouvé en comparant HEAD et la modification dans le même onglet neuf.

## [1.0.1-alpha.21] — 2026-08-29

Les huit panneaux du mode Terrasse sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/terrassePanels.ts` : configurateur, paramètres de calcul, plan de coupe, débit de bois,
  implantation, chantier, méthode, optimisation — 1 373 lignes.
- `legacy.ts` : 6 585 → 5 214 lignes. Vérifié panneau par panneau contre le témoin figé, au
  caractère près.

## [1.0.1-alpha.20] — 2026-08-29

La Vue 3D sort de `legacy.ts` — et une régression sérieuse en sort avec elle.

### Corrigé

- **La Vue 3D était vide et l'export GLB ne se terminait jamais**, depuis le correctif « une seule
  scène » de l'alpha.8 : le remplacement en masse `scene.` → `etat.scene.` avait aussi capturé les
  scènes **locales** de la 3D. `TypeError: etat.scene.add is not a function`, qu'aucun golden file
  ne pouvait voir. Corrigé aux 33 sites concernés. Le GLB retrouve exactement l'empreinte
  structurelle du golden : 203 nœuds, 200 maillages, 288 matériaux, 178 textures.

### Interne

- `three/scene.ts` et `three/etat3d.ts`. `legacy.ts` : 7 209 → 6 585 lignes.

## [1.0.1-alpha.19] — 2026-08-29

Le panneau d'attributs sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/attrPanel.ts` (717 lignes) et `interaction/outilAlignement.ts` pour la cible de l'outil
  d'alignement, partagée par trois endroits.
- `legacy.ts` : 7 912 → 7 209 lignes.

## [1.0.1-alpha.18] — 2026-08-29

Le dialogue d'import cadastral sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `ui/cadastreDialog.ts` (753 lignes). La fonction était passée **en callback** à `showConfirm` :
  avec un paramètre de contexte, elle aurait reçu l'argument du confirm. Six appels asynchrones
  lancés sans attente sont désormais marqués `void`.
- `legacy.ts` : 8 663 → 7 912 lignes.

## [1.0.1-alpha.17] — 2026-08-29

L'acquisition IGN sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/apiIgn.ts` : géocodage BAN, cadastre API Carto, BD TOPO, PLU. Ce module ne connaît ni le DOM
  ni l'état.
- `geometry/proximite.ts` : distances entre contours — des critères de classement, jamais des
  mesures publiées.
- Un doublon disparaît : `aireSignee` était `signedArea`.
- `legacy.ts` : 9 011 → 8 663 lignes.

## [1.0.1-alpha.16] — 2026-08-29

Les quatre constructeurs d'export sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `export/dxfPlan.ts`, `export/svgPlan.ts`, `export/pdfPlan.ts`, `export/dossierPdf.ts`, plus
  `export/separateurs.ts` (contrat entre l'export et l'import SVG).
- `model/types.ts` gagne `ObjetPlan`.
- `legacy.ts` : 9 699 → 9 011 lignes.

## [1.0.1-alpha.15] — 2026-08-29

La conversion des données cadastrales sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geo/cadastreObjets.ts` et `geo/constantesCadastre.ts`. Le paramètre s'appelle `importe` et non
  `etat` : il portait exactement le nom de l'état de l'application.
- Vérifié par un import réel contre les services IGN : projet identique, `84bc5173…`.
- `legacy.ts` : 9 928 → 9 699 lignes.

## [1.0.1-alpha.14] — 2026-08-28

Les règles qui comblent les trous de la BD TOPO sortent de `legacy.ts`. Aucun comportement ne
change.

### Interne

- `geo/bdtopo.ts` : `hauteurBatiment()`, `hauteurVegetation()`, `arbresEstimes()`,
  `libelleParcelle()` et les deux plafonds d'arbres estimés. Ce sont des choix, pas des mesures :
  les tests servent surtout à ce que personne ne les prenne pour de la donnée et ne les « corrige ».
- `legacy.ts` : 9 971 → 9 928 lignes. 343 tests.

### Vérification

- Ces règles ne servent qu'à l'import cadastral, qui appelle les services IGN en ligne : les golden
  files ne les couvrent pas et l'import de bout en bout n'a pas été rejoué. Déplacement littéral,
  couvert par 18 tests unitaires, application et dialogue d'import vérifiés au navigateur.

## [1.0.1-alpha.13] — 2026-08-28

La composition des étiquettes de côtes et de coins est réunie en un seul endroit. Aucun comportement
ne change.

### Interne

- `model/etiquettes.ts` : `etiquetteComposee()`, `longueurEnMetres()`, `angleEnDegres()`. La règle
  était recopiée à six endroits, dont deux avec une ponctuation ASCII volontaire (les PDF écrivent
  en WinAnsi) que rien ne signalait. La ponctuation est désormais un paramètre nommé.
- `legacy.ts` : 9 988 → 9 971 lignes. 325 tests.

### Documentation

- `tests/fixtures/golden/EMPREINTES.md` : nouvelle section « Ce que ces empreintes ne voient pas ».
  Le jeu de démonstration n'affiche ni nom de côté ni angle — les six empreintes ne couvrent donc
  pas la composition des étiquettes. Le contrôle complémentaire et ses valeurs attendues y sont
  écrits.

## [1.0.1-alpha.12] — 2026-08-28

L'alignement par rotation sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `geometry/alignement.ts` : `alignerSurCote()`, `rotationDAlignement()`, `tourner()`. Trois
  décisions y sont désormais écrites — rotation repliée dans ±90° (un côté s'aligne sur une droite,
  pas sur une direction), pivot au milieu du côté aligné, distance mesurée depuis ce côté et
  conservant la forme du côté où elle est déjà.
- `legacy.ts` : 10 016 → 9 988 lignes. 308 tests.

## [1.0.1-alpha.11] — 2026-08-28

L'ajout et le retrait de sommets sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `model/sommets.ts` : `insererSommet()`, `supprimerSommet()`, `minimumSommets()` — les quatre
  tableaux d'une forme (points, noms de coins, noms de côtés, coins gelés) restent en phase au même
  endroit.
- La suppression d'un objet passe par `detruireVue()`, qui oublie en plus l'entrée de la carte des
  vues — une fuite lente que le code en place laissait derrière lui.
- `legacy.ts` : 10 024 → 10 016 lignes. 291 tests.

### Connu, non corrigé

- Les noms de sommets par défaut sont numérotés d'après le nouveau total, pas d'après la position
  d'insertion : deux insertions peuvent produire deux « Coin 5 ». Comportement du fichier d'origine,
  figé par un test.

## [1.0.1-alpha.10] — 2026-08-28

Le glisser-déposer sort de `legacy.ts`. Aucun comportement ne change.

### Interne

- `interaction/drag.ts` : les cinq gestes qui modifient la géométrie (forme, cercle, sommet, côté,
  rayon). Le `pointermove` passe de 87 lignes à 6. Principe du module : on refuse plutôt que de
  déformer, et le refus est en bloc.
- `render/theme.ts` ne lit plus `window.matchMedia` sans garde : ce module pouvait empêcher toute
  suite de tests qui l'importe de se charger — 15 tests ne tournaient plus sans qu'aucun n'échoue.
- `legacy.ts` : 10 092 → 10 024 lignes. 278 tests.

### Connu, non corrigé

- Le débordement d'un cercle hors du contour est testé par seize points de son bord, pas par une
  vraie intersection : une fente de contour plus étroite que l'écart entre deux rayons
  échantillonnés laisse passer un cercle qui déborde. Comportement du fichier d'origine, figé par
  un test.

## [1.0.1-alpha.9] — 2026-08-28

`render()` est réduit à son orchestration : le positionnement des objets et le dessin des cotes
vivent dans `render/`. Aucun comportement ne change.

### Interne

- `render/objects.ts` : `positionnerObjet()` — la boucle de 113 lignes qui plaçait chaque objet.
- `render/measures.ts` : `dessinerCotes()`, plus `ancrageHorsContour()` et
  `distanceSortiePolygone()` — l'étiquette se pose hors du contour, au-delà de la dernière sortie
  du rayon.
- `geometry/basic.ts` : `angleInterieurDeg()`.
- Variable morte du fichier d'origine retirée (`const objCenter`, jamais lue).
- `legacy.ts` : 10 271 → 10 092 lignes. 254 tests.

## [1.0.1-alpha.8] — 2026-08-28

Le rendu et les interactions sortent de `legacy.ts`, module par module. Aucun comportement ne
change — mais une régression introduite en cours de route a été trouvée et corrigée.

### Interne

- `render/` : objets SVG d'un plan, calque des parasols, géométrie des cotes, thème, helper
  `creerSvg` typé, décor et grille.
- `interaction/` : édition par côté et par angle, zoom, pincement, déplacement, cadrage.
- `pathD` et `polyStr` rejoignent `geometry/path.ts` : la dette de la phase 2 est soldée.
- `legacy.ts` : 10 839 → 10 271 lignes. 249 tests.

### Corrigé avant publication

- **Le zoom ne faisait plus rien** depuis trois commits : deux scènes coexistaient, l'une écrite
  par la molette, l'autre lue par le dessin. Les golden files ne pouvaient pas le voir — un export
  est recalculé dans son propre repère. Corrigé, et la navigation est désormais couverte par
  23 tests.

### Connu, non corrigé

- Le cadrage plafonne à 400 px/m alors que la molette s'arrête à 220 : écart repris du fichier
  d'origine, figé par un test.
- Sur un élément SVG, `el.title` ne produit aucune infobulle : l'affectation crée une propriété
  inerte. Comportement conservé.

## [1.0.1-alpha.7] — 2026-08-28

Premiers modules de `render/**` et `interaction/**`, rendus possibles par l'état explicite.
Aucun comportement ne change.

### Interne

- `render/` : thème SVG, helper `creerSvg` typé (§7.2), flèche du Nord, échelle, grille,
  géométrie des cotes. `W` et `H` rejoignent `etat.scene`.
- `interaction/editing.ts` : édition par longueur de côté et par angle, contour de contrainte
  passé en paramètre.
- 22 tests ajoutés (221 au total).

### Corrigé avant publication

- Le renommage de `W`/`H` avait détourné les variables locales de `renderImplantation()` (format
  papier en mm) vers la taille de la fenêtre. Restauré et vérifié à l'écran.

## [1.0.1-alpha.6] — 2026-08-28

L'état de l'application tient désormais dans un seul objet explicite (`src/core/state.ts`), à la
place des variables libres de la fermeture de `boot()`. Aucun comportement ne change.

### Interne

- `EtatApp` / `creerEtat()` : données du plan, sélection, modes, bascules d'affichage, édition,
  calque d'ombre. 334 accès passent par `etat.`.
- La variable locale du dialogue d'import cadastre, qui s'appelait aussi `etat`, devient
  `etatImport` : elle masquait l'état global sur 750 lignes.
- 7 tests ajoutés (189 au total).

### Corrigé avant publication

- Le remplacement automatique avait renommé `data-measures` en `data-etat.measures` dans le SVG
  exporté. Un SVG produit par une version antérieure aurait perdu ses mesures à la réimportation.
  Détecté par les golden files, corrigé, et vérifié en réimportant le SVG d'avant migration.

## [1.0.1-alpha.5] — 2026-08-28

Phase 5 de la migration TypeScript, **partielle** : les modules d'interface qui ne dépendent pas
du rendu sortent de `legacy.ts`. Aucun comportement ne change.

### Interne

- `src/ui/dialogs.ts` : notifications, confirmation, saisie, bandeau d'erreur, écran de reprise.
- `src/ui/texturePicker.ts` : catalogue Poly Haven et fenêtre de choix, typés.
- `src/ui/dom.ts` : helpers `el()` / `elOpt()` / `els()` / `on()` (§7.1), en place pour que le
  code neuf n'ajoute pas de `getElementById` non gardé.
- `main.ts` n'a plus sa copie du bandeau d'erreur : il importe celui du module.
- 19 tests ajoutés sous jsdom (182 au total) — première couverture d'interface du projet.

## [1.0.1-alpha.4] — 2026-08-28

Phase 4 de la migration TypeScript, **partielle** : la séparation donnée/vue est faite, la scène et
la pile d'annulation sont sorties. Aucun comportement ne change.

### Interne

- Les huit poignées SVG que portait chaque objet vivent dans une carte à côté
  (`src/render/vues.ts`) : la donnée du plan redevient sérialisable par construction.
- L'échelle et l'origine forment un objet `scene` ; la conversion monde ↔ écran vit dans
  `src/render/scene.ts`, la scène passée en paramètre.
- La pile d'annulation devient `PileAnnulation` (`src/core/history.ts`), bornée à 60 pas.
- 10 tests ajoutés (163 au total).

### Connu, non corrigé

- Après avoir déroulé toutes les annulations disponibles, « Dupliquer » ne fait plus rien. Le
  comportement est identique sur l'artefact gelé d'avant migration : bug préexistant, consigné pour
  après la migration comme l'impose la spec (§10.3).

## [1.0.1-alpha.3] — 2026-08-28

Phase 3 de la migration TypeScript : le moteur terrasse devient une bibliothèque pure et testée.
Aucun nombre ne change — la parité est prouvée bit à bit.

### Interne

- 10 modules `src/engine/**` (1 429 lignes hors de `legacy.ts`, qui passe à 10 839) : constantes,
  construction, lames, structure, calques, BOM, débit, implantation, chantier, parasols.
- Les deux fonctions qui lisaient l'état global le reçoivent désormais en paramètre, ainsi que
  leurs appelants ; les fonctions d'ombre reçoivent un contexte solaire explicite.
- Oracle du moteur capturé avant déplacement (`tests/fixtures/golden/moteur-terrasses.json`,
  deux terrasses de référence, neuf calculs chacune, artefacts de flottants compris).
- Couverture `src/engine` : 91,5 % (critère de sortie de la spec : ≥ 80 %). 153 tests au total.

## [1.0.1-alpha.2] — 2026-08-28

Phase 2 de la migration TypeScript : extraction des fonctions pures. Aucun comportement ne change,
les six golden files restent identiques au bit près à chaque lot.

### Interne

- 16 modules typés sortent de `legacy.ts` (12 959 → 12 250 lignes) : `model/{units,types,defaults,demo,version}`,
  `geometry/{basic,segments,rect,polygon,rings,path}`, `geo/{projection,soleil}`,
  `export/pdf/writer`, `export/dxf`, `util/{escape,format,download}`.
- 79 tests unitaires ajoutés (106 au total) : géométrie, projection locale, position du soleil,
  structure du PDF assemblé.
- Ce que le typage a fait remonter sans le corriger : `estRectangle` rend `null`/`undefined` et
  jamais `false` sur une entrée vide, `rectangleDepuisCote` peut rendre `null`. Les types le disent
  désormais ; le comportement est inchangé.

## [1.0.1-alpha.1] — 2026-08-28

Phases 0 et 1 de la migration TypeScript
([`MD/spec-migration-typescript.md`](MD/spec-migration-typescript.md) §4) : filet de sécurité, puis
échafaudage **sans déplacer une ligne de logique**. L'application construite est fonctionnellement
identique et produit les six golden files au bit près.

### Modifié

- `history` renommé en `undoStack` (changement A1 accepté par la spec §10.3 : une fois les modules
  en place, la collision avec `window.history` deviendrait silencieuse). Prouvé inerte — les six
  empreintes de référence sont identiques avant et après.

### Interne

- Golden files déposés dans `tests/fixtures/golden/` : résumé, SVG, DXF, projet JSON, PDF plan,
  PDF dossier, plus une empreinte structurelle du GLB (le binaire pèse 41,5 Mo et l'exporteur
  three.js n'est pas déterministe).
- Liste de fumée de 25 interactions (`tests/CHECKLIST-FUMEE.md`), à dérouler avant chaque fusion.
- Artefact gelé dans `legacy/plan_interactif.html`, étiquette `v0-preTS`.
- Chaîne d'outils : Vite 5 avec `vite-plugin-singlefile` (le déploiement reste « copier un
  fichier »), TypeScript 5.7 au barreau permissif, ESLint 9, Vitest 2.
- `plan.html` découpé en `index.html`, `src/styles/app.css`, `src/legacy.ts` (les deux blocs
  `<script>` verbatim, sous `@ts-nocheck`) et `src/main.ts` (amorçage).
- `npm test` recalcule les empreintes des golden files : une régression d'export est désormais
  détectée par la chaîne de test, plus par une relecture.
- `npm run build` produit `dist/index.html` (432 ko) avec `api.php` à côté.
- Le serveur de développement accepte `POST /_fixture/<nom>` pour déposer un golden file au bit
  près : un PDF qui transite par une chaîne JavaScript n'est plus le même fichier.
## [1.0.0] — 2026-08-28

Première version numérotée. Elle **fige l'application mono-page existante telle qu'elle est** et
lui donne une identité de version : aucune fonction du plan, aucun calcul et aucune géométrie ne
changent par rapport à l'état du 27 août. Les empreintes de référence sont capturées dans
`tests/fixtures/golden/`.

### Ajouté

- Numéro de version affiché à droite de la barre de projet (`v1.0.0`), avec le détail — build,
  version de schéma, version d'API — dans l'infobulle.
- Estampille de version dans les fichiers de projet : `meta.appVersion`, `meta.schemaVersion` et
  `meta.writtenAt`, à l'export JSON comme à l'enregistrement serveur.
- Estampille dans les exports : commentaire `999` en tête du DXF, attributs `data-app-version` et
  `data-schema-version` sur la racine SVG, dictionnaire `/Info` (`/Producer`, `/Creator`,
  `/CreationDate`) et pied de page sur chaque page des PDF, première ligne du résumé texte.
- En-têtes `X-App-Version` et `X-Schema-Version` sur toutes les requêtes vers `api.php`.
- Refus explicite d'un fichier de projet enregistré par une version plus récente : le plan en
  cours est laissé intact et le message invite à recharger la page. Charger partiellement un tel
  fichier puis l'enregistrer effacerait sans bruit les champs inconnus.
- Confirmation avant « Réinitialiser tout », qui efface d'un clic tout le travail fait depuis le
  chargement, mesures comprises.

### Corrigé

- Plantage au démarrage sur un plan contenant des objets de voisinage : trois variables d'état
  d'affichage étaient déclarées après la fonction qui les lit pendant le boot.
- Le tableau « Affichage par objet » se reconstruisait à chaque case cochée, détachant du DOM la
  case en cours d'utilisation et faisant perdre le focus clavier.

### Interne

- Empreintes de référence des six exports et fixture des quantités calculées
  (`tests/fixtures/golden/`), servant de garde-fou aux versions suivantes.
- `api.php` conserve la version du client qui a écrit chaque projet.
