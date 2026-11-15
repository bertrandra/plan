// La carte de l'import en lot : la zone (dessinee ici : un rectangle en glissant, un polygone sommet apres sommet), ses paves a mesure
// que le parcours les lit, et les facades retenues. Le fond, la vue et les gestes viennent de ui/carteSimple.tsx.

import { useCallback, useEffect, useMemo, useState, type PointerEvent as PointeurReact } from 'react';
import { barreEchelle, duEcran, FRANCE, metresParPixel, texteEchelle, versEcran, vuePourEmprise, type Emprise, type P, type Taille } from '../../carte.js';
import { empriseDeLaZone, zoneDuRectangle, type Candidat, type Parcours, type Zone } from '../../lot.js';
import type { Ll } from '../../parcelles.js';
import { FondIgn, useCarteSimple } from '../../ui/carteSimple.js';
import { Icone } from '../../ui/Icones.js';
import type { OutilDeZone } from './useImportEnLot.js';

export function CarteZone({ zone, onZone, outil, parcours, retenues }: { zone: Zone | null; onZone: (z: Zone) => void; outil: OutilDeZone; parcours: Parcours | null; retenues: readonly Candidat[]; /** Change a chaque pave lu : la carte se redessine. */ version: number }) {
  const cadrer = useCallback((t: Taille) => vuePourEmprise(zone ? empriseDeLaZone(zone) : FRANCE, t, zone ? 1.3 : 1.05), [zone]);
  const { cadre, taille, vue, zoomer, recadrer, gestes } = useCarteSimple(cadrer, outil === 'main');
  // Une zone nouvelle (une commune, un point) : la carte y va.
  useEffect(() => { recadrer(); }, [zone, recadrer]);
  const [coin, setCoin] = useState<{ a: P; b: P } | null>(null);
  const [sommets, setSommets] = useState<Ll[]>([]);
  useEffect(() => { setCoin(null); setSommets([]); }, [outil]);

  const ou = (ev: PointeurReact): P => { const r = ev.currentTarget.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const dessin = (ev: PointeurReact<HTMLDivElement>) => !!vue && outil !== 'main' && !(ev.target as Element).closest('button');
  const appuyer = (ev: PointeurReact<HTMLDivElement>) => {
    if (!dessin(ev)) { gestes.onPointerDown(ev); return; }
    if (outil === 'rectangle') { ev.currentTarget.setPointerCapture(ev.pointerId); const p = ou(ev); setCoin({ a: p, b: p }); }
  };
  const bouger = (ev: PointeurReact<HTMLDivElement>) => { if (coin) setCoin({ a: coin.a, b: ou(ev) }); else gestes.onPointerMove(ev); };
  const lacher = (ev: PointeurReact<HTMLDivElement>) => {
    if (!vue || !dessin(ev)) { gestes.onPointerUp(ev); return; }
    if (outil === 'rectangle' && coin) {
      // Un rectangle de moins de huit pixels est un toucher, pas une zone.
      if (Math.abs(coin.b.x - coin.a.x) > 8 && Math.abs(coin.b.y - coin.a.y) > 8) onZone(zoneDuRectangle(duEcran(coin.a, vue, taille), duEcran(coin.b, vue, taille)));
      setCoin(null);
    } else if (outil === 'polygone') { const sommet = duEcran(ou(ev), vue, taille); setSommets((l) => [...l, sommet]); }
  };
  const fermer = () => { if (sommets.length >= 3) { onZone({ anneau: sommets }); setSommets([]); } };

  const chemin = (l: readonly Ll[], ferme = true) => (vue ? l.map((p, k) => { const e = versEcran(p, vue, taille); return `${k ? 'L' : 'M'}${e.x.toFixed(1)} ${e.y.toFixed(1)}`; }).join('') + (ferme ? 'Z' : '') : '');
  const rect = (e: Emprise) => { if (!vue) return null; const a = versEcran({ lat: e.nord, lon: e.ouest }, vue, taille), b = versEcran({ lat: e.sud, lon: e.est }, vue, taille); return { x: a.x, y: a.y, width: Math.max(0, b.x - a.x), height: Math.max(0, b.y - a.y) }; };
  const points = useMemo(() => (vue ? retenues.map((c) => ({ id: c.batiment.id, ...versEcran(c.photo, vue, taille) })) : []), [retenues, vue, taille]);
  const barre = vue ? barreEchelle(metresParPixel(vue.lat, vue.zoom)) : null;
  return (
    <div className="carte-lot">
      <div className={'carte-cadre' + (outil !== 'main' ? ' dessin' : '')} ref={cadre} tabIndex={0} role="application" aria-label="Carte de la zone à importer" onPointerDown={appuyer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={(e) => { setCoin(null); gestes.onPointerCancel(e); }} onKeyDown={gestes.onKeyDown}>
        {vue && <FondIgn vue={vue} taille={taille} />}
        <svg className="carte-dessin" width={taille.l} height={taille.h} aria-hidden="true">
          {parcours?.paves.map((p, k) => { const r = rect(p); return r && <rect key={k} className={'pave ' + (parcours.etats[k] ?? 'a-faire')} {...r} />; })}
          {zone && <path className="zone-lot" d={chemin(zone.anneau)} />}
          {coin && <rect className="zone-lot trace" x={Math.min(coin.a.x, coin.b.x)} y={Math.min(coin.a.y, coin.b.y)} width={Math.abs(coin.b.x - coin.a.x)} height={Math.abs(coin.b.y - coin.a.y)} />}
          {sommets.length > 0 && <path className="zone-lot trace" d={chemin(sommets, false)} />}
          {vue && sommets.map((p, k) => { const e = versEcran(p, vue, taille); return <circle key={k} className="sommet-lot" cx={e.x} cy={e.y} r={4} />; })}
          {points.map((p) => <circle key={p.id} className="facade-lot" cx={p.x} cy={p.y} r={4} />)}
        </svg>
        {outil === 'polygone' && sommets.length > 0 && (
          <div className="carte-avis outils-polygone">
            <button type="button" disabled={sommets.length < 3} onClick={fermer}>Fermer le polygone ({sommets.length} sommets)</button>
            <button type="button" className="discret" onClick={() => setSommets((l) => l.slice(0, -1))}>Retirer le dernier</button>
          </div>
        )}
        <div className="carte-zoom">
          <button type="button" aria-label="Zoomer" title="Zoomer (+)" onClick={() => zoomer(1)}>+</button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer (−)" onClick={() => zoomer(-1)}>−</button>
          <button type="button" aria-label={zone ? 'Revoir toute la zone' : 'Revoir la France entière'} title={zone ? 'Revoir toute la zone (0)' : 'Revoir la France entière (0)'} onClick={recadrer}><Icone nom="point" taille={18} /></button>
        </div>
        <div className="carte-pied" aria-hidden="true">
          {barre && <span className="carte-echelle" style={{ width: barre.px }}>{texteEchelle(barre.metres)}</span>}
          <span className="carte-credit">© IGN{retenues.length ? ' · photos Panoramax' : ''}</span>
        </div>
      </div>
      <p className="carte-legende"><span><i className="pastille-lot zone" /> la zone</span><span><i className="pastille-lot lu" /> pavé lu</span><span><i className="pastille-lot panne" /> pavé en panne</span><span><i className="pastille-lot facade" /> façade retenue (où la photo a été prise)</span></p>
    </div>
  );
}
