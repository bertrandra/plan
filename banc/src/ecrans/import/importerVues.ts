// L'import des vues choisies (etape 1b), pour l'ecran Panoramax et pour l'import d'une zone en lot : chaque photo se lit une fois
// (en direct ou par le relais du serveur), chaque vue se tire a son cadre (cadrage.ts), garde le mur qu'elle montre (murVise.ts), et
// passe au brouillon quand le pre-marquage le demande (importMarquage.ts). Une photo en erreur est dite et les autres continuent.

import type { Banc } from '../../App.js';
import { api, ErreurApi, lireImage } from '../../api.js';
import { cadragePourMeta, tirerLaVue } from '../../cadrage.js';
import { vueDuPanoramique } from '../../equirect.js';
import { CADRE_VUE, type Batiment } from '../../facadesVues.js';
import { bitmap, COTE_SOURCE, jpeg, liberer, pixels, reduire, versCanevas, vignette } from '../../images.js';
import { texteDeLImportFait, vueAMarquer, type BilanDuMarquage } from '../../importMarquage.js';
import { murDeVue } from '../../murVise.js';
import { HAUTEUR_LUE, LARGEUR_LUE, lireLaZone, reduireDeMoitie } from '../../vueDegagee.js';
import { CHAMP_VUE, distanceM, type Adresse, type PhotoRue, type VueAExtraire } from '../../panoramax.js';
import type { Parcelle } from '../../parcelles.js';
import type { MetaImage, Modele, MurDeVue } from '../../types.js';
import { proposerLesObjets } from '../brouillon/proposer.js';
import { nomDuLot } from './useImport.js';

/** Le suivi d'un import long (le lot) : ou il en est, et s'il faut s'arreter avant la photo suivante. */
export interface SuiviDeLImport { avance: (fait: number, total: number) => void; arret: () => boolean; /** Une vue ecartee : sa facade est cachee (lue dans l'image). */ cachee?: (photo: string, cap: number) => void }

/** Sans parcelle visee, une photo garde le libelle de l'adresse cherchee si elle en est proche ; plus loin, il ne dirait rien d'elle. */
const PROCHE_DE_L_ADRESSE_M = 300;

export interface Contexte { adresse: Adresse | null; parcelle: Parcelle | null; /** Le batiment lu d'une vue (BD TOPO), pour ecrire son mur dans les metadonnees. */ batiment: (id: string) => Batiment | null; /** Le pre-marquage a l'import (importMarquage.ts) : les modeles actifs, ou null quand il n'est pas demande. */ marquage: Modele[] | null;
  /**
   * Ecarter a l'import les vues dont la facade est cachee (vueDegagee.ts : une haie, des arbres, lus dans l'image) : pour le lot, que
   * personne ne regarde vue par vue. La lecture se fait sur le panoramique ramene a 2 048 px, comme celle de l'ecran.
   */
  ecarterCachees?: boolean }

/** Le mur d'une vue, pour ses metadonnees : rien quand le tri n'a pas dit son batiment (case decochee, BD TOPO en panne). */
function murDeLaVue(ctx: Contexte, p: PhotoRue, v: VueAExtraire): { mur?: MurDeVue } {
  const b = v.batiment ? ctx.batiment(v.batiment) : null;
  return b && typeof v.cote === 'number' ? { mur: murDeVue(b, p, { cap: v.cap, cote: v.cote, note: v.note, distanceFacade: v.distanceFacade }, p.panoramique ? CHAMP_VUE : Math.min(120, p.champ)) } : {};
}

/** La facade de la vue est-elle cachee : la lecture de l'ecran d'import (lecturesVues.ts), au cadre sur lequel ses seuils sont cales. */
function facadeCachee(reduit: ReturnType<typeof pixels>, p: PhotoRue, v: VueAExtraire): boolean {
  if (!v.zone) return false;
  const vue = reduireDeMoitie(vueDuPanoramique(reduit, { capCentre: p.azimut ?? 0, cap: v.cap, tangage: CADRE_VUE.tangage, champ: CADRE_VUE.champ, largeur: 2 * LARGEUR_LUE, hauteur: 2 * HAUTEUR_LUE }));
  return lireLaZone(vue, v.zone).cachee;
}

/**
 * Le pre-marquage d'une vue rendue face au mur (demande du proprietaire, 15 novembre 2026) : elle est deja de face, on l'enregistre
 * telle quelle comme redressee (methode « import »), puis les modeles actifs y proposent des objets « auto » : elle passe au brouillon,
 * comme apres l'etape 3. Un echec laisse la vue importee, a redresser comme les autres.
 */
