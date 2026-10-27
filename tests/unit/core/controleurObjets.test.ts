import { describe, it, expect } from 'vitest';
import { toucher, toucherTout, versionEnsemble, versionObjet } from '../../../src/core/controleurObjets.js';

// Le controleur des objets (MD/spec-ouvrages.md, etape 6.1) : une version par objet, et le repli sur « tout a change ».

describe('le controleur des objets', () => {
  it('une version stable tant que l objet n est pas touche', () => {
    const a = {}, b = {};
    const va = versionObjet(a), vb = versionObjet(b);
    expect(versionObjet(a)).toBe(va);
    toucher(a);
    expect(versionObjet(a)).not.toBe(va);
    expect(versionObjet(b)).toBe(vb);
  });

  it('toucher tout change chaque version, et celle de l ensemble', () => {
    const a = {}, va = versionObjet(a), e = versionEnsemble();
    toucherTout();
    expect(versionObjet(a)).not.toBe(va);
    expect(versionEnsemble()).not.toBe(e);
  });

  it('toute ecriture change la version de l ensemble', () => {
    const e = versionEnsemble();
    toucher({});
    expect(versionEnsemble()).not.toBe(e);
  });
});
