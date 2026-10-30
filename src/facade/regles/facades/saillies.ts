// Les regles des saillies et des decroches (lot L1 de MD/spec-lecture-ia-elargie.md §4.2, §5.1 point 3) : ce que le moteur decide des
// saillies (bow-window, galerie, auvent, appentis) et des decroches que le run d'une facade lit.
// - Une saillie n'est proposee que si son etendue tombe dans un troncon de corps de la facade (le diagnostic de forme, lot F4) : elle
//   s'adresse au corps par son MUR (l'adresse que murDuCorps retrouve), et le moteur des toits la pose (corpsSousContrainte,
//   facade/regles/toits/sailliesDesMurs.ts) une fois cochee. Rien n'est ecrit ici ;
// - sa hauteur vient de la part lue par le calage du mur (decision 4) ; sa profondeur, qu'une vue de face ne montre pas, est le reglage
//   de son genre (regles/facades/reglages.json, `saillies`), dite dans la proposition (risque 3) ;
// - un decroche retouche un contour de l'IGN, que la photo de face ne mesure pas (sa profondeur) : il est dit en constat, a retoucher a la
//   main, jamais propose a cocher (risque 4). Pur.

import { profondeurSaillieVue } from '../toits/sailliesDesMurs.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { SaillieDeMurFait } from '../../../regles/toits/faits.js';
import type { ObservationsFacade, SaillieIa } from '../../../regles/facades/observations.js';
import type { TronconForme } from './diagnosticForme.js';

/** Une saillie qui deborde de son troncon de plus que cette part du mur n'est pas sur un seul corps : elle n'est pas proposee. */
export const SAILLIE_DEBORD_TRONCON = 0.03;

/** Une saillie a proposer : le corps du troncon, la place sur la facade, et ce que le moteur relira. */
export interface PropositionSaillie {
  corps: number;
  cote: number;
  u0: number;
  u1: number;
  saillie: SaillieIa;
  observation: { sailliesDesMurs: [SaillieDeMurFait] };
}

const cm = (v: number) => Math.round(v * 100) / 100;
const f2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** La place d'un point de la facade (u) le long d'un mur de corps, en metres depuis sa gauche vue de dehors. */
function surLeMur(f: Facade, mur: SaillieDeMurFait['mur'], u: number): number {
  const l = Math.hypot(mur.droite.x - mur.gauche.x, mur.droite.y - mur.gauche.y);
  const x = f.gauche.x + (f.droite.x - f.gauche.x) * u, y = f.gauche.y + (f.droite.y - f.gauche.y) * u;
  return l > 0 ? cm(((x - mur.gauche.x) * (mur.droite.x - mur.gauche.x) + (y - mur.gauche.y) * (mur.droite.y - mur.gauche.y)) / l) : 0;
}

const GENRES: Readonly<Record<SaillieIa['genre'], string>> = { 'bow-window': 'un bow-window', galerie: 'une galerie', auvent: 'un auvent', appentis: 'un appentis' };

/**
 * Les saillies que le run voit sur une facade de `egoutM` metres a l'egout, chacune sur le troncon de corps qui la contient ; les autres
 * (a cheval sur deux corps, hors des corps) sont dites dans `constats`. Une saillie de confiance faible n'est pas proposee.
 */
export function sailliesProposees(obs: ObservationsFacade | null, troncons: readonly TronconForme[], facade: Facade, egoutM: number, constats: string[]): PropositionSaillie[] {
  const out: PropositionSaillie[] = [];
  for (const s of obs?.saillies ?? []) {
    if (s.confiance === 'faible') continue;
    const t = troncons.find((x) => s.u0 >= x.u0 - SAILLIE_DEBORD_TRONCON && s.u1 <= x.u1 + SAILLIE_DEBORD_TRONCON);
    if (!t) { constats.push('Claude voit ' + GENRES[s.genre] + ' de u ' + f2(s.u0) + ' à ' + f2(s.u1) + ', à cheval sur deux corps ou hors d’eux : rien n’est proposé.'); continue; }
    const vu: SaillieDeMurFait = {
      mur: t.mur, genre: s.genre, de: surLeMur(facade, t.mur, Math.max(s.u0, t.u0)), a: surLeMur(facade, t.mur, Math.min(s.u1, t.u1)),
      forme: s.forme, niveau: s.niveau, toit: s.toit,
      ...(s.haut !== null && s.haut > 0 ? { hauteurM: cm(s.haut * egoutM) } : {}),
      ...(s.genre === 'auvent' && s.couverture ? { couverture: s.couverture } : {}),
    };
    if (vu.a < vu.de) [vu.de, vu.a] = [vu.a, vu.de];
    out.push({ corps: t.corps, cote: t.cote, u0: s.u0, u1: s.u1, saillie: s, observation: { sailliesDesMurs: [vu] } });
  }
  return out;
}

/** Une saillie proposee, en clair : « un bow-window de 2,4 m, 0,8 m de profondeur par défaut (une vue de face ne la montre pas) ». */
export function direSaillie(p: Pick<PropositionSaillie, 'saillie' | 'observation'>): string {
  const v = p.observation.sailliesDesMurs[0];
  const largeur = f2(v.a - v.de);
  return GENRES[p.saillie.genre] + ' de ' + largeur + ' m' + (v.hauteurM ? ', à ' + f2(v.hauteurM) + ' m du sol' : '') + ', ' + f2(profondeurSaillieVue(p.saillie.genre)) + ' m de profondeur par défaut (une vue de face ne la montre pas)';
}

/** Les decroches que le run voit : des constats, a retoucher a la main (risque 4 : jamais une retouche du contour proposee seule). */
export function constatsDecroches(obs: ObservationsFacade | null): string[] {
  return (obs?.decroches ?? []).filter((d) => d.confiance !== 'faible').map((d) =>
    'Claude voit le mur ' + (d.sens === 'avance' ? 'avancer' : 'reculer') + ' à u ' + f2(d.u) + ' : le contour ne le suit peut-être pas. Sa profondeur ne se lit pas sur une vue de face ; retouchez le contour à la main si le plan doit le suivre.');
}
