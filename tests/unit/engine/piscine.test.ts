import { describe, it, expect } from 'vitest';
import {
  calculerPiscine, chiffrerPiscine, contourPiscine, distancesAuxLimites, elargir, noteDeCalcul, noteEnTexte, piscineDe, regimeAutorisation
} from '../../../src/engine/piscine.js';
import type { ObjetPlan, Piscine } from '../../../src/model/types.js';

/** Un bassin rectangulaire de L x l metres, coin bas gauche a l'origine, le petit bain sur le cote x = 0. */
function piscine(L: number, l: number, reglages: Piscine = {}): ObjetPlan {
  return {
    key: 'p', name: 'Piscine', type: 'polygon', fonction: 'piscine',
    pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: l }, { x: 0, y: l }],
    piscine: { cotePetitBain: 3, ...reglages }
  };
}
const ronde = (r: number, reglages: Piscine = {}): ObjetPlan => ({ key: 'c', name: 'Ronde', type: 'circle', fonction: 'piscine', center: { x: 0, y: 0 }, r, piscine: reglages });
const parcelle: ObjetPlan = { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: -5, y: -3 }, { x: 20, y: -3 }, { x: 20, y: 15 }, { x: -5, y: 15 }], segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'] };

describe('reglages', () => {
  it('comble les manques sans rien ecrire dans l\'objet', () => {
    const o = piscine(8, 4);
    const r = piscineDe(o);
    expect(r).toMatchObject({ implantation: 'enterree', structure: 'coque', revetement: 'gelcoat', fond: 'plat', profondeurPetitBain: 1.2, margelle: true, plage: 'aucune', tempsRecyclage: 4 });
    expect(r.hauteurHorsSol).toBe(0);
    expect(o.piscine).toEqual({ cotePetitBain: 3 });
  });

  it('prend le plus court cote pour petit bain, un kit et un coffre hors-sol, et un fond plat sur un rond', () => {
    const sansCote = piscine(8, 4); delete sansCote.piscine!.cotePetitBain;
    expect(piscineDe(sansCote).cotePetitBain).toBe(1);
    const hs = piscineDe(piscine(6, 3, { implantation: 'hors-sol' }));
    expect(hs).toMatchObject({ structure: 'kit', revetement: 'liner', local: 'coffre', margelle: false });
    expect(hs.hauteurHorsSol).toBeCloseTo(1.32);
    expect(piscineDe(ronde(2, { fond: 'pente' })).fond).toBe('plat');
    // Un revetement qui ne va pas avec la structure retombe sur le premier admis.
    expect(piscineDe(piscine(8, 4, { structure: 'maconnerie', revetement: 'gelcoat' })).revetement).toBe('liner');
  });
});

describe('geometrie et volume', () => {
  it('refuse ce qui n\'est pas un bassin', () => {
    const o = piscine(8, 4);
    if (o.type === 'polygon') o.pts = o.pts.slice(0, 2);
    expect(calculerPiscine(o)).toBeNull();
    expect(contourPiscine(ronde(0.01))).toEqual([]);
  });

  it('fond plat : surface fois profondeur', () => {
    const c = calculerPiscine(piscine(8, 4))!;
    expect(c.surface).toBeCloseTo(32);
    expect(c.perimetre).toBeCloseTo(24);
    expect(c.volume).toBeCloseTo(38.4);
    expect(c.hauteurParoi).toBeCloseTo(1.3);
    expect(c.profondeurEnterree).toBeCloseTo(1.3);
  });

  it('pente reguliere : la profondeur moyenne sur un rectangle', () => {
    const c = calculerPiscine(piscine(8, 4, { fond: 'pente', profondeurPetitBain: 1.2, profondeurGrandBain: 1.8 }))!;
    expect(c.volume).toBeCloseTo(32 * 1.5, 1);
    expect(c.profil.map(p => p.z)).toEqual([1.2, 1.8]);
    expect(c.axe.L).toBeCloseTo(8);
  });

  it('fosse : plat puis descente puis fond', () => {
    const c = calculerPiscine(piscine(10, 4, { fond: 'fosse', profondeurPetitBain: 1.2, profondeurGrandBain: 2.2, partFosse: 0.4 }))!;
    // 6 m a 1,20, 2 m de descente (moyenne 1,70), 2 m a 2,20, sur 4 m de large.
    expect(c.volume).toBeCloseTo(4 * (6 * 1.2 + 2 * 1.7 + 2 * 2.2), 1);
    expect(c.profil.map(p => p.s)).toEqual([0, 6, 8, 10]);
  });

  it('rond : la surface exacte du cercle', () => {
    const c = calculerPiscine(ronde(2))!;
    expect(c.surface).toBeCloseTo(Math.PI * 4);
    expect(c.volume).toBeCloseTo(Math.PI * 4 * 1.2);
    expect(c.contour).toHaveLength(48);
  });

  it('elargit un contour vers l\'exterieur quel que soit le sens de parcours', () => {
    const horaire = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 0 }];
    [horaire, [...horaire].reverse()].forEach(pts => {
      const e = elargir(pts, 0.5);
      expect(Math.min(...e.map(p => p.x))).toBeCloseTo(-0.5);
      expect(Math.max(...e.map(p => p.y))).toBeCloseTo(4.5);
    });
  });
});

