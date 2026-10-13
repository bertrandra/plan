import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reconstruireCorps, repere } from '../../../src/facade/toitCorps.js';
import { ajusterToit } from '../../../src/facade/toitLidar.js';
import { echantillonsDeGrille } from '../../../src/geo/mnh.js';
import {
  corpsSousContrainte, corpsDeRemplacement, toitDeRemplacement, ajusteSousContrainte, ecartsAuFait, corpsConforme,
  formeDuCorps, azimutFaitage, azimutDe, formesAdmises, corpsSelonFait,
} from '../../../src/facade/faitsToits.js';
import { lireFaitsToits, faitDuBatiment, FAITS_TOITS_LIVRES, type FaitToit } from '../../../src/model/faitsToits.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../src/model/types.js';
import type { GrilleRelief } from '../../../src/model/relief.js';

// Un fait applique a un toit (MD/spec-regles-toits.md §5, §9.1) : en contrainte, il restreint les
// formes et laisse la mesure donner les hauteurs ; en remplacement, il donne tout.

interface Releve { contour: PtBrut[]; toitMesure: ToitMesure; grille?: GrilleRelief }
const releve = (nom: string): Releve => JSON.parse(readFileSync(join(__dirname, '../../fixtures/toits', nom + '.json'), 'utf8')) as Releve;
const fait = (observation: Record<string, unknown>, application = 'contrainte', dimensions?: Record<string, number>): FaitToit =>
  lireFaitsToits({ format: 'plan-faits-toits', faits: { BATIMENT0000000000000001: { observation, application, ...(dimensions ? { dimensions } : {}) } } }).BATIMENT0000000000000001!;
const lus = (r: Releve) => reconstruireCorps(r.toitMesure, r.contour, { grille: r.grille ?? null });
const plusGrand = (corps: readonly CorpsToit[]) => [...corps].sort((a, b) => repere(b.pts).L * repere(b.pts).W - repere(a.pts).L * repere(a.pts).W)[0]!;
/** L'ecart de deux directions, modulo 180. */
const ecartDeg = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

describe('le vocabulaire', () => {
  it('l azimut se compte depuis le nord, dans le sens horaire, modulo 180', () => {
    expect(azimutDe(0, 1)).toBe(0);
    expect(azimutDe(1, 0)).toBe(90);
    expect(azimutDe(0, -1)).toBe(0);
    expect(azimutDe(-1, -1)).toBe(45);
  });

  it('les bouts et le sens du faitage restreignent les formes', () => {
    expect([...formesAdmises({})].sort()).toEqual(['appentis', 'croupes', 'deux-pans', 'plat']);
    expect([...formesAdmises({ forme: ['quatre-pans'] })]).toEqual(['croupes']);
    expect([...formesAdmises({ bouts: ['pignon', 'pignon'] })]).toEqual(['deux-pans']);
    expect([...formesAdmises({ bouts: ['pignon', 'croupe'] })]).toEqual(['croupes']);
    expect(formesAdmises({ faitage: { par: 'long', sens: 'parallele' } }).has('plat')).toBe(false);
  });
});

