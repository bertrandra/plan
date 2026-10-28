import { describe, it, expect, vi } from 'vitest';
import { creerSessionAuditParcelle, questionRepriseParcelle, textePlanDePrise, DELAI_ENSEMBLE_MS, type ContexteAuditParcelle } from '../../../../../src/app/audit/parcelle/controleur.js';
import { CHAMP_ENSEMBLE_DEG, PAUSE_GESTE_MS } from '../../../../../src/app/audit/parcelle/vuePrise.js';
import { creerBrouillonParcelle, stockageMemoire } from '../../../../../src/io/brouillonAudit.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { creerEtat } from '../../../../../src/core/state.js';
import { projecteurLocal } from '../../../../../src/geo/projection.js';
import { SansPosition, type PositionGps } from '../../../../../src/shell/geolocalisation.js';
import type { DialogueChoix } from '../../../../../src/shell/dialogues.js';
import type { Facade } from '../../../../../src/facade/geometrie.js';
import { ROUGE_FACADE, VERT_FACADE } from '../../../../../src/three/facadeDevant3d.js';
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
  const surligner = vi.fn<(f: Facade | null, teinte: number) => void>();
  const messages: string[] = [];
  const ctx: ContexteAuditParcelle = {
    etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: (m) => messages.push(m),
    suivre: (f, e) => { gps = f; erreur = e; return () => { gps = null; }; },
    boussole: { suivre: (f) => { boussole = f; return () => { boussole = null; }; }, autoriser: async () => true },
    stockage: null, delaiBrouillonMs: 0, surligner, poserPosition: vi.fn(), retirerPosition: vi.fn(),
    maintenant: () => new Date('2026-10-13T09:00:00Z'), ...plus,
  };
  const s = creerSessionAuditParcelle(ctx);
  // Une position toutes les dix secondes : on a eu le temps de marcher jusqu'a la suivante, le
  // lissage (positionFiltree.ts) la suit presque entierement.
  let t = 0;
  return { s, ctx, surligner, messages, gps: (p: PtBrut) => gps?.({ ...gpsEn(p), t: (t += 10000) }), cap: (c: number) => boussole?.(c), erreur: (e: SansPosition) => erreur?.(e), actif: () => gps !== null };
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
    expect(t.surligner).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'Sud' }), ROUGE_FACADE);
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

  it('ne propose jamais d elle-meme la facade d un mitoyen, meme droit devant (essai d AE 101)', () => {
    const t = session();
    t.s.reprendre();
    // Sur la parcelle, a 4 m du mur ouest du voisin, face a lui (cap est) : il n'est pas reconnu.
    t.gps({ x: 16, y: 8 }); t.cap(90);
    expect(t.s.cible()?.cle).not.toBe('chezVoisin');
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
    const ouest = t.s.liste().batiments.find((b) => b.cle === 'maison')?.facades.find((f) => f.facade.orientation === 'Ouest');
    t.s.photographier('maison', ouest?.cote ?? -1);
    expect(t.s.ecran()).toBe('prise');
    expect(t.ctx.ouvrir3d).toHaveBeenCalled();
    expect(t.s.cible()).toMatchObject({ nom: 'la façade ouest de maison', choisie: true, distance: null, plan: null });
    expect(t.s.rangerPhoto(PHOTO)).toEqual({ cle: 'maison', cote: ouest?.cote });
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
    expect(t.surligner).toHaveBeenLastCalledWith(null, ROUGE_FACADE);
    expect(t.ctx.retirerPosition).toHaveBeenCalled();
    t.s.reprendre();
    expect(t.actif()).toBe(true);
  });
});

