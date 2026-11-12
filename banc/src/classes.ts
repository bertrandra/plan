// L'arbre des objets a marquer (etape 0) : celui que le banc propose la premiere fois, et ce qu'on en tire (l'ordre YOLO,
// le parent permis d'un objet). La personne le change ensuite a l'ecran Classes ; il vit dans data/apprentissage/classes.json.

import type { Attribut, Classe } from './types.js';

const choix = (cle: string, nom: string, valeurs: string[]): Attribut => ({ cle, nom, type: 'choix', valeurs });
const nombre = (cle: string, nom: string): Attribut => ({ cle, nom, type: 'nombre' });
const oui = (cle: string, nom: string): Attribut => ({ cle, nom, type: 'booleen' });

const MATERIAU = choix('materiau', 'Matériau', ['bois', 'PVC', 'aluminium', 'acier', 'inconnu']);
const ETAT = choix('etat', 'État', ['bon', 'usé', 'dégradé']);

const t = (id: string, nom: string) => ({ id, nom });

/**
 * L'arbre de depart (demande du proprietaire, 11 novembre 2026) : des familles (fenetre, porte, volet…) que le modele voit et qualifie par
 * leur type, dans l'ordre de leurs noms YOLO (0 fenetre_1v … 19 loggia) ; sous la fenetre, ce qui la compose, a marquer pour memoire
 * (non appris tant qu'on ne coche pas « apprise »). La facade et le toit servent a ranger, pas a apprendre.
 */
export const CLASSES_DEFAUT: Classe[] = [
  { id: 'facade', nom: 'Façade', parent: null, forme: 'polygone', couleur: '#8d99ae', apprendre: false, attributs: [choix('parement', 'Parement', ['enduit', 'brique', 'pierre', 'meulière', 'bardage', 'colombage', 'béton'])], description: 'Le contour du mur photographié : sert à ranger le reste, pas à apprendre.' },
  { id: 'fenetre', nom: 'Fenêtre', parent: 'facade', forme: 'rectangle', couleur: '#1e88e5', apprendre: true, description: 'Le hors-tout de la menuiserie, qualifié par son type.',
    types: [t('fenetre_1v', 'Fenêtre 1 vantail'), t('fenetre_2v', 'Fenêtre 2 vantaux'), t('fenetre_petits_carreaux', 'Fenêtre à petits carreaux'), t('fenetre_imposte_carreaux', 'Fenêtre, imposte à carreaux'), t('fenetre_imposte_simple', 'Fenêtre, imposte simple'), t('porte_fenetre', 'Porte-fenêtre'), t('baie_vitree', 'Baie vitrée'), t('fenetre_cintree', 'Fenêtre cintrée'), t('oeil_de_boeuf', 'Œil-de-bœuf')],
    attributs: [MATERIAU, ETAT] },
  { id: 'cadre-haut', nom: 'Cadre haut (imposte)', parent: 'fenetre', forme: 'rectangle', couleur: '#64b5f6', apprendre: false, attributs: [choix('type', 'Type', ['fixe', 'ouvrant', 'à soufflet'])] },
  { id: 'cadre-bas', nom: 'Cadre bas', parent: 'fenetre', forme: 'rectangle', couleur: '#0d47a1', apprendre: false, attributs: [nombre('vantaux', 'Vantaux')] },
  { id: 'quadrillage', nom: 'Quadrillage (petits bois)', parent: 'fenetre', forme: 'rectangle', couleur: '#00acc1', apprendre: false, attributs: [nombre('colonnes', 'Colonnes'), nombre('rangees', 'Rangées')] },
  { id: 'appui', nom: 'Appui', parent: 'fenetre', forme: 'rectangle', couleur: '#a1887f', apprendre: false, attributs: [MATERIAU] },
  { id: 'coffre-volet', nom: 'Coffre de volet roulant', parent: 'fenetre', forme: 'rectangle', couleur: '#78909c', apprendre: false, attributs: [oui('exterieur', 'Extérieur')] },
  { id: 'lucarne', nom: 'Lucarne', parent: 'facade', forme: 'polygone', couleur: '#d81b60', apprendre: true, attributs: [choix('forme', 'Forme', ['jacobine', 'capucine', 'meunière', 'rampante', 'chien-assis'])] },
  { id: 'porte', nom: 'Porte', parent: 'facade', forme: 'rectangle', couleur: '#e53935', apprendre: true, description: 'Le hors-tout de la porte, qualifié par son type.',
    types: [t('porte_pleine', 'Porte pleine'), t('porte_vitree', 'Porte vitrée'), t('porte_double', 'Porte double'), t('porte_garage', 'Porte de garage')], attributs: [MATERIAU, ETAT] },
  { id: 'volet', nom: 'Volet', parent: 'facade', forme: 'rectangle', couleur: '#43a047', apprendre: true,
    types: [t('volet_battant', 'Volet battant'), t('volet_roulant', 'Volet roulant'), t('volet_pliant', 'Volet pliant')], attributs: [choix('position', 'Position', ['ouvert', 'fermé', 'mi-clos']), MATERIAU] },
  { id: 'balcon', nom: 'Balcon', parent: 'facade', forme: 'polygone', couleur: '#fb8c00', apprendre: true, attributs: [] },
  { id: 'garde_corps', nom: 'Garde-corps', parent: 'facade', forme: 'rectangle', couleur: '#fdd835', apprendre: true, attributs: [choix('type', 'Type', ['barreaux', 'vitré', 'plein', 'balustres', 'ferronnerie'])] },
  { id: 'loggia', nom: 'Loggia', parent: 'facade', forme: 'polygone', couleur: '#8e24aa', apprendre: true, attributs: [] },
  { id: 'pignon', nom: 'Pignon', parent: 'facade', forme: 'polygone', couleur: '#6d4c41', apprendre: false, attributs: [oui('colombage', 'Colombage')] },
  { id: 'soubassement', nom: 'Soubassement', parent: 'facade', forme: 'polygone', couleur: '#5d4037', apprendre: false, attributs: [MATERIAU] },
  { id: 'gouttiere', nom: 'Gouttière', parent: 'facade', forme: 'rectangle', couleur: '#9e9e9e', apprendre: false, attributs: [] },
  { id: 'descente', nom: 'Descente d’eau', parent: 'facade', forme: 'rectangle', couleur: '#bdbdbd', apprendre: false, attributs: [] },
  { id: 'toiture', nom: 'Toiture', parent: null, forme: 'polygone', couleur: '#546e7a', apprendre: false, attributs: [choix('couverture', 'Couverture', ['tuile plate', 'tuile mécanique', 'ardoise', 'zinc', 'bac acier', 'tuile canal'])] },
  { id: 'cheminee', nom: 'Cheminée', parent: 'toiture', forme: 'polygone', couleur: '#bf360c', apprendre: false, attributs: [] },
];

