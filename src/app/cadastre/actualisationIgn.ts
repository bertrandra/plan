// L'actualisation IGN d'un plan cree depuis une adresse (spec §3.2, app/).
//
// C'est le geste delicat du lot : elle rejoue l'import IGN sur un plan qui a deja ete modifie. Ce qui
// vient du cadastre est remplace, ce que l'utilisateur a dessine est conserve — et c'est pour cela
// qu'elle passe par l'historique avant de toucher quoi que ce soit. Le dialogue qui la regle est un
// parcours (app/parcours.ts, zones/parcours/Actualisation.tsx) ; ce module fait le travail.
//
// Une seule actualisation a la fois : la commande se grise pendant qu'elle tourne (`enCours`).

import { nombreFr } from '../../util/format.js';
import { materiauxBdTopo, hauteurBatiment, hauteurVegetation, arbresEstimes, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES, libelleParcelle } from '../../geo/bdtopo.js';
import { distancePointContour } from '../../geometry/proximite.js';
import { toitBdTopo, toitActualise, attributsToitBdTopo } from '../../model/toitBdTopo.js';
import { showToast } from '../../shell/dialogs.js';
import { centroid, pointInPolygon } from '../../geometry/basic.js';
import { projecteurLocal } from '../../geo/projection.js';
import { SIMPLIF_M } from '../../geo/constantesCadastre.js';
import { interrogerCadastre, interrogerCadastreEtendu, lireVoisinageRayon, rayonDeLecture, interrogerWfsEtendu, plafondLecture, dansLeRayon, lireAuPlusPres, empriseGeoJSON, MAX_OBJETS_RAYON, RAYON_ETENDU_MAX_M, PLAFOND_LECTURE, construireCandidats, trierVoisines, anneauVersPts, anneauExterieur, bboxDegDesAnneaux, interrogerWfs, construireElementsIgn, fetchJSONReseau, polygonesSeTouchent, CADASTRE_URL, interrogerPlu, COUCHE_BATIMENT, COUCHE_VEGETATION, COUCHE_HAIE } from '../../geo/apiIgn.js';
import { sommetsDe } from '../../model/formes.js';
import { parcours } from '../parcours.js';
import { droitsCourants } from '../acces.js';
import { CAPACITES } from '../../plateforme/capacites.js';
import { idusCadastraux } from '../../model/cadastre.js';
import { valeursParDefaut } from './valeursParDefaut.js';
import { APPARENCES_IGN, batimentDeLaPropriete } from '../../geo/cadastreObjets.js';
import type { BboxDeg, CollectionGeoJSON, EmpriseGeoJSON, ElementIgn, FeatureGeoJSON, Anneau, Candidate, VoisinageRayon } from '../../geo/apiIgn.js';
import type { ProjecteurLocal } from '../../geo/projection.js';
import type { ObjetPlan, ObjetBrut, ObjetPolygone, PtBrut } from '../../model/types.js';
import type { OptionsActualisation } from './optionsActualisation.js';
import { volumesRecalcules, batimentsGardes, toitsEtMurs } from './actualisationIgn/toitsEtMurs.js';
import { actualiserRelief } from './actualisationIgn/relief.js';




export type { OptionsActualisation, InfosActualisation } from './optionsActualisation.js';
import { actualisation, commencer, finir, etape, type ContexteActualisation } from './actualisationIgn/progression.js';
import { versMemoire } from '../../model/champsFonction.js';
export { actualisation, type ContexteActualisation };

