import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { egoutControle, expliquer, expliqueLaPhoto, seuilsDuCalage } from '../../../../src/facade/releve/calageAncres.js';
import { murSurLAssemblage, vuesDeFace } from '../../../../src/facade/releve/coinsAuto.js';
import { mosaiqueDesVues, rectanglesSurLesAretes, type Rect } from '../../../../src/facade/vision/mosaiqueFuites.js';
import { detecterSegments } from '../../../../src/facade/vision/segments.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { gabaritVrai, photographier, type PriseCamera } from '../../../../src/facade/banc/synthese.js';
import { lireEtalon } from '../../../banc/facades/reel.js';
import { gabaritSurLaVue } from '../../../../src/facade/gabaritMur.js';
import { sceneAe101 } from '../../../banc/facades/ae101.js';

// Le calage du mur par ses ancres (facade/releve/calageAncres.ts, MD/spec-facade-calage-audit.md §4 E5, §5, lot F1) : une pose se juge
// sans le toit (les angles, l'egout, le sol), l'arbitre garde celle des aretes si elle explique la photo, sinon une autre qui
// l'explique, sinon la pose du plan seul, supposee ; et les drapeaux ne disent « trouve » que d'une pose qui passe le test.

const seuils = seuilsDuCalage();
const assemblage = (prefixe: string) => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  const prises = [s.synthese.prise, ...(s.synthese.vues ?? [])] as PriseCamera[];
  const vues = vuesDeFace(prises.map((p) => photographier(s, 100, p)?.image).filter((i): i is NonNullable<typeof i> => !!i));
  const m = mosaiqueDesVues(vues.filter((v): v is NonNullable<typeof v> => !!v));
  if (!m) throw new Error('pas d assemblage');
  return { m, rapport: s.verite.hauteur / s.verite.largeur };
};

describe('le score d explication d une pose du mur, sans le toit', () => {
  // Un enduit sous des tuiles, un pignon decentre, la rampe d'un appentis : la pose trouvee explique la photo ; la moitie du mur, le mur
  // decale de 15 % ou rentre de 15 % ne l'expliquent pas (sur tout le banc : 44 poses sur 44 expliquees, 88 fausses sur 88 refusees).
  it.each(['02-', '22-', '23-'])('dit juste la pose trouvee de la scene %s, et fausses les poses de travers', (prefixe) => {
    const { m, rapport } = assemblage(prefixe);
    const r = murSurLAssemblage(m, rapport);
    expect(r.calage.retenue).toBe('aretes');
    expect(expliqueLaPhoto(r.calage.explication, seuils)).toBe(true);
    const segs = detecterSegments(m.image);
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    const fausses: Rect[] = [
      { x0: r.x0, x1: r.x0 + w / 2, y0: r.y1 - h / 2, y1: r.y1 },
      { x0: r.x0 + w / 2, x1: r.x1, y0: r.y1 - h / 2, y1: r.y1 },
      { x0: r.x0 + 0.15 * w, x1: r.x1 + 0.15 * w, y0: r.y0, y1: r.y1 },
      { x0: r.x0 + 0.15 * w, x1: r.x1 - 0.15 * w, y0: r.y0 + 0.15 * h, y1: r.y1 - 0.15 * h },
    ];
    for (const q of fausses) expect(expliqueLaPhoto(expliquer(m, segs, q, rapport), seuils)).toBe(false);
  }, 60_000);

  // L'E5 juge la pose retenue sur la silhouette du gabarit qu'elle pose (decision du proprietaire, 2 novembre 2026) : l'egout tout le long,
  // et les angles aux bouts de la silhouette. Sur un pignon, un egout 48 cm trop bas passait le test (scene 24 : 0,89). Un bord a plus de
  // 3 % de la largeur du mur est faux (`calageEcartMaxPart`) : a 5 et 10 %, l'egout est refuse. Depuis le 4 novembre 2026, le gabarit
  // se pose sur le sol a l'echelle de la largeur : l'egout deplace s'ecarte aussi du sien, au-dela du controle de l'E5.
  it.each(['02-', '22-', '23-', '24-'])('avec le gabarit, refuse un egout deplace de 5 ou 10 %% de la largeur (scene %s)', (prefixe) => {
    const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe))!;
    const { m, rapport } = assemblage(prefixe);
    const r = murSurLAssemblage(m, rapport);
    const segs = detecterSegments(m.image), g = gabaritVrai(s);
    const juste = expliquer(m, segs, r, rapport, m, g);
    expect(juste.silhouette).toBe(true);
    expect(expliqueLaPhoto(juste, seuils)).toBe(true);
    const w = r.x1 - r.x0;
    for (const d of [-0.1, -0.05, 0.05, 0.1]) {
      const e = expliquer(m, segs, { ...r, y0: r.y0 + d * w }, rapport, m, g);
      expect(e.egout).toBeLessThan(seuils.egout);
      expect(Math.abs(e.ecartEgout ?? 0)).toBeGreaterThan(seuils.ecartEgout ?? 1);
      expect(egoutControle(e, seuils)).toBe(false);
      expect(expliqueLaPhoto(e, seuils)).toBe(false);
    }
  }, 60_000);

  it('un pignon voisin qui prolonge la facade : l angle est au bout de la silhouette, pas au bout du mur', () => {
    // La scene 24 vue comme un mur de 5 m que le pignon d'un corps voisin prolonge jusqu'a 8 m : a x = 5 m, la matiere continue.
    const { m } = assemblage('24-');
    const r8 = murSurLAssemblage(m, 5.2 / 8);
    const w8 = r8.x1 - r8.x0, r5 = { ...r8, x1: r8.x0 + (5 / 8) * w8 };
    const segs = detecterSegments(m.image), H = 5.2;
    const g = [{ u: 0, v: 1 }, { u: 0.8, v: 1 + 3.6 / H }, { u: 1.6, v: 1 }];
    const sans = expliquer(m, segs, r5, H / 5);
    expect(sans.angles[1]).toBeLessThan(seuils.angle);
    const avec = expliquer(m, segs, r5, H / 5, m, g);
    expect(expliqueLaPhoto(avec, seuils)).toBe(true);
    // Le mur entier de 8 m pris pour le mur de 5 m, sous le meme gabarit : son bout de silhouette tombe dans le vide.
    expect(expliqueLaPhoto(expliquer(m, segs, r8, H / 5, m, g), seuils)).toBe(false);
  }, 60_000);

  it('ne lit rien sans matiere de mur : score nul', () => {
    const image = { largeur: 40, hauteur: 30, donnees: new Uint8ClampedArray(40 * 30 * 4) };
    const e = expliquer({ image, vu: new Uint8Array(40 * 30) }, [], { x0: 5, x1: 35, y0: 5, y1: 25 }, 0.5);
    expect(e.score).toBe(0);
  });
});

