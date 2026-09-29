import { describe, it, expect, vi } from 'vitest';
import { creerHistorique } from '../../../src/core/historique.js';
import { LIMITE_HISTORIQUE } from '../../../src/core/history.js';

// Ces tests figent le comportement ACTUEL de l'historique, parce qu'il va etre reecrit : ils
// servent de filet a la reecriture. Chacun dit une propriete qu'on veut garder — ou, pour le
// retablissement, une absence qu'on veut voir disparaitre.

/** Un etat de plan minimal, et des dependances qui ne font que compter leurs appels. */
function monter(objetsInitiaux: { key: string; x?: number }[] = [{ key: 'a', x: 1 }]) {
  const etat = {
    objects: objetsInitiaux.map((o) => ({ ...o })),
    measures: [] as Record<string, unknown>[],
    selectedKey: objetsInitiaux.length ? objetsInitiaux[0]!.key : null,
    dirty: false
  };
  const bouton = { disabled: true } as HTMLButtonElement;
  const appels = { render: 0, selecteur: 0, vuesDetruites: 0, domCrees: 0, resultats: 0, pile: [] as boolean[] };
  const ctx = {
    // Copie profonde volontaire : c'est ce que fait la vraie serialisation.
    serializeObjects: (o: unknown[]) => JSON.parse(JSON.stringify(o)),
    serializeMeasures: (m: unknown[]) => JSON.parse(JSON.stringify(m)),
    normalizeObjects: (b: unknown[]) => JSON.parse(JSON.stringify(b)),
    detruireVue: () => { appels.vuesDetruites++; },
    createObjectDOM: () => { appels.domCrees++; },
    rebuildHandles: () => {},
    reapplyStackingOrder: () => {},
    rebuildSelector: () => { appels.selecteur++; },
    render: () => { appels.render++; },
    boutonAnnuler: () => bouton,
    signalerPile: (vide: boolean) => { appels.pile.push(vide); },
    rafraichirResultats: () => { appels.resultats++; }
  };
  return { etat, ctx, bouton, appels, h: creerHistorique(etat, ctx) };
}

describe('marquer modifie', () => {
  it('signale le changement et previent l interface', () => {
    const { etat, h } = monter();
    const statut = vi.fn();
    h.definirRafraichisseurStatut(statut);
    h.marquerModifie();
    expect(etat.dirty).toBe(true);
    expect(statut).toHaveBeenCalledOnce();
  });

  it('ne tombe pas quand personne n ecoute encore', () => {
    // La barre de projet n'existe pas au tout debut du demarrage.
    const { h, etat } = monter();
    expect(() => h.marquerModifie()).not.toThrow();
    expect(etat.dirty).toBe(true);
  });

  it('rafraichit le statut sans marquer le plan modifie', () => {
    const { etat, h } = monter();
    const statut = vi.fn();
    h.definirRafraichisseurStatut(statut);
    h.declencherRafraichissementStatut();
    expect(statut).toHaveBeenCalledOnce();
    expect(etat.dirty).toBe(false);
  });
});

