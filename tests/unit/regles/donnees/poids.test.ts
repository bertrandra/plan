import { describe, it, expect } from 'vitest';
import { changerPoids } from '../../../../src/regles/donnees/edition.js';
import { FICHIERS_DONNEES } from '../../../../src/regles/donnees/fichiers.js';
import { lireReconciliation } from '../../../../src/regles/reconciliation.js';

// Changer un poids de regles/reconciliation.json sans reformater le fichier : le diff d'une PR montre sa ligne.

const livre = (FICHIERS_DONNEES.find((f) => f.id === 'reconciliation') as (typeof FICHIERS_DONNEES)[number]).livre;
const lues = (t: string) => lireReconciliation(JSON.parse(t));
const lignesChangees = (a: string, b: string) => a.split('\n').filter((l, i) => l !== b.split('\n')[i]).length;

describe('changer un poids du fichier de reconciliation', () => {
  it('change le poids par defaut d une source, sur sa seule ligne', () => {
    const t = changerPoids(livre, { source: 'photo' }, 3.5) as string;
    expect(lues(t).sources.photo.poids).toBe(3.5);
    expect(lignesChangees(livre, t)).toBe(1);
  });

  it('change le poids qu un attribut donne a une source, et ajoute celui qui manquait', () => {
    const t = changerPoids(livre, { attribut: 'hauteurEgout', source: 'lidar' }, 5) as string;
    expect(lues(t).attributs.hauteurEgout.poids.lidar).toBe(5);
    const u = changerPoids(t, { attribut: 'hauteurEgout', source: 'claude' }, 1.2) as string;
    expect(lues(u).attributs.hauteurEgout.poids).toEqual({ lidar: 5, photo: 3, ign: 2, claude: 1.2 });
    expect(lignesChangees(livre, u)).toBe(1);
  });

  it('retire le poids d un attribut : la source reprend son poids par defaut', () => {
    const t = changerPoids(livre, { attribut: 'hauteurEgout', source: 'photo' }, null) as string;
    expect(lues(t).attributs.hauteurEgout.poids).toEqual({ lidar: 4, ign: 2 });
    expect(lues(changerPoids(livre, { attribut: 'ouverturesFacade', source: 'claude' }, null) as string).attributs.ouverturesFacade.poids).toEqual({ photo: 3.5 });
  });

  it('refuse ce qui n a pas sa ligne, et ne touche pas un autre attribut', () => {
    expect(changerPoids(livre, { attribut: 'inconnu', source: 'photo' }, 1)).toBeNull();
    expect(changerPoids(livre, { source: 'inconnue' }, 1)).toBeNull();
    expect(changerPoids(livre, { source: 'photo' }, null)).toBeNull();
    const t = changerPoids(livre, { attribut: 'cheminees', source: 'claude' }, 2.5) as string;
    expect(lues(t).attributs.lucarnes.poids).toEqual({ claude: 2 });
  });
});
