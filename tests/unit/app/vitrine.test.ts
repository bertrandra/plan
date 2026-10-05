// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireVitrine, poserVitrine, appliquerZoom, trouverPointDeVue, lireHeure, heureALInstant, animerHeure, dateDuJour, HEURE_DEBUT_DEFAUT, HEURE_FIN_DEFAUT, DUREE_JOURNEE_MS, DUREE_MIN_S, DUREE_MAX_S, DIMENSION_MIN, DIMENSION_MAX, ZOOM_MIN, ZOOM_MAX, ROTATION_VITRINE, type SceneZoomable } from '../../../src/app/vitrine.js';

// La vitrine publique (src/app/vitrine.ts) : la Vue 3D de la demonstration, encadree par la page
// d'accueil du catalogue de la plateforme.

describe('l adresse de la vitrine', () => {
  it('n existe qu avec mode=demo', () => {
    expect(lireVitrine('')).toBeNull();
    expect(lireVitrine('?projet=abc')).toBeNull();
    expect(lireVitrine('?mode=plan')).toBeNull();
    expect(lireVitrine('?mode=demo')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: ROTATION_VITRINE });
  });

  it('lit x et y en pixels, bornes', () => {
    expect(lireVitrine('?mode=demo&x=1024&y=768')).toEqual({ largeur: 1024, hauteur: 768, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: ROTATION_VITRINE });
    expect(lireVitrine('?mode=demo&x=10&y=99999')).toEqual({ largeur: DIMENSION_MIN, hauteur: DIMENSION_MAX, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: ROTATION_VITRINE });
  });

  it('ignore une dimension qui n est pas un entier', () => {
    expect(lireVitrine('?mode=demo&x=abc&y=-5')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: ROTATION_VITRINE });
    expect(lireVitrine('?mode=demo&x=100px;background:red')).toEqual({ largeur: null, hauteur: null, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: ROTATION_VITRINE });
  });

  it('pose data-vitrine et la taille de la scene', () => {
    const racine = document.createElement('html');
    poserVitrine({ largeur: 1024, hauteur: 768, zoom: null, orthophoto: false, heureAuto: null, pdv: null, fichier: null, date: null, rotation: null }, racine);
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

  it('ne court qu avec heureauto=y ; sans hrsstart ni hrsend, les bornes suivent le soleil', () => {
    expect(lireVitrine('?mode=demo')!.heureAuto).toBeNull();
    expect(lireVitrine('?mode=demo&heureauto=n&hrsstart=8')!.heureAuto).toBeNull();
    expect(lireVitrine('?mode=demo&heureauto=y')!.heureAuto).toEqual({ debut: null, fin: null, dureeMs: DUREE_JOURNEE_MS });
    expect(lireVitrine('?mode=demo&heureauto=y&hrsstart=9')!.heureAuto).toEqual({ debut: 540, fin: null, dureeMs: DUREE_JOURNEE_MS });
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

describe('le point de vue de la vitrine', () => {
  const vues = [{ name: 'Coin entrant terrasse' }, { name: 'Arriere terrasse' }, { name: 'Fenetre cuisine' }, { name: 'Entrée' }, { name: 'Chène' }];

  it('se lit tel qu ecrit, borne a 80 caracteres', () => {
    expect(lireVitrine('?mode=demo')!.pdv).toBeNull();
    expect(lireVitrine('?mode=demo&pdv=Fenetre%20cuisine')!.pdv).toBe('Fenetre cuisine');
    expect(lireVitrine('?mode=demo&pdv=' + 'a'.repeat(200))!.pdv).toHaveLength(80);
  });

  it('se trouve par son nom, sans egard aux majuscules ni aux accents', () => {
    expect(trouverPointDeVue(vues, 'fenetre CUISINE')).toBe(vues[2]);
    expect(trouverPointDeVue(vues, 'entree')).toBe(vues[3]);
    expect(trouverPointDeVue(vues, 'Chene')).toBe(vues[4]);
  });

  it('se trouve par son rang, a partir de 1', () => {
    expect(trouverPointDeVue(vues, '2')).toBe(vues[1]);
    expect(trouverPointDeVue(vues, '9')).toBeNull();
  });

  it('se trouve par un debut de nom seulement s il n y en a qu un', () => {
    expect(trouverPointDeVue(vues, 'fen')).toBe(vues[2]);
    expect(trouverPointDeVue(vues, 'c')).toBeNull();
  });

  it('laisse le cadrage par defaut quand il est inconnu', () => {
    expect(trouverPointDeVue(vues, 'piscine')).toBeNull();
    expect(trouverPointDeVue(vues, null)).toBeNull();
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

describe('file : une demo de l admin dans la vitrine', () => {
  it('lit le numero de la demo, et refuse ce qui sortirait du dossier', async () => {
    const { lireVitrine } = await import('../../../src/app/vitrine.js');
    expect(lireVitrine('?mode=demo&file=2')!.fichier).toBe('2');
    expect(lireVitrine('?mode=demo&file=terrasse-sud')!.fichier).toBe('terrasse-sud');
    expect(lireVitrine('?mode=demo&file=..%2Fconfig')!.fichier).toBe(null);
    expect(lireVitrine('?mode=demo')!.fichier).toBe(null);
  });

  it('charge la demo par la route publique, relative a la page, sans cookie', async () => {
    const { chargerDemoVitrine } = await import('../../../src/app/vitrine.js');
    const appels: [string, RequestInit | undefined][] = [];
    const lire = (async (u: string, init?: RequestInit) => {
      appels.push([u, init]);
      return new Response(JSON.stringify({ meta: { schemaVersion: 1 }, objects: [{ key: 'a' }], measures: [{ id: 'm' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const d = await chargerDemoVitrine('2', lire);
    expect(appels[0]?.[0]).toBe('admin/vitrine/2');
    expect(appels[0]?.[1]?.credentials).toBe('omit');
    expect(d).toEqual({ objects: [{ key: 'a' }], measures: [{ id: 'm' }] });
  });

  it('rend null — la demonstration integree — si la demo manque ou n est pas un plan', async () => {
    const { chargerDemoVitrine } = await import('../../../src/app/vitrine.js');
    const repond = (statut: number, corps: unknown) => (async () => new Response(JSON.stringify(corps), { status: statut })) as unknown as typeof fetch;
    expect(await chargerDemoVitrine('9', repond(404, { error: {} }))).toBe(null);
    expect(await chargerDemoVitrine('1', repond(200, { objects: [] }))).toBe(null);
    expect(await chargerDemoVitrine('1', repond(200, { meta: { schemaVersion: 99 }, objects: [{ key: 'a' }] }))).toBe(null);
    expect(await chargerDemoVitrine('1', (async () => { throw new Error('reseau'); }) as unknown as typeof fetch)).toBe(null);
  });
});

describe('date et rotation de la vitrine', () => {
  it('lit une date qui existe, et refuse le reste', async () => {
    const { lireVitrine } = await import('../../../src/app/vitrine.js');
    expect(lireVitrine('?mode=demo&date=2026-06-21')!.date).toBe('2026-06-21');
    expect(lireVitrine('?mode=demo&date=2026-02-30')!.date).toBe(null);
    expect(lireVitrine('?mode=demo&date=21/06/2026')!.date).toBe(null);
  });

  it('lit une rotation en tours par minute, bornee, et nulle vaut arretee', async () => {
    const { lireVitrine, ROTATION_MAX } = await import('../../../src/app/vitrine.js');
    expect(lireVitrine('?mode=demo&rotation=2')!.rotation).toBe(2);
    expect(lireVitrine('?mode=demo&rotation=-1,5')!.rotation).toBe(-1.5);
    expect(lireVitrine('?mode=demo&rotation=99')!.rotation).toBe(ROTATION_MAX);
    expect(lireVitrine('?mode=demo&rotation=0')!.rotation).toBe(null);
    expect(lireVitrine('?mode=demo&rotation=n')!.rotation).toBe(null);
    expect(lireVitrine('?mode=demo&rotation=non')!.rotation).toBe(null);
    // Par defaut, la vitrine tourne ; « oui » ou illisible : la vitesse par defaut.
    expect(lireVitrine('?mode=demo')!.rotation).toBe(ROTATION_VITRINE);
    expect(lireVitrine('?mode=demo&rotation=y')!.rotation).toBe(ROTATION_VITRINE);
    expect(lireVitrine('?mode=demo&rotation=vite')!.rotation).toBe(ROTATION_VITRINE);
  });

  it('l adresse copiee porte la date et la rotation choisies, et garde le reste', async () => {
    const { adresseVitrine } = await import('../../../src/app/vitrine.js');
    const u = new URL(adresseVitrine('https://p.r/?mode=demo&file=2&rotation=1', '2026-12-21', -2));
    expect(u.searchParams.get('file')).toBe('2');
    expect(u.searchParams.get('date')).toBe('2026-12-21');
    expect(u.searchParams.get('rotation')).toBe('-2');
    // Arretee se dit : sans le parametre, la vitrine tournerait.
    expect(new URL(adresseVitrine('https://p.r/?mode=demo&rotation=1', null, null)).searchParams.get('rotation')).toBe('0');
  });
});

describe('la course du soleil, du lever au coucher', () => {
  it('prend le lever et le coucher pour les bornes absentes, garde celles donnees', async () => {
    const { resoudreCourse } = await import('../../../src/app/vitrine.js');
    const lc = { lever: 7 * 60 + 52, coucher: 19 * 60 + 18 };
    expect(resoudreCourse({ debut: null, fin: null, dureeMs: 1000 }, lc)).toEqual({ debut: 472, fin: 1158, dureeMs: 1000 });
    expect(resoudreCourse({ debut: 540, fin: null, dureeMs: 1000 }, lc)).toEqual({ debut: 540, fin: 1158, dureeMs: 1000 });
    // Sans lieu (pas de lever ni coucher connus) : 7 h et 20 h.
    expect(resoudreCourse({ debut: null, fin: null, dureeMs: 1000 }, null)).toEqual({ debut: HEURE_DEBUT_DEFAUT, fin: HEURE_FIN_DEFAUT, dureeMs: 1000 });
  });

  it('calcule le lever et le coucher au Vesinet : plus tot et plus tard en juin qu en decembre', async () => {
    const { leverEtCoucher } = await import('../../../src/geo/soleil.js');
    const juin = leverEtCoucher(2026, 6, 21, 48.905, 2.133)!;
    const dec = leverEtCoucher(2026, 12, 21, 48.905, 2.133)!;
    // Heures legales : environ 5 h 45 / 21 h 55 en juin, 8 h 40 / 16 h 55 en decembre.
    expect(juin.lever).toBeGreaterThan(5 * 60 + 25); expect(juin.lever).toBeLessThan(6 * 60 + 5);
    expect(juin.coucher).toBeGreaterThan(21 * 60 + 35); expect(juin.coucher).toBeLessThan(22 * 60 + 15);
    expect(dec.lever).toBeGreaterThan(8 * 60 + 20); expect(dec.lever).toBeLessThan(9 * 60);
    expect(dec.coucher).toBeGreaterThan(16 * 60 + 35); expect(dec.coucher).toBeLessThan(17 * 60 + 15);
    expect(leverEtCoucher(2026, 6, 21, 80, 0)).toBe(null);
  });
});

describe('le cadrage sur la parcelle a l ouverture', () => {
  it('vise le centre de la parcelle, dans le repere de la scene, et la tient dans le champ', async () => {
    const { cadrageSurParcelle } = await import('../../../src/app/vitrine.js');
    const carre = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
    // La scene est centree sur une terrasse en (5, 5) : x vers l'Est, z = centre.y - y.
    const c = cadrageSurParcelle(carre, { x: 5, y: 5 })!;
    expect(c.cible).toEqual({ x: 5, y: 0, z: -5 });
    const rayon = Math.hypot(10, 10);
    expect(c.camera).toEqual({ x: 5 + rayon * 1.8, y: rayon * 1.8, z: -5 + rayon * 1.8 });
    expect(cadrageSurParcelle([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(null);
    // Telephone en portrait (390 x 844) : le champ est plus etroit en largeur, la camera recule d'autant.
    const portrait = cadrageSurParcelle(carre, { x: 5, y: 5 }, 390 / 844)!;
    expect(portrait.cible).toEqual(c.cible);
    expect(portrait.camera.y).toBeCloseTo(rayon * 1.8 * 844 / 390, 6);
    // En paysage, rien ne change.
    expect(cadrageSurParcelle(carre, { x: 5, y: 5 }, 16 / 9)).toEqual(c);
  });
});
