// Les etapes de la forme de l'enchainement d'une facade (MD/spec-facade-calage-audit.md §4 E5 bis et E8, lot F4) : le diagnostic de
// forme (facade/regles/facades/diagnosticForme.ts), corps par corps, et ce que le toit en attend. Des fonctions d'etape que seul
// l'orchestrateur (enchainement.ts) appelle : il leur donne le haut lu (E5), les corps du toit (E0) et la reponse de Claude (E4).
// L'E8 n'ecrit rien : une proposition ne s'applique qu'une fois cochee par la personne, dans l'avant/apres de l'audit, et c'est le
// moteur des toits qui la relit (corpsSousContrainte). Pur.

import { diagnostiquerForme, direAlerte, direChangement, direElement, direPreuve, type DiagnosticForme, type PropositionElement, type PropositionForme } from '../regles/facades/diagnosticForme.js';
import { cadreCorps, elementPoseSurLeMur, versCadre } from '../regles/toits/elementsDesMurs.js';
import { murDuCorps } from '../regles/toits/murDuCorps.js';
import { facadeDuMur } from '../../geometry/cotesVusDeDehors.js';
import type { Objectifs } from '../regles/facades/enchainement.js';
import type { EtatAffiche } from '../../model/etapeFacade.js';
import type { ObservationsFacade } from '../../regles/facades/observations.js';
import type { ToitVraiCorps } from '../corpusReel.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';
import type { P2 } from '../vision/homographie.js';

/** Les corps du toit du plan qui font le gabarit (E0) : le mur de la facade (vu de dehors) et les corps lus sur le LiDAR. */
export interface ToitDeLaFacade { mur: { gauche: PtBrut; droite: PtBrut }; corps: readonly CorpsToit[] }

/** Une etape calculee, sans son identifiant (l'orchestrateur le pose). */
interface Etape { etat: EtatAffiche; resume: string; verite: { texte: string; juste: boolean } | null }

const dec = (x: number, n = 2) => String(Math.round(x * 10 ** n) / 10 ** n).replace('.', ',');
const pluriel = (n: number, s: string, p = s + 's') => n + ' ' + (n > 1 ? p : s);

/** Le haut lu sur l'assemblage (pixels) ramene au mur pose : `u` de 0 a 1 entre ses bouts, `v` en hauteurs d'egout depuis le sol. */
export function hautEnPartsDuMur(points: readonly P2[], r: { x0: number; x1: number; y0: number; y1: number }): { u: number; v: number }[] | null {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  return w > 0 && h > 0 && points.length >= 2 ? points.map((p) => ({ u: (p.x - r.x0) / w, v: (r.y1 - p.y) / h })) : null;
}

/** Le nom d'un corps dans une phrase : son rang et le role du mur (« corps 1, long pan »). */
const nomDuCorps = (corps: number, cote: number): string => `corps ${corps + 1}, ${cote === 0 || cote === 2 ? 'long pan' : 'mur de bout'}`;

/** Une proposition en une phrase : le corps, ce qui change, d'ou elle vient. */
const direPropositionForme = (p: PropositionForme): string => `${nomDuCorps(p.corps, p.cote)} : ${direChangement(p)}, ${direPreuve(p)}`;

/** Un element propose en une phrase : le corps, ce qu'il est, d'ou il vient. */
const direPropositionElement = (p: PropositionElement): string => `${nomDuCorps(p.corps, p.cote)} : ${direElement(p)}`;

/** La place le long du faitage (s, metres depuis `pts[0]`) des elements d'un genre qu'un corps porte, et de ceux que le diagnostic y pose. */
function placesDesElements(d: DiagnosticForme, corps: readonly CorpsToit[], k: number, genre: 'cheminee' | 'lucarne'): number[] {
  const c = corps[k], r = c ? cadreCorps(c) : null;
  if (!c || !r) return [];
  const poses = d.elements.filter((e) => e.element === genre).flatMap((e) => { const v = e.observation.elementsDesMurs?.[0]; const p = v ? elementPoseSurLeMur(corps, v) : null; return p && p.corps === k ? [p] : []; });
  const s = (x: { x: number; y: number }) => versCadre(r, x).s;
  return genre === 'cheminee'
    ? [...(c.cheminees ?? []), ...poses.flatMap((p) => (p.cheminee ? [p.cheminee] : []))].map(s)
    : [...(c.lucarnes ?? []), ...poses.flatMap((p) => (p.lucarne ? [p.lucarne] : []))].map((l) => (l.debutM + l.finM) / 2);
}

