// Admin › Calibrer la detection, les etapes 5 et 6 : caler la silhouette du mur sur la facade complete (l'assemblage de l'etape 3,
// entier, rien n'est coupe), puis ajuster la hauteur de la photo.
//
// 5. La silhouette (le gabarit du plan et du LiDAR) garde ses proportions : on la deplace et on la redimensionne par ses bouts
//    (gauche, droite) et son sol. Sa hauteur suit sa largeur, au rapport du plan.
// 6. La photo s'etire en hauteur autour du sol (une poignee en haut de l'image), en direct, pour que la facade monte a la hauteur de
//    la silhouette : ce que le redressement n'a pas donne juste (une focale mal connue ecrase ou allonge la vue de face).
// « Appliquer » rend les coins du mur sur l'assemblage : les bouts et le sol poses, l'egout a la hauteur de la silhouette ramenee sur
// la photo non etiree. L'editeur les reporte sur chaque photo, comme un mur pose a la main.

import { useRef, useState, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import type { P2 } from '../facade/vision/homographie.js';
import { gabaritSurLaVue, type GabaritMur } from '../facade/gabaritMur.js';
import { bouger, calageDe, coinsDuCalage, egoutDuCalage, ECART_MIN, PAS_CLAVIER, type Calage, type Prise } from '../facade/calage/calageSilhouette.js';
import { pointSvg, useEchelle } from './releve/commun.js';

export function CalageSilhouette({ url, largeur, hauteur, coins, gabarit, largeurM, hauteurM, appliquer }: {
  /** L'assemblage de l'etape 3, et sa taille en pixels. */
  url: string; largeur: number; hauteur: number;
  /** Les coins du mur retenus sur l'assemblage : le depart du calage. */
  coins: readonly P2[];
  gabarit: GabaritMur;
  largeurM: number; hauteurM: number;
  /** Les coins du mur sur l'assemblage (non etire) que donne le calage. */
  appliquer: (coins: P2[]) => void;
}) {
  const rapport = hauteurM / largeurM;
  const [c, setC] = useState<Calage>(() => calageDe(coins, rapport));
  const egout = egoutDuCalage(c, rapport);
  const haut = gabaritSurLaVue(gabarit, { x0: c.x0, x1: c.x1, y0: egout, y1: c.sol });
  const contour = [{ x: c.x0, y: c.sol }, ...haut, { x: c.x1, y: c.sol }].map((p) => p.x + ',' + p.y).join(' ');
  // Le haut de l'image etiree autour du sol, et l'image elle-meme : y' = sol + k (y - sol).
  const hautImage = c.sol - c.k * c.sol;
  const image = <image href={url} x={0} y={0} width={largeur} height={hauteur} preserveAspectRatio="none" transform={`translate(0 ${c.sol * (1 - c.k)}) scale(1 ${c.k})`} />;
  const min = ECART_MIN * largeur;
  const vues = [useRef<SVGSVGElement>(null), useRef<SVGSVGElement>(null)] as const;
  const echelle = useEchelle(vues[0], largeur);
  const saisir = (p: Prise, k: 0 | 1) => (e: PE<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget, racine = vues[k].current;
    if (!racine) return;
    el.setPointerCapture(e.pointerId);
    const a = pointSvg(racine, e), depart = c;
    const suivre = (ev: PointerEvent) => { const q = pointSvg(racine, ev); setC(bouger(p, q.x - a.x, q.y - a.y, depart, min)); };
    const lacher = () => { el.removeEventListener('pointermove', suivre); el.removeEventListener('pointerup', lacher); el.removeEventListener('pointercancel', lacher); };
    el.addEventListener('pointermove', suivre);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };
  const clavier = (p: Prise) => (e: KE<SVGElement>) => {
    const pas = PAS_CLAVIER * Math.max(largeur, hauteur) * (e.shiftKey ? 10 : 1);
    const dx = e.key === 'ArrowLeft' ? -pas : e.key === 'ArrowRight' ? pas : 0, dy = e.key === 'ArrowUp' ? -pas : e.key === 'ArrowDown' ? pas : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    setC((d) => bouger(p, dx, dy, d, min));
  };
  const saisie = 44 / echelle;
  const ligne = (p: Prise, nom: string, x1: number, y1: number, x2: number, y2: number, k: 0 | 1) => (
    <g key={p}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={'ajusterMurLigne ' + p} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="ajusterMurSaisie" strokeWidth={saisie} role="slider" tabIndex={0} aria-label={nom}
        aria-orientation={p === 'gauche' || p === 'droite' ? 'horizontal' : 'vertical'} aria-valuenow={Math.round(p === 'gauche' ? x1 : p === 'droite' ? x1 : y1)}
        onPointerDown={saisir(p, k)} onKeyDown={clavier(p)} />
    </g>
  );
  const silhouette = (k: 0 | 1, prise: boolean) => (
    <polygon points={contour} className={'calCalage' + (prise ? ' prise' : '')} vectorEffect="non-scaling-stroke"
      {...(prise ? { role: 'slider', tabIndex: 0, 'aria-label': 'Silhouette du mur : la déplacer', 'aria-valuenow': Math.round(c.x0), onPointerDown: saisir('tout', k), onKeyDown: clavier('tout') } : { pointerEvents: 'none' as const })} />
  );
  const sommet = Math.min(egout, ...haut.map((p) => p.y));
  const valider = () => {
    appliquer(coinsDuCalage(c, rapport));
  };
  const cadre = `0 ${Math.min(0, hautImage)} ${largeur} ${Math.max(hauteur, c.sol + c.k * (hauteur - c.sol)) - Math.min(0, hautImage)}`;
  return <>
    <h4 className="calTitre3">5. Caler la silhouette sur la photo</h4>
    <figure>
      <svg ref={vues[0]} className="calEtape large ajusterMurPhoto" viewBox={cadre} role="group" aria-label="Façade complète : déplacez la silhouette, tirez ses bouts et son sol ; ses proportions restent celles du plan">
        {image}
        {silhouette(0, true)}
        {ligne('gauche', 'Bout gauche de la silhouette', c.x0, sommet, c.x0, c.sol, 0)}
        {ligne('droite', 'Bout droit de la silhouette', c.x1, sommet, c.x1, c.sol, 0)}
        {ligne('sol', 'Sol de la silhouette', c.x0, c.sol, c.x1, c.sol, 0)}
      </svg>
      <figcaption>Alignez la silhouette sur la façade : ses bouts sur les angles du mur, son sol sur le pied. Elle garde les proportions du plan ({String(largeurM).replace('.', ',')} × {String(hauteurM).replace('.', ',')} m à l’égout) : sa hauteur suit sa largeur. Glissez-la entière pour la déplacer (flèches, Maj : dix fois plus).</figcaption>
    </figure>
    <h4 className="calTitre3">6. Ajuster la hauteur de la photo</h4>
    <figure>
      <svg ref={vues[1]} className="calEtape large ajusterMurPhoto" viewBox={cadre} role="group" aria-label="Façade complète : tirez le haut de la photo pour l’étirer en hauteur autour du sol">
        {image}
        {silhouette(1, false)}
        {ligne('haut', 'Haut de la photo', 0, hautImage, largeur, hautImage, 1)}
      </svg>
      <figcaption>Si la façade ne monte pas à la hauteur de la silhouette, tirez le haut de la photo : elle s’étire en hauteur autour du sol, la silhouette ne bouge pas. Étirement : {Math.round(c.k * 100)} %.</figcaption>
    </figure>
    <div className="calLigne">
      <button type="button" className="secondary small" data-controle="calibration.retablirCalage" onClick={() => setC(calageDe(coins, rapport))}>Revenir au mur trouvé</button>
      <button type="button" className="small" data-controle="calibration.appliquerCalage" onClick={valider}>Appliquer le calage et redresser</button>
    </div>
  </>;
}
