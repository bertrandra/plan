// Le fichier de l'audit de parcelle (MD/spec-audit.md §15) : ce qu'une visite a ramene et ce que
// l'on en a fait, dans un seul fichier `plan-audit-parcelle`, qu'un autre appareil peut reprendre a
// la phase 3 (« Fichier › Importer un audit de parcelle ») et que le corpus (§21) rejoue sans reseau.
//
// Il porte, pour chaque batiment, le cas fige (§9), « Ce que je vois » (§8.1) et, pour chaque facade,
// ses photos avec leur prise de vue, les mesures faites sur ces photos (releve avec son calage,
// couleur, hauteur) ; la cloture et le portail ; les propositions avec, pour chacune, si elle a ete
// validee ou refusee : une proposition refusee est aussi une information, Plan s'est trompe.
//
// Le fichier ne recalcule rien : il recopie. Deux lectures du meme fichier donnent la meme capture
// et les memes mesures, c'est ce qui le rend rejouable.

import { idCaptureParcelle, VERSION_CAPTURE_PARCELLE, type BatimentCapture, type CaptureParcelle, type ClotureCapturee, type DecisionAudit, type FacadeCapturee, type PortailCapture } from './auditParcelle.js';
import type { CasAudit, MetaPromenade, PhotoCas } from './audit.js';
import type { CeQueJeVois } from './ceQueJeVois.js';
import type { Proposition } from './propositions.js';
import type { ReleveFacade } from './types.js';

export const FORMAT_AUDIT_PARCELLE = 'plan-audit-parcelle';
/** La version du fichier qu'ecrit ce code. */
export const VERSION_FICHIER_AUDIT_PARCELLE = 1;

/** Ce que les mesures du telephone ont tire des photos d'une facade (§13.1), tel quel. */
export interface MesureFacadeAuditee {
  /** Le releve, avec son calage (`releve.calage`) ; null si la photo n'a pas pu s'analyser. */
  releve: ReleveFacade | null;
  /** La photo du releve, par son rang parmi celles de la facade. */
  rangReleve: number | null;
  coinsTrouves: boolean;
  confiance: number | null;
  hauteurM: number | null;
  couleur: { couleur: string; pixels: number; rang: number } | null;
}

export interface FacadeAuditee {
  cote: number;
  /** « Sud », « Nord-Est » ; null quand le plan n'a plus ce mur. */
  orientation: string | null;
  largeurM: number | null;
  hauteurM: number | null;
  inaccessible?: boolean;
  /** Les photos, avec leur prise et, par la mesure, leur calage. */
  photos: PhotoCas[];
  /** null : la facade n'a pas ete mesuree (pas de photo, ou mesure non faite). */
  mesure: MesureFacadeAuditee | null;
}

export interface BatimentAudite {
  cle: string;
  nom: string;
  mitoyen: boolean;
  /** Le cas fige (§9) : identite, entrees pour rejouer sans reseau, sorties du jour. */
  cas: Pick<CasAudit, 'identite' | 'entrees' | 'sorties'> | null;
  vu: CeQueJeVois;
  /** Les photos du toit, rangees sur le batiment. */
  photos: PhotoCas[];
  facades: FacadeAuditee[];
}

/** Ce qu'une proposition est devenue : validee (ecrite dans le projet), refusee, ou pas encore decidee. */
export type DecisionProposition = 'validee' | 'refusee' | null;

export interface PropositionAuditee extends Proposition { decision: DecisionProposition }

export interface FichierAuditParcelle {
  format: typeof FORMAT_AUDIT_PARCELLE;
  version: typeof VERSION_FICHIER_AUDIT_PARCELLE;
  parcelle: { idu: string; adresse: string | null; origine: { lat: number; lon: number } | null };
  code: MetaPromenade['code'];
  regles: MetaPromenade['regles'];
  /** Le debut de la visite, et la fin de la capture (ISO) ; `ecritLe` : quand le fichier a ete ecrit. */
  debut: string;
  finCapture: string | null;
  ecritLe: string;
  batiments: BatimentAudite[];
  cloture: ClotureCapturee;
  portail: PortailCapture;
  propositions: PropositionAuditee[];
  /** Chaque validation (§14), telle que la capture les garde. */
  decisions: DecisionAudit[];
}

/** Ce que le plan dit d'un batiment et de ses facades au moment d'ecrire le fichier. */
export interface BatimentPourFichier {
  cle: string;
  nom: string;
  mitoyen: boolean;
  cas: BatimentAudite['cas'];
  facades: { cote: number; orientation: string; largeurM: number; hauteurM: number }[];
}

