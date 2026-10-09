// Conversion des donnees cadastrales en objets du plan (spec §3.2, geo/).
//
// C'est la charniere de l'import : d'un cote les anneaux de coordonnees renvoyes par l'API Carto et
// la BD TOPO, de l'autre les objets que le reste du programme sait dessiner, mesurer et exporter.
//
// Le parametre s'appelle `importe` et non `etat` : dans le fichier d'origine il s'appelait `etat`,
// c'est-a-dire exactement le nom de l'etat de l'application. Deux choses tres differentes
// portaient le meme nom dans deux portees imbriquees, et il suffisait d'une accolade mal placee
// pour ecrire dans l'une en croyant lire l'autre.

import { fusionnerAnneaux, chainerSegments, type LimiteBrute } from '../geometry/rings.js';
import { centroid } from '../geometry/basic.js';
import { nombreFr } from '../util/format.js';
import { hauteurBatiment, hauteurVegetation, arbresEstimes, libelleParcelle, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES } from './bdtopo.js';
import { portParNature } from '../model/arbre.js';
import { toitBdTopo, attributsToitBdTopo } from '../model/toitBdTopo.js';
import { FUSION_TOL_M, SIMPLIF_M } from './constantesCadastre.js';
import type { PtBrut, ObjetPlan, ZonagePlu, Toit } from '../model/types.js';
import type { Anneau } from './apiIgn.js';

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
  anneauDeg: Anneau;
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
  /**
   * Le voisinage etendu choisi a l'etape 3 : tout ce qui est dans un rayon de 100 ou 200 m. Il
   * arrive marque « voisinage » (l'oeil de l'explorateur le masque d'un coup) ; `visible` faux le
   * pose masque a l'ouverture du plan.
   */
  voisinageEtendu?: { parcelles: ParcelleCadastrale[]; batiments: ObjetBdTopo[]; visible: boolean } | null;
}

/** Ce que chaque morceau de l'import partage : le recalage sur l'origine, la date, les cles prises. */
interface ContexteImport {
  importe: ImportCadastral;
  /** Un point du repere local, recale sur l'origine (le sommet le plus au nord), au millimetre. */
  dec: (p: PtBrut) => PtBrut;
  origineDeg: { lat: number; lon: number };
  recupereLe: string;
  clesPrises: Set<string>;
  /** `base`, ou `base-2`, `base-3`... : la premiere cle libre, aussitot reservee. */
  cleUnique: (base: string) => string;
}

// Type volontairement large : ce bloc de metadonnees s'enrichit champ par champ selon ce que
// l'import a pu obtenir (adresse, rayon de recherche, parcelles fusionnees). Le decrire exactement
// demanderait un type par combinaison.
function metaCadastre(x: ContexteImport, c: ParcelleCadastrale, principaleOuNon: boolean): Record<string, unknown> {
  const { importe } = x;
  const info: Record<string, unknown> = {
    idu: c.idu, codeInsee: c.codeInsee, commune: c.commune,
    section: c.section, numero: c.numero,
    contenanceM2: c.contenance,
    source: 'IGN/API Carto/PCI', recupereLe: x.recupereLe,
    origineLat: x.origineDeg.lat, origineLon: x.origineDeg.lon,
    simplifieM: importe.simplifier ? SIMPLIF_M : 0,
    geometrieSource: { type:'Polygon', coordinates:[c.anneauDeg] }
  };
  if(principaleOuNon && importe.geo){
    info.adresse = importe.geo.label;
    info.adresseLon = importe.geo.lon;
    info.adresseLat = importe.geo.lat;
    info.adresseScore = importe.geo.score;
    info.rayonM = importe.rayon;
    // Posee par `construireCandidats` sur toute principale ; sans elle, pas de distance a dire.
    if(c.distance !== undefined) info.distanceBordM = Math.round(c.distance*100)/100;
  }
  return info;
}

/** Les champs communs a toutes les parcelles importees : un terrain verrouille, nomme, sans cotes. */
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

