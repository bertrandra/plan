// Cadences et estimation du temps de chantier
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { dist, shoelace } from '../geometry/basic.js';
import { computeAssise } from './prix.js';
import { aireCommune, surfaceDalle, volumeDecaissementPose } from './structure.js';
import { estPlots } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { enPoints } from '../model/formes.js';
import { computeDebitLames, computeDebitsBois } from './debit.js';
import type { CouchesTerrasse } from './layers.js';
import { valeurEnregistree } from '../model/dictionnaire.js';
import type { ObjetPlan, Construction, PtBrut } from '../model/types.js';

export const CADENCES = {
  piquetage:   { h:0.06, unite:'m²', label:'Piquetage, tracage et implantation',        phase:'Preparation' },
  decaissement:{ h:1.60, unite:'m³', label:'Decaissement manuel',                        phase:'Preparation' },
  evacuation:  { h:0.50, unite:'m³', label:'Evacuation des terres',                      phase:'Preparation' },
  geotextile:  { h:0.03, unite:'m²', label:'Pose du geotextile',                         phase:'Preparation' },
  concasse:    { h:0.80, unite:'m³', label:'Apport et compactage du concasse',           phase:'Preparation' },
  dallesStab:  { h:0.08, unite:'u',  label:'Pose des dalles stabilisatrices',            phase:'Preparation' },
  coffrage:    { h:0.30, unite:'ml', label:'Coffrage de rive de la dalle',               phase:'Preparation' },
  coulage:     { h:1.50, unite:'m³', label:'Ferraillage et coulage du beton',            phase:'Preparation' },
  massifs:     { h:0.50, unite:'u',  label:'Fouille et coulage des massifs',             phase:'Preparation' },
  vissage:     { h:0.25, unite:'u',  label:'Vissage des vis de fondation',               phase:'Appuis' },
  posePlots:   { h:0.08, unite:'u',  label:'Pose des plots',                             phase:'Appuis' },
  reglage:     { h:0.06, unite:'u',  label:'Reglage de niveau des appuis',               phase:'Appuis' },
  debitBois:   { h:0.10, unite:'u',  label:'Debit des bois de structure',                phase:'Structure' },
  poseCadre:   { h:0.25, unite:'ml', label:'Pose du cadre peripherique',                 phase:'Structure' },
  poseSolives: { h:0.15, unite:'ml', label:'Pose des solives',                           phase:'Structure' },
  poseLamb:    { h:0.12, unite:'ml', label:'Pose des lambourdes',                        phase:'Structure' },
  controle:    { h:0.05, unite:'m²', label:'Controle de niveau et de planeite',          phase:'Structure' },
  debitLames:  { h:0.05, unite:'u',  label:'Debit des lames',                            phase:'Platelage' },
  poseLames:   { h:0.35, unite:'m²', label:'Pose et fixation des lames',                 phase:'Platelage' },
  coupeRive:   { h:0.15, unite:'ml', label:'Coupe de finition en rive',                  phase:'Platelage' },
  poseRive:    { h:0.25, unite:'ml', label:'Pose de la lame de rive',                    phase:'Finitions' },
  posePlat:    { h:0.20, unite:'ml', label:'Pose de la bordure a plat',                  phase:'Finitions' },
  nettoyage:   { h:0.03, unite:'m²', label:'Nettoyage et evacuation des chutes',         phase:'Finitions' }
};
export const CHANTIER_PHASES = ['Preparation','Appuis','Structure','Platelage','Finitions'];

/**
 * Les vingt-trois postes du chantier. Derive de `CADENCES` : ajouter une cadence ajoute un poste, et le
 * compilateur reclamera alors la quantite correspondante dans `computeChantier`.
 */
export type PosteChantier = keyof typeof CADENCES;

/**
 * La cadence retenue pour un poste : celle saisie par l'utilisateur si elle est utilisable, sinon
 * celle du bareme.
 *
 * `c.cadences` passe par `valeurEnregistree` parce que ce dictionnaire peut avoir ete enregistre en
 * tableau — c'est le cas du jeu de demonstration — et qu'une cadence saisie s'y range malgre tout.
 * Voir `model/dictionnaire.ts` : l'indexation est la meme, seul le compilateur y gagne.
 */
