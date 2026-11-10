import { describe, it, expect } from 'vitest';
import { cleDesAttributs, cleDesLus, toucher, toucherForme, toucherTout, versionEnsemble, versionObjet } from '../../../src/core/controleurObjets.js';

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

  it('une ecriture de forme seule change l objet, pas la cle des attributs (etape 6.5)', () => {
    const objets = [{ key: 'a' }, { key: 'b' }];
    const [a] = objets;
    const v = versionObjet(a!), attrs = cleDesAttributs(objets);
    toucherForme(a);
    expect(versionObjet(a!)).not.toBe(v);
    expect(cleDesAttributs(objets)).toBe(attrs);
    toucher(a);
    expect(cleDesAttributs(objets)).not.toBe(attrs);
    const apres = cleDesAttributs(objets);
    toucherTout();
    expect(cleDesAttributs(objets)).not.toBe(apres);
  });

  it('la cle des lus ne suit que les objets que le lecteur retient, et ceux qui entrent ou sortent du lot', () => {
    const objets = [{ key: 'arbre', fonction: 'arbre' }, { key: 't', fonction: 'terrasse' }];
    const lit = (o: { fonction?: string }) => o.fonction === 'terrasse';
    const cle = cleDesLus(objets, lit);
    expect(cleDesLus(objets, lit)).toBe(cle);
    toucher(objets[0]);
    expect(cleDesLus(objets, lit)).toBe(cle);
    toucherForme(objets[1]);
    const apres = cleDesLus(objets, lit);
    expect(apres).not.toBe(cle);
    objets[0]!.fonction = 'terrasse';
    toucher(objets[0]);
    expect(cleDesLus(objets, lit)).not.toBe(apres);
    // Un autre tableau (une ouverture, une annulation) est un autre plan.
    expect(cleDesLus([...objets], lit)).not.toBe(cleDesLus(objets, lit));
  });
});
