// L'actualisation IGN d'un plan cree depuis une adresse (spec §3.2, app/).
//
// C'est le geste delicat du lot : elle rejoue l'import IGN sur un plan qui a deja ete modifie. Ce qui
// vient du cadastre est remplace, ce que l'utilisateur a dessine est conserve — et c'est pour cela
// qu'elle passe par l'historique avant de toucher quoi que ce soit. Le dialogue qui la regle est un
// parcours (app/parcours.ts, zones/parcours/Actualisation.tsx) ; ce module fait le travail.
//
// Une seule actualisation a la fois : la commande se grise pendant qu'elle tourne (`enCours`).

import { nombreFr } from '../util/format.js';
import { hauteurBatiment, hauteurVegetation, arbresEstimes, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES, libelleParcelle } from '../geo/bdtopo.js';
import { distancePointContour } from '../geometry/proximite.js';
import { showToast } from '../shell/dialogs.js';
import { centroid } from '../geometry/basic.js';
import { projecteurLocal } from '../geo/projection.js';
import { SIMPLIF_M } from '../geo/constantesCadastre.js';
import {
  interrogerCadastre, construireCandidats, trierVoisines,
  anneauVersPts, anneauExterieur, bboxDegDesAnneaux, interrogerWfs, construireElementsIgn,
  fetchJSONReseau, polygonesSeTouchent, CADASTRE_URL,
  interrogerPlu,
  COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE
} from '../geo/apiIgn.js';
import { sommetsDe } from '../model/formes.js';
import { parcours } from './parcours.js';
import type { ObjetSerialise } from '../model/creation.js';
import type { CollectionGeoJSON, EmpriseGeoJSON, FeatureGeoJSON, Anneau, Candidate } from '../geo/apiIgn.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, ObjetBrut, ObjetPolygone, PtBrut } from '../model/types.js';

/** Ce que l'actualisation demande au reste du programme. */
export interface ContexteActualisation {
  etat: EtatApp;
  markDirty: () => void;
  pushHistory: () => void;
  rebuildSelector: () => void;
  render: () => void;
  restoreState: (instantane: { objects: ObjetBrut[]; measures: unknown[] }) => void;
  serializeMeasures: (ms: EtatApp['measures']) => unknown[];
  serializeObjects: (objs: ObjetPlan[]) => ObjetSerialise[];
  syncBasculeVoisinage: () => void;
  syncLieuTitre: () => void;
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
}

/** Une option de portee et de voisinage, choisie dans la boite de dialogue d'actualisation. */
export interface OptionsActualisation {
  portee: 'tout' | 'parcelle';
  voisinage: { actif: false } | { actif: true; batiments: boolean; vegetation: boolean; arbres: boolean };
}

/** Ce que le dialogue affiche du plan avant d'actualiser. */
export interface InfosActualisation {
  /** « Parcelle AB 123 — Le Vesinet ». */
  parcelle: string;
  /** Objets importes de la BD TOPO deja presents. */
  nbIgn: number;
  /** Parcelles voisines deja presentes : elles ne seront pas dupliquees. */
  nbVoisines: number;
}

type Cadastre = NonNullable<ObjetPlan['cadastre']>;

let enCours = false;
const abonnes = new Set<() => void>();
function signaler(): void { abonnes.forEach(f => f()); }
export const actualisation = {
  enCours: (): boolean => enCours,
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
};

/** Le point de calage, c'est les DEUX coordonnees : une longitude absente projetterait tout en NaN. */
function origineValide(cad: Cadastre): cad is Cadastre & { origineLat: number; origineLon: number } {
  return cad.origineLat !== undefined && cad.origineLat !== null && cad.origineLon !== undefined && cad.origineLon !== null;
}

/**
 * Ouvre le dialogue d'actualisation — ou dit pourquoi on ne peut pas : un plan qui ne vient pas du
 * cadastre n'a rien a actualiser, et un plan sans point de calage verrait tout son contenu deplace.
 */
export function ouvrirDialogueActualisation(ctx: ContexteActualisation): void {
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!cad || !cad.section || !cad.numero || !cad.codeInsee){
    showToast('Ce plan n\'a pas d\'origine cadastrale : cree-le avec « Fichier › Nouveau plan depuis une adresse » pour pouvoir l\'actualiser.');
    return;
  }
  if(!origineValide(cad)){
    showToast('Ce plan n\'a pas de point de calage enregistre : actualiser deplacerait tout le contenu.');
    return;
  }
  parcours.ouvrir({
    type: 'actualisation',
    infos: {
      parcelle: 'Parcelle ' + (cad.section || '') + ' ' + String(cad.numero || '').replace(/^0+/, '') + ' — ' + (cad.commune || ''),
      nbIgn: ctx.etat.objects.filter(o => coucheIgn(o) !== null).length,
      nbVoisines: ctx.etat.objects.filter(o => o.cadastre && o.cadastre.idu && o.cadastre.idu !== cad.idu).length
    },
    lancer: (options) => { parcours.fermer(); void actualiserDepuisIgn(options, ctx); }
  });
}

