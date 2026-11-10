// Monte l'ecran de calibration de la detection (`?admin&ecran=calibration`, zones/EcranCalibration.tsx).
//
// Un ecran de l'admin, comme les arbres et la palette : main.ts ne l'ouvre qu'une fois la porte de l'admin franchie, et Plan ne
// demarre pas dessous. Il branche l'ecran sur le serveur (`admin/calibration`, `admin/calibration-cas`) et sur le navigateur
// (reduire, decoder et montrer une photo).

import { brancherGestesFacade } from '../clavierGestes.js';
import type { GestesDuCas } from '../../zones/EditeurCasCalibration.js';
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
import { ETAPES_FACADE, type IdEtape, type SourceElement } from '../../model/etapeFacade.js';
import { creerClientAnalyse } from '../../io/analyseClaude.js';
import { appelerEscaladeFacade, appelerLectureEnrichie, appelerRunFacade, avecSaLectureEnrichie, encodageUnique, type ContexteRun } from '../releve/runFacade.js';
import { dessinerImageFacade } from '../../render/imageFacade.js';
import { imageDeLEtalon, listerEtalons, ouvrirEtalon } from '../../io/etalonsFacades.js';
import { creerProjetDeLEtalon } from './projetEtalon.js';
import { chercherCoins } from '../releve/rechercheCoins.js';
import { preparerPhoto } from '../audit/photo.js';

/** Ce que l'editeur ouvert fait d'un choix : la cle de l'element et la source (null : revenir a celle du moteur). */
type EcouteChoix = (cle: string, source: SourceElement | null) => void;
/** Ce que l'editeur ouvert fait d'un forcage : l'etape (ou toutes), pose ou retire. */
type EcouteForcage = (cible: { etape: IdEtape } | { toutes: true }, oui: boolean) => void;

/**
 * Le registre de l'ecran (Plan ne demarre pas dessous) : la commande qui ouvre une etape de la facade, liee aux segments de la barre de
 * progression et a la frise des etapes (MD/spec-facade-calage-audit.md §4 ter.5). L'etape vient de `data-etape` du bouton ; l'editeur
 * ouvert s'abonne a son ouverture.
 */
