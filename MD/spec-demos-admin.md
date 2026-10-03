# Admin des démos — fichiers de démonstration hors du HTML

Décidé le 2 octobre 2026. Deux déploiements, même contrat, la page ne sait pas lequel lui répond :

- **Apache + PHP, sans Node** : `npm run livraison` produit `livraison/` et `livraison.zip`
  (`index.html`, `.htaccess`, `admin.php`, `admin-config.exemple.php`, `plan-demos/1.json`,
  `LISEZMOI-DEPLOIEMENT.txt`). `plan-demos/1.json` est la démonstration intégrée, première démo de
  l'admin, à copier avec le dossier à côté de la configuration.
  `.htaccess` confie `admin/…` à `admin.php`. Le mot de passe et le dossier des démos sont dans
  `plan-admin-config.php`, posé à côté de `public_html/`, hors de la racine web.
- **Node** : `buildsg/app.js` et `buildsg/demosAdmin.mjs`, avec `ADMIN_PASSWORD` et `DEMOS_DIR`.

## Ce que c'est

L'admin travaille sur un jeu de fichiers de démonstration rangés **sur le serveur**, hors du
fichier livré. Il les ouvre, les modifie dans l'atelier et les réenregistre sans reconstruire Plan.

| Adresse | Effet |
|---|---|
| `/?admin` | Demande le mot de passe admin, puis ouvre la dernière démo ouverte (ou la première). Sans aucune démo : le premier pas propose d'en créer une depuis la démonstration intégrée ou depuis une adresse. |
| `/?demofile=<id>` | Idem, sur le fichier `<id>.json`. |

`?demofile` est réservé à l'admin : sans session, le serveur répond 401 et la page demande le
mot de passe. Les visiteurs ordinaires ne voient rien de nouveau.

Dans l'atelier admin, les commandes de projet agissent sur les fichiers de démo :

- **Enregistrer** (Ctrl+S) réécrit `<id>.json`, en gardant la version précédente en `<id>.json.bak` ;
- **Nouveau projet** crée le premier numéro libre (`1`, `2`, `3`…) ;
- **Projets** liste les démos ; en choisir une ouvre `?demofile=<id>` ;
- **Supprimer** renomme le fichier en `<id>.json.supprime-<date>` : rien ne s'efface pour de bon.
- **Se déconnecter** (barre du haut, ou feuille Projet au doigt) ferme la session chez le serveur,
  puis recharge la page sur la porte au mot de passe (`app/porteAdmin.ts`, `quitterAdmin`).

## Format

Le format de l'export JSON (`io/exportProjet.ts`), le format natif : `{ meta, objects, measures }`,
avec `meta.name` (le nom affiché) et `meta.schemaVersion` (les anciens fichiers sont migrés à la
lecture). Un export se dépose tel quel dans le dossier des démos, et une démo se relit par
« Importer un JSON ».

## Sécurité

Le mot de passe est **vérifié par le serveur**, jamais par la page : le fichier livré se lit en
entier, un mot de passe comparé dans le navigateur ne protégerait rien.

- Apache : `motDePasse` dans `plan-admin-config.php` (en clair ou `password_hash`). Node :
  `ADMIN_PASSWORD`. Absent (ou « A-CHANGER ») : toutes les routes `admin/…` répondent 404,
  l'admin n'existe pas.
- Session : cookie aléatoire `HttpOnly`, `SameSite=Strict`, limité à `admin/` à côté de la page,
  `Secure` derrière HTTPS, 8 heures (session PHP sous Apache ; en mémoire sous Node, où un
  redémarrage demande de se reconnecter).
- Toute écriture exige l'en-tête `X-Plan-Admin: 1`, qu'un autre site ne peut pas poser.
- Cinq mots de passe faux en dix minutes depuis une adresse la bloquent dix minutes.
- Identifiants limités à `[A-Za-z0-9_-]{1,64}` ; 25 Mo au plus par fichier ; écriture atomique.

## Où vivent les fichiers

Apache : `dossierDemos` de la configuration, par défaut `plan-demos/` à côté d'elle, donc hors de la
racine web ; `.htaccess` refuse de toute façon `plan-demos/` et `demos/`. Node : `DEMOS_DIR`, par
défaut `demos/` dans le dossier de l'application. **Le placer hors de ce dossier**
(par exemple `/home/<compte>/plan-demos`) : une mise en ligne qui remplace le dossier de
l'application emporterait sinon les démos enregistrées depuis. Ce dossier n'est jamais servi
directement : seules les routes `/admin/demos…`, derrière la session, le lisent.

