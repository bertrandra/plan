# IHM mobile et moderne — spécification de migration

**Version :** 0.1 — proposition à discuter, 25 septembre 2026
**Statut :** **publiée en `2.1.0` le 25 septembre 2026**, les dix étapes du §12 cochées. Restent à
passer à la main, avec le réseau, les points de fumée 12 à 15 et 22 à 24 ; et les décisions ouvertes
du §14 (seule la première est tranchée : piles système).
**Point de départ :** `2.0.2`. L'interface est découpée en neuf zones (`spec-ihm-zones.md`, entièrement
cochée) ; elle est pensée pour un écran de bureau et se dégrade mal en dessous de 1 024 px.
**Cible :** `2.1.0`. Une seule application qui s'adapte au téléphone (portrait, une main), à la
tablette et au bureau, avec un langage visuel rafraîchi, en clair et en sombre.
**Maquette de référence :** la toile « Plan — maquette mobile » : quatre écrans de téléphone en clair,
les mêmes en sombre, et une tablette.
**Règle d'or :** **on ne perd rien.** Chaque commande, chaque champ, chaque onglet, chaque dialogue et
chaque geste d'aujourd'hui a une place désignée dans chacune des trois classes d'écran. Le §3 dit
comment on le prouve ; les annexes A à F en font la liste exhaustive.

---

## 1. Ce que ce document fait, et ne fait pas