/** La couche BD TOPO d'un objet importe, ou `null` pour un objet dessine ou un arbre estime. */
function coucheIgn(o: ObjetPlan): string | null {
  // `bdtopo` reste `unknown` sur ObjetPlan : sa forme varie selon la couche (model/types.ts).
  const couche = (o.bdtopo as { couche?: unknown } | null | undefined)?.couche;
  return typeof couche === 'string' && couche !== 'estimation' ? couche : null;
}

/**
 * Les objets BD TOPO frais, par identifiant, pour chaque couche deja presente dans le plan. Une
 * couche indisponible ne bloque pas les autres : elle est notee au bilan, ses objets restent tels
 * quels.
 */
async function couchesFraiches(objets: ObjetPlan[], proj: ProjecteurLocal, bilan: string[]): Promise<Record<string, FeatureGeoJSON>> {
  const fraiches: Record<string, FeatureGeoJSON> = {};
  const couches = [...new Set(objets.map(coucheIgn).filter((c): c is string => c !== null))];
  const anneaux: Anneau[] = [];
  objets.forEach(o => {
    const anneau = o.cadastre && o.cadastre.geometrieSource ? (o.cadastre.geometrieSource as { coordinates: Anneau[] }).coordinates[0] : undefined;
    if (anneau) anneaux.push(anneau);
  });
  if (!couches.length || !anneaux.length) return fraiches;
  const bbox = bboxDegDesAnneaux(anneaux, proj, 15);
  for (const couche of couches) {
    try {
      const feats = await interrogerWfs(couche, bbox, 80);
      feats.forEach(f => {
        const p = f.properties || {};
        const id = (f.id as string) || (p.cleabs as string);
        if (id) fraiches[id] = f;
      });
    } catch { bilan.push('couche ' + couche + ' indisponible'); }
  }
  return fraiches;
}

