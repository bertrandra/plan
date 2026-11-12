// Etape 2, a la main : quatre coins d'un rectangle du mur, quand les points de fuite n'ont pas suffi.

import { useRef, useState, type PointerEvent as PE } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bitmap, COTE_SOURCE, pixels, reduire } from '../../images.js';
import { redresserParCoins } from '../../redressement.js';
import type { MetaImage, P } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Page } from '../../ui/Page.js';
import { Loupe } from '../Loupe.js';
import { BoutonsZoom, useZoom } from '../useZoom.js';
import { enregistrer } from './useRedressement.js';

const NOMS_COINS = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

/**
 * Quatre coins d'un rectangle du mur, poses et tires au doigt ou a la souris sur la photo ; puis la photo redressee entiere. Zoom a la
 * molette, aux boutons ou a deux doigts ; la loupe montre le point vise. Au doigt, un coin se vise (la loupe) et se pose au lever.
 */
export function CoinsALaMain({ m, onFin, banc }: { m: MetaImage; onFin: (maj: MetaImage | null) => void; banc: Banc }) {
  const [coins, setCoins] = useState<P[]>([]);
  const [rapport, setRapport] = useState('');
  const [prise, setPrise] = useState<number | null>(null);
  const [vise, setVise] = useState<P | null>(null);
  const [doigt, setDoigt] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const L = m.largeur ?? 1000, H = m.hauteur ?? 750;
  const { vue, zoomer, ajuster, capture } = useZoom(svg, L, H, () => { setPrise(null); setDoigt(false); });
  const r = svg.current?.getBoundingClientRect();
  const echelle = r && r.width > 0 ? Math.max(vue.w / r.width, vue.h / r.height) : vue.w / 1000;
  const point = (e: PE<SVGSVGElement>): P => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(L, Math.max(0, q.x)), y: Math.min(H, Math.max(0, q.y)) };
  };
  const bas = (e: PE<SVGSVGElement>) => {
    const p = point(e);
    setVise(p);
    const proche = coins.findIndex((c) => Math.hypot(c.x - p.x, c.y - p.y) < 14 * echelle);
    if (proche >= 0) { setPrise(proche); svg.current?.setPointerCapture(e.pointerId); return; }
    if (coins.length >= 4) return;
    if (e.pointerType === 'touch') { setDoigt(true); svg.current?.setPointerCapture(e.pointerId); return; }
    setCoins([...coins, p]);
  };
  const bouge = (e: PE<SVGSVGElement>) => {
    const p = point(e);
    setVise(p);
    if (prise !== null) setCoins((l) => l.map((c, i) => (i === prise ? p : c)));
  };
  const leve = (e: PE<SVGSVGElement>) => {
    if (doigt && coins.length < 4) setCoins([...coins, point(e)]);
    setDoigt(false); setPrise(null);
    if (e.pointerType === 'touch') setVise(null);
  };
  const montrerLoupe = !!vise && (prise !== null || doigt || coins.length < 4);
  const valider = async () => {
    setEnvoi(true);
    try {
      const b = await bitmap(api.fichier(m.id, 'source'));
      const r = redresserParCoins(pixels(reduire(b, COTE_SOURCE)), coins.map((c) => ({ x: c.x * (Math.min(1, COTE_SOURCE / Math.max(L, H))), y: c.y * (Math.min(1, COTE_SOURCE / Math.max(L, H))) })), Number(rapport.replace(',', '.')) || null);
      b.close();
      if (!r) { banc.dire('Ces quatre coins ne forment pas un rectangle redressable.', 'erreur'); return; }
      onFin(await enregistrer(m, r, { coins }));
    } catch (e) {
      banc.dire((e as Error).message, 'erreur');
    } finally { setEnvoi(false); }
  };
  return (
    <Page icone="main" numero="2" titre={`À la main · ${m.nom ?? m.id}`} large
      aide={<p>Posez dans l’ordre les coins {NOMS_COINS.map((n, i) => <b key={n}>{i + 1}. {n} </b>)} d’un rectangle du mur (une fenêtre, le mur entier) ; tirez-les pour les ajuster. Toute la photo est redressée, pas seulement le rectangle. Zoom à la molette ou à deux doigts.</p>}
      actions={<>
        <button type="button" className="discret" onClick={() => onFin(null)}><Icone nom="fermer" /> Annuler</button>
        <button type="button" className="principal" disabled={coins.length !== 4 || envoi} onClick={() => { void valider(); }}><Icone nom="valider" /> {envoi ? 'Redressement…' : 'Redresser'}</button>
      </>}>
      <div className="barre-outils">
        <ol className="suite-coins" aria-label="Coins posés">{NOMS_COINS.map((n, i) => <li key={n} className={i < coins.length ? 'fait' : i === coins.length ? 'courant' : ''}><span>{i + 1}</span>{n}</li>)}</ol>
        <span className="espace" />
        <label className="champ-court">Largeur ÷ hauteur <input value={rapport} onChange={(e) => setRapport(e.target.value)} placeholder="facultatif, ex. 0,8" size={12} /></label>
        <button type="button" disabled={!coins.length} onClick={() => setCoins([])}>Effacer les coins</button>
      </div>
      <div className="photo-cadre">
        {montrerLoupe && vise && <Loupe url={api.fichier(m.id, 'source')} L={L} H={H} objets={[]} classes={[]} centre={vise} echelle={echelle}
          cote={vise.x - vue.x < vue.w / 2 ? 'droite' : 'gauche'} trace={prise === null ? coins : []} couleur="#ffeb3b" />}
        <svg ref={svg} className="photo-coins" viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.h}`} {...capture}
          onPointerDown={bas} onPointerMove={bouge} onPointerUp={leve} onPointerCancel={() => { setDoigt(false); setPrise(null); }} onPointerLeave={(e) => { if (e.pointerType !== 'touch' && prise === null) setVise(null); }}>
          <image href={api.fichier(m.id, 'source')} width={L} height={H} />
          {coins.length > 1 && <polygon points={coins.map((c) => `${c.x},${c.y}`).join(' ')} className="coins-trait" strokeWidth={2 * echelle} />}
          {coins.map((c, i) => <g key={i}><circle cx={c.x} cy={c.y} r={7 * echelle} className="coin" strokeWidth={2 * echelle} /><text x={c.x + 10 * echelle} y={c.y - 8 * echelle} className="coin-num" fontSize={16 * echelle}>{i + 1}</text></g>)}
        </svg>
        <div className="outils-scene">
          {coins.length > 0 && <button type="button" onClick={() => setCoins(coins.slice(0, -1))}>Retirer le dernier coin</button>}
          <BoutonsZoom zoomer={zoomer} ajuster={ajuster} />
        </div>
      </div>
    </Page>
  );
}
