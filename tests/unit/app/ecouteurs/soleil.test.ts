import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reglagesSoleil, brancherSoleilDuProjet, type EtatVueSoleil } from '../../../../src/app/ecouteurs/soleil.js';
import { soleilDuProjet } from '../../../../src/core/soleil.js';
import type { EtatApp } from '../../../../src/core/state.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Les reglages du soleil d'une vue (app/ecouteurs/soleil.ts) : la date et l'heure vont au soleil du projet
// (core/soleil.ts), le meme pour le plan et les deux vues ; l'intensite et l'appoint restent a la vue.
// L'ecouteur du soleil range le changement sur la parcelle, marque le projet a enregistrer (hors lecture
// seule, sans pas d'annulation) et le montre partout.

function monter() {
  const etat: EtatVueSoleil = { intensiteSoleil: 1, lumiereAppoint: false, semaineAffichee: 25 };
  const v = { etat, regler: (r: Partial<EtatVueSoleil>) => { Object.assign(etat, r); }, appliquer: vi.fn(), signaler: vi.fn() };
  return { v, r: reglagesSoleil(v) };
}

beforeEach(() => {
  soleilDuProjet.restaurer([]);
  soleilDuProjet.regler({ dateStr: '2026-06-21', minutes: 720 });
});

describe('reglages du soleil d une vue', () => {
  it('posent la date sur le soleil du projet ; une date vide ne change rien', () => {
    const { r } = monter();
    const vu = vi.fn();
    const fin = soleilDuProjet.abonner(vu);
    r.date('');
    expect(vu).not.toHaveBeenCalled();
    r.date('2026-12-21');
    expect(soleilDuProjet.lire().dateStr).toBe('2026-12-21');
    expect(r.etat.dateStr).toBe('2026-12-21');
    expect(vu).toHaveBeenCalledTimes(1);
    fin();
  });

  it('decalent la date de sept jours par cran de semaine, d apres le dernier cran', () => {
    const { v, r } = monter();
    r.semaine(27);
    expect(soleilDuProjet.lire().dateStr).toBe('2026-07-05');
    r.semaine(26);
    expect(soleilDuProjet.lire().dateStr).toBe('2026-06-28');
    // Le meme cran ne decale rien, mais se signale ; le curseur reste sous le doigt.
    r.semaine(26);
    expect(soleilDuProjet.lire().dateStr).toBe('2026-06-28');
    expect(v.etat.semaineAffichee).toBe(26);
    expect(v.signaler).toHaveBeenCalledTimes(3);
  });

  it('posent l heure sur le soleil du projet, l intensite et l appoint sur la vue', () => {
    const { v, r } = monter();
    r.heure(1080); r.intensite(40); r.appoint(true);
    expect(soleilDuProjet.lire().minutes).toBe(1080);
    expect([r.etat.minutes, v.etat.intensiteSoleil, v.etat.lumiereAppoint]).toEqual([1080, 0.4, true]);
    // L'heure passe par l'ecouteur du soleil ; l'intensite et l'appoint reposent la lumiere de la vue.
    expect(v.appliquer).toHaveBeenCalledTimes(2);
  });

  it('les deux vues lisent le meme soleil', () => {
    const a = monter(), b = monter();
    a.r.heure(600);
    b.r.date('2026-03-01');
    expect([a.r.etat.dateStr, a.r.etat.minutes]).toEqual(['2026-03-01', 600]);
    expect([b.r.etat.dateStr, b.r.etat.minutes]).toEqual(['2026-03-01', 600]);
  });
});

describe('l ecouteur du soleil du projet', () => {
  function brancher(lectureSeule = false) {
    const parcelle = { key: 'parcelle', type: 'polygon', fonction: 'parcelle', pts: [] } as unknown as ObjetPlan;
    const etat = { objects: [parcelle], lectureSeule, dirty: false } as unknown as EtatApp;
    const s = {
      etat, markDirty: vi.fn(() => { etat.dirty = true; }), render: vi.fn(), syncSemaines: vi.fn(),
      appliquer3d: vi.fn(), appliquerGlb: vi.fn(), signaler3d: vi.fn()
    };
    const fin = brancherSoleilDuProjet(s);
    return { s, etat, parcelle, fin };
  }

  it('range le soleil sur la parcelle, marque le projet a enregistrer une fois, et le montre partout', () => {
    const { s, parcelle, fin } = brancher();
    soleilDuProjet.regler({ minutes: 900 });
    soleilDuProjet.regler({ minutes: 905 });
    expect(parcelle.soleil).toEqual({ dateStr: '2026-06-21', minutes: 905 });
    expect(s.markDirty).toHaveBeenCalledTimes(1);
    expect([s.render, s.appliquer3d, s.appliquerGlb, s.signaler3d, s.syncSemaines].map((f) => f.mock.calls.length)).toEqual([2, 2, 2, 2, 2]);
    // La meme valeur ne previent personne.
    soleilDuProjet.regler({ minutes: 905 });
    expect(s.render).toHaveBeenCalledTimes(2);
    fin();
  });

  it('en lecture seule, le soleil bouge et se montre, sans marquer le projet', () => {
    const { s, etat, fin } = brancher(true);
    soleilDuProjet.regler({ dateStr: '2026-01-15' });
    expect(s.markDirty).not.toHaveBeenCalled();
    expect(etat.dirty).toBe(false);
    expect(s.appliquer3d).toHaveBeenCalledTimes(1);
    fin();
  });
});
