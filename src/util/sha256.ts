// SHA-256 synchrone d'un texte (UTF-8), en hexadecimal.
//
// Pourquoi pas Web Crypto : elle est asynchrone, et l'empreinte des faits d'un texte du dossier (lot L5) se lit dans un rendu
// (« brouillon perime ») et dans la relecture, qui doivent rester synchrones et deterministes. Un texte de quelques kilo-octets :
// la vitesse ne compte pas. Teste contre node:crypto (tests/unit/util/sha256.test.ts).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** L'empreinte SHA-256 de ce texte, encode en UTF-8, en 64 caracteres hexadecimaux. */
export function sha256Texte(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  const longueur = octets.length;
  const blocs = Math.ceil((longueur + 9) / 64);
  const m = new Uint8Array(blocs * 64);
  m.set(octets);
  m[longueur] = 0x80;
  const bits = longueur * 8;
  const vue = new DataView(m.buffer);
  vue.setUint32(m.length - 8, Math.floor(bits / 0x100000000));
  vue.setUint32(m.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let b = 0; b < blocs; b++) {
    for (let i = 0; i < 16; i++) w[i] = vue.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number, c = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3), s1 = rotr(c, 17) ^ rotr(c, 19) ^ (c >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h as unknown as number[] as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] as number) + a; h[1] = (h[1] as number) + bb; h[2] = (h[2] as number) + c; h[3] = (h[3] as number) + d;
    h[4] = (h[4] as number) + e; h[5] = (h[5] as number) + f; h[6] = (h[6] as number) + g; h[7] = (h[7] as number) + hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}
