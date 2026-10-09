// Section « Voisinage (3D) » de l'inspecteur, sur la parcelle du projet (MD/spec-toit-ign.md §6.4).
//
// Tout ce qui decide de l'apparence des maisons voisines en 3D, en un seul endroit : la couleur de
// leurs murs, celle et les dimensions de leurs fenetres, la cloture sur leurs limites. Ce sont des
// preferences d'affichage (`sale: false`) : ni Ctrl+Z, ni « projet modifie », permises en lecture
// seule, rangees dans `voisinage3d` sur la parcelle pour etre retrouvees a la reouverture. Rien
// n'est ecrit sur les parcelles voisines elles-memes.

import { voisinage3dDe, reglerVoisinage3d, couleurClotureVoisinageDefaut } from '../../model/voisinage3d.js';
import { LIBELLES_TYPE_CLOTURE } from '../../model/cloture.js';
import type { ReglagesVoisinage3d, TypeCloture } from '../../model/types.js';
import type { Champ, ChampNombre, ContexteChamps, Effet, Section } from './types.js';

/** La parcelle du projet, celle qui porte la cloture et le relief — pas une parcelle voisine. */
const estParcellePrincipale = (c: ContexteChamps) => !!c.parcelle && c.parcelle.key === c.obj.key;

const effets: Effet[] = ['scene3d'];
const r = (c: ContexteChamps) => voisinage3dDe(c.obj);
const ecrire = (c: ContexteChamps, f: (x: ReglagesVoisinage3d) => void) => reglerVoisinage3d(c.obj, f);
const types = (['palissade', 'grillage', 'haie', 'mur'] as const).map((t) => ({ valeur: t, libelle: LIBELLES_TYPE_CLOTURE[t] }));

type CleDimension = 'largeurMin' | 'largeurMax' | 'hauteurMin' | 'hauteurMax' | 'entraxeMin' | 'entraxeMax';

/** Un nombre de la plage des fenetres ; un minimum ne depasse pas son maximum, et reciproquement. */
function dimension(cle: CleDimension, libelle: string, min: number, max: number, aide?: string): ChampNombre {
  const borne = cle.replace(/Min$|Max$/, '') as 'largeur' | 'hauteur' | 'entraxe';
  const estMin = cle.endsWith('Min');
  return {
    type: 'nombre', cle, libelle, unite: 'm', pas: 0.1, min, max, decimales: 2, sale: false, effets, ...(aide ? { aide } : {}),
    // Sur une ligne, le libelle d'un sous-champ ne s'affiche pas : la note dit lequel est le minimum.
    note: () => (estMin ? 'au moins' : 'au plus'),
    lire: (c) => r(c).fenetres[cle],
    ecrire: (c, v) => {
      if (!(v >= min && v <= max)) return false;
      ecrire(c, (x) => {
        x.fenetres[cle] = v;
        const autre = (borne + (estMin ? 'Max' : 'Min')) as CleDimension;
        if (estMin ? x.fenetres[autre] < v : x.fenetres[autre] > v) x.fenetres[autre] = v;
      });
    },
  };
}

