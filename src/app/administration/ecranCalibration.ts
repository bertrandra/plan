// Monte l'ecran de calibration de la detection (`?admin&ecran=calibration`, zones/EcranCalibration.tsx).
//
// Un ecran de l'admin, comme les arbres et la palette : main.ts ne l'ouvre qu'une fois la porte de l'admin franchie, et Plan ne
// demarre pas dessous. Il branche l'ecran sur le serveur (`admin/calibration`, `admin/calibration-cas`) et sur le navigateur
// (reduire, decoder et montrer une photo).

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { EcranCalibration, type DepsCalibration } from '../../zones/EcranCalibration.js';
import { enregistrerCalibration, enregistrerCasCalibration, lireCalibration, lireCasCalibration, listerCasCalibration, supprimerCasCalibration } from '../../io/depotDemos.js';
import { chargerCalibrationServeur } from '../../io/calibrationServeur.js';
import { lireDocumentCalibration } from '../../facade/corpusReel.js';
import { canevasPour, chargerUrl, imageDuCanevas, versJpeg } from '../../ui/releve/camera.js';
import { creerClientAudits } from '../../io/auditsServeur.js';
import { lireFichierAuditParcelle } from '../../model/fichierAuditParcelle.js';
import { casDepuisFacade, facadesACalibrer } from '../audit/parcelle/casDeCalibration.js';
import { hoteDeZone } from '../../shell/dom.js';
import { creerRegistre, type RegistreCommandes } from '../commandes.js';
import { ETAPES_FACADE, type IdEtape } from '../../model/etapeFacade.js';
import { creerClientAnalyse } from '../../io/analyseClaude.js';
import { appelerEscaladeFacade, appelerLectureEnrichie, appelerRunFacade, avecSaLectureEnrichie, encodageUnique, type ContexteRun } from '../releve/runFacade.js';
import { dessinerImageFacade } from '../../render/imageFacade.js';

/**
 * Le registre de l'ecran (Plan ne demarre pas dessous) : la commande qui ouvre une etape de la facade, liee aux segments de la barre de
 * progression et a la frise des etapes (MD/spec-facade-calage-audit.md §4 ter.5). L'etape vient de `data-etape` du bouton ; l'editeur
 * ouvert s'abonne a son ouverture.
 */
function registreDeLEcran(): { commandes: RegistreCommandes; ecouterEtape: (f: (id: IdEtape) => void) => () => void; ecouterEscalade: (f: () => void) => () => void } {
  const commandes = creerRegistre();
  let ouvrir: ((id: IdEtape) => void) | null = null;
  let escalader: (() => void) | null = null;
  commandes.declarer({
    id: 'facade.etape', libelle: 'Ouvrir une étape de la façade', groupe: 'facade',
    executer: (source) => { const etape = ETAPES_FACADE.find((e) => e.id === source?.dataset.etape); if (etape) ouvrir?.(etape.id); },
  });
  // L'escalade de la reponse rejouee (decision du 29 octobre 2026) : a la demande seulement, une requete par geste.
  commandes.declarer({ id: 'facade.escalader', libelle: 'Escalader la lecture de la façade', groupe: 'facade', executer: () => { escalader?.(); } });
  return {
    commandes,
    ecouterEtape: (f) => { ouvrir = f; return () => { if (ouvrir === f) ouvrir = null; }; },
    ecouterEscalade: (f) => { escalader = f; return () => { if (escalader === f) escalader = null; }; },
  };
}

/** L'adresse demande-t-elle l'ecran de calibration ? */
export function demandeEcranCalibration(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'calibration';
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
  const audits = creerClientAudits(f, () => null);
  const claude = creerClientAnalyse(f, () => null);
  const contexteRun: ContexteRun = { client: () => claude, identite: () => ({ projet: 'calibration', idu: null, adresse: null }), encoder: dessinerImageFacade, maintenant: () => new Date() };
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
    decoder,
    elevationEnUrl: (img) => versJpeg(img, 0.9),
    ...registreDeLEcran(),
    // « Rappeler Claude » : le run d'une facade par le serveur de l'analyse, sous la session de l'administrateur (son cookie).
    // Les deux requetes d'une facade, en meme temps, sur la meme image (decision du proprietaire du 30 octobre 2026) : le run, puis sa
    // lecture enrichie posee dessus sans rien lui faire perdre.
    appelerClaude: async (d) => {
      const c = encodageUnique(contexteRun);
      const [r, enrichie, toit] = await Promise.all([appelerRunFacade(c, d, 'calibration'), appelerLectureEnrichie(c, d, 'calibration'), appelerLectureEnrichie(c, d, 'calibration', 'facade-toit')]);
      return avecSaLectureEnrichie(r, enrichie, toit);
    },
    escaladerClaude: (d, run) => appelerEscaladeFacade(contexteRun, d, run, 'calibration'),
    prixEscalade: async () => (await claude.etat()).escaladeFacade ?? null,
    maintenant: () => new Date(),
    // Les audits de parcelle recus (session admin) : leurs facades photographiees deviennent des cas, aux dimensions du plan.
    audits: async () => (await audits.lister()).filter((a) => a.nature === 'parcelle')
      .map((a) => ({ id: a.id, libelle: [a.adresse ?? a.idu, (a.debut ?? a.recuLe).slice(0, 10), (a.photos ?? 0) + ' photos'].filter(Boolean).join(' · ') })),
    facadesDAudit: async (id) => {
      const fichier = lireFichierAuditParcelle(JSON.parse(await audits.lire(id)));
      const idu = fichier.parcelle?.idu ?? null;
      return facadesACalibrer(fichier).map((f) => ({
        libelle: f.nom + ' · façade ' + f.orientation.toLowerCase() + ' · ' + String(f.largeurM).replace('.', ',') + ' × ' + String(f.hauteurM).replace('.', ',') + ' m' + (f.sourceHauteur === 'lidar' ? ' (LiDAR)' : '') + ' · ' + f.photos.length + ' photo' + (f.photos.length > 1 ? 's' : ''),
        cas: casDepuisFacade(f, idu),
      }));
    },
  };
  const hote = hoteDeZone('zoneEcranCalibration');
  document.title = 'Admin — calibrer la détection';
  createRoot(hote).render(createElement(EcranCalibration, { deps }));
}
