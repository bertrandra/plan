import { describe, it, expect } from 'vitest';
import { carreauxValides, dimensionsValides, facadeLue, formeValide, fusionnerOuvertures, numeroterOuvertures, releveReecrit, surfaceValide, textureCaleeValide } from '../../../src/model/facadeObjet.js';
import { ouvertureGardee } from '../../../src/model/protections.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import type { ObjetBrut, ObjetPlan, OuvertureFacade, ReleveFacade } from '../../../src/model/types.js';

// La Facade et la facade objet (MD/spec-facade-calage-audit.md §3.2 a §3.4, lot F5) : relues sans rien inventer, ecrites sans perdre
// le travail de la personne.

const ov = (x: number, extra: Partial<OuvertureFacade> = {}): OuvertureFacade => ({ type: 'fenetre', x, y: 1, l: 1.2, h: 1.3, ...extra });
const releve = (extra: Partial<ReleveFacade> = {}): ReleveFacade => ({
  cote: 0, largeur: 10, hauteur: 5, texture: null, ouvertures: [ov(1), ov(4)], distance: null, sourceDistance: null, releveLe: '2026-10-29T08:00:00.000Z', ...extra,
});
const FACADE: Pick<ReleveFacade, 'dimensions' | 'forme' | 'surface' | 'textureCalee'> = {
  dimensions: { largeurM: 10, egoutM: 5, faitageM: 8.1, source: 'lidar', ecartPhoto: { largeur: 0.02, egout: 0.12 } },
  forme: { gabarit: [{ u: 0, v: 1 }, { u: 0.5, v: 1.62 }, { u: 1, v: 1 }], silhouetteLue: 'triangle', pointes: [{ u: 0.5, v: 1.6, source: 'deterministe' }], corps: [{ mur: { gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 } }, u0: 0, u1: 1 }], source: 'photo' },
  surface: { principale: 'enduit', zones: [{ type: 'colombage', u0: 0.6, u1: 1, v0: 1, v1: 1.6, confiance: 0.9 }], source: 'ia' },
  textureCalee: { pxParM: 118, cadre: { x0: 0, y0: 140, x1: 1180, y1: 730 } },
};

describe('la Facade relue d un fichier', () => {
  it('rend tel quel, le meme objet, un releve d avant : un fichier ancien se relit a l identique', () => {
    const r = releve({ ouvertures: [ov(1, { details: { vitrage: 'petits-bois', volets: 'battants' } })] });
    expect(facadeLue(r)).toBe(r);
  });

  it('garde une Facade bien formee, champ par champ', () => {
    const r = releve({ ...FACADE, ouvertures: [ov(1, { id: 'o1', verifieeLe: '2026-10-29', details: { carreaux: { source: 'ia', vantaux: 2, grille: { colonnes: 1, rangees: 3 }, imposte: { hauteurM: 0.3 } } } })] });
    expect(facadeLue(r)).toEqual(r);
  });

  it('retire ce qui est mal forme, et les mots qu il ne connait pas, plutot que de le garder a moitie compris', () => {
    const brut = releve({ ouvertures: [ov(1, { id: '' as string, verifieeLe: 3 as unknown as string, details: { volets: 'battants', carreaux: { source: 'ia', vantaux: 7 as 2, petitsBois: 'dores' as 'fins' } } })] }) as unknown as Record<string, unknown>;
    brut.dimensions = { largeurM: -1, egoutM: 5, source: 'lidar' };
    brut.forme = { gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }], silhouetteLue: 'losange', source: 'photo', pointes: [{ u: 0.5, v: 1.5, source: 'devine' }] };
    brut.surface = { principale: 'marbre', source: 'ia' };
    brut.textureCalee = { pxParM: 100, cadre: { x0: 10, y0: 0, x1: 5, y1: 10 } };
    const lu = facadeLue(brut as unknown as ReleveFacade);
    expect(lu.dimensions).toBeUndefined();
    expect(lu.forme).toEqual({ gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }], source: 'photo' });
    expect(lu.surface).toBeUndefined();
    expect(lu.textureCalee).toBeUndefined();
    expect(lu.ouvertures[0]).toEqual(ov(1, { details: { volets: 'battants' } }));
  });

  it('chaque validateur rend null sur ce qui ne le decrit pas, et ne copie que ses cles connues', () => {
    expect(dimensionsValides({ largeurM: 9, egoutM: 2.4, source: 'cadastre', autre: 1 })).toEqual({ largeurM: 9, egoutM: 2.4, source: 'cadastre' });
    expect(dimensionsValides({ largeurM: 9, egoutM: 2.4, source: 'photo' })).toBeNull();
    expect(formeValide({ gabarit: [{ u: 0, v: 1 }], source: 'plan' })).toBeNull();
    expect(surfaceValide({ principale: 'mixte', source: 'doigt' })).toEqual({ principale: 'mixte', source: 'doigt' });
    expect(textureCaleeValide({ pxParM: 0, cadre: { x0: 0, y0: 0, x1: 1, y1: 1 } })).toBeNull();
    expect(carreauxValides({ source: 'ia' })).toBeNull();
    expect(carreauxValides({ vantaux: 2 })).toBeNull();
  });

  it('passe par la normalisation et la serialisation du projet sans rien perdre', () => {
    const o = { key: 'b', type: 'polygon', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }], facades: [releve({ ...FACADE, ouvertures: [ov(1, { id: 'o1', verifieeLe: '2026-10-29' })] })] } as unknown as ObjetBrut;
    const [m] = normalizeObjects([structuredClone(o)]) as unknown as ObjetPlan[];
    expect(m!.batiment?.facades?.[0]).toEqual((o as unknown as { facades: ReleveFacade[] }).facades[0]);
    const [ecrit] = serializeObjects([m!]) as unknown as { facades: ReleveFacade[] }[];
    expect(ecrit!.facades[0]).toEqual((o as unknown as { facades: ReleveFacade[] }).facades[0]);
  });
});

