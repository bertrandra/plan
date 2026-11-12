// Le build du banc d'apprentissage : sa propre page, son propre programme (aucun module de Plan, banc/src/plan/ est une copie figee).
//   npm run build:banc        -> dist-banc/ (index.html, assets/banc-*.js, api.php, .htaccess, banc-config.exemple.php)
//   npm run dev:banc          -> http://localhost:5198/, l'API par un serveur PHP sur 5197 (BANC_CONFIG pour le mot de passe)
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// En ligne, la page s'ouvre a l'adresse ?banc de la racine (public_html/) : <base href="banc/"> fait trouver son programme et son API
// dans public_html/banc/. Au developpement, la page est servie a la racine : pas de base.
const baseEnLigne = (): Plugin => ({
  name: 'banc-base',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', '<head>\n  <base href="banc/" />'),
});

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  plugins: [react(), baseEnLigne()],
  build: {
    outDir: resolve(__dirname, '../dist-banc'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: { output: { entryFileNames: 'assets/banc-[hash].js', chunkFileNames: 'assets/banc-[hash].js', assetFileNames: 'assets/banc-[hash][extname]' } },
  },
  server: { port: 5198, strictPort: true, proxy: { '/api.php': 'http://127.0.0.1:5197' } },
});
