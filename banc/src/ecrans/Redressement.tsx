// Etape 2 : redresser chaque photo importee (vue de face). En lot par les points de fuite ; celles qui echouent, par quatre coins
// poses a la main ; une photo deja de face se garde telle quelle.

import { useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { bitmap, COTE_SOURCE, COTE_TRAVAIL, jpeg, pixels, reduire, versCanevas, vignette } from '../images.js';
import { redresserAuto, redresserParCoins, type Redressee } from '../redressement.js';
import type { MetaImage, P } from '../types.js';
import { Loupe } from './Loupe.js';
import { BoutonsZoom, useZoom } from './useZoom.js';

async function enregistrer(m: MetaImage, r: Redressee, extra: Record<string, unknown> = {}): Promise<MetaImage> {
  const c = versCanevas(r.image);
  return api.redressee(m.id, await jpeg(c, 0.92), await vignette(c), { methode: r.methode, horizontale: r.horizontale, focale: r.focale, ...extra });
}

export function EcranRedressement({ banc }: { banc: Banc }) {
  const [voirTout, setVoirTout] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [echecs, setEchecs] = useState<Set<string>>(new Set());
  const [main, setMain] = useState<MetaImage | null>(null);
  const liste = useMemo(() => banc.images.filter((m) => (voirTout ? m.statut !== 'rejetee' : m.statut === 'importee')), [banc.images, voirTout]);

  const auto = async (l: MetaImage[]) => {
    const rates = new Set(echecs);
    let n = 0, ok = 0;
    for (const m of l) {
      setEnCours(`Redressement ${++n} sur ${l.length}…`);
      try {
        const b = await bitmap(api.fichier(m.id, 'source'));
        const r = redresserAuto(pixels(reduire(b, COTE_TRAVAIL)), m.focale35 ?? null);
        b.close();
        if (!r) { rates.add(m.id); continue; }
        banc.remplacer(await enregistrer(m, r));
        rates.delete(m.id);
        ok++;
      } catch (e) {
        rates.add(m.id);
        banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur');
      }
    }
    setEchecs(rates);
    setEnCours(null);
    banc.dire(`${ok} photo(s) redressée(s) ; ${l.length - ok} à faire à la main.`);
  };
  const garder = async (m: MetaImage) => {
    const b = await bitmap(api.fichier(m.id, 'source'));
    banc.remplacer(await enregistrer(m, { image: pixels(reduire(b, COTE_SOURCE)), methode: 'aucun' }));
    b.close();
  };

  if (main) return <CoinsALaMain m={main} onFin={(maj) => { if (maj) { banc.remplacer(maj); setEchecs((s) => { const t = new Set(s); t.delete(maj.id); return t; }); } setMain(null); }} banc={banc} />;
  return (
    <section className="panneau">
      <h2>2 · Redressement</h2>
      <p className="aide">Les verticales et horizontales du mur deviennent droites : par les points de fuite de la photo (automatique), sinon par quatre coins d’un rectangle du mur posés à la main. Une photo redressée de nouveau perd son marquage (il est gardé à part sur le serveur).</p>
      <div className="rang">
        <button type="button" className="principal" disabled={!!enCours || !liste.length} onClick={() => { void auto(liste.filter((m) => m.statut === 'importee')); }}>Redresser les {liste.filter((m) => m.statut === 'importee').length} nouvelles (auto)</button>
        <label className="case"><input type="checkbox" checked={voirTout} onChange={(e) => setVoirTout(e.target.checked)} /> Voir aussi celles déjà redressées</label>
        {enCours && <span className="etat">{enCours}</span>}
      </div>
      <ul className="mosaique">
        {liste.map((m) => (
          <li key={m.id} className={echecs.has(m.id) ? 'carte a-faire' : 'carte'}>
            <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt="" loading="lazy" />
            <span>{m.nom ?? m.id} · {m.statut}{m.redressement ? ' (' + m.redressement.methode + ')' : ''}{echecs.has(m.id) ? ' · auto échoué' : ''}</span>
            <div className="rang">
              <button type="button" disabled={!!enCours} onClick={() => { void auto([m]); }}>Auto</button>
              <button type="button" onClick={() => setMain(m)}>À la main</button>
              <button type="button" onClick={() => { garder(m).catch((e: Error) => banc.dire(e.message, 'erreur')); }}>Déjà de face</button>
            </div>
          </li>
        ))}
      </ul>
      {!liste.length && <p className="aide">Aucune photo à redresser.</p>}
    </section>
  );
}

const NOMS_COINS = ['haut gauche', 'haut droit', 'bas droit', 'bas gauche'];

/**
 * Quatre coins d'un rectangle du mur, poses et tires au doigt ou a la souris sur la photo ; puis la photo redressee entiere. Zoom a la
 * molette, aux boutons ou a deux doigts ; la loupe montre le point vise. Au doigt, un coin se vise (la loupe) et se pose au lever.
 */
function CoinsALaMain({ m, onFin, banc }: { m: MetaImage; onFin: (maj: MetaImage | null) => void; banc: Banc }) {
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
    <section className="panneau">
      <h2>2 · Redresser à la main : {m.nom ?? m.id}</h2>
      <p className="aide">Posez dans l’ordre les coins {NOMS_COINS.map((n, i) => <b key={n}>{i + 1}. {n} </b>)} d’un rectangle du mur (une fenêtre, le mur entier) ; tirez-les pour les ajuster. Toute la photo est redressée, pas seulement le rectangle.</p>
      <div className="rang">
        <label>Largeur ÷ hauteur du rectangle (facultatif) <input value={rapport} onChange={(e) => setRapport(e.target.value)} placeholder="ex. 0,8" size={6} /></label>
        <button type="button" onClick={() => setCoins([])}>Effacer les coins</button>
        <button type="button" className="principal" disabled={coins.length !== 4 || envoi} onClick={() => { void valider(); }}>{envoi ? 'Redressement…' : 'Redresser'}</button>
        <button type="button" className="discret" onClick={() => onFin(null)}>Annuler</button>
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
    </section>
  );
}
