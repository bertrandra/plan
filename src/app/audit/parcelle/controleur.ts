// L'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §11, §12).
//
// Une session par parcelle tant que la page vit : la liste de controle (Z8 plein ecran) et l'ecran
// de prise, pose sur la Vue 3D. Pendant la prise, le GPS et la boussole reconnaissent la facade que
// vous avez devant vous (facade/priseDeVue.ts, lot L2) parmi celles de la liste ; elle passe en rouge
// en 3D (three/facadeDevant3d.ts) et elle est nommee, et la photo prise (app/audit/photo.ts, lot L1)
// s'y range d'elle-meme. « Ce n'est pas cette façade » propose la suivante ; la facade se choisit aussi
// en la touchant dans la 3D, ou dans la liste. La Vue 3D est alors a hauteur d'homme et suit votre
// position et votre cap (vuePrise.ts).
//
// L'en-cours vit dans le brouillon local (io/brouillonAudit.ts, lot L4) : rien n'entre dans le
// projet a cette phase. « Lancer l'analyse » termine la capture ; l'analyse (§13) la reprendra.

import { suivrePositionGps, type PositionGps, type SansPosition } from '../../../shell/geolocalisation.js';
import { autoriserBoussole, suivreBoussole, lisserCap, ecartCap, type Attitude } from '../../../shell/boussole.js';
import { dialogues, type DialogueChoix } from '../../../shell/dialogues.js';
import { creerBrouillonParcelle, stockageNavigateur, type RaisonEchec, type StockageBrouillon } from '../../../io/brouillonAudit.js';
import { partageDe, photosDeLaCapture, type CaptureParcelle, type EnvoiCorpus } from '../../../model/auditParcelle.js';
import { focalePx, planDePrise } from '../../../facade/cadrage.js';
import { poserFacadeDevant, poserFacadesFaites, ROUGE_FACADE, VERT_FACADE } from '../../../three/facadeDevant3d.js';
import { objetSousLePointeur } from '../../../three/scene.js';
import { facadeTouchee, suiviPieton, vuePieton, type VuePieton } from './vuePrise.js';
import { filtrePosition, surLaParcelle } from './positionFiltree.js';
import { estBatiment, parcelleDuProjet } from '../../../model/fonctions.js';
import { aDesSommets } from '../../../model/formes.js';
import { poserPositionGps, retirerPositionGps } from '../../../three/positionGps3d.js';
import { positionDansLePlan } from '../../ecouteurs/positionGps.js';
import { capDuDeplacement } from '../camera.js';
import { jourDe } from '../reprise.js';
import { creerCapture, type CaptureEnCours } from './capture.js';
import { listeDeControle, type LigneFacade, type ListeDeControle } from './liste.js';
import { cleFacade, entreesReconnaissance, facadeRetenue, facadesProposees } from './reconnaissance.js';
import { creerValidation, type ProjetAudit, type Validation } from './validation.js';
import { creerCorpus, type Corpus } from './corpus.js';
import { creerSauvegarde, signaturePhotos, type DependancesSauvegarde, type Sauvegarde } from './sauvegarde.js';
import { lireGrilleSous } from '../../../geo/mnh.js';
import { ecrireFichierAudit, type EntreesEcriture } from './fichier.js';
import { captureDuFichier, derniereDecision, mesuresDuFichier, nomFichierAuditParcelle, type FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { partagerFichier } from '../../../shell/partage.js';
import { creerAnalyseClaude, decoderImageNavigateur, fabriqueImagesNavigateur, idAuditAnalyse, type AnalyseClaude, type ContexteAnalyse } from './analyseClaude.js';
import { renforcerFacades } from './entreesRenfort.js';
import type { IdentiteAnalyse } from './entreesAnalyse.js';
import { chercherCoins } from '../../../zones/releve/rechercheCoins.js';
import { versJpeg } from '../../../ui/releve/camera.js';
import { limitesDesParcelles } from '../../../render/couleurMurPhoto.js';
import type { DependancesMesures } from './mesures.js';
import type { ClientAudits } from '../../../io/auditsServeur.js';
import type { GrilleRelief } from '../../../model/relief.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { FacadeDevant } from '../../../facade/priseDeVue.js';
import type { PhotoCas, PrisePhoto } from '../../../model/audit.js';
import type { EtatApp } from '../../../core/state.js';
import type { PtBrut } from '../../../model/types.js';

/** La facade devant vous ne se recherche que si la boussole a tourne d'au moins cela : elle tremble. */
const PAS_RECONNAISSANCE_DEG = 2;
/** Les facades ecartees (« Ce n'est pas cette façade ») le restent tant qu'on ne s'est pas deplace de cela. */
const DEPLACEMENT_OUBLI_M = 5;
/** Une photo de 4:3 en paysage, pour le plan de prise : le nombre de photos ne depend que des proportions. */
const PHOTO_TYPE = { l: 4000, h: 3000 };

export interface ContexteAuditParcelle {
  etat: EtatApp;
  idu: string;
  ouvrir3d: () => void;
  signaler: (message: string) => void;
  suivre?: typeof suivrePositionGps;
  boussole?: { suivre: typeof suivreBoussole; autoriser: typeof autoriserBoussole };
  /** Ou se range le brouillon ; par defaut IndexedDB, `null` pour ne rien garder. */
  stockage?: StockageBrouillon | null;
  delaiBrouillonMs?: number;
  questionner?: (d: DialogueChoix) => void;
  /** La facade visee, dans sa teinte : rouge a photographier, vert deja photographiee. */
  surligner?: (f: Facade | null, teinte: number) => void;
  /** Les facades deja photographiees, en vert pendant la prise ; une liste vide les retire. */
  surlignerFaites?: (murs: Facade[]) => void;
  /** La camera a hauteur d'homme de l'ecran de prise ; par defaut celle de la Vue 3D ouverte. */
  vue?: VuePieton;
  /** Ce que le doigt touche dans la Vue 3D (cle de l'objet et point du plan) ; par defaut la scene ouverte. */
  objetSous?: (ndc: { x: number; y: number }, retenir: (cle: string) => boolean) => { cle: string | null; point: PtBrut | null };
  horloge?: () => number;
  poserPosition?: (p: PtBrut, precisionM: number) => void;
  retirerPosition?: () => void;
  maintenant?: () => Date;
  /** L'historique, le rendu et la Vue 3D, pour valider les propositions (§14) ; absent dans les tests de la capture. */
  projet?: ProjetAudit;
  /** Ce que les mesures des facades demandent (§13.1) ; par defaut, le worker du releve et le canevas. */
  mesures?: DependancesMesures;
  /** Le client des routes `admin/audits` (partage pour le corpus, §15) ; null ou absent : rien ne part. */
  audits?: () => ClientAudits | null;
  /** L'administrateur ecrit toujours le fichier de l'audit (§15) ; un utilisateur le partage par la case. */
  admin?: () => boolean;
  /** La sauvegarde sur le serveur pendant la capture (§15) : delais et horloge, pour les tests. */
  sauvegarde?: Partial<Pick<DependancesSauvegarde, 'delaiMs' | 'reessaisMs' | 'tailleMax' | 'planifier' | 'surReseau'>>;
  partager?: typeof partagerFichier;
  lireGrille?: EntreesEcriture['lireGrille'];
  /**
   * L'analyse par Claude (§13.2, lot L17) : le client des routes du serveur (null hors plateforme et
   * hors admin), l'identite de la parcelle pour le journal, et ce qui dessine les images (par defaut
   * le navigateur). Absente dans les tests de la capture : l'analyse est alors indisponible.
   */
  analyse?: Pick<ContexteAnalyse, 'client'> & { identite?: () => Omit<IdentiteAnalyse, 'audit'> } & Partial<Pick<ContexteAnalyse, 'images' | 'notifier' | 'preparerNotification' | 'memoire' | 'delaiSuiviMs' | 'planifier' | 'renforcer'>>;
}

/** `propositions` : la phase 3, posee sur la Vue 3D comme l'ecran de prise (§14). */
export type EcranAudit = 'liste' | 'prise' | 'propositions';
export type EtatPosition = 'attente' | 'refusee' | 'horsPlan' | 'ok';

/** La facade ou la prochaine photo se rangera, et comment on la connait. */
export interface CibleFacade {
  cle: string;
  cote: number;
  facade: Facade;
  /** « la façade sud de Maison » */
  nom: string;
  /** La distance au mur, quand la position la donne. */
  distance: number | null;
  /** Choisie dans la liste ou touchee dans la 3D, plutot que reconnue. */
  choisie: boolean;
  photos: number;
  /** « Une photo suffit », « 3 photos, de gauche à droite » (§12.2), avec le gros plan du parement. */
  plan: string | null;
}

export interface SessionAuditParcelle {
  readonly capture: CaptureEnCours;
  /** Les mesures devenues propositions, et leur validation (phases 2 et 3, §13.1 et §14). */
  readonly validation: Validation;
  /** L'analyse par Claude (§13.2) : accord, envoi, suivi, resultats. */
  readonly analyse: AnalyseClaude;
  /** « Partager cet audit pour améliorer Plan » (§15, decision D7). */
  readonly corpus: Corpus;
  /** La sauvegarde sur le serveur de Plan, pendant la capture (§15) : « Envoyer l'audit au serveur ». */
  readonly sauvegarde: Sauvegarde;
  /** Le fichier de l'audit, tel qu'il se partage (§15). */
  fichier(): Promise<FichierAuditParcelle>;
  /** L'administrateur ecrit le fichier de l'audit (un audit fait pour un client, §15). */
  fichierDisponible(): boolean;
  partagerLeFichier(): Promise<void>;
  /**
   * Reprend un fichier d'audit de cette parcelle la ou il en etait : a la phase 3 (sa capture, ses
   * mesures et ses cases) si la capture etait terminee, sur la liste de controle sinon. Une capture
   * en cours sur l'appareil n'est remplacee qu'apres confirmation ; `pret` ensuite. `depot` : le
   * depot du serveur d'ou vient le fichier (catalogue de l'administrateur), que la sauvegarde
   * remplacera desormais au lieu d'en creer un autre.
   */
  importer(f: FichierAuditParcelle, pret: () => void, depot?: EnvoiCorpus): Promise<void>;
  liste(): ListeDeControle;
  ecran(): EcranAudit;
  montrer(e: EcranAudit): void;
  cible(): CibleFacade | null;
  position(): { etat: EtatPosition; precisionM: number | null; boussole: boolean };
  /** Ou vous etes et vers ou pointe le telephone, pour la photo. */
  prise(): PrisePhoto | null;
  /** Depuis la liste : la prochaine photo ira sur cette facade, et l'ecran de prise s'ouvre. */
  photographier(cle: string, cote: number): void;
  /** Revient a la facade reconnue par la position. */
  suivreLaPosition(): void;
  /** « Ce n'est pas cette façade » : la suivante parmi celles devant vous. */
  pasCetteFacade(): void;
  /** Le doigt touche la Vue 3D pendant la prise : la facade touchee devient celle de la prochaine photo. */
  toucher(ndc: { x: number; y: number }): void;
  /** Un doigt fait tourner la Vue 3D : elle reste ou il l'a mise un moment avant de reprendre le suivi. */
  lacherVue(): void;
  /** Une scene vient d'etre batie : la camera de la prise s'y repose. */
  sceneBatie(): void;
  /** Le haut de l'ecran de prise, en pixels de la fenetre (null : rien ne cache la vue) : la Vue 3D cadre au-dessus. */
  cadrerVue(hautEcranPx: number | null): void;
  /** Range la photo sur la facade visee ; null s'il n'y en a pas (ou plus de place). */
  rangerPhoto(photo: PhotoCas): { cle: string; cote: number } | null;
  /** La phrase de la derniere photo rangee : « Photo rangée sur la façade sud de Maison (2 photos). » */
  dernierRangement(): string | null;
  lancerAnalyse(): void;
  /** Les capteurs s'arretent (l'ecran est ferme) ; `reprendre` les relance. */
  suspendre(): void;
  reprendre(): void;
  /** Demande la boussole (Safari) : a appeler dans le geste qui ouvre l'audit. */
  autoriserBoussole(): void;
  /** Le brouillon, tout de suite : l'ecran se verrouille, l'onglet passe en arriere-plan. */
  ecrireBrouillon(): Promise<boolean>;
  /** A l'ouverture : propose de reprendre le brouillon de cette parcelle, puis appelle `pret`. */
  proposerReprise(pret: () => void): Promise<void>;
  abonner(f: () => void): () => void;
}

const MESSAGES_BROUILLON: Record<RaisonEchec, string> = {
  indisponible: 'Cet appareil ne garde pas le brouillon de l’audit (navigation privée ou stockage bloqué) : terminez la capture avant de fermer l’onglet.',
  plein: 'Plus de place sur l’appareil pour le brouillon de l’audit : libérez de la place pour garder vos photos.',
};

export const MESSAGES_GPS_PARCELLE: Record<SansPosition['raison'], string> = {
  refusee: 'Position refusée : autorisez la localisation pour ce site, ou choisissez la façade dans la liste.',
  indisponible: 'Position momentanément indisponible : elle reviendra dès que le GPS captera.',
  delai: 'La position tarde à venir : elle s’affichera dès que le GPS répondra.',
};

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** « Une photo suffit, plus un gros plan du parement » : le plan de prise d'un mur, a cette distance (§7). */
export function textePlanDePrise(f: Facade, distance: number): string {
  const p = planDePrise(f.largeur, f.hauteur, distance, PHOTO_TYPE.l, PHOTO_TYPE.h, focalePx(PHOTO_TYPE.l, PHOTO_TYPE.h));
  const combien = p.photos <= 1 ? 'Une photo suffit' : p.photos + ' photos, de gauche à droite';
  const recul = p.hauteurTient ? '' : ' ; reculez pour cadrer la hauteur';
  return combien + ', plus un gros plan du parement' + recul + '.';
}

/** La question posee quand une capture de cette parcelle est restee sur l'appareil. */
export function questionRepriseParcelle(c: CaptureParcelle, reprendre: () => void, jeter: () => void, abandonner: () => void): DialogueChoix {
  const debut = new Date(c.debut);
  const photos = photosDeLaCapture(c).length;
  return {
    type: 'choix',
    titre: 'Un audit de la parcelle est resté en cours',
    texte: 'L’audit commencé le ' + jourDe(debut) + ' est gardé sur cet appareil'
      + (photos ? ' : ' + pluriel(photos, 'photo') : '') + (c.phase === 'analyse' ? ', capture terminée' : '') + '.',
    principal: { libelle: 'Reprendre l’audit du ' + jourDe(debut), executer: reprendre },
    secondaire: { libelle: 'Le jeter', executer: jeter },
    abandonner,
  };
}

/**
 * Le GPS et la boussole : la position dans le plan (lissee, et ramenee sur la parcelle quand elle
 * tombe chez un voisin : positionFiltree.ts), le cap (boussole, sinon sens de la marche), l'attitude.
 */
function capteurs(ctx: ContexteAuditParcelle, change: (quoi: 'position' | 'cap') => void) {
  let position: PtBrut | null = null, gps: PositionGps | null = null, precision: number | null = null;
  const filtre = filtrePosition();
  const horloge = ctx.horloge ?? (() => Date.now());
  let etat: EtatPosition = 'attente';
  let capBoussole: number | null = null, capMarche: number | null = null, pointDeCap: PtBrut | null = null;
  let attitude: Attitude | null = null;
  let arretGps: (() => void) | null = null, arretBoussole: (() => void) | null = null;
  const poser = ctx.poserPosition ?? poserPositionGps;
  function surGps(g: PositionGps): void {
    const brute = positionDansLePlan(ctx.etat.objects, g);
    if (!brute) { etat = 'horsPlan'; change('position'); return; }
    const lisse = filtre.ajouter(brute, g.precisionM, g.t ?? horloge());
    const p = surLaParcelle(ctx.etat.objects, lisse.p, lisse.precisionM);
    gps = g; position = p; precision = lisse.precisionM; etat = 'ok';
    if (!pointDeCap) pointDeCap = p;
    const c = capDuDeplacement(pointDeCap, p);
    if (c !== null) { capMarche = c; pointDeCap = p; }
    poser(p, lisse.precisionM);
    change('position');
  }
  return {
    position: () => position,
    gps: () => gps,
    /** La precision de la position lissee, en metres. */
    precision: () => precision,
    etat: () => etat,
    capBoussole: () => capBoussole,
    cap: () => capBoussole ?? capMarche,
    attitude: () => attitude,
    demarrer(): void {
      if (!arretGps) {
        arretGps = (ctx.suivre ?? suivrePositionGps)(surGps, (e) => {
          if (e.raison === 'refusee') { etat = 'refusee'; change('position'); }
          ctx.signaler(MESSAGES_GPS_PARCELLE[e.raison]);
        });
      }
      if (!arretBoussole) {
        const b = ctx.boussole ?? { suivre: suivreBoussole, autoriser: autoriserBoussole };
        arretBoussole = b.suivre((c) => { capBoussole = lisserCap(capBoussole, c); change('cap'); }, (a) => { attitude = a; });
      }
    },
    /**
     * Safari ne donne la boussole qu'apres une autorisation demandee pendant un geste : a appeler
     * dans le geste meme (la commande, « Photographier en marchant »), avant toute attente.
     */
    autoriser(): void { void (ctx.boussole?.autoriser ?? autoriserBoussole)().catch(() => false); },
    arreter(): void {
      arretGps?.(); arretGps = null; arretBoussole?.(); arretBoussole = null;
      // Au retour, on peut etre ailleurs : le lissage repart de la premiere position.
      filtre.oublier();
      (ctx.retirerPosition ?? retirerPositionGps)();
    },
  };
}

/** La prise de vue d'une photo : la position (repere du plan et degres), sa precision, le cap et l'attitude. */
function priseDe(c: ReturnType<typeof capteurs>, maintenant: Date): PrisePhoto | null {
  const p = c.position(), g = c.gps();
  if (!p || !g) return null;
  const r = (v: number, n: number) => Math.round(v * n) / n;
  const boussole = c.capBoussole(), cap = c.cap(), a = c.attitude();
  return {
    t: maintenant.toISOString(), x: r(p.x, 10), y: r(p.y, 10), lat: r(g.lat, 1e7), lon: r(g.lon, 1e7), precisionM: g.precisionM,
    azimutDeg: cap === null ? null : Math.round(cap) % 360, sourceAzimut: boussole !== null ? 'boussole' : cap !== null ? 'deplacement' : null,
    inclinaisonDeg: a?.inclinaisonDeg ?? null, roulisDeg: a?.roulisDeg ?? null,
  };
}

/** Le brouillon de la capture : ecrit un peu apres chaque geste, une note tapee ne fait qu'une ecriture. */
function brouillonDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, apresReprise: () => void = () => {}) {
  const stockage = ctx.stockage === undefined ? stockageNavigateur() : ctx.stockage;
  const brouillon = creerBrouillonParcelle(stockage, { surEchec: (r) => ctx.signaler(MESSAGES_BROUILLON[r]) });
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  /** Rien n'est ecrit avant que la question de la reprise ait sa reponse : on ecraserait le brouillon. */
  let pret = false;
  const vider = async () => { if (minuteur !== null) clearTimeout(minuteur); minuteur = null; return pret ? brouillon.ecrire(capture.lire()) : false; };
  capture.abonner(() => {
    if (!pret || !brouillon.disponible) return;
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = setTimeout(() => { void vider(); }, ctx.delaiBrouillonMs ?? 800);
  });
  return {
    vider,
    async proposer(pretAOuvrir: () => void): Promise<void> {
      if (pret) { pretAOuvrir(); return; }
      const lu = await brouillon.lire(capture.lire().id).catch(() => null);
      const fin = () => { pret = true; pretAOuvrir(); };
      if (!lu || !photosDeLaCapture(lu.capture).length && !Object.keys(lu.capture.batiments).length) { fin(); return; }
      (ctx.questionner ?? ((d) => dialogues.ouvrir(d)))(questionRepriseParcelle(lu.capture, () => {
        capture.remplacer(lu.capture);
        const perdues = lu.photosManquantes;
        ctx.signaler('Audit du ' + jourDe(new Date(lu.capture.debut)) + ' repris' + (perdues ? ' (' + pluriel(perdues, 'photo') + ' introuvable' + (perdues > 1 ? 's' : '') + ')' : '') + '.');
        fin();
        apresReprise();
      }, () => { void brouillon.jeter(lu.capture.id); fin(); }, fin));
    },
    /**
     * Un fichier importe remplace la capture : celle de la page et celle du brouillon. S'il y avait
     * quelque chose, la question est posee d'abord ; rien n'est perdu sans un geste.
     */
    async remplacer(nouvelle: CaptureParcelle, fait: () => void): Promise<void> {
      const lu = pret ? null : await brouillon.lire(capture.lire().id).catch(() => null);
      const appliquer = () => { pret = true; capture.remplacer(nouvelle); void vider(); fait(); };
      const deja = [capture.lire(), lu?.capture].find((c) => c && (photosDeLaCapture(c).length || Object.keys(c.batiments).length || c.decisions?.length));
      if (!deja) { appliquer(); return; }
      (ctx.questionner ?? ((q) => dialogues.ouvrir(q)))(questionRemplacement(deja, appliquer));
    },
  };
}

