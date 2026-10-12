// Le regulateur de charge des calculs de fond (lecture des toits, app/toitsFond.ts).
//
// Tout tourne sur le poste de l'utilisateur, dans le meme fil que l'interface : chaque toit lu se
// calcule (corps, pignons, couleur) puis se dessine. Le regulateur dose ce travail pour que le plan
// reste fluide, quel que soit le poste :
//
// - une sonde mesure le retard du fil principal (un minuteur de 100 ms qui arrive en retard : le fil
//   etait occupe). Elle voit tout ce qui charge le poste, la lecture comme la Vue 3D ou un poste lent ;
// - la consigne depend de l'utilisateur : s'il travaille (un geste depuis moins d'une seconde et demie),
//   pas plus d'une image de retard (16 ms) ; au repos, 50 ms ;
// - au-dessus de la consigne, moitie moins de lectures en meme temps et une pause deux fois plus longue
//   avant chaque batiment ; nettement en dessous, une lecture de plus et une pause plus courte chaque
//   seconde (la regle du trafic reseau : reculer vite, revenir doucement) ;
// - au premier geste, une seule lecture tout de suite, sans attendre la sonde.

/** Un geste depuis moins que cela : l'utilisateur travaille. */
export const DUREE_ACTIVITE_MS = 1500;
/** Le pas de la sonde de retard. */
export const PAS_SONDE_MS = 100;
/** Le retard tolere : une image quand l'utilisateur travaille, davantage au repos. */
export const RETARD_ACTIF_MS = 16;
export const RETARD_REPOS_MS = 50;
/** La pause avant chaque batiment ne depasse jamais cela : la lecture ralentit, elle ne s'arrete pas. */
export const PAUSE_MAX_MS = 1000;
/** Entre deux remontees d'une lecture. */
const REMONTEE_MS = 1000;
/** Lissage du retard mesure : une seule tache longue ne fait pas tout chuter. */
const LISSAGE = 0.3;

export interface ContexteRegulateur {
  /** Le plus de lectures en meme temps (PARALLELE_TOITS_FOND). */
  max: number;
  maintenant?: () => number;
  attendre?: (ms: number) => Promise<void>;
}

export interface Regulateur {
  /** Un geste de l'utilisateur (pointeur, molette, clavier). */
  geste(): void;
  /** Une mesure de la sonde : le retard du minuteur, en millisecondes. */
  tic(retardMs: number): void;
  /** L'utilisateur travaille-t-il en ce moment. */
  occupe(): boolean;
  /** Combien de lectures en meme temps sont permises maintenant. */
  lecteurs(): number;
  /**
   * A attendre avant chaque batiment, par le lecteur `rang` (0 pour le premier) : il patiente tant
   * que son rang depasse les lectures permises, puis observe la pause du moment.
   */
  tour(rang: number): Promise<void>;
  /** Attend que l'utilisateur ne travaille plus, au plus `maxMs`. */
  calme(maxMs: number): Promise<void>;
  /** Le retard lisse et la pause du moment, pour les mesures. */
  etat(): { retard: number; lecteurs: number; pause: number };
}

export function creerRegulateur(ctx: ContexteRegulateur): Regulateur {
  const maintenant = ctx.maintenant ?? (() => performance.now());
  const attendre = ctx.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let dernierGeste = -Infinity;
  let retard = 0;
  let lecteurs = ctx.max;
  let pause = 0;
  let derniereRemontee = 0;
  const occupe = () => maintenant() - dernierGeste < DUREE_ACTIVITE_MS;
  const permis = () => (occupe() ? Math.min(lecteurs, 1) : lecteurs);

  return {
    geste() { dernierGeste = maintenant(); },
    tic(r) {
      retard = retard * (1 - LISSAGE) + Math.max(0, r) * LISSAGE;
      const consigne = occupe() ? RETARD_ACTIF_MS : RETARD_REPOS_MS;
      if (retard > consigne) {
        lecteurs = Math.max(1, Math.floor(lecteurs / 2));
        pause = Math.min(PAUSE_MAX_MS, Math.max(20, pause * 2));
        derniereRemontee = maintenant();
      } else if (retard < consigne / 2 && maintenant() - derniereRemontee >= REMONTEE_MS) {
        lecteurs = Math.min(ctx.max, lecteurs + 1);
        pause = Math.max(0, Math.floor(pause / 2) - 10);
        derniereRemontee = maintenant();
      }
    },
    occupe,
    lecteurs: permis,
    async tour(rang) {
      while (rang >= permis()) await attendre(PAS_SONDE_MS);
      // Pendant un geste, au moins une image entre deux batiments : le geste passe d'abord.
      const p = occupe() ? Math.max(pause, RETARD_ACTIF_MS) : pause;
      await attendre(p);
    },
    async calme(maxMs) {
      const fin = maintenant() + maxMs;
      while (occupe() && maintenant() < fin) await attendre(PAS_SONDE_MS);
    },
    etat: () => ({ retard: Math.round(retard), lecteurs: permis(), pause }),
  };
}

/**
 * Branche le regulateur sur la page : les gestes de l'utilisateur, et la sonde de retard tant que la
 * lecture tourne. Rend de quoi arreter la sonde et les ecouteurs.
 */
export function brancherRegulateur(r: Regulateur, cible: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const geste = () => r.geste();
  const evenements = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
  for (const e of evenements) cible.addEventListener(e, geste, { passive: true, capture: true });
  let attendu = performance.now() + PAS_SONDE_MS;
  const sonde = setInterval(() => {
    const t = performance.now();
    r.tic(t - attendu);
    attendu = t + PAS_SONDE_MS;
  }, PAS_SONDE_MS);
  return () => {
    clearInterval(sonde);
    for (const e of evenements) cible.removeEventListener(e, geste, { capture: true });
  };
}
