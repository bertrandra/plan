// Le releve de facade (zones/Releve.tsx), etape 3 : les coins du mur sur la photo.

import { au } from '../../util/tableaux.js';
import { useRef, useState, type PointerEvent as PE } from 'react';
import { type CoteBas, type Decrochement } from '../../facade/profil.js';
import type { P2 } from '../../facade/homographie.js';
import { type Photo } from '../../ui/releve/camera.js';
import { pointSvg, useEchelle } from './commun.js';

/* ------------------------------------------------------------------------------------------------
 * 3. Les coins
 * --------------------------------------------------------------------------------------------- */

const NOMS_COINS = ['Égout, à gauche', 'Égout, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche'];

/** Les poignees d'un mur en L : les quatre coins visibles du L, puis les deux points du decrochement. */
export function nomsEnL(cote: CoteBas): string[] {
  return cote === 'droite'
    ? ['Égout haut, à gauche', 'Égout bas, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche', 'Décrochement, égout haut', 'Décrochement, égout bas']
    : ['Égout bas, à gauche', 'Égout haut, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche', 'Décrochement, égout haut', 'Décrochement, égout bas'];
}

/** Ordre de trace du contour : le rectangle, ou le L en passant par le decrochement. */
export function ordreDuContour(decro: Decrochement | null | undefined): number[] {
  if (!decro) return [0, 1, 2, 3];
  return decro.cote === 'droite' ? [0, 4, 5, 1, 2, 3] : [0, 5, 4, 1, 2, 3];
}

/** Le decrochement propose quand on bascule en L : aux trois cinquiemes du mur, cote bas. */
export function decrochementPropose(coins: readonly P2[], cote: CoteBas): Decrochement {
  const t = cote === 'droite' ? 0.6 : 0.4;
  const lerp = (a: P2, b: P2, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const haut = lerp(au(coins, 0), au(coins, 1), t);
  const pied = lerp(au(coins, 3), au(coins, 2), t);
  return { cote, haut, bas: lerp(haut, pied, 0.5) };
}

export function Coins({ photo, coins, setCoins, noms = NOMS_COINS, ordre = [0, 1, 2, 3] }: { photo: Photo; coins: P2[]; setCoins: (c: P2[]) => void; noms?: string[]; ordre?: number[] }) {
  const W = photo.image.largeur,
    H = photo.image.hauteur;
  const m = Math.max(W, H) * 0.22;
  const svg = useRef<SVGSVGElement>(null);
  const echelle = useEchelle(svg, W + 2 * m);
  const [actif, setActif] = useState<number | null>(null);
  const r = 16 / echelle;

  const saisirCoin = (i: number) => (e: PE<SVGCircleElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setActif(i);
    const racine = svg.current;
    if (!racine) return;
    const depart = pointSvg(racine, e);
    const origine = au(coins, i);
    const bouger = (ev: PointerEvent) => {
      const q = pointSvg(racine, ev);
      const n = [...coins];
      n[i] = { x: Math.max(-m, Math.min(W + m, origine.x + q.x - depart.x)), y: Math.max(-m, Math.min(H + m, origine.y + q.y - depart.y)) };
      setCoins(n);
    };
    const lacher = () => {
      setActif(null);
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lacher);
      el.removeEventListener('pointercancel', lacher);
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };

  const milieu = (a: P2, b: P2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const haut = milieu(au(coins, 0), au(coins, 1)),
    bas = milieu(au(coins, 2), au(coins, 3));
  const loupe = actif !== null ? au(coins, actif) : null;
  const fen = Math.max(W, H) * 0.06;

  return (
    <div className="releveCoinsZone">
      <svg ref={svg} className="releveCoins" viewBox={`${-m} ${-m} ${W + 2 * m} ${H + 2 * m}`} aria-label="Photo : placez les quatre coins du mur">
        <rect x={-m} y={-m} width={W + 2 * m} height={H + 2 * m} className="releveCoinsFond" />
        <image href={photo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        <polygon points={ordre.map((i) => au(coins, i)).map((c) => `${c.x},${c.y}`).join(' ')} className="releveQuad" vectorEffect="non-scaling-stroke" />
        <text x={haut.x} y={haut.y - r * 1.6} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Égout
        </text>
        <text x={bas.x} y={bas.y + r * 2.4} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Sol
        </text>
        {coins.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={r * 1.7} className="releveCoinCible" onPointerDown={saisirCoin(i)} role="slider" aria-label={noms[i]} aria-valuenow={0} tabIndex={0} />
            <circle cx={c.x} cy={c.y} r={r * 0.35} className="releveCoinCentre" pointerEvents="none" />
          </g>
        ))}
      </svg>
      {loupe && (
        <svg className="releveLoupe" viewBox={`${loupe.x - fen} ${loupe.y - fen} ${2 * fen} ${2 * fen}`} aria-hidden="true">
          <rect x={-m} y={-m} width={W + 2 * m} height={H + 2 * m} className="releveCoinsFond" />
          <image href={photo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          <path d={`M${loupe.x - fen} ${loupe.y}H${loupe.x + fen}M${loupe.x} ${loupe.y - fen}V${loupe.y + fen}`} className="releveLoupeCroix" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