export interface EntreesFichierAudit {
  parcelle: FichierAuditParcelle['parcelle'];
  code: MetaPromenade['code'];
  regles: MetaPromenade['regles'];
  capture: CaptureParcelle;
  batiments: readonly BatimentPourFichier[];
  /** Par `cle#cote` (app/audit/parcelle/propositions.ts, `cleMesure`). */
  mesures: ReadonlyMap<string, MesureFacadeAuditee>;
  propositions: readonly Proposition[];
  ecritLe: Date;
}

export const cleFacadeAuditee = (cle: string, cote: number): string => cle + '#' + cote;

const copie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Ce que la derniere validation a dit de cette proposition ; la plus recente l'emporte. */
export function decisionDe(id: string, decisions: readonly DecisionAudit[]): DecisionProposition {
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i]!;
    if (d.acceptees.includes(id)) return 'validee';
    if (d.refusees.includes(id)) return 'refusee';
  }
  return null;
}

function facadesDuBatiment(cle: string, b: BatimentPourFichier | undefined, c: BatimentCapture | undefined, mesures: EntreesFichierAudit['mesures']): FacadeAuditee[] {
  // Les facades du plan d'abord, dans l'ordre des cotes ; puis celles que la capture seule connait
  // (un contour modifie entre-temps) : rien de ce qui a ete photographie n'est perdu.
  const cotes = new Set<number>([...(b?.facades.map((f) => f.cote) ?? []), ...Object.keys(c?.facades ?? {}).map(Number)]);
  return [...cotes].sort((x, y) => x - y).map((cote) => {
    const plan = b?.facades.find((f) => f.cote === cote);
    const cap: FacadeCapturee | undefined = c?.facades[String(cote)];
    const m = mesures.get(cleFacadeAuditee(cle, cote));
    return {
      cote, orientation: plan?.orientation ?? null, largeurM: plan?.largeurM ?? null, hauteurM: plan?.hauteurM ?? null,
      ...(cap?.inaccessible !== undefined ? { inaccessible: cap.inaccessible } : {}),
      photos: [...(cap?.photos ?? [])],
      mesure: m ? copie(m) : null,
    };
  });
}

/** Le fichier de l'audit, tel qu'il se partage et s'envoie au corpus. */
export function fichierAuditParcelle(e: EntreesFichierAudit): FichierAuditParcelle {
  const { capture } = e;
  const cles = [...new Set([...e.batiments.map((b) => b.cle), ...Object.keys(capture.batiments)])];
  const batiments: BatimentAudite[] = cles.map((cle) => {
    const b = e.batiments.find((x) => x.cle === cle);
    const c = capture.batiments[cle];
    return {
      cle, nom: b?.nom ?? cle, mitoyen: b?.mitoyen ?? false, cas: b?.cas ? copie(b.cas) : null,
      vu: copie(c?.vu ?? {}), photos: [...(c?.photos ?? [])], facades: facadesDuBatiment(cle, b, c, e.mesures),
    };
  });
  const decisions = (capture.decisions ?? []).map(copie);
  return {
    format: FORMAT_AUDIT_PARCELLE, version: VERSION_FICHIER_AUDIT_PARCELLE,
    parcelle: copie(e.parcelle), code: { ...e.code }, regles: { ...e.regles },
    debut: capture.debut, finCapture: capture.finCapture, ecritLe: e.ecritLe.toISOString(),
    batiments,
    cloture: { ...capture.cloture, photos: [...capture.cloture.photos] },
    portail: { ...capture.portail, photos: [...capture.portail.photos] },
    propositions: e.propositions.map((p) => ({ ...copie(p), decision: decisionDe(p.id, decisions) })),
    decisions,
  };
}

/** Un fichier qui n'est pas un audit de parcelle lisible par ce code : le message se montre tel quel. */
export class FichierAuditParcelleIllisible extends Error {}

const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const photos = (v: unknown): boolean => Array.isArray(v) && v.every((p) => objet(p) && typeof p.base64 === 'string');

/**
 * Relit un fichier d'audit de parcelle. Rien n'est recalcule ni complete : un fichier doit se rejouer
 * comme il a ete ecrit. Les photos sont verifiees une a une : c'est ce que l'import rangera.
 */
