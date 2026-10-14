// Juger un cas observe avec le code d'aujourd'hui (MD/spec-regles-toits.md §7, §13.5 ; lot G3).
//
// Le cas est rejoue comme le fait le script du corpus (facade/audit.ts, `rejouerCas` : calcul entier,
// reglages et faits courants, sans reseau), puis ce que le calcul dit de son plus grand corps est
// compare a l'observation : l'attendu valide d'abord (corps au centimetre, couleur et source des
// murs, comme tests/unit/facade/audit.test.ts), puis « Ce que je vois » (model/conformite.ts). Un cas
// qui ne note que des problemes est juge sur eux : le probleme est toujours la tant que le rejeu
// redonne, sur ce qu'il touche, ce que le terrain a donne.
//
// Deux sources, le meme jugement : les cas des fichiers de promenade (le corpus du depot,
// tests/fixtures/audit/) et les batiments des audits de parcelle partages (`plan-audit-parcelle`,
// lot L21), dont « Ce que je vois » est l'observation.

import { rejouerCas, ecartsSorties, type EcartSorties } from './audit.js';
import { boutsDuCorps, formeDuCorps, plusGrand } from './faitsToits.js';
import { faitsEnVigueur, type FaitsToits } from '../model/faitsToits.js';
import { assertionsDuVu, etatDesAssertions, FORMAT_CORPUS_CONFORMITE, type CorpusConformite, type LectureCalculee, type VerdictAssertion, type VerdictCas } from '../model/conformite.js';
import { departementDeIdu } from '../model/departements.js';
import { rienVu } from '../model/ceQueJeVois.js';
import { PROBLEMES_AUDIT, type CasAudit, type FichierPromenade, type SortiesCas, type StatutCas } from '../model/audit.js';
import type { FichierAuditParcelle } from '../model/fichierAuditParcelle.js';
import type { CorpsToit } from '../model/types.js';

/** Un cas a juger : le cas fige, d'ou il vient, et la region ou il a ete vu. */
export interface CasObserve {
  source: VerdictCas['source'];
  fichier: string;
  /** Le statut du cas de promenade ; null pour un batiment d'audit de parcelle (il n'en a pas). */
  statut: StatutCas | null;
  region: string;
  cas: CasAudit;
}

/** Ce que le test du corpus compare sur un cas valide (spec-audit §23). */
const CHAMPS_ATTENDU: EcartSorties['champ'][] = ['corps', 'couleurMurs', 'sourceMurs'];

/**
 * Ce que le rejeu peut refaire pour chaque probleme. Vide : le rejeu n'y touche pas (le contour est
 * fige, la couleur du toit et la reponse « a cheval » ne se rejouent pas, les fenetres viennent de
 * la 3D) ; le probleme reste donc tel que note.
 */
function champsDuProbleme(code: string): EcartSorties['champ'][] {
  if (code === 'toit.couverture' || code === 'toit.cheval') return [];
  const categorie = PROBLEMES_AUDIT.find((p) => p.code === code)?.categorie;
  if (categorie === 'toit') return ['corps', 'forme'];
  if (categorie === 'hauteur') return ['elevation'];
  if (code === 'facade.couleur' || code === 'facade.materiau') return ['couleurMurs', 'sourceMurs'];
  return [];
}

/** Ce que le calcul dit du batiment, lu sur son plus grand corps (celui que l'observation decrit). */
export function lectureDesCorps(corps: readonly CorpsToit[] | null): LectureCalculee {
  // Ni lucarne ni cheminee ne sortent encore du calcul (lots G4 et G8) : celles du plan sont observees.
  const sans = { lucarnes: 0, cheminees: 0 };
  if (!corps?.length) return { forme: null, bouts: null, ...sans };
  const c = corps[plusGrand(corps)] as CorpsToit;
  const forme = formeDuCorps(c);
  return { forme, bouts: forme === 'deux-pans' || forme === 'croupes' ? boutsDuCorps(c) : null, ...sans };
}

const dire = (e: readonly EcartSorties[]) => e.map((x) => x.champ + ' ' + x.avant + ' → ' + x.apres).join(', ');

/** Les problemes notes, juges sur le rejeu : toujours la, ou calcul change depuis le terrain. */
function jugerProblemes(problemes: readonly string[], rejeu: SortiesCas, terrain: SortiesCas | null): { assertions: VerdictAssertion[]; persiste: boolean } {
  let persiste = false;
  const assertions = problemes.map((code): VerdictAssertion => {
    const champs = champsDuProbleme(code);
    const ecarts = champs.length && terrain ? ecartsSorties(rejeu, terrain, champs) : [];
    if (!ecarts.length) { persiste = true; return { assertion: 'probleme', tenue: false, motif: code + ' : toujours là' }; }
    return { assertion: 'probleme', tenue: false, motif: code + ' : le calcul a changé depuis le terrain (' + dire(ecarts) + '), à revoir' };
  });
  return { assertions, persiste };
}