/** La question posee avant qu'un fichier importe remplace un audit garde sur l'appareil. */
export function questionRemplacement(c: CaptureParcelle, remplacer: () => void): DialogueChoix {
  const photos = photosDeLaCapture(c).length;
  return {
    type: 'choix',
    titre: 'Remplacer l’audit en cours ?',
    texte: 'L’audit commencé le ' + jourDe(new Date(c.debut)) + (photos ? ' (' + pluriel(photos, 'photo') + ')' : '')
      + ' est gardé sur cet appareil. Le fichier importé le remplace.',
    principal: { libelle: 'Remplacer par le fichier', executer: remplacer },
    secondaire: { libelle: 'Garder l’audit en cours', executer: () => {} },
    abandonner: () => {},
  };
}

/** Sans projet branche (tests de la capture), rien ne s'ecrit : l'apercu et la validation restent muets. */
const PROJET_MUET: ProjetAudit = { pushHistory: () => {}, render: () => {}, refaire3d: () => {}, remplacer3d: () => false };

/**
 * La validation de la session, avec les dependances du navigateur par defaut ; l'analyse y ajoute ses
 * reponses, et le partage pour le corpus part apres chaque validation.
 */
function validationDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, liste: () => ListeDeControle, maintenant: () => Date, analyse: () => AnalyseClaude, apresValidation: () => void): Validation {
  return creerValidation({
    etat: ctx.etat, capture, liste, signaler: ctx.signaler, maintenant, apresValidation,
    projet: ctx.projet ?? PROJET_MUET,
    mesures: ctx.mesures ?? { chercherCoins, jpeg: (img) => versJpeg(img), limites: () => limitesDesParcelles(ctx.etat.objects) },
    analyse: { reponses: () => analyse().reponses(), version: () => analyse().version(), renfort: () => analyse().renfort() },
  });
}

