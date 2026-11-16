// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: vi.fn(), showErreur: vi.fn(), showConfirm: () => {} }));

import {
  creerEnregistrementAuto, DELAI_ENREGISTREMENT_AUTO_MS, ATTENTE_OCCUPE_MS, REPRISES_APRES_ECHEC_MS,
  lirePreferenceEnregistrementAuto, ecrirePreferenceEnregistrementAuto, suivreLesPointeurs, type ContexteEnregistrementAuto
} from '../../../src/app/enregistrementAuto.js';
import { creerProjet, type ContexteProjet } from '../../../src/app/projet.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre, DROITS_OUVERTS } from '../../../src/app/commandes.js';
import { creerEtat } from '../../../src/core/state.js';
import { serializeObjects, serializeMeasures } from '../../../src/io/serialisation.js';
import { texteStatut } from '../../../src/zones/statut.js';
import { pageRetenue, partirSansQuestion } from '../../../src/shell/depart.js';
import { showErreur } from '../../../src/shell/dialogs.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// L'enregistrement automatique (audit de l'IHM du 16 novembre 2026, lot 1) : un ajout fait puis la page rechargee etait perdu.

/** Un plan de test : un compteur de modifications et son « modifie », comme core/historique.ts les tient. */
function plan(partiel: Partial<ContexteEnregistrementAuto> = {}) {
  const e = { modifs: 0, sale: false, occupe: false, enCours: false, actif: true, possible: true };
  const enregistrer = vi.fn(async () => { e.sale = false; return true; });
  const auto = creerEnregistrementAuto({
    actif: () => e.actif, possible: () => e.possible, sale: () => e.sale, modifications: () => e.modifs,
    occupe: () => e.occupe, enregistrementEnCours: () => e.enCours, enregistrer, ...partiel
  });
  const modifier = () => { e.modifs++; e.sale = true; auto.signaler(); };
  return { e, auto, enregistrer, modifier };
}

describe('l enregistrement automatique', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('enregistre quelques secondes apres la DERNIERE modification, une seule fois', async () => {
    const { auto, enregistrer, modifier } = plan();
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS - 500);
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS - 500);
    expect(enregistrer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).toHaveBeenCalledOnce();
    expect(auto.prevu()).toBe(false);
  });

  it('un statut republie sans modification nouvelle ne relance pas le delai', async () => {
    const { auto, enregistrer, modifier } = plan();
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS - 500);
    auto.signaler(); auto.signaler();
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).toHaveBeenCalledOnce();
  });

  it('n enregistre rien quand rien n est modifie', async () => {
    const { auto, enregistrer } = plan();
    auto.signaler();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('n enregistre pas en lecture seule (ni sans projet ouvert) : « possible » le refuse', async () => {
    const { e, enregistrer, modifier } = plan();
    e.possible = false;
    modifier();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('n enregistre pas quand la preference est decochee', async () => {
    const { e, enregistrer, modifier } = plan();
    e.actif = false;
    modifier();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('attend la fin d un geste en cours avant d enregistrer', async () => {
    const { e, enregistrer, modifier } = plan();
    e.occupe = true;
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 3 * ATTENTE_OCCUPE_MS);
    expect(enregistrer).not.toHaveBeenCalled();
    e.occupe = false;
    await vi.advanceTimersByTimeAsync(ATTENTE_OCCUPE_MS + 10);
    expect(enregistrer).toHaveBeenCalledOnce();
  });

  it('ne double pas un enregistrement deja en cours (Ctrl+S, la tache de fond), ni le sien', async () => {
    let finir!: (ok: boolean) => void;
    const enregistrer = vi.fn(() => new Promise<boolean>((r) => { finir = r; }));
    const { e, auto, modifier } = plan({ enregistrer });
    e.enCours = true;
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + ATTENTE_OCCUPE_MS);
    expect(enregistrer).not.toHaveBeenCalled();
    e.enCours = false;
    await vi.advanceTimersByTimeAsync(ATTENTE_OCCUPE_MS + 10);
    expect(enregistrer).toHaveBeenCalledOnce();
    expect(auto.enCours()).toBe(true);
    // Modifie pendant l'envoi : rien ne part en double ; il repart apres la fin de l'envoi.
    modifier();
    await vi.advanceTimersByTimeAsync(2 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(enregistrer).toHaveBeenCalledOnce();
    finir(true);
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(enregistrer).toHaveBeenCalledTimes(2);
  });

  it('un echec : le dit, puis reessaie (10 s, 30 s, puis chaque minute) ; un succes remet le compte a zero', async () => {
    let refuser = true;
    const apresEchec = vi.fn();
    const enregistrer = vi.fn(async () => !refuser);
    const { e, auto, modifier } = plan({ enregistrer, apresEchec });
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(apresEchec).toHaveBeenLastCalledWith(1, REPRISES_APRES_ECHEC_MS[0]);
    // Une modification pendant l'attente ne rapproche pas la reprise.
    modifier();
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[0] - 100);
    expect(enregistrer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(enregistrer).toHaveBeenCalledTimes(2);
    expect(apresEchec).toHaveBeenLastCalledWith(2, REPRISES_APRES_ECHEC_MS[1]);
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[1] + 10);
    expect(apresEchec).toHaveBeenLastCalledWith(3, REPRISES_APRES_ECHEC_MS[2]);
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[2] + 10);
    expect(apresEchec).toHaveBeenLastCalledWith(4, REPRISES_APRES_ECHEC_MS[2]);
    refuser = false;
    enregistrer.mockImplementation(async () => { e.sale = false; return true; });
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[2] + 10);
    expect(auto.echecs()).toBe(0);
    expect(auto.prevu()).toBe(false);
  });

  it('une exception de l enregistrement compte comme un echec', async () => {
    const apresEchec = vi.fn();
    const { modifier } = plan({ enregistrer: vi.fn(async () => { throw new Error('reseau'); }), apresEchec });
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(apresEchec).toHaveBeenCalledWith(1, REPRISES_APRES_ECHEC_MS[0]);
  });
});

