import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EXPOSITION, CLASSES, SANS_OBJET_ADMIS, type Emplacement } from '../../../src/app/exposition.js';

// La garantie « on ne perd rien » de la migration mobile (MD/spec-ihm-mobile.md §3.1).
//
// Trois verifications, toutes lues dans le code source plutot qu'en demarrant l'application : le
// registre se construit dans `boot()`, qui a besoin d'un DOM complet et d'un projet ; le code, lui,
// dit exactement quelles commandes existent et qui les nomme.

const racine = resolve(__dirname, '../../..');
const lire = (chemin: string) => readFileSync(resolve(racine, chemin), 'utf8');

function fichiers(dossier: string): string[] {
  const abs = resolve(racine, dossier);
  return readdirSync(abs).flatMap((n) => {
    const p = join(abs, n);
    return statSync(p).isDirectory() ? fichiers(join(dossier, n)) : [join(dossier, n)];
  });
}

/**
 * Les commandes declarees : toutes les formes de declaration du registre, dans `src/app/`.
 * `id: '…'`, et les aides locales des ecouteurs — `commande('…'`, `vue('…'`, et `cam`, `vis`,
 * `surClic` qui prennent l'element avant l'identifiant.
 */
function commandesDeclarees(): string[] {
  const motif = /(?:\bid:\s*|\bcommande\(|\bvue\(|\b(?:cam|vis|surClic)\('[^']+',\s*)'((?:objet|projet|fichier|export|vue|affichage|mesure|terrasse|3d|visionneuse|cloture|plu|facade|relief).[A-Za-z0-9.]+)'/g;
  const ids = new Set<string>();
  for (const f of fichiers('src/app').filter((f) => f.endsWith('.ts'))) {
    const texte = lire(f);
    for (let m = motif.exec(texte); m; m = motif.exec(texte)) ids.add(m[1]!);
  }
  return [...ids].sort();
}

/** Les fichiers dont le code doit nommer la commande pour qu'un emplacement soit vrai. */
const SOURCES: Record<Exclude<Emplacement, 'sansObjet'>, string[]> = {
  palette: ['src/zones/Palette.tsx'],
  rail: ['src/zones/Palette.tsx'],
  feuilleOutils: ['src/zones/Palette.tsx'],
  navigation: ['src/zones/BarreNavigation.tsx'],
  barreHaute: ['src/zones/BarreApplication.tsx'],
  feuilleProjet: ['src/zones/BarreApplication.tsx'],
  menuFichier: ['src/zones/BarreApplication.tsx'],
  menuExporter: ['src/zones/BarreApplication.tsx'],
  menuAffichage: ['src/zones/BarreApplication.tsx'],
  menuAide: ['src/zones/BarreApplication.tsx'],
  surimpression: ['src/zones/Surimpression.tsx'],
  selection: ['src/zones/FeuilleSelection.tsx'],
  inspecteur: ['src/zones/Inspecteur.tsx', ...fichiers('src/ui/champs')],
  explorateur: ['src/zones/Explorateur.tsx'],
  tiroir: ['src/zones/Resultats.tsx', ...fichiers('src/zones/resultats')],
  vue3d: ['src/zones/vue3d/Vue3d.tsx'],
  visionneuse: ['src/zones/vue3d/Visionneuse.tsx'],
  clavier: ['src/app/clavier.ts'],
  premierPas: ['src/app/boot.ts']
};

describe('la carte d exposition des commandes', () => {
  const declarees = commandesDeclarees();

  it('trouve le registre complet (garde-fou du motif de lecture)', () => {
    // Si ce nombre baisse sans qu'une commande ait ete retiree, c'est le motif qui a rate une forme
    // de declaration : le test ci-dessous deviendrait complaisant.
    expect(declarees.length).toBeGreaterThanOrEqual(59);
  });

  it('a une ligne pour chaque commande declaree, et aucune pour une commande inconnue', () => {
    expect(Object.keys(EXPOSITION).sort()).toEqual(declarees);
  });

  it('expose chaque commande dans chacune des trois classes', () => {
    const manques: string[] = [];
    for (const [id, ligne] of Object.entries(EXPOSITION)) {
      for (const classe of CLASSES) if (!ligne[classe].length) manques.push(id + ' en ' + classe);
    }
    expect(manques).toEqual([]);
  });

  it('ne marque sansObjet que les commandes admises', () => {
    const abus: string[] = [];
    for (const [id, ligne] of Object.entries(EXPOSITION)) {
      for (const classe of CLASSES) {
        if (ligne[classe].includes('sansObjet') && !(id in SANS_OBJET_ADMIS)) abus.push(id + ' en ' + classe);
        if (ligne[classe].includes('sansObjet') && ligne[classe].length > 1) abus.push(id + ' melange sansObjet et un emplacement en ' + classe);
      }
    }
    expect(abus).toEqual([]);
  });

  it('ne cite que des emplacements dont le code nomme bien la commande', () => {
    const faux: string[] = [];
    for (const [id, ligne] of Object.entries(EXPOSITION)) {
      for (const classe of CLASSES) {
        for (const e of ligne[classe]) {
          if (e === 'sansObjet') continue;
          const sources = SOURCES[e as keyof typeof SOURCES];
          const trouve = sources.some((f) => existsSync(resolve(racine, f)) && lire(f).includes('\'' + id + '\'') || existsSync(resolve(racine, f)) && lire(f).includes('"' + id + '"'));
          if (!trouve) faux.push(id + ' en ' + classe + ' : ' + e + ' (' + sources.join(', ') + ') ne la nomme pas');
        }
      }
    }
    expect(faux).toEqual([]);
  });
});
