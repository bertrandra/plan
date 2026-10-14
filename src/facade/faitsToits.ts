// Un fait applique au toit d'un batiment (MD/spec-regles-toits.md §5, §9.1).
//
// Le calcul propose, les regles arbitrent, puis le fait du batiment (model/faitsToits.ts) :
// - en **contrainte**, il restreint les candidats : le corps principal (le plus grand) qui ne dit pas
//   ce que vous avez vu est relu sur la mesure avec les seules formes admises, dans le seul sens de
//   faitage admis ; la mesure donne toujours les hauteurs. Un corps deja d'accord ne bouge pas : un
//   fait juste ne change rien a un calcul juste. Les garde-fous de vraisemblance passent ensuite.
// - en **remplacement**, il donne tout : un corps sur la boite orientee du contour, aux dimensions du
//   fait, sans garde-fou (la mesure est absente ou trompeuse, c'est la raison du remplacement).
//
// Ce qui ne s'impose pas (un nombre de corps minimum, une hauteur hors de la mesure) est dit par
// `ecartsAuFait`, pour le skill regles-toits et les tests : un fait n'est jamais tordu en silence.

import { boiteOrientee, completerSurContour, corpsImpose, detecterPignons, ecartAuCorps, rectangleTourne, repere, type Grille } from './toitCorps.js';
import { diagnostiquerToit, type EchantillonHauteur, type ToitAjuste } from './toitLidar.js';
import { signedArea } from '../geometry/basic.js';
import type { BoutFait, FaitToit, ObservationFait } from '../model/faitsToits.js';
import type { CorpsToit, FormeToit, FormeToitSimple, PtBrut, Toit, ToitMesure } from '../model/types.js';
import { SEUILS_TOITS as S } from '../model/reglagesToits.js';

/** Les formes d'un corps : les croupes et le quatre-pans n'y font qu'un (des croupes aux deux bouts). */
export type FormeCorps = 'plat' | 'appentis' | 'deux-pans' | 'croupes';

/** Un sens de faitage observe se lit a cela pres, sauf si le fait dit sa tolerance (spec §7.1). */
export const TOLERANCE_SENS_DEG = 15;

const cm = (v: number) => Math.round(v * 100) / 100;
const dixieme = (v: number) => Math.round(v * 10) / 10;
const aire = (pts: readonly PtBrut[]) => Math.abs(signedArea(pts as PtBrut[]));

/** L'azimut d'une direction du plan (Y vers le nord) : 0 = nord, sens horaire, modulo 180. */
export function azimutDe(dx: number, dy: number): number {
  const a = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
}

/** L'ecart entre deux directions, modulo 180, en degres. */
const ecartDirections = (a: number, b: number): number => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };

/** L'azimut du faitage d'un corps (`pts[0] -> pts[1]`). */
export function azimutFaitage(c: Pick<CorpsToit, 'pts'>): number {
  const [a, b] = c.pts as [PtBrut, PtBrut];
  return azimutDe(b.x - a.x, b.y - a.y);
}

/** La forme d'un corps, dans le vocabulaire des faits. */
export function formeDuCorps(c: CorpsToit): FormeCorps {
  const W = repere(c.pts).W;
  if (c.faitage - Math.min(...c.egouts) < S.HAUTEUR_PLAT_M) return 'plat';
  if (c.posFaitage <= 0.01 || c.posFaitage >= W - 0.01) return 'appentis';
  return c.croupes?.some((h) => h > 0) ? 'croupes' : 'deux-pans';
}

/** Ce qui ferme les deux bouts d'un corps, au bout `s = 0` puis `s = L`. */
export const boutsDuCorps = (c: CorpsToit): [BoutFait, BoutFait] => [(c.croupes?.[0] ?? 0) > 0 ? 'croupe' : 'pignon', (c.croupes?.[1] ?? 0) > 0 ? 'croupe' : 'pignon'];
const memesBouts = (a: readonly BoutFait[], b: readonly BoutFait[]) => [...a].sort().join() === [...b].sort().join();

