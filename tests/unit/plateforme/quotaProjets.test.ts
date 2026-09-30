import { describe, it, expect, vi } from 'vitest';
import { limiteProjets, phraseLimite, QUOTA_PROJETS } from '../../../src/plateforme/quotaProjets.js';
import { creerRegistre, type Droits } from '../../../src/app/commandes.js';

// Le nombre de projets est celui que la plateforme autorise : `max_projects`, verifie par backprod a
// la creation et a la copie (`utilises >= limite` refuse). Plan compte comme elle, et le dit au geste.

const q = (limite: number | null, utilise: number | null, illimite = false) =>
  ({ limite, illimite, utilise, reste: limite !== null && utilise !== null ? limite - utilise : null });

describe('la limite de projets', () => {
  it('lit le quota que la plateforme applique', () => {
    expect(QUOTA_PROJETS).toBe('max_projects');
  });

  it('rend ce qu il reste, comme la plateforme le compte', () => {
    expect(limiteProjets(q(3, 1), 0)).toEqual({ limite: 3, utilise: 1, reste: 2 });
  });

  it('est atteinte a egalite : a 3 pour 3, le quatrieme est refuse', () => {
    expect(limiteProjets(q(3, 3), 0)?.reste).toBe(0);
  });

  it('compte aussi les projets vus dans la liste : le contexte en cache peut retarder', () => {
    expect(limiteProjets(q(3, 1), 3)).toEqual({ limite: 3, utilise: 3, reste: 0 });
  });

  it('n existe pas pour une offre illimitee ou sans quota', () => {
    expect(limiteProjets(q(null, 5, true), 9)).toBe(null);
    expect(limiteProjets(null, 9)).toBe(null);
  });

  it('se dit avec les nombres, et ce qu on peut y faire', () => {
    const p = phraseLimite({ limite: 5, utilise: 5 });
    expect(p).toContain('5 projets pour 5 autorisés');
    expect(p).toMatch(/copie ou depuis une adresse/);
    expect(p).toMatch(/supprimez un projet ou changez d’offre/);
    expect(phraseLimite({ limite: 1, utilise: 1 })).toContain('1 projet pour 1 autorisé par');
  });
});

describe('le refus au geste', () => {
  const droits: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => true,
    reste: () => 0, phraseQuota: () => 'limite atteinte' };

  it('dit la limite quand on clique pour creer, sans rien executer', () => {
    const signaler = vi.fn(); const executer = vi.fn();
    const r = creerRegistre(droits, signaler);
    r.declarer({ id: 'projet.nouveau', libelle: 'Nouveau', groupe: 'projet', quota: QUOTA_PROJETS, executer });
    expect(r.etat('projet.nouveau')).toEqual({ utilisable: false, raison: 'quota', message: 'limite atteinte' });
    expect(r.executer('projet.nouveau')).toBe(false);
    expect(executer).not.toHaveBeenCalled();
    expect(signaler).toHaveBeenCalledWith('projet.nouveau', 'limite atteinte');
  });

  it('laisse remplir un projet neuf : il ne cree rien de plus', () => {
    const executer = vi.fn();
    const r = creerRegistre(droits, vi.fn());
    r.declarer({ id: 'projet.depuisAdresse', libelle: 'Adresse', groupe: 'projet', quota: () => null, executer });
    expect(r.executer('projet.depuisAdresse')).toBe(true);
    expect(executer).toHaveBeenCalled();
  });
});

describe('le compteur visible (Projets 1/X)', () => {
  it('rend les projets de l organisation et la limite de l abonnement', async () => {
    const { poserAcces, limiteProjetsCourante } = await import('../../../src/app/acces.js');
    const { retenirProjetsConnus } = await import('../../../src/plateforme/quotaProjets.js');
    retenirProjetsConnus(1);
    poserAcces({} as never, { quota: (f: string) => (f === QUOTA_PROJETS ? q(3, 1) : null) } as never);
    expect(limiteProjetsCourante()).toEqual({ limite: 3, utilise: 1, reste: 2 });
    poserAcces({} as never, { quota: () => q(null, 4, true) } as never);
    expect(limiteProjetsCourante()).toBe(null);
  });
});

describe('le compteur, toujours la une fois la plateforme branchee', () => {
  it('limite : les nombres de la plateforme', async () => {
    const { compteProjets } = await import('../../../src/plateforme/quotaProjets.js');
    expect(compteProjets(q(3, 1), 1)).toEqual({ utilise: 1, limite: 3, illimite: false });
  });
  it('illimite : le nombre, et l infini', async () => {
    const { compteProjets } = await import('../../../src/plateforme/quotaProjets.js');
    expect(compteProjets(q(null, 4, true), 2)).toEqual({ utilise: 4, limite: null, illimite: true });
  });
  it('sans quota de projets sur l offre : les projets vus dans la liste', async () => {
    const { compteProjets } = await import('../../../src/plateforme/quotaProjets.js');
    expect(compteProjets(null, 2)).toEqual({ utilise: 2, limite: null, illimite: false });
  });
});