async function marquerLaVue(banc: Banc, m: MetaImage, c: HTMLCanvasElement, image: Blob, vig: Blob, actifs: readonly Modele[], bilan: BilanDuMarquage): Promise<void> {
  try {
    await api.redressee(m.id, image, vig, { methode: 'import', note: 'Rendue face au mur à l’import, passée telle quelle' });
    const objets = await proposerLesObjets(c, actifs, banc.classes, false);
    await api.ecrireAnnotation(m.id, { objets, par: 'auto' });
    bilan.marquees++; bilan.objets += objets.length;
  } catch (e) {
    bilan.echecs++;
    banc.dire(`Brouillon de ${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur');
  }
}

/** Importe les vues des photos choisies (une ou deux par panoramique) ; rend le nombre de vues importees. */
export async function importerVues(banc: Banc, photos: readonly PhotoRue[], vuesDe: (p: PhotoRue) => VueAExtraire[], ctx: Contexte, dire: (t: string) => void, suivi?: SuiviDeLImport): Promise<number> {
  const lot = nomDuLot('panoramax');
  let ok = 0, n = 0;
  const bilan: BilanDuMarquage | null = ctx.marquage ? { marquees: 0, objets: 0, echecs: 0 } : null;
  for (const p of photos) {
    // L'import en lot s'arrete entre deux photos : ce qui est importe le reste.
    if (suivi?.arret()) break;
    suivi?.avance(n, photos.length);
    dire(`Import ${++n} sur ${photos.length}…`);
    // L'adresse et la parcelle d'aujourd'hui quand on les connait ; sans parcelle visee, l'adresse ne vaut que pour les photos prises pres d'elle.
    const adresse = ctx.adresse && (ctx.parcelle || distanceM(p, ctx.adresse) <= PROCHE_DE_L_ADRESSE_M) ? ctx.adresse.libelle : null;
    try {
      // En direct pour un hote liste, par le relais du serveur sinon : en erreur, la raison que le serveur donne.
      const b = await bitmap(await lireImage(p.hd));
      // Le panoramique se lit une fois pour toutes ses vues ; 75 degres de champ, un peu vers le haut, comme on vise une facade.
      // 6000 px de large au plus, et PIXELS_MAX au plus (Safari laisse vide un canevas plus grand : 5650 x 2825).
      let pano: ReturnType<typeof pixels> | null = null;
      if (p.panoramique) { const cp = reduire(b, 6000); try { pano = pixels(cp); } finally { liberer(cp); } }
      let reduit: ReturnType<typeof pixels> | null = null;
      if (pano && ctx.ecarterCachees) { const cr = reduire(b, 2048); try { reduit = pixels(cr); } finally { liberer(cr); } }
      for (const v of vuesDe(p)) {
        if (reduit && v.zone && facadeCachee(reduit, p, v)) { suivi?.cachee?.(p.id, v.cap); continue; }
        // Le cadre de la vue est celui que l'apercu et la carte ont montre (cadrage.ts) : sur sa facade, ou face au mur.
        const c = pano ? versCanevas(tirerLaVue(pano, p.azimut ?? 0, v.cap, v.cadre, 1600, 1200)) : reduire(b, COTE_SOURCE);
        try {
          const image = await jpeg(c, 0.92), vig = await vignette(c);
          const m = await api.importer(image, vig, {
            source: 'panoramax', nom: 'panoramax-' + p.id.slice(0, 8) + (v.vue === 'gauche' || v.vue === 'droite' ? '-' + v.vue : v.vue === 'choisie' ? '-' + Math.round(v.cap) : ''), date: p.date, lat: p.lat, lon: p.lon, azimut: v.cap,
            panoramax: { id: p.id, collection: p.collection, panoramique: p.panoramique, cap: v.cap, vue: v.vue }, auteur: p.auteur, licence: p.licence,
            adresse, parcelle: ctx.parcelle?.idu ?? null, lot,
            // Le mur que la vue montre (demande du proprietaire, 15 novembre 2026) : de quoi ne pas le reimporter et le regrouper ensuite.
            ...murDeLaVue(ctx, p, v), ...(pano ? cadragePourMeta(v.cadre) : {}),
          });
          ok++;
          if (bilan && ctx.marquage && vueAMarquer(true, v.cadre)) await marquerLaVue(banc, m, c, image, vig, ctx.marquage, bilan);
        } catch (e) {
          if (!(e instanceof ErreurApi && e.statut === 409)) throw e;
        } finally { liberer(c); }
      }
      b.close();
    } catch (e) {
      banc.dire(`Photo ${p.id.slice(0, 8)} : ${(e as Error).message}`, 'erreur');
    }
  }
  suivi?.avance(n, photos.length);
  dire(texteDeLImportFait(ok, lot, bilan));
  return ok;
}

