// Les calculs lourds de facade.html, appelables par message : ils tournent dans un Web Worker
// (travail.ts) pour que l'ecran ne fige pas, ou, si le navigateur le refuse, sur le fil principal.
// Chaque operation recoit et rend des donnees simples (copiables d'un fil a l'autre).

import {
  segmentsPhoto,
  estimerChamp,
  estimerDistorsion,
  redresserPhoto,
  redresserDepuisCoins,
  champDepuisCoins,
  vueRedressee,
  signature,
  placer,
  cadreFusion,
  tracerCoutures,
  preparerRendu,
  type Cadre,
  type Coutures,
  type Gris,
  type P2,
  type Redressement,
  type Segment,
  type Sim,
  type Source,
} from './auto.js';

export type Progres = (fraction: number, texte: string) => void;
const pause = () => new Promise<void>((r) => setTimeout(r, 0));

export interface EntreeAnalyse {
  gris: Gris;
  k: number;
  L: number;
  H: number;
  exif: boolean;
}
export interface Analyse {
  segs: Segment[];
  champEstime: number | null;
}

export interface EntreeRedressement {
  segs: Segment[];
  k: number;
  L: number;
  H: number;
  champ: number;
  facade: number;
  coins: P2[] | null;
}
export interface ResultatRedressement {
  red: Redressement | null;
  /** Champ que les coins poses donnent, pour une photo sans EXIF. */
  champCoins: number | null;
}

export interface EntreePlacement {
  photos: { red: Redressement; gris: Gris; k: number }[];
}
export interface Placement {
  T: (Sim | null)[];
  gains: number[];
  cadre: Cadre;
  liaisons: { i: number; j: number; accords: number }[];
}

// Etat entre le placement et le rendu (un seul travail a la fois).
let courant: { reds: Redressement[]; T: (Sim | null)[]; gains: number[]; cadre: Cadre; coutures: Coutures | null } | null = null;

export const operations = {
  async analyser(e: EntreeAnalyse): Promise<Analyse> {
    const segs = segmentsPhoto(e.gris, e.k);
    return { segs, champEstime: e.exif ? null : estimerChamp(segs, e.k, e.L, e.H) };
  },

  async redresser(e: EntreeRedressement): Promise<ResultatRedressement> {
    const lambda = estimerDistorsion(e.segs, e.k, e.L, e.H, e.champ);
    if (e.coins) return { red: redresserDepuisCoins(e.coins, e.L, e.H, e.champ, lambda), champCoins: champDepuisCoins(e.coins, e.L, e.H, lambda) };
    return { red: redresserPhoto(e.segs, e.k, e.L, e.H, e.champ, { facade: e.facade, lambda }), champCoins: null };
  },

  async placer(e: EntreePlacement, progres: Progres): Promise<Placement> {
    const reds = e.photos.map((p) => p.red);
    let T: (Sim | null)[] = reds.map((_, i) => (i === 0 ? { a: 1, b: 0, tx: 0, ty: 0 } : null));
    let gains = reds.map(() => 1);
    let liaisons: Placement['liaisons'] = [];
    let coutures: Coutures | null = null;
    if (reds.length > 1) {
      // Vues de travail d'environ 900 px, a la meme echelle d'une photo a l'autre.
      const cs = reds.map((r) => 900 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0) / r.cam.f).sort((a, b) => a - b);
      const c = cs[Math.floor(cs.length / 2)]!;
      const vues = [],
        sigs = [];
      for (let i = 0; i < reds.length; i++) {
        progres((0.6 * i) / reds.length, `Points homologues, photo ${i + 1} sur ${reds.length}…`);
        await pause();
        const r = reds[i]!;
        const fa = Math.min(r.cam.f * c, 1200 / Math.max(r.boite.x1 - r.boite.x0, r.boite.y1 - r.boite.y0));
        const v = vueRedressee(r, e.photos[i]!.gris, e.photos[i]!.k, fa);
        vues.push(v);
        sigs.push(signature(v));
      }
      progres(0.6, 'Assemblage des photos…');
      await pause();
      const pl = placer(vues, sigs);
      T = pl.T;
      gains = pl.gains;
      liaisons = pl.liaisons;
      progres(0.85, 'Coutures entre les photos…');
      await pause();
      coutures = tracerCoutures(vues, T, gains, cadreFusion(reds, T));
    }
    const cadre = cadreFusion(reds, T);
    courant = { reds, T, gains, cadre, coutures };
    return { T, gains, cadre, liaisons };
  },

  async rendre(e: { sources: (Source | null)[]; px: number }, progres: Progres): Promise<{ sortie: Uint8ClampedArray; l: number; h: number }> {
    if (!courant) throw new Error('rien à rendre : assemblez d’abord les photos');
    const { reds, T, gains, cadre, coutures } = courant;
    const rendu = preparerRendu(reds, T, gains, e.sources, cadre, e.px, coutures);
    const pas = Math.max(4, Math.round(300_000 / rendu.largeur));
    for (let y = 0; y < rendu.hauteur; y += pas) {
      rendu.lignes(y, y + pas);
      progres(Math.min(1, (y + pas) / rendu.hauteur), `Redressement : ${rendu.largeur} × ${rendu.hauteur} px…`);
      await pause();
    }
    return { sortie: rendu.sortie, l: rendu.largeur, h: rendu.hauteur };
  },
};

export type Operations = typeof operations;
