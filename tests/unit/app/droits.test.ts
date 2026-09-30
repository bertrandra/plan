import { describe, it, expect } from 'vitest';
import {
  creerRegistre, DROITS_OUVERTS, PHRASE_CAPACITE, PHRASE_PERMISSION, PHRASE_QUOTA, type Droits
} from '../../../src/app/commandes.js';

// Etape 3 de MD/spec-connexion-plateforme.md §16 : le droit s'accroche a la commande, jamais au
// bouton. Ce que ces tests figent, c'est la regle d'affichage — une capacite non achetee efface,
// une permission manquante explique — et le fait que sans plateforme, rien ne change.


function droits(partiel: Partial<Droits>): Droits {
  return { branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => null, ...partiel };
}

function registre(d: Droits = DROITS_OUVERTS) {
  const r = creerRegistre(d);
  let executions = 0;
  r.declarer({ id: 'libre', libelle: 'Libre', groupe: 'projet', executer: () => { executions++; } });
  r.declarer({ id: 'ecrire', libelle: 'Enregistrer', groupe: 'projet', permission: 'projects.write', executer: () => { executions++; } });
  r.declarer({ id: 'acheter', libelle: 'Vue 3D', groupe: '3d', capacite: 'plan.3d', executer: () => { executions++; } });
  r.declarer({ id: 'creer', libelle: 'Nouveau', groupe: 'projet', permission: 'projects.write', quota: 'plan.documents', executer: () => { executions++; } });
  r.declarer({ id: 'contextuelle', libelle: 'Aligner', groupe: 'objet', actif: () => false, executer: () => { executions++; } });
  return { r, executions: () => executions };
}

describe('sans plateforme branchee', () => {
  it('ne change rien : tout reste utilisable, comme en 1.2.0', () => {
    const { r } = registre();
    for (const id of ['libre', 'ecrire', 'acheter', 'creer']) {
      expect(r.etat(id).utilisable, id).toBe(true);
    }
  });

  it('laisse la condition d activation decider, elle', () => {
    const { r } = registre();
    expect(r.etat('contextuelle').utilisable).toBe(false);
  });
});

describe('une permission manquante', () => {
  it('laisse la commande visible et l explique', () => {
    const { r } = registre(droits({ aPermission: (c) => c !== 'projects.write' }));
    const e = r.etat('ecrire');
    expect(e.utilisable).toBe(false);
    expect(e.utilisable === false && e.raison).toBe('permission');
    expect(e.utilisable === false && 'message' in e && e.message).toBe(PHRASE_PERMISSION);
    expect(r.effacee('ecrire')).toBe(false);
  });

  it('empeche l execution, sans lever', () => {
    const { r, executions } = registre(droits({ aPermission: () => false }));
    expect(r.executer('ecrire')).toBe(false);
    expect(executions()).toBe(0);
  });
});

describe('une capacite non achetee', () => {
  it('efface la commande : un outil de travail n est pas une publicite', () => {
    const { r } = registre(droits({ aCapacite: (c) => c !== 'plan.3d' }));
    const e = r.etat('acheter');
    expect(e.utilisable === false && e.raison).toBe('capacite');
    expect(e.utilisable === false && 'message' in e && e.message).toBe(PHRASE_CAPACITE);
    expect(r.effacee('acheter')).toBe(true);
  });

  it('passe avant la permission : on n explique pas un droit sur une fonction qu on n a pas', () => {
    const { r } = registre(droits({ aCapacite: () => false, aPermission: () => false }));
    r.declarer({ id: 'deux', libelle: 'Deux', groupe: 'projet', capacite: 'x', permission: 'y', executer: () => undefined });
    const e = r.etat('deux');
    expect(e.utilisable === false && e.raison).toBe('capacite');
  });
});

describe('un quota epuise', () => {
  it('laisse la commande visible et dit que l abonnement est atteint', () => {
    const { r } = registre(droits({ reste: () => 0 }));
    const e = r.etat('creer');
    expect(e.utilisable === false && e.raison).toBe('quota');
    expect(e.utilisable === false && 'message' in e && e.message).toBe(PHRASE_QUOTA);
    expect(r.effacee('creer')).toBe(false);
  });

  it('ne dit rien quand il reste de la place', () => {
    const { r } = registre(droits({ reste: () => 23 }));
    expect(r.etat('creer').utilisable).toBe(true);
  });

  it('ne dit rien quand la fonction n est pas un quota', () => {
    // `reste` rend `null` pour une fonction booleenne : ce n'est pas zero, c'est « sans objet ».
    const { r } = registre(droits({ reste: () => null }));
    expect(r.etat('creer').utilisable).toBe(true);
  });

  it('passe apres la permission : le droit d abord, la place ensuite', () => {
    const { r } = registre(droits({ aPermission: () => false, reste: () => 0 }));
    expect(r.etat('creer').utilisable === false && (r.etat('creer') as { raison: string }).raison).toBe('permission');
  });
});

describe('une commande inconnue', () => {
  it('n est ni utilisable ni effacee', () => {
    const { r } = registre();
    expect(r.etat('jamais.declaree').utilisable).toBe(false);
    expect(r.effacee('jamais.declaree')).toBe(false);
    expect(r.executer('jamais.declaree')).toBe(false);
  });
});

describe('les commandes du projet portent bien leurs droits', () => {
  it('nomme projects.write sur ce qui ecrit chez la plateforme', async () => {
    // On lit la source plutot que de monter tout `app/projet.ts`, qui tire la moitie du programme.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../../../src/app/projet.ts'), 'utf8');
    for (const id of ['projet.nouveau', 'projet.enregistrer', 'projet.supprimer', 'projet.depuisAdresse']) {
      const bloc = source.slice(source.indexOf("id: '" + id + "'"), source.indexOf("id: '" + id + "'") + 220);
      // Le code de permission est nomme une seule fois, dans app/acces.ts : on cherche la
      // constante, pas la chaine, sinon deux ecritures du meme droit pourraient diverger.
      expect(bloc, id).toContain('permission: PERMISSION_ECRITURE');
    }
  });

  it('met le quota des projets — celui que la plateforme applique — sur les deux commandes qui en creent un', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../../../src/app/projet.ts'), 'utf8');
    for (const id of ['projet.nouveau', 'projet.depuisAdresse']) {
      const bloc = source.slice(source.indexOf("id: '" + id + "'"), source.indexOf("id: '" + id + "'") + 220);
      // `max_projects`, le quota que backprod verifie a la creation et a la copie — pas `plan.documents`.
      expect(bloc, id).toContain('QUOTA_PROJETS');
    }
  });
});
