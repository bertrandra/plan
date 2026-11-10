// « Appliquer la liste » demande le droit d'ecrire le projet (decision du proprietaire du 30 octobre 2026, question 24 de
// MD/spec-lecture-ia-elargie.md) : un compte en lecture seule n'applique rien, et le registre le dit avec sa raison. La commande est
// alors une ecriture gardee : ni « sans controle des droits » ni « sans annulation » dans Admin > Controleurs (point 53 de la fumee).
import { describe, it, expect } from 'vitest';
import { brancherAssistant, type ContexteBranchementAssistant } from '../../../../src/app/assistant/branchement.js';
import { creerRegistre, DROITS_OUVERTS, PHRASE_PERMISSION, type Droits } from '../../../../src/app/commandes.js';
import { PERMISSION_ECRITURE } from '../../../../src/app/acces.js';

const lecteur: Droits = { ...DROITS_OUVERTS, branchee: () => true, aPermission: (p) => p !== PERMISSION_ECRITURE };

function brancher(droits?: Droits) {
  const commandes = creerRegistre(droits);
  const ctx = {
    etat: { objects: [], selectedKey: null, lectureSeule: false },
    magasin: { store: { getState: () => ({ classe: 'large', projet: { courant: null } }) } },
    commandes,
    inspecteur: { contexte: () => ({}), sections: () => [] },
    transaction: (f: () => boolean) => f()
  } as unknown as ContexteBranchementAssistant;
  brancherAssistant(ctx);
  return commandes;
}

describe('assistant : le droit d ecrire le projet', () => {
  it('« Appliquer la liste » porte la permission d ecriture, et ne se declare plus ecriture sans permission', () => {
    const c = brancher().lister().find((x) => x.id === 'assistant.appliquer');
    expect(c?.permission).toBe(PERMISSION_ECRITURE);
    expect(c?.ecrit).toBeUndefined();
  });

  it('un compte sans le droit d ecrire voit la commande grisee, avec la phrase du droit manquant', () => {
    expect(brancher(lecteur).etat('assistant.appliquer')).toEqual({ utilisable: false, raison: 'permission', message: PHRASE_PERMISSION });
  });
});