describe('la Vue 3D de la prise', () => {
  const vue = () => ({ poser: vi.fn<(pose: unknown) => boolean>(() => true) });

  it('suit votre position et votre cap a hauteur d homme, seulement pendant la prise', () => {
    const v = vue();
    const t = session({ vue: v });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    expect(v.poser).not.toHaveBeenCalled();
    t.s.montrer('prise');
    expect(v.poser).toHaveBeenCalled();
    const avant = v.poser.mock.calls.length;
    t.cap(40);
    t.gps({ x: 11, y: 3 });
    expect(v.poser.mock.calls.length).toBeGreaterThan(avant);
    const derniere = v.poser.mock.calls.at(-1)?.[0] as { oeil: PtBrut; vise: PtBrut; hauteurOeil: number };
    expect(derniere.hauteurOeil).toBeCloseTo(1.7);
    // Cap de 40 degres : la camera est derriere vous, au sud-ouest.
    expect(derniere.oeil.x).toBeLessThan(11);
    expect(derniere.oeil.y).toBeLessThan(3);
    t.s.montrer('liste');
    const n = v.poser.mock.calls.length;
    t.cap(80);
    expect(v.poser.mock.calls.length).toBe(n);
  });

  it('attend un moment apres un geste du doigt, sans perdre la facade', () => {
    let maintenant = 0;
    const v = vue();
    const t = session({ vue: v, horloge: () => maintenant });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.lacherVue();
    const n = v.poser.mock.calls.length;
    t.cap(30);
    expect(v.poser.mock.calls.length).toBe(n);
    maintenant = 60_000;
    t.cap(60);
    expect(v.poser.mock.calls.length).toBeGreaterThan(n);
  });

  it('choisit la facade touchee dans la 3D, et la passe en rouge', () => {
    const v = vue();
    const objetSous = vi.fn(() => ({ cle: 'maison', point: { x: 10, y: 19.8 } as PtBrut }));
    const t = session({ vue: v, objetSous });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    expect(t.s.cible()?.nom).toBe('la façade sud de maison');
    t.s.toucher({ x: 0, y: 0 });
    expect(t.s.cible()).toMatchObject({ nom: 'la façade nord de maison', choisie: true });
    expect(t.surligner).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'Nord' }), ROUGE_FACADE);
    t.s.suivreLaPosition();
    expect(t.s.cible()?.nom).toBe('la façade sud de maison');
  });

  it('passe en vert les facades photographiees pendant la prise, et les laisse reprendre', () => {
    const surlignerFaites = vi.fn<(m: Facade[]) => void>();
    const t = session({ vue: vue(), surlignerFaites });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    expect(surlignerFaites).toHaveBeenLastCalledWith([]);
    expect(t.surligner).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'Sud' }), ROUGE_FACADE);
    t.s.rangerPhoto(PHOTO);
    // Visee et photographiee : elle passe au vert par son propre surlignage (rouge sur vert faisait
    // du brun), et n'est pas doublee dans les facades faites.
    expect(t.surligner).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'Sud' }), VERT_FACADE);
    expect(surlignerFaites).toHaveBeenLastCalledWith([]);
    // La facade verte reste reconnue : une deuxieme photo s'y range.
    expect(t.s.cible()?.nom).toBe('la façade sud de maison');
    expect(t.s.rangerPhoto(PHOTO)).not.toBeNull();
    expect(t.s.cible()?.photos).toBe(2);
    // Une autre facade visee : la sud rejoint les facades vertes.
    t.gps({ x: 0.5, y: 15 }); t.cap(90);
    expect(t.s.cible()?.nom).toBe('la façade ouest de maison');
    expect(surlignerFaites).toHaveBeenLastCalledWith([expect.objectContaining({ orientation: 'Sud' })]);
    t.s.montrer('liste');
    expect(surlignerFaites).toHaveBeenLastCalledWith([]);
  });

  it('traverse un arbre devant la facade : seule compte la premiere facade de la liste', () => {
    // Le rayon touche d'abord l'arbre, puis le mur nord de la maison.
    const traverses = [{ cle: 'arbre', point: { x: 10, y: 22 } }, { cle: 'maison', point: { x: 10, y: 19.9 } }];
    const objetSous = vi.fn((_: unknown, retenir: (cle: string) => boolean) => traverses.find((t) => retenir(t.cle)) ?? { cle: null, point: null });
    const t = session({ vue: vue(), objetSous });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    expect(t.s.cible()).toMatchObject({ nom: 'la façade nord de maison', choisie: true });
  });

  it('dit quand le batiment touche n est pas dans la liste, et ne fait rien hors de la prise', () => {
    const objetSous = vi.fn(() => ({ cle: 'inconnu', point: { x: 0, y: 0 } as PtBrut }));
    const t = session({ vue: vue(), objetSous });
    t.s.reprendre();
    t.s.toucher({ x: 0, y: 0 });
    expect(objetSous).not.toHaveBeenCalled();
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    expect(t.messages.at(-1)).toBe('Ce bâtiment n’est pas dans la liste de la parcelle.');
  });
});

