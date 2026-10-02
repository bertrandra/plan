// Le releve de facade (zones/Releve.tsx), etape 1 : choisir le mur.

import { Icone } from '../icones.js';
import { type Facade } from '../../facade/geometrie.js';
import type { ObjetPolygone } from '../../model/types.js';
import { fr } from './commun.js';

/* ------------------------------------------------------------------------------------------------
 * 1. Le mur
 * --------------------------------------------------------------------------------------------- */

export function ChoixMur({ bat, facades, onChoisir }: { bat: ObjetPolygone; facades: Facade[]; onChoisir: (cote: number) => void }) {
  const pts = bat.pts;
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const marge = Math.max(x1 - x0, y1 - y0) * 0.28 + 1;
  // Nord en haut : Y du plan vers le haut, donc -y dans le SVG.
  const vb = `${x0 - marge} ${-y1 - marge} ${x1 - x0 + 2 * marge} ${y1 - y0 + 2 * marge}`;
  const releve = new Set((bat.facades || []).map((r) => r.cote));
  const taille = Math.max(x1 - x0, y1 - y0);
  return (
    <div className="releveCorps">
      <p className="releveConsigne">Touchez le mur à photographier. Le nord est en haut.</p>
      <svg className="releveMur" viewBox={vb} role="group" aria-label="Contour du bâtiment">
        <polygon points={pts.map((p) => `${p.x},${-p.y}`).join(' ')} className="releveMurContour" vectorEffect="non-scaling-stroke" />
        {facades.map((f) => {
          const m = { x: (f.gauche.x + f.droite.x) / 2, y: (f.gauche.y + f.droite.y) / 2 };
          const lx = m.x + f.normale.x * taille * 0.12,
            ly = m.y + f.normale.y * taille * 0.12;
          return (
            <g
              key={f.cote}
              role="button"
              tabIndex={0}
              aria-label={`Façade ${f.orientation}, ${fr(f.largeur)} mètres`}
              className={'releveMurCote' + (releve.has(f.cote) ? ' releve' : '')}
              onClick={() => onChoisir(f.cote)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onChoisir(f.cote);
              }}
            >
              <line x1={f.gauche.x} y1={-f.gauche.y} x2={f.droite.x} y2={-f.droite.y} className="releveMurCible" vectorEffect="non-scaling-stroke" />
              <line x1={f.gauche.x} y1={-f.gauche.y} x2={f.droite.x} y2={-f.droite.y} className="releveMurTrait" vectorEffect="non-scaling-stroke" />
              <text x={lx} y={-ly} fontSize={taille * 0.07} textAnchor="middle" dominantBaseline="middle">
                {f.orientation}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="releveListe" role="group" aria-label="Façades">
        {facades.map((f) => (
          <button data-controle="releve.choisirMur" key={f.cote} type="button" className="secondary" onClick={() => onChoisir(f.cote)}>
            <span>
              Façade {f.orientation.toLowerCase()} · {fr(f.largeur)} m
            </span>
            {releve.has(f.cote) && (
              <span className="releveDeja">
                <Icone nom="coche" taille={16} /> relevée
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
