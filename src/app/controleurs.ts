// L'arbre des controleurs de l'ecran de Plan, tel que l'admin le decouvre et l'enregistre
// (MD/spec-demos-admin.md, « Controleurs »).
//
// Un controleur est ce par quoi l'ecran agit sur le plan : une commande du registre, la ou elle
// s'expose, et les champs de l'inspecteur. Rien n'est ecrit a la main ici : l'arbre se construit a
// partir de ce que Plan a reellement monte — le registre des commandes (`app/commandes.ts`), la
// carte d'exposition (`app/exposition.ts`) et les sections de l'inspecteur (`ui/champs/`). Une
// commande ajoutee au code apparait donc a la decouverte suivante sans que personne ne l'ajoute ici.
//
// Ce module ne fait que des donnees : construire l'arbre, le comparer a celui qui est enregistre.
// Aucune commande n'est executee, aucun champ n'est lu ni ecrit.

import type { Commande } from './commandes.js';
import type { Classe, Emplacement } from './exposition.js';
import type { Section } from '../ui/champs/types.js';

export type GenreNoeud = 'racine' | 'branche' | 'zone' | 'emplacement' | 'groupe' | 'commande' | 'famille' | 'section' | 'champ';

export interface Noeud {
  /** La cle du controleur dans son parent : l'identifiant de la commande, la cle du champ… */
  cle: string;
  /** Son nom explicite, tel que l'ecran le montre. */
  nom: string;
  genre: GenreNoeud;
  /** Quelques faits, en clair : raccourci, type, unite, classes d'ecran… */
  details?: Record<string, string>;
  enfants?: Noeud[];
}

/** Le document enregistre sur le serveur. */
export interface RegistreControleurs {
  format: 'plan-controleurs';
  version: 1;
  appVersion: string;
  decouvertLe: string;
  arbre: Noeud;
}

/** Ce que la decouverte lit dans Plan en marche. */
export interface SourceControleurs {
  appVersion: string;
  commandes: Commande[];
  exposition: Record<string, Record<Classe, Emplacement[]>>;
  /** Une entree par sorte d'objet rencontree : ses sections d'inspecteur. */
  inspecteur: { cle: string; nom: string; sections: Section[] }[];
}

/** Les zones de l'ecran (MD/spec-ihm-zones.md §3) et les emplacements qu'elles portent. */
const ZONES: { cle: string; nom: string; emplacements: Emplacement[] }[] = [
  { cle: 'Z1', nom: 'Barre d’application', emplacements: ['barreHaute', 'menuFichier', 'menuExporter', 'menuAffichage', 'menuAide', 'feuilleProjet', 'navigation'] },
  { cle: 'Z2', nom: 'Palette d’outils', emplacements: ['palette', 'rail', 'feuilleOutils'] },
  { cle: 'Z3', nom: 'Explorateur', emplacements: ['explorateur'] },
  { cle: 'Z4', nom: 'Canevas', emplacements: ['surimpression', 'selection', 'vue3d', 'visionneuse'] },
  { cle: 'Z5', nom: 'Inspecteur', emplacements: ['inspecteur'] },
  { cle: 'Z6', nom: 'Résultats', emplacements: ['tiroir'] },
  { cle: 'Z8', nom: 'Dialogues', emplacements: ['premierPas'] },
  { cle: 'clavier', nom: 'Raccourcis clavier', emplacements: ['clavier'] }
];

const NOMS_EMPLACEMENTS: Record<Emplacement, string> = {
  palette: 'Palette (bureau)', rail: 'Rail (tablette)', feuilleOutils: 'Feuille Outils (téléphone)',
  navigation: 'Barre de navigation (téléphone)', barreHaute: 'Barre haute', feuilleProjet: 'Feuille Projet (téléphone)',
  menuFichier: 'Menu Fichier', menuExporter: 'Menu Exporter', menuAffichage: 'Menu Affichage', menuAide: 'Menu Aide',
  surimpression: 'Surimpression du plan', selection: 'Barre de sélection', inspecteur: 'Inspecteur', explorateur: 'Explorateur',
  tiroir: 'Tiroir des résultats', vue3d: 'Vue 3D', visionneuse: 'Visionneuse GLB', clavier: 'Clavier',
  premierPas: 'Premier pas', sansObjet: 'Sans objet'
};

