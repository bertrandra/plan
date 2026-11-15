// « La maison se voit-elle ? » (banc/src/vueDegagee.ts ; demande du proprietaire, 15 novembre 2026) : la facade cachee par une haie,
// des arbres ou une cloture, lue dans l'apercu, sans modele ni reseau. Les regles sur des images fabriquees, puis le taux d'erreur sur
// les 76 temoins du Vesinet (fixtures/vue-degagee/, decodes par GD ; cette partie saute si PHP manque).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageRgba } from '../src/equirect.js';
import { CADRE_VUE, cadrePlat, ranger, regarder, type Zone } from '../src/facadesVues.js';
import { COEF_NOTE_CACHEE, HAUTEUR_LUE, horizonDuCadre, LARGEUR_LUE, lireLaZone, nature, noteAvecLecture, reduireDeMoitie, SEUIL_DEGAGEE } from '../src/vueDegagee.js';

type Rgb = [number, number, number];
const MUR: Rgb = [214, 205, 190], TUILE: Rgb = [150, 85, 60], HAIE: Rgb = [45, 90, 40], OMBRE: Rgb = [22, 34, 20], CIEL: Rgb = [120, 170, 235], BRANCHE: Rgb = [60, 50, 45];
/** Une image de 160 x 120 peinte par bandes horizontales : (jusqu'a quelle part de la hauteur, quelle couleur). */
function image(bandes: [number, Rgb][], l = LARGEUR_LUE, h = HAUTEUR_LUE): ImageRgba {
  const d = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) {
    const c = (bandes.find(([fin]) => y / h < fin) ?? bandes[bandes.length - 1] as [number, Rgb])[1];
    for (let x = 0; x < l; x++) d.set([c[0], c[1], c[2], 255], (y * l + x) * 4);
  }
  return { largeur: l, hauteur: h, donnees: d };
}
const ZONE: Zone = { gauche: 0.2, droite: 0.8, haut: 0.2, bas: 0.75 };

describe('ce qu’un pixel montre', () => {
  it('le bâti : murs clairs peu saturés, tuiles et enduits chauds', () => {
    for (const c of [MUR, TUILE, [128, 128, 128] as Rgb, [225, 215, 195] as Rgb, [180, 120, 90] as Rgb]) expect(nature(...c), c.join()).toBe(1);
  });
  it('la végétation : verts, et sombres à dominante verte (une haie à l’ombre)', () => {
    for (const c of [HAIE, OMBRE, [90, 140, 60] as Rgb, [30, 60, 35] as Rgb]) expect(nature(...c), c.join()).toBe(2);
  });
  it('le ciel : bleu clair, blanc brûlé', () => {
    for (const c of [CIEL, [250, 250, 252] as Rgb, [90, 140, 220] as Rgb]) expect(nature(...c), c.join()).toBe(3);
  });
  it('le reste n’est rien de tout cela (un portail rose vif, une voiture bleu sombre)', () => {
    expect(nature(200, 60, 140)).toBe(0);
    expect(nature(40, 50, 110)).toBe(0);
  });
});

