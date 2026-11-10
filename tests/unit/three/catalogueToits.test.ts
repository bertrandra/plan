import { describe, it, expect } from 'vitest';
import { EXEMPLES_TOITS, corpsDeLExemple, vueIsometrique } from '../../../src/three/catalogueToits.js';
import { formeDesCorps, FORMES_TOIT_CATALOGUE } from '../../../src/model/formeToit.js';
import { TYPES_LUCARNE } from '../../../src/model/corpsToitEtendu.js';

// Le catalogue des formes de toit : chaque vignette vient des facettes que calcule la 3D, et chaque forme que le modele nomme y est.

const exemple = (id: string) => EXEMPLES_TOITS.find((e) => e.id === id)!;
const pans = (id: string) => vueIsometrique(exemple(id)).facettes.filter((f) => !f.mur && !f.lucarne).length;
const lucarnes = (id: string) => vueIsometrique(exemple(id)).facettes.filter((f) => f.lucarne).length;

describe('le catalogue des formes de toit', () => {
  it('dessine chaque forme avec des facettes de toit et de mur, bien formees', () => {
    for (const e of EXEMPLES_TOITS) {
      const v = vueIsometrique(e);
      expect(v.facettes.some((f) => f.mur), e.id).toBe(true);
      expect(v.facettes.some((f) => !f.mur), e.id).toBe(true);
      for (const f of v.facettes) {
        expect(f.points.length).toBeGreaterThanOrEqual(3);
        expect(f.points.flat().every((x) => Number.isFinite(x) && x >= 0), e.id).toBe(true);
      }
    }
  });

  it('a un exemple pour chaque forme du catalogue de la spec, et le modele reconnait chacun sous son nom', () => {
    const ids = EXEMPLES_TOITS.map((e) => e.id);
    for (const f of FORMES_TOIT_CATALOGUE) expect(ids, f).toContain(f);
    for (const e of EXEMPLES_TOITS.filter((x) => x.famille === 'toit')) expect(formeDesCorps(corpsDeLExemple(e)), e.id).toBe(e.id);
  });

  it('compte les pans : deux pans 2, quatre pans 4, un pan 1, plat 1, gambrel 4, papillon 2, shed 3, M et décalés 4', () => {
    expect([pans('deux-pans'), pans('croupes'), pans('appentis'), pans('plat'), pans('gambrel'), pans('papillon')]).toEqual([2, 4, 1, 1, 4, 2]);
    expect([pans('shed'), pans('toit-en-m'), pans('deux-pans-decales'), pans('mansart')]).toEqual([3, 4, 4, 8]);
  });

  it('les toits de revolution ont des facettes autour de leur axe : pyramide à n faces, cône, dôme et bulbe en anneaux', () => {
    expect(pans('polygonal')).toBe(6 + 1);
    expect(pans('fleche')).toBe(8 + 1);
    expect(pans('conique')).toBeGreaterThan(24);
    expect(pans('dome')).toBeGreaterThan(pans('conique'));
    expect(pans('imperiale')).toBeGreaterThan(pans('dome'));
  });

  it('un berceau, un coyau et un papillon ont leurs pans en bandes selon leur profil', () => {
    expect(pans('berceau')).toBe(20);
    expect(pans('coyau')).toBe(4);
  });

  it('l avant-corps a pignon : le grand pan est entaille et deux pans de pignon, plus son triangle de mur, montent jusqu au faitage', () => {
    const e = exemple('avant-corps');
    expect(e.corps[0]!.corps.pignons).toHaveLength(1);
    expect(corpsDeLExemple(e)[0]!.pignons).toEqual(e.corps[0]!.corps.pignons);
    // Le grand pan du cote du pignon est entaille (un polygone a plus de quatre sommets), l'autre reste entier.
    const v = vueIsometrique(e);
    const toits = v.facettes.filter((f) => !f.mur);
    expect(toits.length).toBe(pans('deux-pans') + 2);
    expect(toits.some((f) => f.points.length > 4)).toBe(true);
    expect(v.facettes.filter((f) => f.mur && f.points.length === 3)).toHaveLength(1);
    expect(lucarnes('avant-corps')).toBe(0);
  });

  it('chaque type de lucarne du modele a un exemple qui ajoute ses facettes au toit', () => {
    for (const t of TYPES_LUCARNE.filter((x) => x !== 'inconnue')) expect(lucarnes(t), t).toBeGreaterThan(0);
    expect(lucarnes('deux-pans')).toBe(0);
  });
});
