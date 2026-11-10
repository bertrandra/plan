// Les photographies DP7 et DP8 du dossier (lot L5, question 2 de la spec) : elles se prennent parmi les photos de l'audit de la parcelle
// gardees sur cet appareil (io/brouillonAudit.ts : la cloture, le portail, les facades et le toit vus de la rue), et nulle part
// ailleurs — les photos se prennent dans l'audit (decision 6 de la spec des facades, tests/unit/architecture/captureAudit.test.ts). Un
// audit fait sur un autre telephone n'est pas la. Chaque photo est ramenee a un JPEG d'au plus 2 048 px de cote, qualite 0,85 : de quoi
// imprimer une page A4, sans alourdir le projet.

import { creerBrouillonParcelle, stockageNavigateur } from '../../io/brouillonAudit.js';
import type { PhotoCas } from '../../model/audit.js';

/** Une photographie prete a ranger dans le dossier. */
export interface PhotoChoisie { image: string; largeur: number; hauteur: number }

/** Une photo de l'audit proposee : sa vignette (l'image elle-meme) et ce qu'elle montre. */
export interface PhotoAudit { image: string; legende: string }

const COTE_MAX = 2048;

/** Une image (`data:` ou adresse) ramenee a un JPEG d'au plus 2 048 px de cote. */
export function enJpeg(source: string): Promise<PhotoChoisie> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const l = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = l; c.height = h;
      const g = c.getContext('2d');
      if (!g) { ko(new Error('le navigateur ne sait pas redimensionner la photo')); return; }
      g.drawImage(img, 0, 0, l, h);
      ok({ image: c.toDataURL('image/jpeg', 0.85), largeur: l, hauteur: h });
    };
    img.onerror = () => ko(new Error('la photo ne se lit pas'));
    img.src = source;
  });
}

/** L'image d'une photo de l'audit, en `data:` (le brouillon garde le base64 seul). */
const imageDe = (p: PhotoCas): string => (p.base64.startsWith('data:') ? p.base64 : 'data:' + p.type + ';base64,' + p.base64);

/** Les photos de l'audit de cette parcelle gardees sur l'appareil : la rue d'abord (cloture, portail), puis les batiments. */
export async function photosDeLAudit(idu: string | null): Promise<PhotoAudit[]> {
  if (!idu) return [];
  const lu = await creerBrouillonParcelle(stockageNavigateur()).lire('parcelle-' + idu).catch(() => null);
  if (!lu) return [];
  const out: PhotoAudit[] = [];
  const c = lu.capture;
  c.cloture.photos.forEach((p, i) => out.push({ image: imageDe(p), legende: 'Clôture, photo ' + (i + 1) }));
  c.portail.photos.forEach((p, i) => out.push({ image: imageDe(p), legende: 'Portail, photo ' + (i + 1) }));
  Object.values(c.batiments).forEach((b, n) => {
    b.photos.forEach((p, i) => out.push({ image: imageDe(p), legende: 'Bâtiment ' + (n + 1) + ', toit vu de la rue, photo ' + (i + 1) }));
    Object.entries(b.facades).forEach(([cote, f]) => f.photos.forEach((p, i) => out.push({ image: imageDe(p), legende: 'Bâtiment ' + (n + 1) + ', façade ' + (Number(cote) + 1) + ', photo ' + (i + 1) })));
  });
  return out;
}
