import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decisionsDuJardin, especeDuGenre, type EntreesJardin } from '../../../../src/facade/regles/jardin.js';
import { lireObservationsJardin, versImage, versPlan } from '../../../../src/regles/jardin/observations.js';
import { REGLAGES_JARDIN } from '../../../../src/app/regles/jardin.js';
import { BIBLIOTHEQUE_LIVREE } from '../../../fixtures/bibliotheque-livree.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Les regles de la lecture du jardin (lot L3), sur la reponse SYNTHETIQUE de l'orthophoto de synthese (tests/fixtures/jardin-ia/) :
// l'image couvre 30 m, la parcelle est le contour jaune (de 0,06 a 0,94 de l'image), la maison le rectangle blanc.

const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/jardin-ia/reponse-synthetique.json', import.meta.url), 'utf8')) as { synthetique: boolean; sortie: unknown };
const observations = lireObservationsJardin(fixture.sortie)!;
const cadrage = { xMin: 0, yMin: 0, coteM: 30 };
const parcelle = [{ x: 1.8, y: 1.8 }, { x: 28.2, y: 1.8 }, { x: 28.2, y: 28.2 }, { x: 1.8, y: 28.2 }];
const entrees = (plus: Partial<EntreesJardin> = {}): EntreesJardin => ({ observations, cadrage, parcelle, objets: [], especes: BIBLIOTHEQUE_LIVREE, reglages: REGLAGES_JARDIN, ...plus });

describe('la lecture du jardin, lue', () => {
  it('lit la reponse synthetique (et le dit) : dix objets', () => {
    expect(fixture.synthetique).toBe(true);
    expect(observations.objets).toHaveLength(10);
    expect(observations.objets[0]).toMatchObject({ genre: 'arbre', arbre: { genre: 'chene', taille: 'moyen', persistant: false }, certitude: 'forte' });
  });

  it('ecarte ce qui n est pas lisible, sans rien inventer', () => {
    const lu = lireObservationsJardin({ objets: [{ genre: 'soucoupe', points: [{ x: 0.1, y: 0.1 }] }, { genre: 'arbre', points: [{ x: 300, y: 2 }] }, { genre: 'regard', points: [{ x: 0.2, y: 0.3 }], certitude: 'certaine' }] });
    expect(lu!.objets).toEqual([{ genre: 'regard', points: [{ x: 0.2, y: 0.3 }], etendue: 0, arbre: null, nature: null, indices: [], certitude: 'faible' }]);
    expect(lireObservationsJardin({ facades: [] })).toBeNull();
  });

  it('passe de l image au plan par le cadrage, et retour', () => {
    expect(versPlan(cadrage, { x: 0.5, y: 0.94 })).toEqual({ x: 15, y: expect.closeTo(1.8, 6) });
    const p = versImage({ xMin: 10, yMin: -4, coteM: 20 }, versPlan({ xMin: 10, yMin: -4, coteM: 20 }, { x: 0.3, y: 0.7 }));
    expect(p.x).toBeCloseTo(0.3); expect(p.y).toBeCloseTo(0.7);
  });
});

