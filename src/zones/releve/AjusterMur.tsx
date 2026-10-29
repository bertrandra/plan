// La reprise a la main du mur sur une photo redressee entiere (MD/spec-releve-facade.md §6.1 bis) : l'egout, le sol et les deux bouts,
// sur la photo tournee de face par ses reperes. Le mur cherche automatiquement en est le depart.
//
// Le haut du mur est le gabarit (facade/gabaritMur.ts) : la silhouette que donnent le plan et le LiDAR, un pignon, une rampe ou une ligne
// droite. Sa forme ne bouge pas ; il se pose entre les lignes que l'on tire, et suit leur echelle. Les lignes sont horizontales et
// verticales sur la vue de face : elles ne se tirent que dans leur sens. Tout revient sur la photo par l'homographie du redressement :
// les quatre coins du mur, que la chaine traite comme poses a la main (facade/releve/chaine.ts) ; le gabarit s'y repose.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import { appliquer, type Image, type P2 } from '../../facade/vision/homographie.js';
import { inverser, redresserParReperes } from '../../facade/vision/redressementFuites.js';
import { GABARIT_RECTANGLE, contourDuGabarit, gabaritSurLaVue, type GabaritMur } from '../../facade/gabaritMur.js';
import { versJpeg } from '../../ui/releve/camera.js';
import { pointSvg, useEchelle } from './commun.js';

/** Le mur sur la vue de face : ses bouts (x), son egout et son sol (y). */
interface MurVue { x0: number; x1: number; egout: number; sol: number }
/** Ce que la personne a retenu, sur la photo : les quatre coins du mur (le gabarit s'y pose, il ne bouge pas). */
export interface MurAjuste { coins: P2[] }

/** Un pas au clavier, en part du grand cote de la vue. */
const PAS_CLAVIER = 0.002;
/** Deux lignes du mur gardent au moins cet ecart, en part du grand cote. */
const ECART_MIN = 0.02;

/** Le mur de depart sur la vue : entre les coins donnes, sinon un cadre au milieu. */
function murDeDepart(L: number, H: number, coins: readonly P2[] | null): MurVue {
  if (coins?.length !== 4) return { x0: 0.15 * L, x1: 0.85 * L, egout: 0.35 * H, sol: 0.85 * H };
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  return { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, egout: (hg.y + hd.y) / 2, sol: (bd.y + bg.y) / 2 };
}

type Ligne = 'egout' | 'sol' | 'gauche' | 'droite';
const NOMS: Record<Ligne, string> = { egout: 'Égout', sol: 'Sol', gauche: 'Bout gauche du mur', droite: 'Bout droit du mur' };

