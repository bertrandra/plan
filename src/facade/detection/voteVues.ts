// Le vote entre vues des ouvertures d'une facade fusionnee.
//
// La fusion donne une seule elevation, sur laquelle la detection propose des baies. Mais une haie, une voiture, une ombre
// qui ressemble a une fenetre ne sont vues que sur une des photos : l'image fusionnee peut la garder. Ici chaque vue
// redressee est lue seule, dans le repere de la reference, et chaque baie de la fusion est confrontee aux vues qui
// la VOIENT (assez de pixels vus, pas d'obstacle dessus) :
// - toutes les vues qui la voient la retrouvent : sa confiance monte un peu ;
// - une partie seulement : elle baisse en proportion (un faux positif de haie n'est vu que sur une photo) ;
// - aucune vue seule ne la retrouve alors que plusieurs la voient : elle est tenue pour suspecte (confiance divisee par deux) ;
// - une baie que plusieurs vues voient et retrouvent presque toutes, absente de la fusion, y est ajoutee.
// Tout est deterministe, sans appel a Claude. Les seuils sont des constantes nommees.

import type { OuvertureDetectee } from './detection.js';

export const VOTE = {
  /** Deux boites designent la meme baie quand leur recouvrement (intersection sur union) atteint ce seuil. */
  RECOUVREMENT_MIN: 0.4,
  /** Une vue « voit » une baie quand cette part de ses pixels est vue sur la photo... */
  PART_VUE_MIN: 0.6,
  /** ... et que cette part au plus y est cachee par un obstacle. */
  PART_OBSTACLE_MAX: 0.3,
  /** Il faut au moins deux vues qui voient pour parler d'un vote. */
  OBSERVATEURS_MIN: 2,
  /** Plancher du poids d'une baie retrouvee par aucune vue seule... */
  POIDS_SANS_ACCORD: 0.5,
  /** ... et poids d'une baie retrouvee par une part `r` des vues : de 0,55 (r = 0) a 1 (r = 1). */
  POIDS_PLANCHER: 0.55,
  /** Bonus d'une baie retrouvee par toutes les vues qui la voient. */
  BONUS_UNANIME: 0.05,
  /** Une baie absente de la fusion est ajoutee quand au moins ce nombre de vues la retrouvent... */
  AJOUT_ACCORDS_MIN: 2,
  /** ... et au moins cette part de celles qui la voient. */
  AJOUT_PART_MIN: 0.66,
  /** Sa confiance, quand elle est ajoutee, est la moyenne des vues fois ce facteur. */
  AJOUT_FACTEUR: 0.9,
  /** Ne pas ajouter une baie qui recouvre deja une baie de la fusion a ce point. */
  AJOUT_DEJA_LA: 0.2,
} as const;

/** Ce qu'une vue seule apporte au vote. */
export interface VueVotante {
  /** Les baies detectees sur cette vue seule (repere de la fusion : metres, x depuis la gauche, y depuis le sol). */
  ouvertures: readonly OuvertureDetectee[];
  /** Part des pixels de la boite vus sur cette vue (de 0 a 1). */
  partVue: (o: OuvertureDetectee) => number;
  /** Part des pixels de la boite ou cette vue montre un obstacle (de 0 a 1). */
  partObstacle: (o: OuvertureDetectee) => number;
}

/** Ce que le vote a decide d'une baie, pour le dire a la personne. */
export interface VoteOuverture {
  /** Les vues qui voient la baie. */
  observateurs: number;
  /** Parmi elles, celles qui la retrouvent seules. */
  accords: number;
}

/** Recouvrement (intersection sur union) de deux boites. */
export function recouvrement(a: OuvertureDetectee, b: OuvertureDetectee): number {
  const w = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

const voit = (v: VueVotante, o: OuvertureDetectee) => v.partVue(o) >= VOTE.PART_VUE_MIN && v.partObstacle(o) <= VOTE.PART_OBSTACLE_MAX;
const retrouve = (v: VueVotante, o: OuvertureDetectee) => v.ouvertures.some((u) => recouvrement(u, o) >= VOTE.RECOUVREMENT_MIN);
const cent = (x: number) => Math.round(x * 100) / 100;

/**
 * Les baies de la fusion, ponderees par le vote des vues, plus celles que plusieurs vues voient et que la fusion n'a pas.
 * Avec moins de deux vues, rien ne change. `vote` donne a chaque baie rendue ce que le vote en a dit.
 */
export function voter(fusion: readonly OuvertureDetectee[], vues: readonly VueVotante[]): { ouvertures: OuvertureDetectee[]; votes: Map<OuvertureDetectee, VoteOuverture> } {
  const votes = new Map<OuvertureDetectee, VoteOuverture>();
  if (vues.length < VOTE.OBSERVATEURS_MIN) return { ouvertures: [...fusion], votes };
  const sortie: OuvertureDetectee[] = fusion.map((o) => {
    const qui = vues.filter((v) => voit(v, o));
    if (qui.length < VOTE.OBSERVATEURS_MIN) return o;
    const accords = qui.filter((v) => retrouve(v, o)).length;
    const part = accords / qui.length;
    const poids = accords === 0 ? VOTE.POIDS_SANS_ACCORD : VOTE.POIDS_PLANCHER + (1 - VOTE.POIDS_PLANCHER) * part;
    const confiance = part === 1 ? Math.min(1, o.confiance + VOTE.BONUS_UNANIME) : o.confiance * poids;
    const r = { ...o, confiance: cent(confiance) };
    votes.set(r, { observateurs: qui.length, accords });
    return r;
  });
  // Les baies que plusieurs vues retrouvent et que la fusion a ratees : groupees par recouvrement, puis ajoutees.
  const vues_ = vues.map((v) => v.ouvertures.map((o) => ({ o, v })));
  const candidates = vues_.flat().filter(({ o }) => sortie.every((s) => recouvrement(s, o) < VOTE.AJOUT_DEJA_LA));
  const prises = new Set<OuvertureDetectee>();
  for (const { o: base } of candidates) {
    if (prises.has(base)) continue;
    const groupe = candidates.filter(({ o }) => !prises.has(o) && recouvrement(o, base) >= VOTE.RECOUVREMENT_MIN);
    const sources = new Set(groupe.map(({ v }) => v));
    if (sources.size < VOTE.AJOUT_ACCORDS_MIN) continue;
    const moy = (f: (o: OuvertureDetectee) => number) => groupe.reduce((s, { o }) => s + f(o), 0) / groupe.length;
    const boite: OuvertureDetectee = { ...base, x: cent(moy((o) => o.x)), y: cent(moy((o) => o.y)), l: cent(moy((o) => o.l)), h: cent(moy((o) => o.h)), confiance: cent(moy((o) => o.confiance) * VOTE.AJOUT_FACTEUR) };
    const qui = vues.filter((v) => voit(v, boite));
    if (qui.length < VOTE.OBSERVATEURS_MIN || sources.size / qui.length < VOTE.AJOUT_PART_MIN) continue;
    for (const { o } of groupe) prises.add(o);
    sortie.push(boite);
    votes.set(boite, { observateurs: qui.length, accords: sources.size });
  }
  return { ouvertures: sortie.sort((a, b) => a.x - b.x || a.y - b.y), votes };
}
