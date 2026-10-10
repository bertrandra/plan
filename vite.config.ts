import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blocDescription } from './src/model/produit.js';
import { sortirLesScripts, empreintesDesScriptsEnLigne } from './deploy/scripts-page.mjs';

// Les deux seuls faits publics que le paquet porte sur la plateforme (spec-connexion-plateforme §2).
const BACKPROD_API_URL = (process.env.BACKPROD_API_URL || '').replace(/\/+$/, '');

/** L'origine de la plateforme et sa jumelle www/apex, pour `frame-ancestors` ; `'none'` sans plateforme. */
function originesCadre(url: string): string {
  if (!url) return "'none'";
  const u = new URL(url);
  const jumelle = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
  return u.origin + ' ' + u.protocol + '//' + jumelle + (u.port ? ':' + u.port : '');
}
const BACKPROD_PRODUCT_CODE = process.env.BACKPROD_PRODUCT_CODE || 'plan';

// Depuis l'etape 4, Plan ne sait plus se passer de la plateforme : ses projets y vivent. Un build
// sans origine produirait un fichier qui demande un mot de passe a une adresse vide, ce qui est
// pire qu'un build qui refuse. Le drapeau du §16.1 est retire du code, et non seulement de la
// configuration — c'est ce que la specification exigeait, et c'est ici que cela se voit.
if (!BACKPROD_API_URL) {
  throw new Error(
    "BACKPROD_API_URL est vide. Plan est un produit de la plateforme depuis la 2.0.0 :\n" +
    "  BACKPROD_API_URL=https://<hote de la plateforme> npm run build"
  );
}

// Le deploiement de cette application, c'est « copier un dossier sur le serveur » : la page, son
// programme dans `assets/`, le `.htaccess` (spec 3.1). Le reste (feuille de style, images) reste
// dans la page.
export default defineConfig({
  define: {
    __BACKPROD_API_URL__: JSON.stringify(BACKPROD_API_URL),
    __BACKPROD_PRODUCT_CODE__: JSON.stringify(BACKPROD_PRODUCT_CODE)
  },
  plugins: [
    // Etape 0 de la reconstruction de l'interface (MD/spec-ihm-zones.md, section 6) : React est
    // branche, rien ne l'utilise encore ; il n'entre pas dans le build tant qu'aucun composant n'existe.
    react(),
    viteSingleFile(),
    {
      // Ce que Plan dit de lui-meme a la plateforme (model/produit.ts) : ecrit dans la page, au
      // build, pour qu'un client HTTP le lise sans executer quoi que ce soit.
      name: 'decrire-le-produit',
      transformIndexHtml(html: string) {
        if (!html.includes('</head>')) throw new Error('index.html : pas de </head> ou poser la description du produit');
        return html.replace('</head>', blocDescription(BACKPROD_PRODUCT_CODE) + '\n</head>');
      }
    },
    {
      // Le programme sort de la page (sortirLesScripts), puis la configuration Apache s'ecrit : elle
      // se depose a cote d'index.html a la racine web, et c'est elle qui coupe le cache de la page,
      // refuse `data/` au public et pose les en-tetes de securite.
      name: 'ecrire-htaccess',
      closeBundle() {
        const modele = resolve(__dirname, 'deploy/htaccess.template');
        const page = resolve(__dirname, 'dist/index.html');
        if (!existsSync(modele) || !existsSync(page)) return;
        const sorti = sortirLesScripts(readFileSync(page, 'utf8'));
        if (!sorti.fichiers.length) throw new Error('index.html : aucun programme trouve dans le build');
        mkdirSync(resolve(__dirname, 'dist/assets'), { recursive: true });
        for (const f of sorti.fichiers) writeFileSync(resolve(__dirname, 'dist', f.nom), f.code);
        writeFileSync(page, sorti.html);
        const empreintes = empreintesDesScriptsEnLigne(sorti.html);
        const texte = readFileSync(modele, 'utf8');
        // Le jeton doit etre unique : `String.replace` avec une chaine ne remplace que la premiere
        // occurrence, et une seconde dans un commentaire laisserait la politique avec son jeton.
        const jeton = '@@HACHES_SCRIPT@@';
        const combien = texte.split(jeton).length - 1;
        if (combien !== 1) throw new Error('.htaccess : ' + combien + ' occurrence(s) du jeton dans le modele, il en faut une');
        // L'origine de la plateforme rejoint connect-src, ou rien quand aucune n'est branchee : une
        // source vide dans la politique serait invalide, pas permissive.
        const jetonOrigine = '@@ORIGINE_PLATEFORME@@';
        if (texte.split(jetonOrigine).length - 1 !== 1) throw new Error('.htaccess : le modele doit porter une seule fois ' + jetonOrigine);
        // Ceux qui peuvent encadrer la vitrine : la plateforme, sous ses deux adresses (www et
        // l'apex repondent tous deux, sans redirection de l'une vers l'autre).
        const jetonCadre = '@@ORIGINES_CADRE@@';
        if (texte.split(jetonCadre).length - 1 !== 1) throw new Error('.htaccess : le modele doit porter une seule fois ' + jetonCadre);
        writeFileSync(resolve(__dirname, 'dist/.htaccess'),
          texte.replace(' ' + jeton, empreintes.map((e) => ' ' + e).join('')).replace(jetonOrigine, BACKPROD_API_URL ? ' ' + BACKPROD_API_URL : '')
            .replace(jetonCadre, originesCadre(BACKPROD_API_URL)));
      }
    }
  ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
    cssCodeSplit: false
  }
});
