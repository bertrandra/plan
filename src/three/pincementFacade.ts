// Le pincement de la vue de facade du mode Toit (decision du proprietaire, 6 novembre 2026 : le cadre de la facade et de ses poignees
// reste ; on s'approche au pincement, et a la molette au bureau). La camera de facade est posee a la main : OrbitControls, suspendu devant
// une facade, ne la pince pas. Deux doigts sur le canevas zooment autour de leur milieu et le font glisser ; un doigt garde ce qu'il
// faisait (toucher un mur, une poignee). Rien n'est ecrit : ni le projet ni la session (un Ctrl+Z ne defait pas un zoom).

import { vue3d } from './etat3d.js';
import { zoomerLaFacade } from './vueFacadeToit.js';

interface Doigt { x: number; y: number }

/**
 * Le canevas dont le pincement est branche, un seul a la fois : chaque construction de la Vue 3D cree un canevas, et ses ecouteurs sur la
 * fenetre (avec le canevas qu'ils retiennent) restaient branches apres sa demolition, un jeu de plus par reconstruction.
 */
let branche: { dom: HTMLElement; debrancher: () => void } | null = null;

/** Branche le pincement sur le canevas de la Vue 3D, une fois ; celui d'un canevas precedent se debranche. */
export function pincerLaFacadeDe(dom: HTMLElement): void {
  if (branche?.dom === dom) return;
  debrancherPincementFacade();
  branche = { dom, debrancher: brancherPincementFacade(dom) };
}

/** Debranche le pincement (la scene est demolie). */
export function debrancherPincementFacade(): void {
  branche?.debrancher();
  branche = null;
}

/** Branche le pincement sur le canevas de la Vue 3D ; rend de quoi le debrancher. */
export function brancherPincementFacade(dom: HTMLElement): () => void {
  const doigts = new Map<number, Doigt>();
  let avant: { d: number; m: Doigt } | null = null;
  const ndc = (p: Doigt) => { const r = dom.getBoundingClientRect(); return { x: ((p.x - r.left) / r.width) * 2 - 1, y: -(((p.y - r.top) / r.height) * 2 - 1) }; };
  const mesure = () => {
    const [a, b] = [...doigts.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } } : null;
  };
  const bas = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !vue3d.scene?.cameraRendu) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    avant = mesure();
  };
  const bouge = (e: PointerEvent) => {
    if (!doigts.has(e.pointerId)) return;
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const sc = vue3d.scene, m = mesure();
    if (!sc || !m || !avant || avant.d < 1) { avant = m; return; }
    const c = ndc(m.m), c0 = ndc(avant.m);
    // Le milieu des doigts vise ; ce qu'il a parcouru fait glisser l'image.
    if (zoomerLaFacade(sc, m.d / avant.d, c0, { x: c.x - c0.x, y: c.y - c0.y })) e.preventDefault();
    avant = m;
  };
  const haut = (e: PointerEvent) => { doigts.delete(e.pointerId); avant = mesure(); };
  dom.addEventListener('pointerdown', bas, true);
  // Les deplacements se suivent sur la fenetre : un doigt pose sur une poignee et rendu a la vue (zones/vue3d/PoigneesToit.tsx,
  // `poserSurLaScene`) reste tenu par la poignee, ses deplacements ne passent pas par le canevas. Seuls comptent les doigts poses ici.
  window.addEventListener('pointermove', bouge, true);
  window.addEventListener('pointerup', haut, true);
  window.addEventListener('pointercancel', haut, true);
  return () => {
    dom.removeEventListener('pointerdown', bas, true);
    window.removeEventListener('pointermove', bouge, true);
    window.removeEventListener('pointerup', haut, true);
    window.removeEventListener('pointercancel', haut, true);
  };
}
