// Les champs du jardin (lot L3) : la plantation d'un massif (plate-bande ou massif plante, ses plantes, sa vegetation basse en 3D, son
// mini-arbre), et la nature d'un equipement (regard, eclairage, robinet). Un massif « simple » reste le bloc d'avant : c'est le choix
// qui pose ou retire la plantation (model/jardin.ts, MD/spec-lecture-ia-elargie.md §4.4).

import { FORMES_PLANTATION, HAUTEUR_MINI_ARBRE_MAX_M, HAUTEUR_PLATE_BANDE_M, NATURES_EQUIPEMENT, TYPES_PLANTATION } from '../../model/jardin.js';
import { especeParId, especesChargees, tailleDe } from '../../model/especesArbre.js';
import type { FormePlantation, NatureEquipement, Plantation, TypePlantation } from '../../model/types.js';
import type { ContexteChamps, Section } from './types.js';

const SIMPLE = 'simple';
const AUCUN = '';

/** Les essences d'un mini-arbre : les petits arbres de la bibliotheque (classe « Petits »). */
const petitesEssences = () => especesChargees().filter((e) => tailleDe(e).id === 'petit');

/** La plantation de l'objet, reecrite par la personne : sa source devient la main. */
const ecrirePlantation = (c: ContexteChamps, p: Omit<Plantation, 'source'>) => { c.obj.plantation = { ...p, source: 'main' }; };

export const sectionMassif: Section = {
  id: 'massif', titre: 'Plantation',
  champs: [
    {
      type: 'choix', cle: 'formePlantation', libelle: 'Type', effets: ['scene3d', 'inspecteur', 'rendu'],
      aide: 'Une plate-bande est au ras du sol, un massif planté garde sa hauteur ; un massif simple reste un volume sans plantes',
      options: () => [{ valeur: SIMPLE, libelle: 'Massif simple' }, ...FORMES_PLANTATION.map((n) => ({ valeur: n.id, libelle: n.libelle }))],
      lire: (c) => (c.obj.plantation ? c.obj.plantation.forme ?? 'massif' : SIMPLE),
      ecrire: (c, v) => {
        if (v === SIMPLE) { delete c.obj.plantation; delete c.obj.vegetation3d; return; }
        const forme = v as FormePlantation;
        const avant = c.obj.plantation;
        ecrirePlantation(c, { ...(avant ?? { type: 'fleurs' as TypePlantation }), forme });
        // Une plate-bande est la terre au ras de sa bordure : sa hauteur se pose quand elle le devient, puis se regle a la main.
        if (forme === 'plate-bande' && avant?.forme !== 'plate-bande') c.obj.elevation = HAUTEUR_PLATE_BANDE_M;
      }
    },
    {
      type: 'choix', cle: 'typePlantation', libelle: 'Plantes', effets: ['scene3d'],
      visible: (c) => !!c.obj.plantation,
      aide: 'Ce que la Vue 3D y fait pousser : fleurs, arbustes, vivaces, un mélange, des rangs de potager ; une haie reste un volume vert',
      options: () => TYPES_PLANTATION.map((x) => ({ valeur: x.id, libelle: x.libelle })),
      lire: (c) => c.obj.plantation?.type ?? 'fleurs',
      ecrire: (c, v) => { if (c.obj.plantation) ecrirePlantation(c, { ...c.obj.plantation, type: v as TypePlantation }); }
    },
    {
      type: 'case', cle: 'vegetation3d', libelle: 'Plantes en 3D', effets: ['scene3d'],
      visible: (c) => !!c.obj.plantation && c.obj.plantation.type !== 'haie',
      aide: 'Les plantes basses dessinées dans la Vue 3D ; décochée, le massif reste un volume nu',
      lire: (c) => c.obj.vegetation3d !== false,
      ecrire: (c, v) => { if (v) delete c.obj.vegetation3d; else c.obj.vegetation3d = false; }
    },
    {
      type: 'choix', cle: 'miniArbre', libelle: 'Mini-arbre', effets: ['scene3d', 'inspecteur'],
      visible: (c) => !!c.obj.plantation,
      aide: 'Un arbre nain planté au centre, choisi parmi les petits arbres de la bibliothèque',
      options: () => [{ valeur: AUCUN, libelle: 'Aucun' }, ...petitesEssences().map((e) => ({ valeur: e.id, libelle: e.nom }))],
      lire: (c) => c.obj.plantation?.miniArbre?.espece ?? AUCUN,
      ecrire: (c, v) => {
        const p = c.obj.plantation;
        if (!p) return;
        const e = especeParId(v);
        const { miniArbre: _ancien, ...reste } = p;
        void _ancien;
        ecrirePlantation(c, e ? { ...reste, miniArbre: { espece: e.id, hauteurM: Math.min(HAUTEUR_MINI_ARBRE_MAX_M, e.hauteurM) } } : reste);
      }
    },
    {
      type: 'nombre', cle: 'hauteurMiniArbre', libelle: 'Hauteur du mini-arbre', unite: 'm', pas: 0.1, min: 0.3, max: HAUTEUR_MINI_ARBRE_MAX_M, decimales: 1, effets: ['scene3d'],
      visible: (c) => !!c.obj.plantation?.miniArbre,
      lire: (c) => c.obj.plantation?.miniArbre?.hauteurM ?? 1.5,
      ecrire: (c, v) => {
        const p = c.obj.plantation, a = p?.miniArbre;
        if (!p || !a) return false;
        ecrirePlantation(c, { ...p, miniArbre: { ...a, hauteurM: Math.max(0.3, Math.min(HAUTEUR_MINI_ARBRE_MAX_M, v || 1.5)) } });
      }
    },
  ]
};

export const sectionEquipement: Section = {
  id: 'equipement', titre: 'Équipement',
  champs: [
    {
      type: 'choix', cle: 'natureEquipement', libelle: 'Nature', effets: ['scene3d', 'terrasse', 'rendu'],
      aide: 'Un spa ou un jacuzzi charge la terrasse sous lui ; un regard, un éclairage ou un robinet ne la charge pas',
      options: () => NATURES_EQUIPEMENT.map((n) => ({ valeur: n.id, libelle: n.libelle + (n.charge ? ' (charge la terrasse)' : '') })),
      lire: (c: ContexteChamps) => c.obj.nature ?? 'spa',
      // Un spa est le sens d'avant : il ne s'ecrit pas, et un fichier sans nature reste celui d'avant.
      ecrire: (c, v) => { if (v === 'spa') delete c.obj.nature; else c.obj.nature = v as NatureEquipement; }
    },
  ]
};
