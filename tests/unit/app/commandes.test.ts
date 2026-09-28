import { describe, it, expect, vi } from 'vitest';
import { creerRegistre, type Commande } from '../../../src/app/commandes.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import type { EtatApp } from '../../../src/core/state.js';

// Etape 0 de la reconstruction de l'interface (spec-ihm-zones §6) : le registre des commandes et le
// magasin existent et se comportent comme annonce, sans que l'ecran change.

const commande = (id: string, executer: Commande['executer'] = () => {}, extra: Partial<Commande> = {}): Commande =>
  ({ id, libelle: id, groupe: 'objet', executer, ...extra });

describe('registre des commandes', () => {
  it('declare, retrouve et liste par groupe', () => {
    const r = creerRegistre();
    r.declarer(commande('objet.dupliquer'));
    r.declarer(commande('export.svg', () => {}, { groupe: 'export' }));
    expect(r.obtenir('objet.dupliquer')?.libelle).toBe('objet.dupliquer');
    expect(r.lister().map((c) => c.id)).toEqual(['objet.dupliquer', 'export.svg']);
    expect(r.lister('export').map((c) => c.id)).toEqual(['export.svg']);
  });

  it('refuse un identifiant deja pris : un geste, une commande', () => {
    const r = creerRegistre();
    r.declarer(commande('objet.dupliquer'));
    expect(() => r.declarer(commande('objet.dupliquer'))).toThrow(/deja declaree/);
  });

  it('execute une commande active, et rend false pour une inconnue ou une inactive', () => {
    const r = creerRegistre();
    const executer = vi.fn();
    let active = true;
    r.declarer(commande('objet.supprimer', executer, { actif: () => active }));
    expect(r.executer('objet.supprimer')).toBe(true);
    active = false;
    expect(r.executer('objet.supprimer')).toBe(false);
    expect(r.executer('objet.inconnue')).toBe(false);
    expect(executer).toHaveBeenCalledTimes(1);
  });
});

describe('magasin', () => {
  it('tient la reference vivante de l etat et compte les rendus', () => {
    const etat = { objects: [], measures: [], selectedKey: null } as unknown as EtatApp;
    const m = creerMagasin(etat);
    expect(m.store.getState().etat).toBe(etat);
    expect(m.version()).toBe(0);
    const vu: number[] = [];
    const desabonner = m.store.subscribe((s) => vu.push(s.version));
    m.notifier(); m.notifier();
    desabonner();
    m.notifier();
    expect(vu).toEqual([1, 2]);
    expect(m.version()).toBe(3);
    // La mutation en place reste visible sans copie : c'est le pont, pas un instantane.
    etat.selectedKey = 'terrasse';
    expect(m.store.getState().etat.selectedKey).toBe('terrasse');
  });
});
