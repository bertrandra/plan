// Les mesures d'une facade relevee (model/mesureFacade.ts, lot G11) sur le corpus du banc : mesurees sur
// la verite de chaque scene, puis sur ce que la chaine du releve en a retenu (ouvertures detectees sur
// la photo, grille recalculee comme le fait le releve, hauteur retenue par l'analyse). L'ecart dit ce
// que valent ces mesures sur une facade relevee sans retouche : c'est ce que les profils de facades
// (G12) liront dans les audits.
//
// Le banc mesure, il ne regle pas : rien ici ne touche a la detection.

import { avecGrille, versOuvertureFacade } from '../../../src/facade/detection/verification.js';
import { mesurerFacadesAuditees } from '../../../src/facade/contexteFacade.js';
import { mesurerFacade, resumeMesureFacade, type ContexteFacade, type MesureFacade } from '../../../src/model/mesureFacade.js';
import type { FichierAuditParcelle } from '../../../src/model/fichierAuditParcelle.js';
import type { ResultatScene } from './banc.js';
import { mediane } from './mesure.js';
import type { SceneFacade } from './synthese.js';

export interface MesuresScene {
  nom: string;
  verite: MesureFacade;
  /** null : la scene n'a pas de photo, ou la chaine n'a rien rendu. */
  releve: MesureFacade | null;
}

/** Ce que la scene dit du mur hors de la photo : un pignon peint au-dessus de l'egout ; la rue, elle, n'est pas connue. */
export const contexteScene = (s: SceneFacade): ContexteFacade => ({ pignon: (s.synthese.mur.pignon ?? 0) > 0, surRue: null, coteVoisin: null });

/** La verite de la scene, mesuree avec la grille que le releve calculerait sur elle. */
export function mesuresVerite(s: SceneFacade): MesureFacade {
  const v = s.verite;
  const { ouvertures, grille } = avecGrille(v.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })), v.largeur);
  return mesurerFacade({ largeur: v.largeur, hauteur: v.hauteur, ouvertures, grille }, contexteScene(s));
}

/** Ce que la chaine du releve a retenu de la scene (ouvertures cochees), mesure comme un releve. */
export function mesuresReleve(s: SceneFacade, r: ResultatScene): MesureFacade | null {
  const detectees = r.detail.photo;
  if (!detectees) return null;
  const hauteur = s.verite.hauteur + (r.hauteurCm ?? 0) / 100;
  const { ouvertures, grille } = avecGrille(detectees.map(versOuvertureFacade), s.verite.largeur);
  return mesurerFacade({ largeur: s.verite.largeur, hauteur, ouvertures, grille }, contexteScene(s));
}

const cm = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 100)));
const pc = (v: number) => (Math.round(v * 1000) / 10).toLocaleString('fr-FR') + ' %';
const fenetres = (m: MesureFacade) => (m.fenetre ? `${cm(m.fenetre.largeurM)} × ${cm(m.fenetre.hauteurM)}` : '—');
const porte = (m: MesureFacade) => (m.porte ? m.porte.position + (m.porte.alignee ? ', alignée' : '') : '—');
const garage = (m: MesureFacade) => (m.garage ? cm(m.garage.largeurM) : '—');
const niveaux = (m: MesureFacade) => (m.baiesParNiveau.length ? m.baiesParNiveau.join(' + ') : '—');
const typ = (m: MesureFacade) => m.type ?? '?';

/** « vérité → relevé », ou la seule valeur quand les deux s'accordent. */
function paire(v: MesureFacade, r: MesureFacade | null, f: (m: MesureFacade) => string): string {
  if (!r) return f(v) + ' → —';
  const a = f(v), b = f(r);
  return a === b ? a : `${a} → **${b}**`;
}

/** Les ecarts entre la verite et le releve, sur l'ensemble des scenes. */
export interface EcartsMesures {
  scenes: number;
  /** Ecarts absolus, en cm : medianes et maximum. */
  largeurCm: number[];
  hauteurCm: number[];
  appuiCm: number[];
  entraxeCm: number[];
  /** Ecart absolu de la part vitree, en points de pourcentage. */
  partVitreePts: number[];
  niveauxJustes: number;
  porteJuste: number;
  garageJuste: number;
}

