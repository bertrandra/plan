// La reprise a la main du mur sur une photo redressee entiere (MD/spec-releve-facade.md §6.1 bis) : l'egout, le sol et les deux bouts
// sont quatre lignes que l'on tire, sur la photo tournee de face par ses reperes. Le mur cherche automatiquement en est le depart.
//
// Sur la vue de face, l'egout et le sol sont horizontaux et les bouts verticaux : quatre nombres suffisent, et le geste est le plus
// simple qui soit (une ligne ne se tire que dans son sens). Le rectangle retenu revient sur la photo par l'homographie du redressement :
// ce sont les quatre coins du mur, que la chaine traite comme poses a la main (zones/releve/chaine.ts).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import { appliquer, type Image, type P2 } from '../../facade/homographie.js';
import { inverser, redresserParReperes } from '../../facade/redressementFuites.js';
import { versJpeg } from '../../ui/releve/camera.js';
import { pointSvg, useEchelle } from './commun.js';

/** Le mur sur la vue de face : egout et sol (y), bouts (x), en pixels de la vue. */
interface MurVue { x0: number; x1: number; y0: number; y1: number }
type Bord = 'egout' | 'sol' | 'gauche' | 'droite';

const NOMS: Record<Bord, string> = { egout: 'Égout', sol: 'Sol', gauche: 'Bout gauche du mur', droite: 'Bout droit du mur' };
/** Un pas au clavier, en part du grand cote de la vue. */
const PAS_CLAVIER = 0.002;

/** Les quatre coins du mur sur la vue de face (haut gauche, haut droit, bas droit, bas gauche) ramenes a un rectangle droit. */
function murDeLaVue(coins: readonly P2[]): MurVue {
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  return { x0: (hg.x + bg.x) / 2, x1: (hd.x + bd.x) / 2, y0: (hg.y + hd.y) / 2, y1: (bd.y + bg.y) / 2 };
}

export function AjusterMur({ charger, reperes, mur, changer }: {
  /** Les pixels de la photo, lus a la demande (le decodage d'une photo coute). */
  charger: () => Promise<Image | null>;
  /** Le rectangle du mur qui redresse la photo : les reperes poses, sinon les coins du mur deja retenus. */
  reperes: readonly P2[];
  /** Les coins du mur sur la photo, trouves ou deja ajustes : le depart des quatre lignes ; null, un cadre au milieu. */
  mur: readonly P2[] | null;
  /** Les coins du mur sur la photo, a chaque geste. */
  changer: (coins: P2[]) => void;
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
    const { largeur: L, hauteur: H } = vue.r.image;
    setCadre(mur?.length === 4 ? murDeLaVue(mur.map((c) => appliquer(vue.versVue, c))) : { x0: 0.15 * L, x1: 0.85 * L, y0: 0.2 * H, y1: 0.8 * H });
  }, [vue, mur]);
  const svg = useRef<SVGSVGElement>(null);
  const L = vue?.r.image.largeur ?? 1, H = vue?.r.image.hauteur ?? 1;
  const echelle = useEchelle(svg, L);
  if (erreur) return <p className="calNote" role="alert">La photo ne se lit pas : le mur ne peut pas être ajusté ici.</p>;
  if (!vue || !cadre) return <p className="calNote">Redressement de la photo…</p>;

  const poser = (c: MurVue) => {
    // Un mur garde un peu de largeur et de hauteur : deux lignes ne se croisent pas.
    const min = 0.02 * Math.max(L, H);
    const n = { x0: Math.min(c.x0, cadre.x1 - min), x1: Math.max(c.x1, cadre.x0 + min), y0: Math.min(c.y0, cadre.y1 - min), y1: Math.max(c.y1, cadre.y0 + min) };
    setCadre(n);
    const coins = [{ x: n.x0, y: n.y0 }, { x: n.x1, y: n.y0 }, { x: n.x1, y: n.y1 }, { x: n.x0, y: n.y1 }];
    changer(coins.map((p) => { const q = appliquer(vue.r.versPhoto, p); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }; }));
  };
  const deplacer = (b: Bord, v: number) => poser({ ...cadre, ...(b === 'egout' ? { y0: v } : b === 'sol' ? { y1: v } : b === 'gauche' ? { x0: v } : { x1: v }) });
  const vertical = (b: Bord) => b === 'gauche' || b === 'droite';
  const valeur = (b: Bord) => (b === 'egout' ? cadre.y0 : b === 'sol' ? cadre.y1 : b === 'gauche' ? cadre.x0 : cadre.x1);
  const saisir = (b: Bord) => (e: PE<SVGLineElement>) => {
    e.preventDefault();
    const el = e.currentTarget, racine = svg.current;
    if (!racine) return;
    el.setPointerCapture(e.pointerId);
    const depart = pointSvg(racine, e), v0 = valeur(b);
    const bouger = (ev: PointerEvent) => { const q = pointSvg(racine, ev); deplacer(b, v0 + (vertical(b) ? q.x - depart.x : q.y - depart.y)); };
    const lacher = () => { el.removeEventListener('pointermove', bouger); el.removeEventListener('pointerup', lacher); el.removeEventListener('pointercancel', lacher); };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };
  const clavier = (b: Bord) => (e: KE<SVGLineElement>) => {
    const pas = PAS_CLAVIER * Math.max(L, H) * (e.shiftKey ? 10 : 1);
    const sens = vertical(b) ? (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) : (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0);
    if (!sens) return;
    e.preventDefault();
    deplacer(b, valeur(b) + sens * pas);
  };
  // La zone de saisie d'une ligne fait 44 px a l'ecran, quel que soit le zoom de la photo.
  const saisie = 44 / echelle;
  const ligne = (b: Bord) => {
    const v = valeur(b);
    const [x1, y1, x2, y2] = vertical(b) ? [v, cadre.y0, v, cadre.y1] : [cadre.x0, v, cadre.x1, v];
    return (
      <g key={b}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} className={'ajusterMurLigne ' + b} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="ajusterMurSaisie" strokeWidth={saisie} role="slider" tabIndex={0} aria-label={NOMS[b]}
          aria-orientation={vertical(b) ? 'horizontal' : 'vertical'} aria-valuenow={Math.round(v)} onPointerDown={saisir(b)} onKeyDown={clavier(b)} />
      </g>
    );
  };
  return (
    <div className="ajusterMur">
      <svg ref={svg} className="ajusterMurPhoto" viewBox={`0 0 ${L} ${H}`} role="group" aria-label="Photo redressée entière : tirez l’égout, le sol et les bouts du mur">
        <image href={vue.url} x={0} y={0} width={L} height={H} />
        {(['egout', 'sol', 'gauche', 'droite'] as const).map(ligne)}
        <text x={(cadre.x0 + cadre.x1) / 2} y={cadre.y0 - 8 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Égout</text>
        <text x={(cadre.x0 + cadre.x1) / 2} y={cadre.y1 + 18 / echelle} fontSize={13 / echelle} textAnchor="middle" className="ajusterMurEtiquette">Sol</text>
      </svg>
    </div>
  );
}
