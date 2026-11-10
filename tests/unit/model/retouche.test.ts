import { describe, it, expect } from 'vitest';
import { retoucheADemander, marquerRetouche, oublierRetouche, questionRetouche, libelleReprendre, dateRetoucheLisible, jourDuMarque } from '../../../src/model/retouche.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

// Le marque d'une retouche a la main (model/retouche.ts) : la question avant la premiere retouche, et un marque qui s'enregistre.

const maison = (): ObjetPlan => normalizeObjects([{
  key: 'maison', type: 'polygon', name: 'Maison', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
  bdtopo: { couche: 'BDTOPO_V3:batiment', id: 'BAT1' }
}] as unknown as ObjetBrut[])[0] as ObjetPlan;

describe('la retouche a la main d un objet de l IGN', () => {
  it('demande l accord une fois, pour un objet venu du cadastre ou de l IGN seulement', () => {
    const o = maison();
    expect(retoucheADemander(o)).toBe(true);
    marquerRetouche(o, '2026-10-27');
    expect(retoucheADemander(o)).toBe(false);
    oublierRetouche(o);
    expect(retoucheADemander(o)).toBe(true);
    expect(retoucheADemander({ name: 'Terrasse' })).toBe(false);
    expect(retoucheADemander({ name: 'Parcelle', cadastre: { idu: 'X' } })).toBe(true);
  });

  it('dit ce que la retouche change, au vouvoiement', () => {
    expect(questionRetouche(maison())).toBe('« Maison » vient de l’IGN. La retoucher à la main la détache de l’IGN : à la prochaine actualisation, vous choisirez entre garder votre version et reprendre celle de l’IGN. Continuer ?');
    expect(questionRetouche({ name: 'Parcelle AE 101', cadastre: { idu: 'X' } })).toMatch(/^« Parcelle AE 101 » vient du cadastre\./);
    const o = maison();
    marquerRetouche(o, '2026-10-27');
    expect(libelleReprendre(o)).toBe('Reprendre la version de l’IGN pour « Maison », retouché à la main le 27/10/2026');
    expect(dateRetoucheLisible(null)).toBe('');
    expect(jourDuMarque(new Date(2026, 9, 5))).toBe('2026-10-05');
  });

  it('s enregistre dans le fichier et se relit', () => {
    const o = maison();
    marquerRetouche(o, '2026-10-27');
    const [plat] = serializeObjects([o]);
    expect((plat as unknown as Record<string, unknown>).retoucheMain).toEqual({ date: '2026-10-27' });
    const relu = normalizeObjects(JSON.parse(JSON.stringify([plat])) as ObjetBrut[])[0] as ObjetPlan;
    expect(relu.retoucheMain).toEqual({ date: '2026-10-27' });
    // Une copie, pas la meme reference.
    expect(relu.retoucheMain).not.toBe(o.retoucheMain);
    expect(JSON.stringify(serializeObjects([relu]))).toBe(JSON.stringify(serializeObjects([o])));
  });

  it('absent, il ne s ecrit pas : le fichier garde sa forme d avant', () => {
    const [plat] = serializeObjects([maison()]);
    expect('retoucheMain' in (plat as object)).toBe(false);
    const nul = normalizeObjects([{ ...maison(), retoucheMain: null }] as unknown as ObjetBrut[])[0] as ObjetPlan;
    expect('retoucheMain' in nul).toBe(false);
  });
});
