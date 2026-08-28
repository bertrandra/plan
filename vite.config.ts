import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Le deploiement de cette application, c'est « copier un fichier sur le serveur » : la sortie doit
// rester un seul HTML, sinon tout le mode d'emploi change (spec 3.1).
export default defineConfig({
  plugins: [
    viteSingleFile(),
    {
      // api.php reste a la racine du depot, la ou il est deploye ; on le copie dans dist pour que
      // le dossier soit livrable tel quel, sans en garder deux exemplaires dans le depot.
      name: 'copier-api-php',
      closeBundle() {
        const src = resolve(__dirname, 'api.php');
        if (existsSync(src)) copyFileSync(src, resolve(__dirname, 'dist/api.php'));
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
