import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { sortirLesScripts, empreintesDesScriptsEnLigne } from '../../../deploy/scripts-page.mjs';

// Le programme sorti de la page (deploy/scripts-page.mjs) : depuis le 10 octobre 2026, une mise en
// ligne sans le `.htaccess` de la meme livraison ne laisse plus une page blanche, parce que la
// politique de contenu ne nomme plus d'empreinte de build.

const page = '<head><script type="application/json" id="plan-produit">{"product":"plan"}</script>'
  + '<script type="module" crossorigin>import("x");console.log("</div>")</script></head><body></body>';

describe('sortirLesScripts', () => {
  it('sort le programme dans assets/plan-<empreinte>.js, appele par un chemin relatif, et laisse le bloc de donnees', () => {
    const { html, fichiers } = sortirLesScripts(page);
    expect(fichiers).toHaveLength(1);
    const code = 'import("x");console.log("</div>")';
    expect(fichiers[0]).toEqual({ nom: 'assets/plan-' + createHash('sha256').update(code).digest('hex').slice(0, 16) + '.js', code });
    expect(html).toContain('<script type="module" crossorigin src="' + fichiers[0]!.nom + '"></script>');
    expect(html).toContain('<script type="application/json" id="plan-produit">{"product":"plan"}</script>');
    expect(html).not.toContain('console.log');
    // Plus rien a nommer par empreinte : `script-src 'self'` couvre le programme.
    expect(empreintesDesScriptsEnLigne(html)).toEqual([]);
    expect(empreintesDesScriptsEnLigne(page)).toHaveLength(1);
  });

  it('le nom suit le contenu : meme programme, meme nom ; autre programme, autre nom', () => {
    const a = sortirLesScripts(page).fichiers[0]!.nom;
    expect(sortirLesScripts(page).fichiers[0]!.nom).toBe(a);
    expect(sortirLesScripts(page.replace('"x"', '"y"')).fichiers[0]!.nom).not.toBe(a);
    // Un script deja externe, ou vide, reste tel quel.
    const externe = '<script type="module" src="assets/plan-0123456789abcdef.js"></script><script></script>';
    expect(sortirLesScripts(externe)).toEqual({ html: externe, fichiers: [] });
  });
});

describe('le .htaccess du programme sorti', () => {
  const modele = readFileSync(resolve(__dirname, '../../../deploy/htaccess.template'), 'utf8');
  it('garde le programme en cache sans limite, sous un type JavaScript, et la politique sur self', () => {
    expect(modele).toMatch(/<FilesMatch "\^plan-\[0-9a-f\]\{16\}\\\.js\$">\s*Header set Cache-Control "public, max-age=31536000, immutable"/);
    expect(modele).toMatch(/AddType text\/javascript \.js/);
    expect(modele).toMatch(/script-src 'self' @@HACHES_SCRIPT@@ https:\/\/cdnjs/);
    const politique = /Header always set Content-Security-Policy "([^"]+)"/.exec(modele)![1]!;
    expect(politique.split(';').find((d) => d.trim().startsWith('script-src'))).not.toMatch(/unsafe-inline/);
  });
});