export function lireFichierAuditParcelle(donnees: unknown): FichierAuditParcelle {
  const f = donnees as Partial<FichierAuditParcelle> | null;
  if (!objet(f) || f.format !== FORMAT_AUDIT_PARCELLE) throw new FichierAuditParcelleIllisible('Ce fichier n’est pas un fichier d’audit de parcelle.');
  if (typeof f.version !== 'number' || f.version < 1) throw new FichierAuditParcelleIllisible('La version de ce fichier d’audit est inconnue.');
  if (f.version > VERSION_FICHIER_AUDIT_PARCELLE) throw new FichierAuditParcelleIllisible('Ce fichier d’audit vient d’une version plus récente de Plan : mettez Plan à jour pour le lire.');
  const incomplet = (quoi: string) => new FichierAuditParcelleIllisible('Ce fichier d’audit est incomplet (' + quoi + ').');
  if (!objet(f.parcelle) || typeof f.parcelle.idu !== 'string' || !f.parcelle.idu) throw incomplet('parcelle');
  if (typeof f.debut !== 'string' || Number.isNaN(Date.parse(f.debut))) throw incomplet('début');
  if (!Array.isArray(f.batiments)) throw incomplet('bâtiments');
  for (const b of f.batiments as unknown[]) {
    if (!objet(b) || typeof b.cle !== 'string' || !objet(b.vu) || !photos(b.photos) || !Array.isArray(b.facades)) throw incomplet('bâtiment');
    for (const fa of b.facades as unknown[]) if (!objet(fa) || typeof fa.cote !== 'number' || !photos(fa.photos)) throw incomplet('façade');
  }
  if (!objet(f.cloture) || !photos(f.cloture.photos) || !objet(f.portail) || !photos(f.portail.photos)) throw incomplet('clôture ou portail');
  if (!Array.isArray(f.propositions)) throw incomplet('propositions');
  return {
    ...(f as FichierAuditParcelle), version: VERSION_FICHIER_AUDIT_PARCELLE,
    decisions: Array.isArray(f.decisions) ? f.decisions : [],
    parcelle: { idu: f.parcelle.idu, adresse: typeof f.parcelle.adresse === 'string' ? f.parcelle.adresse : null, origine: f.parcelle.origine ?? null },
  };
}

/** La capture du fichier, terminee, telle que la session la reprend a la phase 3. */
export function captureDuFichier(f: FichierAuditParcelle): CaptureParcelle {
  const batiments: Record<string, BatimentCapture> = {};
  for (const b of f.batiments) {
    const facades: Record<string, FacadeCapturee> = {};
    for (const fa of b.facades) {
      if (!fa.photos.length && fa.inaccessible === undefined) continue;
      facades[String(fa.cote)] = { photos: [...fa.photos], ...(fa.inaccessible !== undefined ? { inaccessible: fa.inaccessible } : {}) };
    }
    if (!Object.keys(facades).length && !b.photos.length && !Object.keys(b.vu).length) continue;
    batiments[b.cle] = { facades, vu: copie(b.vu), photos: [...b.photos] };
  }
  return {
    version: VERSION_CAPTURE_PARCELLE, id: idCaptureParcelle(f.parcelle.idu), debut: f.debut, idu: f.parcelle.idu,
    phase: 'analyse', finCapture: f.finCapture ?? f.ecritLe, batiments,
    cloture: { ...f.cloture, photos: [...f.cloture.photos] }, portail: { ...f.portail, photos: [...f.portail.photos] },
    ...(f.decisions.length ? { decisions: f.decisions.map(copie) } : {}),
  };
}

/** Les mesures du fichier, par facade : ce que l'import pose a la place d'un nouveau calcul. */
export function mesuresDuFichier(f: FichierAuditParcelle): (MesureFacadeAuditee & { cle: string; cote: number })[] {
  return f.batiments.flatMap((b) => b.facades.filter((fa) => fa.mesure).map((fa) => ({ cle: b.cle, cote: fa.cote, ...copie(fa.mesure!) })));
}

/** La derniere validation du fichier : les cases que l'import coche et decoche. */
export function derniereDecision(f: FichierAuditParcelle): DecisionAudit | null {
  return f.decisions.length ? f.decisions[f.decisions.length - 1]! : null;
}

/** `audit-parcelle-2026-10-13-78650000AE0101.json` : le jour local de l'ecriture et l'IDU. */
export function nomFichierAuditParcelle(date: Date, idu: string): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  const jour = date.getFullYear() + '-' + d2(date.getMonth() + 1) + '-' + d2(date.getDate());
  return 'audit-parcelle-' + jour + '-' + idu.replace(/[^A-Za-z0-9_-]+/g, '-') + '.json';
}
