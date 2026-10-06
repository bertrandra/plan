// Z6, onglet Coupe : l'empilement des couches a l'endroit le plus charge, a l'echelle.
//
// Un dessin de resultat, pas le plan : il se decrit en SVG dans le composant, comme le reste du
// tiroir. Les hauteurs viennent de `engine/hauteurs.ts` — la meme definition que celle affichee dans
// l'inspecteur —, les couleurs sont celles des materiaux, pas des jetons d'interface.

import { ensureConstruction } from '../../engine/construction.js';
import { DALLE_BETON_EP_M, estPlots, MASSIF_COTE_M, plotModele, SUPPORT_TYPES } from '../../engine/constantes.js';
import { dimsSection, sectionLambourde } from '../../engine/portees.js';
import { appuisEnHauteur, decaissementPoseMm, hauteurAppuiMm, hauteurFinieMm } from '../../engine/hauteurs.js';
import { computeTerrasseLayers } from '../../engine/layers.js';
import { solDuProjet } from '../../engine/sol.js';
import { aDesSommets } from '../../model/formes.js';
import type { ObjetPlan } from '../../model/types.js';

const ENCRE = '#3B2E1F', SOL = '#4A6B32';
const POLICE = "'Helvetica Neue',Arial,sans-serif";
/** px par mm. */
const ECHELLE = 2;