describe('un fait en contrainte', () => {
  it('ne change rien a un toit qui dit deja ce que l on a vu : AE 101 en deux pans', () => {
    const r = releve('vesinet-ae101');
    const corps = lus(r);
    expect(corpsSousContrainte(fait({ forme: 'deux-pans' }), corps, r.toitMesure, r.contour, r.grille ?? null)).toEqual(corps);
  });

  it('AE 100 lu en quatre pans : observe en deux pans, son corps est relu en deux pans sur la mesure', () => {
    const r = releve('vesinet-ae100');
    const avant = lus(r)!;
    expect(formeDuCorps(avant[0]!)).toBe('croupes');
    const f = fait({ forme: 'deux-pans' });
    const apres = corpsSousContrainte(f, avant, r.toitMesure, r.contour, r.grille ?? null)!;
    expect(apres).toHaveLength(1);
    expect(formeDuCorps(apres[0]!)).toBe('deux-pans');
    // Les hauteurs viennent de la mesure : un egout plausible, un faitage au-dessus.
    expect(Math.min(...apres[0]!.egouts)).toBeGreaterThan(3);
    expect(apres[0]!.faitage).toBeGreaterThan(Math.max(...apres[0]!.egouts));
    expect(ecartsAuFait(f, apres, r.contour)).toEqual([]);
    // Un fait juste (des croupes) ne le touche pas.
    expect(corpsSousContrainte(fait({ forme: 'croupes', bouts: ['croupe', 'croupe'] }), avant, r.toitMesure, r.contour, r.grille ?? null)).toEqual(avant);
  });

  it('impose le sens du faitage : perpendiculaire au long cote, il tourne d un quart de tour', () => {
    const r = releve('vesinet-ae100');
    const avant = lus(r)!;
    const f = fait({ faitage: { par: 'long', sens: 'perpendiculaire' } });
    const apres = corpsSousContrainte(f, avant, r.toitMesure, r.contour, r.grille ?? null)!;
    expect(ecartDeg(azimutFaitage(apres[0]!), azimutFaitage(avant[0]!))).toBeGreaterThan(75);
    expect(formeDuCorps(apres[0]!)).not.toBe('plat');
    expect(corpsConforme(apres[0]!, f.observation, r.contour)).toBe(true);
    // Le meme sens, donne par l'azimut de la photo, a 15 degres pres.
    const parAzimut = fait({ faitage: { par: 'azimut', azimutDeg: (azimutFaitage(apres[0]!) + 10) % 180 } });
    expect(corpsSousContrainte(parAzimut, apres, r.toitMesure, r.contour, r.grille ?? null)).toEqual(apres);
  });

  it('ne fabrique pas une forme que la mesure ne lit pas, et le dit', () => {
    const r = releve('vesinet-ae100');
    const avant = lus(r)!;
    const f = fait({ forme: 'appentis' });
    // Un appentis sur un quatre-pans ne monte pas : c'est un plat, pas la forme observee.
    expect(corpsSousContrainte(f, avant, r.toitMesure, r.contour, r.grille ?? null)).toEqual(avant);
    expect(ecartsAuFait(f, avant, r.contour)).toEqual(['forme : croupes']);
  });

  it('ne touche que le corps principal : l annexe et l aile d AE 101 restent', () => {
    const r = releve('vesinet-ae101');
    const avant = lus(r)!;
    const apres = corpsSousContrainte(fait({ forme: 'croupes' }), avant, r.toitMesure, r.contour, r.grille ?? null)!;
    expect(apres).toHaveLength(avant.length);
    expect(formeDuCorps(plusGrand(apres))).toBe('croupes');
    expect(apres.filter((c) => avant.some((a) => JSON.stringify(a) === JSON.stringify(c)))).toHaveLength(avant.length - 1);
  });

  it('tient un nombre de corps au plus', () => {
    const r = releve('vesinet-ae103');
    const avant = lus(r)!;
    expect(avant.length).toBeGreaterThan(1);
    const f = fait({ corps: { max: 1 } });
    const apres = corpsSousContrainte(f, avant, r.toitMesure, r.contour, r.grille ?? null)!;
    expect(apres).toHaveLength(1);
    expect(ecartsAuFait(f, apres, r.contour)).toEqual([]);
    // Un nombre au moins ne se fabrique pas : il est dit.
    expect(ecartsAuFait(fait({ corps: { min: 4 } }), avant, r.contour)).toEqual(['corps : ' + avant.length]);
  });

  it('les fourchettes de hauteur trient les candidats', () => {
    const r = releve('vesinet-ae100');
    const f = fait({ forme: 'deux-pans', egout: { min: 4, max: 6 } });
    const apres = corpsSousContrainte(f, lus(r), r.toitMesure, r.contour, r.grille ?? null)!;
    const e = Math.min(...apres[0]!.egouts);
    expect(e).toBeGreaterThanOrEqual(4);
    expect(e).toBeLessThanOrEqual(6);
  });

  it('sans fait, ou avec un remplacement, corpsSelonFait rend les corps lus', () => {
    const r = releve('vesinet-ae100');
    const corps = lus(r);
    expect(corpsSelonFait(null, corps, r.toitMesure, r.contour)).toBe(corps);
    expect(corpsSelonFait(fait({ forme: 'plat' }, 'remplacement', { egoutM: 3 }), corps, r.toitMesure, r.contour)).toBe(corps);
  });

  it('restreint aussi la forme simple : celle qu admet l observation, sous l ecart admis', () => {
    const r = releve('vesinet-ae100');
    const ech = echantillonsDeGrille(r.grille!, r.contour);
    const brut = ajusterToit(r.contour, ech);
    expect(brut).not.toBe(null);
    const f = fait({ forme: 'deux-pans' });
    const sous = ajusteSousContrainte(f, r.contour, ech, brut);
    expect(sous?.toit.forme).toBe('deux-pans');
    // Une forme deja admise reste telle quelle.
    expect(ajusteSousContrainte(fait({ forme: [brut!.toit.forme] }), r.contour, ech, brut)).toBe(brut);
  });
});