/** L'analyse par Claude de la session : indisponible sans client (tests de la capture, hors plateforme). */
function analyseDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, validation: () => Validation, maintenant: () => Date): AnalyseClaude {
  const a = ctx.analyse;
  return creerAnalyseClaude({
    capture, signaler: ctx.signaler, maintenant,
    entrees: () => validation().entrees(),
    mesuresPretes: () => validation().lancer(),
    client: a?.client ?? null,
    // L'audit du journal : la parcelle et l'heure du debut, pour distinguer deux audits du meme jour.
    identite: () => ({ ...(a?.identite?.() ?? { projet: null, idu: ctx.idu, adresse: null }), audit: idAuditAnalyse(capture.lire()) }),
    images: a?.images ?? fabriqueImagesNavigateur(),
    // Le renfort des facades (lot L18) : ses graines recalees sur l'elevation de chaque facade mesuree.
    renforcer: a?.renforcer ?? ((par) => renforcerFacades(par, validation().entrees().mesures, decoderImageNavigateur)),
    ...(a?.notifier ? { notifier: a.notifier } : {}),
    ...(a?.preparerNotification ? { preparerNotification: a.preparerNotification } : {}),
    ...(a?.memoire ? { memoire: a.memoire } : {}),
    ...(a?.delaiSuiviMs !== undefined ? { delaiSuiviMs: a.delaiSuiviMs } : {}),
    ...(a?.planifier ? { planifier: a.planifier } : {}),
  });
}

