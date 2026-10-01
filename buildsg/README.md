# buildsg — Plan sur SiteGround en Node.js

Second déploiement de Plan, à côté de `livraison/` (Apache + `.htaccess`). Ici, pas d'Apache :
`app.js` sert la page et pose lui-même les en-têtes que le `.htaccess` pose ailleurs.

| Fichier | Origine |
|---|---|
| `index.html` | Copie du build (identique, au bit près, à `livraison/index.html`). |
| `entetes.json` | Politique de contenu lue dans le `.htaccess` du même build (empreintes + origine plateforme). |
| `app.js` | Serveur HTTP, sans dépendance. |
| `package.json` | Point d'entrée `app.js`, Node ≥ 20. |

## Régénérer

Après chaque build, `index.html` et `entetes.json` se régénèrent ensemble — les empreintes changent
à chaque build, une politique d'un autre build empêche la page de s'exécuter :

```bash
npm run buildsg            # depuis livraison/
npm run buildsg -- dist    # depuis un build frais (dist/index.html + dist/.htaccess)
```

Le script refuse un `index.html` et un `.htaccess` qui ne viennent pas du même build.

## Mettre en ligne sur SiteGround

1. Site Tools → **Devs → Node.js** → créer une application : version de Node ≥ 20,
   dossier de l'application = celui où l'on dépose `buildsg/`, fichier de démarrage `app.js`.
2. Déposer les quatre fichiers du dossier (SFTP ou gestionnaire de fichiers).
3. Lancer / redémarrer l'application. Le port arrive par `PORT` ; le HTTPS est terminé devant.
4. Vérifier : `npm run verifier-deploiement https://<hôte>`.

## Ce que fait `app.js`

- `/` et `/index.html` : la page, `Cache-Control: no-cache, must-revalidate`, `ETag` (304), gzip.
- `/plan.html` : 301 vers `/` en gardant la chaîne de requête.
- Tout le reste (`data/`, `api.php`, fichiers en point…) : 404.
- En-têtes : `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`,
  HSTS quand la requête est arrivée en HTTPS (`X-Forwarded-Proto`), et la politique de contenu.
- `?mode=demo` : sans `X-Frame-Options`, `frame-ancestors` ouvert à la plateforme seule.

La page et les en-têtes sont lus au démarrage : une mise en ligne demande un redémarrage.