const NOMS_GROUPES: Record<string, string> = {
  projet: 'Projet', fichier: 'Fichier', export: 'Exports', objet: 'Objets', vue: 'Vues', affichage: 'Affichage',
  mesure: 'Mesures', terrasse: 'Terrasse', '3d': 'Vue 3D', visionneuse: 'Visionneuse GLB', cloture: 'Clôture',
  plu: 'PLU', facade: 'Façade'
};

const CLASSES: Classe[] = ['compact', 'moyen', 'large'];
const NOMS_CLASSES: Record<Classe, string> = { compact: 'téléphone', moyen: 'tablette', large: 'bureau' };

function detailsCommande(c: Commande, classes?: Classe[]): Record<string, string> {
  const d: Record<string, string> = { groupe: NOMS_GROUPES[c.groupe] ?? c.groupe };
  if (c.raccourci) d.raccourci = c.raccourci;
  if (c.description) d.description = c.description;
  if (c.capacite) d.capacite = c.capacite;
  if (c.permission) d.permission = c.permission;
  if (classes) d.classes = classes.map((k) => NOMS_CLASSES[k]).join(', ');
  return d;
}

function noeudCommande(c: Commande, classes?: Classe[]): Noeud {
  return { cle: c.id, nom: c.libelle, genre: 'commande', details: detailsCommande(c, classes) };
}

function detailsChamp(ch: Section['champs'][number]): Record<string, string> {
  const d: Record<string, string> = { type: ch.type };
  if ('unite' in ch && ch.unite) d.unite = ch.unite;
  if ('min' in ch && ch.min !== undefined) d.min = String(ch.min);
  if ('max' in ch && ch.max !== undefined) d.max = String(ch.max);
  if (ch.aide) d.aide = ch.aide;
  return d;
}

/** Les cles en double dans un meme parent : la seconde porte son rang, pour rester unique. */
function sansDoublons(enfants: Noeud[]): Noeud[] {
  const vus = new Map<string, number>();
  return enfants.map((n) => {
    const k = vus.get(n.cle) ?? 0;
    vus.set(n.cle, k + 1);
    return k === 0 ? n : { ...n, cle: n.cle + '#' + (k + 1) };
  });
}

/** Construit l'arbre des controleurs a partir de Plan en marche. */
export function construireArbre(s: SourceControleurs): Noeud {
  const parId = new Map(s.commandes.map((c) => [c.id, c]));
  const ids = [...parId.keys()].sort();

  // 1. Les zones : ou chaque commande s'expose, classe par classe.
  const zones: Noeud[] = ZONES.map((z) => ({
    cle: z.cle, nom: z.nom, genre: 'zone' as const,
    enfants: z.emplacements.map((e): Noeud => {
      const commandes = ids.flatMap((id) => {
        const ligne = s.exposition[id];
        const c = parId.get(id);
        if (!ligne || !c) return [];
        const classes = CLASSES.filter((k) => ligne[k].includes(e));
        return classes.length ? [noeudCommande(c, classes)] : [];
      });
      return { cle: e, nom: NOMS_EMPLACEMENTS[e], genre: 'emplacement', enfants: commandes };
    }).filter((n) => n.enfants && n.enfants.length)
  }));
  const nonExposees = ids.filter((id) => !s.exposition[id]);
  if (nonExposees.length) {
    zones.push({ cle: 'nonExposees', nom: 'Commandes sans emplacement', genre: 'zone', enfants: nonExposees.flatMap((id) => { const c = parId.get(id); return c ? [noeudCommande(c)] : []; }) });
  }

  // 2. Le registre, par groupe.
  const groupes = [...new Set(s.commandes.map((c) => c.groupe))].sort();
  const registre: Noeud[] = groupes.map((g) => ({
    cle: g, nom: NOMS_GROUPES[g] ?? g, genre: 'groupe' as const,
    enfants: s.commandes.filter((c) => c.groupe === g).sort((a, b) => a.id.localeCompare(b.id)).map((c) => noeudCommande(c))
  }));

  // 3. L'inspecteur : pour chaque sorte d'objet, ses sections et leurs champs.
  const inspecteur: Noeud[] = s.inspecteur.map((f) => ({
    cle: f.cle, nom: f.nom, genre: 'famille' as const,
    enfants: sansDoublons(f.sections.map((sec): Noeud => ({
      cle: sec.id, nom: sec.titre, genre: 'section',
      enfants: sansDoublons(sec.champs.map((ch): Noeud => ({ cle: ch.cle, nom: ch.libelle || ch.cle, genre: 'champ', details: detailsChamp(ch) })))
    })))
  }));

  return {
    cle: 'plan', nom: 'Plan interactif', genre: 'racine',
    enfants: [
      { cle: 'zones', nom: 'Zones de l’écran', genre: 'branche', enfants: zones },
      { cle: 'commandes', nom: 'Registre des commandes', genre: 'branche', enfants: registre },
      { cle: 'inspecteur', nom: 'Champs de l’inspecteur', genre: 'branche', enfants: inspecteur }
    ]
  };
}