describe('un fait en remplacement', () => {
  const contour: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];

  it('donne un corps a deux pans aux hauteurs du fait, le faitage sur le long cote', () => {
    const [c] = corpsDeRemplacement(fait({ forme: 'deux-pans' }, 'remplacement', { egoutM: 5, faitageM: 9 }), contour)!;
    expect(c).toMatchObject({ posFaitage: 4, faitage: 9, egouts: [5, 5], pignons: [] });
    expect(azimutFaitage(c!)).toBe(90);
    const t = toitDeRemplacement(fait({ forme: 'deux-pans' }, 'remplacement', { egoutM: 5, faitageM: 9 }), contour)!;
    // L'angle d'un Toit se compte depuis l'est : un faitage est-ouest vaut 0.
    expect(t).toEqual({ toit: { forme: 'deux-pans', hauteur: 4, angleFaitage: 0, source: 'lidar' }, egout: 5 });
  });

  it('suit le sens observe, les bouts, et le cote haut d un appentis', () => {
    const [nordSud] = corpsDeRemplacement(fait({ forme: 'deux-pans', faitage: { par: 'azimut', azimutDeg: 0 } }, 'remplacement', { egoutM: 5, faitageM: 8 }), contour)!;
    expect(azimutFaitage(nordSud!)).toBe(0);
    const [demi] = corpsDeRemplacement(fait({ forme: 'croupes', bouts: ['croupe', 'pignon'] }, 'remplacement', { egoutM: 5, faitageM: 8 }), contour)!;
    expect(demi!.croupes).toEqual([4, 0]);
    const [plat] = corpsDeRemplacement(fait({ forme: 'plat' }, 'remplacement', { egoutM: 3.2 }), contour)!;
    expect(plat).toMatchObject({ faitage: 3.2, egouts: [3.2, 3.2] });
    for (const haut of [0, 180]) {
      const [a] = corpsDeRemplacement(fait({ forme: 'appentis' }, 'remplacement', { egoutM: 3, faitageM: 4.5, hautVersDeg: haut }), contour)!;
      const r = repere(a!.pts);
      // Le mur haut est celui du cote de l'azimut donne.
      const t = a!.posFaitage > 0 ? r.W : 0;
      const yHaut = a!.pts[0]!.y + r.v.y * t;
      expect(yHaut).toBe(haut === 0 ? 8 : 0);
      expect(a!.faitage).toBe(4.5);
    }
  });
});

describe('les faits livres', () => {
  it('AE 101 n a pas de fait : sa lecture reste celle du calcul', () => {
    const r = releve('vesinet-ae101');
    expect(faitDuBatiment({ bdtopo: null }, FAITS_TOITS_LIVRES)).toBe(null);
    const corps = lus(r);
    expect(corpsSelonFait(faitDuBatiment({ bdtopo: null }), corps, r.toitMesure, r.contour)).toBe(corps);
  });
});
