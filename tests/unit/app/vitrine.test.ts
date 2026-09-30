// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireVitrine, poserVitrine, DIMENSION_MIN, DIMENSION_MAX } from '../../../src/app/vitrine.js';

// La vitrine publique (src/app/vitrine.ts) : la Vue 3D de la demonstration, encadree par la page
// d'accueil du catalogue de la plateforme.

describe('l adresse de la vitrine', () => {
  it('n existe qu avec mode=demo', () => {
    expect(lireVitrine('')).toBeNull();
    expect(lireVitrine('?projet=abc')).toBeNull();
    expect(lireVitrine('?mode=plan')).toBeNull();
    expect(lireVitrine('?mode=demo')).toEqual({ largeur: null, hauteur: null });
  });

  it('lit x et y en pixels, bornes', () => {
    expect(lireVitrine('?mode=demo&x=1024&y=768')).toEqual({ largeur: 1024, hauteur: 768 });
    expect(lireVitrine('?mode=demo&x=10&y=99999')).toEqual({ largeur: DIMENSION_MIN, hauteur: DIMENSION_MAX });
  });

  it('ignore une dimension qui n est pas un entier', () => {
    expect(lireVitrine('?mode=demo&x=abc&y=-5')).toEqual({ largeur: null, hauteur: null });
    expect(lireVitrine('?mode=demo&x=100px;background:red')).toEqual({ largeur: null, hauteur: null });
  });

  it('pose data-vitrine et la taille de la scene', () => {
    const racine = document.createElement('html');
    poserVitrine({ largeur: 1024, hauteur: 768 }, racine);
    expect(racine.hasAttribute('data-vitrine')).toBe(true);
    expect(racine.style.getPropertyValue('--vitrine-largeur')).toBe('1024px');
    expect(racine.style.getPropertyValue('--vitrine-hauteur')).toBe('768px');
  });
});

describe('la vitrine est en lecture seule', () => {
  it('meme sans plateforme', async () => {
    const acces = await import('../../../src/app/acces.js');
    expect(acces.enLectureSeule()).toBe(false);
    acces.entrerEnVitrine();
    expect(acces.enLectureSeule()).toBe(true);
    expect(acces.peutEcrire()).toBe(false);
  });
});

describe('le .htaccess', () => {
  const modele = readFileSync(resolve(__dirname, '../../../deploy/htaccess.template'), 'utf8');
  it('garde l atelier hors de tout cadre', () => {
    expect(modele).toMatch(/X-Frame-Options "DENY"/);
    expect(modele).toMatch(/frame-ancestors 'none'/);
  });
  it('n ouvre l encadrement qu a la vitrine, et a la plateforme seule', () => {
    const bloc = /<If "%\{QUERY_STRING\} =~ \/\(\^\|&\)mode=demo\(&\|\$\)\/">([\s\S]*?)<\/If>/.exec(modele);
    expect(bloc).not.toBeNull();
    expect(bloc![1]).toMatch(/Header always unset X-Frame-Options/);
    expect(bloc![1]).toMatch(/frame-ancestors @@ORIGINES_CADRE@@/);
    expect(modele.split('@@ORIGINES_CADRE@@')).toHaveLength(2);
  });
});
