// Z6, onglet Profil : le profil du sol le long d'une ligne du plan (MD/spec-relief.md §5.4).
//
// Un dessin de resultat, pas le plan : il se decrit en SVG dans le composant, comme la coupe. Les
// altitudes sont lues dans la grille enregistree (`model/relief.ts`), jamais au service : le
// profil est reproductible et ne demande pas le reseau. La ligne vient d'une cote (bouton « Profil »
// de l'onglet Cotes) ou, a defaut, c'est celle que Plan propose : la plus grande pente par le point
// de reference de la terrasse. Rien ici n'ecrit le projet ; la ligne choisie est un etat
// d'interface tenu par `app/resultats.ts`.

import { centroid } from '../../geometry/basic.js';
import { aDesSommets } from '../../model/formes.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import {
  ligneDePlusGrandePente, penteParcelle, pointDeReference, profilRelief, resumeRelief, zLocal, type PointProfil
} from '../../model/relief.js';
import type { Resultats, LigneProfil } from '../../app/resultats.js';
import type { PtBrut, Relief } from '../../model/types.js';

const ENCRE = '#3B2E1F', SOL = '#4A6B32', REPERE = '#8A6D3B';
const POLICE = "'Helvetica Neue',Arial,sans-serif";
const W = 640, H = 240, M_GAUCHE = 64, M_DROITE = 64, M_HAUT = 30, M_BAS = 36;
/** Les exagerations verticales admises, dans l'ordre d'essai : la premiere qui rend le profil lisible. */
const EXAGERATIONS = [1, 2, 3, 5, 10, 20];

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const signe = (v: number, d = 2) => (v < 0 ? '−' : '+') + fr(Math.abs(v), d);

/** Les echelles du dessin : la meme pour x et z tant que le denivele se voit, sinon des hauteurs exagerees. */
export function echellesProfil(longueur: number, denivele: number, largeur = W - M_GAUCHE - M_DROITE, hauteur = H - M_HAUT - M_BAS): { x: number; z: number; exageration: number } {
  const x = longueur > 0 ? largeur / longueur : 1;
  if (denivele <= 1e-9) return { x, z: x, exageration: 1 };
  // Un denivele qui remplirait plus que la hauteur disponible est simplement ramene a elle.
  if (denivele * x > hauteur) return { x, z: hauteur / denivele, exageration: 1 };
  const k = EXAGERATIONS.find(e => denivele * x * e >= hauteur / 2) ?? EXAGERATIONS[EXAGERATIONS.length - 1] ?? 1;
  return { x, z: Math.min(x * k, hauteur / denivele), exageration: k };
}

/** Les suites de points connus, pour tracer le sol en plusieurs traits quand la grille a des trous. */
function series(points: PointProfil[]): (PointProfil & { z: number })[][] {
  const out: (PointProfil & { z: number })[][] = [];
  let courante: (PointProfil & { z: number })[] = [];
  for (const p of points) {
    if (p.z === null) { if (courante.length) out.push(courante); courante = []; }
    else courante.push(p as PointProfil & { z: number });
  }
  if (courante.length) out.push(courante);
  return out;
}

/** L'abscisse du point de reference le long de la ligne, ou `null` s'il n'est pas entre ses bouts. */
function abscisseSurLigne(l: LigneProfil, p: PtBrut): number | null {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const s = ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / L;
  return s >= -1e-6 && s <= L + 1e-6 ? s : null;
}

