// Le doigt sur la Vue 3D pendant un audit (la promenade, et la prise de l'audit de la parcelle) : un tapotement, un appui long, un
// glisser. Sorti du controleur de la promenade (26 octobre 2026, AD-10) : il se branche au demarrage, sur l'hote de la scene, alors
// que l'audit lui-meme ne se charge qu'a son ouverture.

import { vue3d } from '../../three/etat3d.js';

/** Un appui plus long que cela ouvre la fiche du batiment. */
const APPUI_LONG_MS = 600;
/** Un doigt qui bouge de plus que cela glisse : ce n'est plus un tapotement. */
const GLISSER_PX = 8;

/** Ce que le doigt declenche ; les coordonnees sont celles du canevas, de -1 a 1. */
export interface GestesDuDoigt {
  tapoter: (ndc: { x: number; y: number }) => void;
  appuiLong: (ndc: { x: number; y: number }) => void;
  lacherSuivi: () => void;
}

/**
 * Le doigt sur la Vue 3D : un tapotement (bref, sans glisser) ou un appui long. Un glisser passe la
 * camera en navigation libre. Pose une fois sur l'hote de la scene, qui survit aux reconstructions.
 */
export function brancherDoigtAudit(c: GestesDuDoigt, hote: HTMLElement, horloge: Pick<Window, 'setTimeout' | 'clearTimeout'> = window): () => void {
  let debut: { x: number; y: number; t: number } | null = null;
  let glisse = false, long = false;
  let minuteur: number | null = null;
  /** Les doigts poses : a deux, c'est un pincement (zoom), ni tapotement ni rotation. */
  const doigts = new Set<number>();
  const ndc = (x: number, y: number) => {
    const toile = vue3d.scene?.renderer.domElement ?? hote;
    const r = toile.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
  };
  const annuler = () => { if (minuteur !== null) horloge.clearTimeout(minuteur); minuteur = null; };
  const surCanevas = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'CANVAS';
  const bas = (e: PointerEvent) => {
    if (!surCanevas(e)) return;
    doigts.add(e.pointerId);
    annuler();
    if (doigts.size > 1) { debut = null; return; }
    debut = { x: e.clientX, y: e.clientY, t: Date.now() };
    glisse = false; long = false;
    const x = e.clientX, y = e.clientY;
    minuteur = horloge.setTimeout(() => { minuteur = null; if (!glisse) { long = true; c.appuiLong(ndc(x, y)); } }, APPUI_LONG_MS) as unknown as number;
  };
  const bouge = (e: PointerEvent) => {
    if (!debut || glisse || doigts.size > 1) return;
    if (Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > GLISSER_PX) {
      glisse = true;
      annuler();
      // Un doigt qui glisse tourne la vue : le cap n'est plus suivi, « Me suivre » le reprend.
      c.lacherSuivi();
    }
  };
  const haut = (e: PointerEvent) => {
    doigts.delete(e.pointerId);
    annuler();
    // Le minuteur peut arriver en retard sur un fil occupe (une scene lourde a dessiner) : la duree
    // de l'appui decide aussi.
    if (debut && !glisse && !long) {
      if (Date.now() - debut.t >= APPUI_LONG_MS) c.appuiLong(ndc(debut.x, debut.y));
      else c.tapoter(ndc(e.clientX, e.clientY));
    }
    debut = null;
  };
  const perdu = (e: PointerEvent) => { doigts.delete(e.pointerId); annuler(); debut = null; };
  hote.addEventListener('pointerdown', bas);
  hote.addEventListener('pointermove', bouge);
  hote.addEventListener('pointerup', haut);
  hote.addEventListener('pointercancel', perdu);
  return () => {
    hote.removeEventListener('pointerdown', bas); hote.removeEventListener('pointermove', bouge);
    hote.removeEventListener('pointerup', haut); hote.removeEventListener('pointercancel', perdu);
  };
}
