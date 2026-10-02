import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { creerInspecteur, type ContexteInspecteur } from '../../../src/app/inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { champActif, champAnnulable } from '../../../src/app/ecritures.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { Champ, ChampBouton, ContexteChamps } from '../../../src/ui/champs/types.js';

// L'inspecteur applique deux garde-fous a tout champ qui ecrit le projet (app/ecritures.ts) :
// un instantane d'annulation — pris avant, empile si l'ecriture reussit, regroupe pour un geste
// continu — et le refus en lecture seule. Un bouton dit sur quoi il agit (`agit`).

function monter(lectureSeule = false, utilisable = true) {
  const obj = { key: 'a', name: 'A', type: 'polygon', hauteur: 1 } as unknown as ContexteChamps['obj'];
  const etat = { objects: [obj], selectedKey: 'a', lectureSeule } as unknown as EtatApp;
  /** Instantanes pris, et instantanes empiles. */
  const pris = vi.fn(), empiles = vi.fn();
  const preparerHistorique = () => { pris(); return empiles; };
  const markDirty = vi.fn();
  const ctx = { preparerHistorique, markDirty, render: () => {} } as unknown as ContexteInspecteur;
  const inspecteur = creerInspecteur(etat, ctx, creerMagasin(etat), creerRegistre());
  const c = { etat, obj, commandeUtilisable: () => utilisable } as unknown as ContexteChamps;
  return { inspecteur, c, obj: obj as unknown as { hauteur: number }, pris, empiles, markDirty };
}
const hauteur: Champ = { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', lire: () => 0, ecrire: () => {} };
const affichage: Champ = { type: 'case', cle: 'cotes', libelle: 'Cotes', sale: false, lire: () => true, ecrire: () => {} };
const bouton = (agit: ChampBouton['agit'], executer = vi.fn()): ChampBouton => ({ type: 'bouton', cle: 'b', libelle: 'B', agit, executer });

describe('ecritures de l inspecteur', () => {
  it('rend annulable tout champ qui ecrit le projet, sauf historique: false', () => {
    expect(champAnnulable(hauteur)).toBe(true);
    expect(champAnnulable({ ...hauteur, historique: false })).toBe(false);
    expect(champAnnulable(affichage)).toBe(false);
  });

  it('empile un instantane par geste : les ecritures rapprochees d un meme champ n en font qu un', () => {
    vi.useFakeTimers();
    const m = monter();
    for (const v of [2, 3, 4]) m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = v; });
    expect(m.empiles).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = 5; });
    expect(m.empiles).toHaveBeenCalledTimes(2);
    // Un autre champ ouvre un autre geste.
    m.inspecteur.appliquer({ ...hauteur, cle: 'largeur' }, m.c, () => {});
    expect(m.empiles).toHaveBeenCalledTimes(3);
    // Un reglage d'affichage n'empile rien.
    m.inspecteur.appliquer(affichage, m.c, () => {});
    expect(m.empiles).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('n empile rien pour une ecriture refusee : pas d etape d annulation vide', () => {
    const m = monter();
    expect(m.inspecteur.appliquer(hauteur, m.c, () => false)).toBe(false);
    expect(m.pris).toHaveBeenCalledTimes(1);
    expect(m.empiles).not.toHaveBeenCalled();
    expect(m.markDirty).not.toHaveBeenCalled();
    // Le geste suivant n'est pas regroupe avec le refus : il empile.
    m.inspecteur.appliquer(hauteur, m.c, () => {});
    expect(m.empiles).toHaveBeenCalledTimes(1);
  });

  it('refuse en lecture seule ce qui ecrit le projet, pas les reglages d affichage', () => {
    const m = monter(true);
    expect(m.inspecteur.appliquer(hauteur, m.c, () => { m.obj.hauteur = 9; })).toBe(false);
    expect(m.obj.hauteur).toBe(1);
    expect(m.pris).not.toHaveBeenCalled();
    expect(m.markDirty).not.toHaveBeenCalled();
    expect(m.inspecteur.appliquer(affichage, m.c, () => {})).toBe(true);
    expect(champActif(hauteur, m.c)).toBe(false);
    expect(champActif(affichage, m.c)).toBe(true);
  });

  it('grise et refuse en lecture seule un bouton qui ecrit le projet, pas un bouton d interface', () => {
    const m = monter(true);
    const projet = bouton('projet'), iface = bouton('interface');
    expect(champActif(projet, m.c)).toBe(false);
    expect(champActif(iface, m.c)).toBe(true);
    m.inspecteur.executer(projet, m.c);
    m.inspecteur.executer(iface, m.c);
    expect(projet.executer).not.toHaveBeenCalled();
    expect(iface.executer).toHaveBeenCalledTimes(1);
  });

  it('grise un bouton de commande quand le registre ne la permet pas', () => {
    expect(champActif(bouton({ commande: 'facade.relever' }), monter(false, false).c)).toBe(false);
    expect(champActif(bouton({ commande: 'facade.relever' }), monter(false, true).c)).toBe(true);
  });
});

describe('descripteurs de champs (ui/champs)', () => {
  // Une ecriture de champ n'empile pas son instantane : l'inspecteur le prend avant et l'empile si elle
  // reussit. L'empiler aussi dans `ecrire` ferait deux etapes, et Ctrl+Z semblerait ne rien faire.
  // Seul un bouton qui agit sur le projet (`executer`) empile le sien.
  it('n appelle pushHistory que depuis un executer de bouton', () => {
    const dossier = resolve(__dirname, '../../../src/ui/champs');
    for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(resolve(dossier, nom), 'utf8');
      for (let i = src.indexOf('pushHistory()'); i >= 0; i = src.indexOf('pushHistory()', i + 1)) {
        const avant = src.slice(0, i);
        expect(avant.lastIndexOf('executer:'), nom + ' @' + i).toBeGreaterThan(avant.lastIndexOf('ecrire:'));
      }
    }
  });
});
