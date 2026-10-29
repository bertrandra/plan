// Les propositions de toit que le diagnostic de forme des facades fait a l'audit (MD/spec-facade-calage-audit.md §5 bis, §5 ter, E8 ;
// lot F4). Le diagnostic est celui de l'orchestrateur (E5 bis, `MesureFacade.diagnostic`) : chaque proposition y porte son corps par son
// MUR et l'observation que le moteur doit relire. Ici, on la fait relire par le moteur des toits (corpsSousContrainte), sur la mesure
// LiDAR du batiment, puis passer la porte du fait du batiment (corpsProposesSousFait : un fait en remplacement fixe le toit, un fait en
// contrainte refuse ce qui ne le tient pas). Rien n'est ecrit de notre main : l'effet est le corps que le moteur rend, au rang que son
// mur designe ; ses hauteurs sont celles du LiDAR (decision 12). Toute ligne arrive DECOCHEE (decision 10 : une forme de toit lue sur
// la photo se confirme toujours) ; l'avant/apres la montre, le corps concerne en surbrillance (surbrillance.ts, `corpsDuToit`). Pur.

import { nomFacade } from '../../../geometry/cotesVusDeDehors.js';
import { corpsProposesSousFait, corpsSousContrainte } from '../../../facade/regles/toits/faits.js';
import { murDuCorps } from '../../../facade/regles/toits/murDuCorps.js';
import { direAlerte, direChangement, direPreuve } from '../../../facade/regles/facades/diagnosticForme.js';
import { faitDuBatiment } from '../../../regles/toits/faits.js';
import { toitChoisiALaMain } from './constats.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

/** Pourquoi la ligne arrive decochee : la decision 10 de la spec, dite a la personne. */
const RESERVE_FORME = 'Une forme de toit lue sur la photo se confirme toujours : cochez-la si la photo montre bien ce changement. Le moteur des toits la relit sur ce corps ; les hauteurs du LiDAR restent.';

const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Les pignons d'un pan d'un corps, en clair. */
function direPignons(c: CorpsToit, pan: 0 | 1): string {
  const pg = c.pignons.filter((p) => p.pan === pan);
  return pg.length ? pg.length + ' pignon' + (pg.length > 1 ? 's' : '') + ' (' + pg.map((p) => 'de ' + f2(p.debut) + ' à ' + f2(p.fin) + ' m').join(' et ') + ' le long du faîtage)' : 'aucun pignon sur ce pan';
}

/** Les propositions de toit des facades mesurees, une par corps diagnostique, relues par le moteur des toits. */
export function propositionsDeForme(e: EntreesPropositions): Proposition[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) {
    const o = parCle.get(b.cle);
    const corps = o?.batiment?.corpsToit, mesure = o?.batiment?.toitMesure;
    const pts = o && 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : null;
    if (!o || !corps?.length || !mesure || !pts || pts.length < 3) continue;
    for (const f of b.facades) {
      const m = e.mesures.get(cleMesure(b.cle, f.cote));
      for (const p of m?.diagnostic?.propositions ?? []) {
        // Le moteur relit le corps que designe son mur, tel qu'il est dans le plan aujourd'hui.
        const relus = corpsSousContrainte({ observation: p.observation, application: 'contrainte' }, corps, mesure, pts);
        const k = murDuCorps(corps, p.mur.gauche, p.mur.droite)?.corps;
        const avant = k === undefined ? undefined : corps[k], apres = k === undefined ? undefined : relus?.[k];
        if (k === undefined || !avant || !apres || !relus || JSON.stringify(apres) === JSON.stringify(avant)) continue;
        if ('refus' in corpsProposesSousFait(faitDuBatiment(o), relus, pts)) continue;
        const pan: 0 | 1 = p.cote === 0 ? 0 : 1;
        const mur = 'façade ' + nomFacade(f.facade.orientation, f.cote);
        out.push({
          id: b.cle + ':forme:' + f.cote + ':' + k + ':' + p.cote, cible: { type: 'batiment', cle: b.cle },
          objet: 'Toit de ' + b.nom + ', corps ' + (k + 1) + ' (vu sur la ' + mur + ')', source: 'mesure',
          avant: p.bout ? (avant.croupes?.[p.cote === 3 ? 0 : 1] ? 'une croupe à ce bout' : 'un pignon à ce bout') : direPignons(avant, pan),
          apres: direChangement(p) + ', ' + direPreuve(p),
          indices: [
            { texte: 'Le haut de la ' + mur + ', lu sur la photo, comparé à la silhouette que ce corps lui donne (le gabarit).', ...(m?.rangReleve !== null && m?.rangReleve !== undefined ? { photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } } : {}) },
            ...(m?.diagnostic?.alertes ?? []).filter((a) => a.corps === p.corps).map((a) => ({ texte: 'Alerte : ' + direAlerte(a) + '.' })),
          ],
          confiance: null,
          remplaceChoix: toitChoisiALaMain(o) ? 'forme du toit saisie' : null,
          reserve: RESERVE_FORME,
          effet: { type: 'corpsDuToit', corps: k, toit: apres },
        });
      }
    }
  }
  return out;
}