function registreDeLEcran(): { commandes: RegistreCommandes; ecouterEtape: (f: (id: IdEtape) => void) => () => void; ecouterEscalade: (f: () => void) => () => void; ecouterConfirmerMur: (f: () => void) => () => void; ecouterGestes: (g: GestesDuCas) => () => void; ecouterChoix: (f: EcouteChoix) => () => void; ecouterForcage: (f: EcouteForcage) => () => void } {
  const commandes = creerRegistre();
  let ouvrir: ((id: IdEtape) => void) | null = null;
  let escalader: (() => void) | null = null;
  let confirmer: (() => void) | null = null;
  let gestes: GestesDuCas | null = null;
  let choisir: EcouteChoix | null = null;
  let forcer: EcouteForcage | null = null;
  commandes.declarer({
    id: 'facade.etape', libelle: 'Ouvrir une étape de la façade', groupe: 'facade',
    executer: (source) => { const etape = ETAPES_FACADE.find((e) => e.id === source?.dataset.etape); if (etape) ouvrir?.(etape.id); },
  });
  // L'escalade de la reponse rejouee (decision du 29 octobre 2026) : a la demande seulement, une requete par geste.
  commandes.declarer({ id: 'facade.escalader', libelle: 'Escalader la lecture de la façade', groupe: 'facade', executer: () => { escalader?.(); } });
  // « Confirmer le mur » (V1) : la meme commande que dans l'audit ; l'editeur ouvert ecrit le mur confirme dans le cas et le rejoue.
  commandes.declarer({ id: 'facade.confirmerMur', libelle: 'Confirmer le mur', groupe: 'facade', executer: () => { confirmer?.(); } });
  // Ctrl+Z et Ctrl+Y sur les gestes du cas ouvert (reperes, mur tire, confirmation du mur) : les memes commandes que dans l'audit.
  commandes.declarer({ id: 'facade.annulerGeste', libelle: 'Annuler le dernier geste sur la façade', groupe: 'facade', actif: () => !!gestes?.peutAnnuler(), executer: () => { gestes?.annuler(); } });
  commandes.declarer({ id: 'facade.retablirGeste', libelle: 'Rétablir le geste sur la façade', groupe: 'facade', actif: () => !!gestes?.peutRetablir(), executer: () => { gestes?.retablir(); } });
  // Les choix de la personne (lot C2) : Calcul, Claude ou Manuel pour un element (`data-cle`, `data-source` ; « moteur » retire le
  // choix), et le forcage de Claude pour une etape (`data-etape`) ou pour toutes (`data-toutes`). Des gestes du cas, que Ctrl+Z defait.
  commandes.declarer({
    id: 'facade.choisirSource', libelle: 'Choisir la source d’un élément de la façade (Calcul, Claude, Manuel)', groupe: 'facade',
    actif: () => !!choisir,
    executer: (source) => { const cle = source?.dataset.cle, s = source?.dataset.source; if (cle && (s === 'calcul' || s === 'claude' || s === 'manuel' || s === 'moteur')) choisir?.(cle, s === 'moteur' ? null : s); },
  });
  commandes.declarer({
    id: 'facade.forcerClaude', libelle: 'Forcer Claude pour une étape de la façade, ou pour toutes', groupe: 'facade',
    actif: () => !!forcer,
    executer: (source) => {
      const etape = ETAPES_FACADE.find((e) => e.id === source?.dataset.etape)?.id, oui = source?.getAttribute('aria-pressed') !== 'true';
      if (source?.dataset.toutes === 'oui') forcer?.({ toutes: true }, oui); else if (etape) forcer?.({ etape }, oui);
    },
  });
  brancherGestesFacade(typeof document === 'undefined' ? null : document, () => !!gestes, commandes);
  return {
    commandes,
    ecouterEtape: (f) => { ouvrir = f; return () => { if (ouvrir === f) ouvrir = null; }; },
    ecouterEscalade: (f) => { escalader = f; return () => { if (escalader === f) escalader = null; }; },
    ecouterConfirmerMur: (f) => { confirmer = f; return () => { if (confirmer === f) confirmer = null; }; },
    ecouterGestes: (g) => { gestes = g; return () => { if (gestes === g) gestes = null; }; },
    ecouterChoix: (f) => { choisir = f; return () => { if (choisir === f) choisir = null; }; },
    ecouterForcage: (f) => { forcer = f; return () => { if (forcer === f) forcer = null; }; },
  };
}

/** L'adresse demande-t-elle l'ecran de calibration ? */
export function demandeEcranCalibration(recherche: string): boolean {
  return new URLSearchParams(recherche).get('ecran') === 'calibration';
}

async function decoder(url: string) {
  // Une photo d'etalon de synthese : ses pixels rendus, tels quels (le JPEG montre n'est que pour l'oeil).
  const etalon = imageDeLEtalon(url);
  if (etalon) return etalon;
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
    // Une photo importee dans un cas (demande du proprietaire, 9 novembre 2026) : preparee comme une photo de l'audit (l'EXIF range dans
    // l'optique avant la reduction a 1 280 px), sans prise de vue : rien n'a ete mesure par le telephone.
    importerPhoto: (fichier) => preparerPhoto(fichier, null),
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
    // Les etalons de synthese : les scenes du banc des facades, rendues ici, ouvertes en lecture seule (facade/banc/etalons.ts).
    etalons: listerEtalons,
    ouvrirEtalon: (id) => ouvrirEtalon(id, (img) => versJpeg(img, 0.9)),
    // Son projet de demonstration : construit ici, enregistre dans les demos de l'admin (data/demo/), ouvert par `?demofile=<id>`.
    creerProjetEtalon: (id) => creerProjetDeLEtalon(id, f, { chercherCoins, jpeg: (img) => versJpeg(img, 0.9), maintenant: () => new Date() }),
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