export async function actualiserDepuisIgn(options: OptionsActualisation | null | undefined, ctx: ContexteActualisation): Promise<void> {
  options = options || { portee:'tout', voisinage:{actif:false} };
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!parcelle || !cad || !origineValide(cad) || enCours) return;
  enCours = true;
  signaler();
  const bilan = [];
  try {
    const proj = projecteurLocal(cad.origineLat, cad.origineLon);
    const simplifier = !!cad.simplifieM;

    // ---- 1. La parcelle, par identifiant cadastral exact (on sait qui on cherche : pas d'emprise)
    // `cadastre` ne declare que les deux champs que `render/ortho.ts` lit (model/types.ts) ; les
    // autres, dont ceux-ci, arrivent par l'index signature en `unknown`.
    const urlParcelle = CADASTRE_URL + '?code_insee=' + encodeURIComponent(cad.codeInsee as string) +
      '&section=' + encodeURIComponent(cad.section as string) + '&numero=' + encodeURIComponent(cad.numero as string) + '&_limit=5';
    // `fetchJSONReseau` rend du JSON arbitraire (`unknown`) : la reponse est lue comme la collection
    // GeoJSON que l'API renvoie, sans verification, comme avant le typage de geo/apiIgn.ts.
    const repParcelle = await fetchJSONReseau(urlParcelle) as CollectionGeoJSON;
    const featParcelle = ((repParcelle && repParcelle.features) || [])[0];
    let ptsParcelle = null;
    if(featParcelle){
      const anneau = anneauExterieur(featParcelle.geometry);
      if(anneau) ptsParcelle = anneauVersPts(anneau, proj, simplifier);
    }
    // Une parcelle fusionnee a un contour construit, pas un contour cadastral : le remplacer par
    // celui d'une seule de ses composantes amputerait le terrain.
    const fusionDe = cad.fusionDe as unknown[] | undefined;
    if(fusionDe && fusionDe.length > 1){
      bilan.push('propriete fusionnee : contour conserve');
      ptsParcelle = null;
    }

    // ---- 2. Les objets issus de la BD TOPO, couche par couche (portee « tout » seulement)
    const fraiches = options.portee === 'tout' ? await couchesFraiches(ctx.etat.objects, proj, bilan) : {};

    // ---- 3. Application
    ctx.pushHistory();
    let nMaj = 0, nAbsents = 0, ecartMax = 0;
    // Un nouveau contour n'existe que si la parcelle a ete relue : les deux vont ensemble.
    const contour = ptsParcelle, relue = featParcelle;
    const serialises: ObjetBrut[] = ctx.serializeObjects(ctx.etat.objects).map((o: ObjetBrut)=>{
      if(o.key === parcelle.key && contour && relue){
        // ecart max entre l'ancien et le nouveau contour : c'est la mesure du changement
        ((o as Partial<ObjetPolygone>).pts||[]).forEach(p=>{ ecartMax = Math.max(ecartMax, distancePointContour(p, contour)); });
        const copie: ObjetBrut = Object.assign({}, o, {
          pts: contour,
          vertexNames: contour.map((_,i)=>(o.vertexNames && o.vertexNames[i]) || ('Point ' + (i+1))),
          segmentNames: contour.map((_,i)=>(o.segmentNames && o.segmentNames[i]) || ('Cote ' + (i+1))),
          frozenVertices: contour.map(()=>false)
        });
        const pp: Record<string, unknown> = relue.properties || {};
        copie.cadastre = Object.assign({}, o.cadastre, {
          contenanceM2: pp.contenance, commune: pp.nom_com || (o.cadastre && o.cadastre.commune),
          recupereLe: new Date().toISOString(),
          geometrieSource: { type:'Polygon', coordinates:[anneauExterieur(relue.geometry)] }
        });
        return copie;
      }
      const bdtopo = o.bdtopo as { couche?: string; id?: string; hauteurRetenueM?: number; nature?: string; usage1?: string } | undefined;
      if(bdtopo && bdtopo.couche && bdtopo.couche !== 'estimation'){
        const f = fraiches[bdtopo.id as string];
        if(!f){ nAbsents++; return o; }
        const anneau = anneauExterieur(f.geometry);
        if(!anneau){ nAbsents++; return o; }
        const pts = anneauVersPts(anneau, proj, simplifier);
        if(pts.length < 3){ nAbsents++; return o; }
        const p: Record<string, unknown> = f.properties || {};
        nMaj++;
        // Nom, couleurs, verrouillage et textures sont des choix de l'utilisateur : l'actualisation
        // ne touche qu'a la geometrie et aux attributs IGN.
        const haut = bdtopo.couche === COUCHE_BATIMENT
          ? hauteurBatiment(p)
          : (nombreFr(p.hauteur) || bdtopo.hauteurRetenueM || hauteurVegetation(p.nature as string | undefined));
        return Object.assign({}, o, {
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          elevation: haut,
          bdtopo: Object.assign({}, bdtopo, {
            nature: p.nature || bdtopo.nature, usage1: p.usage_1 || bdtopo.usage1,
            hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
            nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
            altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
            etat: p.etat_de_l_objet || (bdtopo as { etat?: string }).etat,
            identifiantRnb: p.identifiants_rnb || (bdtopo as { identifiantRnb?: string }).identifiantRnb,
            recupereLe: new Date().toISOString()
          })
        });
      }
      return o;
    });
    // ---- 3 bis. Import du voisinage, si demande : c'est le seul cas ou l'actualisation AJOUTE
    // des objets. Tout ce qui arrive ici est marque voisinage:true, pour pouvoir etre masque
    // d'un coup sans etre supprime.
    // Ce que l'import du voisinage rend : les objets, plus le compte de chaque famille pour le bilan.
  let ajouts: { objets: ObjetBrut[]; parcelles?: number; batiments?: number; vegetation?: number; arbres?: number } = { objets: [] };
    if(options.voisinage && options.voisinage.actif){
      try {
        ajouts = await construireVoisinage(parcelle, cad, proj, simplifier, options.voisinage, serialises);
        if(ajouts.parcelles) bilan.push(ajouts.parcelles + ' parcelle(s) adjacente(s) ajoutee(s)');
        if(ajouts.batiments) bilan.push(ajouts.batiments + ' batiment(s) ajoute(s)');
        if(ajouts.vegetation) bilan.push(ajouts.vegetation + ' zone(s) de vegetation ajoutee(s)');
        if(ajouts.arbres) bilan.push(ajouts.arbres + ' arbre(s) estime(s)');
        if(!ajouts.objets.length) bilan.push('voisinage : rien de nouveau a ajouter');
        serialises.push(...ajouts.objets);
      } catch(e){
        bilan.push('voisinage non ajoute : ' + ((e as Error).message || e));
      }
    }
    ctx.restoreState({ objects: serialises, measures: ctx.serializeMeasures(ctx.etat.measures) });

    // ---- 4. Le zonage PLU, au centre de la parcelle
    const cible = ctx.trouverParcelleCloture();
    if(cible){
      const centre = centroid(sommetsDe(cible));
      const deg = proj.versDegres(centre.x, centre.y);
      try {
        cible.plu = await interrogerPlu(deg.lon, deg.lat);
        const zone = cible.plu.zones[0];
        if(zone) bilan.push('PLU : zone ' + zone.libelle);
        else bilan.push('PLU : aucun zonage');
      } catch { bilan.push('PLU indisponible'); }
    }
    ctx.markDirty();
    // La case « Voisinage » n'apparait que s'il y a du voisinage : elle vient peut-etre d'en
    // gagner (ou d'en perdre, si l'utilisateur annule).
    ctx.syncBasculeVoisinage();
    ctx.rebuildSelector();
    ctx.syncLieuTitre();
    ctx.render();

    if(ptsParcelle) bilan.unshift('parcelle actualisee (ecart max ' + Math.round(ecartMax*100) + ' cm)');
    if(nMaj) bilan.unshift(nMaj + ' objet(s) IGN remplace(s)');
    if(nAbsents) bilan.push(nAbsents + ' objet(s) absent(s) de la base actuelle, conserve(s) tels quels');
    showToast('Actualisation IGN — ' + (bilan.length ? bilan.join(' ; ') + '.' : 'aucun changement.'));
  } catch(e){
    showToast('Actualisation impossible : ' + ((e as Error).message || e));
  } finally {
    enCours = false;
    signaler();
  }
}

