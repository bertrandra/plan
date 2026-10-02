# Admin des démos — fichiers de démonstration hors du HTML

Décidé le 2 octobre 2026. Déploiement concerné : `buildsg/app.js` (SiteGround, Node).

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

- `ADMIN_PASSWORD` (variable d'environnement de l'application dans Site Tools). Absente : toutes
  les routes `/admin/…` répondent 404, l'admin n'existe pas.
- Session : cookie aléatoire `HttpOnly`, `SameSite=Strict`, `Path=/admin/`, `Secure` derrière HTTPS,
  8 heures, en mémoire (un redémarrage demande de se reconnecter).
- Toute écriture exige l'en-tête `X-Plan-Admin: 1`, qu'un autre site ne peut pas poser.
- Cinq mots de passe faux en dix minutes depuis une adresse la bloquent dix minutes.
- Identifiants limités à `[A-Za-z0-9_-]{1,64}` ; 25 Mo au plus par fichier ; écriture atomique.

## Où vivent les fichiers

`DEMOS_DIR`, par défaut `demos/` dans le dossier de l'application. **Le placer hors de ce dossier**
(par exemple `/home/<compte>/plan-demos`) : une mise en ligne qui remplace le dossier de
l'application emporterait sinon les démos enregistrées depuis. Ce dossier n'est jamais servi
directement : seules les routes `/admin/demos…`, derrière la session, le lisent.

## Routes (buildsg/demosAdmin.mjs)

| Méthode et chemin | Effet |
|---|---|
| `GET /admin/session` | 200 si la session est ouverte, 401 sinon |
| `POST /admin/session` `{motDePasse}` | ouvre la session (cookie) |
| `DELETE /admin/session` | ferme la session |
| `GET /admin/demos` | `{ demos: [{ id, name, updatedAt }] }` |
| `POST /admin/demos` | crée la démo au premier numéro libre |
| `GET`, `PUT`, `DELETE /admin/demos/<id>` | lit, réécrit, met de côté |

## Côté page

- `app/porteAdmin.ts`, `zones/PorteAdmin.tsx` : la porte au mot de passe, à la place de celle de
  la plateforme (pas de plateforme en mode admin).
- `io/depotDemos.ts` : le dépôt des démos, même contrat que celui de la plateforme
  (`DepotProjets`). `io/api.ts` change seulement le paramètre d'adresse (`demofile`) et la clé du
  dernier ouvert (`planInteractif.admin.lastDemoId`), pour ne jamais mélanger démos et projets.

## Hors périmètre, pour la suite

La démonstration publique (« Ouvrir le plan de démonstration », vitrine `?mode=demo`) reste celle
compilée dans le HTML (`model/demo.ts`). La faire venir d'un fichier de démo publié par l'admin est
l'étape suivante possible.
