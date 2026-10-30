// Ce qu'une ligne de proposition vise, a surligner dans la Vue 3D avant / apres (demande de l'utilisateur, 18 octobre 2026 :
// « a la selection de la ligne, la forme est surlignee dans la 3D ») : le mur d'une facade, le corps de toit qu'une ligne
// relit seul, ou le contour du batiment (de la parcelle). Les formes se lisent sur le plan d'avant : elles sont les memes dans
// les deux vues. Pur.

import { facadesDuContour, type Facade } from '../../../geometry/cotesVusDeDehors.js';
import { silhouetteDuMur } from '../../../facade/regles/toits/silhouetteDesCorps.js';
import { hauteurDe, type Proposition } from '../../../regles/decisions.js';
import { hauteurMurSousToit } from './liste.js';
import { typeObservation } from './observationsClaude.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';

/** Une forme a surligner : une ligne de points du plan, tracee a deux hauteurs (au-dessus du sol) et reliee par des verticales. */
export interface FormeSurlignee {
  pts: PtBrut[]; bas: number; haut: number; ferme: boolean; epais?: boolean;
  /** Une facade nommee : sa silhouette reelle dans le plan du mur (x le long depuis la gauche, y en hauteur) et ses ouvertures, au lieu d'un rectangle. */
  profil?: { x: number; y: number }[];
  ouvertures?: { x: number; y: number; l: number; h: number }[];
}

/** Les formes d'une ligne, et d'ou la regarder : devant un mur (sa normale sortante), sinon d'ou l'on est. */
export interface Surbrillance { formes: FormeSurlignee[]; centre: PtBrut; hautM: number; normale: PtBrut | null }

const centreDe = (pts: readonly PtBrut[]): PtBrut => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const sommets = (o: ObjetPlan | undefined): PtBrut[] | null => (o && 'pts' in o && Array.isArray(o.pts) && o.pts.length >= 3 ? (o.pts as PtBrut[]) : null);

/** Un cadre cible : la zone seule, centree, a regarder de face quand c'est un mur. */
const zone = (formes: FormeSurlignee[], centre: PtBrut, hautM: number, normale: PtBrut | null = null): Surbrillance => ({ formes, centre, hautM, normale });

/**
 * Une facade nommee : sa silhouette telle que les corps du toit la dessinent au-dessus du mur (pignon en triangle, trapeze, marches...),
 * pas un rectangle, et les ouvertures du releve dans son plan. Sans corps de toit lu, le mur jusqu'a l'egout. Contour en gras.
 */
function murNomme(o: ObjetPlan, f: Facade): Surbrillance {
  const sousToit = hauteurMurSousToit(o, f);
  const profil = o.batiment?.corpsToit?.length ? silhouetteDuMur(f, o.batiment?.corpsToit, Number.POSITIVE_INFINITY, sousToit)
    : [{ x: 0, y: 0 }, { x: f.largeur, y: 0 }, { x: f.largeur, y: sousToit }, { x: 0, y: sousToit }];
  const haut = Math.max(sousToit, ...profil.map((q) => q.y));
  const releve = (o.batiment?.facades ?? []).find((r) => r.cote === f.cote);
  const ouvertures = (releve?.ouvertures ?? []).map(({ x, y, l, h }) => ({ x, y, l, h }));
  return zone([{ pts: [f.gauche, f.droite], bas: 0, haut, ferme: false, epais: true, profil, ouvertures }], centreDe([f.gauche, f.droite]), haut, f.normale);
}

