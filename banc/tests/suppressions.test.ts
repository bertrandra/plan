// La suppression differee d'une photo (banc/src/suppressions.ts, demande du proprietaire du 15 novembre 2026) : sans confirmation,
// mais l'appel ne part qu'au bout du delai ; annuler, enchainer, un echec qui rend la photo, la page fermee qui n'envoie rien.
import { describe, it, expect } from 'vitest';
import { DELAI_SUPPRESSION, FileDeSuppressions, type Issue, type Minuterie } from '../src/suppressions.js';

type Photo = { id: string; nom: string };
const photo = (id: string): Photo => ({ id, nom: id + '.jpg' });
const repos = () => new Promise((r) => setTimeout(r, 0));

/** Une minuterie a la main : `avancer(ms)` declenche ce qui arrive a echeance. */
function fausseMinuterie() {
  let t = 0, n = 0;
  const minuteurs = new Map<number, { quand: number; f: () => void }>();
  const m: Minuterie = {
    poser: (f, ms) => { const id = ++n; minuteurs.set(id, { quand: t + ms, f }); return id; },
    lever: (id) => { minuteurs.delete(id as number); },
    maintenant: () => t,
  };
  const avancer = (ms: number) => {
    t += ms;
    for (const [id, x] of [...minuteurs].sort((a, b) => a[1].quand - b[1].quand)) if (x.quand <= t) { minuteurs.delete(id); x.f(); }
  };
  return { m, avancer, enCours: () => minuteurs.size };
}

function file(echoue: (id: string) => boolean = () => false) {
  const envoyes: string[] = [], issues: Issue<Photo>[] = [];
  const h = fausseMinuterie();
  const f = new FileDeSuppressions<Photo>(async (id) => { envoyes.push(id); if (echoue(id)) throw new Error('HTTP 500'); return { supprimee: id }; }, DELAI_SUPPRESSION, h.m);
  let changements = 0;
  f.abonner((i) => { changements++; if (i) issues.push(i); });
  return { f, h, envoyes, issues, changements: () => changements };
}

describe('la suppression différée d’une photo', () => {
  it('la photo se cache tout de suite, l’appel ne part qu’au bout du délai', async () => {
    const { f, h, envoyes, issues } = file();
    f.demander(photo('a'));
    expect([...f.cachees()]).toEqual(['a']);
    expect(f.annulables().map((s) => [s.element.id, s.fin])).toEqual([['a', DELAI_SUPPRESSION]]);
    h.avancer(DELAI_SUPPRESSION - 1);
    expect(envoyes).toEqual([]);
    h.avancer(1);
    expect(envoyes).toEqual(['a']);
    // Pendant l'envoi : toujours cachee, plus annulable.
    expect([f.cachees().has('a'), f.annulables().length, f.annuler('a')]).toEqual([true, 0, null]);
    await repos();
    expect([f.cachees().size, issues]).toEqual([0, [{ genre: 'supprimee', element: photo('a') }]]);
  });

  it('annuler rend la photo et rien ne part, jamais', async () => {
    const { f, h, envoyes, issues } = file();
    f.demander(photo('a'));
    h.avancer(2000);
    expect(f.annuler('a')).toEqual(photo('a'));
    expect([f.cachees().size, h.enCours()]).toEqual([0, 0]);
    h.avancer(60_000);
    await repos();
    expect([envoyes, issues]).toEqual([[], []]);
    expect(f.annuler('a')).toBeNull();
  });

  it('plusieurs suppressions de suite : chacune son délai, chacune s’annule seule', async () => {
    const { f, h, envoyes } = file();
    f.demander(photo('a'));
    h.avancer(1000);
    f.demander(photo('b'));
    h.avancer(1000);
    f.demander(photo('c'));
    f.demander(photo('c'));
    expect(f.annulables().map((s) => s.element.id)).toEqual(['a', 'b', 'c']);
    // La plus recente en dernier : « Annuler » du message la rend, les autres attendent toujours.
    expect(f.annuler('c')?.id).toBe('c');
    expect([...f.cachees()]).toEqual(['a', 'b']);
    h.avancer(DELAI_SUPPRESSION - 2000);
    expect(envoyes).toEqual(['a']);
    expect(f.annuler('b')?.id).toBe('b');
    h.avancer(60_000);
    await repos();
    expect(envoyes).toEqual(['a']);
    expect(f.cachees().size).toBe(0);
  });

  it('un échec rend la photo et se dit', async () => {
    const { f, h, issues } = file((id) => id === 'b');
    f.demander(photo('a'));
    f.demander(photo('b'));
    h.avancer(DELAI_SUPPRESSION);
    await repos(); await repos();
    expect(f.cachees().size).toBe(0);
    expect(issues.map((i) => [i.genre, i.element.id, i.genre === 'echec' ? i.erreur.message : ''])).toEqual([['supprimee', 'a', ''], ['echec', 'b', 'HTTP 500']]);
  });

  it('la page fermée : ce qui attend est abandonné, rien n’est envoyé ; un envoi parti va au bout', async () => {
    const { f, h, envoyes, issues, changements } = file();
    f.demander(photo('a'));
    h.avancer(DELAI_SUPPRESSION);
    f.demander(photo('b'));
    const avant = changements();
    f.abandonner();
    expect(changements()).toBe(avant + 1);
    expect([...f.cachees()]).toEqual(['a']);
    h.avancer(60_000);
    await repos();
    expect(envoyes).toEqual(['a']);
    expect(issues.map((i) => i.element.id)).toEqual(['a']);
    f.abandonner();
    expect(changements()).toBe(avant + 2);
  });
});