/** Chaque noeud sous son chemin de cles, `plan/zones/Z1/menuFichier/projet.enregistrer`. */
export function aplatir(n: Noeud, parent = ''): Map<string, Noeud> {
  const chemin = parent ? parent + '/' + n.cle : n.cle;
  const m = new Map<string, Noeud>([[chemin, n]]);
  for (const e of n.enfants ?? []) for (const [k, v] of aplatir(e, chemin)) m.set(k, v);
  return m;
}

export type Statut = 'nouveau' | 'retire' | 'modifie' | 'inchange';

export interface Comparaison {
  /** L'arbre a montrer : le decouvert, avec les noeuds retires greffes a leur ancienne place. */
  arbre: Noeud;
  statuts: Map<string, Statut>;
  nouveaux: number;
  retires: number;
  modifies: number;
}

const memes = (a: Noeud, b: Noeud) => a.nom === b.nom && JSON.stringify(a.details ?? {}) === JSON.stringify(b.details ?? {});

/**
 * Compare la decouverte a l'enregistrement. Sans enregistrement, tout est nouveau.
 * Un noeud retire reste visible, a sa place, pour qu'on voie ce qui a disparu avant d'enregistrer.
 */
export function comparer(enregistre: Noeud | null, decouvert: Noeud): Comparaison {
  const avant = enregistre ? aplatir(enregistre) : new Map<string, Noeud>();
  const apres = aplatir(decouvert);
  const statuts = new Map<string, Statut>();
  let nouveaux = 0, retires = 0, modifies = 0;
  for (const [k, n] of apres) {
    const a = avant.get(k);
    const st: Statut = !a ? 'nouveau' : memes(a, n) ? 'inchange' : 'modifie';
    statuts.set(k, st);
    if (st === 'nouveau') nouveaux++;
    if (st === 'modifie') modifies++;
  }

  // Greffe des retires : on recopie l'arbre decouvert, et sous chaque chemin on rajoute les enfants
  // que l'enregistrement avait et que la decouverte n'a plus.
  function greffer(n: Noeud, chemin: string, ancien: Noeud | undefined): Noeud {
    const enfants = (n.enfants ?? []).map((e) => greffer(e, chemin + '/' + e.cle, ancien?.enfants?.find((x) => x.cle === e.cle)));
    for (const e of ancien?.enfants ?? []) {
      const k = chemin + '/' + e.cle;
      if (apres.has(k)) continue;
      for (const [kk] of aplatir(e, chemin)) { statuts.set(kk, 'retire'); retires++; }
      enfants.push(e);
    }
    return n.enfants || enfants.length ? { ...n, enfants } : n;
  }
  const arbre = greffer(decouvert, decouvert.cle, enregistre && enregistre.cle === decouvert.cle ? enregistre : undefined);
  return { arbre, statuts, nouveaux, retires, modifies };
}

/** Le nombre de controleurs feuilles (commandes et champs) d'un arbre. */
export function compterFeuilles(n: Noeud): number {
  return n.enfants && n.enfants.length ? n.enfants.reduce((t, e) => t + compterFeuilles(e), 0) : (n.genre === 'commande' || n.genre === 'champ' ? 1 : 0);
}