/** Le fichier de l'audit (§15) : l'ecrire d'apres la session, et le partager par le telephone. */
function fichierDe(ctx: ContexteAuditParcelle, capture: CaptureEnCours, liste: () => ListeDeControle, validation: Validation, maintenant: () => Date) {
  // La sauvegarde ecrit le fichier apres chaque rafale de photos : la grille LiDAR d'un batiment ne
  // se relit pas a chaque fois (contour inchange, meme grille). Un echec n'est pas garde : le
  // prochain fichier la redemande.
  const grilles = new Map<string, Promise<GrilleRelief | null>>();
  const lire = ctx.lireGrille ?? lireGrilleSous;
  const lireGrille: NonNullable<EntreesEcriture['lireGrille']> = (pts, proj) => {
    const cle = JSON.stringify(pts);
    let g = grilles.get(cle);
    if (!g) {
      g = lire(pts, proj).catch(() => null).then((r) => { if (!r) grilles.delete(cle); return r; });
      grilles.set(cle, g);
    }
    return g;
  };
  const ecrire = () => ecrireFichierAudit({
    objets: ctx.etat.objects, capture: capture.lire(), liste: liste(), mesures: validation.mesuresFaites(),
    propositions: validation.propositions(), maintenant: maintenant(), lireGrille,
  });
  return {
    ecrire,
    async partager(): Promise<void> {
      const f = await ecrire();
      const nom = nomFichierAuditParcelle(maintenant(), f.parcelle.idu);
      const issue = await (ctx.partager ?? partagerFichier)(nom, JSON.stringify(f), 'Audit de la parcelle ' + f.parcelle.idu);
      if (issue === 'partage') ctx.signaler('Fichier de l’audit partagé : ' + nom + '.');
      else if (issue === 'telecharge') ctx.signaler('Fichier de l’audit téléchargé : ' + nom + '.');
    },
  };
}

