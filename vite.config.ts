import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Les empreintes des scripts en ligne, pour la politique de contenu (deploy/htaccess.template).
 *
 * Le build produit un fichier unique : tout le programme est un `<script>` en ligne. La seule
 * facon de garder une politique qui serve a quelque chose est de nommer ces scripts par leur
 * empreinte — `'unsafe-inline'` autoriserait aussi celui qu'un attaquant injecte. L'empreinte
 * porte sur le contenu EXACT, sans rien enlever : un espace en plus et le navigateur refuse.
 */
function empreintesDesScriptsEnLigne(html: string): string[] {
  const empreintes: string[] = [];
  const motif = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  for (let m = motif.exec(html); m; m = motif.exec(html)) {
    const code = m[1] ?? '';
    if (!code) continue;
    empreintes.push("'sha256-" + createHash('sha256').update(code, 'utf8').digest('base64') + "'");
  }
  return empreintes;
}

// Les deux seuls faits publics que le paquet porte sur la plateforme (spec-connexion-plateforme §2).
// Vides par defaut : Plan se comporte alors exactement comme en 1.2.0, ce qui rend les etapes 0 a 3
// livrables avant que la plateforme ne porte le produit.
const BACKPROD_API_URL = (process.env.BACKPROD_API_URL || '').replace(/\/+$/, '');
const BACKPROD_PRODUCT_CODE = process.env.BACKPROD_PRODUCT_CODE || 'plan';

// Le deploiement de cette application, c'est « copier un fichier sur le serveur » : la sortie doit
// rester un seul HTML, sinon tout le mode d'emploi change (spec 3.1).
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
      // api.php reste a la racine du depot, la ou il est deploye ; on le copie dans dist pour que
      // le dossier soit livrable tel quel, sans en garder deux exemplaires dans le depot.
      name: 'copier-api-php',
      closeBundle() {
        const src = resolve(__dirname, 'api.php');
        if (existsSync(src)) copyFileSync(src, resolve(__dirname, 'dist/api.php'));
      }
    },
    {
      // La configuration Apache se deduit du build : les empreintes des scripts en ligne changent a
      // chaque compilation, donc le `.htaccess` ne peut pas etre un fichier fige. Il se depose a
      // cote de plan.html et d'api.php, et c'est lui qui coupe le cache de six mois, refuse
      // `data/` au public et pose les en-tetes de securite.
      name: 'ecrire-htaccess',
      closeBundle() {
        const modele = resolve(__dirname, 'deploy/htaccess.template');
        const page = resolve(__dirname, 'dist/index.html');
        if (!existsSync(modele) || !existsSync(page)) return;
        const empreintes = empreintesDesScriptsEnLigne(readFileSync(page, 'utf8'));
        if (!empreintes.length) throw new Error('.htaccess : aucun script en ligne trouve dans le build');
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
        writeFileSync(resolve(__dirname, 'dist/.htaccess'),
          texte.replace(jeton, empreintes.join(' ')).replace(jetonOrigine, BACKPROD_API_URL ? ' ' + BACKPROD_API_URL : ''));
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
