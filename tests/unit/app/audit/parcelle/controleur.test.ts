import { describe, it, expect, vi } from 'vitest';
import { creerSessionAuditParcelle, questionRepriseParcelle, textePlanDePrise, type ContexteAuditParcelle } from '../../../../../src/app/audit/parcelle/controleur.js';
import { creerBrouillonParcelle, stockageMemoire } from '../../../../../src/io/brouillonAudit.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { creerEtat } from '../../../../../src/core/state.js';
import { projecteurLocal } from '../../../../../src/geo/projection.js';
import { SansPosition, type PositionGps } from '../../../../../src/shell/geolocalisation.js';
import type { DialogueChoix } from '../../../../../src/shell/dialogues.js';
import type { Facade } from '../../../../../src/facade/geometrie.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La session de l'audit de la parcelle (app/audit/parcelle/controleur.ts), sans reseau ni scene : le
// GPS et la boussole sont simules ; la facade devant vous est reconnue, surlignee et nommee ; la
// photo s'y range ; « Ce n'est pas cette façade » passe a la suivante ; la capture se garde dans le
// brouillon et se reprend.

const ORIGINE = { lat: 48.9, lon: 2.13 };
const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const PHOTO = { type: 'image/jpeg' as const, base64: 'AAAA' };

function quartier(): ObjetPlan[] {
  return [
    obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: ORIGINE.lat, origineLon: ORIGINE.lon } }),
    obj('voisine', { fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true }),
    obj('maison', { fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 6 }),
    obj('garage', { fonction: 'batiment', pts: rect(15, 12, 18, 18), elevation: 3 }),
    obj('chezVoisin', { fonction: 'batiment', pts: rect(20, 5, 30, 15), elevation: 6, voisinage: true, bdtopo: { surParcellePrincipale: false } }),
  ];
}

/** Le GPS a ce point du plan, en degres. */
function gpsEn(p: PtBrut, precisionM = 4): PositionGps {
  const d = projecteurLocal(ORIGINE.lat, ORIGINE.lon).versDegres(p.x, p.y);
  return { lat: d.lat, lon: d.lon, precisionM };
}

function session(plus: Partial<ContexteAuditParcelle> = {}) {
  const etat = creerEtat({ objects: quartier() } as never, (o) => o as never);
  let gps: ((g: PositionGps) => void) | null = null, erreur: ((e: SansPosition) => void) | null = null;
  let boussole: ((c: number) => void) | null = null;
  const surligner = vi.fn<(f: Facade | null) => void>();
  const messages: string[] = [];
  const ctx: ContexteAuditParcelle = {
    etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: (m) => messages.push(m),
    suivre: (f, e) => { gps = f; erreur = e; return () => { gps = null; }; },
    boussole: { suivre: (f) => { boussole = f; return () => { boussole = null; }; }, autoriser: async () => true },
    stockage: null, delaiBrouillonMs: 0, surligner, poserPosition: vi.fn(), retirerPosition: vi.fn(),
    maintenant: () => new Date('2026-10-13T09:00:00Z'), ...plus,
  };
  const s = creerSessionAuditParcelle(ctx);
  return { s, ctx, surligner, messages, gps: (p: PtBrut) => gps?.(gpsEn(p)), cap: (c: number) => boussole?.(c), erreur: (e: SansPosition) => erreur?.(e), actif: () => gps !== null };
}