/** La forme qui range le cas : celle vue, sinon celle du plus grand corps de l'attendu valide. */
function formeDuCas(c: CasAudit): VerdictCas['forme'] {
  if (c.vu?.forme) return c.vu.forme;
  const f = c.attendu?.corps?.length ? lectureDesCorps(c.attendu.corps).forme : null;
  return f ?? 'non-notee';
}

/** Le verdict d'un cas : rejoue avec le code, les reglages et les faits courants (`faits`, ceux d'une PR pour l'essai). */
export function jugerCas(o: CasObserve, faits: FaitsToits = faitsEnVigueur()): VerdictCas {
  const c = o.cas;
  const base = {
    source: o.source, fichier: o.fichier, id: c.id, cle: c.cle, statut: o.statut, forme: formeDuCas(c), region: o.region,
    problemes: [...c.constat.problemes],
  };
  if (o.statut === 'sans_suite') return { ...base, etat: 'ecarte', assertions: [], nonVerifiees: [] };
  const rejeu = rejouerCas(c, faits).sorties;
  const assertions: VerdictAssertion[] = [];
  let nonVerifiees: string[] = [];
  if (c.attendu) {
    const e = ecartsSorties(rejeu, c.attendu, CHAMPS_ATTENDU);
    assertions.push(e.length ? { assertion: 'attendu', tenue: false, motif: dire(e) } : { assertion: 'attendu', tenue: true });
  }
  if (c.vu && !rienVu(c.vu)) {
    const v = assertionsDuVu(c.vu, lectureDesCorps(rejeu.corps));
    assertions.push(...v.assertions);
    nonVerifiees = v.nonVerifiees;
  }
  if (assertions.length || !c.constat.problemes.length) return { ...base, etat: etatDesAssertions(assertions), assertions, nonVerifiees };
  const p = jugerProblemes(c.constat.problemes, rejeu, c.sorties as SortiesCas | null);
  return { ...base, etat: p.persiste ? 'non-conforme' : 'a-revoir', assertions: p.assertions, nonVerifiees };
}

/** La region d'un cas : le departement de son IDU, sinon la commune notee. */
const regionDe = (idu: string | null | undefined, commune: string | null | undefined): string => departementDeIdu(idu) ?? (commune?.trim() || 'inconnue');

/** Les cas d'un fichier de promenade (le corpus du depot). */
export function casDeLaPromenade(nom: string, f: FichierPromenade): CasObserve[] {
  return f.cas.map((c) => ({ source: 'corpus', fichier: nom, statut: c.statut, region: regionDe(c.identite.idu, f.promenade.commune), cas: c }));
}

/**
 * Les batiments d'un audit de parcelle recu, chacun comme un cas : son cas fige (entrees et sorties
 * du jour) et « Ce que je vois » comme observation. Un batiment sans cas fige ne se rejoue pas.
 */
export function casDeLAuditParcelle(id: string, f: FichierAuditParcelle): CasObserve[] {
  return f.batiments.flatMap((b): CasObserve[] => {
    if (!b.cas) return [];
    const cas: CasAudit = {
      id: b.cle, cle: b.cle, statut: 'a_corriger',
      constat: { categorie: 'toit', problemes: [], note: '', t: f.debut, position: { x: 0, y: 0, precisionM: null }, photos: [] },
      identite: b.cas.identite, entrees: b.cas.entrees, sorties: b.cas.sorties, attendu: null, historique: [], vu: b.vu,
    };
    return [{ source: 'audit', fichier: id, statut: null, region: regionDe(b.cas.identite.idu ?? f.parcelle.idu, null), cas }];
  });
}

/** Ce que regles/conformite.json dit de lui-meme : il se regenere, il ne s'ecrit pas a la main. */
const POURQUOI_CORPUS = 'Les verdicts de conformite du corpus du depot (tests/fixtures/audit/), rejoue avec le code, les reglages et les faits courants (MD/spec-regles-toits.md §13.5, lot G3). Engendre par `npx tsx .claude/skills/toits/scripts/conformite.ts --ecrire` ; tests/unit/facade/conformite.test.ts verifie qu\'il est a jour. L\'ecran Admin › Conformité le lit, avec les audits partages recus sur le serveur.';

/** Les verdicts du corpus : chaque fichier de promenade lu, par ordre de nom, chaque cas juge. */
export function corpusConformite(fichiers: readonly { nom: string; fichier: FichierPromenade }[], faits: FaitsToits = faitsEnVigueur()): CorpusConformite {
  const verdicts = [...fichiers].sort((a, b) => a.nom.localeCompare(b.nom)).flatMap((f) => casDeLaPromenade(f.nom, f.fichier).map((o) => jugerCas(o, faits)));
  return { format: FORMAT_CORPUS_CONFORMITE, version: 1, pourquoi: POURQUOI_CORPUS, verdicts };
}

/** Le texte du fichier, tel que le script l'ecrit et que le test le compare. */
export const texteCorpusConformite = (c: CorpusConformite): string => JSON.stringify(c, null, 1) + '\n';