type Cadastre = NonNullable<ObjetPlan['cadastre']>;

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
      nbVoisines: ctx.etat.objects.filter(o => o.cadastre && o.cadastre.idu && o.cadastre.idu !== cad.idu).length,
      reliefPermis: droitsCourants().aCapacite(CAPACITES.relief.code),
      aUnRelief: !!parcelle.relief,
      voisinage: (() => {
        // Le plan est dans le repere de la projection du calage : ses coordonnees se lisent telles quelles.
        const proj = projecteurLocal(cad.origineLat, cad.origineLon);
        const centre = centroid(sommetsDe(parcelle));
        const idus = new Set(ctx.etat.objects.flatMap(idusCadastraux));
        const ids = new Set(ctx.etat.objects.flatMap(o => { const id = (o.bdtopo as { id?: unknown } | null | undefined)?.id; return typeof id === 'string' ? [id] : []; }));
        const lectures = new Map<number, Promise<VoisinageRayon>>();
        // Une seule lecture par palier et par ouverture du dialogue : le curseur filtre ensuite localement.
        const lire = (rayonM: number): Promise<VoisinageRayon> => {
          const palier = rayonDeLecture(rayonM);
          let lecture = lectures.get(palier);
          if (!lecture) { lecture = lireVoisinageRayon(centre, proj, palier, !!cad.simplifieM, new Set(idusCadastraux(parcelle))); lectures.set(palier, lecture); }
          return lecture;
        };
        return { centre, idus, ids, lire };
      })()
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
  etape('les bâtiments et la végétation (BD TOPO)…');
  const fraiches: Record<string, FeatureGeoJSON> = {};
  const couches = [...new Set(objets.map(coucheIgn).filter((c): c is string => c !== null))];
  const anneaux: Anneau[] = [];
  objets.forEach(o => {
    const anneau = o.cadastre && o.cadastre.geometrieSource ? (o.cadastre.geometrieSource as { coordinates: Anneau[] }).coordinates[0] : undefined;
    if (anneau) anneaux.push(anneau);
    // Une parcelle du voisinage s'enregistre sans sa geometrie source (io/serialisation.ts) : ses
    // sommets, dans le repere du calage, la redonnent en degres.
    else if (o.cadastre && o.type !== 'circle') { const pts = sommetsDe(o); if (pts.length) anneaux.push(pts.map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; }) as Anneau); }
  });
  if (!couches.length || !anneaux.length) return fraiches;
  const bbox = bboxDegDesAnneaux(anneaux, proj, 15);
  for (const couche of couches) {
    try {
      // Une seule requete rendait au plus 80 objets : sur l'emprise de toutes les parcelles d'un
      // voisinage, il y en a des centaines, et ceux d'au-dela restaient « absents de la base ».
      const feats = await interrogerWfsEtendu(couche, bbox, PLAFOND_LECTURE);
      feats.forEach(f => {
        const p = f.properties || {};
        const id = (f.id as string) || (p.cleabs as string);
        if (id) fraiches[id] = f;
      });
    } catch { bilan.push('couche ' + couche + ' indisponible'); }
  }
  return fraiches;
}

/** Ce que l'import du voisinage a ajoute, au bilan. */
function bilanVoisinage(ajouts: { objets: ObjetBrut[]; parcelles?: number; batiments?: number; vegetation?: number; arbres?: number; rayonM?: number; tronque?: boolean }, bilan: string[]): void {
  if(ajouts.parcelles) bilan.push(ajouts.parcelles + (ajouts.rayonM ? ' parcelle(s) a moins de ' + ajouts.rayonM + ' m ajoutee(s)' : ' parcelle(s) adjacente(s) ajoutee(s)'));
  if(ajouts.tronque) bilan.push('voisinage tronque a ' + MAX_OBJETS_RAYON + ' objets par famille, les plus proches');
  if(ajouts.batiments) bilan.push(ajouts.batiments + ' batiment(s) ajoute(s)');
  if(ajouts.vegetation) bilan.push(ajouts.vegetation + ' zone(s) de vegetation ajoutee(s)');
  if(ajouts.arbres) bilan.push(ajouts.arbres + ' arbre(s) estime(s)');
  if(!ajouts.objets.length) bilan.push('voisinage : rien de nouveau a ajouter');
}


