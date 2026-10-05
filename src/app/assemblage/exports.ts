// Ce que le plan produit pour sortir de l'application (app/assemblage/) : SVG, DXF, PDF, dossier,
// resume, projet JSON. Les formats vivent dans export/ et io/ ; les boutons dans app/ecouteurs/exports.ts.

import type { OptionsCommandes } from '../magasin.js';
import { telechargerTexte } from '../../shell/download.js';
import { showToast } from '../../shell/dialogs.js';
import { construireDXF } from '../../export/dxfPlan.js';
import { construireSVG } from '../../export/svgPlan.js';
import { construirePDF } from '../../export/pdfPlan.js';
import { construireDossierPDF } from '../../export/dossierPdf.js';
import { construireNoteCalculPDF, noteExportable } from '../../export/noteCalculPdf.js';
import { estAbri } from '../../model/fonctions.js';
import { slugFichier } from '../../util/format.js';
import { construireResume } from '../../export/resume.js';
import { exporterProjetJSON } from '../../io/exportProjet.js';
import { serializeObjects, serializeMeasures } from '../../io/serialisation.js';
import { APP_VERSION, BUILD_AT, signatureExport } from '../../model/version.js';
import { schemaAEcrire } from '../../model/migrations.js';
import { brancherExports } from '../ecouteurs/exports.js';
import { clesDossier } from '../dossier.js';
import type { ProjetResume } from '../../io/api.js';
import type { Mesures } from './mesures.js';
import type { EtatApp } from '../../core/state.js';
import type { RegistreCommandes } from '../commandes.js';
import type { Resultats } from '../resultats.js';

/** Le nom et les metadonnees du projet ouvert, tels que le serveur les a rendus. */
export interface MetaProjet { meta?: ProjetResume | null }

/** Le resume texte du projet : le tiroir le montre, le presse-papiers le recoit. */
export function resumeDuProjet(etat: EtatApp, m: Mesures): string {
  return construireResume(etat.objects, etat.measures, {
    appVersion: APP_VERSION, computeMeasureGeom: m.computeMeasureGeom, refLabel: m.refLabel, targetLabel: m.targetLabel
  });
}

/** Le projet en JSON, tel que api.php le rend : ce qui sort d'ici se recharge tel quel. */
export function exporterLeProjet(etat: EtatApp, seed: MetaProjet, sansParcelle: boolean): void {
  exporterProjetJSON(etat, sansParcelle, {
    serializeObjects, serializeMeasures, telechargerTexte, showToast,
    appVersion: APP_VERSION, schemaVersion: schemaAEcrire(etat.objects, etat.schemaProjet),
    metaProjet: () => seed.meta || {}
  });
}

export function brancherLesExports(etat: EtatApp, seed: MetaProjet, commandes: RegistreCommandes, d: {
  mesures: Mesures; resultats: Resultats; genererGlb: (telecharger: boolean) => void; options: () => OptionsCommandes;
}): void {
  const nomProjet = () => seed.meta?.name;
  const abriSelectionne = () => etat.objects.find(o => o.key === etat.selectedKey && estAbri(o));
  brancherExports({
    buildExportSVG: () => construireSVG(etat.objects, etat.measures, { appVersion: APP_VERSION, schemaVersion: schemaAEcrire(etat.objects, etat.schemaProjet) }),
    buildExportDXF: () => construireDXF(etat.objects, etat.measures, signatureExport()),
    echellePdf: () => d.options().echellePdf,
    buildExportPDF: (echelle) => construirePDF(etat.objects, etat.measures, echelle, {
      appVersion: APP_VERSION, buildAt: BUILD_AT, montrerNord: etat.showNorth
    }),
    genererGlb: d.genererGlb,
    construireResume: () => resumeDuProjet(etat, d.mesures),
    resultats: d.resultats,
    construireDossier: () => construireDossierPDF(etat.objects, clesDossier(etat.objects),
      d.options().dossierEquipements,
      { nomProjet: nomProjet(), appVersion: APP_VERSION }),
    clesDossier: () => clesDossier(etat.objects),
    construireNoteCalcul: () => {
      const o = abriSelectionne();
      const res = o ? construireNoteCalculPDF(o, { appVersion: APP_VERSION, nomProjet: nomProjet() }) : null;
      return o && res ? { pdf: res.pdf, nom: slugFichier(o.name || 'abri') + '-note-de-calcul.pdf' } : null;
    },
    noteCalculPossible: () => noteExportable(abriSelectionne()),
    nomProjet
  }, commandes);
}