export async function construireVoisinage(
  parcelle: ObjetPlan,
  cad: { idu?: string; codeInsee?: string; origineLat: number; origineLon: number; geometrieSource?: { coordinates?: Anneau[] } },
  proj: ProjecteurLocal,
  simplifier: boolean,
  choix: { batiments?: boolean; vegetation?: boolean; arbres?: boolean },
  dejaSerialises: ObjetBrut[]
): Promise<{ objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number }> {
  const resultat: { objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number } = { objets:[], parcelles:0, batiments:0, vegetation:0, arbres:0 };
  const anneauSource = cad.geometrieSource && cad.geometrieSource.coordinates && cad.geometrieSource.coordinates[0];
  if(!anneauSource) throw new Error('geometrie source de la parcelle absente');

  const bboxParcelle = bboxDegDesAnneaux([anneauSource], proj, 20);
  const emprise: EmpriseGeoJSON = { type:'Polygon', coordinates:[[
    [bboxParcelle.lonMin, bboxParcelle.latMin], [bboxParcelle.lonMax, bboxParcelle.latMin],
    [bboxParcelle.lonMax, bboxParcelle.latMax], [bboxParcelle.lonMin, bboxParcelle.latMax],
    [bboxParcelle.lonMin, bboxParcelle.latMin]
  ]]};
  const feats = await interrogerCadastre(emprise, cad.codeInsee);
  const centreParc = centroid(sommetsDe(parcelle));
  const candidats = construireCandidats(feats, proj, centreParc, simplifier);
  const principale = { idu: cad.idu as string, pts: sommetsDe(parcelle) };
  const tri = trierVoisines(principale, candidats);

  const iduPresents = new Set(dejaSerialises.flatMap(o=>o.cadastre && o.cadastre.idu ? [o.cadastre.idu as string] : []));
  iduPresents.add(cad.idu as string);
  const clesPrises = new Set(dejaSerialises.map(o=>o.key));
  const cleUnique = (base: string | undefined) => {
    let cle = (base || 'objet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'objet';
    if(clesPrises.has(cle)){ let n = 2; while(clesPrises.has(cle + '-' + n)) n++; cle = cle + '-' + n; }
    clesPrises.add(cle);
    return cle;
  };
  const recupereLe = new Date().toISOString();
  const nouvellesParcelles: Candidate[] = [];
  tri.adjacentes.forEach(c=>{
    if(iduPresents.has(c.idu)) return;
    iduPresents.add(c.idu);
    nouvellesParcelles.push(c);
    const pts = c.pts;
    resultat.objets.push({
      key: cleUnique('parcelle-' + libelleParcelle(c)), type:'polygon', name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
      segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
      frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'terrain', matiere:'', priority:0, locked:true, voisinage:true,
      cadastre: {
        idu:c.idu, codeInsee:c.codeInsee, commune:c.commune, section:c.section, numero:c.numero,
        contenanceM2:c.contenance, source:'IGN/API Carto/PCI', recupereLe,
        origineLat:cad.origineLat, origineLon:cad.origineLon,
        simplifieM: simplifier ? SIMPLIF_M : 0,
        geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
      }
    });
    resultat.parcelles++;
  });
  if(!nouvellesParcelles.length) return resultat;

  // BD TOPO sur les seules parcelles qui viennent d'entrer dans le plan.
  const bbox = bboxDegDesAnneaux(nouvellesParcelles.map(c=>c.anneauDeg), proj, 5);
  const idsPresents = new Set(dejaSerialises.filter(o=>o.bdtopo && (o.bdtopo as { id?: string }).id).map(o=>(o.bdtopo as { id?: string }).id));
  const surNouvelles = (e: { pts: PtBrut[] }) => nouvellesParcelles.some(c=>polygonesSeTouchent(e.pts, c.pts));

  if(choix.batiments){
    const feats2 = await interrogerWfs(COUCHE_BATIMENT, bbox, 80).catch((): FeatureGeoJSON[]=>[]);
    construireElementsIgn(feats2, proj, simplifier, 'batiment').forEach(b=>{
      if(idsPresents.has(b.id) || !surNouvelles(b)) return;
      idsPresents.add(b.id);
      const p = b.props || {};
      const haut = hauteurBatiment(p);
      const pts = b.pts;
      resultat.objets.push({
        key: cleUnique('bati-' + (b.id || '')), type:'polygon',
        name: (p.usage_1 || p.nature || 'Batiment') + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        fill:'#CFC3B4', fillOpacity:0.6, stroke:'#8A7B63',
        pts,
        vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
        segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
        frozenVertices: pts.map(()=>false),
        showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
        constrained:false, fonction:'batiment', matiere:'', priority:2, locked:true, voisinage:true,
        elevation: haut,
        bdtopo: { couche:COUCHE_BATIMENT, id:b.id, cleabs:p.cleabs || null, nature:p.nature || null,
          usage1:p.usage_1 || null, usage2:p.usage_2 || null, hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut,
          nombreEtages:nombreFr(p.nombre_d_etages), nombreLogements:nombreFr(p.nombre_de_logements),
          altitudeSolM:nombreFr(p.altitude_minimale_sol), altitudeToitM:nombreFr(p.altitude_minimale_toit),
          etat:p.etat_de_l_objet || null, identifiantRnb:p.identifiants_rnb || null,
          surParcellePrincipale:false, recupereLe }
      });
      resultat.batiments++;
    });
  }
  if(choix.vegetation){
    for(const couche of [COUCHE_HAIE, COUCHE_VEGETATION]){
      const feats3 = await interrogerWfs(couche, bbox, 40).catch((): FeatureGeoJSON[]=>[]);
      const elems = construireElementsIgn(feats3, proj, simplifier, couche === COUCHE_HAIE ? 'haie' : 'vegetation');
      elems.forEach(v=>{
        if(idsPresents.has(v.id) || !surNouvelles(v)) return;
        idsPresents.add(v.id);
        const p = v.props || {};
        const estHaie = couche === COUCHE_HAIE;
        const haut = estHaie ? (nombreFr(p.hauteur) || 2) : hauteurVegetation(p.nature as string | undefined);
        const pts = v.pts;
        resultat.objets.push({
          key: cleUnique((estHaie ? 'haie-' : 'vegetation-') + (v.id || '')), type:'polygon',
          name: estHaie ? 'Haie' : ((p.nature as string) || 'Vegetation'),
          fill: estHaie ? '#7FA86B' : '#A9BE8E', fillOpacity: estHaie ? 0.8 : 0.55,
          stroke: estHaie ? '#3F5C33' : '#4A6B32',
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
          constrained:false, fonction:'massif', matiere:'', priority:2, locked:false, voisinage:true,
          elevation: haut,
          bdtopo: { couche, id:v.id, cleabs:p.cleabs || null, nature:p.nature || (estHaie ? 'Haie' : null),
            hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut, recupereLe }
        });
        resultat.vegetation++;
        if(choix.arbres && !estHaie){
          arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
            resultat.objets.push({
              key: cleUnique('arbre-' + (v.id || 'veg') + '-' + (i+1)), type:'circle', name:'Arbre (estime)',
              fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
              center:{x:a.x, y:a.y}, r:2.5,
              showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
              constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false, voisinage:true,
              elevation: haut, diametreArbre:5,
              bdtopo: { couche:'estimation', origine:v.id, estime:true, hauteurRetenueM:haut, recupereLe }
            });
            resultat.arbres++;
          });
        }
      });
    }
  }
  return resultat;
}

