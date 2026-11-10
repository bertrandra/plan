# Plan de mise en œuvre — vague 3 : généraliser

Statut : **plan**, rédigé le 14 octobre 2026, à la demande de l'utilisateur. Il fait suite à
[`plan-mise-en-oeuvre-audit.md`](plan-mise-en-oeuvre-audit.md), dont les vagues 1 et 2 (lots L1 à L21)
sont faites, et détaille son jalon **J6 — Généraliser**. Il couvre quatre chantiers :

1. **Les formes de toit nouvelles** (`spec-regles-toits.md` §13.3, phase 4) : lucarnes, Mansart et
   gambrel, demi-croupe, cheminées détectées sur le LiDAR, asymétrique, puis le reste.
2. **Les profils de façades du voisinage** (`spec-facades-calage-detection.md` §15).
3. **Les profils de toits régionaux** (`spec-regles-toits.md` §13.3, phase 5).
4. **Les suites laissées par la vague 2** (lots L15, L17, L18).

Il les découpe en **lots G1 à G20**, un lot par PR, chacun livrable seul. Les renvois `A§`, `F§` et
`T§` désignent les trois specs (`spec-audit.md`, `spec-facades-calage-detection.md`,
`spec-regles-toits.md`).

---

## 0. État au 16 octobre 2026

Relevé fait en relisant le plan contre le dépôt. Les noms de fichiers du §4 sont ceux du plan ; trois ont changé
avec le rangement du moteur sous `regles/` (`MD/architecture.md` §5.2.4).

| Lot | État | Où |
|---|---|---|
| G1, G2, G3, G3 bis | **fait** | `model/types.ts`, banc des formes, `regles/conformite.ts` + écran Admin › Conformité, `app/toits/candidatsPanoramax.ts` |
| G11, G12 | **fait** | `model/mesureFacade.ts`, `regles/facades/reglages.json` + `facade/regles/facades/profils.ts` (le profil par défaut seul) |
| **G13** | **fait** | `facade/regles/facades/conformite.ts` : la disposition automatique d'un mur (`ouverturesDUnMur`) comparée à son relevé ; tuile, colonne par région, onglet « Façades » et historique de l'écran Conformité |
| G15, G17, G18 bis, masque de G20 | **fait** | `facade/regles/toits/profils.ts` (aucun profil encore), `three/detailsBatiment.ts`, clés des manques par façade, masque hachuré |
| **G18** | **fait pour D20 et D21, reste la pré-acceptation** | D21 : `regles/decisions.ts` (`rivalesSurPlace`), la ligne de Claude arrive décochée et cocher l'une décoche l'autre. D20 : `app/audit/parcelle/escalade.ts`, un modèle plus fin départage les passes en désaccord (usage `escalade`, appel immédiat, plafonds). `ACCORDS_MESURES` reste vide : la pré-acceptation à plus de 95 % attend le corpus |
| G19 | **en partie** | la forme du toit et les bouts sont déjà des propositions (`app/regles/sujets/formeToit.ts`), venues avant G4, G5 et G17 ; les lucarnes et les détails d'ouvertures restent des observations |
| G4 à G10 | à faire (le dessin 3D est fait) | le **dessin** des lucarnes, du Mansart, du gambrel et de la demi-croupe est fait (`facade/toits/toitFormes.ts`, spec §4) ; leur **lecture** sur le LiDAR attend le corpus (phase 1 de T§13.3 : 50 cas observés dont 10 sur des formes inconnues) ; il y en a 2 aujourd'hui |
| G14, G16 | à faire | `profils` est vide dans `regles/toits/reglages.json` et `regles/facades/reglages.json` ; un profil naît d'un écart que G13 ou une contradiction de cas montre |
| G20 (taux d'accord, fin du renfort) | à faire | corpus |

**Noms qui ont changé depuis le §4.** `profilsToits.ts` est `facade/regles/toits/profils.ts`, `profilsFacades.ts` est
`facade/regles/facades/profils.ts`, `model/conformite.ts` est `regles/conformite.ts` ; il n'y a pas de
`scripts/candidats.ts` (le parcours de village est `app/toits/candidatsPanoramax.ts`).

**Ce que la vague a ajouté sans le plan.** Admin › Règles (le prompt et le schéma de Claude composés par les sujets,
`MD/architecture.md` §5.2.4), l'essai du brouillon sur le serveur et le rejeu avec lui (`?regles=local`, Admin ›
Audits), l'édition des réglages et des faits. Ils servent G18 : on mesure l'effet d'un changement de prompt sur un
audit reçu avant de le livrer.

