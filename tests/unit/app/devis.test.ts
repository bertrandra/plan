// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { creerPreferencesDevis, reglagesImprimes } from '../../../src/app/devis.js';
import { tauxSaisi } from '../../../src/ui/champs/devis.js';

// Les reglages du devis (app/devis.ts) : l'emetteur et le taux restent dans ce navigateur, le numero vaut pour la page ; rien
// n'entre dans le projet.

beforeEach(() => { localStorage.clear(); });

describe('les reglages du devis', () => {
  it('gardent l emetteur et le taux dans le navigateur, et le numero pour la page seulement', () => {
    const jour = () => new Date('2026-11-16T10:00:00');
    const p = creerPreferencesDevis(() => 'Parcelle AE 101', jour);
    expect(p.numeroPropose()).toBe('PARCELLE-AE-101-20261116');
    p.ecrire({ emetteur: { nom: '  Atelier Bois  ', telephone: '01 23' }, tauxTva: '5,5', numero: 'D-7' });
    expect(p.lire()).toEqual({ emetteur: { nom: 'Atelier Bois', telephone: '01 23' }, tauxTva: '5,5', numero: 'D-7' });
    p.ecrire({ emetteur: { telephone: '' } });
    expect(p.lire().emetteur).toEqual({ nom: 'Atelier Bois' });
    // Une autre page (un autre devis) retrouve l'emetteur et le taux, pas le numero.
    const q = creerPreferencesDevis(() => null, jour);
    expect(q.lire()).toEqual({ emetteur: { nom: 'Atelier Bois' }, tauxTva: '5,5', numero: '' });
    expect(reglagesImprimes(q)).toEqual({ emetteur: { nom: 'Atelier Bois' }, numero: '', tauxTva: 5.5 });
  });

  it('un stockage illisible ne casse rien', () => {
    localStorage.setItem('plan.devis', '{pas du json');
    expect(creerPreferencesDevis(() => null).lire()).toEqual({ emetteur: {}, tauxTva: '', numero: '' });
  });

  it('un taux se lit en pourcent, a la virgule ; ce qui n en est pas un ne dit rien', () => {
    expect(tauxSaisi('20')).toBe(20);
    expect(tauxSaisi('5,5 %')).toBe(5.5);
    expect(tauxSaisi('')).toBeNull();
    expect(tauxSaisi('abc')).toBeNull();
    expect(tauxSaisi('150')).toBeNull();
  });
});
