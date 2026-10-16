// Les entrees de l'analyse par Claude (MD/spec-audit.md §13.2, MD/spec-regles-toits.md §14.1,
// lot L17) : pour chaque batiment photographie, la partie propre a la maison de la requete,
// images d'abord, chacune avec son etiquette, puis le texte (indices LiDAR chiffres, modele actuel
// en JSON compact, mesures du telephone, « Ce que je vois »).
//
// Les images : les photos de chaque facade reduites a 1 024 px, le rendu du modele depuis la meme
// prise de vue (Vue 3D hors ecran), les photos du toit, l'orthophoto recadree et la carte des
// hauteurs LiDAR. Celui qui dessine est injecte (`FabriqueImages`) : ce module ne touche ni au
// canevas ni a la scene, et se teste sans navigateur.
//
// Les trois passes recoivent exactement le meme contenu : c'est ce qui rend le vote honnete, et ce
// qui laisse le cache du prompt faire son travail (la partie fixe est au serveur).

import { contourCompact, indicesLidar, PASSES_ANALYSE, type IndicesLidar } from '../../../model/analyseClaude.js';
import { couleurMursRetenue, textureDesMurs } from '../../../model/couleurMur.js';
import { hauteurDe } from '../../../regles/decisions.js';
import { resumePartie, partieVue } from '../../../model/ceQueJeVois.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { etiquetteFacade, hauteurHautDeFacade } from './liste.js';
import type { BlocAnalyse, DemandeAnalyse, RequeteAnalyse } from '../../../io/analyseClaude.js';
import type { BatchAnalyse, EtiquetteImage } from '../../../model/auditParcelle.js';
import { requetesRenfortDuBatiment, type FabriqueImagesRenfortAudit } from './entreesRenfort.js';
import type { PhotoCas, PrisePhoto } from '../../../model/audit.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';
import type { CibleFacadeRendu } from '../../../three/renduPrise.js';

export interface ImagePreparee { base64: string; mediaType: 'image/jpeg' | 'image/png' }

/** Qui dessine les images : le navigateur (render/imagesAnalyse.ts, three/renduPrise.ts), ou un simulacre dans les tests. */
export interface FabriqueImages {
  /** La photo reduite a 1 024 px ; null si elle ne se lit pas. */
  photo(p: PhotoCas): Promise<ImagePreparee | null>;
  /**
   * Le rendu du modele depuis cette prise ; null sans Vue 3D ou sans azimut. Avec `cible`, la facade
   * visee entiere, du pied du mur au haut du pignon ou du pan (three/renduPrise.ts) ; sans elle, la
   * prise telle quelle. `gardes` : les objets que le rendu montre (les batiments de la parcelle et le
   * sol) ; tout le reste, clotures et arbres compris, en est retire le temps de l'image.
   */
  rendu(prise: PrisePhoto, cible?: CibleFacadeRendu, gardes?: (cle: string) => boolean): ImagePreparee | null;
  /** L'orthophoto recadree sur le contour ; null sans tuile. */
  ortho(contour: readonly PtBrut[]): Promise<ImagePreparee | null>;
  /** La carte des hauteurs LiDAR ; null sans mesure. */
  carte(o: ObjetPlan, contour: readonly PtBrut[]): ImagePreparee | null;
  /** Les images du renfort des facades (lot L18) ; absentes, le batch ne porte que l'analyse des maisons. */
  renfort?: FabriqueImagesRenfortAudit;
}

/** Ce qu'il faut pour un batiment : la requete (une par passe), le nombre de facades et les etiquettes des images. */
export interface EntreeBatiment {
  cle: string;
  facades: number;
  /** Les rendus du modele joints, et les photos de facade dont la prise permettait d'en joindre un. */
  rendus: number;
  rendusPossibles: number;
  etiquettes: EtiquetteImage[];
  contenu: BlocAnalyse[];
}

/** « prise à 12 m, vers 245° » : ce que la prise de vue dit, quand elle le dit. */
export function textePrise(p: PrisePhoto | undefined, distanceM: number | null): string {
  const bouts: string[] = [];
  if (distanceM !== null && distanceM > 0) bouts.push('prise à ' + Math.round(distanceM) + ' m');
  if (p?.azimutDeg !== null && p?.azimutDeg !== undefined) bouts.push('vers ' + Math.round(p.azimutDeg) + '°');
  if (typeof p?.inclinaisonDeg === 'number' && Math.abs(p.inclinaisonDeg) >= 5) bouts.push('inclinée de ' + Math.round(p.inclinaisonDeg) + '°');
  return bouts.length ? ', ' + bouts.join(', ') : '';
}