/** La parcelle du projet sur son contour relu, avec sa fiche cadastrale a jour. */
function parcelleRelue(o: ObjetBrut, contour: PtBrut[], relue: FeatureGeoJSON): ObjetBrut {
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

/** Un batiment pose sur la parcelle du projet : importe pour elle, ou dont le centre tombe dessus (dessine compris). */
function batimentSurLaParcelle(o: ObjetBrut, parcelle: PtBrut[]): boolean {
  if(o.fonction !== 'batiment') return false;
  if((o.bdtopo as { surParcellePrincipale?: unknown } | null | undefined)?.surParcellePrincipale === true) return true;
  const pts = o.type === 'polygon' ? (o as Partial<ObjetPolygone>).pts : undefined;
  return !!pts && pts.length >= 3 && pointInPolygon(centroid(pts), parcelle);
}

/**
 * Les batiments de la parcelle, lus a la BD TOPO comme a l'import : tout ce qui la touche. `null`
 * si la lecture echoue — les batiments en place restent alors, plutot qu'un plan sans maison.
 */
async function batimentsDeLaParcelle(parcelle: PtBrut[], proj: ProjecteurLocal, simplifier: boolean): Promise<ElementIgn[] | null> {
  etape('les bâtiments de la parcelle…');
  const anneau = parcelle.map(p => { const d = proj.versDegres(p.x, p.y); return [d.lon, d.lat]; }) as Anneau;
  try {
    const feats = await interrogerWfs(COUCHE_BATIMENT, bboxDegDesAnneaux([anneau], proj, 20), 200);
    return construireElementsIgn(feats, proj, simplifier, 'batiment').filter(b => polygonesSeTouchent(b.pts, parcelle));
  } catch { return null; }
}

/**
 * Les batiments frais de la parcelle et le test de ce qu'ils remplacent : ceux de la parcelle, et un
 * voisin que la BD TOPO lui rattache desormais. Sans lecture, rien n'est remplace. Un batiment garde
 * (verifie sur place) n'est ni remplace ni recree : le batiment frais qui porte son identifiant est ecarte.
 */
async function recreation(parcelle: PtBrut[], proj: ProjecteurLocal, simplifier: boolean, bilan: string[], gardes: ReturnType<typeof batimentsGardes>): Promise<{ batiFrais: ElementIgn[] | null; aRecreer: (o: ObjetBrut) => boolean }> {
  const lus = await batimentsDeLaParcelle(parcelle, proj, simplifier);
  if(!lus){ bilan.push('batiments de la parcelle non relus (BD TOPO indisponible) : conserves'); return { batiFrais: lus, aRecreer: () => false }; }
  const batiFrais = lus.filter(b => !b.id || !gardes.ids.has(b.id));
  const ids = new Set(batiFrais.map(b => b.id));
  return { batiFrais, aRecreer: (o) => !gardes.garde(o) && (batimentSurLaParcelle(o, parcelle) || (o.fonction === 'batiment' && ids.has((o.bdtopo as { id?: string } | null | undefined)?.id))) };
}

/**
 * Les batiments recrees, avec des cles libres dans le plan. Une reponse a la question du toit a
 * cheval (model/aCheval.ts) est un choix de la personne : elle suit le batiment par son identifiant.
 */
function batimentsRecrees(frais: ElementIgn[], anciens: ObjetBrut[], dejaLa: ObjetBrut[], ctx: ContexteActualisation, bilan: string[]): ObjetBrut[] {
  bilan.push(anciens.length + ' batiment(s) de la parcelle supprime(s), ' + frais.length + ' recree(s) depuis la BD TOPO');
  const cles = new Set(dejaLa.map(o => o.key));
  const cleUnique = (base: string) => { let cle = base, n = 2; while(cles.has(cle)){ cle = base + '-' + n; n++; } cles.add(cle); return cle; };
  const reponses = new Map(anciens.flatMap(o => { const id = (o.bdtopo as { id?: string } | null | undefined)?.id; return id && o.batiment?.toitACheval ? [[id, o.batiment?.toitACheval] as const] : []; }));
  const recupereLe = new Date().toISOString();
  const nouveaux = frais.map(b => { const o = batimentDeLaPropriete(b, cleUnique, recupereLe); const r = b.id ? reponses.get(b.id) : undefined; return r ? { ...o, batiment: { ...(o).batiment, toitACheval: r } } : o; });
  return ctx.serializeObjects(nouveaux).map(versMemoire);
}

export async function actualiserDepuisIgn(options: OptionsActualisation | null | undefined, ctx: ContexteActualisation): Promise<void> {
  options = options || { portee:'tout', voisinage:{actif:false} };
  const parcelle = ctx.trouverParcelleCloture();
  const cad = parcelle && parcelle.cadastre;
  if(!parcelle || !cad || !origineValide(cad) || actualisation.enCours()) return;
  commencer();
  const bilan = [];
  try {
    const proj = projecteurLocal(cad.origineLat, cad.origineLon);
    const simplifier = !!cad.simplifieM;

    // ---- 1. La parcelle, par identifiant cadastral exact (on sait qui on cherche : pas d'emprise).
    // `cadastre` ne declare que les champs que render/ortho.ts lit : les autres arrivent en `unknown`.
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
    // ---- 2 bis. « Actualiser le projet » : les batiments de la parcelle, relus pour etre recrees.
    // Les copies serialisees sont a plat : l'actualisation les lit dans la forme de la memoire (model/champsFonction.ts).
    const gardes = batimentsGardes(ctx.serializeObjects(ctx.etat.objects).map(versMemoire), options);
    const { batiFrais, aRecreer } = options.recreerBatiments ? await recreation(ptsParcelle ?? sommetsDe(parcelle), proj, simplifier, bilan, gardes) : { batiFrais: null, aRecreer: () => false };

    // ---- 3. Application
    ctx.pushHistory();
    let nMaj = 0, nAbsents = 0, ecartMax = 0, nToits = 0, nGardes = 0;
    // Un nouveau contour n'existe que si la parcelle a ete relue : les deux vont ensemble.
    const contour = ptsParcelle, relue = featParcelle;
    const avant = sansVoisinesDeLaPropriete(ctx.serializeObjects(ctx.etat.objects).map(versMemoire), parcelle, bilan);
    const anciensBatiments = avant.filter(aRecreer);
    const serialises: ObjetBrut[] = avant.filter(o => !aRecreer(o)).map((brut: ObjetBrut)=>{
      // Un batiment verifie sur place est le 100 % du projet : il ressort tel qu'il est entre.
      if(gardes.garde(brut)){ nGardes++; return brut; }
      const o = options.parDefaut ? valeursParDefaut(brut) : brut;
      if(o.key === parcelle.key && contour && relue){
        // ecart max entre l'ancien et le nouveau contour : c'est la mesure du changement
        ((o as Partial<ObjetPolygone>).pts||[]).forEach(p=>{ ecartMax = Math.max(ecartMax, distancePointContour(p, contour)); });
        return parcelleRelue(o, contour, relue);
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
        const toit = bdtopo.couche === COUCHE_BATIMENT ? toitActualise(o.batiment?.toit, pts, attributsToitBdTopo(p)) : undefined;
        if(toit && toit !== o.batiment?.toit && toit.source === 'bdtopo' && toit.forme !== 'plat') nToits++;
        const volumesToit = volumesRecalcules(o, pts, toit);
        return Object.assign({}, o, {
          pts,
          vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
          segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
          frozenVertices: pts.map(()=>false),
          elevation: haut,
          // Un contour relu se relit aussi sur le LiDAR : la tache de fond le reprend s'il n'est pas des plus proches ;
          // ses attributs relus (usage, etages), son profil de facades se rechoisit (app/toits/profilsFacadesFond.ts).
          ...(toit || volumesToit !== undefined || bdtopo.couche === COUCHE_BATIMENT ? { batiment: { ...o.batiment, ...(toit ? { toit } : {}),
            ...(volumesToit !== undefined ? { volumesToit, toitMesure: null, corpsToit: null } : {}),
            ...(bdtopo.couche === COUCHE_BATIMENT ? { toitLidarLu: null, ...(o.batiment?.profilFacades ? { profilFacades: null } : {}) } : {}) } } : {}),
          bdtopo: Object.assign({}, bdtopo, {
            nature: p.nature || bdtopo.nature, usage1: p.usage_1 || bdtopo.usage1,
            hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
            nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
            altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
            altitudeToitMaxM: nombreFr(p.altitude_maximale_toit), constructionLegere: String(p.construction_legere) === 'True', ...materiauxBdTopo(p),
            etat: p.etat_de_l_objet || (bdtopo as { etat?: string }).etat,
            identifiantRnb: p.identifiants_rnb || (bdtopo as { identifiantRnb?: string }).identifiantRnb,
            recupereLe: new Date().toISOString()
          })
        });
      }
      return o;
    });
    if(batiFrais) serialises.push(...batimentsRecrees(batiFrais, anciensBatiments, serialises, ctx, bilan));
    // ---- 3 bis. Import du voisinage, si demande : le seul cas ou l'actualisation AJOUTE des objets,
    // tous marques voisinage:true pour pouvoir etre masques d'un coup sans etre supprimes.
    // Ce que l'import du voisinage rend : les objets, plus le compte de chaque famille pour le bilan.
  let ajouts: { objets: ObjetBrut[]; parcelles?: number; batiments?: number; vegetation?: number; arbres?: number } = { objets: [] };
    if(options.voisinage && options.voisinage.actif){
      try {
        ajouts = await construireVoisinage(parcelle, cad, proj, simplifier, options.voisinage, serialises);
        bilanVoisinage(ajouts, bilan);
        serialises.push(...ajouts.objets);
      } catch(e){
        bilan.push('voisinage non ajoute : ' + ((e as Error).message || e));
      }
    }
    // ---- 3 ter. La couverture des toits (orthophoto), leur forme (MNH LiDAR HD, spec §10), la couleur des murs (§6.5)
    await toitsEtMurs(serialises, proj, bilan, ctx, options);
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
    // ---- 5. Le relief, si demande : en dernier, sur le plan deja actualise (parcelles comprises).
    if(options.relief?.actif && droitsCourants().aCapacite(CAPACITES.relief.code)) await actualiserRelief(ctx, options.relief.toutesParcelles, bilan, options.parDefaut, options.voisinage.actif ? options.voisinage.rayonM : undefined);
    ctx.markDirty();
    // Le menu Affichage ne propose « Voisinage » que s'il y en a : il vient peut-etre d'en gagner
    // (ou d'en perdre, si l'utilisateur annule). Le magasin le redit aux zones.
    ctx.rebuildSelector();
    ctx.syncLieuTitre();
    ctx.render();
    if(ptsParcelle) bilan.unshift('parcelle actualisee (ecart max ' + Math.round(ecartMax*100) + ' cm)');
    if(nToits) bilan.push(nToits + ' toit(s) deduit(s) de la BD TOPO');
    if(nMaj) bilan.unshift(nMaj + ' objet(s) IGN remplace(s)');
    if(nAbsents) bilan.push(nAbsents + ' objet(s) absent(s) de la base actuelle, conserve(s) tels quels');
    if(nGardes) bilan.push(nGardes + ' batiment(s) verifie(s) sur place conserve(s) tel(s) quel(s)');
    showToast((options.parDefaut ? 'Projet actualisé — ' : 'Actualisation IGN — ') + (bilan.length ? bilan.join(' ; ') + '.' : 'aucun changement.'));
    ctx.apresActualisation?.();
  } catch(e){
    showToast('Actualisation impossible : ' + ((e as Error).message || e));
  } finally {
    finir();
  }
}

/**
 * Une parcelle de la propriete posee en voisine par une relecture d'avant (model/cadastre.ts) recouvrait
 * le terrain : elle s'en va, le terrain fusionne la porte deja.
 */
function sansVoisinesDeLaPropriete(objets: ObjetBrut[], parcelle: ObjetPlan, bilan: string[]): ObjetBrut[] {
  const dansLaPropriete = new Set(idusCadastraux(parcelle));
  const gardes = objets.filter(o => !(o.voisinage && o.key !== parcelle.key && typeof o.cadastre?.idu === 'string' && dansLaPropriete.has(o.cadastre.idu)));
  if(gardes.length < objets.length) bilan.push((objets.length - gardes.length) + ' parcelle(s) de la propriete retiree(s) du voisinage');
  return gardes;
}

/**
 * Une parcelle voisine telle qu'elle entre dans le plan : verrouillee, marquee voisinage, avec sa
 * fiche cadastrale, et sans nom affiche (comme son bati) : des centaines de references par-dessus
 * le plan le rendaient illisible.
 */
function objetParcelleVoisine(c: Candidate, key: string, cad: { origineLat: number; origineLon: number }, simplifier: boolean, recupereLe: string): ObjetBrut {
  const pts = c.pts;
  return {
    key, type:'polygon', name: libelleParcelle(c),
    ...APPARENCES_IGN.parcelleVoisine,
    pts,
    vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
    segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
    frozenVertices: pts.map(()=>false),
    showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
    constrained:false, fonction:'terrain', matiere:'', priority:0, locked:true, voisinage:true,
    cadastre: {
      idu:c.idu, codeInsee:c.codeInsee, commune:c.commune, section:c.section, numero:c.numero,
      contenanceM2:c.contenance, source:'IGN/API Carto/PCI', recupereLe,
      origineLat:cad.origineLat, origineLon:cad.origineLon,
      simplifieM: simplifier ? SIMPLIF_M : 0,
      geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
    }
  };
}

export async function construireVoisinage(
  parcelle: ObjetPlan,
  cad: { idu?: string; codeInsee?: string; origineLat: number; origineLon: number; geometrieSource?: { coordinates?: Anneau[] } },
  proj: ProjecteurLocal,
  simplifier: boolean,
  choix: { batiments?: boolean; vegetation?: boolean; arbres?: boolean; rayonM?: number; centre?: PtBrut; batiPrincipal?: boolean },
  dejaSerialises: ObjetBrut[]
): Promise<{ objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number; rayonM?: number; tronque?: boolean }> {
  etape('le voisinage…');
  const resultat: { objets: ObjetBrut[]; parcelles: number; batiments: number; vegetation: number; arbres: number; rayonM?: number; tronque?: boolean } = { objets:[], parcelles:0, batiments:0, vegetation:0, arbres:0 };
  const anneauSource = cad.geometrieSource && cad.geometrieSource.coordinates && cad.geometrieSource.coordinates[0];
  if(!anneauSource) throw new Error('geometrie source de la parcelle absente');
  const centreParc = choix.centre ?? centroid(sommetsDe(parcelle)); // ou la position du mode audit (app/audit/)
  const principale = { idu: cad.idu as string, pts: sommetsDe(parcelle) };
  // Le voisinage etendu : un disque de `rayonM` autour du centre de la parcelle. L'emprise
  // demandee est le carre qui le contient ; ce qui n'y touche pas est ecarte, et au-dela du
  // plafond on garde les plus proches (lireAuPlusPres).
  // Borne au maximum du curseur, quelle que soit l'origine de la demande.
  const rayonM = choix.rayonM && choix.rayonM > 0 ? Math.min(choix.rayonM, RAYON_ETENDU_MAX_M) : 0;
  if(rayonM) resultat.rayonM = rayonM;
  const centreDeg = proj.versDegres(centreParc.x, centreParc.y);
  const empriseRayon: EmpriseGeoJSON = empriseGeoJSON(centreDeg.lon, centreDeg.lat, proj, rayonM || 1);


  const bboxParcelle = bboxDegDesAnneaux([anneauSource], proj, 20);
  const emprise: EmpriseGeoJSON = { type:'Polygon', coordinates:[[
    [bboxParcelle.lonMin, bboxParcelle.latMin], [bboxParcelle.lonMax, bboxParcelle.latMin],
    [bboxParcelle.lonMax, bboxParcelle.latMax], [bboxParcelle.lonMin, bboxParcelle.latMax],
    [bboxParcelle.lonMin, bboxParcelle.latMin]
  ]]};
  // Au-dela d'un kilometre, le disque se lit en disques croissants, les plus proches d'abord (lireAuPlusPres).
  const auPlusPres = async <T extends { pts: PtBrut[] }>(lire: (r: number) => Promise<T[]>): Promise<T[]> => {
    const lu = await lireAuPlusPres(rayonM, centreParc, lire);
    if(lu.tronque) resultat.tronque = true;
    return lu.elements;
  };
  const tri = rayonM
    ? { adjacentes: await auPlusPres(async r => construireCandidats(await interrogerCadastreEtendu(empriseGeoJSON(centreDeg.lon, centreDeg.lat, proj, r), plafondLecture(r)), proj, centreParc, simplifier).filter(c => c.idu !== principale.idu)) }
    : trierVoisines(principale, construireCandidats(await interrogerCadastre(emprise, cad.codeInsee), proj, centreParc, simplifier));

  // Les parcelles d'une propriete fusionnee sont deja dans le plan : dans le terrain (model/cadastre.ts).
  const iduPresents = new Set([...dejaSerialises.flatMap(idusCadastraux), ...idusCadastraux({ cadastre: cad })]);
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
    resultat.objets.push(objetParcelleVoisine(c, cleUnique('parcelle-' + libelleParcelle(c)), cad, simplifier, recupereLe));
    resultat.parcelles++;
  });
  if(!nouvellesParcelles.length && !rayonM) return resultat;

  // BD TOPO sur les seules parcelles qui viennent d'entrer dans le plan ; en voisinage etendu,
  // sur tout le disque, en plusieurs pages, les plus proches d'abord.
  const bbox = rayonM ? bboxDegDesAnneaux([empriseRayon.coordinates[0] as Anneau], proj, 0) : bboxDegDesAnneaux(nouvellesParcelles.map(c=>c.anneauDeg), proj, 5);
  const idsPresents = new Set(dejaSerialises.filter(o=>o.bdtopo && (o.bdtopo as { id?: string }).id).map(o=>(o.bdtopo as { id?: string }).id));
  // En voisinage etendu, tout le disque sauf la parcelle du projet : son bati, importe avec elle ou dessine (la demo), serait double (le mode audit, qui ne l'importe pas avec elle, le garde : `batiPrincipal`).
  const surNouvelles = (e: { pts: PtBrut[] }) => rayonM ? choix.batiPrincipal || !(e.pts.length >= 3 && pointInPolygon(centroid(e.pts), principale.pts)) : nouvellesParcelles.some(c=>polygonesSeTouchent(e.pts, c.pts));
  const bboxDuDisque = (r: number) => bboxDegDesAnneaux([empriseGeoJSON(centreDeg.lon, centreDeg.lat, proj, r).coordinates[0] as Anneau], proj, 0);
  const lireElements = (couche: string, max: number, genre: string): Promise<ElementIgn[]> => {
    const construire = (f: FeatureGeoJSON[]) => construireElementsIgn(f, proj, simplifier, genre);
    const lire = (b: BboxDeg, n: number | undefined, etendu: boolean) => (etendu ? interrogerWfsEtendu(couche, b, n as number) : interrogerWfs(couche, b, n)).catch((): FeatureGeoJSON[]=>[]);
    return rayonM ? auPlusPres(async r => construire(await lire(bboxDuDisque(r), plafondLecture(r), true))) : lire(bbox, max, false).then(construire);
  };
  // Les arbres estimes restent pres de la parcelle : un disque de 500 m en semerait des milliers.
  const RAYON_ARBRES_M = 100;

  if(choix.batiments){
    (await lireElements(COUCHE_BATIMENT, 80, 'batiment')).forEach(b=>{
      if(idsPresents.has(b.id) || !surNouvelles(b)) return;
      idsPresents.add(b.id);
      const p = b.props || {};
      const haut = hauteurBatiment(p);
      const pts = b.pts;
      resultat.objets.push({
        key: cleUnique('bati-' + (b.id || '')), type:'polygon',
        name: (p.usage_1 || p.nature || 'Batiment') + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        ...APPARENCES_IGN.batimentVoisin,
        pts,
        vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
        segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
        frozenVertices: pts.map(()=>false),
        showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
        constrained:false, fonction:'batiment', matiere:'', priority:2, locked:true, voisinage:true,
        elevation: haut,
        batiment: { toit: toitBdTopo(pts, attributsToitBdTopo(p)) },
        bdtopo: { couche:COUCHE_BATIMENT, id:b.id, cleabs:p.cleabs || null, nature:p.nature || null,
          usage1:p.usage_1 || null, usage2:p.usage_2 || null, hauteurM:nombreFr(p.hauteur), hauteurRetenueM:haut,
          nombreEtages:nombreFr(p.nombre_d_etages), nombreLogements:nombreFr(p.nombre_de_logements),
          altitudeSolM:nombreFr(p.altitude_minimale_sol), altitudeToitM:nombreFr(p.altitude_minimale_toit),
          altitudeToitMaxM:nombreFr(p.altitude_maximale_toit), constructionLegere:String(p.construction_legere) === 'True',
          ...materiauxBdTopo(p),
          etat:p.etat_de_l_objet || null, identifiantRnb:p.identifiants_rnb || null,
          surParcellePrincipale:false, recupereLe }
      });
      resultat.batiments++;
    });
  }
  if(choix.vegetation){
    for(const couche of [COUCHE_HAIE, COUCHE_VEGETATION]){
      const elems = await lireElements(couche, 40, couche === COUCHE_HAIE ? 'haie' : 'vegetation');
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
          ...(estHaie ? APPARENCES_IGN.haie : APPARENCES_IGN.vegetation),
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
        if(choix.arbres && !estHaie && (!rayonM || dansLeRayon(v.pts, centreParc, RAYON_ARBRES_M))){
          arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
            resultat.objets.push({
              key: cleUnique('arbre-' + (v.id || 'veg') + '-' + (i+1)), type:'circle', name:'Arbre (estime)',
              ...APPARENCES_IGN.arbreEstime,
              center:{x:a.x, y:a.y}, r:2.5,
              showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
              constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false, voisinage:true,
              elevation: haut, arbre: { diametre: 5 },
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
