---
name: regles-toits
description: Traiter un fichier de promenade (audit-….json) de bout en bout pour les toits — rejouer chaque cas, le classer (hors toit, fait, réglage, règle, question), écrire le fait ou le réglage, images avant et après, PR. Tient regles/toits/faits.json (faits par bâtiment, en contrainte ou en remplacement) et compte les faits par forme. Cherche aussi des cas candidats sur les photos de rue Panoramax d'un village (Claude analyste, statut propose, scripts/candidats.ts). À charger quand l'utilisateur fournit un fichier de promenade, demande d'ajouter un fait sur un bâtiment, demande des cas candidats pour une forme, ou avant de toucher à regles/toits/faits.json, model/faitsToits.ts, facade/faitsToits.ts, model/casCandidats.ts ou app/candidatsPanoramax.ts. S'appuie sur le skill toits.
---

# Règles des toits : d'une promenade à la PR

La référence est `MD/spec-regles-toits.md` (§1 : fait, réglage, règle ; §5 : les faits ; §7 :
l'observation ; §8 : le corpus ; §9 : dans le logiciel ; §10 : ce skill). **Charger d'abord le skill
`toits`** : ses règles, ses seuils, ses pièges et ses scripts (`banc.ts`, `rendu.py`, `diag.ts`,
`audit.ts`, `identite.ts`) sont la boîte à outils de celui-ci.

## 0. Ce que ce skill ne fait jamais

- **Coder un bâtiment dans une règle.** Un `if (cleabs === …)` est un fait : il va dans
  `regles/toits/faits.json`.
- **Changer un cas `valide` sans le dire.** Un cas validé qui bouge se montre dans la PR, avec une ligne
  d'`historique`, et attend le « validé » de l'utilisateur.
- **Toucher à AE 101** (2 allée des Limites, Le Vésinet) :
  `npx tsx .claude/skills/toits/scripts/identite.ts` doit afficher « AE 101 : corps identiques ».
- **Écrire un fait que personne n'a vu.** Un fait est une observation (fiche d'audit, photo), pas
  une hypothèse pour faire passer un cas. Sans observation, le cas reste `a_corriger`.

## 1. Les trois niveaux, et où ils vivent

| Niveau | Quand | Où | Effet |
|---|---|---|---|
| **Fait** | l'exception est propre à ce bâtiment, ou la mesure ne peut pas trancher | `regles/toits/faits.json`, par clé BD TOPO (`cleabs`) | ce bâtiment seul, dans tous les projets |
| **Réglage** | un seuil existant est mal placé pour ce cas **et** ses semblables | `regles/toits/reglages.json` | tous les bâtiments |
| **Règle** | rien d'existant ne décrit ce que l'on voit (Mansart, lucarne) | code TypeScript, seuil nommé dans `reglages.json`, commentaire qui cite le cas | tous les bâtiments |

Plus deux sorties qui ne touchent pas au calcul des toits :
- **hors toit** : contour faux, bâtiment démoli ou absent, couleur des murs, ouvertures. Signalement
  à l'IGN, ou autre chantier (skill `facades`, couleur des murs) ;
- **question** : un doute que seule la personne peut lever (le modèle : la question « à cheval »,
  `app/toitsACheval.ts`). On pose une question précise plutôt que d'ajouter un seuil.

## 2. Le déroulé, pour un fichier de promenade

```bash
# 0. Le fichier se range tel quel dans le corpus (seuls statut, attendu, historique, correction changent ensuite)
cp ~/audit-2026-10-13-0905-le-vesinet.json tests/fixtures/audit/
# 1. Premier tri : niveau suggere par probleme, seuils en jeu, fait existant, squelette de fait
npx tsx .claude/skills/regles-toits/scripts/trier.ts tests/fixtures/audit/audit-2026-10-13-0905-le-vesinet.json
# 2. Rejeu et cartes AVANT (code courant)
TOITS_DOSSIER=/tmp/toits/avant npx tsx .claude/skills/toits/scripts/audit.ts tests/fixtures/audit/audit-….json
TOITS_DOSSIER=/tmp/toits/avant python3 .claude/skills/toits/scripts/rendu.py --montage planche.png bati-<cle> bati-<cle>-terrain
```

Pour **chaque cas** :

