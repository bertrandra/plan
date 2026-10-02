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
| `GET /admin/vitrine/<id>` | **sans session** : la démo en lecture seule, pour la vitrine publique (`?mode=demo&file=<id>`). Aucun cookie posé, une minute de cache. |

## Côté page

- `app/porteAdmin.ts`, `zones/PorteAdmin.tsx` : la porte au mot de passe, à la place de celle de
  la plateforme (pas de plateforme en mode admin).
- `io/depotDemos.ts` : le dépôt des démos, même contrat que celui de la plateforme
  (`DepotProjets`). `io/api.ts` change seulement le paramètre d'adresse (`demofile`) et la clé du
  dernier ouvert (`planInteractif.admin.lastDemoId`), pour ne jamais mélanger démos et projets.

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