describe('la vue epuree et la vue d ensemble (second essai d AE 101)', () => {
  const vue = () => ({ poser: vi.fn<(pose: unknown) => boolean>(() => true), rapportVisible: () => 0.8, azimut: () => 0 });
  type Pose = { oeil: PtBrut; hauteurOeil: number; champ?: number };
  const derniere = (v: ReturnType<typeof vue>) => v.poser.mock.calls.at(-1)?.[0] as Pose;

  it('ne garde que les batiments de la parcelle et le sol tant que l audit est ouvert, sans toucher au projet', () => {
    const epurer = vi.fn<(g: ((cle: string) => boolean) | null) => void>();
    const t = session({ vue: vue(), epurer });
    const avant = JSON.stringify(t.ctx.etat.objects);
    t.s.reprendre();
    t.s.montrer('liste');
    const garder = epurer.mock.calls.at(-1)?.[0];
    expect(garder).toBeTypeOf('function');
    expect(['maison', 'garage', 'parcelle', 'voisine'].every((c) => garder?.(c))).toBe(true);
    // Ni les voisins, ni les arbres, ni rien d'autre du plan.
    expect(garder?.('chezVoisin')).toBe(false);
    expect(garder?.('arbre')).toBe(false);
    // La maison voisine n'est pas dans la liste : rien ne la fait apparaitre.
    expect(t.s.liste().batiments.map((b) => b.cle)).toEqual(['maison', 'garage']);
    // L'audit ferme : tout revient, et le projet n'a pas bouge.
    t.s.suspendre();
    expect(epurer).toHaveBeenLastCalledWith(null);
    expect(JSON.stringify(t.ctx.etat.objects)).toBe(avant);
  });

  it('montre tout le batiment en grand angle tant que rien n est vise, a hauteur d homme devant une facade', () => {
    let maintenant = 0;
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), horloge: () => maintenant });
    t.s.reprendre();
    t.s.montrer('prise');
    // Sans position : la vue d'ensemble.
    expect(derniere(v).champ).toBe(CHAMP_ENSEMBLE_DEG);
    expect(derniere(v).hauteurOeil).toBeGreaterThan(5);
    // Devant la facade sud : a hauteur d'homme.
    t.gps({ x: 10, y: 3 }); t.cap(0);
    expect(t.s.cible()?.nom).toBe('la façade sud de maison');
    expect(derniere(v).hauteurOeil).toBeCloseTo(1.7);
    // Trop loin de toute facade : la vue a hauteur d'homme reste un moment, puis passe a la vue d'ensemble.
    t.gps({ x: 10, y: -45 }); t.gps({ x: 10, y: -45 }); t.gps({ x: 10, y: -45 });
    expect(t.s.cible()).toBeNull();
    expect(derniere(v).hauteurOeil).toBeCloseTo(1.7);
    maintenant += DELAI_ENSEMBLE_MS + 1;
    t.cap(5);
    expect(derniere(v).champ).toBe(CHAMP_ENSEMBLE_DEG);
    // Regard depuis votre position (au sud) vers la maison : la camera est au sud.
    expect(derniere(v).oeil.y).toBeLessThan(10);
    // En vue d'ensemble, la boussole ne la fait plus bouger : le doigt la tourne librement.
    const n = v.poser.mock.calls.length;
    t.cap(40);
    expect(v.poser.mock.calls.length).toBe(n);
  });

  it('renforce le trait de la facade visee de pres, l attenue en reculant, le retire en vue d ensemble', () => {
    const trait = vi.fn<(cle: string | null, force: number) => void>();
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), trait });
    t.s.reprendre();
    t.s.montrer('prise');
    expect(trait.mock.calls.every(([cle]) => cle === null)).toBe(true);
    // A 3,5 m de la facade sud : trait plein, sur la maison.
    t.gps({ x: 10, y: 6.5 }); t.gps({ x: 10, y: 6.5 }); t.cap(0);
    expect(t.s.cible()?.nom).toBe('la façade sud de maison');
    expect(trait).toHaveBeenLastCalledWith('maison', 1);
    // A 7 m : plus faible ; a 13 m : retire.
    t.gps({ x: 10, y: 3 }); t.gps({ x: 10, y: 3 }); t.gps({ x: 10, y: 3 });
    const [cle, force] = trait.mock.calls.at(-1) ?? [];
    expect(cle).toBe('maison');
    expect(force).toBeGreaterThan(0);
    expect(force).toBeLessThan(1);
    // L'audit ferme : le trait part.
    t.s.suspendre();
    expect(trait).toHaveBeenLastCalledWith(null, 0);
  });

  it('cadre la parcelle en vue d ensemble pendant les propositions', () => {
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn() });
    t.s.reprendre();
    t.s.montrer('propositions');
    expect(derniere(v).champ).toBe(CHAMP_ENSEMBLE_DEG);
    t.s.montrer('liste');
    const n = v.poser.mock.calls.length;
    t.s.cadrerVue({ haut: 400, gauche: 16 });
    expect(v.poser.mock.calls.length).toBe(n);
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

