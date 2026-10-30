# Golden files — oracle de régression de la migration TypeScript

Capturés sur le jeu de démonstration embarqué (parcelle AE 101, 35 objets, 2 terrasses, 11 mesures),
en mode local (aucun appel réseau sauf le GLB, qui charge Three.js).

- **28 août 2026**, `plan.html` v1.0.0 : capture d'origine, phase 0.
- **29 août 2026**, `plan.html` v1.1.0-alpha.1 : recapture à la rupture (voir plus bas).
- **29 août 2026**, `plan.html` v1.1.0-alpha.4 : recapture de rattrapage. Le numéro de version avait
  cessé de suivre le journal des modifications — `CHANGELOG.md` annonçait `alpha.2` et `alpha.3`
  alors qu'`APP_VERSION` et `package.json` étaient restés à `alpha.1`, si bien que ces deux versions
  n'ont jamais été estampillées dans un artefact. Remettre le numéro à sa place refait bouger les six
  empreintes, **et rien d'autre** : la preuve ligne à ligne décrite plus bas a été refaite à
  l'identique, avec le même résultat — une ligne, la version, dans chacun des quatre artefacts
  texte ; comptes de textes, d'objets et de pages inchangés dans les deux PDF.
- **30 août 2026**, `plan.html` v1.1.0-alpha.5 : typage complet de `engine/`. Les six empreintes ont
  d'abord été vérifiées **à version inchangée** — six sur six identiques au bit près, ce qui prouve
  que le typage du moteur n'a rien déplacé — puis recapturées après le changement de numéro, avec la
  même preuve ligne à ligne qu'aux deux recaptures précédentes.
- **30 août 2026**, `plan.html` v1.1.0-alpha.6 : typage complet de `render/`. Même protocole que la
  recapture précédente — six sur six identiques à version inchangée, puis une ligne par artefact
  texte après le changement de numéro. Vérification supplémentaire, propre à ce module : le fond
  orthophoto, activé à la main (le jeu de démonstration ne l'active pas, donc les empreintes ne le
  voient pas), pose les **quatre mêmes tuiles** — mêmes `x`/`y`/largeur/hauteur au dernier chiffre
  décimal — que sur le témoin figé.
- **30 août 2026**, `plan.html` v1.1.0-alpha.7 : typage complet de `io/`. Même protocole. Vérification
  supplémentaire, propre à ce module : un cycle export JSON → import (remplacement) sur le jeu de
  démonstration restaure les 35 objets et les 11 mesures, et le relevé de santé après import est
  identique à celui d'une page fraîche.
- **30 août 2026**, `plan.html` v1.1.0-alpha.8 : typage complet d'`interaction/`. Même protocole.
  Vérification supplémentaire : un glisser de sommet réel (`PointerEvent` synthétiques) déplace le
  sommet visé exactement du delta demandé et laisse les cinq autres inchangés ; un zoom molette
  redessine la scène.
- **30 août 2026**, `plan.html` v1.1.0-alpha.9 : typage complet d'`app/`. Même protocole. Vérification
  supplémentaire : le pilotage des quatre vues (Plan, Terrasse, Vue 3D, visionneuse) et la bascule de
  la grille testés en séquence, sans erreur.

- **30 août 2026**, `plan.html` v1.1.0-alpha.10 : typage complet de `geo/`. Même protocole — six sur
  six identiques à version inchangée, puis une ligne par artefact texte après le changement de
  numéro (143 textes / 14 objets / 2 pages pour `plan.pdf`, 106 / 15 / 3 pour `dossier.pdf` :
  inchangés). Vérification supplémentaire, propre à ce module et plus forte que les empreintes : les
  goldens ne passent par **aucun** appel réseau, alors que `geo/` n'est presque que cela. L'import
  cadastral « Place de la Mairie 35000 Rennes » a donc été rejoué **en direct** sur les deux
  versions à quelques minutes d'intervalle — le témoin figé 1.0.0 et le build fraîchement typé. La
  chaîne complète est sollicitée : géocodage BAN, `apicarto/cadastre/parcelle` sur emprise, BD TOPO
  (bâtiment, zone de végétation, haie) en WFS, puis les neuf interrogations du GPU/PLU. Résultat
  **identique au bit près** après neutralisation des quatre horodatages et du numéro de version :
  25 232 octets, SHA-256 `b93a3924b496529d9e4b3d17e522f0cf8a21bcaaa66680ef7b4d0aaf9ba321eb`,
  parcelle AC 530 de 418 m² (IDU `35238000AC0530`) et trois bâtiments de 16 ; 15,5 et 13,8 m. Le
  relevé du 28 août (25 108 octets) n'est plus reproductible : le témoin figé lui-même rend
  aujourd'hui 227 octets de plus, c'est-à-dire que ce sont les données du GPU qui ont bougé, pas le
  code. C'est bien pour cela que la comparaison qui compte est celle des deux versions entre elles.

- **30 août 2026**, `plan.html` v1.1.0-alpha.11 : typage complet de `three/`, rendu possible par
  l'adoption de `@types/three@0.128.0` (spec §8.3, option A : une dépendance de **type** sans
  dépendance de code — la bibliothèque continue d'arriver du CDN, et le build ne grossit d'aucun
  octet à cause d'elle). Même protocole — six sur six identiques à version inchangée, puis une ligne
  par artefact texte après le changement de numéro.

  Vérification supplémentaire, propre à ce module : les six empreintes **n'ouvrent jamais la 3D**.
  C'est `glb-structure.json` qui la voit, et il a été recapturé en direct — Vue 3D ouverte
  (Three.js r128 chargé du CDN, canevas rendu, aucune erreur), puis export GLB de 41 473 604 octets
  dont l'en-tête et les compteurs sont **identiques au relevé d'origine** : glTF 2.0, 203 nœuds,
  200 maillages, 288 matériaux, 178 textures, 1 scène. La visionneuse a été éprouvée dans la foulée
  sur les chemins les plus retouchés : bascule du fond clair/sombre (qui libère l'ancienne texture,
  donc passe par le nouveau garde `estTexture`) dans les deux sens, puis filaire coché/décoché — la
  scène est reconstruite deux fois et il reste exactement un canevas, sans erreur.

- **30 août 2026**, `plan.html` v1.1.0-alpha.12 : typage complet d'`export/`, treizième et
  avant-dernier palier. Même protocole — six sur six identiques à version inchangée, puis une ligne
  par artefact texte après le changement de numéro ; les deux PDF gardent exactement leurs comptes
  de textes, d'objets et de pages (143/14/2 et 106/15/3). Seul `ui/` (371) reste hors du cliquet,
  volontairement en dernier — c'est la couche la plus grosse et la moins testée.

- **30 août 2026**, `plan.html` v1.1.0-alpha.13 : typage complet d'`ui/`, quatorzième et dernier
  palier du barreau 2 — `--noImplicitAny` est desormais a zero sur **tout** `src/`. Même protocole —
  six sur six identiques à version inchangée, puis une ligne par artefact texte après le changement
  de numéro ; les deux PDF gardent leurs comptes exacts (143/14/2 et 106/15/3). Vérification
  supplémentaire, propre à ce palier : l'import cadastral complet (adresse → parcelle → parcelles
  voisines → création) a été rejoué en direct sur « Place de la Mairie 35000 Rennes » — mêmes
  quatre objets, mêmes hauteurs, même IDU `35238000AC0530`, mêmes dix clés du zonage PLU — aucune
  erreur console. C'est le chemin le plus riche en `ctx` partagés du fichier (`ContexteImportCadastre`,
  exporté depuis `ui/projectBar.ts` et importé par `ui/cadastreDialog.ts` plutôt que redéfini) et
  celui que les six empreintes ne peuvent pas voir, puisqu'il dépend du réseau.

- **9 septembre 2026**, `plan.html` v1.1.0-alpha.14 : fin de la **phase 4** — la fermeture `boot()`
  a quitté `legacy.ts`, qui a été supprimé. Six sur six identiques **à version inchangée** avant le
  changement de numéro : déplacer 900 lignes de câblage dans un module typé, retirer 280 symboles
  morts et supprimer le dernier `@ts-nocheck` ne bougent aucun des six artefacts.

  La preuve d’après recapture est cette fois **plus forte que la comparaison ligne à ligne**, et
  par un hasard heureux : `alpha.13` et `alpha.14` ont la même longueur. Remettre l'ancien numéro
  dans les octets fraîchement capturés reproduit donc les six empreintes précédentes **au bit
  près — les deux PDF compris**, ce que les recaptures précédentes ne pouvaient pas établir (la
  chaîne changeait de longueur et décalait toute la table xref). La version apparaît une fois dans
  chacun des quatre artefacts texte, deux fois dans `plan.pdf`, quatre fois dans `dossier.pdf` :
  ce sont les seuls octets qui diffèrent.

  Vérifications supplémentaires, propres à ce palier — les empreintes ne voient que des **exports**,
  or ce palier ne touche qu'au **câblage** :

  - **Un bug d'import réparé, et daté.** `filtrerSansParcelle` était cité dans le contexte passé à
    `importSVGString`, mais n'avait plus été importée depuis sa sortie vers `io/exportProjet.ts` en
    phase 2. L'objet levait donc un `ReferenceError` avant même l'appel, et le `try/catch` de
    `app/ecouteurs/fichiers.ts` le transformait en bandeau : **l'import SVG ne marchait plus**. Les
    trois versions ont été comparées en direct sur le même fichier (`plan.svg` du dossier doré) :
    le témoin figé 1.0.0 et le build corrigé donnent **le même résultat exact** — 14 → 15 objets,
    288 → 566 textes, aucune erreur ; le build d’avant correction affiche
    `Erreur import SVG: filtrerSansParcelle is not defined` et n’importe rien. Le typage a montré
    que les quatre propriétés en question (dont celle-là) ne sont **lues nulle part** par
    `importSVGString` : les retirer répare le geste sans rien ajouter.

  - **Relevé de santé identique au témoin, geste par geste.** Grille allumée/éteinte, onglets
    Affichage et Mesure, mode Terrasse puis retour au mode Plan : `1.1.0-alpha.14` et le témoin
    figé 1.0.0 donnent la **même** série de nombres (36 lignes d’affichage, 2 terrasses, 14 boutons
    de sélection, 305 textes après l’aller-retour), sans erreur console de part et d’autre.

  - **Les deux scènes 3D, qui sont du câblage pur.** Vue 3D ouverte : un canevas 600×418, sept
    points de vue dans la liste. Visionneuse GLB : génération complète puis affichage, et les trois
    bascules qui passent par `rafraichirVisionneuseGlb(caméra courante)` — filaire, ombres, lumière
    d'appoint — reconstruisent la scène six fois en laissant exactement un canevas, sans erreur.

