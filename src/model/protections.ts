// Qui peut ecrire quoi sur un batiment (MD/spec-ouvrages.md, « Le flux de construction d'un batiment », « Qui l'emporte »).
//
// Un batiment n'a pas d'auteur unique : la lecture LiDAR, son recalage, le moteur de regles (faits, profils), l'actualisation IGN et
// l'audit de la parcelle ecrivent chacun quelques champs, a des moments differents. Ce qui les arbitre, ce sont des marques posees
// sur l'objet par la personne ou par une decision (`toitFige`, `verifieSurPlace`, `retoucheMain`, `toit.source`…). Chacun de ces
// ecrivains lisait jusqu'ici une partie des marques, a la main, et pas toujours les memes : ce module est la seule reponse a la
// question « cet ecrivain automatique peut-il ecrire ce groupe de champs sur ce batiment ? ». Le tableau `REGLES` la donne en
// entier ; tests/unit/model/protections.test.ts l'epingle case par case, et la spec le recopie.
//
// Pur : pas de DOM, rien d'ecrit.

import type { Toit } from './typesToit.js';

/** Les ecrivains automatiques d'un batiment. */
export type Ecrivain =
  /** La lecture du toit sur le LiDAR HD, a l'import, en tache de fond, a l'actualisation (app/toits/toitsLidar.ts, toitsFond.ts). */
  | 'lidar'
  /** Le recalage d'un bloc du contour sur le LiDAR (projet et mitoyens, toitsLidar.ts::recalerSurLidar). */
  | 'recalage'
  /** Le moteur de regles : les faits par batiment (regles/toits/faits.json), les profils de facades (app/toits/profilsFacadesFond.ts). */
  | 'faits'
  /** L'actualisation IGN, et « Actualiser le projet » (app/cadastre/actualisationIgn.ts). */
  | 'ign'
  /** L'audit de la parcelle, pour la proposition cochee d'office (app/audit/parcelle/constats.ts) : sinon elle arrive decochee. */
  | 'audit';

/** Les groupes de champs d'un batiment. */
export type Groupe =
  /** `pts`. */
  | 'contour'
  /** `elevation`, la hauteur a l'egout. */
  | 'hauteur'
  /** La forme du toit et ses corps : `toit` (sauf couleur et couverture), `corpsToit`, `volumesToit`, `toitMesure`. */
  | 'toit'
  /** Ce qui est pose sur les corps : cheminees, lucarnes, terrasse, fenetres de toit et panneaux, appentis ouvert, saillies. */
  | 'elements'
  /** La couleur du toit et son materiau de couverture. */
  | 'couverture'
  /** La couleur et le materiau des murs (`couleurMurs`). */
  | 'murs'
  /** Les releves de facade, les fenetres reglees, le profil de facades. */
  | 'facades';

/** Les marques qui arretent un ecrivain. */
export type Marque =
  /** « Règles » coupees (Mode Toit, elements de facade de l'inspecteur, validation d'un toit par l'audit). */
  | 'fige'
  /** Verifie sur place (audit valide, batiment tout vu) ; « Recalculer aussi » de l'actualisation le leve. */
  | 'verifie'
  /** Le contour retouche a la main (model/retouche.ts) ; « Reprendre la version de l'IGN » le leve. */
  | 'retouche'
  /** La hauteur a l'egout choisie : saisie dans l'inspecteur, validee par l'audit (`egoutChoisi`). */
  | 'egoutChoisi'
  /** Un toit saisi (inspecteur, forme du catalogue). */
  | 'toitSaisi'
  /** Un toit lu sur une photo de facade (releve avec toit). */
  | 'toitPhoto'
  /** Un batiment dessine dont la hauteur est posee (pas de `bdtopo`). */
  | 'hauteurDessinee'
  /** Une couverture choisie (inspecteur, audit). */
  | 'couvertureChoisie'
  /** Un materiau des murs choisi (audit). */
  | 'materiauChoisi'
  /** Un releve fait a la main sur le mur vise (`cote`), pas venu de l'audit. */
  | 'releveMain';

/** Ce que ce module lit d'un batiment. */
export interface BatimentProtege {
  bdtopo?: unknown;
  elevation?: number;
  retoucheMain?: { date: string } | null;
  batiment?: {
    toit?: Pick<Toit, 'source' | 'couverture'> | null;
    toitFige?: boolean;
    egoutChoisi?: 'saisie' | 'audit';
    verifieSurPlace?: { date: string } | null;
    couleurMurs?: { materiau?: unknown } | null;
    facades?: readonly { cote: number; depuisAudit?: true }[] | null;
  } | null;
}

/** Ce que la personne a demande pour cette ecriture, et le mur vise. */
export interface ContexteEcriture {
  /** « Recalculer aussi » les batiments verifies sur place (actualisation), ou la copie que la tache de fond lit pour comparer. */
  relireVerifies?: boolean;
  /** « Reprendre la version de l'IGN » pour cet objet retouche a la main. */
  reprendreIgn?: boolean;
  /** Le mur (rang du cote) qu'une ecriture de facade vise. */
  cote?: number;
}

