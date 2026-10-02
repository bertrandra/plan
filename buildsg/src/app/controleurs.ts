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
import type { Champ, ChampChoix, Effet, Section } from '../ui/champs/types.js';
import type { ControleEcran } from './inventaireEcran.js';

export type GenreNoeud = 'racine' | 'branche' | 'zone' | 'emplacement' | 'groupe' | 'commande' | 'famille' | 'section' | 'champ' | 'option' | 'controle' | 'manque';

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
  /**
   * Une entree par sorte d'objet rencontree : ses sections d'inspecteur, et de quoi lister les
   * valeurs permises d'une liste de choix (elles dependent de l'objet). `null` : illisible.
   */
  inspecteur: { cle: string; nom: string; sections: Section[]; optionsDe?: (ch: ChampChoix) => { valeur: string; libelle: string }[] | null }[];
  /** L'inventaire de la page (app/inventaireEcran.ts) : les controles affiches hors registre. */
  ecran?: { horsRegistre: ControleEcran[]; rattaches: number };
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

type Ligne = Record<Classe, Emplacement[]>;

/**
 * Ce que la declaration d'une commande dit d'elle. Rien n'est appele : `actif` et un `quota` en
 * fonction dependent du moment, on dit seulement qu'ils existent.
 */
function detailsCommande(c: Commande, classes?: Classe[], ligne?: Ligne): Record<string, string> {
  const d: Record<string, string> = { groupe: NOMS_GROUPES[c.groupe] ?? c.groupe };
  if (c.raccourci) d.raccourci = c.raccourci;
  if (c.description) d.description = c.description;
  if (c.capacite) d.capacite = c.capacite;
  if (c.permission) d.permission = c.permission;
  if (c.quota) d.quota = typeof c.quota === 'string' ? c.quota : 'selon le contexte';
  // Les trois refus ne se montrent pas pareil (app/commandes.ts) : c'est la carte de l'offre.
  const refus = [
    c.capacite && 'effacée sans la capacité',
    c.permission && 'grisée sans la permission, avec explication',
    c.quota && 'grisée au quota atteint, avec explication'
  ].filter(Boolean);
  if (refus.length) d.refus = refus.join(' ; ');
  if (c.actif) d.conditionnelle = 'oui, selon le contexte (sélection, état du plan…)';
  if (classes) d.classes = classes.map((k) => NOMS_CLASSES[k]).join(', ');
  if (ligne) {
    d.emplacements = CLASSES.map((k) => NOMS_CLASSES[k] + ' ' + ligne[k].filter((e) => e !== 'sansObjet').length).join(', ');
    const rares = CLASSES.filter((k) => ligne[k].filter((e) => e !== 'sansObjet' && e !== 'clavier').length === 0 && !ligne[k].includes('sansObjet'));
    if (rares.length) d.atteinte = 'au clavier seulement sur ' + rares.map((k) => NOMS_CLASSES[k]).join(', ');
  }
  return d;
}

function noeudCommande(c: Commande, classes?: Classe[], ligne?: Ligne): Noeud {
  return { cle: c.id, nom: c.libelle, genre: 'commande', details: detailsCommande(c, classes, ligne) };
}

const NOMS_TYPES: Record<Champ['type'], string> = {
  texte: 'texte', nombre: 'nombre', case: 'case à cocher', choix: 'liste de choix', couleur: 'couleur', date: 'date',
  curseur: 'curseur', lecture: 'lecture seule', texture: 'texture', bouton: 'bouton', alerte: 'alerte',
  optimisation: 'tableau d’optimisation', ligne: 'ligne composée'
};

const NOMS_EFFETS: Record<Effet, string> = {
  rendu: 'redessine le plan', inspecteur: 'rafraîchit l’inspecteur', terrasse: 'recalcule la terrasse (chiffrage, coupe…)',
  scene3d: 'reconstruit la 3D', empilement: 'réordonne l’empilement', poignees: 'refait les poignées'
};

/** Les types qui ecrivent : les autres montrent, ou declenchent. */
const ECRIVENT = new Set<Champ['type']>(['texte', 'nombre', 'case', 'choix', 'couleur', 'date', 'curseur', 'texture']);