describe('la lecture de la zone du bâtiment', () => {
  it('une façade claire sous son toit : dégagée', () => {
    const l = lireLaZone(image([[0.15, CIEL], [0.35, TUILE], [0.7, MUR], [1, [110, 110, 110]]]), ZONE);
    expect(l.bati).toBeGreaterThan(0.9);
    expect(l.cachee).toBe(false);
    expect(l.score).toBeGreaterThan(SEUIL_DEGAGEE);
  });
  it('une haie jusqu’en haut de la zone, ou des arbres devant : cachée', () => {
    expect(lireLaZone(image([[0.15, CIEL], [0.7, HAIE], [1, [110, 110, 110]]]), ZONE)).toMatchObject({ cachee: true, bati: 0 });
    expect(lireLaZone(image([[0.3, BRANCHE], [0.7, OMBRE], [1, [110, 110, 110]]]), ZONE).cachee).toBe(true);
    expect(lireLaZone(image([[1, CIEL]]), ZONE)).toMatchObject({ cachee: true, ciel: 1 });
  });
  it('seul ce qui est au-dessus de l’horizon compte : la rue et le pied de la clôture sont les mêmes pour toutes les vues', () => {
    const horizon = horizonDuCadre();
    expect(horizon).toBeGreaterThan(0.6);
    expect(horizon).toBeLessThan(0.65);
    expect(horizonDuCadre(cadrePlat(70))).toBe(0.5);
    // Le toit et l'etage au-dessus d'une haie qui monte a l'horizon : degagee ; la meme maison dont la haie monte au toit : cachee.
    const audessus = lireLaZone(image([[0.2, CIEL], [0.3, TUILE], [horizon, MUR], [1, HAIE]]), ZONE);
    const noyee = lireLaZone(image([[0.2, CIEL], [0.27, TUILE], [1, HAIE]]), ZONE);
    expect([audessus.cachee, noyee.cachee]).toEqual([false, true]);
    expect(audessus.vegetation).toBe(0);
    // Une chaussee grise sous l'horizon ne compte pas pour du bati.
    expect(lireLaZone(image([[horizon, HAIE], [1, [120, 120, 120]]]), ZONE)).toMatchObject({ bati: 0, cachee: true });
  });
  it('un bâtiment lointain ou bas (une zone mince) ne se dit pas dégagé sur quelques pixels de mur', () => {
    const mince: Zone = { gauche: 0.4, droite: 0.6, haut: 0.55, bas: 0.7 };
    const l = lireLaZone(image([[1, MUR]]), mince);
    expect(l.bati).toBe(1);
    expect(l.hauteur).toBeLessThan(0.08);
    expect(l.cachee).toBe(true);
  });
  it('la zone tient dans l’image, même hors cadre ou vide', () => {
    for (const z of [{ gauche: 0.99, droite: 1, haut: 0.99, bas: 1 }, { gauche: 0, droite: 0, haut: 0, bas: 0 }, { gauche: 0, droite: 1, haut: 0, bas: 1 }]) {
      const l = lireLaZone(image([[1, MUR]]), z);
      for (const v of [l.bati, l.vegetation, l.ciel, l.hauteur, l.score]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('la zone vient de la géométrie : là où le bâtiment est dans le cadre, du faîte au pied', () => {
    const ici = { lat: 48.905067, lon: 2.132536 }, R = 6371008.8;
    const pt = (x: number, y: number) => ({ lat: ici.lat + (y / R) * (180 / Math.PI), lon: ici.lon + (x / (R * Math.cos((ici.lat * Math.PI) / 180))) * (180 / Math.PI) });
    const maison = (x: number, y: number, hauteur: number) => ({ id: 'm', hauteur, contour: [pt(x - 5, y - 5), pt(x + 5, y - 5), pt(x + 5, y + 5), pt(x - 5, y + 5), pt(x - 5, y - 5)] });
    // Droit devant, a 10 m : centree ; le faite au-dessus du milieu, le pied sous l'horizon.
    const z = regarder(ranger([maison(15, 0, 7)]), ici, 90).zone as Zone;
    expect((z.gauche + z.droite) / 2).toBeCloseTo(0.5, 1);
    expect(z.haut).toBeLessThan(0.4);
    expect(z.bas).toBeGreaterThan(horizonDuCadre(CADRE_VUE));
    // Plus au nord : a gauche du cadre d'une vue tournee vers l'est. Plus haute : son faite monte. Plus loin : elle rapetisse.
    expect((regarder(ranger([maison(15, 8, 7)]), ici, 90).zone as Zone).droite).toBeLessThan(z.droite);
    expect((regarder(ranger([maison(15, 0, 12)]), ici, 90).zone as Zone).haut).toBeLessThan(z.haut);
    const loin = regarder(ranger([maison(35, 0, 7)]), ici, 90).zone as Zone;
    expect(loin.droite - loin.gauche).toBeLessThan(z.droite - z.gauche);
    expect(loin.bas - loin.haut).toBeLessThan(z.bas - z.haut);
    expect(regarder(ranger([]), ici, 90).zone).toBeNull();
  });
});

describe('ce que la lecture change', () => {
  it('réduit de moitié par la moyenne de quatre pixels', () => {
    const src: ImageRgba = { largeur: 4, hauteur: 2, donnees: Uint8ClampedArray.from([0, 0, 0, 255, 100, 100, 100, 255, 10, 20, 30, 255, 10, 20, 30, 255, 200, 200, 200, 255, 100, 100, 100, 255, 10, 20, 30, 255, 10, 20, 30, 255]) };
    expect(Array.from(reduireDeMoitie(src).donnees)).toEqual([100, 100, 100, 255, 10, 20, 30, 255]);
  });
  it('une façade cachée garde la moitié de sa note : elle passe après les vues dégagées', () => {
    expect(COEF_NOTE_CACHEE).toBe(0.5);
    expect([noteAvecLecture(85, true), noteAvecLecture(85, false), noteAvecLecture(0, true)]).toEqual([43, 85, 0]);
  });
});

const php = spawnSync('php', ['-r', 'exit(function_exists("imagecreatefromjpeg") ? 0 : 1);']).status === 0;
const dossier = path.resolve(__dirname, 'fixtures/vue-degagee');

describe.skipIf(!php)('les 76 témoins du Vésinet (photos geovelo, Panoramax, etalab-2.0)', () => {
  const temoins = JSON.parse(readFileSync(path.join(dossier, 'temoins.json'), 'utf8')) as { fichier: string; etat: 'degagee' | 'cachee'; zone: Zone }[];
  /** Les pixels d'un JPEG, par GD (le banc n'a pas de decodeur JPEG hors du navigateur). */
  const pixels = (f: string): ImageRgba => {
    const b = spawnSync('php', ['-r', `$i=imagecreatefromjpeg('${path.join(dossier, f)}');$w=imagesx($i);$h=imagesy($i);echo pack('NN',$w,$h);for($y=0;$y<$h;$y++)for($x=0;$x<$w;$x++){$c=imagecolorat($i,$x,$y);echo chr(($c>>16)&255).chr(($c>>8)&255).chr($c&255).chr(255);}`]).stdout;
    return { largeur: b.readUInt32BE(0), hauteur: b.readUInt32BE(4), donnees: new Uint8ClampedArray(b.buffer, b.byteOffset + 8, b.length - 8) };
  };
  const lus = temoins.map((t) => ({ ...t, lecture: lireLaZone(pixels(t.fichier), t.zone) }));
  const numeros = (l: typeof lus) => l.map((t) => t.fichier.slice(0, 2)).join(' ');

  it('32 dégagées, 44 cachées, à la taille que le banc lit', () => {
    expect([lus.filter((t) => t.etat === 'degagee').length, lus.filter((t) => t.etat === 'cachee').length]).toEqual([32, 44]);
    expect(pixels(temoins[0]?.fichier ?? '')).toMatchObject({ largeur: LARGEUR_LUE, hauteur: HAUTEUR_LUE });
  });
  it('douze vues nettes : six dégagées dites dégagées, six cachées dites cachées', () => {
    const dit = (n: string) => lus.find((t) => t.fichier.startsWith(n))?.lecture.cachee;
    expect(['03', '10', '15', '23', '45', '51'].map(dit)).toEqual([false, false, false, false, false, false]);
    expect(['02', '09', '17', '21', '34', '62'].map(dit)).toEqual([true, true, true, true, true, true]);
  });
  it('le taux d’erreur, tenu : 65 justes sur 76 (86 %), là où « toujours cachée » en ferait 44 (58 %)', () => {
    const faussesCachees = lus.filter((t) => t.etat === 'degagee' && t.lecture.cachee), faussesDegagees = lus.filter((t) => t.etat === 'cachee' && !t.lecture.cachee);
    // Quatre facades degagees dites cachees (12,5 % des 32) ; sept cachees dites degagees (16 % des 44 : murs, portails, vues lointaines).
    expect(numeros(faussesCachees)).toBe('13 14 76 88');
    expect(numeros(faussesDegagees)).toBe('06 35 43 50 52 69 83');
    expect(lus.length - faussesCachees.length - faussesDegagees.length).toBe(65);
  });
  it('le seuil n’est pas un coup de chance : choisi sans le témoin jugé, il en dit autant de justes', () => {
    const justes = (s: number, l: typeof lus) => l.filter((t) => (t.lecture.score >= s) === (t.etat === 'degagee')).length;
    let ok = 0;
    for (const t of lus) {
      const reste = lus.filter((u) => u !== t);
      let mieux = { n: 0, seuil: 0 };
      for (const u of reste) { const n = justes(u.lecture.score, reste); if (n > mieux.n) mieux = { n, seuil: u.lecture.score }; }
      if ((t.lecture.score >= mieux.seuil) === (t.etat === 'degagee')) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(64);
  });
});
