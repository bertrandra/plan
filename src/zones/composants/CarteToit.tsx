// La carte des hauteurs mesurees d'un toit et de son decoupage (ui/champs/carteToit.ts) : les
// cellules du LiDAR en couleurs, le contour, les corps en tirets, leurs faitages, les pignons qui
// partent du faitage. Une legende dit ce que chaque trait veut dire : la couleur ne parle pas seule.

import { useId } from 'react';
import type { CarteToit as Carte, PointCarte } from '../../ui/champs/carteToit.js';

const fr = (v: number) => v.toFixed(1).replace('.', ',');
const pts = (q: readonly PointCarte[]) => q.map((p) => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');

export function CarteToit({ carte }: { carte: Carte }) {
  const { largeur: L, hauteur: H } = carte;
  // Un identifiant de decoupe propre a cette carte : deux inspecteurs ouverts ne partagent pas le leur.
  const idClip = 'carteToit-' + useId().replace(/:/g, '');
  const taille = Math.max(L, H);
  const police = taille * 0.045;
  return (
    <figure className="carteToit">
      <svg viewBox={`0 0 ${L.toFixed(2)} ${H.toFixed(2)}`} role="img" aria-label={`Carte des hauteurs mesurées, de ${fr(carte.zMin)} à ${fr(carte.zMax)} m, et découpage du toit`}>
        {/* Les cellules du LiDAR sont des carres du plan, tournes dans l'axe du batiment : coupees au contour. */}
        <clipPath id={idClip}><polygon points={pts(carte.contour)} /></clipPath>
        <g clipPath={`url(#${idClip})`}>
          {carte.cellules.map((c, i) => (
            <polygon key={i} points={pts(c.coins)} fill={c.couleur} stroke={c.couleur} strokeWidth={0.02}>
              <title>{fr(c.z) + ' m'}</title>
            </polygon>
          ))}
        </g>
        <polygon className="carteContour" points={pts(carte.contour)} vectorEffect="non-scaling-stroke" />
        {carte.corps.map((k, i) => <polygon key={'c' + i} className="carteCorps" points={pts(k.coins)} vectorEffect="non-scaling-stroke" />)}
        {carte.pignons.map((p, i) => <polygon key={'p' + i} className="cartePignon" points={pts(p.coins)} vectorEffect="non-scaling-stroke" />)}
        {carte.corps.map((k, i) => k.faitage && <line key={'f' + i} className="carteFaitage" x1={k.faitage.de.x} y1={k.faitage.de.y} x2={k.faitage.a.x} y2={k.faitage.a.y} vectorEffect="non-scaling-stroke" />)}
        {carte.corps.flatMap((k, i) => k.aretiers.map((t, j) => <line key={'a' + i + '-' + j} className="carteFaitage" x1={t.de.x} y1={t.de.y} x2={t.a.x} y2={t.a.y} vectorEffect="non-scaling-stroke" />))}
        {carte.pignons.map((p, i) => <line key={'g' + i} className="carteFaitagePignon" x1={p.faitage.de.x} y1={p.faitage.de.y} x2={p.faitage.a.x} y2={p.faitage.a.y} vectorEffect="non-scaling-stroke" />)}
        {carte.corps.map((k, i) => (
          <text key={'t' + i} className="carteLibelle" x={k.libelle.a.x} y={k.libelle.a.y - police * 0.5} fontSize={police} strokeWidth={police * 0.22} textAnchor="middle">{k.libelle.texte}</text>
        ))}
        <g className="carteNord" transform={`translate(${(L - police * 1.5).toFixed(2)} ${(police * 1.8).toFixed(2)}) rotate(${(-carte.nord).toFixed(1)})`}>
          <path d={`M 0 ${-police} L ${police * 0.45} ${police * 0.6} L 0 ${police * 0.25} L ${-police * 0.45} ${police * 0.6} Z`} />
          <text y={-police * 1.25} fontSize={police * 0.9} textAnchor="middle">N</text>
        </g>
      </svg>
      <figcaption className="carteToitLegende">
        <span className="carteDegrade" aria-hidden="true" />
        <span>{fr(carte.zMin)} → {fr(carte.zMax)} m</span>
        <span><i className="cleCorps" aria-hidden="true" /> corps</span>
        <span><i className="cleFaitage" aria-hidden="true" /> faîtage, arêtiers</span>
        <span><i className="clePignon" aria-hidden="true" /> pignon</span>
      </figcaption>
    </figure>
  );
}
