import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reconstruireCorps, repere } from '../../../../../src/facade/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../../../src/model/toitMesure.js';
import { ajusterToit } from '../../../../../src/facade/toitLidar.js';
import { echantillonsDeGrille } from '../../../../../src/geo/mnh.js';
import {
  corpsSousContrainte, corpsDeRemplacement, toitDeRemplacement, ajusteSousContrainte, ecartsAuFait, corpsConforme,
  formeDuCorps, azimutFaitage, azimutDe, formesAdmises, corpsSelonFait,
} from '../../../../../src/facade/regles/toits/faits.js';
import { lireFaitsToits, faitDuBatiment, FAITS_TOITS_LIVRES, type FaitToit } from '../../../../../src/regles/toits/faits.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';
import type { GrilleRelief } from '../../../../../src/model/relief.js';

// Un fait applique a un toit (MD/spec-regles-toits.md §5, §9.1) : en contrainte, il restreint les
// formes et laisse la mesure donner les hauteurs ; en remplacement, il donne tout.

interface Releve { contour: PtBrut[]; toitMesure: ToitMesure; grille?: GrilleRelief }
const releve = (nom: string): Releve => JSON.parse(readFileSync(join(__dirname, '../../../../fixtures/toits', nom + '.json'), 'utf8')) as Releve;
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