**Les tolérances de G13.** La spec donne baies à ± 1 et part vitrée à ± 20 %, et dit « hauteur des niveaux » sans
tolérance : 30 cm est un choix à confirmer par le corpus (`TOLERANCE_HAUTEUR_NIVEAU_M`). La part vitrée se compare en
relatif à celle du relevé ; un mur sans vitrage au relevé se compare à zéro, à un point de mur près. La porte est posée
sur la disposition seulement si le relevé en porte une : on compare la place des fenêtres, pas la décision d'avoir une
porte sur ce mur. Le modèle d'escalade par défaut est le plus fin (Sonnet, décision du 29 octobre 2026 ; Haiku, celui des
autres usages, avant), réglable sur « Escalade » dans les réglages des modèles.

---

## 1. Les règles du plan

Celles du plan précédent (§1) s'appliquent toutes : une PR par lot, avec le circuit de `CLAUDE.md` ;
l'application reste utilisable à chaque lot ; on mesure avant de changer ; AE 101, les empreintes
golden et ce que l'utilisateur a validé ne bougent pas. S'y ajoutent les règles propres à la
généralisation (T§13.3 phase 4, T§13.6) :

- **Une forme, un profil ou un lot de faits par PR.** Jamais deux formes dans la même PR : si le banc
  bouge, on doit savoir laquelle l'a fait bouger.
- **Une forme se compose de quatre morceaux, livrés ensemble** : le modèle de données (T§4), la
  détection, le dessin 3D et les cas du corpus. Une forme que la 3D ne sait pas dessiner n'est pas
  produite par le calcul.
- **Une forme nouvelle commence prudente** : des seuils hauts, puis on les assouplit cas par cas. Les
  faux positifs se comptent sur le banc, et la liste des bâtiments qui changent est relue sur les
  cartes (skill `toits`, §6).
- **Les faits que la règle rend inutiles sont retirés** de `faits.json` dans la même PR : le calcul
  les retrouve seul, et le test le prouve.
- **Un profil naît d'une contradiction** entre deux cas (T§8.3), jamais d'une intuition. Il se
  déclenche sur des faits mesurables, avec un vocabulaire fermé (T§6), jamais sur une adresse.
- **La parcelle principale et les mitoyens vérifiés ne sont jamais recalculés** (lot L12) : une forme
  ou un profil nouveau ne s'applique qu'au voisinage et aux bâtiments non vérifiés.
- **Le doute se pose en question** à l'utilisateur, plutôt que de se cacher dans un seuil (la
  demi-croupe en est le cas d'école).

## 2. D'où l'on part

| Acquis | Où | Sert à |
|---|---|---|
| Corps de toit : rectangle, faîtage, deux égouts, croupes, pignons ; cheminées et toits-terrasses **observés** (lot L10) | `model/types.ts` (`CorpsToit`, `Cheminee`, `TerrasseToit`), `three/cheminees3d.ts`, `three/terrasse3d.ts` | G1, G8 |
| Seuils des toits hors du code, `profils` prévus mais vides | `regles/toits/reglages.json` (74 seuils) | G15, G16 |
| Faits appliqués, mode d'essai `?regles=local`, skill `regles-toits` | `regles/toits/faits.json`, `.claude/skills/regles-toits/` | G4 à G9 (faits retirés) |
| Rejeu d'une promenade et comparaison à l'attendu | `.claude/skills/toits/scripts/audit.ts`, `tests/fixtures/audit/` (2 promenades) | G3, toutes les formes |
| Banc des villages : Le Vésinet, Hucqueliers, Gordes, Aix, Saint-Rémy | `.claude/skills/toits/scripts/banc.ts` | toutes les formes |
| Le 100 % protégé : un bâtiment vérifié sur place n'est plus recalculé | lot L12 | toutes les formes et tous les profils |
| Ouvertures automatiques : fenêtres de 1,00 × 1,20 m à 0,90 m d'appui, entraxe 2,40 m, porte au rez-de-chaussée du plus long mur | `facade/ouvertures.ts`, `model/fenetres3d.ts` | G11 à G14 |
| Relevé de façade : grille (niveaux, travées), détails des ouvertures (volets, allège, forme), corrections tracées | `model/types.ts` (`GrilleFacade`, `DetailsOuverture`, `CorrectionOuverture`), lot L15 | G11, G17 |
| Fichier de l'audit de parcelle, partage pour le corpus (coché par défaut) | lot L21 | corpus des façades (G11) |
| Analyse par Claude : trois passes et un vote, propositions décochées ; renfort du calage et de la détection | lots L17, L18 (`deploy/analyse.php`, `facade/detection/renfort.ts`) | G18 à G20 |