1. **Rejouer et regarder.** La carte des hauteurs et les corps (`rendu.py`), la fiche (problèmes
   cochés, note), et les photos du cas : elles sont dans le fichier de promenade, en base64, avec
   leur prise de vue (`constat.photos[i].prise` : position, azimut, inclinaison). Extraire une photo
   pour la lire avec l'outil Read :
   ```bash
   node -e 'const f=require(process.argv[1]);const c=f.cas.find(x=>x.id===process.argv[2]);require("fs").writeFileSync("/tmp/toits/photo.jpg",Buffer.from(c.constat.photos[0].base64,"base64"))' ./audit-….json c2
   ```
   Pour une vue 3D depuis la position de la photo : `village.mjs` du skill `toits` (§6, `VUES`), en
   coordonnées du plan.
2. **Classer**, dans cet ordre, et écrire pourquoi en une phrase (elle ira dans la PR) :
   1. hors toit ? (contour décalé ou faux, démoli ; couleur, matériau, fenêtres) ;
   2. fait ? (propre à ce bâtiment ; demi-croupe, élément invisible au LiDAR ; mesure trompeuse) ;
   3. réglage ? Vérifier sur le banc que **les semblables** le confirment (§4) : un seuil qui
      n'arrange que ce cas est un fait déguisé ;
   4. règle ? Rien d'existant ne décrit ce que l'on voit ; écrire la règle comme un couvreur, seuil
      nommé, commentaire qui cite le cas ;
   5. question ? Le doute dépend d'un fait que seule la personne connaît.
3. **Écrire l'attendu** (`attendu` du cas, §7 de la spec) depuis l'observation de la fiche : on
   n'écrit que ce que l'on a **vu**.
4. **Rejouer tout le corpus et le banc** (§4), lister ce qui change, visé ou non.
5. **Ouvrir la PR** (§5).

## 3. Écrire un fait : `regles/toits/faits.json`

```json
{
  "format": "plan-faits-toits",
  "version": 1,
  "faits": {
    "BATIMENT0000000322509199": {
      "observation": {
        "forme": "deux-pans",
        "faitage": { "par": "azimut", "azimutDeg": 20, "toleranceDeg": 15 },
        "bouts": ["pignon", "pignon"],
        "corps": { "min": 1, "max": 1 }
      },
      "application": "contrainte",
      "preuve": { "promenade": "audit-2026-10-13-0905-le-vesinet.json", "cas": "c2", "photo": true },
      "adresse": "16 boulevard de Belgique, 78110 Le Vésinet",
      "historique": [{ "t": "2026-10-14", "texte": "observé sur le terrain, validé" }]
    }
  }
}
```

Le vocabulaire est fermé (`model/faitsToits.ts::lireFaitsToits` refuse le reste, avec un message) :

| Champ | Valeurs | Ce que le calcul en fait |
|---|---|---|
| `forme` | `plat`, `appentis`, `deux-pans`, `croupes` (= `quatre-pans`), ou une liste admise | le **corps principal** (le plus grand) prend une des formes admises |
| `faitage` | `{ par: "long", sens: "parallele" \| "perpendiculaire" }` ou `{ par: "azimut", azimutDeg }`, `toleranceDeg` (15 par défaut) | le faîtage du corps principal dans ce sens ; un plat n'a pas de faîtage, il est écarté |
| `bouts` | deux parmi `pignon`, `croupe` | deux pignons : un deux-pans ; une croupe : des croupes, du bon côté |
| `corps` | `{ min, max }` | `max` est tenu (un seul corps sur un contour presque rectangulaire, sinon les plus grands étendus sur le contour) ; `min` est seulement **dit** |
| `egout`, `faitageM` | `{ min, max }` en mètres | trient les candidats quand l'un d'eux les tient ; la mesure décide sinon |
| `application` | `contrainte` (défaut), `remplacement` | voir ci-dessous |
| `dimensions` | `{ egoutM, faitageM, hautVersDeg }` | **remplacement seulement** : les hauteurs, et le côté haut d'un appentis |
| `appentis` | `[{ facade: { azimutDeg, toleranceDeg? }, longueur: "toute", profondeurM?, egoutM?, hautM? }]` | **ajoute** un appentis adossé (porche, galerie, auvent) que le contour ne contient pas, contre la façade dont la normale sortante regarde vers `azimutDeg` (180 : la façade sud ; 45° de tolérance) : un seul pan sur tout le côté du corps, cotes absentes lues sur la grille brute du MNH, données l'emportant ; rien n'est fabriqué sans mesure ni cotes (spec §5.1) |

