// Les exemples du catalogue des formes de toit : un petit corps de reference (10 m sur 7 m) par forme et par lucarne, en donnees.
//
// Ce sont des donnees du toit, pas un dessin : le controleur d'edition du toit (facade/modeToit/controleurToit.ts) remet une forme a
// l'echelle d'un batiment a partir d'elles, et la 3D (three/catalogueToits.ts) en tire les vignettes. Elles vivaient dans three/ avec
// le dessin, ce qui forcait la logique des gestes a vivre dans three/ aussi (revue d'architecture du 28 novembre 2026, constat 6). Pur.

import type { CorpsToit, Lucarne, PignonToit, TypeLucarne } from '../../model/types.js';

/** Un corps de reference : tout ce qui decrit le toit, sans le contour (le rectangle est donne par la longueur, la largeur et le decalage). */
export type CorpsExemple = Pick<CorpsToit, 'posFaitage' | 'faitage' | 'egouts'> & Partial<Pick<CorpsToit, 'croupes' | 'profil' | 'bouts' | 'speciale' | 'terrasse'>> & { lucarnes?: Lucarne[]; pignons?: PignonToit[] };

export interface ExempleToit {
  id: string;
  titre: string;
  /** Le nom courant, quand il y en a un autre. */
  aussi?: string;
  famille: 'toit' | 'lucarne';
  /** Un ou plusieurs corps accoles ; `t0` : le decalage en travers du corps, `w` : sa largeur, `l` : sa longueur (defauts : `LARGEUR_M`, `LONGUEUR_M`). */
  corps: readonly { corps: CorpsExemple; t0?: number; w?: number; l?: number }[];
}

export const LONGUEUR_M = 10;
export const LARGEUR_M = 7;

/** Le corps de l'exemple, avec son contour : de quoi demander sa forme au modele. */
export function corpsDeLExemple(e: ExempleToit): CorpsToit[] {
  return e.corps.map(({ corps, t0 = 0, w = LARGEUR_M, l = LONGUEUR_M }) => ({
    ...corps, pts: [{ x: 0, y: t0 }, { x: l, y: t0 }, { x: l, y: t0 + w }, { x: 0, y: t0 + w }], pignons: corps.pignons ?? [], ecart: 0,
  }) as CorpsToit);
}

const base: CorpsExemple = { posFaitage: 3.5, faitage: 7, egouts: [3, 3] };
const un = (corps: CorpsExemple, plus: { t0?: number; w?: number; l?: number } = {}) => ({ corps, ...plus });
const lucarne = (type: TypeLucarne): Lucarne => ({ type, pan: 1, debutM: 3.5, finM: 6.5, faitageM: 5.2, profondeurM: 1.4, source: 'observation' });
const brise = { type: 'brise' as const, largeurBrisisM: 1.6, hauteurBrisM: 5 };
const arc = (fleche: number) => ({ type: 'courbe' as const, flecheM: fleche });
const coyau = { type: 'coyau' as const, largeurM: 1.4, penteDeg: 12, debordM: 0.9 };
const tourelle = (speciale: NonNullable<CorpsExemple['speciale']>, faitage: number): CorpsExemple => ({ posFaitage: 3, faitage, egouts: [3, 3], speciale });
const appentis = (faitage: number): CorpsExemple => ({ posFaitage: 0, faitage, egouts: [3, 3] });

