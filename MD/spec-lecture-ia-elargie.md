# Lecture élargie par l'IA : façade, toit, jardin, PLU, dossier et assistant — spec

*Rédigée le 29 octobre 2026, sur `main` à la version 5.0.0, schéma de fichier 7 (commit `3f23c21a`, après la fusion des lots F0 à F5 et F8 de
[`spec-facade-calage-audit.md`](spec-facade-calage-audit.md) ; F6 et F7 ne sont pas livrés), à la suite de la décision du propriétaire
« lancer l'ensemble ». Aucun code n'accompagne ce document : il fixe le périmètre, le classement de chaque élément contre ce que Plan sait
déjà, le modèle cible, le déroulé, les lots, leurs coûts et leurs risques. Les noms de fichiers et de fonctions cités existent ; le nom fait
foi sur les numéros de ligne. Les types esquissés au §4 sont des intentions de forme, pas du code à recopier.*

Lire d'abord : `CLAUDE.md` (le moteur de règles, les versions, la fumée), [`spec-facade-calage-audit.md`](spec-facade-calage-audit.md) (§8 :
un run par façade, trois lectures votées, une escalade à la demande ; §5 quater : un seul endroit où atterrir ; §9 bis : ce que F0 à F8 ont
livré et interprété), [`architecture.md`](architecture.md) §5.2.4 (ajouter un sujet à l'audit), [`spec-audit.md`](spec-audit.md) (§13.2 le
batch, §15.5 garder l'entrant et le sortant), [`spec-ouvrages.md`](spec-ouvrages.md) (le registre des ouvrages),
[`spec-arbres-3d.md`](spec-arbres-3d.md), [`spec-cloture.md`](spec-cloture.md), [`RELEASE.md`](RELEASE.md) §3 (schéma du fichier).

---

## 1. Intention

L'audit sait aujourd'hui lire une façade (calage, forme, ouvertures et leurs carreaux, parement) et, par l'analyse d'une maison, le toit
(forme, couverture, lucarnes, cheminées). Le propriétaire veut que **tout ce qu'une photo ou un document montre d'utile au projet** soit lu,
proposé, et retrouvé dans le plan, la 3D et le dossier de déclaration :

- **A. La façade** : menuiseries (couleur, matériau), garde-corps, bow-window, auvents, décrochés du mur, modénature, perron, store, unité
  extérieure de climatisation, boîte aux lettres ; et l'**état du bâti** (fissures, enduit abîmé, humidité), en signal seulement.
- **B. Le toit** : type, couverture et motif de pose, cheminées et lucarnes (F7), fenêtres de toit, panneaux solaires, débords, rives,
  gouttières.
- **C. Le jardin** (photo aérienne et photos du jardin) : plates-bandes à végétation basse dessinée en 3D, arbres nains, arbres et leur
  essence, regards, haies, clôtures, portails, murets, bordures, allées, terrasse et piscine existantes, potager, éclairage, robinet.
- **D. Le dossier et l'interface** : les règles de la zone du PLU lues dans son règlement et le projet contrôlé contre elles ; les textes de
  la déclaration préalable rédigés depuis le projet ; une relecture avant l'export ; un assistant en langue naturelle qui traduit une demande
  en commandes du registre, validées d'un geste.

**Le fait qui structure toute la spec** : rien de ce qui est lu n'entre dans le projet par un autre chemin que celui de la façade aujourd'hui.
**L'IA propose, ses lectures deviennent des observations, les règles décident, la personne confirme.** Le jardin, le PLU, les textes et
l'assistant suivent la même discipline que le toit : une proposition décochée, un moteur qui tranche, une étape d'historique que Ctrl+Z
défait.

### Décisions de la personne (à ne pas rediscuter)

1. **Tout le périmètre est lancé** (« lancer l'ensemble », 29 octobre 2026) : A, B, C, D et les trois demandes d'avant (couleur et matériau
   des menuiseries, couverture du toit, état du bâti, essence des arbres). Il se découpe en sept lots, L0 à L6 (§7).
2. **L'IA propose, le moteur tranche, la personne confirme.** Une lecture n'écrit jamais le projet : elle devient une observation que les
   règles relisent (`facade/regles/`, `app/regles/sujets/`), puis une proposition **décochée** dans l'avant/après de l'audit
   (`validation.ts`, `PropositionsAudit.tsx`) ou dans le panneau qui la porte. C'est vrai du jardin, du PLU, des textes et de l'assistant.
3. **La façade et le toit se lisent dans le run d'une façade, sans requête de plus.** Les champs de A et de B entrent dans le schéma du run
   (`src/regles/sujets/descriptions/facadesRun.ts`) : une image, trois lectures votées (`facades.ia.passes`), une escalade à la demande
   (décision 14 de la spec des façades). Une requête nouvelle ne part que là où l'**entrée** est autre : la photo aérienne et les photos du
   jardin (L3), le règlement du PLU (L4), la rédaction d'un texte (L5), une demande à l'assistant (L6).
4. **Les dimensions viennent du plan et du LiDAR, jamais de la photo** (décision 1 de la spec des façades). Une hauteur de garde-corps, un
   bandeau, un soubassement se lisent en **part** (`v`, en hauteurs d'égout) et deviennent des mètres par le calage du mur ; une profondeur
   (bow-window, auvent, décroché) ne se lit pas sur une vue de face : elle vient du LiDAR, du cadastre, ou d'une valeur par défaut dite.
5. **Un seul endroit où atterrir** (§5 quater de la spec des façades). Chaque élément lu a une place, une seule, dans le modèle : le tableau
   du §3 la nomme. Un élément n'est jamais à la fois un détail de façade et un objet du plan.
6. **Haiku par défaut, Sonnet à la demande seulement.** Toutes les lectures partent sur le modèle de leur usage (`MODELE_PAR_USAGE`,
   `claude-haiku-5-5`) ; l'escalade (usage `escalade`, `claude-sonnet-5-5` par défaut) n'est jamais automatique : un bouton qui dit son
   coût, une requête. Cette règle vaut pour chaque nouvel usage (jardin, PLU, texte, assistant).
7. **Tout est gardé** (décision du propriétaire) : chaque passe brute, les versions du prompt et du schéma, le modèle, les tokens, le coût, et
   en plus **l'image exacte envoyée** (le JPEG compressé, tel que Claude l'a vu) et un **export « données d'analyse »** qui couvre tous les
   audits. C'est le lot L0 ; aucun lot qui appelle Claude ne se fusionne avant lui.
8. **L'état du bâti est un signal, jamais une décision.** Une fissure ou de l'humidité lue sur une photo se dit (« Signalé par Claude, à
   vérifier ») ; elle ne propose rien, ne change aucun nombre, n'entre dans aucun export remis à un tiers (dossier, note, PDF).
9. **Une règle du PLU lue est une proposition citée, jamais une autorisation.** Chaque valeur porte sa source (le fichier, sa date
   d'approbation, la page et l'article) ; la personne la confirme avant qu'elle serve à un contrôle ; un contrôle rend une **alerte**,
   jamais un refus. Le PLU reste « une information de repérage » (`zones/resultats/Plu.tsx`).
10. **Un texte du dossier est un brouillon à relire.** Rédigé par Claude, il s'enregistre dans le projet **une fois relu et validé** ; un
    export n'imprime qu'un texte validé, à l'identique à chaque export. Sans texte validé, l'export garde le texte calculé d'aujourd'hui
    (`cerfa13703.ts`, `C2ZD1_description`).
11. **La relecture avant l'export est déterministe.** Elle relève les incohérences par des règles (pièces manquantes, cotes absentes,
    contrôles du PLU, textes non validés, objets proposés non confirmés), sans appel à Claude : un même projet donne la même relecture.
12. **L'assistant ne fait rien que la personne ne pourrait faire.** Il traduit une demande en une liste de commandes du registre
    (`app/commandes.ts`) et d'écritures de champs (`ui/champs/`), chacune lue par `commandes.etat(id)` (droits, capacités, lecture seule) ;
    la liste se montre, se valide **d'un seul geste**, en **une** étape d'historique.
13. **La végétation basse d'une plate-bande se dessine par défaut en 3D** (décision du propriétaire), comme le gazon : seul son retrait
    s'écrit. C'est un changement de rendu de la démonstration (onze plates-bandes) : version majeure, empreinte `glb-structure.json` refaite
    et dite dans `EMPREINTES.md`.
14. **Ce qui est lu se dessine** : couleur et matériau des menuiseries, garde-corps par type, motif de pose de la couverture, modénature lue,
    saillies, végétation. Un fichier qui ne porte pas le champ se dessine **exactement comme avant** (la règle de F8).
15. **Prompts et schémas générés, vocabulaire fermé.** Chaque champ nouveau entre par une description de sujet et `npm run regles:generer` ;
    `indetermine` partout où un champ peut manquer ; un champ qu'aucun lecteur n'utilise n'entre pas ; un texte changé monte sa version dans
    `versions.ts`.
16. **L1 et L2 suivent F7.** F7 change l'image du run (la bande au-dessus de l'égout) et son prompt ; L1 puis L2 partent de la version que F7
    aura posée, l'un après l'autre (un seul lot à la fois dans `facadesRun.ts`).
17. **Aucun code mort** (décision 19 de la spec des façades) : chaque lot supprime, dans la même PR, ce que son ajout remplace, et le dit dans
    son bilan de suppression.
18. **Un export changé est une version majeure** (`MD/RELEASE.md`) ; les empreintes de `tests/fixtures/golden/` ne bougent pas sans être
    dites. Un lot dont l'ajout n'apparaît qu'avec le champ nouveau ne change aucune empreinte.
19. **Un changement de forme du fichier monte le schéma de un** (`RELEASE.md` §3.1, `model/migrations.ts`, `CHAMPS_DEPUIS`). Le schéma est
    à 7 ; la plateforme accepte déjà **7 à 12**. Les lots prennent leur numéro **dans l'ordre de leur fusion** (le premier fusionné prend 8) ;
    un sixième changement attend que la plateforme accepte 13.
20. Textes de l'interface en français avec accents et vouvoiement ; commentaires de code en français sans accents, qui disent pourquoi.

---

## 2. Ce qui existe déjà (relevé du 29 octobre 2026)

