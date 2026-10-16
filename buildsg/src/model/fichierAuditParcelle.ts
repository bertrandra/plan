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
  for (const d of [...decisions].reverse()) {
    if (d.acceptees.includes(id)) return 'validee';
    if (d.refusees.includes(id)) return 'refusee';
  }
  return null;
}

/**
 * Les champs d'une mesure, sans ce qui designe sa facade : la facade la porte dans le fichier, et un
 * import renomme le batiment (une cle recopiee dans la mesure y resterait l'ancienne).
 */
const mesureSeule = (m: MesureFacadeAuditee): MesureFacadeAuditee => copie({
  releve: m.releve, rangReleve: m.rangReleve, coinsTrouves: m.coinsTrouves, confiance: m.confiance, hauteurM: m.hauteurM, couleur: m.couleur,
});

const sansPropositions =(d: DecisionAudit): DecisionAudit => ({ t: d.t, acceptees: [...d.acceptees], refusees: [...d.refusees], verifies: [...d.verifies] });

/**
 * Les propositions du fichier : celles de chaque validation, telles qu'elles etaient au moment de la
 * decision (une proposition ecrite ne se recalcule plus), puis celles du moment, pas encore decidees.
 */
function propositionsDuFichier(actuelles: readonly Proposition[], decisions: readonly DecisionAudit[]): PropositionAuditee[] {
  const parId = new Map<string, Proposition>();
  for (const d of decisions) for (const p of d.propositions ?? []) parId.set(p.id, p);
  for (const p of actuelles) if (!parId.has(p.id)) parId.set(p.id, p);
  return [...parId.values()].map((p) => ({ ...copie(p), decision: decisionDe(p.id, decisions) }));
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
      mesure: m ? mesureSeule(m) : null,
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
  const decisions = capture.decisions ?? [];
  return {
    format: FORMAT_AUDIT_PARCELLE, version: VERSION_FICHIER_AUDIT_PARCELLE,
    parcelle: copie(e.parcelle), code: { ...e.code }, regles: { ...e.regles },
    debut: capture.debut, finCapture: capture.finCapture, ecritLe: e.ecritLe.toISOString(),
    batiments,
    cloture: { ...capture.cloture, photos: [...capture.cloture.photos] },
    portail: { ...capture.portail, photos: [...capture.portail.photos] },
    propositions: propositionsDuFichier(e.propositions, decisions),
    // Les propositions de chaque validation sont deja dans `propositions`, avec leur decision.
    decisions: decisions.map(sansPropositions),
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

/** Une validation du fichier, avec les propositions qu'elle a decidees : un second fichier les redira. */
function decisionAvecPropositions(d: DecisionAudit, propositions: readonly PropositionAuditee[]): DecisionAudit {
  const ids = new Set([...d.acceptees, ...d.refusees]);
  const decidees = propositions.filter((p) => ids.has(p.id)).map((p) => {
    const sans: Partial<PropositionAuditee> = copie(p);
    delete sans.decision;
    return sans as Proposition;
  });
  return { ...sansPropositions(d), ...(decidees.length ? { propositions: decidees } : {}) };
}

/**
 * La capture du fichier, telle que la session la reprend : terminee (phase 3) quand le fichier dit la
 * fin de la capture, en cours sinon. Un fichier ecrit pendant la capture (la sauvegarde sur le
 * serveur, §15) se reprend ainsi la ou il en etait, sur la liste de controle.
 */
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
    ...(f.finCapture ? { phase: 'analyse' as const, finCapture: f.finCapture } : { phase: 'capture' as const, finCapture: null }), batiments,
    cloture: { ...f.cloture, photos: [...f.cloture.photos] }, portail: { ...f.portail, photos: [...f.portail.photos] },
    ...(f.decisions.length ? { decisions: f.decisions.map((d) => decisionAvecPropositions(d, f.propositions)) } : {}),
    // Un audit venu d'un fichier est deja connu de qui l'a ecrit (l'administrateur, pour un client) :
    // la case du partage arrive decochee, pour ne pas l'envoyer une seconde fois sans le vouloir.
    partage: { accord: false, envoi: null },
  };
}

/** Les mesures du fichier, par facade : ce que l'import pose a la place d'un nouveau calcul. */
export function mesuresDuFichier(f: FichierAuditParcelle): (MesureFacadeAuditee & { cle: string; cote: number })[] {
  return f.batiments.flatMap((b) => b.facades.flatMap((fa) => (fa.mesure ? [{ ...mesureSeule(fa.mesure), cle: b.cle, cote: fa.cote }] : [])));
}

