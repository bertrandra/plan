import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPACITES, CODES_CAPACITES } from '../../../src/plateforme/capacites.js';
import { creerRegistre, type Droits } from '../../../src/app/commandes.js';

// Etape 5 de MD/spec-connexion-plateforme.md §16 : ce qu'une capacite empeche vraiment.
//
// Le fait qui porte toute l'etape : **une capacite ne reduit pas le fichier livre**. Le build
// produit un fichier unique et inline tout, y compris ce qui est derriere un `import()` dynamique.
// Ce qu'elle empeche, c'est l'appel au reseau. Ces tests figent les deux moities : que la table
// nomme les bonnes origines, et qu'une commande refusee n'appelle rien du tout.

const doc = { getElementById: () => null } as unknown as Document;
const refusTout: Droits = { branchee: () => true, aCapacite: () => false, aPermission: () => true, reste: () => null };
const toutOuvert: Droits = { branchee: () => true, aCapacite: () => true, aPermission: () => true, reste: () => null };

describe('la table des capacites', () => {
  it('nomme un code par fonction, tous distincts', () => {
    expect(new Set(CODES_CAPACITES).size).toBe(CODES_CAPACITES.length);
    expect(CODES_CAPACITES.every((c) => c.startsWith('plan.'))).toBe(true);
  });

  it('nomme les CDN sous la vue 3D : c est la seule capacite qui evite un script distant', () => {
    expect(CAPACITES.vue3d.origines).toContain('https://cdnjs.cloudflare.com');
    expect(CAPACITES.vue3d.origines).toContain('https://cdn.jsdelivr.net');
  });

  it('n invente pas d origine pour ce qui est local', () => {
    // Le moteur terrasse, le DXF et le dossier PDF ne parlent a personne : le dire evite de vendre
    // une economie de transfert qui n'existe pas.
    expect(CAPACITES.terrasse.origines).toEqual([]);
    expect(CAPACITES.exportDxf.origines).toEqual([]);
    expect(CAPACITES.exportDossier.origines).toEqual([]);
  });

  it('ne nomme que des origines que la politique de contenu autorise', () => {
    // Une capacite qui nommerait une origine absente du modele decrirait un appel qui ne part pas.
    const modele = readFileSync(resolve(__dirname, '../../../deploy/htaccess.template'), 'utf8');
    for (const c of Object.values(CAPACITES)) {
      for (const o of c.origines) expect(modele, c.code + ' -> ' + o).toContain(o);
    }
  });

  it('n est attachee a aucune commande, tant que le catalogue ne porte pas ces codes', () => {
    // Le catalogue releve le 22 septembre 2026 porte exports, max_projects, plan.documents, users
    // et white_label. `/me/context` ne distingue pas « pas achete » de « pas au catalogue » : les
    // attacher maintenant retirerait la 3D a tous les locataires existants. Ce test garde la
    // decision visible — le jour ou l'operateur cree les codes, il tombera, et c'est le signal.
    const sources = ['src/app/projet.ts', 'src/app/ecouteurs/affichage.ts', 'src/app/ecouteurs/divers.ts', 'src/app/ecouteurs/vue3d.ts']
      .map((f) => readFileSync(resolve(__dirname, '../../..', f), 'utf8')).join('\n');
    for (const code of CODES_CAPACITES) expect(sources, code).not.toContain("capacite: '" + code + "'");
  });
});

describe('une commande refusee n appelle rien', () => {
  it('n execute pas, donc ne declenche aucun chargement distant', () => {
    // C'est le mecanisme entier : le chargement de three.js, les appels IGN et le catalogue de
    // textures partent tous depuis l'execution d'une commande. Un refus au registre les arrete
    // tous d'un coup, et il n'y a pas de second endroit a garder.
    const appelReseau = vi.fn();
    const r = creerRegistre(doc, refusTout);
    r.declarer({ id: 'vue.3d', libelle: 'Vue 3D', groupe: '3d', capacite: 'plan.3d', executer: appelReseau });
    expect(r.executer('vue.3d')).toBe(false);
    expect(appelReseau).not.toHaveBeenCalled();
  });

  it('execute normalement quand la capacite est la', () => {
    const appelReseau = vi.fn();
    const r = creerRegistre(doc, toutOuvert);
    r.declarer({ id: 'vue.3d', libelle: 'Vue 3D', groupe: '3d', capacite: 'plan.3d', executer: appelReseau });
    expect(r.executer('vue.3d')).toBe(true);
    expect(appelReseau).toHaveBeenCalledOnce();
  });

  it('efface la commande de l ecran plutot que de la griser', () => {
    const r = creerRegistre(doc, refusTout);
    r.declarer({ id: 'vue.3d', libelle: 'Vue 3D', groupe: '3d', capacite: 'plan.3d', executer: () => undefined });
    expect(r.effacee('vue.3d')).toBe(true);
  });
});

describe('ce que les commandes nommees existent vraiment', () => {
  it('chaque identifiant de la table est declare quelque part dans app/', () => {
    // Une capacite qui gouvernerait une commande inexistante ne gouvernerait rien, et personne ne
    // s'en apercevrait avant de la vendre.
    // Les commandes se declarent de deux facons — `declarer({ id })` et l'aide `surClic(dom, id)` —
    // donc on cherche l'identifiant tel quel plutot qu'une forme d'ecriture.
    const sources = ['projet.ts', 'ecouteurs/affichage.ts', 'ecouteurs/divers.ts', 'ecouteurs/vue3d.ts',
      'ecouteurs/visionneuse.ts', 'ecouteurs/modes.ts', 'ecouteurs/exports.ts', 'ecouteurs/objets.ts']
      .map((f) => readFileSync(resolve(__dirname, '../../../src/app', f), 'utf8')).join('\n');
    const manquantes: string[] = [];
    for (const c of Object.values(CAPACITES)) {
      for (const id of c.commandes) if (!sources.includes("'" + id + "'")) manquantes.push(c.code + ' -> ' + id);
    }
    expect(manquantes, 'commandes nommees mais jamais declarees').toEqual([]);
  });

  it('constate que la vue 3D n est pas une commande, donc qu une capacite ne l arreterait pas', () => {
    // Le basculement en vue 3D est un bouton de la barre de modes. C'est la seule capacite dont le
    // gain reseau serait reel — three.js vient d'un CDN — et c'est justement celle qui n'a aucune
    // prise. Ce test tombera le jour ou quelqu'un en fera une commande : c'est le signal attendu.
    expect(CAPACITES.vue3d.commandes).toEqual([]);
    expect(CAPACITES.vue3d.origines.length).toBeGreaterThan(0);
  });
});
