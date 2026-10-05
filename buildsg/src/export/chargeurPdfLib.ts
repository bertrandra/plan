// pdf-lib, chargee a la demande (export/).
//
// Comme three.js : la bibliotheque n'est pas empaquetee dans le fichier unique (environ 500 Ko pour
// une seule commande, la declaration prealable). Elle arrive de jsDelivr au premier usage et se pose
// sur `window.PDFLib` ; le type vient du paquet npm, en devDependency, qui ne sort jamais au build.

import type { BibliothequePdf } from './dossierMairie.js';

export const URL_PDF_LIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

declare global {
  interface Window { PDFLib?: BibliothequePdf }
}

let enCours: Promise<BibliothequePdf> | null = null;

export function chargerPdfLib(): Promise<BibliothequePdf> {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (enCours) return enCours;
  enCours = new Promise<BibliothequePdf>((resoudre, rejeter) => {
    const s = document.createElement('script');
    s.src = URL_PDF_LIB;
    s.onload = () => window.PDFLib ? resoudre(window.PDFLib) : rejeter(new Error('pdf-lib chargee sans se declarer'));
    s.onerror = () => { enCours = null; rejeter(new Error('Impossible de charger la bibliothèque PDF (connexion internet requise).')); };
    document.head.appendChild(s);
  });
  return enCours;
}