describe('le verrou d un batiment pour la prise (annexe sur la parcelle)', () => {
  it('ne vise plus que le batiment verrouille, et rend la main sur demande', () => {
    const t = session({ epurer: vi.fn() });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    expect(t.s.cible()?.cle).toBe('maison');
    expect(t.s.verrou()).toBeNull();
    t.s.verrouiller('garage');
    expect(t.s.verrou()).toBe('garage');
    // La maison est en face, mais verrouillee ailleurs : elle n'est plus proposee.
    expect(t.s.cible()?.cle ?? 'garage').toBe('garage');
    t.s.verrouiller(null);
    expect(t.s.verrou()).toBeNull();
    expect(t.s.cible()?.cle).toBe('maison');
  });

  it('refuse un batiment qui n est pas de la liste, et suit un choix explicite chez l autre', () => {
    const t = session({ epurer: vi.fn() });
    t.s.reprendre();
    t.s.verrouiller('chezVoisin');
    expect(t.s.verrou()).toBeNull();
    t.s.verrouiller('garage');
    const sud = t.s.liste().batiments.find((b) => b.cle === 'maison')?.facades.find((f) => f.facade.orientation === 'Sud');
    // Choisir une facade de la maison dans la liste, c'est choisir la maison : le verrou la suit.
    t.s.photographier('maison', sud?.cote ?? -1);
    expect(t.s.verrou()).toBe('maison');
    expect(t.s.cible()?.cle).toBe('maison');
  });

  it('n affiche que le batiment verrouille dans la Vue 3D, et le sol', () => {
    const epurer = vi.fn<(g: ((cle: string) => boolean) | null) => void>();
    const t = session({ vue: { poser: vi.fn(() => true), rapportVisible: () => 0.8, azimut: () => 0 }, epurer });
    t.s.reprendre();
    t.s.montrer('prise');
    t.s.verrouiller('garage');
    const garder = epurer.mock.calls.at(-1)?.[0];
    expect(garder?.('garage')).toBe(true);
    expect(garder?.('maison')).toBe(false);
    expect(garder?.('parcelle')).toBe(true);
    t.s.verrouiller(null);
    expect(epurer.mock.calls.at(-1)?.[0]?.('maison')).toBe(true);
  });

  it('ne masque rien hors de la prise : les rendus pour Claude se dessinent sur cette scene epuree', () => {
    const epurer = vi.fn<(g: ((cle: string) => boolean) | null) => void>();
    const t = session({ vue: { poser: vi.fn(() => true), rapportVisible: () => 0.8, azimut: () => 0 }, epurer });
    t.s.reprendre();
    t.s.montrer('prise');
    t.s.verrouiller('garage');
    expect(epurer.mock.calls.at(-1)?.[0]?.('maison')).toBe(false);
    // De retour a la liste (puis a l'analyse), toutes les maisons de la parcelle sont la, le verrou reste pose pour la prochaine prise.
    t.s.montrer('liste');
    const garder = epurer.mock.calls.at(-1)?.[0];
    expect(['maison', 'garage', 'parcelle'].every((c) => garder?.(c))).toBe(true);
    expect(garder?.('chezVoisin')).toBe(false);
    expect(garder?.('arbre')).toBe(false);
    expect(t.s.verrou()).toBe('garage');
    t.s.montrer('prise');
    expect(epurer.mock.calls.at(-1)?.[0]?.('maison')).toBe(false);
  });

  it('tombe quand l ecran se ferme : la prochaine visite repart sans verrou', () => {
    const t = session({ epurer: vi.fn() });
    t.s.reprendre();
    t.s.verrouiller('garage');
    t.s.suspendre();
    expect(t.s.verrou()).toBeNull();
  });
});

