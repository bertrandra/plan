// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { creerControleurAudit, brancherDoigtAudit, PRECISION_DEPART_MAX_M, type ContexteAudit, type ControleurAudit } from '../../../../src/app/audit/controleur.js';
import { questionReprise, jourDe } from '../../../../src/app/audit/reprise.js';
import { stockageMemoire } from '../../../../src/io/brouillonAudit.js';
import type { DialogueChoix } from '../../../../src/shell/dialogues.js';
import { SansPosition, type PositionGps } from '../../../../src/shell/geolocalisation.js';
import { creerEtat } from '../../../../src/core/state.js';
import { parcours } from '../../../../src/app/parcours.js';
import type { FichierPromenade } from '../../../../src/model/audit.js';

// Le controleur du mode audit, sans reseau ni scene : le depart attend un GPS precis, une adresse
// introuvable le dit, le fichier se partage sous son nom, et le doigt distingue tapotement, appui
// long et glisser.

function contexte(plus: Partial<ContexteAudit> = {}) {
  const etat = creerEtat({ objects: [] } as never, (o) => o as never);
  const messages: string[] = [];
  const ctx: ContexteAudit = {
    etat, remplacerObjets: vi.fn(), reconstruire3d: vi.fn(), repeindre3d: vi.fn(), ouvrir3d: vi.fn(), notifier: vi.fn(),
    signaler: (m) => messages.push(m), boussole: { suivre: () => () => {}, autoriser: async () => false }, ...plus,
  };
  return { ctx, etat, messages };
}

describe('le depart du mode audit', () => {
  it('attend un GPS precis, sans rien demander au cadastre', () => {
    let sur: ((p: PositionGps) => void) | null = null;
    const interrogerCadastre = vi.fn();
    const { ctx, etat } = contexte({ suivre: (f) => { sur = f; return () => {}; }, chargement: { interrogerCadastre } });
    creerControleurAudit(ctx, { depart: null });
    expect(ctx.ouvrir3d).toHaveBeenCalledOnce();
    expect(etat.audit?.statut).toMatch(/En attente d’un GPS précis/);
    sur!({ lat: 48.9, lon: 2.15, precisionM: PRECISION_DEPART_MAX_M + 20 });
    expect(etat.audit?.statut).toContain('± 50 m');
    expect(interrogerCadastre).not.toHaveBeenCalled();
  });

  it('dit un refus de localisation', () => {
    const { ctx, etat, messages } = contexte({ suivre: (_f, erreur) => { erreur(new SansPosition('refusee')); return () => {}; } });
    creerControleurAudit(ctx, { depart: null });
    expect(messages[0]).toMatch(/autorisez la localisation/);
    expect(etat.audit?.statut).toBe('Position refusée.');
  });

  it('dit une adresse de depart introuvable, ou sans parcelle', async () => {
    const a = contexte({ geocoder: async () => [] });
    creerControleurAudit(a.ctx, { depart: 'nulle part' });
    await vi.waitFor(() => expect(a.etat.audit?.statut).toBe('Adresse de départ introuvable.'));

    const b = contexte({
      geocoder: async () => [{ lon: 2.15, lat: 48.9, label: '2 allée des Limites' }] as never,
      chargement: { interrogerCadastre: async () => [] },
    });
    creerControleurAudit(b.ctx, { depart: '2 allée des Limites' });
    await vi.waitFor(() => expect(b.etat.audit?.statut).toBe('Aucune parcelle trouvée ici.'));
    expect(b.ctx.remplacerObjets).not.toHaveBeenCalled();
  });
});