/** La distance de la prise au mur, perpendiculairement (comme mesures.ts), ou null sans position. */
function distanceAuMur(f: { gauche: PtBrut; droite: PtBrut }, p: PrisePhoto | undefined): number | null {
  if (!p) return null;
  const dx = f.droite.x - f.gauche.x, dy = f.droite.y - f.gauche.y;
  const l = Math.hypot(dx, dy);
  if (!(l > 0)) return null;
  return Math.abs(dx * (p.y - f.gauche.y) - dy * (p.x - f.gauche.x)) / l;
}

/** Le modele actuel du batiment, compact : ce que Claude compare a son observation. */
export function modeleCompact(o: ObjetPlan, b: LigneBatiment): Record<string, unknown> {
  const corps = (o.corpsToit ?? []).map((c) => ({
    pts: contourCompact(c.pts), faitageM: c.faitage, egoutsM: c.egouts, posFaitageM: Math.round(c.posFaitage * 10) / 10,
    ...(c.croupes ? { croupesM: c.croupes } : {}), pignons: c.pignons.length,
    ...(c.cheminees?.length ? { cheminees: c.cheminees.map((ch) => ({ position: ch.position, ...(ch.materiau ? { materiau: ch.materiau } : {}) })) } : {}),
    ...(c.terrasse ? { terrasse: { accessible: c.terrasse.accessible ?? null, acrotereM: c.terrasse.acrotereM ?? 0, edicules: c.terrasse.edicules?.length ?? 0 } } : {}),
  }));
  return {
    nom: b.nom, contour: 'pts' in o && o.pts ? contourCompact(o.pts) : [], hauteurEgoutM: Math.round(hauteurDe(o) * 100) / 100,
    toit: o.toit ? { forme: o.toit.forme, ...(o.toit.couverture ? { couverture: o.toit.couverture } : {}) } : null,
    corps,
    murs: { materiau: textureDesMurs(o) ?? null, couleur: couleurMursRetenue(o)?.couleur ?? null },
    facades: b.facades.map((f) => ({ etiquette: etiquetteFacade(b, f), largeurM: Math.round(f.facade.largeur * 10) / 10, ouverturesRelevees: (o.facades ?? []).find((r) => r.cote === f.cote)?.ouvertures.length ?? null })),
  };
}

/** Ce que le telephone a mesure sur chaque facade (§13.1) : des indices pour Claude, pas des conclusions. */
export function mesuresCompactes(b: LigneBatiment, e: EntreesPropositions): Record<string, unknown>[] {
  return b.facades.flatMap((f) => {
    const m = e.mesures.get(cleMesure(b.cle, f.cote));
    if (!m) return [];
    return [{
      facade: etiquetteFacade(b, f),
      ouverturesDetectees: m.releve?.ouvertures.length ?? null,
      coinsTrouves: m.coinsTrouves,
      ...(m.hauteurM !== null ? { hauteurEgoutMesureeM: m.hauteurM } : {}),
      ...(m.couleur ? { couleurLue: m.couleur.couleur } : {}),
    }];
  });
}

/** « Ce que je vois », en clair, partie par partie ; vide si rien n'a ete note. */
export function observationsEnClair(e: EntreesPropositions, cle: string): string[] {
  const vu = e.capture.batiments[cle]?.vu;
  if (!vu) return [];
  const parties = (['toit', 'cheminees', 'terrasse'] as const).filter((p) => partieVue(vu, p)).map((p) => resumePartie(vu, p));
  // Les materiaux comptent des qu'un des deux est note : le mur seul, ou la couverture seule, est deja une observation.
  if (vu.murs !== undefined || vu.couverture !== undefined) parties.push(resumePartie(vu, 'materiaux'));
  return parties;
}

function image(img: ImagePreparee, texte: string, etiquettes: EtiquetteImage[], contenu: BlocAnalyse[], photo?: EtiquetteImage['photo']): void {
  etiquettes.push({ texte, ...(photo ? { photo } : {}) });
  contenu.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
  contenu.push({ type: 'text', text: 'Image ' + etiquettes.length + ' : ' + texte + '.' });
}