describe('un appentis adosse le long d une facade', () => {
  const sud = { appentis: [{ facade: { azimutDeg: 180 }, longueur: 'toute' }] };
  // Une maison de 10 x 8 m a 6 m d'egout (deux pans, faitage est-ouest a 8 m), un porche de 2 m sur
  // toute la facade sud, a 3 m contre le mur et 30 cm de pente par metre, et le sol autour : la grille du MNH
  // deborde du contour de 3 m, comme une grille relue plus large.
  const maison: PtBrut[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
  const grille = (): GrilleRelief => {
    const pas = 0.5, x0 = -3, y0 = 11, nx = 33, ny = 29;
    const z: (number | null)[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * pas, y = y0 - j * pas;
      const dedans = x > 0 && x < 10 && y > 0 && y < 8;
      const porche = x > 0 && x < 10 && y <= 0 && y > -2;
      z.push(dedans ? 8 - 0.5 * Math.abs(y - 4) : porche ? 3 + 0.3 * y : 0);
    }
    return { pas, x0, y0, nx, ny, z } as GrilleRelief;
  };
  const corpsMaison: CorpsToit = { pts: [{ x: 0, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 0 }, { x: 0, y: 0 }], posFaitage: 4, faitage: 8, egouts: [6, 6], pignons: [], ecart: 0 };

  it('se pose contre le cote de la facade designee, aux cotes lues sur la mesure', () => {
    const g = grille();
    const corps = corpsSousContrainte(fait(sud), [corpsMaison], g as unknown as ToitMesure, maison, g)!;
    expect(corps).toHaveLength(2);
    const a = corps[1]!;
    // Le faitage sur le mur (rive de tete), le pan qui descend vers le sud.
    expect(formeDuCorps(a)).toBe('appentis');
    expect(a.posFaitage).toBe(0);
    expect(a.pts.slice(0, 2).every((q) => Math.abs(q.y) < 1e-9)).toBe(true);
    // La profondeur, a une demi-cellule pres : la derniere cellule du porche (a 1,5 m) couvre jusqu'a 1,75 m.
    expect(Math.min(...a.pts.map((q) => q.y))).toBe(-1.75);
    expect(a.faitage).toBe(3);
    expect(a.egouts).toEqual([3, 2.5]);
    expect(ecartsAuFait(fait(sud), corps, maison)).toEqual([]);
    // Le corps de la maison ne bouge pas.
    expect(corps[0]).toBe(corpsMaison);
  });

  it('prend les cotes du fait, et ne fabrique rien que ni le fait ni la mesure ne cotent', () => {
    const g = grille();
    const cote = { appentis: [{ facade: { azimutDeg: 180 }, longueur: 'toute', profondeurM: 2.5, hautM: 3.4 }] };
    const [, a] = corpsSousContrainte(fait(cote), [corpsMaison], g as unknown as ToitMesure, maison, g)!;
    expect(Math.min(...a!.pts.map((q) => q.y))).toBe(-2.5);
    expect(a!.faitage).toBe(3.4);
    // Sans grille : rien a lire.
    const sans = corpsSousContrainte(fait(sud), [corpsMaison], g as unknown as ToitMesure, maison, null)!;
    expect(sans).toEqual([corpsMaison]);
    expect(ecartsAuFait(fait(sud), sans, maison)).toEqual(['appentis vers 180 : non lu']);
    // Au nord, le sol : pas d'appentis.
    expect(corpsSousContrainte(fait({ appentis: [{ facade: { azimutDeg: 0 } }] }), [corpsMaison], g as unknown as ToitMesure, maison, g)).toEqual([corpsMaison]);
  });

  it('en remplacement, se pose avec toutes ses cotes, sans mesure', () => {
    const toutes = { forme: 'plat', appentis: [{ facade: { azimutDeg: 180 }, profondeurM: 2, egoutM: 2.5, hautM: 3.5 }] };
    const corps = corpsDeRemplacement(fait(toutes, 'remplacement', { egoutM: 6 }), maison)!;
    expect(corps).toHaveLength(2);
    expect(corps[1]).toMatchObject({ posFaitage: 0, faitage: 3.5, egouts: [3.5, 2.5] });
    expect(corpsDeRemplacement(fait({ forme: 'plat', ...sud }, 'remplacement', { egoutM: 6 }), maison)).toHaveLength(1);
  });

  it('ne touche pas a la forme simple : il ne dit rien de la forme', () => {
    const r = releve('vesinet-ae100');
    const ech = echantillonsDeGrille(r.grille!, r.contour);
    expect(ajusteSousContrainte(fait(sud), r.contour, ech, null)).toBe(null);
  });
});

describe('les faits livres', () => {
  it('AE 101 : l appentis de la facade sud et la bay window de la face est s ajoutent aux trois corps du calcul, ses deux pignons montent au faitage', () => {
    const r = releve('vesinet-ae101') as Releve & { cleabs: string; corps: CorpsToit[]; corpsAvecFaits: CorpsToit[] };
    const f = faitDuBatiment({ bdtopo: { cleabs: r.cleabs } }, FAITS_TOITS_LIVRES)!;
    expect(f).not.toBe(null);
    const corps = corpsSelonFait(f, lus(r), r.toitMesure, r.contour, r.grille ?? null)!;
    // Les autres corps du calcul ne bougent pas ; sur le corps principal, deux pignons de 3,7 m aux bouts
    // de la facade sud (la largeur du proprietaire), montant au point haut du faitage.
    expect(corps.slice(1, 3)).toEqual(r.corps.slice(1, 3));
    expect(corps[0]!.pts).toEqual(r.corps[0]!.pts);
    expect(corps[0]!.pignons.map((p) => [p.pan, p.debut, p.fin])).toEqual([[1, 0, 3.7], [1, 6.21, 9.91]]);
    expect(corps[0]!.pignons.every((p) => p.faitage === corps[0]!.faitage)).toBe(true);
    expect(corps).toEqual(r.corpsAvecFaits);
    const a = corps[3]!;
    // Contre le mur sud du corps principal, sur toute sa longueur, cotes lues sur le LiDAR : le toit s'arrete au nu des murs de
    // bout de la maison dessinee (three/toitCorps3d.ts, pas de rive pour un appentis adosse).
    expect(a.pts.slice(0, 2)).toEqual([r.corps[0]!.pts[2], r.corps[0]!.pts[3]]);
    expect(a).toMatchObject({ posFaitage: 0, faitage: 3.2, egouts: [3.2, 2.4] });
    expect(repere(a.pts).W).toBeCloseTo(1.25, 1);
    expect(ecartsAuFait(f, corps, r.contour)).toEqual([]);
    // Sans la cle BD TOPO, rien ne change.
    expect(corpsSelonFait(faitDuBatiment({ bdtopo: null }), lus(r), r.toitMesure, r.contour)).toEqual(r.corps);
  });

  it('AE 101, lecture LiDAR du 14 octobre au soir : le calcul seul perd le pignon est, le fait garde les deux', () => {
    const d = releve('vesinet-ae101-lidar-soir') as Releve & { cleabs: string; grille: GrilleRelief };
    const m = toitMesureDepuisGrille(d.grille, d.contour)!;
    const seul = reconstruireCorps(m, d.contour, { grille: d.grille })!;
    const principalSeul = plusGrand(seul);
    expect(principalSeul.pignons).toHaveLength(1);
    const f = faitDuBatiment({ bdtopo: { cleabs: d.cleabs } }, FAITS_TOITS_LIVRES)!;
    const corps = corpsSelonFait(f, seul, m, d.contour, d.grille)!;
    const principal = plusGrand(corps);
    const L = repere(principal.pts).L;
    const pg = [...principal.pignons].sort((a, b) => a.debut - b.debut);
    // Un pignon a chaque bout de la facade sud, sur le meme pan, montant au point haut du faitage.
    expect(pg).toHaveLength(2);
    expect(pg[0]!.debut).toBe(0);
    expect(pg[1]!.fin).toBeCloseTo(L, 1);
    // La largeur du proprietaire l'emporte sur la mesure : la meme qu'avec la lecture du matin.
    expect(pg.map((p) => Math.round((p.fin - p.debut) * 10) / 10)).toEqual([3.7, 3.7]);
    expect(pg.every((p) => p.pan === pg[0]!.pan && p.faitage === principal.faitage)).toBe(true);
    expect(ecartsAuFait(f, corps, d.contour)).toEqual([]);
  });

  it('pignons aux bouts : sans mesure ni largeur, le fait ne fabrique pas un pignon, et le dit', () => {
    const r = releve('vesinet-ae101');
    const corps = lus(r)!;
    const sansPignons = corps.map((c) => ({ ...c, pignons: [] }));
    const f = fait({ pignons: [{ facade: { azimutDeg: 180 }, position: 'bouts', haut: 'faitage' }] });
    // Une mesure plate a l'egout : rien ne depasse le pan, aucune largeur ne se lit.
    const plate = { ...r.toitMesure, z: r.toitMesure.z.map((v) => (v === null ? null : 0)) } as ToitMesure;
    const res = corpsSelonFait(f, sansPignons, plate, r.contour, null)!;
    expect(plusGrand(res).pignons).toHaveLength(0);
    expect(ecartsAuFait(f, res, r.contour)).toEqual(['pignons vers 180 : 0 sur 2']);
    // Avec une largeur dans le fait, ils se posent aux deux bouts.
    const large = fait({ pignons: [{ facade: { azimutDeg: 180 }, position: 'bouts', haut: 'faitage', largeurM: 2.5 }] });
    const avec = corpsSelonFait(large, sansPignons, plate, r.contour, null)!;
    expect(plusGrand(avec).pignons.map((p) => p.fin - p.debut)).toEqual([2.5, 2.5]);
  });
});

