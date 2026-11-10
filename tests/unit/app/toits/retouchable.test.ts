import { describe, it, expect } from 'vitest';
import { estRetouchable, raisonNonRetouchable } from '../../../../src/app/toits/modeToit.js';
import { creerRegistre } from '../../../../src/app/commandes.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Sur quel batiment le mode Toit s'ouvre (app/toits/modeToit.ts, MD/spec-flux-batiment.md point 13) : `locked` protege le contour,
// pas le toit ; le batiment d'un voisin ne s'ouvre pas, et le bouton le dit.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const bati = (extra: Partial<ObjetPlan> & Record<string, unknown>): ObjetPlan =>
  ({ key: 'b', name: 'Bâtiment', type: 'polygon', fonction: 'batiment', pts, ...extra }) as unknown as ObjetPlan;

describe('le mode Toit et le batiment selectionne', () => {
  it('la maison du projet verrouillee (la demonstration) s’ouvre : le verrou tient le contour, pas le toit', () => {
    const o = bati({ locked: true });
    expect(estRetouchable(o)).toBe(true);
    expect(raisonNonRetouchable(o)).toBeNull();
  });

  it('un batiment importe sur la parcelle du projet, verrouille ou non, s’ouvre', () => {
    expect(estRetouchable(bati({ locked: true, bdtopo: { id: 'B1', surParcellePrincipale: true } }))).toBe(true);
    expect(estRetouchable(bati({ bdtopo: { id: 'B1', surParcellePrincipale: true } }))).toBe(true);
  });

  it('la maison d’une parcelle mitoyenne ne s’ouvre pas, meme deverrouillee, et apres un enregistrement (le faux ne s’enregistre pas)', () => {
    for (const o of [
      bati({ locked: true, bdtopo: { id: 'B2', surParcellePrincipale: false } }),
      bati({ locked: false, bdtopo: { id: 'B2', surParcellePrincipale: false } }),
      bati({ locked: true, bdtopo: { id: 'B2' } }),
    ]) {
      expect(estRetouchable(o)).toBe(false);
      expect(raisonNonRetouchable(o)).toMatch(/chez un voisin/);
    }
  });

  it('le voisinage importe ne s’ouvre pas ; un batiment dessine, ou qu’il soit, s’ouvre', () => {
    expect(estRetouchable(bati({ voisinage: true, locked: true }))).toBe(false);
    expect(raisonNonRetouchable(bati({ voisinage: true }))).toMatch(/chez un voisin/);
    expect(estRetouchable(bati({}))).toBe(true);
  });

  it('ce qui n’est pas un batiment : ni ouvert, ni explique', () => {
    const terrasse = bati({ fonction: 'terrasse' });
    expect(estRetouchable(terrasse)).toBe(false);
    expect(raisonNonRetouchable(terrasse)).toBeNull();
    expect(raisonNonRetouchable(undefined)).toBeNull();
  });

  it('le registre grise la commande avec la raison (commandes.etat)', () => {
    const reg = creerRegistre();
    let choisi: ObjetPlan | undefined = bati({ locked: true, bdtopo: { id: 'B2' } });
    reg.declarer({ id: 'toit.modifier', libelle: 'Modifier la toiture', groupe: 'toit', actif: () => estRetouchable(choisi),
      raisonInactive: () => raisonNonRetouchable(choisi), executer: () => {} });
    const e = reg.etat('toit.modifier');
    expect(e.utilisable).toBe(false);
    expect(!e.utilisable && e.raison === 'contexte' && 'message' in e ? e.message : '').toMatch(/chez un voisin/);
    choisi = bati({ locked: true });
    expect(reg.etat('toit.modifier').utilisable).toBe(true);
  });
});