/**
 * Les images d'une requete au plus : le serveur refuse toute la demande au-dela
 * (`IMAGES_PAR_REQUETE` de deploy/analyse.php et de buildsg/analyseAdmin.mjs, 40) ; une maison bien
 * photographiee y arrive vite, chaque photo prise a la boussole partant avec le rendu de son point de
 * vue. Un test tient cette valeur egale a celle des deux serveurs.
 */
export const IMAGES_PAR_REQUETE = 40;

/** Une photo vaut d'autant plus qu'elle dit d'ou elle a ete prise : la boussole, puis la position. */
const valeurPhoto = (p: PhotoCas): number => (p.prise ? 2 : 0) + (p.prise?.sourceAzimut === 'boussole' ? 1 : 0);

/**
 * Ce que le rendu pour Claude montre : les terrains, a plat, et le batiment vise (`seulement`) ou, a
 * defaut, ceux de la liste (la parcelle du projet). Ni clotures, ni arbres, ni maisons voisines, et
 * avec `seulement` ni les autres batiments de la parcelle : une annexe devant le mur le cacherait.
 */
export function gardesDuRendu(e: EntreesPropositions, seulement?: string): (cle: string) => boolean {
  const cles = new Set([...(seulement ? [seulement] : e.liste.batiments.map((b) => b.cle)), ...e.objets.filter((o) => o.key === 'parcelle' || o.fonction === 'terrain').map((o) => o.key)]);
  return (cle) => cles.has(cle);
}

/** Une photo candidate, avec sa place dans l'ordre d'envoi et ce qu'on en a retenu. */
interface Candidate {
  p: PhotoCas;
  ordre: number;
  texte: string;
  photo: NonNullable<EtiquetteImage['photo']>;
  img: ImagePreparee | null;
  rendu: ImagePreparee | null;
}

/**
 * Les photos d'un batiment par groupe (chaque facade, puis le toit), chacune rangee de la meilleure
 * a la moins bonne. L'ordre d'envoi reste celui de la capture.
 */
function groupesDePhotos(b: LigneBatiment, e: EntreesPropositions): { groupes: Candidate[][]; facades: number } {
  const bat = e.capture.batiments[b.cle];
  const groupes: Candidate[][] = [];
  let ordre = 0, facades = 0;
  for (const f of b.facades) {
    const photos = bat?.facades[String(f.cote)]?.photos ?? [];
    if (!photos.length) continue;
    facades++;
    const nom = 'façade ' + etiquetteFacade(b, f) + ' de ' + b.nom;
    groupes.push(photos.map((p, rang) => ({ p, ordre: ordre++, texte: 'photo de la ' + nom + textePrise(p.prise, distanceAuMur(f.facade, p.prise)), photo: { cle: b.cle, cote: f.cote, rang }, img: null, rendu: null })));
  }
  const toit = bat?.photos ?? [];
  if (toit.length) groupes.push(toit.map((p, rang) => ({ p, ordre: ordre++, texte: 'photo du toit de ' + b.nom + textePrise(p.prise, null), photo: { cle: b.cle, rang }, img: null, rendu: null })));
  for (const g of groupes) g.sort((a, z) => valeurPhoto(z.p) - valeurPhoto(a.p) || a.ordre - z.ordre);
  return { groupes, facades };
}

/**
 * Les images d'un batiment, `max` au plus, dans l'ordre : facades (photo, puis rendu), toit,
 * orthophoto, carte LiDAR. Quand tout ne tient pas, on garde d'abord la vue du dessus et le relief
 * (une image chacune, et tout le toit), puis la meilleure photo de chaque facade et du toit, puis
 * leur rendu, puis les autres photos tour a tour, et leurs rendus en dernier.
 */
