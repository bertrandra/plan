import { describe, it, expect } from 'vitest';
import { FICHIERS_DONNEES } from '../../../../src/regles/donnees/fichiers.js';
import { EMPREINTE_IA } from '../../../../src/facade/regles/facades/ia.js';
import { bilanDonnees, changerSeuil, controlerDonnees, lireDonnees, seuilsDuTexte } from '../../../../src/regles/donnees/edition.js';
import { EMPREINTE_REGLAGES_TOITS } from '../../../../src/regles/toits/reglages.js';
import { EMPREINTE_FAITS_TOITS } from '../../../../src/regles/toits/faits.js';
import { EMPREINTE_REGLAGES_FACADES } from '../../../../src/regles/facades/reglages.js';

// Les fichiers de donnees du moteur dans Admin › Regles : controles par le lecteur du code, un seuil change
// sans reformater le fichier, et l'empreinte qui dit si une version de lecture doit s'ajouter.

import { EMPREINTE_RECONCILIATION } from '../../../../src/regles/reconciliation.js';
import { EMPREINTE_SILHOUETTES_TOITS } from '../../../../src/regles/toits/silhouettes.js';
import { EMPREINTE_FORMES_TOITS } from '../../../../src/regles/toits/formes.js';
import { empreinteReglagesJardin } from '../../../../src/regles/jardin/reglages.js';
import { REGLAGES_JARDIN } from '../../../../src/app/regles/jardin.js';

const fichier = (id: string) => FICHIERS_DONNEES.find((f) => f.id === id)!;
const toits = fichier('reglagesToits'), facades = fichier('reglagesFacades'), faits = fichier('faitsToits');

describe('les fichiers livrés', () => {
  it('sont acceptés tels quels par le lecteur du code, et leur empreinte est celle que le code calcule', () => {
    expect(FICHIERS_DONNEES.map((f) => f.chemin)).toEqual(['regles/toits/reglages.json', 'regles/facades/reglages.json', 'regles/toits/faits.json', 'regles/toits/silhouettes.json', 'regles/toits/formes.json', 'regles/reconciliation.json', 'regles/facades/ia.json', 'regles/jardin/reglages.json']);
    expect(controlerDonnees(toits, toits.livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_REGLAGES_TOITS });
    expect(controlerDonnees(facades, facades.livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_REGLAGES_FACADES });
    expect(controlerDonnees(faits, faits.livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_FAITS_TOITS });
    expect(controlerDonnees(fichier('reconciliation'), fichier('reconciliation').livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_RECONCILIATION });
    expect(controlerDonnees(fichier('silhouettesToits'), fichier('silhouettesToits').livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_SILHOUETTES_TOITS });
    expect(controlerDonnees(fichier('formesToits'), fichier('formesToits').livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_FORMES_TOITS });
  });

  it('montrent les seuils des règles du run d’une façade, et refusent une valeur hors de ses bornes', () => {
    const ia = fichier('iaFacades');
    expect(controlerDonnees(ia, ia.livre)).toEqual({ valide: true, erreur: null, empreinte: EMPREINTE_IA });
    expect(seuilsDuTexte(ia.livre).map((x) => x.nom)).toContain('facades.ia.colombagePartMax');
    const plus = changerSeuil(ia.livre, 'facades.ia.colombagePartMax', 'valeur', 0.8)!;
    expect(bilanDonnees(ia, plus)).toMatchObject({ lignes: 1, empreinteChange: true });
    expect(controlerDonnees(ia, changerSeuil(ia.livre, 'facades.ia.colombagePartMax', 'valeur', 3)!).erreur).toMatch(/colombagePartMax/);
  });

  it('montrent les seuils de la lecture du jardin (lot L3), et refusent une valeur hors de ses bornes', () => {
    const j = fichier('jardin');
    expect(controlerDonnees(j, j.livre)).toEqual({ valide: true, erreur: null, empreinte: empreinteReglagesJardin(REGLAGES_JARDIN) });
    expect(seuilsDuTexte(j.livre).map((x) => x.nom)).toContain('jardin.ia.doublonM');
    expect(controlerDonnees(j, changerSeuil(j.livre, 'jardin.ia.certitudeMin', 'valeur', 2)!).erreur).toMatch(/certitudeMin/);
  });

  it('ne montrent aucun écart avec eux-mêmes', () => {
    for (const f of FICHIERS_DONNEES) expect(bilanDonnees(f, f.livre)).toMatchObject({ lignes: 0, empreinteChange: false });
  });
});

