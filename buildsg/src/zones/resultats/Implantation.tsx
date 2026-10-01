// Z6, onglet Implantation : le plan d'implantation a l'echelle, et les chiffres a reporter au ruban.
//
// Le dessin est en millimetres reels : imprime a 100 %, le segment temoin mesure exactement 1 m a
// l'echelle choisie. L'impression ouvre une fenetre autonome qui reprend le dessin ET les tableaux :
// sur le chantier, ce sont les tableaux qui portent les cotes.

import { sommetDe } from '../../geometry/anneau.js';
import { useRef } from 'react';
import { dist } from '../../geometry/basic.js';
import { ensureConstruction } from '../../engine/construction.js';
import { estPlots } from '../../engine/constantes.js';
import { computeImplantation } from '../../engine/implantation.js';
import { computeTerrasseLayers } from '../../engine/layers.js';
import { aDesSommets } from '../../model/formes.js';
import { escapeHtml } from '../../util/escape.js';
import { showToast } from '../../shell/dialogs.js';
import type { Resultats } from '../../app/resultats.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

const ECHELLES = [200, 100, 50, 20];
const POLICE = "'Helvetica Neue',Arial,sans-serif";
const ROUGE = '#c0392b', NOIR = '#111';
const COULEUR_APPUI: Record<string, string> = { rive: '#0f3d49', spa: '#a8452a', courant: '#235e6e' };

