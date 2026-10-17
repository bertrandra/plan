// La mesure de l'affichage (`?fps=on`) : images par seconde, temps de rendu, appels de dessin et triangles, en bas a gauche
// du canevas 3D. Rien ne s'execute sans le parametre : l'adresse seule decide, aucun reglage a retenir.
//
// Le temps donne est celui que le processeur passe a preparer l'image (renderer.render et ses passes), pas celui du processeur
// graphique, que le navigateur ne mesure pas : de quoi comparer deux reglages (qualite, ombres, nombre d'arbres), pas de quoi
// promettre une cadence. Les appels et triangles sont ceux de l'image entiere, passes de l'occlusion comprises.

import type * as THREE_NS from 'three';

/** L'adresse demande-t-elle l'affichage de la perf ? Seul `fps=on` l'active. */
export function demandePerf(recherche: string): boolean {
  return new URLSearchParams(recherche).get('fps') === 'on';
}

const actif = typeof location !== 'undefined' && demandePerf(location.search);
export const perfActive = (): boolean => actif;

/** Le delai entre deux relectures du compteur : assez long pour lisser, assez court pour suivre un reglage. */
const PERIODE_MS = 500;
/** Sans image depuis ce delai, la cadence est dite au repos plutot que nulle. */
const REPOS_MS = 1500;
const CLASSE = 'perfVue3d';

interface Fenetre { debut: number; images: number; cpuMs: number; appels: number; triangles: number; derniere: number }
const fenetres = new WeakMap<THREE_NS.WebGLRenderer, Fenetre>();

/** « 60 fps · 3,2 ms · 142 appels · 1,2 M triangles » (pure : testee seule). */
export function texteDePerf(fps: number | null, cpuMs: number, appels: number, triangles: number): string {
  const nb = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
  const tri = triangles >= 1e6 ? nb(triangles / 1e6) + ' M' : triangles >= 1e3 ? nb(triangles / 1e3, 0) + ' k' : String(Math.round(triangles));
  return (fps === null ? 'au repos' : Math.round(fps) + ' fps') + ' · ' + nb(cpuMs) + ' ms · ' + Math.round(appels) + ' appels · ' + tri + ' triangles';
}

/** Le bandeau du canevas : un seul par hote, cree au premier besoin. */
function bandeau(renderer: THREE_NS.WebGLRenderer): HTMLElement | null {
  const hote = renderer.domElement.parentElement;
  if (!hote) return null;
  const existant = hote.querySelector<HTMLElement>('.' + CLASSE);
  if (existant) return existant;
  // Le bandeau se pose sur le canevas : son hote doit etre le repere de sa position.
  if (getComputedStyle(hote).position === 'static') hote.style.position = 'relative';
  const el = document.createElement('div');
  el.className = CLASSE;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Performance de l’affichage');
  hote.appendChild(el);
  return el;
}

/**
 * Rend une image par `rendu` et la mesure. Sans `?fps=on`, appeler `rendu` directement : le compteur de `renderer.info`
 * n'est touche que pour la mesure.
 */
export function mesurerImage(renderer: THREE_NS.WebGLRenderer, rendu: () => void): void {
  const info = renderer.info;
  info.autoReset = false;
  info.reset();
  const t0 = performance.now();
  rendu();
  const t1 = performance.now();
  const f = fenetres.get(renderer) ?? { debut: t0, images: 0, cpuMs: 0, appels: 0, triangles: 0, derniere: t0 };
  f.images++; f.cpuMs += t1 - t0; f.appels = info.render.calls; f.triangles = info.render.triangles; f.derniere = t1;
  fenetres.set(renderer, f);
  if (t1 - f.debut < PERIODE_MS) return;
  const el = bandeau(renderer);
  if (el) el.textContent = texteDePerf((f.images * 1000) / (t1 - f.debut), f.cpuMs / f.images, f.appels, f.triangles);
  Object.assign(f, { debut: t1, images: 0, cpuMs: 0 });
  // Une scene qui ne se redessine plus n'appelle plus rien : le bandeau repasse au repos de lui-meme.
  window.setTimeout(() => {
    const g = fenetres.get(renderer);
    const b = bandeau(renderer);
    if (g && b && performance.now() - g.derniere > REPOS_MS) b.textContent = texteDePerf(null, 0, g.appels, g.triangles);
  }, REPOS_MS + 50);
}
