// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { jetonDuFragment, adresseSansFragment, poserLesMetasDuPartage, graineDuPartage, effacerLeJeton } from '../../../src/app/projetPartage.js';
import { retireEnPartage, entrerEnPartage, droitsCourants, peutEcrire, enLectureSeule } from '../../../src/app/acces.js';
import { creerRegistre, type Commande } from '../../../src/app/commandes.js';
import { SCHEMA_VERSION } from '../../../src/model/version.js';

// Lire un projet partage (lot 6) : le jeton se lit dans le fragment et quitte l'adresse ; le document s'ouvre par les migrations ;
// la lecture seule retire du registre tout ce qui modifie, enregistre, importe, audite ou appelle la plateforme.

afterEach(() => { document.head.innerHTML = ''; });

describe('le jeton d un lien', () => {
  it('se lit dans le fragment, et seulement la', () => {
    expect(jetonDuFragment('#share=abc_DEF-123')).toBe('abc_DEF-123');
    expect(jetonDuFragment('#x=1&share=abc')).toBe('abc');
    expect(jetonDuFragment('')).toBeNull();
    expect(jetonDuFragment('#partage=abc')).toBeNull();
  });

  it('quitte la barre d adresse, le produit reste', () => {
    expect(adresseSansFragment('https://plan.test/?product=plan#share=abc')).toBe('https://plan.test/?product=plan');
    history.replaceState(null, '', '/?product=plan#share=secret');
    effacerLeJeton();
    expect(location.hash).toBe('');
    expect(location.search).toBe('?product=plan');
  });

  it('pose le refus du referent et de l indexation', () => {
    poserLesMetasDuPartage();
    poserLesMetasDuPartage();
    expect(document.head.querySelectorAll('meta[name="referrer"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]')?.content).toBe('no-referrer');
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toMatch(/noindex/);
  });
});

describe('le document partage', () => {
  const lu = (schema: number, document: unknown) => ({ project: { name: 'Terrasse', schema_version: schema, document: document as Record<string, unknown>, updated_at: '2026-11-16T10:00:00Z' }, shared_by: 'Ada', expires_at: '2026-12-16T10:00:00Z' });

  it('s ouvre dans la forme courante, sans depot, avec ce que le bandeau dit', () => {
    const r = graineDuPartage(lu(1, { objects: [{ key: 'a', type: 'polygon', pts: [] }], measures: [] }));
    expect('graine' in r).toBe(true);
    if (!('graine' in r)) return;
    expect(r.graine.apiAvailable).toBe(false);
    expect(r.graine.objects).toHaveLength(1);
    expect(r.graine.meta.name).toBe('Terrasse');
    expect(r.info).toEqual({ nom: 'Terrasse', partagePar: 'Ada', jusquau: '2026-12-16T10:00:00Z', enregistreLe: '2026-11-16T10:00:00Z' });
  });

  it('refuse un schema plus recent que le programme, et ce qui n est pas un plan', () => {
    expect(graineDuPartage(lu(SCHEMA_VERSION + 1, { objects: [] }))).toEqual({ refus: { raison: 'recent', schema: SCHEMA_VERSION + 1 } });
    expect(graineDuPartage(lu(1, {}))).toEqual({ refus: { raison: 'pasUnPlan' } });
  });
});

describe('la lecture seule d un projet partage', () => {
  const c = (o: Partial<Commande>): Commande => ({ id: 'x.y', libelle: 'x', groupe: 'vue', executer: () => {}, ...o });

  it('retire ce qui ecrit, enregistre, importe, audite ou appelle la plateforme ; garde la vue, les exports locaux et l affichage', () => {
    expect(retireEnPartage(c({ id: 'objet.supprimer', groupe: 'objet', permission: 'projects.write' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'projet.enregistrer', groupe: 'projet' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'audit.parcelle', groupe: 'audit' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'assistant.demander', groupe: 'assistant' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'fichier.importerJson', groupe: 'fichier' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'objet.annuler', groupe: 'objet' }))).toBe(true);
    expect(retireEnPartage(c({ id: 'vue.3d', groupe: 'vue' }))).toBe(false);
    expect(retireEnPartage(c({ id: 'export.ouvrirDevis', groupe: 'export' }))).toBe(false);
    expect(retireEnPartage(c({ id: 'affichage.voisinage', groupe: 'affichage', ecrit: 'affichage' }))).toBe(false);
  });

  it('efface ces commandes du registre, sans droit d ecrire', () => {
    entrerEnPartage({ nom: 'T', partagePar: null, jusquau: '2026-12-16T10:00:00Z', enregistreLe: '2026-11-16T10:00:00Z' });
    expect(peutEcrire()).toBe(false);
    expect(enLectureSeule()).toBe(true);
    const cmd = creerRegistre(droitsCourants());
    cmd.declarer(c({ id: 'objet.supprimer', groupe: 'objet', permission: 'projects.write' }));
    cmd.declarer(c({ id: 'vue.3d', groupe: 'vue' }));
    expect(cmd.effacee('objet.supprimer')).toBe(true);
    expect(cmd.executer('objet.supprimer')).toBe(false);
    expect(cmd.etat('vue.3d')).toEqual({ utilisable: true });
  });
});
