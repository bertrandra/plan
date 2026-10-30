// Les propositions de toit que le diagnostic de forme des facades fait a l'audit (MD/spec-facade-calage-audit.md §5 bis, §5 ter, E8 ;
// lot F4). Le diagnostic est celui de l'orchestrateur (E5 bis, `MesureFacade.diagnostic`) : chaque proposition y porte son corps par son
// MUR et l'observation que le moteur doit relire. Ici, on la fait relire par le moteur des toits (corpsSousContrainte), sur la mesure
// LiDAR du batiment, puis passer la porte du fait du batiment (corpsProposesSousFait : un fait en remplacement fixe le toit, un fait en
// contrainte refuse ce qui ne le tient pas). Rien n'est ecrit de notre main : l'effet est le corps que le moteur rend, au rang que son
// mur designe ; ses hauteurs sont celles du LiDAR (decision 12). Toute ligne arrive DECOCHEE (decision 10 : une forme de toit lue sur
// la photo se confirme toujours) ; l'avant/apres la montre, le corps concerne en surbrillance (surbrillance.ts, `corpsDuToit`).
//
// Les cheminees et lucarnes que la ligne du haut montre (lot F7, `MesureFacade.diagnostic.elements`) suivent le meme chemin : le moteur
// les pose sur le corps de leur mur (corpsSousContrainte, elementsDesMurs.ts), la ligne arrive decochee, et l'effet n'ajoute que ce que
// le moteur a pose (`elementsDuToit`) : ce que le corps portait, a la main ou vu, ne bouge pas. La fenetre d'une lucarne quitte la
// facade objet du mur (un element n'a qu'un endroit, §5 quater). Pur.

import { facadesDuContour, nomFacade, type Facade } from '../../../geometry/cotesVusDeDehors.js';
import { corpsProposesSousFait, corpsSousContrainte } from '../../../facade/regles/toits/faits.js';
import { murDuCorps } from '../../../facade/regles/toits/murDuCorps.js';
import { diagnostiquerForme, direAlerte, direChangement, direElement, direPreuve, type DiagnosticForme, type PropositionElement } from '../../../facade/regles/facades/diagnosticForme.js';
import { observationsDuRun } from '../../../facade/regles/facades/ia.js';
import { lucarnesDevantLeMur } from '../../../facade/regles/toits/elementsDesMurs.js';
import { propositionsEquipements, propositionsSaillies } from './facadeEnrichie.js';
import { propositionBords, propositionsElementsToit } from './facadeToit.js';
import { ecrivainPeut } from '../../../model/protections.js';
import { faitDuBatiment } from '../../../regles/toits/faits.js';
import { toitChoisiALaMain } from './constats.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { MesureFacade } from './mesures.js';
import type { RunEnregistre } from '../../../regles/facades/observations.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut, ToitMesure } from '../../../model/types.js';

/** Pourquoi la ligne arrive decochee : la decision 10 de la spec, dite a la personne. */
const RESERVE_FORME = 'Une forme de toit lue sur la photo se confirme toujours : cochez-la si la photo montre bien ce changement. Le moteur des toits la relit sur ce corps ; les hauteurs du LiDAR restent.';

const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** Les pignons d'un pan d'un corps, en clair. */
function direPignons(c: CorpsToit, pan: 0 | 1): string {
  const pg = c.pignons.filter((p) => p.pan === pan);
  return pg.length ? pg.length + ' pignon' + (pg.length > 1 ? 's' : '') + ' (' + pg.map((p) => 'de ' + f2(p.debut) + ' à ' + f2(p.fin) + ' m').join(' et ') + ' le long du faîtage)' : 'aucun pignon sur ce pan';
}

/** Pourquoi une cheminee ou une lucarne arrive decochee (decision 10), et ce qui ne bouge pas. */
const RESERVE_ELEMENT = 'Un élément du toit lu sur la photo se confirme toujours : cochez-le si la photo le montre bien. Le moteur des toits le pose sur ce corps ; ce que le toit porte déjà ne bouge pas.';

const GENRE: Readonly<Record<PropositionElement['element'], [string, string]>> = { cheminee: ['cheminée', 'cheminées'], lucarne: ['lucarne', 'lucarnes'] };
const compte = (n: number, [un, des]: [string, string]) => (n ? n + ' ' + (n > 1 ? des : un) : 'aucune ' + un);

/**
 * La proposition d'une cheminee ou d'une lucarne (lot F7) : le moteur la pose sur le corps de son mur ; rien quand il ne pose rien (le
 * corps la porte deja) ou que le fait du batiment refuse le toit qui en sort. Decochee ; « remplace un choix » quand les elements du toit
 * ont ete poses a la main (model/protections.ts, groupe `elements`) : ceux-la restent, l'element vu s'y ajouterait.
 */
