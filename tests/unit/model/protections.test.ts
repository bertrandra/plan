import { describe, it, expect } from 'vitest';
import { peutEcrire, protection, REGLES, type BatimentProtege, type Ecrivain, type Groupe, type Marque } from '../../../src/model/protections.js';

// Qui peut ecrire quoi sur un batiment (MD/spec-ouvrages.md, « Qui l'emporte ») : le tableau entier, case par case. Chaque marque
// est posee seule sur un batiment de l'IGN, et chaque ecrivain dit s'il peut ecrire chaque groupe de champs.

/** Un batiment de l'IGN sans aucune marque : tout ecrivain y ecrit ce qu'il ecrit. */
const nu = (): BatimentProtege => ({ bdtopo: { id: 'B1' }, elevation: 6, batiment: { toit: { source: 'lidar' } } });

/** Le batiment avec cette seule marque. */
const AVEC: Record<Marque, () => BatimentProtege> = {
  fige: () => ({ ...nu(), batiment: { toit: { source: 'lidar' }, toitFige: true } }),
  verifie: () => ({ ...nu(), batiment: { toit: { source: 'lidar' }, verifieSurPlace: { date: '2026-10-28' } } }),
  retouche: () => ({ ...nu(), retoucheMain: { date: '2026-10-28' } }),
  toitSaisi: () => ({ ...nu(), batiment: { toit: { source: 'saisie' } } }),
  toitPhoto: () => ({ ...nu(), batiment: { toit: { source: 'photo' } } }),
  hauteurDessinee: () => ({ elevation: 6, batiment: { toit: { source: 'lidar' } } }),
  couvertureChoisie: () => ({ ...nu(), batiment: { toit: { source: 'lidar', couverture: 'ardoise' } } }),
  materiauChoisi: () => ({ ...nu(), batiment: { toit: { source: 'lidar' }, couleurMurs: { materiau: 'brique' } } }),
  releveMain: () => ({ ...nu(), batiment: { toit: { source: 'lidar' }, facades: [{ cote: 2 }] } }),
};

const GROUPES: Groupe[] = ['contour', 'hauteur', 'toit', 'elements', 'couverture', 'murs', 'facades'];
const ECRIVAINS: Ecrivain[] = ['lidar', 'recalage', 'faits', 'ign', 'audit'];

/**
 * Le tableau attendu. `—` : l'ecrivain n'ecrit jamais ce groupe ; sinon, les marques qui l'arretent (toutes les autres le laissent
 * ecrire). Recopie dans MD/spec-ouvrages.md, « Qui l'emporte ».
 */
const ATTENDU: Record<Ecrivain, Record<Groupe, '—' | Marque[]>> = {
  lidar: { contour: '—', hauteur: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], toit: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], elements: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], couverture: '—', murs: '—', facades: '—' },
  recalage: { contour: ['fige', 'verifie', 'retouche', 'toitSaisi', 'toitPhoto'], hauteur: '—', toit: '—', elements: '—', couverture: '—', murs: '—', facades: '—' },
  faits: { contour: '—', hauteur: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], toit: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], elements: ['fige', 'verifie', 'toitSaisi', 'toitPhoto'], couverture: '—', murs: '—', facades: ['verifie'] },
  ign: {
    contour: ['fige', 'verifie', 'retouche'], hauteur: ['fige', 'verifie', 'retouche'], toit: ['fige', 'verifie', 'retouche', 'toitSaisi', 'toitPhoto'],
    elements: ['fige', 'verifie', 'retouche', 'toitSaisi', 'toitPhoto'], couverture: ['fige', 'verifie', 'retouche', 'toitSaisi', 'toitPhoto'], murs: ['fige', 'verifie', 'retouche'], facades: ['fige', 'verifie', 'retouche'],
  },
  audit: { contour: '—', hauteur: ['hauteurDessinee'], toit: ['fige', 'toitSaisi'], elements: [], couverture: ['couvertureChoisie'], murs: ['materiauChoisi'], facades: ['releveMain'] },
};

describe('protections : qui peut ecrire quoi sur un batiment', () => {
  it('le tableau, ecrivain par ecrivain, groupe par groupe, marque par marque', () => {
    for (const e of ECRIVAINS) for (const g of GROUPES) {
      const attendu = ATTENDU[e][g];
      // Sans marque : il ecrit, sauf un groupe qu'il n'ecrit jamais.
      expect(peutEcrire(nu(), e, g, { cote: 2 }), e + ' / ' + g + ' sans marque').toBe(attendu !== '—');
      for (const m of Object.keys(AVEC) as Marque[]) {
        const arrete = attendu === '—' || attendu.includes(m);
        expect(peutEcrire(AVEC[m](), e, g, { cote: 2 }), e + ' / ' + g + ' / ' + m).toBe(!arrete);
      }
    }
  });

  it('le tableau du code est celui de la spec', () => {
    const duCode = Object.fromEntries(ECRIVAINS.map((e) => [e, Object.fromEntries(GROUPES.map((g) => { const r = REGLES[e][g]; return [g, r === 'jamais' ? '—' : [...r].sort()]; }))]));
    const attendu = Object.fromEntries(ECRIVAINS.map((e) => [e, Object.fromEntries(GROUPES.map((g) => { const r = ATTENDU[e][g]; return [g, r === '—' ? '—' : [...r].sort()]; }))]));
    expect(duCode).toEqual(attendu);
  });

  it('dit la marque qui arrete, ou que l ecrivain n y ecrit jamais', () => {
    expect(protection(AVEC.fige(), 'lidar', 'toit')).toBe('fige');
    expect(protection(AVEC.retouche(), 'recalage', 'contour')).toBe('retouche');
    expect(protection(nu(), 'lidar', 'facades')).toBe('jamais');
    expect(protection(nu(), 'ign', 'contour')).toBe(null);
  });

  it('« Recalculer aussi » leve la verification sur place ; « Reprendre la version de l IGN », la retouche', () => {
    expect(peutEcrire(AVEC.verifie(), 'ign', 'contour', { relireVerifies: true })).toBe(true);
    expect(peutEcrire(AVEC.verifie(), 'lidar', 'toit', { relireVerifies: true })).toBe(true);
    expect(peutEcrire(AVEC.retouche(), 'ign', 'contour', { reprendreIgn: true })).toBe(true);
    // L'un ne leve pas l'autre.
    expect(peutEcrire(AVEC.retouche(), 'ign', 'contour', { relireVerifies: true })).toBe(false);
    expect(peutEcrire(AVEC.fige(), 'ign', 'contour', { relireVerifies: true, reprendreIgn: true })).toBe(false);
  });

  it('un releve fait a la main n arrete l audit que sur son mur ; un releve de l audit ne l arrete pas', () => {
    expect(peutEcrire(AVEC.releveMain(), 'audit', 'facades', { cote: 2 })).toBe(false);
    expect(peutEcrire(AVEC.releveMain(), 'audit', 'facades', { cote: 1 })).toBe(true);
    expect(peutEcrire({ ...nu(), batiment: { facades: [{ cote: 2, depuisAudit: true }] } }, 'audit', 'facades', { cote: 2 })).toBe(true);
  });
});