describe('la vue fixee sur une facade choisie (16 octobre)', () => {
  type Pose = { oeil: PtBrut; hauteurOeil: number; vise: PtBrut; hauteurVise: number };
  const CENTRE = { x: 10, y: 15 };
  const vue = (azimut = 0) => ({ poser: vi.fn<(pose: unknown) => boolean>(() => true), rapportVisible: () => 0.8, azimut: () => azimut, verrouiller: vi.fn<(oui: boolean, polaire?: number) => void>(), arreter: vi.fn() });
  const derniere = (v: ReturnType<typeof vue>) => v.poser.mock.calls.at(-1)?.[0] as Pose;
  const loin = (o: PtBrut) => Math.hypot(o.x - CENTRE.x, o.y - CENTRE.y);
  const toucheNord = () => vi.fn(() => ({ cle: 'maison', point: { x: 10, y: 19.8 } as PtBrut }));

  it('la camera se fixe face a la facade touchee, a distance fixe, sans suivre le GPS', () => {
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), objetSous: toucheNord() });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    expect(t.s.cible()).toMatchObject({ nom: 'la façade nord de maison', choisie: true });
    const p = derniere(v);
    // Le regard va du nord vers le sud, sur le centre du batiment : la camera est au nord, de face (elevation).
    expect(p.vise.x).toBeCloseTo(CENTRE.x, 6);
    expect(p.vise.y).toBeCloseTo(CENTRE.y, 6);
    expect(p.oeil.x).toBeCloseTo(CENTRE.x, 6);
    expect(p.oeil.y).toBeGreaterThan(CENTRE.y);
    // Perpendiculaire au mur : l'oeil est a la hauteur du point vise, regard horizontal, inclinaison figee.
    expect(p.hauteurOeil).toBeCloseTo(p.hauteurVise, 6);
    expect(v.verrouiller).toHaveBeenLastCalledWith(true, expect.closeTo(Math.PI / 2, 6));
    // Le marcheur s'eloigne ou se rapproche du batiment, sans en faire le tour : la camera ne bouge pas.
    const n = v.poser.mock.calls.length;
    t.gps({ x: 10, y: 0 }); t.gps({ x: 10, y: 0 }); t.gps({ x: 10, y: 0 });
    t.cap(40); t.cap(80);
    expect(v.poser.mock.calls.length).toBe(n);
  });

  it('marcher autour du batiment fait defiler les facades : la camera tourne d\'autant, a distance fixe', () => {
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), objetSous: toucheNord() });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    const avant = derniere(v);
    // Du sud a l'est du batiment : un quart de tour, dans le sens de la boussole.
    for (let i = 0; i < 5; i++) t.gps({ x: 24, y: 15 });
    const apres = derniere(v);
    expect(loin(apres.oeil)).toBeCloseTo(loin(avant.oeil), 6);
    expect(apres.hauteurOeil).toBeCloseTo(avant.hauteurOeil, 6);
    // Le marcheur est passe de l'angle 180 a 90 : le regard, de 180 a 90 (vers l'est), la camera a l'ouest.
    expect(apres.oeil.x).toBeLessThan(CENTRE.x - 3);
    expect(Math.abs(apres.oeil.y - CENTRE.y)).toBeLessThan(loin(apres.oeil) * 0.4);
  });

  it('sans GPS, ou avec un GPS trop imprecis, seul le doigt tourne la vue', () => {
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), objetSous: toucheNord() });
    t.s.reprendre();
    t.erreur(new SansPosition('refusee'));
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    // La facade touchee fixe la vue meme sans position.
    expect(derniere(v).oeil.y).toBeGreaterThan(CENTRE.y);
    const n = v.poser.mock.calls.length;
    t.cap(120); t.cap(200);
    expect(v.poser.mock.calls.length).toBe(n);
  });

  it('un doigt prend la main ; la pause finie, la rotation repart de ou il l a laissee', () => {
    let maintenant = 1000;
    const v = vue(270);
    const t = session({ vue: v, epurer: vi.fn(), objetSous: toucheNord(), horloge: () => maintenant });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    t.s.lacherVue();
    const n = v.poser.mock.calls.length;
    for (let i = 0; i < 5; i++) t.gps({ x: 24, y: 15 });
    expect(v.poser.mock.calls.length).toBe(n);
    maintenant += PAUSE_GESTE_MS + 1;
    t.gps({ x: 24, y: 16 }); t.gps({ x: 24, y: 15 });
    // Le doigt a laisse la camera regarder vers l'ouest (270) : elle est a l'est du batiment, et les
    // pas faits pendant la pause ne tournent pas la vue une seconde fois.
    const p = derniere(v);
    expect(p.oeil.x).toBeGreaterThan(CENTRE.x + 3);
    expect(Math.abs(p.oeil.y - CENTRE.y)).toBeLessThan(loin(p.oeil) * 0.2);
  });

  it('« Me suivre » rend la camera : l\'axe est libere et la vue reprend la position', () => {
    const v = vue();
    const t = session({ vue: v, epurer: vi.fn(), objetSous: toucheNord() });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    expect(v.verrouiller).toHaveBeenLastCalledWith(true, expect.anything());
    t.s.suivreLaPosition();
    expect(t.s.cible()?.choisie).toBe(false);
    expect(v.verrouiller).toHaveBeenLastCalledWith(false);
  });

  it('choisir une autre facade repart face a elle', () => {
    const v = vue();
    let point: PtBrut = { x: 10, y: 19.8 };
    const t = session({ vue: v, epurer: vi.fn(), objetSous: vi.fn(() => ({ cle: 'maison', point })) });
    t.s.reprendre();
    t.gps({ x: 10, y: 3 }); t.cap(0);
    t.s.montrer('prise');
    t.s.toucher({ x: 0, y: 0 });
    expect(derniere(v).oeil.y).toBeGreaterThan(CENTRE.y);
    point = { x: 5.2, y: 15 };
    t.s.toucher({ x: 0, y: 0 });
    expect(t.s.cible()?.nom).toBe('la façade ouest de maison');
    expect(derniere(v).oeil.x).toBeLessThan(CENTRE.x);
  });
});

