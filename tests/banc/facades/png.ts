// Un PNG RGBA minimal (filtre nul), sans dependance : les images de controle du banc de facades et les
// photos de synthese que la fumee importe dans le releve (point 68, lot G17).

import { deflateSync } from 'node:zlib';
import type { Image } from '../../../src/facade/homographie.js';

/** Un PNG RGBA minimal (filtre nul), sans dependance. */
export function png(img: Image): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = (crcTable[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const lg = Buffer.alloc(4);
    lg.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([lg, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.largeur, 0);
  ihdr.writeUInt32BE(img.hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const brut = Buffer.alloc((img.largeur * 4 + 1) * img.hauteur);
  for (let y = 0; y < img.hauteur; y++) {
    brut[y * (img.largeur * 4 + 1)] = 0;
    for (let i = 0; i < img.largeur * 4; i++) brut[y * (img.largeur * 4 + 1) + 1 + i] = (i % 4 === 3 ? 255 : img.donnees[y * img.largeur * 4 + i]) ?? 0;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
}