- **Une façade se nomme par sa normale** : « la façade sud » s'écrit `facade: { azimutDeg: 180 }`,
  même si la maison est tournée (AE 101 : façade à 164°) ; c'est le côté d'un corps en façade du
  contour, le plus long s'il y en a plusieurs.
- **La rue n'est pas dans le calcul** : un faîtage « perpendiculaire à la rue » s'écrit en azimut
  (0 = nord, sens horaire, modulo 180). La photo prise face à la façade donne la direction : son
  `azimutDeg` est perpendiculaire à la façade, donc **parallèle** à un faîtage perpendiculaire à la
  rue. L'azimut d'un faîtage parallèle à la rue est celui de la photo + 90.
- **Contrainte** (par défaut) : le corps principal qui ne dit pas ce que l'on a vu est relu sur la
  mesure parmi les seules formes et le seul sens admis ; la mesure donne les hauteurs. Un corps déjà
  d'accord ne bouge pas. Puis les garde-fous de vraisemblance (spec §9.1). Une forme que la mesure ne
  lit pas n'est pas fabriquée : le corps reste, et `ecartsAuFait` le dit (`audit.ts` : « non tenu »).
- **Remplacement** : un corps sur la boîte orientée du contour, aux dimensions du fait, sans lecture
  ni garde-fou, LiDAR ou pas. À réserver aux bâtiments sans LiDAR ou à mesure trompeuse (houppier
  au-dessus du toit, mesure d'avant une surélévation).
- Un fait vaut **dans tous les projets** qui contiennent le bâtiment (décision D14 : les faits du
  dépôt sont communs ; les corrections d'un utilisateur restent dans son projet).
- **Version de lecture** : l'empreinte des faits entre dans `VERSION_LECTURE_TOITS`. Un fait ajouté
  ou changé demande une ligne `{ version: n + 1, reglages, faits }` dans `LECTURES_TOITS`
  (`app/toitsLidar.ts`) ; `faits.ts` l'écrit, et `tests/unit/model/reglagesToits.test.ts` la
  réclame. Tous les toits déjà lus seront relus : **grouper les faits d'une promenade dans une PR**.
  La preuve, l'adresse et l'historique n'entrent pas dans l'empreinte.

```bash
npx tsx .claude/skills/regles-toits/scripts/faits.ts            # compte par forme, ligne de LECTURES_TOITS
npx tsx .claude/skills/regles-toits/scripts/faits.ts /tmp/faits-proposes.json
```

**Plus de cinq faits qui disent la même chose** (`FAITS_SEMBLABLES_MAX`, même forme, même sens par
rapport au long côté, mêmes bouts) : `faits.ts` le signale et sort en erreur. Un réglage ou une règle
se cache derrière : chercher la caractéristique mesurable commune (région, hauteur, matériau,
mitoyenneté : un **profil**, spec §6), essayer le réglage sur le banc, et retirer les faits qu'il rend
inutiles.

## 4. Vérifier : corpus, banc, AE 101

```bash
npx tsx .claude/skills/toits/scripts/identite.ts                       # AE 101 : corps identiques
npx tsx .claude/skills/toits/scripts/audit.ts tests/fixtures/audit/     # aucun cas valide qui bouge
TOITS_DOSSIER=/tmp/toits/apres npx tsx .claude/skills/toits/scripts/audit.ts --faits /tmp/faits-proposes.json tests/fixtures/audit/audit-….json
npx tsx .claude/skills/toits/scripts/banc.ts hucqueliers > /tmp/toits/banc-hucqueliers-apres.txt   # pour un reglage ou une regle
npx vitest run tests/unit/facade/audit.test.ts tests/unit/facade/faitsToits.test.ts tests/unit/model/faitsToits.test.ts
```

- `audit.ts --faits` rejoue avec les faits proposés **sans toucher au dépôt** : ce sont les cartes
  d'après. Mettre `TOITS_DOSSIER` différent avant et après, puis `rendu.py --montage` sur les deux
  (copier `q/bati-<cle>.json` d'après sous une autre clé, `bati-<cle>-apres`).
- Un fait ne change que son bâtiment : le banc des villages ne bouge pas. Un réglage ou une règle :
  banc avant et après, `diff` des listes, et les cartes de **chaque** bâtiment qui change.
- Essayer un fait sur un vrai projet, dans l'application : ouvrir le projet avec `?regles=local`
  (administrateur), menu Admin › « Essayer des faits de toits… », choisir le fichier proposé. Les
  toits touchés se relisent en tâche de fond ; rien n'est enregistré, et à la prochaine ouverture ils
  sont relus avec les faits livrés. Seuls les faits s'essaient ainsi (les réglages sont lus au
  chargement du code).

## 5. La PR

Une PR par promenade (ou par règle). Pour chaque cas touché :
- la photo (ou sa description si elle ne peut pas être jointe), la carte et la vue 3D, **avant et
  après** ;
- le niveau choisi et pourquoi, en une phrase ; pour un réglage, les semblables qui le confirment ;
- les cas `valide` dont le résultat change, visés ou non (aucun, idéalement), avec la ligne
  d'`historique` proposée ;
- le tableau du banc (réglage ou règle), AE 101 identique, empreintes golden inchangées ;
- la sortie de `faits.ts` (comptes par forme, ligne de `LECTURES_TOITS`).

Le statut d'un cas passe à `corrige` dans la PR (avec `attendu` et `correction: { commit, regle }`),
puis à `valide` quand l'utilisateur répond « validé ». Le CHANGELOG le dit (« les toits déjà lus
seront relus à l'ouverture » quand `LECTURES_TOITS` gagne une ligne).

## 6. Exemple : le premier passage (lot L20)

Le corpus compte deux fichiers reconstitués (`tests/fixtures/audit/`). Leur traitement :

| Cas | Problème | Tri | Pourquoi |
|---|---|---|---|
| Le Vésinet c1 (AE 101) | aucun | référence, `valide` | la maison de référence ; son attendu est son calcul au centimètre |
| Hucqueliers c1 (37248484, `BATIMENT0000000349542179`) | `toit.morceaux` | **règle** | les ailes du pavillon est restent recoupées en bandes : c'est le chantier ouvert du skill `toits` (§9 : ajuster une aile sur sa seule partie propre). Aucun seuil ne le corrige sans abîmer ses semblables (les bandes recouvertes d'Hucqueliers), et un fait « un seul corps » serait faux : la carte montre une longère à plusieurs corps (essai `--faits` avec `corps.max = 1` : un seul toit à 7 m couvre les deux pavillons hauts). Reste `a_corriger`. |

Aucun fait n'a donc été ajouté à ce passage : la version de lecture est restée 1.

## 7. Le premier fait : la galerie d'AE 101 (14 octobre 2026)

Le propriétaire d'AE 101 a vu sur place un appentis (galerie couverte, maison de style colonial
américain) sur toute la façade sud, avec un décroché en plan d'environ 50 cm au milieu. **Fait**,
pas réglage ni règle : rien de mesurable ne distingue ce porche d'une bande de jardin hors du contour
BD TOPO, et l'utilisateur l'a vu. Le vocabulaire a gagné `appentis` (spec §5.1) ; les cotes sont lues
sur le LiDAR (1,25 m, 3,2 m contre le mur, égout 2,4 m) ; un seul pan, le décroché étant plus petit
que `SEUIL_DECROCHE_M` et à moitié sous un arbre sur la mesure. L'utilisateur a accepté que la
référence d'AE 101 change une fois : `corps` de `tests/fixtures/toits/vesinet-ae101.json` reste le
calcul (identique), `corpsAvecFaits` est la nouvelle référence (`identite.ts` vérifie les deux), et le
cas c1 du corpus a pris la clé BD TOPO et l'appentis dans son attendu, avec une ligne d'historique.
Lecture 2 (`LECTURES_TOITS`). Images : `MD/images/toits/ae101-appentis-cartes.png` et `-3d.jpg`.