/** Ce que la declaration d'un champ dit de lui. Ni `lire`, ni `ecrire`, ni `visible` ne sont appeles. */
function detailsChamp(ch: Champ): Record<string, string> {
  const d: Record<string, string> = { type: NOMS_TYPES[ch.type] };
  if ('unite' in ch && ch.unite) d.unite = ch.unite;
  if ('min' in ch && ch.min !== undefined) d.min = String(ch.min);
  if ('max' in ch && ch.max !== undefined) d.max = String(ch.max);
  if ('pas' in ch && ch.pas !== undefined) d.pas = String(ch.pas);
  if ('decimales' in ch && ch.decimales !== undefined) d.decimales = String(ch.decimales);
  if (ECRIVENT.has(ch.type)) {
    d.modifie = ch.sale === false ? 'l’affichage seulement (le projet reste enregistré)' : 'le projet';
    d.annulable = ch.historique ? 'oui (Annuler le défait)' : 'non';
  }
  if (ch.effets && ch.effets.length) d.effets = ch.effets.map((e) => NOMS_EFFETS[e]).join(', ');
  if (ch.visible) d.conditionnel = 'n’apparaît que dans certains cas';
  if (ch.actif) d.activable = 'grisé selon le contexte';
  if (ch.type === 'bouton' && ch.explication) d.explication = ch.explication;
  if (ch.type === 'texture' && ch.appliquerATous) d.appliquerATous = ch.appliquerATous.libelle;
  if (ch.aide) d.aide = ch.aide;
  return d;
}

type OptionsDe = SourceControleurs['inspecteur'][number]['optionsDe'];

/** Un champ, et sous lui ce qu'il contient : les valeurs d'une liste de choix, les champs d'une ligne. */
function noeudChamp(ch: Champ, optionsDe: OptionsDe): Noeud {
  const n: Noeud = { cle: ch.cle, nom: ch.libelle || ch.cle, genre: 'champ', details: detailsChamp(ch) };
  if (ch.type === 'ligne') n.enfants = sansDoublons(ch.champs.map((c) => noeudChamp(c, optionsDe)));
  if (ch.type === 'choix') {
    const options = optionsDe ? optionsDe(ch) : null;
    if (options && options.length) {
      n.enfants = sansDoublons(options.map((o): Noeud => ({ cle: o.valeur || '(vide)', nom: o.libelle || o.valeur, genre: 'option' })));
      if (n.details) n.details.valeurs = String(options.length);
    }
  }
  return n;
}

/**
 * Le nom explicite d'une sorte d'objet : sa forme et sa fonction, « Cercle — Arbre ». Le libelle de
 * la fonction est celui que l'inspecteur propose dans sa liste « fonction » : pas de seconde liste.
 */
function nommerFamille(n: Noeud): Noeud {
  const fonction = n.cle.split('.')[1];
  for (const [, x] of aplatir(n)) {
    if (x.genre !== 'champ' || x.cle !== 'fonction') continue;
    const o = (x.enfants ?? []).find((e) => e.genre === 'option' && e.cle === fonction);
    if (o) return { ...n, nom: n.nom + ' — ' + o.nom };
  }
  return fonction && fonction !== 'aucune' ? { ...n, nom: n.nom + ' — ' + fonction } : n;
}

