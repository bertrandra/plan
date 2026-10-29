// La lecture du reglement de la zone par Claude (lot L4 de la lecture IA elargie) : de la parcelle a des faits du PLU PROPOSES.
//
//   1. le reglement de la zone au GPU (geo/reglementPlu.ts : la zone relue au point, l'adresse du PDF et sa page) ;
//   2. le PDF entier, puis un extrait a partir de la page de la zone (`plu.pagesMax` pages, regles/plu/reglages.json), fait par
//      pdf-lib avec des dates fixes : le meme document donne le meme extrait, a l'octet, et la meme empreinte ;
//   3. l'appel immediat du serveur (usage `plu`, deploy/analyse.php) : l'extrait en bloc `document`, et un texte qui dit la commune,
//      la zone et la page ; le serveur choisit le prompt, le schema et le modele, journalise le cout, et rend le texte brut ;
//   4. la reponse lue par regles/plu/observations.ts : des faits proposes, jamais valides ici.
//
// Ce module ne touche pas au projet : le service des resultats range ce qu'il rend sur la parcelle, en un pas d'annulation. Le
// reglement est un document public : il part sans l'accord demande pour les photos d'un audit (io/accordAnalyse.ts).

import { chargerPdfLib } from '../../export/chargeurPdfLib.js';
import type { BibliothequePdf } from '../../export/dossierMairie.js';
import { chercherReglements, telechargerReglement, type AdresseReglement } from '../../geo/reglementPlu.js';
import { faitsDeLaSortie } from '../../regles/plu/observations.js';
import { REGLAGES_PLU } from '../../regles/plu/reglages.js';
import type { ReglementPlu } from '../../regles/plu/faits.js';
import type { ClientAnalyse } from '../../io/analyseClaude.js';
import type { ObjetPlan } from '../../model/types.js';

/** L'extrait envoye : ses octets, ses pages (numeros du document entier) et le nombre de pages du document. */
export interface ExtraitPdf { pdf: Uint8Array; pages: [number, number]; pagesDocument: number }

export interface ContexteLecturePlu {
  /** Le client des routes de Claude ; null hors plateforme et hors admin (la lecture est alors refusee, avec sa raison). */
  client: () => ClientAnalyse | null;
  identite: () => { projet: string | null; idu: string | null; adresse: string | null };
  maintenant: () => Date;
  /** Les points d'entree du reseau et de pdf-lib, remplaces dans les tests. */
  chercher?: (lon: number, lat: number) => Promise<AdresseReglement[]>;
  telecharger?: (url: string) => Promise<Uint8Array>;
  extraire?: (pdf: Uint8Array, page: number | null, pagesMax: number) => Promise<ExtraitPdf>;
  empreinte?: (octets: Uint8Array) => Promise<string>;
}

/** L'extrait par pdf-lib, chargee a la demande (comme pour la declaration prealable). */
export async function extraireAvecPdfLib(octets: Uint8Array, page: number | null, pagesMax: number): Promise<ExtraitPdf> {
  return extrairePages(await chargerPdfLib(), octets, page, pagesMax);
}

/** Les pages `page` a `page + pagesMax - 1`, dates et producteur fixes : l'empreinte de l'extrait ne depend que du document. */
export async function extrairePages(lib: BibliothequePdf, octets: Uint8Array, page: number | null, pagesMax: number): Promise<ExtraitPdf> {
  const source = await lib.PDFDocument.load(octets, { ignoreEncryption: true, updateMetadata: false });
  const total = source.getPageCount();
  const debut = Math.min(Math.max(1, page ?? 1), total), fin = Math.min(total, debut + pagesMax - 1);
  const doc = await lib.PDFDocument.create({ updateMetadata: false });
  const copies = await doc.copyPages(source, Array.from({ length: fin - debut + 1 }, (_, i) => debut - 1 + i));
  copies.forEach((p) => doc.addPage(p));
  const zero = new Date(0);
  doc.setCreationDate(zero);
  doc.setModificationDate(zero);
  doc.setProducer('Plan');
  doc.setCreator('Plan');
  return { pdf: await doc.save(), pages: [debut, fin], pagesDocument: total };
}

