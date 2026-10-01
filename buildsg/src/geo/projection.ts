// Projection plane locale et tuiles WMTS (spec §3.2, geo/projection.ts).
//
// Deplace depuis legacy.ts sans retouche. Les constantes sont celles du WGS84.

/** Demi-grand axe et premiere excentricite au carre de l'ellipsoide WGS84. */
export const TERRE_A = 6378137;
export const TERRE_E2 = 0.00669437999014;

/** Projection locale : convertit degres <-> metres autour d'un point d'origine. */
export interface ProjecteurLocal {
  lat0: number;
  lon0: number;
  /** Metres par degre de longitude a cette latitude. */
  kx: number;
  /** Metres par degre de latitude a cette latitude. */
  ky: number;
  versMetres: (lon: number, lat: number) => { x: number; y: number };
  versDegres: (x: number, y: number) => { lon: number; lat: number };
}

// Projection plane locale tangente : exacte au millimetre sur l'emprise utile (moins d'un km),
// et sans dependance externe - aucune bibliotheque de projection n'est chargeable ici.
export function projecteurLocal(lat0: number, lon0: number): ProjecteurLocal {
  const phi = lat0*Math.PI/180, s = Math.sin(phi);
  const N = TERRE_A/Math.sqrt(1 - TERRE_E2*s*s);                 // rayon de la 1re verticale
  const M = TERRE_A*(1 - TERRE_E2)/Math.pow(1 - TERRE_E2*s*s, 1.5); // rayon meridien
  const kx = N*Math.cos(phi)*Math.PI/180;   // metres par degre de longitude
  const ky = M*Math.PI/180;                 // metres par degre de latitude
  return {
    lat0, lon0, kx, ky,
    versMetres: (lon, lat)=>({ x:(lon-lon0)*kx, y:(lat-lat0)*ky }),
    versDegres: (x, y)=>({ lon: lon0 + x/kx, lat: lat0 + y/ky })
  };
}

// Tuiles WMTS (grille PM, la meme que les fonds de carte web) : conversion degres <-> indices.
export function tuileX(lon: number, z: number): number { return Math.floor((lon + 180)/360 * Math.pow(2, z)); }
export function tuileY(lat: number, z: number): number {
  const r = lat*Math.PI/180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r))/Math.PI)/2 * Math.pow(2, z));
}
export function lonDeTuile(x: number, z: number): number { return x/Math.pow(2, z)*360 - 180; }
export function latDeTuile(y: number, z: number): number {
  const n = Math.PI - 2*Math.PI*y/Math.pow(2, z);
  return 180/Math.PI * Math.atan(0.5*(Math.exp(n) - Math.exp(-n)));
}
