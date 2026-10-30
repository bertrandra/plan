import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { creerServiceReleve } from '../../../../src/app/releve/releve.js';
import { migrer, schemaAEcrire, schemaMinimal } from '../../../../src/model/migrations.js';
import { normalizeObjects } from '../../../../src/model/normalisation.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import type { ObjetAPlat, ObjetPlan, OuvertureFacade, ReleveFacade } from '../../../../src/model/types.js';

// L'editeur d'une facade relevee (app/releve/releve.ts, lot F6 de MD/spec-facade-calage-audit.md) : la capture est partie dans
// l'audit, le releve ne fait plus que corriger ce qui est deja releve. Ce qu'il ecrit, en un pas d'historique ; ce qu'il n'ecrit pas
// (rien quand rien n'a change) ; et surtout ce qu'il garde d'un releve d'avant — un fichier ancien se rouvre, s'edite et se relit sans
// rien perdre, au meme schema.

vi.mock('../../../../src/shell/dialogs.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../../src/three/etat3d.js', () => ({ vue3d: { scene: null } }));

const temoin6 = JSON.parse(readFileSync(new URL('../../../fixtures/migrations/schema-6.json', import.meta.url), 'utf8')) as { meta: { schemaVersion: number }; objects: unknown[] };

/** Un document ouvert comme Plan l'ouvre (migre, normalise) : les objets en memoire. */
const ouvrir = (objets: unknown[], schema: number) => normalizeObjects(migrer({ objects: structuredClone(objets) as ObjetAPlat[] }, schema).objects) as unknown as ObjetPlan[];
const ecrire = (objets: ObjetPlan[]) => serializeObjects(objets) as unknown as ObjetAPlat[];

function service(objets: ObjetPlan[]) {
  const ctx = { etat: { objects: objets } as never, pushHistory: vi.fn(), render: vi.fn(), buildThreeScene: vi.fn(), aujourdhui: () => '2026-10-29' };
  return { ctx, s: creerServiceReleve(ctx) };
}
const releveDe = (o: ObjetPlan | undefined, cote = 0) => (o?.batiment?.facades ?? []).find((r) => r.cote === cote) as ReleveFacade;
const maison = (facades: ReleveFacade[]): ObjetPlan => ({ key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], batiment: { facades } } as unknown as ObjetPlan);
const fenetre = (x: number, plus: Partial<OuvertureFacade> = {}): OuvertureFacade => ({ type: 'fenetre', x, y: 1, l: 1.2, h: 1.35, source: 'detectee', confiance: 0.9, ...plus });
const releve = (plus: Partial<ReleveFacade> = {}): ReleveFacade => ({ cote: 0, largeur: 10, hauteur: 6, texture: 'data:image/jpeg;base64,AA==', hauteurTexture: 7, ouvertures: [fenetre(1), fenetre(5)], distance: null, sourceDistance: null, releveLe: '2026-10-20T10:00:00.000Z', ...plus });

describe('l editeur d une facade relevee', () => {
  it('ne s ouvre que sur un mur qui a un releve : la photo se prend dans l audit', () => {
    const { s } = service([maison([releve()])]);
    s.ouvrir('maison', 2);
    expect(s.courant()).toBeNull();
    s.ouvrir('maison', 0);
    expect(s.courant()).toEqual({ objKey: 'maison', cote: 0 });
    expect(s.releve()?.ouvertures).toHaveLength(2);
    s.fermer();
    expect(s.courant()).toBeNull();
  });

  it('n ecrit rien, pas meme un pas d historique, quand rien n a change', () => {
    const o = maison([releve({ depuisAudit: true })]);
    const { ctx, s } = service([o]);
    const avant = JSON.stringify(o);
    s.ouvrir('maison', 0);
    s.valider({ ouvertures: [...releveDe(o).ouvertures], partieBasse: null });
    expect(ctx.pushHistory).not.toHaveBeenCalled();
    expect(JSON.stringify(o)).toBe(avant);
    expect(s.courant()).toBeNull();
  });

  it('ecrit l edition en un pas : sources et corrections tracees, grille recalculee, depuisAudit tombe, le reste garde', () => {
    const o = maison([releve({ depuisAudit: true, calage: { photos: [{ coins: [], pxParMSource: 120 }] }, corrections: [{ geste: 'retrait', type: 'porte', x: 3, y: 0, l: 1, h: 2.1 }] })]);
    const { ctx, s } = service([o]);
    s.ouvrir('maison', 0);
    const [a, b] = releveDe(o).ouvertures as [OuvertureFacade, OuvertureFacade];
    s.valider({ ouvertures: [{ ...a, x: 1.3, source: 'corrigee' }, b, { type: 'porte', x: 7, y: 0, l: 1, h: 2.15, source: 'ajoutee' }], partieBasse: null });
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1);
    const r = releveDe(o);
    expect(r.depuisAudit).toBeUndefined();
    expect(r.ouvertures.map((x) => x.source)).toEqual(['corrigee', 'detectee', 'ajoutee']);
    expect(r.corrections?.map((c) => c.geste)).toEqual(['retrait', 'deplacement', 'ajout']);
    expect(r.grille?.travees).toHaveLength(3);
    expect(r.ouvertures.map((x) => x.travee)).toEqual([0, 1, 2]);
    expect(r).toMatchObject({ texture: 'data:image/jpeg;base64,AA==', hauteurTexture: 7, releveLe: '2026-10-20T10:00:00.000Z', calage: { photos: [{ pxParMSource: 120 }] } });
    expect(r).not.toHaveProperty('partieBasse');
  });

  it('sur une facade objet (lot F5), une ouverture nouvelle recoit un identifiant ; une verifiee garde sa date', () => {
    const o = maison([releve({ ouvertures: [fenetre(1, { id: 'o1', verifieeLe: '2026-10-28' }), fenetre(5, { id: 'o2' })], dimensions: { largeurM: 10, egoutM: 6, source: 'lidar' } })]);
    const { s } = service([o]);
    s.ouvrir('maison', 0);
    const [a, b] = releveDe(o).ouvertures as [OuvertureFacade, OuvertureFacade];
    s.valider({ ouvertures: [a, { ...b, verifieeLe: s.aujourdhui() }, { type: 'fenetre', x: 8, y: 1, l: 1.2, h: 1.35, source: 'ajoutee' }], partieBasse: null });
    const r = releveDe(o);
    expect(r.ouvertures.map((x) => [x.id, x.verifieeLe ?? null])).toEqual([['o1', '2026-10-28'], ['o2', '2026-10-29'], ['o3', null]]);
    expect(r.dimensions).toEqual({ largeurM: 10, egoutM: 6, source: 'lidar' });
  });
});

