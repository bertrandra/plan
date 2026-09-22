// Fond orthophoto (spec §3.2, render/).
//
// Une photo aerienne de l'IGN posee sous le plan, en tuiles WMTS. Le raccord entre le repere du
// plan (metres, origine au sommet nord de la parcelle) et celui du monde (longitude/latitude) se
// fait par un point de calage : l'origine reelle enregistree par l'import cadastre. Sans import
// cadastre, on retombe sur le lieu de la parcelle, cale sur son centroide - moins precis, mais
// coherent avec ce que l'application sait du terrain.
//
// Les reglages se rangent sur la parcelle, comme la cloture : ils suivent donc le projet
// enregistre sans nouvelle cle a faire transiter. Les tuiles, elles, ne sont jamais enregistrees -
// elles se retelechargent.

import { elOpt } from '../shell/dom.js';
import { showToast } from '../shell/dialogs.js';
import { svgNS } from './svg.js';
import { centroid } from '../geometry/basic.js';
import { projecteurLocal, tuileX, tuileY, lonDeTuile, latDeTuile } from '../geo/projection.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import type { Lieu } from '../model/lieu.js';

/** Ce que le fond orthophoto demande à l'application — la parcelle, le lieu, la vue. */
export interface ContexteOrtho {
  /** La parcelle qui porte les réglages du fond, ou `undefined` s'il n'y en a pas. */
  trouverParcelleCloture: () => ObjetPlan | undefined;
  lieuActuel: () => Lieu;
  markDirty: () => void;
  render: () => void;
  toScreen: (p: PtBrut) => PtEcran;
  orthoGroup: () => SVGElement;
  etat: EtatApp;
}

/**
 * Une tuile, en coordonnees monde (metres). `dataUri` reste `string | null` pendant le
 * chargement — `chargerOrthophoto` ne garde que celles ou il a fini par se poser — et `z`/`x`/`y`
 * ne servent qu'a ce calcul : `placerOrthophoto`, qui affiche les tuiles retenues, ne les lit pas.
 */
export interface TuileOrtho {
  z: number;
  x: number;
  y: number;
  dataUri: string | null;
  xMin: number;
  yMin: number;
  largeur: number;
  hauteur: number;
  el?: SVGImageElement | null;
}

/** Etat du fond : partage entre le calcul des tuiles, le rendu du plan et la Vue 3D. */
export const ortho: {
  actif: boolean;
  opacite: number;
  parcelleOpacite: number;
  /** Tuiles pretes a afficher, en coordonnees monde (metres). */
  tuiles: TuileOrtho[];
  chargement: boolean;
  /** Cle « z/x/y » -> data URI. Une tuile ne se retelecharge pas d'un zoom a l'autre. */
  cache: Map<string, string>;
} = {
  actif: false,
  opacite: 0.85,
  parcelleOpacite: 0.15,
  tuiles: [],
  chargement: false,
  cache: new Map<string, string>()
};
const WMTS_URL = 'https://data.geopf.fr/wmts';
const ORTHO_COUCHE = 'ORTHOIMAGERY.ORTHOPHOTOS';
const ORTHO_ZOOM_MAX = 20;
const ORTHO_MAX_TUILES = 36;
// Valeur proposee par defaut pour la transparence du terrain sous le fond : assez de teinte pour
// que la parcelle reste identifiable, assez peu pour lire la photo dessous. Reglable, mais c'est
// le compromis qui marche sur une orthophoto a 20 cm/pixel - en dessous de 10 % la parcelle
// disparait, au-dela de 30 % la photo devient laiteuse.
const ORTHO_PARCELLE_OPACITE_CONSEILLEE = 0.15;

/** La config du fond, une fois que `configOrtho` a comblé ses trois champs. */
interface ConfigOrthoComplete { actif: boolean; opacite: number; parcelleOpacite: number }

/**
 * La config enregistrée sur la parcelle, complétée à défaut manquant.
 *
 * `creer` distingue lire de créer : `enregistrerConfigOrtho` doit savoir si un projet a *déjà* un
 * réglage avant d'écrire dedans, sans en fabriquer un pour la seule occasion de vérifier.
 */
