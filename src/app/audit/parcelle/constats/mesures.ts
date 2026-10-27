// Les constats des mesures de l IGN et du LiDAR, pour l audit de la parcelle.
// Un morceau de app/audit/parcelle/constats.ts, qui le reexporte : le reste du programme importe depuis lui.

import { formeDesCorps } from '../../../../model/formeToit.js';
import { lireFormes } from '../../../../facade/toits/lectureFormes.js';
import { lectureVraisemblable } from '../../../../facade/regles/toits/catalogue.js';
import { hauteurBdTopo } from '../../../../facade/regles/toits/vraisemblance.js';
import { materiauMurs } from '../../../../model/couleurMur.js';
import { hauteurDe } from '../../../../regles/decisions.js';
import { azimutFaitage, boutsDuCorps, formeDuCorps, plusGrand } from '../../../../facade/regles/toits/faits.js';
import { murDuCorps } from '../../../../facade/regles/toits/murDuCorps.js';
import { silhouetteDesCorps } from '../../../../facade/regles/toits/silhouetteDesCorps.js';
import { REGLES_LIDAR } from '../reglesLidar.js';
import { type Constat } from '../../../../facade/regles/reconciliation.js';
import type { CorpsToit } from '../../../../model/types.js';
import { cibleBatiment, cibleFacade, cibleCorps, formeArbitree, cm, confianceCorps, principal, type EntreesConstats } from './cibles.js';

export function constatsIgn({ o, b }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  const bd = o.bdtopo as { hauteurM?: number | null; hauteurRetenueM?: number | null; materiauxMurs?: unknown } | undefined | null;
  if (typeof bd?.hauteurM === 'number') out.push({ cible, attribut: 'hauteurEgout', source: 'ign', valeur: cm(bd.hauteurM), confiance: null, regle: REGLES_LIDAR.ign.hauteur });
  else if (typeof bd?.hauteurRetenueM === 'number') out.push({ cible, attribut: 'hauteurEgout', source: 'ign', valeur: cm(bd.hauteurRetenueM), confiance: 0.4, regle: REGLES_LIDAR.ign.estimee });
  const mursFonciers = materiauMurs(bd?.materiauxMurs);
  if (mursFonciers) out.push({ cible, attribut: 'materiauMurs', source: 'ign', valeur: mursFonciers.texture, confiance: 0.7, regle: REGLES_LIDAR.ign.materiau });
  if (o.batiment?.toit?.source === 'bdtopo' && !o.batiment?.corpsToit?.length) out.push({ cible, attribut: 'hauteurTotale', source: 'ign', valeur: cm(hauteurDe(o) + o.batiment?.toit.hauteur), confiance: 0.4, regle: REGLES_LIDAR.ign.toit });
  if (o.batiment?.toit?.source === 'bdtopo' && !o.batiment?.corpsToit?.length) out.push({ cible, attribut: 'formeToit', source: 'ign', valeur: formeArbitree(o.batiment?.toit.forme), confiance: 0.4, regle: REGLES_LIDAR.ign.forme });
  return out;
}

/** Les constats du LiDAR : l'egout et le faitage de la surface mesuree, et la forme, les bouts et le sens des corps lus dessus. */
export function constatsLidar({ o, b }: EntreesConstats): Constat[] {
  const out: Constat[] = [];
  const cible = cibleBatiment(b.cle);
  if (o.batiment?.toitMesure) {
    out.push({ cible, attribut: 'hauteurEgout', source: 'lidar', valeur: cm(o.batiment?.toitMesure.egout), confiance: 0.9, regle: REGLES_LIDAR.lidar.egout });
    out.push({ cible, attribut: 'hauteurTotale', source: 'lidar', valeur: cm(o.batiment?.toitMesure.faite), confiance: 0.85, regle: REGLES_LIDAR.lidar.faite });
  }
  const c = principal(o.batiment?.corpsToit);
  if (c && o.batiment?.toit?.source !== 'saisie') {
    const confiance = confianceCorps(c.ecart);
    const forme = formeDesCorps(o.batiment?.corpsToit);
    // Une forme du catalogue que la surface dit mieux que les formes simples (facade/toits/lectureFormes.ts) remplace la lecture des corps,
    // aux memes conditions qu'a la lecture des toits (facade/regles/toits/catalogue.ts) : ni coyau sans demande, ni arbre pris pour une tourelle.
    const mieux = o.batiment?.toitMesure && 'pts' in o && o.pts ? lireFormes(o.batiment?.toitMesure, o.batiment?.corpsToit ?? [], o.pts).find((l) => lectureVraisemblable(l, hauteurBdTopo(o))) : undefined;
    if (mieux) out.push({ cible, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(mieux.forme), confiance: confianceCorps(mieux.ecart), regle: mieux.regle, indices: [{ texte: 'Lecture des formes : ' + mieux.dit }] });
    else if (forme) out.push({ cible, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(forme), confiance, regle: REGLES_LIDAR.lidar.corps });
    out.push({ cible, attribut: 'boutsToit', source: 'lidar', valeur: boutsDuCorps(c), confiance, regle: REGLES_LIDAR.lidar.bouts });
    out.push({ cible, attribut: 'sensFaitage', source: 'lidar', valeur: cm(azimutFaitage(c)), confiance, regle: REGLES_LIDAR.lidar.sens });
    // Les autres corps, chacun le sien : les silhouettes de leurs murs s'arbitrent contre eux (corps par corps).
    const corps = o.batiment?.corpsToit ?? [], kp = plusGrand(corps);
    corps.forEach((k, i) => {
      if (i === kp) return;
      const ci = cibleCorps(b.cle, i), q = confianceCorps(k.ecart);
      out.push({ cible: ci, attribut: 'formeToit', source: 'lidar', valeur: formeArbitree(formeDuCorps(k)), confiance: q, regle: REGLES_LIDAR.lidar.corps });
      out.push({ cible: ci, attribut: 'boutsToit', source: 'lidar', valeur: boutsDuCorps(k), confiance: q, regle: REGLES_LIDAR.lidar.bouts });
      out.push({ cible: ci, attribut: 'sensFaitage', source: 'lidar', valeur: cm(azimutFaitage(k)), confiance: q, regle: REGLES_LIDAR.lidar.sens });
    });
    // La silhouette de chaque mur sous les corps : la photo l'arbitre mur par mur, et gagne (regles/reconciliation.json, `prioritaires`).
    for (const f of b.facades) {
      const s = silhouetteDesCorps(f.facade, corps, hauteurDe(o));
      const m = murDuCorps(corps, f.facade.gauche, f.facade.droite);
      if (s !== 'indetermine') out.push({ cible: cibleFacade(b.cle, f.cote), attribut: 'silhouetteFacade', source: 'lidar', valeur: s, confiance: confianceCorps((corps[m?.corps ?? kp] as CorpsToit).ecart), regle: REGLES_LIDAR.lidar.silhouette });
    }
  }
  return out;
}