/** La section « Voisinage (3D) » de la parcelle du projet ; `null` pour tout autre objet. */
export function sectionVoisinage3d(c: ContexteChamps): Section | null {
  if (!estParcellePrincipale(c)) return null;
  const nuanceMurs = (cc: ContexteChamps) => r(cc).maisons.mode === 'nuance';
  const troisCouleurs = (cc: ContexteChamps) => nuanceMurs(cc) && r(cc).maisons.nombre === 3;
  const uneCouleur = (cc: ContexteChamps) => r(cc).maisons.mode !== 'plan';
  const nuance = (cc: ContexteChamps) => r(cc).fenetres.mode === 'nuance';
  const cloture = (cc: ContexteChamps) => r(cc).cloture.afficher;

  const champs: Champ[] = [
    // ---- Les maisons ------------------------------------------------------------------------------
    {
      type: 'choix', cle: 'maisonsMode', libelle: 'Murs des maisons', sale: false, effets: ['inspecteur', ...effets],
      aide: 'La couleur du plan est celle de chaque bâtiment importé ; une nuance tirée au hasard entre deux ou trois couleurs casse l’uniformité du voisinage',
      options: () => [{ valeur: 'plan', libelle: 'Couleur du plan' }, { valeur: 'unique', libelle: 'Une couleur' }, { valeur: 'nuance', libelle: 'Nuance au hasard' }],
      lire: (cc) => r(cc).maisons.mode,
      ecrire: (cc, v) => ecrire(cc, (x) => { x.maisons.mode = v === 'unique' || v === 'nuance' ? v : 'plan'; }),
    },
    {
      type: 'choix', cle: 'maisonsNombre', libelle: 'Nuance entre', visible: nuanceMurs, sale: false, effets: ['inspecteur', ...effets],
      aide: 'Chaque maison prend une teinte le long de ces couleurs, toujours la même',
      options: () => [{ valeur: '2', libelle: 'Deux couleurs' }, { valeur: '3', libelle: 'Trois couleurs' }],
      lire: (cc) => String(r(cc).maisons.nombre),
      ecrire: (cc, v) => ecrire(cc, (x) => { x.maisons.nombre = v === '3' ? 3 : 2; }),
    },
    { type: 'couleur', cle: 'maisonsCouleur', libelle: (c.obj.voisinage3d?.maisons?.mode === 'nuance') ? 'Première couleur' : 'Couleur des murs', visible: uneCouleur, sale: false, effets, lire: (cc) => r(cc).maisons.couleur, ecrire: (cc, v) => ecrire(cc, (x) => { x.maisons.couleur = v; }) },
    { type: 'couleur', cle: 'maisonsCouleur2', libelle: 'Deuxième couleur', visible: nuanceMurs, sale: false, effets, lire: (cc) => r(cc).maisons.couleur2, ecrire: (cc, v) => ecrire(cc, (x) => { x.maisons.couleur2 = v; }) },
    { type: 'couleur', cle: 'maisonsCouleur3', libelle: 'Troisième couleur', visible: troisCouleurs, sale: false, effets, lire: (cc) => r(cc).maisons.couleur3, ecrire: (cc, v) => ecrire(cc, (x) => { x.maisons.couleur3 = v; }) },

    // ---- Les fenetres -----------------------------------------------------------------------------
    {
      type: 'choix', cle: 'fenetresMode', libelle: 'Vitres', sale: false, effets: ['inspecteur', ...effets],
      options: () => [{ valeur: 'unique', libelle: 'Une couleur' }, { valeur: 'nuance', libelle: 'Nuance entre deux' }],
      lire: (cc) => r(cc).fenetres.mode,
      ecrire: (cc, v) => ecrire(cc, (x) => { x.fenetres.mode = v === 'nuance' ? 'nuance' : 'unique'; }),
    },
    { type: 'couleur', cle: 'fenetresCouleur', libelle: 'Couleur des vitres', sale: false, effets, lire: (cc) => r(cc).fenetres.couleur, ecrire: (cc, v) => ecrire(cc, (x) => { x.fenetres.couleur = v; }) },
    { type: 'couleur', cle: 'fenetresCouleur2', libelle: 'Nuance jusqu’à', visible: nuance, sale: false, effets, aide: 'Chaque maison tire une teinte entre les deux', lire: (cc) => r(cc).fenetres.couleur2, ecrire: (cc, v) => ecrire(cc, (x) => { x.fenetres.couleur2 = v; }) },
    { type: 'ligne', cle: 'largeurFenetres', libelle: 'Largeur des fenêtres', champs: [dimension('largeurMin', 'min.', 0.4, 3), dimension('largeurMax', 'max.', 0.4, 3)] },
    { type: 'ligne', cle: 'hauteurFenetres', libelle: 'Hauteur des fenêtres', champs: [dimension('hauteurMin', 'min.', 0.4, 2.5), dimension('hauteurMax', 'max.', 0.4, 2.5)] },
    { type: 'ligne', cle: 'entraxeFenetres', libelle: 'Entraxe (densité)', champs: [dimension('entraxeMin', 'min.', 1, 8, 'Plus l’entraxe est petit, plus les fenêtres sont nombreuses'), dimension('entraxeMax', 'max.', 1, 8)] },

    // ---- Les clotures -----------------------------------------------------------------------------
    { type: 'case', cle: 'clotureAfficher', libelle: 'Clôtures du voisinage', sale: false, effets: ['inspecteur', ...effets], aide: 'Sur les limites des parcelles voisines, pour situer le projet dans sa rue ; rien n’est écrit sur ces parcelles', lire: (cc) => r(cc).cloture.afficher, ecrire: (cc, v) => ecrire(cc, (x) => { x.cloture.afficher = v; }) },
    {
      type: 'choix', cle: 'clotureType', libelle: 'Type de clôture', visible: cloture, sale: false, effets: ['inspecteur', ...effets],
      options: () => types,
      lire: (cc) => r(cc).cloture.type,
      ecrire: (cc, v) => ecrire(cc, (x) => {
        const t = types.some((o) => o.valeur === v) ? (v as Exclude<TypeCloture, 'aucune'>) : 'grillage';
        // La couleur suit le type tant qu'elle n'a pas ete choisie : une haie n'est pas gris zinc.
        if (x.cloture.couleur === couleurClotureVoisinageDefaut(x.cloture.type)) x.cloture.couleur = couleurClotureVoisinageDefaut(t);
        x.cloture.type = t;
      }),
    },
    { type: 'couleur', cle: 'clotureCouleur', libelle: 'Couleur de la clôture', visible: cloture, sale: false, effets, lire: (cc) => r(cc).cloture.couleur, ecrire: (cc, v) => ecrire(cc, (x) => { x.cloture.couleur = v; }) },
  ];
  return {
    id: 'voisinage3d', titre: 'Voisinage (3D)', repliee: true, champs,
    explication: 'L’apparence des maisons voisines dans la Vue 3D. Ce qui est tiré au hasard l’est une fois pour toutes par maison : la scène ne change pas d’une ouverture à l’autre.',
  };
}