export function creerSessionAuditParcelle(ctx: ContexteAuditParcelle): SessionAuditParcelle {
  const maintenant = ctx.maintenant ?? (() => new Date());
  const capture = creerCapture(ctx.idu, maintenant);
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  let ecran: EcranAudit = 'liste';
  let dernier: string | null = null;
  /** La liste ne se recalcule que si la capture ou les objets du plan ont change. */
  let memo: { version: number; objets: unknown; liste: ListeDeControle } | null = null;
  const liste = (): ListeDeControle => {
    if (memo && memo.version === capture.version() && memo.objets === ctx.etat.objects) return memo.liste;
    memo = { version: capture.version(), objets: ctx.etat.objects, liste: listeDeControle(ctx.etat.objects, capture.lire()) };
    return memo.liste;
  };
  const visee = viseeDe(ctx, liste, publier);
  const sens = capteurs(ctx, (quoi) => { visee.capteurs(sens, quoi); vue.faites(); vue.suivre(); });
  const vue = vueDe(ctx, sens, visee, liste);
  // Un brouillon repris avec un batch en cours : son suivi repart ; la sauvegarde le remet a jour.
  const brouillon = brouillonDe(ctx, capture, () => { analyse.reprendre(); sauvegarde.planifier(); });
  // L'analyse lit les mesures de la validation, la validation lit les reponses de l'analyse : chacune
  // recoit l'autre par une fonction, posee apres les deux creations. Le partage part apres chaque
  // validation ; il lit le fichier, qui lit la validation : lie de meme.
  let validation: Validation, analyse: AnalyseClaude, corpus: Corpus | null = null, sauvegarde: Sauvegarde;
  analyse = analyseDe(ctx, capture, () => validation, maintenant);
  validation = validationDe(ctx, capture, liste, maintenant, () => analyse, () => { void corpus?.envoyer(); });
  const fichier = fichierDe(ctx, capture, liste, validation, maintenant);
  const admin = () => ctx.admin?.() ?? false;
  sauvegarde = creerSauvegarde({
    capture, client: ctx.audits ?? (() => null), fichier: fichier.ecrire, maintenant, ...ctx.sauvegarde,
    // L'administrateur, ou l'accord du partage (D7) : sans lui, rien ne part sans le bouton.
    automatique: () => admin() || partageDe(capture.lire()).accord,
  });
  corpus = creerCorpus({
    capture, client: ctx.audits ?? (() => null), fichier: fichier.ecrire, signaler: ctx.signaler, maintenant,
    // Un utilisateur qui decoche reprend son accord : sa sauvegarde quitte le serveur avec le partage.
    apresRevocation: () => { if (!admin()) void sauvegarde.retirer(); },
  });
  // Une photo de plus ou de moins : la sauvegarde part quelques secondes apres. Une capture remplacee
  // (brouillon repris, fichier importe : un autre debut) n'est pas un geste de la visite.
  let photos = { debut: capture.lire().debut, signature: signaturePhotos(capture.lire()) };
  capture.abonner(() => {
    const c = capture.lire(), signature = signaturePhotos(c);
    if (signature !== photos.signature && c.debut === photos.debut) sauvegarde.planifier();
    photos = { debut: c.debut, signature };
  });
  capture.abonner(() => { visee.reconnaitre(sens); vue.faites(); publier(); });
  validation.abonner(publier);
  analyse.abonner(publier);
  corpus.abonner(publier);
  sauvegarde.abonner(publier);

  return {
    capture,
    validation,
    analyse,
    corpus,
    sauvegarde,
    fichier: fichier.ecrire,
    fichierDisponible: () => ctx.admin?.() ?? false,
    partagerLeFichier: fichier.partager,
    async importer(f, pret, depot) {
      const nouvelle = captureDuFichier(f);
      await brouillon.remplacer(depot ? { ...nouvelle, sauvegarde: { ...depot } } : nouvelle, () => {
        validation.poserMesures(mesuresDuFichier(f));
        const d = derniereDecision(f);
        if (d) validation.preregler(d);
        pret();
      });
    },
    liste,
    ecran: () => ecran,
    montrer(e) {
      // Les capteurs demarrent ici aussi : un audit importe (§15) s'ouvre sans eux, sur les propositions.
      if (e === 'prise') { sens.autoriser(); sens.demarrer(); ctx.ouvrir3d(); }
      vue.activer(e === 'prise');
      // Les propositions se montrent sur la Vue 3D, et les mesures commencent des que l'ecran s'ouvre.
      if (e === 'propositions') { ctx.ouvrir3d(); void validation.lancer(); } else validation.oublierApercu();
      ecran = e;
      publier();
    },
    cible: () => visee.cible(capture),
    position: () => ({ etat: sens.etat(), precisionM: sens.precision(), boussole: sens.capBoussole() !== null }),
    prise: () => priseDe(sens, maintenant()),
    photographier(cle, cote) { sens.autoriser(); sens.demarrer(); visee.choisir(cle, cote); ecran = 'prise'; ctx.ouvrir3d(); vue.activer(true); publier(); },
    suivreLaPosition() { visee.choisir(null, null); visee.reconnaitre(sens); vue.faites(); vue.suivre(true); publier(); },
    pasCetteFacade() { const m = visee.ecarter(sens); if (m) ctx.signaler(m); vue.faites(); vue.suivre(true); publier(); },
    toucher(ndc) {
      if (ecran !== 'prise') return;
      const r = vue.toucher(ndc);
      if (r && r !== 'choisie') ctx.signaler(r);
      if (r === 'choisie') publier();
    },
    lacherVue: () => vue.lacher(),
    sceneBatie() { if (ecran === 'prise') vue.suivre(true); },
    cadrerVue: (haut) => vue.cadrer(haut),
    rangerPhoto(photo) {
      const c = visee.cible(capture);
      if (!c) return null;
      if (!capture.ajouterPhotoFacade(c.cle, c.cote, photo)) { ctx.signaler('Cette façade a déjà toutes ses photos : retirez-en une depuis la liste.'); return null; }
      dernier = 'Photo rangée sur ' + c.nom + ' (' + pluriel(c.photos + 1, 'photo') + ').';
      publier();
      return { cle: c.cle, cote: c.cote };
    },
    dernierRangement: () => dernier,
    lancerAnalyse() {
      capture.terminer();
      void brouillon.vider();
      ctx.signaler('Capture terminée : elle est gardée sur cet appareil, et vos mesures deviennent des propositions.');
      // La capture finie part au serveur tout de suite : c'est elle que l'analyse reprendra.
      if (sauvegarde.etat().automatique) void sauvegarde.envoyer();
      // Avec l'accord deja donne, les photos partent (et le toast le rappelle) ; sinon l'ecran pose la question.
      void analyse.lancer();
    },
    suspendre() { sens.arreter(); visee.oublier(); vue.activer(false); validation.oublierApercu(); },
    // Le plan a pu changer pendant que l'ecran etait ferme (un batiment modifie) : la liste se recalcule.
    reprendre() { memo = null; sens.demarrer(); visee.reconnaitre(sens); if (ecran === 'prise') vue.activer(true); },
    autoriserBoussole: () => sens.autoriser(),
    ecrireBrouillon: () => brouillon.vider(),
    proposerReprise: (pret) => brouillon.proposer(pret),
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}

/**
 * La facade visee : reconnue par la position et le cap, ou choisie dans la liste. Surlignee en 3D
 * des qu'elle change ; les facades ecartees sont oubliees quand on s'est deplace.
 */
function viseeDe(ctx: ContexteAuditParcelle, liste: () => ListeDeControle, publier: () => void) {
  const surligner = ctx.surligner ?? ((f: Facade | null, teinte: number) => poserFacadeDevant(f, teinte));
  let reconnue: FacadeDevant | null = null;
  let choisie: { cle: string; cote: number } | null = null;
  let capReconnu: number | null = null;
  const ecartees = new Set<string>();
  let ecartDepuis: PtBrut | null = null;
  let surlignee: string | null = null;
  type Sens = ReturnType<typeof capteurs>;

  const proposees = (sens: Sens): FacadeDevant[] => {
    const p = sens.position();
    if (!p) return [];
    const { batiments, obstacles } = entreesReconnaissance(ctx.etat.objects, liste().batiments, p);
    return facadesProposees(p, sens.cap(), batiments, obstacles);
  };
  /**
   * La facade a surligner : la choisie, sinon la reconnue. Rouge tant qu'elle n'a pas de photo, verte
   * ensuite : rouge sur vert faisait du brun (essai d'AE 101), et une facade photographiee doit se
   * voir comme telle, visee ou non. Le surlignage ne bouge que si la facade ou sa teinte change.
   */
  function surlignerCourante(): void {
    const f = cibleFacade();
    const teinte = f && estPhotographiee(f.cle, f.facade.cote) ? VERT_FACADE : ROUGE_FACADE;
    const cle = f ? cleFacade(f.cle, f.facade.cote) + '/' + teinte : null;
    if (cle === surlignee) return;
    surlignee = cle;
    surligner(f ? f.facade : null, teinte);
  }
  const estPhotographiee = (cle: string, cote: number) =>
    liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === cote)?.statut === 'photographiee';
  /** La facade telle qu'on la montre : son mur jusque sous le toit, par morceaux (liste.ts, `profilMur`). */
  const montree = (cle: string, f: Facade): Facade => {
    const l = liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === f.cote);
    return l ? facadeMontree(l) : f;
  };
  function cibleFacade(): { cle: string; facade: Facade; distance: number | null } | null {
    if (choisie) {
      const { cle, cote } = choisie;
      const f = liste().batiments.find((b) => b.cle === cle)?.facades.find((x) => x.cote === cote);
      return f ? { cle, facade: montree(cle, f.facade), distance: reconnue && reconnue.cle === cle && reconnue.facade.cote === cote ? reconnue.distance : null } : null;
    }
    return reconnue ? { cle: reconnue.cle, facade: montree(reconnue.cle, reconnue.facade), distance: reconnue.distance } : null;
  }
  function reconnaitre(sens: Sens): void {
    capReconnu = sens.cap();
    const p = sens.position();
    if (p && ecartDepuis && Math.hypot(p.x - ecartDepuis.x, p.y - ecartDepuis.y) > DEPLACEMENT_OUBLI_M) { ecartees.clear(); ecartDepuis = null; }
    reconnue = facadeRetenue(proposees(sens), ecartees);
    surlignerCourante();
  }
  return {
    reconnaitre,
    capteurs(sens: Sens, quoi: 'position' | 'cap'): void {
      const cap = sens.cap();
      if (quoi === 'cap' && capReconnu !== null && cap !== null && Math.abs(ecartCap(capReconnu, cap)) < PAS_RECONNAISSANCE_DEG) return;
      reconnaitre(sens);
      publier();
    },
    choisir(cle: string | null, cote: number | null): void {
      choisie = cle !== null && cote !== null ? { cle, cote } : null;
      surlignerCourante();
    },
    /** Ecarte la facade reconnue ; rend la phrase a dire quand il n'y en a pas d'autre. */
    ecarter(sens: Sens): string | null {
      if (choisie) { choisie = null; reconnaitre(sens); return null; }
      if (!reconnue) return 'Aucune façade reconnue devant vous : touchez-la dans la 3D, ou choisissez-la dans la liste.';
      const actuelle = cleFacade(reconnue.cle, reconnue.facade.cote);
      ecartees.add(actuelle);
      ecartDepuis ??= sens.position();
      const toutes = proposees(sens);
      let suivante = facadeRetenue(toutes, ecartees);
      // Toutes ecartees : on repart du debut de la liste, sans la facade refusee a l'instant.
      if (!suivante) { ecartees.clear(); ecartees.add(actuelle); suivante = facadeRetenue(toutes, ecartees); }
      if (!suivante) { ecartees.clear(); return 'Aucune autre façade devant vous : touchez-la dans la 3D, ou choisissez-la dans la liste.'; }
      reconnue = suivante;
      surlignerCourante();
      return null;
    },
    cible(capture: CaptureEnCours): CibleFacade | null {
      const f = cibleFacade();
      if (!f) return null;
      const ligne = liste().batiments.find((b) => b.cle === f.cle);
      const photos = capture.lire().batiments[f.cle]?.facades[String(f.facade.cote)]?.photos.length ?? 0;
      return {
        cle: f.cle, cote: f.facade.cote, facade: f.facade, nom: 'la façade ' + f.facade.orientation.toLowerCase() + ' de ' + (ligne?.nom ?? f.cle),
        distance: f.distance, choisie: !!choisie, photos, plan: f.distance !== null ? textePlanDePrise(f.facade, f.distance) : null,
      };
    },
    oublier(): void { reconnue = null; surlignee = null; surligner(null, ROUGE_FACADE); },
    facade: (): Facade | null => cibleFacade()?.facade ?? null,
    /** La cle de la facade visee (batiment et cote), ou null. */
    cleVisee: (): string | null => { const f = cibleFacade(); return f ? cleFacade(f.cle, f.facade.cote) : null; },
  };
}