/**
 * Les formes de corps qu'admet l'observation. Les bouts en retirent (deux pignons : pas de croupe),
 * et un sens de faitage observe retire le plat : un toit plat n'a pas de faitage a voir.
 */
export function formesAdmises(o: ObservationFait): Set<FormeCorps> {
  const vers = (f: FormeToitSimple): FormeCorps => (f === 'quatre-pans' ? 'croupes' : f);
  let formes = new Set<FormeCorps>(o.forme ? o.forme.map(vers) : ['plat', 'appentis', 'deux-pans', 'croupes']);
  if (o.faitage) formes.delete('plat');
  if (o.bouts) {
    const avecCroupe = o.bouts.includes('croupe');
    formes = new Set([...formes].filter((f) => (avecCroupe ? f === 'croupes' : f === 'deux-pans')));
  }
  return formes;
}

/** L'azimut du faitage que demande l'observation, ou null quand elle n'en dit rien. */
function azimutVoulu(o: ObservationFait, contour: readonly PtBrut[]): number | null {
  if (!o.faitage) return null;
  if (o.faitage.par === 'azimut') return ((o.faitage.azimutDeg % 180) + 180) % 180;
  const b = boiteOrientee(contour);
  const [p0, p1, , p3] = b as [PtBrut, PtBrut, PtBrut, PtBrut];
  const long = Math.hypot(p1.x - p0.x, p1.y - p0.y) >= Math.hypot(p3.x - p0.x, p3.y - p0.y) ? azimutDe(p1.x - p0.x, p1.y - p0.y) : azimutDe(p3.x - p0.x, p3.y - p0.y);
  return o.faitage.sens === 'parallele' ? long : (long + 90) % 180;
}

/** Le faitage d'azimut `az` est-il dans le sens observe ? Toujours, quand l'observation n'en dit rien. */
function sensAdmis(o: ObservationFait, contour: readonly PtBrut[], az: number): boolean {
  const voulu = azimutVoulu(o, contour);
  return voulu === null || ecartDirections(az, voulu) <= (o.faitage?.toleranceDeg ?? TOLERANCE_SENS_DEG);
}

const dans = (v: number, f: { min?: number; max?: number } | undefined) => !f || ((f.min === undefined || v >= f.min - 1e-9) && (f.max === undefined || v <= f.max + 1e-9));

/** Le corps dit-il ce que vous avez vu ? La forme, les bouts, le sens du faitage (sans objet pour un plat), les hauteurs. */
export function corpsConforme(c: CorpsToit, o: ObservationFait, contour: readonly PtBrut[]): boolean {
  const forme = formeDuCorps(c);
  if (!formesAdmises(o).has(forme)) return false;
  if (o.bouts && !memesBouts(boutsDuCorps(c), o.bouts)) return false;
  if (forme !== 'plat' && !sensAdmis(o, contour, azimutFaitage(c))) return false;
  return dans(Math.min(...c.egouts), o.egout) && dans(c.faitage, o.faitageM);
}

/** Le meilleur deux-pans du rectangle, faitage a PAN_MIN_M des murs au moins, par l'ecart de son profil. */
function meilleurDeuxPans(m: ToitMesure, pts: readonly PtBrut[], contour: readonly PtBrut[]): CorpsToit | null {
  const W = repere(pts).W;
  let best: CorpsToit | null = null;
  for (let p = S.PAN_MIN_M; p <= W - S.PAN_MIN_M + 1e-6; p += S.PAS_FAITAGE_M) {
    const c = corpsImpose(m, pts, contour, p);
    if (c && (!best || c.ecart < best.ecart - 1e-6)) best = c;
  }
  return best;
}