describe('le defaut d AE 101, facade sud, refait en synthese a partir de son etalon', () => {
  const etalon = lireEtalon(JSON.parse(readFileSync('tests/fixtures/facades-reel/etalons/ae101-sud.json', 'utf8')));
  const rapport = etalon.hauteurM / etalon.largeurM;
  const ecarts = (r: Rect, v: Rect) => { const w = v.x1 - v.x0; return [r.x0 - v.x0, r.x1 - v.x1, r.y0 - v.y0, r.y1 - v.y1].map((d) => Math.abs(d) / w); };

  it('les aretes seules retiennent le bloc du pignon de droite, comme sur la vraie mosaique (x de 451 a 752)', () => {
    for (const angle of ['buisson', 'arbre'] as const) {
      const s = sceneAe101(etalon, angle);
      const [premier] = rectanglesSurLesAretes(s, detecterSegments(s.image), rapport, 1);
      expect(Math.abs((premier?.x0 ?? 0) - etalon.constat.murCherche.x0)).toBeLessThan(0.01 * (s.vrai.x1 - s.vrai.x0));
      expect(Math.abs((premier?.x1 ?? 0) - etalon.constat.murCherche.x1)).toBeLessThan(0.01 * (s.vrai.x1 - s.vrai.x0));
    }
  }, 60_000);

  it('l ecarte, faute d expliquer la photo, et retient le mur vrai : bouts, egout et sol a 3 % de la largeur', () => {
    const s = sceneAe101(etalon, 'buisson');
    const r = murSurLAssemblage(s, rapport);
    expect(r.calage.retenue).toBe('mieux-expliquee');
    expect(r.calage.aretes?.score).toBeLessThan(seuils.score);
    expect(Math.max(...ecarts(r, s.vrai))).toBeLessThan(0.03);
    expect(r.egout && r.cotes).toBe(true);
  }, 60_000);

  // Le constat du proprietaire (4 novembre 2026, « le positionnement du gabarit ne fonctionne pas ») : l'egout trouve sur la gouttiere de
  // l'appentis, en avant du mur, est plus haut que celui du plan ; tendu entre lui et le sol, le gabarit montait les deux pignons trois
  // fois plus (3,1 fois l'egout). Pose sur le sol a l'echelle de la largeur, il tombe sur eux, et l'ecart d'egout le dit.
  it('un egout trouve trop haut ne monte plus les pignons : le gabarit se pose par le sol et la largeur, l ecart d egout le dit', () => {
    const s = sceneAe101(etalon, 'buisson');
    const w = s.vrai.x1 - s.vrai.x0, h = s.vrai.y1 - s.vrai.y0;
    // L'egout trouve 9 % de la largeur trop haut (80 cm sur ses 8,96 m, l'ecart mesure sur la photo du constat).
    const haut = { ...s.vrai, y0: s.vrai.y0 - 0.09 * w };
    const pointe = (q: { x: number; y: number }[]) => Math.min(...q.map((p) => p.y));
    const vraie = s.vrai.y1 - Math.max(...etalon.gabarit.map((p) => p.v)) * h;
    expect(Math.abs(pointe(gabaritSurLaVue(etalon.gabarit, haut, rapport)) - vraie)).toBeLessThan(0.005 * w);
    // Tendu entre l'egout et le sol trouves, il les montait de 3,15 fois l'erreur d'egout (plus de 25 % de la largeur).
    expect(vraie - pointe(gabaritSurLaVue(etalon.gabarit, haut))).toBeGreaterThan(0.25 * w);
    const e = expliquer(s, detecterSegments(s.image), haut, rapport, s, etalon.gabarit);
    expect(e.ecartEgout).toBeCloseTo(0.09, 2);
    expect(egoutControle(e, seuils)).toBe(false);
    expect(egoutControle(expliquer(s, detecterSegments(s.image), s.vrai, rapport, s, etalon.gabarit), seuils)).toBe(true);
  }, 60_000);

  it('sans angle gauche lisible (un arbre devant), aucune pose n explique la photo : celle du plan seul, et aucun drapeau « trouve »', () => {
    const s = sceneAe101(etalon, 'arbre');
    const r = murSurLAssemblage(s, rapport);
    expect(r.calage.retenue).toBe('plan-seul');
    expect([r.egout, r.pied, r.cotes]).toEqual([false, false, false]);
    expect((r.y1 - r.y0) / (r.x1 - r.x0)).toBeCloseTo(rapport, 6);
  }, 60_000);
});

