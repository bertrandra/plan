import { describe, it, expect } from 'vitest';
import { validerProjetJSON } from '../../../src/io/validation.js';
import { SCHEMA_VERSION } from '../../../src/model/version.js';

// C'est la porte d'entree du programme : tout fichier de projet passe par la. Ces tests disent ce
// qu'elle refuse, ce qu'elle ignore, et la difference entre les deux — refuser protege le fichier
// de l'utilisateur, ignorer sauve ce qui peut l'etre.

const carre = { key: 'a', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] };
const projet = (extra: Record<string, unknown> = {}) => ({ objects: [carre], ...extra });

describe('ce qui est refuse', () => {
  it('refuse ce qui n est pas un objet JSON', () => {
    expect(() => validerProjetJSON(null)).toThrow(/objet JSON/);
    expect(() => validerProjetJSON([carre])).toThrow(/objet JSON/);
    expect(() => validerProjetJSON('du texte')).toThrow(/objet JSON/);
  });

  it('refuse un fichier sans objets', () => {
    expect(() => validerProjetJSON({ objects: [] })).toThrow(/Aucun objet/);
    expect(() => validerProjetJSON({ meta: {} })).toThrow(/Aucun objet/);
  });

  it('refuse un schema plus recent que celui du client', () => {
    // Le charger puis l'enregistrer effacerait sans bruit les champs que cette version ignore.
    let erreur: unknown;
    try {
      validerProjetJSON(projet({ meta: { schemaVersion: SCHEMA_VERSION + 1 } }));
    } catch (e) { erreur = e; }
    expect(String((erreur as Error).message)).toMatch(/version plus recente/);
    expect((erreur as { motif?: string }).motif).toBe('schema');
  });

  it('accepte un fichier sans schema : c est la version 1', () => {
    expect(validerProjetJSON(projet()).objets).toHaveLength(1);
  });

  it('refuse des coordonnees au-dela de 100 km', () => {
    // Signature d'un fichier dans une autre unite : millimetres, ou pixels.
    const enMillimetres = { key: 'a', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 120000, y: 0 }, { x: 1, y: 1 }] };
    expect(() => validerProjetJSON({ objects: [enMillimetres] })).toThrow(/aberrantes/);
  });

  it('applique la meme limite a un cercle', () => {
    const cercle = { key: 'c', type: 'circle', center: { x: 200000, y: 0 }, r: 1 };
    expect(() => validerProjetJSON({ objects: [cercle] })).toThrow(/aberrantes/);
  });

  it('refuse quand plus aucun objet n est exploitable', () => {
    expect(() => validerProjetJSON({ objects: [{ key: 'x', type: 'inconnu' }] })).toThrow(/exploitable/);
  });
});

describe('ce qui est ignore, et compte', () => {
  it('ignore un objet sans cle', () => {
    const r = validerProjetJSON({ objects: [carre, { type: 'polygon', pts: carre.pts }] });
    expect(r.objets).toHaveLength(1);
    expect(r.ignores).toBe(1);
  });

  it('ignore un polygone a moins de deux points', () => {
    const r = validerProjetJSON({ objects: [carre, { key: 'b', type: 'polygon', pts: [{ x: 0, y: 0 }] }] });
    expect(r.ignores).toBe(1);
  });

  it('ignore un point aux coordonnees non finies', () => {
    const casse = { key: 'b', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: NaN, y: 1 }] };
    expect(validerProjetJSON({ objects: [carre, casse] }).ignores).toBe(1);
  });

  it('ignore un cercle sans rayon utilisable', () => {
    const sansRayon = { key: 'c', type: 'circle', center: { x: 0, y: 0 }, r: 0 };
    expect(validerProjetJSON({ objects: [carre, sansRayon] }).ignores).toBe(1);
  });

  it('ignore un type inconnu', () => {
    expect(validerProjetJSON({ objects: [carre, { key: 'z', type: 'hexagone' }] }).ignores).toBe(1);
  });

  it('garde un fichier partiellement abime plutot que de tout refuser', () => {
    const r = validerProjetJSON({ objects: [carre, { key: 'x' }, null, { key: 'y', type: 'circle' }] });
    expect(r.objets).toHaveLength(1);
    expect(r.ignores).toBe(3);
  });
});

describe('ce qui est rendu', () => {
  it('accepte un cercle valide', () => {
    const cercle = { key: 'c', type: 'circle', center: { x: 3, y: 4 }, r: 2 };
    expect(validerProjetJSON({ objects: [cercle] }).objets).toHaveLength(1);
  });

  it('reprend les metadonnees telles quelles', () => {
    const r = validerProjetJSON(projet({ meta: { name: 'Jardin', schemaVersion: 1 } }));
    expect(r.meta.name).toBe('Jardin');
  });

  it('accepte un nom pose a la racine, comme dans les vieux fichiers', () => {
    expect(validerProjetJSON(projet({ name: 'Ancien' })).meta.name).toBe('Ancien');
  });

  it('rend une liste de mesures vide quand le fichier n en a pas', () => {
    expect(validerProjetJSON(projet()).mesures).toEqual([]);
  });

  it('reprend les mesures quand elles sont la', () => {
    const m = [{ refObjKey: 'a', refSegIndex: 0 }];
    expect(validerProjetJSON(projet({ measures: m })).mesures).toEqual(m);
  });

  it('ignore un champ measures qui n est pas un tableau', () => {
    expect(validerProjetJSON(projet({ measures: 'oui' })).mesures).toEqual([]);
  });
});