export function cadenceDe(c: Construction, cle: PosteChantier): number {
  const v = valeurEnregistree(c.cadences, cle);
  return (v !== undefined && v !== null && isFinite(v) && v >= 0) ? v : CADENCES[cle].h;
}
// Les quantites viennent du projet, pas d'un forfait : c'est ce qui rend la duree discutable
// ligne par ligne plutot qu'a prendre ou a laisser.
export function computeChantier(obj: ObjetPlan, layers: CouchesTerrasse){
  const c = ensureConstruction(obj);
  // Un bassin ou un trou qui perce la terrasse n'est ni platele ni nettoye : sa part est retiree.
  const contourT = enPoints(obj).pts;
  const surf = (shoelace(contourT) - (layers.trous ?? []).reduce((s, t) => s + aireCommune(t, contourT), 0)) || 0;
  const ml = (a: { a: PtBrut; b: PtBrut }[]) => a.reduce((s,l)=>s+dist(l.a,l.b),0);
  const nbAppuis = layers.vis.length;
  const debitL = computeDebitLames(obj, layers);
  const groupes = computeDebitsBois(obj, layers);
  const nbBarresBois = groupes.reduce((s,g)=>s + Object.values(g.debit.achats).reduce((t,n)=>t+n,0), 0);
  const nbBarresLames = Object.values(debitL.achats).reduce((t,n)=>t+n, 0);
  const perim = ml(layers.cadre);
  const assise = computeAssise(c, surf, nbAppuis, perim, surfaceDalle(enPoints(obj).pts, layers.trous ?? []));
  const plots = estPlots(c);
  // Un niveau fini impose : le decaissement de pose s'ajoute au terrassement.
  const decaissePose = volumeDecaissementPose({ pts: enPoints(obj).pts, construction: c }, layers.trous ?? []);

  // `Record<PosteChantier, number>` : le compilateur verifie que chaque cadence a sa quantite.
  // Un poste ajoute a `CADENCES` sans quantite ici serait sinon compte a zero, en silence.
  const q: Record<PosteChantier, number> = {
    piquetage: surf,
    // La dalle a couler se loge sous le sol fini comme le herisson : sa terre s'enleve aussi.
    decaissement: assise.concasseM3 + (assise.treillisM2 > 0 ? assise.betonM3 : 0) + decaissePose,
    evacuation: assise.concasseM3 + (assise.treillisM2 > 0 ? assise.betonM3 : 0) + decaissePose,
    geotextile: assise.geotextileM2,
    concasse: assise.concasseM3,
    dallesStab: assise.dallesU,
    coffrage: assise.coffrageMl,
    coulage: assise.treillisM2 > 0 ? assise.betonM3 : 0,
    massifs: assise.massifsU,
    vissage: plots ? 0 : nbAppuis,
    posePlots: plots ? nbAppuis : 0,
    reglage: nbAppuis,
    debitBois: nbBarresBois,
    poseCadre: perim,
    poseSolives: ml(layers.solives),
    poseLamb: ml(layers.lambourdes),
    controle: surf,
    debitLames: nbBarresLames,
    poseLames: surf,
    coupeRive: perim,
    poseRive: ml(layers.lameRive),
    posePlat: ml(layers.lamePlat),
    nettoyage: surf
  };
  const lignes = (Object.keys(CADENCES) as PosteChantier[])
    .map(cle=>({ cle, ...CADENCES[cle], qte:q[cle]||0, cadence:cadenceDe(c,cle) }))
    .filter(l=>l.qte > 1e-6)
    .map(l=>({ ...l, heures: l.qte*l.cadence }));
  const total = lignes.reduce((s,l)=>s+l.heures, 0);
  // Le poste qui pese le plus : c'est lui qu'il faut attaquer pour raccourcir le chantier.
  const dominant = lignes.slice().sort((a,b)=>b.heures-a.heures)[0] || null;
  return { lignes, total, dominant, surf, nbAppuis };
}