describe('empiler et annuler', () => {
  it('empile l etat AVANT la modification', () => {
    const { etat, h } = monter();
    h.empiler();
    etat.objects[0]!.x = 99;
    h.annuler();
    expect(etat.objects[0]!.x).toBe(1);
  });

  it('marque le plan modifie en empilant', () => {
    const { etat, h } = monter();
    h.empiler();
    expect(etat.dirty).toBe(true);
  });

  it('ne fait rien quand la pile est vide', () => {
    const { etat, h, appels } = monter();
    h.annuler();
    expect(appels.render).toBe(0);
    expect(etat.objects).toHaveLength(1);
  });

  it('fait revenir un objet supprime', () => {
    // C'est la propriete qui a justifie la reconstruction complete : reposer des valeurs sur les
    // objets en place ne pouvait pas ressusciter ce qui n'existait plus.
    const { etat, h } = monter([{ key: 'a' }, { key: 'b' }]);
    h.empiler();
    etat.objects.splice(1, 1);
    h.annuler();
    expect(etat.objects.map((o) => o.key)).toEqual(['a', 'b']);
  });

  it('retire un objet ajoute', () => {
    const { etat, h } = monter([{ key: 'a' }]);
    h.empiler();
    etat.objects.push({ key: 'nouveau' });
    h.annuler();
    expect(etat.objects.map((o) => o.key)).toEqual(['a']);
  });

  it('restaure aussi les cotes, qui vivent dans un autre tableau', () => {
    const { etat, h } = monter();
    etat.measures.push({ id: 'm1' });
    h.empiler();
    etat.measures.length = 0;
    h.annuler();
    expect(etat.measures).toEqual([{ id: 'm1' }]);
  });

  it('reconstruit tout plutot que de reposer des valeurs', () => {
    const { h, appels } = monter([{ key: 'a' }, { key: 'b' }]);
    h.empiler();
    h.annuler();
    expect(appels.vuesDetruites).toBe(2);
    expect(appels.domCrees).toBe(2);
    expect(appels.selecteur).toBe(1);
  });

  it('refait les panneaux de resultats : le tiroir montre l etat restaure, pas l annule', () => {
    // Annuler un champ de construction ne change ni la selection ni le contexte de terrasse : sans
    // ce rappel, le BOM du tiroir garderait les quantites de l'etat qu'on vient d'annuler.
    const { h, appels } = monter();
    h.empiler();
    expect(appels.resultats).toBe(0);
    h.annuler();
    expect(appels.resultats).toBe(1);
  });

  it('remonte plusieurs pas, un par annulation', () => {
    const { etat, h } = monter();
    h.empiler(); etat.objects[0]!.x = 2;
    h.empiler(); etat.objects[0]!.x = 3;
    h.annuler();
    expect(etat.objects[0]!.x).toBe(2);
    h.annuler();
    expect(etat.objects[0]!.x).toBe(1);
  });

  it('oublie les pas les plus anciens au-dela de la limite', () => {
    const { etat, h } = monter();
    for (let i = 0; i < LIMITE_HISTORIQUE + 10; i++) { h.empiler(); etat.objects[0]!.x = i; }
    expect(h.pile.taille).toBe(LIMITE_HISTORIQUE);
  });
});

describe('la selection apres une annulation', () => {
  it('reste sur l objet selectionne s il existe toujours', () => {
    const { etat, h } = monter([{ key: 'a' }, { key: 'b' }]);
    etat.selectedKey = 'b';
    h.empiler();
    etat.objects[0]!.key = 'a';
    h.annuler();
    expect(etat.selectedKey).toBe('b');
  });

  it('retombe sur le premier objet quand le selectionne a disparu', () => {
    const { etat, h } = monter([{ key: 'a' }]);
    h.empiler();
    etat.selectedKey = 'disparu';
    h.annuler();
    expect(etat.selectedKey).toBe('a');
  });

  it('tombe a null quand il ne reste plus rien', () => {
    const { etat, h } = monter([]);
    h.empiler();
    etat.selectedKey = 'disparu';
    h.annuler();
    expect(etat.selectedKey).toBeNull();
  });
});

describe('le bouton Annuler', () => {
  it('s active au premier pas et se desactive quand la pile se vide', () => {
    const { h, bouton } = monter();
    expect(bouton.disabled).toBe(true);
    h.empiler();
    expect(bouton.disabled).toBe(false);
    h.annuler();
    expect(bouton.disabled).toBe(true);
  });
});

describe('ce qui manque, et qu on veut voir changer', () => {
  it('n a pas de retablissement : annuler perd l avenir', () => {
    // Ce test documente une absence. Le jour ou le retablissement existe, il doit echouer — et
    // c'est le signal qu'on attend de lui.
    const { etat, h } = monter();
    h.empiler();
    etat.objects[0]!.x = 42;
    h.annuler();
    expect(etat.objects[0]!.x).toBe(1);
    expect('retablir' in h).toBe(false);
  });
});
