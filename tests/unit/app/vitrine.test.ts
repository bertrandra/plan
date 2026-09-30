// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireVitrine, poserVitrine, appliquerZoom, lireHeure, heureALInstant, animerHeure, dateDuJour, HEURE_DEBUT_DEFAUT, HEURE_FIN_DEFAUT, DUREE_JOURNEE_MS, DUREE_MIN_S, DUREE_MAX_S, DIMENSION_MIN, DIMENSION_MAX, ZOOM_MIN, ZOOM_MAX, type SceneZoomable } from '../../../src/app/vitrine.js';

// La vitrine publique (src/app/vitrine.ts) : la Vue 3D de la demonstration, encadree par la page
// d'accueil du catalogue de la plateforme.

describe('l adresse de la vitrine', () => {
  it('n existe qu avec mode=demo', () => {
    expect(lireVitrine('')).toBeNull();
    expect(lireVitrine('?projet=abc')).toBeNull();
    expect(lireVitrine('?mode=plan')).toBeNull();
    expect(lireVitrine('?mode=demo')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null });
  });

  it('lit x et y en pixels, bornes', () => {
    expect(lireVitrine('?mode=demo&x=1024&y=768')).toEqual({ largeur: 1024, hauteur: 768, zoom: null, orthophoto: false, heureAuto: null });
    expect(lireVitrine('?mode=demo&x=10&y=99999')).toEqual({ largeur: DIMENSION_MIN, hauteur: DIMENSION_MAX, zoom: null, orthophoto: false, heureAuto: null });
  });

  it('ignore une dimension qui n est pas un entier', () => {
    expect(lireVitrine('?mode=demo&x=abc&y=-5')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null });
    expect(lireVitrine('?mode=demo&x=100px;background:red')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null });
  });

  it('pose data-vitrine et la taille de la scene', () => {
    const racine = document.createElement('html');
    poserVitrine({ largeur: 1024, hauteur: 768, zoom: null, orthophoto: false, heureAuto: null }, racine);
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

describe('l orthophoto de la vitrine', () => {
  it('s allume avec y, et reste eteinte sinon', () => {
    for (const v of ['y', 'Y', 'o', 'oui', '1', 'true']) expect(lireVitrine('?mode=demo&orthophoto=' + v)!.orthophoto, v).toBe(true);
    for (const v of ['n', 'non', '0', 'false', '', 'peut-etre']) expect(lireVitrine('?mode=demo&orthophoto=' + v)!.orthophoto, v).toBe(false);
    expect(lireVitrine('?mode=demo')!.orthophoto).toBe(false);
  });
});

describe('la course du soleil de la vitrine', () => {
  it('lit une heure en 14, 14:30 ou 14h30', () => {
    expect(lireHeure('14')).toBe(840);
    expect(lireHeure('14:30')).toBe(870);
    expect(lireHeure('7h05')).toBe(425);
    expect(lireHeure('24')).toBe(1440);
    for (const v of ['25', '14:60', '24:10', 'midi', '', null]) expect(lireHeure(v), String(v)).toBeNull();
  });

  it('ne court qu avec heureauto=y, de 7 h a 20 h par defaut', () => {
    expect(lireVitrine('?mode=demo')!.heureAuto).toBeNull();
    expect(lireVitrine('?mode=demo&heureauto=n&hrsstart=8')!.heureAuto).toBeNull();
    expect(lireVitrine('?mode=demo&heureauto=y')!.heureAuto).toEqual({ debut: HEURE_DEBUT_DEFAUT, fin: HEURE_FIN_DEFAUT, dureeMs: DUREE_JOURNEE_MS });
    expect(lireVitrine('?mode=demo&heureauto=y&hrsstart=9&hrsend=18:30')!.heureAuto).toEqual({ debut: 540, fin: 1110, dureeMs: DUREE_JOURNEE_MS });
  });

  it('lit des bornes inversees dans l ordre, et ne court pas entre deux heures egales', () => {
    expect(lireVitrine('?mode=demo&heureauto=y&hrsstart=19&hrsend=8')!.heureAuto).toEqual({ debut: 480, fin: 1140, dureeMs: DUREE_JOURNEE_MS });
    expect(lireVitrine('?mode=demo&heureauto=y&hrsstart=12&hrsend=12')!.heureAuto).toBeNull();
  });

  it('dure duree secondes, bornees', () => {
    const d = (q: string) => lireVitrine('?mode=demo&heureauto=y' + q)!.heureAuto!.dureeMs;
    expect(d('&duree=60')).toBe(60_000);
    expect(d('&duree=12,5')).toBe(12_500);
    expect(d('&duree=1')).toBe(DUREE_MIN_S * 1000);
    expect(d('&duree=99999')).toBe(DUREE_MAX_S * 1000);
    expect(d('&duree=vite')).toBe(DUREE_JOURNEE_MS);
    expect(d('')).toBe(DUREE_JOURNEE_MS);
  });

  it('avance avec l horloge et boucle', () => {
    const c = { debut: 600, fin: 1200 };
    expect(heureALInstant(c, 0)).toBe(600);
    expect(heureALInstant(c, DUREE_JOURNEE_MS / 2)).toBe(900);
    expect(heureALInstant(c, DUREE_JOURNEE_MS * 1.25)).toBe(750);
    expect(heureALInstant(c, 60_000, 120_000)).toBe(900);
  });

  it('pose l heure a chaque minute nouvelle, et s arrete', () => {
    vi.useFakeTimers();
    let t = 0;
    const posees: number[] = [];
    const arreter = animerHeure({ debut: 600, fin: 1200 }, (m) => posees.push(m), () => t, 100);
    t = DUREE_JOURNEE_MS / 4; vi.advanceTimersByTime(100);
    t = DUREE_JOURNEE_MS / 4; vi.advanceTimersByTime(100);
    arreter();
    t = DUREE_JOURNEE_MS / 2; vi.advanceTimersByTime(500);
    expect(posees).toEqual([600, 750]);
    vi.useRealTimers();
  });

  it('prend la date du jour en local', () => {
    expect(dateDuJour(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
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
