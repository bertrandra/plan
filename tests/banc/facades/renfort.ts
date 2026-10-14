// Le renfort de Claude sur le banc de facades (MD/spec-facades-calage-detection.md §12 bis et §14,
// lot L18) : l'algorithme seul, puis avec des reponses de Claude **simulees**, enregistrees dans
// tests/fixtures/facades/claude/, pour mesurer ce que Plan fait des graines : combien de coins et de
// boites il recale sur l'image, combien il en rejette, et ce que cela change au rappel, a la
// precision et aux corrections.
//
// Les reponses simulees ne sont pas celles de Claude : elles imitent ses erreurs typiques, de facon
// deterministe (hachage de la graine de la scene), pour eprouver le recalage :
// - les coins a quelques dixiemes de repere de la verite (un repere vaut un dixieme de la photo) ;
// - les ouvertures manquees en boites a 10 a 20 cm pres sur chaque cote, une passe sur trois les
//   oubliant parfois ;
// - les fausses detections retirees (ombre, vehicule, vegetation), une passe hesitant parfois ;
// - une ouverture inventee dans deux passes sur trois dans un mur nu (le vote la garde, le recalage
//   doit la rejeter : aucune arete ne la soutient), une autre dans une seule passe (le vote l'ecarte).
// Les vraies reponses viendront du corpus des audits (lots L19 et L21) et prendront leur place.
//
// Le banc mesure, il ne regle pas : il appelle facade/renfort.ts et facade/renfortRecalage.ts tels
// qu'ils sont.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signauxRenfort, voterRenfort, versGrille, COINS_RENFORT, LIBELLES_SITUATION, type AvisOuverture, type BoiteManquee, type ReponseRenfort, type SituationRenfort } from '../../../src/facade/renfort.js';
import { appliquerRenfort, bilanVide, cartesAretes, grainesDeCoins, recalerCoins, type BilanRenfort } from '../../../src/facade/renfortRecalage.js';
import { detecterSegments } from '../../../src/facade/segments.js';
import { versOuvertureFacade } from '../../../src/facade/verification.js';
import type { OuvertureDetectee } from '../../../src/facade/detection.js';
import type { P2 } from '../../../src/facade/homographie.js';
import { hache, type OuvertureVraie, type SceneFacade } from './synthese.js';
import { apparier, erreurCoinsCm, mediane, mesurerDetection, recouvrement, type Boite, type MesureDetection } from './mesure.js';
import type { ResultatScene } from './banc.js';

export const DOSSIER_REPONSES = fileURLToPath(new URL('../../fixtures/facades/claude', import.meta.url));

/** Un fichier de reponses enregistre : les trois passes, et les ouvertures numerotees telles que Claude les a vues. */
export interface FichierReponses {
  nom: string;
  note: string;
  /** Les ouvertures que Plan avait numerotees (1 a n) quand les reponses ont ete enregistrees. */
  ouverturesPlan: Boite[];
  /** La taille de la photo de la grille de reperes. */
  photo: { largeur: number; hauteur: number };
  reponses: ReponseRenfort[];
}

