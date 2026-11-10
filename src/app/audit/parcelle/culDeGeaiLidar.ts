// Le cul de geai (demi-croupe ; aussi nez de veau, bout rabattu, croupette) que la mesure LiDAR montre, propose a l'audit (demande du
// proprietaire du 5 novembre 2026 : « dans la decouverte auto »). La lecture des toits pose deja une demi-croupe sur le corps principal
// d'un batiment a un seul corps quand la mesure la porte nettement mieux (facade/regles/toits/catalogue.ts) ; elle ne regarde ni les
// autres corps, ni la pointe d'un pignon traversant. Ici, chaque bout de chaque corps et chaque pignon est lu aux seuils stricts de la
// lecture (facade/toits/culDeGeai.ts) ; ce qu'elle porte est PROPOSE, decoche, et c'est le moteur des toits qui le relit
// (corpsSousContrainte, `boutsDesMurs` et `pointesDesMurs`), comme une proposition de l'E10. Rien n'est ecrit de notre main, et la sortie
// automatique du moteur ne change pas (AE 101 identique). Pur.

import { corpsProposesSousFait, corpsSousContrainte } from '../../../facade/regles/toits/faits.js';
import { demiCroupeLueALaPointe, demiCroupeLueAuBout } from '../../../facade/toits/culDeGeai.js';
import { nomDuBout } from '../../../facade/modeToit/bouts.js';
import { boutsDuCorps } from '../../../model/formeToit.js';
import { faitDuBatiment, type ObservationFait } from '../../../regles/toits/faits.js';
import { toitChoisiALaMain } from './constats.js';
import type { EntreesPropositions } from './propositions.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { CorpsToit, DemiCroupe, PtBrut } from '../../../model/types.js';

/** Pourquoi la ligne arrive decochee : une forme lue sur la seule mesure se confirme, comme une forme lue sur la photo. */
const RESERVE = 'Un cul de geai lu sur la seule mesure LiDAR se confirme : cochez-le si la photo ou ce que vous voyez le montre. Le moteur des toits le relit sur ce corps ; les hauteurs du LiDAR restent.';

const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const dire = (d: DemiCroupe) => 'la pointe coupée à ' + f2(d.hauteurPignonM) + ' m au-dessus de l’égout, la petite croupe sur ' + f2(d.profondeurM) + ' m';
/** Le mur `cote` d'un corps, ses deux bouts (le moteur le retrouve par murDuCorps, quel que soit son sens). */
const murDe = (c: CorpsToit, cote: number) => ({ gauche: { ...(c.pts[cote] as PtBrut) }, droite: { ...(c.pts[(cote + 1) % 4] as PtBrut) } });

/** Les culs de geai que la mesure montre sur les bouts des corps et les pointes des pignons, chacun relu par le moteur, decoches. */
export function propositionsCulsDeGeaiLidar(e: EntreesPropositions): Proposition[] {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) {
    const o = parCle.get(b.cle);
    const corps = o?.batiment?.corpsToit, mesure = o?.batiment?.toitMesure;
    const pts = o && 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : null;
    if (!o || !corps?.length || !mesure || !pts || pts.length < 3) continue;
    const proposer = (k: number, observation: ObservationFait, id: string, objet: string, avant: string, apres: string) => {
      const relus = corpsSousContrainte({ observation, application: 'contrainte' }, corps, mesure, pts);
      const a = corps[k], x = relus?.[k];
      if (!a || !x || !relus || JSON.stringify(a) === JSON.stringify(x) || 'refus' in corpsProposesSousFait(faitDuBatiment(o), relus, pts)) return;
      out.push({
        id: b.cle + ':culDeGeai:' + id, cible: { type: 'batiment', cle: b.cle }, objet: 'Toit de ' + b.nom + ', corps ' + (k + 1) + ' : ' + objet, source: 'mesure',
        avant, apres: apres + ', relu par le moteur des toits sur la mesure LiDAR',
        indices: [{ texte: 'La mesure LiDAR : le faîtage baisse vers ce bout sans atteindre l’égout, et laisse un petit pignon dessous (un cul de geai, aussi nez de veau, bout rabattu, croupette, demi-croupe).' }],
        confiance: null, remplaceChoix: toitChoisiALaMain(o) ? 'forme du toit saisie' : null, reserve: RESERVE,
        effet: { type: 'corpsDuToit', corps: k, toit: x },
      });
    };
    corps.forEach((c, k) => {
      if (c.saillie || c.speciale || c.profil) return;
      const bouts = boutsDuCorps(c);
      ([0, 1] as const).forEach((i) => {
        if (bouts[i].type !== 'pignon') return;
        const d = demiCroupeLueAuBout(c, i, mesure, pts);
        if (d) proposer(k, { boutsDesMurs: [{ mur: murDe(c, i === 0 ? 3 : 1), bout: 'demi-croupe' }] }, 'bout:' + k + ':' + i, nomDuBout(c, i).toLowerCase(), 'un pignon à ce bout', 'un cul de geai (demi-croupe), ' + dire(d));
      });
      c.pignons.forEach((g, j) => {
        if (g.pointe) return;
        const d = demiCroupeLueALaPointe(c, g, mesure, pts);
        if (!d) return;
        const cote = g.pan === 0 ? 0 : 2, mur = murDe(c, cote), l = Math.hypot(mur.droite.x - mur.gauche.x, mur.droite.y - mur.gauche.y);
        // La place du pignon le long de ce mur, depuis sa gauche : le mur 0 suit le faitage, le mur 2 va en sens inverse.
        const sc = (g.debut + g.fin) / 2, a = cote === 0 ? sc : l - sc;
        proposer(k, { pointesDesMurs: [{ mur, a, pointe: 'demi-croupe' }] }, 'pointe:' + k + ':' + j, 'pointe du pignon ' + (j + 1), 'la pointe du pignon en triangle', 'la pointe coupée en cul de geai, ' + dire(d));
      });
    });
  }
  return out;
}