describe('la facade objet : un rejeu ne detruit pas le travail de la personne', () => {
  it('une ouverture verifiee, corrigee ou ajoutee est gardee ; une detection ou une baie devinee ne l est pas', () => {
    expect(ouvertureGardee({ verifieeLe: '2026-10-29' })).toBe(true);
    expect(ouvertureGardee({ source: 'corrigee' })).toBe(true);
    expect(ouvertureGardee({ source: 'ajoutee' })).toBe(true);
    expect(ouvertureGardee({ source: 'detectee' })).toBe(false);
    expect(ouvertureGardee({ source: 'devinee' })).toBe(false);
  });

  it('garde a sa place une ouverture verifiee, et n ajoute pas la nouvelle detection qui la recouvre', () => {
    const verifiee = ov(1, { id: 'o1', verifieeLe: '2026-10-29', source: 'detectee' });
    const autre = ov(4, { id: 'o2', source: 'detectee' });
    // Le rejeu voit la premiere un peu decalee (recouvrement de plus de moitie), la seconde ailleurs, et une troisieme.
    const nouvelles = [ov(1.15), ov(4.6), ov(7)];
    const fusion = fusionnerOuvertures([verifiee, autre], nouvelles);
    expect(fusion).toEqual([verifiee, ov(4.6), ov(7)]);
    // Rien de garde : les nouvelles, telles quelles.
    expect(fusionnerOuvertures([autre], nouvelles)).toEqual(nouvelles);
  });

  it('numerote les ouvertures : chacune garde son identifiant, une ouverture retrouvee reprend le sien, une nouvelle en recoit un', () => {
    const avant = [ov(1, { id: 'o1' }), ov(4, { id: 'o2' }), ov(7, { id: 'o5' })];
    const ids = numeroterOuvertures([ov(1.1), ov(4, { id: 'o2' }), ov(9)], avant).map((o) => o.id);
    expect(ids).toEqual(['o1', 'o2', 'o6']);
    expect(numeroterOuvertures([ov(1), ov(4)]).map((o) => o.id)).toEqual(['o1', 'o2']);
  });

  it('un releve neuf sur un mur valide garde ses ouvertures verifiees, ses dimensions et sa forme ; la pose et le parement partent avec l ancienne texture', () => {
    const valide = releve({ ...FACADE, ouvertures: [ov(1, { id: 'o1', verifieeLe: '2026-10-29' }), ov(4, { id: 'o2', verifieeLe: '2026-10-29' })] });
    const o = { batiment: { facades: [valide] } };
    const neuf = releve({ releveLe: '2026-11-02T08:00:00.000Z', ouvertures: [ov(1.2), ov(4.1), ov(7)], depuisAudit: true });
    const r = releveReecrit(o, valide, neuf);
    expect(r.ouvertures).toEqual([valide.ouvertures[0], valide.ouvertures[1], ov(7)]);
    expect(r.dimensions).toEqual({ largeurM: 10, egoutM: 5, faitageM: 8.1, source: 'lidar' });
    expect(r.forme).toBe(FACADE.forme);
    expect(r.textureCalee).toBeUndefined();
    expect(r.surface).toBeUndefined();
    // Sur un mur pose d'office par l'audit (rien de valide) : le releve neuf, tel quel.
    const auto = releve({ depuisAudit: true });
    expect(releveReecrit({ batiment: { facades: [auto] } }, auto, neuf)).toBe(neuf);
    expect(releveReecrit({ batiment: { facades: [] } }, undefined, neuf)).toBe(neuf);
  });
});
