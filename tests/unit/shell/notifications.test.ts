import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notifications, dureeToast } from '../../../src/shell/notifications.js';
import { dialogues } from '../../../src/shell/dialogues.js';

describe('les notifications', () => {
  beforeEach(() => { vi.useFakeTimers(); notifications.vider(); });

  it('previennent leurs abonnes et effacent un toast apres sa duree', () => {
    const vues: number[] = [];
    const arreter = notifications.abonner(l => vues.push(l.length));
    notifications.emettre('toast', 'Projet enregistre.');
    expect(vues).toEqual([0, 1]);
    vi.advanceTimersByTime(dureeToast('Projet enregistre.'));
    expect(notifications.liste()).toHaveLength(0);
    arreter();
    expect(notifications.aUnAbonne()).toBe(false);
  });

  it('gardent une erreur jusqu a ce qu on la ferme', () => {
    const id = notifications.emettre('erreur', 'Echec');
    vi.advanceTimersByTime(60000);
    expect(notifications.liste().map(n => n.id)).toEqual([id]);
    notifications.fermer(id);
    expect(notifications.liste()).toHaveLength(0);
  });

  it('donnent a lire un long message plus longtemps, sans depasser neuf secondes', () => {
    expect(dureeToast('court')).toBe(3200);
    expect(dureeToast('x'.repeat(100))).toBe(6000);
    expect(dureeToast('x'.repeat(1000))).toBe(9000);
  });
});

describe('les dialogues', () => {
  beforeEach(() => dialogues.fermer());

  it('confirment ou se ferment sans repondre', () => {
    let confirme = 0;
    dialogues.ouvrir({ type: 'confirmation', texte: 'Supprimer ?', confirmer: () => { confirme++; } });
    expect(dialogues.courant()?.type).toBe('confirmation');
    dialogues.fermer();
    expect(confirme).toBe(0);
    dialogues.ouvrir({ type: 'confirmation', texte: 'Supprimer ?', confirmer: () => { confirme++; } });
    dialogues.repondre();
    expect(confirme).toBe(1);
    expect(dialogues.courant()).toBeNull();
  });

  it('ne valident pas une invite vide', () => {
    const valeurs: string[] = [];
    dialogues.ouvrir({ type: 'invite', texte: 'Nom ?', valeur: 'a', valider: v => valeurs.push(v) });
    dialogues.repondre('   ');
    expect(valeurs).toEqual([]);
    dialogues.ouvrir({ type: 'invite', texte: 'Nom ?', valeur: 'a', valider: v => valeurs.push(v) });
    dialogues.repondre('  Terrasse  ');
    expect(valeurs).toEqual(['Terrasse']);
  });

  it('n ont qu un dialogue a la fois', () => {
    const vus: (string | null)[] = [];
    dialogues.abonner(d => vus.push(d ? d.type : null));
    dialogues.ouvrir({ type: 'confirmation', texte: 'a', confirmer: () => {} });
    dialogues.ouvrir({ type: 'invite', texte: 'b', valeur: '', valider: () => {} });
    expect(vus).toEqual([null, 'confirmation', 'invite']);
  });
});
