# buildsg — Plan, application Node.js sur SiteGround

Second déploiement de Plan, à côté de `livraison/` (Apache + `.htaccess`). Ici, **aucun HTML
pré-construit** : `buildsg/` est un projet Node complet, construit sur l'hôte puis servi par
`app.js`.

| Fichier | Rôle |
|---|---|
| `app.js` | Point d'entrée, écrit à la main : construit `dist/` si besoin, puis sert la page. |
| `package.json`, `package-lock.json` | Les six paquets du build (Vite, React, zustand…), tous en `dependencies`. |
| `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `deploy/` | Les sources de Plan, recopiées du dépôt. |
| `SOURCE` | Version et commit des sources recopiées. |

`index.html` est ici l'entrée de Vite (3 Ko), pas la page construite.

## Mettre à jour les sources

```bash
npm run buildsg      # depuis la racine du dépôt
```

Recopie `src/` & co et régénère `package.json`, le verrou et `SOURCE`. `app.js` et ce README ne
sont jamais touchés.

## Mettre en ligne sur SiteGround

1. Site Tools → **Devs → Node.js** → créer une application : Node ≥ 20, dossier de l'application =
   celui où l'on dépose le contenu de `buildsg/`, fichier de démarrage `app.js`.
2. Variable d'environnement facultative `BACKPROD_API_URL` (défaut : `https://www.raillard.org`).
3. Déposer le dossier (sans `node_modules/` ni `dist/`), lancer **npm install**.
4. Démarrer / redémarrer l'application. Au premier démarrage, `app.js` lance `vite build`
   (quelques secondes) ; aux suivants, il reprend `dist/` tant que `SOURCE` et
   `BACKPROD_API_URL` n'ont pas changé. `npm run build` force un build sans démarrer.
5. Vérifier : `npm run verifier-deploiement https://<hôte>` (le contrôle « fichier servi = celui du
   dépôt » compare à `livraison/index.html` : il ne passe que si les deux viennent des mêmes sources).

## Ce que fait `app.js`

La politique de contenu est lue dans le `dist/.htaccess` produit par le build, donc avec les
empreintes des scripts de ce build-là. Puis, sur le port `PORT` :

- `/` et `/index.html` : la page, `Cache-Control: no-cache, must-revalidate`, `ETag` (304), gzip.
- `/plan.html` : 301 vers `/` en gardant la chaîne de requête.
- Tout le reste (`src/`, `data/`, `api.php`, fichiers en point…) : 404.
- En-têtes : `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`,
  HSTS quand la requête est arrivée en HTTPS (`X-Forwarded-Proto`), la politique de contenu.
- `?mode=demo` : sans `X-Frame-Options`, `frame-ancestors` ouvert à la plateforme seule.

## Variante : site statique SiteGround (Framework preset React)

L'écran « Build configuration » exécute une commande `npm …` à la racine du dépôt puis publie un
dossier. Aucun serveur Node ne tourne : c'est le `.htaccess` du build qui pose les en-têtes.

| Champ | Valeur |
|---|---|
| Branch | `main` |
| Node version | `22` |
| Package manager | `npm` |
| Build command | `run build:siteground` |
| Output directory | `buildsg/dist` |

`npm run build:siteground` installe les paquets de `buildsg/` puis lance son build ; `buildsg/dist`
contient `index.html` et `.htaccess`.