export function Coupe({ obj, objets = [] }: { obj: ObjetPlan; objets?: ObjetPlan[] }) {
  const c = ensureConstruction(obj);
  // Sur un sol en pente, la coupe est celle du point haut ; la ligne du plot dit jusqu'ou vont ceux d'aval.
  const pente = objets.length && aDesSommets(obj) && obj.pts.length >= 3 ? appuisEnHauteur(obj, computeTerrasseLayers(obj, objets).vis, solDuProjet(objets)) : null;
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const soliveDims = (c.soliveSection || '45x70').split('x').map(n => parseInt(n, 10) || 0);
  const soliveH = plotSimple ? 0 : (soliveDims[1] || 70);
  // Hauteur de l'appui AU-DESSUS du sol : pour une vis, son seul depassement de tete.
  const hauteurVisMm = hauteurAppuiMm(c);
  // Ce qui descend SOUS le sol : la vis dans le sol, ou l'assise sous les plots.
  const enterreMm = estPlots(c) ? 0 : (c.hauteurVis || 40) * 10;
  const lambourdeH = (c.avecLambourde || estPlots(c)) ? dimsSection(sectionLambourde(c)).h : 0;
  const lameH = c.epaisseurLame || 25;
  // L'assise n'existe que sur plots, et se dessine sous le niveau du sol fini.
  const support = estPlots(c) ? SUPPORT_TYPES[c.supportType ?? ''] : undefined;
  const assiseH = estPlots(c) && (support || { concasse: false }).concasse ? (c.supportDecaissement || 15) * 10 : 0;
  // Sous les plots, une dalle a couler (au-dessus du herisson) ou un massif de fondation.
  const dalleH = support?.dalleBeton ? DALLE_BETON_EP_M * 1000 : 0;
  const massifH = support?.massifs ? MASSIF_COTE_M * 1000 : 0;
  // Un niveau fini impose plus bas que la structure : la terrasse est posee dans un decaissement, le
  // terrain naturel passe au-dessus du fond de fouille (engine/hauteurs.ts).
  const decaisseMm = decaissementPoseMm(obj);
  const totalH = hauteurFinieMm(obj) + decaisseMm;

  // Il faut de la place SOUS la ligne de sol : la vis y descend, l'assise aussi.
  const sousSolMm = Math.max(enterreMm, assiseH + dalleH, massifH);
  const W = 260, H = Math.max(160, (totalH + sousSolMm) * ECHELLE + 50);
  const solY = H - 26 - sousSolMm * ECHELLE;

  const texte = (y: number, t: string, x = 108, taille = 11, couleur = ENCRE) =>
    <text key={'t' + y + t} x={x} y={y} fontSize={taille} fill={couleur} fontFamily={POLICE}>{t}</text>;

  const couches: React.ReactNode[] = [];
  const bande = (y0mm: number, hmm: number, couleur: string, libelle: string) => {
    const y = solY - (y0mm + hmm) * ECHELLE, h = Math.max(hmm * ECHELLE, 2);
    couches.push(<rect key={'b' + libelle} x={40} y={y} width={60} height={h} fill={couleur} stroke={ENCRE} strokeWidth={1} />, texte(y + h / 2 + 4, libelle));
  };
  // Le plot se dresse au-dessus du sol ; la vis descend dessous et ne montre que sa tete reglable.
  const appui = (x: number, y: number, h: number, w: number, couleur: string, libelle: string, yLibelle: number) => {
    couches.push(<rect key={'a' + libelle} x={x} y={y} width={w} height={h} fill={couleur} stroke={ENCRE} />, texte(yLibelle + 4, libelle));
  };
  if (estPlots(c)) {
    const h = Math.max(hauteurVisMm * ECHELLE, 2);
    appui(60, solY - h, h, 20, '#6E7A84', 'Plot — ' + (c.hauteurPlot || 10) + ' cm (' + plotModele(c).label + ')' + (pente ? ' ; sol en pente : de ' + Math.round(pente.minMm / 10) + ' à ' + Math.round(pente.maxMm / 10) + ' cm' : ''), solY - h / 2);
  } else {
    const bas = Math.max(enterreMm * ECHELLE, 2);
    appui(64, solY, bas, 12, '#8A96A8', 'Vis de fondation — ' + c.hauteurVis + ' cm dans le sol', solY + bas / 2);
    // La tete reglable est la seule partie hors sol, et donc la seule qui souleve la structure.
    // Dessinee plus large que le fut : c'est la platine qui recoit la solive.
    if (hauteurVisMm > 0) {
      const tete = Math.max(hauteurVisMm * ECHELLE, 2);
      appui(62, solY - tete, tete, 16, '#B8C2CE', 'Tete reglable — ' + (c.depassementVis || 0) + ' cm hors sol', solY - tete / 2);
    }
  }
  let y0 = hauteurVisMm;
  if (soliveH > 0) { bande(y0, soliveH, '#6b4a2a', 'Solive (' + c.soliveSection + ' mm)'); y0 += soliveH; }
  if (lambourdeH > 0) { bande(y0, lambourdeH, '#b45a2a', 'Lambourde (' + sectionLambourde(c) + ' mm)'); y0 += lambourdeH; }
  bande(y0, lameH, '#c9a15a', 'Lame — ' + lameH + ' mm');

  const hAssise = Math.max(assiseH * ECHELLE, 3);
  const hDalle = dalleH * ECHELLE, hMassif = massifH * ECHELLE;
  return (
    <>
      <div className="sectionTitle">Plan de coupe</div>
      <div id="terrasseCoupeWrap" style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Coupe de la terrasse">
          <line x1={10} x2={W - 10} y1={solY} y2={solY} stroke={SOL} strokeWidth={3} />
          {texte(solY + 15, decaisseMm > 0 ? 'Fond de fouille' : 'Sol', 10, 10, SOL)}
          {decaisseMm > 0 && <>
            <line x1={10} x2={W - 10} y1={solY - decaisseMm * ECHELLE} y2={solY - decaisseMm * ECHELLE} stroke={SOL} strokeWidth={2} strokeDasharray="6 4" />
            {texte(solY - decaisseMm * ECHELLE - 4, 'Terrain naturel — décaissement ' + (decaisseMm / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' cm', 108, 10, SOL)}
          </>}
          {/* L'assise : la couche que le mode vis n'a pas, parce que la vis fait sa propre fondation. */}
          {assiseH > 0 && <>
            <rect x={40} y={solY + hDalle} width={60} height={hAssise} fill="#9aa6b0" stroke={ENCRE} strokeWidth={1} />
            {texte(solY + hDalle + hAssise / 2 + 4, (dalleH ? 'Hérisson concassé — ' : 'Concasse compacte — ') + (c.supportDecaissement || 15) + ' cm')}
          </>}
          {dalleH > 0 && <>
            <rect x={40} y={solY} width={60} height={hDalle} fill="#c8c8c4" stroke={ENCRE} strokeWidth={1} />
            {texte(solY + hDalle / 2 + 4, 'Dalle béton armé — ' + Math.round(DALLE_BETON_EP_M * 100) + ' cm')}
          </>}
          {massifH > 0 && <>
            <rect x={52} y={solY} width={36} height={hMassif} fill="#c8c8c4" stroke={ENCRE} strokeWidth={1} />
            {texte(solY + hMassif / 2 + 4, 'Massif béton — ' + Math.round(MASSIF_COTE_M * 100) + ' × ' + Math.round(MASSIF_COTE_M * 100) + ' × ' + Math.round(MASSIF_COTE_M * 100) + ' cm')}
          </>}
          {couches}
        </svg>
      </div>
      <div className="hint">Empilement des couches a l'endroit le plus charge (appui / solive / lambourde / lame), a l'echelle. Le fut de la vis est enterre : seul son depassement de tete souleve la terrasse. Tout se regle dans Construction.</div>
    </>
  );
}