| Brique | Où | Ce qu'elle fait aujourd'hui |
|---|---|---|
| Run d'une façade | `src/regles/sujets/descriptions/facadesRun.ts` → `deploy/prompt-facade.md` (v2), `deploy/schema-facade.json` (v2) ; `app/audit/parcelle/runsFacades.ts`, `app/releve/runFacade.ts` | Calage (angles, pointes, appentis, corps, `cache`), forme (`silhouette`, `bout`), `elements` (`cheminee`, `lucarne`), `surface` (parement), `ouvertures` (type, boîte, niveau, travée, `details.volets`/`allege`/`forme`, `carreaux`) ; trois passes votées (`voterObservations`), escalade (`escaladerObservations`) |
| Analyse d'une maison | `deploy/prompt-analyse.md` (v9), `deploy/schema-analyse.json`, sujets `app/regles/sujets/` (`couverture`, `cheminees`, `terrasse`, `facades`, `murs`, `formeToit`, `lucarnes`, `elements`, `transverse`) | Forme, profil, faîtage, lucarnes, souches (position, matériau), terrasse, **couverture** (`tuile-plate` … `vegetale`), `elements` du toit (`fenetre-de-toit`, `verriere`, `garde-corps`…), par façade : volets, forme, vitrage, ouvrant, porte, garage, **`couleurVolets`**, matériau, **`teinteMurs`**, **`decorMurs`** (`colombages`, `chainages-brique`, `bandeaux`) |
| Ouvertures | `model/typesReleve.ts` (`TypeOuverture`, `DetailsOuverture`, `CarreauxOuverture`), façade objet (F5) | `volets`, `ferme`, `allege` (`pleine`, `balcon`, `garde-corps`), `forme`, `vitrage`, `ouvrant`, `remplissage`, `garage`, `couleurVolets` (hex), `carreaux` ; **aucune couleur ni matière de menuiserie** |
| Dessin des ouvertures | `three/detailsOuvertures.ts` (garde-corps à barreaux aux constantes `gardeCorps`), `three/carreaux3d.ts` (F8), `three/releve3d.ts` | Un seul garde-corps (barreaux), un cadre de la couleur de la pierre du mur (`detailsBatiment.ts`, `encadrement`) |
| Maçonnerie | `three/fenetresRelief.ts`, `three/detailsBatiment.ts` (`corniche`, `bandeaux`, `chaines`) | **Déduite de l'époque** (BD TOPO, `date_d_apparition`), jamais lue ; `PartieBasse` (soubassement) du relevé |
| Toit | `model/typesToit.ts` | `FormeToit` et catalogue, `CorpsToit` (`cheminees`, `lucarnes`, `bords` : `debordEgoutM`, `saillieRiveM`, `ouvert`, `retraitM`, `saillie`, `elementsToit`, `baie`) ; `SaillieFacade` (`bow-window`, `galerie`, `appentis` ; `forme`, `niveau`, `toit`, `hauteurM`) ; `ElementDeToit` (`fenetre-toit`, `solaire`) ; `Toit.couverture` (`CouvertureChoisie` : `tuile`, `tuile-plate`, `tuile-canal`, `ardoise`, `ardoise-losange`, `zinc`) |
| Couverture | `model/couleurToit.ts` (`MateriauCouverture`, `materiauCouverture`), `three/couverture.ts` | Textures tuiles, ardoises, **ardoise en losange**, zinc ; **pas d'écaille** ; le matériau et le motif sont un seul mot |
| Ouvrages | `model/ouvrages/` (registre `OUVRAGES`), `model/fonctions.ts` | `massif`, `equipement`, `chemin`, `dalle`, `mobilier`, `limite`, `arbre`, `terrasse`, `piscine`, `pergola`, `carport`, `annexe`… ; **aucun sous-type** d'équipement ni de massif |
| Équipement | `model/ouvrages/surfaces.ts::EQUIPEMENT`, `engine/structure.ts::findSpaZones` | **Tout équipement qui mord sur une terrasse la renforce** (appuis resserrés) : c'est le jacuzzi |
| Massif | `MASSIF` (élévation 0,6 m) | Un volume générique ; **les haies et la végétation de l'IGN arrivent en massif** (`geo/cadastreObjets.ts`) ; la démonstration en a onze (« Platebande … ») |
| Clôture | `model/typesCloture.ts`, `ui/champs/cloture.ts` | Par côté : `palissade`, `grillage`, `haie` (six essences), `mur` (parement, couvertine, soubassement) ; portails et portillons ; `hauteurMaxRue`, `hauteurMaxSeparative` **saisies à la main** « d'après le règlement du PLU » |
| Audit, prise | `model/auditParcelle.ts` (`CaptureParcelle`) | Photos des bâtiments par façade, de la clôture, du portail ; **aucune photo du jardin** ; l'audit ne lit ni clôtures, ni arbres, ni maisons voisines (`entreesAnalyse.ts`) |
| Arbres | `model/especesArbre.ts`, `data/admin/arbres.json` (40 essences, dix par taille), `admin/arbres` | Une essence = `id`, `nom`, `caduc`, `natures` (BD TOPO), `hauteurM`, `diametreM`, réglages EZ-tree ; **la bibliothèque est une donnée de l'administrateur**, pas du code |
| PLU | `geo/apiIgn.ts::interrogerPlu`, `model/types.ts::ZonagePlu`, `zones/resultats/Plu.tsx`, capacité `plan.plu` | Zonage, libellé, type, date d'approbation, **lien du règlement PDF** (`urlfic`), prescriptions, informations, servitudes, SPR ; **aucune règle lue** ; la piscine avertit « la plupart des PLU imposent 3 m » (`engine/piscine/calcul.ts`) |
| Déclaration préalable | `export/dossierMairie.ts`, `export/piecesDP.ts`, `export/cerfa13703.ts` | Cerfa 13703*12 rempli (description calculée `C2ZD1_description`), DP1 à DP4, DP6 (la Vue 3D) ; une liste de **`manques`** (DP7 et DP8 toujours manquantes) ; DP11 seulement au dossier piscine |
| Conservation | `regles/facades/observations.ts::RunEnregistre`, trace du serveur (`spec-audit.md` §15.5), `export/benchmarkAnalyses.ts` | Passes, versions, modèle, tokens, coût, escalade ; trace serveur `entrant.json` / `sortant.json` / images quand le batch nomme son audit ; comparaison **par audit** |
| Commandes | `app/commandes.ts`, `app/exposition.ts`, `ui/champs/` | Le registre, son état (`etat(id)`), l'exposition par classe d'écran ; les descripteurs de champs (lire, écrire, déclencher) |
| Serveur | `deploy/analyse-fonctions.php` (`USAGES` : `analyse`, `escalade`, `immediat`, `candidats`, `rejeu`, `facade`), `deploy/claude-tarifs.json` | Haiku 0,1 $ / 0,5 $ le million de tokens (entrée / sortie), × 5 au-delà de 100 000 tokens d'entrée ; Sonnet 2 $ / 10 $ ; batch − 50 % ; **aucun envoi de document PDF** |

### 2.1 Les deux trous de la conservation

1. **L'image envoyée n'est pas gardée avec le run.** `RunEnregistre.image` n'en garde que `{ largeur, hauteur }`. La trace du serveur
   (`analyses/<…>/images/<sha256>`) ne l'a que si le batch nomme son audit : une analyse sans dépôt « part quand même, sans trace »
   (`spec-audit.md` §15.5), et l'escalade (appel immédiat) comme « Rappeler Claude » de la calibration n'en laissent aucune. Rejouer une
   façade avec un prompt nouveau demande l'image **exacte** (compression comprise), pas une image refaite par une chaîne qui a pu changer.
2. **Aucun export ne traverse les audits.** `benchmarkAnalyses.ts` compare les analyses **d'un** audit ; « Exporter (JSON) » rend **une**
   analyse. Mesurer un prompt sur le corpus (combien de garde-corps lus, à quelle confiance, pour quel coût) demande d'ouvrir chaque audit.

### 2.2 Ce qui rend le périmètre délicat

- **Un équipement renforce la terrasse qu'il touche** (`findSpaZones`). Une pompe à chaleur, un regard ou un robinet proposés en
  `equipement` sur une terrasse changeraient ses appuis et son chiffrage : la nature doit dire si elle charge (§4.4).
- **Rien ne dit « existant ».** Une terrasse ou une piscine lue sur la photo aérienne, proposée en `terrasse` ou `piscine`, entrerait dans
  la nomenclature chiffrée et dans le dossier comme un projet. Le modèle doit distinguer l'existant du projeté (§4.4, question 1).
- **Les haies de l'IGN sont des massifs.** La végétation par défaut des plates-bandes (décision 13) toucherait aussi les haies et zones de
  végétation importées, voisinage compris, si rien ne les distingue.
- **Deux vocabulaires de couverture** : l'analyse d'une maison lit `tuile-mecanique`, `bac-acier`, `membrane`, `gravillons`, `vegetale`, que
  `CouvertureChoisie` ne connaît pas ; et `ardoise-losange` mêle un matériau et un motif.
- **La bibliothèque d'essences change sans PR** (l'administrateur l'édite) : un schéma généré ne peut pas énumérer ses identifiants.
- **Le serveur ne sait ni chercher ni envoyer un PDF.** Le règlement est au Géoportail de l'urbanisme (`urlfic`), souvent cent pages et
  plus.

---

## 3. Classement : ce que Plan sait déjà (✅), à étendre (⚠️), à créer (❌)

Colonnes : **Plan** dit ce qui existe ; **Atterrit** le seul endroit où va la lecture (décision 5) ; **Lu par** la requête qui le lit ;
**3D** ce qui se dessine.

### 3.1 A — La façade (lot L1, dans le run d'une façade)

