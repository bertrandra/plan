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

export function ouvrirEcranCalibration(): void {
  const f = (entree: string, init?: RequestInit) => fetch(entree, init);
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