/** SHA-256 en hexadecimal (Web Crypto). */
export async function sha256(octets: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', octets as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Des octets en base64, par tranches (un extrait de quelques megaoctets ne passe pas en un seul `String.fromCharCode`). */
export function enBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Le texte joint a l'extrait : ce que Claude doit lire, et ou commence l'extrait dans le document. */
export function texteDemande(a: AdresseReglement, commune: { nom: string; insee: string } | null, extrait: ExtraitPdf): string {
  return [
    commune ? 'Commune : ' + commune.nom + ' (INSEE ' + commune.insee + ').' : null,
    'Document d’urbanisme : ' + (a.document || 'inconnu') + '.',
    'Zone demandée : ' + a.zone + (a.libelong && a.libelong !== a.zone ? ' (« ' + a.libelong + ' »)' : '') + '.',
    'L’extrait envoyé va de la page ' + extrait.pages[0] + ' à la page ' + extrait.pages[1] + ' du document entier (' + extrait.pagesDocument + ' pages) : sa première page est la page ' + extrait.pages[0] + '.'
      + (a.page ? '' : ' Le Géoportail ne donne pas la page du chapitre de la zone : l’extrait part du début du document.'),
  ].filter(Boolean).join('\n');
}

/**
 * Lit le reglement de la zone de cette parcelle. Rend le reglement (faits proposes, source, lecture), ou la phrase a dire quand
 * quelque chose manque : pas de zonage, pas de reglement au GPU, pas de client, une reponse illisible.
 */
export async function lireReglementPlu(parcelle: ObjetPlan, ctx: ContexteLecturePlu): Promise<{ reglement: ReglementPlu } | { erreur: string }> {
  const plu = parcelle.plu;
  if (!plu || !plu.zones.length) return { erreur: 'Interrogez d’abord le Géoportail de l’urbanisme : la zone de la parcelle n’est pas connue.' };
  const client = ctx.client();
  if (!client) return { erreur: 'La lecture par Claude passe par le serveur de Plan : connectez-vous à votre organisation.' };
  const adresses = await (ctx.chercher ?? chercherReglements)(plu.lon, plu.lat);
  const voulue = plu.zones[0]?.libelle;
  const a = adresses.find((x) => x.zone === voulue) ?? adresses[0];
  if (!a) return { erreur: 'Le Géoportail de l’urbanisme ne donne pas de règlement en PDF pour cette zone : consultez la page territoire de la commune.' };
  const document = await (ctx.telecharger ?? telechargerReglement)(a.url);
  const extrait = await (ctx.extraire ?? extraireAvecPdfLib)(document, a.page, REGLAGES_PLU['plu.pagesMax']);
  const empreinte = ctx.empreinte ?? sha256;
  const [empreinteExtrait, empreinteDocument] = await Promise.all([empreinte(extrait.pdf), empreinte(document)]);
  const demandeeLe = ctx.maintenant().toISOString();
  const lu = await client.immediat({
    ...ctx.identite(), audit: ('plu-' + (plu.commune?.insee || 'commune') + '-' + a.zone).slice(0, 64), usage: 'plu',
    requetes: [{ id: 'plu', passe: 1, facades: 0, contenu: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: enBase64(extrait.pdf) } },
      { type: 'text', text: texteDemande(a, plu.commune, extrait) },
    ] }],
  });
  const x = lu.resultats[0];
  if (!x || x.statut !== 'reussi' || !x.sortie) return { erreur: 'Claude n’a pas rendu de lecture utilisable' + (x?.erreur?.message ? ' (' + x.erreur.message + ')' : '') + '. Réessayez plus tard.' };
  const l = faitsDeLaSortie(x.sortie, extrait.pages);
  return {
    reglement: {
      format: 'plan-reglement-plu', version: 1, zone: a.zone, zoneLue: l.zone, document: a.document, insee: plu.commune?.insee || null,
      source: { url: a.url, page: a.page, pages: extrait.pages, pagesDocument: extrait.pagesDocument, empreinte: empreinteExtrait, empreinteDocument, octets: extrait.pdf.length, luLe: demandeeLe },
      lecture: { modele: x.modele ?? lu.modele, prompt: x.prompt ?? lu.prompt, schema: x.schema ?? lu.schema, cout: x.cout ?? null, tokens: x.tokens ?? null,
                 brut: typeof x.brut === 'string' ? x.brut : null, sortie: x.sortie, demandeeLe, ...(x.synthetique === true ? { synthetique: true } : {}),
                 ...(lu.trace ? { trace: lu.trace } : {}) },
      faits: l.faits,
      remarques: [l.trouvee === 'non' ? 'Claude n’a pas trouvé le chapitre de la zone ' + a.zone + ' dans l’extrait.' : '', l.remarques].filter(Boolean).join(' '),
    },
  };
}