/** Les corps candidats d'un rectangle, dans un sens de faitage, pour les formes admises. */
function candidatsDuSens(m: ToitMesure, pts: readonly PtBrut[], contour: readonly PtBrut[], formes: ReadonlySet<FormeCorps>, o: ObservationFait): CorpsToit[] {
  const r = repere(pts);
  const out: CorpsToit[] = [];
  if (formes.has('appentis')) for (const p of [0, r.W]) { const c = corpsImpose(m, pts, contour, p); if (c) out.push(c); }
  if (!formes.has('deux-pans') && !formes.has('croupes')) return out;
  const deux = meilleurDeuxPans(m, pts, contour);
  if (!deux) return out;
  if (formes.has('deux-pans')) out.push({ ...deux, pignons: detecterPignons(m, deux, contour) });
  // Des croupes sur la longueur seulement : sur la largeur, elles se croiseraient.
  if (formes.has('croupes') && r.L >= r.W - 0.01) {
    const h = cm(r.W / 2);
    const jeux: [number, number][] = o.bouts && o.bouts[0] !== o.bouts[1] ? [[h, 0], [0, h]] : [[h, h]];
    for (const croupes of jeux) out.push({ ...deux, croupes });
  }
  return out;
}

/**
 * Le corps du rectangle `rect` que l'observation admet et qui explique le mieux la mesure (ecart
 * symetrique, `ecartAuCorps`), dans les deux sens de faitage. Les fourchettes de hauteur trient les
 * candidats quand l'un d'eux les tient ; sinon la mesure decide seule. Null sans candidat qui ait la
 * forme observee : un fait ne fabrique pas un toit que la mesure ne lit pas.
 */
export function meilleurCorpsSelonObservation(m: ToitMesure, rect: readonly PtBrut[], contour: readonly PtBrut[], o: ObservationFait): CorpsToit | null {
  const formes = formesAdmises(o);
  const candidats: CorpsToit[] = [];
  if (formes.has('plat')) { const c = corpsImpose(m, rect, contour, 'plat'); if (c) candidats.push(c); }
  for (const pts of [[...rect], rectangleTourne(rect)]) {
    if (!sensAdmis(o, contour, azimutFaitage({ pts }))) continue;
    candidats.push(...candidatsDuSens(m, pts, contour, formes, o));
  }
  // Un appentis qui ne monte pas est un plat, un deux-pans ecrase aussi : seuls restent les candidats
  // qui ont vraiment la forme observee.
  const admis = candidats.filter((c) => formes.has(formeDuCorps(c)));
  const tenus = admis.filter((c) => dans(Math.min(...c.egouts), o.egout) && dans(c.faitage, o.faitageM));
  const notes = (tenus.length ? tenus : admis).map((c) => ({ c, e: ecartAuCorps(m, c, contour) })).sort((a, b) => a.e - b.e);
  const best = notes[0];
  return best && Number.isFinite(best.e) ? { ...best.c, ecart: cm(best.e) } : null;
}

/** Le contour est-il presque sa boite orientee ? Un seul corps la couvre alors sans deborder. */
const presqueRectangle = (contour: readonly PtBrut[]) => aire(boiteOrientee(contour)) <= 1.1 * aire(contour);

/** Le rang du plus grand corps : c'est lui que l'observation decrit (la forme du batiment). */
export const plusGrand = (corps: readonly CorpsToit[]) => corps.reduce((k, c, i) => (aire(c.pts) > aire((corps[k] as CorpsToit).pts) ? i : k), 0);

/**
 * Les corps sous un fait en contrainte (spec §5). `corps` : ce que le calcul a reconstruit (null : il
 * n'a rien trouve, et le fait peut encore lire un corps sur la boite d'un contour presque
 * rectangulaire). Un nombre de corps au plus est tenu : un seul corps sur un contour rectangulaire,
 * sinon les plus grands, etendus sur le contour ; un nombre au moins ne se fabrique pas.
 */
