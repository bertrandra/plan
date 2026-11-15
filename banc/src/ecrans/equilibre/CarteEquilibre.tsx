// La carte de l'ecran d'equilibre (demande du proprietaire, 15 novembre 2026) : les photos du banc a leur place, sur le fond de l'IGN,
// regroupees en ronds qui disent leur nombre (equilibre.ts::amasser). Elle se zoome et se deplace (molette, pincement, glisser, boutons,
// clavier) ; toucher un rond s'en approche. La geometrie vient de carte.ts, comme pour la carte de l'import ; elle ne lit que des tuiles.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ToucheReact, type PointerEvent as PointeurReact } from 'react';
import { barreEchelle, FRANCE, glisser, metresParPixel, pincer, texteEchelle, tuiles, urlTuile, vuePourEmprise, zoomerAutour, type P, type Taille, type VueCarte } from '../../carte.js';
import { amasser, empriseDesPoints, rayonAmas, type PointImage } from '../../equilibre.js';
import { Icone } from '../../ui/Icones.js';

export function CarteEquilibre({ points }: { points: readonly PointImage[] }) {
  const cadre = useRef<HTMLDivElement | null>(null);
  const [taille, setTaille] = useState<Taille>({ l: 0, h: 0 });
  const [vue, setVue] = useState<VueCarte | null>(null);
  const tailleRef = useRef(taille); tailleRef.current = taille;

  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const lire = () => setTaille((t) => (t.l === e.clientWidth && t.h === e.clientHeight ? t : { l: e.clientWidth, h: e.clientHeight }));
    lire();
    if (typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(lire);
    o.observe(e);
    return () => o.disconnect();
  }, []);

  // A l'ouverture : toutes les photos dans le cadre ; sans photo situee, la France.
  const toutVoir = useCallback((t: Taille): VueCarte => vuePourEmprise(empriseDesPoints(points) ?? FRANCE, t, 1.15), [points]);
  useEffect(() => { if (taille.l && !vue) setVue(toutVoir(taille)); }, [taille, vue, toutVoir]);

  // La molette, hors de React : son ecouteur y est passif et ne peut pas retenir le defilement de la page.
  useEffect(() => {
    const e = cadre.current;
    if (!e) return;
    const molette = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = e.getBoundingClientRect(), dz = Math.max(-0.6, Math.min(0.6, -ev.deltaY * (ev.deltaMode === 1 ? 0.06 : 0.0025)));
      setVue((v) => v && zoomerAutour(v, { x: ev.clientX - r.left, y: ev.clientY - r.top }, tailleRef.current, dz));
    };
    e.addEventListener('wheel', molette, { passive: false });
    return () => e.removeEventListener('wheel', molette);
  }, []);

  const pointeurs = useRef(new Map<number, P>());
  const depart = useRef<{ vue: VueCarte; milieu: P; ecart: number } | null>(null);
  const reperer = (v: VueCarte) => {
    const l = [...pointeurs.current.values()], a = l[0], b = l[1] ?? l[0];
    if (!a || !b) { depart.current = null; return; }
    depart.current = { vue: v, milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ecart: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const ou = (ev: PointeurReact): P => { const r = ev.currentTarget.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const appuyer = (ev: PointeurReact<HTMLDivElement>) => {
    if (!vue || (ev.target as Element).closest('button, .amas')) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    pointeurs.current.set(ev.pointerId, ou(ev));
    reperer(vue);
  };
  const bouger = (ev: PointeurReact<HTMLDivElement>) => {
    if (!pointeurs.current.has(ev.pointerId) || !depart.current) return;
    pointeurs.current.set(ev.pointerId, ou(ev));
    const l = [...pointeurs.current.values()], a = l[0], b = l[1], d = depart.current;
    if (!a) return;
    if (b) setVue(pincer(d.vue, taille, d.milieu, d.ecart, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y)));
    else setVue(glisser(d.vue, a.x - d.milieu.x, a.y - d.milieu.y));
  };
  const lacher = (ev: PointeurReact<HTMLDivElement>) => { pointeurs.current.delete(ev.pointerId); if (vue) reperer(vue); };
  const zoomer = (dz: number, ancre?: P) => setVue((v) => v && zoomerAutour(v, ancre ?? { x: taille.l / 2, y: taille.h / 2 }, taille, dz));
  const clavier = (ev: ToucheReact<HTMLDivElement>) => {
    const pas = 80, d: Record<string, [number, number]> = { ArrowLeft: [pas, 0], ArrowRight: [-pas, 0], ArrowUp: [0, pas], ArrowDown: [0, -pas] };
    const g = d[ev.key];
    if (g) { ev.preventDefault(); setVue((v) => v && glisser(v, g[0], g[1])); }
    else if (ev.key === '+' || ev.key === '=') zoomer(1);
    else if (ev.key === '-') zoomer(-1);
    else if (ev.key === '0') setVue(toutVoir(taille));
  };

  const amas = useMemo(() => (vue && taille.l ? amasser(points, vue, taille) : []), [points, vue, taille]);
  const barre = vue ? barreEchelle(metresParPixel(vue.lat, vue.zoom)) : null;
  return (
    <div className="carte-equilibre">
      <div className="carte-cadre" ref={cadre} tabIndex={0} role="application" aria-label={`Carte des ${points.length} photo(s) du banc qui ont une position`}
        onPointerDown={appuyer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher} onKeyDown={clavier}>
        {vue && <div className="carte-tuiles" aria-hidden="true">
          {tuiles(vue, taille).map((t) => {
            const g = Math.round(t.gauche), h = Math.round(t.haut);
            return <img key={`${t.z}-${t.x}-${t.y}`} src={urlTuile('plan', t.z, t.x, t.y)} alt="" draggable={false}
              style={{ left: g, top: h, width: Math.round(t.gauche + t.cote) - g, height: Math.round(t.haut + t.cote) - h }}
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />;
          })}
        </div>}
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
          <button type="button" aria-label="Voir toutes les photos" title="Voir toutes les photos (0)" onClick={() => setVue(toutVoir(taille))}><Icone nom="point" taille={18} /></button>
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