async function imagesDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, fab: FabriqueImages, max = IMAGES_PAR_REQUETE): Promise<{ etiquettes: EtiquetteImage[]; contenu: BlocAnalyse[]; facades: number; rendus: number; rendusPossibles: number }> {
  let place = max;
  const contour = 'pts' in o && o.pts ? o.pts : [];
  let ortho: ImagePreparee | null = null, carte: ImagePreparee | null = null;
  if (contour.length >= 3) {
    if (place > 0) { ortho = await fab.ortho(contour); if (ortho) place--; }
    if (place > 0) { carte = fab.carte(o, contour); if (carte) place--; }
  }
  const { groupes, facades } = groupesDePhotos(b, e);
  const prendrePhoto = async (c: Candidate) => { if (place > 0) { c.img = await fab.photo(c.p); if (c.img) place--; } };
  const prendreRendu = (c: Candidate) => {
    // Le rendu ne double que les photos de facade, comme avant le plafond : c'est elles que Claude compare au modele.
    if (place <= 0 || !c.img || c.photo.cote === undefined || !c.p.prise || c.p.prise.azimutDeg === null) return;
    // Le rendu est l'elevation de la facade visee (de face, entiere, seule), pas ce que le telephone en cadrait.
    const ligne = b.facades.find((f) => f.cote === c.photo.cote);
    const cible: CibleFacadeRendu | undefined = ligne
      ? { gauche: ligne.facade.gauche, droite: ligne.facade.droite, hautM: hauteurHautDeFacade(o, ligne.facade, ligne.hauteurMur) }
      : undefined;
    c.rendu = fab.rendu(c.p.prise, cible, gardesDuRendu(e, cible ? b.cle : undefined));
    if (c.rendu) place--;
  };
  const premieres = groupes.flatMap((g) => g.slice(0, 1));
  const autres: Candidate[] = [];
  for (let k = 1; k < Math.max(0, ...groupes.map((g) => g.length)); k++) for (const g of groupes) { const c = g[k]; if (c) autres.push(c); }
  for (const c of premieres) await prendrePhoto(c);
  for (const c of premieres) prendreRendu(c);
  for (const c of autres) await prendrePhoto(c);
  for (const c of autres) prendreRendu(c);

  const etiquettes: EtiquetteImage[] = [];
  const contenu: BlocAnalyse[] = [];
  const envoyees = groupes.flat().filter((c) => c.img);
  const rendusPossibles = envoyees.filter((c) => c.photo.cote !== undefined && c.p.prise && c.p.prise.azimutDeg !== null).length;
  const rendus = envoyees.filter((c) => c.rendu).length;
  for (const c of groupes.flat().sort((a, z) => a.ordre - z.ordre)) {
    if (!c.img) continue;
    image(c.img, c.texte, etiquettes, contenu, c.photo);
    if (c.rendu) image(c.rendu, 'rendu du modèle actuel de Plan, façade vue de face (perpendiculairement au mur, sans obstacle), du pied du mur au haut du toit, côté de l’image ' + etiquettes.length, etiquettes, contenu);
  }
  if (ortho) image(ortho, 'orthophoto, vue du dessus, recadrée sur le contour de ' + b.nom + ' (contour en jaune, nord en haut)', etiquettes, contenu);
  if (carte) image(carte, 'carte des hauteurs LiDAR de ' + b.nom + ' (bleu bas, rouge haut, contour en noir, échelle)', etiquettes, contenu);
  return { etiquettes, contenu, facades, rendus, rendusPossibles };
}

/** Le texte qui suit les images : indices chiffres, modele, mesures, observations, et la liste des facades a decrire. */
function texteDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, indices: IndicesLidar | null, rendus: number): string {
  const lignes: string[] = [];
  lignes.push('Bâtiment : ' + b.nom + (b.mitoyen ? ' (mitoyen)' : '') + '.');
  lignes.push('Façades à décrire (étiquettes) : ' + b.facades.filter((f) => (e.capture.batiments[b.cle]?.facades[String(f.cote)]?.photos.length ?? 0) > 0).map((f) => etiquetteFacade(b, f)).join(', ') + '.');
  // Sans cette ligne, Haiku citait « le rendu du modèle » qu'il n'avait pas recu (rejeu d'AE 101).
  if (!rendus) lignes.push('Aucun rendu du modèle n’est joint à cette requête : le modèle actuel ne se lit que dans le JSON ci-dessous. Ne citez aucun rendu.');
  lignes.push('Indices LiDAR chiffrés : ' + (indices ? JSON.stringify(indices) : 'aucune mesure LiDAR pour ce bâtiment') + '.');
  lignes.push('Modèle actuel de Plan (JSON compact, mètres) : ' + JSON.stringify(modeleCompact(o, b)));
  const mesures = mesuresCompactes(b, e);
  if (mesures.length) lignes.push('Mesures de Plan sur les photos : ' + JSON.stringify(mesures));
  const obs = observationsEnClair(e, b.cle);
  if (obs.length) lignes.push('Ce que la personne a vu sur place : ' + obs.join(' ; ') + '.');
  return lignes.join('\n');
}

