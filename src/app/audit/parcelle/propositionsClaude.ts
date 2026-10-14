// Les propositions de Claude (MD/spec-audit.md §13.2, §14 ; lot L17) : ce que le vote de ses trois
// passes (model/analyseClaude.ts) propose de changer dans le projet, dans la meme structure que les
// propositions des mesures (model/propositions.ts), source `claude`, avec ses indices (quelle image,
// ce qu'il y a vu) et sa confiance (la part des passes d'accord).
//
// Ce qui se propose, parce que le projet sait l'ecrire : la couverture, les cheminees, la toiture-
// terrasse, le materiau des murs (le parement lu sur les facades). La forme du toit, les lucarnes,
// les details des ouvertures restent des observations : les regles des toits (lots L19, L20) et les
// details du releve (lot L15) les ecriront. Les ecarts qu'il signale accompagnent les indices.
//
// Une proposition de Claude arrive decochee tant que son taux d'accord n'est pas mesure a 95 %
// (spec-regles-toits §14.2, point 5), ou quand elle contredit un indice LiDAR (point 4).

import { contradictionsLidar, indicesLidar, reserveClaude, voter, estReponseAnalyse, type AttributClaude, type IndiceAnalyse, type ReponseAnalyse, type Vote, type VoteAnalyse } from '../../../model/analyseClaude.js';
import { COUVERTURES_VUES, MATERIAUX_MURS_VUS, libelleDe, type SoucheVue } from '../../../model/ceQueJeVois.js';
import { textureDesMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import type { IndiceProposition, Proposition } from '../../../model/propositions.js';
import { corpsDesCheminees, corpsDeLaTerrasse, souchesSurLeCorps, terrasseVueSurLeCorps } from './propositions.js';
import type { EtiquetteImage } from '../../../model/auditParcelle.js';
import type { CouvertureChoisie, ObjetPlan } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

/** Les reponses lues pour un batiment, et les etiquettes des images qu'il a recues. */
export interface ReponsesBatiment {
  reponses: unknown[];
  etiquettes: EtiquetteImage[];
}

/** Le materiau de couverture de Claude dans le vocabulaire du projet ; null quand le projet n'a pas ce terme. */
export function couvertureDuVocabulaire(v: string): CouvertureChoisie | null {
  const table: Record<string, CouvertureChoisie> = { 'tuile-plate': 'tuile-plate', 'tuile-canal': 'tuile-canal', 'tuile-mecanique': 'tuile', ardoise: 'ardoise', zinc: 'zinc' };
  return table[v] ?? null;
}

const MATERIAUX: readonly string[] = MATERIAUX_MURS_VUS.map((m) => m.code);
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** Les indices d'un vote dans la forme des propositions : la phrase, et la photo quand l'image en etait une. */
export function indicesDe(indices: readonly IndiceAnalyse[], etiquettes: readonly EtiquetteImage[]): IndiceProposition[] {
  return indices.map((i) => {
    const e = etiquettes[i.image - 1];
    const ou = e ? (e.photo ? 'photo ' + (e.photo.rang + 1) + (e.photo.cote !== undefined ? ' de la façade' : ' du toit') : e.texte.split(',')[0] ?? '') : 'image ' + i.image;
    return { texte: i.vu + ' (' + ou + ')', ...(e?.photo ? { photo: e.photo } : {}) };
  });
}

type Base = Pick<Proposition, 'id' | 'cible' | 'objet' | 'avant' | 'apres' | 'effet'>;

/** Une proposition de Claude : source, indices, confiance (la part des passes d'accord) et sa reserve. */
function deClaude(base: Base, attribut: AttributClaude, vote: Vote<unknown>, etiquettes: readonly EtiquetteImage[], contradictions: readonly string[], remplaceChoix: string | null = null): Proposition {
  return { ...base, source: 'claude', indices: indicesDe(vote.indices, etiquettes), confiance: vote.accord, remplaceChoix, reserve: reserveClaude(attribut, vote, contradictions) };
}

function propositionCouverture(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const couverture = couvertureDuVocabulaire(v.couverture.valeur);
  if (!couverture || !o.toit || o.toit.couverture === couverture) return null;
  const choisie = o.toit.couverture;
  return deClaude({
    id: b.cle + ':claude:couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom,
    avant: choisie ? libelleDe(COUVERTURES_VUES, choisie) : 'déduite par Plan', apres: libelleDe(COUVERTURES_VUES, couverture) + ', vue par Claude',
    effet: { type: 'couverture', couverture },
  }, 'couverture', v.couverture, et, contra, choisie ? libelleDe(COUVERTURES_VUES, choisie).toLowerCase() : null);
}

function propositionCheminees(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const corps = o.corpsToit ?? [];
  const n = v.cheminees.valeur;
  if (typeof n !== 'number' || !corps.length) return null;
  const existantes = corps.flatMap((c) => c.cheminees ?? []);
  if (existantes.length === n) return null;
  const i = corpsDesCheminees(corps);
  const c = corps[i];
  if (!c) return null;
  const souches: SoucheVue[] = Array.from({ length: n }, (_, k) => {
    const s = v.souches[k];
    return { ...(s && s.position !== 'indetermine' ? { position: s.position } : {}), ...(s && s.materiau !== 'indetermine' ? { materiau: s.materiau } : {}) };
  });
  return deClaude({
    id: b.cle + ':claude:cheminees', cible: { type: 'batiment', cle: b.cle }, objet: 'Cheminées de ' + b.nom,
    avant: existantes.length ? pluriel(existantes.length, 'cheminée') : 'aucune cheminée',
    apres: (n ? pluriel(n, 'cheminée') : 'Aucune cheminée') + ', vue' + (n > 1 ? 's' : '') + ' par Claude',
    effet: { type: 'cheminees', corps: i, cheminees: souchesSurLeCorps(c, souches) },
  }, 'cheminees', v.cheminees, et, contra);
}

function propositionTerrasse(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (v.terrasse.valeur !== 'oui') return null;
  const i = corpsDeLaTerrasse(corps);
  const c = corps[i];
  if (!c) return null;
  const type = v.typeTerrasse.valeur;
  const vu = {
    ...(type === 'accessible' ? { accessible: true } : type === 'inaccessible' || type === 'technique' ? { accessible: false } : {}),
    ...(type === 'vegetalisee' ? { revetement: 'vegetalise' as const } : {}),
    ...(v.acrotere.valeur === 'oui' ? { acrotereM: 0.6 } : v.acrotere.valeur === 'non' ? { acrotereM: 0 } : {}),
    ...(typeof v.edicules.valeur === 'number' ? { edicules: v.edicules.valeur } : {}),
  };
  const t = c.terrasse;
  const detail = [type !== 'indetermine' && type !== 'sans-objet' ? type : null, v.acrotere.valeur === 'oui' ? 'acrotère' : null, typeof v.edicules.valeur === 'number' && v.edicules.valeur ? pluriel(v.edicules.valeur, 'édicule') : null].filter(Boolean).join(', ');
  return deClaude({
    id: b.cle + ':claude:terrasse', cible: { type: 'batiment', cle: b.cle }, objet: 'Toiture-terrasse de ' + b.nom,
    avant: t ? 'terrasse ' + (t.accessible ? 'accessible' : t.accessible === false ? 'inaccessible' : 'déjà décrite') : 'toit plat, sans détail',
    apres: 'Toiture-terrasse' + (detail ? ' ' + detail : '') + ', vue par Claude',
    effet: { type: 'terrasse', corps: i, terrasse: terrasseVueSurLeCorps(c, vu) },
  }, 'terrasse', v.terrasse, et, contra);
}

/** Le parement vu sur les facades : la valeur majoritaire parmi elles, portee par leur accord moyen. */
export function materiauDesFacades(v: VoteAnalyse): Vote<MateriauTexture> | null {
  const votes = v.facades.map((f) => f.materiau).filter((m) => m.valeur !== 'indetermine' && MATERIAUX.includes(m.valeur));
  if (!votes.length) return null;
  const comptes = new Map<string, Vote<MateriauTexture>[]>();
  for (const x of votes) comptes.set(x.valeur, [...(comptes.get(x.valeur) ?? []), x as Vote<MateriauTexture>]);
  const [valeur, liste] = [...comptes].sort((a, z) => z[1].length - a[1].length)[0] as [string, Vote<MateriauTexture>[]];
  if (liste.length * 2 <= votes.length && comptes.size > 1) return null;
  return { valeur: valeur as MateriauTexture, accord: Math.min(...liste.map((x) => x.accord)), indices: liste.flatMap((x) => x.indices) };
}

function propositionMateriau(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[]): Proposition | null {
  const m = materiauDesFacades(v);
  if (!m) return null;
  const actuel = textureDesMurs(o);
  if (actuel === m.valeur) return null;
  const choisi = o.couleurMurs?.materiau;
  const libelle = (x: MateriauTexture) => libelleDe(MATERIAUX_MURS_VUS, x);
  return deClaude({
    id: b.cle + ':claude:materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom,
    avant: actuel ? libelle(actuel) : 'non renseigné', apres: libelle(m.valeur) + ', vu par Claude sur ' + pluriel(v.facades.length, 'façade'),
    effet: { type: 'materiauMurs', materiau: m.valeur },
  }, 'materiauMurs', m, et, [], choisi ? libelle(choisi) : null);
}

/** Ce que Claude a releve sans que le projet sache l'ecrire : les ecarts, en clair, pour l'ecran et le fichier de l'audit. */
export function ecartsEnClair(v: VoteAnalyse): string[] {
  const out = v.ecarts.map((e) => e.sujet + ' : ' + e.observe + (e.modele ? ' (le modèle dit : ' + e.modele + ')' : ''));
  for (const f of v.facades) {
    const m = f.manquees.valeur, t = f.enTrop.valeur;
    if (typeof m === 'number' && m > 0) out.push('façade ' + f.facade + ' : ' + pluriel(m, 'ouverture') + ' non détectée' + (m > 1 ? 's' : '') + ' par Plan');
    if (typeof t === 'number' && t > 0) out.push('façade ' + f.facade + ' : ' + pluriel(t, 'ouverture') + ' détectée' + (t > 1 ? 's' : '') + ' en trop');
    out.push(...f.ecarts.map((e) => 'façade ' + f.facade + ' : ' + e));
  }
  return out;
}

/** Les propositions de Claude pour un batiment : vote des passes lues, controle croise, puis chaque attribut. */
export function propositionsClaudeDuBatiment(o: ObjetPlan, b: LigneBatiment, r: ReponsesBatiment): Proposition[] {
  const reponses = r.reponses.filter(estReponseAnalyse) as ReponseAnalyse[];
  if (!reponses.length) return [];
  const v = voter(reponses);
  const contra = [...contradictionsLidar(v, indicesLidar(o.toitMesure, o.corpsToit)), ...v.contradictions.map((c) => c.observation + ' (' + c.indiceLidar + ')')];
  const out: Proposition[] = [];
  for (const p of [propositionCouverture(o, b, v, r.etiquettes, contra), propositionCheminees(o, b, v, r.etiquettes, contra), propositionTerrasse(o, b, v, r.etiquettes, contra), propositionMateriau(o, b, v, r.etiquettes)]) if (p) out.push(p);
  return out;
}

/** Toutes les propositions de Claude, batiment par batiment, dans l'ordre de la liste de controle. */
export function propositionsDeClaude(objets: readonly ObjetPlan[], batiments: readonly LigneBatiment[], parBatiment: Record<string, ReponsesBatiment>): Proposition[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  return batiments.flatMap((b) => {
    const o = parCle.get(b.cle), r = parBatiment[b.cle];
    return o && r ? propositionsClaudeDuBatiment(o, b, r) : [];
  });
}