/** La surbrillance d'une ligne de proposition : la zone que son effet change, pas le batiment entier ; null quand elle n'est plus dans le plan. */
export function surbrillanceDe(p: Proposition, objets: readonly ObjetPlan[]): Surbrillance | null {
  // Un objet neuf du jardin (lot L3) : son emprise, a sa hauteur (un cercle en polygone), qu'il soit deja pose ou non.
  if (p.effet.type === 'ajoutObjet') {
    const o = p.effet.objet;
    const pts = o.type === 'circle' ? Array.from({ length: 16 }, (_, i) => ({ x: o.center.x + o.r * Math.cos((i * Math.PI) / 8), y: o.center.y + o.r * Math.sin((i * Math.PI) / 8) })) : o.pts;
    const haut = Math.max(0.3, typeof o.elevation === 'number' ? o.elevation : 0.3);
    return pts.length ? zone([{ pts, bas: 0, haut, ferme: o.type !== 'path' }], centreDe(pts), haut) : null;
  }
  if (p.cible.type === 'parcelle') {
    const pts = sommets(objets.find((o) => o.key === 'parcelle'));
    if (!pts) return null;
    // Une cloture ou un portail : le cote seul, a hauteur de cloture.
    if (p.effet.type === 'cloture' || p.effet.type === 'portail') {
      const a = pts[p.effet.cote], b = pts[(p.effet.cote + 1) % pts.length];
      if (a && b) {
        const haut = p.effet.type === 'cloture' && p.effet.hauteurM ? p.effet.hauteurM : 2;
        return zone([{ pts: [a, b], bas: 0, haut, ferme: false }], centreDe([a, b]), haut, null);
      }
    }
    return zone([{ pts, bas: 0, haut: 0.3, ferme: true }], centreDe(pts), 0.3);
  }
  const { cle } = p.cible;
  const o = objets.find((x) => x.key === cle);
  const pts = sommets(o);
  if (!o || !pts) return null;
  const mur = hauteurDe(o);
  const faite = Math.max(mur, ...(o.batiment?.corpsToit ?? []).map((c) => c.faitage));
  if (p.cible.type === 'facade') {
    const cote = p.cible.cote;
    const f = facadesDuContour(pts, mur).find((x) => x.cote === cote);
    if (!f) return null;
    return murNomme(o, f);
  }
  const corps = (i: number) => o.batiment?.corpsToit?.[i];
  const pan = (c: { pts: PtBrut[]; faitage: number }): Surbrillance => zone([{ pts: c.pts, bas: mur, haut: c.faitage, ferme: true }], centreDe(c.pts), (mur + c.faitage) / 2 + 0.01);
  switch (p.effet.type) {
    case 'corpsDuToit': case 'lucarnes': case 'terrasse': {
      const c = corps(p.effet.corps);
      return c ? pan(c) : null;
    }
    case 'appentis': {
      const cs = p.effet.corps.map(corps).filter((c): c is NonNullable<typeof c> => !!c);
      if (!cs.length) break;
      return zone(cs.map((c) => ({ pts: c.pts, bas: mur, haut: c.faitage, ferme: true })), centreDe(cs.flatMap((c) => c.pts)), faite);
    }
    case 'elementsDuToit': case 'cheminees': {
      // Une lucarne : le pan du corps ; une souche : sa section, du toit a son debouche.
      if (p.effet.type === 'elementsDuToit' && !p.effet.cheminees.length) { const c = corps(p.effet.corps); return c ? pan(c) : null; }
      const formes = p.effet.cheminees.map((ch) => {
        const dx = ch.largeurM / 2, dy = ch.profondeurM / 2;
        return { pts: [{ x: ch.x - dx, y: ch.y - dy }, { x: ch.x + dx, y: ch.y - dy }, { x: ch.x + dx, y: ch.y + dy }, { x: ch.x - dx, y: ch.y + dy }], bas: Math.max(mur, ch.sommetM - 1.5), haut: ch.sommetM, ferme: true };
      });
      if (formes.length) return zone(formes, centreDe(formes.flatMap((f) => f.pts)), faite);
      break;
    }
    case 'saillieDuToit': {
      // La saillie posee par le moteur : son rectangle, du sol a son faitage.
      const c = p.effet.corps;
      return zone([{ pts: c.pts, bas: 0, haut: c.faitage, ferme: true }], centreDe(c.pts), c.faitage / 2);
    }
    case 'corpsToit': case 'hauteurToit': case 'couverture':
      // Le toit seul, de l'egout au faitage.
      return zone(o.batiment?.corpsToit?.length ? o.batiment?.corpsToit.map((c) => ({ pts: c.pts, bas: mur, haut: c.faitage, ferme: true })) : [{ pts, bas: mur, haut: faite, ferme: true }], centreDe(pts), (mur + faite) / 2);
    case 'hauteur': case 'couleurMurs': case 'materiauMurs':
      // Les murs : le contour du sol a l'egout.
      return zone([{ pts, bas: 0, haut: mur, ferme: true }], centreDe(pts), mur);
  }
  return zone([{ pts, bas: 0, haut: faite, ferme: true }], centreDe(pts), faite);
}

