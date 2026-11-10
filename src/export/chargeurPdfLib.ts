// pdf-lib, chargee a la demande (export/).
//
// Comme three.js : la bibliotheque n'est pas empaquetee dans le programme (environ 500 Ko pour une
// seule commande, la declaration prealable). Elle se charge au premier usage et se pose sur
// `window.PDFLib` ; le type vient du paquet npm, en devDependency, qui ne sort jamais au build.
// Depuis l'etape 5.2 de la feuille de route, la copie de la livraison (`assets/vendor/…`) d'abord,
// jsDelivr en secours.

import type { BibliothequePdf } from './dossierMairie.js';
import { empreinteDe, versLocale } from '../util/integriteCdn.js';

/** pdf-lib chez jsDelivr : l'adresse de reference de l'empreinte, et le secours. */
export const URL_PDF_LIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
/** La meme, dans la livraison. */
export const URL_PDF_LIB_LOCALE = versLocale(URL_PDF_LIB);

declare global {
  interface Window { PDFLib?: BibliothequePdf }
}

let enCours: Promise<BibliothequePdf> | null = null;

/** Pose une balise <script> et attend que la bibliotheque se declare. */
function charger(url: string): Promise<BibliothequePdf> {
  return new Promise<BibliothequePdf>((resoudre, rejeter) => {
    const s = document.createElement('script');
    s.src = url;
    // Son empreinte : un CDN compromis ne peut pas servir autre chose (util/integriteCdn.ts).
    const empreinte = empreinteDe(url);
    if (empreinte) { s.integrity = empreinte; s.crossOrigin = 'anonymous'; }
    s.onload = () => window.PDFLib ? resoudre(window.PDFLib) : rejeter(new Error('pdf-lib chargee sans se declarer'));
    s.onerror = () => { s.remove(); rejeter(new Error('Impossible de charger la bibliothèque PDF (connexion internet requise).')); };
    document.head.appendChild(s);
  });
}

export function chargerPdfLib(): Promise<BibliothequePdf> {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  enCours ??= charger(URL_PDF_LIB_LOCALE).catch(() => charger(URL_PDF_LIB)).catch((e: unknown) => {
    enCours = null;
    throw e;
  });
  return enCours;
}
