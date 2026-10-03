// L'inventaire des controles affiches que le registre ne connait pas (MD/spec-demos-admin.md,
// « Hors registre »).
//
// Le registre des controleurs (app/controleurs.ts) ne voit que deux choses : les commandes et les
// champs de l'inspecteur. Tout bouton, case, curseur ou saisie qui agit sans passer par l'un ou
// l'autre lui echappe. Cet inventaire les trouve dans la page, en lecture seule : il parcourt les
// controles montes et garde ceux qui ne sont rattaches a rien.
//
// Les lignes repetees (un objet de l'explorateur, une cote du tableau) portent `data-instance` : leurs
// controles sont des exemplaires d'un meme controle, comptes une fois avec leur nombre. `data-nom`
// donne un nom stable a un bouton dont le texte suit l'etat (« Extremite A / B »), `data-compte`
// marque un compteur a ne pas prendre pour un nom (« Tout 35 »).
//
// Un controle est rattache quand lui ou un de ses parents porte :
//   - `data-commande` : il declenche une commande du registre ;
//   - `data-controle` : c'est un controle d'interface declare (app/controlesInterface.ts) ;
//   - `data-cle` ou `data-section` : c'est un champ (ou une section) de l'inspecteur.
//
// Limite assumee, et dite dans l'arbre : seul ce qui est monte au moment de la decouverte se voit.
// Un dialogue ferme, un parcours non ouvert, l'ecran de releve n'existent pas encore dans la page.
// La disposition, elle, n'est plus une limite : la decouverte releve la page dans chaque classe
// d'ecran (app/decouverteClasses.ts) et `fusionnerInventaires` reunit les releves.

import { CONTROLES as CATALOGUE } from './controlesInterface.js';
import { EXPOSITION, type Emplacement } from './exposition.js';

/** Un controle de l'ecran, hors registre. */
export interface ControleEcran {
  /** La zone de l'ecran (Z1…Z9, ou une zone nommee). */
  zone: string;
  /** Son identifiant DOM, ou une cle tiree de son nom. */
  cle: string;
  /** Son nom explicite : etiquette accessible, infobulle, texte. */
  nom: string;
  /** bouton, case, curseur, saisie, liste, date, couleur, fichier… */
  sorte: string;
  /** Un controle repete d'une ligne a l'autre (une par objet, par cote…) : combien de fois. */
  repete?: number;
  /** Les classes d'ecran ou il s'affiche, quand la decouverte en a parcouru plusieurs. */
  classes?: string[];
}

/** Un controle rattache, affiche ailleurs que la ou il est declare. */
export interface EcartZone {
  /** `commande:<id>` ou `controle:<cle>`. */
  cle: string;
  /** La zone ou il s'affiche. */
  affiche: string;
  /** Ce que sa declaration prevoit. */
  attendu: string;
}

/** Un releve de la page dans une classe d'ecran. */
export interface Releve { classe: string; horsRegistre: ControleEcran[]; rattaches: number; ecarts?: EcartZone[] }

/** Les conteneurs d'index.html et la zone qu'ils portent (MD/spec-ihm-zones.md §3). */
export const ZONES_DOM: Record<string, string> = {
  zoneBarre: 'Z1 Barre d’application', zonePalette: 'Z2 Palette', zoneExplorateur: 'Z3 Explorateur',
  zoneSurimpression: 'Z4 Canevas', stage: 'Z4 Canevas', zoneVues3d: 'Z4 Vues 3D', zoneSelection: 'Z4 Barre de sélection',
  zoneInspecteur: 'Z5 Inspecteur', zoneResultats: 'Z6 Résultats', zoneEtat: 'Z7 Barre d’état',
  zoneDialogues: 'Z8 Dialogues', zoneNotifications: 'Z9 Notifications', zoneFeuilles: 'Feuilles (téléphone)',
  zoneNavigation: 'Navigation (téléphone)', zoneReleve: 'Relevé de façade'
};

/**
 * Les conteneurs ou s'affiche chaque emplacement de la carte d'exposition (app/exposition.ts). Le
 * clavier n'a pas de conteneur ; `sansObjet` n'en demande pas.
 */