/** Une fenetre autonome, pour ne pas dependre de la mise en page de l'application. */
function imprimer(titre: string, entete: string, contenu: string): void {
  const w = window.open('', '_blank');
  if (!w) { showToast('Autorise les fenetres pop-up pour imprimer le plan.'); return; }
  w.document.write('<!doctype html><meta charset="utf-8"><title>' + titre + '</title>' +
    '<style>@page{margin:10mm} body{margin:0;font-family:Arial,sans-serif;font-size:10pt}' +
    'h1{font-size:12pt;margin:0 0 4mm}' +
    '.hint{color:#555;font-size:9pt;margin:3mm 0}' +
    '.sectionTitle{font-weight:600;font-size:10.5pt;margin:6mm 0 2mm;page-break-after:avoid}' +
    'table{border-collapse:collapse;width:100%;margin-bottom:2mm}' +
    'th,td{border:1px solid #999;padding:1.2mm 2mm;text-align:left;font-size:8.5pt}' +
    'th{background:#eee}' +
    'table{page-break-inside:auto} tr{page-break-inside:avoid}</style>' +
    '<h1>' + entete + '</h1>' + contenu);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export function Implantation({ obj, resultats }: { obj: ObjetPlan; resultats: Resultats }) {
  const imprimable = useRef<HTMLDivElement>(null);
  if (!aDesSommets(obj) || obj.pts.length < 3) return <><div className="sectionTitle">Plan d'implantation</div><div id="terrasseImplantWrap"><div className="hint">Terrasse invalide.</div></div></>;
  const c = ensureConstruction(obj);
  const pts = obj.pts;
  const layers = computeTerrasseLayers(obj, resultats.etat.objects);
  const I = computeImplantation(obj, layers);
  const ech = ECHELLES.find(e => e === c.echelleImplant) ?? 200;
  const mm = (m: number) => m * 1000 / ech;                       // metres reels -> mm sur le papier
  const marge = 18;                                               // mm, place pour les cotes
  const W = mm(I.bbox.x1 - I.bbox.x0) + marge * 2;
  const H = mm(I.bbox.y1 - I.bbox.y0) + marge * 2;
  const P = (p: PtBrut) => ({ x: marge + mm(p.x - I.bbox.x0), y: marge + mm(p.y - I.bbox.y0) });
  const nom = estPlots(c) ? 'plots' : 'vis';
  const cote = (i: number) => dist(sommetDe(pts, i), sommetDe(pts, i + 1));
  const txt = (key: string, x: number, y: number, t: string, taille = 2.2, couleur = NOIR, ancre: 'start' | 'middle' = 'start', transform?: string) =>
    <text key={key} x={x} y={y} fontSize={taille} fill={couleur} fontFamily={POLICE} textAnchor={ancre} transform={transform}>{t}</text>;

  const porteuses = layers.solives.length ? layers.solives : layers.lambourdes;
  const O = P({ x: 0, y: 0 });
  const yE = H - 6, xE = marge;
  const format = W > 287 || H > 200 ? (W > 410 || H > 287 ? ' — depasse l\'A3' : ' — tient en A3 paysage') : ' — tient en A4 paysage';

  const lancerImpression = () => {
    const nomTerrasse = escapeHtml(obj.name || 'terrasse');
    imprimer('Implantation — ' + nomTerrasse + ' — 1/' + ech,
      'Implantation ' + escapeHtml(nom) + ' — ' + nomTerrasse + ' — echelle 1/' + ech + ' — imprimer a 100 %',
      imprimable.current?.innerHTML ?? '');
  };

  return (
    <>
      <div className="sectionTitle">Plan d'implantation</div>
      <div id="terrasseImplantWrap">
        <div className="controls">
          <label style={{ marginRight: 5, fontSize: '0.88rem' }}>Echelle : </label>
          <select value={String(ech)} onChange={(e) => { const v = parseInt(e.target.value, 10) || 200; resultats.saisir(() => { c.echelleImplant = v; }); }}>
            {ECHELLES.map(e => <option key={e} value={String(e)}>{'1/' + e}</option>)}
          </select>
          <button type="button" className="objbtn" style={{ marginLeft: 14 }} onClick={lancerImpression}>Imprimer le plan</button>
          <span className="tailleImpression">{'sur papier : ' + W.toFixed(0) + ' × ' + H.toFixed(0) + ' mm' + format}</span>
        </div>
        <div ref={imprimable}>
          <svg width={W + 'mm'} height={H + 'mm'} viewBox={'0 0 ' + W + ' ' + H} className="planImplantation" role="img" aria-label="Plan d'implantation">
            <polygon points={I.sommets.map(v => { const q = P(v); return q.x + ',' + q.y; }).join(' ')} fill="#fafafa" stroke={NOIR} strokeWidth={0.5} />
            {/* lignes porteuses : c'est sur elles qu'on tend les cordeaux */}
            {porteuses.map((seg, i) => { const a = P(I.R.vers(seg.a)), b = P(I.R.vers(seg.b));
              return <line key={'p' + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9aa6b0" strokeWidth={0.25} strokeDasharray="2 1.5" />; })}
            {/* diagonales de controle */}
            {I.diagonales.map((d, i) => { const a = P(sommetDe(I.sommets, d.de)), b = P(sommetDe(I.sommets, d.a));
              return <g key={'d' + i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ROUGE} strokeWidth={0.25} strokeDasharray="3 2" />
                {txt('dt' + i, (a.x + b.x) / 2, (a.y + b.y) / 2 - 0.8, d.d.toFixed(3) + ' m', 2, ROUGE, 'middle')}
              </g>; })}
            {/* cotes du contour, cote par cote */}
            {I.sommets.map((v, i) => {
              const a = P(v), b = P(sommetDe(I.sommets, i + 1));
              const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
              return txt('c' + i, 0, -1.2, cote(i).toFixed(3) + ' m', 2.4, NOIR, 'middle',
                'translate(' + (a.x + b.x) / 2 + ',' + (a.y + b.y) / 2 + ') rotate(' + (ang > 90 || ang < -90 ? ang + 180 : ang) + ')');
            })}
            {/* appuis numerotes */}
            {I.appuis.map((a, i) => { const q = P(a);
              return <g key={'a' + i}>
                <circle cx={q.x} cy={q.y} r={ech <= 50 ? 1.6 : 1.0} fill={COULEUR_APPUI[a.role ?? ''] || '#235e6e'} stroke="#fff" strokeWidth={0.2} />
                {ech <= 100 && txt('n' + i, q.x, q.y - 2.0, String(a.n), ech <= 50 ? 2.0 : 1.5, NOIR, 'middle')}
              </g>; })}
            {/* repere et axes de tracage */}
            <circle cx={O.x} cy={O.y} r={1.8} fill="none" stroke={ROUGE} strokeWidth={0.5} />
            <line x1={O.x} y1={O.y} x2={O.x + mm(I.R.longueurCote)} y2={O.y} stroke={ROUGE} strokeWidth={0.4} />
            {txt('R', O.x - 2.5, O.y + 3.5, 'R', 3, ROUGE)}
            {txt('X', O.x + mm(I.R.longueurCote) / 2, O.y - 2.5, 'cordeau X — cote ' + (I.R.cote + 1), 2.2, ROUGE, 'middle')}
            {/* echelle graphique : le controle qui dit si l'impression a ete mise a l'echelle */}
            <line x1={xE} y1={yE} x2={xE + mm(1)} y2={yE} stroke={NOIR} strokeWidth={0.6} />
            <line x1={xE} y1={yE - 1} x2={xE} y2={yE + 1} stroke={NOIR} strokeWidth={0.4} />
            <line x1={xE + mm(1)} y1={yE - 1} x2={xE + mm(1)} y2={yE + 1} stroke={NOIR} strokeWidth={0.4} />
            {txt('e', xE + mm(1) + 1.5, yE + 0.8, '1 m — echelle 1/' + ech, 2.4)}
          </svg>
          <div className="hint">
            {'Le dessin est en millimetres reels : imprime a 100 % (sans « ajuster a la page »), le segment temoin en bas mesure exactement 1 m a l\'echelle 1/' +
              ech + '. Verifie-le au double-decimetre avant de tracer. Le repere R est le depart du cote de reference ; les deux cordeaux a tendre en premier sont X le long de ce cote et Y perpendiculaire.'}
          </div>

          <div className="sectionTitle" style={{ marginTop: 18 }}>Controle d'equerrage</div>
          <table className="attrTable"><tbody>
            <tr><th>Controle</th><th>Mesure</th><th>Role</th></tr>
            {I.diagonales.map((d, i) => (
              <tr key={i}><td>{'Diagonale sommet ' + (d.de + 1) + ' → ' + (d.a + 1)}</td><td>{d.d.toFixed(3) + ' m'}</td><td>a mesurer au ruban avant de fixer quoi que ce soit</td></tr>
            ))}
            {(() => {
              const [d1, d2, ...autres] = I.diagonales;
              if (!d1 || !d2 || autres.length) return null;
              const ecart = Math.abs(d1.d - d2.d);
              return <tr style={{ fontWeight: 600 }}><td>Ecart entre diagonales</td><td>{(ecart * 1000).toFixed(0) + ' mm'}</td>
                <td>{ecart < 0.005 ? 'contour d\'equerre' : 'contour non rectangle — normal si la forme ne l\'est pas'}</td></tr>;
            })()}
          </tbody></table>

          <div className="sectionTitle" style={{ marginTop: 18 }}>{'Implantation des ' + nom + ' — pièce par pièce'}</div>
          <div className="hint">
            {'Une pièce = un cordeau. On materialise la piece entre ses deux extremites (coordonnees X/Y depuis le repere R), puis on marque ses appuis au ruban le long d\'elle. ' +
              I.appuis.length + ' ' + nom + ' repartis sur ' + I.lignes.length + ' pieces.'}
          </div>
          <table className="attrTable"><tbody>
            <tr><th>Piece</th><th>Depart X / Y</th><th>Fin X / Y</th><th>Nb</th><th>Appuis, distance depuis le depart (m)</th></tr>
            {I.lignes.map((l, i) => (
              <tr key={i}>
                <td>{l.ref + ' — ' + l.type}</td>
                <td className="nombre">{l.depart.x.toFixed(3) + ' / ' + l.depart.y.toFixed(3)}</td>
                <td className="nombre">{l.fin.x.toFixed(3) + ' / ' + l.fin.y.toFixed(3)}</td>
                <td>{l.appuis.length}</td>
                <td className="nombre petit">{l.appuis.map(a => a.d.toFixed(3)).join('  ·  ')}</td>
              </tr>
            ))}
          </tbody></table>

          <div className="sectionTitle" style={{ marginTop: 18 }}>Sommets du contour</div>
          <table className="attrTable"><tbody>
            <tr><th>Sommet</th><th>X (m)</th><th>Y (m)</th><th>Cote suivant (m)</th></tr>
            {I.sommets.map((v, i) => (
              <tr key={i}><td>{(i + 1) + (i === I.R.cote ? ' (repere R)' : '')}</td><td>{v.x.toFixed(3)}</td><td>{v.y.toFixed(3)}</td><td>{cote(i).toFixed(3)}</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
