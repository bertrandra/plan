// Le programme de la page, sorti en fichier, et les empreintes de ce qui resterait en ligne : ce que
// vite.config.ts fait de dist/index.html apres le build. En JavaScript pur, pour que la configuration
// de Vite l'importe sur l'hote Node (buildsg/) comme ici, et que les tests le lisent (scripts-page.d.mts).

import { createHash } from 'node:crypto';

/**
 * Sort le programme de la page : chaque `<script>` en ligne (hors bloc de donnees) devient un
 * fichier `assets/plan-<empreinte>.js` que la page appelle par `src`.
 *
 * Le build produisait un fichier unique, et la politique de contenu devait nommer le script par son
 * empreinte : une empreinte qui change a chaque compilation, donc un `.htaccess` qui devait changer
 * avec la page. Le 10 octobre 2026, une mise en ligne a remplace `index.html` mais pas le `.htaccess`
 * (fichier cache, saute au televersement) : le navigateur a refuse le programme et la page est restee
 * blanche. Un script servi par le site lui-meme est couvert par `script-src 'self'` : la politique
 * ne depend plus du build, et un `.htaccess` d'une version precedente ne casse plus rien.
 *
 * Le nom porte l'empreinte du contenu : il change quand le programme change, et le fichier peut
 * donc se garder en cache sans limite (deploy/htaccess.template, §3). Le chemin est relatif : la
 * page marche aussi dans un sous-dossier.
 */
export function sortirLesScripts(html) {
  const fichiers = [];
  // Un bloc de donnees (`type="application/json"`, model/produit.ts) n'est pas un script : il reste
  // dans la page, ou la plateforme le lit sans rien executer.
  const motif = /<script((?![^>]*\ssrc=)(?![^>]*type="application\/json")[^>]*)>([\s\S]*?)<\/script>/g;
  const sortie = html.replace(motif, (tout, attributs, code) => {
    if (!code.trim()) return tout;
    const nom = 'assets/plan-' + createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 16) + '.js';
    fichiers.push({ nom, code });
    return '<script' + attributs + ' src="' + nom + '"></script>';
  });
  return { html: sortie, fichiers };
}

/**
 * Les empreintes des scripts restes en ligne, pour la politique de contenu : aucune d'ordinaire,
 * le programme etant sorti de la page. L'empreinte porte sur le contenu EXACT, sans rien enlever.
 */
export function empreintesDesScriptsEnLigne(html) {
  const empreintes = [];
  const motif = /<script(?![^>]*\ssrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g;
  for (let m = motif.exec(html); m; m = motif.exec(html)) {
    const code = m[1] || '';
    if (!code) continue;
    empreintes.push("'sha256-" + createHash('sha256').update(code, 'utf8').digest('base64') + "'");
  }
  return empreintes;
}