/** La parcelle du terrain : le contour fusionne de la propriete, et sa fiche cadastrale. */
function objetParcelle(x: ContexteImport, ptsFusion: PtBrut[], nord: PtBrut, parcellesFusionnees: ParcelleCadastrale[]): ObjetPlan {
  const { importe } = x;
  const ptsP = ptsFusion.map(x.dec);
  const centreP = centroid(ptsP);
  const centreDeg = importe.proj.versDegres(centreP.x + nord.x, centreP.y + nord.y);
  const metaParcelle = metaCadastre(x, importe.principale, true);
  if(parcellesFusionnees.length > 1){
    metaParcelle.fusionDe = parcellesFusionnees.map(c=>({
      idu:c.idu, section:c.section, numero:c.numero, contenanceM2:c.contenance,
      geometrieSource:{ type:'Polygon', coordinates:[c.anneauDeg] }
    }));
    metaParcelle.contenanceM2 = parcellesFusionnees.reduce((s,c)=>s + (c.contenance || 0), 0) || null;
  }
  return Object.assign({
    key:'parcelle', type:'polygon' as const,
    name:'Parcelle ' + parcellesFusionnees.map(libelleParcelle).join(' + '),
    fill:'#FBF3D9', fillOpacity:1, stroke:'#3B2E1F',
    showDims:true,
    // Le lieu (course du soleil, parasol, Vue 3D) se prend au centre de la parcelle, pas au point
    // d'adresse : celui-ci est sur la voirie.
    latitude: Math.round(centreDeg.lat*1e6)/1e6,
    longitude: Math.round(centreDeg.lon*1e6)/1e6,
    nomLieu: importe.principale.commune || (importe.geo && importe.geo.ville) || '',
    cadastre: metaParcelle
  }, formeCommune(ptsP));
}

/**
 * Les limites cadastrales internes a la propriete : plus une limite de terrain, mais une
 * information (bornage, mitoyennete, deux titres). En pointille, verrouillees, ignorees par la 3D.
 */
function limitesInternes(x: ContexteImport, limites: LimiteBrute[]): ObjetPlan[] {
  return chainerSegments(limites, FUSION_TOL_M).map((chaine, i)=>{
    const pts = chaine.map(x.dec);
    const cle = 'limite-' + (i+1);
    x.clesPrises.add(cle);
    return {
      key:cle, type:'path' as const, name:'Limite cadastrale ' + (i+1),
      fill:'#8A7B63', fillOpacity:1, stroke:'#8A7B63',
      pts,
      vertexNames: pts.map((_,k)=>'Point ' + (k+1)),
      segmentNames: pts.slice(0,-1).map((_,k)=>'Cote ' + (k+1)),
      frozenVertices: pts.map(()=>false),
      width:0.12, curve:false,
      showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
      constrained:false, fonction:'limite', matiere:'', priority:1, locked:true, elevation:0
    };
  });
}

/** Les voisines retenues ; une parcelle fusionnee dans la propriete n'en est plus une. */
function parcellesVoisines(x: ContexteImport, parcellesFusionnees: ParcelleCadastrale[]): ObjetPlan[] {
  return x.importe.voisinesRetenues().filter(c=>!parcellesFusionnees.some(p=>p.idu === c.idu)).map(c=>{
    const pts = c.pts.map(x.dec);
    let cle = ('parcelle-' + libelleParcelle(c)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'');
    if(x.clesPrises.has(cle)){
      let n = 2;
      while(x.clesPrises.has(cle + '-' + n)) n++;
      cle = cle + '-' + n;
    }
    x.clesPrises.add(cle);
    return Object.assign({
      key:cle, type:'polygon' as const, name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      // Les cotes de trois voisines par-dessus le plan le rendent illisible : la parcelle principale
      // garde ses dimensions, les voisines sont un decor de reference.
      showDims:false,
      cadastre: metaCadastre(x, c, false)
    }, formeCommune(pts));
  });
}

/** Ce que chaque appel de `formeIgn` fixe en plus des champs communs a batiment/haie/vegetation. */
interface OptionsFormeIgn {
  cle: string;
  hauteur: number;
  opacite?: number;
  extra?: { locked?: boolean; bdtopo?: unknown; toit?: Toit };
}