/** Les cheminees et lucarnes d'un corps vrai contre celles du plan et du diagnostic (lot F7) : autant, chacune a un metre pres. */
function elementsContreLeVrai(d: DiagnosticForme, corps: readonly CorpsToit[], k: number, t: ToitVraiCorps): { texte: string; juste: boolean } | null {
  const lignes: string[] = [];
  let juste = true;
  for (const [genre, vrais, nom] of [['cheminee', t.cheminees, 'cheminée'], ['lucarne', t.lucarnes, 'lucarne']] as const) {
    const vues = placesDesElements(d, corps, k, genre);
    if (!vrais?.length && !vues.length) continue;
    const ok = vues.length === (vrais?.length ?? 0) && (vrais ?? []).every((v) => vues.some((x) => Math.abs(x - v.s) <= 1));
    juste &&= ok;
    lignes.push(`${pluriel(vrais?.length ?? 0, nom)} vraie${(vrais?.length ?? 0) > 1 ? 's' : ''}, ${vues.length} posée${vues.length > 1 ? 's' : ''} ou proposée${vues.length > 1 ? 's' : ''} : ${ok ? 'juste' : 'faux'}`);
  }
  return lignes.length ? { texte: lignes.join(', '), juste } : null;
}

/**
 * Les propositions contre la vraie forme du toit d'un cas (§7.3) : pour chaque corps de la verite, celui que designe son mur. Juste
 * quand ses pignons apres la proposition (ou tels quels, sans proposition) sont ceux de la verite : autant, et chacun recouvert a moitie
 * au moins par un pignon du meme pan (la place) ; l'ecart des bords est dit (la largeur que la photo ou Claude donnent est une estimation).
 */
function contreLeToitVrai(d: DiagnosticForme, corps: readonly CorpsToit[], vrai: readonly ToitVraiCorps[]): { texte: string; juste: boolean } {
  const lignes: { texte: string; juste: boolean }[] = [];
  for (const t of vrai) {
    const m = murDuCorps(corps, t.mur.gauche, t.mur.droite);
    const c = m ? corps[m.corps] : undefined;
    // Un corps vrai que le plan n'a pas (l'appentis d'une galerie sous le haut d'un corps plus haut) : la silhouette ne le montre pas.
    if (!m || !c) { lignes.push({ texte: `${t.nom} : absent du plan, non jugé (la silhouette de la façade ne le montre pas)`, juste: true }); continue; }
    const p = d.propositions.find((x) => x.corps === m.corps && (x.cote === 0 || x.cote === 2) === (m.cote === 0 || m.cote === 2));
    const apres = p?.pignons ?? c.pignons;
    const voulus = t.pignons ?? [];
    const apparies = voulus.map((v) => apres.find((a) => a.pan === v.pan && Math.min(a.fin, v.fin) - Math.max(a.debut, v.debut) >= 0.5 * (v.fin - v.debut)));
    const memes = apres.length === voulus.length && apparies.every(Boolean);
    const bords = voulus.flatMap((v, i) => { const a = apparies[i]; return a ? [Math.abs(a.debut - v.debut), Math.abs(a.fin - v.fin)] : []; });
    const ecart = bords.length ? `, bords à ${dec(Math.max(...bords))} m près` : '';
    const el = elementsContreLeVrai(d, corps, m.corps, t);
    lignes.push({ texte: `${t.nom} (corps ${m.corps + 1}) : ` + (p ? 'proposition ' + (memes ? 'juste' : 'fausse') : memes ? 'rien à proposer, juste' : 'proposition manquée') + ` (${pluriel(voulus.length, 'pignon')} vrai${voulus.length > 1 ? 's' : ''}${memes ? ecart : ''})` + (el ? ` ; ${el.texte}` : ''), juste: memes && (el?.juste ?? true) });
  }
  const juste = lignes.every((l) => l.juste);
  return { texte: 'Contre la vraie forme du toit : ' + lignes.map((l) => l.texte).join(' ; ') + (juste ? '.' : ' : faux.'), juste };
}