function Dessin({ r, ligne, pRef }: { r: Relief; ligne: LigneProfil; pRef: PtBrut | null }) {
  const points = profilRelief(r, ligne.a, ligne.b);
  const connus = points.filter((p): p is PointProfil & { z: number } => p.z !== null);
  const longueur = points[points.length - 1]?.s ?? 0;
  if (!connus.length || longueur <= 0) return <div className="hint">La ligne sort de la grille du relief : rien à dessiner.</div>;
  const zMin = Math.min(...connus.map(p => p.z)), zMax = Math.max(...connus.map(p => p.z));
  const e = echellesProfil(longueur, zMax - zMin);
  const yBase = H - M_BAS;
  const X = (s: number) => M_GAUCHE + s * e.x;
  const Y = (z: number) => yBase - (z - zMin) * e.z;
  const premier = connus[0] as PointProfil & { z: number }, dernier = connus[connus.length - 1] as PointProfil & { z: number };
  const sRef = pRef ? abscisseSurLigne(ligne, pRef) : null;
  const zRefSol = pRef ? zLocal(r, pRef.x, pRef.y) : null;
  const texte = (x: number, y: number, t: string, ancre: 'start' | 'middle' | 'end' = 'middle', couleur = ENCRE, taille = 11) =>
    <text x={x} y={y} textAnchor={ancre} fontFamily={POLICE} fontSize={taille} fill={couleur}>{t}</text>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label="Profil du sol le long de la ligne">
      {/* Le sol : une surface sous chaque suite de points connus, puis le trait fort. */}
      {series(points).map((serie, i) => {
        const trace = serie.map(p => `${X(p.s).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ');
        const d0 = serie[0] as PointProfil & { z: number }, d1 = serie[serie.length - 1] as PointProfil & { z: number };
        return (
          <g key={i}>
            <polygon points={`${X(d0.s).toFixed(1)},${yBase} ${trace} ${X(d1.s).toFixed(1)},${yBase}`} fill={SOL} fillOpacity={0.18} />
            <polyline points={trace} fill="none" stroke={ENCRE} strokeWidth={2.2} strokeLinejoin="round" />
          </g>
        );
      })}
      {/* L'axe du sol, et la longueur de la ligne. */}
      <line x1={M_GAUCHE} y1={yBase} x2={W - M_DROITE} y2={yBase} stroke={REPERE} strokeWidth={0.8} />
      {texte(M_GAUCHE, yBase + 16, '0 m', 'start', REPERE)}
      {texte(W - M_DROITE, yBase + 16, fr(longueur, 1) + ' m', 'end', REPERE)}
      {/* Les altitudes NGF aux deux bouts. */}
      {texte(X(premier.s) - 6, Y(premier.z) + 4, fr(premier.z) + ' m', 'end')}
      {texte(X(dernier.s) + 6, Y(dernier.z) + 4, fr(dernier.z) + ' m', 'start')}
      {/* Le point de reference : la hauteur locale du sol, celle qui vaut zero quand il n'a pas bouge. */}
      {sRef !== null && zRefSol !== null && (
        <g>
          <line x1={X(sRef)} y1={yBase} x2={X(sRef)} y2={Y(zRefSol + r.zRef)} stroke={REPERE} strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={X(sRef)} cy={Y(zRefSol + r.zRef)} r={3} fill={REPERE} />
          {texte(X(sRef), Y(zRefSol + r.zRef) - 9, 'point de référence ' + signe(zRefSol) + ' m', 'middle', REPERE, 10)}
        </g>
      )}
      {e.exageration > 1 && texte(W - M_DROITE, M_HAUT - 12, 'hauteurs × ' + e.exageration, 'end', REPERE, 10)}
      {texte(M_GAUCHE, M_HAUT - 12, r.systemeAltimetrique, 'start', REPERE, 10)}
    </svg>
  );
}

export function Profil({ resultats }: { resultats: Resultats }) {
  const etat = resultats.etat;
  const parcelle = parcelleDuProjet(etat.objects);
  const r = parcelle?.relief;
  if (!parcelle || !r || !aDesSommets(parcelle)) {
    return <div className="hint">Aucun relief lu : sélectionnez la parcelle et lisez le relief dans sa section « Relief ».</div>;
  }
  const pRef = pointDeReference(etat.objects, etat.terrasseSelectedKey) ?? centroid(parcelle.pts);
  const choisie = resultats.ligneProfil();
  const ligne = choisie ?? ligneDePlusGrandePente(r, parcelle.pts, pRef);
  const pente = penteParcelle(r, parcelle.pts);
  const longueur = Math.hypot(ligne.b.x - ligne.a.x, ligne.b.y - ligne.a.y);
  const zA = zLocal(r, ligne.a.x, ligne.a.y), zB = zLocal(r, ligne.b.x, ligne.b.y);
  const denivele = zA !== null && zB !== null ? zB - zA : null;
  const origine = choisie
    ? 'Ligne d’une cote, du premier bout au second.'
    : 'Ligne proposée : la plus grande pente par le point de référence' + (pente && pente.pentePct >= 1 ? ', vers le ' + pente.orientation : '') + '.';
  return (
    <>
      <div className="sectionTitle">Profil du sol</div>
      <div className="hint">{resumeRelief(r)} · zéro du plan {fr(r.zRef)} m {r.systemeAltimetrique}</div>
      <div id="profilReliefWrap"><Dessin r={r} ligne={ligne} pRef={pRef} /></div>
      <div className="infoCote">
        {origine + ' Longueur ' + fr(longueur, 1) + ' m'}
        {denivele !== null && longueur > 0 ? ' · dénivelé ' + signe(denivele) + ' m (' + fr(Math.abs(denivele) / longueur * 100, 1) + ' %)' : ''}
      </div>
      <div className="controls">
        <button type="button" data-controle="profil.sensPente" className="secondary small" disabled={!choisie}
          title="Revenir à la ligne que Plan propose : la plus grande pente par le point de référence"
          onClick={() => resultats.profiler(null)}>Dans le sens de la pente</button>
      </div>
      <div className="hint">Pour couper ailleurs, posez une cote sur le plan puis cliquez « Profil » sur sa ligne dans l’onglet Cotes. Le relief de l’IGN donne la tendance du terrain, pas une cote d’exécution.</div>
    </>
  );
}
