// La navigation dans l'arbre des controleurs (zones/EcranControleurs.tsx) : ce qui est ouvert, ce qui
// est choisi, ce qui reste visible apres les filtres, et les gestes pour s'y deplacer.
//
// Separee de l'ecran pour qu'il reste un ecran : ici les etats et les calculs, la-bas le balisage.
// Les chemins sont les cles jointes par `/` depuis la racine (`plan/zones/Z1/menuFichier/…`) ; la
// profondeur d'un noeud est son nombre de morceaux, la racine est au niveau 1. `Ligne.niveau` est
// relatif a la branche montree (c'est l'`aria-level` de l'arbre affiche) ; les niveaux montres a la
// personne, eux, sont absolus.

import { useMemo, useState } from 'react';
import type { GenreNoeud, Noeud, Statut } from '../app/controleurs.js';

export interface Ligne { chemin: string; noeud: Noeud; niveau: number; parent: string | null; ouvrable: boolean }

export const profondeur = (chemin: string) => chemin.split('/').length;

/** Les ancetres d'un chemin, de la racine a lui-meme compris. */
export function ancetres(chemin: string): string[] {
  const m = chemin.split('/');
  return m.map((_, i) => m.slice(0, i + 1).join('/'));
}

/** Les filtres de l'ecran, tous facultatifs. */
export interface Filtres { texte: string; genre: GenreNoeud | ''; changementsSeuls: boolean }

/**
 * Les noeuds qui correspondent aux filtres, dans l'ordre de l'arbre, et ceux qui restent visibles :
 * eux et leurs ancetres. `null` quand aucun filtre n'est pose : tout se montre selon ce qui est ouvert.
 */
export function filtrer(tous: Map<string, Noeud>, statuts: Map<string, Statut> | undefined, f: Filtres): { trouves: string[]; garde: Set<string> } | null {
  const texte = f.texte.trim().toLowerCase();
  if (!texte && !f.genre && !f.changementsSeuls) return null;
  const trouves: string[] = [];
  const garde = new Set<string>();
  for (const [chemin, n] of tous) {
    if (texte && !n.cle.toLowerCase().includes(texte) && !n.nom.toLowerCase().includes(texte)) continue;
    if (f.genre && n.genre !== f.genre) continue;
    if (f.changementsSeuls && (statuts?.get(chemin) ?? 'inchange') === 'inchange') continue;
    trouves.push(chemin);
    for (const a of ancetres(chemin)) garde.add(a);
  }
  return { trouves, garde };
}

/** Les chemins des noeuds ouvrables sous `base` (compris), jusqu'a la profondeur `jusqua` exclue. */
export function ouvrablesSous(tous: Map<string, Noeud>, base: string, jusqua = Infinity): string[] {
  return [...tous].filter(([k, n]) => (k === base || k.startsWith(base + '/')) && n.enfants && n.enfants.length && profondeur(k) < jusqua).map(([k]) => k);
}

/** La profondeur la plus grande de l'arbre. */
export function profondeurMax(tous: Map<string, Noeud>): number {
  let m = 1;
  for (const k of tous.keys()) m = Math.max(m, profondeur(k));
  return m;
}

export function useNavigationArbre(racine: Noeud | null, tous: Map<string, Noeud>, statuts: Map<string, Statut> | undefined) {
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(['plan', 'plan/zones', 'plan/commandes', 'plan/inspecteur']));
  const [choisi, setChoisi] = useState('plan');
  const [filtres, setFiltres] = useState<Filtres>({ texte: '', genre: '', changementsSeuls: false });
  /** La branche montree seule, ou la racine. */
  const [vue, setVue] = useState('plan');

  const resultat = useMemo(() => filtrer(tous, statuts, filtres), [tous, statuts, filtres]);
  const garde = resultat?.garde ?? null;
  const base = tous.has(vue) ? vue : 'plan';

  // Les lignes visibles, dans l'ordre : c'est sur elles que les fleches circulent. Le niveau est
  // compte depuis la branche montree.
  const lignes = useMemo(() => {
    const l: Ligne[] = [];
    const depart = tous.get(base) ?? racine;
    if (!depart) return l;
    const parcourir = (n: Noeud, chemin: string, niveau: number, parent: string | null) => {
      if (garde && !garde.has(chemin)) return;
      const enfants = (n.enfants ?? []).filter((e) => !garde || garde.has(chemin + '/' + e.cle));
      l.push({ chemin, noeud: n, niveau, parent, ouvrable: enfants.length > 0 });
      if (enfants.length && (ouverts.has(chemin) || garde)) for (const e of enfants) parcourir(e, chemin + '/' + e.cle, niveau + 1, chemin);
    };
    parcourir(depart, base, 1, null);
    return l;
  }, [tous, racine, base, ouverts, garde]);

  // Les niveaux sont absolus (la racine est au niveau 1), y compris quand une branche est montree
  // seule : le selecteur propose alors les niveaux de cette branche.
  const niveauMin = profondeur(base);
  const niveauMax = useMemo(() => profondeurMax(tous), [tous]);

  return {
    lignes, choisi, setChoisi, ouverts, filtres, garde, vue: base, niveauMin, niveauMax,
    trouves: resultat?.trouves ?? [],
    filtrer: (f: Partial<Filtres>) => setFiltres((x) => ({ ...x, ...f })),
    basculer: (chemin: string, ouvrir?: boolean) => setOuverts((o) => {
      const n = new Set(o);
      if (ouvrir ?? !n.has(chemin)) n.add(chemin); else n.delete(chemin);
      return n;
    }),
    /** Deplie la branche montree jusqu'au niveau absolu `n` : les niveaux jusqu'a `n` se voient. */
    niveau: (n: number) => setOuverts(new Set(ouvrablesSous(tous, base, n))),
    deplierBranche: (chemin: string) => setOuverts((o) => new Set([...o, ...ouvrablesSous(tous, chemin)])),
    replierBranche: (chemin: string) => setOuverts((o) => new Set([...o].filter((k) => k !== chemin && !k.startsWith(chemin + '/')))),
    /** Ouvre les ancetres d'un noeud pour qu'il se voie. */
    reveler: (chemin: string) => setOuverts((o) => new Set([...o, ...ancetres(chemin).slice(0, -1)])),
    montrerSeule: (chemin: string) => { setVue(chemin); setOuverts((o) => new Set([...o, chemin])); },
    toutMontrer: () => setVue('plan')
  };
}

export type NavigationArbre = ReturnType<typeof useNavigationArbre>;
