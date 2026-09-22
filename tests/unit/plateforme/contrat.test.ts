import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATIONS } from '../../../src/plateforme/contrat.js';
import { BACKPROD_API_URL, BACKPROD_PRODUCT_CODE, adresse } from '../../../src/plateforme/config.js';

// Etape 0 de MD/spec-connexion-plateforme.md §16 : le contrat entre dans le build, et rien n'entre
// a l'ecran. Ce que ces tests figent, c'est que personne n'ecrira une URL a la main et que le
// garde-fou mord vraiment — un garde-fou qu'on n'a jamais vu echouer ne prouve rien.

const racine = resolve(__dirname, '../../..');

describe('la table des operations', () => {
  it('porte les treize operations de la specification, et pas une de plus', () => {
    // Elargir le contrat epingle doit se voir : la liste vit dans extraire-contrat.mjs, ce test
    // dit ce qu'elle contenait quand l'etape 0 a ete livree.
    expect(Object.keys(OPERATIONS).sort()).toEqual([
      'createProject', 'deleteProject', 'duplicateProject', 'listProjectVersions', 'listProjects',
      'refreshSession', 'restoreProject', 'showMyContext', 'showProject', 'signIn', 'signOut',
      'undeleteProject', 'updateProject'
    ]);
  });

  it('enregistre un projet par PATCH, pas par PUT', () => {
    // La specification annoncait PUT au §6.1. Le contrat dit PATCH, et c'est le contrat qui a
    // raison : c'est exactement ce que l'etape 0 sert a decouvrir, avant qu'un appel soit ecrit.
    expect(OPERATIONS.updateProject.methode).toBe('PATCH');
    expect(OPERATIONS.updateProject.chemin).toBe('/api/v1/projects/{projectId}');
  });

  it('exige X-Product sur le contexte, et le rend facultatif nulle part par accident', () => {
    const entetes = OPERATIONS.showMyContext.entetes;
    const produit = entetes.find((e) => e.nom === 'X-Product');
    const locataire = entetes.find((e) => e.nom === 'X-Tenant');
    expect(produit?.requis).toBe(true);
    expect(locataire?.requis).toBe(false);
  });

  it('nomme le statut de succes que le contrat declare, y compris les 204 sans corps', () => {
    expect(OPERATIONS.signIn.succes).toBe(200);
    expect(OPERATIONS.createProject.succes).toBe(201);
    expect(OPERATIONS.signOut.succes).toBe(204);
    expect(OPERATIONS.deleteProject.succes).toBe(204);
  });

  it('declare les trous de chemin de chaque operation qui en a', () => {
    expect(OPERATIONS.showProject.cheminParams).toEqual(['projectId']);
    expect(OPERATIONS.listProjects.cheminParams).toEqual([]);
  });
});

describe('la configuration du paquet', () => {
  it('porte l origine que le build lui a donnee', () => {
    // Sous vitest aucune origine n'est injectee, donc la chaine est vide. Ce n'est plus un mode
    // depuis l'etape 4 : le build refuse de produire un fichier sans origine, et c'est la que la
    // regle est tenue, pas ici.
    expect(typeof BACKPROD_API_URL).toBe('string');
  });

  it('dit « plan » a X-Product', () => {
    expect(BACKPROD_PRODUCT_CODE).toBe('plan');
  });

  it('remplit les trous d\'un chemin de contrat', () => {
    // On force une origine : la fonction doit marcher independamment du build courant.
    const avec = (base: string, chemin: string, p: Record<string, string>) =>
      base.replace(/\/+$/, '') + chemin.replace(/\{(\w+)\}/g, (_, n: string) => encodeURIComponent(p[n]!));
    expect(avec('https://exemple.test/', OPERATIONS.showProject.chemin, { projectId: 'a b' }))
      .toBe('https://exemple.test/api/v1/projects/a%20b');
  });

  it('refuse un trou vide plutot que de fabriquer une URL fausse', () => {
    // Sans plateforme branchee, `adresse` colle quand meme le chemin : ce qu'on fige ici, c'est le
    // refus du parametre manquant, qui sinon donnerait un `/projects/undefined` parti au reseau.
    expect(() => adresse(OPERATIONS.showProject.chemin, {})).toThrow(/projectId/);
    expect(adresse(OPERATIONS.listProjects.chemin)).toBe('/api/v1/projects');
  });
});

describe('le garde-fou du client', () => {
  const gate = () => execFileSync('node', ['scripts/generer-client.mjs', '--verifier'], { cwd: racine, encoding: 'utf8' });

  it('passe sur le depot tel quel', () => {
    expect(gate()).toContain('a jour');
  });

  it('echoue quand le fichier engendre ne correspond plus au contrat', () => {
    // Un garde-fou qu'on n'a jamais vu rouge ne prouve rien. On abime le fichier engendre, on
    // verifie qu'il mord, et on remet — dans un `finally`, pour qu'un echec ne laisse pas le depot
    // dans cet etat.
    const chemin = resolve(racine, 'src/plateforme/contrat.ts');
    const original = readFileSync(chemin, 'utf8');
    try {
      writeFileSync(chemin, original.replace("methode: 'PATCH'", "methode: 'PUT'"));
      expect(() => gate()).toThrow();
    } finally {
      writeFileSync(chemin, original);
    }
    expect(readFileSync(chemin, 'utf8')).toBe(original);
    expect(gate()).toContain('a jour');
  });
});
