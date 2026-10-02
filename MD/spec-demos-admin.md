# Admin des démos — fichiers de démonstration hors du HTML

Décidé le 2 octobre 2026. Deux déploiements, même contrat, la page ne sait pas lequel lui répond :

- **Apache + PHP, sans Node** : `npm run livraison` produit `livraison/` et `livraison.zip`
  (`index.html`, `.htaccess`, `admin.php`, `admin-config.exemple.php`, `LISEZMOI-DEPLOIEMENT.txt`).
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

## Côté page

- `app/porteAdmin.ts`, `zones/PorteAdmin.tsx` : la porte au mot de passe, à la place de celle de
  la plateforme (pas de plateforme en mode admin).
- `io/depotDemos.ts` : le dépôt des démos, même contrat que celui de la plateforme
  (`DepotProjets`). `io/api.ts` change seulement le paramètre d'adresse (`demofile`) et la clé du
  dernier ouvert (`planInteractif.admin.lastDemoId`), pour ne jamais mélanger démos et projets.

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
- **Enregistrement** : `admin/controleurs`, un document `{format: 'plan-controleurs', version,
  appVersion, decouvertLe, arbre}` rangé à part des démos.
- **Comparaison** : la découverte est comparée au registre : **Nouveau**, **Retiré** (gardé à sa place, barré), **Modifié** (nom ou détails).
  « Seulement les changements » ne montre qu'eux ; « Enregistrer la découverte » en fait la
  nouvelle référence.
- **Navigation** : motif ARIA *tree* — flèches haut/bas, droite ouvre ou descend, gauche ferme ou
  remonte, Début/Fin, Entrée. Filtre par clé ou nom. Le détail du nœud choisi est à droite (sous
  l'arbre sur téléphone et tablette).

## Hors périmètre, pour la suite

La démonstration publique (« Ouvrir le plan de démonstration », vitrine `?mode=demo`) reste celle
compilée dans le HTML (`model/demo.ts`). La faire venir d'un fichier de démo publié par l'admin est
l'étape suivante possible.