/**
 * E5 bis : le diagnostic de forme, corps par corps. Sans les corps du toit, rien ne se compare ; sans haut lu ni Claude, non plus. Des
 * propositions ou des alertes : a confirmer (le point de validation V2, toujours demande, decision 10) ; aucune : le toit calcule
 * explique la photo.
 */
export function etapeDiagnostic(toit: ToitDeLaFacade | null, hauteurM: number, lue: readonly { u: number; v: number }[] | null, ia: ObservationsFacade | null, objectifs: Partial<Objectifs> | undefined, vrai: readonly ToitVraiCorps[] | undefined): { etape: Etape; diagnostic: DiagnosticForme | null } {
  if (!toit?.corps.length) return { etape: { etat: 'saute', resume: 'Pas de corps du toit pour cette façade : le diagnostic se fait corps par corps, sur une façade de l’audit ou un cas qui porte ses corps.', verite: null }, diagnostic: null };
  const facade = facadeDuMur(toit.mur.gauche, toit.mur.droite, hauteurM);
  if (!facade) return { etape: { etat: 'saute', resume: 'Le mur de la façade est trop court pour un diagnostic.', verite: null }, diagnostic: null };
  const d = diagnostiquerForme({ facade, corps: toit.corps, hauteurMur: hauteurM, lue, ia, ...(objectifs ? { objectifs } : {}) });
  const troncons = d.troncons.map((t) => `${nomDuCorps(t.corps, t.cote)} de u ${dec(t.u0)} à ${dec(t.u1)}`).join(', ');
  const verite = vrai?.length ? contreLeToitVrai(d, toit.corps, vrai) : null;
  if (!d.lue && !ia) return { etape: { etat: 'saute', resume: `Tronçons : ${troncons}. Le haut du mur ne se lit pas et Claude n’a rien dit : rien à comparer au gabarit.` + (d.constats.length ? ' ' + d.constats.join(' ') : ''), verite }, diagnostic: d };
  const dits = [
    ...d.propositions.map((p) => 'Proposition (à confirmer) : ' + direPropositionForme(p) + '.'),
    ...d.elements.map((p) => 'Proposition (à confirmer) : ' + direPropositionElement(p) + '.'),
    ...d.alertes.map((a) => 'Alerte : ' + direAlerte(a) + '.'),
    ...d.constats,
  ];
  const ecart = d.ecart === null ? '' : ` Écart du gabarit au haut lu : ${dec(d.ecart)} hauteur d’égout.`;
  const rien = !d.propositions.length && !d.elements.length && !d.alertes.length;
  return {
    etape: { etat: rien ? 'ok' : 'a-confirmer', resume: `Tronçons : ${troncons}.` + ecart + (rien ? (d.lue ? ' Le toit calculé explique la photo : aucune proposition.' : ' Claude voit les pointes du plan : aucune proposition.') : '') + (dits.length ? ' ' + dits.join(' ') : ''), verite },
    diagnostic: d,
  };
}

/** E8 : ce que le toit attend des propositions. Rien ne s'ecrit ici : la personne coche, le moteur relit le corps concerne. */
export function etapeToit(d: DiagnosticForme | null): Etape {
  const n = (d?.propositions.length ?? 0) + (d?.elements.length ?? 0);
  if (!d || !n) return { etat: 'saute', resume: 'Aucune proposition de toit : le toit calculé reste, ses hauteurs aussi.', verite: null };
  const corps = [...new Set([...d.propositions, ...d.elements].map((p) => nomDuCorps(p.corps, p.cote)))].join(', ');
  return { etat: 'a-confirmer', resume: `${pluriel(n, 'proposition')} de toit à confirmer dans l’avant/après de l’audit (${corps}), décochée${n > 1 ? 's' : ''} : cochée, le moteur des toits la relit sur le corps concerné (corpsSousContrainte), les hauteurs du LiDAR restent ; une cheminée ou une lucarne s’y pose, ce qui est déjà posé ne bouge pas.`, verite: null };
}
