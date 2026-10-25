# Plan de mise en œuvre — audit, façades, règles des toits

Statut : **plan**, rédigé le 13 octobre 2026, à la demande de l'utilisateur. Il met en œuvre trois
specs :
- [`spec-audit.md`](spec-audit.md) : deux processus, les mêmes outils ;
- [`spec-facades-calage-detection.md`](spec-facades-calage-detection.md) : le moteur des façades ;
- [`spec-regles-toits.md`](spec-regles-toits.md) : faits, réglages, corpus, formes.

Il les découpe en **lots** (22, avec L16 bis), un lot par PR, chacun livrable seul, dans l'ordre des dépendances. Les
renvois `A§`, `F§` et `T§` désignent ces trois specs.

---

## 1. Les règles du plan

- **Une PR par lot**, avec le circuit de `CLAUDE.md` : vérifications, fumée sur les points touchés,
  CHANGELOG, PR, CI verte, merge, livraison.
- **Chaque lot laisse l'application utilisable.** Une partie inachevée reste cachée derrière sa
  commande, grisée ou absente (`capacite`). On ne livre jamais un écran à moitié fait.
- **Mesurer avant de changer** :
  - pour les façades, le banc (F§14) est monté **avant** de toucher à la détection ; chaque lot qui
    la modifie montre le tableau avant et après ;
  - pour les toits, l'externalisation des réglages ne change aucune valeur (T§13.3, phase 2).
- **Ce qui ne bouge jamais** :
  - AE 101 (`npx tsx .claude/skills/toits/scripts/identite.ts`) ;
  - les empreintes golden ;
  - un relevé ou un bâtiment validé par l'utilisateur.
- **Les skills** se chargent selon la zone : `design-ui` pour toute IHM, `toits` pour les toits et
  les murs, `claude-api` pour l'appel à Claude.
- **Les couches** de `tests/unit/architecture.test.ts` sont respectées. Les calculs purs vont dans
  `facade/` et `model/`, l'orchestration dans `app/`, les écrans dans `zones/`.

## 2. Ce qui est déjà fait

| Fait | Où |
|---|---|
| Promenade, étape 1 : accès admin, GPS ou adresse de départ, lecture à 70 m, toits en calcul entier, marquage, fiche, photo, liste de fin, fichier, partage | `app/audit/`, `zones/parcours/Audit*.tsx` |
| Caméra « drone », « Me suivre », boussole, cap de la marche | `app/audit/camera.ts`, `shell/boussole.ts` |
| Photo avec position GPS et azimut (`PhotoCas.prise`) | `model/audit.ts`, `zones/parcours/AuditCas.tsx` |
| Relevé de façade : coins au doigt, homographie, mosaïque, détection, toit lu, mur en L | `facade/`, `zones/releve/` |
| Couleur des murs sur Panoramax : murs visibles, projection, lecture | `render/couleurMurPhoto.ts`, `model/couleurMur.ts` |
| Focale EXIF d'une photo importée | `facade/vision/exif.ts` |
| Serveur web PHP sans base, configuration hors du dossier publié | `deploy/admin.php` |

## 3. Les décisions, et les défauts retenus

Le plan avance avec la **proposition** de chaque spec tant qu'aucune réponse ne vient. *Le 13 octobre, l'utilisateur a retenu les défauts de D1, D2 et D13 : plus rien ne bloque L17 ni L19. Il a tranché D7 le même jour : la case du partage est **cochée** par défaut (L21).* Seules
quelques décisions **bloquent** un lot.

