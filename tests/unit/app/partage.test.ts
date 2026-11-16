// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { brancherPartage, dateLongue, phraseDuLien, RAISON_JAMAIS_ENREGISTRE } from '../../../src/app/partage.js';
import { poserAcces } from '../../../src/app/acces.js';
import { creerRegistre, PHRASE_PERMISSION } from '../../../src/app/commandes.js';
import { parcours } from '../../../src/app/parcours.js';
import type { Droits } from '../../../src/app/commandes.js';
import type { Session } from '../../../src/plateforme/session.js';
import type { ServiceContexte } from '../../../src/plateforme/contexte.js';

// « Partager par un lien… » (lot 6) : la commande suit les trois refus du registre — sans la fonction elle disparait, sans le droit
// d'ecrire elle se grise avec la phrase du droit, sur un projet jamais enregistre elle se grise et dit d'enregistrer.

const session = { appeler: async () => ({ shares: [] }) } as unknown as Session;
const contexte = { courant: () => null } as unknown as ServiceContexte;
const droits = (o: { capacite?: boolean; ecrire?: boolean }): Droits => ({
  branchee: () => true, aCapacite: (c) => c !== 'project_sharing' || o.capacite !== false,
  aPermission: () => o.ecrire !== false, reste: () => null
});
const projet = { id: 'p1', name: 'Terrasse' };

beforeEach(() => { poserAcces(session, contexte); parcours.fermer(); });

describe('la commande projet.partager', () => {
  it('ouvre le dialogue du partage sur un projet enregistre', () => {
    const cmd = creerRegistre(droits({}));
    brancherPartage(cmd, { courant: projet, ecrit: () => true, modifie: () => false });
    expect(cmd.etat('projet.partager')).toEqual({ utilisable: true });
    expect(cmd.executer('projet.partager')).toBe(true);
    expect(parcours.courant()?.type).toBe('partage');
  });

  it('disparait sans la fonction project_sharing', () => {
    const cmd = creerRegistre(droits({ capacite: false }));
    brancherPartage(cmd, { courant: projet, ecrit: () => true, modifie: () => false });
    expect(cmd.effacee('projet.partager')).toBe(true);
  });

  it('se grise avec la phrase du droit sans projects.write (ou en place de lecture)', () => {
    const cmd = creerRegistre(droits({ ecrire: false }));
    brancherPartage(cmd, { courant: projet, ecrit: () => true, modifie: () => false });
    expect(cmd.etat('projet.partager')).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });

  it('se grise et dit d enregistrer d abord un projet jamais enregistre', () => {
    const cmd = creerRegistre(droits({}));
    brancherPartage(cmd, { courant: projet, ecrit: () => false, modifie: () => true });
    expect(cmd.etat('projet.partager')).toEqual({ utilisable: false, raison: 'contexte', message: RAISON_JAMAIS_ENREGISTRE });
    const vierge = creerRegistre(droits({}));
    brancherPartage(vierge, { courant: null, ecrit: () => false, modifie: () => false });
    expect(vierge.executer('projet.partager')).toBe(false);
  });
});

describe('les mots du partage', () => {
  it('dit la date a la francaise, le premier du mois compris', () => {
    expect(dateLongue('2026-12-16T10:00:00Z')).toBe('16 décembre 2026');
    expect(dateLongue('2026-12-01T10:00:00Z')).toBe('1er décembre 2026');
    expect(dateLongue(null)).toBe('');
    expect(phraseDuLien('2026-12-16T10:00:00Z')).toBe('Toute personne qui a ce lien voit ce projet tel qu’il est enregistré, sans pouvoir le modifier, jusqu’au 16 décembre 2026.');
  });
});