## 8. Cas candidats Panoramax : observer sans marcher (lot G3 bis)

Avant d'écrire la règle d'une forme (vague 3b : lucarnes, Mansart, demi-croupes…), il faut des
bâtiments qui l'ont. `scripts/candidats.ts` les cherche sur les photos de rue Panoramax d'un village
(spec §13.3 phase 4 et §14.5, usage 3 de Claude analyste) et les écrit au statut **`propose`** dans
le corpus, `tests/fixtures/toits/candidats/<village>.json`. **Rien ne s'applique au calcul** : un
candidat n'est ni un fait, ni un attendu de test, tant que vous ne l'avez pas trié sur ses photos.

```bash
# 0. Le village, relevé comme d'habitude (skill toits, §6) : village.mjs écrit aussi l'origine du repère
NODE_PATH=$(npm root -g) node .claude/skills/toits/scripts/village.mjs "Place du Marché Notre-Dame 78000 Versailles" 100 versailles
# 1. Essai à blanc, gratuit : quels bâtiments ont une photo de leur toit, combien de requêtes
npx tsx .claude/skills/regles-toits/scripts/candidats.ts versailles --essai
# 2. Pour de vrai : trois passes de Claude par bâtiment, par le serveur de Plan (batch, moitié prix)
PLAN_ADMIN_MOT_DE_PASSE=… npx tsx .claude/skills/regles-toits/scripts/candidats.ts versailles \
  --serveur https://www.raillard.org/plan --formes mansart,gambrel,lucarnes --max 60
```

