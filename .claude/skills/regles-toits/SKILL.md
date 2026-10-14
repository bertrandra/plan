---
name: regles-toits
description: Traiter un fichier de promenade (audit-….json) de bout en bout pour les toits — rejouer chaque cas, le classer (hors toit, fait, réglage, règle, question), écrire le fait ou le réglage, images avant et après, PR. Tient regles/toits/faits.json (faits par bâtiment, en contrainte ou en remplacement) et compte les faits par forme. À charger quand l'utilisateur fournit un fichier de promenade, demande d'ajouter un fait sur un bâtiment, ou avant de toucher à regles/toits/faits.json, model/faitsToits.ts ou facade/faitsToits.ts. S'appuie sur le skill toits.
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
