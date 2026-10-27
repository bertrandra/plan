import { describe, it, expect } from 'vitest';
import { sectionReleve } from '../../../src/ui/champs/facade.js';
import type { Champ, ChampBouton, ChampChoix, ChampLigne, ChampNombre, ContexteChamps } from '../../../src/ui/champs/types.js';
import { appliquerPiece } from '../../../src/three/gestesToits.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les reglages d'un element de facade (bow-window, galerie) dans la section « Facades et toit » de l'inspecteur.

const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
function contexte(): ContexteChamps {
  const o = { key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 3, pts, batiment: { toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } } as unknown as ObjetPlan;
  return { etat: { objects: [o], highlight: {}, lectureSeule: false }, obj: o, objets: [o], elevationOf: () => 3, render: () => {}, pushHistory: () => {} } as unknown as ContexteChamps;
}
const lignes = (c: ContexteChamps) => sectionReleve(c).champs.filter((x): x is ChampLigne => x.type === 'ligne' && x.cle.startsWith('saillie'));
const sous = <T extends Champ>(l: ChampLigne, cle: string): T => { const x = l.champs.find((k) => k.cle === cle); if (!x) throw new Error(cle); return x as T; };

describe('les elements de facade dans l inspecteur', () => {
  it('sans element, aucune ligne', () => {
    expect(lignes(contexte())).toHaveLength(0);
  });

  it('une ligne par element, avec forme et niveau pour un bow-window seulement', () => {
    const c = contexte();
    appliquerPiece(c.obj, 'facade:bow-arc');
    appliquerPiece(c.obj, 'facade:galerie');
    const [bow, galerie] = lignes(c) as [ChampLigne, ChampLigne];
    expect(bow.champs.map((x) => x.cle)).toEqual(expect.arrayContaining(['forme', 'niveau', 'toit', 'largeur', 'saillie', 'position', 'mur', 'retirer']));
    expect(galerie.champs.map((x) => x.cle)).not.toContain('forme');
    expect(galerie.champs.map((x) => x.cle)).toContain('retrait');
  });

  it('changer la forme ou la largeur replace l element et fige le toit', () => {
    const c = contexte();
    appliquerPiece(c.obj, 'facade:bow-rectangle');
    delete c.obj.batiment?.toitFige;
    const l = lignes(c)[0] as ChampLigne;
    sous<ChampChoix>(l, 'forme').ecrire(c, 'conge');
    expect(c.obj.batiment!.corpsToit![1]!.saillie!.forme).toBe('conge');
    sous<ChampNombre>(l, 'largeur').ecrire(c, 3.2);
    expect(c.obj.batiment!.corpsToit![1]!.saillie!.largeurM).toBeCloseTo(3.2, 2);
    expect(c.obj.batiment?.toitFige).toBe(true);
    // Une largeur plus grande que le mur est ramenee au mur.
    sous<ChampNombre>(l, 'largeur').ecrire(c, 40);
    expect(c.obj.batiment!.corpsToit![1]!.saillie!.largeurM).toBeLessThanOrEqual(9.8);
  });

  it('le retrait d une galerie se regle, et retirer l element le supprime', () => {
    const c = contexte();
    appliquerPiece(c.obj, 'facade:galerie');
    const l = lignes(c)[0] as ChampLigne;
    sous<ChampNombre>(l, 'retrait').ecrire(c, 0.5);
    expect(c.obj.batiment!.corpsToit![1]!.retraitM).toBe(0.5);
    sous<ChampBouton>(l, 'retirer').executer(c);
    expect(c.obj.batiment?.corpsToit).toHaveLength(1);
    expect(lignes(c)).toHaveLength(0);
  });
});
