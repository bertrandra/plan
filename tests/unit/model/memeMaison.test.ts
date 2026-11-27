import { describe, it, expect } from 'vitest';
import { chefDeLaMaison, chefsDesMaisons, habilleCommeSaMaison, pointDePose } from '../../../src/model/memeMaison.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Plusieurs batiments de la BD TOPO, une seule maison (MD/spec-toit-ign.md §13.10) : le L d'Hardencourt, en synthese. Une
// longere de 20 x 6 m, une aile de 5 x 8 m contre son mur sud, raccordees (meme faitage, memes egouts), et une remise a part.
const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, e: number): CorpsToit => ({ pts, posFaitage, faitage, egouts: [e, e], pignons: [], ecart: 0.1 });
const bati = (key: string, pts: PtBrut[], c: CorpsToit, plus: Record<string, unknown> = {}, toit: Record<string, unknown> = {}): ObjetPlan =>
  ({ type: 'polygon', key, fonction: 'batiment', pts, bdtopo: { cleabs: key, surParcellePrincipale: true, ...plus }, batiment: { corpsToit: [c], toit: { forme: 'deux-pans', hauteur: 2, ...toit } } }) as unknown as ObjetPlan;
const LONG = [p(0, 0), p(20, 0), p(20, 6), p(0, 6)], AILE = [p(0, 0), p(0, -8), p(5, -8), p(5, 0)], REMISE = [p(40, 0), p(46, 0), p(46, 5), p(40, 5)];
const longere = bati('long', LONG, corps(LONG, 3, 7, 4), { materiauxToiture: '10', materiauxMurs: '10' }, { couleur: '#8E8E82', origineCouleur: 'orthophoto' });
const aile = bati('aile', AILE, corps([p(0, 5.95), p(0, -8), p(5, -8), p(5, 5.95)], 2.5, 7, 4), {}, { couleur: '#74746E', origineCouleur: 'orthophoto' });
const remise = bati('remise', REMISE, corps(REMISE, 2.5, 7, 4));

describe('une seule maison', () => {
  it('deux batiments qui se touchent et portent le meme toit sont une maison ; son chef est le plus grand', () => {
    const chefs = chefsDesMaisons([longere, aile, remise]);
    expect([...chefs.keys()].sort()).toEqual(['aile', 'long']);
    expect(chefs.get('aile')).toBe(longere);
    expect(chefDeLaMaison(remise, [longere, aile, remise])).toBe(remise);
    // Elle se pose sur le sol au centre du chef : faitages et egouts raccordes sont a la meme altitude.
    expect(pointDePose(aile as ObjetPlan & { pts: PtBrut[] }, [longere, aile])).toEqual(p(10, 3));
    expect(pointDePose(remise as ObjetPlan & { pts: PtBrut[] }, [longere, aile, remise])).toEqual(p(43, 2.5));
  });

  it('des toits differents, ou des batiments qui ne se touchent pas, restent des maisons a part', () => {
    const plusBas = bati('aile', AILE, corps(AILE, 2.5, 6.5, 4));
    expect(chefsDesMaisons([longere, plusBas]).size).toBe(0);
    const loin = AILE.map((q) => p(q.x, q.y - 3));
    expect(chefsDesMaisons([longere, bati('aile', loin, corps(loin, 2.5, 7, 4))]).size).toBe(0);
  });

  it('elle s habille comme son chef : couverture, couleur du toit, murs', () => {
    const h = habilleCommeSaMaison(aile, longere);
    expect(h.batiment?.toit?.couleur).toBe('#8E8E82');
    expect((h.bdtopo as { materiauxToiture?: string }).materiauxToiture).toBe('10');
    expect((h.bdtopo as { materiauxMurs?: string }).materiauxMurs).toBe('10');
    expect(h.batiment?.corpsToit).toBe(aile.batiment?.corpsToit);
    expect(habilleCommeSaMaison(longere, longere)).toBe(longere);
    // L'objet du projet n'est pas touche : rien ne s'enregistre.
    expect(aile.batiment?.toit?.couleur).toBe('#74746E');
  });

  it('ce que la personne a choisi a la main n est jamais touche', () => {
    const choisi = bati('aile', AILE, corps(AILE, 2.5, 7, 4), { materiauxToiture: '20' }, { couleur: '#aa0000', couverture: 'ardoise' });
    (choisi.batiment as { couleurMurs?: unknown }).couleurMurs = { source: 'plan' };
    const h = habilleCommeSaMaison(choisi, longere);
    expect(h.batiment?.toit?.couleur).toBe('#aa0000');
    expect(h.batiment?.toit?.couverture).toBe('ardoise');
    expect((h.bdtopo as { materiauxToiture?: string }).materiauxToiture).toBe('20');
    expect(h.batiment?.couleurMurs).toEqual({ source: 'plan' });
    expect((h.bdtopo as { materiauxMurs?: string }).materiauxMurs).toBeUndefined();
  });
});