describe('les decisions du moteur', () => {
  it('propose chaque objet a sa place en metres, sous la bonne forme', () => {
    const { decisions, ecartees } = decisionsDuJardin(entrees());
    expect(ecartees).toEqual([]);
    expect(decisions.map((d) => d.genre)).toEqual(['arbre', 'arbre', 'haie', 'chemin', 'terrasse', 'piscine', 'plate-bande', 'regard', 'portail', 'eclairage']);
    const objet = (g: string) => { const d = decisions.find((x) => x.genre === g)!; return d.effet.type === 'objet' ? d.effet.objet : null; };
    // Le chene, moyen : le chene de la bibliotheque le plus proche de cette taille (le chene vert), a la hauteur de la classe.
    const chene = objet('arbre')!;
    expect(chene).toMatchObject({ type: 'circle', fonction: 'arbre', center: { x: 7.5, y: 13.5 }, r: 2.1, elevation: 9, arbre: { espece: 'chene-vert', diametre: 4.2 } });
    expect(decisions[0]!.suppose).toBeNull();
    expect(decisions[1]!.effet.type === 'objet' && decisions[1]!.effet.objet.arbre?.espece).toBe('erable-japon');
    // La haie le long de la limite ouest : la cloture du cote 3, pas un objet ; le portail au milieu du cote sud.
    expect(decisions[2]!.effet).toEqual({ type: 'cloture', cote: 3, typeCloture: 'haie' });
    expect(decisions[8]!.effet).toEqual({ type: 'portail', cote: 0, position: 'centre' });
    // Le chemin, la terrasse et la piscine sont deja la : marques `existant`, ni chiffres ni declares.
    expect(objet('chemin')).toMatchObject({ type: 'path', fonction: 'chemin', width: 0.9, existant: true, pts: [{ x: 15, y: 1.8 }, { x: 15, y: 15 }] });
    expect(objet('terrasse')).toMatchObject({ fonction: 'dalle', existant: true });
    expect(objet('piscine')).toMatchObject({ fonction: 'piscine', existant: true });
    // La plate-bande de fleurs : son massif plante, sa vegetation par defaut.
    expect(objet('plate-bande')).toMatchObject({ fonction: 'massif', massif: { nature: 'plate-bande', contenu: 'fleurs' } });
    expect(objet('regard')).toMatchObject({ fonction: 'equipement', equipement: { nature: 'regard' } });
    // Les cles sont stables : une seconde lecture garde ses cases.
    expect(decisionsDuJardin(entrees()).decisions.map((d) => d.id)).toEqual(decisions.map((d) => d.id));
  });

  it('ne propose pas deux fois ce qui est deja dans le plan, ni ce qui est chez le voisin, ni ce qui est trop incertain', () => {
    const premiere = decisionsDuJardin(entrees()).decisions.flatMap((d) => (d.effet.type === 'objet' ? [d.effet.objet] : []));
    const seconde = decisionsDuJardin(entrees({ objets: premiere as ObjetPlan[] }));
    expect(seconde.decisions.map((d) => d.genre)).toEqual(['haie', 'portail']);
    expect(seconde.ecartees.filter((e) => e.raison === 'déjà dans le plan')).toHaveLength(8);
    const loin = decisionsDuJardin(entrees({ parcelle: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }] }));
    expect(loin.ecartees.some((e) => e.raison === 'hors de la parcelle')).toBe(true);
    const prudent = decisionsDuJardin(entrees({ reglages: { ...REGLAGES_JARDIN, 'jardin.ia.certitudeMin': 0.8 } }));
    expect(prudent.decisions.map((d) => d.genre)).toEqual(['arbre', 'haie', 'chemin', 'terrasse', 'piscine']);
  });

  it('une haie interieure devient un massif d avant (sans vegetation), une cloture interieure n est pas proposee', () => {
    const o = { objets: [
      { genre: 'haie' as const, points: [{ x: 0.3, y: 0.6 }, { x: 0.6, y: 0.6 }], etendue: 0, arbre: null, nature: null, indices: [], certitude: 'forte' as const },
      { genre: 'cloture' as const, points: [{ x: 0.3, y: 0.7 }, { x: 0.6, y: 0.7 }], etendue: 0, arbre: null, nature: null, indices: [], certitude: 'forte' as const },
    ], confiance: 'forte' as const };
    const { decisions, ecartees } = decisionsDuJardin(entrees({ observations: o }));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.effet.type === 'objet' && decisions[0]!.effet.objet).toMatchObject({ fonction: 'massif', name: 'Haie', elevation: 1.6 });
    expect(decisions[0]!.effet.type === 'objet' && decisions[0]!.effet.objet.massif).toBeUndefined();
    expect(ecartees[0]!.raison).toMatch(/clôture intérieure/);
  });
});

describe('l essence d un arbre vu', () => {
  const vu = (genre: string, taille: 'petit' | 'moyen' | 'grand' | 'tres-grand' | null, persistant: boolean | null = null) =>
    especeDuGenre({ genre: genre as never, taille, persistant }, BIBLIOTHEQUE_LIVREE);
  it('prend l essence du genre la plus proche de la taille vue', () => {
    expect(vu('chene', 'tres-grand')).toMatchObject({ espece: { id: 'chene-pedoncule' }, exacte: true });
    expect(vu('bouleau', 'grand')).toMatchObject({ espece: { id: 'bouleau-verruqueux' }, exacte: true });
    expect(vu('pin', 'grand')!.espece.id).toBe('pin-sylvestre');
  });
  it('un genre absent de la bibliotheque prend un proche, ou une essence de meme feuillage', () => {
    expect(vu('prunier', 'petit')).toMatchObject({ espece: { id: 'pecher' }, exacte: true });
    const tilleul = vu('tilleul', 'grand')!;
    expect(tilleul.exacte).toBe(false);
    expect(tilleul.espece.caduc).toBe(true);
    expect(vu('autre-conifere', 'petit')!.espece.caduc).toBe(false);
    expect(especeDuGenre({ genre: 'chene', taille: null, persistant: null }, [])).toBeNull();
  });
});
