import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ATTRIBUTS, EMPREINTE_RECONCILIATION, RECONCILIATION, ReconciliationIllisible, SOURCES, empreinteReconciliation, lireReconciliation } from '../../../src/regles/reconciliation.js';

// regles/reconciliation.json : comment les sources d'un batiment s'arbitrent (MD/spec-reconciliation.md). Une donnee du
// moteur de regles, lue par le meme lecteur au chargement du code et dans Admin › Regles.

const brut = () => JSON.parse(readFileSync('regles/reconciliation.json', 'utf8')) as { seuils: Record<string, { valeur: number }>; sources: Record<string, Record<string, unknown>>; attributs: Record<string, Record<string, unknown>> };
const refuse = (j: unknown): string | null => { try { lireReconciliation(j); return null; } catch (e) { expect(e).toBeInstanceOf(ReconciliationIllisible); return (e as Error).message; } };

describe('les règles de réconciliation des sources', () => {
  it('le fichier du dépôt est accepté : cinq sources, neuf attributs, trois seuils', () => {
    expect(SOURCES).toEqual(['ign', 'lidar', 'photo', 'claude', 'terrain']);
    expect(Object.keys(RECONCILIATION.attributs)).toEqual([...ATTRIBUTS]);
    expect(RECONCILIATION.seuils).toEqual({ SCORE_AUTO_MIN: 3, MARGE_AUTO_MIN: 1.5, CONFIANCE_ABSENTE: 0.8 });
    expect(EMPREINTE_RECONCILIATION).toBe(empreinteReconciliation(lireReconciliation(brut())));
  });

  it('Claude n’est jamais seul, la personne qui a vu pèse plus que toute autre source, le LiDAR seul suffit pour une hauteur', () => {
    const s = RECONCILIATION.sources;
    expect(s.claude.seule).toBe(false);
    expect(s.photo.seule).toBe(false);
    expect(s.terrain.poids).toBeGreaterThan(Math.max(...SOURCES.filter((x) => x !== 'terrain').map((x) => s[x].poids)) * 2);
    // Un LiDAR a 0,9 de confiance atteint le score automatique seul ; une photo seule non.
    expect(RECONCILIATION.attributs.hauteurEgout.poids.lidar! * 0.9).toBeGreaterThanOrEqual(RECONCILIATION.seuils.SCORE_AUTO_MIN);
    expect(RECONCILIATION.attributs.hauteurEgout.poids.photo! * 0.9).toBeLessThan(RECONCILIATION.seuils.SCORE_AUTO_MIN);
  });

  it('la lecture du LiDAR est décrite étape par étape, chaque module de regles/toits/reglages.json dans une étape', () => {
    expect(RECONCILIATION.lecturesLidar.map((e) => e.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const reglages = JSON.parse(readFileSync('regles/toits/reglages.json', 'utf8')) as { seuils: Record<string, { ou: string }> };
    const modules = RECONCILIATION.lecturesLidar.flatMap((e) => e.modules);
    for (const [nom, s] of Object.entries(reglages.seuils)) expect(modules.some((m) => s.ou === m || s.ou.startsWith(m + ' ')), nom + ' (' + s.ou + ')').toBe(true);
    // Une description change l'empreinte seulement si elle change la decision : elle n'en fait pas partie.
    const j = brut() as unknown as { lecturesLidar: { dit: string }[] }; j.lecturesLidar[0]!.dit = 'autre';
    expect(empreinteReconciliation(lireReconciliation(j))).toBe(EMPREINTE_RECONCILIATION);
  });

  it('refuse des étapes mal formées', () => {
    const essai = (f: (e: { lecturesLidar: Record<string, unknown>[] }) => void) => { const j = brut() as unknown as { lecturesLidar: Record<string, unknown>[] }; f(j); return refuse(j); };
    expect(essai((j) => { j.lecturesLidar = []; })).toMatch(/une liste d’étapes est attendue/);
    expect(essai((j) => { delete j.lecturesLidar[0]!.etape; })).toMatch(/lecturesLidar\[0\] : sans nom/);
    expect(essai((j) => { j.lecturesLidar[1]!.modules = []; })).toMatch(/lecturesLidar\[1\] : sans modules/);
    expect(essai((j) => { j.lecturesLidar[1]!.modules = ['model/toitMesure.ts']; })).toMatch(/le module « model\/toitMesure.ts » sert deux étapes/);
    expect(essai((j) => { j.lecturesLidar[2]!.ordre = 0; })).toMatch(/ordre hors de/);
  });

  it('les phrases ne changent pas l’empreinte ; un poids, un seuil ou une tolérance oui', () => {
    const phrases = brut(); phrases.sources.lidar!.voit = 'autre phrase'; (phrases.attributs.formeToit as { libelle: string }).libelle = 'Autre nom';
    expect(empreinteReconciliation(lireReconciliation(phrases))).toBe(EMPREINTE_RECONCILIATION);
    const poids = brut(); (poids.attributs.hauteurEgout!.poids as Record<string, number>).lidar = 3.5;
    expect(empreinteReconciliation(lireReconciliation(poids))).not.toBe(EMPREINTE_RECONCILIATION);
    const seuil = brut(); seuil.seuils.SCORE_AUTO_MIN!.valeur = 2.5;
    expect(empreinteReconciliation(lireReconciliation(seuil))).not.toBe(EMPREINTE_RECONCILIATION);
    const tol = brut(); (tol.attributs.hauteurEgout!.accord as { tolerance: number }).tolerance = 0.6;
    expect(empreinteReconciliation(lireReconciliation(tol))).not.toBe(EMPREINTE_RECONCILIATION);
  });

  it('refuse, avec sa raison, ce que le moteur ne saurait pas lire', () => {
    expect(refuse(null)).toMatch(/format inconnu/);
    const s = brut(); s.seuils.MARGE_AUTO_MIN!.valeur = 0.5;
    expect(refuse(s)).toMatch(/MARGE_AUTO_MIN hors de \[1, 100\]/);
    const nu = brut(); delete (nu.seuils as Record<string, unknown>).CONFIANCE_ABSENTE;
    expect(refuse(nu)).toMatch(/CONFIANCE_ABSENTE sans valeur numerique/);
    const src = brut(); src.sources.radar = { libelle: 'Radar', poids: 1, seule: true };
    expect(refuse(src)).toMatch(/source « radar » inconnue/);
    const sans = brut(); delete sans.sources.photo;
    expect(refuse(sans)).toMatch(/source « photo » absente/);
    const seule = brut(); sans.sources.lidar = { ...seule.sources.lidar, seule: 'oui' };
    expect(refuse(sans)).toMatch(/source « photo » absente|seule vaut true ou false/);
    const attr = brut(); attr.attributs.toitVert = { libelle: 'x', cible: 'batiment', accord: { type: 'egal' }, poids: {} };
    expect(refuse(attr)).toMatch(/attribut « toitVert » inconnu/);
    const cible = brut(); cible.attributs.formeToit!.cible = 'ville';
    expect(refuse(cible)).toMatch(/cible « ville » inconnue/);
    const accord = brut(); accord.attributs.formeToit!.accord = { type: 'presque' };
    expect(refuse(accord)).toMatch(/accord « presque » inconnu/);
    const tolNulle = brut(); tolNulle.attributs.hauteurEgout!.accord = { type: 'nombre', tolerance: 0, unite: 'm' };
    expect(refuse(tolNulle)).toMatch(/tolerance hors de/);
    const poidsSource = brut(); (poidsSource.attributs.formeToit!.poids as Record<string, number>).radar = 1;
    expect(refuse(poidsSource)).toMatch(/poids d’une source « radar » inconnue/);
    const poidsNeg = brut(); (poidsNeg.attributs.formeToit!.poids as Record<string, number>).lidar = -1;
    expect(refuse(poidsNeg)).toMatch(/poids de lidar hors de/);
  });
});
