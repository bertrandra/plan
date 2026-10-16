import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL_THREE, VERSION_THREE, urlExemple } from '../../../src/three/bibliotheque';

const racine = new URL('../../../', import.meta.url);
const lire = (chemin: string): string => readFileSync(new URL(chemin, racine), 'utf8');

describe('three/bibliotheque', () => {
  it('la table d\'import de la page nomme le meme fichier que le chargeur : une seule instance de three.js', () => {
    const m = /<script type="importmap">([^<]+)<\/script>/.exec(lire('index.html'));
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!).imports.three).toBe(URL_THREE);
  });

  it('la table d\'import precede le script de module', () => {
    const html = lire('index.html');
    expect(html.indexOf('type="importmap"')).toBeGreaterThan(-1);
    expect(html.indexOf('type="importmap"')).toBeLessThan(html.indexOf('type="module"'));
  });

  it('la version est celle de package.json (types et banc d\'essai)', () => {
    const pkg = JSON.parse(lire('package.json')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.three).toBe(VERSION_THREE);
    expect(urlExemple('controls/OrbitControls.js')).toBe('https://cdn.jsdelivr.net/npm/three@' + VERSION_THREE + '/examples/jsm/controls/OrbitControls.js');
  });
});
