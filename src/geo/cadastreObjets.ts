// Conversion des donnees cadastrales en objets du plan (spec §3.2, geo/).
//
// C'est la charniere de l'import : d'un cote les anneaux de coordonnees renvoyes par l'API Carto et
// la BD TOPO, de l'autre les objets que le reste du programme sait dessiner, mesurer et exporter.
//
// Le parametre s'appelle `importe` et non `etat` : dans le fichier d'origine il s'appelait `etat`,
// c'est-a-dire exactement le nom de l'etat de l'application. Deux choses tres differentes
// portaient le meme nom dans deux portees imbriquees, et il suffisait d'une accolade mal placee
// pour ecrire dans l'une en croyant lire l'autre.

import { fusionnerAnneaux, chainerSegments } from '../geometry/rings.js';
import { centroid } from '../geometry/basic.js';
import { nombreFr } from '../util/format.js';
import { hauteurBatiment, hauteurVegetation, arbresEstimes, libelleParcelle, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from './bdtopo.js';
import { FUSION_TOL_M, SIMPLIF_M } from './constantesCadastre.js';
import type { PtBrut, ObjetPlan, ZonagePlu } from '../model/types.js';

/** Une parcelle cadastrale, telle que l'API Carto la rend. */
export interface ParcelleCadastrale {
  idu: string;
  codeInsee?: string;
  commune?: string;
  section?: string;
  numero?: string | number;
  /** Contenance officielle, en m². `null` quand l'API n'en fournit pas (garde son sens dans le JSON exporte). */
  contenance?: number | null;
  /** Contour en degres WGS84, pour la fiche cadastrale (`cadastre.geometrieSource`). */
  anneauDeg: number[][];
  /** Contour en metres, repere local. */
  pts: PtBrut[];
  /** Distance a l'adresse recherchee, pour la fiche de la parcelle principale. */
  distance?: number;
}

/** Un objet BD TOPO brut (batiment, haie, ou zone de vegetation), avant conversion en objet du plan. */
export interface ObjetBdTopo {
  id?: string;
  props?: Record<string, unknown>;
  pts: PtBrut[];
  /** Les parcelles que cet objet touche, par IDU. */
  parcelles: Iterable<string>;
}

/**
 * Une suggestion d'adresse rendue par la BAN (`geo/apiIgn.ts::geocoderBAN`), et le point d'adresse
 * qui a lance la recherche une fois choisi — le meme objet sert aux deux endroits.
 *
 * `genre` distingue le niveau de resolution (`'housenumber'`, `'street'`, `'municipality'`...) : une
 * adresse resolue a la commune n'a pas la meme fiabilite qu'un numero de voirie precis, et l'appelant
 * (`ui/cadastreDialog.ts`) le signale a l'utilisateur. `citycode` (code INSEE) filtre la recherche
 * cadastrale a la bonne commune.
 */
export interface AdresseRecherchee {
  label: string;
  score: number;
  genre: string;
  citycode: string;
  ville: string;
  lon: number;
  lat: number;
}

/** Le projecteur local monde <-> degres, tel que `geo/projection.ts` le rend. */
export interface ProjecteurCadastre {
  versDegres: (x: number, y: number) => { lat: number; lon: number };
}

/**
 * Ce que l'import cadastral a rassemble, prêt a devenir des objets du plan.
 *
 * Le nom `importe` (et non `etat`) porte une histoire : dans le fichier d'origine, ce parametre et
 * l'etat de l'application portaient le meme nom dans deux portees imbriquees — voir l'en-tete de ce
 * fichier.
 */
export interface ImportCadastral {
  principale: ParcelleCadastrale;
  parcellesPropriete: () => ParcelleCadastrale[];
  /** Ecrit par cette fonction : vrai si la fusion des parcelles de propriete a echoue. */
  fusionEchouee?: boolean;
  proj: ProjecteurCadastre;
  /** Le contour a-t-il ete simplifie avant import ? */
  simplifier?: boolean;
  geo?: AdresseRecherchee | null;
  /** Rayon de recherche des voisines, en metres. */
  rayon?: number;
  voisinesRetenues: () => ParcelleCadastrale[];
  importerBatiments?: boolean;
  batiments: ObjetBdTopo[];
  importerHaies?: boolean;
  haies: ObjetBdTopo[];
  importerVegetation?: boolean;
  vegetation: ObjetBdTopo[];
  importerArbres?: boolean;
  /** Zonage PLU de la parcelle principale, pose tel quel sur l'objet parcelle. */
  plu?: ZonagePlu | null;
}

export function objetsDepuisCadastre(importe: ImportCadastral): ObjetPlan[] {
  const principale = importe.principale;
  // Origine (0,0) = sommet le plus au nord de la parcelle principale : c'est la convention du
  // plan (X+ = Est, Y+ = Nord), celle qu'annonce aussi le resume de l'onglet Export.
  // Une propriete tient souvent sur plusieurs parcelles : celles marquees "propriete" sont
  // fusionnees en UN seul objet parcelle (le terrain reel), et leurs limites internes sont
  // conservees a part, en pointille. Si la fusion echoue (parcelles non contigues, trou), on ne
  // sort pas un contour faux : chaque parcelle reste un objet distinct.
  const parcellesPropriete = importe.parcellesPropriete();
  const fusion = parcellesPropriete.length > 1
    ? fusionnerAnneaux(parcellesPropriete.map(p=>p.pts), FUSION_TOL_M)
    : { contour: principale.pts.map(p=>({x:p.x, y:p.y})), limites: [] };
  importe.fusionEchouee = parcellesPropriete.length > 1 && !fusion;
  const ptsFusion = fusion ? fusion.contour : principale.pts;
  const limitesInternes = fusion ? fusion.limites : [];
  const parcellesFusionnees = fusion ? parcellesPropriete : [principale];

  let nord = ptsFusion[0];
  ptsFusion.forEach(p=>{ if(p.y > nord.y) nord = p; });
  const dec = (p: PtBrut) => ({ x: Math.round((p.x - nord.x)*1000)/1000, y: Math.round((p.y - nord.y)*1000)/1000 });
  const proj = importe.proj;
  const origineDeg = proj.versDegres(nord.x, nord.y);
  const recupereLe = new Date().toISOString();

  function meta(c: ParcelleCadastrale, principaleOuNon: boolean): Record<string, unknown> {
    // Type volontairement large : ce bloc de metadonnees s'enrichit champ par champ selon ce que
    // l'import a pu obtenir (adresse, rayon de recherche, parcelles fusionnees). Le decrire
    // exactement demanderait un type par combinaison ; ce sera le travail du durcissement (phase 7).
    const info: Record<string, unknown> = {
      idu: c.idu, codeInsee: c.codeInsee, commune: c.commune,
      section: c.section, numero: c.numero,
      contenanceM2: c.contenance,
      source: 'IGN/API Carto/PCI', recupereLe,
      origineLat: origineDeg.lat, origineLon: origineDeg.lon,
      simplifieM: importe.simplifier ? SIMPLIF_M : 0,
      geometrieSource: { type:'Polygon', coordinates:[c.anneauDeg] }
    };
    if(principaleOuNon && importe.geo){
      info.adresse = importe.geo.label;
      info.adresseLon = importe.geo.lon;
      info.adresseLat = importe.geo.lat;
      info.adresseScore = importe.geo.score;
      info.rayonM = importe.rayon;
      info.distanceBordM = Math.round(c.distance*100)/100;
    }
    return info;
  }
  // `c` n'etait lu nulle part dans le corps (verifie a l'occasion du typage, spec §10.3) : les
  // deux appels passaient une parcelle qui ne servait jamais. Parametre retire, appels ajustes.
  function formeCommune(pts: PtBrut[]) {
    return {
      pts,
      vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
      segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
      frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showAngles:false,
      fonction:'terrain', matiere:'', priority:0, locked:true, constrained:false
    };
  }

  const ptsP = ptsFusion.map(dec);
  const centreP = centroid(ptsP);
  const centreDeg = proj.versDegres(centreP.x + nord.x, centreP.y + nord.y);
  const metaParcelle = meta(principale, true);
  if(parcellesFusionnees.length > 1){
    metaParcelle.fusionDe = parcellesFusionnees.map(c=>({
      idu:c.idu, section:c.section, numero:c.numero, contenanceM2:c.contenance,
      geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
    }));
    metaParcelle.contenanceM2 = parcellesFusionnees.reduce((s,c)=>s + (c.contenance || 0), 0) || null;
  }
  // La liste melange des polygones (parcelles, batiments, haies, vegetation) et des cercles
  // (arbres estimes) : `ObjetPlan` les couvre tous, `key` et `name` etant ses seuls champs requis.
  const objets: ObjetPlan[] = [Object.assign({
    key:'parcelle', type:'polygon',
    name:'Parcelle ' + parcellesFusionnees.map(libelleParcelle).join(' + '),
    fill:'#FBF3D9', fillOpacity:1, stroke:'#3B2E1F',
    showDims:true,
    // Le lieu (course du soleil, parasol, Vue 3D) se prend au centre de la parcelle, pas au
    // point d'adresse : celui-ci est sur la voirie.
    latitude: Math.round(centreDeg.lat*1e6)/1e6,
    longitude: Math.round(centreDeg.lon*1e6)/1e6,
    nomLieu: principale.commune || (importe.geo && importe.geo.ville) || '',
    cadastre: metaParcelle
  }, formeCommune(ptsP))];

  const clesPrises = new Set(['parcelle']);

  // Limites cadastrales internes a la propriete : elles ne sont plus une limite de terrain, mais
  // elles restent une information (bornage, mitoyennete, deux titres de propriete). Rendues en
  // pointille, verrouillees, et ignorees par la 3D - un trait au sol n'a pas de volume.
  chainerSegments(limitesInternes, FUSION_TOL_M).forEach((chaine, i)=>{
    const pts = chaine.map(dec);
    const cle = 'limite-' + (i+1);
    clesPrises.add(cle);
    objets.push({
      key:cle, type:'path', name:'Limite cadastrale ' + (i+1),
      fill:'#8A7B63', fillOpacity:1, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,k)=>'Point ' + (k+1)),
      segmentNames: pts.slice(0,-1).map((_,k)=>'Cote ' + (k+1)),
      frozenVertices: pts.map(()=>false),
      width:0.12, curve:false,
      showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'limite', matiere:'', priority:1, locked:true, elevation:0
    });
  });

  // Une parcelle fusionnee dans la propriete n'est plus une voisine a importer separement.
  importe.voisinesRetenues().filter(c=>!parcellesFusionnees.some(p=>p.idu === c.idu)).forEach(c=>{
    const pts = c.pts.map(dec);
    let cle = ('parcelle-' + libelleParcelle(c)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
    if(clesPrises.has(cle)){
      let n = 2;
      while(clesPrises.has(cle + '-' + n)) n++;
      cle = cle + '-' + n;
    }
    clesPrises.add(cle);
    objets.push(Object.assign({
      key:cle, type:'polygon', name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      // Les cotes de trois voisines par-dessus le plan le rendent illisible : la parcelle
      // principale garde ses dimensions, les voisines sont un decor de reference.
      showDims:false,
      cadastre: meta(c, false)
    }, formeCommune(pts)));
  });

  // ---- BD TOPO : batiments, haies, vegetation, arbres estimes ----
  const parcellesRetenues = new Set([principale.idu].concat(importe.voisinesRetenues().map(c=>c.idu)));
  const surParcellesRetenues = (e: ObjetBdTopo) => [...e.parcelles].some(idu=>parcellesRetenues.has(idu));
  const cleUnique = (base: string): string => {
    let cle = base, n = 2;
    while(clesPrises.has(cle)){ cle = base + '-' + n; n++; }
    clesPrises.add(cle);
    return cle;
  };
  /** Ce que chaque appel de `formeIgn` fixe en plus des champs communs a batiment/haie/vegetation. */
  interface OptionsFormeIgn {
    cle: string;
    hauteur: number;
    opacite?: number;
    extra?: { locked?: boolean; bdtopo?: unknown };
  }
  const formeIgn = (pts: PtBrut[], fonction: string, nom: string, fill: string, stroke: string, opts: OptionsFormeIgn) => Object.assign({
    key: cleUnique(opts.cle), type:'polygon', name: nom,
    fill, fillOpacity: opts.opacite !== undefined ? opts.opacite : 0.9, stroke,
    pts,
    vertexNames: pts.map((_,i)=>'Point ' + (i+1)),
    segmentNames: pts.map((_,i)=>'Cote ' + (i+1)),
    frozenVertices: pts.map(()=>false),
    showName:true, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
    // Jamais contraints a la parcelle : un batiment mitoyen deborde legitimement la limite, et la
    // contrainte le deformerait au premier deplacement.
    constrained:false, fonction, matiere:'', priority:2,
    elevation: opts.hauteur
  }, opts.extra || {});

  if(importe.importerBatiments){
    // "Sur la propriete" et non "sur la parcelle principale" : apres fusion, un batiment pose sur
    // la deuxieme parcelle du terrain est tout autant chez soi - il doit rester modifiable.
    const iduPropriete = new Set(parcellesFusionnees.map(p=>p.idu));
    importe.batiments.filter(surParcellesRetenues).forEach(b=>{
      const p = b.props || {};
      const surPrincipale = [...b.parcelles].some(idu=>iduPropriete.has(idu));
      const usage = p.usage_1 || p.nature || 'Batiment';
      objets.push(formeIgn(b.pts.map(dec), 'batiment',
        usage + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
        surPrincipale ? '#D9B694' : '#CFC3B4', surPrincipale ? '#7A4A2A' : '#8A7B63', {
          cle: 'bati-' + (b.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
          hauteur: hauteurBatiment(p),
          opacite: surPrincipale ? 0.92 : 0.6,
          // Le bati de la parcelle est modifiable (on aligne une terrasse dessus) ; celui des
          // voisins est un reference : verrouille, pour ne pas le deplacer par megarde.
          extra: {
            locked: !surPrincipale,
            bdtopo: {
              couche:'BDTOPO_V3:batiment', id:b.id, cleabs:p.cleabs || null,
              nature:p.nature || null, usage1:p.usage_1 || null, usage2:p.usage_2 || null,
              hauteurM: nombreFr(p.hauteur), hauteurRetenueM: hauteurBatiment(p),
              nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
              altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
              constructionLegere: String(p.construction_legere) === 'True',
              etat: p.etat_de_l_objet || null, dateApparition: p.date_d_apparition || null,
              identifiantRnb: p.identifiants_rnb || null,
              surParcellePrincipale: surPrincipale,
              recupereLe: recupereLe
            }
          }
        }));
    });
  }
  if(importe.importerHaies){
    importe.haies.filter(surParcellesRetenues).forEach(h=>{
      const p = h.props || {};
      const haut = nombreFr(p.hauteur) || 2;
      objets.push(formeIgn(h.pts.map(dec), 'massif', 'Haie', '#7FA86B', '#3F5C33', {
        cle: 'haie-' + (h.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
        hauteur: haut, opacite: 0.8,
        extra: { bdtopo: { couche:'BDTOPO_V3:haie', id:h.id, cleabs:p.cleabs || null,
                           nature:p.nature || 'Haie', hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
                           recupereLe: recupereLe } }
      }));
    });
  }
  if(importe.importerVegetation){
    importe.vegetation.filter(surParcellesRetenues).forEach(v=>{
      const p = v.props || {};
      // `props` est un sac de champs BD TOPO non type : `nature` en sort `unknown`, sa vraie forme
      // (chaine, ou absente) est connue de `hauteurVegetation` et de l'usage en nom d'objet ici.
      const nature = p.nature as string | undefined;
      const haut = hauteurVegetation(nature);
      objets.push(formeIgn(v.pts.map(dec), 'massif', nature || 'Vegetation', '#A9BE8E', '#4A6B32', {
        cle: 'vegetation-' + (v.id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
        hauteur: haut, opacite: 0.55,
        extra: { bdtopo: { couche:'BDTOPO_V3:zone_de_vegetation', id:v.id, cleabs:p.cleabs || null,
                           nature:p.nature || null, hauteurRetenueM: haut, hauteurM: null,
                           recupereLe: recupereLe } }
      }));
    });
    if(importe.importerArbres){
      importe.vegetation.filter(surParcellesRetenues).forEach(v=>{
        const haut = hauteurVegetation((v.props && v.props.nature) as string | undefined);
        arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).forEach((a, i)=>{
          const c2 = dec(a);
          objets.push({
            key: cleUnique('arbre-' + (v.id || 'veg').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + (i+1)),
            type:'circle', name:'Arbre (estime)',
            fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
            center:{x:c2.x, y:c2.y}, r: 2.5,
            showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
            constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false,
            elevation: haut, diametreArbre: 5,
            bdtopo: { couche:'estimation', origine: v.id, estime:true, hauteurRetenueM: haut, recupereLe: recupereLe }
          });
        });
      });
    }
  }
  // Le zonage PLU se range sur la parcelle : c'est elle qu'il qualifie, et il suit donc le projet
  // sans nouvelle cle a faire transiter par api.php.
  if(importe.plu) objets[0].plu = importe.plu;
  return objets;
}