describe('la preference « Enregistrement automatique »', () => {
  it('est cochee par defaut, et quand le stockage est refuse', () => {
    expect(lirePreferenceEnregistrementAuto({ getItem: () => null })).toBe(true);
    expect(lirePreferenceEnregistrementAuto({ getItem: () => { throw new Error('refuse'); } })).toBe(true);
    expect(lirePreferenceEnregistrementAuto(null)).toBe(true);
  });
  it('se garde dans le navigateur', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    ecrirePreferenceEnregistrementAuto(false, st);
    expect(lirePreferenceEnregistrementAuto(st)).toBe(false);
    ecrirePreferenceEnregistrementAuto(true, st);
    expect(lirePreferenceEnregistrementAuto(st)).toBe(true);
  });
});

describe('un geste en cours', () => {
  it('se lit sur les pointeurs appuyes, jusqu a leur lacher', () => {
    const cible = new EventTarget() as unknown as Window;
    const occupe = suivreLesPointeurs(cible);
    const ev = (type: string, id: number) => Object.assign(new Event(type), { pointerId: id });
    expect(occupe()).toBe(false);
    cible.dispatchEvent(ev('pointerdown', 1));
    cible.dispatchEvent(ev('pointerdown', 2));
    expect(occupe()).toBe(true);
    cible.dispatchEvent(ev('pointerup', 1));
    expect(occupe()).toBe(true);
    cible.dispatchEvent(ev('pointercancel', 2));
    expect(occupe()).toBe(false);
  });
});

/** Le projet (app/projet.ts) avec son enregistrement automatique, sur une plateforme simulee. */
function monterProjet(apiSave: ContexteProjet['apiSave'], { meta = { id: 'p1', name: 'Projet' } as never, lectureSeule = false } = {}) {
  const etat = creerEtat({}, (o) => o as ObjetPlan[]);
  etat.objects = [{ key: 'parcelle', type: 'polygon', name: 'P', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } as unknown as ObjetPlan];
  etat.lectureSeule = lectureSeule;
  const magasin = creerMagasin(etat);
  const cmd = creerRegistre(DROITS_OUVERTS);
  let rafraichir = () => {};
  let modifs = 0;
  const ctx = {
    etat, apiSave, apiDelete: vi.fn(),
    serializeObjects, serializeMeasures, initialState: () => [], initialMeasures: () => [],
    withProjectParam: (id: string) => '?p=' + id, cleDernierProjet: 'k', definirRafraichisseurStatut: (f: () => void) => { rafraichir = f; },
    modifications: () => modifs,
    ouvrirImportCadastre: () => {}, ouvrirDialogueActualisation: () => {}, actualisationEnCours: () => false
  } as unknown as ContexteProjet;
  const projet = creerProjet({ apiAvailable: true, meta, list: [] }, ctx, magasin, cmd);
  // Ce que fait core/historique.ts::marquerModifie : compter, marquer, republier le statut.
  const modifier = () => { modifs++; etat.dirty = true; rafraichir(); };
  return { etat, magasin, projet, modifier };
}

