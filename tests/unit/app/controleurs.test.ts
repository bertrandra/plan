import { describe, it, expect } from 'vitest';
import { construireArbre, comparer, aplatir, compterFeuilles, type SourceControleurs } from '../../../src/app/controleurs.js';
import { EXPOSITION } from '../../../src/app/exposition.js';
import type { Commande } from '../../../src/app/commandes.js';
import type { Section } from '../../../src/ui/champs/types.js';

// L'arbre des controleurs de l'ecran (MD/spec-demos-admin.md) : construit depuis ce que Plan a
// monte, compare a l'enregistrement sans rien perdre de ce qui a disparu.

const cmd = (id: string, libelle: string, groupe: Commande['groupe'], plus: Partial<Commande> = {}): Commande =>
  ({ id, libelle, groupe, executer: () => {}, ...plus });

const SECTION: Section = { id: 'geometrie', titre: 'Géométrie', champs: [
  { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', unite: 'm', lire: () => 0, ecrire: () => {} },
  { type: 'nombre', cle: 'angle', libelle: 'Angle 1', lire: () => 0, ecrire: () => {} },
  { type: 'nombre', cle: 'angle', libelle: 'Angle 2', lire: () => 0, ecrire: () => {} }
] };

function source(commandes: Commande[], sections: Section[] = [SECTION]): SourceControleurs {
  return { appVersion: '9.9.9', commandes, exposition: EXPOSITION, inspecteur: [{ cle: 'polygon.terrasse', nom: 'Terrasse', sections }] };
}

describe('arbre des controleurs', () => {
  it('range chaque commande sous les emplacements qui l exposent, avec cle et nom explicite', () => {
    const arbre = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer', 'projet', { raccourci: 'Ctrl+S' })]));
    const tous = aplatir(arbre);
    const n = tous.get('plan/zones/Z1/menuFichier/projet.enregistrer');
    expect(n).toMatchObject({ cle: 'projet.enregistrer', nom: 'Enregistrer', genre: 'commande' });
    expect(n?.details).toMatchObject({ raccourci: 'Ctrl+S', classes: 'tablette, bureau' });
    expect(tous.get('plan/zones/clavier/clavier/projet.enregistrer')).toBeDefined();
    expect(tous.get('plan/commandes/projet/projet.enregistrer')?.nom).toBe('Enregistrer');
  });

  it('montre une commande que la carte d exposition ne connait pas', () => {
    const tous = aplatir(construireArbre(source([cmd('objet.inventee', 'Inventée', 'objet')])));
    expect(tous.get('plan/zones/nonExposees/objet.inventee')).toBeDefined();
  });

  it('decrit les champs de l inspecteur, et garde unique une cle repetee', () => {
    const tous = aplatir(construireArbre(source([])));
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/hauteur')?.details).toMatchObject({ type: 'nombre', unite: 'm' });
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/angle')?.nom).toBe('Angle 1');
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/angle#2')?.nom).toBe('Angle 2');
  });
});

describe('comparaison avec le registre enregistre', () => {
  const avant = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer', 'projet'), cmd('projet.supprimer', 'Supprimer', 'projet')]));

  it('sans registre, tout est nouveau', () => {
    const c = comparer(null, avant);
    expect(c.nouveaux).toBe(aplatir(avant).size);
    expect(c.retires).toBe(0);
  });

  it('identique : aucun changement', () => {
    const c = comparer(avant, avant);
    expect(c.nouveaux + c.retires + c.modifies).toBe(0);
  });

  it('trouve le nouveau, le retire (garde a sa place) et le renomme', () => {
    const apres = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer sous', 'projet'), cmd('projet.nouveau', 'Nouveau', 'projet')]));
    const c = comparer(avant, apres);
    expect(c.statuts.get('plan/commandes/projet/projet.nouveau')).toBe('nouveau');
    expect(c.statuts.get('plan/commandes/projet/projet.supprimer')).toBe('retire');
    expect(c.statuts.get('plan/commandes/projet/projet.enregistrer')).toBe('modifie');
    // Le retire reste dans l'arbre montre, sous son ancien parent.
    expect(aplatir(c.arbre).get('plan/commandes/projet/projet.supprimer')?.nom).toBe('Supprimer');
    expect(compterFeuilles(apres)).toBeLessThan(compterFeuilles(c.arbre));
  });
});
