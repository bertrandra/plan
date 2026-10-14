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
import { hauteurDe } from '../../../model/propositions.js';
import { resumePartie, partieVue } from '../../../model/ceQueJeVois.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { BlocAnalyse, DemandeAnalyse, RequeteAnalyse } from '../../../io/analyseClaude.js';
import type { BatchAnalyse, EtiquetteImage } from '../../../model/auditParcelle.js';
import { requetesRenfortDuBatiment, type FabriqueImagesRenfortAudit } from './entreesRenfort.js';
import type { PhotoCas, PrisePhoto } from '../../../model/audit.js';
import type { ObjetPlan, PtBrut } from '../../../model/types.js';
import type { LigneBatiment } from './liste.js';

export interface ImagePreparee { base64: string; mediaType: 'image/jpeg' | 'image/png' }

/** Qui dessine les images : le navigateur (render/imagesAnalyse.ts, three/renduPrise.ts), ou un simulacre dans les tests. */
export interface FabriqueImages {
  /** La photo reduite a 1 024 px ; null si elle ne se lit pas. */
  photo(p: PhotoCas): Promise<ImagePreparee | null>;
  /** Le rendu du modele depuis cette prise ; null sans Vue 3D ou sans azimut. */
  rendu(prise: PrisePhoto): ImagePreparee | null;
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
    facades: b.facades.map((f) => ({ etiquette: f.facade.orientation.toLowerCase(), largeurM: Math.round(f.facade.largeur * 10) / 10, ouverturesRelevees: (o.facades ?? []).find((r) => r.cote === f.cote)?.ouvertures.length ?? null })),
  };
}

/** Ce que le telephone a mesure sur chaque facade (§13.1) : des indices pour Claude, pas des conclusions. */
export function mesuresCompactes(b: LigneBatiment, e: EntreesPropositions): Record<string, unknown>[] {
  return b.facades.flatMap((f) => {
    const m = e.mesures.get(cleMesure(b.cle, f.cote));
    if (!m) return [];
    return [{
      facade: f.facade.orientation.toLowerCase(),
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

/** Les images d'un batiment, dans l'ordre : facades (photo, puis rendu), toit, orthophoto, carte LiDAR. */
async function imagesDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, fab: FabriqueImages): Promise<{ etiquettes: EtiquetteImage[]; contenu: BlocAnalyse[]; facades: number }> {
  const etiquettes: EtiquetteImage[] = [];
  const contenu: BlocAnalyse[] = [];
  const bat = e.capture.batiments[b.cle];
  let facades = 0;
  for (const f of b.facades) {
    const photos = bat?.facades[String(f.cote)]?.photos ?? [];
    if (!photos.length) continue;
    facades++;
    const nom = 'façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom;
    for (let rang = 0; rang < photos.length; rang++) {
      const p = photos[rang] as PhotoCas;
      const img = await fab.photo(p);
      if (!img) continue;
      image(img, 'photo de la ' + nom + textePrise(p.prise, distanceAuMur(f.facade, p.prise)), etiquettes, contenu, { cle: b.cle, cote: f.cote, rang });
      const rendu = p.prise && p.prise.azimutDeg !== null ? fab.rendu(p.prise) : null;
      if (rendu) image(rendu, 'rendu du modèle actuel de Plan, même point de vue que l’image ' + etiquettes.length, etiquettes, contenu);
    }
  }
  for (let rang = 0; rang < (bat?.photos.length ?? 0); rang++) {
    const p = (bat as NonNullable<typeof bat>).photos[rang] as PhotoCas;
    const img = await fab.photo(p);
    if (img) image(img, 'photo du toit de ' + b.nom + textePrise(p.prise, null), etiquettes, contenu, { cle: b.cle, rang });
  }
  const contour = 'pts' in o && o.pts ? o.pts : [];
  if (contour.length >= 3) {
    const ortho = await fab.ortho(contour);
    if (ortho) image(ortho, 'orthophoto, vue du dessus, recadrée sur le contour de ' + b.nom + ' (contour en jaune, nord en haut)', etiquettes, contenu);
    const carte = fab.carte(o, contour);
    if (carte) image(carte, 'carte des hauteurs LiDAR de ' + b.nom + ' (bleu bas, rouge haut, contour en noir, échelle)', etiquettes, contenu);
  }
  return { etiquettes, contenu, facades };
}

/** Le texte qui suit les images : indices chiffres, modele, mesures, observations, et la liste des facades a decrire. */
function texteDuBatiment(o: ObjetPlan, b: LigneBatiment, e: EntreesPropositions, indices: IndicesLidar | null): string {
  const lignes: string[] = [];
  lignes.push('Bâtiment : ' + b.nom + (b.mitoyen ? ' (mitoyen)' : '') + '.');
  lignes.push('Façades à décrire (étiquettes) : ' + b.facades.filter((f) => (e.capture.batiments[b.cle]?.facades[String(f.cote)]?.photos.length ?? 0) > 0).map((f) => f.facade.orientation.toLowerCase()).join(', ') + '.');
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
  const { etiquettes, contenu, facades } = await imagesDuBatiment(o, b, e, fab);
  if (!etiquettes.some((x) => x.photo)) return null;
  const indices = indicesLidar(o.toitMesure, o.corpsToit);
  contenu.push({ type: 'text', text: texteDuBatiment(o, b, e, indices) });
  return { cle: b.cle, facades, etiquettes, contenu };
}

export interface IdentiteAnalyse { projet: string | null; idu: string | null; adresse: string | null; audit: string }

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
export async function preparerDemande(e: EntreesPropositions, fab: FabriqueImages, identite: IdentiteAnalyse): Promise<{ demande: DemandeAnalyse; requetes: BatchAnalyse['requetes']; etiquettes: Record<string, EtiquetteImage[]> } | null> {
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
  return { demande: { ...identite, usage: 'analyse', requetes: liste }, requetes, etiquettes };
}