| Élément | Plan aujourd'hui | État | Atterrit | Lu par | 3D |
|---|---|---|---|---|---|
| Fenêtre, porte-fenêtre, porte, garage | `TypeOuverture`, façade objet (F5), run v2 | ✅ | ouverture de la façade objet | run (existant) | existant |
| Volets, couleur des volets | `details.volets`, `couleurVolets` (hex) ; l'analyse d'une maison lit `couleurVolets` en mots | ⚠️ le run ne lit pas la couleur | `details.couleurVolets` | run | existant |
| Garde-corps, rambarde | `allege: 'garde-corps' \| 'balcon'`, un dessin à barreaux | ⚠️ ni type, ni hauteur, ni couleur | `details.gardeCorps` : `type` (`barreaux`, `fer-forge`, `verre`, `plein`), hauteur en part (`v`), couleur | run | un dessin par type, à la hauteur calée |
| Couleur et matériau des menuiseries | rien (cadre couleur pierre) | ❌ | `details.menuiserie` : `materiau` (`bois`, `pvc`, `alu`, `acier`), `couleur` (mot d'une palette fermée → hex) | run | cadre, dormant et petits bois de cette couleur et de cette matière |
| Bow-window | `SaillieFacade` `bow-window` (`forme`, `niveau`, `toit`, `hauteurM`), `BaieToit` ; posé à la main au Mode Toit | ⚠️ jamais lu | une **saillie** du corps (toit), par observation confirmée | run : `saillies[]` (`genre`, `u0`, `u1`, `forme`, `niveau` : `rdc` ou `toit`, `toit` : `pan`, `pavillon`, `plat`, haut en `v`) | existant (saillie) |
| Auvent « colonial » (galerie sur poteaux, toit en appentis) | `SaillieFacade` `galerie`, `toit: 'pan'` ; `CorpsToit.ouvert`, `retraitM` (poteaux) | ⚠️ jamais lu | saillie `galerie` | run (`saillies[]`) | existant |
| Auvent, marquise sur consoles | rien | ❌ genre nouveau | saillie `auvent` (sans poteaux, sur consoles ; `couverture` : `verre`, `tuile`, `zinc`, `autre`) | run (`saillies[]`) | nouveau (dalle mince, consoles) |
| Décalage sur un mur de façade (décroché, avancée, retrait) | le contour vient du cadastre ou de la BD TOPO ; retouche à la main (`retoucheMain`) | ❌ | **observation** qui propose une retouche du contour, confirmée ; la profondeur vient du LiDAR, jamais de la photo | run : `decroches[]` (`u`, `sens` : `avance` ou `recul`) | le contour retouché |
| Gouttière, descentes | rien (la gouttière n'est qu'une arête pour la vision) | ❌ | gouttière : `bords` du toit (L2) ; descentes : `modenature.descentes[]` (`u`) | run | descentes : un tube contre le mur ; gouttière : L2 |
| Appuis, encadrements | encadrement selon l'époque | ⚠️ déduit, jamais lu | `modenature.encadrements` (`aucun`, `enduit`, `pierre`, `brique`) | run | remplace l'époque sur ce mur |
| Bandeaux | époque ; l'analyse d'une maison lit `decorMurs: 'bandeaux'` | ⚠️ | `modenature.bandeaux[]` (`v`) | run | à la hauteur lue |
| Corniche, génoise | `corniche` selon l'époque | ⚠️ ; génoise ❌ | `modenature.egout` (`aucune`, `corniche`, `genoise` et son nombre de rangs) | run | corniche existante ; génoise nouvelle |
| Chaînes d'angle | époque ; `chainages-brique` à l'analyse d'une maison | ⚠️ | `modenature.chaines` (`aucune`, `pierre`, `brique`) | run | existant, par lecture |
| Soubassement | `PartieBasse` du relevé (`debut`, `fin`, `hauteur`) | ⚠️ ni parement ni lecture | `modenature.soubassement` (`v`, parement) → `PartieBasse` | run | existant + parement |
| Perron, marches, seuil | rien | ❌ | `equipement`, nature `perron` (nombre de marches lu ; profondeur par défaut), posé contre le mur, sous la porte | run (`appendices[]` : `nature`, `u0`, `u1`) | marches |
| Store banne | rien | ❌ | équipement de façade : `modenature.appendices[]` nature `store` (pas un objet du plan : il est porté par le mur) | run | caisson et toile repliée |
| Unité extérieure (climatisation, pompe à chaleur) | rien | ❌ | `equipement`, nature `unite-exterieure`, au pied du mur ou en console | run | un caisson |
| Boîte aux lettres | rien | ❌ | `equipement`, nature `boite-aux-lettres`, sur la clôture ou le mur | run (façade) ou photo du portail (L3) | un caisson |
| État du bâti : fissures, enduit abîmé, humidité, mousses | rien | ❌ | **signal** : `etat[]` de la Façade (`nature`, zone `u`/`v`, `confiance`), montré, jamais proposé | run | rien (décision 8) |

### 3.2 B — Le toit (lot L2, dans le run, sur la bande au-dessus de l'égout que F7 ajoute)

| Élément | Plan aujourd'hui | État | Atterrit | Lu par | 3D |
|---|---|---|---|---|---|
| Type de toit | `FormeToit`, diagnostic de forme par corps (F4) | ✅ | toit du corps, par le moteur (`corpsSousContrainte`) | run (`silhouette`, `bout`, `pointes`) et analyse d'une maison | existant |
| Matériau de couverture | `Toit.couverture`, `materiauCouverture` (fichiers fonciers, couleur, pente) ; l'analyse d'une maison le lit | ⚠️ le run ne le lit pas ; deux vocabulaires | `Toit.couverture`, par la règle de la couverture (sujet `couverture`) | run : `toit.couverture` (le vocabulaire de l'analyse d'une maison) | existant ; `bac-acier`, `membrane`, `vegetale` nouveaux |
| Motif de pose : droite, diagonale ou losange, écaille | `ardoise-losange` (matériau et motif en un mot), texture losange | ⚠️ losange ; ❌ écaille | `Toit.pose` (`droite`, `losange`, `ecaille`) ; `ardoise-losange` relu comme `ardoise` + `losange` | run : `toit.pose` | texture écaille nouvelle (tuile plate et ardoise) |
| Cheminées, lucarnes | `Cheminee`, `Lucarne`, `elements` du run (F7) | ✅ par F7 (en cours) | toit du corps (F7) | run | existant |
| Fenêtres de toit | `ElementDeToit` `fenetre-toit` (Mode Toit) ; `fenetre-de-toit` à l'analyse d'une maison | ⚠️ le run ne le lit pas | `elementsToit` du corps : `sM` du `u`, `dM` du `v` par la géométrie du pan (une règle) | run : `elements` gagne `fenetre-toit` | existant |
| Panneaux solaires | `ElementDeToit` `solaire` | ⚠️ jamais lu | `elementsToit` (`solaire`, étendue en `u`) | run : `elements` gagne `solaire` | existant |
| Débord à l'égout, saillie des rives | `BordsToit.debordEgoutM`, `saillieRiveM` | ⚠️ jamais lu | `bords` : **le LiDAR l'emporte** (emprise du toit moins le contour), la photo signale un écart | run : `toit.debord` (`aucun`, `faible`, `fort`) | existant |
| Faîtage (tuiles faîtières, crête) | rien | ❌ | `bords.faitage` (`tuiles`, `zinc`, `crete`) | run | un faîtage dessiné |
| Gouttière | rien | ❌ | `bords.gouttiere` (`pendante`, `nantaise`, `aucune`) | run | une gouttière le long de l'égout |

### 3.3 C — Le jardin (lot L3, requêtes nouvelles : la photo aérienne et les photos du jardin)

| Élément | Plan aujourd'hui | État | Atterrit (objet proposé sur le plan) | Lu par | 3D |
|---|---|---|---|---|---|
| Plate-bande (fleurs, arbustes, vivaces) | `massif` (volume de 0,6 m) | ⚠️ | `massif` + `plantation` (`fleurs`, `arbustes`, `vivaces`, `mixte`, `potager`, `haie`), `hauteurM` | aérienne (contour) + photos (nature) | **végétation basse par défaut** (lots instanciés, comme les arbres) |
| Mini-arbre (arbre nain) dans une plate-bande | `arbre` (essence, dimensions) | ⚠️ aucune notion de nain | `arbre` d'une petite essence de la bibliothèque, à ses dimensions | photos | EZ-tree, existant |
| Arbre et son essence | `arbre`, `especeArbre`, 40 essences | ⚠️ jamais lu | `arbre` : le mot lu (genre, caduc ou persistant, port) → **l'essence la plus proche** de la bibliothèque, par une règle ; diamètre du houppier sur l'aérienne, hauteur au LiDAR (MNH) | aérienne + photos | existant |
| Regard | rien | ❌ | `equipement`, nature `regard` (ne charge pas) | aérienne (souvent) + photos | une plaque |
| Haie | `cloture` côté `haie` (sur la limite) ; massif de l'IGN | ✅ sur la limite ; ⚠️ dans le jardin | sur la limite : le côté de la clôture ; dedans : `massif` `plantation: 'haie'` | aérienne + photos | haie existante ; massif haie |
| Clôture | `cloture` par côté (type, hauteur) | ✅ | côté de la clôture (proposé, comme l'audit propose déjà le type et la hauteur saisis) | photos de clôture (existantes) | existant |
| Portail, portillon | `cloture.portails` | ✅ | portail de la clôture | photos du portail (existantes) | existant |
| Muret | `cloture` `mur`, `soubassement` | ✅ sur la limite ; ❌ dedans | sur la limite : le côté ; dedans : `limite` ou `autre` (question 6) | photos | existant |
| Bordures | `bordure` de la terrasse construite seulement | ❌ | `massif.bordure` (`pierre`, `bois`, `acier`, `beton`) | photos | une bordure au pourtour |
| Allée, chemin | `chemin` (largeur, tracé) | ✅ | `chemin` (`existant`) | aérienne | existant |
| Terrasse existante | `dalle` ; `terrasse` est **chiffrée** | ⚠️ | `dalle` (ou objet marqué `existant`, question 1) — jamais `terrasse` | aérienne | existant |
| Piscine existante | `piscine` est **chiffrée** (dossier piscine) | ⚠️ | objet `existant` (question 1) | aérienne | existant |
| Potager | rien | ❌ | `massif` `plantation: 'potager'` | aérienne + photos | végétation basse (rangs) |
| Éclairage | rien | ❌ | `equipement`, nature `eclairage` (borne, applique ; ne charge pas) | photos | une borne |
| Robinet | rien | ❌ | `equipement`, nature `robinet` (ne charge pas) | photos | un petit fût |
| Boîte aux lettres | rien | ❌ | voir A | photos du portail | voir A |

### 3.4 D — Le dossier et l'interface (lots L4, L5, L6)

| Élément | Plan aujourd'hui | État | Atterrit | Lu par | Sortie |
|---|---|---|---|---|---|
| (6) Règles de la zone du PLU | zonage et lien du règlement (`ZonagePlu.zones[].urlfic`) ; deux hauteurs de clôture saisies à la main | ⚠️ | `parcelle.plu.regles` : **règles de zone lues**, chacune avec sa valeur, son unité, sa source (fichier, date, page, article) et son état (`proposee`, `confirmee`, `main`) | requête nouvelle (usage `plu`) sur les pages de la zone | alertes dans Résultats › PLU et dans la relecture |
| (6) Contrôles du projet | « 3 m » générique de la piscine ; hauteurs de clôture | ⚠️ | règles du moteur (`facade/regles/plu/`) : hauteur maximale, reculs (voie, limites séparatives), emprise au sol, couleurs imposées, hauteurs de clôture | — (déterministe) | alertes |
| (7) Notice descriptive, insertion paysagère | description calculée du cerfa ; DP6 = image de la Vue 3D | ⚠️ | `projet.dossier.textes` (brouillon, puis texte validé) | requête nouvelle (usage `texte`) | le cerfa, une page de notice (et DP11 en secteur protégé) |
| (8) Relecture avant l'export | `manques` du cerfa | ⚠️ | module de relecture (déterministe) | — | un panneau avant « Exporter », chaque point menant à son geste |
| (9) Assistant en langue naturelle | rien ; feuille de route §5.7 « Natural-language configuration » | ❌ | une liste de commandes et d'écritures de champs, montrée puis validée d'un geste | requête nouvelle (usage `assistant`) | une étape d'historique |

### 3.5 Les trois demandes d'avant

| Demande | Où elle est traitée | État |
|---|---|---|
| Couleur et matériau des menuiseries | §3.1, `details.menuiserie`, L1 | ❌ → L1 |
| Couverture du toit | §3.2, `Toit.couverture` et `pose`, L2 (l'analyse d'une maison la lit déjà : L2 l'ajoute au run, sur la façade vue de près) | ⚠️ → L2 |
| État du bâti | §3.1, `etat[]`, signal seulement, L1 | ❌ → L1 |
| Essence des arbres | §3.3, essence la plus proche de la bibliothèque, L3 | ⚠️ → L3 |

### 3.6 Bilan du classement

| Groupe | ✅ existe | ⚠️ à étendre | ❌ à créer |
|---|--:|--:|--:|
| A — Façade (19 lignes) | 1 | 9 | 9 |
| B — Toit (9) | 2 | 5 | 2 |
| C — Jardin (15 ; la boîte aux lettres est comptée en A ; haie et muret comptés ✅, leur cas sur la limite) | 5 | 5 | 5 |
| D — Dossier et interface (5) | 0 | 4 | 1 |
| **Ensemble (48)** | **8** | **23** | **17** |

La moitié du périmètre est déjà dans le modèle et n'attend que d'être **lue** ; ce qui est à créer tient surtout en sous-types (natures
d'équipement, plantation d'un massif, genre `auvent`) et en quatre usages nouveaux du serveur (`jardin`, `plu`, `texte`, `assistant`).

---

## 4. Modèle cible

Tous les ajouts sont **facultatifs** : un fichier d'aujourd'hui garde son sens et se dessine à l'identique (test d'aller-retour d'un fichier
ancien dans chaque lot).

### 4.1 Le run d'une façade, version suivante (L1, puis L2)

Ajouts au schéma du run, dans le repère du mur (`u` le long du mur, `v` en hauteurs d'égout), vocabulaire fermé, `indetermine` partout :

```text
ouvertures[].details.menuiserie   { materiau: bois|pvc|alu|acier|indetermine, couleur: <palette>|indetermine }
ouvertures[].details.couleurVolets <palette>|sans-objet|indetermine        (le mot ; la règle le traduit en hex)
ouvertures[].details.gardeCorps   { type: barreaux|fer-forge|verre|plein|indetermine, haut: v|indetermine, couleur: <palette>|indetermine }
saillies[]                        { genre: bow-window|galerie|auvent|appentis, u0, u1, forme, niveau: rdc|toit, toit: pan|pavillon|plat, haut: v, confiance }
decroches[]                       { u, sens: avance|recul, confiance }
modenature                        { egout: aucune|corniche|genoise, rangsGenoise, bandeaux: [v], chaines: aucune|pierre|brique,
                                    encadrements: aucun|enduit|pierre|brique, soubassement: { haut: v, parement }, descentes: [u] }
appendices[]                      { nature: perron|store|unite-exterieure|boite-aux-lettres, u0, u1, v0, v1, marches?, confiance }
etat[]                            { nature: fissure|enduit-abime|humidite|mousses|autre, u0, u1, v0, v1, confiance }
— L2 —
toit                              { couverture: <vocabulaire de l'analyse d'une maison>, pose: droite|losange|ecaille, debord: aucun|faible|fort,
                                    faitage: tuiles|zinc|crete, gouttiere: pendante|nantaise|aucune }
elements[].element                + fenetre-toit, solaire (avec u0, u1 et v sur le pan)
```

`<palette>` : une liste fermée de mots de couleur, celle de `couleurVolets` de l'analyse d'une maison (`blanc`, `creme`, `gris-clair`,
`gris-fonce`, `bleu`, `vert`, `rouge`, `brun`, `bois`, `noir`) complétée de `gris-anthracite` (la couleur la plus vendue des menuiseries
neuves). La table mot → hex est un **réglage** (`regles/facades/reglages.json`), pas une constante.

### 4.2 Ce que la façade objet et la Façade gagnent (L1)

```ts
// DetailsOuverture (model/typesReleve.ts), ajouts facultatifs
menuiserie?: { materiau?: 'bois' | 'pvc' | 'alu' | 'acier'; couleur?: string /* hex */; source: 'ia' | 'doigt' };
gardeCorps?: { type: 'barreaux' | 'fer-forge' | 'verre' | 'plein'; hauteurM?: number; couleur?: string; source: 'ia' | 'doigt' };

// ReleveFacade (la Façade, F5), ajouts facultatifs
modenature?: { egout?: …; bandeauxM?: number[]; chaines?: …; encadrements?: …; soubassement?: PartieBasse & { parement? }; descentesM?: number[] };
appendices?: { nature: 'store'; xM: number; largeurM: number; source: … }[];      // ce que le mur porte, pas un objet du plan
etat?: { nature: …; zone: { u0; u1; v0; v1 }; confiance: number; vuLe: string }[]; // un signal, jamais lu par un calcul
```

`modenature` lue **remplace**, sur ce mur seul, la maçonnerie déduite de l'époque (`fenetresRelief.ts`) ; un mur sans lecture garde
l'époque. Les mètres viennent des parts par le calage du mur (hauteur à l'égout du LiDAR ou `egoutChoisi`). Les groupes de
`model/protections.ts` gagnent `facadeModenature` (écrivains `audit`, `main`) ; `etat` n'a pas d'écrivain autre que l'audit.

Les **saillies** (bow-window, galerie, auvent) et les **décrochés** ne vont pas dans la Façade : ce sont des observations adressées au corps
(par son mur, `murDuCorps`, F4), que le moteur relit et que la personne confirme dans l'avant/après, comme une proposition de toit.
`GenreSaillie` gagne `auvent` ; `SaillieFacade` gagne `couverture?` (pour l'auvent) ; la profondeur d'une saillie lue est celle du LiDAR
quand il la voit, sinon la valeur par défaut du genre (un réglage), dite dans la proposition.

### 4.3 Le toit (L2)

`Toit` gagne `pose?: 'droite' | 'losange' | 'ecaille'` ; `CouvertureChoisie` gagne `tuile-mecanique`, `bac-acier`, `membrane`, `vegetale`
(les mots de l'analyse d'une maison que la 3D sait dessiner, ou saura) et perd `ardoise-losange` à l'écriture (relu `ardoise` + `losange`,
même texture, même `.glb`). `BordsToit` gagne `faitage?` et `gouttiere?`. Ce que lit le run arrive au sujet `couverture` et aux règles
existantes ; le moteur garde l'ordre : un toit figé ou saisi ne bouge pas, la couverture choisie dans l'inspecteur l'emporte.

### 4.4 Les ouvrages du jardin (L3)

```ts
// Ouvrage massif : ajouts facultatifs de l'objet
plantation?: { type: 'fleurs' | 'arbustes' | 'vivaces' | 'mixte' | 'potager' | 'haie'; hauteurM?: number; source: 'ia' | 'main' };
bordure?: { materiau: 'pierre' | 'bois' | 'acier' | 'beton'; hauteurM?: number };
vegetation3d?: false;            // seul son retrait s'ecrit, comme gazon3d

// Ouvrage equipement : sa nature, et ce qu'elle fait a la terrasse
nature?: 'spa' | 'perron' | 'unite-exterieure' | 'boite-aux-lettres' | 'regard' | 'eclairage' | 'robinet';

// Tout objet propose depuis une lecture de l'existant (question 1)
existant?: true;                 // hors nomenclature, hors chiffrage, « existant » au DP2
```

**La table des natures est une donnée** (`model/ouvrages/surfaces.ts`, à côté de l'ouvrage) : pour chacune, son libellé, sa forme admise,
son élévation par défaut, **si elle charge** (`findSpaZones` ne lit que les natures qui chargent) et son dessin. **Nature absente : `spa`**,
le sens d'aujourd'hui : le spa de la démonstration renforce toujours sa terrasse, les quantités ne bougent pas.

### 4.5 Le PLU (L4)

```ts
// ZonagePlu (model/types.ts), ajout facultatif
regles?: {
  zone: string;                              // le libelle de la zone lue (UFb)
  document: { url: string; sha256: string; datappro: string | null; pages: [number, number] };
  lues: RegleZone[];
  lueLe: string; modele: string; prompt: number; schema: number;
};
interface RegleZone {
  sujet: 'hauteur-max' | 'hauteur-egout-max' | 'recul-voie' | 'recul-limite' | 'emprise-sol-max' | 'pleine-terre-min'
       | 'cloture-hauteur-rue' | 'cloture-hauteur-separative' | 'couleurs-imposees' | 'materiaux-interdits' | 'autre';
  valeur?: number; unite?: 'm' | '%'; texte?: string;    // la phrase citee, toujours
  portee?: 'construction' | 'annexe' | 'piscine' | 'cloture' | 'tout';
  source: { page: number; article?: string };
  etat: 'proposee' | 'confirmee' | 'ecartee' | 'main';
  confiance: number;
}
```

Les règles **qui contrôlent** sont du code du moteur (`src/facade/regles/plu/`, couche 3), leurs seuils de tolérance un réglage
(`regles/plu/reglages.json`), leur contrat dans `src/regles/plu/` : la discipline du §5.2.4 d'`architecture.md`. Une règle de zone lue
**n'est pas un fait** au sens de `regles/toits/faits.json` (qui ne change que par PR) : c'est une donnée **du projet**, rangée sur sa
parcelle. Les deux hauteurs de clôture saisies à la main deviennent deux `RegleZone` d'état `main` (même stockage, une migration).

### 4.6 Les textes du dossier (L5)

```ts
// Projet, ajout facultatif
dossier?: { textes: { piece: 'description' | 'notice' | 'insertion'; brouillon?: Brouillon; valide?: { texte: string; le: string } }[] };
interface Brouillon { texte: string; le: string; modele: string; prompt: number; entrees: string /* sha256 des faits envoyes */ }
```

Un brouillon dont les entrées ont changé depuis (le projet a bougé) est dit **périmé** ; un texte validé ne se réécrit jamais seul.

### 4.7 L'assistant (L6)

Rien ne s'enregistre dans le projet : la demande et sa réponse vont au journal de consommation, la liste validée devient une étape
d'historique. Le contrat de sortie : `{ etapes: { commande?: string; champ?: { objet: string; cle: string; valeur: unknown }; pourquoi: string }[],
questions?: string[] }`, chaque identifiant pris dans un **catalogue** envoyé en entrée (les commandes exposées dans la classe d'écran, leurs
états, les champs de l'objet sélectionné et leurs bornes), généré par le code et mis en cache.

### 4.8 Les données d'analyse (L0)

- `RunEnregistre.image` devient `{ largeur, hauteur, sha256, octets }` et l'**image elle-même** (le JPEG envoyé, octet pour octet) est
  gardée **une fois** par empreinte : dans le fichier de l'audit (à côté de ses photos, même règle de partage), dans le cas de la
  calibration, et dans la trace du serveur (`images/<sha256>.jpg`). Les trois passes et l'escalade d'une façade envoient la même image : un
  seul fichier.
- **Toute** requête à Claude laisse une trace serveur, qu'elle nomme son audit ou non (une analyse sans dépôt se range sous l'organisation,
  `analyses/sans-depot/…`) ; l'escalade et « Rappeler Claude » aussi.
- **L'export « données d'analyse »** (Admin › Audits, « Exporter les données d'analyse ») : un fichier par choix de période, de modèle et
  d'usage, **une ligne par passe** — audit, parcelle (IDU), bâtiment, façade, usage, modèle, versions du prompt et du schéma, tokens, coût,
  empreinte de l'image, statut, et la sortie ramenée au schéma ; en **JSON** (`plan-donnees-analyse`, sorties complètes, réponse brute
  comprise) et en **CSV** (au format de `csvConsommation.ts`, une colonne par champ simple de la sortie votée). Les images ne partent que sur
  demande, par empreinte (une archive à part).

### 4.9 Fichier, schéma, versions

| Lot | Ce qui change dans le fichier du projet | Schéma | Migration |
|---|---|---|---|
| L0 | rien (le fichier de l'audit et le cas de calibration, qui ont leurs propres versions) | — | — |
| L1 | `details.menuiserie`, `details.gardeCorps`, `modenature`, `appendices`, `etat`, genre `auvent`, natures `perron`, `unite-exterieure`, `boite-aux-lettres` | +1 | identité |
| L2 | `Toit.pose`, couvertures nouvelles, `bords.faitage`, `bords.gouttiere` | +1 | `ardoise-losange` → `ardoise` + `losange` |
| L3 | `plantation`, `bordure`, `vegetation3d`, natures `regard`, `eclairage`, `robinet`, `existant` | +1 | identité |
| L4 | `plu.regles` | +1 | les deux hauteurs de clôture → `RegleZone` `main` |
| L5 | `dossier.textes` | +1 | identité |
| L6 | rien | — | — |

Cinq montées : de 8 à 12, toutes déjà acceptées par la plateforme ; le numéro se prend à la fusion (décision 19). Les versions du prompt et
du schéma du run montent à chaque lot qui les touche (L1, L2) ; chaque usage nouveau (`jardin`, `plu`, `texte`, `assistant`) a son prompt,
son schéma et sa table de versions dans `versions.ts`, générés comme ceux du run.

---

## 5. Le déroulé

### 5.1 Une façade (L1, L2) : rien de plus à faire pour la personne

1. La prise, le redressement, l'assemblage, le calage : inchangés (enchaînement É0 à É9).
2. **Le run** part comme aujourd'hui (trois passes votées) avec le schéma élargi. Le vote (`voterObservations`) s'étend aux champs nouveaux :
   la médiane des positions, le mot de la majorité, l'`indetermine` quand aucune majorité.
3. **Les règles** (`facade/regles/facades/ia.ts` et un module par famille : `menuiseries.ts`, `modenature.ts`, `saillies.ts`, `etat.ts`) font
   des observations des décisions : une couleur lue par deux passes sur trois devient une proposition ; un garde-corps n'est proposé que sur une
   ouverture retenue ; une saillie n'est proposée que si son étendue tombe dans un tronçon de corps (F4) ; une descente n'est proposée que si
   la détection voit une verticale à ce `u`.
4. **L'É7 et l'É9** montrent les détails des ouvertures (couleur, matière, garde-corps) ; l'**É8** montre les saillies, les décrochés et le
   toit (L2) comme propositions de corps ; une ligne « Signalé par Claude » dit l'état du bâti, sans case.
5. **La validation V4** écrit les détails cochés dans la façade objet et la Façade, en une étape d'historique ; les propositions de corps
   passent par l'avant/après et le moteur.
6. **L'escalade** (à la demande) relit tout, champs nouveaux compris ; elle l'emporte là où elle s'écarte (`escaladerObservations`).

### 5.2 Le jardin (L3)

1. **Prise** : l'audit gagne une étape « Jardin » (après la clôture et le portail) : des photos du jardin, libres, chacune située (GPS,
   boussole) comme une photo de façade.
2. **Photo aérienne** : l'orthophoto de la parcelle du projet (celle que l'analyse d'une maison reçoit déjà), **masquée hors de la
   parcelle** (les voisins n'entrent pas dans l'audit), avec le contour des bâtiments et des objets déjà posés en surimpression.
3. **Requêtes** : une requête « jardin » sur l'aérienne (trois passes votées) qui rend des **contours** en part de l'image (plates-bandes,
   allées, terrasse et piscine existantes, potager, houppiers, regards visibles) ; une requête par photo du jardin (trois passes) qui rend des
   **natures** (essence, plantation, bordure, éclairage, robinet, regard) et leur direction depuis la prise.
4. **Règles** (`facade/regles/jardin/`) : un contour aérien et une nature de photo s'apparient par la position de la prise et sa direction ;
   l'essence lue se ramène à **la plus proche de la bibliothèque** (`especePlusProche` : nom normalisé, puis caduc ou persistant, port et
   hauteur, dans cet ordre) ; la hauteur d'un arbre vient du LiDAR ; un objet qui en recouvre un existant ne se propose pas (il s'observe).
5. **Propositions** : une ligne par objet, décochée, dans l'avant/après, avec sa vignette ; cochée et validée, l'objet se pose sur le plan,
   marqué `existant` quand c'est de l'existant.

### 5.3 Le PLU (L4)

1. « Interroger le PLU » (existant) donne la zone et le lien du règlement.
2. **« Lire le règlement de la zone »** (commande `plu.lire`, capacité nouvelle) : le serveur va chercher le PDF au lien du Géoportail (liste
   d'hôtes permis, taille plafonnée), en garde l'empreinte ; le navigateur le montre et **propose les pages de la zone** (le sommaire du PDF
   quand il en a un, sinon la recherche du libellé de la zone) ; la personne les confirme ou les corrige (au plus 30 pages) ; seules ces pages
   partent (découpées par pdf-lib, déjà chargée pour le dossier).
3. **Requête** `plu` : les pages en document, la zone et la liste des sujets à chercher ; trois passes votées (des nombres) ; chaque règle
   rendue cite sa page et sa phrase.
4. **Règles** : la valeur votée, l'unité vérifiée, la phrase citée retrouvée dans le texte de la page (sinon la règle est écartée) ; puis les
   **contrôles** du projet (hauteur des bâtiments et des abris par `hauteurAuPointLePlusHaut`, reculs par la distance aux limites du DP2,
   emprise au sol, couleurs, clôtures).
5. **Résultats › PLU** montre chaque règle lue avec sa citation et sa case ; une règle confirmée nourrit les contrôles ; chaque contrôle en
   échec est une alerte (dans Résultats et dans la relecture).

### 5.4 Les textes et la relecture (L5)

1. **« Rédiger »** sur une pièce (description du cerfa, notice, texte d'insertion) : une requête `texte` (une passe : on ne vote pas une
   prose) avec les **faits du projet** sérialisés (ouvrages, dimensions, matériaux et couleurs, règles du PLU confirmées, existant) et la
   consigne de la pièce. Le brouillon se montre à côté des faits qui l'ont nourri.
2. La personne le **corrige et le valide** ; l'export imprime le texte validé, sinon le texte calculé d'aujourd'hui.
3. **La relecture** (« Vérifier avant l'export », et d'office à « Exporter le dossier ») : une liste de points, chacun avec sa gravité et le
   geste qui le règle — les `manques` du cerfa (déplacés, pas copiés), les contrôles du PLU en échec, un brouillon périmé ou non validé, un
   objet proposé non confirmé, une pièce sans image (DP6, DP7, DP8), une cote de distance absente au DP2.

### 5.5 L'assistant (L6)

1. Un champ « Demander » (Z8, les trois classes d'écran) ; la demande part avec le catalogue (§4.7).
2. La réponse est une **liste d'étapes** lisibles (« Poser une plate-bande de 4 m² le long de la façade sud »), chacune grisée avec sa raison
   si `commandes.etat` la refuse ; une question quand la demande est ambiguë.
3. **« Appliquer »** exécute la liste en une transaction, une étape d'historique ; une étape refusée en route annule tout.

---

## 6. Contrat avec l'IA : appels, modèles, coûts

Prix de `deploy/claude-tarifs.json` (Haiku 0,1 $ / 0,5 $ le million de tokens, Sonnet 2 $ / 10 $, batch − 50 %, Haiku × 5 au-delà de
100 000 tokens d'entrée). La mesure de référence est celle du run d'une façade (spec des façades §8) : **0,00153 $ par passe**, 0,0046 $ les
trois. Les autres chiffres sont des **estimations à mesurer** par `npm run verifier:api-claude` dans le lot qui crée l'usage ; le lot écrit
la mesure dans sa section du §9 bis.

| Lot | Appel | Usage | Requêtes | Entrée | Coût estimé, Haiku | Escalade Sonnet (à la demande) |
|---|---|---|---|---|---|---|
| L1 | **même run** que la façade | `facade` | 3 par façade (inchangé) | une image + texte ; sortie plus longue (+ 40 à 80 %) | ≈ 0,006 à 0,008 $ la façade | 1 requête, ≈ 0,03 à 0,05 $ |
| L2 | **même run** (image de F7) | `facade` | idem | idem | ≈ + 0,001 $ la façade | idem |
| L3 | aérienne de la parcelle | `jardin` | 3 par parcelle | une image 1 024 px | ≈ 0,003 $ | ≈ 0,02 $ |
| L3 | photos du jardin | `jardin` | 3 par photo | une image | ≈ 0,003 $ la photo (≈ 0,02 $ pour six) | ≈ 0,02 $ la photo |
| L4 | pages de la zone | `plu` | 3 | 10 à 30 pages, **sous 100 000 tokens** | ≈ 0,005 à 0,02 $ | ≈ 0,1 à 0,2 $ |
| L5 | rédaction d'une pièce | `texte` | 1 | faits du projet (≈ 4 000 tokens) | ≈ 0,002 $ | ≈ 0,03 $ |
| L5 | relecture | — | 0 | — | 0 | — |
| L6 | une demande | `assistant` | 1 | catalogue en cache + demande | ≈ 0,001 $ | ≈ 0,02 $ |

- **Haiku partout par défaut, Sonnet jamais d'office** (décision 6) ; le modèle de chaque usage nouveau se règle dans Réglages › Modèles.
- **Plafonds** : chaque usage nouveau entre dans les plafonds du serveur (jour, mois, engagé, estimation) et a sa ligne au tableau de bord
  de la consommation (« Jardin », « PLU », « Textes », « Assistant ») ; l'escalade se compte en escalade.
- **Ce qui est enregistré pour réanalyser** (L0 pour tous) : passes brutes, sortie ramenée au schéma, versions, modèle, tokens, coût, image
  ou document exact envoyé (par empreinte), et l'escalade. Pour le PLU : le PDF entier par empreinte et les pages envoyées. Pour un texte :
  les faits envoyés (par empreinte) et le brouillon. Pour l'assistant : la demande et la liste (journal seulement : ni projet ni photo).
- **Ce que Claude ne fait pas** : il ne mesure rien, n'écrit aucune dimension, ne décide d'aucune forme de toit, n'autorise rien au titre du
  PLU, ne signe aucun texte, n'exécute aucune commande.

---

## 7. Lots

Chaque lot est livrable seul : CI verte, CHANGELOG (`## [Non publié]`, avec une ligne « Supprimé » quand il en a), fumée sur les points
touchés, PR, merge par commit de merge. AE 101 ne bouge pas (`identite.ts`) ; les empreintes golden non plus, sauf L3 (décision 13), dit dans
`EMPREINTES.md` ; le tableau du banc des façades (redressement, fusion, calage) est identique avant et après.

| Lot | Livre | Supprime, dans la même PR | Critère d'acceptation |
|---|---|---|---|
| **L0 — Tout garder** | L'image exacte de chaque requête gardée par empreinte (audit, cas de calibration, trace serveur) ; une trace pour **toute** requête (sans dépôt, escalade, « Rappeler Claude ») ; l'export « données d'analyse » (JSON, CSV) à travers les audits ; le rejeu d'un run de façade depuis son image gardée | la branche « sans trace » de l'analyse sans dépôt ; `RunEnregistre.image` réduit à ses dimensions (relu tel quel, plus écrit) | Une façade rejouée depuis l'image gardée envoie **les mêmes octets** (empreinte égale) ; trois passes et une escalade = **une** image gardée ; l'export d'une période relit toutes les passes de tous les audits, CSV ouvert dans un tableur français ; aucun secret ni photo hors demande dans l'export (`verifier-paquet`) |
| **L1 — Façade enrichie** (A, état du bâti) | Le schéma du run élargi (§4.1, sans `toit`) ; le vote et les règles des familles nouvelles ; les champs de la façade objet et de la Façade (§4.2) ; les saillies et décrochés en propositions de corps ; le dessin 3D : menuiseries colorées, garde-corps par type, modénature lue, auvent, store, descentes ; natures d'équipement `perron`, `unite-exterieure`, `boite-aux-lettres` (qui ne chargent pas) | la maçonnerie déduite de l'époque **sur un mur dont la modénature est lue** (la règle reste pour les autres) ; le garde-corps unique codé en constantes (devient le type `barreaux`) ; les champs `facades.details.*` de l'analyse d'une maison que le run lit mieux, **si la mesure le dit** (question 9) | Ouvertures : rappel et précision du banc `ia-x1-x3.ts` **pas en dessous** de 99,2 % et 100 % moins un point ; sur la façade d'AE 101, couleur des menuiseries et garde-corps lus et dessinés ; un fichier sans champs nouveaux se dessine à l'identique (`glb-structure.json` inchangé) ; l'état du bâti ne change aucun nombre ni export ; une saillie acceptée passe par le moteur seulement |
| **L2 — Toit enrichi** (B) | `toit` du run (couverture, pose, débord, faîtage, gouttière), `elements` `fenetre-toit` et `solaire` ; `Toit.pose`, couvertures nouvelles, `bords.faitage`, `bords.gouttiere` ; textures écaille, bac acier, membrane, végétale ; gouttière et faîtage dessinés | l'écriture de `ardoise-losange` (relu `ardoise` + `losange`) ; la table de correspondance des deux vocabulaires de couverture remplace les traductions locales | La démonstration et AE 101 identiques (`glb-structure.json`, `identite.ts`) ; une couverture lue sur la façade et à l'analyse d'une maison se départage par une règle écrite (la plus proche l'emporte, question 8) ; un débord lu ne change pas celui du LiDAR (alerte seulement) ; une fenêtre de toit lue se pose sur le bon pan du bon corps |
| **L3 — Jardin** (C, essence des arbres) | L'étape « Jardin » de l'audit ; les usages `jardin` (aérienne, photos) ; les règles d'appariement, `especePlusProche` ; `massif.plantation`, `bordure`, `vegetation3d` ; natures `regard`, `eclairage`, `robinet` ; la marque `existant` ; **la végétation basse par défaut** | le volume générique de 0,6 m d'un massif à plantation (remplacé par sol et végétation) | La démonstration se dessine avec ses onze plates-bandes plantées : **`glb-structure.json` recalculé et dit** (version majeure) ; aucune quantité ne bouge (`moteur-terrasses.json`, `quantites-demo.txt` identiques : une nature absente reste un spa) ; un objet `existant` n'entre ni dans la nomenclature ni dans le chiffrage ; rien n'est lu hors de la parcelle ; Vue 3D : pas plus de 10 % d'appels de dessin en plus en Normale (`?fps=on`) |
| **L4 — PLU** (D6) | `plu.lire` : le PDF par le serveur, le choix des pages, l'usage `plu`, les règles de zone lues et citées ; les contrôles (`facade/regles/plu/`) ; Résultats › PLU et ses cases | les deux champs de hauteur de clôture comme stockage propre (devenus `RegleZone` `main`) ; l'avertissement générique « 3 m » de la piscine **quand un recul est lu** (il reste en repli) | Sur le règlement du Vésinet, zone UFb (point 15) : hauteur, reculs et emprise lus avec leur page ; une valeur dont la phrase ne se retrouve pas dans la page est écartée ; aucun contrôle ne bloque un geste ; une parcelle au RNU ne propose rien ; le PDF et les pages gardés par empreinte |
| **L5 — Textes et relecture** (D7, D8) | L'usage `texte`, les brouillons et les textes validés ; la relecture avant l'export ; le texte validé dans le cerfa et une page de notice | la liste `manques` de `cerfa13703.ts` comme liste à part (déplacée dans la relecture, qui la dit au cerfa) | `dossier.pdf` de la démonstration **identique** (aucun texte validé : le texte calculé reste) ; un texte validé s'imprime à l'identique à chaque export ; un brouillon périmé est dit ; la relecture d'un même projet est la même à chaque fois |
| **L6 — Assistant** (D9) | L'usage `assistant`, le catalogue généré, le champ « Demander », la liste d'étapes, « Appliquer » en une étape | — (ajout) | Dix demandes de référence (`tests/fixtures/assistant/`) traduites en listes justes sur la démonstration ; une étape refusée par `commandes.etat` est grisée avec sa raison ; « Appliquer » puis Ctrl+Z rend le projet à l'identique ; en lecture seule, seules les préférences d'affichage s'appliquent |

### 7.1 Dépendances et parallélisme

| Lot | Attend | Peut courir en même temps que | Pourquoi |
|---|---|---|---|
| L0 | rien | F6, F7, L3, L4 (commencés) | Ne touche ni prompt ni schéma ; **fusionné avant** tout lot qui appelle Claude (décision 7) |
| L1 | F7 fusionné, L0 | L3, L4 | Même prompt et même schéma que F7 (l'image change avec F7) |
| L2 | L1 | L3, L4, L5 | Même fichier `facadesRun.ts` : un lot à la fois |
| L3 | L0 | F7, L1, L2, L4 | Ses requêtes et son schéma sont à lui ; seule l'étape de prise touche l'audit (à rebaser sur F6 s'il passe avant) |
| L4 | L0 | F7, L1, L2, L3 | Indépendant de la façade : le PLU, le serveur, Résultats |
| L5 | L4 (les règles confirmées nourrissent la notice) | L2, L6 | Les matériaux de L1 et L2 enrichissent les textes sans les bloquer |
| L6 | L3 (le catalogue doit connaître les ouvrages du jardin) | L5 | Ne touche que le registre et un usage |

Ordre conseillé : **L0**, puis **L3 et L4 en parallèle** pendant que F7 se termine, puis **L1**, **L2**, puis **L5 et L6**.

### 7.2 Par lot : fumée, schéma, exports, bilan

| Lot | Points de fumée nouveaux | Points touchés à rejouer | Schéma du fichier | Exports et version majeure |
|---|---|---|---|---|
| L0 | un : l'export « données d'analyse », une façade rejouée depuis son image | 85, 86 (analyses d'un audit), 101, 103 (calibration, escalade) | — | aucun export du projet ne bouge |
| L1 | un : une façade à menuiseries colorées, garde-corps en fer forgé, bandeau et store lus, validée, dessinée ; un : une saillie (bow-window) proposée, acceptée, posée par le moteur | 24 (GLB), 102 à 105, 108 | +1 | `.glb` inchangé sans champ nouveau ; un projet qui en porte voit son `.glb` changer (pas une empreinte) |
| L2 | un : une couverture en écaille lue, dessinée ; une fenêtre de toit posée | 24, 97, 98 (Mode Toit), 104 | +1 | idem |
| L3 | un : l'étape « Jardin », l'aérienne et deux photos, les propositions, une plate-bande et un arbre posés ; un : la végétation par défaut et son retrait | 14 (orthophoto), 22, 24 (**GLB recalculé**), 92 (Arbres), 17 (quantités), 25 | +1 | **version majeure** (rendu 3D de la démonstration) |
| L4 | un : « Lire le règlement de la zone » en réseau témoin (`tests/fixtures/fumee-reseau/`, à réenregistrer) | 15 | +1 | aucun (alertes à l'écran) |
| L5 | un : rédiger, corriger, valider, exporter ; la relecture | 25, 37 | +1 | `dossier.pdf` inchangé sans texte validé ; la page de notice n'existe qu'avec un texte validé |
| L6 | un : une demande, sa liste, « Appliquer », Ctrl+Z, dans les trois classes | 9 (annulations) | — | aucun |

Chaque lot colle à sa PR un **bilan de suppression** (§8 bis.4 de la spec des façades) : fichiers, fonctions, lignes, remplacé par ; `grep`
des noms supprimés : vide, hors historique.

---

## 8. Vérifier

```bash
npm run typecheck && npm run lint && npm run cliquet && npm run gate:client && npm test      # la CI
npm run regles:generer && git diff --exit-code deploy/                                        # prompts et schemas a jour
npx tsx .claude/skills/toits/scripts/identite.ts                                              # AE 101 : corps identiques
npx tsx .claude/skills/facades/scripts/banc.ts                                                # banc des facades, avant / apres
ANTHROPIC_API_KEY=… npm run verifier:api-claude                                               # chaque usage nouveau, sa mesure de cout
NODE_PATH=$(npm root -g) node scripts/fumee.mjs http://localhost:5199 [points…]               # points du lot, trois classes
```

- **Le banc de l'IA des façades** (`ia-x1-x3.ts`) avant et après L1 et L2 : rappel, précision et carreaux ne baissent pas ; le coût par
  façade est dit.
- **Les empreintes golden** : inchangées pour L0, L1, L2, L4, L5, L6 ; recalculée pour `glb-structure.json` en L3, et seulement elle.
- **Les quantités** (`moteur-terrasses.json`, `moteur-piscine-pergola.json`, `quantites-demo.txt`) ne bougent dans **aucun** lot.
- **Le cliquet des orphelins** et le bilan de suppression, comme pour F0 à F8.
- **Pièges de CI** : couches (`tests/unit/architecture.test.ts` : les règles du jardin et du PLU en couche 3, leurs écrans en `zones/`),
  exposition des commandes nouvelles (`plu.lire`, `texte.rediger`, `assistant.demander`, `facade.escalader` inchangée) dans les trois classes,
  contrôles classés, `max-lines-per-function` 150, `exactOptionalPropertyTypes`, `tests/unit/app/regles/sujets.test.ts` (un sujet nouveau a
  sa description et son attribut).
- **Le serveur** : chaque usage nouveau a ses tests de fonctions (`analyseFonctions.test.ts`) et de routes (`php -S`) ; la récupération du
  PDF n'accepte que les hôtes permis et une taille bornée.

---

## 9. Risques

1. **Un schéma plus long lit moins bien.** Une quarantaine de champs de plus dans le run peut faire baisser le rappel des ouvertures ou des
   carreaux (Haiku), et approcher les limites de la sortie structurée (nombre de champs facultatifs, profondeur). Garde-fou : le banc avant et
   après (critère de L1) ; si le rappel baisse, **on ne coupe pas la décision 3 sans le propriétaire** : la question lui revient (une seconde
   requête sur la même image, ou un modèle plus fort pour le run).
2. **Les couleurs se lisent mal sur une photo** (balance des blancs, ombre, contre-jour). Une palette fermée de mots, pas un hex lu ; deux
   passes sur trois ; la personne valide. Une couleur fausse est un rendu faux, jamais un nombre faux.
3. **Une profondeur inventée.** Un bow-window, un auvent ou un décroché vus de face n'ont pas de profondeur : le LiDAR la donne quand il la
   voit, sinon une valeur par défaut **dite** dans la proposition.
4. **Un décroché retouche un contour de l'IGN.** Un objet posé sur le terrain ne se déplace ni ne tourne (décision du 27 octobre 2026) ; un
   décroché est une **retouche à la main** proposée, qui change l'emprise au DP2 du projet : toujours décochée, jamais appliquée seule.
5. **La végétation par défaut alourdit la 3D** et change le rendu de projets existants (et des haies de l'IGN, rangées en massif) : critère
   de performance de L3, et question 3 sur les massifs concernés.
6. **Un équipement qui charge** : une nature nouvelle qui chargerait par erreur changerait les appuis d'une terrasse. La table des natures est
   testée contre `findSpaZones` ; nature absente = spa.
7. **L'existant chiffré** : sans la marque `existant`, une terrasse lue serait vendue. C'est la question 1, à trancher avant L3.
8. **Le PDF du PLU** : scanné (pas de texte), mal découpé, plusieurs zones, modifications récentes non versées. La règle de la citation
   retrouvée écarte ce qu'on ne peut vérifier ; un PDF scanné passe en images (plus cher, dit avant l'envoi) ; la date d'approbation est
   montrée à côté de chaque règle.
9. **Une règle de PLU mal lue rassure à tort.** Le contrôle dit « d'après la règle lue page 47, à vérifier » ; jamais « conforme ».
10. **Un texte rédigé engage le déclarant.** Le brouillon le dit ; l'export n'imprime qu'un texte validé ; rien n'est rédigé sur l'état du
    bâti.
11. **L'assistant et le texte de l'utilisateur** : les noms d'objets et les adresses entrent dans la requête ; une consigne glissée dedans
    ne peut produire qu'une liste de commandes du catalogue, que la personne voit et valide.
12. **Le volume gardé** (L0) : une image par run, des PDF de PLU ; la taille du fichier d'audit et du dossier du serveur grossit. Mesure dans
    L0 et durée de conservation (question 11).
13. **Deux lectures du même élément** (la couverture par l'analyse d'une maison et par le run ; les volets par les deux) : une règle écrite
    les départage, sinon deux propositions contraires (question 8).
14. **F7 en cours** : L1 et L2 dépendent de son prompt et de son image ; s'il change de forme, la spec de L1 se relit avant de commencer.

---

## 10. Questions ouvertes (dont ce que le propriétaire a pu oublier)

1. **L'existant et le projet.** Le jardin lu est de l'existant ; la terrasse et la piscine de Plan sont des projets chiffrés. *Proposition :
   une marque `existant` sur tout objet proposé depuis une lecture, qui le sort de la nomenclature, du chiffrage et le dit « existant » au
   DP2.* À trancher avant L3.
2. **DP7 et DP8 depuis les photos de l'audit.** L'audit a des photos de la rue et de la façade : elles pourraient devenir les photographies de
   l'environnement proche et lointain que le cerfa réclame (`manques`). *Proposition : un choix de photo par pièce, en L5.*
3. **Quels massifs reçoivent la végétation par défaut ?** Tous, ou ceux de la parcelle du projet, ou ceux qui ne viennent pas de l'IGN (les
   haies et zones de végétation importées, voisinage compris) ? *Proposition : les massifs de la parcelle du projet ; une haie de l'IGN y est
   dessinée en haie.*
4. **L'essence d'un arbre** : la bibliothèque change sans PR ; *proposition : un vocabulaire fermé d'une quarantaine de genres dans le schéma
   (chêne, érable, bouleau, tilleul, platane, pin, sapin, cyprès, thuya, olivier, palmier, fruitier…), ramené par règle à l'essence la plus
   proche ; une table genre → essence comme réglage, que l'écran Admin › Arbres montre.* Et l'hiver : un caduc nu se reconnaît mal.
5. **Les règles du PLU oubliées** : pleine terre ou espaces verts (%), stationnement, aspect des clôtures (essences imposées, haies
   champêtres), annexes et piscines (reculs propres), toitures (pentes, matériaux), panneaux solaires en SPR, plusieurs zones sur une
   parcelle, carte communale, et les **communes au RNU** (règles nationales : proposer les reculs du code de l'urbanisme ?).
6. **Un muret ou une haie à l'intérieur de la parcelle** : ni la clôture (sur la limite), ni un ouvrage existant ne les porte bien.
   *Proposition : `limite` gagne une nature (`muret`, `haie`), ou un massif linéaire.*
7. **Les photos du jardin et les personnes** : des voisins, des enfants, une plaque. L'accord de l'analyse (D2) couvre-t-il ces photos ?
   Faut-il flouter avant l'envoi ?
8. **Deux lectures d'une même chose** : couverture et volets lus par l'analyse d'une maison et par le run. *Proposition : la vue de près (le
   run) l'emporte sur l'élément qu'elle voit, l'analyse d'une maison garde le reste du toit.*
9. **Retirer de l'analyse d'une maison** les champs de façade que le run lit (volets, vitrage, couleur) quand une façade est photographiée ?
   Le coût baisserait ; la mesure de L1 le dira.
10. **Les capacités** : `plan.plu` couvre-t-elle la lecture du règlement, ou faut-il `plan.plu.lecture` ? L'assistant et les textes sont-ils
    une capacité vendue (`plan.assistant`, `plan.textes`) ? Une capacité nouvelle s'inscrit d'abord dans la liste des fonctionnalités de la
    plateforme (`staff.features.manage`, ADR-052).
11. **Combien de temps garder** les images envoyées, les PDF et l'export des données d'analyse (données personnelles : adresses, photos) ?
    Qui peut exporter (l'administrateur seul, proposé) ?
12. **La palette des couleurs** : des mots suffisent-ils, ou faut-il des teintes RAL (7016, 9010…) que le métier emploie ?
13. **Un garde-corps trop bas** (moins de 1 m) : le dire (une règle de sécurité), ou rester hors du sujet de Plan ?
14. **L'état du bâti** : le montrer à qui ? À la personne de l'audit seulement, ou aussi dans l'inspecteur du projet ? Jamais dans un export
    (décision 8) — mais un export « interne » (la note de visite) le pourrait-il ?
15. **La campagne de réanalyse** : quand un prompt change, rejouer tous les audits gardés (L0) coûte ; qui la décide, avec quel plafond ?
16. **L'assistant hors projet** (« combien coûterait une terrasse de 25 m² ? ») : répondre par une liste de commandes seulement, ou aussi par
    du texte ? *Proposition : une liste ou une question, jamais un chiffre de sa main (la nomenclature chiffre).*
17. **L'orthophoto** est à 20 cm (5 cm par endroits) et datée : un regard, un robinet ou une boîte aux lettres ne s'y voient pas, un jardin
    a pu changer. La date de l'orthophoto est-elle dite avec chaque proposition aérienne ?

---

## 11. Glossaire et plan du code

- **Run d'une façade** : la requête (trois passes votées) qui lit une façade sur son image ; L1 et L2 l'élargissent sans en ajouter.
- **Escalade** : une lecture de plus, à la demande, par le modèle de l'usage `escalade` (Sonnet par défaut) ; jamais automatique.
- **Observation** : une lecture de Claude rendue en données typées, que les règles relisent ; jamais écrite telle quelle dans le projet.
- **Proposition** : ce que les règles tirent d'une observation, décochée, confirmée par la personne.
- **Signal** : une lecture montrée sans proposition (l'état du bâti).
- **Modénature** : ce qui décore et protège un mur sans en être une ouverture (corniche, génoise, bandeaux, chaînes d'angle, encadrements,
  soubassement, descentes).
- **Saillie** : un élément posé sur un mur d'un corps, qui touche au toit (bow-window, galerie, appentis, auvent).
- **Décroché** : un changement de nu de la façade (une avancée ou un retrait), que le contour doit suivre.
- **Nature d'équipement** : le sous-type d'un `equipement`, qui dit sa forme, son dessin et **s'il charge** une terrasse.
- **Plantation** : ce qu'un massif porte (fleurs, arbustes, vivaces, potager, haie), dessiné en végétation basse.
- **Existant** : un objet lu sur le terrain, hors nomenclature et hors chiffrage.
- **Règle de zone lue** : une valeur du règlement du PLU, avec sa citation et sa page, proposée puis confirmée ; donnée du projet, pas un
  fait du moteur des toits.
- **Contrôle** : une règle du moteur qui compare le projet à une règle de zone confirmée et rend une alerte.
- **Brouillon, texte validé** : la rédaction de Claude d'une pièce du dossier, puis le texte que la personne a relu et que l'export imprime.
- **Relecture** : la liste déterministe des incohérences avant l'export.
- **Catalogue** : ce que l'assistant peut proposer (commandes exposées, leurs états, champs et bornes), généré par le code.
- **Données d'analyse** : les passes de toutes les requêtes à Claude, avec leurs entrées par empreinte, exportables à travers les audits.

| Sujet | Code (existant, puis à créer) |
|---|---|
| Run d'une façade | `src/regles/sujets/descriptions/facadesRun.ts`, `versions.ts`, `deploy/prompt-facade.md`, `deploy/schema-facade.json` (générés), `regles/facades/observations.ts`, `facade/regles/facades/ia.ts` ; à créer : `facade/regles/facades/{menuiseries,modenature,saillies,etat}.ts` |
| Modèle de la façade | `model/typesReleve.ts`, `model/facadeObjet.ts`, `model/protections.ts` |
| Toit | `model/typesToit.ts`, `model/couleurToit.ts`, `three/couverture.ts`, `app/regles/sujets/couverture.ts` |
| 3D | `three/detailsOuvertures.ts`, `three/carreaux3d.ts`, `three/releve3d.ts`, `three/detailsBatiment.ts`, `three/fenetresRelief.ts`, `three/arbre3d.ts`, `three/gazon.ts` ; à créer : la végétation basse (lots instanciés) |
| Ouvrages | `model/ouvrages/` (`surfaces.ts` : massif, équipement), `model/fonctions.ts`, `engine/structure.ts::findSpaZones` |
| Jardin | `model/auditParcelle.ts`, `app/audit/parcelle/`, `model/especesArbre.ts`, `data/admin/arbres.json` ; à créer : `facade/regles/jardin/`, `src/regles/sujets/descriptions/jardin.ts` |
| PLU | `geo/apiIgn.ts::interrogerPlu`, `model/types.ts::ZonagePlu`, `zones/resultats/Plu.tsx`, `app/resultats.ts` ; à créer : `src/regles/plu/`, `src/facade/regles/plu/`, `regles/plu/reglages.json`, la route serveur du PDF |
| Dossier | `export/dossierMairie.ts`, `export/piecesDP.ts`, `export/cerfa13703.ts` ; à créer : la relecture, les textes |
| Assistant | `app/commandes.ts`, `app/exposition.ts`, `ui/champs/` ; à créer : le catalogue, l'usage `assistant` |
| Conservation | `regles/facades/observations.ts::RunEnregistre`, `io/analysesAudits.ts`, `export/benchmarkAnalyses.ts`, `export/csvConsommation.ts`, `deploy/analyse.php`, `deploy/analyse-fonctions.php` |

---

## 12. Bilan des lots livrés

### 12.1 L0 — Tout garder (livré le 29 octobre 2026)

**Ce qui est livré.**

- **Une trace pour toute requête.** Chaque batch et chaque appel immédiat écrit sa trace avant l'envoi (`entrant.json` : le
  texte complet du system, chaque requête et ses blocs, les images par nom) et la complète au retour (`sortant.json` : le texte
  brut de Claude, la sortie ramenée au schéma, l'erreur, les tokens, le coût, `refusFormat`, les versions du prompt et du schéma,
  l'empreinte de chaque image et celle de la réponse ; `resume.json` : nature, état, organisation, parcelle, comptes, coût). Une
  requête qui nomme un audit permis (`depot` de la même organisation, ou l'administrateur) se range dans le dossier de l'audit,
  comme avant ; **toutes les autres** — l'analyse dont le dépôt a été retiré, « Rappeler Claude », l'aide du relevé, une escalade
  d'un audit non sauvegardé — sous `claude/analyses/sans-depot/<organisation>/<AAAA-MM>/<trace>/`. La branche « part sans trace »
  du batch est supprimée. Les escalades d'un audit (D20 des maisons et escalade d'une façade) portent désormais le `depot` de
  l'analyse : elles se rangent à côté des passes. Natures : `analyse`, `rejeu` (batches), `immediat`, `rejeu-facade`.
- **L'image exacte, une fois par empreinte.** Les octets reçus par le serveur (le JPEG compressé que Claude voit) sont gardés sous
  `images/<sha256>.<ext>` du dossier de l'audit, ou du mois de l'organisation sans dépôt : trois passes et une escalade de la même
  façade = un fichier. Le serveur rend à la page l'empreinte, la taille et le type de chaque image de chaque requête
  (`empreintes`), et `RunEnregistre.image` devient `{ largeur, hauteur, sha256?, octets? }` ; `EscaladeEnregistree` gagne `sha256?`.
  Une réponse enregistrée d'avant (dimensions seules) se relit telle quelle.
- **Le journal** garde, par ligne, `empreintes` (les sha256 des images), `reponse` (le sha256 du texte brut) et `trace` ; toujours ni
  photo ni réponse.
- **Le rejeu d'un run de façade depuis son image gardée** : `POST admin/claude/rejouer` (`{ audit | null, trace, requete, passes }`,
  administrateur seul) relit la requête dans `entrant.json`, ses textes tels quels et son image **octet pour octet**
  (`contenuRejoue` ; une image manquante refuse, jamais une image refaite), et la renvoie en appel immédiat avec le prompt, le
  schéma et le modèle d'aujourd'hui ; compté en `rejeu`, sa trace (`rejeu-facade`) se range à côté de la source. Dans Admin ›
  Audits, une analyse ouverte offre « Rejouer cette façade depuis son image » sur la première passe de chaque run de façade.
- **L'export « données d'analyse »** : `GET admin/claude/donnees-analyse?du=&au=&modele=&usage=` (administrateur seul) relit toutes
  les traces de la période (audits et sans dépôt) — une ligne par réponse revenue : trace, nature, audit, parcelle, bâtiment,
  façade, passe, usage compté et usage du prompt, modèle, versions, statut, tokens, coût, `refusFormat`, empreintes et octets des
  images, empreinte de la réponse, comptes, sortie, texte brut — et chaque proposition des audits reçus dans la période : objet,
  cible, effet, source, confiance, réserve, décision (validée, refusée, en attente), **décision du moteur** (les décisions de ses
  arbitrages) et **accord de Claude** (`accord`, `desaccord`, `claude-seul`, `sans-claude`). Admin › Audits, « Exporter les données
  d'analyse » : période, usage, modèle, puis JSON (tel quel, `plan-donnees-analyse`) ou CSV (`export/donneesAnalyse.ts`, au format
  de `csvConsommation.ts`, une colonne par champ simple des sorties, à deux niveaux). Une image se demande une à une,
  `GET admin/claude/images/<sha256>.<ext>[?audit=]`.
- **La conclusion d'un audit** (`decisions.json`) passe en version 2 : cible, effet, réserve, `moteur`, `accordClaude` par
  proposition ; une conclusion d'avant se refait depuis `audit.json` à l'export (et se réécrit).
- **La garde** : un mois de traces sans dépôt s'efface 24 mois après (`moisPerimes`, `purgerSansDepot`, appelé à chaque nouvelle
  trace sans dépôt) — la durée de consultation du journal. Les traces d'un audit suivent l'audit : retiré, tout part avec lui.

**Critères d'acceptation.**

| Critère | Preuve |
|---|---|
| Une façade rejouée depuis l'image gardée envoie les mêmes octets | `donneesAnalysePhp.test.ts` : le faux Anthropic reçoit le même base64, la nouvelle trace a la même image ; `contenuRejoue` testé seul |
| Trois passes et une escalade = une image gardée | `donneesAnalysePhp.test.ts` (sans dépôt) et dans le dossier de l'audit |
| L'export d'une période relit toutes les passes de tous les audits, CSV dans un tableur français | route (audit + sans dépôt + filtre d'usage) ; `donneesAnalyse.test.ts` (BOM, `;`, virgule décimale, formule neutralisée, largeur constante) ; fumée 109 |
| Aucun secret ni photo hors demande dans l'export | aucune ligne ne contient d'image (route) ; images par empreinte, une à une, à l'administrateur ; `verifier-paquet` vert |
| Toute requête a sa trace (sans dépôt, escalade, « Rappeler Claude ») | `donneesAnalysePhp.test.ts`, `scenarioDonnees.ts` (l'analyse orpheline a maintenant sa trace sans dépôt) |
| Le fichier du projet ne change pas ; démo et empreintes golden immobiles | aucun champ du projet touché, schéma 7 inchangé ; `npm test` (empreintes) vert |

**Interprétations.**

1. **L'image n'entre ni dans le fichier du projet, ni dans le fichier de l'audit, ni dans le cas de calibration** : elle est gardée
   par le serveur, à côté de l'audit (son dossier, même règle de partage et de retrait que ses photos) ou sous l'organisation, et
   la réponse enregistrée la référence par son empreinte. Pourquoi : le fichier de l'audit ne porte pas les runs (ni
   `analyse.resultats`) — y mettre l'image sans le run n'apporterait rien ; la capture vit dans le brouillon local, réécrit après
   chaque geste, qu'une image par façade alourdirait ; et le serveur est le seul à voir les octets **reçus** (son empreinte est celle
   de ce que Claude a vu, pas d'une image refaite par le navigateur). Le §4.8 disait « dans le fichier de l'audit, dans le cas de la
   calibration » : c'est le seul écart, à confirmer par le propriétaire.
2. **Le rejeu se fait par le serveur, depuis la trace** (texte et image gardés), plutôt que par la page depuis `RunEnregistre` : la
   réponse enregistrée ne garde pas le texte envoyé, et la page n'aurait eu qu'à redemander les octets au serveur. Seul le run d'une
   façade se rejoue ainsi (une maison passe par le rejeu en batch de 15.5).
3. **Les cas de calibration** gardent la référence (sha256) dans leurs réponses enregistrées ; leur image est dans la trace sans
   dépôt de l'organisation `admin`, donc effacée après 24 mois comme les autres. Si le propriétaire veut garder plus longtemps les
   images de la calibration, il faudra les exempter (question 11).
4. **La purge** ne touche que les traces sans dépôt ; le journal lui-même n'est pas purgé (il ne l'était pas : « gardé 24 mois »
   voulait dire consultable 24 mois). Les traces d'un audit vivent autant que l'audit.
5. **Les propositions** viennent des audits **reçus** dans la période (leur `recuLe`), pas de la date de leurs décisions ; l'export
   ne relie pas une proposition aux passes qui l'ont nourrie (le fichier de l'audit ne le dit pas) : on les rapproche par audit,
   bâtiment et façade. Les accords du moteur pour le run d'une façade (`AccordFacadeCapture`) ne sont pas dans le fichier de
   l'audit et n'entrent donc pas dans l'export.
6. **Pas d'archive des images** : elles se demandent une à une par empreinte (route admin). Une archive zip demanderait l'extension
   `zip` de PHP, que l'hébergement n'a pas d'office.
7. Le rejeu d'une façade, facturé, part **sans confirmation** (comme « Rappeler Claude » de la calibration, quelques millièmes de
   dollar) ; le bouton dit en infobulle que c'est un appel facturé.

**Volume (risque 12).** Une image de run est un JPEG de 1 024 px au plus, qualité 0,85 : de l'ordre de 100 à 250 Ko pour une
façade (estimation, pas mesurée sur un corpus réel) ; une par façade et par audit, quel que soit le nombre de passes, d'escalades
et de rejeux. L'export la mesure désormais (`octets`, colonne « Images (octets) »).

**Supprimé.** La branche « sans trace » du batch (`analyse.php`, l'analyse dont le dépôt a été retiré) ; le `depot: null` forcé de
l'escalade D20 (`escalade.ts`) ; l'écriture de la trace propre au batch (remplacée par `lieuTrace`, `resumeTrace`, `commencerTrace`,
`finirTrace`, communes au batch et à l'appel immédiat). `grep "part sans trace\|ne garde pas de trace" src deploy` : vide.

**Fumée.** Point **109** nouveau (l'export CSV et JSON, le rejeu d'une façade depuis son image) ; 57, 85, 86, 101, 103 rejoués
(compact, moyen, large ; clair ; réseau témoin).