describe('implantation et terrassement', () => {
  it('enterree : la fouille deborde des parois et descend sous le fond', () => {
    const c = calculerPiscine(piscine(8, 4, { structure: 'coque' }))!;
    // Coque : parois 1 cm, surlargeur 50 cm ; 9,02 x 5,02 sur 1,30 + 0,20.
    expect(c.fouille.profondeur).toBeCloseTo(1.5);
    expect(c.fouille.volume).toBeCloseTo(9.02 * 5.02 * 1.5, 1);
    expect(c.fouille.remblai).toBeGreaterThan(0);
    // Une coque garde tout son deblai a evacuer : le remblai est du gravier achete.
    expect(c.fouille.evacuation).toBeCloseTo(c.fouille.volume * 1.3, 1);
  });

  it('hors-sol : rien a creuser hormis la dalle du kit, et les parois hors du sol', () => {
    const c = calculerPiscine(piscine(6, 3, { implantation: 'hors-sol' }))!;
    expect(c.profondeurEnterree).toBe(0);
    expect(c.hauteurHorsSol).toBeCloseTo(1.3);
    expect(c.fouille.profondeur).toBeCloseTo(0.15);
    expect(c.margellesMl).toBe(0);
  });

  it('semi-enterree : la partie enterree est ce qui depasse de la hauteur hors-sol', () => {
    const c = calculerPiscine(piscine(8, 4, { implantation: 'semi-enterree', hauteurHorsSol: 0.5, structure: 'maconnerie' }))!;
    expect(c.profondeurEnterree).toBeCloseTo(0.8);
    expect(c.fouille.profondeur).toBeCloseTo(0.8 + 0.25);
  });
});

describe('abords', () => {
  it('margelles au milieu de leur largeur, plage en anneau', () => {
    const c = calculerPiscine(piscine(8, 4, { structure: 'maconnerie', plage: 'dallage', largeurPlage: 2 }))!;
    // Parois 27 cm, margelle 33 cm : l'axe des margelles est a 0,27 + 0,165 des bords de l'eau.
    expect(c.margellesMl).toBeCloseTo(24 + 8 * (0.27 + 0.165));
    const ext = (0.27 + 0.33 + 2);
    expect(c.surfacePlage).toBeCloseTo((8 + 2 * ext) * (4 + 2 * ext) - (8 + 2 * 0.6) * (4 + 2 * 0.6));
    expect(c.plageBois).toBeNull();
  });

  it('plage en bois au ras du sol : lambourdes sur plots a 50 cm, portee de 70 cm au plus', () => {
    const c = calculerPiscine(piscine(8, 4, { plage: 'terrasse-bois', largeurPlage: 1.5 }))!;
    const pb = c.plageBois!;
    expect(pb.mode).toBe('plots');
    expect(pb.entraxeLambourdes).toBeCloseTo(0.5);
    expect(pb.portee).toBeLessThanOrEqual(0.7);
    expect(pb.appuis).toBeGreaterThan(0);
    expect(pb.poteaux).toBe(0);
    // La plage affleure les margelles (4 cm) : l'empilement de 13 cm demande un decaissement.
    expect(pb.dessus).toBeCloseTo(0.04);
    expect(pb.decaissementM3).toBeGreaterThan(0);
  });

  it('plage en bois en hauteur : solives sur poutres et poteaux, un anneau de plus au-dela de la portee', () => {
    const c = calculerPiscine(piscine(8, 4, { implantation: 'hors-sol', plage: 'terrasse-bois', largeurPlage: 3 }))!;
    const pb = c.plageBois!;
    expect(pb.mode).toBe('poteaux');
    expect(pb.portee).toBeGreaterThan(2);
    expect(pb.anneaux).toBe(3);
    expect(pb.poteaux).toBeGreaterThan(10);
    expect(pb.hauteurPoteau).toBeGreaterThan(0.5);
    expect(pb.massifsM3).toBeCloseTo(pb.poteaux * 0.4 * 0.4 * 0.5);
    expect(c.avertissements.join(' ')).toMatch(/garde-corps/);
  });
});