/** Les entrees d'un batiment ; null s'il n'a aucune photo (rien a regarder). */
export async function entreeDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, fab: FabriqueImages): Promise<EntreeBatiment | null> {
  const { etiquettes, contenu, facades, rendus, rendusPossibles } = await imagesDuBatiment(o, b, e, fab);
  if (!etiquettes.some((x) => x.photo)) return null;
  const indices = indicesLidar(o.toitMesure, o.corpsToit);
  contenu.push({ type: 'text', text: texteDuBatiment(o, b, e, indices, rendus) });
  return { cle: b.cle, facades, rendus, rendusPossibles, etiquettes, contenu };
}

export interface IdentiteAnalyse {
  projet: string | null; idu: string | null; adresse: string | null; audit: string;
  /** L'audit du serveur (sauvegarde ou partage) ou l'analyse est gardee (spec-audit 15.5). */
  depot?: string | null;
}

/** Un identifiant de requete admis par le serveur (`[A-Za-z0-9_-]`) : le rang du batiment, pas sa cle. */
/**
 * Les requetes d'un batch au plus, comme le plafond par defaut du serveur (`requetesParBatch`) : le
 * renfort des facades ne prend que la place que l'analyse des maisons laisse, il ne la refuse jamais.
 */
export const REQUETES_PAR_BATCH = 60;

export const idRequete = (rang: number, passe: number): string => 'b' + rang + '-p' + passe;

/**
 * La demande entiere : chaque batiment photographie, en trois passes identiques. Rend aussi de quoi
 * relire les resultats : quelle requete est quel batiment, et les etiquettes de ses images.
 */
export async function preparerDemande(e: EntreesPropositions, fab: FabriqueImages, identite: IdentiteAnalyse): Promise<{ demande: DemandeAnalyse; requetes: BatchAnalyse['requetes']; etiquettes: Record<string, EtiquetteImage[]>; sansRendu: string[] } | null> {
  const parCle = new Map(e.objets.map((o) => [o.key, o]));
  const entrees: EntreeBatiment[] = [];
  for (const b of e.liste.batiments) {
    const o = parCle.get(b.cle);
    if (!o) continue;
    const x = await entreeDuBatiment(o, b, e, fab);
    if (x) entrees.push(x);
  }
  if (!entrees.length) return null;
  const requetes: BatchAnalyse['requetes'] = {};
  const etiquettes: Record<string, EtiquetteImage[]> = {};
  const liste: RequeteAnalyse[] = [];
  entrees.forEach((x, rang) => {
    etiquettes[x.cle] = x.etiquettes;
    for (let passe = 1; passe <= PASSES_ANALYSE; passe++) {
      const id = idRequete(rang, passe);
      requetes[id] = { cle: x.cle, passe };
      liste.push({ id, passe: passe as 1 | 2 | 3, facades: x.facades, contenu: x.contenu });
    }
  });
  // Le renfort des facades part dans le meme batch (spec facades §12 bis) : aucun delai de plus.
  if (fab.renfort) {
    for (const [rang, x] of entrees.entries()) {
      const nom = e.liste.batiments.find((b) => b.cle === x.cle)?.nom ?? x.cle;
      const r = await requetesRenfortDuBatiment(e, x.cle, nom, rang, fab.renfort, REQUETES_PAR_BATCH - liste.length);
      liste.push(...r.requetes);
      Object.assign(requetes, r.parId);
    }
  }
  // Les batiments dont les prises permettaient un rendu et qui n'en ont aucun : la Vue 3D n'etait pas
  // ouverte, ou le dessin a echoue. La personne le sait, et le texte de la requete le dit a Claude.
  const sansRendu = entrees.filter((x) => x.rendusPossibles > 0 && x.rendus === 0).map((x) => e.liste.batiments.find((b) => b.cle === x.cle)?.nom ?? x.cle);
  return { demande: { ...identite, usage: 'analyse', requetes: liste }, requetes, etiquettes, sansRendu };
}