/** Chaque marque, lue sur le batiment. */
const MARQUES: Readonly<Record<Marque, (o: BatimentProtege, ctx: ContexteEcriture) => boolean>> = {
  fige: (o) => o.batiment?.toitFige === true,
  verifie: (o, ctx) => !!o.batiment?.verifieSurPlace && !ctx.relireVerifies,
  retouche: (o, ctx) => !!o.retoucheMain && !ctx.reprendreIgn,
  egoutChoisi: (o) => !!o.batiment?.egoutChoisi,
  toitSaisi: (o) => o.batiment?.toit?.source === 'saisie',
  toitPhoto: (o) => o.batiment?.toit?.source === 'photo',
  hauteurDessinee: (o) => !o.bdtopo && typeof o.elevation === 'number',
  couvertureChoisie: (o) => !!o.batiment?.toit?.couverture,
  materiauChoisi: (o) => !!o.batiment?.couleurMurs?.materiau,
  releveMain: (o, ctx) => ctx.cote !== undefined && (o.batiment?.facades ?? []).some((r) => r.cote === ctx.cote && !r.depuisAudit),
};

/** `jamais` : l'ecrivain n'ecrit pas ce groupe (une relecture le reporte sur ses corps neufs) ; sinon les marques qui l'arretent (vide : rien ne l'arrete). */
export type Regle = 'jamais' | readonly Marque[];

/** Un toit que Plan ne choisit plus : « Règles » coupees, verifie sur place, saisi ou lu sur une photo. */
const TOIT_DE_LA_PERSONNE: readonly Marque[] = ['fige', 'verifie', 'toitSaisi', 'toitPhoto'];
/** La hauteur a l'egout que Plan ne choisit plus : celle d'un toit de la personne, ou choisie elle-meme. */
const HAUTEUR_DE_LA_PERSONNE: readonly Marque[] = [...TOIT_DE_LA_PERSONNE, 'egoutChoisi'];
/** Un batiment que l'actualisation garde entier. */
const GARDE_ENTIER: readonly Marque[] = ['fige', 'verifie', 'retouche'];

/**
 * La regle, ecrivain par ecrivain et groupe par groupe. C'est le tableau « Qui l'emporte » de MD/spec-ouvrages.md ; le changer,
 * c'est changer ce que voit la personne : le test l'epingle en entier.
 */
export const REGLES: Readonly<Record<Ecrivain, Readonly<Record<Groupe, Regle>>>> = {
  lidar: { contour: 'jamais', hauteur: HAUTEUR_DE_LA_PERSONNE, toit: TOIT_DE_LA_PERSONNE, elements: 'jamais', couverture: 'jamais', murs: 'jamais', facades: 'jamais' },
  recalage: { contour: [...TOIT_DE_LA_PERSONNE, 'retouche'], hauteur: 'jamais', toit: 'jamais', elements: 'jamais', couverture: 'jamais', murs: 'jamais', facades: 'jamais' },
  faits: { contour: 'jamais', hauteur: HAUTEUR_DE_LA_PERSONNE, toit: TOIT_DE_LA_PERSONNE, elements: 'jamais', couverture: 'jamais', murs: 'jamais', facades: ['verifie'] },
  ign: { contour: GARDE_ENTIER, hauteur: [...GARDE_ENTIER, 'egoutChoisi'], toit: [...GARDE_ENTIER, 'toitSaisi', 'toitPhoto'], elements: [...GARDE_ENTIER, 'toitSaisi', 'toitPhoto'], couverture: [...GARDE_ENTIER, 'toitSaisi', 'toitPhoto'], murs: GARDE_ENTIER, facades: GARDE_ENTIER },
  audit: { contour: 'jamais', hauteur: ['egoutChoisi', 'hauteurDessinee'], toit: ['fige', 'toitSaisi'], elements: [], couverture: ['couvertureChoisie'], murs: ['materiauChoisi'], facades: ['releveMain'] },
};

/** La marque qui arrete cet ecrivain sur ce groupe, `jamais` s'il n'y ecrit pas, ou null : il peut ecrire. */
export function protection(o: BatimentProtege, ecrivain: Ecrivain, groupe: Groupe, ctx: ContexteEcriture = {}): Marque | 'jamais' | null {
  const regle = REGLES[ecrivain][groupe];
  if (regle === 'jamais') return 'jamais';
  return regle.find((m) => MARQUES[m](o, ctx)) ?? null;
}

/** Cet ecrivain automatique peut-il ecrire ce groupe de champs sur ce batiment ? */
export const peutEcrire = (o: BatimentProtege, ecrivain: Ecrivain, groupe: Groupe, ctx: ContexteEcriture = {}): boolean => protection(o, ecrivain, groupe, ctx) === null;