export const EXEMPLES_TOITS: readonly ExempleToit[] = [
  { id: 'deux-pans', titre: 'Deux pans', famille: 'toit', corps: [un(base)] },
  { id: 'croupes', titre: 'Quatre pans', aussi: 'croupes', famille: 'toit', corps: [un({ ...base, croupes: [2.5, 2.5] })] },
  { id: 'pavillon', titre: 'Pavillon', aussi: 'pyramide', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 7, egouts: [3, 3], croupes: [3.5, 3.5] }, { l: 7 })] },
  { id: 'appentis', titre: 'Un pan', aussi: 'appentis', famille: 'toit', corps: [un({ posFaitage: 0, faitage: 6, egouts: [3, 3] })] },
  { id: 'plat', titre: 'Toit plat', aussi: 'toit-terrasse', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [3, 3] })] },
  { id: 'demi-croupes', titre: 'Cul de geai', aussi: 'demi-croupe, nez de veau, bout rabattu, croupette, croupe meunière', famille: 'toit', corps: [un({ ...base, bouts: [{ type: 'demi-croupe', profondeurM: 1.6, hauteurPignonM: 2.6 }, { type: 'pignon' }] })] },
  { id: 'mansart', titre: 'Mansart', aussi: 'brisis aux quatre côtés', famille: 'toit', corps: [un({ ...base, profil: [brise, brise], bouts: [{ type: 'brisis', largeurM: 1.6 }, { type: 'brisis', largeurM: 1.6 }] })] },
  { id: 'asymetrique', titre: 'Asymétrique', aussi: 'saltbox', famille: 'toit', corps: [un({ posFaitage: 2.2, faitage: 7, egouts: [4, 1.8] })] },
  { id: 'deux-pans-decales', titre: 'Deux pans décalés', famille: 'toit', corps: [un({ posFaitage: 2.5, faitage: 6, egouts: [3, 3] }, { w: 5 }), un({ posFaitage: 2.5, faitage: 7.5, egouts: [3, 3] }, { t0: 5, w: 5 })] },
  { id: 'toit-en-m', titre: 'Toit en M', aussi: 'double pignon', famille: 'toit', corps: [un({ posFaitage: 2.5, faitage: 6.5, egouts: [3, 3] }, { w: 5 }), un({ posFaitage: 2.5, faitage: 6.5, egouts: [3, 3] }, { t0: 5, w: 5 })] },
  { id: 'papillon', titre: 'Papillon', aussi: 'en V', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [5, 5] })] },
  { id: 'gambrel', titre: 'Gambrel', aussi: 'toit brisé, à la hollandaise', famille: 'toit', corps: [un({ ...base, profil: [brise, brise], bouts: [{ type: 'pignon' }, { type: 'pignon' }] })] },
  { id: 'coyau', titre: 'Queue de vache (coyau)', aussi: 'coyau, toit retroussé, égout retroussé', famille: 'toit', corps: [un({ ...base, profil: [coyau, coyau] })] },
  { id: 'shed', titre: 'Shed', aussi: 'dents de scie', famille: 'toit', corps: [un(appentis(5.6), { w: 4 }), un(appentis(5.6), { t0: 4, w: 4 }), un(appentis(5.6), { t0: 8, w: 4 })] },
  { id: 'berceau', titre: 'Berceau', aussi: 'voûte', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 6, egouts: [3, 3], profil: [arc(0.8), arc(0.8)] })] },
  { id: 'carene', titre: 'Carène', aussi: 'coque renversée', famille: 'toit', corps: [un({ posFaitage: 3.5, faitage: 6.8, egouts: [3, 3], profil: [arc(1.3), arc(1.3)], bouts: [{ type: 'croupe', profondeurM: 2.5 }, { type: 'croupe', profondeurM: 2.5 }] })] },
  { id: 'conique', titre: 'Conique', aussi: 'poivrière', famille: 'toit', corps: [un(tourelle({ type: 'conique' }, 8), { l: 6, w: 6 })] },
  { id: 'polygonal', titre: 'Polygonal', aussi: 'kiosque', famille: 'toit', corps: [un(tourelle({ type: 'polygonal', cotes: 6 }, 7), { l: 6, w: 6 })] },
  { id: 'fleche', titre: 'Flèche', aussi: 'clocher', famille: 'toit', corps: [un(tourelle({ type: 'fleche', cotes: 8 }, 12), { l: 5, w: 5 })] },
  { id: 'dome', titre: 'Dôme', aussi: 'coupole', famille: 'toit', corps: [un(tourelle({ type: 'dome' }, 6.2), { l: 6, w: 6 })] },
  { id: 'imperiale', titre: 'Impériale', aussi: 'bulbe', famille: 'toit', corps: [un(tourelle({ type: 'imperiale' }, 9), { l: 6, w: 6 })] },
  { id: 'jacobine', titre: 'Lucarne jacobine', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('jacobine')] })] },
  { id: 'capucine', titre: 'Lucarne capucine', aussi: 'à croupe', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('capucine')] })] },
  { id: 'chien-assis', titre: 'Lucarne chien-assis', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('chien-assis')] })] },
  { id: 'rampante', titre: 'Lucarne rampante', aussi: 'à un pan', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('rampante')] })] },
  { id: 'meuniere', titre: 'Lucarne meunière', aussi: 'dans le mur d’égout', famille: 'lucarne', corps: [un({ ...base, lucarnes: [lucarne('meuniere')] })] },
  { id: 'oeil-de-boeuf', titre: 'Œil-de-bœuf', aussi: 'lucarne ronde', famille: 'lucarne', corps: [un({ ...base, lucarnes: [{ ...lucarne('oeil-de-boeuf'), debutM: 4.4, finM: 5.6, profondeurM: 1.2 }] })] },
  { id: 'outeau', titre: 'Outeau', aussi: 'petite lucarne à croupe', famille: 'lucarne', corps: [un({ ...base, lucarnes: [{ ...lucarne('outeau'), debutM: 4.2, finM: 5.8 }] })] },
  { id: 'avant-corps', titre: 'Avant-corps à pignon', aussi: 'pignon depuis le faîtage', famille: 'lucarne', corps: [un({ ...base, pignons: [{ pan: 1, debut: 3.4, fin: 6.6, faitage: 7, profondeur: 3.5 }] })] },
  { id: 'lanterneau', titre: 'Lanterneau', aussi: 'sur toit plat', famille: 'lucarne', corps: [un({ posFaitage: 3.5, faitage: 3, egouts: [3, 3], lucarnes: [{ ...lucarne('lanterneau'), faitageM: 3.6, profondeurM: 2.2, debutM: 3.5, finM: 5.5 }] })] },
];