describe('hydraulique et equipements', () => {
  it('debit, filtre, skimmers et refoulements suivent le volume et la surface', () => {
    const c = calculerPiscine(piscine(8, 4))!;
    const h = c.hydraulique;
    expect(h.debit).toBeCloseTo(38.4 / 4);
    // 9,6 m³/h a 50 m/h : 0,192 m² -> Ø 494 mm -> 500 du commerce.
    expect(h.diametreFiltre).toBe(500);
    expect(h.puissancePompeCv).toBe(0.75);
    expect(h.skimmers).toBe(2);
    expect(h.refoulements).toBe(3);
    expect(h.diametreTuyau).toBe(50);
    expect(c.equipements.projecteurs).toBe(2);
  });

  it('pompe a chaleur : un kilowatt pour six metres cubes, au demi-kilowatt', () => {
    const c = calculerPiscine(piscine(8, 4, { chauffage: 'pac' }))!;
    expect(c.equipements.puissancePacKw).toBe(6.5);
    expect(calculerPiscine(piscine(8, 4, { traitement: 'sel' }))!.equipements.electrolyseur).toBe(true);
  });
});

describe('reglementation', () => {
  it('regime d\'autorisation selon la surface, l\'abri et le secteur', () => {
    expect(regimeAutorisation(9, 'alarme', false)).toBe('aucune');
    expect(regimeAutorisation(9, 'alarme', true)).toBe('declaration');
    expect(regimeAutorisation(9, 'abri', false)).toBe('declaration');
    expect(regimeAutorisation(32, 'alarme', false)).toBe('declaration');
    expect(regimeAutorisation(120, 'alarme', false)).toBe('permis');
  });

  it('distances aux limites de la parcelle, et taxe d\'amenagement', () => {
    const c = calculerPiscine(piscine(8, 4), [parcelle])!;
    const d = Object.fromEntries(c.distances.map(x => [x.nom, x.distance]));
    expect(d.Sud).toBeCloseTo(3);
    expect(d.Ouest).toBeCloseTo(5);
    expect(d.Est).toBeCloseTo(12);
    expect(d.Nord).toBeCloseTo(11);
    expect(c.taxeAmenagementBase).toBeCloseTo(32 * 250);
    expect(c.regime).toBe('declaration');
    expect(c.avertissements.some(a => /limite/.test(a))).toBe(false);
    expect(distancesAuxLimites(c.contour, undefined)).toEqual([]);
  });

  it('previent d\'une limite a moins de 3 m et d\'une terrasse percee', () => {
    const proche: ObjetPlan = { ...parcelle, pts: [{ x: -1, y: -1 }, { x: 20, y: -1 }, { x: 20, y: 15 }, { x: -1, y: 15 }] };
    const terrasse: ObjetPlan = { key: 't', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', pts: [{ x: -2, y: -2 }, { x: 12, y: -2 }, { x: 12, y: 8 }, { x: -2, y: 8 }] };
    const c = calculerPiscine(piscine(8, 4), [proche, terrasse])!;
    expect(c.avertissements.join(' ')).toMatch(/1,00 m de la limite/);
    expect(c.terrassesPercees).toEqual(['Terrasse']);
  });
});

describe('chiffrage', () => {
  it('une ligne par poste, dans l\'ordre du chantier, avec une fourchette', () => {
    const c = calculerPiscine(piscine(8, 4, { structure: 'maconnerie', plage: 'terrasse-bois' }))!;
    const ch = chiffrerPiscine(c);
    const postes = ch.lignes.map(l => l.poste);
    expect(postes.slice(0, 4)).toEqual(['terrassement', 'radier', 'murs', 'liner']);
    expect(postes).toEqual(expect.arrayContaining(['margelles', 'plageLames', 'plageOssature', 'plageAppuis', 'filtration', 'piecesSceller', 'canalisations', 'local', 'electricite', 'projecteurs', 'alarme', 'miseEnEau']));
    expect(postes).not.toContain('coque');
    expect(ch.bas).toBeGreaterThan(10000);
    expect(ch.haut).toBeGreaterThan(ch.bas);
    expect(ch.reel).toBeNull();
    const murs = ch.lignes.find(l => l.poste === 'murs')!;
    expect(murs.qte).toBeCloseTo(24 * 1.3);
  });

  it('une coque a sa coque, son grutage et son gravier ; un kit sa dalle', () => {
    const coque = chiffrerPiscine(calculerPiscine(piscine(8, 4))!).lignes.map(l => l.poste);
    expect(coque).toEqual(expect.arrayContaining(['coque', 'grutage', 'gravierDrainant', 'ceinture']));
    expect(coque).not.toContain('radier');
    const kit = chiffrerPiscine(calculerPiscine(piscine(6, 3, { implantation: 'hors-sol' }))!).lignes.map(l => l.poste);
    expect(kit).toEqual(expect.arrayContaining(['dalle', 'kit', 'liner']));
    expect(kit).not.toContain('margelles');
  });

  it('prend le prix saisi par poste comme prix reel', () => {
    const c = calculerPiscine(piscine(8, 4, { prix: { margelles: 100 } }))!;
    const ch = chiffrerPiscine(c);
    const marg = ch.lignes.find(l => l.poste === 'margelles')!;
    expect(marg.prixReel).toBeCloseTo(100 * marg.qte, 1);
    expect(ch.reel).toBeCloseTo(marg.prixReel!);
  });
});

describe('note de calcul', () => {
  it('a ses sept sections, et une huitieme pour les points de vigilance', () => {
    const sans = noteDeCalcul(calculerPiscine(piscine(8, 4), [parcelle])!);
    expect(sans.map(s => s.titre.slice(0, 2))).toEqual(['1.', '2.', '3.', '4.', '5.', '6.', '7.']);
    const avec = noteDeCalcul(calculerPiscine(piscine(8, 4, { profondeurGrandBain: 3, fond: 'pente' }))!);
    expect(avec).toHaveLength(8);
    const texte = noteEnTexte(sans);
    expect(texte).toMatch(/Volume d'eau : 38,4 m³/);
    expect(texte).toMatch(/Déclaration préalable/);
    expect(texte).toMatch(/Ouest : 5,00 m/);
  });
});

describe('la piscine est une ouverture dans une terrasse', () => {
  const terrasse: ObjetPlan = { key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: [{ x: -3, y: -3 }, { x: 11, y: -3 }, { x: 11, y: 7 }, { x: -3, y: 7 }] };

  it('coupe les solives et les lames au bord des margelles, et pose un chevetre avec ses appuis', async () => {
    const { computeStructure, buildVisGrid, ouverturesDe, retirerOuvertures } = await import('../../../src/engine/structure.js');
    const { computeTerrasseLayers } = await import('../../../src/engine/layers.js');
    const { ensureConstruction } = await import('../../../src/engine/construction.js');
    const bassin = piscine(8, 4, { structure: 'maconnerie' });
    const seule = JSON.parse(JSON.stringify(terrasse)) as ObjetPlan;
    const percee = JSON.parse(JSON.stringify(terrasse)) as ObjetPlan;
    ensureConstruction(seule); ensureConstruction(percee);
    const sans = computeStructure(seule as never, [seule]);
    const avec = computeStructure(percee as never, [percee, bassin]);
    expect(sans.trous).toBeUndefined();
    expect(avec.trous).toHaveLength(1);
    // Aucune solive ne traverse le bassin : chaque morceau a son milieu hors de l'ouverture.
    const trou = avec.trous![0]!;
    const { pointInPolygon } = await import('../../../src/geometry/basic.js');
    avec.solives.forEach(s => expect(pointInPolygon({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, trou)).toBe(false));
    expect(avec.solives.length).toBeGreaterThan(sans.solives.length);
    // Le chevetre fait le tour de l'ouverture, dans le cadre : quatre cotes de plus.
    expect(avec.cadre.length).toBe(sans.cadre.length + 4);
    const visAvec = buildVisGrid(percee as never, avec, [percee, bassin]);
    const visSans = buildVisGrid(seule as never, sans, [seule]);
    expect(visAvec.filter(v => v.role === 'rive').length).toBeGreaterThan(visSans.filter(v => v.role === 'rive').length);
    visAvec.forEach(v => expect(pointInPolygon(v, bassin.type === 'polygon' ? bassin.pts : [])).toBe(false));
    const couches = computeTerrasseLayers(percee, [percee, bassin]);
    couches.lames.forEach(s => expect(pointInPolygon({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, trou)).toBe(false));
    expect(couches.chevetres).toHaveLength(4);
    expect(ouverturesDe(seule.type === 'polygon' ? seule.pts : [], [seule])).toEqual([]);
    expect(retirerOuvertures([{ a: { x: 0, y: 2 }, b: { x: 8, y: 2 } }], [trou])).toEqual([]);
  });

  it('ignore un bassin qui ne touche pas la terrasse', async () => {
    const { ouverturesDe } = await import('../../../src/engine/structure.js');
    const loin = piscine(8, 4); if (loin.type === 'polygon') loin.pts = loin.pts.map(p => ({ x: p.x + 50, y: p.y }));
    expect(ouverturesDe(terrasse.type === 'polygon' ? terrasse.pts : [], [loin])).toEqual([]);
  });
});