export function corpsSousContrainte(f: FaitToit, corps: CorpsToit[] | null, m: ToitMesure, contour: readonly PtBrut[], grille: Grille | null = null): CorpsToit[] | null {
  const o = f.observation;
  const max = o.corps?.max;
  if ((!corps?.length || (max === 1 && corps.length > 1)) && presqueRectangle(contour)) {
    const c = meilleurCorpsSelonObservation(m, boiteOrientee(contour), contour, o);
    if (c) return [c];
  }
  if (!corps?.length) return corps;
  let out = [...corps];
  if (max !== undefined && out.length > max) {
    out = out.map((c) => ({ c, a: aire(c.pts) })).sort((a, b) => b.a - a.a).slice(0, max).map((x) => x.c);
    out = completerSurContour(out, contour, grille ?? m);
  }
  const k = plusGrand(out);
  const principal = out[k] as CorpsToit;
  if (!corpsConforme(principal, o, contour)) {
    const c = meilleurCorpsSelonObservation(m, principal.pts, contour, o);
    if (c) out[k] = c;
  }
  return out;
}

/**
 * Le corps d'un fait en remplacement : un seul, sur la boite orientee du contour (le dessin le
 * decoupe sur un contour de biais), le faitage dans le sens observe (le long cote sans indication),
 * aux hauteurs du fait. Un appentis monte vers `hautVersDeg`, vers `pts[3]` sans indication.
 */
export function corpsDeRemplacement(f: FaitToit, contour: readonly PtBrut[]): CorpsToit[] | null {
  const d = f.dimensions;
  const forme = formesAdmises(f.observation.forme ? { forme: f.observation.forme } : {}).values().next().value as FormeCorps | undefined;
  if (!d || !forme || contour.length < 3) return null;
  const boite = boiteOrientee(contour);
  const sens = [boite, rectangleTourne(boite)].map((pts) => ({ pts, r: repere(pts) }));
  const voulu = azimutVoulu(f.observation, contour);
  const choix = voulu !== null
    ? sens.sort((a, b) => ecartDirections(azimutFaitage(a), voulu) - ecartDirections(azimutFaitage(b), voulu))[0]
    : sens.sort((a, b) => b.r.L - a.r.L)[0];
  if (!choix) return null;
  const { pts, r } = choix;
  const E = dixieme(d.egoutM), F = dixieme(d.faitageM ?? d.egoutM);
  const base = { pts, pignons: [], ecart: 0 };
  if (forme === 'plat') return [{ ...base, posFaitage: cm(r.W / 2), faitage: E, egouts: [E, E] }];
  if (forme === 'appentis') {
    const versT = d.hautVersDeg === undefined || r.v.x * Math.sin((d.hautVersDeg * Math.PI) / 180) + r.v.y * Math.cos((d.hautVersDeg * Math.PI) / 180) >= 0;
    return [versT ? { ...base, posFaitage: cm(r.W), faitage: F, egouts: [E, F] } : { ...base, posFaitage: 0, faitage: F, egouts: [F, E] }];
  }
  const c: CorpsToit = { ...base, posFaitage: cm(r.W / 2), faitage: F, egouts: [E, E] };
  if (forme === 'deux-pans') return [c];
  const h = cm(r.W / 2), b = f.observation.bouts;
  return [{ ...c, croupes: b ? [b[0] === 'croupe' ? h : 0, b[1] === 'croupe' ? h : 0] : [h, h] }];
}

/** La forme simple d'un batiment en remplacement : celle de son corps, a son azimut. */
export function toitDeRemplacement(f: FaitToit, contour: readonly PtBrut[]): { toit: Toit; egout: number } | null {
  const c = corpsDeRemplacement(f, contour)?.[0];
  if (!c) return null;
  const forme = formeDuCorps(c);
  // L'angle d'un Toit se compte depuis l'est, sens trigonometrique ; l'azimut, depuis le nord, sens horaire.
  const angle = ((90 - azimutFaitage(c)) % 180 + 180) % 180;
  const bas = Math.min(...c.egouts);
  return { toit: { forme: forme === 'croupes' ? 'croupes' : forme, hauteur: cm(c.faitage - bas), angleFaitage: Math.round(angle), source: 'lidar' }, egout: bas };
}

