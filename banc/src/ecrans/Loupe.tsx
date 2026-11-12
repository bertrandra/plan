// La loupe automatique de l'editeur (demande du proprietaire, 12 novembre 2026) : pendant qu'on tire un coin ou un sommet, qu'on trace
// un rectangle ou qu'on pose les points d'un polygone, un agrandissement de la photo autour du point vise s'affiche dans un coin de la
// scene, du cote oppose au curseur, avec une croix au point exact. Le doigt ou la souris ne cachent plus ce qu'on ajuste.

import type { Classe, Objet, P } from '../types.js';
import { contour } from '../geometrie.js';

/** Le cote de la loupe a l'ecran, et son grossissement par rapport a la scene. */
export const COTE_LOUPE_PX = 200;
export const GROSSISSEMENT = 4;

interface Props {
  url: string; L: number; H: number;
  objets: readonly Objet[]; classes: readonly Classe[];
  /** Le point vise, en pixels de la photo. */
  centre: P;
  /** Pixels de la photo par pixel d'ecran, dans la scene. */
  echelle: number;
  /** Le cote de la scene ou se pose la loupe : a l'oppose du curseur. */
  cote: 'gauche' | 'droite';
  /** Ce qui est en cours de trace : le rectangle, ou les points du polygone (et le point vise, a la suite). */
  trace?: readonly P[]; rectangle?: { a: P; b: P } | null; couleur?: string;
}

export function Loupe({ url, L, H, objets, classes, centre, echelle, cote, trace = [], rectangle = null, couleur = '#ffeb3b' }: Props) {
  // La zone de la photo montree : COTE_LOUPE_PX pixels d'ecran a GROSSISSEMENT fois la scene.
  const w = (COTE_LOUPE_PX / GROSSISSEMENT) * echelle;
  const trait = w / 90;
  const couleurDe = (o: Objet) => classes.find((c) => c.id === o.classe)?.couleur ?? '#ff00ff';
  return (
    <svg className={'loupe ' + cote} viewBox={`${centre.x - w / 2} ${centre.y - w / 2} ${w} ${w}`} width={COTE_LOUPE_PX} height={COTE_LOUPE_PX} aria-hidden="true">
      <rect x={centre.x - w / 2} y={centre.y - w / 2} width={w} height={w} fill="#111" />
      <image href={url} width={L} height={H} />
      {/* La croix du point vise, sous les traces et en pointilles : elle situe le point sans cacher le bord qu'on ajuste. */}
      <g stroke="#fff" strokeOpacity={0.55} strokeWidth={trait * 0.6} strokeDasharray={`${trait * 3} ${trait * 3}`}>
        <line x1={centre.x - w / 2} y1={centre.y} x2={centre.x + w / 2} y2={centre.y} />
        <line x1={centre.x} y1={centre.y - w / 2} x2={centre.x} y2={centre.y + w / 2} />
      </g>
      {objets.map((o) => { const pts = contour(o).map((q) => `${q.x},${q.y}`).join(' '); return o.forme === 'point' ? <circle key={o.id} cx={o.points[0]?.x ?? 0} cy={o.points[0]?.y ?? 0} r={trait * 4} fill="none" stroke={couleurDe(o)} strokeWidth={trait * 1.5} /> : o.forme === 'ligne' ? <polyline key={o.id} points={pts} fill="none" stroke={couleurDe(o)} strokeWidth={trait * 1.5} /> : <polygon key={o.id} points={pts} fill="none" stroke={couleurDe(o)} strokeWidth={trait} />; })}
      {rectangle && <rect x={Math.min(rectangle.a.x, rectangle.b.x)} y={Math.min(rectangle.a.y, rectangle.b.y)} width={Math.abs(rectangle.b.x - rectangle.a.x)} height={Math.abs(rectangle.b.y - rectangle.a.y)} fill="none" stroke={couleur} strokeWidth={trait} />}
      {trace.length > 0 && <polyline points={[...trace, centre].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={couleur} strokeWidth={trait} />}
      <circle cx={centre.x} cy={centre.y} r={trait * 3} fill="none" stroke="#000" strokeWidth={trait * 1.4} />
      <circle cx={centre.x} cy={centre.y} r={trait * 3} fill="none" stroke="#fff" strokeWidth={trait * 0.6} />
    </svg>
  );
}
