// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// « Nouveau projet » demande un nom : la fausse invite repond tout de suite, avec la proposition.
vi.mock('../../../src/shell/dialogs.js', () => ({
  showToast: () => {}, showErrBanner: () => {}, showConfirm: () => {},
  showPrompt: (_q: string, defaut: string, ok: (nom: string) => void) => ok(defaut)
}));

import { creerProjet, type ContexteProjet } from '../../../src/app/projet.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre, DROITS_OUVERTS } from '../../../src/app/commandes.js';
import { creerEtat } from '../../../src/core/state.js';
import { apiSave, definirDepot, type DepotProjets } from '../../../src/io/api.js';
import { modeleGarde } from '../../../src/io/modeleGarde.js';
import { serializeObjects, serializeMeasures } from '../../../src/io/serialisation.js';
import { dialogues, type Dialogue } from '../../../src/shell/dialogues.js';
import { SCHEMA_VERSION } from '../../../src/model/version.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// « À la création d'un nouveau projet j'ai la question pour mettre à jour la version du projet »
// (le proprietaire, 8 novembre 2026). Un projet s'ecrit au plus petit schema qui le decrit
// (model/migrations.ts) : un plan neuf sans releve part donc a un schema ancien, et sa premiere
// ouverture posait « Mettre a jour le modele ? ». Un projet que cette version vient de creer ne la
// pose plus ; un projet d'une version precedente la pose toujours, et « Garder tel quel » reste retenu.

const PARCELLE = { key: 'parcelle', type: 'polygon', name: 'P', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };

let enregistrer: ReturnType<typeof vi.fn>;
let ouvertes: Dialogue[];

beforeEach(() => {
  localStorage.clear();
  let n = 0;
  enregistrer = vi.fn(async (c: { id?: string }) => ({ id: c.id ?? 'neuf' + ++n, updatedAt: '2026-11-08T10:00:00Z' }));
  definirDepot({ lister: vi.fn(), ouvrir: vi.fn(), enregistrer, supprimer: vi.fn() } as unknown as DepotProjets);
  ouvertes = [];
  vi.spyOn(dialogues, 'ouvrir').mockImplementation((d) => { ouvertes.push(d); });
});

afterEach(() => { vi.restoreAllMocks(); });

/** Le projet `id` ouvert au schema `schema`, comme au demarrage ; le depot est le vrai `apiSave`. */
function ouvrir(id: string, schema: number) {
  const etat = creerEtat({ schemaVersion: schema }, (o) => o as ObjetPlan[]);
  etat.objects = [structuredClone(PARCELLE) as unknown as ObjetPlan];
  const cmd = creerRegistre(DROITS_OUVERTS);
  const ctx = {
    etat, apiSave, apiDelete: vi.fn(),
    serializeObjects, serializeMeasures, initialState: () => [], initialMeasures: () => [],
    // Une ancre plutot qu'une adresse : jsdom ne recharge pas la page.
    withProjectParam: (pid: string) => '#projet=' + pid, cleDernierProjet: 'k', definirRafraichisseurStatut: () => {},
    ouvrirImportCadastre: () => {}, ouvrirDialogueActualisation: () => {}, actualisationEnCours: () => false
  } as unknown as ContexteProjet;
  const projet = creerProjet({ apiAvailable: true, meta: { id, name: 'Projet ' + id }, list: [] }, ctx, creerMagasin(etat), cmd);
  return { projet, cmd };
}

describe('« Mettre à jour le modèle ? » et un projet neuf', () => {
  it('un projet cree par « Nouveau projet » est ecrit au plus petit schema, et sa premiere ouverture ne pose pas la question', async () => {
    const { cmd } = ouvrir('ancien', 1);
    // Le projet ouvert est d'avant : la question vaut pour lui, pas pour sa copie.
    cmd.executer('projet.nouveau');
    await vi.waitFor(() => expect(enregistrer).toHaveBeenCalledTimes(1));
    const envoye = enregistrer.mock.calls[0]![0] as { id?: string; schemaVersion: number };
    expect(envoye.id).toBeUndefined();
    // Le schema ecrit ne change pas : le projet reste lisible par les versions precedentes.
    expect(envoye.schemaVersion).toBeLessThan(SCHEMA_VERSION);
    await vi.waitFor(() => expect(location.hash).toBe('#projet=neuf1'));
    expect(modeleGarde('neuf1')).toBe(true);
    // Le rechargement : le projet neuf s'ouvre a son schema, en retard sur le programme, sans question.
    const rouvert = ouvrir('neuf1', envoye.schemaVersion);
    expect(rouvert.cmd.etat('projet.mettreAJourModele').utilisable).toBe(true);
    rouvert.projet.proposerMiseAJour();
    expect(ouvertes).toHaveLength(0);
  });

  it('un projet cree par le depot (premier pas, import cadastre) est retenu ; un enregistrement ne l est pas', async () => {
    await apiSave({ name: 'Parcelle AE 101', objects: [PARCELLE], measures: [] });
    expect(modeleGarde('neuf1')).toBe(true);
    await apiSave({ id: 'existant', name: 'Existant', objects: [PARCELLE], measures: [] });
    expect(modeleGarde('existant')).toBe(false);
  });

  it('un projet d une version precedente pose toujours la question, et « Garder tel quel » reste retenu', () => {
    const premier = ouvrir('ancien', 5);
    premier.projet.proposerMiseAJour();
    expect(ouvertes).toHaveLength(1);
    const d = ouvertes[0]! as Extract<Dialogue, { type: 'choix' }>;
    expect(d.titre).toBe('Mettre à jour le modèle ?');
    expect(d.secondaire.libelle).toBe('Garder tel quel');
    d.secondaire.executer();
    ouvrir('ancien', 5).projet.proposerMiseAJour();
    expect(ouvertes).toHaveLength(1);
  });

  it('la memoire d un projet neuf ne vaut que pour le schema du programme qui l a cree', () => {
    localStorage.setItem('planInteractif.modeleGarde.vieux', String(SCHEMA_VERSION - 1));
    ouvrir('vieux', 1).projet.proposerMiseAJour();
    expect(ouvertes).toHaveLength(1);
  });
});