describe('changer un seuil', () => {
  const nom = 'SEUIL_MARCHE_M';

  it('ne touche qu’à la ligne du seuil : le reste du fichier est identique à l’octet', () => {
    const neuf = changerSeuil(toits.livre, nom, 'valeur', 0.9)!;
    const avant = toits.livre.split('\n'), apres = neuf.split('\n');
    expect(apres).toHaveLength(avant.length);
    const diff = avant.map((l, i) => [l, apres[i]] as const).filter(([a, b]) => a !== b);
    expect(diff).toHaveLength(1);
    expect(diff[0]![1]).toContain('"valeur": 0.9,');
    expect(diff[0]![0]).toContain('"valeur": 0.8,');
    expect(seuilsDuTexte(neuf).find((s) => s.nom === nom)?.valeur).toBe(0.9);
  });

  it('change la raison d’un seuil avec ses guillemets échappés, et rien d’autre', () => {
    const neuf = changerSeuil(toits.livre, nom, 'pourquoi', 'Une marche "brutale" d’au moins cela.')!;
    expect(lireDonnees(neuf).erreur).toBeNull();
    expect(seuilsDuTexte(neuf).find((s) => s.nom === nom)?.pourquoi).toBe('Une marche "brutale" d’au moins cela.');
    expect(seuilsDuTexte(neuf).find((s) => s.nom === nom)?.valeur).toBe(0.8);
  });

  it('rend null quand le seuil n’a pas sa ligne : il s’édite alors dans le texte du fichier', () => {
    expect(changerSeuil(toits.livre, 'SEUIL_QUI_N_EXISTE_PAS', 'valeur', 1)).toBeNull();
  });

  it('une valeur changée change l’empreinte (les toits seront relus) ; une raison changée non', () => {
    const valeur = bilanDonnees(toits, changerSeuil(toits.livre, nom, 'valeur', 0.9)!);
    expect(valeur).toMatchObject({ lignes: 1, empreinteChange: true });
    expect(valeur.controle.empreinte).not.toBe(EMPREINTE_REGLAGES_TOITS);
    const raison = bilanDonnees(toits, changerSeuil(toits.livre, nom, 'pourquoi', 'Autre raison.')!);
    expect(raison).toMatchObject({ lignes: 1, empreinteChange: false });
    expect(raison.controle.valide).toBe(true);
  });

  it('marche aussi sur les réglages des façades', () => {
    const premier = seuilsDuTexte(facades.livre)[0]!;
    const neuf = changerSeuil(facades.livre, premier.nom, 'valeur', premier.valeur + 0.1)!;
    expect(bilanDonnees(facades, neuf)).toMatchObject({ lignes: 1, empreinteChange: true });
  });
});

describe('ce que le moteur refuserait', () => {
  it('un JSON illisible, un format inconnu, un seuil sans valeur numérique', () => {
    expect(controlerDonnees(toits, '{ pas du json')).toMatchObject({ valide: false, erreur: expect.stringMatching(/^JSON illisible/), empreinte: null });
    expect(controlerDonnees(toits, '{"format":"autre","seuils":{}}')).toMatchObject({ valide: false });
    const sans = toits.livre.replace(/"SAILLIE_M": \{ "valeur": 2,/, '"SAILLIE_M": { "valeur": "deux",');
    expect(sans).not.toBe(toits.livre);
    expect(controlerDonnees(toits, sans)).toMatchObject({ valide: false, erreur: expect.stringMatching(/SAILLIE_M/) });
  });

  it('un fait dont la clé n’est pas une clé BD TOPO', () => {
    const abime = faits.livre.replace('BATIMENT0000000322509182', 'maison-du-coin');
    expect(controlerDonnees(faits, abime)).toMatchObject({ valide: false, erreur: expect.stringMatching(/maison-du-coin/) });
  });

  it('un fait ajouté change l’empreinte des faits ; sa preuve et son historique non', () => {
    const json = JSON.parse(faits.livre);
    const cle = Object.keys(json.faits)[0]!;
    const autre = JSON.parse(faits.livre);
    autre.faits[cle].preuve = { observation: 'autre preuve', photo: true };
    expect(bilanDonnees(faits, JSON.stringify(autre, null, 2))).toMatchObject({ empreinteChange: false });
    const retire = JSON.parse(faits.livre);
    delete retire.faits[cle];
    expect(bilanDonnees(faits, JSON.stringify(retire, null, 2))).toMatchObject({ empreinteChange: true });
  });
});