| # | Question | Défaut retenu | Bloque |
|---|---|---|---|
| D1 | Où vit l'appel à Claude, et qui le paie | un `deploy/analyse.php` à côté de `admin.php`, clé dans la configuration hors du dossier publié ; **journal, tarifs et plafonds en JSON sur le serveur de Plan**, avec les autres données de l'admin (décision de l'utilisateur, 13 octobre) ; d'abord pour l'administrateur, puis pour les utilisateurs authentifiés par leur jeton de la plateforme, avec un plafond par organisation et par jour | ~~L17~~ **tranchée le 13 octobre : défaut retenu** |
| D2 | Accord pour envoyer les photos à l'analyse (A§25 q12) | une fois par projet, rappelé au lancement, révocable | ~~L17~~ **tranchée le 13 octobre : défaut retenu** |
| D3 | Batch ou réponse immédiate (A§25 q13) | batch ; « Analyser tout de suite » au tarif normal | — |
| D4 | Couleur sur photo automatique ou au toucher (A§25 q5) | automatique, toucher si la lecture échoue | — |
| D5 | Relevé sur place ou plus tard (A§25 q6) | quand on veut, depuis la liste | — |
| D6 | Mitoyens à 100 % (A§25 q10) | oui, pour ce qui se voit | — |
| D7 | Partage de l'audit d'un utilisateur pour le corpus (A§25 q11) | ~~case décochée par défaut~~ **tranchée par l'utilisateur (13 octobre) : la case « Partager cet audit pour améliorer Plan » est cochée par défaut**, révocable ; posée avec l'accord de l'analyse (L17), puis seule sur l'écran des propositions ; rien ne part avant « Valider », ni sans session admin ou jeton de la plateforme (L21) | ~~L21~~ tranchée |
| D8 | Analyse en pleine définition, photo réduite gardée (F§17 q1) | oui | — |
| D9 | Ouvertures devinées (F§17 q2) | proposées en pointillé, décochées si confiance faible | — |
| D10 | Détails des ouvertures dans le modèle (F§17 q3) | oui, dès L15 | — |
| D11 | Renfort Claude à chaque façade au début (F§17 q5) | oui, pendant les premiers audits | — |
| D12 | Sens de Déversée, Queue de vache, Brisure (T§12) | termes marqués ⚠, non proposés dans la fiche tant qu'ils ne sont pas tranchés | — |
| D13 | Réglages et faits : dans le dépôt ou sur le serveur (T§12) | **tranchée le 13 octobre : défaut retenu** ; dans le dépôt (`regles/`), relus par les tests | ~~L19~~ débloqué |
| D14 | Faits partagés entre comptes (T§12) | non : les faits du dépôt sont communs, les corrections d'un utilisateur restent dans son projet | L20 |

**À vérifier tôt, sur votre téléphone** (lot L1) : qu'iOS garde la focale EXIF d'une photo prise
par le champ « appareil photo » de la page. La position GPS, elle, est souvent retirée par le
système : c'est pourquoi la prise de vue vient du GPS de la page, pas de l'EXIF.

## 4. L'architecture visée

| Couche | Nouveau ou étendu | Rôle |
|---|---|---|
| `shell/` | `boussole.ts` (étendu) | inclinaison et roulis (`beta`, `gamma`) au moment de la prise |
| `model/` | `audit.ts` (v2), `auditParcelle.ts`, `types.ts` | photos multiples, lectures, « Ce que je vois », propositions ; `ReleveFacade` et `OuvertureFacade` enrichis (F§13) ; `Cheminee`, `Terrasse` dans `CorpsToit` (T§4) |
| `facade/` | `priseDeVue.ts`, `calage.ts`, `segments.ts`, `pointsFuite.ts`, `distorsion.ts`, `fusion.ts`, `detection.ts` (repris), `structure.ts`, `classement.ts`, `propositions.ts` | tous les calculs, purs et testés |
| `render/` | `couleurPhotoAudit.ts` | couleur d'une façade sur une photo plate (réutilise `couleurMurPhoto.ts`) |
| `three/` | `cheminees3d.ts`, `terrasse3d.ts`, rendu hors écran depuis une prise de vue | dessin des souches, acrotères, édicules ; image du modèle pour Claude |
| `io/` | `brouillonAudit.ts` | brouillon IndexedDB, à côté de `photosLocales.ts` |
| `app/audit/` | `parcelle/` (contrôleur, liste, propositions, application), `analyse.ts` | les deux processus ; le client du batch |
| `zones/` | `parcours/AuditParcelle.tsx`, `parcours/AuditPropositions.tsx`, barre avant/après de la Vue 3D | écrans Z8 et Vue 3D |
| `deploy/` | `analyse.php`, `prompt-analyse.md`, `schema-analyse.json` | proxy du batch Claude (D1) |
| `.claude/skills/` | `facades/` (banc), `regles-toits/` | méthode et scripts pour Claude Code |
| `tests/fixtures/` | `facades/`, `audit/` | corpus |

## 5. Les jalons et les lots

Taille : **S** une petite PR ; **M** une PR d'une session ; **L** une PR dense, à scinder si elle
grossit.

### J0 — Le socle commun

Il profite tout de suite à la promenade, puis à l'audit de parcelle.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L1** | **Photo située complète** : focale et modèle d'appareil lus avant la réduction, inclinaison et roulis, plusieurs photos par cas (jusqu'à six), fichier de promenade v2 qui relit la v1 | A§5, A§19 | M | — | tests EXIF et migration v1 → v2 ; fiche à six photos en fumée ; essai sur votre iPhone |
| **L2** | **La façade devant vous** : côté extérieur, 3 à 40 m, rien entre vous et le mur, puis l'axe de la boussole ; surlignage dans la Vue 3D, nom à l'écran ; remplace `facadeFaceAuCap` dans le choix du mur du relevé | A§6.1 | M | L1 | tests géométriques (positions et caps connus) ; fumée avec boussole simulée |
| **L3** | **Couleur de la façade sur la photo** : projection en photo plate avec focale et inclinaison, moitié centrale du mur, clôtures écartées ; toucher si la lecture échoue ; `lectures.facades` dans le cas | A§6.2 | M | L1, L2 | images de synthèse d'un mur connu, couleur retrouvée ; fumée sur la fiche |
| **L4** | **Brouillon local** : marques, cas, photos et relevés en cours dans IndexedDB ; « Reprendre l'audit du … » ou « Le jeter » | A§10 | M | L1 | test de reprise après rechargement ; fumée avec onglet rechargé |

### J1 — Calage des photos (première vague façades)

Le relevé existant en profite dès ce jalon.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L5** | **Banc de façades** : générateur de façades de synthèse difficiles (brique, soubassement, ombres, volets, voiture devant, prise de biais), corpus `tests/fixtures/facades/`, script de mesure, skill `facades`, **chiffres de départ** | F§14 | M | — | le tableau de départ, publié dans la PR |
| **L6** | **Préparation et calage grossier** : pixels par mètre à la source, coins prédits par la prise de vue à la place des coins centrés | F§4, F§5 | M | L1, L5 | banc : erreur des coins proposés avant et après |
| **L7** | **Calage fin** : segments, points de fuite, coins trouvés, azimut corrigé, contour décalé signalé ; coins pleins ou en pointillé dans l'éditeur ; calcul dans un worker | F§6 | L | L6 | banc : au moins 70 % des coins trouvés sans geste |
| **L8** | **Distorsion du grand-angle** (focale équivalente sous 20 mm) | F§4 | S | L7 | banc sur des prises synthétiques déformées |

### J2 — L'audit de la parcelle, sans Claude

Dès ce jalon, l'audit a de la valeur pour l'utilisateur : les mesures seules font des propositions.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L9** | **Capture** : commande `audit.parcelle` (registre, `exposition.ts`, `projects.write`), liste de contrôle Z8 (façades, toit, cheminées, terrasse, matériaux, clôture, portail, mitoyens), photos rangées sur la façade reconnue, « Ce que je vois » ; le même composant sert dans la fiche de la promenade | A§11, A§12, A§8.1 | L | L1 à L4 | tests de la liste ; fumée dans les trois classes d'écran et les deux thèmes |
| **L10** | **Cheminées et toits-terrasses dans le modèle et en 3D** : `Cheminee` et `Terrasse` dans `CorpsToit` ; souches (faîtage, pan, pignon, adossée), acrotère, édicules dessinés ; venus d'une observation seulement, sans détection | T§2.6, T§2.7, T§4 | M | — | AE 101 identique ; tests de dessin ; capture 3D |
| **L11** | **Propositions et validation** : propositions issues des mesures (relevés, couleur, hauteur, observations) ; Vue 3D avant / après ; cases à cocher, valeurs choisies à la main décochées ; un seul pas d'historique ; « vérifié sur place » | A§14 | L | L9, L10 | tests d'application et d'annulation ; fumée avant / après, Ctrl+Z |
| **L12** | **Le 100 % protégé** : un bâtiment vérifié sur place n'est plus recalculé par la relecture des toits (`VERSION_LECTURE_TOITS`) ni par Fichier › Actualiser, sauf demande | T§1 | S | L11 | test de relecture qui le saute ; AE 101 identique |

### J3 — Détection des ouvertures (deuxième vague façades)

Chaque lot montre le banc avant et après.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L13** | **Fusion de plusieurs vues** : recalage en deux dimensions, masque d'occlusion par la parallaxe, composition par qualité | F§8 | L | L7 | banc : façades avec voiture ou haie devant |
| **L14** | **Candidats** : teinte locale, profils de contours, filtre d'ombre, confiance ; filtres de taille devenus des réglages nommés | F§9 | L | L5, L13 | banc : rappel d'au moins 85 %, précision d'au moins 90 % |
| **L15** | **Structure et classement** : niveaux, travées, régularisation de 10 cm au plus, complétion devinée ; volets, coffre, balcon, forme ; gestes « même taille pour la travée », « ajouter dans la grille » | F§10, F§11, F§12 | L | L14 | banc : erreur médiane des cotes de 5 cm au plus ; moins de trois corrections par façade |

### J4 — L'analyse par Claude

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L16** | **Le serveur** : `deploy/analyse.php` (création du batch, suivi, résultats), clé et plafonds dans la configuration, session admin d'abord, **journal de chaque appel** (parcelle, modèle, usage, tokens, coût), table des tarifs datée et plafonds, en JSON sur le serveur de Plan ; prompt et schéma versionnés | A§13.2, A§13.3, T§14.3 | M | — | tests du proxy sur une réponse simulée ; un batch réel en admin |
| **L16 bis** | **Tableau de bord de la consommation** : Admin › Consommation Claude ; tokens et coût dans le temps par modèle, par parcelle, par usage, par organisation ; chiffres clés, alertes, export CSV ; réglage des tarifs et des plafonds (routes `admin/claude/…`) (skill `dataviz` pour les graphiques) | A§13.3 | M | L16 | coûts identiques à ceux de la console Anthropic sur un mois d'essai ; fumée dans les trois classes et les deux thèmes |
| **L17** | **Le client** : entrées préparées (photos réduites, rendu du modèle depuis la même prise de vue, orthophoto, carte LiDAR, indices), trois passes et un vote, propositions `source: 'claude'` avec indices, notification, accord de l'utilisateur ; puis ouverture aux utilisateurs authentifiés | A§13.2, T§14 | L | L11, L16, **D1, D2** | une parcelle réelle analysée ; taux d'accord mesuré sur vos validations |
| **L18** | **Renfort du calage et de la détection** : appelé sur signal ; coins et ouvertures en graines, recalés sur l'image, origine marquée | F§12 bis | M | L15, L17 | banc : algorithme seul, puis avec Claude |

### J5 — Corpus et règles des toits

L19 peut commencer dès J0 : il ne dépend que des fichiers de promenade.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **L19** | **Corpus** : script `audit.ts` de rejeu, `tests/fixtures/audit/`, test de non-régression des cas `valide` (toits, couleur, ouvertures) ; `reglages.json` des toits sorti du code **sans changer une valeur** | A§21 à A§23, T§6, T§8 | L | L1, **D13** | banc des villages et AE 101 identiques au bit près |
| **L20** | **Faits et skill `regles-toits`** : `faits.json` appliqué, skill qui traite une promenade jusqu'à la PR avec images | T§5, T§10 | L | L19 | une promenade réelle traitée de bout en bout |
| **L21** | **Fichier de l'audit de parcelle** : partage pour le corpus (case cochée par défaut, révocable), import d'un audit dans un projet de la même parcelle | A§15 | M | L11, D7 (tranchée) | un fichier rejoué sans réseau ; import, puis Ctrl+Z |

### J6 — Généraliser

C'est un carnet de lots, ordonné par ce que le corpus montrera. Une forme ou un profil par PR.

1. **Formes de toit** (T§13.3, phase 4) : lucarnes, Mansart et gambrel, demi-croupe, cheminées
   détectées sur le LiDAR, asymétrique, puis le reste.
2. **Profils de façades** du voisinage, calibrés par les relevés (F§15).
3. **Profils de toits** régionaux (T§13.3, phase 5).

## 6. L'ordre, et ce qui peut avancer en parallèle

```
J0  L1 ──► L2 ──► L3            L4 (après L1)
           │
J1  L5 ──► L6 ──► L7 ──► L8
           │
J2         └──► L9 ──► L11 ──► L12        L10 (indépendant)
                        │
J3  L7 ──► L13 ──► L14 ──► L15
                        │
J4  L16 (indépendant) ──► L17 ──► L18
     └──► L16 bis
                        │
J5  L19 (dès L1) ──► L20          L21 (après L11)
```

- **Chemin critique vers la valeur utilisateur** : L1, L2, L9, L10, L11. À ce stade, l'audit de
  parcelle fonctionne avec les mesures seules.
- **En parallèle**, sans conflit de fichiers :
  - L5 (banc) avec L1 à L3 ;
  - L10 (cheminées et terrasses) avec L9 ;
  - L16 (serveur) dès que D1 est tranché ;
  - L19 (corpus) dès les premiers fichiers de promenade réels.

## 7. Ce que chaque lot doit prouver

- `npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test`.
- **Fumée** : les points touchés, dans les trois classes d'écran et les deux thèmes. Points
  nouveaux dans `tests/CHECKLIST-FUMEE.md` :
  - façade reconnue ;
  - fiche à plusieurs photos ;
  - liste de contrôle ;
  - propositions avant / après ;
  - Ctrl+Z après validation ;
  - reprise du brouillon.
- **Banc de façades**, avant et après, pour tout lot qui touche le calage ou la détection.
- **AE 101 et empreintes golden** identiques. Un lot qui touche les toits (L10, L12, L19, J6)
  charge le skill `toits` et joue `identite.ts`.
- **Entrée au CHANGELOG** en français, et **livraison** construite depuis `main`.

## 8. Les risques, et leur parade

| Risque | Parade |
|---|---|
| Boussole imprécise (5 à 15°) | calage fin par les points de fuite (L7) ; zones de recherche, jamais des coins imposés |
| Calculs lourds sur téléphone (segments sur une photo de 2 400 px) | worker, régulateur de charge (`app/regulateur.ts`), calcul pendant la prise de la façade suivante |
| Brouillon trop gros pour le navigateur, ou effacé par le système | photos réduites, élévations en JPEG, alerte de place ; reprise testée (L4) |
| Focale EXIF retirée par iOS | focale par modèle d'appareil apprise, sinon valeur par défaut annoncée « estimée » (L1) |
| Coût de Claude qui dérape | plafonds par organisation et par jour dans `analyse.php`, journal des coûts, tableau de bord avec alertes, appel sur signal seulement après les premiers audits (L16, L16 bis, L18) |
| Photos privées qui partent sans accord | accord explicite (D2), rien sans réseau ni sans accord, partage pour le corpus séparé (D7) |
| Une règle de toit qui casse un bâtiment validé | « vérifié sur place » protégé (L12), corpus en CI (L19) |
| Rendu 3D hors écran trop gourmand sur mobile | rendu à 1 024 px, une prise de vue à la fois, libéré aussitôt |

## 9. Le premier pas

1. **L1, photo située complète** : c'est la base de tout le reste, et il améliore tout de suite la
   promenade. Il demande un essai de votre part sur iPhone, pour la focale EXIF.
2. **L5, banc de façades**, en parallèle : sans chiffres de départ, aucun lot de détection ne peut
   montrer qu'il améliore quelque chose.
3. Puis **L2**, **L3** et **L9**.

Je peux commencer L1 dès votre feu vert. Les décisions D1 et D2 ne sont nécessaires qu'au jalon J4.
