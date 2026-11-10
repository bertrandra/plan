import { describe, it, expect } from 'vitest';
import { analyseClaudeDuNavigateur, cleAccord } from '../../../../../src/app/audit/parcelle/analyseNavigateur.js';

// Ce que la page donne a l'analyse par Claude : la cle de l'accord, l'identite de la parcelle, et pas
// de client hors plateforme et hors admin (seules les mesures sont alors proposees).

describe('l analyse dans le navigateur', () => {
  it('range l accord sous le projet enregistre, a defaut sous la parcelle', () => {
    expect(cleAccord('p1', 'AE0101')).toBe('projet:p1');
    expect(cleAccord(null, 'AE0101')).toBe('parcelle:AE0101');
    expect(cleAccord(null, null)).toBe(null);
  });

  it('lit la parcelle du projet, et n a pas de client sans jeton ni session admin', () => {
    const etat = { objects: [{ key: 'p', name: 'p', type: 'polygon', fonction: 'terrain', pts: [], cadastre: { idu: '78650000AE0101', adresse: '2 allée des Limites' } }] } as never;
    const a = analyseClaudeDuNavigateur(etat, () => 'projet-1');
    expect(a.identite()).toEqual({ projet: 'projet-1', idu: '78650000AE0101', adresse: '2 allée des Limites' });
    expect(a.client).toBe(null);
    // L'essai du brouillon des regles est a l'administrateur : sans session d'administrateur, il n'est jamais demande.
    expect(a.essai()).toBe(false);
  });
});
