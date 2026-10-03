// Les conversions de couleur du selecteur avance de la palette (zones/SelecteurCouleur.tsx).
//
// `#RRGGBB` est la forme enregistree ; le selecteur travaille en TSV (la zone saturation x valeur
// et la barre de teinte) et montre aussi TSL et RVB. Toutes les fonctions sont pures et arrondissent
// au plus pres : un aller-retour hex -> TSV -> hex rend la couleur de depart.

export interface Rvb { r: number; v: number; b: number }
/** Teinte en degres (0-360), saturation et valeur (ou luminosite) en pourcentage (0-100). */
export interface Tsv { t: number; s: number; v: number }
export interface Tsl { t: number; s: number; l: number }

const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export function hexVersRvb(hex: string): Rvb {
  return { r: parseInt(hex.slice(1, 3), 16), v: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

export function rvbVersHex({ r, v, b }: Rvb): string {
  const c = (x: number) => Math.round(borne(x, 0, 255)).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(v) + c(b)).toUpperCase();
}

/** La teinte d'une couleur, a partir de ses canaux ramenes a 0-1. */
function teinte(r: number, v: number, b: number, max: number, delta: number): number {
  if (delta === 0) return 0;
  const t = max === r ? ((v - b) / delta) % 6 : max === v ? (b - r) / delta + 2 : (r - v) / delta + 4;
  return (t * 60 + 360) % 360;
}

export function rvbVersTsv({ r, v, b }: Rvb): Tsv {
  const [R, V, B] = [r / 255, v / 255, b / 255];
  const max = Math.max(R, V, B), min = Math.min(R, V, B), delta = max - min;
  return { t: teinte(R, V, B, max, delta), s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function tsvVersRvb({ t, s, v }: Tsv): Rvb {
  const S = borne(s, 0, 100) / 100, V = borne(v, 0, 100) / 100;
  const f = (n: number) => {
    const k = (n + ((t % 360) + 360) % 360 / 60) % 6;
    return V - V * S * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, v: f(3) * 255, b: f(1) * 255 };
}

export function rvbVersTsl({ r, v, b }: Rvb): Tsl {
  const [R, V, B] = [r / 255, v / 255, b / 255];
  const max = Math.max(R, V, B), min = Math.min(R, V, B), delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { t: teinte(R, V, B, max, delta), s: s * 100, l: l * 100 };
}

export function tslVersRvb({ t, s, l }: Tsl): Rvb {
  const S = borne(s, 0, 100) / 100, L = borne(l, 0, 100) / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + ((t % 360) + 360) % 360 / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0) * 255, v: f(8) * 255, b: f(4) * 255 };
}

export const hexVersTsv = (hex: string): Tsv => rvbVersTsv(hexVersRvb(hex));
export const tsvVersHex = (c: Tsv): string => rvbVersHex(tsvVersRvb(c));
export const hexVersTsl = (hex: string): Tsl => rvbVersTsl(hexVersRvb(hex));
export const tslVersHex = (c: Tsl): string => rvbVersHex(tslVersRvb(c));
