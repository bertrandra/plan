// La reprise a la main du mur sur une photo redressee entiere (MD/spec-releve-facade.md §6.1 bis) : la silhouette du haut du mur, le
// sol et les deux bouts, sur la photo tournee de face par ses reperes. Le mur cherche automatiquement en est le depart.
//
// Le haut du mur n'est pas toujours une ligne : un pignon fait un triangle, un appentis une rampe. C'est donc une ligne brisee dont on
// tire les sommets ; ses deux bouts sont aux angles du mur, et l'egout est le plus bas des deux. Le sol et les bouts sont des lignes,
// horizontale et verticales sur la vue de face : elles ne se tirent que dans leur sens. Tout revient sur la photo par l'homographie du
// redressement : les quatre coins du mur, que la chaine traite comme poses a la main (zones/releve/chaine.ts), et la silhouette.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import { appliquer, type Image, type P2 } from '../../facade/homographie.js';
import { inverser, redresserParReperes } from '../../facade/redressementFuites.js';
import { lireSilhouette } from '../../facade/mosaiqueFuites.js';
import { versJpeg } from '../../ui/releve/camera.js';
import { pointSvg, useEchelle } from './commun.js';

/** Le mur sur la vue de face : ses bouts (x), son sol (y), et la silhouette de son haut, d'un bout a l'autre. */
interface MurVue { x0: number; x1: number; sol: number; haut: P2[] }
/** Ce que la personne a retenu, sur la photo : les quatre coins du mur et la silhouette de son haut. */
export interface MurAjuste { coins: P2[]; silhouette: P2[] }

/** Un pas au clavier, en part du grand cote de la vue. */
const PAS_CLAVIER = 0.002;
/** Deux lignes du mur gardent au moins cet ecart, en part du grand cote. */
const ECART_MIN = 0.02;

const egoutDe = (m: MurVue): number => Math.max((m.haut[0] as P2).y, (m.haut[m.haut.length - 1] as P2).y);

/** Le mur de depart sur la vue : la silhouette donnee, sinon celle que lit la vue entre les coins donnes, sinon une ligne a l'egout. */
function murDeDepart(vue: { image: Image; vu: Uint8Array }, coins: readonly P2[] | null, silhouette: readonly P2[] | null): MurVue {
  const { largeur: L, hauteur: H } = vue.image;
  const rect = coins?.length === 4
    ? { x0: ((coins[0] as P2).x + (coins[3] as P2).x) / 2, x1: ((coins[1] as P2).x + (coins[2] as P2).x) / 2, y0: ((coins[0] as P2).y + (coins[1] as P2).y) / 2, y1: ((coins[2] as P2).y + (coins[3] as P2).y) / 2 }
    : { x0: 0.15 * L, x1: 0.85 * L, y0: 0.2 * H, y1: 0.8 * H };
  const haut = silhouette && silhouette.length >= 2 ? [...silhouette] : lireSilhouette(vue, rect)?.silhouette ?? [{ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y0 }];
  // Les bouts de la silhouette sont les angles du mur.
  haut[0] = { x: rect.x0, y: (haut[0] as P2).y };
  haut[haut.length - 1] = { x: rect.x1, y: (haut[haut.length - 1] as P2).y };
  return { x0: rect.x0, x1: rect.x1, sol: rect.y1, haut };
}

