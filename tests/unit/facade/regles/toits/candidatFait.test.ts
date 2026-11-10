import { describe, it, expect } from 'vitest';
import { faitCandidat } from '../../../../../src/facade/regles/toits/candidatFait.js';
import { lireFaitsToits } from '../../../../../src/regles/toits/faits.js';
import { reconstruireCorps } from '../../../../../src/facade/toits/toitCorps.js';
import { brise, corps, rect, surface } from '../../../../fixtures/surfacesToits.js';
import type { CasAudit } from '../../../../../src/model/audit.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';

// Le fait candidat d'un cas de promenade : ce que la fiche permet d'ecrire sans rien inventer, et ce qu'elle laisse a la personne qui trie.

function cas(vu: CeQueJeVois | undefined, plus: Partial<{ azimut: number | null; problemes: string[]; cleBdtopo: string | null; sorties: unknown }> = {}): CasAudit {
  const azimut = plus.azimut === undefined ? 20 : plus.azimut;
  return {
    id: 'c1', cle: 'maison', statut: 'a_corriger',
    constat: { categorie: 'toit', problemes: plus.problemes ?? ['toit.sens-faitage'], note: '', t: '2026-10-13T09:00:00Z', position: { x: 0, y: 0, precisionM: 5 }, photos: azimut === null ? [] : [{ type: 'image/jpeg', base64: 'AA', prise: { azimutDeg: azimut } as never }] },
    identite: { cleBdtopo: plus.cleBdtopo === undefined ? 'BATIMENT0000000000000001' : plus.cleBdtopo, idu: null, adresse: '1 rue Test' },
    entrees: { pts: rect(12, 8), bdtopo: null, grille: null, voisins: [] },
    sorties: (plus.sorties ?? { mode: 'entier', elevation: null, toit: null, corps: null, toitMesure: null, couleurMurs: null, sourceMurs: null }) as CasAudit['sorties'],
    attendu: null, historique: [], ...(vu ? { vu } : {}),
  } as CasAudit;
}

describe('le fait candidat d un cas de promenade', () => {
  it('une forme simple, des bouts et un sens vus : un fait complet, valide pour le lecteur du depot', () => {
    const c = faitCandidat(cas({ forme: 'deux-pans', bouts: 'pignons', sensFaitage: 'perpendiculaire' }), 'audit-2026-10-13.json');
    expect(c?.cle).toBe('BATIMENT0000000000000001');
    expect(c?.fait.observation).toEqual({ forme: ['deux-pans'], bouts: ['pignon', 'pignon'], faitage: { par: 'azimut', azimutDeg: 20 } });
    expect(c?.fait.preuve).toEqual({ promenade: 'audit-2026-10-13.json', cas: 'c1', photo: true });
    expect(c?.aVerifier.join(' ')).toMatch(/azimut de la photo \(20°\)/);
    expect(() => lireFaitsToits({ format: 'plan-faits-toits', version: 1, faits: { [c!.cle]: c!.fait } })).not.toThrow();
  });

  it('un faitage parallele a la rue est a 90° de la photo prise face a elle', () => {
    expect(faitCandidat(cas({ sensFaitage: 'parallele' }, { azimut: 100 }), 'p.json')?.fait.observation.faitage).toEqual({ par: 'azimut', azimutDeg: 10 });
  });

  it('sans azimut, le sens ne s ecrit pas : il est dit en piste', () => {
    const c = faitCandidat(cas({ forme: 'croupes', sensFaitage: 'parallele' }, { azimut: null }), 'p.json');
    expect(c?.fait.observation).toEqual({ forme: ['croupes'] });
    expect(c?.pistes.join(' ')).toMatch(/aucune photo n’a d’azimut/);
  });

  it('une forme du catalogue n entre pas dans un fait : elle se dit en piste', () => {
    const c = faitCandidat(cas({ forme: 'mansart', bouts: 'croupes' }), 'p.json');
    expect(c?.fait.observation).toEqual({ bouts: ['croupe', 'croupe'] });
    expect(c?.pistes[0]).toMatch(/Forme vue : mansart/);
  });

  it('un toit en morceaux suppose un seul corps, et le dit', () => {
    const c = faitCandidat(cas({ forme: 'deux-pans' }, { problemes: ['toit.morceaux'] }), 'p.json');
    expect(c?.fait.observation.corps).toEqual({ min: 1, max: 1 });
    expect(c?.aVerifier.join(' ')).toMatch(/seul corps/);
  });

  it('la surface LiDAR du cas dit une forme du catalogue que la fiche ne dit pas : une piste, pas un fait', () => {
    const vrai = corps(12, 8, { faitage: 7, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] });
    const m = surface(vrai, 12, 8);
    const lus = reconstruireCorps(m, rect(12, 8)) ?? [];
    const c = faitCandidat(cas({ forme: 'deux-pans' }, { sorties: { mode: 'entier', elevation: null, toit: null, corps: lus, toitMesure: m, couleurMurs: null, sourceMurs: null } }), 'p.json');
    expect(c?.fait.observation.forme).toEqual(['deux-pans']);
    expect(c?.pistes.join(' ')).toMatch(/La surface LiDAR dit « gambrel »/);
  });

  it('rien sans cle BD TOPO, ni sans ce que je vois : pas de fait invente', () => {
    expect(faitCandidat(cas({ forme: 'deux-pans' }, { cleBdtopo: null }), 'p.json')).toBeNull();
    expect(faitCandidat(cas(undefined), 'p.json')).toBeNull();
    expect(faitCandidat(cas({ couverture: 'ardoise' }), 'p.json')).toBeNull();
  });
});