export function configOrtho(creer: boolean, ctx: ContexteOrtho): ConfigOrthoComplete | null {
  const p = ctx.trouverParcelleCloture();
  if(!p) return null;
  if(!p.ortho || typeof p.ortho !== 'object'){
    if(!creer) return null;
    p.ortho = {};
  }
  if(p.ortho.opacite === undefined || p.ortho.opacite === null) p.ortho.opacite = 0.85;
  if(p.ortho.parcelleOpacite === undefined || p.ortho.parcelleOpacite === null) p.ortho.parcelleOpacite = ORTHO_PARCELLE_OPACITE_CONSEILLEE;
  if(p.ortho.actif === undefined) p.ortho.actif = false;
  // Les trois champs viennent d'etre combles : le type ne le sait pas encore (ils restent
  // facultatifs sur ObjetPlan), c'est ce que ce cast affirme.
  return p.ortho as ConfigOrthoComplete;
}
export function enregistrerConfigOrtho(ctx: ContexteOrtho): void {
  // Un projet qui n'a jamais touche au fond ne gagne pas le champ pour rien, et surtout : la
  // restauration au chargement repasse par ici avec exactement les valeurs enregistrees. Sans
  // cette comparaison, tout projet avec un fond actif s'ouvrirait en "modifications non
  // enregistrees" alors que rien n'a change.
  const existante = configOrtho(false, ctx);
  const auxDefauts = !ortho.actif && ortho.opacite === 0.85 && ortho.parcelleOpacite === ORTHO_PARCELLE_OPACITE_CONSEILLEE;
  if(!existante && auxDefauts) return;
  const c = configOrtho(true, ctx);
  if(!c) return;   // pas de parcelle : rien ou ranger le reglage, il reste valable pour la session
  if(c.actif === ortho.actif && c.opacite === ortho.opacite && c.parcelleOpacite === ortho.parcelleOpacite) return;
  c.actif = ortho.actif;
  c.opacite = ortho.opacite;
  c.parcelleOpacite = ortho.parcelleOpacite;
  ctx.markDirty();
}
export function syncControlesOrtho(){
  const o = elOpt<HTMLInputElement>('orthoOpacite');
  if(o) o.value = String(Math.round(ortho.opacite*100));
  const ot = document.getElementById('orthoOpaciteTexte');
  if(ot) ot.textContent = Math.round(ortho.opacite*100) + ' %';
  const p = elOpt<HTMLInputElement>('orthoParcelleOpacite');
  if(p) p.value = String(Math.round(ortho.parcelleOpacite*100));
  const pt = document.getElementById('orthoParcelleOpaciteTexte');
  if(pt) pt.textContent = Math.round(ortho.parcelleOpacite*100) + ' %';
  const cb = elOpt<HTMLInputElement>('chkOrtho');
  if(cb) cb.checked = ortho.actif;
}
// Au chargement d'un projet : on restitue les reglages, et on rallume le fond s'il etait actif.
export function restaurerOrthoDuProjet(ctx: ContexteOrtho): void {
  const c = configOrtho(false, ctx);
  if(!c){
    // Projet sans reglage enregistre : on eteint proprement plutot que de garder le fond du
    // projet precedent, qui serait cale sur une autre parcelle.
    if(ortho.actif) void basculerOrthophoto(false, ctx);
    return;
  }
  ortho.opacite = c.opacite;
  ortho.parcelleOpacite = c.parcelleOpacite;
  syncControlesOrtho();
  if(c.actif) void basculerOrthophoto(true, ctx);
  else if(ortho.actif) void basculerOrthophoto(false, ctx);
}

/** Le repere qui recale le fond sur le plan : un point commun aux deux systemes de coordonnees. */
interface ReferenceGeo {
  lat: number;
  lon: number;
  /** Ce point, en coordonnees du plan (metres) — le calage cadastral vaut toujours (0, 0). */
  x: number;
  y: number;
  /** Calage cadastral (import reel), ou repli sur le lieu declare de la parcelle. */
  exact: boolean;
}

