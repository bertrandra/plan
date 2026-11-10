import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { changerType, clotureDe, libelleTypeCloture, reglageDessine, resumeAcces, resumeReglage, typeDessine } from '../../../src/model/cloture.js';
import { couleurClotureVoisinageDefaut } from '../../../src/model/voisinage3d.js';
import { faitsDuDossier } from '../../../src/export/faitsDossier.js';
import { sectionsCloture, reinitialiserChoixCloture } from '../../../src/ui/champs/cloture.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { poserAvertissementMotsInconnus } from '../../../src/shell/motsInconnus.js';
import type { ChampChoix, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan, Portail, ReglageCloture, TypeCloture } from '../../../src/model/types.js';

// Une cloture dont le type (ou le parement, l'essence, l'ouverture d'un portail) est hors catalogue : `clotureDe` rend la cloture du
// fichier telle quelle, et `DEFAUTS_PAR_TYPE[type]` ne rendait rien (Vue 3D et inspecteur plantaient, le resume ecrivait
// « undefined »). Decision du 30 octobre 2026 : elle se dessine en palissade, Plan le signale une fois par mot, les textes ecrivent le
// mot lu, la donnee reste.

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); reinitialiserChoixCloture(); });
afterAll(() => poserAvertissementMotsInconnus(null));

const GABION = 'gabion' as TypeCloture;
const parcelle = (defaut: Partial<ReglageCloture> & Record<string, unknown>): ObjetPlan => ({
  key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  vertexNames: ['a', 'b', 'c', 'd'], segmentNames: ['1', '2', '3', '4'], frozenVertices: [false, false, false, false],
  cloture: { active: true, defaut: { type: GABION, hauteur: 1.2, couleur: '', texture: null, ...defaut } as ReglageCloture, cotes: [], portails: [] },
} as unknown as ObjetPlan);

describe('cloture hors catalogue : le modele', () => {
  it('se dessine en palissade, sur une copie : le reglage du fichier reste', () => {
    const o = parcelle({});
    const r = clotureDe(o).defaut;
    expect(typeDessine(r)).toBe('palissade');
    const d = reglageDessine(r);
    expect(d).toEqual({ ...r, type: 'palissade' });
    expect(d).not.toBe(r);
    expect(r.type).toBe('gabion');
    // Un type connu rend le reglage lui-meme.
    const connu = { type: 'mur', hauteur: 2 } as ReglageCloture;
    expect(reglageDessine(connu)).toBe(connu);
  });

  it('les resumes ecrivent le mot lu, jamais undefined', () => {
    expect(resumeReglage({ type: GABION, hauteur: 1.2 } as ReglageCloture)).toBe('gabion 1,20 m · verticales');
    expect(resumeReglage({ type: 'mur', hauteur: 2, parement: 'torchis' } as unknown as ReglageCloture)).toBe('Mur 2,00 m · torchis');
    expect(resumeReglage({ type: 'haie', hauteur: 2, essence: 'Bambou' } as unknown as ReglageCloture)).toBe('Haie 2,00 m · Bambou');
    expect(resumeAcces({ nature: 'portail', largeur: 3.5, x: 4.2, ouverture: 'pivotant' } as unknown as Portail)).toBe('Portail 3,50 m · pivotant · à 4,20 m');
    expect(libelleTypeCloture('mur')).toBe('Mur');
  });

  it('changer de type depuis un type inconnu ne leve pas', () => {
    const r = { type: GABION, hauteur: 1.8, couleur: '#6b4a2a' } as ReglageCloture;
    expect(() => changerType(r, 'mur')).not.toThrow();
    expect(r).toMatchObject({ type: 'mur', hauteur: 1.8, couleur: '#d9d2c3', epaisseur: 0.2 });
  });

  it('la couleur par defaut du voisinage ne leve pas', () => {
    expect(couleurClotureVoisinageDefaut(GABION as never)).toBe('#6b4a2a');
  });

  it('le dossier de la mairie ecrit le mot lu', () => {
    expect(faitsDuDossier([parcelle({})]).cloture).toEqual({ type: 'gabion', hauteurM: 1.2 });
  });

  it('se signale une fois par mot', () => {
    const o = parcelle({});
    for (let k = 0; k < 3; k++) reglageDessine(clotureDe(o).defaut);
    typeDessine({ type: 'mur' });
    expect(signaux).toEqual(['Clôture inconnue (« gabion »), dessinée en palissade bois.']);
  });
});

describe('cloture hors catalogue : l inspecteur', () => {
  const contexte = (obj: ObjetPlan) => ({ etat: { objects: [obj], highlight: {} }, obj, objets: [obj], parcelle: obj, render: () => {}, pointage: () => null, startPick: () => {} }) as unknown as ContexteChamps;
  const champ = (c: ContexteChamps, cle: string) => sectionsCloture(c).find((s) => s.id === 'cloture')!.champs.find((x) => x.cle === cle) as unknown as ChampChoix;

  it('montre le type lu, lit la couleur et l epaisseur sans lever, et reprendre le mot n ecrit rien', () => {
    const o = parcelle({});
    const c = contexte(o);
    const avant = JSON.stringify(serializeObjects([o]));
    const type = champ(c, 'type');
    expect(type.lire(c)).toBe('gabion');
    expect(type.options(c)).toContainEqual({ valeur: 'gabion', libelle: 'Clôture inconnue (« gabion »), dessinée en palissade bois' });
    expect(() => champ(c, 'couleur').lire(c)).not.toThrow();
    expect(() => champ(c, 'epaisseur').lire(c)).not.toThrow();
    type.ecrire(c, 'gabion');
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"type":"gabion"');
    // Un choix du catalogue s'ecrit comme avant.
    type.ecrire(c, 'mur');
    expect(clotureDe(o).defaut.type).toBe('mur');
    expect(type.options(c).map((x) => x.valeur)).toEqual(['aucune', 'palissade', 'grillage', 'haie', 'mur']);
  });
});