describe('l enregistrement automatique du projet ouvert', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(showErreur).mockClear(); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('enregistre le projet modifie, et la page ne retient plus rien ensuite', async () => {
    const apiSave = vi.fn(async () => ({ id: 'p1', updatedAt: '2026-11-16T10:42:00' }));
    const { etat, magasin, modifier } = monterProjet(apiSave);
    modifier();
    expect(pageRetenue()).toBe(true);
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(apiSave).toHaveBeenCalledOnce();
    expect(etat.dirty).toBe(false);
    expect(texteStatut(magasin.store.getState().projet)).toMatch(/^Enregistré à 10:42/);
    expect(pageRetenue()).toBe(false);
  });

  it('dit son echec dans la barre d etat avec l heure de la reprise, et ne remet le bandeau qu une fois', async () => {
    let refuser = true;
    const apiSave = vi.fn(async () => { if (refuser) throw new Error('Le serveur ne répond pas'); return { id: 'p1', updatedAt: '2026-11-16T10:42:00' }; });
    const { magasin, modifier } = monterProjet(apiSave);
    modifier();
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(texteStatut(magasin.store.getState().projet)).toMatch(/^Échec de l’enregistrement \(\d+ Ko\) — nouvelle tentative à \d\d:\d\d:\d\d$/);
    expect(showErreur).toHaveBeenCalledOnce();
    // Le reseau en clair (util/erreurReseau.ts) : la phrase, puis le message d'origine en detail.
    expect(vi.mocked(showErreur).mock.calls[0]).toEqual([expect.stringMatching(/^L’enregistrement automatique a échoué \(\d+ Ko\) : la plateforme ne répond pas\. Rien n’est perdu/), 'Le serveur ne répond pas']);
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[0] + 10);
    expect(apiSave).toHaveBeenCalledTimes(2);
    expect(showErreur).toHaveBeenCalledOnce();
    refuser = false;
    await vi.advanceTimersByTimeAsync(REPRISES_APRES_ECHEC_MS[1] + 10);
    expect(apiSave).toHaveBeenCalledTimes(3);
    expect(magasin.store.getState().projet.echec).toBe('');
  });

  it('n enregistre rien en lecture seule', async () => {
    const apiSave = vi.fn(async () => ({ id: 'p1' }));
    const { modifier } = monterProjet(apiSave, { lectureSeule: true });
    modifier();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(apiSave).not.toHaveBeenCalled();
  });

  it('ne cree pas d office un plan qui n est pas encore un projet (le quota), et le dit', async () => {
    const apiSave = vi.fn(async () => ({ id: 'p9' }));
    const { magasin, modifier } = monterProjet(apiSave, { meta: null as never });
    modifier();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(apiSave).not.toHaveBeenCalled();
    expect(texteStatut(magasin.store.getState().projet)).toBe('Pas encore enregistré : Fichier › Nouveau projet pour le garder');
    expect(pageRetenue()).toBe(true);
  });

  it('suit la preference : decochee, rien ne part ; recochee, le projet modifie s enregistre', async () => {
    const apiSave = vi.fn(async () => ({ id: 'p1' }));
    const { magasin, modifier } = monterProjet(apiSave);
    magasin.definirOption('enregistrementAuto', false);
    expect(localStorage.getItem('plan.enregistrementAuto')).toBe('non');
    modifier();
    await vi.advanceTimersByTimeAsync(10 * DELAI_ENREGISTREMENT_AUTO_MS);
    expect(apiSave).not.toHaveBeenCalled();
    magasin.definirOption('enregistrementAuto', true);
    await vi.advanceTimersByTimeAsync(DELAI_ENREGISTREMENT_AUTO_MS + 10);
    expect(apiSave).toHaveBeenCalledOnce();
  });

  it('un depart voulu par Plan (projet cree, deconnexion confirmee) ne repose pas la question du navigateur', () => {
    const { modifier } = monterProjet(vi.fn(async () => ({ id: 'p1' })));
    modifier();
    expect(pageRetenue()).toBe(true);
    partirSansQuestion();
    expect(pageRetenue()).toBe(false);
  });
});