Il **décrit** la nouvelle disposition par classe d'écran, le design system qui la porte et les
composants nouveaux. Il **affecte** chaque élément fonctionnel existant (59 commandes, 14 sections
d'inspecteur, 8 onglets de résultats, les écouteurs hors registre — dont 20 pour la 3D et la visionneuse —, les dialogues et écrans, les gestes du canevas)
à un emplacement dans chaque classe. Il **ordonne** la mise en œuvre en étapes qui laissent toutes
l'application utilisable. Enfin, il **relève** les défauts trouvés pendant l'inventaire et dit, pour
chacun, s'il est corrigé au passage ou laissé tel quel.

Il ne touche pas au Core. `model`, `geometry`, `engine`, `geo`, `export` et `three` ne changent pas ;
les six empreintes de `tests/fixtures/golden/` restent l'oracle : une IHM reconstruite qui produit les
mêmes SVG, DXF, PDF, dossier, résumé et JSON sur le jeu de démonstration n'a rien cassé.
La version est donc une **MINOR** (`RELEASE.md` §2.1 : nouvelle présentation, aucune quantité ni
aucun octet exporté ne bouge).

Il ne change pas non plus les règles de la spec des zones : une commande, une zone ; les zones ne se
parlent pas ; elles lisent le magasin et émettent des commandes (`spec-ihm-zones.md` §3 et §5). Ce
qui change, c'est **la forme** que prend chaque zone selon la largeur de l'écran.

---

## 2. Constat : ce qui se passe aujourd'hui sur un téléphone

L'inventaire du 25 septembre 2026 (code de la `2.0.2`) établit ceci.

### 2.1 La page n'est pas déclarée mobile

`index.html` ne porte **aucune** balise `<meta name="viewport">`. Un téléphone rend donc la page sur
une largeur virtuelle d'environ 980 px, puis la rétrécit d'environ 0,4×. Les cibles de 44 px de la
palette tombent vers 17 px physiques, et la branche CSS « moins de 1 024 px » s'applique toujours.

### 2.2 Ce qui est masqué sans remplacement sous 1 024 px

| Élément | Règle actuelle | Conséquence |
|---|---|---|
| Palette (Z2) | `display:none` (`app.css:53`) | Pas d'**Annuler** au doigt ; impossible de **créer** un polygone, un rectangle, un chemin, un cercle ou un parasol ; impossible de **dupliquer** ou de **supprimer** un objet |
| Explorateur (Z3) | `display:none` (`app.css:196`) | Pas de sélection par nom, pas de filtres de familles, pas d'œil par objet (**un objet masqué ne peut plus être réaffiché**), pas de « masquer tout », pas d'étiquettes, pas de calques de terrasse, pas de cases « Dossier » |
| Inspecteur (Z5) | passe sous le plan, pleine largeur, sans hauteur maximale (`app.css:260`) | accessible, mais loin du plan : il faut défiler sous le canevas |
| `computeSize` | largeur minimale 320 px, hauteur minimale 420 px (`boot.ts:346-360`) | débordement horizontal sous 360 px réels |
| Vue 3D et visionneuse | canevas de 420 px de haut, boutons de 30 px (`index.html:83,153`) | commandes trop petites au doigt |
| Infobulles (`title`) | tout le détail des refus, des cases de menu, de la version, de la lecture seule | invisibles au doigt |

### 2.3 Défauts relevés en passant, qui touchent tous les écrans

| # | Défaut | Référence | Décision |
|---|---|---|---|
| D1 | `#fitBtn` (« Ajuster à la sélection ») est rendu mais **toujours masqué** par la CSS : la commande `vue.ajuster` n'a aucun point d'accès | `app.css:110`, `Surimpression.tsx:23-26` | **Corrigé** (M3) : c'est une perte de fonction existante |
| D2 | **Ctrl+S** est affiché en `<kbd>` mais aucun gestionnaire n'existe : le navigateur ouvre « Enregistrer la page » | `projet.ts:95`, `BarreApplication.tsx:83` | **Corrigé** (M7) : câbler le raccourci sur `projet.enregistrer` |
| D3 | **Échap** n'annule pas le pointage des outils Cote et Aligner ; en mode `ref`, tout clic hors d'un côté est avalé et le glisser de la vue est bloqué | `outilMesure.ts:38` (`annulerMesureEnCours` jamais appelée), `pointeur.ts:123-126` | **Corrigé** (M3) : Échap et un bouton « Annuler le pointage » visible pendant le mode |
| D4 | Plusieurs saisies du tiroir ne marquent pas le projet modifié et ne s'annulent pas : prix réel du BOM, prix par barre et au m², longueurs achetables, prix des vis et des plots, conditionnement, équipe, heures par jour, cadences, actions du panneau Cotes | `tables.ts`, `terrassePanels.ts`, `mesurePanel.ts` | **Hors périmètre**, inscrit à `DEFAUTS.md` (voir §13) : le corriger change le comportement de l'historique, pas la présentation |
| D5 | Le filet « contenu copiable » des exports SVG et DXF écrit dans `#exportBox`, invisible si l'onglet Résumé est fermé | `exports.ts:39-43` | **Corrigé** (M5) : ouvrir l'onglet Résumé quand le filet sert |
| D6 | `Ctrl+Z` appelle `annuler()` directement, sans passer par la commande `objet.annuler` | `historique.ts:150` | **Corrigé** (M7) : le raccourci passe par le registre, ce qui ne change rien au geste |
| D7 | `3d.enregistrerPointDeVue` crée un objet **sans exiger** `projects.write` | `vue3d.ts:114` | **Hors périmètre**, inscrit à `DEFAUTS.md` : c'est une règle de droits, pas d'IHM |
| D8 | Le menu Affichage n'efface pas `affichage.orthophoto` sans la capacité `plan.ortho` (il n'appelle pas le test d'effacement) | `BarreApplication.tsx:131-136` | **Corrigé** (M7) : même règle que les autres entrées (`design-ui` §2) |
| D9 | Le double-tap au doigt sur un autre élément du même objet recule l'objet **sans vérifier la lecture seule** | `pointeur.ts:144-153` | **Hors périmètre**, inscrit à `DEFAUTS.md` |
| D10 | Libellés périmés : « Mode Plan », « + Point de vue » (aide de la Vue 3D), « + Depuis une adresse » (toasts de l'actualisation IGN), « la case en haut à droite le masque » (voisinage) | `index.html:97`, `projectBar.ts:222,395,470-473` | **Corrigé** (M6, M8) : textes seulement |
| D11 | L'actualisation IGN et le sélecteur de textures ne se ferment pas par Échap ; les menus Étiquettes de l'explorateur ne se ferment ni par Échap ni par clic extérieur | `projectBar.ts`, `texturePicker.ts`, `Explorateur.tsx:95-109` | **Corrigé** (M6) : toute surface modale ou déroulante se ferme par Échap et par le voile |
| D12 | Aucun moyen de désélectionner en touchant le vide du plan | `pointeur.ts:129-135,258-263` | **Laissé tel quel** : c'est un comportement, et la feuille de sélection (§6.4) donne un bouton « Désélectionner » |
| D13 | La section Terrasses de l'explorateur n'apparaît qu'avec une terrasse sélectionnée : son message « Aucune terrasse… » ne se voit jamais | `Explorateur.tsx:154-156,234` | **Laissé tel quel**, noté ; la décision appartient à l'explorateur, pas au mobile |

Tout défaut « corrigé » l'est par une modification de l'IHM seule, et chaque correction est nommée
dans le `CHANGELOG.md` de l'étape qui la porte.

---

## 3. La garantie « on ne perd rien » : comment on la prouve

Une promesse d'exhaustivité ne tient que si une machine la vérifie. Cinq preuves, dont trois sont
automatiques.

### 3.1 La carte d'exposition (automatique)

Un fichier nouveau, `src/app/exposition.ts`, dit **où chaque commande est exposée dans chaque classe
d'écran** :

```ts
export type Classe = 'compact' | 'moyen' | 'large';
export type Emplacement =
  | 'navigation' | 'feuilleOutils' | 'palette' | 'menu:fichier' | 'menu:exporter'
  | 'menu:affichage' | 'menu:aide' | 'menuProjet' | 'surimpression' | 'feuilleSelection'
  | 'inspecteur' | 'explorateur' | 'resultats:<onglet>' | 'vue3d' | 'visionneuse' | 'clavier';

export const EXPOSITION: Record<string, Record<Classe, Emplacement[]>> = {
  'objet.annuler': { compact: ['navigation:barreHaute'], moyen: ['palette', 'clavier'], large: ['palette', 'clavier'] },
  // … une entrée par commande du registre
};
```

Un test (`tests/unit/app/exposition.test.ts`) vérifie trois choses :
1. **chaque** commande déclarée dans le registre a une entrée, et **au moins un** emplacement dans
   **chaque** classe ;
2. aucune entrée ne nomme une commande qui n'existe pas ;
3. chaque composant de zone rend ses boutons avec `data-commande` : un test de rendu (jsdom) monte
   chaque zone dans chaque classe et vérifie que les commandes que la carte y place y sont bien.

C'est ce qui interdit qu'une commande ajoutée demain soit oubliée sur téléphone : le test échoue.
L'annexe A est la première version de cette carte.

### 3.2 La carte des champs (automatique)

L'inspecteur rend des descripteurs, pas du balisage : il n'a qu'un composant. Le test existant qui
exige un descripteur pour chaque clé de `Construction` reste. Un test nouveau monte l'inspecteur en
classe `compact` sur chaque type d'objet du jeu de démonstration (parcelle, terrasse vis, terrasse
plots, parasol, point de vue, arbre, chemin, cercle) et compare **la liste des clés de champs rendus**
à celle de la classe `large`. Elles doivent être identiques : le mobile change la forme d'un champ,
jamais sa présence. L'annexe B en est la liste.

### 3.3 Les empreintes (automatique, existant)

Les six artefacts exportés restent identiques hors numéro de version, à chaque étape.

### 3.4 La liste de fumée étendue (manuelle)

`tests/CHECKLIST-FUMEE.md` garde ses 25 points, **joués dans les trois classes**. Elle gagne quinze
points propres au mobile (§11.3). Un point qui échoue bloque la fusion, comme aujourd'hui.

### 3.5 Les captures de référence (semi-automatique)

Un script Playwright (`scripts/captures.mjs`, Chromium préinstallé) ouvre le jeu de démonstration à
390 × 844, 820 × 1180 et 1440 × 900, en clair et en sombre, sur six états (plan sans sélection, plan
avec terrasse sélectionnée, feuille Outils, inspecteur, résultats BOM, Vue 3D), et dépose les 36
captures dans `tests/captures/`. Elles ne sont pas comparées au pixel ; elles se relisent à chaque
étape et se joignent à la pull request.

---

## 4. Les trois classes d'écran

| Classe | Largeur de la fenêtre | Appareils typiques | Disposition |
|---|---|---|---|
| **compact** | < 600 px | téléphone en portrait | plan plein écran ; barre de navigation en bas ; tout le reste en **feuilles** qui montent du bas |
| **moyen** | 600 à 1 023 px | tablette en portrait, téléphone en paysage, petite fenêtre | plan plein écran ; **rail d'outils** à gauche ; explorateur et inspecteur en **panneaux flottants** escamotables ; résultats en tiroir |
| **large** | ≥ 1 024 px | tablette en paysage, bureau | la disposition actuelle en colonnes, restylée ; les panneaux deviennent des cartes posées sur le plan quand la place manque (maquette « Tablette ») |

- La classe se calcule sur `window.innerWidth` **après** l'ajout du viewport (§9.1) ; elle est posée
  sur `<html data-classe="…">` et dans le magasin (`classe`), et recalculée au redimensionnement
  (le rappel existant de 150 ms).
- Le seuil de 1 024 px reste celui de la spec des zones (§7, décision 3) ; le seuil de 600 px est
  nouveau.
- **Le passage d'une classe à l'autre ne perd aucun état** : sélection, onglet actif, hauteur du
  tiroir, sections repliées de l'inspecteur, pointage en cours, brouillon d'un champ nombre. Seules
  les feuilles ouvertes se referment quand on passe de `compact` à une autre classe.
- L'orientation n'est pas une classe : un téléphone qui passe en paysage devient `moyen`.

---

## 5. Le design system

Il remplace les valeurs de `src/styles/app.css` sans changer ses noms quand ils existent
(`--ink`, `--paper`, `--accent`…), pour que le code qui les lit ne bouge pas. Le skill
`.claude/skills/design-ui/SKILL.md` sera mis à jour à l'étape M1 pour décrire ces jetons.

### 5.1 Couleurs

| Jeton | Clair | Sombre | Rôle |
|---|---|---|---|
| `--ink` | `#2B2117` | `#F1E7D0` | texte principal, bouton principal (fond) |
| `--ink-soft` | `#6B5A41` | `#BFAE8C` | texte secondaire, libellés, unités |
| `--paper` | `#F7F2E7` | `#1C1610` | fond de page |
| `--stage-bg` | `#F1EBDC` + trame de points `#D9CDB2` | `#1C1610` + trame `#3A2F22` | fond du canevas |
| `--panel-bg` | `#FFFDF8` | `#262017` | panneaux, feuilles, barres |
| `--panel-2` *(nouveau)* | `#F7F2E7` | `#2F271C` | fond de tuiles, de chiffres clés, de boutons − et + |
| `--segment-bg` *(nouveau)* | `#F1EBDC` | `#1C1610` | fond des commandes segmentées |
| `--border` | `#E4D9C1` | `#3E3325` | bordures |
| `--rule` | `#EFE6D3` | `#332A1F` | filets entre lignes |
| `--accent` | `#7A5C31` | `#E0B564` | sélection, bouton Créer, total, champ actif |
| `--on-accent` *(nouveau)* | `#FFFDF8` | `#1C1610` | texte posé sur l'accent |
| `--accent-light` | `#EFE3C8` | `#4A3B22` | état actif doux, pastilles, survol |
| `--on-ink` *(nouveau)* | `#FFFDF8` | `#1C1610` | texte posé sur `--ink` (choix actif, bouton principal) |
| `--ok` *(nouveau)* | `#3F7A4A` | `#6BBF7A` | enregistré, interrupteur actif |
| `--danger` *(nouveau)* | `#8E2A1C` sur `#FBF1EE` | `#F2A493` sur `#3A1E18` | Supprimer, erreurs ; remplace `#a02020` en dur |
| `--alerte` *(nouveau)* | `#A8442F` | `#E08A6E` | bordure des alertes de l'inspecteur |
| `--scrim` *(nouveau)* | `rgba(43,33,23,.32)` | `rgba(0,0,0,.5)` | voile derrière une feuille ou un dialogue |
| `--zebra`, `--zebra-hover` | inchangés | inchangés | alternance des tableaux |

Règles :
- Chaque jeton a sa valeur sombre, dans le bloc `prefers-color-scheme: dark` existant.
- Plus aucune couleur en dur dans `app.css` : `#fff`, `#a02020`, `#2b2118`, `#A8442F`
  deviennent des jetons.
- Le contraste texte/fond atteint 4,5:1 (3:1 au-delà de 24 px). Un test lit les paires déclarées dans
  `src/styles/jetons.ts` (nouveau, source des valeurs) et vérifie les rapports.
- **Le plan SVG** (`render/theme.ts`) suit les jetons pour ses encres : trait sur `--ink`, grille
  sur `--rule`, halo des étiquettes sur `--paper`. Les couleurs des objets (parcelle, bâti,
  végétation, terrasse) sont **celles du projet** : elles ne changent pas avec le thème, parce que
  l'utilisateur les a choisies. Ces encres sont **celles de l'écran** : les exports gardent les
  leurs (empreintes). *(Précisé à l'étape M1 : la maquette assombrissait aussi les objets, ce qui
  aurait réécrit à l'écran des couleurs choisies par l'utilisateur.)*

### 5.2 Typographie

Deux rôles, comme aujourd'hui : un **serif** pour le document (noms, titres, chiffres clés) et un
**sans** pour l'instrument (menus, libellés, barres).

- **Décision ouverte n° 1** (§14) : la maquette utilise Fraunces et Instrument Sans (Google Fonts).
  Le fichier livré est unique et doit fonctionner sans réseau pour tout sauf la 3D. Deux options :
  (a) **embarquer** les deux fontes en `woff2` sous-ensemble latin dans le fichier (≈ 90 Ko, dans le
  budget de 5 Mo) ; (b) **rester sur les piles système** : `Georgia, "Iowan Old Style", serif` et
  `system-ui, -apple-system, "Segoe UI", sans-serif`. Recommandation : **(b)** pour la `2.1.0`, (a)
  plus tard si l'écart se voit.
- Échelle : 11 (barre de navigation), 12 (notes, unités, capitales), 13 (commandes compactes),
  14–15 (corps et champs sur mobile), 17 (chiffres de la feuille de sélection), 20–21 (titres de
  feuille), 24–26 (chiffres clés, total). Sur `large`, le corps reste à 0,8 rem comme aujourd'hui.
- Tout nombre qui change ou s'aligne : `font-variant-numeric: tabular-nums`.

### 5.3 Formes, espacements, cibles

| Élément | Valeur |
|---|---|
| Rayons | 10 (champs), 12 (boutons, commandes segmentées), 14 (tuiles, cartes), 16 (panneaux flottants), 22 (haut des feuilles), 999 (pastilles) |
| Espacement | multiples de 4 ; marges latérales 16 px sur `compact`, 12 px sur `moyen` |
| Cible tactile | **44 × 44 px minimum** sur `compact` et `moyen`, partout (et non plus seulement dans Z2 et Z5) ; 32 px tolérés sur `large` pour les commandes secondaires |
| Ombres | douces et chaudes en clair (`0 4px 14px rgba(43,33,23,.10)`), plus marquées en sombre (`rgba(0,0,0,.4)`) ; en sombre, un filet `--border` borde le haut des feuilles |
| Mouvement | 0,12 à 0,2 s ; les feuilles glissent en 0,22 s ; tout mouvement est coupé sous `prefers-reduced-motion` |

### 5.4 Icônes

Les glyphes Unicode et les émojis (`⬠ ▭ ⟋ ○ ☂ 👁 ⧉ ✕ ⤓ ↺ 📐 ⟲ ▦ ⤢ ⛶ 💾 🧍 ⟳ ✋ 🔍 ☀️ 🕐 📷`) sont
remplacés par **un seul jeu d'icônes SVG en trait** (24 px, trait 1,75, `currentColor`), défini une
fois dans `src/zones/icones.tsx` et référencé par nom. Pas de bibliothèque tierce. Chaque bouton
d'icône seule garde un `aria-label` ; l'icône porte `aria-hidden`.

### 5.5 Composants nouveaux ou repris

Tous vivent dans `src/zones/composants/`, sans dépendance nouvelle, et remplacent les classes CSS
équivalentes.

| Composant | Rôle | Remplace ou complète |
|---|---|---|
| `Feuille` | panneau qui monte du bas, poignée, trois hauteurs (`aperçu`, `mi`, `plein`), glisser pour changer de hauteur ou fermer, voile, Échap, focus piégé, retour du focus au bouton d'origine | nouveau ; porte Z2, Z3, Z5, Z6 et les menus en `compact` |
| `PanneauFlottant` | carte posée sur le plan, repliable en poignée, déplaçable d'un bord à l'autre | nouveau ; porte Z3 et Z5 en `moyen` |
| `BarreNavigation` | barre du bas en `compact` : Objets, Coter, **Créer**, Propriétés, Résultats | nouveau |
| `Segmente` | choix exclusif court (2 à 4 options), 38–44 px | remplace les `select` à 2 ou 3 options dans l'inspecteur et les boutons de vue |
| `Pas` (stepper) | champ nombre avec − et + de 44 px, saisie directe au tap sur la valeur, pas et bornes du descripteur | forme `compact`/`moyen` du champ `nombre` |
| `Interrupteur` | case à cocher de réglage en `compact`/`moyen` (`role="switch"`) | forme tactile du champ `case` |
| `Pastilles` | onglets défilants (familles de l'explorateur, onglets des résultats) | `.fambtn`, `.ongletResultats` |
| `Tuile` | outil de création ou d'édition : icône + libellé, 68–76 px | `#zonePalette .outil` en `compact` |
| `ChiffreCle` | libellé + grand chiffre | `.surfaces` et totaux du BOM |
| `LigneListe` | ligne de 44–64 px : pastille, texte, sous-texte, action à droite | `.explorateurLigne`, lignes de BOM en `compact` |
| `Aide` | remplace l'infobulle au doigt : bouton ⓘ de 44 px qui ouvre un court texte ; appui long sur un bouton d'outil grisé qui montre la raison | `title` (§8) |
| `BandeauMode` | bandeau en haut du plan pendant un pointage (Cote, Aligner, sélection de coins) : consigne + « Terminer » + « Annuler » | nouveau (corrige D3) |

---

## 6. Disposition par zone et par classe

Chaque tableau dit, pour chaque classe, **où** vit l'élément. « Inchangé » veut dire : même
emplacement qu'en `2.0.2`, restylé avec le §5.

### 6.1 Z1 — Barre d'application

| Élément | compact | moyen | large |
|---|---|---|---|
| Titre du projet et lieu | barre haute (56–60 px) : nom en serif, lieu dans la feuille Projet | barre haute | barre haute, inchangé |
| Statut d'enregistrement | sous le nom, point `--ok` + « Enregistré à 18:38 » (repris de Z7) | barre haute à droite | barre d'état (Z7), inchangé |
| Sélecteur de projet, Enregistrer | feuille **Projet** (bouton ☰ de la barre haute) | menu Projet | inchangé |
| Menus Fichier, Exporter, Affichage, Aide | feuille **Projet** : quatre groupes dépliables, mêmes entrées, mêmes cases et réglages, dans le même ordre | menus déroulants (`details.menu`) | inchangé |
| Bouton Exporter rapide | icône ⭳ de la barre haute, ouvre le groupe Exporter de la feuille Projet | icône de la barre haute | menu Exporter |
| Annuler | icône ↶ de la barre haute | rail d'outils | palette |
| Vues Plan / 3D / Visionneuse | commande segmentée flottante en haut du plan | commande segmentée dans la barre haute | commande segmentée dans la barre haute |
| Liens compte (« Mes projets », « Se déconnecter ») | fin de la feuille Projet | menu Projet | inchangé |
| Version | fin de la feuille Projet, lisible (plus d'infobulle) | menu Aide › Version | pastille, inchangé |

Règles de la feuille Projet : une entrée choisie ferme la feuille (comme `fermer()` ferme le menu) ;
les cases et réglages (`chkReplaceOnImport`, `chkJsonRemplace`, `chkExportSansParcelle`,
`pdfScaleInput`, `chkDossierEquipements`, `orthoOpacite`, `orthoParcelleOpacite`) **gardent leurs
identifiants DOM** et restent à côté de la commande qui les lit. Le composant `BarreApplication`
reste unique : il rend ses menus en `details` ou en groupes de feuille selon la classe, à partir de
la même liste d'entrées.

### 6.2 Z2 — Palette d'outils

| Élément | compact | moyen | large |
|---|---|---|---|
| Créer : Polygone, Rectangle, Chemin, Cercle, Parasol, Point de vue | feuille **Outils** (bouton central **+** de la barre de navigation), tuiles 3 × 2 | rail d'outils, groupe Créer | palette, inchangé |
| Éditer : Dupliquer, Reculer, Position initiale, Supprimer | feuille Outils, groupe « Éditer · *nom de la sélection* » (4 tuiles), **et** feuille de sélection (§6.4) | rail, groupe Éditer | palette, inchangé |
| Outils : Cote, Aligner | feuille Outils, groupe Mesurer ; Cote aussi dans la barre de navigation | rail, groupe Outils | palette, inchangé |
| Annuler | barre haute (§6.1) | rail, en tête | palette, inchangé |
| Refus | capacité : tuile effacée ; permission ou quota : tuile grisée avec cadenas et la phrase du registre **écrite sous le groupe** ; contexte : grisée | idem, phrase dans l'aide (appui long) | infobulle, inchangé |

Une création depuis la feuille Outils la referme, pose l'objet au centre de la vue visible (pas du
canevas masqué par la feuille), le sélectionne et ouvre la feuille de sélection en aperçu.

### 6.3 Z3 — Explorateur

| Élément | compact | moyen | large |
|---|---|---|---|
| Conteneur | feuille **Objets** (bouton de la barre de navigation), hauteur `mi` par défaut | panneau flottant à gauche, repliable en poignée | colonne, inchangé |
| Familles et comptes | pastilles défilantes | pastilles | inchangé |
| Filtre qui suit la sélection | inchangé | inchangé | inchangé |
| Œil global, menu Étiquettes global (Nom, Côtés, Coins, Cotes, Angles) | en-tête de la feuille ; le menu devient un sous-panneau de la feuille | inchangé | inchangé |
| Liste, œil par objet | `LigneListe` de 48 px ; l'œil est un bouton de 44 px ; **un objet masqué reste listé et réaffichable** | inchangé | inchangé |
| Étiquettes de l'objet sélectionné | sous la ligne sélectionnée, en interrupteurs | inchangé | inchangé |
| Voisinage (n) + œil | section de la feuille | inchangé | inchangé |
| Terrasses (liste, surface, hauteur, case Dossier) | section de la feuille | inchangé | inchangé |
| Structure sur le plan + calques de terrasse (Vis/Plots, Cadre, Solives, Lambourdes, Lames, Lame de rive, Planche plate) | section de la feuille | inchangé | inchangé |
| Toucher une ligne | sélectionne, **ferme la feuille**, cadre l'objet s'il est hors de la vue, ouvre la feuille de sélection | sélectionne | inchangé |

### 6.4 Z4 — Canevas et surimpressions

| Élément | compact | moyen | large |
|---|---|---|---|
| Plan SVG | plein écran entre la barre haute et la barre de navigation ; `computeSize` prend la surface visible (§9.2) | plein écran sous la barre haute | inchangé |
| Grille (`affichage.grille`) | groupe de boutons flottant à droite : Ajuster, Grille, Nord | idem | surimpression, inchangé |
| **Ajuster à la sélection** (`vue.ajuster`) | même groupe flottant, **visible** (corrige D1) | idem | surimpression, visible |
| Flèche Nord (`affichage.nord`) | même groupe flottant | idem | menu Affichage |
| Échelle et pointeur | pastille « Échelle 1:100 » en bas à gauche du plan ; la position s'affiche pendant un glisser | pastille | barre d'état, inchangé |
| **Feuille de sélection** *(nouveau)* | en aperçu dès qu'un objet est sélectionné : nom, fonction, 3 chiffres (surface, hauteur finie ou longueur ou rayon, estimation si terrasse), boutons Propriétés et Chiffrage (ou Résultats), bouton « Désélectionner » ; glissée vers le haut, elle **devient** l'inspecteur | carte flottante en bas à gauche | absente (l'inspecteur est visible) |
| Bandeau de mode (Cote, Aligner) | en haut du plan, consigne + Terminer + Annuler (corrige D3) | idem | idem |

La feuille de sélection **n'ajoute aucune commande** : elle affiche des lectures déjà présentes dans
l'inspecteur (`surface`, `elevationTerrasse`, `longueur`, `r`) et le total du BOM, et ouvre les
feuilles existantes.

### 6.5 Z5 — Inspecteur

| Élément | compact | moyen | large |
|---|---|---|---|
| Conteneur | feuille **Propriétés** (`mi` ou `plein`), ouverte par la barre de navigation ou la feuille de sélection | panneau flottant à droite, 340 px, repliable | colonne, inchangé |
| En-tête | nom en serif, sous-titre (surface, dimensions), bouton fermer ; le titre garde « replier/déplier toutes les sections » | inchangé | inchangé |
| Sections | **les 14 sections, dans le même ordre**, repliables ; en `compact`, une commande segmentée en tête (Objet · Géométrie · Construction · Apparence…) saute à la section, sans masquer les autres | sections repliables | inchangé |
| Champs | même descripteur, forme tactile (§7) | forme tactile | inchangé |
| Pied (Réinitialiser la position, Réinitialiser tout, aide aux gestes) | fin de la feuille | inchangé | inchangé |
| **Bandeau de chiffrage** *(nouveau)* | en pied fixe quand une terrasse est sélectionnée : « 58 lames · 96 plots · total HT », qui ouvre Résultats › BOM. C'est la boucle réglage → chiffrage de `spec-ihm-zones.md` §7.1, rendue sur un seul écran | même bandeau en pied du panneau | inutile (le tiroir est visible) |
| Repli de colonne | sans objet (la feuille se ferme) | repli en poignée | inchangé |

### 6.6 Z6 — Résultats

| Élément | compact | moyen | large |
|---|---|---|---|
| Conteneur | feuille **Résultats**, `plein` par défaut | tiroir du bas, trois hauteurs, inchangé | tiroir, inchangé |
| Onglets (BOM, Plan de coupe, Implantation, Chantier, Méthode ; Cotes, PLU, Résumé) | pastilles défilantes, mêmes règles (onglets de terrasse seulement avec une terrasse sélectionnée ; repli sur Cotes) | inchangé | inchangé |
| Sélecteur de terrasse | bouton « 1 sur 2 » dans l'en-tête quand le plan compte plusieurs terrasses ; il **sélectionne** la terrasse (même effet que dans l'explorateur) | inchangé (explorateur) | inchangé |
| Trois hauteurs | sans objet (la feuille glisse) ; la hauteur mémorisée `plan.tiroir` n'est pas écrasée | inchangé | inchangé |
| Contenu des onglets | §7.3 et annexe C | inchangé, restylé | inchangé, restylé |

### 6.7 Z7 — Barre d'état

En `compact`, la barre d'état disparaît en tant que barre : son contenu est redistribué, **rien ne
se perd**.

| Élément | compact | moyen | large |
|---|---|---|---|
| Statut (local, enregistrement, modifié, enregistré, à jour) | barre haute, sous le nom | barre haute | inchangé |
| Badge « Lecture seule » et son explication | barre haute, pastille ; toucher ouvre l'explication | barre haute | inchangé (explication visible au survol et au focus) |
| Nom de la sélection | feuille de sélection | carte de sélection | inchangé |
| Échelle « 1 m = N px » | pastille d'échelle du plan | pastille | inchangé |
| Pointeur (x, y) | dans la pastille, pendant un glisser | pastille | inchangé |
| Version | feuille Projet | menu Aide | inchangé |

### 6.8 Z8 — Dialogues, Z9 — Notifications

| Élément | compact | moyen et large |
|---|---|---|
| Confirmation, invite, erreur de chargement | feuille modale en bas, boutons pleine largeur de 48 px, action principale à droite ; Échap et voile ferment (sauf erreur de chargement) | boîte centrée, inchangé |
| Import cadastre (3 étapes) | plein écran, en-tête avec étape et fermer, pied collant avec les boutons ; aperçu SVG à pleine largeur, toucher = même effet que le clic | boîte centrée, restylée |
| Actualisation IGN | feuille modale ; Échap ferme (corrige D11) | boîte, Échap ferme |
| Sélecteur de textures | plein écran, recherche en tête, grille 3 colonnes, pied Annuler/Enregistrer ; Échap ferme (corrige D11) | boîte, Échap ferme |
| Toasts | au-dessus de la barre de navigation (et non plus à 64 px du bas), largeur maximale moins 32 px | inchangé |
| Bandeau d'erreur | en haut de l'écran en `compact` (le bas est pris par la navigation), fermable | inchangé |

### 6.9 Porte et premier pas

Même contenu, même logique (`app/porte.ts`, `app/premierPas.ts`). En `compact`, les boîtes occupent
toute la largeur moins 32 px, champs de 48 px, bouton principal pleine largeur. La pastille d'état
de la plateforme garde son mot à côté de la couleur.

### 6.10 Vue 3D et visionneuse GLB

| Élément | compact | moyen | large |
|---|---|---|---|
| Canevas | plein écran sous la barre haute (plus 420 px fixes) | plein écran | hauteur `calc(100vh - barres)` au lieu de 420 px ; plein écran inchangé |
| Zoom +/−, Orbite/Déplacer/Zoom, PNG, Hauteur d'yeux | colonne flottante de boutons de 44 px à droite | idem | idem (boutons de 36 px au lieu de 30) |
| Réglages (filaire, tous les objets, opaques, textures, ombres) | feuille **Réglages 3D** (bouton ⚙ flottant) en interrupteurs | panneau flottant | bandeau au-dessus, inchangé |
| Soleil (date, semaine, heure, intensité, lumière d'appoint) | barre flottante en bas : heure en curseur pleine largeur ; date, semaine, intensité et appoint dans la feuille Réglages 3D | barre flottante | inchangé |
| Enregistrer la vue comme point de vue ; aller à un point de vue | feuille Réglages 3D | panneau | inchangé |
| Visionneuse : générer, régénérer, filaire, ombres, appoint, fond, points de vue, heure, intensité, date, semaine | mêmes emplacements que la Vue 3D ; « Générer le modèle 3D » au centre de l'état vide | idem | inchangé |
| Plein écran et Échap | sans objet en `compact` (déjà plein écran) ; le bouton reste en `moyen` et `large` | inchangé | inchangé |
| Aide | bouton ⓘ | ⓘ | texte, libellés corrigés (D10) |

Les **20 écouteurs hors registre** de la 3D et de la visionneuse (annexe D) gardent leurs
identifiants DOM : les contrôles changent de place et de forme, pas d'identité. Ils ne deviennent
pas des commandes dans cette migration (hors périmètre, §13).

---

## 7. Les champs et les tableaux sur écran tactile

### 7.1 Chaque type de champ de l'inspecteur

Le descripteur ne change pas (`src/ui/champs/types.ts`). Seul le rendu (`zones/Inspecteur.tsx`)
choisit une forme selon la classe.

| Type | large (inchangé) | compact et moyen |
|---|---|---|
| texte | `input` 100 % | ligne pleine largeur : libellé au-dessus, champ de 44 px |
| nombre | `input type=number` 92 px + unité, validé au blur ou à Entrée, Échap annule | composant `Pas` : − et + de 44 px, valeur au centre avec unité ; toucher la valeur ouvre la saisie directe (`inputmode="decimal"`) avec **les mêmes règles de brouillon** (validation à la sortie ou à Entrée, Échap annule, NaN ignoré). Chaque − ou + écrit **une** fois (un pas), avec l'historique du descripteur ; un appui maintenu répète après 400 ms, et l'historique est regroupé en un seul instantané par appui |
| case | case de 20 px | `Interrupteur` de 50 × 30 px, ligne entière cliquable |
| choix | `select` | ≤ 3 options courtes : `Segmente` ; sinon `select` natif de 44 px (le sélecteur du système est le bon au doigt) |
| couleur | `input type=color` 40 × 32 | pastille de 44 px qui ouvre le sélecteur natif |
| date | `input type=date` | `input type=date` de 44 px |
| curseur | `input type=range` + valeur | pleine largeur, pouce de 28 px, valeur à droite |
| lecture | texte | texte, pleine largeur si long |
| texture | vignette + nom + Choisir/Changer + × | vignette 44 px, nom, bouton Changer, bouton × de 44 px |
| bouton | `button.secondary.small` + explication | bouton pleine largeur de 44 px, explication dessous |
| alerte | encadré `--alerte` | identique, pleine largeur |
| hôte (`#terrasseOptimResult`) | tableau | le tableau défile horizontalement dans son hôte ; « Appliquer » garde 44 px |
| ligne (côtés, coins, points) | sous-champs en ligne | carte par côté ou par coin : Nom, puis Longueur ou Angle (`Pas`), puis Figé (`Interrupteur`) et Supprimer (bouton de 44 px) ; la surbrillance `highlightRow` reste |

Règles communes :
- **Les refus restent des refus** (`ecrire` renvoie `false`) : la valeur revient, et un message court
  apparaît sous le champ en `compact` (le toast existant pour le rectangle hors parcelle reste).
- Les champs désactivés gardent leur aide lisible en `compact` (sous le champ, pas en infobulle).
- La saisie sans perte de focus (`Inspecteur.tsx` l.7-8) reste vraie : aucun rendu ne recrée un champ
  en cours d'édition, y compris quand le clavier virtuel redimensionne la fenêtre (§9.3).

### 7.2 Tableaux

Les tableaux de 5 à 8 colonnes (BOM, débit, implantation, chantier, cotes, optimisation, PLU)
deviennent, en `compact`, des **listes de cartes** : chaque ligne est une `LigneListe` dont le titre
est la première colonne, le sous-texte les colonnes de quantité, et la valeur à droite le total ou la
colonne principale. Les **cellules éditables restent éditables** dans la carte (prix réel, prix par
barre, prix au m², prix unitaire, conditionnement, cadence, bouton ⇄, case Afficher, Supprimer). En
`moyen`, les tableaux gardent leurs colonnes et défilent horizontalement dans leur panneau ; la
première colonne est collante. En `large`, inchangé.

Ce choix ne se fait pas par table : un seul helper de rendu (`ui/tableau.ts`, nouveau) reçoit les
colonnes et les lignes et produit la table ou les cartes. `tables.ts`, `terrassePanels.ts` et
`mesurePanel.ts` passent par lui ; leur logique de calcul et leurs écouteurs ne changent pas.

### 7.3 Onglets du tiroir en compact

| Onglet | Présentation compact | Éléments éditables conservés |
|---|---|---|
| BOM | chiffres clés (lames, lambourdes, plots ou vis, total), liste des postes, puis « Débit des lames », « Débit du bois porteur et appuis », Plots ou Vis, chacun en section repliable ; pied collant : total HT, Copier le résumé, Dossier PDF | prix réel ; longueurs achetables (lames, bois, lambourdes) ; prix par barre et au m² ; prix unitaire des plots ; prix unitaire et conditionnement des vis |
| Plan de coupe | SVG à pleine largeur, zoomable au pincement | aucun |
| Implantation | échelle en `Segmente` (1/200, 1/100, 1/50, 1/20), bouton Imprimer, format papier ; SVG zoomable ; tables en cartes | échelle ; Imprimer |
| Chantier | Équipe et Heures par jour en `Pas` ; activités en cartes groupées par phase ; bilan | équipe ; heures par jour ; cadence par ligne |
| Méthode | texte, tables défilantes | aucun |
| Cotes | les boutons du panneau de mesure en pleine largeur ; liste des cotes en cartes ; Recalculer, Effacer | référence ; origine A/B ; sélection de coins ; ajouter ; ⇄ extrémité ; ⇄ mode ; afficher ; supprimer |
| PLU | bouton Interroger pleine largeur, lien Géoportail, fiche en lignes libellé/valeur | interroger |
| Résumé | bouton Générer, zone de texte pleine largeur, **bouton Copier** (nouveau, écrit dans le presse-papiers et fait un toast ; la sélection automatique reste) | générer ; copier |

---

## 8. Les infobulles au doigt

Aujourd'hui, une part de l'information vit dans `title` : raison d'une commande grisée, sens des cases
de menu, explication de la lecture seule, détail de la version, infobulles de l'explorateur et de la
palette. Au doigt, `title` ne s'affiche pas. Règle :

1. **Raison d'un refus** (permission, quota) : écrite sous le groupe de tuiles ou sous le champ, et
   dans l'annonce du lecteur d'écran ; l'appui long sur une tuile grisée la montre aussi.
2. **Sens d'une case ou d'un réglage** : texte d'aide visible sous l'entrée dans la feuille (comme
   `menuAide` aujourd'hui).
3. **Détail long** (version longue, lecture seule, lieu) : bouton ⓘ qui ouvre une petite feuille.
4. En `large`, `title` reste, et le même texte est aussi exposé par `aria-describedby`.

Un test parcourt les zones rendues en `compact` et échoue si un bouton désactivé porte un `title` de
refus sans texte visible équivalent.

---

## 9. Mécanique

### 9.1 Viewport

`index.html` gagne :

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F7F2E7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1C1610" media="(prefers-color-scheme: dark)">
```

Le zoom de la page par l'utilisateur **n'est pas interdit** (pas de `maximum-scale`) : le pincement
sur le plan reste capturé par `#stage` (`touch-action:none`), le reste de la page se zoome comme
toute page accessible. Les marges tiennent compte de `env(safe-area-inset-*)` (encoche, barre de
geste).

### 9.2 Taille du plan

`computeSize` (`boot.ts:346-360`) ne soustrait plus des largeurs de colonnes codées en dur. Il mesure
le conteneur du plan (`#stage` via `ResizeObserver`) :

- `compact` et `moyen` : largeur et hauteur de la zone visible entre les barres, sans minimum de 320 ×
  420 (le minimum devient 240 × 240) ;
- `large` : la règle actuelle (colonnes ouvertes ou repliées), inchangée ;
- une feuille ouverte **ne réduit pas** le plan (elle le recouvre) ; le cadrage « Ajuster » tient
  compte de la partie visible (au-dessus de la feuille).

Le recentrage au redimensionnement (centre conservé, 150 ms) est gardé.

### 9.3 Clavier virtuel

Quand un champ de l'inspecteur prend le focus en `compact`, la feuille passe en `plein` et fait
défiler le champ au-dessus du clavier (`visualViewport`). Le redimensionnement dû au clavier **ne
déclenche pas** `computeSize` (on filtre sur la variation de hauteur seule quand un champ a le focus),
pour ne pas redessiner le plan et perdre le focus.

### 9.4 Magasin

`app/magasin.ts` gagne trois champs immuables, lus par les zones :

| Champ | Type | Rôle |
|---|---|---|
| `classe` | `'compact' \| 'moyen' \| 'large'` | la classe courante (§4) |
| `feuille` | `null \| 'projet' \| 'outils' \| 'objets' \| 'proprietes' \| 'resultats' \| 'reglages3d' \| 'aide'` | la feuille ouverte en `compact` ; une seule à la fois |
| `hauteurFeuille` | `'apercu' \| 'mi' \| 'plein'` | sa hauteur |

`definirFeuille` ferme la précédente. La feuille ouverte n'est pas mémorisée entre deux sessions ; les
états déjà mémorisés (`plan.tiroir`) ne changent pas de sens.

### 9.5 Fichiers

| Fichier | Nature |
|---|---|
| `index.html` | viewport ; conteneurs `#zoneNavigation`, `#zoneFeuilles`, `#zoneSelection` ; les régions existantes gardent leurs identifiants |
| `src/styles/app.css` | jetons (§5.1), trois blocs `html[data-classe=…]`, suppression des `display:none` de §2.2 |
| `src/styles/jetons.ts` | valeurs des jetons, source du test de contraste |
| `src/app/classe.ts` | calcul de la classe, pose sur `<html>` et dans le magasin |
| `src/app/exposition.ts` | carte d'exposition (§3.1) |
| `src/zones/composants/*.tsx` | composants du §5.5 |
| `src/zones/icones.tsx` | jeu d'icônes |
| `src/zones/BarreNavigation.tsx`, `FeuilleSelection.tsx`, `Feuilles.tsx` | nouvelles zones de présentation (elles n'ajoutent aucune commande) |
| `src/zones/*.tsx` existants | rendu selon `classe` ; aucune logique métier nouvelle |
| `src/ui/tableau.ts` | helper table/cartes (§7.2) |
| `src/render/theme.ts` | couleurs d'écran du plan (§5.1) |
| `src/app/boot.ts` | `computeSize` (§9.2), montage des nouvelles zones |
| `tests/unit/app/exposition.test.ts`, `tests/unit/zones/*.test.tsx` | preuves du §3 |
| `scripts/captures.mjs` | captures du §3.5 |
| `.claude/skills/design-ui/SKILL.md` | jetons, classes, composants |
| `MD/spec-ihm-zones.md` | renvoi vers ce document pour la forme des zones par classe |

Le test d'architecture (`tests/unit/architecture.test.ts`) continue de garantir que le Core ne
touche pas le DOM ; il gagne une règle : `src/zones/composants/` n'importe rien d'`app/` ni de `ui/`.

---

## 10. Accessibilité

- Chaque feuille est un `role="dialog"` avec `aria-modal`, un titre (`aria-labelledby`), le focus
  piégé et rendu au bouton d'origine à la fermeture ; Échap ferme.
- La barre de navigation est un `<nav aria-label="Navigation principale">` ; le bouton de la feuille
  ouverte porte `aria-expanded`.
- Commandes segmentées : `role="radiogroup"` ou boutons `aria-pressed`, flèches gauche/droite.
- `Pas` : `role="spinbutton"` avec `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, flèches haut
  et bas au clavier.
- Contraste vérifié par test (§5.1) ; tailles de texte en `rem`, la page supporte un zoom à 200 %.
- `prefers-reduced-motion` coupe les glissements.

---

## 11. Gestes

### 11.1 Ce qui ne change pas

Les gestes de l'annexe E gardent **exactement** leur comportement en `large` et en `moyen`
(souris, stylet, doigt) : sélection, glisser de corps, de sommet, d'arête, de rayon, double-clic ou
double-tap (arête : insérer un point ; sommet : figer ; objet : reculer), molette, pincement, trois
doigts, gestes des modes Cote et Aligner, lecture seule.

### 11.2 Ce qui s'ajoute en compact

| Geste ou contrôle | Effet | Raison |
|---|---|---|
| Glisser à un doigt sur le fond | déplace la vue (comme aujourd'hui) | inchangé, rappelé ici |
| Pincement à deux doigts | zoom (inchangé) | — |
| Poignées de sommet | cible d'accroche de 44 px autour d'un rond visible de 14 px | la précision du doigt |
| Bandeau de mode | Annuler et Terminer le pointage | D3 |
| Glisser la poignée d'une feuille | change sa hauteur ; vers le bas depuis `aperçu` : ferme | — |
| Bouton Désélectionner (feuille de sélection) | vide la sélection | D12 laissé, compensé |
| Appui long sur une tuile grisée | montre la raison | §8 |

Aucun geste existant n'est retiré ni redéfini.

### 11.3 Points de fumée ajoutés (26 à 40)

| # | Geste | Attendu |
|---|---|---|
| 26 | Ouvrir sur un téléphone (390 px) | page à l'échelle 1, aucune barre de défilement horizontale, plan plein écran |
| 27 | Annuler depuis la barre haute après un glisser | le glisser est défait |
| 28 | Créer chacun des six objets depuis la feuille Outils | l'objet apparaît au centre de la partie visible, sélectionné |
| 29 | Dupliquer puis supprimer depuis la feuille Outils | la copie apparaît, puis disparaît après confirmation |
| 30 | Masquer un objet dans la feuille Objets, puis le réafficher | l'objet disparaît puis revient |
| 31 | Étiquettes et calques de terrasse depuis la feuille Objets | les étiquettes et les calques suivent les cases |
| 32 | Modifier l'entraxe au − et + dans Propriétés | le bandeau de chiffrage change à chaque pas ; un appui long fait un seul instantané d'annulation |
| 33 | Saisir une longueur de côté au clavier virtuel | le champ reste visible et garde le focus ; la valeur s'applique à la validation |
| 34 | Ouvrir Résultats › BOM, saisir un prix réel | le total réel change ; la carte reste éditable |
| 35 | Nouvelle cote : Annuler le pointage depuis le bandeau | le mode s'arrête, le glisser de la vue refonctionne |
| 36 | Ajuster à la sélection | la vue cadre l'objet dans la partie visible au-dessus de la feuille |
| 37 | Feuille Projet : Exporter › PDF avec une échelle de 1/100 | le PDF sort à 1/100 |
| 38 | Vue 3D au téléphone : heure au curseur, réglages dans la feuille | l'éclairage suit ; les cases s'appliquent |
| 39 | Passer du portrait au paysage avec la feuille Propriétés ouverte et un champ en brouillon | la classe devient `moyen`, la sélection et l'onglet restent, le brouillon n'est pas perdu |
| 40 | Thème sombre du système sur les points 26 à 39 | tout est lisible, rien n'est blanc sur blanc ni noir sur noir |

---

## 12. Ordre de mise en œuvre

Chaque étape laisse l'application utilisable dans les trois classes, garde les six empreintes, passe
`npm run typecheck`, `npm run lint`, `npm test` et `npm run cliquet`, et se note au `CHANGELOG.md`
sous une version `2.1.0-alpha.N`. À chaque étape, la carte d'exposition (§3.1) est à jour : une
étape qui déplace une commande met à jour sa ligne dans le même commit.

| Étape | Livrable | Ce qui bouge | Preuve |
|---|---|---|---|
| **M0** | Les garde-fous d'abord | `app/exposition.ts` (carte de l'existant, trois classes identiques), `exposition.test.ts`, test de la carte des champs, `scripts/captures.mjs` ; aucune modification visible | tests verts ; captures de référence `2.0.2` — **✅ 25/09/2026, `2.1.0-alpha.1`** |
| **M1** | Jetons et thème | `jetons.ts`, `app.css` (§5.1–5.3), `render/theme.ts` (écran seulement), icônes SVG ; skill `design-ui` mis à jour | test de contraste ; empreintes ; points 1 à 25 en `large` — **✅ 25/09/2026, `2.1.0-alpha.2`** |
| **M2** | Viewport et classes | `meta viewport`, `app/classe.ts`, `data-classe`, `computeSize` par mesure du conteneur, `safe-area` | point 26 ; redimensionnement sans perte de centre — **✅ 25/09/2026, `2.1.0-alpha.3`** |
| **M3** | Canevas et navigation compact | `BarreNavigation`, barre haute compacte, groupe flottant Ajuster/Grille/Nord (corrige D1), pastille d'échelle, `BandeauMode` (corrige D3), feuille de sélection | points 27, 35, 36 — **✅ 25/09/2026, `2.1.0-alpha.4`** |
| **M4** | Feuilles Outils et Objets | composant `Feuille` ; Z2 et Z3 rendus en feuille en `compact`, en rail et panneau flottant en `moyen` ; suppression des `display:none` | points 28 à 31 ; carte d'exposition pour Z2 et Z3 en `compact` et `moyen` — **✅ 25/09/2026, `2.1.0-alpha.5`** |
| **M5** | Propriétés et Résultats | Z5 en feuille et panneau ; formes tactiles des champs (§7.1) ; bandeau de chiffrage ; Z6 en feuille ; `ui/tableau.ts` ; filet d'export visible (corrige D5) | points 32 à 34 ; carte des champs identique dans les trois classes ; points 17 à 21 en `compact` — **✅ 25/09/2026, `2.1.0-alpha.6`** |
| **M6** | Dialogues, notifications, porte, premier pas | formes compactes (§6.8, §6.9) ; Échap partout (corrige D11) ; textes périmés de l'actualisation IGN (D10) | points 12, 14, 23, 24 en `compact` — **✅ 25/09/2026, `2.1.0-alpha.7`** |
| **M7** | Z1 en feuille Projet, clavier | feuille Projet ; Ctrl+S (D2) ; Ctrl+Z par le registre (D6) ; effacement de l'orthophoto sans capacité (D8) | point 37 ; carte d'exposition complète pour Z1 — **✅ 25/09/2026, `2.1.0-alpha.8`** |
| **M8** | Vue 3D et visionneuse | canevas plein écran, colonne de boutons de 44 px, feuille Réglages 3D, barre du soleil ; textes d'aide (D10) | points 22, 23, 24 et 38 — **✅ 25/09/2026, `2.1.0-alpha.9`** (scène non rendue ici : three.js vient d'un CDN que l'environnement de test ne joint pas) |
| **M9** | Recette | liste de fumée complète (40 points) dans les trois classes, en clair et en sombre ; captures ; `CHANGELOG`, `README`, `spec-ihm-zones.md` ; publication `2.1.0` | 40 × 3 points ; empreintes identiques hors numéro — **✅ 25/09/2026, `2.1.0`** : liste pilotée par `scripts/fumee.mjs`, 134 passés, 0 échec, 45 non joués (réseau) sur 179 ; cinq défauts trouvés et corrigés (voir `CHANGELOG.md`) |

Une étape ne commence pas tant que la précédente n'a pas passé ses preuves. Les étapes M3 à M8
peuvent se réordonner si le besoin le demande ; M0 à M2 non.

---

## 13. Hors périmètre, et inscrit à `DEFAUTS.md`

- **D4** : les saisies du tiroir qui ne marquent pas le projet modifié et ne s'annulent pas. À traiter
  en faisant de ces saisies des descripteurs (comme l'inspecteur), dans une étape à part : cela
  change le comportement de l'historique.
- **D7** : `3d.enregistrerPointDeVue` sans `projects.write`.
- **D9** : double-tap qui recule un objet en lecture seule.
- Les écouteurs hors registre de la 3D, de la visionneuse, du soleil et des fichiers (annexe D) ne deviennent
  pas des commandes ; la carte d'exposition les liste à part (annexe D) pour qu'aucun ne se perde.
- Une application installable (PWA, hors ligne) : possible plus tard, sans lien avec cette migration.

---

## 14. Décisions ouvertes

1. **Fontes** : embarquer Fraunces et Instrument Sans (≈ 90 Ko) ou rester sur les piles système
   (§5.2). Recommandation : piles système pour la `2.1.0`.
2. **Seuil `compact`/`moyen`** : 600 px (proposé) ou 700 px. 600 place un téléphone en paysage en
   `moyen`, ce qui donne le rail d'outils et le panneau flottant, plus confortables à cette hauteur.
3. **Feuille de sélection en `moyen`** : carte flottante (proposé) ou rien.
4. **Onglet Méthode en `compact`** : dans Résultats (proposé, comme aujourd'hui) ou seulement dans la
   feuille Projet › Aide.
5. **Désélection au toucher du vide** (D12) : laissée telle quelle (proposé) ou activée en `compact`
   seulement, au risque de désélectionner en voulant déplacer la vue.

---

## Annexe A — Carte d'exposition des 59 commandes

Légende : **N** barre de navigation ; **H** barre haute ; **FO** feuille Outils ; **FP** feuille
Projet ; **FS** feuille de sélection ; **Fl** groupe flottant du canevas ; **Pr** Propriétés
(inspecteur) ; **Ob** Objets (explorateur) ; **R:x** Résultats, onglet x ; **3D** / **Vis** vue 3D /
visionneuse ; **Rail** rail d'outils ; **Pal** palette ; **M:x** menu x ; **Surimp** surimpression ;
**⌨** clavier. La colonne « large » est l'état de la `2.0.2`, sauf correction signalée.

| Commande | Libellé | compact | moyen | large |
|---|---|---|---|---|
| `objet.annuler` | Annuler | H ; ⌨ | Rail ; ⌨ | Pal ; ⌨ (par le registre, D6) |
| `objet.ajouter.polygone` | Polygone | FO | Rail | Pal |
| `objet.ajouter.rectangle` | Rectangle | FO | Rail | Pal |
| `objet.ajouter.chemin` | Chemin | FO | Rail | Pal |
| `objet.ajouter.cercle` | Cercle | FO | Rail | Pal |
| `objet.ajouter.parasol` | Parasol | FO | Rail | Pal |
| `objet.ajouter.pointDeVue` | Point de vue | FO | Rail | Pal |
| `objet.dupliquer` | Dupliquer | FO ; FS | Rail | Pal |
| `objet.supprimer` | Supprimer | FO ; FS | Rail | Pal |
| `objet.reculer` | Reculer d'un plan | FO | Rail | Pal |
| `objet.positionInitiale` | Réinitialiser la position | FO ; Pr (pied) | Rail ; Pr | Pal ; Pr |
| `objet.aligner` | Aligner par rotation | FO ; Pr (section Alignement) | Rail ; Pr | Pal ; Pr |
| `projet.reinitialiser` | Réinitialiser tout | Pr (pied) | Pr | Pr |
| `projet.nouveau` | Nouveau projet | FP › Fichier | M:Fichier | M:Fichier |
| `projet.enregistrer` | Enregistrer | FP ; H (statut) ; ⌨ | M:Fichier ; H ; ⌨ | M:Fichier ; bouton ; ⌨ (D2) |
| `projet.supprimer` | Supprimer le projet | FP › Fichier | M:Fichier | M:Fichier |
| `projet.depuisAdresse` | Nouveau plan depuis une adresse | FP › Fichier ; premier pas | M:Fichier ; premier pas | M:Fichier ; premier pas |
| `projet.actualiserIgn` | Actualiser depuis l'IGN | FP › Fichier | M:Fichier | M:Fichier |
| `affichage.nord` | Flèche Nord | Fl ; FP › Affichage | Fl ; M:Affichage | M:Affichage |
| `affichage.voisinage` | Voisinage | Ob ; FP › Affichage | Ob ; M:Affichage | Ob ; M:Affichage |
| `affichage.grille` | Grille | Fl ; FP › Affichage | Fl ; M:Affichage | Surimp ; M:Affichage |
| `affichage.orthophoto` | Fond orthophoto | FP › Affichage | M:Affichage | M:Affichage (effacée sans capacité, D8) |
| `affichage.orthoOpacite` | Opacité de la photo | FP › Affichage | M:Affichage | M:Affichage |
| `affichage.orthoParcelleOpacite` | Remplissage de la parcelle | FP › Affichage | M:Affichage | M:Affichage |
| `affichage.orthoParcelleDefaut` | Remplissage conseillé | FP › Affichage | M:Affichage | M:Affichage |
| `vue.ajuster` | Ajuster à la sélection | Fl | Fl | Surimp (rendue visible, D1) |
| `vue.plan` | Plan | segmenté du plan | segmenté H | segmenté H |
| `vue.3d` | Vue 3D | segmenté du plan | segmenté H | segmenté H |
| `vue.visionneuse` | Visionneuse GLB | segmenté du plan | segmenté H | segmenté H |
| `mesure.recalculer` | Recalculer les mesures | R:Cotes | R:Cotes | R:Cotes |
| `mesure.effacer` | Effacer les mesures | R:Cotes | R:Cotes | R:Cotes |
| `mesure.nouvelle` | Nouvelle cote | N (Coter) ; FO | Rail | Pal |
| `plu.interroger` | Interroger le Géoportail | R:PLU | R:PLU | R:PLU |
| `terrasse.optimisation` | Optimisation des paramètres | Pr (section Optimisation) | Pr | Pr |
| `fichier.importerSvg` | Importer un SVG | FP › Fichier | M:Fichier | M:Fichier |
| `fichier.exporterJson` | Exporter le projet (JSON) | FP › Fichier | M:Fichier | M:Fichier |
| `fichier.importerJson` | Importer un projet (JSON) | FP › Fichier | M:Fichier | M:Fichier |
| `export.svg` | SVG | FP › Exporter ; H (⭳) | M:Exporter | M:Exporter |
| `export.png` | PNG | FP › Exporter | M:Exporter | M:Exporter |
| `export.resume` | Résumé à copier | FP › Exporter ; R:Résumé | M:Exporter ; R:Résumé | M:Exporter ; R:Résumé |
| `export.dxf` | DXF | FP › Exporter | M:Exporter | M:Exporter |
| `export.pdf` | PDF du plan | FP › Exporter | M:Exporter | M:Exporter |
| `export.dossier` | Dossier PDF des terrasses | FP › Exporter ; R:BOM (pied) | M:Exporter | M:Exporter |
| `export.glb` | GLB | FP › Exporter | M:Exporter | M:Exporter |
| `3d.zoomAvant` | Zoom avant | 3D (colonne) | 3D | 3D |
| `3d.zoomArriere` | Zoom arrière | 3D (colonne) | 3D | 3D |
| `3d.modeOrbite` | Orbite | 3D (colonne) | 3D | 3D |
| `3d.modeDeplacement` | Déplacement | 3D (colonne) | 3D | 3D |
| `3d.modeZoom` | Zoom | 3D (colonne) | 3D | 3D |
| `3d.hauteurDesYeux` | Hauteur des yeux | 3D (colonne) | 3D | 3D |
| `3d.enregistrerPng` | Enregistrer en PNG | 3D (colonne) | 3D | 3D |
| `3d.enregistrerPointDeVue` | Enregistrer la vue | 3D › Réglages | 3D | 3D |
| `3d.pleinePage` | Plein écran | sans objet : la vue est déjà plein écran | sans objet (idem, précisé à l'étape M8) | 3D |
| `visionneuse.generer` | Générer le modèle 3D | Vis (état vide) | Vis | Vis |
| `visionneuse.regenerer` | Régénérer depuis le plan | Vis › Réglages | Vis | Vis |
| `visionneuse.zoomAvant` | Zoom avant | Vis (colonne) | Vis | Vis |
| `visionneuse.zoomArriere` | Zoom arrière | Vis (colonne) | Vis | Vis |
| `visionneuse.hauteurDesYeux` | Hauteur des yeux | Vis (colonne) | Vis | Vis |
| `visionneuse.pleinePage` | Plein écran | sans objet, comme `3d.pleinePage` | sans objet | Vis |

Actions hors registre de Z1, à conserver aussi : sélecteur de projet (`projet.ouvrir`), Aide ›
Méthode de calcul, Aide › Version, « Mes projets », « Se déconnecter ». En `compact` : FP.

Pour `3d.pleinePage` et `visionneuse.pleinePage`, la carte accepte en `compact` l'emplacement
`sansObjet`, avec une justification écrite dans le fichier ; c'est la seule dérogation admise, et le
test la limite à ces deux commandes.

## Annexe B — Inspecteur : sections et champs conservés

Les 14 sections, dans cet ordre, avec leur condition, sont conservées telles quelles dans les trois
classes. Les clés entre crochets sont des lectures, alertes, boutons ou hôtes.

| # | Section | Condition | Champs (clés) |
|---|---|---|---|
| 1 | Objet | toujours | name, [type], fonction (13 valeurs), priority, matiere, [elevationTerrasse], elevation, [surface], [longueur], width, curve, r, locked, rectangle |
| 2 | Parcelle | parcelle ou terrain | [lieu], [cadastre] |
| 2 bis | Clôture · Portails et portillons (famille Construction) | parcelle du projet | active, hauteurMaxRue, hauteurMaxSeparative, un côté par ligne, type et champs du type, soubassement ; accès par ligne, côté, position, dimensions, ouverture, forme, remplissage, matériau, piliers, retrait, ouvert (`MD/spec-cloture.md` §3) |
| 3 | Apparence | toujours | fill, textureVerticale, textureHorizontale (avec « appliquer à tous les chemins »), diametreArbre, couleurArbre, textureArbre |
| 4 | Parasol | parasol (cercle) | terrasseLieeKey, hauteurParasol, matSurPerimetre, matDeporte, matAngleDeg, ombreDate, ombreHeure, ombreAffichee, carteAffichee, [placerAuMieux] |
| 5 | Point de vue | caméra (chemin) | altitude, direction, [aller] |
| 6 | Côtés / Points et segments | polygone ou chemin, hors point de vue ; repliée | point{i} (nom, supprimer) ; cote{i} (nom, longueur, supprimer) |
| 7 | Coins | polygone ; repliée | coin{i} (nom, angle, figé, supprimer) |
| 8 | Alignement par rotation | polygone ou chemin ; repliée | [choisir], [info], distance, [aligner] |
| 9 | Fondation et appuis | terrasse | typePose, hauteurVis, depassementVis, hauteurPlot, plotModele, plotAvecSolives, supportType, supportDecaissement, plotSurfaceAssise, chargeNormale, chargeSpa, visModeAuto, plotEntraxeAuto, visEntraxe, plotEntraxe, [chargeParPlot], visEntraxeZoneSpa, visMargeZoneSpa, [alerteEquipement], [alertePlot], [alerteVis] |
| 10 | Structure porteuse | terrasse | soliveEntraxe, soliveSection, avecLambourde, lambourdeSection, lambourdeEntraxe |
| 11 | Lames et sens de pose | terrasse | segmentReference, sensPose, essenceBois, coefRaideurLame, largeurLame, epaisseurLame |
| 12 | Finitions du tour | terrasse | avecLameRive, hauteurLameRive, avecLamePlat |
| 13 | Optimisation | terrasse | [optimiser], [resultat] (hôte `#terrasseOptimResult`, avec « Appliquer ») |
| 14 | Paramètres de calcul | terrasse ; repliée | kPortee, kEntraxeLame, [chargeRef], jeuLames, [longueurs], jointsBoisSurAppui, chuteMinReutilisable, jointsSurAppui, epaisseurLameRive, [raideurs], [sections], [bornesPortee], [bornesEntraxe], [fusion], [axeCadre], [plafondPlots], [domainePlots], [prixPlots], [courseVis], [prixVis] |

Soit 38 descripteurs de `Construction`, et 16 clés réglées ailleurs (10 dans BOM, 3 dans Chantier,
1 dans Implantation, 2 dans la Vue 3D), toutes conservées à leur emplacement. En-tête (titre qui
replie tout), pied (Réinitialiser la position, Réinitialiser tout, aide aux gestes), sélecteur de
textures, refus (width, r, rectangle, longueur, angle), brouillon des nombres : conservés (§7.1).

## Annexe C — Résultats : onglets et éléments conservés

| Onglet | Condition | Éléments |
|---|---|---|
| BOM | terrasse sélectionnée | table Poste/Qté/Prix bas/Prix haut/Prix réel ; totaux estimé et réel ; note sur les prix ; Débit des lames (longueurs achetables, table Longueur/Qté/Métré/Prix par barre/Prix au m²/Total/Usage, bilans) ; Débit du bois porteur et appuis (par section) ; Plots (modèle, prix unitaire, à acheter) ou Vis (prix unitaire, conditionnement, à acheter) |
| Plan de coupe | terrasse | SVG étiqueté |
| Implantation | terrasse | échelle (1/200, 1/100, 1/50, 1/20), Imprimer, format papier, SVG, contrôle d'équerrage, implantation pièce par pièce, sommets du contour |
| Chantier | terrasse | équipe, heures par jour, activités par phase avec cadence, bilan, comparaison vis/plots |
| Méthode | terrasse | dix sections de texte et tables |
| Cotes | toujours | choisir la référence, référence, origine A/B, sélectionner des coins, points sélectionnés, ajouter, table des cotes (⇄ extrémité, ⇄ mode, afficher, supprimer), recalculer, effacer, aides |
| PLU | toujours | interroger, lien Géoportail, point interrogé, fiche (commune, zones, libellé, approbation, règlement, document, prescriptions, informations, SPR, servitudes, document d'urbanisme, tous les documents, date), avertissement |
| Résumé | toujours | générer, zone de texte (reçoit aussi SVG et DXF), copier (nouveau) |

Règles conservées : onglets de terrasse seulement avec une terrasse sélectionnée ; repli sur Cotes ;
rafraîchissement à l'ouverture ; hauteur mémorisée `plan.tiroir` en `moyen` et `large`.

## Annexe D — Écouteurs hors registre conservés

Ils gardent leur identifiant DOM ; seule leur place change (§6.10).

| Groupe | Identifiants |
|---|---|
| Vue 3D | `terrasse3dFilaire`, `terrasse3dAllObjects`, `terrasse3dObjectsOpaque`, `terrasse3dTextures`, `terrasse3dShadows`, `terrasse3dViewSelect`, `vue3dDate`, `vue3dSemaine`, `vue3dHeure`, `vue3dIntensite`, `vue3dLumiereAppoint` |
| Visionneuse | `glbViewerFilaire`, `glbViewerShadows`, `glbViewerFond`, `glbViewerViewSelect`, `glbViewerDate`, `glbViewerSemaine`, `glbViewerHeure`, `glbViewerIntensite`, `glbViewerLumiereAppoint` |
| Fichiers | `importSvgFile`, `importJsonFile` ; cases lues à l'action : `chkReplaceOnImport`, `chkJsonRemplace`, `chkExportSansParcelle`, `chkDossierEquipements`, `pdfScaleInput` |
| Globaux | erreurs et promesses rejetées (bandeau), `resize` (plan, 3D), pointeur du plan (`pointermove`, `pointerleave`), gestes (`pointeur.ts`) |
| Panneaux | mesure (`mesurePanel.ts`), terrasse et tables (`terrassePanels.ts`, `tables.ts`), dialogues impératifs (`cadastreDialog.ts`, `projectBar.ts`, `texturePicker.ts`, `shell/dialogs.ts`) |
| Z1 hors registre | `projectSelect`, Aide › Méthode, Aide › Version, Mes projets, Se déconnecter, fermeture des menus |

Un test vérifie que chacun de ces identifiants existe toujours dans le DOM monté, dans chaque classe.

## Annexe E — Gestes conservés

Sélection au clic ou au toucher ; désélection par reclic sur l'objet sélectionné ; glisser du corps
(refusé si verrouillé ou en lecture seule, borné à la parcelle si contraint) ; glisser d'un sommet
(coin figé, voisin figé, mode rectangle) ; glisser d'une arête ; poignée de rayon (≥ 0,15 m) ;
double-clic ou double-tap sur une arête (insère un point, sauf point de vue) ; double-clic sur un
sommet (figer ou libérer) ; double-clic sur un objet (reculer d'un plan) ; double-tap sur un autre
élément du même objet (reculer) ; glisser du fond à la souris ou à un doigt (déplacer la vue) ;
molette (zoom ×1,1, 6 à 220 px/m) ; pincement (zoom centré) ; trois doigts (déplacer) ; blocage des
gestes natifs sur `#stage` ; clic droit (comme aujourd'hui) ; mode Cote `ref` et `target` ; mode
Aligner ; lecture seule ; Échap (menus, dialogues, import cadastre, invite, plein écran — plus, après
migration, pointages, actualisation IGN, textures, feuilles) ; Ctrl/Cmd+Z ; Ctrl+S (après M7) ; en
3D, glisser, molette, clic droit, glisser-zoom.

## Annexe F — Dialogues et écrans conservés

Confirmations (supprimer un objet, supprimer le projet, import cadastre avec modifications, changer
de projet, tout réinitialiser, effacer les mesures, se déconnecter) ; invite (nom du nouveau projet) ;
erreur de chargement (Réessayer) ; import cadastre en trois étapes avec toutes ses cases, listes,
aperçus et messages ; actualisation IGN (parcelle seule ou tout l'IGN, parcelles adjacentes, bâti,
haies et végétation, arbres estimés) ; sélecteur de textures (recherche, grille, aperçu, case
« appliquer à tous », Enregistrer) ; toasts ; bandeau d'erreur ; porte (formulaire, pastille de la
plateforme, refus, compte sans Plan, panne, session perdue) ; premier pas (choix, impasse).
