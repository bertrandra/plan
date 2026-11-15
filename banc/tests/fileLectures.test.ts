// La file des lectures en tache de fond (banc/src/fileLectures.ts) : une a la fois, bornee, annulable ; de quoi lire les apercus
// (« la maison se voit-elle ? ») sans bloquer l'ecran ni telecharger en rafale.
import { describe, it, expect } from 'vitest';
import { FILE_MAX, FileDeLectures, type Tache } from '../src/fileLectures.js';
import { texteDesComptes } from '../src/meilleuresVues.js';

const taches = (...cles: string[]): Tache<string>[] => cles.map((cle) => ({ cle, charge: cle }));
const repos = () => new Promise((r) => setTimeout(r, 0));

describe('la file des lectures', () => {
  it('une seule lecture à la fois, dans l’ordre demandé, et chaque résultat se dit', async () => {
    const lues: string[] = [], finir = new Map<string, (r: string) => void>();
    const f = new FileDeLectures<string, string>((c) => { lues.push(c); return new Promise((ok) => finir.set(c, ok)); });
    let dits = 0;
    f.abonner(() => { dits++; });
    f.demander(taches('a', 'b', 'c'));
    expect(lues).toEqual(['a']);
    expect(f.resultat('a')).toBeUndefined();
    finir.get('a')?.('A');
    await repos(); await repos();
    expect([f.resultat('a'), lues, dits, f.version]).toEqual(['A', ['a', 'b'], 1, 1]);
    finir.get('b')?.('B'); await repos(); await repos();
    finir.get('c')?.('C'); await repos(); await repos();
    expect([f.resultat('b'), f.resultat('c'), lues.length, dits]).toEqual(['B', 'C', 3, 3]);
  });
  it('ce qui est déjà lu ne se relit pas, même redemandé', async () => {
    let n = 0;
    const f = new FileDeLectures<string, number>(() => Promise.resolve(++n));
    f.demander(taches('a', 'a', 'b'));
    for (let k = 0; k < 6; k++) await repos();
    f.demander(taches('b', 'a', 'c'));
    for (let k = 0; k < 6; k++) await repos();
    expect([n, f.resultat('a'), f.resultat('b'), f.resultat('c')]).toEqual([3, 1, 2, 3]);
  });
  it('une file bornée : au-delà, les tâches attendent d’être redemandées', async () => {
    let n = 0;
    const f = new FileDeLectures<string, number>(() => Promise.resolve(++n), 3);
    f.demander(taches('a', 'b', 'c', 'd', 'e'));
    for (let k = 0; k < 12; k++) await repos();
    expect([n, f.resultat('c'), f.resultat('d')]).toEqual([3, 3, undefined]);
    // La liste redemandee (elle l'est a chaque resultat) : les suivantes passent.
    f.demander(taches('a', 'b', 'c', 'd', 'e'));
    for (let k = 0; k < 12; k++) await repos();
    expect([n, f.resultat('e')]).toEqual([5, 5]);
    expect(FILE_MAX).toBe(40);
  });
  it('annulable : la lecture en cours s’arrête si on ne la demande plus, et son résultat est ignoré', async () => {
    const signaux = new Map<string, AbortSignal>(), finir = new Map<string, (r: string) => void>();
    const f = new FileDeLectures<string, string>((c, s) => { signaux.set(c, s); return new Promise((ok) => finir.set(c, ok)); });
    f.demander(taches('a', 'b'));
    f.demander(taches('b'));
    expect(signaux.get('a')?.aborted).toBe(true);
    expect([...signaux.keys()]).toEqual(['a', 'b']);
    finir.get('a')?.('trop tard'); await repos();
    expect(f.resultat('a')).toBeUndefined();
    // Tout arreter : plus rien ne part.
    f.demander([]);
    expect(signaux.get('b')?.aborted).toBe(true);
    await repos();
    expect(signaux.size).toBe(2);
    // La lecture encore demandee, elle, n'est pas relancee par une nouvelle demande.
    f.demander(taches('c', 'd')); f.demander(taches('c', 'e'));
    expect(signaux.get('c')?.aborted).toBe(false);
    expect([...signaux.keys()]).toEqual(['a', 'b', 'c']);
  });
  it('une lecture qui échoue n’est pas réessayée : la vue garde sa note', async () => {
    let n = 0;
    const f = new FileDeLectures<string, string>((c) => { n++; return c === 'a' ? Promise.reject(new Error('HTTP 404')) : Promise.resolve('ok'); });
    f.demander(taches('a', 'b'));
    for (let k = 0; k < 8; k++) await repos();
    f.demander(taches('a', 'b'));
    for (let k = 0; k < 8; k++) await repos();
    expect([n, f.resultat('a'), f.resultat('b')]).toEqual([2, null, 'ok']);
  });
  it('rend la main à l’écran entre deux lectures', async () => {
    const plusTard: (() => void)[] = [];
    let n = 0;
    const f = new FileDeLectures<string, number>(() => Promise.resolve(++n), 40, (g) => { plusTard.push(g); });
    f.demander(taches('a', 'b'));
    await repos();
    expect([n, plusTard.length]).toEqual([1, 1]);
    plusTard[0]?.(); await repos();
    expect(n).toBe(2);
  });
});

describe('ce que l’état dit des façades cachées', () => {
  it('rien quand aucune n’est lue cachée ; leur nombre sinon', () => {
    const c = { photos: 3, facades: 4, batiments: 2, doublons: 1, ecartees: 5 };
    expect(texteDesComptes(c)).toBe('3 photos, 4 façades de 2 bâtiments, 1 doublon ; 5 écartées : route, campagne ou pas une maison');
    expect(texteDesComptes({ ...c, cachees: 0 })).toBe(texteDesComptes(c));
    expect(texteDesComptes({ ...c, cachees: 1 })).toBe('3 photos, 4 façades de 2 bâtiments, 1 doublon, 1 façade cachée ; 5 écartées : route, campagne ou pas une maison');
    expect(texteDesComptes({ ...c, cachees: 6 })).toContain(', 6 façades cachées ;');
    // La case « Écarter les façades cachées » cochee : elles sont parmi les ecartees, et la raison le dit.
    expect(texteDesComptes({ ...c, cachees: 6, cacheesEcartees: true })).toBe('3 photos, 4 façades de 2 bâtiments, 1 doublon ; 5 écartées : route, campagne, pas une maison ou façade cachée');
    expect(texteDesComptes({ ...c, cachees: 0, cacheesEcartees: true })).toBe(texteDesComptes(c));
  });
});