export const CONTENEURS_EMPLACEMENTS: Record<Exclude<Emplacement, 'clavier' | 'sansObjet'>, string[]> = {
  barreHaute: ['zoneBarre'], menuFichier: ['zoneBarre'], menuExporter: ['zoneBarre'], menuAffichage: ['zoneBarre'], menuAide: ['zoneBarre'],
  feuilleProjet: ['zoneBarre'], navigation: ['zoneNavigation'], palette: ['zonePalette'], rail: ['zonePalette'], feuilleOutils: ['zonePalette'],
  explorateur: ['zoneExplorateur'], surimpression: ['zoneSurimpression', 'stage'], selection: ['zoneSelection'],
  vue3d: ['zoneVues3d'], visionneuse: ['zoneVues3d'], inspecteur: ['zoneInspecteur'], tiroir: ['zoneResultats'], premierPas: ['zoneDialogues']
};

/** Le conteneur de zone (index.html) qui porte l'element, ou `null` hors de toute zone. */
function conteneurDe(el: Element): string | null {
  for (let n: Element | null = el; n; n = n.parentElement) if (n.id && ZONES_DOM[n.id]) return n.id;
  return null;
}

/**
 * Les controles rattaches qui s'affichent hors de la zone que leur declaration prevoit : une commande
 * dans une zone qu'aucune classe d'ecran ne lui donne (app/exposition.ts), un controle d'interface
 * ailleurs que dans sa zone (app/controlesInterface.ts). Un element hors de toute zone — les champs
 * fichier caches d'index.html, que les menus declenchent — n'est pas compte.
 */
export function ecartsDeZone(doc: Document): EcartZone[] {
  const ecarts = new Map<string, EcartZone>();
  for (const el of Array.from(doc.querySelectorAll('[data-commande], [data-controle]'))) {
    if (el.closest(EXCLUS)) continue;
    const id = conteneurDe(el);
    if (!id) continue;
    const commande = el.getAttribute('data-commande');
    if (commande) {
      const ligne = EXPOSITION[commande];
      const permis = new Set(ligne ? Object.values(ligne).flat().flatMap((e) => (CONTENEURS_EMPLACEMENTS as Record<string, string[]>)[e] ?? []) : []);
      if (!permis.has(id)) {
        const attendu = ligne ? [...permis].map((p) => ZONES_DOM[p]).join(', ') || 'clavier seulement' : 'absente de la carte d’exposition';
        ecarts.set('commande:' + commande + '@' + id, { cle: 'commande:' + commande, affiche: ZONES_DOM[id] ?? id, attendu });
      }
    }
    const controle = el.getAttribute('data-controle');
    const c = controle ? CATALOGUE[controle] : undefined;
    if (controle && c && !c.dansChaqueZone && ZONES_DOM[id] !== c.zone) {
      ecarts.set('controle:' + controle + '@' + id, { cle: 'controle:' + controle, affiche: ZONES_DOM[id] ?? id, attendu: c.zone });
    }
  }
  return [...ecarts.values()];
}

/** Ce qui n'est pas Plan : l'ecran des controleurs lui-meme et la porte. */
const EXCLUS = '#zoneControleurs, #zoneEcranPalette, #zonePorte';
const CONTROLES = 'button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="slider"]';
const RATTACHE = '[data-commande], [data-controle], [data-cle], [data-section]';

function sorteDe(el: Element): string {
  const role = el.getAttribute('role');
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return t === 'checkbox' ? 'case' : t === 'radio' ? 'choix' : t === 'range' ? 'curseur' : t === 'file' ? 'fichier'
      : t === 'date' ? 'date' : t === 'color' ? 'couleur' : t === 'number' ? 'nombre' : 'saisie';
  }
  if (el instanceof HTMLSelectElement) return 'liste';
  if (el instanceof HTMLTextAreaElement) return 'saisie';
  if (role === 'tab') return 'onglet';
  if (role === 'menuitem') return 'entrée de menu';
  return 'bouton';
}

/** Le nom qu'un lecteur d'ecran donnerait au controle, a peu pres. */
function nomDe(el: Element): string {
  const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const impose = net(el.getAttribute('data-nom'));
  if (impose) return impose;
  const aria = net(el.getAttribute('aria-label'));
  if (aria) return aria;
  const id = el.id;
  if (id) {
    const lbl = Array.from(el.ownerDocument.querySelectorAll('label[for]')).find((l) => l.getAttribute('for') === id);
    if (lbl && net(lbl.textContent)) return net(lbl.textContent);
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Le texte de l'etiquette, sans celui du controle qu'elle entoure (les options d'une liste).
    const copie = parentLabel.cloneNode(true) as Element;
    copie.querySelectorAll('select, option, textarea').forEach((c) => c.remove());
    if (net(copie.textContent)) return net(copie.textContent);
  }
  const texte = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement ? '' : net(sansCompteurs(el));
  // Un texte sans lettre ni chiffre (« × », « › ») ne nomme rien : l'infobulle dit mieux.
  const parlant = /[\p{L}\p{N}]/u.test(texte) ? texte : '';
  return parlant || net(el.getAttribute('title')) || net(el.getAttribute('placeholder')) || texte || '(sans nom)';
}

/** Le texte d'un element, sans ses compteurs (`data-compte`). */
function sansCompteurs(el: Element): string {
  if (!el.querySelector('[data-compte]')) return el.textContent ?? '';
  const copie = el.cloneNode(true) as Element;
  copie.querySelectorAll('[data-compte]').forEach((c) => c.remove());
  return copie.textContent ?? '';
}

function zoneDe(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const z = n.id && ZONES_DOM[n.id];
    if (z) return z;
  }
  return 'Hors zone';
}