/**
 * La forme simple sous un fait en contrainte : celle que l'ajustement a lue si l'observation l'admet,
 * sinon la meilleure des formes essayees qui l'admet (forme, sens), sous l'ecart admis. Rend
 * l'ajustement d'origine quand aucune ne convient : un fait ne fabrique pas un toit que la mesure ne
 * lit pas.
 */
export function ajusteSousContrainte(f: FaitToit, pts: readonly PtBrut[], ech: readonly EchantillonHauteur[], ajuste: ToitAjuste | null): ToitAjuste | null {
  const o = f.observation;
  const formes = formesAdmises(o);
  // Une forme du catalogue n'est jamais admise : le fait ne parle que des formes simples.
  const vers = (forme: FormeToit): string => (forme === 'quatre-pans' ? 'croupes' : forme);
  const azimut = (angle: number) => ((90 - angle) % 180 + 180) % 180;
  const admis = (forme: FormeToit, angle: number) => (formes as ReadonlySet<string>).has(vers(forme)) && (forme === 'plat' || sensAdmis(o, pts, azimut(angle)));
  if (ajuste && admis(ajuste.toit.forme, ajuste.toit.angleFaitage)) return ajuste;
  const essai = diagnostiquerToit(pts, ech).filter((x) => x.ecart <= S.ECART_MAX_M && admis(x.forme, x.angleFaitage)).sort((a, b) => a.ecart - b.ecart)[0];
  if (!essai) return ajuste;
  const plat = essai.forme === 'plat';
  return { toit: { forme: essai.forme, hauteur: plat ? 0 : essai.H, angleFaitage: plat ? 0 : essai.angleFaitage, source: 'lidar' }, egout: essai.e, ecart: essai.ecart, echantillons: essai.gardes };
}

/**
 * Ce que les corps ne disent pas encore du fait, en mots courts (vide : le fait est tenu). Pour le
 * skill et les tests : un nombre de corps hors de la fourchette, un corps principal qui n'a pas la
 * forme, les bouts, le sens ou les hauteurs observes.
 */
export function ecartsAuFait(f: FaitToit, corps: readonly CorpsToit[] | null, contour: readonly PtBrut[]): string[] {
  const o = f.observation;
  const n = corps?.length ?? 0;
  const out: string[] = [];
  if ((o.corps?.min !== undefined && n < o.corps.min) || (o.corps?.max !== undefined && n > o.corps.max)) out.push('corps : ' + n);
  if (!corps?.length) return [...out, 'aucun corps'];
  const c = corps[plusGrand(corps)] as CorpsToit;
  const forme = formeDuCorps(c);
  if (!formesAdmises(o).has(forme)) out.push('forme : ' + forme);
  if (o.bouts && !memesBouts(boutsDuCorps(c), o.bouts)) out.push('bouts : ' + boutsDuCorps(c).join('+'));
  if (forme !== 'plat' && !sensAdmis(o, contour, azimutFaitage(c))) out.push('faitage : azimut ' + Math.round(azimutFaitage(c)));
  if (!dans(Math.min(...c.egouts), o.egout)) out.push('egout : ' + Math.min(...c.egouts));
  if (!dans(c.faitage, o.faitageM)) out.push('faitage : ' + c.faitage + ' m');
  return out;
}

/** Les corps lus, sous le fait du batiment quand il est en contrainte ; tels quels sinon (pas de fait, ou un remplacement traite a part). */
export function corpsSelonFait(f: FaitToit | null, lus: CorpsToit[] | null, m: ToitMesure, contour: readonly PtBrut[], grille: Grille | null = null): CorpsToit[] | null {
  return f?.application === 'contrainte' ? corpsSousContrainte(f, lus, m, contour, grille) : lus;
}

/** La forme simple ajustee, sous le fait du batiment quand il est en contrainte. */
export function ajusteSelonFait(f: FaitToit | null, pts: readonly PtBrut[], ech: readonly EchantillonHauteur[], brut: ToitAjuste | null): ToitAjuste | null {
  return f?.application === 'contrainte' ? ajusteSousContrainte(f, pts, ech, brut) : brut;
}