export function ecartsMesures(lignes: readonly MesuresScene[]): EcartsMesures {
  const e: EcartsMesures = { scenes: 0, largeurCm: [], hauteurCm: [], appuiCm: [], entraxeCm: [], partVitreePts: [], niveauxJustes: 0, porteJuste: 0, garageJuste: 0 };
  const ecart = (a: number | null | undefined, b: number | null | undefined, l: number[]) => {
    if (a !== null && a !== undefined && b !== null && b !== undefined) l.push(Math.abs(a - b) * 100);
  };
  for (const { verite: v, releve: r } of lignes) {
    if (!r) continue;
    e.scenes++;
    ecart(v.fenetre?.largeurM, r.fenetre?.largeurM, e.largeurCm);
    ecart(v.fenetre?.hauteurM, r.fenetre?.hauteurM, e.hauteurCm);
    ecart(v.fenetre?.appuiM, r.fenetre?.appuiM, e.appuiCm);
    ecart(v.entraxeM, r.entraxeM, e.entraxeCm);
    ecart(v.partVitree, r.partVitree, e.partVitreePts);
    if (v.baiesParNiveau.join() === r.baiesParNiveau.join()) e.niveauxJustes++;
    if ((v.porte?.position ?? null) === (r.porte?.position ?? null)) e.porteJuste++;
    if (!!v.garage === !!r.garage) e.garageJuste++;
  }
  return e;
}

const med = (l: number[]) => (l.length ? (Math.round((mediane(l) ?? 0) * 10) / 10).toLocaleString('fr-FR') : '—');
const max = (l: number[]) => (l.length ? (Math.round(Math.max(...l) * 10) / 10).toLocaleString('fr-FR') : '—');

/** Le tableau des mesures, en Markdown : une ligne par scene, « vérité → relevé » quand ils different. */
export function tableauMesures(lignes: readonly MesuresScene[]): string {
  const l: string[] = [
    '### Mesures des façades (vérité → relevé)',
    '',
    '| Façade | Fenêtres l × h (cm) | Appui (cm) | Entraxe (cm) | Part vitrée | Baies par niveau | Étage (cm) | Porte | Garage (cm) | Type |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { nom, verite: v, releve: r } of lignes) {
    l.push(`| ${nom} | ${paire(v, r, fenetres)} | ${paire(v, r, (m) => cm(m.fenetre?.appuiM))} | ${paire(v, r, (m) => cm(m.entraxeM))} | ${paire(v, r, (m) => pc(m.partVitree))} | ${paire(v, r, niveaux)} | ${paire(v, r, (m) => cm(m.hauteurNiveauM))} | ${paire(v, r, porte)} | ${paire(v, r, garage)} | ${paire(v, r, typ)} |`);
  }
  const e = ecartsMesures(lignes);
  l.push('', '| Écart vérité → relevé (' + e.scenes + ' scènes) | Médiane | Maximum |', '|---|--:|--:|');
  l.push(`| Largeur des fenêtres (cm) | ${med(e.largeurCm)} | ${max(e.largeurCm)} |`);
  l.push(`| Hauteur des fenêtres (cm) | ${med(e.hauteurCm)} | ${max(e.hauteurCm)} |`);
  l.push(`| Appui (cm) | ${med(e.appuiCm)} | ${max(e.appuiCm)} |`);
  l.push(`| Entraxe (cm) | ${med(e.entraxeCm)} | ${max(e.entraxeCm)} |`);
  l.push(`| Part vitrée (points) | ${med(e.partVitreePts)} | ${max(e.partVitreePts)} |`);
  l.push('', `Baies par niveau justes : **${e.niveauxJustes}/${e.scenes}** ; place de la porte juste : **${e.porteJuste}/${e.scenes}** ; garage juste : **${e.garageJuste}/${e.scenes}**.`);
  return l.join('\n');
}

/**
 * Les facades relevees d'un audit de parcelle (fichier `plan-audit-parcelle`), une ligne chacune :
 * batiment, mur, orientation, puis la mesure. Sert aux scripts du skill facades et du skill toits.
 */
export function lignesAuditParcelle(f: FichierAuditParcelle, nom: string): string[] {
  const mesurees = mesurerFacadesAuditees(f);
  const sans = f.batiments.reduce((n, b) => n + b.facades.filter((fa) => !fa.mesure?.releve).length, 0);
  return [
    `# ${nom} : parcelle ${f.parcelle.idu}${f.parcelle.adresse ? ' (' + f.parcelle.adresse + ')' : ''}, ${mesurees.length} facade(s) relevee(s), ${sans} sans releve, code ${f.code.version} (${f.code.commit ?? '?'})`,
    ...mesurees.map((m) => `  ${m.cle} mur ${m.cote}${m.orientation ? ' (' + m.orientation + ')' : ''} ${m.mesure.largeurM} x ${m.mesure.hauteurM} m : ${resumeMesureFacade(m.mesure)}`),
  ];
}
