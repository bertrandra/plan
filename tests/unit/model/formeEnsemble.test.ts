import { describe, it, expect } from 'vitest';
import { formeDesCorps, formeDeLEnsemble, formeDuCorpsNommee, formeDuCorpsToit } from '../../../src/model/formeToit.js';
import type { CorpsToit } from '../../../src/model/types.js';

// Les formes que plusieurs corps accoles composent, et l'asymetrique : des noms, le dessin est celui des corps.

const corps = (x: number, y: number, w: number, plus: Partial<CorpsToit> = {}, l = 10): CorpsToit => ({
  pts: [{ x, y }, { x: x + l, y }, { x: x + l, y: y + w }, { x, y: y + w }], posFaitage: w / 2, faitage: 6.5, egouts: [3, 3], pignons: [], ecart: 0, ...plus,
});

describe('l asymetrique', () => {
  it('un deux-pans dont un pan fait au moins 1,6 fois l autre, a pignons, est asymetrique ; le calcul, lui, continue de dire deux-pans', () => {
    const c = corps(0, 0, 7, { posFaitage: 2.2 });
    expect(formeDuCorpsNommee(c)).toBe('asymetrique');
    expect(formeDuCorpsToit(c)).toBe('deux-pans');
    expect(formeDesCorps([c])).toBe('asymetrique');
  });
  it('un faitage presque centre, des croupes ou un appentis ne le sont pas', () => {
    expect(formeDuCorpsNommee(corps(0, 0, 7, { posFaitage: 3.2 }))).toBe('deux-pans');
    expect(formeDuCorpsNommee(corps(0, 0, 7, { posFaitage: 2.2, croupes: [2, 2] }))).toBe('croupes');
    expect(formeDuCorpsNommee(corps(0, 0, 7, { posFaitage: 0 }))).toBe('appentis');
  });
});

describe('le toit en M et les deux pans decales', () => {
  it('deux deux-pans accoles de meme faitage : un toit en M ; de faitages differents : decales', () => {
    expect(formeDeLEnsemble([corps(0, 0, 5), corps(0, 5, 5)])).toBe('toit-en-m');
    expect(formeDeLEnsemble([corps(0, 0, 5), corps(0, 5, 5, { faitage: 7.5 })])).toBe('deux-pans-decales');
  });
  it('des corps eloignes, ou de sens different, ne composent rien : le corps principal nomme le batiment', () => {
    expect(formeDeLEnsemble([corps(0, 0, 5), corps(0, 9, 5)])).toBeNull();
    const croise: CorpsToit = { pts: [{ x: 0, y: 5 }, { x: 0, y: 15 }, { x: -5, y: 15 }, { x: -5, y: 5 }], posFaitage: 2.5, faitage: 6.5, egouts: [3, 3], pignons: [], ecart: 0 };
    expect(formeDeLEnsemble([corps(0, 0, 5), croise])).toBeNull();
    expect(formeDeLEnsemble([corps(0, 0, 5)])).toBeNull();
  });
  it('trois deux-pans accoles ne sont ni un M ni des decales : rien', () => {
    expect(formeDeLEnsemble([corps(0, 0, 5), corps(0, 5, 5), corps(0, 10, 5)])).toBeNull();
  });
});

describe('le shed', () => {
  const dent = (y: number, plus: Partial<CorpsToit> = {}) => corps(0, y, 4, { posFaitage: 0, faitage: 5.6, ...plus });
  it('au moins deux appentis accoles qui montent du meme cote : un shed', () => {
    expect(formeDeLEnsemble([dent(0), dent(4), dent(8)])).toBe('shed');
    expect(formeDeLEnsemble([dent(0), dent(4)])).toBe('shed');
  });
  it('des appentis qui montent l un vers l autre sont autre chose (pas un shed)', () => {
    expect(formeDeLEnsemble([dent(0), dent(4, { posFaitage: 4 })])).toBeNull();
  });
  it('un appentis seul ou separe n est pas un shed', () => {
    expect(formeDeLEnsemble([dent(0), dent(12)])).toBeNull();
    expect(formeDesCorps([dent(0)])).toBe('appentis');
  });
});

describe('les toits de revolution', () => {
  it('portent le nom de leur type', () => {
    const t = (speciale: NonNullable<CorpsToit['speciale']>) => formeDuCorpsToit(corps(0, 0, 6, { speciale, posFaitage: 3 }, 6));
    expect(t({ type: 'conique' })).toBe('conique');
    expect(t({ type: 'polygonal', cotes: 6 })).toBe('polygonal');
    expect(t({ type: 'fleche', cotes: 8 })).toBe('fleche');
    expect(t({ type: 'dome' })).toBe('dome');
    expect(t({ type: 'imperiale' })).toBe('imperiale');
  });
});