export function referenceGeoPlan(ctx: ContexteOrtho): ReferenceGeo | null {
  const p = ctx.trouverParcelleCloture();
  if(!p || !aDesSommets(p) || !p.pts.length) return null;
  if(p.cadastre && p.cadastre.origineLat !== undefined && p.cadastre.origineLat !== null){
    return { lat:p.cadastre.origineLat, lon:p.cadastre.origineLon as number, x:0, y:0, exact:true };
  }
  // ctx.lieuActuel() plutot que p.latitude en direct : sur un plan qui n'a jamais servi au soleil ni
  // a la 3D, les champs de lieu ne sont pas encore poses sur la parcelle (ils le sont au premier
  // acces). Les lire crus renverrait "pas de position" sur un plan qui en a pourtant une.
  const lieu = ctx.lieuActuel();
  if(lieu && Number.isFinite(lieu.latitude)){
    const c = centroid(p.pts);
    return { lat:lieu.latitude, lon:lieu.longitude, x:c.x, y:c.y, exact:false };
  }
  return null;
}
export function urlTuileOrtho(z: number, x: number, y: number): string {
  return WMTS_URL + '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + ORTHO_COUCHE +
    '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
}
// Les tuiles sont recuperees en fetch puis converties en data URI, jamais posees en href
// distant : une image d'un autre domaine "salit" le canevas (canvas tainted) et ferait echouer
// l'export PNG - et l'export SVG ne serait plus autonome.
export async function chargerTuileOrtho(z: number, x: number, y: number): Promise<string> {
  const cle = z + '/' + x + '/' + y;
  if(ortho.cache.has(cle)) return ortho.cache.get(cle)!;
  const r = await fetch(urlTuileOrtho(z, x, y), {cache:'force-cache'});
  if(!r.ok) throw new Error('tuile ' + cle + ' : HTTP ' + r.status);
  const blob = await r.blob();
  const dataUri = await new Promise<string>((resolve, reject)=>{
    const fr = new FileReader();
      // readAsDataURL rend toujours une chaine ; le type large de result couvre aussi le binaire.
      fr.onload = ()=>resolve(String(fr.result));
    fr.onerror = ()=>reject(new Error('lecture de la tuile impossible'));
    fr.readAsDataURL(blob);
  });
  ortho.cache.set(cle, dataUri);
  return dataUri;
}
/** Ce que rend un chargement reussi : le niveau de detail retenu, et sa fiabilite. */
interface ResultatChargementOrtho { z: number; nb: number; total: number; exact: boolean }