/** Une ligne de la liste, telle que la Vue 3D la montre : le mur jusque sous le toit, et son haut par morceaux. */
const facadeMontree = (l: LigneFacade): Facade => ({ ...l.facade, hauteur: l.hauteurMur, profil: l.profilMur } as Facade);

/** Sans position, une facade se regarde d'ici : devant son milieu, a la distance d'une photo. */
const DISTANCE_STATION_M = 8;
const stationDevant = (f: Facade): PtBrut => ({
  x: (f.gauche.x + f.droite.x) / 2 + f.normale.x * DISTANCE_STATION_M,
  y: (f.gauche.y + f.droite.y) / 2 + f.normale.y * DISTANCE_STATION_M,
});

/**
 * La Vue 3D de la prise (vuePrise.ts) : posee a chaque position et a chaque cap tant que l'ecran de
 * prise est ouvert ; le doigt y choisit une facade. Rien ne bouge hors de l'ecran de prise.
 */
function vueDe(ctx: ContexteAuditParcelle, sens: ReturnType<typeof capteurs>, visee: ReturnType<typeof viseeDe>, liste: () => ListeDeControle) {
  const suivi = suiviPieton(ctx.vue ?? vuePieton(), ctx.horloge);
  /**
   * Ce qui borne le recul de la camera : les batiments, et la limite de la parcelle (sa cloture, qui
   * cachait le bas de la facade quand la camera passait derriere, AE 101). Recalcules quand le plan change.
   */
  let murs: { objets: unknown; contours: PtBrut[][] } | null = null;
  const contours = (): PtBrut[][] => {
    if (murs?.objets !== ctx.etat.objects) {
      const parcelle = parcelleDuProjet(ctx.etat.objects);
      const batis = ctx.etat.objects.filter((o) => estBatiment(o) && aDesSommets(o)).map((o) => (o as { pts: PtBrut[] }).pts);
      murs = { objets: ctx.etat.objects, contours: parcelle && aDesSommets(parcelle) ? [...batis, parcelle.pts] : batis };
    }
    return murs.contours;
  };
  const suivre = (force = false) => {
    const f = visee.facade(), p = sens.position();
    // Sans position encore (le GPS cherche), une facade choisie se montre depuis un point devant elle.
    if (!p && f) { suivi.suivre(stationDevant(f), null, f, force, contours()); return; }
    suivi.suivre(p, sens.cap(), f, force, contours());
  };
  const poserFaites = ctx.surlignerFaites ?? poserFacadesFaites;
  let faitesPosees: string | null = null;
  /**
   * En vert, les facades qui ont deja une photo : on voit ce qui reste, et on peut les reprendre. La
   * facade visee n'y est pas : son propre surlignage la dit (verte si elle a deja une photo). Les
   * voiles ne sont refaits que si la liste change, pas a chaque mouvement de la boussole.
   */
  const faites = () => {
    const visee_ = visee.cleVisee();
    const lignes = suivi.actif() ? liste().batiments.flatMap((b) => b.facades.filter((f) => f.statut === 'photographiee' && cleFacade(b.cle, f.cote) !== visee_).map((f) => ({ cle: cleFacade(b.cle, f.cote), facade: facadeMontree(f) }))) : [];
    const cle = lignes.map((l) => l.cle).join(',');
    if (cle === faitesPosees) return;
    faitesPosees = cle;
    poserFaites(lignes.map((l) => l.facade));
  };
  return {
    suivre,
    faites,
    activer(oui: boolean): void { suivi.activer(oui); faites(); if (oui) suivre(true); },
    lacher: () => suivi.lacher(),
    /** L'ecran de prise commence la (pixels de la fenetre) : la camera cadre au-dessus, et se repose. */
    cadrer(hautEcranPx: number | null): void { suivi.cadrer(hautEcranPx); suivre(true); },
    /** La facade touchee : celle du batiment de la liste dont le mur passe le plus pres du doigt. */
    toucher(ndc: { x: number; y: number }): string | 'choisie' | null {
      if (!suivi.actif()) return null;
      // Le rayon traverse un arbre, une cloture, un batiment hors de la liste : seule compte la
      // premiere facade de la liste qu'il rencontre.
      const dansLaListe = (cle: string) => liste().batiments.some((b) => b.cle === cle);
      const { cle, point } = (ctx.objetSous ?? objetSousLePointeur)(ndc, dansLaListe);
      if (!cle || !point) return null;
      const ligne = liste().batiments.find((b) => b.cle === cle);
      if (!ligne) return 'Ce bâtiment n’est pas dans la liste de la parcelle.';
      const f = facadeTouchee(ligne.facades, point);
      if (!f) return 'Ce bâtiment n’a pas de façade à photographier.';
      visee.choisir(cle, f.cote);
      faites();
      suivre(true);
      return 'choisie';
    },
  };
}
