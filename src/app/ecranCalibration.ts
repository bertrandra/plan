// Monte l'ecran de calibration de la detection (`?admin&ecran=calibration`, zones/EcranCalibration.tsx).
//
// Un ecran de l'admin, comme les arbres et la palette : main.ts ne l'ouvre qu'une fois la porte de l'admin franchie, et Plan ne
// demarre pas dessous. Il branche l'ecran sur le serveur (`admin/calibration`, `admin/calibration-cas`) et sur le navigateur
// (reduire, decoder et montrer une photo).

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranCalibration, type DepsCalibration } from '../zones/EcranCalibration.js';
import { enregistrerCalibration, enregistrerCasCalibration, lireCalibration, lireCasCalibration, listerCasCalibration, supprimerCasCalibration } from '../io/depotDemos.js';
import { chargerCalibrationServeur } from '../io/calibrationServeur.js';
import { lireDocumentCalibration } from '../facade/corpusReel.js';
import { canevasPour, chargerUrl, imageDuCanevas, versJpeg } from '../ui/releve/camera.js';
import { creerClientAudits } from '../io/auditsServeur.js';
import { lireFichierAuditParcelle } from '../model/fichierAuditParcelle.js';
import { casDepuisFacade, facadesACalibrer } from './audit/parcelle/casDeCalibration.js';
import { facadesRelevees } from './casDeReleve.js';
import { creerDepotDemos } from '../io/depotDemos.js';
import { validerProjetJSON } from '../io/validation.js';
import { magasinPhotos, rentrerLesPhotos } from '../io/photosLocales.js';
import type { ObjetBrut } from '../model/types.js';

/** L'adresse demande-t-elle l'ecran de calibration ? */
export function demandeEcranCalibration(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'calibration';
}

/** Photo reduite au plus a `PHOTO_MAX_PX`, en JPEG : assez pour le redressement, sans alourdir le cas sur le serveur. */
async function reduirePhoto(fichier: File): Promise<string> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await chargerUrl(url);
    const { c } = canevasPour(img.naturalWidth, img.naturalHeight);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canevas indisponible.');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decoder(url: string) {
  const img = await chargerUrl(url);
  const { c } = canevasPour(img.naturalWidth, img.naturalHeight, Math.max(img.naturalWidth, img.naturalHeight));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canevas indisponible.');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return imageDuCanevas(c);
}

const message = (e: unknown) => (e as Error).message || String(e);

/** La taille d'une image, en pixels. */
async function dimensions(url: string): Promise<{ l: number; h: number }> {
  const img = await chargerUrl(url);
  return { l: img.naturalWidth, h: img.naturalHeight };
}

/** Les facades relevees d'objets de projet, leurs photos restees sur ce navigateur relues. */
async function facadesDesObjets(objets: readonly ObjetBrut[], nom: string | null) {
  const { objets: complets } = await rentrerLesPhotos(objets, magasinPhotos());
  return facadesRelevees(complets, dimensions, nom);
}

export function ouvrirEcranCalibration(): void {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
  const audits = creerClientAudits(f, () => null);
  const demos = creerDepotDemos(f);
  const deps: DepsCalibration = {
    lireCalibration: async () => lireDocumentCalibration(await lireCalibration(f)),
    enregistrerCalibration: async (d) => {
      try {
        await enregistrerCalibration(f, d);
        // La page elle-meme prend les nouveaux reglages : la detection qu'elle fait ensuite les utilise.
        await chargerCalibrationServeur(f, true);
        return null;
      } catch (e) { return message(e); }
    },
    lister: () => listerCasCalibration(f),
    lireCas: (id) => lireCasCalibration(f, id),
    enregistrerCas: async (id, cas) => { try { await enregistrerCasCalibration(f, id, cas); return null; } catch (e) { return message(e); } },
    supprimerCas: async (id) => { try { await supprimerCasCalibration(f, id); return null; } catch (e) { return message(e); } },
    reduirePhoto,
    decoder,
    elevationEnUrl: (img) => versJpeg(img, 0.9),
    maintenant: () => new Date(),
    // Les audits de parcelle recus (session admin) : leurs facades photographiees deviennent des cas, aux dimensions du plan.
    audits: async () => (await audits.lister()).filter((a) => a.nature === 'parcelle')
      .map((a) => ({ id: a.id, libelle: [a.adresse ?? a.idu, (a.debut ?? a.recuLe).slice(0, 10), (a.photos ?? 0) + ' photos'].filter(Boolean).join(' · ') })),
    // Les projets du serveur (les fichiers de demo de l'admin) et les fichiers de projet : leurs facades relevees deviennent des cas.
    projets: async () => (await demos.lister()).map((p) => ({ id: p.id, libelle: p.name || p.id })),
    facadesDeProjet: async (id) => { const p = await demos.ouvrir(id); return facadesDesObjets(p.objects as ObjetBrut[], p.meta?.name ?? id); },
    facadesDeFichier: async (fichier) => { const v = validerProjetJSON(JSON.parse(await fichier.text())); return facadesDesObjets(v.objets, typeof v.meta.name === 'string' ? v.meta.name : fichier.name); },
    facadesDAudit: async (id) => {
      const fichier = lireFichierAuditParcelle(JSON.parse(await audits.lire(id)));
      const idu = fichier.parcelle?.idu ?? null;
      return facadesACalibrer(fichier).map((f) => ({
        libelle: f.nom + ' · façade ' + f.orientation.toLowerCase() + ' · ' + String(f.largeurM).replace('.', ',') + ' × ' + String(f.hauteurM).replace('.', ',') + ' m' + (f.sourceHauteur === 'lidar' ? ' (LiDAR)' : '') + ' · ' + f.photos.length + ' photo' + (f.photos.length > 1 ? 's' : ''),
        cas: casDepuisFacade(f, idu),
      }));
    },
  };
  let hote = document.getElementById('zoneEcranCalibration');
  if (!hote) {
    hote = document.createElement('div');
    hote.id = 'zoneEcranCalibration';
    document.body.appendChild(hote);
  }
  document.title = 'Admin — calibrer la détection';
  createRoot(hote).render(createElement(EcranCalibration, { deps }));
}