describe('la facade devant vous', () => {
  it('reconnait la facade sud de la maison, la surligne et la nomme', () => {
    const t = session();
    t.s.reprendre();
    expect(t.s.position().etat).toBe('attente');
    t.gps({ x: 10, y: 3 });
    t.cap(0);
    const c = t.s.cible();
    expect(c?.nom).toBe('la façade sud de maison');
    expect(c?.distance).toBeCloseTo(7, 5);
    expect(c?.choisie).toBe(false);
    expect(c?.plan).toMatch(/^(Une photo suffit|\d photos, de gauche à droite), plus un gros plan du parement/);
    expect(t.surligner).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'Sud' }));
    expect(t.s.position()).toEqual({ etat: 'ok', precisionM: 4, boussole: true });
    expect(t.ctx.poserPosition).toHaveBeenCalled();
  });

  it('range la photo sur la facade reconnue, avec sa prise de vue', () => {
    const t = session();
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    const prise = t.s.prise();
    expect(prise).toMatchObject({ x: 10, y: 3, azimutDeg: 0, sourceAzimut: 'boussole', precisionM: 4 });
    const range = t.s.rangerPhoto({ ...PHOTO, ...(prise ? { prise } : {}) });
    const cote = t.s.cible()?.cote;
    expect(range).toEqual({ cle: 'maison', cote });
    expect(t.s.capture.lire().batiments.maison?.facades[String(cote)]?.photos).toHaveLength(1);
    expect(t.s.dernierRangement()).toBe('Photo rangée sur la façade sud de maison (1 photo).');
    expect(t.s.liste().facadesPhotographiees).toBe(1);
    expect(t.s.liste().peutLancer).toBe(true);
  });

  it('« Ce n est pas cette façade » propose la suivante, puis revient', () => {
    const t = session();
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    const premiere = t.s.cible()?.nom;
    t.s.pasCetteFacade();
    const seconde = t.s.cible()?.nom;
    expect(seconde).toBeTruthy();
    expect(seconde).not.toBe(premiere);
    // Une facade ecartee le reste tant qu'on ne s'est pas deplace.
    t.cap(1); t.cap(30);
    expect(t.s.cible()?.nom).not.toBe(premiere);
    // On s'eloigne de plus de cinq metres : elle redevient possible.
    t.gps({ x: 4, y: 2 });
    t.gps({ x: 10, y: 3 }); t.cap(0);
    expect(t.s.cible()?.nom).toBe(premiere);
  });

  it('range la photo sur la facade choisie dans la liste, sans position', () => {
    const t = session();
    t.s.reprendre();
    t.erreur(new SansPosition('refusee'));
    expect(t.s.position().etat).toBe('refusee');
    expect(t.s.cible()).toBeNull();
    expect(t.s.rangerPhoto(PHOTO)).toBeNull();
    const ouest = t.s.liste().batiments.find((b) => b.cle === 'chezVoisin')?.facades.find((f) => f.facade.orientation === 'Ouest');
    t.s.photographier('chezVoisin', ouest?.cote ?? -1);
    expect(t.s.ecran()).toBe('prise');
    expect(t.ctx.ouvrir3d).toHaveBeenCalled();
    expect(t.s.cible()).toMatchObject({ nom: 'la façade ouest de chezVoisin', choisie: true, distance: null, plan: null });
    expect(t.s.rangerPhoto(PHOTO)).toEqual({ cle: 'chezVoisin', cote: ouest?.cote });
    t.s.suivreLaPosition();
    expect(t.s.cible()).toBeNull();
    expect(t.messages[0]).toMatch(/^Position refusée/);
  });

  it('arrete les capteurs et le surlignage quand l ecran se ferme', () => {
    const t = session();
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.suspendre();
    expect(t.actif()).toBe(false);
    expect(t.surligner).toHaveBeenLastCalledWith(null);
    expect(t.ctx.retirerPosition).toHaveBeenCalled();
    t.s.reprendre();
    expect(t.actif()).toBe(true);
  });
});

describe('la capture et son brouillon', () => {
  it('termine la capture a « Lancer l analyse » et l ecrit dans le brouillon', async () => {
    const stockage = stockageMemoire();
    const t = session({ stockage });
    await t.s.proposerReprise(() => {});
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.rangerPhoto(PHOTO);
    t.s.lancerAnalyse();
    await t.s.ecrireBrouillon();
    expect(t.s.capture.lire().phase).toBe('analyse');
    expect(t.s.capture.lire().finCapture).toBe('2026-10-13T09:00:00.000Z');
    const relu = await creerBrouillonParcelle(stockage).lire('parcelle-78650000AE0101');
    expect(relu?.capture.phase).toBe('analyse');
    expect(t.messages.at(-1)).toMatch(/^Capture terminée/);
    // Rien n'est entre dans le projet.
    expect(t.ctx.etat.objects.find((o) => o.key === 'maison')).not.toHaveProperty('facades');
  });

  it('propose de reprendre la capture restee sur l appareil, ou de la jeter', async () => {
    const stockage = stockageMemoire();
    const ancienne = captureVide('78650000AE0101', new Date('2026-10-12T08:00:00Z'));
    ancienne.batiments.maison = { facades: { '0': { photos: [PHOTO] } }, vu: {}, photos: [] };
    await creerBrouillonParcelle(stockage).ecrire(ancienne);
    let question: DialogueChoix | null = null;
    const t = session({ stockage, questionner: (d) => { question = d; } });
    const pret = vi.fn();
    await t.s.proposerReprise(pret);
    expect(pret).not.toHaveBeenCalled();
    const q = question as DialogueChoix | null;
    expect(q?.principal.libelle).toBe('Reprendre l’audit du 12 octobre');
    q?.principal.executer();
    expect(pret).toHaveBeenCalledOnce();
    expect(t.s.capture.lire().debut).toBe('2026-10-12T08:00:00.000Z');
    expect(t.s.liste().facadesPhotographiees).toBe(1);
  });
});

describe('les textes', () => {
  it('dit combien de photos il faut pour un mur', () => {
    const f = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: 9, y: 0 }, largeur: 9, hauteur: 6, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
    expect(textePlanDePrise(f, 12)).toBe('Une photo suffit, plus un gros plan du parement.');
    expect(textePlanDePrise({ ...f, largeur: 30, droite: { x: 30, y: 0 } }, 6)).toMatch(/^\d photos, de gauche à droite, plus un gros plan du parement/);
  });

  it('nomme le jour et ce qui est garde dans la question de reprise', () => {
    const c = captureVide('x', new Date('2026-10-01T08:00:00'));
    c.batiments.b = { facades: { '0': { photos: [PHOTO, PHOTO] } }, vu: {}, photos: [] };
    c.phase = 'analyse';
    const q = questionRepriseParcelle(c, () => {}, () => {}, () => {});
    expect(q.texte).toBe('L’audit commencé le 1er octobre est gardé sur cet appareil : 2 photos, capture terminée.');
    expect(q.secondaire.libelle).toBe('Le jeter');
  });
});
