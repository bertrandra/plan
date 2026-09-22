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

import { CAPACITES } from '../../plateforme/capacites.js';
import { showToast, showErrBanner } from '../../shell/dialogs.js';
import { telechargerTexte, telechargerBlob } from '../../shell/download.js';
import { slugFichier } from '../../util/format.js';
import type { RegistreCommandes } from '../commandes.js';

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

/** Le nom du fichier qui vient de partir, dit en bas de l'ecran : le seul filet qui survive au clic. */
function direTelechargement(nomFichier: string): void {
  showToast('Téléchargement lancé : ' + nomFichier + '.');
}

export function brancherExports(ctx: ContexteExports, cmd: RegistreCommandes): void {
  // Les exports sont des entrees du menu Exporter (zones/BarreApplication.tsx) : des commandes sans
  // bouton dans le balisage. Seul « Générer le résumé » garde le sien, dans l'onglet Résumé du tiroir.
  const surClic = (_idDom: string, id: string, libelle: string, action: (bouton: HTMLButtonElement) => void, capacite?: string) =>
    cmd.declarer({ id, libelle, groupe: 'export', ...(capacite ? { capacite } : {}), executer: (source) => action(source as HTMLButtonElement) });

  surClic('exportSvgBtn', 'export.svg', 'Exporter en SVG', () => {
    let svgStr: string;
    try { svgStr = ctx.buildExportSVG(); }
    catch (err) { showErrBanner('Erreur export SVG: ' + (err as Error).message); return; }
    afficherDansLaBoite(svgStr);
    try {
      telechargerBlob('plan_interactif_export.svg', new Blob([svgStr], { type: 'image/svg+xml' }));
      direTelechargement('plan_interactif_export.svg');
    } catch (err) {
      showErrBanner('Le contenu SVG est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + (err as Error).message);
    }
  });

  /**
   * Le PNG passe par le SVG : on le charge dans une image, on la dessine sur un canvas, on lit le
   * canvas. Le suréchantillonnage ×3 va au-delà de la taille native du SVG — sans lui, un plan
   * imprimé depuis le PNG serait visiblement pixellisé.
   */
  surClic('exportPngBtn', 'export.png', 'Exporter en PNG', () => {
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
          direTelechargement('plan_interactif_export.png');
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
  cmd.bouton('exportBtn', { id: 'export.resume', libelle: 'Générer le résumé', groupe: 'export', executer: () => { afficherDansLaBoite(ctx.construireResume()); } });

  surClic('exportDxfBtn', 'export.dxf', 'Exporter en DXF', () => {
    let dxfStr: string;
    try { dxfStr = ctx.buildExportDXF(); }
    catch (err) { showErrBanner('Erreur export DXF: ' + (err as Error).message); return; }
    afficherDansLaBoite(dxfStr);
    try {
      telechargerBlob('plan_interactif_export.dxf', new Blob([dxfStr], { type: 'application/dxf' }));
      direTelechargement('plan_interactif_export.dxf');
    } catch (err) {
      showErrBanner('Le contenu DXF est affiche ci-dessus (copiable), mais le telechargement automatique a echoue: ' + (err as Error).message);
    }
  }, CAPACITES.exportDxf.code);

  // Pas d'affichage dans la zone : un PDF n'a pas de contenu lisible à copier.
  surClic('exportPdfBtn', 'export.pdf', 'Exporter en PDF', () => {
    const echelle = parseInt((document.getElementById('pdfScaleInput') as HTMLInputElement).value, 10) || 200;
    let pdfStr: string;
    try { pdfStr = ctx.buildExportPDF(echelle); }
    catch (err) { showErrBanner('Erreur export PDF: ' + (err as Error).message); return; }
    try {
      telechargerBlob('plan_interactif_export.pdf', new Blob([pdfStr], { type: 'application/pdf' }));
      direTelechargement('plan_interactif_export.pdf');
    } catch (err) {
      showErrBanner('Echec du telechargement PDF: ' + (err as Error).message);
    }
  });

  surClic('dossierPdfBtn', 'export.dossier', 'Générer le dossier PDF', () => {
    if (!ctx.clesDossier().length) { showToast('Coche au moins une terrasse pour le dossier.'); return; }
    let res;
    try { res = ctx.construireDossier(); }
    catch (err) { showErrBanner('Erreur dossier PDF : ' + (err as Error).message); return; }
    telechargerTexte(slugFichier(ctx.nomProjet() || 'plan') + '-dossier-terrasses.pdf', res.pdf, 'application/pdf');
    const nbEquip = [...res.equipements.values()].reduce((s, l) => s + l.length, 0);
    showToast('Dossier PDF : ' + res.pages + ' page(s) — plan de masse + ' + res.terrasses.length +
      ' terrasse(s), ' + nbEquip + ' equipement(s) cote(s).');
  }, CAPACITES.exportDossier.code);

  // Onglet Export : c'est bien un fichier que l'utilisateur veut, contrairement aux boutons de la
  // visionneuse qui ne produisent le modèle qu'en mémoire.
  surClic('exportGlbBtn', 'export.glb', 'Exporter en GLB', bouton => ctx.genererGlb(bouton, true));
}