function propositionElement(o: ObjetPlan, nom: string, cle: string, cote: number, mur: string, corps: CorpsToit[], mesure: ToitMesure, pts: PtBrut[], p: PropositionElement, indice: Proposition['indices'][number]): Proposition | null {
  const relus = corpsSousContrainte({ observation: p.observation, application: 'contrainte' }, corps, mesure, pts);
  const vu = p.observation.elementsDesMurs?.[0];
  const k = vu ? murDuCorps(corps, vu.mur.gauche, vu.mur.droite)?.corps : undefined;
  const avant = k === undefined ? undefined : corps[k], apres = k === undefined ? undefined : relus?.[k];
  if (!vu || k === undefined || !avant || !apres || !relus || 'refus' in corpsProposesSousFait(faitDuBatiment(o), relus, pts)) return null;
  const cheminees = (apres.cheminees ?? []).slice(avant.cheminees?.length ?? 0), lucarnes = (apres.lucarnes ?? []).slice(avant.lucarnes?.length ?? 0);
  if (!cheminees.length && !lucarnes.length) return null;
  // La fenetre de la lucarne, vue sur ce mur du contour : elle quitte la facade objet quand la lucarne se pose.
  const f = facadesDuContour(pts, 0).find((x) => x.cote === cote);
  const devant = f && lucarnes.length ? lucarnesDevantLeMur([{ ...apres, lucarnes }], f.gauche, f.droite) : [];
  const n = p.element === 'cheminee' ? avant.cheminees?.length ?? 0 : avant.lucarnes?.length ?? 0;
  return {
    id: cle + ':element:' + cote + ':' + k + ':' + p.element + ':' + Math.round(p.u * 100), cible: { type: 'batiment', cle },
    objet: 'Toit de ' + nom + ', corps ' + (k + 1) + ' (vu sur la ' + mur + ')', source: 'mesure',
    avant: compte(n, GENRE[p.element]) + ' sur ce corps',
    apres: direElement(p) + ', posée par le moteur des toits sur ce corps',
    indices: [indice],
    confiance: null,
    remplaceChoix: ecrivainPeut(o, 'audit', 'elements') ? null : 'éléments du toit posés à la main',
    reserve: RESERVE_ELEMENT,
    effet: { type: 'elementsDuToit', corps: k, cheminees, lucarnes, vu, facade: devant.length ? { cote, lucarnes: devant } : null },
  };
}

/**
 * Le diagnostic de forme d'une facade mesuree, complete par ce que Claude en lit (lot F7, decision du proprietaire : « utilise les formes
 * pour completer les decisions ») : quand le run de la facade est la (ses passes votees, son escalade), le diagnostic se refait avec ses
 * observations (pointes, silhouette, elements), sur le haut lu de la mesure et les corps d'aujourd'hui, par les memes regles que la
 * calibration (diagnosticForme.ts : une proposition que ses pointes confirment vient « des deux », ce qu'il est seul a voir la ou la
 * photo se lit n'est pas propose, les hauteurs restent celles du LiDAR). Sans run, celui de la mesure ; sans mesure de cette seance (une
 * mesure relue d'un fichier n'a pas de diagnostic), rien.
 */
function diagnosticAvecClaude(m: MesureFacade | undefined, facade: Facade, corps: readonly CorpsToit[], run: RunEnregistre | undefined): DiagnosticForme | null {
  if (!m?.diagnostic) return null;
  const ia = run ? observationsDuRun(run) : null;
  return ia ? diagnostiquerForme({ facade, corps, hauteurMur: facade.hauteur, lue: m.hautLu ?? null, ia }) : m.diagnostic;
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
      const d = diagnosticAvecClaude(m, f.facade, corps, e.runs?.[cleMesure(b.cle, f.cote)]);
      for (const p of d?.propositions ?? []) {
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
            ...(d?.alertes ?? []).filter((a) => a.corps === p.corps).map((a) => ({ texte: 'Alerte : ' + direAlerte(a) + '.' })),
          ],
          confiance: null,
          remplaceChoix: toitChoisiALaMain(o) ? 'forme du toit saisie' : null,
          reserve: RESERVE_FORME,
          effet: { type: 'corpsDuToit', corps: k, toit: apres },
        });
      }
      const mur = 'façade ' + nomFacade(f.facade.orientation, f.cote);
      const indice = { texte: 'La ligne du haut de la ' + mur + ', lue sur la photo : une bosse plus étroite qu’un pignon, ou ce que Claude y voit.', ...(m?.rangReleve !== null && m?.rangReleve !== undefined ? { photo: { cle: b.cle, cote: f.cote, rang: m.rangReleve } } : {}) };
      for (const p of d?.elements ?? []) {
        const x = propositionElement(o, b.nom, b.cle, f.cote, mur, corps, mesure, pts, p, indice);
        if (x) out.push(x);
      }
      // La facade enrichie (lot L1) : les saillies que le moteur pose sur le corps de leur mur, et ce qui est pose contre le mur.
      const run = e.runs?.[cleMesure(b.cle, f.cote)];
      const obs = run ? observationsDuRun(run) : null;
      if (obs) {
        const lue = { o, nom: b.nom, cle: b.cle, facade: f.facade, mur, corps, mesure, pts, obs, diagnostic: d, indice: { texte: 'Lu par Claude sur la photo de la ' + mur + '.', ...(indice.photo ? { photo: indice.photo } : {}) } };
        out.push(...propositionsSaillies(lue), ...propositionsEquipements(lue, e.objets));
        // Le toit lu sur la facade (lot L2) : les fenetres de toit et panneaux poses par le moteur, le faitage et la gouttiere.
        out.push(...propositionsElementsToit(lue));
        const bords = propositionBords(lue);
        if (bords) out.push(bords);
      }
    }
  }
  return out;
}
