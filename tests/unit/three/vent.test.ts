import { describe, it, expect } from 'vitest';
import { habillerDeVent, reglerVent, codeVent, uniformesVent } from '../../../src/three/vent.js';
import { demandePerf, texteDePerf } from '../../../src/three/perf.js';

// Le vent dans les arbres (three/vent.ts) : un morceau de vertex shader injecte apres `begin_vertex`, des uniformes partages, et
// l'affichage de la perf (`?fps=on`, three/perf.ts).

const SHADER = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: 'void main() {\n#include <begin_vertex>\n}' };

describe('le vent des arbres', () => {
  it('habille un materiau : uniformes partages, code injecte apres begin_vertex, cle de programme propre', () => {
    const bois = {} as never as { onBeforeCompile?: (s: typeof SHADER) => void; customProgramCacheKey?: () => string; needsUpdate?: boolean };
    const feuilles = {} as never as typeof bois;
    habillerDeVent(bois as never, 12, 1, false);
    habillerDeVent(feuilles as never, 12, 0.55, true);
    const s = { ...SHADER, uniforms: {} as Record<string, { value: unknown }> };
    bois.onBeforeCompile?.(s);
    expect(s.vertexShader).toContain('uniform float uVentTemps;');
    expect(s.vertexShader).toContain('#include <begin_vertex>\n');
    expect(s.vertexShader).toContain('transformed.x += ventAmp * ventBalancier;');
    // Le bois ne fremit pas ; la feuille, si.
    expect(s.vertexShader).not.toContain('ventFeuille');
    expect(s.uniforms.uVentHauteur?.value).toBe(12);
    expect(s.uniforms.uVentTemps).toBe(uniformesVent.temps);
    const f = { ...SHADER, uniforms: {} as Record<string, { value: unknown }> };
    feuilles.onBeforeCompile?.(f);
    expect(f.vertexShader).toContain('ventFeuille');
    expect(f.uniforms.uVentSouplesse?.value).toBe(0.55);
    expect(bois.customProgramCacheKey?.()).not.toBe(feuilles.customProgramCacheKey?.());
  });

  it('suit la preference et l horloge : force a 0 ou 1, temps en secondes', () => {
    reglerVent(true, 2500);
    expect(uniformesVent.force.value).toBe(1);
    expect(uniformesVent.temps.value).toBe(2.5);
    reglerVent(false, 4000);
    expect(uniformesVent.force.value).toBe(0);
  });

  it('ne plante pas sur un materiau absent, et le pied de l arbre ne bouge pas (part de hauteur au carre)', () => {
    expect(() => habillerDeVent(undefined as never, 5, 1, false)).not.toThrow();
    expect(codeVent(false)).toContain('ventH * ventH');
  });
});

describe('l affichage de la perf', () => {
  it('ne s active que sur fps=on', () => {
    expect(demandePerf('?fps=on')).toBe(true);
    expect(demandePerf('?fps=off')).toBe(false);
    expect(demandePerf('?fps')).toBe(false);
    expect(demandePerf('')).toBe(false);
  });
  it('ecrit cadence, temps, appels et triangles en clair', () => {
    expect(texteDePerf(59.6, 3.24, 142, 1_250_000)).toBe('60 fps · 3,2 ms · 142 appels · 1,3 M triangles');
    expect(texteDePerf(30, 8, 20, 48_000)).toBe('30 fps · 8,0 ms · 20 appels · 48 k triangles');
    expect(texteDePerf(null, 0, 3, 900)).toBe('au repos · 0,0 ms · 3 appels · 900 triangles');
  });
});