/** Les classes dans l'ordre de l'arbre : chaque parent avant ses enfants, les orphelins a la fin. */
export function ordreDeLArbre(classes: readonly Classe[]): Classe[] {
  const ids = new Set(classes.map((c) => c.id));
  const enfants = new Map<string, Classe[]>();
  for (const c of classes) {
    const p = c.parent && ids.has(c.parent) ? c.parent : '';
    enfants.set(p, [...(enfants.get(p) ?? []), c]);
  }
  const ordre: Classe[] = [];
  const vus = new Set<string>();
  const visiter = (p: string) => {
    for (const c of enfants.get(p) ?? []) {
      if (vus.has(c.id)) continue;
      vus.add(c.id);
      ordre.push(c);
      visiter(c.id);
    }
  };
  visiter('');
  return [...ordre, ...classes.filter((c) => !vus.has(c.id))];
}

/** La profondeur d'une classe dans l'arbre (0 a la racine). */
export function profondeur(classes: readonly Classe[], id: string): number {
  const par = new Map(classes.map((c) => [c.id, c.parent]));
  let n = 0;
  for (let p = par.get(id) ?? null; p && n < 20; p = par.get(p) ?? null) n++;
  return n;
}

/** Les noms appris d'une classe : ses types, sinon elle-meme ; rien pour une classe non apprise. */
export const nomsDeLaClasse = (c: Classe): string[] => (!c.apprendre ? [] : c.types?.length ? c.types.map((x) => x.id) : [c.id]);