export async function chargerOrthophoto(ctx: ContexteOrtho): Promise<ResultatChargementOrtho> {
  const ref = referenceGeoPlan(ctx);
  if(!ref) throw new Error('aucune parcelle geolocalisee : importe une parcelle depuis une adresse, ou renseigne le lieu.');
  const proj = projecteurLocal(ref.lat, ref.lon);
  // Emprise a couvrir : celle du plan entier, avec une marge - le fond doit tenir sous les objets
  // qui debordent de la parcelle (batiments mitoyens, chemins).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  ctx.etat.objects.forEach(o=>{
    const pts: PtBrut[] = o.type === 'circle'
      ? [{x:o.center.x-(o.r||0), y:o.center.y-(o.r||0)}, {x:o.center.x+(o.r||0), y:o.center.y+(o.r||0)}]
      : (o.pts || []);
    pts.forEach(p=>{
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  });
  if(!Number.isFinite(minX)) throw new Error('plan vide');
  const marge = Math.max(5, (maxX-minX + maxY-minY)*0.05);
  minX -= marge; maxX += marge; minY -= marge; maxY += marge;
  const versLonLat = (x: number, y: number) => proj.versDegres(x - ref.x, y - ref.y);
  const coinSO = versLonLat(minX, minY), coinNE = versLonLat(maxX, maxY);

  // On part du plus haut niveau de detail qui tienne en ORTHO_MAX_TUILES, puis on redescend tant
  // que rien ne revient : la couverture de l'orthophoto ne va pas au meme zoom partout (verifie :
  // sur cette commune le niveau 20 repond 404 alors que le 19 sert bien l'image). Un niveau qui
  // n'existe pas se traduit par un 404 sur toutes ses tuiles, jamais par une erreur explicite.
  for(let z = ORTHO_ZOOM_MAX; z >= 15; z--){
    const x0 = tuileX(coinSO.lon, z), x1 = tuileX(coinNE.lon, z);
    const y0 = tuileY(coinNE.lat, z), y1 = tuileY(coinSO.lat, z);   // y croit vers le sud
    if((x1-x0+1)*(y1-y0+1) > ORTHO_MAX_TUILES) continue;
    // Une seule tuile d'essai avant de lancer les autres : un niveau absent repond 404 sur
    // chacune de ses tuiles, et seize 404 dans la console pour rien noieraient les vraies erreurs.
    try {
      await chargerTuileOrtho(z, Math.floor((x0+x1)/2), Math.floor((y0+y1)/2));
    } catch {
      continue;
    }
    const tuiles: TuileOrtho[] = [];
    const promesses: Promise<void>[] = [];
    for(let x = x0; x <= x1; x++){
      for(let y = y0; y <= y1; y++){
        const lonO = lonDeTuile(x, z), lonE = lonDeTuile(x+1, z);
        const latN = latDeTuile(y, z), latS = latDeTuile(y+1, z);
        const so = proj.versMetres(lonO, latS), ne = proj.versMetres(lonE, latN);
        const t: TuileOrtho = {
          z, x, y, dataUri:null,
          // repere du plan : on annule le decalage du point de calage
          xMin: so.x + ref.x, yMin: so.y + ref.y,
          largeur: ne.x - so.x, hauteur: ne.y - so.y
        };
        tuiles.push(t);
        promesses.push(chargerTuileOrtho(z, x, y).then(u=>{ t.dataUri = u; }).catch(()=>{ t.dataUri = null; }));
      }
    }
    await Promise.all(promesses);
    const reussies = tuiles.filter(t=>t.dataUri);
    if(reussies.length){
      ortho.tuiles = reussies;
      return { z, nb: reussies.length, total: tuiles.length, exact: ref.exact };
    }
  }
  throw new Error('aucune tuile disponible sur ce secteur (service WMTS injoignable, ou hors couverture)');
}
export function placerOrthophoto(ctx: ContexteOrtho): void {
  if(!ortho.actif || !ortho.tuiles.length){
    if(ctx.orthoGroup().childNodes.length) ctx.orthoGroup().innerHTML = '';
    return;
  }
  if(ctx.orthoGroup().childNodes.length !== ortho.tuiles.length){
    ctx.orthoGroup().innerHTML = '';
    ortho.tuiles.forEach(t=>{
      const img = document.createElementNS(svgNS, 'image');
      // `ortho.tuiles` ne recoit que les tuiles retenues par `chargerOrthophoto`, donc chargees.
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', t.dataUri!);
      img.setAttribute('href', t.dataUri!);
      img.setAttribute('preserveAspectRatio', 'none');
      t.el = img;
      ctx.orthoGroup().appendChild(img);
    });
  }
  ctx.orthoGroup().setAttribute('opacity', String(ortho.opacite));
  ortho.tuiles.forEach(t=>{
    if(!t.el) return;
    const coin = ctx.toScreen({ x:t.xMin, y:t.yMin + t.hauteur });   // coin haut-gauche a l'ecran
    t.el.setAttribute('x', String(coin.x));
    t.el.setAttribute('y', String(coin.y));
    t.el.setAttribute('width', String(Math.max(1, t.largeur*ctx.etat.scene.scale)));
    t.el.setAttribute('height', String(Math.max(1, t.hauteur*ctx.etat.scene.scale)));
  });
}
export async function basculerOrthophoto(actif: boolean, ctx: ContexteOrtho): Promise<void> {
  ortho.actif = actif;
  const cbHaut = elOpt<HTMLInputElement>('chkOrtho');
  if(cbHaut) cbHaut.checked = actif;
  if(!actif){ ctx.render(); enregistrerConfigOrtho(ctx); return; }
  if(ortho.tuiles.length){ ctx.render(); enregistrerConfigOrtho(ctx); return; }
  ortho.chargement = true;
  const cb = elOpt<HTMLInputElement>('chkOrtho');
  if(cb) cb.disabled = true;
  try {
    const r = await chargerOrthophoto(ctx);
    ctx.render();
    enregistrerConfigOrtho(ctx);
    showToast('Orthophoto IGN : ' + r.nb + ' tuile(s) au niveau ' + r.z +
      (r.exact ? '.' : ' — calage approximatif (plan sans import cadastre : le fond est posé sur le lieu déclaré de la parcelle).'));
  } catch(e){
    ortho.actif = false;
    if(cb) cb.checked = false;
    showToast('Orthophoto indisponible : ' + ((e as Error).message || e));
  } finally {
    ortho.chargement = false;
    if(cb) cb.disabled = false;
  }
}