## Routes (deploy/admin.php, buildsg/demosAdmin.mjs)

Relatives à la page (`admin/…`, pas `/admin/…`) : Plan peut vivre dans un sous-dossier.

| Méthode et chemin | Effet |
|---|---|
| `GET /admin/session` | 200 si la session est ouverte, 401 sinon |
| `POST /admin/session` `{motDePasse}` | ouvre la session (cookie) |
| `DELETE /admin/session` | ferme la session |
| `GET /admin/demos` | `{ demos: [{ id, name, updatedAt }] }` |
| `POST /admin/demos` | crée la démo au premier numéro libre |
| `GET`, `PUT`, `DELETE /admin/demos/<id>` | lit, réécrit, met de côté |
| `GET`, `PUT /admin/controleurs` | lit, remplace le registre des contrôleurs (`.controleurs.json`, `.bak` gardé) |
| `GET /admin/palette` | **sans session** : la palette de l'interface (`.palette.json`), que chaque page de Plan applique au démarrage ; 404 sans palette (couleurs d'origine) |
| `PUT /admin/palette` | remplace la palette (session ; `{format: 'plan-palette', couleurs: {clair, sombre}}`, chaque couleur `#RRGGBB` ; `.bak` gardé) |
| `GET /admin/vitrine/<id>` | **sans session** : la démo en lecture seule, pour la vitrine publique (`?mode=demo&file=<id>`). Aucun cookie posé, une minute de cache. |

## Côté page

- `app/porteAdmin.ts`, `zones/PorteAdmin.tsx` : la porte au mot de passe, à la place de celle de
  la plateforme (pas de plateforme en mode admin).
- `io/depotDemos.ts` : le dépôt des démos, même contrat que celui de la plateforme
  (`DepotProjets`). `io/api.ts` change seulement le paramètre d'adresse (`demofile`) et la clé du
  dernier ouvert (`planInteractif.admin.lastDemoId`), pour ne jamais mélanger démos et projets.

## Palette de l'interface (`?palette`)

Un écran de l'admin, derrière la même porte, ouvert depuis le menu « Admin » de la barre de Plan
(`zones/EcranPalette.tsx`, `app/ecranPalette.ts`). Trois onglets : **Palette** (planche d'ambiance,
couleurs, contrastes), **CSS** (variables à copier, couleurs en situation, rayons et ombres),
**Typo** (polices et échelle). Un bouton « Retour au plan » ramène à l'atelier.

- **Les couleurs vivent dans un fichier JSON sur le serveur** (`.palette.json`, à côté des démos).
  Chaque page de Plan le lit au démarrage, sans session (`app/paletteServeur.ts`), et pose une
  feuille par-dessus `app.css`. Sans fichier, sans admin configuré ou sans réseau : les couleurs
  d'origine de `styles/jetons.ts`.
