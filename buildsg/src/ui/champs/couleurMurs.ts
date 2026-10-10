// La couleur des murs d'un batiment en 3D (MD/spec-toit-ign.md §6.5) : d'ou elle vient, et le choix
// de la source - la photo de rue, le materiau des fichiers fonciers, ou la couleur du plan. Deux
// champs de la section « Apparence », pour un batiment qui a au moins une lecture.

import { estBatiment } from '../../model/fonctions.js';
import { materiauMurs, couleurMursRetenue, type CouleurMurs } from '../../model/couleurMur.js';
import type { ObjetPlan } from '../../model/types.js';
import type { Champ, ContexteChamps } from './types.js';

type Source = NonNullable<CouleurMurs['source']>;

const materiau = (o: ObjetPlan) => materiauMurs((o.bdtopo as { materiauxMurs?: unknown } | null | undefined)?.materiauxMurs);
const photo = (o: ObjetPlan) => o.couleurMurs?.photo ?? null;
/** Un batiment dont on sait quelque chose de ses murs : la question de la source se pose. */
const avecLecture = (c: ContexteChamps) => estBatiment(c.obj) && (!!photo(c.obj) || !!materiau(c.obj));

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : null);

/** « photo de rue du 21/03/2018 (IGN) : #D9D2C4 · matériau : meulière et brique, #B3895A · retenue : photo de rue ». */
export function decrireCouleurMurs(o: ObjetPlan): string {
  const p = photo(o), m = materiau(o), r = couleurMursRetenue(o);
  const parts: string[] = [];
  if (p) parts.push('photo de rue' + (dateFr(p.date) ? ' du ' + dateFr(p.date) : '') + (p.auteur ? ' (' + p.auteur + ')' : '') + ' : ' + p.couleur);
  if (m) parts.push('matériau : ' + m.libelle + ', ' + m.couleur);
  parts.push('retenue : ' + (r?.source === 'photo' ? 'photo de rue' : r?.source === 'materiau' ? 'matériau' : 'couleur du plan'));
  const texte = parts.join(' · ');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export const champsCouleurMurs: Champ[] = [
  {
    type: 'choix', cle: 'sourceCouleurMurs', libelle: 'Murs en 3D', effets: ['scene3d', 'inspecteur'], visible: avecLecture,
    aide: 'Automatique : la couleur lue sur une photo de rue, sinon celle du matériau des murs (fichiers fonciers)',
    options: (c) => [
      { valeur: 'auto', libelle: 'Automatique' },
      ...(photo(c.obj) ? [{ valeur: 'photo', libelle: 'Photo de rue' }] : []),
      ...(materiau(c.obj) ? [{ valeur: 'materiau', libelle: 'Matériau' }] : []),
      { valeur: 'plan', libelle: 'Couleur du plan' },
    ],
    lire: (c) => c.obj.couleurMurs?.source ?? 'auto',
    ecrire: (c, v) => {
      const suite: CouleurMurs = { ...(c.obj.couleurMurs ?? {}) };
      if (v === 'auto') delete suite.source;
      else suite.source = v as Source;
      c.obj.couleurMurs = Object.keys(suite).length ? suite : null;
    }
  },
  { type: 'lecture', cle: 'couleurMursLue', libelle: 'Couleur lue', visible: avecLecture, valeur: (c) => decrireCouleurMurs(c.obj) },
];
