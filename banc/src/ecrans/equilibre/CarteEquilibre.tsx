// La carte de l'ecran d'equilibre (demande du proprietaire, 15 novembre 2026) : les photos du banc a leur place, sur le fond de l'IGN,
// regroupees en ronds qui disent leur nombre (equilibre.ts::amasser). Elle se zoome et se deplace (ui/carteSimple.tsx) ; toucher un
// rond s'en approche. Elle ne lit que des tuiles.

import { useCallback, useMemo } from 'react';
import { barreEchelle, FRANCE, metresParPixel, texteEchelle, vuePourEmprise, type Taille } from '../../carte.js';
import { amasser, empriseDesPoints, rayonAmas, type PointImage } from '../../equilibre.js';
import { FondIgn, useCarteSimple } from '../../ui/carteSimple.js';
import { Icone } from '../../ui/Icones.js';

export function CarteEquilibre({ points }: { points: readonly PointImage[] }) {
  // A l'ouverture : toutes les photos dans le cadre ; sans photo situee, la France.
  const toutVoir = useCallback((t: Taille) => vuePourEmprise(empriseDesPoints(points) ?? FRANCE, t, 1.15), [points]);
  const { cadre, taille, vue, zoomer, recadrer, gestes } = useCarteSimple(toutVoir);
  const amas = useMemo(() => (vue && taille.l ? amasser(points, vue, taille) : []), [points, vue, taille]);
  const barre = vue ? barreEchelle(metresParPixel(vue.lat, vue.zoom)) : null;
  return (
    <div className="carte-equilibre">
      <div className="carte-cadre" ref={cadre} tabIndex={0} role="application" aria-label={`Carte des ${points.length} photo(s) du banc qui ont une position`} {...gestes}>
        {vue && <FondIgn vue={vue} taille={taille} />}
        <svg className="carte-dessin" width={taille.l} height={taille.h} aria-hidden={!amas.length}>
          {amas.map((a) => {
            const r = rayonAmas(a.n);
            return (
              <g key={`${a.x.toFixed(0)}-${a.y.toFixed(0)}`} className="amas" transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`} role="button" tabIndex={0}
                aria-label={`${a.n} photo(s) ici : s’approcher`} onClick={() => zoomer(2, a)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); zoomer(2, a); } }}>
                <circle r={r} />
                {a.n > 1 && <text dy=".35em">{a.n}</text>}
              </g>
            );
          })}
        </svg>
        <div className="carte-zoom">
          <button type="button" aria-label="Zoomer" title="Zoomer (+)" onClick={() => zoomer(1)}>+</button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer (−)" onClick={() => zoomer(-1)}>−</button>
          <button type="button" aria-label="Voir toutes les photos" title="Voir toutes les photos (0)" onClick={recadrer}><Icone nom="point" taille={18} /></button>
        </div>
        <div className="carte-pied" aria-hidden="true">
          {barre && <span className="carte-echelle" style={{ width: barre.px }}>{texteEchelle(barre.metres)}</span>}
          <span className="carte-credit">© IGN</span>
        </div>
      </div>
      <p className="carte-legende"><span><i className="pastille-amas" /> un rond par groupe de photos voisines, son nombre dedans ; touchez-le pour vous approcher</span></p>
    </div>
  );
}
