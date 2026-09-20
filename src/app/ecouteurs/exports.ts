// Les boutons de l'onglet Export (spec §6.4, app/).
//
// Le contenu de chaque fichier est produit ailleurs — `export/**` pour le SVG, le DXF, les deux PDF
// et le résumé, `three/exportGlb.ts` pour le modèle 3D. Ici, il ne reste que la livraison.
//
// Et la livraison a une histoire. Un téléchargement déclenché par script échoue silencieusement dans
// certains contextes — bac à sable d'aperçu, politique du navigateur — sans lever d'erreur. D'où
// **trois filets**, dans cet ordre :
//
// 1. le contenu est affiché dans la zone de texte, sélectionné, donc copiable à la main ;
// 2. le téléchargement automatique est tenté ;
// 3. un lien « ouvrir dans un nouvel onglet » est posé sous la zone, au cas où le téléchargement
//    lui-même serait bloqué.
//
// Les trois formats texte n'en utilisent pas les mêmes : le PDF n'a pas de contenu lisible à
// afficher, le DXF n'a pas de lien de secours — un fichier CAO ne s'ouvre pas dans un onglet.

import { showToast, showErrBanner } from '../../shell/dialogs.js';
import { telechargerTexte, telechargerBlob } from '../../shell/download.js';
import { slugFichier } from '../../util/format.js';

/** Ce que la livraison d'un fichier demande au reste du programme. */
export interface ContexteExports {
  buildExportSVG: () => string;
  buildExportDXF: () => string;
  buildExportPDF: (echelle: number) => string;
  construireResume: () => string;
  construireDossier: () => { pdf: string; pages: number; terrasses: unknown[]; equipements: Map<unknown, unknown[]> };
  genererGlb: (bouton: HTMLButtonElement, telecharger: boolean) => void;
  /** Les terrasses cochées pour le dossier. */
  clesDossier: () => string[];
  /** Le nom du projet, pour nommer le dossier PDF. */
  nomProjet: () => string | null | undefined;
}

/** Affiche un contenu dans la zone de texte, sélectionné pour un copier-coller immédiat. */
function afficherDansLaBoite(contenu: string): HTMLTextAreaElement {
  const box = document.getElementById('exportBox') as HTMLTextAreaElement;
  box.style.display = 'block'; box.value = contenu; box.focus(); box.select();
  return box;
}

/**
 * Télécharge un blob et rend l'URL utilisée, pour qu'un lien de secours pointe sur le **même**
 * contenu plutôt que d'en refabriquer un second.
 *
 * ⚠️ **Défaut connu, reproduit tel quel.** L'URL est révoquée une seconde après le clic — sinon
 * certains navigateurs interrompent le téléchargement en cours. Le lien de secours qui la réutilise
 * cesse donc de fonctionner passé ce délai, ce qui vide de sens le troisième filet. Le corriger
 * demande de révoquer les deux usages séparément ; ce n'est pas fait ici pour ne pas changer un
 * comportement en même temps qu'on déplace du code.
 */
function telechargerEtPartagerUrl(nomFichier: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  return url;
}

/**
 * Pose (ou met à jour) le lien de secours sous la zone de texte.
 *
 * Il est créé une seule fois et réutilisé : un lien par export s'accumulerait sous le panneau.
 */
function lienDeSecours(id: string, url: string, texte: string, apres: Element): void {
  let lien = document.getElementById(id) as HTMLAnchorElement | null;
  if (!lien) {
    lien = document.createElement('a');
    lien.id = id;
    lien.target = '_blank'; lien.rel = 'noopener';
    lien.className = 'hint';
    lien.style.display = 'block'; lien.style.marginTop = '4px';
    apres.insertAdjacentElement('afterend', lien);
  }
  lien.href = url;
  lien.textContent = texte;
}