export function AjusterMur({ charger, reperes, mur, gabarit = GABARIT_RECTANGLE, changer }: {
  /** Les pixels de la photo, lus a la demande (le decodage d'une photo coute). */
  charger: () => Promise<Image | null>;
  /** Le rectangle du mur qui redresse la photo : les reperes poses, sinon les coins du mur deja retenus. */
  reperes: readonly P2[];
  /** Les coins du mur sur la photo, trouves ou deja ajustes : le depart des lignes ; null, un cadre au milieu. */
  mur: readonly P2[] | null;
  /** Le gabarit du mur (le plan et le LiDAR) : la forme de son haut, qui ne bouge pas ; un rectangle sans corps lu. */
  gabarit?: GabaritMur;
  /** Le mur retenu, sur la photo, a chaque geste. */
  changer: (m: MurAjuste) => void;
}) {
  const [image, setImage] = useState<Image | null>(null);
  const [erreur, setErreur] = useState(false);
  useEffect(() => {
    let vivant = true;
    void charger().then((i) => { if (vivant) { setImage(i); setErreur(!i); } }).catch(() => { if (vivant) setErreur(true); });
    return () => { vivant = false; };
  }, [charger]);
  const vue = useMemo(() => {
    if (!image) return null;
    const r = redresserParReperes(image, reperes);
    const versVue = r ? inverser(r.versPhoto) : null;
    return r && versVue ? { r, versVue, url: versJpeg(r.image) } : null;
  }, [image, reperes]);
  const [cadre, setCadre] = useState<MurVue | null>(null);
  useEffect(() => {
    if (!vue) return;
    setCadre(murDeDepart(vue.r.image.largeur, vue.r.image.hauteur, mur ? mur.map((c) => appliquer(vue.versVue, c)) : null));
  }, [vue, mur]);
  const svg = useRef<SVGSVGElement>(null);
  const L = vue?.r.image.largeur ?? 1, H = vue?.r.image.hauteur ?? 1;
  const echelle = useEchelle(svg, L);
  if (erreur) return <p className="calNote" role="alert">La photo ne se lit pas : le mur ne peut pas être ajusté ici.</p>;
  if (!vue || !cadre) return <p className="calNote">Redressement de la photo…</p>;

  const min = ECART_MIN * Math.max(L, H);
  const poser = (c: MurVue) => {
    // Les bouts restent ecartes, l'egout au-dessus du sol.
    const x0 = Math.min(c.x0, c.x1 - min), x1 = Math.max(c.x1, x0 + min);
    const egout = Math.min(c.egout, c.sol - min), sol = Math.max(c.sol, egout + min);
    const n: MurVue = { x0, x1, egout, sol };
    setCadre(n);
    const versPhoto = (p: P2) => { const q = appliquer(vue.r.versPhoto, p); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; };
    changer({ coins: [{ x: x0, y: egout }, { x: x1, y: egout }, { x: x1, y: sol }, { x: x0, y: sol }].map(versPhoto) });
  };
  const bouger = (l: Ligne, d: number, depart: MurVue) => {
    if (l === 'gauche') poser({ ...depart, x0: depart.x0 + d });
    else if (l === 'droite') poser({ ...depart, x1: depart.x1 + d });
    else if (l === 'egout') poser({ ...depart, egout: depart.egout + d });
    else poser({ ...depart, sol: depart.sol + d });
  };
  const horizontale = (l: Ligne) => l === 'egout' || l === 'sol';
  const saisir = (l: Ligne) => (e: PE<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget, racine = svg.current;
    if (!racine) return;
    el.setPointerCapture(e.pointerId);
    const a = pointSvg(racine, e), depart = cadre;
    const suivre = (ev: PointerEvent) => { const q = pointSvg(racine, ev); bouger(l, horizontale(l) ? q.y - a.y : q.x - a.x, depart); };
    const lacher = () => { el.removeEventListener('pointermove', suivre); el.removeEventListener('pointerup', lacher); el.removeEventListener('pointercancel', lacher); };
    el.addEventListener('pointermove', suivre);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };
  const clavier = (l: Ligne) => (e: KE<SVGElement>) => {
    const pas = PAS_CLAVIER * Math.max(L, H) * (e.shiftKey ? 10 : 1);
    const d = horizontale(l) ? (e.key === 'ArrowUp' ? -pas : e.key === 'ArrowDown' ? pas : 0) : (e.key === 'ArrowLeft' ? -pas : e.key === 'ArrowRight' ? pas : 0);
    if (!d) return;
    e.preventDefault();
    bouger(l, d, cadre);
  };
  // Les zones de saisie font 44 px a l'ecran, quel que soit le zoom de la photo.
  const saisie = 44 / echelle;
  const haut = gabaritSurLaVue(gabarit, { x0: cadre.x0, x1: cadre.x1, y0: cadre.egout, y1: cadre.sol });
  const sommet = Math.min(cadre.egout, ...haut.map((p) => p.y));
  const ligne = (l: Ligne, x1: number, y1: number, x2: number, y2: number) => (
    <g key={l}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={'ajusterMurLigne ' + l} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="ajusterMurSaisie" strokeWidth={saisie} role="slider" tabIndex={0} aria-label={NOMS[l]}
        aria-orientation={horizontale(l) ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(horizontale(l) ? y1 : x1)} onPointerDown={saisir(l)} onKeyDown={clavier(l)} />
    </g>
  );
  return (
    <div className="ajusterMur">
      <svg ref={svg} className="ajusterMurPhoto" viewBox={`0 0 ${L} ${H}`} role="group" aria-label="Photo redressée entière : tirez l’égout, le sol et les bouts ; la silhouette du mur suit">
        <image href={vue.url} x={0} y={0} width={L} height={H} />
        <polyline points={gabaritSurLaVue(contourDuGabarit(gabarit), { x0: cadre.x0, x1: cadre.x1, y0: cadre.egout, y1: cadre.sol }).map((p) => p.x + ',' + p.y).join(' ')} className="ajusterMurLigne silhouette" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        {ligne('egout', cadre.x0, cadre.egout, cadre.x1, cadre.egout)}
        {ligne('sol', cadre.x0, cadre.sol, cadre.x1, cadre.sol)}
        {ligne('gauche', cadre.x0, sommet, cadre.x0, cadre.sol)}
        {ligne('droite', cadre.x1, sommet, cadre.x1, cadre.sol)}
        <text x={(cadre.x0 + cadre.x1) / 2} y={cadre.egout + 18 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Égout</text>
        <text x={(cadre.x0 + cadre.x1) / 2} y={cadre.sol + 18 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Sol</text>
      </svg>
      <p className="calNote">La silhouette du mur vient du plan et du LiDAR : sa forme ne change pas, elle suit l’égout, le sol et les bouts. Ils se tirent au doigt ou aux flèches (Maj : dix fois plus).</p>
    </div>
  );
}
