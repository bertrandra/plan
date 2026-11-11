// L'arbre des objets a marquer (etape 0) : celui que le banc propose la premiere fois, et ce qu'on en tire (l'ordre YOLO,
// le parent permis d'un objet). La personne le change ensuite a l'ecran Classes ; il vit dans data/apprentissage/classes.json.

import type { Attribut, Classe } from './types.js';

const choix = (cle: string, nom: string, valeurs: string[]): Attribut => ({ cle, nom, type: 'choix', valeurs });
const nombre = (cle: string, nom: string): Attribut => ({ cle, nom, type: 'nombre' });
const oui = (cle: string, nom: string): Attribut => ({ cle, nom, type: 'booleen' });

const MATERIAU = choix('materiau', 'Matériau', ['bois', 'PVC', 'aluminium', 'acier', 'inconnu']);
const ETAT = choix('etat', 'État', ['bon', 'usé', 'dégradé']);

/** L'arbre de depart : la facade, ses baies et ce qui les compose, ce qui les ferme, et le haut du mur. */
export const CLASSES_DEFAUT: Classe[] = [
  { id: 'facade', nom: 'Façade', parent: null, forme: 'polygone', couleur: '#8d99ae', apprendre: false, attributs: [choix('parement', 'Parement', ['enduit', 'brique', 'pierre', 'meulière', 'bardage', 'colombage', 'béton'])], description: 'Le contour du mur photographié : sert à ranger le reste, pas à apprendre.' },
  { id: 'fenetre', nom: 'Fenêtre', parent: 'facade', forme: 'rectangle', couleur: '#1e88e5', apprendre: true, attributs: [choix('type', 'Type', ['battante', 'oscillo-battante', 'fixe', 'coulissante', 'à guillotine', 'à soufflet']), choix('forme', 'Forme', ['rectangulaire', 'cintrée', 'ronde', 'en arc']), nombre('vantaux', 'Vantaux'), MATERIAU, oui('pleine', 'Pleine (sans imposte)'), ETAT], description: 'Le hors-tout de la menuiserie.' },
  { id: 'cadre-haut', nom: 'Cadre haut (imposte)', parent: 'fenetre', forme: 'rectangle', couleur: '#64b5f6', apprendre: true, attributs: [choix('type', 'Type', ['fixe', 'ouvrant', 'à soufflet'])] },
  { id: 'cadre-bas', nom: 'Cadre bas', parent: 'fenetre', forme: 'rectangle', couleur: '#0d47a1', apprendre: true, attributs: [nombre('vantaux', 'Vantaux')] },
  { id: 'quadrillage', nom: 'Quadrillage (petits bois)', parent: 'fenetre', forme: 'rectangle', couleur: '#00acc1', apprendre: true, attributs: [nombre('colonnes', 'Colonnes'), nombre('rangees', 'Rangées'), choix('type', 'Type', ['petits bois', 'croisillons collés', 'plomb'])] },
  { id: 'appui', nom: 'Appui', parent: 'fenetre', forme: 'rectangle', couleur: '#a1887f', apprendre: true, attributs: [MATERIAU] },
  { id: 'coffre-volet', nom: 'Coffre de volet roulant', parent: 'fenetre', forme: 'rectangle', couleur: '#78909c', apprendre: true, attributs: [oui('exterieur', 'Extérieur')] },
  { id: 'porte-fenetre', nom: 'Porte-fenêtre', parent: 'facade', forme: 'rectangle', couleur: '#3949ab', apprendre: true, attributs: [choix('type', 'Type', ['battante', 'coulissante', 'à galandage']), nombre('vantaux', 'Vantaux'), MATERIAU, ETAT] },
  { id: 'porte', nom: 'Porte', parent: 'facade', forme: 'rectangle', couleur: '#e53935', apprendre: true, attributs: [choix('type', 'Type', ['pleine', 'vitrée', 'semi-vitrée']), choix('forme', 'Forme', ['rectangulaire', 'cintrée']), MATERIAU, ETAT] },
  { id: 'porte-garage', nom: 'Porte de garage', parent: 'facade', forme: 'rectangle', couleur: '#8e24aa', apprendre: true, attributs: [choix('type', 'Type', ['basculante', 'sectionnelle', 'enroulable', 'battante', 'coulissante']), MATERIAU] },
  { id: 'volet', nom: 'Volet', parent: 'facade', forme: 'rectangle', couleur: '#43a047', apprendre: true, attributs: [choix('type', 'Type', ['battant', 'persienne', 'roulant', 'coulissant', 'pliant']), choix('position', 'Position', ['ouvert', 'fermé', 'mi-clos']), MATERIAU] },
  { id: 'garde-corps', nom: 'Garde-corps', parent: 'facade', forme: 'rectangle', couleur: '#fdd835', apprendre: true, attributs: [choix('type', 'Type', ['barreaux', 'vitré', 'plein', 'balustres', 'ferronnerie'])] },
  { id: 'balcon', nom: 'Balcon', parent: 'facade', forme: 'polygone', couleur: '#fb8c00', apprendre: true, attributs: [] },
  { id: 'lucarne', nom: 'Lucarne', parent: 'facade', forme: 'polygone', couleur: '#d81b60', apprendre: true, attributs: [choix('type', 'Type', ['jacobine', 'capucine', 'meunière', 'rampante', 'chien-assis'])] },
  { id: 'pignon', nom: 'Pignon', parent: 'facade', forme: 'polygone', couleur: '#6d4c41', apprendre: true, attributs: [oui('colombage', 'Colombage')] },
  { id: 'toiture', nom: 'Toiture', parent: null, forme: 'polygone', couleur: '#546e7a', apprendre: true, attributs: [choix('couverture', 'Couverture', ['tuile plate', 'tuile mécanique', 'ardoise', 'zinc', 'bac acier', 'tuile canal'])] },
  { id: 'cheminee', nom: 'Cheminée', parent: 'toiture', forme: 'polygone', couleur: '#bf360c', apprendre: true, attributs: [] },
  { id: 'gouttiere', nom: 'Gouttière', parent: 'facade', forme: 'rectangle', couleur: '#9e9e9e', apprendre: true, attributs: [] },
  { id: 'descente', nom: 'Descente d’eau', parent: 'facade', forme: 'rectangle', couleur: '#bdbdbd', apprendre: true, attributs: [] },
  { id: 'soubassement', nom: 'Soubassement', parent: 'facade', forme: 'polygone', couleur: '#5d4037', apprendre: true, attributs: [MATERIAU] },
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

/** L'indice YOLO de chaque classe apprise : l'ordre de l'arbre (le meme que l'export, api.php::classes_apprises). */
export function indicesYolo(classes: readonly Classe[]): Map<string, number> {
  return new Map(ordreDeLArbre(classes).filter((c) => c.apprendre).map((c, i) => [c.id, i]));
}

/** Ce qui ne va pas dans un arbre : un identifiant invalide ou en double, un parent inconnu, une boucle. */
export function erreursDeLArbre(classes: readonly Classe[]): string[] {
  const e: string[] = [];
  const ids = new Set<string>();
  for (const c of classes) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(c.id)) e.push(`« ${c.id} » : identifiant en minuscules, chiffres et tirets.`);
    if (ids.has(c.id)) e.push(`« ${c.id} » est en double.`);
    ids.add(c.id);
    if (!/^#[0-9a-fA-F]{6}$/.test(c.couleur)) e.push(`« ${c.id} » : couleur #rrggbb attendue.`);
  }
  for (const c of classes) {
    if (c.parent && !ids.has(c.parent)) e.push(`« ${c.id} » : parent inconnu « ${c.parent} ».`);
    if (c.parent && profondeur(classes, c.id) >= 20) e.push(`« ${c.id} » : l’arbre boucle.`);
  }
  return e;
}

/** Un identifiant tire d'un nom : « Porte de garage » -> « porte-de-garage ». */
export function idDuNom(nom: string): string {
  const s = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (/^[a-z]/.test(s) ? s : 'c-' + s).slice(0, 40) || 'classe';
}
