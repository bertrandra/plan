// La couverture de Panoramax sur la carte de l'import (demande du proprietaire, 15 novembre 2026 : savoir ou il y a des photos avant de
// zoomer) : le lecteur de tuiles vectorielles (banc/src/mvt.ts) et ce que la carte en tire (banc/src/couverture.ts), sur deux tuiles
// temoin enregistrees du service le 15 novembre 2026 (les traces autour du Vesinet au niveau 14, la grille de densite au niveau 5).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { couvertureVisible, DAMIER, indiceDeZoom, lireCouverture, niveauCouverture, opaciteDeCase, TUILE_VIDE, urlCouverture } from '../src/couverture.js';
import { lireTuile } from '../src/mvt.js';

const temoin = (nom: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', nom)));
const traces = temoin('couverture-14-8291-5633.mvt'), grille = temoin('couverture-5-17-12.mvt');

// De quoi ecrire une tuile a la main : entiers a longueur variable, champs, sous-messages.
const varint = (n: number): number[] => { const o: number[] = []; let v = n; while (v >= 128) { o.push((v % 128) | 128); v = Math.floor(v / 128); } o.push(v); return o; };
const champ = (n: number, octets: number[]) => [...varint(n * 8 + 2), ...varint(octets.length), ...octets];
const entier = (n: number, v: number) => [...varint(n * 8), ...varint(v)];
const texte = (s: string) => [...new TextEncoder().encode(s)];
const zz = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);

describe('le lecteur de tuiles vectorielles', () => {
  it('lit les couches, les lignes et les attributs d’une tuile du service', () => {
    const c = lireTuile(traces);
    expect(c.map((x) => [x.nom, x.etendue, x.objets.length])).toEqual([['sequences', 4096, 21]]);
    const o = c[0]?.objets[0];
    expect(o?.type).toBe('ligne');
    // Les deplacements en zigzag, cumules : la ligne sort de la tuile (sa marge), ce que des entiers negatifs disent.
    expect(o?.parties).toEqual([[-76, 4352, -102, 4327, -133, 4300, -167, 4272, -203, 4244, -237, 4212, -256, 4200]]);
    expect(o?.attributs).toMatchObject({ id: '5ed65b91-a6ae-4823-87ba-e2a2c5b9e364', type: 'flat', date: '2025-11-08', gps_accuracy: 5 });
  });
  it('lit les points et leurs nombres ; ne décode que les couches demandées', () => {
    const c = lireTuile(grille);
    expect(c.map((x) => [x.nom, x.objets.length])).toEqual([['grid', 1443]]);
    expect(c[0]?.objets[0]).toEqual({ type: 'point', parties: [[1147, 2318]], attributs: { nb_pictures: 1298, nb_360_pictures: 1, nb_flat_pictures: 1297, coef: 0.5, coef_360_pictures: 0, coef_flat_pictures: 0.5 } });
    expect(lireTuile(grille, (n) => n === 'sequences')).toEqual([]);
  });
  it('ferme les polygones, sépare les parties, lit chaque type de valeur et passe les champs inconnus', () => {
    // Un carre (aller a 1,1 ; tracer 3 cotes ; fermer), puis un second point de depart : deux parties.
    const geo = [9, zz(1), zz(1), 26, zz(4), zz(0), zz(0), zz(4), zz(-4), zz(0), 15, 9, zz(10), zz(-2)].flatMap(varint);
    const objet = champ(2, [...entier(1, 7), ...champ(2, [0, 0, 1, 1, 2, 2]), ...entier(3, 3), ...champ(4, geo)]);
    const double = [...new Uint8Array(new Float64Array([2.5]).buffer)];
    const valeurs = [champ(4, champ(1, texte('été'))), champ(4, [...varint(3 * 8 + 1), ...double]), champ(4, entier(7, 1))].flat();
    const couche = champ(3, [...entier(15, 2), ...champ(1, texte('essai')), ...objet, ...champ(3, texte('nom')), ...champ(3, texte('poids')), ...champ(3, texte('vrai')), ...valeurs, ...entier(5, 512), ...entier(9, 1)]);
    const c = lireTuile(new Uint8Array(couche));
    expect(c).toEqual([{ nom: 'essai', etendue: 512, objets: [{ type: 'polygone', parties: [[1, 1, 5, 1, 5, 5, 1, 5, 1, 1], [11, 3]], attributs: { nom: 'été', poids: 2.5, vrai: true } }] }]);
  });
  it('refuse une tuile tronquée plutôt que d’en inventer la fin', () => {
    expect(() => lireTuile(traces.subarray(0, 300))).toThrow();
  });
});

