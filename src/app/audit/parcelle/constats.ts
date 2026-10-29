// Les constats d'un batiment, source par source (MD/spec-reconciliation.md §2, lot R3) : ce que l'IGN, le LiDAR, la photo
// d'une facade, Claude et la personne qui a vu disent de ses attributs, dans les memes mots, pour que le moteur d'arbitrage
// (facade/regles/reconciliation.ts) les compare. Rien n'est ecrit ici : un constat est une lecture, avec sa confiance et la
// regle qui l'a produite.
//
// `projet` n'est pas une source : c'est la valeur que le projet a aujourd'hui, et si une personne l'a choisie a la main (un veto).

import { nomFacade } from '../../../geometry/cotesVusDeDehors.js';
import { formeDesCorps } from '../../../model/formeToit.js';
import { textureDesMurs } from '../../../model/couleurMur.js';
import { hauteurDe } from '../../../regles/decisions.js';
import { azimutFaitage, boutsDuCorps, formeDuCorps } from '../../../facade/regles/toits/faits.js';
import { libelleSilhouette, type BoutVu, type SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { type LigneBatiment } from './liste.js';
import { REGLES_LIDAR } from './reglesLidar.js';
import { arbitrerTout, type Arbitrage, type ChoixArbitrage, type Constat, type EtatProjet } from '../../../facade/regles/reconciliation.js';
import { RECONCILIATION, type ReglesReconciliation } from '../../../regles/reconciliation.js';
import type { IdAttribut } from '../../../regles/reconciliation.js';
import type { ObjetPlan } from '../../../model/types.js';
import { ecrivainPeut } from '../../../model/protections.js';
import { cibleFacade, indiceDeCorps, formeArbitree, cm, principal, toitChoisiALaMain, type EntreesConstats, type ConstatsBatiment } from './constats/cibles.js';
import { constatsIgn, constatsLidar } from './constats/mesures.js';
import { type GroupeDeMurs, groupesDeMurs, bouts, constatsDesSilhouettes, constatsPhoto, constatsAccords, constatsClaude, constatsTerrain } from './constats/vus.js';

export { cibleBatiment, cibleFacade, cibleCorps, indiceDeCorps, formeArbitree, formeDesBouts, confianceCorps, toitChoisiALaMain, releveChoisiALaMain, type EntreesConstats, type ConstatsBatiment } from './constats/cibles.js';

export { groupesDeMurs, type GroupeDeMurs } from './constats/vus.js';

function etatDuProjet(o: ObjetPlan): (cible: string, attribut: IdAttribut) => EtatProjet {
  const c = principal(o.batiment?.corpsToit);
  const vide: EtatProjet = { valeur: null, choisi: false };
  return (cible, attribut) => {
    // Un corps autre que le principal : sa forme, ses bouts, son sens.
    const k = indiceDeCorps(cible);
    if (k !== null) {
      const ck = o.batiment?.corpsToit?.[k];
      if (!ck) return vide;
      if (attribut === 'formeToit') return { valeur: formeArbitree(formeDuCorps(ck)), choisi: toitChoisiALaMain(o) };
      if (attribut === 'boutsToit') return { valeur: boutsDuCorps(ck), choisi: false };
      if (attribut === 'sensFaitage') return { valeur: cm(azimutFaitage(ck)), choisi: false };
      return vide;
    }
    switch (attribut) {
      case 'hauteurEgout': return { valeur: cm(hauteurDe(o)), choisi: !ecrivainPeut(o, 'audit', 'hauteur') };
      case 'hauteurTotale': return { valeur: c ? cm(c.faitage) : o.batiment?.toit ? cm(hauteurDe(o) + o.batiment?.toit.hauteur) : null, choisi: false };
      case 'formeToit': { const f = formeDesCorps(o.batiment?.corpsToit) ?? o.batiment?.toit?.forme; return { valeur: f ? formeArbitree(f) : null, choisi: toitChoisiALaMain(o) }; }
      case 'boutsToit': return { valeur: c ? boutsDuCorps(c) : null, choisi: false };
      case 'sensFaitage': return { valeur: c ? cm(azimutFaitage(c)) : null, choisi: false };
      case 'cheminees': return { valeur: (o.batiment?.corpsToit ?? []).reduce((n, k) => n + (k.cheminees?.length ?? 0), 0), choisi: !ecrivainPeut(o, 'audit', 'elements') };
      case 'ouverturesFacade': { const f = (o.batiment?.facades ?? []).find((r) => cibleFacade(o.key, r.cote) === cible); return { valeur: f && !f.depuisAudit ? f.ouvertures.length : null, choisi: !!f && !ecrivainPeut(o, 'audit', 'facades', { cote: f.cote }) }; }
      case 'appentis': {
        const ap = (o.batiment?.corpsToit ?? []).filter((k) => formeDuCorps(k) === 'appentis');
        const etats = new Set(ap.map((k) => k.ouvert));
        return { valeur: etats.size === 1 && ap[0]?.ouvert !== undefined ? (ap[0].ouvert ? 'ouvert' : 'ferme') : null, choisi: !ecrivainPeut(o, 'audit', 'elements') };
      }
      case 'lucarnes': return { valeur: (o.batiment?.corpsToit ?? []).reduce((n, k) => n + (k.lucarnes?.length ?? 0), 0), choisi: !ecrivainPeut(o, 'audit', 'elements') };
      case 'materiauMurs': return { valeur: textureDesMurs(o), choisi: !ecrivainPeut(o, 'audit', 'murs') };
      case 'couverture': return { valeur: o.batiment?.toit?.couverture ?? null, choisi: !ecrivainPeut(o, 'audit', 'couverture') };
      default: return vide;
    }
  };
}

/** Les regles de la vue d'ensemble de Claude, que les silhouettes de ses murs remplacent quand elles disent quelque chose. */
const VUE_ENSEMBLE_CLAUDE = new Set(['forme du toit vue par Claude', 'bouts du faîtage vus par Claude']);

/**
 * Le toit que disent les silhouettes une fois arbitrees mur par mur (decision de l'utilisateur, 19 octobre 2026 : « tu reconcilies
 * ces donnees de silhouette, la photo gagne sur le LiDAR ; une forme de silhouette donne une forme de toit »). Pour chaque groupe de
 * murs (un corps du toit, groupesDeMurs), la silhouette retenue de chaque mur dit les bouts, le sens et la forme de ce corps
 * (facade/regles/toits/silhouettes.ts), au nom des sources qui l'ont fait retenir : la photo, Claude, ou la personne qui l'a forcee.
 * Une silhouette que seul le LiDAR dit ne fait rien : c'est deja la lecture de ses corps. Un mur que la photo et Claude lisent
 * autrement ne parle que par la silhouette retenue.
 */
export function constatsDuToitParSilhouettes(o: ObjetPlan, b: LigneBatiment, arbitrages: readonly Arbitrage[]): Constat[] {
  const retenue = new Map<number, Arbitrage>();
  for (const f of b.facades) {
    const a = arbitrages.find((x) => x.cible === cibleFacade(b.cle, f.cote) && x.attribut === 'silhouetteFacade');
    // Un mur dont la silhouette n'est retenue que par le LiDAR ne dit rien de plus que ses corps : il ne parle pas ici.
    if (a?.retenu && typeof a.retenu.valeur === 'string' && a.retenu.valeur !== 'indetermine' && a.retenu.sources.some((x) => x !== 'lidar')) retenue.set(f.cote, a);
  }
  const lignes = (f: LigneBatiment['facades'][number]) => retenue.get(f.cote)?.retenu?.lignes ?? [];
  // La silhouette retenue de chaque mur, quelle que soit la source ; ce qu'il ferme, quand Claude est de ceux qui l'ont dite.
  const lu = (f: LigneBatiment['facades'][number]): { silhouette: SilhouetteFacade; bout?: BoutVu } => {
    const a = retenue.get(f.cote);
    if (!a) return { silhouette: 'indetermine' };
    const bout = (lignes(f).find((l) => l.constat.source === 'claude')?.constat.charge as { bout?: BoutVu } | undefined)?.bout;
    return { silhouette: a.retenu?.valeur as SilhouetteFacade, ...(bout ? { bout } : {}) };
  };
  const out: Constat[] = [];
  for (const g of groupesDeMurs(o, b)) {
    const dits = bouts(b, g, lu);
    if (!dits) continue;
    // Les sources qui ont fait retenir une silhouette de ces murs parlent toutes du meme toit : celui des silhouettes retenues.
    for (const source of ['photo', 'claude', 'terrain'] as const) {
      const siennes = g.facades.flatMap((f) => lignes(f).filter((l) => l.constat.source === source));
      if (!siennes.length) continue;
      const confiance = Math.min(1, ...siennes.map((l) => l.constat.confiance ?? 1));
      // Chaque mur qui a parle, avec ce qu'il dit du toit et la photo qui le montre.
      const indices = dits.vus.flatMap((v) => {
        const f = g.facades.find((x) => 'façade ' + nomFacade(x.facade.orientation, x.cote) === v.nom);
        const photo = f ? lignes(f).flatMap((l) => l.constat.indices ?? []).find((i) => i.photo)?.photo : undefined;
        return f ? [{ texte: v.nom[0]?.toUpperCase() + v.nom.slice(1) + ' : ' + libelleSilhouette(v.silhouette) + ' → ' + v.dit, ...(photo ? { photo } : {}) }] : [];
      });
      const regle = source === 'terrain' ? 'silhouette forcée par vous' : REGLES_LIDAR[source].silhouette;
      out.push(...constatsDesSilhouettes(source, g.cible, dits, confiance, regle, indices));
    }
  }
  return out;
}

/**
 * Les murs d'un groupe qui portent un pignon traversant (facade/regles/toits/pignons.ts::pignonTraversant), d'apres les silhouettes
 * retenues mur par mur, quelle que soit la source qui les a fait retenir : un triangle en travers du faitage que dit le mur le plus
 * large (decision de l'utilisateur, 19 octobre 2026).
 */
export function traversantsDuGroupe(b: LigneBatiment, g: GroupeDeMurs, silhouettes: readonly Arbitrage[]): LigneBatiment['facades'] {
  const lu = (f: LigneBatiment['facades'][number]): { silhouette: SilhouetteFacade; bout?: BoutVu } => {
    const a = silhouettes.find((x) => x.cible === cibleFacade(b.cle, f.cote) && x.attribut === 'silhouetteFacade');
    const v = a?.retenu?.valeur;
    if (typeof v !== 'string' || !a?.retenu?.sources.some((x) => x !== 'lidar')) return { silhouette: 'indetermine' };
    const bout = (a?.retenu?.lignes.find((l) => l.constat.source === 'claude')?.constat.charge as { bout?: BoutVu } | undefined)?.bout;
    return { silhouette: v as SilhouetteFacade, ...(bout ? { bout } : {}) };
  };
  const dits = bouts(b, g, lu);
  return (dits?.traversants ?? []).flatMap((t) => g.facades.filter((f) => 'façade ' + nomFacade(f.facade.orientation, f.cote) === t.nom));
}

/**
 * Les constats d'un batiment avec le toit que disent ses silhouettes arbitrees : sur le corps principal, ce que Claude dit des murs
 * remplace sa vue d'ensemble, sauf une forme que les murs ne tirent que de longs pans (une ligne droite ne dit pas un appentis d'un
 * deux-pans) quand la vue d'ensemble en dit une.
 */
export function avecLeToitDesSilhouettes(constats: readonly Constat[], duToit: readonly Constat[]): Constat[] {
  const out = [...constats];
  for (const c of duToit) {
    if (c.source === 'claude') {
      const k = out.findIndex((x) => x.cible === c.cible && x.attribut === c.attribut && x.source === 'claude' && VUE_ENSEMBLE_CLAUDE.has(x.regle ?? ''));
      if (k >= 0 && c.attribut === 'formeToit' && c.regle !== REGLES_LIDAR.claude.silhouette) continue;
      if (k >= 0) out.splice(k, 1);
    }
    out.push(c);
  }
  return out;
}

/** Tous les constats d'un batiment, source par source, et l'etat du projet pour les comparer. */
export function constatsDuBatiment(e: EntreesConstats): ConstatsBatiment {
  return { constats: [...constatsIgn(e), ...constatsLidar(e), ...constatsPhoto(e), ...constatsClaude(e), ...constatsAccords(e), ...constatsTerrain(e)], projet: etatDuProjet(e.o) };
}

/**
 * Les constats d'un batiment, reconcilies : la silhouette de chaque mur s'arbitre d'abord (la photo et Claude gagnent sur le
 * LiDAR), puis le toit qu'elles disent, corps par corps, s'ajoute aux constats (constatsDuToitParSilhouettes). `silhouettes` :
 * l'arbitrage de chaque mur, que la proposition du toit montre.
 */
export function constatsReconcilies(e: EntreesConstats, regles: ReglesReconciliation = RECONCILIATION, choixDe?: (cible: string, attribut: IdAttribut) => ChoixArbitrage | undefined): ConstatsBatiment & { silhouettes: Arbitrage[] } {
  const { constats, projet } = constatsDuBatiment(e);
  const silhouettes = arbitrerTout(constats.filter((c) => c.attribut === 'silhouetteFacade'), projet, regles, choixDe);
  return { constats: avecLeToitDesSilhouettes(constats, constatsDuToitParSilhouettes(e.o, e.b, silhouettes)), projet, silhouettes };
}