export function chargerReponses(nom: string, dossier = DOSSIER_REPONSES): FichierReponses | null {
  const f = join(dossier, nom + '.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as FichierReponses) : null;
}

/* ---------------------------------------------------------------------------------------------
 * La simulation
 * ------------------------------------------------------------------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Un ecart de [-a, a], deterministe. */
const ecart = (a: number, graine: number, i: number, j: number) => (hache(graine, i, j) * 2 - 1) * a;

const SANS_DETAIL = { volets: 'indetermine', coffre: 'indetermine', balcon: 'indetermine', forme: 'indetermine' } as const;

function detailsVus(o: OuvertureVraie): Pick<AvisOuverture, 'volets' | 'coffre' | 'balcon' | 'forme'> {
  const v = o.rendu?.volets;
  if (!v) return { ...SANS_DETAIL, volets: 'aucun', forme: 'rectangulaire' };
  return { volets: v.type === 'battants' ? 'battants' : 'roulant', coffre: v.type === 'roulant' ? 'oui' : 'non', balcon: 'indetermine', forme: 'rectangulaire' };
}

/** La raison qu'un observateur donnerait d'une fausse detection, d'apres ce qui rend la scene difficile. */
function raisonDe(s: SceneFacade, b: Boite): AvisOuverture['raison'] {
  const d = s.difficultes;
  if (d.includes('voiture') && b.y < 0.3 && b.h < 1.8) return 'vehicule';
  if (d.some((x) => x.includes('haie'))) return 'vegetation';
  if (d.some((x) => x.includes('ombre'))) return 'ombre';
  if (d.includes('volets-battants')) return 'volet';
  return 'tache';
}

/** Un coin de mur nu, loin de toute ouverture vraie ou detectee : la ou une passe distraite inventerait une fenetre. */
function murNu(s: SceneFacade, occupees: readonly Boite[]): Boite | null {
  const { largeur, hauteur } = s.verite;
  for (let k = 0; k < 24; k++) {
    const b = { x: r1((largeur - 1.1) * hache(s.synthese.graine, k, 91)), y: r1(Math.max(0.9, (hauteur - 1.6) * hache(s.synthese.graine, k, 92))), l: 1.1, h: 1.2 };
    if (b.y + b.h > hauteur - 0.2) continue;
    const marge = { x: b.x - 0.4, y: b.y - 0.4, l: b.l + 0.8, h: b.h + 0.8 };
    if (occupees.every((o) => recouvrement(marge, o) === 0)) return b;
  }
  return null;
}

/**
 * Trois passes simulees pour une scene : `ouverturesPlan`, les ouvertures que Plan a numerotees
 * (chaine du releve) ; `coins`, les coins vrais sur la photo analysee, de `photo` pixels.
 */
export function simulerReponses(s: SceneFacade, ouverturesPlan: readonly OuvertureDetectee[], coins: readonly P2[], photo: { largeur: number; hauteur: number }): ReponseRenfort[] {
  const g = s.synthese.graine;
  const vraies = s.verite.ouvertures;
  const paires = apparier(vraies, ouverturesPlan);
  const vraieDe = new Map(paires.map(([i, j]) => [j, i]));
  const vues = new Set(paires.map(([i]) => i));
  const manquees = vraies.map((o, i) => ({ o, i })).filter((x) => !vues.has(x.i));
  const nu = murNu(s, [...vraies, ...ouverturesPlan]);
  const indice = (vu: string) => [{ image: 2, vu }];
  return [0, 1, 2].map((p) => {
    const coinsRep = COINS_RENFORT.map((_, k) => {
      const c = coins[k];
      // Une passe sur quatre scenes ne situe pas un coin : il est cache, ou hors cadre.
      if (!c || (p === 2 && k === g % 4 && g % 4 === 0)) return 'indetermine' as const;
      const r = versGrille(c, photo.largeur, photo.hauteur);
      return { colonne: r1(r.colonne + ecart(0.35, g, p * 4 + k, 1)), ligne: r1(r.ligne + ecart(0.35, g, p * 4 + k, 2)) };
    });
    const ouvertures: AvisOuverture[] = ouverturesPlan.map((b, j) => {
      const i = vraieDe.get(j);
      const v = i === undefined ? undefined : vraies[i];
      // Une passe hesite parfois : elle ne tranche pas.
      if (hache(g, j, 30 + p) < 0.12) return { indices: [], numero: j + 1, decision: 'indetermine', raison: 'sans-objet', type: 'indetermine', ...SANS_DETAIL };
      if (!v) return { indices: indice('pas une baie : ' + raisonDe(s, b)), numero: j + 1, decision: 'retirer', raison: raisonDe(s, b), type: 'indetermine', ...SANS_DETAIL };
      return { indices: indice(v.type + ' vue'), numero: j + 1, decision: 'garder', raison: 'sans-objet', type: v.type === b.type ? 'indetermine' : v.type, ...detailsVus(v) };
    });
    const boites: BoiteManquee[] = manquees.flatMap(({ o, i }) => {
      // Une passe sur trois oublie parfois une baie manquee ; le vote la garde si les deux autres la voient.
      if (hache(g, i, 40 + p) < 0.2 && p === i % 3) return [];
      const e = (k: number) => ecart(0.18, g, i * 10 + p, k);
      const x0 = o.x + e(1), x1 = o.x + o.l + e(2), y0 = Math.max(0, o.y + e(3)), y1 = o.y + o.h + e(4);
      return [{ indices: indice(o.type + ' non encadrée'), type: o.type, x: r2(x0), y: r2(y0), l: r2(x1 - x0), h: r2(y1 - y0) }];
    });
    // Une fenetre inventee : dans deux passes sur trois (une scene sur trois), ou dans une seule.
    if (nu && ((g % 3 === 0 && p < 2) || (g % 3 === 1 && p === 1))) boites.push({ indices: indice('fenêtre à volets fermés'), type: 'fenetre', x: r2(nu.x + ecart(0.1, g, p, 5)), y: r2(nu.y), l: nu.l, h: nu.h });
    return { mur: { indices: [{ image: 1, vu: 'le mur tracé' }], vu: 'attendu' }, coins: { indices: [{ image: 1, vu: 'égout et pied du mur' }], hautGauche: coinsRep[0] ?? 'indetermine', hautDroit: coinsRep[1] ?? 'indetermine', basDroit: coinsRep[2] ?? 'indetermine', basGauche: coinsRep[3] ?? 'indetermine' }, ouvertures, manquees: boites, confiance: 'moyenne' };
  });
}

/** Le fichier a enregistrer pour une scene rejouee ; null sans chaine du releve. */
export function fichierSimule(s: SceneFacade, r: ResultatScene): FichierReponses | null {
  const image = r.detail.image, coins = r.detail.coinsImage, ouv = r.detail.photo;
  if (!image || !coins || !ouv) return null;
  return {
    nom: s.nom,
    note: 'Réponses SIMULÉES (pas celles de Claude) : erreurs typiques imitées de façon déterministe, pour mesurer le recalage des graines. Écrites par .claude/skills/facades/scripts/simuler-claude.ts.',
    ouverturesPlan: ouv.map((o) => ({ x: o.x, y: o.y, l: o.l, h: o.h })),
    photo: { largeur: image.largeur, hauteur: image.hauteur },
    reponses: simulerReponses(s, ouv, coins, { largeur: image.largeur, hauteur: image.hauteur }),
  };
}

/* ---------------------------------------------------------------------------------------------
 * Le rejeu
 * ------------------------------------------------------------------------------------------- */

export interface RenfortScene {
  nom: string;
  signaux: SituationRenfort[];
  avant: MesureDetection;
  apres: MesureDetection;
  bilan: BilanRenfort;
  /** Parmi les boites ajoutees cochees, celles qui sont de vraies baies ; parmi les retirees, de vraies fausses. */
  pleinesJustes: number;
  pointilleJustes: number;
  retraitsJustes: number;
  /** Erreur des graines de coins (cm sur le mur), brutes puis recalees ; null : graine rejetee (le coin de l'algorithme reste). */
  coinsBrutsCm: (number | null)[];
  coinsRecalesCm: (number | null)[];
  ms: number;
}

/** Les avis des reponses renumerotes sur les ouvertures detectees aujourd'hui (la detection a pu changer depuis l'enregistrement). */
function renumeroter(f: FichierReponses, actuelles: readonly Boite[]): ReponseRenfort[] {
  const vers = new Map<number, number>();
  f.ouverturesPlan.forEach((b, i) => {
    let meilleur = -1, rec = 0.5;
    actuelles.forEach((a, j) => { const x = recouvrement(a, b); if (x > rec) { rec = x; meilleur = j; } });
    if (meilleur >= 0) vers.set(i + 1, meilleur + 1);
  });
  return f.reponses.map((r) => ({ ...r, ouvertures: r.ouvertures.flatMap((o) => { const n = vers.get(o.numero); return n ? [{ ...o, numero: n }] : []; }) }));
}

/** Rejoue le renfort sur une scene deja rejouee par le banc ; null sans reponses ou sans chaine du releve. */
export function rejouerRenfort(s: SceneFacade, r: ResultatScene, f: FichierReponses | null): RenfortScene | null {
  const t0 = performance.now();
  const d = r.detail, rel = d.releve;
  if (!f || !d.image || !d.coinsImage || !d.photo || !d.redressee || !rel || !r.photo) return null;
  const v = s.verite;
  const vote = voterRenfort(renumeroter(f, d.photo));
  const ouvertures = d.photo.map(versOuvertureFacade), decochees = rel.devinees.map(versOuvertureFacade);
  const fin = r.fin.releve;
  const signaux = signauxRenfort({
    calage: fin ? { note: fin.note, trouve: fin.trouve, sources: fin.sources } : null,
    ouvertures, devinees: decochees.length, largeurM: v.largeur,
  });
  const res = appliquerRenfort({ ouvertures, decochees, vote, cartes: cartesAretes(d.redressee, rel.pxParM), largeurM: v.largeur, hauteurM: rel.hauteur });
  // Ce qui est juste se juge sur la verite : une boite ajoutee qui recouvre une baie vraie a plus de 50 %.
  const vraie = (o: Boite) => v.ouvertures.some((x) => recouvrement(x, o) > 0.5);
  const claude = (os: readonly { source?: string }[]) => os.filter((o) => o.source === 'claude') as (Boite & { source?: string })[];
  // Les coins : graines du vote, puis recalees sur les segments de la photo analysee.
  const W = d.image.largeur, H = d.image.hauteur;
  const graines = grainesDeCoins(vote, W, H);
  const segments = fin && d.fin ? d.fin.detail.segments : detecterSegments(d.image);
  const repli = d.fin?.coins ?? d.coinsImage;
  const recales = recalerCoins(graines, segments, v.largeur, rel.hauteur, { largeur: W, hauteur: H }, repli);
  const erreurs = (pts: (P2 | null)[]) => {
    const e = erreurCoinsCm(pts.map((p, k) => p ?? (d.coinsImage as P2[])[k] as P2), d.coinsImage as P2[], v.largeur, v.hauteur);
    return pts.map((p, k) => (p ? (e[k] ?? null) : null));
  };
  return {
    nom: s.nom,
    signaux,
    avant: r.photo,
    apres: mesurerDetection(v.ouvertures, res.ouvertures),
    bilan: res.bilan,
    pleinesJustes: claude(res.ouvertures).filter(vraie).length,
    pointilleJustes: claude(res.decochees).filter(vraie).length,
    retraitsJustes: res.retirees.filter((o) => !vraie(o)).length,
    coinsBrutsCm: erreurs(graines),
    coinsRecalesCm: erreurs(recales.map((c) => c?.point ?? null)),
    ms: Math.round(performance.now() - t0),
  };
}

/* ---------------------------------------------------------------------------------------------
 * Le tableau
 * ------------------------------------------------------------------------------------------- */

const pc = (x: number | null) => (x === null ? '—' : Math.round(x * 100) + ' %');
const cmT = (x: number | null) => (x === null ? '—' : (Math.round(x * 10) / 10).toLocaleString('fr-FR'));
const fleche = (a: string, b: string) => (a === b ? b : `${a} → ${b}`);

/** Le bilan de toutes les scenes. */
export function syntheseRenfort(rs: readonly RenfortScene[]) {
  const somme = (f: (x: BilanRenfort) => number) => rs.reduce((n, x) => n + f(x.bilan), 0);
  const avant = { vraies: 0, trouvees: 0, vp: 0, corrections: 0 }, apres = { vraies: 0, trouvees: 0, vp: 0, corrections: 0 };
  for (const x of rs) for (const [a, m] of [[avant, x.avant], [apres, x.apres]] as const) { a.vraies += m.vraies; a.trouvees += m.trouvees; a.vp += m.vp; a.corrections += m.corrections; }
  const bruts = rs.flatMap((x) => x.coinsBrutsCm.filter((c): c is number => c !== null && Number.isFinite(c)));
  const recales = rs.flatMap((x) => x.coinsRecalesCm.filter((c): c is number => c !== null && Number.isFinite(c)));
  const bilan = bilanVide();
  for (const k of Object.keys(bilan) as (keyof BilanRenfort)[]) bilan[k] = somme((b) => b[k]);
  return {
    scenes: rs.length, bilan,
    pleinesJustes: rs.reduce((n, x) => n + x.pleinesJustes, 0), pointilleJustes: rs.reduce((n, x) => n + x.pointilleJustes, 0), retraitsJustes: rs.reduce((n, x) => n + x.retraitsJustes, 0),
    rappel: [avant.vraies ? avant.vp / avant.vraies : null, apres.vraies ? apres.vp / apres.vraies : null] as const,
    precision: [avant.trouvees ? avant.vp / avant.trouvees : null, apres.trouvees ? apres.vp / apres.trouvees : null] as const,
    corrections: [rs.length ? avant.corrections / rs.length : 0, rs.length ? apres.corrections / rs.length : 0] as const,
    coins: { graines: bruts.length, brutsMedianeCm: mediane(bruts), recales: recales.length, recalesMedianeCm: mediane(recales), justesBruts: bruts.filter((c) => c <= 10).length, justesRecales: recales.filter((c) => c <= 10).length },
    parSituation: (Object.keys(LIBELLES_SITUATION) as SituationRenfort[]).map((sit) => ({ sit, scenes: rs.filter((x) => x.signaux.includes(sit)).map((x) => x.nom) })).filter((x) => x.scenes.length),
  };
}

/** La section du tableau du banc ; vide sans scene rejouee. */
export function tableauRenfort(rs: readonly RenfortScene[]): string {
  if (!rs.length) return '';
  const l: string[] = [];
  l.push('### Renfort de Claude (lot L18 : graines recalées sur l’image, réponses simulées)', '');
  l.push(
    "Algorithme seul (chaîne du relevé, coins vrais), puis avec les trois passes **simulées** de `tests/fixtures/facades/claude/` (erreurs typiques imitées, pas de vraies réponses), votées puis appliquées par `appliquerRenfort`. Signaux : ce qui appellerait Claude hors des premiers audits. Boîtes : graines votées → ajoutées cochées (dont vraies) / en pointillé (dont vraies) / baies devinées confirmées / rejetées (déjà proposées, ou que rien ne soutient). Retirées : fausses détections écartées (dont vraiment fausses). Coins : erreur des graines en cm sur le mur, brute puis recalée sur les segments (« r » : graine rejetée, le coin de l'algorithme reste).",
    '',
  );
  l.push('| Façade | Signaux | Rappel | Précision | Corrections | Boîtes | Retirées | Types | Coins bruts (cm) | Coins recalés (cm) |', '|---|---|---|---|---|---|--:|--:|---|---|');
  const coin = (c: number | null) => (c === null ? 'r' : Number.isFinite(c) ? String(Math.round(c)) : '∞');
  for (const x of rs) {
    const b = x.bilan;
    l.push(`| ${x.nom} | ${x.signaux.length ? x.signaux.join(', ') : '—'} | ${fleche(pc(x.avant.rappel), pc(x.apres.rappel))} | ${fleche(pc(x.avant.precision), pc(x.apres.precision))} | ${fleche(String(x.avant.corrections), String(x.apres.corrections))} | ${b.graines} → ${b.pleines} (${x.pleinesJustes}) / ${b.pointille} (${x.pointilleJustes}) / ${b.confirmees} / ${b.rejetees} | ${b.retirees} (${x.retraitsJustes}) | ${b.typesCorriges} | ${x.coinsBrutsCm.map(coin).join(', ')} | ${x.coinsRecalesCm.map(coin).join(', ')} |`);
  }
  const s = syntheseRenfort(rs);
  const b = s.bilan;
  l.push(`| **Ensemble** (${s.scenes}) | | **${fleche(pc(s.rappel[0]), pc(s.rappel[1]))}** | **${fleche(pc(s.precision[0]), pc(s.precision[1]))}** | **${fleche(cmT(s.corrections[0]), cmT(s.corrections[1]))}** / façade | ${b.graines} → ${b.pleines} (${s.pleinesJustes}) / ${b.pointille} (${s.pointilleJustes}) / ${b.confirmees} / ${b.rejetees} | ${b.retirees} (${s.retraitsJustes}) | ${b.typesCorriges} | médiane **${cmT(s.coins.brutsMedianeCm)}** (${s.coins.justesBruts}/${s.coins.graines} ≤ 10 cm) | médiane **${cmT(s.coins.recalesMedianeCm)}** (${s.coins.recales}/${s.coins.graines} recalés, ${s.coins.justesRecales} ≤ 10 cm) |`, '');
  l.push('Signaux levés par situation : ' + (s.parSituation.length ? s.parSituation.map((x) => `${LIBELLES_SITUATION[x.sit]} (${x.scenes.length})`).join(', ') : 'aucun') + '.', '');
  return l.join('\n');
}