describe('les facades notees quand le contour change', () => {
  it('un sommet ajoute entre deux visites : les photos restent sur leur mur ; un autre projet ouvert n y touche pas', () => {
    const t = session();
    t.s.reprendre();
    t.s.capture.ajouterPhotoFacade('maison', 2, { ...PHOTO });
    // L'ecran se ferme : le contour sur lequel le rang 2 a ete compte est garde.
    t.s.suspendre();
    expect(t.s.capture.lire().batiments.maison?.contour).toEqual(rect(5, 10, 15, 20));
    // Dans le plan, un sommet sur le cote sud (rang 0) : le mur nord passe au rang 3.
    const maison = t.ctx.etat.objects.find((o) => o.key === 'maison') as ObjetPlan & { pts: PtBrut[] };
    maison.pts.splice(1, 0, { x: 8, y: 10 });
    t.s.reprendre();
    expect(Object.keys(t.s.capture.lire().batiments.maison?.facades ?? {})).toEqual(['3']);
    expect(t.s.liste().batiments.find((b) => b.cle === 'maison')?.facades.find((f) => f.cote === 3)?.statut).toBe('photographiee');
    // Un autre projet (une autre parcelle) : la capture ne suit pas ses contours.
    t.s.suspendre();
    t.ctx.etat.objects = t.ctx.etat.objects.map((o) => (o.key === 'parcelle' ? { ...o, cadastre: { idu: 'AUTRE', origineLat: 1, origineLon: 1 } } : o.key === 'maison' ? { ...o, pts: rect(5, 10, 15, 20) } : o)) as ObjetPlan[];
    t.s.reprendre();
    expect(Object.keys(t.s.capture.lire().batiments.maison?.facades ?? {})).toEqual(['3']);
  });
});
