import { describe, it, expect, vi } from 'vitest';
import { reglagesSoleil, type EtatSoleil } from '../../../../src/app/ecouteurs/soleil.js';

// Les reglages du soleil d'une vue (app/ecouteurs/soleil.ts) : chacun ecrit l'etat, repose le
// soleil et le signale ; le curseur des semaines decale la date de sept jours par cran.

function monter() {
  const etat: EtatSoleil = { dateStr: '2026-06-21', minutes: 720, intensiteSoleil: 1, lumiereAppoint: false, semaineAffichee: 25 };
  const v = { etat, syncSemaine: vi.fn(), appliquer: vi.fn(), signaler: vi.fn() };
  return { v, r: reglagesSoleil(v) };
}

describe('reglages du soleil', () => {
  it('posent la date, recalent la semaine, reposent le soleil ; une date vide ne change rien', () => {
    const { v, r } = monter();
    r.date('');
    expect(v.appliquer).not.toHaveBeenCalled();
    r.date('2026-12-21');
    expect(v.etat.dateStr).toBe('2026-12-21');
    expect(v.syncSemaine).toHaveBeenCalledTimes(1);
    expect([v.appliquer.mock.calls.length, v.signaler.mock.calls.length]).toEqual([1, 1]);
  });

  it('decalent la date de sept jours par cran de semaine, d apres le dernier cran', () => {
    const { v, r } = monter();
    r.semaine(27);
    expect(v.etat.dateStr).toBe('2026-07-05');
    r.semaine(26);
    expect(v.etat.dateStr).toBe('2026-06-28');
    // Le meme cran ne decale rien, mais se signale.
    r.semaine(26);
    expect(v.etat.dateStr).toBe('2026-06-28');
    expect(v.appliquer).toHaveBeenCalledTimes(2);
    expect(v.signaler).toHaveBeenCalledTimes(3);
  });

  it('posent l heure, l intensite en pourcent et la lumiere d appoint', () => {
    const { v, r } = monter();
    r.heure(1080); r.intensite(40); r.appoint(true);
    expect([v.etat.minutes, v.etat.intensiteSoleil, v.etat.lumiereAppoint]).toEqual([1080, 0.4, true]);
    expect(v.appliquer).toHaveBeenCalledTimes(3);
  });
});