- **Chaque couleur se règle** par thème : sélecteur de couleur et code `#RRGGBB` (un code invalide
  est signalé et n'est pas appliqué). Les aperçus, les contrastes et le CSS suivent aussitôt ; un
  contraste qui tombe sous le minimum se dit dans la barre.
- **Enregistrer sur le serveur** (session), **Exporter le JSON** (`plan-palette.json`), **Annuler
  les modifications**, **Couleurs d'origine**.
- Le document ne remplace que ce qu'il porte de valide (`styles/paletteServeur.ts`) : un jeton
  inconnu ou une valeur mal formée est ignoré, un jeton absent garde sa valeur d'origine.
- Le plan dessiné en SVG (`render/theme.ts`) et les exports gardent leurs propres encres : la
  palette règle l'interface, pas les nombres ni les fichiers produits.

## Contrôleurs de l'écran (`?admin&ecran=controleurs`)

Un écran à part, sur toute la page, qui **découvre** et **enregistre** l'arbre des contrôleurs de
Plan : ce par quoi l'écran agit sur le plan. Il n'agit pas sur le plan : il montre, compare,
enregistre.

- **À l'ouverture**, l'écran montre le registre enregistré, rien de plus : Plan ne démarre pas.
- **Découverte, sur demande seulement** (bouton « Lancer la découverte ») : Plan démarre alors,
  caché, sur la démonstration intégrée, en mémoire et sans dépôt (rien ne peut s'y enregistrer) ;
  les relances suivantes relisent ce qu'il a déjà monté. `app/controleurs.ts` lit ce qu'il a monté : le registre des
  commandes, la carte d'exposition (`app/exposition.ts`) et les sections de l'inspecteur, une par
  sorte d'objet du plan. Aucune commande n'est exécutée, aucun champ lu ni écrit.
- **L'arbre** : Zones de l'écran (Z1 à Z8 et clavier) → emplacements → commandes ; Registre des
  commandes → groupes → commandes ; Champs de l'inspecteur → sortes d'objet → sections → champs.
  Chaque nœud a sa **clé** (l'identifiant de la commande, la clé du champ…) et son **nom
  explicite**, plus quelques détails (raccourci, classes d'écran, type, unité, permission…). Son
  chemin de clés (`plan/zones/Z1/menuFichier/projet.enregistrer`) l'identifie.
- **Attributs déclarés** (lus dans les déclarations, rien n'est appelé sauf la liste des valeurs
  d'un choix, qui dépend de l'objet) :
  - *commande* : groupe, raccourci, description, capacité, permission, **quota** (nom, ou « selon
    le contexte »), **sans les droits** (effacée sans la capacité ; grisée avec explication sans la
    permission ou au quota), **conditionnelle** (`actif` déclaré), **emplacements** par classe
    d'écran, et **atteinte** quand une classe ne l'offre qu'au clavier ;
  - *champ* : type, unité, minimum, maximum, **pas**, **décimales**, **modifie** (le projet, ou
    l'affichage seulement), **annulable**, **effets** (redessine le plan, recalcule la terrasse,
    reconstruit la 3D…), **conditionnel** / **activable**, explication d'un bouton, aide ;
  - *liste de choix* : ses **valeurs permises**, en nœuds enfants (clé = valeur, nom = libellé) ;
    *ligne composée* : ses sous-champs en nœuds enfants ;
  - *section* : repliée à l'ouverture, explication ; *sorte d'objet* : nommée par sa forme et sa
    fonction (« Cercle — Arbre »).
- **Contrôles d'interface** (4ᵉ branche, `app/controlesInterface.ts`) : ce qui n'est ni une commande
  ni un champ, mais reste un contrôleur de l'écran — onglets et panneaux à replier (*navigation*),
  ce que le plan montre (*affichage*), réglages des vues 3D (*vue*), options d'une commande ou d'un
  export (*option*), version et impression (*sortie*), saisies du tiroir comme les prix et cadences
  (*donnée*), et ce qui modifie un objet ou une cote hors du registre (*objet* : candidats à
  devenir des commandes quand le registre acceptera un paramètre). Chacun est **déclaré** (clé, nom
  explicite, zone, nature, répété ou non) et porté par `data-controle="<clé>"` dans le code ;
  `tests/unit/app/controlesInterface.test.ts` vérifie que les deux concordent dans les deux sens.
  Pourquoi pas des commandes : une commande est un geste sur le plan, sans paramètre, que le
  registre peut refuser selon les droits ; un onglet ou « supprimer *cette* cote » n'en sont pas.
- **Écrans ouverts à la demande** : les dialogues, le premier pas, l'import cadastral,
  l'actualisation IGN, le choix de texture et le relevé de façade sont déclarés dans le même
  catalogue, avec la nature *parcours* (« étape d'un écran ouvert par une commande : c'est la
  commande qui porte les droits ») et `ouvertPar`, la commande qui ouvre l'écran (« Ouvert par »
  dans l'arbre). La découverte les montre même fermés, puisqu'ils sont déclarés. Les cadres
  communs (poignée et fermeture des feuilles, fermeture d'une erreur) aussi.
- **Échantillons de découverte** : pour chaque fonction d'objet que la démonstration ne porte pas
  (aujourd'hui *mobilier* et *limite*), la découverte ajoute **en mémoire** une copie d'un objet de
  la bonne forme portant cette fonction (`echantillonsDecouverte`, clé `decouverte-<fonction>`) ;
  leurs champs sont donc découverts, et la sorte d'objet est marquée « Échantillon » dans l'arbre.
  La démonstration elle-même n'est pas modifiée : elle fait foi pour les empreintes golden et c'est
  elle que voit le public.
- **Commandes ciblées** (`app/ecouteurs/cibles.ts`) : le registre accepte une **cible**
  (`Cible` : `objet`, `cote`, `valeur`). Une commande qui déclare `parametre: 'objet' | 'cote'` est
  refusée sans sa cible ; le bouton la passe : `commandes.executer('mesure.supprimer', source,
  { cote: m.id })`. Les anciens contrôles de nature *objet* sont devenus des commandes, avec la
  permission d'écrire (grisés et expliqués sans elle) et l'annulation : `objet.visibilite`,
  `objet.etiquette`, `objet.masquerTous`, `objet.etiquettesTous`, `mesure.choisirReference`,
  `mesure.origine`, `mesure.selectionnerCoins`, `mesure.ajouter`, `mesure.inverserOrigine`,
  `mesure.valeurAffichee`, `mesure.afficher`, `mesure.supprimer`. L'explorateur empile désormais un
  instantané avant de masquer un objet ou de changer ses étiquettes. Dans l'arbre, une commande
  ciblée dit sur quoi elle porte (« Porte sur »).
- **Hors registre** (6ᵉ branche) : ce que le registre ne couvre pas, mesuré pour être suivi d'une
  découverte à l'autre.
  - *Contrôles affichés sans commande ni champ* (`app/inventaireEcran.ts`) : les boutons, cases,
    curseurs, listes et saisies montés dans la page qui ne sont rattachés à rien, rangés par zone,
    avec le nombre de contrôles rattachés pour comparaison. Un contrôle est rattaché quand lui ou un
    parent porte `data-commande` (il déclenche une commande), `data-controle` (contrôle d'interface
    déclaré), `data-cle` ou `data-section` (champ ou
    section de l'inspecteur). Les lignes répétées (`data-instance` : un objet de l'explorateur, une
    cote) comptent une fois ; `data-nom` donne un nom stable à un bouton dont le texte suit l'état ;
    `data-compte` marque un compteur à ne pas prendre pour un nom. **Trois dispositions**
    (`app/decouverteClasses.ts`) : Plan ne rend pas les mêmes contrôles au bureau, sur tablette et
    sur téléphone (barre compacte, barre de sélection, navigation du bas, familles de sections de
    l'inspecteur). La découverte pose donc tour à tour chaque classe d'écran dans le magasin, avec un
    objet sélectionné (une terrasse de préférence) et, au téléphone, chaque feuille ouverte ; puis
    remet tout comme avant. Les relevés sont fusionnés : un contrôle compte une fois, avec les
    classes où il s'affiche quand il n'est pas partout. **Portée** : ce qui est monté au
    moment de la découverte ; un dialogue, un parcours, le relevé de façade fermés ne se voient pas
    (ils sont déclarés, nature *parcours*). Les contrôles propres à l'admin (choix de la démo,
    déconnexion) n'existent pas dans la découverte, qui tourne sans dépôt : ils sont déclarés aussi.
  - *Contrôles affichés hors de leur zone déclarée* (`ecartsDeZone`) : une commande affichée dans
    une zone qu'aucune classe d'écran ne lui donne (`app/exposition.ts`, conteneurs
    `CONTENEURS_EMPLACEMENTS`), un contrôle d'interface ailleurs que dans la zone du catalogue. Un
    contrôle porté par chaque feuille du téléphone le déclare (`dansChaqueZone`) ; un élément hors
    de toute zone (les champs fichier cachés d'`index.html`) n'est pas compté ;
  - *Fonctions d'objet absentes de la démonstration* : celles que la liste « fonction » propose et
    qu'aucun objet de la démo ne porte ; leurs champs propres ne sont pas découverts.
- **Écritures à surveiller** (7ᵉ branche, `app/ecritures.ts`) : classement seul, rien n'est changé
  dans Plan. Ce qui modifie le projet hors des deux garde-fous du registre :
  - *sans annulation* : Ctrl+Z ne le défait pas. Un champ de l'inspecteur qui écrit le projet
    s'annule (`champAnnulable`), sauf `historique: false` : l'inspecteur prend l'instantané avant
    d'écrire et ne l'empile que si l'écriture n'est pas refusée (`historique.preparer`) ; un champ
    n'empile jamais le sien dans `ecrire` (un test le garde), ce qui ferait deux étapes ; les écritures rapprochées
    d'un même champ du même objet (1,5 s : une frappe, un curseur qu'on glisse) n'en empilent
    qu'un, un Ctrl+Z défait le geste entier. Une saisie du tiroir passe par `resultats.saisir`, qui
    l'empile ; une commande qui porte la permission d'écrire empile elle-même ;
  - *sans contrôle des droits* : rien ne le refuse en lecture seule (vitrine comprise). Le registre
    grise une commande qui porte la permission d'écrire ; l'inspecteur grise et refuse un champ qui
    écrit le projet (`champActif`, `appliquer`) ; `resultats.saisir` refuse une saisie du tiroir,
    grisée elle aussi. Les réglages d'affichage (`sale: false`) restent libres. Un **bouton** de
    l'inspecteur déclare obligatoirement sur quoi il agit (`agit`) : `{ commande }` (grisé quand le
    registre ne la permet pas), `projet` (il porte sa propre annulation ; grisé et refusé en lecture
    seule) ou `interface`. L'arbre le montre (« Agit sur »).

  Les sources : les champs (lus dans leurs déclarations), les contrôles du catalogue qui déclarent
  `ecrit: { annulable, droits }` (`droits: 'commande'` quand la commande qui ouvre leur écran porte
  la permission), et les commandes sans permission qui déclarent `ecrit: 'projet'`
  (`ecrit: 'affichage'` : une préférence d'affichage enregistrée avec le projet, grille et voisinage,
  qui n'est pas à surveiller). Premier relevé (2 octobre 2026) : 31 écritures sans annulation,
  81 sans contrôle des droits. Après les deux garde-fous : 1 sans annulation — la création du
  projet par l'import cadastral, qui ne se défait pas par nature —, 0 sans contrôle des droits.
  L'interrogation du PLU porte désormais la permission d'écrire (elle s'annulait déjà).
- **Enregistrement** : `admin/controleurs`, un document `{format: 'plan-controleurs', version,
  appVersion, decouvertLe, arbre}` rangé à part des démos.
- **Comparaison** : la découverte est comparée au registre : **Nouveau**, **Retiré** (gardé à sa place, barré), **Modifié** (nom ou détails).
  « Seulement les changements » ne montre qu'eux ; « Enregistrer la découverte » en fait la
  nouvelle référence.
- **Navigation** : motif ARIA *tree* — flèches haut/bas, droite ouvre ou descend, gauche ferme ou
  remonte, Début/Fin, Entrée. Le détail du nœud choisi est à droite (sous l'arbre sur téléphone et
  tablette). Outils (`zones/navigationArbre.ts`) :
  - **niveaux** : chaque ligne porte son niveau absolu (N1 = `plan`) ; « Niveau 1…6 / Tout » déplie
    jusqu'au niveau choisi (touches **1** à **9** dans l'arbre) ;
  - **filtres** : texte (clé ou nom, touche **/** pour y aller), **genre** (zone, emplacement,
    groupe, commande, objet, section, champ, valeur), seulement les changements ; compteur de
    résultats, **‹ ›** ou **Entrée / Maj+Entrée** pour sauter de l'un à l'autre, « Effacer » ;
  - **branche** : dans le détail, « Déplier » / « Replier » toute la branche (touches **\*** et
    **-**), « Montrer seule » pour n'afficher qu'elle (« Tout montrer » pour revenir) ;
  - **fil d'Ariane** cliquable et liste des **enfants** cliquables dans le détail.

## La vitrine montre une démo de l'admin

`?mode=demo&file=<id>` (2 octobre 2026) : la vitrine publique lit la démo `<id>` par
`admin/vitrine/<id>`, la seule route sans session, en lecture seule (`app/vitrine.ts`,
`chargerDemoVitrine`). Les autres paramètres de la vitrine (`x`, `y`, `zoom`, `orthophoto`,
`heureauto`, `pdv`…) s'y appliquent de même. Une démo absente, illisible, sans objet ou d'un schéma
plus récent que le programme laisse la démonstration intégrée : la vitrine encadrée sur une page
d'accueil n'est jamais vide.

**Conséquence à connaître** : toute démo du dossier se lit publiquement par son numéro. Une démo
est faite pour être montrée ; n'y ranger rien qui ne doive pas l'être. L'écriture, la liste et la
suppression restent derrière le mot de passe.

« Ouvrir le plan de démonstration » (le premier pas de l'atelier) reste la démonstration intégrée.
