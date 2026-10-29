// Les champs du jardin (lot L3) : la plate-bande et le massif plante (ce qu'il porte, sa vegetation basse en 3D, son mini-arbre),
// et la nature d'un equipement (regard, eclairage, robinet). Un massif « simple » reste le bloc d'avant : c'est le choix qui pose
// ou retire le sous-objet (model/jardin.ts).

import { CONTENUS_MASSIF, HAUTEUR_MINI_ARBRE_MAX_M, HAUTEUR_PLATE_BANDE_M, NATURES_EQUIPEMENT, NATURES_MASSIF } from '../../model/jardin.js';
import { especeParId, especesChargees, tailleDe } from '../../model/especesArbre.js';
import type { ContenuMassif, NatureEquipement, NatureMassif } from '../../model/types.js';
import type { ContexteChamps, Section } from './types.js';

const SIMPLE = 'simple';
const AUCUN = '';

/** Les essences d'un mini-arbre : les petits arbres de la bibliotheque (classe « Petits »). */
const petitesEssences = () => especesChargees().filter((e) => tailleDe(e).id === 'petit');

export const sectionMassif: Section = {
  id: 'massif', titre: 'Plantation',
  champs: [
    {
      type: 'choix', cle: 'natureMassif', libelle: 'Type', effets: ['scene3d', 'inspecteur', 'rendu'],
      aide: 'Une plate-bande est au ras du sol, un massif planté garde sa hauteur ; un massif simple reste un volume sans plantes',
      options: () => [{ valeur: SIMPLE, libelle: 'Massif simple' }, ...NATURES_MASSIF.map((n) => ({ valeur: n.id, libelle: n.libelle }))],
      lire: (c) => c.obj.massif?.nature ?? SIMPLE,
      ecrire: (c, v) => {
        if (v === SIMPLE) { delete c.obj.massif; return; }
        const nature = v as NatureMassif;
        const avant = c.obj.massif;
        c.obj.massif = { ...(avant ?? { contenu: 'fleurs' as ContenuMassif }), nature };
        // Une plate-bande est la terre au ras de sa bordure : sa hauteur se pose a sa creation, puis se regle a la main.
        if (nature === 'plate-bande' && avant?.nature !== 'plate-bande') c.obj.elevation = HAUTEUR_PLATE_BANDE_M;
      }
    },
    {
      type: 'choix', cle: 'contenuMassif', libelle: 'Plantes', effets: ['scene3d'],
      visible: (c) => !!c.obj.massif,
      aide: 'Ce que la Vue 3D y fait pousser : fleurs, arbustes, vivaces, un mélange, ou des rangs de potager',
      options: () => CONTENUS_MASSIF.map((x) => ({ valeur: x.id, libelle: x.libelle })),
      lire: (c) => c.obj.massif?.contenu ?? 'fleurs',
      ecrire: (c, v) => { if (c.obj.massif) c.obj.massif = { ...c.obj.massif, contenu: v as ContenuMassif }; }
    },
    {
      type: 'case', cle: 'vegetationMassif', libelle: 'Plantes en 3D', effets: ['scene3d'],
      visible: (c) => !!c.obj.massif,
      aide: 'Les plantes basses dessinées dans la Vue 3D ; décochée, le massif reste un volume nu',
      lire: (c) => c.obj.massif?.vegetation !== false,
      ecrire: (c, v) => {
        if (!c.obj.massif) return;
        const m = { ...c.obj.massif };
        if (v) delete m.vegetation; else m.vegetation = false;
        c.obj.massif = m;
      }
    },
    {
      type: 'choix', cle: 'miniArbre', libelle: 'Mini-arbre', effets: ['scene3d', 'inspecteur'],
      visible: (c) => !!c.obj.massif,
      aide: 'Un arbre nain planté au centre, choisi parmi les petits arbres de la bibliothèque',
      options: () => [{ valeur: AUCUN, libelle: 'Aucun' }, ...petitesEssences().map((e) => ({ valeur: e.id, libelle: e.nom }))],
      lire: (c) => c.obj.massif?.miniArbre?.espece ?? AUCUN,
      ecrire: (c, v) => {
        if (!c.obj.massif) return;
        const m = { ...c.obj.massif };
        const e = especeParId(v);
        if (!e) delete m.miniArbre;
        else m.miniArbre = { espece: e.id, hauteurM: Math.min(HAUTEUR_MINI_ARBRE_MAX_M, e.hauteurM) };
        c.obj.massif = m;
      }
    },
    {
      type: 'nombre', cle: 'hauteurMiniArbre', libelle: 'Hauteur du mini-arbre', unite: 'm', pas: 0.1, min: 0.3, max: HAUTEUR_MINI_ARBRE_MAX_M, decimales: 1, effets: ['scene3d'],
      visible: (c) => !!c.obj.massif?.miniArbre,
      lire: (c) => c.obj.massif?.miniArbre?.hauteurM ?? 1.5,
      ecrire: (c, v) => {
        const m = c.obj.massif, a = m?.miniArbre;
        if (!m || !a) return false;
        c.obj.massif = { ...m, miniArbre: { ...a, hauteurM: Math.max(0.3, Math.min(HAUTEUR_MINI_ARBRE_MAX_M, v || 1.5)) } };
      }
    },
  ]
};

const PORTE = '';

export const sectionEquipement: Section = {
  id: 'equipement', titre: 'Équipement',
  champs: [
    {
      type: 'choix', cle: 'natureEquipement', libelle: 'Nature', effets: ['scene3d', 'terrasse', 'rendu'],
      aide: 'Un spa ou un jacuzzi charge la terrasse sous lui ; un regard, un éclairage ou un robinet ne la charge pas',
      options: () => [{ valeur: PORTE, libelle: 'Spa, jacuzzi (charge la terrasse)' }, ...NATURES_EQUIPEMENT.map((n) => ({ valeur: n.id, libelle: n.libelle }))],
      lire: (c: ContexteChamps) => c.obj.equipement?.nature ?? PORTE,
      ecrire: (c, v) => {
        if (v === PORTE) delete c.obj.equipement;
        else c.obj.equipement = { nature: v as NatureEquipement };
      }
    },
  ]
};