- **20 septembre 2026**, `plan.html` v1.1.0-alpha.15 : **l'échelle de rigueur est gravie**.
  `tsconfig.json` porte la configuration cible de la spec §9.1 (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`) : 1 513 erreurs → 0 sur `src/` et `tests/`. Même protocole — six
  sur six identiques à version inchangée sur le build fraîchement typé, puis recapture après le
  changement de numéro. Et la preuve forte de la recapture précédente, refaite : `alpha.14` et
  `alpha.15` ont la même longueur, donc remettre l'ancien numéro dans les six octets frais reproduit
  **les six empreintes précédentes au bit près, les deux PDF compris**. Une ligne diffère dans
  `resume.txt`, `plan.svg` et `plan.dxf` (la version), trois dans `projet.json` (version et les
  deux horodatages, neutralisés par la normalisation). Le build passe de 450 063 à 450 058 octets :
  des imports morts en moins et un paramètre renommé, rien qui s'exécute.

  Ce palier ne change **que des types** : assertions non nulles là où l'invariant est tenu par le
  code environnant, types élargis là où une signature mentait, imports morts retirés. Ce que le
  compilateur a trouvé en chemin — des signatures fausses et une trentaine d'invariants que seul
  `normalizeObjects` ou `ensureConstruction` garantit — est consigné dans
  [`../../../MD/MIGRATION-JOURNAL.md`](../../../MD/MIGRATION-JOURNAL.md), « Phase 7 — l'échelle
  gravie ».


- **20 septembre 2026**, `plan.html` v1.1.0-alpha.16 : trois corrections revelees par le typage strict
  (cotes importees verifiees, point de calage a deux coordonnees, batiment sans proprietes), aucune
  ne touchant un export. Meme protocole, meme preuve forte : ancien numero remis dans les octets
  frais, six anciennes empreintes retrouvees au bit pres.

- **21 septembre 2026**, `plan.html` v1.1.0-alpha.17 : `ObjetPlan` devient une union discriminée
  (polygone, chemin, cercle) et les signatures d'index disparaissent ; `ensureConstruction` comble
  douze réglages de plus. Même protocole — six sur six identiques à version inchangée sur le build
  typé, puis recapture, puis la preuve forte : ancien numéro remis dans les octets frais, six anciennes
  empreintes retrouvées au bit près.

- **21 septembre 2026**, `plan.html` v1.1.0 : **la migration est terminée**. Le numéro raccourcit de neuf
  octets, donc la preuve de la rupture du 29 août est refaite plutôt que la preuve forte : les quatre
  artefacts texte sont identiques à ceux de l'`alpha.17` une fois le numéro neutralisé (une ligne
  diffère, trois dans le JSON avec ses horodatages) ; les deux PDF ont le même contenu — 14 objets,
  2 pages, 143 textes ; 15, 3, 107 — et, neutralisés numéro, dates, décalages `xref`, `startxref` et
  longueurs de flux, une seule ligne diffère dans chacun, le dictionnaire `/Producer … /Creator`, qui
  porte la version et la date de build (`BUILD_AT`, passée au 21 septembre). GLB revérifié, huit
  compteurs identiques.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.1 : reconstruction de l'IHM, étape 0 (registre des
  commandes, magasin ; l'écran ne change pas). Preuve de la rupture, le numéro changeant de longueur :
  quatre fichiers texte identiques hors numéro, deux PDF au contenu identique une fois neutralisés
  numéro, dates, décalages et longueurs de flux — aucune ligne ne diffère.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.2 : reconstruction de l'IHM, étape 1 (barre d'application
  et barre d'état en React). Même protocole, preuve forte : ancien numéro remis dans les octets frais,
  six anciennes empreintes retrouvées au bit près.

- **21 septembre 2026**, `plan.html` v1.2.0-alpha.3 : reconstruction de l'IHM, étape 2 (palette d'outils,
  surimpressions du canevas, menu Affichage). Même protocole, preuve forte : les six anciennes empreintes
  retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.4 : reconstruction de l'IHM, étape 3 (explorateur ;
  la terrasse devient un contexte du plan, le mode Terrasse disparaît). Même protocole, preuve forte :
  les six anciennes empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.5 : reconstruction de l'IHM, étape 4 (inspecteur par
  descripteurs de champs, D-12). Même protocole, preuve forte : les six anciennes empreintes retrouvées
  au bit près — après avoir remis le panneau du bas sur Affichage, l'onglet Terrasse réécrivant le
  chiffrage dans le projet à l'ouverture.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.6 : reconstruction de l'IHM, étape 5 (tiroir des
  résultats sous le plan). Même protocole, preuve forte : les six anciennes empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.7 : reconstruction de l'IHM, étape 6 (dialogues et
  notifications ; D-13 et D-14). Même protocole, preuve forte : les six anciennes empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.8 : reconstruction de l'IHM, les menus de la barre
  d'application (Fichier, Exporter, Affichage, Aide). Même protocole, preuve forte : les six anciennes
  empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.9 : reconstruction de l'IHM, premiers retours d'usage
  (explorateur et inspecteur repliables, en-tête sur une ligne). Même protocole, preuve forte : les six
  anciennes empreintes retrouvées au bit près.

- **22 septembre 2026**, `plan.html` v1.2.0-alpha.10 : la section Terrasses de l'explorateur suit la
  sélection. Le numéro change de longueur : preuve de la rupture, quatre fichiers texte identiques hors
  numéro, deux PDF au contenu identique une fois neutralisés numéro, dates, décalages et longueurs.

- **22 septembre 2026**, `plan.html` v1.2.0 : **l'interface reconstruite par zones est publiée**.
  Le numéro perd neuf octets par occurrence (`1.2.0-alpha.10` → `1.2.0`) : une fois dans chacun des
  quatre fichiers texte, deux fois dans `plan.pdf`, quatre fois dans `dossier.pdf` — exactement les
  écarts de taille observés. Preuve de la rupture : les quatre textes sont identiques hors numéro,
  aucune ligne ne diffère ; les deux PDF gardent leurs objets, leurs pages et leurs textes
  (14/2/143 et 15/3/107) et leur contenu est identique une fois neutralisés numéro, dates, décalages
  et longueurs de flux. Neuf paliers `alpha` séparent cette capture de la `1.1.0` : aucun n'a
  déplacé un octet pour une autre raison que son propre numéro.

- **23 septembre 2026**, recapture de `projet.json` **seul** : le projet vit desormais chez la
  plateforme, et deux choses en decoulent qu'aucune normalisation ne couvrait.

  **Il porte une identite.** Le temoin precedent avait ete capture sur le jeu de demonstration sans
  projet ouvert : `id` nul, `updatedAt` nul, nom « Plan interactif ». Un projet stocke a un uuid,
  une date de modification et le nom qu'on lui a donne. La normalisation neutralise donc `id`,
  `createdAt` et `updatedAt` **dans le bloc `meta` seulement** — les cotes portent aussi un `id`,
  et celui-la doit rester verifie. Sans cela le temoin ne serait reproductible par personne, un
  uuid neuf naissant a chaque semis.

  **L'ordre des cles de `jsonb` l'atteint.** On avait ecrit le contraire : `projet.json` est bien
  produit par le serialiseur de Plan depuis le modele en memoire, mais ce serialiseur recopie
  certains objets imbriques tels quels — `clotureTexture`, par exemple. PostgreSQL les rend dans
  SON ordre (longueur de la cle, puis alphabetique), si bien que `vignette` et `url` ont echange
  leur place. Le contenu est identique une fois les cles triees, les 35 objets et les 11 cotes
  aussi, et cet ordre est deterministe — donc le temoin reste reproductible.

  Les cinq autres artefacts n'ont pas bouge : ils ne recopient aucun objet stocke.

- **23 septembre 2026**, `plan.html` v2.0.0 : **Plan devient un produit de la plateforme**. Les six
  temoins sont recaptures sur le projet `4d4ee63e-…` « Parcelle AE 101 », celui-la meme que la
  plateforme stocke, avec ses 35 objets et ses 11 cotes.

  **La preuve forte, six sur six.** Le numero garde sa longueur (`1.2.0` → `2.0.0`, cinq octets) et
  la date de build aussi (`2026-09-22` → `2026-09-23`, dix octets) : on peut donc remettre les
  anciennes valeurs dans les octets frais sans deplacer un seul decalage interne des PDF. Les six
  anciennes empreintes reviennent alors au bit pres. Et a version neutralisee, aucune ligne ne
  differe dans aucun des six — les deux PDF gardent leurs comptes exacts, 14 objets / 2 pages /
  143 textes et 15 / 3 / 107 — et les six tailles sont identiques a l'octet.

  Autrement dit : la connexion a la plateforme n'a deplace aucun octet de ce que Plan produit. Ce
  qui change est le numero qu'il y inscrit.

  **Le dossier PDF a demande un harnais.** `plan.export.dossier` se vend a partir de Scale, et
  aucun locataire du jeu de demonstration n'y est : la commande est *effacee* pour tout le monde.
  Le relais d'essai ajoute donc cette capacite a la reponse de `/me/context` — il n'y a ni base
  touchee ni code modifie, et le chemin traverse reste le vrai. Un temoin doit decrire ce que Plan
  **calcule**, pas ce qu'un locataire de demonstration a achete.

  **Une neutralisation morte est reparee au passage.** Celle du bloc `meta`, ecrite le matin meme,
  exigeait `"meta":{` sans espace alors que le fichier est indente : elle ne trouvait rien, et
  l'empreinte de `projet.json` figeait un uuid et une date de modification. C'est la preuve forte
  qui l'a revelee, en butant sur cette date. Le motif accepte desormais l'espace.

- **24 septembre 2026 — un témoin sciemment en retard : `glb-structure.json`.** *Recapturé le
  26 ; l'entrée reste, et sa prédiction avec, parce qu'elle s'est révélée incomplète d'un compteur.*
  Les textures de la vue 3D sont désormais partagées par URL au lieu d'être réinstanciées à chaque
  matériau. La scène ne change ni de géométrie, ni de matériaux, ni d'apparence, mais l'exportateur
  écrit **une image par instance de texture** : il en écrivait 178 pour les huit images que le plan
  référence, il n'en écrira plus que le nombre d'images distinctes réellement employées. Les
  compteurs `textures`, `images` et `octetsTotal` de ce témoin vont donc baisser, et le fichier
  maigrir très fortement.

  **Ce n'est pas une régression, et il faut le lire ici avant de le découvrir là-bas.** La règle de
  ce dossier dit qu'une empreinte qui bouge sans explication est un changement majeur ; en voici
  l'explication, écrite avant le mouvement. Les autres compteurs — nœuds, mailles, matériaux,
  accesseurs, vues tampon, scènes — ne doivent pas bouger d'une unité : si l'un d'eux bouge, c'est
  autre chose, et il faut chercher.

- **26 septembre 2026, `glb-structure.json` recapturé — et la prédiction de la veille corrigée.**
  L'export mesuré par la liste de fumée : **3 234 100 octets** au lieu de 41 473 604, **8 textures
  et 8 images** au lieu de 178. Nœuds, mailles, matériaux, accesseurs et scènes n'ont pas bougé
  d'une unité, comme annoncé.

  **Mais les vues tampon ont bougé aussi, et l'annonce ne les citait pas : 829 → 659.** Dans un
  `.glb`, chaque image embarquée occupe sa propre vue tampon ; en retirer 170 en retire 170, et la
  soustraction tombe juste. Ce n'est donc pas « autre chose » au sens du paragraphe ci-dessus, c'est
  la même cause vue d'un autre compteur — mais la veille, je n'avais nommé que trois compteurs là
  où il y en avait quatre. C'est l'exécution qui l'a montré, pas la relecture.

  Le point 24 de la liste de fumée vérifie désormais cette **arithmétique** plutôt que l'immobilité :
  `vuesTampon` attendu vaut `829 − (178 − images)`. Un écart là serait une vraie surprise. Et la
  recapture se fait par ce même point, sous `RECAPTURER_GLB=1` : il n'y a pas d'autre façon de
  capturer ce témoin, puisqu'il décrit un fichier que seule la vue 3D sait produire.

- **24 septembre 2026 — les six témoins ne sont PAS recapturés pour la `2.0.1`.** *Dette refermée le
  lendemain ; l'entrée reste, parce que la façon dont on s'en sort vaut d'être lue.* Ils portaient
  encore `2.0.0` et la date de build `2026-09-23`, alors que le paquet livré disait `2.0.1` et
  `2026-09-24`.

  **Pourquoi.** La capture demande une session ouverte sur la plateforme de démonstration, puisque
  les projets y vivent depuis la `2.0.0`, et celle du poste a été révoquée. Reprendre la main
  demandait un mot de passe.

  **L'écart attendu, écrit avant qu'il soit mesuré.** Deux substitutions, chacune de longueur
  constante, donc sans effet sur les décalages internes des PDF : `2.0.0` → `2.0.1` et
  `2026-09-23` → `2026-09-24`. Rien d'autre ne doit avoir bougé — la correction de cette version ne
  touche que les textures de la vue 3D, et aucun des six artefacts n'en porte.

  **Comment refermer.** Remettre l'ancien numéro et l'ancienne date dans les octets frais doit
  rendre les six empreintes de la `2.0.0` au bit près, et une comparaison ligne à ligne à version
  neutralisée ne doit montrer aucune ligne différente. C'est le protocole habituel ; ici il sert de
  quittance plutôt que de preuve d'avant-recapture.

  **Ce que cela coûte en attendant.** Les six témoins continuent de protéger contre un changement
  de contenu — le test compare bien les fichiers à leurs empreintes — mais ils ne prouvent plus que
  le build courant les reproduit. C'est une dette, pas une dérive silencieuse : elle est datée,
  chiffrée et refermable en une session.

- **25 septembre 2026**, `plan.html` v2.0.2 : **la dette est refermée, et par un chemin qui ne
  demande plus de session.**

  **Le décor.** La capture exige un projet ouvert, donc une plateforme. Plutôt que de dépendre
  d'une session de démonstration — qui expire, qu'on révoque, et dont la reprise demande un mot de
  passe — un serveur d'essai du bac à sable répond aux quatre routes que la porte et le dépôt
  appellent, et sert **le témoin `projet.json` lui-même** comme unique projet. Il accorde aussi
  `plan.export.dossier`, que le catalogue vend à partir de Scale et qu'aucun locataire de
  démonstration ne tient.

  **Ce que cela vaudrait, si on s'arrêtait là : pas grand-chose.** Capturer les témoins depuis un
  décor qu'on écrit soi-même, c'est se donner la réponse. La question était donc : un artefact
  produit derrière ce décor est-il le même que celui produit derrière la vraie plateforme ?

  **La preuve forte y répond, et c'est elle qui donne sa valeur à la capture.** L'ancien numéro et
  l'ancienne date remis dans les octets frais — `2.0.2` → `2.0.0`, `2026-09-25` → `2026-09-23`,
  deux substitutions de longueur constante — rendent les six empreintes du 23 septembre **au bit
  près**. Or celles-là ont été capturées derrière une **vraie** plateforme backprod, sur un projet
  réellement stocké en PostgreSQL. Le décor est donc prouvé équivalent, pour ce que les témoins
  mesurent : les six tailles sont identiques à l'octet, aucune ligne ne diffère à version
  neutralisée, et les deux PDF gardent leurs comptes exacts — 14 objets / 2 pages / 143 textes, et
  15 / 3 / 107.

  Ce que cela ne prouve pas, et qu'il faut continuer de vérifier ailleurs : que la vraie plateforme
  rende le document tel qu'on le lui a confié. C'est l'affaire de la liste de fumée, pas des
  témoins — et le document servi par le décor est justement celui qui a fait l'aller-retour par
  PostgreSQL le 23 septembre, avec l'ordre de clés que cette base impose.

- **28 septembre 2026**, `plan.html` v2.2.0 : **le relevé de façade**, et le schéma du projet
  passe à 2. Les six témoins sont recapturés sur le build `dist/index.html`, derrière le même
  décor d'essai que le 25 septembre (le témoin `projet.json` servi comme unique projet,
  `plan.export.dossier` accordé).

  **L'écart attendu, écrit avant d'être mesuré.** Trois substitutions, chacune de longueur
  constante : `2.0.2` → `2.2.0`, `2026-09-25` → `2026-09-28`, et le numéro de schéma
  `1` → `2` là où il est écrit — `"schemaVersion"` dans `projet.json`, `data-schema-version`
  dans `plan.svg`. Rien d'autre : le jeu de démonstration n'a ni relevé ni toit, et
  `serializeObjects` n'écrit `facades` et `toit` que s'ils existent. Les deux versions sautées
  depuis la dernière capture (`2.1.0`, l'IHM mobile) ne touchent aucun export.

  **La preuve forte, six sur six.** Les anciennes valeurs remises dans les octets frais rendent les
  six empreintes de la `2.0.2` **au bit près** ; les six tailles sont identiques à l'octet (15 323,
  25 109, 5 364, 72 031, 16 162 et 15 254), et à version neutralisée aucune ligne ne diffère.
  Occurrences du numéro : une par fichier texte, deux dans `plan.pdf`, quatre dans
  `dossier.pdf` — comme aux recaptures précédentes.

  Le témoin `glb-structure.json` ne bouge pas : la vue 3D n'ajoute aucune maille à un bâtiment
  sans relevé (`three/releve3d.ts`, testé). Il n'a pas été rejoué ici : le pilote de fumée demande
  Playwright, absent de ce poste.

- **29 septembre 2026**, toujours `2.2.0` (jamais déployée) : **un document s'écrit au plus petit
  schéma qui le décrit** (`model/migrations.ts`). Écrire `2` sur un plan sans relevé le faisait
  refuser par une plateforme restée à `[1]` — c'est ce qui empêchait la démonstration de s'ouvrir.
  Le témoin n'a ni relevé ni toit : son schéma redevient `1`, dans `projet.json` et dans
  `plan.svg`, une substitution de longueur constante chacune. Les quatre autres témoins ne portent
  pas le schéma et ne bougent pas.

  **La preuve forte, sur les deux fichiers touchés.** `2.2.0` → `2.0.2` et `2026-09-28` →
  `2026-09-25` remis dans les nouveaux octets rendent les empreintes de la `2.0.2` **au bit
  près** (`66338527…` et `f560cbca…`) : à numéro de version près, ce que la 2.2.0 écrit pour un plan
  sans relevé est ce que la 2.0.2 écrivait.

- **30 septembre 2026**, toujours `2.2.0` (jamais déployée) : **la maison du témoin reçoit un toit à
  croupes** (`MD/spec-toit-ign.md`), saisi — `{"forme":"croupes","hauteur":3,"angleFaitage":0,
  "source":"saisie"}` —, et le schéma passe à 3. C'est un changement voulu du contenu, pas de la
  version : il est annoncé ici, fichier par fichier, avec ce qui ne doit pas bouger.

  **Ce qui bouge.** `projet.json` : le bloc `toit` de la maison, écrit en dernier par
  `serializeObjects` (après `frozenVertices`), et `"schemaVersion": 3` — 72 031 → 72 160 octets.
  `plan.svg` : `data-schema-version="3"`, une substitution de longueur constante. Rien d'autre :
  le plan 2D ne dessine pas les toits.

  **Ce qui ne bouge pas, vérifié.** `plan.dxf`, `resume.txt`, `plan.pdf`, `dossier.pdf` : régénérés
  depuis le code (`tests/unit/export/regeneration.test.ts`, sous `SORTIE`), identiques au témoin à
  dates neutralisées. Ni les PDF ni le DXF ne portent le schéma ou le toit.

  **La preuve pour `projet.json`.** Le nouveau témoin a été servi comme unique projet derrière le
  décor d'essai habituel (serveur de développement, plateforme simulée), ouvert, puis exporté par
  « Exporter le projet (JSON) » : **72 160 octets, identiques au témoin** une fois le bloc `meta`
  neutralisé comme dans `echafaudage.test.ts`. Le toit fait donc l'aller-retour lecture → modèle →
  sérialisation sans changer d'un octet, à sa place dans l'ordre des clés.

  **`glb-structure.json` : calculé, pas recapturé — un témoin sciemment en retard sur ses octets.**
  Le point 24 de la liste de fumée ne peut pas le produire depuis le poste de cette session : les
  huit images de Poly Haven et Three.js viennent du réseau, que la politique de l'environnement
  refuse (Three.js r128 a été servi depuis le paquet npm, les images non). On a donc mesuré **l'effet
  du toit** : deux exports GLB du même témoin, hors ligne, sans puis avec le toit. Sans toit, les
  compteurs sont **exactement** ceux du témoin, images mises à part — 203 nœuds, 200 mailles,
  288 matériaux, 651 accesseurs, et 651 vues tampon, soit 659 − 8 images. Le décor hors ligne est
  donc équivalent pour tout ce qui n'est pas image. Avec le toit : **+14 nœuds, +14 mailles** (un
  pan par côté de la maison, qui en a quatorze), **+1 matériau** (la couverture, partagée par les
  quatorze pans), **+42 accesseurs et +42 vues tampon** (position, normale, indices par pan), et
  **+13 292 octets**. Le témoin porte ces sommes : 217 / 214 / 289 / 8 / 8 / 693 / 701 / 1,
  3 247 392 octets. Les compteurs sont sûrs ; la taille est une addition, que le point 24 ne
  vérifie pas. **À refermer** par le point 24 sous `RECAPTURER_GLB=1` sur un poste qui a le réseau :
  seul `octetsTotal` peut alors bouger, et de quelques octets d'alignement au plus.

  **2 octobre 2026 — tuiles et ardoises sur les toits (`c41e94e`) : compteurs recalculés.** Ce
  changement voulu, postérieur au témoin, donne à chaque pan de toit des coordonnées de texture et
  à la couverture sa texture dessinée (`three/couverture.ts`) : **+14 accesseurs** et **+14 vues
  tampon** (un attribut `uv` par pan, la maison en a quatorze), **+1 texture et +1 image** (la
  couverture, partagée par les pans), donc **+15 vues tampon** en tout. Mesuré hors ligne par le
  point 24 (three r128 servi depuis le paquet npm) : 217 nœuds, 214 mailles, 289 matériaux,
  707 accesseurs, 708 vues tampon pour 1 image — soit, avec les huit images de Poly Haven que le
  réseau ajoute, 9 / 9 / 707 / 716. `octetsTotal` reste celui d'avant, que le point 24 ne vérifie
  pas : **à refermer** comme plus haut, sous `RECAPTURER_GLB=1` avec le réseau.

  **8 octobre 2026 — `glb-structure.json` recapturé pour de bon, avec le réseau, et deux causes
  démêlées.** Le point 24 sous `RECAPTURER_GLB=1`, serveur de développement, three.js r128 depuis
  le paquet npm, les huit images de Poly Haven depuis le réseau : **3 533 024 octets, 292 nœuds,
  289 mailles, 434 matériaux, 9 textures et 9 images, 965 accesseurs, 974 vues tampon, 1 scène.**
  Les cinq autres combinaisons de classe et de thème rendent les mêmes compteurs.

  Le témoin précédent était **en retard sur `main`** : mesuré le même jour, par le même point, sur
  `origin/main` (`b838542`, avant ce changement), l'export rend déjà 283 nœuds, 280 mailles,
  421 matériaux et 905 accesseurs — ce sont les poteaux et la toile de la pergola, la plage et le
  bassin de la piscine, la clôture pièce par pièce, arrivés depuis le 2 octobre sans recapture
  (tous annoncés dans le CHANGELOG, aucun n'étant une quantité). **La part du changement du jour**,
  les détails des bâtiments en 3D (`three/detailsBatiment.ts`, spec-toit-ign §6.3), est la
  différence : **+9 nœuds et +9 mailles** (pour les deux bâtiments de la démonstration : un débord
  de toit, une gouttière, deux soubassements, deux lots d'ouvertures, une cheminée, et deux lots
  d'arêtes exportés en lignes, mode 1), **+13 matériaux** (chaque lot a les siens), **+60
  accesseurs** et autant de vues tampon. Le débord fait une maille à 28 primitives (dessus et
  dessous par côté de la maison, qui en a quatorze), les ouvertures une maille à trois (cadres,
  vitres, vantail). Les images ne bougent pas : rien de nouveau n'est photographié.

  Le point 24 vérifie désormais ces compteurs-ci ; `octetsTotal` est pour la première fois
  mesuré, pas additionné.

  **Le même jour, plus tard — plus de trait sur le toit : seul `octetsTotal` bouge.** Les arêtes
  du toit (faîtage, arêtiers, noues) ne sont plus tracées : les pans se lisent par la lumière, et le
  trait sombre faisait paraître la couverture dessinée. Les arêtes des murs restent, dans la même
  maille de lignes : **aucun compteur ne bouge** (292 / 289 / 434 / 9 / 9 / 965 / 974 / 1, mêmes
  valeurs dans les six combinaisons du point 24), et l'export perd **1 540 octets**, les sommets de
  ces segments : **3 531 484 octets**, recapturé sous `RECAPTURER_GLB=1`.

  **Encore le même jour — angles adoucis, toits-terrasses, soubassement sur relief : seul
  `octetsTotal` bouge.** Plus de trait à l'égout, et plus de trait aux sommets presque alignés : la
  maison de la démonstration garde ses mailles de lignes, avec moins de sommets. Le toit-terrasse
  ajoute une maille aux seuls bâtiments à toit plat, et la démonstration n'en a pas ; le soubassement
  ne change qu'avec un relief, qu'elle n'a pas ; les clôtures du voisinage sont décochées par
  défaut. **Aucun compteur ne bouge** (mêmes valeurs dans les six combinaisons du point 24) ;
  l'export fait **3 530 956 octets**, recapturé sous `RECAPTURER_GLB=1`.

Ce dossier est la **phase 0** de [`../../../MD/spec-migration-typescript.md`](../../../MD/spec-migration-typescript.md) §4
et le gel exigé par [`../../../MD/RELEASE.md`](../../../MD/RELEASE.md) §2.3.

**Règle qui porte tout le reste :** une empreinte qui bouge sans qu'un changement voulu l'explique
est un changement MAJEUR, pas une correction (RELEASE.md §2.1). Elle a tenu sans exception pendant
toute la migration, et la seule fois où ces octets ont bougé, c'est parce qu'on l'a décidé.


  **9 octobre 2026 — des arbres en 3D : `glb-structure.json` et `cadastre-objets.json`
  recapturés.** Les trois arbres de la démonstration ne sont plus une sphère sur un prisme mais un
  tronc, des branches et sept lobes chacun (`three/arbre3d.ts`, `MD/spec-arbres-3d.md`). Le point
  24 sous `RECAPTURER_GLB=1` rend **2 527 476 octets, 334 nœuds, 325 mailles, 431 matériaux,
  6 textures et 6 images, 1 133 accesseurs, 1 139 vues tampon** : +42 nœuds et +36 mailles (trois
  troncs, dix-huit branches, vingt et un lobes, moins les trois sphères et trois prismes), −3
  matériaux, textures et images (les prismes des arbres portaient chacun une texture, le tronc n'en
  porte plus — d'où le million d'octets en moins), et les accesseurs des couleurs par sommet. Le
  point 24 fixe désormais la date de l'étude au 21 juin avant l'export : un caduc est nu de
  novembre à mars, et le témoin ne doit pas dépendre du jour où la fumée se joue. Le témoin de
  l'import cadastral (`cadastre-objets.json`, `RECAPTURER_CADASTRE=1`) gagne `portArbre` et
  `essenceArbre` sur chacun des trois arbres estimés ; rien d'autre ne bouge. Aucune quantité ni
  aucun export de chiffrage n'est touché.


  **10 octobre 2026 — des feuilles de près : `glb-structure.json` recapturé.** Les arbres portent
  de petites feuilles instanciées (`three/feuilles.ts`, spec-arbres-3d §3.1), que l'export convertit
  en mailles ordinaires. Le point 24 sous `RECAPTURER_GLB=1` rend **2 944 160 octets, 337 nœuds,
  328 mailles, 434 matériaux, 6 textures et 6 images, 1 145 accesseurs, 1 151 vues tampon** :
  +3 nœuds, +3 mailles et +3 matériaux (une maille `arbre-feuilles-cuites` par arbre), +12
  accesseurs et vues tampon (position, normale, couleur, indices), +416 684 octets dont 412 776
  de géométrie pour 2 457 feuilles. Mesuré le même jour sur `origin/main` (4a3a02d) : 2 527 476
  octets, les compteurs du témoin précédent. Un premier essai donnait 4,4 Mo : la liste des mailles
  et leurs matrices vivaient dans `userData`, que l'exporteur écrit dans le JSON du fichier ; elles
  en sont sorties, et un test le garde.


  **10 octobre 2026, plus tard — `cadastre-objets.json` recapturé : la parcelle importée naît
  close.** `objetsDepuisCadastre` pose sur la parcelle du projet une clôture (`cloture` : palissade
  bois de 1,80 m, active, un portail en aluminium blanc `#f4f4f2` au milieu du côté 0, deviné sur
  rue par le point d'adresse) et les quatre anciens champs qui la suivent (`clotureActive`,
  `clotureHauteur`, `clotureCouleur`, `clotureTexture`) : +42 lignes, rien d'autre ne bouge. Les
  six exports de la démonstration et le GLB ne bougent pas (la démonstration n'est pas un import,
  et n'a pas de portail).


  **11 octobre 2026 — `glb-structure.json` recapturé : la démonstration actualisée, et les arbres
  en dôme.** Deux causes, mesurées séparément.
  - **La démonstration affichée a changé le 11 octobre** (actualisée, voisinage étendu à 100 m :
    147 objets au lieu de 35, `src/model/demo-projet.json`). Le point 24 se joue sur elle, et son
    témoin aurait dû être recapturé ce jour-là : il ne l'a pas été. Mesuré sur `origin/main`
    (7e1d4ef, avant les arbres) : **12 220 108 octets, 1 183 nœuds, 995 mailles, 1 458 matériaux,
    16 textures et 16 images, 3 407 accesseurs, 3 423 vues tampon**, contre 337 / 328 / 434 / 6 /
    1 145 / 1 151 au témoin. Tout l'écart des compteurs vient de là (58 bâtiments en corps et
    pignons, 55 parcelles, le relief et son maillage secondaire, le gazon).
  - **Les arbres se dessinent en « Dôme » par défaut** (`three/houppiers3d.ts`, `styleArbre`) : les
    mêmes sept lobes que le dessin d'origine, sans toupet, en sphères de 22 × 16 au lieu de 14 × 10.
    Les compteurs ne bougent pas ; le fichier gagne 249 988 octets de géométrie (**12 470 096
    octets**).
  Aucun export de chiffrage n'est touché : les six empreintes de la démonstration témoin
  (`?temoin`) restent identiques.

  **16 octobre 2026 — three.js r128 → 0.186.1 : `glb-structure.json` recapturé.** Mesuré sur la même
  démonstration, `origin/main` (r128) contre cette branche (0.186.1), le point 24 :
  - **Inchangés** : 1 183 nœuds, 995 mailles, 1 458 matériaux, 16 textures, 16 images, 1 scène, les
    1 543 primitives et leurs attributs (positions, normales, coordonnées de texture, couleurs).
  - **+728 accesseurs et +728 vues tampon (3 407 → 4 135, 3 423 → 4 151)** : des indices. Pour une
    maille à plusieurs matériaux dont la géométrie n'est pas indexée, l'exporteur r128 écrivait chaque
    primitive **sans indices** — chaque matériau dessinait donc *toute* la maille ; le 0.186.1 force
    les indices et découpe par groupe. L'export est plus juste ; l'écart de compteur ne dit pas autre
    chose (et c'est lui, non une régression, qui fait bouger le témoin).
  - **+1 extension** : `EXT_materials_bump` (les cartes de relief, ignorées par la r128).
  - **Octets : 12 470 096 → 12 624 552** (+154 456 : les indices et l'extension). Les images JPEG
    restent des JPEG : la r128 les rangeait en `RGBFormat` et l'exporteur les réécrivait en JPEG,
    le 0.186.1 les passerait en PNG (20,6 Mo) sans `userData.mimeType` (`garderLeJpeg`,
    `three/chargeurs.ts`).
  - L'en-tête `asset.generator` devient `THREE.GLTFExporter r186`.
  Aucun autre export ne bouge : les six empreintes texte restent identiques. Les octets du .glb
  téléchargé changent sans qu'aucun format ne casse ni qu'aucune quantité bouge : au plus une version
  mineure (`MD/RELEASE.md`), annoncée au CHANGELOG ; `APP_VERSION` n'est pas touchée ici.

  **16 octobre 2026 — les arbres d'EZ-tree : `glb-structure.json` et `cadastre-objets.json` recapturés.**
  Les anciens dessins d'arbres (lobes, dôme, touffes, taillé, maquette, feuilles instanciées) sont
  supprimés ; un arbre est généré par EZ-tree d'après une essence de la bibliothèque du serveur
  (`MD/spec-arbres-3d.md`). Le témoin se capture **sans bibliothèque** (la fumée n'en simule pas au
  point 24), donc avec le *repli* : un tronc et une boule.
  - `glb-structure.json` : le point 24 rend **1 144 nœuds, 956 mailles, 1 455 matériaux, 16 textures
    et 16 images, 3 958 accesseurs, 3 974 vues tampon, 11 717 344 octets** (avant : 1 183 / 995 / 1 458 /
    16 / 16 / 4 135 / 4 151, 12 624 552 octets) : −39 nœuds, −39 mailles (un arbre n'a plus ses
    branches ni ses lobes, mais un tronc et une boule), −3 matériaux, −177 accesseurs.
  - `cadastre-objets.json` : les trois arbres estimés de l'import n'écrivent plus `portArbre` ni
    `essenceArbre` (six lignes) ; ils portent `especeArbre` quand une bibliothèque est chargée, aucun
    ici. `projet.json` et les quatre autres empreintes ne bougent pas.
  - Avec une bibliothèque de deux essences (un chêne et un pin d'EZ-tree, `oak_small`, `pine_small`),
    mesuré le même jour sur la démonstration : **15 355 592 octets**, 1 140 nœuds, 954 mailles, 22
    textures. Les arbres y sont des lots `InstancedMesh` (extension `EXT_mesh_gpu_instancing`,
    obligatoire pour qui lit le fichier : la visionneuse de Plan et model-viewer la lisent) ; l'écorce
    n'emporte que sa couleur, les cartes de relief et d'occlusion sont retirées le temps de l'export.
    Le reste du poids vient des textures d'EZ-tree (écorce et feuilles) : environ 1,8 Mo par essence.

## Les fichiers

Les empreintes normalisées sont celles que vérifient `tests/unit/echafaudage.test.ts` (témoins) et
`tests/unit/export/regeneration.test.ts` / `empreintesPiscinePergola.test.ts` (régénérés depuis le code) ; la table est relevée sur
ces tests le 25 octobre 2026 (elle portait encore les empreintes de la capture 2.0.2), recapturée à la 3.0.0 le même jour, à la 4.0.0 le 28 octobre 2026, à la 5.0.0 le 29 octobre 2026, à la 5.1.0 le 30 octobre 2026, puis à la 5.2.0 le même jour.

| Fixture | Producteur | Octets | SHA-256 (normalisé) |
|---|---|---:|---|
| [`resume.txt`](resume.txt) | bouton « Générer le résumé » | 15 323 | `a141dd01ef3f923cfdd5e0d4436165afddf84106f0c3e93fe9a8c75e8f47da8c` |
| [`plan.svg`](plan.svg) | `buildExportSVG` | 25 109 | `ff55b142e7c2d9305ec150cf6fa07329f7f505d74747831b76a6d031237430b8` |
| [`plan.dxf`](plan.dxf) | `buildExportDXF` | 5 364 | `6fd211504113d2b385fa8492b1e636a135e7c10fddcccd31659a0452f97ccab4` |
| [`projet.json`](projet.json) | `exportProjetJSON` | 72 160 | `da204eeac6c836298a61ab75d8888fb096e2c5d021d21552de9fbe5784c393b2` |
| [`plan.pdf`](plan.pdf) | `buildExportPDF` (2 pages) | 16 162 | `d430b090ed9a56945301fcaf9b17f9c5f5ebbff56ef61ea95293f6e1f9ec0bcd` |
| [`dossier.pdf`](dossier.pdf) | `buildDossierPDF` (3 pages) | 15 254 | `a9f33b7ea49aa342c630165624767e8a46b165cd67112a526abad9395770c13d` |
| [`glb-structure.json`](glb-structure.json) | `genererGlb`, **empreinte structurelle** (recapturé le 29 octobre 2026 par le point 24, voir « Version 5.0.0 ») | 470 | `6b876e99db436a2789d1e3951b33d5c974bcf7c59418c86b931e7dde8d5accad` |
| [`quantites-demo.txt`](quantites-demo.txt) | extrait du résumé, vérifié ligne à ligne contre le résumé régénéré | 2 130 | — |
| [`dossier-piscine.pdf`](dossier-piscine.pdf) | `construireDossierPiscine` (bassin par défaut, 32 m²) | 41 873 | `d8358fdf30ab74fee385832100ad5f482a566c5e9d0cfe84109cfa2a9fd0b45c` (brut) |
| [`note-calcul.pdf`](note-calcul.pdf) | `construireNoteCalculPDF` (carport) | 10 284 | `ad8a39d5978628d7bba613940b5a3cea965bfa351211fb616cfa2a734d4bd7ec` (brut) |
| [`moteur-piscine-pergola.json`](moteur-piscine-pergola.json) | `calculerPiscine`, `calculerPergola`, `chiffrerPergola` | 13 648 | `7a84dbc2f97f288d0a5330b1ed601f5008402b6e3ce2da35bc9e5143d3eea219` (brut) |

## La rupture du 29 août 2026

`APP_VERSION` est estampillée dans les six artefacts. Passer de `1.0.0` à `1.1.0-alpha.1` — la
livraison du build à la place du fichier mono-page d'origine — **change donc ces octets**, et
l'invariant de la migration passe de « les empreintes ne bougent pas » à « elles ne bougent que par
la version ».

Ce que cela vaut a été établi **avant** de recapturer, pas après, et par deux chemins :

1. Le même build, encore estampillé `1.0.0`, reproduisait les six empreintes de la version figée au
   bit près — c'est la vérification faite à chaque étape depuis la phase 1.
2. Après le changement de numéro, une comparaison **ligne à ligne** avec les anciennes fixtures ne
   montre qu'**une seule ligne différente** dans chacun des quatre artefacts texte, et c'est celle
   qui porte la version :

   | Fixture | Ce qui change |
   |---|---|
   | `resume.txt` | ligne 1, l'en-tête |
   | `plan.svg` | ligne 1, l'attribut `data-app-version` |
   | `plan.dxf` | ligne 2, la signature |
   | `projet.json` | ligne 9, `meta.appVersion` |

   Les deux PDF ne peuvent pas se comparer ligne à ligne — la chaîne s'allonge de 8 octets, donc
   tous les décalages internes bougent. Ils ont été comparés sur leur **contenu** : 143 textes,
   14 objets, 2 pages pour `plan.pdf` ; 106 textes, 15 objets, 3 pages pour `dossier.pdf`. Aucun de
   ces nombres ne change, et les seuls textes qui diffèrent (1 et 3 respectivement) sont ceux qui
   portent la version.

Le **schéma du projet ne bouge pas** : un fichier enregistré par la 1.0.0 s'ouvre dans la nouvelle
version, et l'inverse aussi. La rupture porte sur l'artefact livré, pas sur les données.

Le témoin figé [`../../../legacy/plan_interactif.html`](../../../legacy/plan_interactif.html) reste
en 1.0.0 : c'est lui qui sert d'oracle pour tout ce que ces empreintes ne voient pas, et les
comparaisons avec lui doivent désormais neutraliser la version en plus de la date.

## Le GLB se compare structurellement, pas octet par octet

Le binaire pèse 41,5 Mo et la sortie de `THREE.GLTFExporter` n'est pas déterministe : elle dépend
du moment où les textures ont fini de charger (spec §10.1). `glb-structure.json` fige donc ce qui
doit rester stable : 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 1 scène, en-tête glTF 2.

Limite connue : l'exporteur n'attribue de nom ni aux maillages ni aux matériaux, donc la comparaison
porte sur les compteurs, pas sur les noms que la spec évoque. Un écart de compteur signale une
scène différente ; il ne dit pas *quel* objet a changé.

Revérifié le **20 septembre 2026** en `1.1.0-alpha.16`, en direct sur `dist/index.html` : export en 9,7 s,
41 473 612 octets (8 de plus que la capture, l'exporteur n'est pas déterministe), et les **huit compteurs
identiques** — 203 nœuds, 200 maillages, 288 matériaux, 178 textures, 178 images, 651 accesseurs, 829
vues tampon, 1 scène. La visionneuse rouvre le modèle généré.

## Normalisation avant hachage

Trois substitutions, appliquées au contenu **binaire** du fichier avant le SHA-256. Chaque motif de
remplacement a exactement la longueur du motif remplacé, sinon les décalages internes du PDF (table
xref) changeraient et rendraient l'empreinte inutilisable :

```
s{\d{2}/\d{2}/\d{4}}{JJ/MM/AAAA}g                          dates affichées
s{D:\d{14}}{D:AAAAMMJJHHMMSS}g                             /CreationDate du PDF
s{"(exportedAt|writtenAt)":\s*"[^"]*"}{"$1":"HORODATAGE"}g  horodatages du projet JSON
```

Les autres sources de non-déterminisme sont **neutralisables depuis le 29 août 2026**, et elles sont
désormais réunies dans [`../../../src/model/cles.ts`](../../../src/model/cles.ts) :

- `Date.now()` dans les clés d'objets (`obj…_1`, `path…_6`), que la spec §10.1 avait repérée ;
- **`Math.random()` dans les identifiants de cotes** (`m…_a4f2b`), qu'elle n'avait *pas* repérée :
  les cotes n'ont pas de compteur, c'est un tirage qui distingue deux cotes posées dans la même
  milliseconde.

Les deux s'injectent (`horloge`, `alea`), avec les vraies sources par défaut. Elles n'apparaissent
pas dans ces fixtures — la capture ne crée ni objet ni cote — mais un scénario qui en crée peut
maintenant être comparé à lui-même, ce que font `tests/unit/model/cles.test.ts` et
`tests/unit/model/creation.test.ts`.

`newObjCounter` n'a pas besoin d'être injecté : il repart de zéro à chaque chargement, donc il est
déjà reproductible.

## Ce que ces empreintes ne voient pas

Elles sont capturées sur le jeu de démonstration **tel qu'il est**, c'est-à-dire avec la plupart des
cases d'affichage décochées. Conséquence mesurée le 28 août 2026 : `plan.svg` contient **14**
étiquettes de mesure seule, et **aucune** étiquette composée (`nom - valeur`) ni **aucun** angle.
La règle qui compose ces textes existe pourtant à six endroits du programme — écran, SVG, PDF du
plan, PDF du dossier — et deux d'entre eux emploient volontairement une ponctuation ASCII.

**Une régression sur la composition des étiquettes ne ferait donc bouger aucune de ces empreintes.**
C'est le même angle mort que celui du zoom (une transformation de vue que les exports ne voient pas,
spec §10.1) : ici, une branche de code que le jeu de démonstration n'emprunte pas.

Contrôle complémentaire, à rejouer quand on touche aux étiquettes — cocher « Nom segment », « Nom
coin », « Dimension » et « Angle » sur **tous** les objets de la table d'affichage, puis exporter :

| Mesure | Valeur attendue |
|---|---:|
| `<text>` dans `plan.svg` | 265 |
| dont étiquettes composées (` - `) | 204 |
| dont angles (`deg`) | 88 |
| longueur cumulée des textes SVG | 3 931 |
| longueur cumulée des textes PDF (`( … ) Tj`) | 5 019 |

Relevé identique sur `dist/index.html` et sur le témoin figé `legacy/plan_interactif.html`.

**Le relief non plus** (`MD/spec-relief.md`, 6 octobre 2026). Le jeu de démonstration n'est pas
calé par le cadastre et ne porte aucune grille d'altitudes : `plan.svg` n'a pas de groupe
`relief-courbes`, le plan de masse n'a pas de courbes de niveau, le dossier n'a pas de pièce DP3,
et la coupe de la piscine trace un terrain plat. Ces branches ne font bouger aucune empreinte ;
`tests/unit/export/relief.test.ts` les vérifie sur une grille plane fabriquée, et vérifie qu'un
projet sans relief écrit le même `plan.svg` et le même nombre de pages qu'avant.

**Phase 2 : le témoin « projet avec relief »** (`relief-moteur.json`, 6 octobre 2026). Dès qu'un
projet porte un relief, le moteur compte sur le sol en pente (`MD/spec-relief.md` §6) : les plots
par gamme, les têtes de vis, les poteaux d'une pergola jusqu'à leur sol, la fouille d'une piscine
cellule par cellule, le remblai de nivellement, les poteaux d'une plage par hauteur. Ces nombres
n'existent dans aucun témoin d'avant : `relief-moteur.json` les fige sur une grille plane à 8 %
vers l'est (terrasse sur plots, terrasse sur vis, pergola, piscine hors-sol avec plage), et
`tests/unit/engine/relief-oracle.test.ts` exige l'égalité stricte. Le recapturer après un changement
voulu : `REECRIRE_TEMOIN_RELIEF=1 npx vitest run tests/unit/engine/relief-oracle.test.ts`, et le
dire ici. **Un projet sans relief ne bouge pas** : `moteur-terrasses.json` et les six empreintes
restent identiques (`solDuProjet` rend `null`, chaque appelant garde son chemin d'avant).

## Comparer deux imports cadastraux

L'import depuis une adresse ne peut pas être figé ici : il dépend des services IGN en ligne. Il se
compare en le rejouant sur les deux versions, à la même adresse et avec les mêmes choix. Quatre
champs doivent être neutralisés — un de plus que pour les exports, et c'est le piège :

```
"(recupereLe|interrogeLe|exportedAt|writtenAt)":\s*"[^"]*"   →   "$1":"HORODATAGE"
```

`interrogeLe` vient de l'interrogation du PLU. Comme les trois autres, il fait 24 caractères : deux
exports peuvent donc avoir **exactement la même taille** et deux empreintes différentes.

Relevé du 28 août 2026, « Place de la Mairie 35000 Rennes », choix par défaut à chaque étape
(parcelle AC 530, bâtiments et haies et végétation cochés, arbres décochés) : projet de
**25 108 octets**, SHA-256 `84bc517386e0a0201b8445d57eb0c4ae84fe3ff70ed9f0dfabfdb76b84f4b6c3`,
4 objets — la parcelle de 418 m² et trois bâtiments de 16 ; 15,5 et 13,8 m.

**Cette empreinte-là ne se conserve pas, et c'est mesuré.** Rejoué le 30 août 2026 sur le témoin
figé lui-même — donc à code strictement identique — le même import rend **25 335 octets** : 227 de
plus. Le contenu du GPU/PLU a bougé entre les deux dates. La taille et le SHA-256 ci-dessus ne
valent donc que comme repère historique ; ce qui se vérifie, c'est **l'égalité entre deux versions
rejouées le même jour**, comme au palier `geo/` (voir plus haut, v1.1.0-alpha.10). Ce qui reste
stable dans le temps, ce sont les quatre objets, la parcelle AC 530 de 418 m² et les hauteurs
16 ; 15,5 et 13,8 m.

## Quantités

[`quantites-demo.txt`](quantites-demo.txt) fige les surfaces et longueurs calculées, objet par
objet. C'est le fichier à regarder en premier quand une empreinte bouge : il dit **quel nombre** a
changé, là où le SHA-256 dit seulement que quelque chose a changé.

Emprise totale hors parcelle de référence : **409,1 m² (56,6 % de la parcelle)** depuis le 27 octobre 2026 (408,4 m²,
56,5 % auparavant : les chemins courbes, voir « Chemins » plus bas).

## Regénérées à chaque `npm test` (28 septembre 2026)

Jusqu'au 27 septembre, `tests/unit/echafaudage.test.ts` hachait les **fichiers témoins** : il
prouvait qu'on ne les avait pas retouchés, pas que le code les produisait encore. La preuve de
régénération se faisait à la main, à chaque recapture. Depuis le 28,
`tests/unit/export/regeneration.test.ts` regénère **cinq des six** exports depuis le code, sur
`DEMO_TEMOIN_OBJECTS`, et compare leurs empreintes normalisées à celles des témoins :

- `plan.svg`, `plan.dxf`, `resume.txt`, `plan.pdf` et `dossier.pdf` ;
- la version et la date de build sont celles du témoin (2.0.2, 2026-09-25), passées en paramètre ;
  le dictionnaire `/Info` du dossier, qui les lit dans `model/version.ts`, est ramené aux mêmes
  valeurs, à longueur égale pour ne pas décaler la table xref ;
- l'horloge est posée au jour de la capture ; le texte est encodé en UTF-8, comme le fait le
  `Blob` du navigateur ;
- les parasols sont contraints à leur terrasse avant l'export, comme le premier rendu le fait
  dans l'application (`contraindreParasols`) : sans cela, `plan.pdf` diffère au centième de point
  sur deux cercles.

`projet.json` n'est pas regénéré : son bloc `meta` vient du serveur (identité, dates), et le test
le neutraliserait presque entièrement. Le GLB reste comparé structurellement (plus haut).

Premier passage : les cinq identiques, sur le code du 28 septembre — après la sortie de `boot()`,
le découpage de `buildThreeScene` et de `construirePDF`, et le retrait des 506 assertions `!`.

## Rejouer la capture

> **Depuis la 2.1.1, le plan de démonstration que l'utilisateur ouvre porte les couleurs de la
> maquette** (`DEMO_OBJECTS`, `src/model/demo.ts`). Les témoins se capturent sur le plan d'origine,
> `DEMO_TEMOIN_OBJECTS`, que le serveur de développement ouvre par `http://localhost:5199/?temoin`.
> Les deux ne diffèrent que par le remplissage et le trait des objets (`tests/unit/model/demo.test.ts`).
> Vérifié à la 2.1.1 : sur `?temoin`, `plan.svg`, `plan.dxf`, `resume.txt`, `plan.pdf` et
> `dossier.pdf` sont identiques aux témoins, numéro neutralisé, et `projet.json` a les mêmes objets
> et les mêmes mesures. Sur la démonstration recolorée, le SVG diffère de 48 lignes, toutes des
> couleurs, et le résumé et le DXF restent identiques.

Sans Node ni chaîne de test à ce stade, la capture passe par le navigateur et le serveur de
développement du dépôt :

1. `pwsh -File servir.ps1`, puis ouvrir `http://localhost:8765/plan.html` (jeu de démonstration).
2. Intercepter `URL.createObjectURL` pour récupérer les blobs et neutraliser le clic des ancres
   `download`, puis déclencher les six exports.
3. Poster chaque blob sur `POST /_fixture/<nom>` : le serveur écrit les octets bruts dans ce
   dossier. Ce détour existe parce qu'un PDF qui transite par une chaîne de caractères JavaScript
   n'est plus le même fichier.
4. Comparer : `perl -0777 -pe '<les trois substitutions>' fichier | sha256sum`.

Toute divergence se compare d'abord à `quantites-demo.txt`, ensuite au diff de l'export lui-même.

## Piscine, pergola et note de calcul (25 octobre 2026)

L'audit d'architecture a relevé des exports et des calculs qu'aucune empreinte ne gardait : le dossier de mairie d'une piscine,
la note de calcul d'un abri, les calculs de la piscine et de la pergola (le plan témoin n'a ni l'une ni l'autre).
`tests/unit/export/empreintesPiscinePergola.test.ts` les régénère depuis le code et compare leur SHA-256 **brut** : la version, le
build et l'heure se passent en paramètre (`MetaDossierPiscine`, `MetaNote` : `buildAt`, `maintenant`/`date`), rien n'est à
neutraliser. `REECRIRE_EMPREINTES=1` les recapture, ce qui se dit ici.

Capturés après le changement du même jour : les chiffres du dossier piscine ne passent plus par `toLocaleString('fr-FR')`, qui
séparait les milliers par U+202F, un caractère que la police du PDF (WinAnsi) n'a pas (`util/format.ts::chiffreFrGroupe`, une
espace simple). Le témoin porte une taxe d'aménagement de « 8 000 EUR » pour vérifier ce cas. Aucune empreinte existante ne bouge.

## Ce que devient un ancien fichier (25 octobre 2026)

Deux chemins changent les nombres d'un ancien fichier sans numéro de schéma : les valeurs que le moteur pose quand un champ de
construction manque (`engine/construction.ts::ensureConstruction`), et la migration 2 → 3, qui donne à un bâtiment BD TOPO le toit
que l'algorithme d'aujourd'hui calcule (`model/migrations.ts`). Ils ne sont pas encore figés par schéma ; deux témoins font au moins
qu'un changement ne passe pas en silence (`tests/unit/model/anciensFichiers.test.ts`) :

| Fixture | Ce qu'elle fige |
|---|---|
| [`defauts-construction.json`](defauts-construction.json) | la construction posée sur un objet sans construction, et sur une construction vide |
| [`migration-2-3.json`](migration-2-3.json) | le toit donné par la migration à trois bâtiments BD TOPO (rectangle mesuré, L sans mesure, construction légère) |

S'ils bougent, c'est un événement de version (`MD/RELEASE.md`) : le dire ici, puis `REECRIRE_EMPREINTES=1`.


## Version 3.0.0 (25 octobre 2026)

Les témoins régénérés depuis le code (`regeneration.test.ts`, `empreintesPiscinePergola.test.ts`) passent de `2.2.0`, build du
28 septembre, à `3.0.0`, build du 25 octobre (`SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`, puis
`REECRIRE_EMPREINTES=1`). Deux substitutions de longueur constante ; l'heure de l'export reste le 28 septembre à 23 h 22.

**La preuve forte, sept sur sept.** `3.0.0` → `2.2.0` et `2026-10-25` → `2026-09-28` remis dans les octets frais rendent les
anciens fichiers **au bit près** pour `plan.svg`, `plan.dxf`, `resume.txt`, `dossier-piscine.pdf` et `note-calcul.pdf` ; tailles
identiques à l'octet. Pour `plan.pdf` et `dossier.pdf`, capturés au navigateur, une seule ligne diffère : la seconde de
`/CreationDate` (`232241`/`232242` au navigateur, `232200` pour l'horloge du test), que la neutralisation d'EMPREINTES.md
efface déjà. Occurrences du numéro : une par fichier texte, deux dans `plan.pdf`, quatre dans `dossier.pdf` et `note-calcul.pdf`,
neuf dans `dossier-piscine.pdf`. `projet.json` (entrée du témoin, pas un export régénéré) garde `2.2.0`.

Les témoins du moteur, du relief, de la piscine et de la pergola, des valeurs par défaut et de la migration 2 → 3 ne portent pas
de version et ne bougent pas.


## Chemins : une largeur par défaut, une surface sur la courbe (27 octobre 2026) — version majeure

Deux décisions du propriétaire, qui changent des nombres exportés (`MD/RELEASE.md` §2.1 : version majeure) :

- **La largeur d'un chemin sans largeur écrite vaut 1 m partout** (`model/ouvrages/surfaces.ts::largeurChemin`). Le dossier PDF
  (`dimensionsObjet`, l'épaisseur du trait du plan de masse) et le dossier piscine lisaient 0,5 m ; l'inspecteur, le résumé, le
  PDF du plan, le SVG et la 3D lisaient 1 m.
- **La surface d'un chemin se compte sur le tracé dessiné** (`surfaceChemin` = `longueurTrace` × largeur) : la courbe d'un chemin
  courbe, échantillonnée à 32 cordes par segment, et non plus ses segments droits. La « longueur totale » du résumé, de
  l'inspecteur et de la feuille de sélection suit.

La courbe elle-même n'a pas bougé : mise en commun dans `geometry/courbe.ts`, elle redonne au bit près le `d` du SVG (`plan.svg`
inchangé, quatre chemins courbes), les opérateurs du PDF et les points de la 3D (oracle des anciennes copies dans
`tests/unit/geometry/courbe.test.ts`).

**Ce qui bouge sur le témoin.** Ses chemins ont tous une largeur écrite : seule la seconde décision le touche.

| Chemin | Surface avant | Surface après | Longueur totale avant | après |
|---|---:|---:|---:|---:|
| Chemin Arrière (courbe, 11 points) | 26,84 m² | 27,37 m² | 44,54 m | 45,43 m |
| Chemin ZigZag (courbe, 7 points) | 10,78 m² | 10,96 m² | 21,47 m | 21,83 m |
| Chemin Table (courbe, 4 points) | 3,40 m² | 3,40 m² | 6,76 m | 6,78 m |
| Chemin Buandrie (courbe, 3 points) | 1,00 m² | 1,02 m² | 1,98 m | 2,03 m |
| Abri de jardin Chemin (droit) | 0,94 m² | inchangé | — | — |

Emprise totale hors parcelle : 408,4 m² (56,5 %) → 409,1 m² (56,6 %) ; au PDF du plan, 408,37 → 409,11 m², et la part du
Chemin Arrière 3,7 % → 3,8 %.

- `resume.txt` : huit lignes (trois surfaces, l'emprise totale, quatre longueurs totales), mêmes 15 323 octets ; empreinte
  normalisée `058fea61…`. `quantites-demo.txt` suit, mêmes huit nombres.
- `plan.pdf` : six textes de la page des surfaces, mêmes 16 162 octets (aucun décalage de la table `xref`) ; empreinte
  normalisée `db3bc8b6…`. Régénéré par `SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`, comme à la 3.0.0.
- **Inchangés** : `plan.svg`, `plan.dxf`, `dossier.pdf` (aucun chemin du témoin n'est compté parmi les objets posés sur une terrasse, et tous ont une largeur),
  `dossier-piscine.pdf`, `note-calcul.pdf`, et tous les témoins du moteur.

Un ancien projet peut donc montrer un autre nombre dans le résumé, le PDF du plan et le dossier PDF (surface d'un chemin courbe ;
surface et trait d'un chemin sans largeur, au dossier PDF et au dossier piscine).


## Version 4.0.0 (28 octobre 2026)

Version majeure (`MD/RELEASE.md` §2.1) : les chemins (plus haut), la DP2 au point le plus haut et les annexes lues au LiDAR changent
des nombres exportés de projets enregistrés. **Aucun de ces trois changements ne bouge un témoin** : les nombres des chemins du
témoin ont été recapturés le 27 octobre (section précédente), aucun témoin ne porte de DP2, et le témoin n'est pas géolocalisé (rien
n'y est lu au LiDAR, ses annexes comprises). Le schéma de ses documents reste celui qui le décrit : 3 pour `plan.svg`.

Les sept témoins régénérés depuis le code (`regeneration.test.ts`, `empreintesPiscinePergola.test.ts`) passent de `3.0.0`, build du
25 octobre, à `4.0.0`, build du 28 octobre (`SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`, puis
`REECRIRE_EMPREINTES=1 npx vitest run tests/unit/export/empreintesPiscinePergola.test.ts`). L'heure de l'export reste le
28 septembre à 23 h 22.

**La preuve forte, sept sur sept.** `4.0.0` → `3.0.0` et `2026-10-28` → `2026-10-25` remis dans les octets frais rendent les
anciens fichiers **au bit près**, tailles identiques à l'octet, pour `resume.txt`, `plan.svg`, `plan.dxf`, `plan.pdf`,
`dossier.pdf`, `dossier-piscine.pdf` et `note-calcul.pdf` — sans exception cette fois : `dossier.pdf`, capturé au navigateur à la
3.0.0, avait été régénéré depuis le code depuis, et sa seconde de `/CreationDate` est celle de l'horloge du test. Occurrences du
numéro : une par fichier texte, deux dans `plan.pdf`, quatre dans `dossier.pdf` et `note-calcul.pdf`, neuf dans
`dossier-piscine.pdf` ; la date de build, une fois dans chacun des quatre PDF, nulle part dans les fichiers texte.

| Fixture | Empreinte 3.0.0 | Empreinte 4.0.0 |
|---|---|---|
| `resume.txt` (normalisée) | `058fea61…` | `5189d35d…` |
| `plan.svg` (normalisée) | `29a67cbd…` | `f8195550…` |
| `plan.dxf` (normalisée) | `7b37c0be…` | `359afede…` |
| `plan.pdf` (normalisée) | `db3bc8b6…` | `92470176…` |
| `dossier.pdf` (normalisée) | `5b2d62c8…` | `d112446e…` |
| `dossier-piscine.pdf` (brute) | `3680d403…` | `97b491ea…` |
| `note-calcul.pdf` (brute) | `2b4e47ba…` | `51d69163…` |

Ne bougent pas : `projet.json` (entrée du témoin, garde `2.2.0`), `glb-structure.json`, `quantites-demo.txt`, et les témoins du
moteur, du relief, de la piscine et de la pergola, des valeurs par défaut et de la migration 2 → 3, qui ne portent pas de version.
Le schéma 6 a son propre témoin, hors de ce dossier : `tests/fixtures/migrations/schema-5.json` (un document 5 se lit tel quel et
s'écrit au 6).


## Version 5.0.0 — la cheminée d'office retirée (29 octobre 2026) — changement d'export, version majeure

La Vue 3D posait une cheminée que personne n'avait vue : sur tout toit simple ou en volumes en pente de plus de 40 m², à moins de
120 m du centre de la scène, `poserCheminee` (`three/detailsBatiment.ts`) dessinait une boîte de 0,5 × 1,1 × 0,5 m au tiers du
faîtage (`MD/spec-flux-batiment.md`, point 12). Elle est retirée : une souche ne vient plus que des données (`corps.cheminees` :
LiDAR, règles, audit, Mode Toit), dessinée par `three/cheminees3d.ts`. Le `.glb` exporté d'un projet enregistré perd donc une
maille par bâtiment concerné : c'est un changement d'un artefact exporté (`MD/RELEASE.md` §2.1), annoncé comme **version majeure**.

**Ce qui bouge : `glb-structure.json`, calculé, pas recapturé.** Sur la démonstration du point 24 (`DEMO_OBJECTS`), un seul bâtiment
portait la cheminée d'office : la Maison (toit simple à croupes saisi, 152 m², au centre de la scène). Les 58 voisins en corps n'ont
aucune souche dans leurs données ; les voisins en toit simple sont plats, sans toit, ou sous 40 m². Relevé par un script sur
`DEMO_OBJECTS` (`modeToitActif`, `toitDessine`, aire), et l'effet d'une telle maille mesuré par `GLTFExporter` 0.186.1 sous Node
(une `BoxGeometry` et son `MeshStandardMaterial` de plus : +1 nœud, +1 maille, +1 matériau, +4 accesseurs — position, normale,
coordonnées de texture, indices — et +4 vues tampon). Le témoin passe donc de **1 144 / 956 / 1 455 / 16 / 16 / 3 958 / 3 974** à
**1 143 nœuds, 955 mailles, 1 454 matériaux, 16 textures et 16 images, 3 954 accesseurs, 3 970 vues tampon**, 1 scène.
`octetsTotal` reste celui du 16 octobre (11 717 344, environ 1,8 Ko de trop), que le point 24 ne vérifie pas. **À refermer** par le
point 24 sous `RECAPTURER_GLB=1` : si les compteurs mesurés diffèrent de ceux-ci, la Maison n'était pas en toit simple dans la
partie jouée, et le témoin se reprend sur la mesure, en le disant ici.

**Ne bougent pas** : les six empreintes texte et PDF, `projet.json`, `quantites-demo.txt`, les témoins du moteur, du relief, de la
piscine et de la pergola, des valeurs par défaut et de la migration (`echafaudage.test.ts`, `tests/unit/export/` : verts sans
recapture). Le plan 2D, le dossier et les quantités ne dessinent ni ne comptent de cheminée.

**Refermé le 29 octobre 2026 par le point 24.** La fumée complète sur `main` (`88435d79`, au bureau, thème clair, réseau témoin,
`RECAPTURER_GLB=1`) a mesuré exactement les compteurs calculés plus haut : 1 143 nœuds, 955 mailles, 1 454 matériaux, 16 textures et
16 images, 3 954 accesseurs, 3 970 vues tampon. Le témoin est donc repris sur la mesure, et `octetsTotal` passe de 11 717 344 à
**11 709 376** (7 968 octets de moins : la boîte, son matériau et ses quatre tampons). SHA-256 de `glb-structure.json` :
`6b876e99…`.

**Les sept témoins régénérés passent à `5.0.0`, build du 29 octobre** (`SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`,
puis `REECRIRE_EMPREINTES=1 npx vitest run tests/unit/export/empreintesPiscinePergola.test.ts`). **La preuve forte, sept sur sept** :
`5.0.0` → `4.0.0` et `2026-10-29` → `2026-10-28` remis dans les octets frais rendent les anciens fichiers **au bit près**, tailles
identiques à l'octet, pour `resume.txt`, `plan.svg`, `plan.dxf`, `plan.pdf`, `dossier.pdf`, `dossier-piscine.pdf` et
`note-calcul.pdf`. Occurrences du numéro : une par fichier texte, deux dans `plan.pdf`, quatre dans `dossier.pdf` et `note-calcul.pdf`,
neuf dans `dossier-piscine.pdf` ; la date de build, une fois dans chacun des quatre PDF.

| Fixture | Empreinte 4.0.0 | Empreinte 5.0.0 |
|---|---|---|
| `resume.txt` (normalisée) | `5189d35d…` | `ac809671…` |
| `plan.svg` (normalisée) | `f8195550…` | `2617981e…` |
| `plan.dxf` (normalisée) | `359afede…` | `938a92b1…` |
| `plan.pdf` (normalisée) | `92470176…` | `7067837b…` |
| `dossier.pdf` (normalisée) | `d112446e…` | `9ef721fc…` |
| `dossier-piscine.pdf` (brute) | `97b491ea…` | `37085b8b…` |
| `note-calcul.pdf` (brute) | `51d69163…` | `009ac14e…` |
| `glb-structure.json` (brute) | `3fe6a020…` (calculé) | `6b876e99…` (mesuré) |


## Version 5.1.0 (30 octobre 2026) — version mineure, seuls le numéro et la date bougent

Ce qui est entré depuis la 5.0.0 (façades F0 à F8, lecture du PLU, jardin, trace des requêtes Claude, pause du rendu 3D sous la
liste de l'audit) ne change aucune quantité ni aucun export de la démonstration : `projet.json`, `moteur-piscine-pergola.json`,
`quantites-demo.txt` et `glb-structure.json` ne bougent pas. Les sept témoins régénérés passent à `5.1.0`, build du 30 octobre
(`SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`, puis `REECRIRE_EMPREINTES=1 npx vitest run
tests/unit/export/empreintesPiscinePergola.test.ts`). **La preuve forte, sept sur sept** : `5.1.0` → `5.0.0` et `2026-10-30` →
`2026-10-29` remis dans les octets frais rendent les fichiers de la 5.0.0 **au bit près**, tailles identiques à l'octet, pour
`resume.txt`, `plan.svg`, `plan.dxf`, `plan.pdf`, `dossier.pdf`, `dossier-piscine.pdf` et `note-calcul.pdf`. Occurrences du numéro :
une par fichier texte, deux dans `plan.pdf`, quatre dans `dossier.pdf` et `note-calcul.pdf`, neuf dans `dossier-piscine.pdf` ; la date
de build, une fois dans chacun des quatre PDF. Le numéro garde sa longueur : `octetsTotal` du `.glb` ne bouge pas.

| Fixture | Empreinte 5.0.0 | Empreinte 5.1.0 |
|---|---|---|
| `resume.txt` (normalisée) | `ac809671…` | `d7cc3983…` |
| `plan.svg` (normalisée) | `2617981e…` | `5ae8897b…` |
| `plan.dxf` (normalisée) | `938a92b1…` | `115a53c6…` |
| `plan.pdf` (normalisée) | `7067837b…` | `b242d65e…` |
| `dossier.pdf` (normalisée) | `9ef721fc…` | `c6095e19…` |
| `dossier-piscine.pdf` (brute) | `37085b8b…` | `4864772b…` |
| `note-calcul.pdf` (brute) | `009ac14e…` | `0aeef0a2…` |


## Version 5.2.0 (30 octobre 2026) — version mineure, seul le numéro bouge

Ce qui est entré depuis la 5.1.0 (façade enrichie, lot L1 ; garde-fou de la lecture des façades ; banc des modèles) ne change aucune
quantité ni aucun export de la démonstration : `projet.json`, `moteur-piscine-pergola.json`, `quantites-demo.txt` et
`glb-structure.json` ne bougent pas. Les sept témoins régénérés passent à `5.2.0` ; la date de build reste celle de la 5.1.0
(`2026-10-30`, même jour) et ne bouge donc pas (`SORTIE=… npx vitest run tests/unit/export/regeneration.test.ts`, puis
`REECRIRE_EMPREINTES=1 npx vitest run tests/unit/export/empreintesPiscinePergola.test.ts`). **La preuve forte, sept sur sept** :
`5.2.0` → `5.1.0` remis dans les octets frais rend les fichiers de la 5.1.0 **au bit près**, tailles identiques à l'octet, pour
`resume.txt`, `plan.svg`, `plan.dxf`, `plan.pdf`, `dossier.pdf`, `dossier-piscine.pdf` et `note-calcul.pdf`. Occurrences du numéro :
une par fichier texte, deux dans `plan.pdf`, quatre dans `dossier.pdf` et `note-calcul.pdf`, neuf dans `dossier-piscine.pdf`, autant
que de `5.1.0` dans les témoins d'avant. Le numéro garde sa longueur : `octetsTotal` du `.glb` ne bouge pas.

| Fixture | Empreinte 5.1.0 | Empreinte 5.2.0 |
|---|---|---|
| `resume.txt` (normalisée) | `d7cc3983…` | `a141dd01…` |
| `plan.svg` (normalisée) | `5ae8897b…` | `ff55b142…` |
| `plan.dxf` (normalisée) | `115a53c6…` | `6fd21150…` |
| `plan.pdf` (normalisée) | `b242d65e…` | `d430b090…` |
| `dossier.pdf` (normalisée) | `c6095e19…` | `a9f33b7e…` |
| `dossier-piscine.pdf` (brute) | `4864772b…` | `d8358fdf…` |
| `note-calcul.pdf` (brute) | `0aeef0a2…` | `ad8a39d5…` |
