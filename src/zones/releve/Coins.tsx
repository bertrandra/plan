// Le geste « quatre repères » (zones/releve/PoserReperes.tsx) : quatre points poses au doigt sur la photo, avec une loupe. Ils
// peuvent deborder de la photo.

import { au } from '../../util/tableaux.js';
import { useRef, useState, type PointerEvent as PE } from 'react';
import type { P2 } from '../../facade/vision/homographie.js';
import { type Photo } from '../../ui/releve/camera.js';
import { pointSvg, useEchelle } from './commun.js';

export function Coins({ photo, coins, setCoins, noms, libelle }: {
  photo: Photo;
  coins: P2[];
  /** Les points apres un geste. */
  setCoins: (c: P2[]) => void;
  /** Le nom de chaque point, pour le lecteur d'ecran. */
  noms: readonly string[];
  libelle: string;
}) {
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

  const loupe = actif !== null ? au(coins, actif) : null;
  const fen = Math.max(W, H) * 0.06;

  return (
    <div className="releveCoinsZone">
      <svg ref={svg} className="releveCoins" viewBox={`${-m} ${-m} ${W + 2 * m} ${H + 2 * m}`} aria-label={libelle}>
        <rect x={-m} y={-m} width={W + 2 * m} height={H + 2 * m} className="releveCoinsFond" />
        <image href={photo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        <polygon points={coins.map((c) => `${c.x},${c.y}`).join(' ')} className="releveQuad" vectorEffect="non-scaling-stroke" />
        {coins.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.x}
              cy={c.y}
              r={r * 1.7}
              className="releveCoinCible"
              onPointerDown={saisirCoin(i)}
              role="slider"
              aria-label={noms[i] ?? ''}
              aria-valuenow={0}
              tabIndex={0}
            />
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
