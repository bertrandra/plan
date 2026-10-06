// Le tableau d'optimisation de la structure, montre dans l'inspecteur (Z5) sous le bouton qui le
// demande. Une ligne par strategie de construction, chacune a son meilleur entraxe ; la configuration
// actuelle est toujours montree, meme quand elle n'est pas la meilleure de sa famille.
//
// Le calcul vit dans `engine/optimisation.ts`. « Appliquer » passe par le service des resultats :
// c'est une saisie, elle s'annule et marque le projet modifie.

import { enLectureSeule } from '../../app/acces.js';
import { ensureConstruction } from '../../engine/construction.js';
import { ESSENCE_PRICES, estPlots, SOLIVE_PRICE, VIS_PRICE } from '../../engine/constantes.js';
import { maxEntraxeLameCm, sectionLambourde } from '../../engine/portees.js';
import { evaluerStructure, optimiserParametres } from '../../engine/optimisation.js';
import { prixPlotUnite } from '../../engine/prix.js';
import { lamesAngleOf, prixUnitaire, surfaceNetteTerrasse } from '../../engine/structure.js';
import { aDesSommets } from '../../model/formes.js';
import type { CandidatStructure } from '../../engine/structure.js';
import type { Resultats } from '../../app/resultats.js';
import type { ObjetPlan } from '../../model/types.js';

export function Optimisation({ obj, resultats }: { obj: ObjetPlan; resultats: Resultats }) {
  if (!resultats.optimisationVisible() || !aDesSommets(obj) || obj.pts.length < 3) return null;
  const objets = resultats.etat.objects;
  const c = ensureConstruction(obj);
  const res = optimiserParametres(obj, objets);
  const meilleur = res[0];
  if (!meilleur) return <div id="terrasseOptimResult"><div className="hint">Aucune configuration exploitable.</div></div>;

  const surPlots = estPlots(c);
  const estActuelle = (r: CandidatStructure) => surPlots
    ? (r.topologie === (c.plotAvecSolives ? 'double' : 'simple') &&
       r.section === (c.plotAvecSolives ? c.soliveSection : sectionLambourde(c)) &&
       (r.topologie === 'simple' || r.soliveEntraxe === c.soliveEntraxe))
    : (r.section === c.soliveSection && r.avecLambourde === !!c.avecLambourde && r.soliveEntraxe === c.soliveEntraxe);
  // Deux entraxes voisins d'une meme strategie different de quelques euros et rempliraient le tableau
  // de la meme reponse : on garde le meilleur de chaque couple section / lambourdes.
  const vus = new Set<string>();
  const distincts = res.filter(r => {
    const cle = r.section + '|' + (surPlots ? r.topologie : r.avecLambourde);
    if (vus.has(cle)) return false;
    vus.add(cle); return true;
  });
  if (!distincts.some(estActuelle)) {
    const actuelle = res.find(estActuelle);
    if (actuelle) distincts.push(actuelle);
  }
  const appliquer = (r: CandidatStructure) => resultats.saisir(() => {
    if (surPlots) {
      c.plotAvecSolives = r.topologie === 'double';
      if (r.topologie === 'double') { c.soliveSection = r.section; c.soliveEntraxe = r.soliveEntraxe; }
      else c.lambourdeSection = r.section;
      c.avecLambourde = true;
      c.plotEntraxeAuto = true;
    } else {
      c.soliveSection = r.section;
      c.avecLambourde = r.avecLambourde;
      c.soliveEntraxe = r.soliveEntraxe;
      c.lambourdeEntraxe = r.lambourdeEntraxe;
      c.visModeAuto = true;
    }
  });

  const actuel = evaluerStructure(obj, c,
    surPlots ? prixPlotUnite(c) : prixUnitaire(c, 'vis', VIS_PRICE),
    prixUnitaire(c, 'bois', SOLIVE_PRICE),
    lamesAngleOf(obj), surfaceNetteTerrasse(obj.pts, objets) || 1, objets);
  const gain = actuel.cout - meilleur.cout;

  return (
    <div id="terrasseOptimResult">
      <div className="hint">
        {'Lames de ' + (c.epaisseurLame || 25) + ' mm en ' + ((ESSENCE_PRICES[c.essenceBois ?? ''] || { label: undefined }).label || c.essenceBois) +
          ' : appuis a ' + maxEntraxeLameCm(c) + ' cm maximum. Une ligne par strategie de construction (section × avec ou sans lambourdes), ' +
          'a chaque fois son meilleur entraxe ; toutes respectent cette limite et la portee de chaque piece. Classement par cout de structure ' +
          '(vis + bois porteur) : les lames sont identiques dans tous les cas, donc exclues. Detail du calcul dans l\'onglet Methode.'}
      </div>
      <table className="attrTable"><tbody>
        <tr><th>Section</th><th>Lambourdes</th><th>Entraxe solives</th><th>Portee vis</th><th>Vis</th><th>Bois</th><th>Densite</th><th>Cout structure</th><th></th></tr>
        {distincts.map((r, i) => {
          const courante = estActuelle(r);
          return (
            <tr key={r.section + r.topologie + r.avecLambourde + r.soliveEntraxe} className={courante ? 'ligneCourante' : undefined}>
              <td>{r.section + (i === 0 ? '  ← optimum' : '')}</td>
              <td>{surPlots
                ? (r.topologie === 'double' ? 'double (plots sous solives)' : 'simple (plots sous lambourdes)')
                : (r.avecLambourde ? 'oui (' + r.lambourdeEntraxe + ' cm)' : 'non')}</td>
              <td>{surPlots && r.topologie === 'simple' ? '—' : r.soliveEntraxe + ' cm'}</td>
              <td>{r.portee + ' cm'}</td>
              <td>{r.vis}</td>
              <td>{r.ml + ' ml'}</td>
              <td>{r.densite + '/m²'}</td>
              <td>{r.cout + ' €'}</td>
              <td>{courante
                ? <span className="noteLigne">config actuelle</span>
                : <button type="button" className="objbtn" disabled={enLectureSeule()} onClick={() => appliquer(r)}>Appliquer</button>}</td>
            </tr>
          );
        })}
      </tbody></table>
      <div className="hint">
        {res.length + ' configurations testees. Config actuelle : ' + actuel.vis + ' vis, ' + actuel.densite + '/m², ' + actuel.cout + ' € — optimum : ' +
          meilleur.vis + ' vis, ' + meilleur.densite + '/m², ' + meilleur.cout + ' €' +
          (gain > 0 ? ', soit ' + gain + ' € et ' + (actuel.vis - meilleur.vis) + ' vis en moins.' : '. La config actuelle est deja au niveau de l\'optimum.') +
          ' Pre-dimensionnement indicatif sur base 250 kg/m², sans valeur de note de calcul.'}
      </div>
    </div>
  );
}