function detailsSection(sec: Section): Record<string, string> | undefined {
  const d: Record<string, string> = {};
  if (sec.repliee) d.ouverture = 'repliée';
  if (sec.explication) d.explication = sec.explication;
  return Object.keys(d).length ? d : undefined;
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
        return classes.length ? [noeudCommande(c, classes, ligne)] : [];
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
    enfants: s.commandes.filter((c) => c.groupe === g).sort((a, b) => a.id.localeCompare(b.id)).map((c) => noeudCommande(c, undefined, s.exposition[c.id]))
  }));

  // 3. L'inspecteur : pour chaque sorte d'objet, ses sections et leurs champs.
  const inspecteur: Noeud[] = s.inspecteur.map((f) => nommerFamille({
    cle: f.cle, nom: f.nom, genre: 'famille' as const,
    enfants: sansDoublons(f.sections.map((sec): Noeud => {
      const details = detailsSection(sec);
      return {
        cle: sec.id, nom: sec.titre, genre: 'section', ...(details ? { details } : {}),
        enfants: sansDoublons(sec.champs.map((ch) => noeudChamp(ch, f.optionsDe)))
      };
    }))
  }));

  return {
    cle: 'plan', nom: 'Plan interactif', genre: 'racine',
    enfants: [
      { cle: 'zones', nom: 'Zones de l’écran', genre: 'branche', enfants: zones },
      { cle: 'commandes', nom: 'Registre des commandes', genre: 'branche', enfants: registre },
      { cle: 'inspecteur', nom: 'Champs de l’inspecteur', genre: 'branche', enfants: inspecteur },
      horsRegistre(s, inspecteur)
    ]
  };
}

/**
 * Ce que le registre ne couvre pas, mesure pour etre suivi d'une decouverte a l'autre :
 *   - les controles affiches qui ne declenchent ni une commande ni un champ (app/inventaireEcran.ts) ;
 *   - les fonctions d'objet que la demonstration ne contient pas : leurs champs propres ne sont
 *     jamais demandes a l'inspecteur, donc jamais decouverts.
 */
function horsRegistre(s: SourceControleurs, inspecteur: Noeud[]): Noeud {
  const enfants: Noeud[] = [];
  if (s.ecran) {
    const parZone = new Map<string, ControleEcran[]>();
    for (const c of s.ecran.horsRegistre) parZone.set(c.zone, [...(parZone.get(c.zone) ?? []), c]);
    enfants.push({
      cle: 'ecran', nom: 'Contrôles affichés sans commande ni champ', genre: 'branche',
      details: {
        horsRegistre: String(s.ecran.horsRegistre.length),
        rattaches: String(s.ecran.rattaches),
        portee: 'ce qui est affiché au moment de la découverte : un dialogue, un parcours ou le relevé de façade fermés ne se voient pas'
      },
      enfants: [...parZone].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([zone, cs]): Noeud => ({
        cle: zone.replace(/[\s/]+/g, '-'), nom: zone, genre: 'zone',
        enfants: sansDoublons(cs.map((c): Noeud => ({
          cle: c.cle, nom: c.nom, genre: 'controle',
          // Le nombre d'exemplaires suit les donnees de la demo : il n'entre pas dans la comparaison.
          details: { sorte: c.sorte, ...(c.repete ? { portee: 'répété sur chaque ligne (objet, cote…)' } : {}) }
        })))
      }))
    });
  }
  // Les fonctions proposees par la liste « fonction » de l'inspecteur, moins celles rencontrees.
  const presentes = new Set(inspecteur.map((f) => f.cle.split('.')[1]));
  const proposees = new Map<string, string>();
  for (const f of inspecteur) {
    for (const [, n] of aplatir(f)) {
      if (n.genre === 'champ' && n.cle === 'fonction') for (const o of n.enfants ?? []) if (o.genre === 'option') proposees.set(o.cle, o.nom);
    }
  }
  const absentes = [...proposees].filter(([v]) => !presentes.has(v));
  enfants.push({
    cle: 'sortesAbsentes', nom: 'Fonctions d’objet absentes de la démonstration', genre: 'branche',
    details: { consequence: 'leurs champs propres ne sont jamais demandés à l’inspecteur, donc pas découverts' },
    enfants: absentes.map(([v, nom]): Noeud => ({ cle: v, nom, genre: 'manque' }))
  });
  return { cle: 'horsRegistre', nom: 'Hors registre', genre: 'branche', enfants };
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
  // Un champ compte pour un, valeurs permises comprises ; une ligne composee compte ses sous-champs.
  if (n.genre === 'commande' || (n.genre === 'champ' && !(n.enfants ?? []).some((e) => e.genre === 'champ'))) return 1;
  return (n.enfants ?? []).reduce((t, e) => t + compterFeuilles(e), 0);
}