describe('un fichier d avant se rouvre et s edite sans rien perdre (migration, lot F6)', () => {
  it('le temoin du schema 6 (un releve pose par l audit, sa photo restee sur l appareil) : rouvert sans geste, il revient octet pour octet', () => {
    const objets = ouvrir(temoin6.objects, temoin6.meta.schemaVersion);
    const o = objets.find((x) => x.key === 'bati-1');
    const { ctx, s } = service(objets);
    const avant = JSON.stringify(ecrire(objets));
    s.ouvrir('bati-1', 0);
    expect(s.releve()?.texture).toBeNull();
    s.valider({ ouvertures: [...releveDe(o).ouvertures], partieBasse: releveDe(o).partieBasse ?? null });
    expect(ctx.pushHistory).not.toHaveBeenCalled();
    expect(JSON.stringify(ecrire(objets))).toBe(avant);
  });

  it('edite, il garde tout ce que l editeur ne touche pas, se relit a l identique et reste au schema 6', () => {
    const objets = ouvrir(temoin6.objects, temoin6.meta.schemaVersion);
    const o = objets.find((x) => x.key === 'bati-1');
    const avant = structuredClone(releveDe(o));
    const { s } = service(objets);
    s.ouvrir('bati-1', 0);
    // La baie devinee de l'etage est retiree, la fenetre de droite deplacee.
    const [f1, porte, f3] = releveDe(o).ouvertures as [OuvertureFacade, OuvertureFacade, OuvertureFacade];
    s.valider({ ouvertures: [f1, porte, { ...f3, x: 7.6, source: 'corrigee' }], partieBasse: null });
    const apres = releveDe(o);
    // Tout ce que l'editeur ne touche pas : la photo restee sur l'appareil, le calage d'avant (son ecart du contour compris, que la
    // seule migration lit), les seuils de la detection, la distance et sa source, la date.
    for (const k of ['cote', 'largeur', 'hauteur', 'texture', 'photoLocale', 'hauteurTexture', 'distance', 'sourceDistance', 'releveLe', 'partieBasse', 'calage', 'calibration'] as const) expect(apres[k], k).toEqual(avant[k]);
    expect(apres.depuisAudit).toBeUndefined();
    expect(apres.ouvertures.map((x) => [x.type, x.x, x.source])).toEqual([['fenetre', 1.2, 'detectee'], ['porte', 4.4, 'detectee'], ['fenetre', 7.6, 'corrigee']]);
    expect(apres.ouvertures[0]?.details).toEqual({ volets: 'battants', vitrage: 'petits-bois' });
    expect(apres.corrections?.map((c) => c.geste)).toEqual(['deplacement', 'deplacement', 'retrait']);
    // Ecrit puis rouvert : le meme releve ; un releve sans Facade validee reste au schema 6.
    const ecrits = ecrire(objets);
    expect(schemaAEcrire(ecrits, 6)).toBe(6);
    expect(schemaMinimal(ecrits)).toBe(6);
    const relus = ouvrir(ecrits, 6);
    expect(releveDe(relus.find((x) => x.key === 'bati-1'))).toEqual(apres);
    expect(JSON.stringify(ecrire(relus))).toBe(JSON.stringify(ecrits));
  });
});