/** Une cle stable pour un controle sans identifiant : sa sorte et son nom, sans accents ni espaces. */
function cleDe(id: string, nom: string, sorte: string): string {
  if (id) return id;
  const slug = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return sorte.replace(/\s+/g, '-') + ':' + (slug || 'sans-nom');
}

/** Les controles montes dans la page qui ne sont rattaches ni a une commande ni a un champ. */
export function inventorierEcran(doc: Document): { horsRegistre: ControleEcran[]; rattaches: number } {
  const horsRegistre: ControleEcran[] = [];
  /** Les exemplaires deja vus d'un controle repete, par zone et cle. */
  const exemplaires = new Map<string, ControleEcran>();
  let rattaches = 0;
  for (const el of Array.from(doc.querySelectorAll(CONTROLES))) {
    if (el.closest(EXCLUS)) continue;
    // Un element de role bouton qui contient un vrai bouton : c'est le bouton qui compte.
    if (!(el instanceof HTMLButtonElement) && el.querySelector('button')) continue;
    if (el.closest(RATTACHE)) { rattaches++; continue; }
    const sorte = sorteDe(el);
    const instance = el.closest('[data-instance]');
    const zone = zoneDe(el);
    if (instance) {
      // Le nom de l'exemplaire (« Masquer Parcelle AE 101 ») devient celui du controle (« Masquer … »).
      const quoi = (instance.getAttribute('data-instance') ?? '').trim();
      const brut = nomDe(el);
      const nom = quoi && brut.includes(quoi) ? brut.split(quoi).join('…') : brut;
      const c = { zone, cle: cleDe('', nom, sorte), nom, sorte };
      const k = zone + '\u0000' + c.cle;
      const deja = exemplaires.get(k);
      if (deja) { deja.repete = (deja.repete ?? 1) + 1; continue; }
      const nouveau: ControleEcran = { ...c, repete: 1 };
      exemplaires.set(k, nouveau);
      horsRegistre.push(nouveau);
      continue;
    }
    const nom = nomDe(el);
    horsRegistre.push({ zone, cle: cleDe(el.id, nom, sorte), nom, sorte });
  }
  return { horsRegistre, rattaches };
}

/**
 * Reunit les releves de plusieurs dispositions : un controle vu dans plusieurs classes n'est compte
 * qu'une fois, avec les classes ou il s'affiche. Les rattaches ne s'additionnent pas (le meme
 * controle se retrouve d'une classe a l'autre) : on garde le releve le plus fourni.
 */
export function fusionnerInventaires(releves: Releve[]): { horsRegistre: ControleEcran[]; rattaches: number; classes: string[]; ecarts: EcartZone[] } {
  const parCle = new Map<string, ControleEcran>();
  const ecarts = new Map<string, EcartZone>();
  const classes: string[] = [];
  let rattaches = 0;
  for (const r of releves) {
    if (!classes.includes(r.classe)) classes.push(r.classe);
    rattaches = Math.max(rattaches, r.rattaches);
    for (const e of r.ecarts ?? []) ecarts.set(e.cle + '@' + e.affiche, e);
    for (const c of r.horsRegistre) {
      const k = c.zone + '\u0000' + c.cle;
      const deja = parCle.get(k);
      if (!deja) { parCle.set(k, { ...c, classes: [r.classe] }); continue; }
      if (!deja.classes?.includes(r.classe)) deja.classes = [...(deja.classes ?? []), r.classe];
      if (c.repete) deja.repete = Math.max(deja.repete ?? 1, c.repete);
    }
  }
  return { horsRegistre: [...parCle.values()], rattaches, classes, ecarts: [...ecarts.values()] };
}
