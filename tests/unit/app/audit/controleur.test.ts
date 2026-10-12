// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { creerControleurAudit, brancherDoigtAudit, poserLectureSuivi, PRECISION_DEPART_MAX_M, type ContexteAudit, type ControleurAudit } from '../../../../src/app/audit/controleur.js';
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
    signaler: (m) => messages.push(m), ...plus,
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
    const c = { tapoter: vi.fn(), appuiLong: vi.fn(), basculerSuivi: vi.fn() } as unknown as ControleurAudit;
    brancherDoigtAudit(c, hote);
    const geste = (type: string, x: number, y: number) => toile.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
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

      poserLectureSuivi(() => true);
      geste('pointerdown', 10, 10); geste('pointermove', 40, 10); vi.advanceTimersByTime(700); geste('pointerup', 40, 10);
      expect(c.basculerSuivi).toHaveBeenCalledOnce();
      expect(c.appuiLong).toHaveBeenCalledTimes(2);
      expect(c.tapoter).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