function formeIgn(x: ContexteImport, pts: PtBrut[], fonction: string, nom: string, fill: string, stroke: string, opts: OptionsFormeIgn): ObjetPlan {
  return Object.assign({
    key: x.cleUnique(opts.cle), type:'polygon' as const, name: nom,
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
}

const identifiant = (id: string | undefined) => (id || '').replace(/[^a-z0-9]+/gi,'-').toLowerCase();

/**
 * Les batiments. « Sur la propriete » et non « sur la parcelle principale » : apres fusion, un
 * batiment pose sur la deuxieme parcelle du terrain est tout autant chez soi et reste modifiable ;
 * celui des voisins est une reference, verrouillee pour ne pas le deplacer par megarde.
 */
function batiments(x: ContexteImport, retenu: (e: ObjetBdTopo) => boolean, parcellesFusionnees: ParcelleCadastrale[]): ObjetPlan[] {
  const iduPropriete = new Set(parcellesFusionnees.map(p=>p.idu));
  return x.importe.batiments.filter(retenu).map(b=>objetBatiment(x, b, [...b.parcelles].some(idu=>iduPropriete.has(idu))));
}

/** Un batiment BD TOPO tel qu'il entre dans le plan ; hors de la propriete, verrouille. */
function objetBatiment(x: ContexteImport, b: ObjetBdTopo, surPrincipale: boolean): ObjetPlan {
  const p = b.props || {};
  const usage = p.usage_1 || p.nature || 'Batiment';
  const pts = b.pts.map(x.dec);
  return formeIgn(x, pts, 'batiment',
    usage + (p.nombre_d_etages ? ' (' + p.nombre_d_etages + ' niv.)' : ''),
    surPrincipale ? '#D9B694' : '#CFC3B4', surPrincipale ? '#7A4A2A' : '#8A7B63', {
      cle: 'bati-' + identifiant(b.id),
      hauteur: hauteurBatiment(p),
      opacite: surPrincipale ? 0.92 : 0.6,
      extra: {
        locked: !surPrincipale,
        // Le toit deduit de la BD TOPO (MD/spec-toit-ign.md) : tout batiment importe en a un.
        toit: toitBdTopo(pts, attributsToitBdTopo(p)),
        bdtopo: {
          couche:'BDTOPO_V3:batiment', id:b.id, cleabs:p.cleabs || null,
          nature:p.nature || null, usage1:p.usage_1 || null, usage2:p.usage_2 || null,
          hauteurM: nombreFr(p.hauteur), hauteurRetenueM: hauteurBatiment(p),
          nombreEtages: nombreFr(p.nombre_d_etages), nombreLogements: nombreFr(p.nombre_de_logements),
          altitudeSolM: nombreFr(p.altitude_minimale_sol), altitudeToitM: nombreFr(p.altitude_minimale_toit),
          altitudeToitMaxM: nombreFr(p.altitude_maximale_toit),
          constructionLegere: String(p.construction_legere) === 'True',
          etat: p.etat_de_l_objet || null, dateApparition: p.date_d_apparition || null,
          identifiantRnb: p.identifiants_rnb || null,
          surParcellePrincipale: surPrincipale,
          recupereLe: x.recupereLe
        }
      }
    });
}

/**
 * Ce que le voisinage prend en plus : verrouille, marque, et sans nom affiche — des centaines de
 * references cadastrales et d'usages de batiments par-dessus le plan le rendaient illisible.
 * L'etiquette reste a portee, par la case « Nom » de l'explorateur.
 */
export const SANS_NOM_VOISINAGE = { locked: true, voisinage: true, showName: false } as const;

/**
 * Le voisinage etendu : les parcelles et le bati du disque qui ne sont pas deja dans le plan,
 * marques « voisinage » et verrouilles, comme un decor de reference.
 */
function voisinageEtendu(x: ContexteImport, deja: ObjetPlan[]): ObjetPlan[] {
  const v = x.importe.voisinageEtendu;
  if(!v) return [];
  const iduPris = new Set(deja.flatMap(o=>{ const idu = o.cadastre?.idu; return typeof idu === 'string' ? [idu] : []; }));
  iduPris.add(x.importe.principale.idu);
  const idsPris = new Set(deja.flatMap(o=>{ const id = (o.bdtopo as { id?: string } | null | undefined)?.id; return id ? [id] : []; }));
  const out: ObjetPlan[] = [];
  v.parcelles.forEach(c=>{
    if(iduPris.has(c.idu)) return;
    iduPris.add(c.idu);
    out.push(Object.assign({
      key: x.cleUnique(('parcelle-' + libelleParcelle(c)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'')),
      type:'polygon' as const, name: libelleParcelle(c),
      fill:'#EFE8D5', fillOpacity:0.45, stroke:'#8A7B63',
      showDims:false,
      cadastre: metaCadastre(x, c, false)
    }, formeCommune(c.pts.map(x.dec)), SANS_NOM_VOISINAGE));
  });
  if(x.importe.importerBatiments) v.batiments.forEach(b=>{
    if(b.id && idsPris.has(b.id)) return;
    if(b.id) idsPris.add(b.id);
    out.push(Object.assign(objetBatiment(x, b, false), SANS_NOM_VOISINAGE));
  });
  return out;
}

function haies(x: ContexteImport, retenu: (e: ObjetBdTopo) => boolean): ObjetPlan[] {
  return x.importe.haies.filter(retenu).map(h=>{
    const p = h.props || {};
    const haut = nombreFr(p.hauteur) || 2;
    return formeIgn(x, h.pts.map(x.dec), 'massif', 'Haie', '#7FA86B', '#3F5C33', {
      cle: 'haie-' + identifiant(h.id),
      hauteur: haut, opacite: 0.8,
      extra: { bdtopo: { couche:'BDTOPO_V3:haie', id:h.id, cleabs:p.cleabs || null,
                         nature:p.nature || 'Haie', hauteurM: nombreFr(p.hauteur), hauteurRetenueM: haut,
                         recupereLe: x.recupereLe } }
    });
  });
}

function vegetation(x: ContexteImport, retenu: (e: ObjetBdTopo) => boolean): ObjetPlan[] {
  return x.importe.vegetation.filter(retenu).map(v=>{
    const p = v.props || {};
    // `props` est un sac de champs BD TOPO non type : `nature` en sort `unknown`, sa vraie forme
    // (chaine, ou absente) est connue de `hauteurVegetation` et de l'usage en nom d'objet ici.
    const nature = p.nature as string | undefined;
    const haut = hauteurVegetation(nature);
    return formeIgn(x, v.pts.map(x.dec), 'massif', nature || 'Vegetation', '#A9BE8E', '#4A6B32', {
      cle: 'vegetation-' + identifiant(v.id),
      hauteur: haut, opacite: 0.55,
      extra: { bdtopo: { couche:'BDTOPO_V3:zone_de_vegetation', id:v.id, cleabs:p.cleabs || null,
                         nature:p.nature || null, hauteurRetenueM: haut, hauteurM: null,
                         recupereLe: x.recupereLe } }
    });
  });
}

/** Des arbres estimes, repartis dans les zones de vegetation : un ordre de grandeur du couvert. */
function arbres(x: ContexteImport, retenu: (e: ObjetBdTopo) => boolean): ObjetPlan[] {
  return x.importe.vegetation.filter(retenu).flatMap(v=>{
    const nature = (v.props && v.props.nature) as string | undefined;
    const haut = hauteurVegetation(nature);
    // Le port et l'essence suivent la nature de la zone : un bois de coniferes donne des cones persistants.
    const { port, essence } = portParNature(nature);
    return arbresEstimes(v.pts, ESPACEMENT_ARBRES_M, MAX_ARBRES_ESTIMES).map((a, i)=>{
      const c2 = x.dec(a);
      return {
        key: x.cleUnique('arbre-' + (v.id || 'veg').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + (i+1)),
        type:'circle' as const, name:'Arbre (estime)',
        fill:'#6E8B4E', fillOpacity:0.7, stroke:'#3F5C33',
        center:{x:c2.x, y:c2.y}, r: 2.5,
        showName:false, showSegNames:false, showVertNames:false, showDims:false, showAngles:false,
        constrained:false, fonction:'arbre', matiere:'', priority:3, locked:false,
        elevation: haut, diametreArbre: 5, portArbre: port, essenceArbre: essence,
        bdtopo: { couche:'estimation', origine: v.id, estime:true, hauteurRetenueM: haut, recupereLe: x.recupereLe }
      };
    });
  });
}

/**
 * Les objets du plan issus d'un import cadastral.
 *
 * Origine (0,0) = le sommet le plus au nord de la parcelle : c'est la convention du plan (X+ = Est,
 * Y+ = Nord), celle qu'annonce le resume de l'onglet Export. Une propriete tient souvent sur
 * plusieurs parcelles : celles marquees « propriete » sont fusionnees en UN objet parcelle (le
 * terrain reel), leurs limites internes gardees a part en pointille. Si la fusion echoue
 * (parcelles non contigues, trou), on ne sort pas un contour faux : la parcelle principale reste
 * seule, et `fusionEchouee` le dit.
 */
export function objetsDepuisCadastre(importe: ImportCadastral): ObjetPlan[] {
  const principale = importe.principale;
  const parcellesPropriete = importe.parcellesPropriete();
  const fusion = parcellesPropriete.length > 1
    ? fusionnerAnneaux(parcellesPropriete.map(p=>p.pts), FUSION_TOL_M)
    : { contour: principale.pts.map(p=>({x:p.x, y:p.y})), limites: [] };
  importe.fusionEchouee = parcellesPropriete.length > 1 && !fusion;
  const ptsFusion = fusion ? fusion.contour : principale.pts;
  const parcellesFusionnees = fusion ? parcellesPropriete : [principale];

  const nord = ptsFusion.reduce<PtBrut | undefined>((n, p)=>(!n || p.y > n.y) ? p : n, undefined);
  if(!nord) throw new Error('Parcelle sans contour : rien a importer.');
  const clesPrises = new Set(['parcelle']);
  const x: ContexteImport = {
    importe, clesPrises,
    dec: (p) => ({ x: Math.round((p.x - nord.x)*1000)/1000, y: Math.round((p.y - nord.y)*1000)/1000 }),
    origineDeg: importe.proj.versDegres(nord.x, nord.y),
    recupereLe: new Date().toISOString(),
    cleUnique: (base) => {
      let cle = base, n = 2;
      while(clesPrises.has(cle)){ cle = base + '-' + n; n++; }
      clesPrises.add(cle);
      return cle;
    }
  };

  // L'ordre compte : chaque morceau reserve ses cles, et le suivant evite celles deja prises.
  const objets: ObjetPlan[] = [
    objetParcelle(x, ptsFusion, nord, parcellesFusionnees),
    ...limitesInternes(x, fusion ? fusion.limites : []),
    ...parcellesVoisines(x, parcellesFusionnees)
  ];
  // BD TOPO : ce qui touche la parcelle principale ou une voisine retenue.
  const parcellesRetenues = new Set([principale.idu].concat(importe.voisinesRetenues().map(c=>c.idu)));
  const retenu = (e: ObjetBdTopo) => [...e.parcelles].some(idu=>parcellesRetenues.has(idu));
  if(importe.importerBatiments) objets.push(...batiments(x, retenu, parcellesFusionnees));
  if(importe.importerHaies) objets.push(...haies(x, retenu));
  if(importe.importerVegetation){
    objets.push(...vegetation(x, retenu));
    if(importe.importerArbres) objets.push(...arbres(x, retenu));
  }
  objets.push(...voisinageEtendu(x, objets));
  // Le zonage PLU se range sur la parcelle : c'est elle qu'il qualifie, et il suit le projet.
  const parcelle = objets[0];
  if(importe.plu && parcelle) parcelle.plu = importe.plu;
  // Le voisinage etendu pose masque : la bascule « Voisinage » le retrouve a l'ouverture.
  if(importe.voisinageEtendu && !importe.voisinageEtendu.visible && parcelle) parcelle.affichage = { ...(parcelle.affichage || {}), voisinage: false };
  return objets;
}