export function brancherExports(ctx: ContexteExports): void {
  const surClic = (id: string, action: (bouton: HTMLButtonElement) => void) => {
    const b = document.getElementById(id) as HTMLButtonElement;
    b.addEventListener('click', () => action(b));
  };

  surClic('exportSvgBtn', () => {
    let svgStr: string;
    try { svgStr = ctx.buildExportSVG(); }
    catch (err) { showErrBanner('Erreur export SVG: ' + (err as Error).message); return; }
    const box = afficherDansLaBoite(svgStr);
    try {
      const url = telechargerEtPartagerUrl('plan_interactif_export.svg', new Blob([svgStr], { type: 'image/svg+xml' }));
      lienDeSecours('svgOpenLink', url,
        "Le telechargement automatique n'a pas demarre ? Cliquer ici pour ouvrir le SVG dans un nouvel onglet (puis Enregistrer sous).", box);
    } catch (err) {
      showErrBanner('Le contenu SVG est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + (err as Error).message);
    }
  });

  /**
   * Le PNG passe par le SVG : on le charge dans une image, on la dessine sur un canvas, on lit le
   * canvas. Le suréchantillonnage ×3 va au-delà de la taille native du SVG — sans lui, un plan
   * imprimé depuis le PNG serait visiblement pixellisé.
   */
  surClic('exportPngBtn', () => {
    let svgStr: string;
    try { svgStr = ctx.buildExportSVG(); }
    catch (err) { showErrBanner('Erreur export PNG: ' + (err as Error).message); return; }
    const FACTEUR = 3;
    const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth * FACTEUR;
        canvas.height = img.naturalHeight * FACTEUR;
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) { showErrBanner('Erreur export PNG: conversion en image impossible.'); return; }
          telechargerBlob('plan_interactif_export.png', blob);
        }, 'image/png');
      } catch (err) {
        showErrBanner('Erreur export PNG: ' + (err as Error).message);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      showErrBanner('Erreur export PNG: impossible de charger le plan genere pour le convertir en image.');
    };
    img.src = svgUrl;
  });

  // Le résumé ne se télécharge pas : il est fait pour être copié dans un message.
  surClic('exportBtn', () => { afficherDansLaBoite(ctx.construireResume()); });

  // Pas de lien de secours : un fichier CAO ne s'ouvre pas dans un onglet.
  surClic('exportDxfBtn', () => {
    let dxfStr: string;
    try { dxfStr = ctx.buildExportDXF(); }
    catch (err) { showErrBanner('Erreur export DXF: ' + (err as Error).message); return; }
    afficherDansLaBoite(dxfStr);
    try {
      telechargerBlob('plan_interactif_export.dxf', new Blob([dxfStr], { type: 'application/dxf' }));
    } catch (err) {
      showErrBanner('Le contenu DXF est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + (err as Error).message);
    }
  });

  // Pas d'affichage dans la zone : un PDF n'a pas de contenu lisible à copier.
  surClic('exportPdfBtn', () => {
    const echelle = parseInt((document.getElementById('pdfScaleInput') as HTMLInputElement).value, 10) || 200;
    let pdfStr: string;
    try { pdfStr = ctx.buildExportPDF(echelle); }
    catch (err) { showErrBanner('Erreur export PDF: ' + (err as Error).message); return; }
    try {
      const url = telechargerEtPartagerUrl('plan_interactif_export.pdf', new Blob([pdfStr], { type: 'application/pdf' }));
      lienDeSecours('pdfOpenLink', url,
        "Le telechargement automatique n'a pas demarre ? Cliquer ici pour ouvrir le PDF dans un nouvel onglet.",
        document.getElementById('exportBox')!);
    } catch (err) {
      showErrBanner('Echec du telechargement PDF: ' + (err as Error).message);
    }
  });

  surClic('dossierPdfBtn', () => {
    if (!ctx.clesDossier().length) { showToast('Coche au moins une terrasse pour le dossier.'); return; }
    let res;
    try { res = ctx.construireDossier(); }
    catch (err) { showErrBanner('Erreur dossier PDF : ' + (err as Error).message); return; }
    telechargerTexte(slugFichier(ctx.nomProjet() || 'plan') + '-dossier-terrasses.pdf', res.pdf, 'application/pdf');
    const nbEquip = [...res.equipements.values()].reduce((s, l) => s + l.length, 0);
    showToast('Dossier PDF : ' + res.pages + ' page(s) — plan de masse + ' + res.terrasses.length +
      ' terrasse(s), ' + nbEquip + ' equipement(s) cote(s).');
  });

  // Onglet Export : c'est bien un fichier que l'utilisateur veut, contrairement aux boutons de la
  // visionneuse qui ne produisent le modèle qu'en mémoire.
  surClic('exportGlbBtn', bouton => ctx.genererGlb(bouton, true));
}
