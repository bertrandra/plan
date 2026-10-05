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
import { estAbri, estTerrasse, parcelleDuProjet } from '../../model/fonctions.js';
import { assemblerDossierMairie } from '../../export/dossierMairie.js';
import { CERFA_13703 } from '../../export/cerfa13703.js';
import { chargerPdfLib } from '../../export/chargeurPdfLib.js';
import { carteSituation } from '../../geo/carteSituation.js';
import { capturerVue3d } from '../../three/capture.js';
import type { ObjetPlan } from '../../model/types.js';
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
    construireDeclaration: () => construireDeclaration(etat.objects, nomProjet()),
    declarationPossible: () => etat.objects.some(o => estAbri(o) || estTerrasse(o)),
    nomProjet
  }, commandes);
}

/**
 * Le dossier de declaration prealable : pdf-lib et le cerfa arrivent a la demande, la carte IGN
 * si le service repond, la Vue 3D si elle a ete ouverte.
 */
async function construireDeclaration(objets: ObjetPlan[], nomProjet: string | null | undefined) {
  const lib = await chargerPdfLib();
  const r = await fetch(new URL(CERFA_13703.fichier, document.baseURI));
  if (!r.ok) throw new Error('le formulaire ' + CERFA_13703.version + ' est introuvable sur le serveur (' + CERFA_13703.fichier + ').');
  const cerfa = new Uint8Array(await r.arrayBuffer());
  const parcelle = parcelleDuProjet(objets);
  const cad = (parcelle?.cadastre || {}) as Record<string, unknown>;
  const carte = parcelle?.latitude && parcelle.longitude ? await carteSituation(parcelle.latitude, parcelle.longitude) : null;
  const res = await assemblerDossierMairie(lib, cerfa, objets, {
    date: new Date(), carte, vue3d: capturerVue3d(),
    meta: { nomProjet, adresse: String(cad.adresse || parcelle?.nomLieu || ''), references: cad.section ? 'Parcelle ' + String(cad.section) + ' ' + String(cad.numero ?? '').replace(/^0+/, '') : '' }
  });
  return {
    pdf: res.pdf, nom: slugFichier(nomProjet || 'projet') + '-declaration-prealable.pdf',
    manques: res.remplissage.manques, regime: res.remplissage.regime, pieces: res.pieces
  };
}