describe('la couverture que la carte en tire', () => {
  it('choisit la grille de loin et les tracés à partir du niveau 7, sans jamais lire le niveau 6 (grille et séquences ensemble)', () => {
    expect(niveauCouverture(4.6)).toEqual({ couche: 'grille', niveau: 4 });
    expect(niveauCouverture(5.9)).toEqual({ couche: 'grille', niveau: 5 });
    expect(niveauCouverture(6.8)).toEqual({ couche: 'grille', niveau: 5 });
    expect(niveauCouverture(7)).toEqual({ couche: 'traces', niveau: 7 });
    expect(niveauCouverture(13.4)).toEqual({ couche: 'traces', niveau: 13 });
    expect(niveauCouverture(19)).toEqual({ couche: 'traces', niveau: 14 });
    expect(urlCouverture(14, 8291, 5633)).toBe('https://api.panoramax.xyz/api/map/14/8291/5633.mvt');
  });
  it('garde les tracés d’une tuile et le damier de ce qu’ils occupent', () => {
    const t = lireCouverture(traces, 'traces');
    expect([t.lignes.length, t.lignes.reduce((n, l) => n + l.length / 2, 0), t.cellules.length]).toEqual([26, 982, 0]);
    expect(t.occupation.length).toBe(DAMIER * DAMIER);
    expect(t.occupation.reduce((n, v) => n + v, 0)).toBe(225);
    // La meme tuile lue pour la grille n'a rien : la couche n'y est pas.
    expect(lireCouverture(traces, 'grille')).toBe(TUILE_VIDE);
  });
  it('garde les cases de la grille, leur pas et leur nombre de photos ; plus de photos, plus opaque', () => {
    const t = lireCouverture(grille, 'grille');
    expect([t.cellules.length, t.pas, t.cellules[0]]).toEqual([1443, { x: 36, y: 45 }, { x: 1147, y: 2318, n: 1298 }]);
    expect(opaciteDeCase(1)).toBeLessThan(opaciteDeCase(1000));
    expect(opaciteDeCase(1000)).toBeLessThan(opaciteDeCase(1e6));
    expect(opaciteDeCase(1e9)).toBeLessThanOrEqual(0.8);
  });
  it('dit si la vue contient de la couverture : la tuile entière oui, un coin vide non', () => {
    const t = lireCouverture(traces, 'traces'), taille = { l: 800, h: 600 };
    expect(couvertureVisible({ gauche: 0, haut: 0, cote: 512 }, t.occupation, taille)).toBe(true);
    // La case du damier la plus loin de toute couverture, agrandie jusqu'a remplir la carte : la vue n'a rien.
    const libre = Array.from({ length: DAMIER * DAMIER }, (_, k) => k).find((k) => !t.occupation[k] && ![-1, 1, -DAMIER, DAMIER].some((d) => t.occupation[k + d])) as number;
    const cote = 800 * DAMIER, i = libre % DAMIER, j = Math.floor(libre / DAMIER);
    expect(couvertureVisible({ gauche: -i * 800, haut: -j * 800, cote }, t.occupation, taille)).toBe(false);
    // La tuile hors de l'ecran ne compte pas.
    expect(couvertureVisible({ gauche: 900, haut: 0, cote: 512 }, t.occupation, taille)).toBe(false);
    expect(couvertureVisible({ gauche: 0, haut: 0, cote: 512 }, TUILE_VIDE.occupation, taille)).toBe(false);
  });
  it('dit où zoomer, ou qu’il n’y a rien ; jamais « aucune photo » sans le savoir', () => {
    expect(indiceDeZoom('oui', 'traces')).toBe('Zoomez sur une rue orange pour voir ses photos');
    expect(indiceDeZoom('oui', 'grille')).toContain('zone orange');
    expect(indiceDeZoom('non', 'traces')).toBe('Aucune photo de rue Panoramax dans cette zone');
    for (const e of ['attente', 'panne', 'eteinte'] as const) expect(indiceDeZoom(e, 'traces')).toBe('Zoomez pour voir les photos de rue');
  });
});