**Ce qui manque, et que personne d'autre que vous ne peut fournir : le corpus.** Il n'y a
aujourd'hui que deux promenades de démonstration, et aucun audit de parcelle réel. Or la phase 4 de
T§13.3 suppose la phase 1 atteinte : **au moins 50 cas observés, dont 10 sur des formes que Plan ne
sait pas encore faire**. Le plan sépare donc ce qui peut avancer **sans corpus** (outillage, modèle,
mesures, suites de la vague 2) de ce qui l'**attend** (formes, profils).

## 3. Les décisions, et les défauts retenus

Comme dans le plan précédent, le plan avance avec le défaut tant qu'aucune réponse ne vient. La
numérotation suit celle du plan précédent (D1 à D14).

| # | Question | Défaut retenu | Bloque |
|---|---|---|---|
| D15 | L'ordre des formes | celui de T§13.3 phase 4 : lucarnes, Mansart, gambrel, demi-croupe, cheminées, asymétrique ; **revu après les trois premières promenades réelles**, selon ce que le tri des cas montre le plus | G4 |
| D16 | Les villages de banc nouveaux | trois, choisis pour leurs formes : un quartier à la Mansart (Versailles, quartier Notre-Dame), un village à demi-croupes (Alsace : Eguisheim ou Riquewihr), un bourg de Normandie (lucarnes, demi-croupes). Retenus seulement si le LiDAR HD les couvre (`dallesLidarSur`) | G2 |
| D17 | Lucarnes : dessinées en 3D aussi sur observation seule | oui : une lucarne observée se dessine même si le LiDAR ne la voit pas (petite, ou dans un brisis) | G4 |
| D18 | Où vivent les profils de façades | `regles/facades/reglages.json`, sur le modèle des toits : compilé dans le fichier livré, empreinte dans la version de lecture | G12 |
| D19 | Ce qui déclenche un profil de façades | le même vocabulaire fermé que les toits (T§6) : département (tiré de l'IDU), époque (`date_d_apparition` de la BD TOPO, à défaut rien), usage (`usage_1`), nombre d'étages, mitoyenneté | G12 |
| D20 | Escalade vers un modèle plus fin (L17) | seulement quand les trois passes ne votent pas pareil sur un attribut, et dans le plafond de l'organisation ; le modèle d'escalade est celui déjà déclaré dans `analyse.php` | G18 |
| D21 | Valeur notée sur place contre valeur de Claude, toutes deux cochées (L17) | la valeur notée sur place l'emporte : cocher l'une décoche l'autre | G18 |
| D22 | Fin du renfort de Claude à chaque façade (D11, L18) | après 20 façades relevées avec renfort, ou plus tôt si son apport mesuré est nul ; on passe alors à l'appel sur signal seul | G20 |
| D23 | Fenêtres de toit et châssis (T§12 q4) | toujours plus tard, après les formes : ils ne sont pas dans cette vague | — |

## 4. L'architecture visée

Rien ne change dans les couches de `tests/unit/architecture.test.ts`. Les ajouts se rangent ainsi :

| Couche | Ajouts |
|---|---|
| `model/` | `ProfilPan`, `BoutToit`, `Lucarne` dans `types.ts` (facultatifs, T§4) ; `formeToit.ts` (la forme d'ensemble déduite des corps) ; `mesureFacade.ts` (ce qui se mesure sur une façade relevée) ; `conformite.ts` (taux de conformité des toits, des façades, taux d'accord de Claude) |
| `facade/` | une détection par forme : `lucarnes.ts`, `profilBrise.ts` (Mansart, gambrel), `demiCroupe.ts`, `chemineesLidar.ts`, `asymetrique.ts` ; `profilsFacades.ts` (choix du profil, lecture de `regles/facades/reglages.json`) ; `profilsToits.ts` (choix et surcharges des profils de `reglages.json`) |
| `three/` | `toitCorps3d.ts` apprend le profil brisé et la demi-croupe ; `lucarnes3d.ts` ; `detailsBatiment.ts` apprend volets, balcons et baies cintrées |
| `app/` | rien de neuf pour les formes (elles passent par `toitsLidar.ts` et `toitsFond.ts`) ; `VERSION_LECTURE_TOITS` change à chaque forme, ce qui relit les toits en tâche de fond |
| `zones/` | l'inspecteur nomme la forme (« Toit à la Mansart ») et liste lucarnes et cheminées ; un écran admin « Conformité » à côté de « Consommation » |
| `regles/` | `facades/reglages.json` (profils de façades) ; `toits/reglages.json` reçoit ses premiers `profils` |
| scripts | `banc.ts` compte les formes produites et les faux positifs ; `audit.ts` rejoue aussi les façades ; un script de cas candidats Panoramax |

## 5. Les jalons et les lots

Taille : S (moins d'un jour d'agent), M (un à deux), L (plus). « Corpus » dans la colonne *Dépend de*
signale un lot qui attend des audits réels.

### K0 — Le socle, sans corpus

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **G1** | **Modèle étendu** : `ProfilPan`, `BoutToit`, `Lucarne` facultatifs dans `CorpsToit` ; lecture, écriture et compactage (`corpsToit` compacté à l'écriture) ; `Toit.forme` gagne les nouvelles valeurs, déduites des corps par `model/formeToit.ts`. Aucun calcul ne les produit encore ; « Ce que je vois » et les faits peuvent déjà les écrire | T§4 | M | — | anciens fichiers relus à l'identique ; AE 101, empreintes et banc identiques au bit près |
| **G2** | **Banc des formes** : les villages de D16 ajoutés au banc ; `banc.ts` compte, par village, les formes produites (catalogue T§3.1) et les bâtiments dont la forme change par rapport à `main` ; cartes de ces bâtiments en planche | T§8.2 | M | D16 | tableau de départ des cinq villages actuels inchangé ; trois villages nouveaux mesurés |
| **G3** | **Indicateurs et écran « Conformité »** (admin) : taux de conformité des cas observés, par forme, par région et par problème (T§13.5) ; taux de conformité des façades (F§15.3, rempli par G13) ; taux d'accord de Claude par attribut (rempli par G18). Lus depuis le corpus et les audits partagés, rangés dans un JSON du serveur de Plan comme les autres données de l'admin | T§13.5, F§15.3 | M | — | taux de départ connus sur les deux promenades de démonstration ; fumée de l'écran |
| **G3 bis** | **Cas candidats Panoramax** : Claude analyste parcourt les photos de rue d'un village et repère les bâtiments qui ont probablement une forme visée ; ils entrent au corpus au statut `propose`, à valider sur images | T§13.3 phase 4 (usage 3) | M | G1 | 20 candidats proposés sur un village de D16, triés par vous |

### K1 — Les formes de toit

Chaque lot suit la même recette : modèle (déjà prêt par G1), détection prudente, dessin 3D, cas du
corpus, faits retirés, banc relu, AE 101 identique. L'ordre est celui de D15.

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **G4** | **Lucarnes** : séparer la lucarne de l'avant-corps à pignon (confusion 1 : l'avant-corps monte jusqu'au faîtage, la lucarne s'arrête dessous) ; type lu sur le LiDAR pour une lucarne de plus de 1,5 m (jacobine, capucine, chien-assis, rampante), sinon « inconnue » ; dessin 3D ; une fenêtre dans chaque lucarne (`facade/ouvertures.ts`) ; une lucarne observée se dessine même invisible au LiDAR (D17) | T§2.3, T§3.4 (1) | L | G1, G2, corpus | les grandes jacobines ne sont plus lues comme des pignons ; AE 101 et ses deux pignons depuis le faîtage inchangés |
| **G5** | **Mansart** : profil brisé (brisis raide le long de tous les murs, terrasson doux), brisis aux bouts ; trancher contre le toit plat sur murs hauts (confusion 2 : égout LiDAR à 2 m ou plus au-dessus de la hauteur BD TOPO, rampe raide de moins de 1,5 m, bosses régulières des lucarnes) ; la hauteur des murs devient l'égout bas du brisis ; lucarnes dans le brisis | T§3.2, T§3.4 (2) | L | G4 | aucun Mansart sur les toits plats des cinq villages actuels ; Mansart trouvés au village de D16 |
| **G6** | **Gambrel** : le même profil brisé sur les deux longs côtés seulement, murs de bout en pignon (confusion 7) | T§3.4 (7) | M | G5 | idem, sans confusion avec un deux-pans très pentu |
| **G7** | **Demi-croupe** : `BoutToit` demi-croupe (courte croupe, petit pignon dessous) ; la mesure hésite (une ou deux mailles) : la règle ne la propose que nette, sinon **pose la question** sur un bâtiment du projet ou d'un mitoyen, comme « à cheval » ; fenêtre de pignon sous la demi-croupe si le triangle fait au moins 1,8 m | T§3.4 (3) | M | G1, corpus | les cas observés passent ; aucune croupe des villages actuels ne devient demi-croupe sans observation |
| **G8** | **Cheminées détectées sur le LiDAR** : regrouper les mesures que l'ajustement écarte déjà (au-dessus du pan) en pics compacts de 1 à 6 mailles, de 0,5 à 2,5 m au-dessus du pan ; écarter l'arbre (large, irrégulier, hors du contour), la lucarne (alignée, à pans) et l'édicule (2 m de côté ou plus, sur un toit plat) (confusions 4 et 8) ; position faîtage, pan, pignon ; sommet au moins 40 cm au-dessus du faîtage (DTU 24.1) ; source `lidar`, une observation l'emporte. Dans le même lot : acrotère et édicules des toits-terrasses lus sur le LiDAR | T§2.6, T§2.7 | M | G1, G2 | cheminées trouvées sur les villages, comparées à l'orthophoto sur 20 bâtiments ; aucun arbre pris pour une cheminée sur la liste relue |
| **G9** | **Asymétrique** : reconnaissance seule (la forme est déjà représentable : faîtage décentré, égouts inégaux) ; nommée dans l'inspecteur, écrite par « Ce que je vois » | T§3.1 (8) | S | G1 | les cas observés passent ; rien ne change dans la 3D |
| **G10** | **Le reste, en carnet** : papillon, toit en M, coyau (sur observation seulement), berceau et carène, puis les formes axiales (conique, dôme, flèche, impériale), qui demandent un nouveau type de corps centré sur un point (T§4). Un lot par forme, dans l'ordre du corpus | T§11 étape 6 | L chacun | corpus | par forme, la recette ci-dessus |

### K2 — Les profils de façades du voisinage

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **G11** | **Mesurer une façade relevée** (`model/mesureFacade.ts`) : largeur et hauteur des fenêtres, appui, entraxe, part vitrée (baies sur mur), baies par niveau, place de la porte, garage ; façade sur rue, arrière ou pignon (souvent aveugle côté voisin). `audit.ts` rejoue aussi les façades des audits de parcelle | F§15.1 | M | — | mesures justes sur les scènes du banc de façades, dont on connaît la vérité |
| **G12** | **Profils de façades** : `regles/facades/reglages.json` (D18), déclencheurs de D19 ; `ouverturesAutomatiques` lit le profil retenu ; les constantes d'aujourd'hui deviennent le **profil par défaut**, et le premier lot ne contient que lui | F§15.2 | M | G11 | sans autre profil que le défaut, la 3D et les empreintes sont identiques au bit près |
| **G13** | **Taux de conformité des façades** : sur chaque façade relevée, la disposition automatique comparée au relevé (baies ± 1, part vitrée ± 20 %, hauteur des niveaux) ; affiché dans l'écran de G3 | F§15.3 | S | G3, G11 | taux de départ connu |
| **G14** | **Premiers profils** : `pavillon-idf`, puis ce que le corpus montre (maison de village, longère, immeuble de rapport). Chaque profil naît d'un écart mesuré par G13, un profil par PR | F§15.4 | M chacun | G12, G13, corpus | le taux de conformité monte dans la région du profil sans baisser ailleurs ; aucun relevé touché |

**Les empreintes golden.** La disposition des fenêtres se voit dans la 3D, donc peut-être dans
`glb-structure.json` et dans les vues du dossier (`dossier.pdf`). G12 doit vérifier lesquelles en
dépendent. Si un profil de G14 fait bouger une empreinte, c'est un changement de version majeure
(`MD/RELEASE.md`), à documenter dans `EMPREINTES.md`, jamais une correction discrète.

### K3 — Les profils de toits régionaux

| Lot | Contenu | Spec | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **G15** | **Moteur des profils** de `reglages.json` : déclencheurs fermés (département, latitude, matériau des murs ou de la toiture, hauteur, surface, mitoyenneté, forme du contour, époque) ; le plus précis l'emporte, la CI refuse deux profils de même précision sur le même seuil ; l'empreinte des profils entre dans `VERSION_LECTURE_TOITS` | T§6 | M | — | sans profil, AE 101, banc et empreintes identiques au bit près ; tests des priorités |
| **G16** | **Premiers profils** : chacun naît d'une contradiction entre deux cas (T§8.3). Candidats attendus : `provence-village` (toits à un pan, contours en trapèze), `nord-longere`, `idf-pavillon`. Claude analyste propose ce qui distingue deux cas qui se contredisent ; le profil n'est retenu que si une mesure le confirme | T§13.3 phase 5 | M chacun | G15, corpus | la contradiction résolue ; le taux de conformité monte dans la région sans baisser ailleurs |

### K4 — Les suites de la vague 2

| Lot | Contenu | Vient de | Taille | Dépend de | Preuve |
|---|---|---|---|---|---|
| **G17** | **Détails des ouvertures, en 3D et au banc** : dessin des volets battants, roulants et persiennes, du balcon et du garde-corps, des baies cintrées et rondes (`three/detailsBatiment.ts`) ; justesse des détails mesurée au banc des façades (vérité des scènes générées) ; les faux « cintre » dus à une haie (scènes 07 et 17) ; une scène à deux vues avec une vraie occlusion, pour jouer la baie devinée en pointillé au navigateur (point de fumée 68) | L15 | M | — | tableau du banc avant et après ; fumée 68 jouée |
| **G18** | **Claude, du vote à la confiance** : taux d'accord par attribut sur les validations réelles ; pré-acceptation des attributs à plus de 95 % d'accord sur au moins 30 cas hors exemples ; escalade sur désaccord des passes (D20) ; la valeur notée sur place l'emporte sur celle de Claude (D21) | L17 | M | G3, corpus (pour la pré-acceptation) | taux d'accord affiché ; tests du conflit et de l'escalade avec l'API simulée |
| **G18 bis** | **Petites corrections, tout de suite** : clés en double dans la liste des manques quand deux façades ont la même orientation (signalé par L17) ; `htaccess.template` de `buildsg/` resynchronisé (signalé par L18) | L17, L18 | S | — | console React propre ; `npm run buildsg` sans écart |
| **G19** | **Claude lit la forme du toit, les lucarnes et les détails des ouvertures** : ces attributs, encore en observation, deviennent des propositions (décochées tant que leur taux d'accord est sous 95 %) | L17 | M | G4, G5, G17, G18 | propositions comparées aux observations des audits réels |
| **G20** | **Renfort de Claude, la suite** : vraies réponses et taux d'accord par situation (coins non trouvés, ton sur ton…) ; recalage des coins dans l'audit (refaire l'analyse de la façade) ; masque d'occlusion hachuré dans l'élévation du relevé, et aide à la vérification sur plusieurs photos ; fin du renfort à chaque façade (D22) | L18 | M | corpus (taux d'accord), — (masque) | banc avec les vraies réponses enregistrées ; fumée du masque |

## 6. L'ordre, et ce qui peut avancer en parallèle

```
Sans corpus (tout de suite)
  G1 ──► G3 bis           G2          G3          G11 ──► G12          G15
  G17                     G18 bis     G20 (masque hachuré)

Avec les premières promenades et audits réels (phase 1 de T§13.3 atteinte)
  G1 + G2 ──► G4 ──► G5 ──► G6
  G1 ──► G7        G1 + G2 ──► G8        G1 ──► G9
  G3 + G11 ──► G13 ──► G14        G15 ──► G16
  G3 ──► G18 ──► G19 (après G4, G5, G17)        G20 (taux d'accord)

Ensuite, au fil du corpus
  G10 (une forme par PR)    nouveaux profils G14 et G16    G19
```

Je propose trois vagues :

- **Vague 3a, sans corpus** : G1, G2, G3, G3 bis, G11, G12, G15, G17, G18 bis, et la partie
  « masque hachuré » de G20. Ce sont des lots d'outillage et de mesure : ils ne changent aucune
  valeur calculée, donc AE 101, le banc et les empreintes restent identiques. Ils peuvent tourner à
  deux agents en parallèle (le conteneur a 4 processeurs), avec des branches empilées selon les
  dépendances, comme les vagues 1 et 2.
- **Vague 3b, dès la phase 1 atteinte** : G4 à G9 dans l'ordre de D15, puis G13, G18, et les
  premiers profils (G14, G16) dès que le corpus montre une contradiction. Les formes passent **une
  à une**, sans parallélisme entre elles : chacune change le banc, et deux formes en même temps
  rendraient le banc illisible.
- **Vague 3c, en continu** : G10, G19, la fin de G20 et les nouveaux profils, au rythme des
  promenades (phase 6 de T§13.3).

## 7. Ce que chaque lot doit prouver

- `npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test`.
- **AE 101 identique** (`npx tsx .claude/skills/toits/scripts/identite.ts`) pour tout lot de K1 et
  K3, et pour G1.
- **Empreintes golden identiques**, sinon version majeure documentée (voir K2).
- **Banc des villages avant et après** pour tout lot de K1 et K3 : compteurs, formes produites,
  bâtiments qui changent, avec leurs cartes. Un écart n'est pas un échec, mais il s'explique dans la
  PR.
- **Banc de façades avant et après** pour G11, G12, G14, G17 et G20.
- **Cas du corpus** : les cas `valide` passent tous ; un cas `a_corriger` qui se met à passer est
  signalé.
- **Fumée** sur les points touchés, dans les trois classes d'écran et les deux thèmes. Plage de
  numéros réservée à cette vague : **76 à 95**, répartie par lot au lancement (une plage par agent,
  pour éviter les collisions vues en vague 1).

## 8. Les risques, et leur parade

| Risque | Parade |
|---|---|
| Une forme détectée à tort (un Mansart dans chaque toit plat) | seuils hauts au départ ; faux positifs comptés sur le banc ; cartes des bâtiments qui changent relues ; contrôle par Claude sur les photos de rue (T§13.3 phase 4, après la règle) |
| Formes codées sans données pour les valider | les lots K1 attendent le corpus ; G3 bis fournit des cas candidats Panoramax à valider |
| Pas de couverture LiDAR HD sur un village visé (Saint-Aybert et Gommegnies n'en ont pas) | vérifier `dallesLidarSur` avant de retenir un village (D16) |
| Un profil qui règle un village et en dérègle un autre | un profil se déclenche sur des faits mesurables ; le taux de conformité est suivi par région ; la CI refuse deux profils de même précision |
| AE 101 qui bouge sous l'effet d'une forme (ses pignons depuis le faîtage pris pour des lucarnes) | `identite.ts` avant chaque commit ; la règle lucarne contre avant-corps (confusion 1) est écrite pour garder AE 101 tel quel |
| Une empreinte golden qui bouge avec les profils de façades | vérifié dès G12 ; version majeure documentée si elle bouge |
| La demi-croupe, que la mesure ne tranche pas | une question posée à l'utilisateur sur son projet ; dans le voisinage, la forme la plus simple tant qu'aucune observation ne dit le contraire |
| Le coût de Claude (cas candidats, escalade, renfort) | plafonds par organisation (lot L16) ; escalade seulement sur désaccord (D20) ; fin du renfort systématique (D22) ; coût suivi sur le tableau de bord de la consommation |

## 9. Le premier pas

1. **Vous** : les essais déjà demandés (focale EXIF sur iPhone ; clé Anthropic dans
   `plan-admin-config.php`), puis **trois à cinq audits réels** sur des bâtis différents, choisis
   pour les formes visées :
   - un pavillon d'Île-de-France avec lucarnes (votre quartier du Vésinet suffit) ;
   - un centre ancien à la Mansart (Versailles, Saint-Germain-en-Laye) ;
   - un village alsacien ou normand, pour les demi-croupes ;
   - une longère du Nord et un village provençal, pour les profils.
2. **Moi, en parallèle** : la vague 3a (G1, G2, G3, G3 bis, G11, G12, G15, G17, G18 bis, masque
   hachuré de G20). Elle prépare les outils qui transformeront vos audits en règles, sans rien
   changer à ce que Plan calcule aujourd'hui.
3. **Puis** : le skill `regles-toits` trie les cas de vos audits ; le tri confirme ou corrige l'ordre
   de D15, et la vague 3b commence par la forme qui revient le plus.

Je peux lancer la vague 3a dès votre feu vert, après la livraison de la vague 2.