describe('le partage de la promenade', () => {
  it('un seul fichier, nomme d apres le debut et la commune', async () => {
    let envoye: { nom: string; contenu: string } | null = null;
    const { ctx, etat, messages } = contexte({
      suivre: () => () => {},
      partager: async (nom, contenu) => { envoye = { nom, contenu }; return 'telecharge'; },
    });
    etat.objects.push({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      cadastre: { origineLat: 48.9, origineLon: 2.15, commune: 'Le Vésinet' } } as never);
    const c = creerControleurAudit(ctx, { depart: null });
    await c.partager();
    expect(envoye!.nom).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{4}-le-vesinet\.json$/);
    const f = JSON.parse(envoye!.contenu) as FichierPromenade;
    expect(f.format).toBe('plan-audit');
    expect(f.promenade.origine).toEqual({ lat: 48.9, lon: 2.15 });
    expect(f.promenade.emprise).toEqual({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
    expect(messages.at(-1)).toContain('téléchargé');
  });

  it('la liste de fin s ouvre en parcours, et mene au partage', () => {
    const { ctx } = contexte({ suivre: () => () => {} });
    const c = creerControleurAudit(ctx, { depart: null });
    c.ouvrirListe();
    expect(parcours.courant()?.type).toBe('auditFin');
    parcours.fermer();
  });
});

describe('le doigt sur la Vue 3D', () => {
  function monter() {
    const hote = document.createElement('div');
    const toile = document.createElement('canvas');
    hote.appendChild(toile);
    document.body.appendChild(hote);
    const c = { tapoter: vi.fn(), appuiLong: vi.fn(), lacherSuivi: vi.fn() } as unknown as ControleurAudit;
    brancherDoigtAudit(c, hote);
    const geste = (type: string, x: number, y: number, doigt = 1) =>
      toile.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: doigt }));
    return { c, geste };
  }

  it('un tapotement, un appui long, un glisser qui libere la camera', () => {
    vi.useFakeTimers();
    try {
      const { c, geste } = monter();
      geste('pointerdown', 10, 10); geste('pointerup', 11, 10);
      expect(c.tapoter).toHaveBeenCalledOnce();

      geste('pointerdown', 10, 10); vi.advanceTimersByTime(700); geste('pointerup', 10, 10);
      expect(c.appuiLong).toHaveBeenCalledOnce();
      expect(c.tapoter).toHaveBeenCalledOnce();

      // Un minuteur en retard (fil occupe) : la duree de l'appui suffit.
      const minuteur = vi.spyOn(window, 'setTimeout').mockImplementation((() => 0) as never);
      const t = Date.now();
      geste('pointerdown', 10, 10); vi.setSystemTime(t + 900); geste('pointerup', 10, 10);
      minuteur.mockRestore();
      expect(c.appuiLong).toHaveBeenCalledTimes(2);
      expect(c.tapoter).toHaveBeenCalledOnce();

      geste('pointerdown', 10, 10); geste('pointermove', 40, 10); vi.advanceTimersByTime(700); geste('pointerup', 40, 10);
      expect(c.lacherSuivi).toHaveBeenCalledOnce();
      expect(c.appuiLong).toHaveBeenCalledTimes(2);
      expect(c.tapoter).toHaveBeenCalledOnce();

      // Deux doigts : un pincement (zoom). Le cap reste suivi, rien n'est tapote ni ouvert.
      geste('pointerdown', 10, 10, 1); geste('pointerdown', 60, 10, 2); geste('pointermove', 0, 10, 1); geste('pointermove', 80, 10, 2);
      vi.advanceTimersByTime(700); geste('pointerup', 0, 10, 1); geste('pointerup', 80, 10, 2);
      expect(c.lacherSuivi).toHaveBeenCalledOnce();
      expect(c.appuiLong).toHaveBeenCalledTimes(2);
      expect(c.tapoter).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

describe('le cap et la photo', () => {
  it('la photo garde la position et le cap de la boussole ; sans boussole, le sens de la marche', async () => {
    let cap: ((c: number) => void) | null = null;
    const { ctx } = contexte({ suivre: () => () => {}, boussole: { suivre: (f) => { cap = f; return () => {}; }, autoriser: async () => true } });
    const c = creerControleurAudit(ctx, { depart: null });
    expect(c.prisePhoto()).toBeNull();
    c.nouvellePosition({ x: 0, y: 0 }, 5);
    c.nouvellePosition({ x: 0, y: 10 }, 5);
    expect(c.prisePhoto()).toMatchObject({ x: 0, y: 10, precisionM: 5, azimutDeg: 0, sourceAzimut: 'deplacement' });
    cap!(250);
    expect(c.prisePhoto()).toMatchObject({ azimutDeg: 250, sourceAzimut: 'boussole' });
  });

  it('la photo garde l inclinaison et le roulis du telephone, null sans capteur', () => {
    let attitude: ((a: { inclinaisonDeg: number; roulisDeg: number | null }) => void) | undefined;
    const { ctx } = contexte({ suivre: () => () => {}, boussole: { suivre: (_f, g) => { attitude = g; return () => {}; }, autoriser: async () => true } });
    const c = creerControleurAudit(ctx, { depart: null });
    c.nouvellePosition({ x: 0, y: 0 }, 5);
    expect(c.prisePhoto()).toMatchObject({ inclinaisonDeg: null, roulisDeg: null });
    attitude!({ inclinaisonDeg: 4, roulisDeg: -2 });
    expect(c.prisePhoto()).toMatchObject({ inclinaisonDeg: 4, roulisDeg: -2 });
  });

  it('un glisser lache le cap, « Me suivre » le reprend', () => {
    const { ctx, etat } = contexte({ suivre: () => () => {} });
    const c = creerControleurAudit(ctx, { depart: null });
    expect(etat.audit?.suivre).toBe(true);
    c.lacherSuivi();
    expect(etat.audit?.suivre).toBe(false);
    c.reprendreSuivi();
    expect(etat.audit?.suivre).toBe(true);
  });
});

describe('le brouillon de la promenade (spec §10)', () => {
  const maison = { key: 'bati-1', type: 'polygon', fonction: 'batiment', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }] };
  const PHOTO = { type: 'image/jpeg' as const, base64: 'QUJD'.repeat(100) };

  /** Une premiere visite : un batiment marque, une note, une photo, puis l'onglet est tue. */
  async function premiereVisite(stockage: ReturnType<typeof stockageMemoire>) {
    const { ctx, etat } = contexte({ suivre: () => () => {}, stockageBrouillon: stockage, questionner: vi.fn() });
    etat.objects.push(maison as never);
    const c = creerControleurAudit(ctx, { depart: null });
    c.promenade.marquer('bati-1', { x: 4, y: -2 }, 5);
    c.promenade.completer('bati-1', { note: 'faîtage parallèle à la rue', ajouterPhoto: PHOTO });
    expect(await c.ecrireBrouillon()).toBe(true);
    c.arreter();
    // La promenade suivante doit commencer a une autre milliseconde : son identifiant est son debut.
    await new Promise((r) => setTimeout(r, 3));
    return c.promenade.debut;
  }

  /** La reouverture : la question est posee, le GPS attend la reponse. */
  function reouverture(stockage: ReturnType<typeof stockageMemoire>, plus: Partial<ContexteAudit> = {}) {
    let sur: ((p: PositionGps) => void) | null = null;
    const questions: DialogueChoix[] = [];
    const interrogerCadastre = vi.fn(async () => []);
    const r = contexte({ suivre: (f) => { sur = f; return () => {}; }, stockageBrouillon: stockage, questionner: (d) => questions.push(d), chargement: { interrogerCadastre }, ...plus });
    const c = creerControleurAudit(r.ctx, { depart: null });
    return { ...r, c, questions, interrogerCadastre, gps: (p: PositionGps) => sur!(p) };
  }

  it('reprend l audit apres un rechargement : cas, note, photo et debut', async () => {
    const stockage = stockageMemoire();
    const debut = await premiereVisite(stockage);
    const r = reouverture(stockage);
    await vi.waitFor(() => expect(r.questions).toHaveLength(1));
    const q = r.questions[0]!;
    expect(q.principal.libelle).toBe('Reprendre l’audit du ' + jourDe(debut));
    expect(q.secondaire.libelle).toBe('Le jeter');
    expect(q.texte).toContain('1 cas noté, 1 photo');
    expect(r.etat.audit?.statut).toBe('Un audit en cours attend votre réponse.');

    // Le GPS arrive avant la reponse : le depart attend.
    r.gps({ lat: 48.9, lon: 2.15, precisionM: 5 });
    await Promise.resolve();
    expect(r.interrogerCadastre).not.toHaveBeenCalled();

    q.principal.executer();
    await vi.waitFor(() => expect(r.messages.at(-1)).toMatch(/^Audit du .* repris : 1 cas noté\.$/));
    expect(r.c.promenade.debut.toISOString()).toBe(debut.toISOString());
    const cas = r.c.promenade.cas('bati-1')!;
    expect(cas.constat.note).toBe('faîtage parallèle à la rue');
    expect(cas.constat.photos.map((p) => p.base64)).toEqual([PHOTO.base64]);
    // Repondu : le depart part du GPS qui attendait.
    await vi.waitFor(() => expect(r.interrogerCadastre).toHaveBeenCalled());
    // La suite s'ecrit dans le meme brouillon, pas dans un second.
    r.c.promenade.completer('bati-1', { note: 'suite' });
    await r.c.ecrireBrouillon();
    expect(stockage.tables.promenades.size).toBe(1);
  });

  it('« Le jeter » efface le brouillon et ses photos', async () => {
    const stockage = stockageMemoire();
    await premiereVisite(stockage);
    const r = reouverture(stockage);
    await vi.waitFor(() => expect(r.questions).toHaveLength(1));
    r.questions[0]!.secondaire.executer();
    await vi.waitFor(() => expect(r.messages.at(-1)).toMatch(/jeté\.$/));
    expect(stockage.tables.promenades.size).toBe(0);
    expect(stockage.tables.photos.size).toBe(0);
    expect(r.c.promenade.liste()).toEqual([]);
  });

  it('une question fermee sans reponse laisse partir l audit et garde le brouillon', async () => {
    const stockage = stockageMemoire();
    await premiereVisite(stockage);
    const r = reouverture(stockage);
    await vi.waitFor(() => expect(r.questions).toHaveLength(1));
    r.gps({ lat: 48.9, lon: 2.15, precisionM: 5 });
    r.questions[0]!.abandonner!();
    await vi.waitFor(() => expect(r.interrogerCadastre).toHaveBeenCalled());
    expect(stockage.tables.promenades.size).toBe(1);
    expect(r.c.promenade.liste()).toEqual([]);
  });

  it('apres le partage, le brouillon s efface sur confirmation seulement', async () => {
    const stockage = stockageMemoire();
    await premiereVisite(stockage);
    const r = reouverture(stockage, { partager: async () => 'partage' });
    await vi.waitFor(() => expect(r.questions).toHaveLength(1));
    r.questions[0]!.principal.executer();
    await vi.waitFor(() => expect(r.c.promenade.liste()).toHaveLength(1));
    await r.c.partager();
    expect(r.questions).toHaveLength(2);
    expect(r.questions[1]!.principal.libelle).toBe('Effacer le brouillon');
    r.questions[1]!.secondaire.executer();
    expect(stockage.tables.promenades.size).toBe(1);
    // Fermer la feuille de partage sans choisir ne propose rien.
    const annule = reouverture(stockage, { partager: async () => 'annule' });
    await vi.waitFor(() => expect(annule.questions).toHaveLength(1));
    annule.questions[0]!.abandonner!();
    await annule.c.partager();
    expect(annule.questions).toHaveLength(1);
    // Confirmer efface.
    await r.c.partager();
    r.questions[2]!.principal.executer();
    await vi.waitFor(() => expect(r.messages.at(-1)).toBe('Brouillon de la promenade effacé.'));
    expect(stockage.tables.promenades.size).toBe(0);
  });

  it('un appareil qui ne garde rien le dit au premier cas, une fois', () => {
    const { ctx, etat, messages } = contexte({ suivre: () => () => {}, stockageBrouillon: null });
    etat.objects.push(maison as never, { ...maison, key: 'bati-2' } as never);
    const c = creerControleurAudit(ctx, { depart: null });
    expect(messages).toEqual([]);
    c.promenade.marquer('bati-1', { x: 0, y: 0 }, null);
    c.promenade.marquer('bati-2', { x: 0, y: 0 }, null);
    expect(messages.filter((m) => m.includes('brouillon'))).toHaveLength(1);
    expect(messages[0]).toMatch(/partagez le fichier avant de fermer l’onglet/);
  });

  it('la question nomme le jour, la commune, les cas et les photos', () => {
    const q = questionReprise({ version: 1, id: 'audit-x', debut: new Date(2026, 9, 1, 9, 5).toISOString(), misAJour: '', depart: null, commune: 'Le Vésinet',
      cas: [{ constat: { photos: [{}, {}] } }, { constat: { photos: [] } }] as never }, () => {}, () => {}, () => {});
    expect(q.principal.libelle).toBe('Reprendre l’audit du 1er octobre');
    expect(q.texte).toBe('L’audit commencé le 1er octobre à 09:05 (Le Vésinet) est gardé sur cet appareil : 2 cas notés, 2 photos.');
  });
});