/** La derniere validation du fichier : les cases que l'import coche et decoche. */
export function derniereDecision(f: FichierAuditParcelle): DecisionAudit | null {
  return f.decisions[f.decisions.length - 1] ?? null;
}

/** `audit-parcelle-2026-10-13-78650000AE0101.json` : le jour local de l'ecriture et l'IDU. */
export function nomFichierAuditParcelle(date: Date, idu: string): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  const jour = date.getFullYear() + '-' + d2(date.getMonth() + 1) + '-' + d2(date.getDate());
  return 'audit-parcelle-' + jour + '-' + idu.replace(/[^A-Za-z0-9_-]+/g, '-') + '.json';
}

/**
 * Pourquoi ce fichier ne s'applique pas a ce projet : un audit decrit une parcelle (§15, « même
 * IDU ») ; ses photos et ses mesures n'ont aucun sens sur une autre. Null quand il s'applique.
 */
export function refusParcelle(f: FichierAuditParcelle, iduProjet: string | null): string | null {
  if (!iduProjet) return 'Ce projet n’a pas de parcelle cadastrale : importez d’abord la parcelle depuis son adresse.';
  if (f.parcelle.idu === iduProjet) return null;
  return 'Ce fichier est l’audit de la parcelle ' + f.parcelle.idu + (f.parcelle.adresse ? ' (' + f.parcelle.adresse + ')' : '')
    + ', ce projet est sur la parcelle ' + iduProjet + ' : ouvrez le projet de cette parcelle.';
}

/** Une proposition designe son batiment par sa cle en tete : `cle:hauteur`, `cle#2:releve`. */
function renommerId(id: string, renommage: ReadonlyMap<string, string>): string {
  const m = /^(.*?)([:#].*)$/.exec(id);
  const [, cle = '', suite = ''] = m ?? [];
  const nouvelle = m ? renommage.get(cle) : undefined;
  return nouvelle === undefined ? id : nouvelle + suite;
}

/**
 * Le meme fichier, ses batiments sous les cles de ce projet-ci. Un autre projet de la meme parcelle
 * (ouvert ailleurs, refait depuis l'adresse) donne parfois d'autres cles aux memes batiments ; leur
 * identifiant BD TOPO, lui, ne change pas : l'import s'en sert pour les retrouver.
 */
export function renommerBatiments(f: FichierAuditParcelle, renommage: ReadonlyMap<string, string>): FichierAuditParcelle {
  if (![...renommage].some(([a, b]) => a !== b)) return f;
  const cle = (c: string) => renommage.get(c) ?? c;
  const ids = (l: readonly string[]) => l.map((id) => renommerId(id, renommage));
  const indice = (i: Proposition['indices'][number]) => (i.photo ? { ...i, photo: { ...i.photo, cle: cle(i.photo.cle) } } : i);
  return {
    ...f,
    batiments: f.batiments.map((b) => ({ ...b, cle: cle(b.cle) })),
    propositions: f.propositions.map((p) => ({
      ...p, id: renommerId(p.id, renommage), indices: p.indices.map(indice),
      cible: p.cible.type === 'parcelle' ? p.cible : { ...p.cible, cle: cle(p.cible.cle) },
    })),
    decisions: f.decisions.map((d) => ({ ...d, acceptees: ids(d.acceptees), refusees: ids(d.refusees), verifies: d.verifies.map(cle) })),
  };
}

/**
 * Les cles des batiments du fichier dans ce projet : la meme cle si elle y est, sinon le batiment du
 * projet qui a le meme identifiant BD TOPO. Un batiment introuvable n'y figure pas : la liste de
 * controle ne le montre pas, rien ne lui est propose.
 */
export function correspondanceBatiments(f: FichierAuditParcelle, projet: readonly { cle: string; cleBdtopo: string | null }[]): Map<string, string> {
  const presentes = new Set(projet.map((b) => b.cle));
  const parBdtopo = new Map(projet.flatMap((b) => (b.cleBdtopo ? [[b.cleBdtopo, b.cle] as const] : [])));
  const out = new Map<string, string>();
  for (const b of f.batiments) {
    if (presentes.has(b.cle)) { out.set(b.cle, b.cle); continue; }
    const bd = b.cas?.identite.cleBdtopo;
    const trouvee = bd ? parBdtopo.get(bd) : undefined;
    if (trouvee) out.set(b.cle, trouvee);
  }
  return out;
}
