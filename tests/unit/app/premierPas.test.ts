import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { empechementCourant } from '../../../src/app/premierPas.js';
import { poserAcces } from '../../../src/app/acces.js';
import type { ServiceContexte } from '../../../src/plateforme/contexte.js';
import type { Session } from '../../../src/plateforme/session.js';
import { CAPACITE_LECTURE_SEULE } from '../../../src/plateforme/capacites.js';

// Le premier pas (25 septembre 2026) : par quoi commencer quand il n'y a aucun plan a ouvrir.
//
// Plan fabriquait le jeu de demonstration en silence. Quelqu'un qui arrivait avec une vraie
// parcelle en tete trouvait donc un plan qui n'etait pas le sien, sans qu'on lui ait rien demande.
// Deux facons de commencer, deux options, et la question posee.

/** Un contexte de plateforme reduit a ce que `droitsCourants()` lui demande. */
function contexte(partiel: Partial<ServiceContexte>): ServiceContexte {
  return {
    // Toutes les capacites SAUF celle qui retire : un stub qui les rend toutes vraies serait un
    // siege de lecture, et le droit d'ecrire tomberait pour une raison qu'on n'a pas voulue.
    aCapacite: (code: string) => code !== CAPACITE_LECTURE_SEULE,
    aPermission: () => true,
    quota: () => null,
    ...partiel
  } as unknown as ServiceContexte;
}

const session = {} as Session;

describe('ce qui empeche de commencer', () => {
  beforeEach(() => { poserAcces(session, contexte({})); });

  it('ne voit aucun empechement quand on peut ecrire et qu il reste de la place', () => {
    expect(empechementCourant()).toBe(null);
  });

  it('nomme la place de lecture, qui ne peut rien creer', () => {
    poserAcces(session, contexte({ aPermission: () => false }));
    expect(empechementCourant()).toEqual({ raison: 'lecture' });
  });

  it('nomme le quota epuise', () => {
    poserAcces(session, contexte({ quota: () => ({ reste: 0 }) as never }));
    expect(empechementCourant()).toEqual({ raison: 'quota' });
  });

  it('laisse passer un quota qui n est pas atteint', () => {
    poserAcces(session, contexte({ quota: () => ({ reste: 3 }) as never }));
    expect(empechementCourant()).toBe(null);
  });

  it('laisse passer une fonction qui n est pas un quota', () => {
    // `reste` rend `null` pour une fonction booleenne : ce n'est pas zero, c'est « sans objet ».
    poserAcces(session, contexte({ quota: () => null }));
    expect(empechementCourant()).toBe(null);
  });

  it('regarde le droit AVANT la place : un lecteur n a pas de quota a atteindre', () => {
    poserAcces(session, contexte({ aPermission: () => false, quota: () => ({ reste: 0 }) as never }));
    expect(empechementCourant()).toEqual({ raison: 'lecture' });
  });
});

describe('ce que l ecran doit continuer de dire', () => {
  const zone = readFileSync(resolve(__dirname, '../../../src/zones/PremierPas.tsx'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../src/app/premierPas.ts'), 'utf8');
  const boot = readFileSync(resolve(__dirname, '../../../src/app/boot.ts'), 'utf8');

  it('n offre aucun choix quand rien ne peut etre cree', () => {
    // Montrer deux boutons qui echouent est pire que de dire pourquoi : la personne s'y reprend a
    // trois fois avant de soupconner que ce n'est pas elle. La branche rend donc avant les options.
    const avantLesOptions = zone.slice(0, zone.indexOf('Par quoi commencer'));
    expect(avantLesOptions).toContain('if (empechement)');
    expect(avantLesOptions).not.toContain("choisir('adresse')");
    expect(avantLesOptions).not.toContain("choisir('demo')");
  });

  it('propose exactement deux facons de commencer', () => {
    expect(zone.split('premierChoix').length - 1).toBeGreaterThanOrEqual(2);
    expect(zone).toContain("choisir('adresse')");
    expect(zone).toContain("choisir('demo')");
  });

  it('met l adresse en premier : c est ce qu on veut faire pour de bon', () => {
    expect(zone.indexOf("choisir('adresse')")).toBeLessThan(zone.indexOf("choisir('demo')"));
    expect(zone).toContain('premierChoix--premier');
  });

  it('ne resout la promesse que sur un choix, jamais sur une impasse', () => {
    // Il n'y a pas de plan derriere : rendre la main afficherait un atelier vide au lieu de la
    // raison. L'unique `resoudre` est donc dans le rappel du choix.
    expect(module.split('resoudre(').length - 1).toBe(1);
    expect(module).toContain('choisir: (c: Choix) => { fermer(); resoudre(c); }');
  });

  it('monte sa propre racine, comme la porte : l atelier n existe pas encore', () => {
    expect(module).toContain('createRoot');
    expect(module).toContain('zonePremierPas');
  });

  it('ouvre l import cadastre par la COMMANDE, qui porte les droits et le quota', () => {
    // Passer par la fonction directement ferait du premier pas le seul chemin qui contourne la
    // capacite cadastre, la permission d'ecrire et le quota de plans.
    expect(boot).toContain("if (seed.ouvrirAdresse) commandes.executer('projet.depuisAdresse');");
  });
});
