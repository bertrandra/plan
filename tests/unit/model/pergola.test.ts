import { describe, it, expect, vi } from 'vitest';
import { aParticularite, estPergola, fonctionAdmise } from '../../../src/model/fonctions.js';
import { nouvellePergola, creerCreation } from '../../../src/model/creation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { ContexteCreation, EtatCreation } from '../../../src/model/creation.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La pergola : un polygone de fonction `pergola`, qui porte ses reglages dans `pergola`.

describe('fonction pergola', () => {
  it('n\'a de sens que sur un polygone', () => {
    expect(fonctionAdmise('pergola', 'polygon')).toBe(true);
    expect(fonctionAdmise('pergola', 'circle')).toBe(false);
    expect(fonctionAdmise('pergola', 'path')).toBe(false);
    const cercle = { key: 'c', fonction: 'pergola', type: 'circle', center: { x: 0, y: 0 }, r: 1 } as unknown as ObjetPlan;
    expect(estPergola(cercle)).toBe(false);
    expect(aParticularite(nouvellePergola({ x: 0, y: 0 }, 'p', 1).obj, 'pergola')).toBe(true);
  });
});

describe('creation', () => {
  it('naît en rectangle de 4 x 3 m, fonction pergola', () => {
    const { obj, onglet } = nouvellePergola({ x: 10, y: 20 }, 'p', 2);
    expect(obj.name).toBe('Pergola 2');
    expect(obj.fonction).toBe('pergola');
    expect(obj.type === 'polygon' && obj.pts).toEqual([{ x: 8, y: 18.5 }, { x: 12, y: 18.5 }, { x: 12, y: 21.5 }, { x: 8, y: 21.5 }]);
    expect(obj.frozenVertices).toEqual([true, true, true, true]);
    expect(onglet).toBe('objet');
  });

  it('se pose au centre de la terrasse, numerotee, et devient la selection', () => {
    const terrasse: ObjetPlan = { key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }] };
    const etat: EtatCreation = { objects: [terrasse], selectedKey: null, terrasseSelectedKey: 't', newObjCounter: 0 };
    const ctx = {
      pushHistory: vi.fn(), createObjectDOM: vi.fn(), rebuildHandles: vi.fn(), reapplyStackingOrder: vi.fn(),
      rebuildSelector: vi.fn(), render: vi.fn(), horloge: () => 1
    } as unknown as ContexteCreation;
    creerCreation(etat, ctx).ajouterPergola();
    const p = etat.objects[1]!;
    expect(p.name).toBe('Pergola 1');
    expect(p.type === 'polygon' && p.pts[0]).toEqual({ x: 1, y: 0.5 });
    expect(etat.selectedKey).toBe(p.key);
    expect(ctx.pushHistory).toHaveBeenCalledOnce();
  });
});

describe('enregistrement', () => {
  it('garde les reglages de la pergola, et rien pour un objet qui n\'en a pas', () => {
    const { obj } = nouvellePergola({ x: 0, y: 0 }, 'p', 1);
    obj.pergola = { toit: 'appentis', pente: 12, sectionPoteau: '145x145' };
    const [s] = serializeObjects([obj]);
    const [relu] = normalizeObjects([s!]);
    expect(relu!.pergola).toEqual({ toit: 'appentis', pente: 12, sectionPoteau: '145x145' });
    expect(relu!.pergola).not.toBe(obj.pergola);
    const autre = { ...obj, key: 'o', fonction: 'autre' } as ObjetPlan;
    delete autre.pergola;
    expect('pergola' in serializeObjects([autre])[0]!).toBe(false);
  });
});

describe('inspecteur', () => {
  it('ajoute les sections Pergola et Metrage par section, sans l\'elevation', () => {
    const { obj } = nouvellePergola({ x: 0, y: 0 }, 'p', 1);
    const c = { obj, objets: [obj], elevationOf: () => 2.4 } as unknown as ContexteChamps;
    const sections = sectionsObjet(c);
    expect(sections.map(s => s.id)).toEqual(expect.arrayContaining(['pergola', 'metragePergola', 'prixPergola']));
    const elevation = sections[0]!.champs.find(ch => ch.cle === 'elevation')!;
    expect(elevation.visible!(c)).toBe(false);
    const metrage = sections.find(s => s.id === 'metragePergola')!;
    expect(metrage.champs.map(ch => ch.libelle)).toEqual(['120 × 120 mm', '75 × 200 mm', '90 × 90 mm', '45 × 145 mm', 'Toile', 'Total fourniture']);
  });

  it('change de toit en oubliant la pente reglee pour l\'ancien', () => {
    const { obj } = nouvellePergola({ x: 0, y: 0 }, 'p', 1);
    obj.pergola = { toit: 'appentis', pente: 12 };
    const c = { obj, objets: [obj] } as unknown as ContexteChamps;
    const toit = sectionsObjet(c).find(s => s.id === 'pergola')!.champs.find(ch => ch.cle === 'toit')!;
    if (toit.type !== 'choix') throw new Error('choix attendu');
    toit.ecrire(c, 'quatre-pans');
    expect(obj.pergola).toEqual({ toit: 'quatre-pans' });
  });
});

describe('matiere', () => {
  it('passe a l\'aluminium : sections, longueurs et couleur de la matiere, prix saisis gardes', () => {
    const { obj } = nouvellePergola({ x: 0, y: 0 }, 'p', 1);
    obj.pergola = { debord: 0.2, sectionPoteau: '145x145', longueursBois: '5', prixMl: { 'bois:120x120': 20 } };
    const c = { obj, objets: [obj] } as unknown as ContexteChamps;
    const materiau = sectionsObjet(c).find(s => s.id === 'pergola')!.champs.find(ch => ch.cle === 'materiau')!;
    if (materiau.type !== 'choix') throw new Error('choix attendu');
    materiau.ecrire(c, 'aluminium');
    expect(obj.pergola).toEqual({ debord: 0.2, materiau: 'aluminium', prixMl: { 'bois:120x120': 20 } });
    const pergola = sectionsObjet(c).find(s => s.id === 'pergola')!;
    expect(pergola.champs.find(ch => ch.cle === 'avecContrefiches')!.visible!(c)).toBe(false);
  });
});