export function AjusterMur({ charger, reperes, mur, silhouette, changer }: {
  /** Les pixels de la photo, lus a la demande (le decodage d'une photo coute). */
  charger: () => Promise<Image | null>;
  /** Le rectangle du mur qui redresse la photo : les reperes poses, sinon les coins du mur deja retenus. */
  reperes: readonly P2[];
  /** Les coins du mur sur la photo, trouves ou deja ajustes : le depart des lignes ; null, un cadre au milieu. */
  mur: readonly P2[] | null;
  /** La silhouette du haut du mur sur la photo, deja ajustee ; null : celle que lit la photo redressee. */
  silhouette?: readonly P2[] | null;
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
    const versVue = (c: P2) => appliquer(vue.versVue, c);
    setCadre(murDeDepart(vue.r, mur ? mur.map(versVue) : null, silhouette ? silhouette.map(versVue) : null));
  }, [vue, mur, silhouette]);
  const svg = useRef<SVGSVGElement>(null);
  const L = vue?.r.image.largeur ?? 1, H = vue?.r.image.hauteur ?? 1;
  const echelle = useEchelle(svg, L);
  if (erreur) return <p className="calNote" role="alert">La photo ne se lit pas : le mur ne peut pas être ajusté ici.</p>;
  if (!vue || !cadre) return <p className="calNote">Redressement de la photo…</p>;

  const min = ECART_MIN * Math.max(L, H);
  const poser = (c: MurVue) => {
    // Les bouts restent ecartes, le haut au-dessus du sol, les sommets entre les bouts et dans l'ordre.
    const x0 = Math.min(c.x0, c.x1 - min), x1 = Math.max(c.x1, x0 + min);
    const haut = c.haut.map((p, i, t) => ({ x: i === 0 ? x0 : i === t.length - 1 ? x1 : Math.min(x1 - 1, Math.max(x0 + 1, p.x)), y: Math.min(p.y, c.sol - min) }));
    for (let i = 1; i < haut.length - 1; i++) (haut[i] as P2).x = Math.max((haut[i - 1] as P2).x + 1, (haut[i] as P2).x);
    const n: MurVue = { x0, x1, sol: Math.max(c.sol, Math.max(...haut.map((p) => p.y)) + min), haut };
    setCadre(n);
    const egout = egoutDe(n);
    const versPhoto = (p: P2) => { const q = appliquer(vue.r.versPhoto, p); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; };
    changer({ coins: [{ x: x0, y: egout }, { x: x1, y: egout }, { x: x1, y: n.sol }, { x: x0, y: n.sol }].map(versPhoto), silhouette: n.haut.map(versPhoto) });
  };
  type Prise = { type: 'gauche' | 'droite' | 'sol' } | { type: 'sommet'; i: number };
  const bouger = (p: Prise, dx: number, dy: number, depart: MurVue) => {
    if (p.type === 'gauche') poser({ ...depart, x0: depart.x0 + dx });
    else if (p.type === 'droite') poser({ ...depart, x1: depart.x1 + dx });
    else if (p.type === 'sol') poser({ ...depart, sol: depart.sol + dy });
    else if (p.type === 'sommet') {
      const bout = p.i === 0 || p.i === depart.haut.length - 1;
      poser({ ...depart, haut: depart.haut.map((q, i) => (i === p.i ? { x: bout ? q.x : q.x + dx, y: q.y + dy } : q)) });
    }
  };
  const saisir = (p: Prise) => (e: PE<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget, racine = svg.current;
    if (!racine) return;
    el.setPointerCapture(e.pointerId);
    const a = pointSvg(racine, e), depart = cadre;
    const suivre = (ev: PointerEvent) => { const q = pointSvg(racine, ev); bouger(p, q.x - a.x, q.y - a.y, depart); };
    const lacher = () => { el.removeEventListener('pointermove', suivre); el.removeEventListener('pointerup', lacher); el.removeEventListener('pointercancel', lacher); };
    el.addEventListener('pointermove', suivre);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };
  const clavier = (p: Prise) => (e: KE<SVGElement>) => {
    const pas = PAS_CLAVIER * Math.max(L, H) * (e.shiftKey ? 10 : 1);
    if ((e.key === 'Delete' || e.key === 'Backspace') && p.type === 'sommet' && p.i > 0 && p.i < cadre.haut.length - 1) {
      e.preventDefault();
      poser({ ...cadre, haut: cadre.haut.filter((_, i) => i !== p.i) });
      return;
    }
    const dx = e.key === 'ArrowLeft' ? -pas : e.key === 'ArrowRight' ? pas : 0, dy = e.key === 'ArrowUp' ? -pas : e.key === 'ArrowDown' ? pas : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    bouger(p, dx, dy, cadre);
  };
  /** Un sommet de plus, au milieu du plus long troncon de la silhouette : de quoi dessiner une bosse (une lucarne, un pignon). */
  const ajouterSommet = () => {
    let k = 0, lmax = -1;
    for (let i = 0; i + 1 < cadre.haut.length; i++) { const a = cadre.haut[i] as P2, b = cadre.haut[i + 1] as P2; const l = Math.hypot(b.x - a.x, b.y - a.y); if (l > lmax) { lmax = l; k = i; } }
    const a = cadre.haut[k] as P2, b = cadre.haut[k + 1] as P2;
    poser({ ...cadre, haut: [...cadre.haut.slice(0, k + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...cadre.haut.slice(k + 1)] });
  };
  // Les zones de saisie font 44 px a l'ecran, quel que soit le zoom de la photo.
  const saisie = 44 / echelle, rayon = 7 / echelle;
  const egout = egoutDe(cadre);
  const ligne = (p: Prise & { type: 'gauche' | 'droite' | 'sol' }, nom: string, x1: number, y1: number, x2: number, y2: number) => (
    <g key={p.type}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={'ajusterMurLigne ' + p.type} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="ajusterMurSaisie" strokeWidth={saisie} role="slider" tabIndex={0} aria-label={nom}
        aria-orientation={p.type === 'sol' ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(p.type === 'sol' ? y1 : x1)} onPointerDown={saisir(p)} onKeyDown={clavier(p)} />
    </g>
  );
  const nomSommet = (i: number) => (i === 0 ? 'Égout, angle gauche' : i === cadre.haut.length - 1 ? 'Égout, angle droit' : 'Haut du mur, sommet ' + i);
  return (
    <div className="ajusterMur">
      <svg ref={svg} className="ajusterMurPhoto" viewBox={`0 0 ${L} ${H}`} role="group" aria-label="Photo redressée entière : tirez la silhouette du haut du mur, le sol et les bouts">
        <image href={vue.url} x={0} y={0} width={L} height={H} />
        <line x1={cadre.x0} y1={egout} x2={cadre.x1} y2={egout} className="ajusterMurEgout" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <polyline points={cadre.haut.map((p) => p.x + ',' + p.y).join(' ')} className="ajusterMurLigne silhouette" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        {ligne({ type: 'sol' }, 'Sol', cadre.x0, cadre.sol, cadre.x1, cadre.sol)}
        {ligne({ type: 'gauche' }, 'Bout gauche du mur', cadre.x0, Math.min(...cadre.haut.map((p) => p.y)), cadre.x0, cadre.sol)}
        {ligne({ type: 'droite' }, 'Bout droit du mur', cadre.x1, Math.min(...cadre.haut.map((p) => p.y)), cadre.x1, cadre.sol)}
        {cadre.haut.map((p, i) => (
          <g key={'s' + i}>
            <circle cx={p.x} cy={p.y} r={saisie / 2} className="ajusterMurSaisie" role="slider" tabIndex={0} aria-label={nomSommet(i)} aria-valuenow={Math.round(p.y)}
              onPointerDown={saisir({ type: 'sommet', i })} onKeyDown={clavier({ type: 'sommet', i })} />
            <circle cx={p.x} cy={p.y} r={rayon} className="ajusterMurSommet" pointerEvents="none" />
          </g>
        ))}
        <text x={(cadre.x0 + cadre.x1) / 2} y={egout + 18 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Égout</text>
        <text x={(cadre.x0 + cadre.x1) / 2} y={cadre.sol + 18 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Sol</text>
      </svg>
      <button type="button" className="secondary small" data-controle="releve.ajouterSommet" onClick={ajouterSommet}>Ajouter un sommet au haut du mur</button>
      <p className="calNote">Les sommets se tirent au doigt ou aux flèches (Maj : dix fois plus) ; Suppr retire un sommet choisi.</p>
    </div>
  );
}
