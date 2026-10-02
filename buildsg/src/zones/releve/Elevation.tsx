// Le releve de facade (zones/Releve.tsx), etape 5 : l'elevation redressee et ses ouvertures.

import { au } from '../../util/tableaux.js';
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import type { OuvertureFacade, PartieBasse } from '../../model/types.js';
import { LIBELLES_OUVERTURE, fr, pointSvg, useEchelle } from './commun.js';

/* ------------------------------------------------------------------------------------------------
 * 5. Le resultat : ouvertures corrigeables, toit propose
 * --------------------------------------------------------------------------------------------- */

export function Elevation({
  texture,
  partie,
  Ht,
  L,
  H,
  ouvertures,
  setOuvertures,
  choisie,
  setChoisie,
}: {
  texture: string;
  /** Hauteur couverte par la texture : le mur, et au-dessus la bande du pignon, hors du cadre. */
  Ht: number;
  /** Mur en L : au-dessus de la partie basse, il n'y a pas de mur. */
  partie?: PartieBasse | null;
  L: number;
  H: number;
  ouvertures: OuvertureFacade[];
  setOuvertures: (o: OuvertureFacade[]) => void;
  choisie: number | null;
  setChoisie: (i: number | null) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const echelle = useEchelle(svg, L);
  const r = 9 / echelle;

  /** Deplace l'ouverture (`coin` = -1) ou un de ses coins, en metres, au centimetre pres. */
  const saisir = (i: number, coin: number) => (e: PE<SVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setChoisie(i);
    const racine = svg.current;
    if (!racine) return;
    const depart = pointSvg(racine, e);
    const o0 = au(ouvertures, i);
    const bouger = (ev: PointerEvent) => {
      const q = pointSvg(racine, ev);
      const dx = q.x - depart.x,
        dy = -(q.y - depart.y); // SVG vers le bas, facade vers le haut
      const o = { ...o0 };
      if (coin === -1) {
        o.x = Math.max(0, Math.min(L - o.l, o0.x + dx));
        o.y = Math.max(0, Math.min(H - o.h, o0.y + dy));
      } else {
        const gauche = coin === 0 || coin === 3,
          dessus = coin === 0 || coin === 1;
        if (gauche) {
          o.x = Math.min(o0.x + o0.l - 0.2, Math.max(0, o0.x + dx));
          o.l = o0.x + o0.l - o.x;
        } else o.l = Math.max(0.2, Math.min(L - o0.x, o0.l + dx));
        if (dessus) o.h = Math.max(0.2, Math.min(H - o0.y, o0.h + dy));
        else {
          o.y = Math.min(o0.y + o0.h - 0.2, Math.max(0, o0.y + dy));
          o.h = o0.y + o0.h - o.y;
        }
      }
      const cm = (v: number) => Math.round(v * 100) / 100;
      const n = [...ouvertures];
      n[i] = { ...o, x: cm(o.x), y: cm(o.y), l: cm(o.l), h: cm(o.h) };
      setOuvertures(n);
    };
    const lacher = () => {
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lacher);
      el.removeEventListener('pointercancel', lacher);
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };

  return (
    <svg ref={svg} className="releveElevation" viewBox={`${-0.2} ${-0.2} ${L + 0.4} ${H + 0.4}`} onPointerDown={() => setChoisie(null)} aria-label="Façade redressée et ses ouvertures">
      <svg x={0} y={0} width={L} height={H} viewBox={`0 0 ${L} ${H}`} overflow="hidden">
        <image href={texture} x={0} y={H - Ht} width={L} height={Ht} preserveAspectRatio="none" />
      </svg>
      <rect x={0} y={0} width={L} height={H} className="releveElevationCadre" vectorEffect="non-scaling-stroke" />
      {partie && <rect x={partie.debut} y={0} width={partie.fin - partie.debut} height={H - partie.hauteur} className="releveVide" pointerEvents="none" />}
      {ouvertures.map((o, i) => {
        const y = H - o.y - o.h;
        const sel = i === choisie;
        return (
          <g key={i} className={'releveOuverture' + (sel ? ' choisie' : '')}>
            <rect x={o.x} y={y} width={o.l} height={o.h} vectorEffect="non-scaling-stroke" onPointerDown={saisir(i, -1)} role="button" aria-label={`${LIBELLES_OUVERTURE[o.type]} ${fr(o.l)} × ${fr(o.h)} m`} tabIndex={0} />
            <text x={o.x + o.l / 2} y={y + o.h / 2} fontSize={12 / echelle} strokeWidth={3 / echelle} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
              {Math.round(o.l * 100)}×{Math.round(o.h * 100)}
            </text>
            {sel &&
              [
                [o.x, y],
                [o.x + o.l, y],
                [o.x + o.l, y + o.h],
                [o.x, y + o.h],
              ].map(([cx, cy], k) => <circle key={k} cx={cx} cy={cy} r={r} className="relevePoignee" onPointerDown={saisir(i, k)} />)}
          </g>
        );
      })}
    </svg>
  );
}

export function ChampCm({ libelle, valeur, onChange }: { libelle: string; valeur: number; onChange: (v: number) => void }) {
  const [texte, setTexte] = useState(String(Math.round(valeur * 100)));
  useEffect(() => setTexte(String(Math.round(valeur * 100))), [valeur]);
  return (
    <label className="releveCm">
      <span>{libelle}</span>
      <span className="champNombre">
        <input data-controle="releve.cote"
          type="number"
          inputMode="numeric"
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= 0) onChange(v / 100);
          }}
        />
        <span className="unite">cm</span>
      </span>
    </label>
  );
}