/**
 * La zone qu'une observation de Claude concerne (`cle:obs:sujet`) : le mur d'un releve revu (`facade:cote`), le toit pour une
 * observation de toit, les murs pour une observation de murs ou de facade, sinon le batiment. Meme trace que les propositions.
 */
export function surbrillanceObservation(id: string, objets: readonly ObjetPlan[]): Surbrillance | null {
  const [cle = '', sujet = ''] = id.split(':obs:');
  const o = objets.find((x) => x.key === cle);
  const pts = sommets(o);
  if (!o || !pts) return null;
  const mur = hauteurDe(o);
  const faite = Math.max(mur, ...(o.batiment?.corpsToit ?? []).map((c) => c.faitage));
  const cote = /^facade:(\d+)/.exec(sujet)?.[1];
  if (cote !== undefined) {
    const f = facadesDuContour(pts, mur).find((x) => x.cote === Number(cote));
    if (f) return murNomme(o, f);
  }
  const type = typeObservation(id);
  if (type === 'toit') {
    const formes = o.batiment?.corpsToit?.length ? o.batiment?.corpsToit.map((c) => ({ pts: c.pts, bas: mur, haut: c.faitage, ferme: true })) : [{ pts, bas: mur, haut: faite, ferme: true }];
    return zone(formes, centreDe(pts), (mur + faite) / 2);
  }
  if (type === 'murs' || type === 'facades') return zone([{ pts, bas: 0, haut: mur, ferme: true }], centreDe(pts), mur);
  return zone([{ pts, bas: 0, haut: faite, ferme: true }], centreDe(pts), faite);
}

/** Les attributs d'un batiment qui parlent du toit, des murs ; les autres (ouvertures, silhouettes) parlent des facades. */
const ATTRIBUTS_TOIT = /^(formeToit|boutsToit|sensFaitage|hauteurTotale|couverture|lucarnes|cheminees|terrasse)/;
const ATTRIBUTS_MURS = /^(hauteurEgout|couleurMurs|materiauMurs)/;

/**
 * La zone d'un arbitrage de « Sources » (`cible|attribut`, cible = `batiment:<cle>` ou `facade:<cle>#<cote>`) : le mur nomme (contour
 * en gras) pour une facade, le toit ou les murs pour un attribut du batiment. Meme trace que les propositions.
 */
export function surbrillanceArbitrage(cible: string, attribut: string, objets: readonly ObjetPlan[]): Surbrillance | null {
  const m = /^(batiment|facade):([^#]+)(?:#(\d+))?$/.exec(cible);
  if (!m) return null;
  const [, genre, cle = '', cote] = m;
  const o = objets.find((x) => x.key === cle);
  const pts = sommets(o);
  if (!o || !pts) return null;
  const mur = hauteurDe(o);
  const faite = Math.max(mur, ...(o.batiment?.corpsToit ?? []).map((c) => c.faitage));
  if (genre === 'facade' && cote !== undefined) {
    const f = facadesDuContour(pts, mur).find((x) => x.cote === Number(cote));
    if (f) return murNomme(o, f);
  }
  if (ATTRIBUTS_TOIT.test(attribut)) {
    const formes = o.batiment?.corpsToit?.length ? o.batiment?.corpsToit.map((c) => ({ pts: c.pts, bas: mur, haut: c.faitage, ferme: true })) : [{ pts, bas: mur, haut: faite, ferme: true }];
    return zone(formes, centreDe(pts), (mur + faite) / 2);
  }
  if (ATTRIBUTS_MURS.test(attribut) || genre === 'facade') return zone([{ pts, bas: 0, haut: mur, ferme: true }], centreDe(pts), mur);
  return zone([{ pts, bas: 0, haut: faite, ferme: true }], centreDe(pts), faite);
}
