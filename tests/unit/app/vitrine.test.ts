// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireVitrine, poserVitrine, appliquerZoom, DIMENSION_MIN, DIMENSION_MAX, ZOOM_MIN, ZOOM_MAX, type SceneZoomable } from '../../../src/app/vitrine.js';

// La vitrine publique (src/app/vitrine.ts) : la Vue 3D de la demonstration, encadree par la page
// d'accueil du catalogue de la plateforme.

describe('l adresse de la vitrine', () => {
  it('n existe qu avec mode=demo', () => {
    expect(lireVitrine('')).toBeNull();
    expect(lireVitrine('?projet=abc')).toBeNull();
    expect(lireVitrine('?mode=plan')).toBeNull();
    expect(lireVitrine('?mode=demo')).toEqual({ largeur: null, hauteur: null, zoom: null });
  });

  it('lit x et y en pixels, bornes', () => {
    expect(lireVitrine('?mode=demo&x=1024&y=768')).toEqual({ largeur: 1024, hauteur: 768, zoom: null });
    expect(lireVitrine('?mode=demo&x=10&y=99999')).toEqual({ largeur: DIMENSION_MIN, hauteur: DIMENSION_MAX, zoom: null });
  });

  it('ignore une dimension qui n est pas un entier', () => {
    expect(lireVitrine('?mode=demo&x=abc&y=-5')).toEqual({ largeur: null, hauteur: null, zoom: null });
    expect(lireVitrine('?mode=demo&x=100px;background:red')).toEqual({ largeur: null, hauteur: null, zoom: null });
  });

  it('pose data-vitrine et la taille de la scene', () => {
    const racine = document.createElement('html');
    poserVitrine({ largeur: 1024, hauteur: 768, zoom: null }, racine);
    expect(racine.hasAttribute('data-vitrine')).toBe(true);
    expect(racine.style.getPropertyValue('--vitrine-largeur')).toBe('1024px');
    expect(racine.style.getPropertyValue('--vitrine-hauteur')).toBe('768px');
  });
});

describe('le zoom de la vitrine', () => {
  it('se lit en facteur, virgule ou point, borne', () => {
    expect(lireVitrine('?mode=demo&zoom=2')!.zoom).toBe(2);
    expect(lireVitrine('?mode=demo&zoom=1.5')!.zoom).toBe(1.5);
    expect(lireVitrine('?mode=demo&zoom=0,5')!.zoom).toBe(0.5);
    expect(lireVitrine('?mode=demo&zoom=0.01')!.zoom).toBe(ZOOM_MIN);
    expect(lireVitrine('?mode=demo&zoom=50')!.zoom).toBe(ZOOM_MAX);
  });

  it('ignore ce qui n est pas un nombre positif', () => {
    for (const z of ['abc', '-2', '0', '', '1e3', '2x']) expect(lireVitrine('?mode=demo&zoom=' + z)!.zoom, z).toBeNull();
  });

  it('rapproche la camera de ce qu elle vise, sans deplacer la cible', () => {
    class V {
      constructor(public x: number, public y: number, public z: number) {}
      clone() { return new V(this.x, this.y, this.z); }
      sub(v: V) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      add(v: V) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      multiplyScalar(k: number) { this.x *= k; this.y *= k; this.z *= k; return this; }
      copy(v: V) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    }
    let misAJour = 0;
    const sc = { camera: { position: new V(10, 20, 30) }, controls: { target: new V(2, 4, 6), update: () => { misAJour++; } } };
    appliquerZoom(sc as unknown as SceneZoomable, 2);
    expect([sc.camera.position.x, sc.camera.position.y, sc.camera.position.z]).toEqual([6, 12, 18]);
    expect([sc.controls.target.x, sc.controls.target.y, sc.controls.target.z]).toEqual([2, 4, 6]);
    expect(misAJour).toBe(1);
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