/** Les noms YOLO, dans l'ordre de l'arbre (le meme que l'export, api.php::noms_yolo) : l'indice de chacun est son rang. */
export function nomsYolo(classes: readonly Classe[]): string[] {
  return [...new Set(ordreDeLArbre(classes).flatMap(nomsDeLaClasse))];
}

/** L'indice YOLO de chaque nom appris. */
export function indicesYolo(classes: readonly Classe[]): Map<string, number> {
  return new Map(nomsYolo(classes).map((n, i) => [n, i]));
}

/** Le nom YOLO d'un objet : son type pour une classe a types (null s'il n'est pas qualifie), sa classe sinon ; null hors du jeu. */
export function nomYoloDe(o: { classe: string; type?: string }, classes: readonly Classe[]): string | null {
  const c = classes.find((x) => x.id === o.classe);
  if (!c?.apprendre) return null;
  if (!c.types?.length) return c.id;
  return c.types.some((t) => t.id === o.type) ? (o.type ?? null) : null;
}

/** La classe et le type qu'un nom YOLO designe (un nom de type, ou d'une classe) ; null s'il n'est pas dans l'arbre. */
export function cibleDuNom(nom: string, classes: readonly Classe[]): { classe: string; type?: string } | null {
  for (const c of classes) {
    if (c.types?.some((t) => t.id === nom)) return { classe: c.id, type: nom };
    if (c.id === nom) return { classe: c.id };
  }
  return null;
}

/** Ce qui ne va pas dans un arbre : un identifiant invalide ou en double, un parent inconnu, une boucle. */
export function erreursDeLArbre(classes: readonly Classe[]): string[] {
  const e: string[] = [];
  const ids = new Set<string>();
  for (const c of classes) {
    for (const id of [c.id, ...(c.types ?? []).map((t) => t.id)]) {
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id)) e.push(`« ${id} » : identifiant en minuscules, chiffres, _ et -.`);
      if (ids.has(id)) e.push(`« ${id} » est en double.`);
      ids.add(id);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(c.couleur)) e.push(`« ${c.id} » : couleur #rrggbb attendue.`);
  }
  const classesIds = new Set(classes.map((c) => c.id));
  for (const c of classes) {
    if (c.parent && !classesIds.has(c.parent)) e.push(`« ${c.id} » : parent inconnu « ${c.parent} ».`);
    if (c.parent && profondeur(classes, c.id) >= 20) e.push(`« ${c.id} » : l’arbre boucle.`);
  }
  return e;
}

/** Un identifiant tire d'un nom : « Porte de garage » -> « porte-de-garage » (« porte_de_garage » avec sep = '_', pour un nom YOLO). */
export function idDuNom(nom: string, sep: '-' | '_' = '-'): string {
  const s = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(/^[-_]+|[-_]+$/g, '');
  return (/^[a-z]/.test(s) ? s : 'c' + sep + s).slice(0, 40) || 'classe';
}

/**
 * Ce qu'on peut poser a l'editeur : d'abord ce que le modele apprend (chaque type d'une classe a types, deja qualifie ; les classes
 * apprises sans types), puis le reste (une classe a types seule, a qualifier ; les classes non apprises). Les chiffres 1 a 9 de
 * l'editeur prennent les premiers.
 */
export function choixDeCreation(classes: readonly Classe[]): { valeur: string; nom: string; couleur: string }[] {
  const ordre = ordreDeLArbre(classes);
  const appris = ordre.flatMap((c) => (!c.apprendre ? [] : c.types?.length ? c.types.map((t) => ({ valeur: c.id + ':' + t.id, nom: t.nom, couleur: c.couleur })) : [{ valeur: c.id, nom: c.nom, couleur: c.couleur }]));
  const reste = ordre.filter((c) => !c.apprendre || c.types?.length).map((c) => ({ valeur: c.id, nom: c.types?.length && c.apprendre ? c.nom + ' (à qualifier)' : c.nom, couleur: c.couleur }));
  return [...appris, ...reste];
}

/** Le libelle d'un objet : le nom de son type, sinon celui de sa classe. */
export function libelleDe(o: { classe: string; type?: string }, classes: readonly Classe[]): string {
  const c = classes.find((x) => x.id === o.classe);
  return c?.types?.find((t) => t.id === o.type)?.nom ?? c?.nom ?? o.classe;
}