- **Les photos** : la recherche Panoramax autour du village (250 m au plus), puis, pour chaque
  bâtiment, les photos qui voient un de ses murs (`render/couleurMurPhoto.ts::mursVisibles` : de
  face, à moins de 40 m, sans autre bâtiment entre deux), avec au moins 8 m de recul et le faîte
  dans le cadre ; deux par bâtiment, les plus proches et de face d'abord
  (`app/candidatsPanoramax.ts`). L'étiquette de chaque image dit où est le bâtiment visé
  (« à 31 % de la largeur depuis la gauche ») : le reste de l'image est le voisinage.
- **Claude** : les routes de l'analyse (`deploy/analyse.php`), sous l'usage **`candidats`** : le
  prompt et le schéma de l'analyse d'une maison, les plafonds par organisation, le journal (le coût
  se lit à part dans « Consommation »). Trois passes identiques et le vote du lot L17
  (`model/analyseClaude.ts::voter`), puis le contrôle croisé avec les indices LiDAR de la grille du
  village (`contradictionsLidar`). `--immediat` : l'appel immédiat, au tarif normal, bâtiment par
  bâtiment. Connexion : `PLAN_ADMIN_MOT_DE_PASSE` (session admin) ou `PLAN_JETON` (plateforme).
- **Un candidat** (`model/casCandidats.ts`) : la forme visée dans le vocabulaire du modèle de toit
  (lot G1 : `Toit.forme`, types de `ProfilPan`, de `BoutToit`, de `Lucarne`, sans cotes : une photo
  n'en donne pas), seulement ce que la majorité des passes affirme ; pourquoi il est candidat
  (`visees` : sa forme du catalogue, des demi-croupes ou des brisis aux bouts, un profil brisé, des
  lucarnes) ; le vote résumé (accord par attribut, confiance, contradictions LiDAR) ; les photos
  (lien `hd`, date, auteur, licence) ; la source (modèle, versions du prompt et du schéma, jour).
  Les plus sûrs d'abord : sans contradiction, la forme à l'unanimité, la confiance.
- **Trier** : ouvrir les photos de chaque candidat, passer `statut` à `valide` (la forme est bien
  là) ou `sans_suite`, avec une ligne d'`historique`. Un candidat trié n'est **jamais** réécrit, et
  son bâtiment n'est plus renvoyé à Claude ; un candidat `propose` est remplacé à la relecture de son
  bâtiment. Un candidat `valide` devient un cas du corpus de la forme quand sa règle s'écrit (G4 à
  G9) : on relève alors le bâtiment, et l'attendu s'écrit avec le vocabulaire du §3.
- **Coût** (spec §14.4) : ~0,004 $ par bâtiment en appel immédiat, la moitié en batch ; un village
  de 60 bâtiments photographiés se compte en dizaines de centimes. Le script affiche le coût réel à
  la fin (celui que le serveur calcule avec sa table des tarifs).
- Un ancien fichier de village n'a pas l'origine du repère : relancer `village.mjs`, ou donner
  `--origine lat,lon` (l'origine du cadastre de la parcelle du projet, pas l'adresse).
- Tests sans réseau : `tests/unit/model/casCandidats.test.ts`, `tests/unit/app/candidatsPanoramax.test.ts`
  (serveur Node et API Anthropic simulée, `tests/fixtures/deploy/fauxAnthropic.ts`, recherche
  Panoramax figée, `tests/fixtures/candidats/village.ts`) et `tests/unit/deploy/analysePhpCandidats.test.ts`
  (la même chose par `analyse.php`).
