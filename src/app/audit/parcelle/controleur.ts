// L'audit de la parcelle du projet, phase 1 : la capture (MD/spec-audit.md §11, §12).
//
// Une session par parcelle tant que la page vit : la liste de controle (Z8 plein ecran) et l'ecran
// de prise, pose sur la Vue 3D. Pendant la prise, le GPS et la boussole reconnaissent la facade que
// vous avez devant vous (facade/calage/priseDeVue.ts, lot L2) parmi celles de la liste ; elle passe en rouge
// en 3D (three/facadeDevant3d.ts) et elle est nommee, et la photo prise (app/audit/photo.ts, lot L1)
// s'y range d'elle-meme. « Ce n'est pas cette façade » propose la suivante ; la facade se choisit aussi
// en la touchant dans la 3D, ou dans la liste. La Vue 3D est alors a hauteur d'homme et suit votre
// position et votre cap (vuePrise.ts) ; tant que rien n'est vise depuis votre position, elle montre
// tout le batiment en grand angle, pour le choix au doigt. Pendant tout l'audit, elle ne montre que
// le batiment audite et le sol (vue epuree : ni arbres, ni voisins, ni clotures).
//
// L'en-cours vit dans le brouillon local (io/brouillonAudit.ts, lot L4) : rien n'entre dans le
// projet a cette phase. « Lancer l'analyse » termine la capture ; l'analyse (§13) la reprendra.

import { suivrePositionGps, type PositionGps, type SansPosition } from '../../../shell/geolocalisation.js';
import { autoriserBoussole, suivreBoussole, lisserCap, ecartCap, type Attitude } from '../../../shell/boussole.js';
import { dialogues, type DialogueChoix } from '../../../shell/dialogues.js';
import { creerBrouillonParcelle, stockageNavigateur, type RaisonEchec, type StockageBrouillon } from '../../../io/brouillonAudit.js';
import { partageDe, photosDeLaCapture, type CaptureParcelle, type EnvoiCorpus } from '../../../model/auditParcelle.js';
import { focalePx, planDePrise } from '../../../facade/vision/cadrage.js';
import { poserFacadeDevant, poserFacadesFaites, ROUGE_FACADE, VERT_FACADE } from '../../../three/facadeDevant3d.js';
import { epurerVue3d, objetSousLePointeur } from '../../../three/scene.js';
import { affichage3d } from '../../../three/etat3d.js';
import { angleAutour, cadreDe, facadeTouchee, forceDuTrait, suiviPieton, vuePieton, type CacheVue, type VuePieton } from './vuePrise.js';
import { poserTraitDePres } from '../../../three/traitDePres.js';
import { filtrePosition, surLaParcelle } from './positionFiltree.js';
import { parcelleDuProjet } from '../../../model/fonctions.js';
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
import { chercherCoins } from '../../releve/rechercheCoins.js';
import { versJpeg } from '../../../ui/releve/camera.js';
import { limitesDesParcelles } from '../../../render/couleurMurPhoto.js';
import { cleMesure, type DependancesMesures } from './mesures.js';
import { avertissementPrise } from './redressement.js';
import type { ClientAudits } from '../../../io/auditsServeur.js';
import type { GrilleRelief } from '../../../model/relief.js';
import type { Facade } from '../../../facade/geometrie.js';
import type { FacadeDevant } from '../../../facade/calage/priseDeVue.js';
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
  /**
   * La vue epuree pendant l'audit (le batiment audite et le sol) : `garder` dit quels objets restent,
   * `null` rend tout ; par defaut la Vue 3D ouverte (three/scene.ts).
   */
  epurer?: (garder: ((cle: string) => boolean) | null) => void;
  /**
   * Le trait renforce de pres (three/traitDePres.ts) : les aretes du batiment `cle`, a cette force
   * (0 a 1) ; `null` le retire. Par defaut la Vue 3D ouverte.
   */
  trait?: (cle: string | null, force: number) => void;
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
  analyse?: Pick<ContexteAnalyse, 'client'> & { identite?: () => Omit<IdentiteAnalyse, 'audit'> } & Partial<Pick<ContexteAnalyse, 'images' | 'notifier' | 'preparerNotification' | 'memoire' | 'delaiSuiviMs' | 'planifier' | 'renforcer' | 'essai'>>;
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
   * remplacera desormais au lieu d'en creer un autre. `remesurer` : les mesures et les decisions du fichier ne sont pas
   * reprises, ses photos repassent par les mesures d'aujourd'hui (Admin › Audits, « Relancer l'analyse des photos »).
   */
  importer(f: FichierAuditParcelle, pret: () => void, depot?: EnvoiCorpus, remesurer?: boolean): Promise<void>;
  /**
   * Consultation d'un audit recu (Admin › Audits) : cette session, a part de celle de l'audit en
   * cours, ne montre que les propositions du fichier et ce qui en a ete decide, sur le meme ecran et
   * la meme Vue 3D avant / apres. Rien ne se mesure, ne se partage ni ne s'ecrit dans le projet.
   */
  consulter(f: FichierAuditParcelle, pret: () => void): void;
  /** Vrai pour une consultation : l'ecran des propositions ne laisse rien cocher ni valider. */
  lectureSeule(): boolean;
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
  /**
   * Le batiment verrouille pour la prise, ou null (§12.2). La parcelle porte parfois une annexe a
   * cote de la maison : la personne choisit « ce batiment-ci » et la prise ne vise plus que lui.
   */
  verrou(): string | null;
  /** Verrouille ce batiment, ou rend la main (`null`) : c'est un geste volontaire, jamais deduit. */
  verrouiller(cle: string | null): void;
  /** « Ce n'est pas cette façade » : la suivante parmi celles devant vous. */
  pasCetteFacade(): void;
  /** Le doigt touche la Vue 3D pendant la prise : la facade touchee devient celle de la prochaine photo. */
  toucher(ndc: { x: number; y: number }): void;
  /** Un doigt fait tourner la Vue 3D : elle reste ou il l'a mise un moment avant de reprendre le suivi. */
  lacherVue(): void;
  /** Une scene vient d'etre batie : la camera de la prise, ou l'apercu des propositions, s'y repose. */
  sceneBatie(): void;
  /**
   * Le coin haut gauche de l'ecran de prise ou des propositions, en pixels de la fenetre (null : rien
   * ne cache la vue) : la Vue 3D cadre ce qu'il laisse voir, au-dessus ou a gauche.
   */
  cadrerVue(cache: CacheVue | null): void;
  /** Range la photo sur la facade visee ; null s'il n'y en a pas (ou plus de place). */
  rangerPhoto(photo: PhotoCas): { cle: string; cote: number } | null;
  /** La phrase de la derniere photo rangee : « Photo rangée sur la façade sud de Maison (2 photos). » */
  dernierRangement(): string | null;
  /**
   * A la prise de vue, quand la facade a au moins deux photos et que leur fusion est impossible : « Fusion des photos
   * impossible : reprenez la façade avec des chevauchements entre les photos. » Null sinon, ou tant que le calcul tourne.
   */
  avertissementPrise(): string | null;
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
    // Le depot de la sauvegarde (ou du partage) sur le serveur : l'analyse y est gardee, entree et
    // sortie (spec-audit 15.5), pour que l'administrateur la relise et la compare a ses rejeux.
    identite: () => ({
      ...(a?.identite?.() ?? { projet: null, idu: ctx.idu, adresse: null }), audit: idAuditAnalyse(capture.lire()),
      depot: capture.lire().sauvegarde?.id ?? capture.lire().partage?.envoi?.id ?? null,
    }),
    images: a?.images ?? fabriqueImagesNavigateur(),
    // Le renfort des facades (lot L18) : ses graines recalees sur l'elevation de chaque facade mesuree.
    renforcer: a?.renforcer ?? ((par) => renforcerFacades(par, validation().entrees().mesures, decoderImageNavigateur)),
    ...(a?.notifier ? { notifier: a.notifier } : {}),
    ...(a?.preparerNotification ? { preparerNotification: a.preparerNotification } : {}),
    ...(a?.memoire ? { memoire: a.memoire } : {}),
    ...(a?.delaiSuiviMs !== undefined ? { delaiSuiviMs: a.delaiSuiviMs } : {}),
    ...(a?.essai ? { essai: a.essai } : {}),
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

/**
 * La fusion des photos d'une facade, verifiee a la prise de vue : des la deuxieme photo la facade se redresse et se fusionne ;
 * si elle ne le peut pas, on le dit sur place, pendant qu'on peut encore la reprendre avec des chevauchements.
 */
function fusionAPriseDe(validation: () => Validation, publier: () => void) {
  let avertissement: string | null = null;
  let suivi = 0;
  return {
    lire: () => avertissement,
    effacer() { suivi++; avertissement = null; },
    verifier(cle: string, cote: number, photos: number): void {
      avertissement = null;
      const n = ++suivi;
      if (photos < 2) return;
      void validation().rejouerRedressement(cle, cote).catch(() => 0).then(() => {
        if (n !== suivi) return;
        const bilan = validation().mesuresFaites().get(cleMesure(cle, cote))?.redressement;
        const dit = bilan ? avertissementPrise(bilan) : null;
        if (dit !== avertissement) { avertissement = dit; publier(); }
      });
    },
  };
}

export function creerSessionAuditParcelle(ctx: ContexteAuditParcelle): SessionAuditParcelle {
  const maintenant = ctx.maintenant ?? (() => new Date());
  const capture = creerCapture(ctx.idu, maintenant);
  const abonnes = new Set<() => void>();
  // Sur l'ecran des propositions, tout changement (mesures, reponses de Claude, cases) peut changer
  // l'apercu de la Vue 3D : il s'y repose, s'il a change, avant que l'ecran ne se redessine.
  const publier = () => { if (ecran === 'propositions') validation.synchroniser(); abonnes.forEach((f) => f()); };
  let ecran: EcranAudit = 'liste';
  let dernier: string | null = null;
  const fusionAPrise = fusionAPriseDe(() => validation, () => publier());
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
  // Apres « Valider », l'audit repart au serveur avec ses decisions : le partage, et la sauvegarde
  // quand elle part d'elle-meme (administrateur, ou accord du partage) ; le catalogue lit ainsi ce qui
  // a ete valide ou refuse.
  validation = validationDe(ctx, capture, liste, maintenant, () => analyse, () => { void corpus?.envoyer(); sauvegarde.planifier(); });
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
    async importer(f, pret, depot, remesurer) {
      const nouvelle = captureDuFichier(f);
      await brouillon.remplacer(depot ? { ...nouvelle, sauvegarde: { ...depot } } : nouvelle, () => {
        if (!remesurer) {
          validation.poserMesures(mesuresDuFichier(f));
          const d = derniereDecision(f);
          if (d) validation.preregler(d);
        }
        pret();
      });
    },
    consulter(f, pret) {
      capture.remplacer(captureDuFichier(f));
      validation.figer(f.propositions);
      pret();
    },
    lectureSeule: () => validation.lectureSeule(),
    liste,
    ecran: () => ecran,
    montrer(e) {
      // Les capteurs demarrent ici aussi : un audit importe (§15) s'ouvre sans eux, sur les propositions.
      if (e === 'prise') { sens.autoriser(); sens.demarrer(); ctx.ouvrir3d(); }
      // La vue s'epure des que l'audit s'ouvre, quel que soit l'ecran : elle le reste jusqu'a sa fermeture.
      vue.epurer(true);
      vue.activer(e === 'liste' ? null : e);
      // Les propositions se montrent sur la Vue 3D, et les mesures commencent des que l'ecran s'ouvre.
      if (e === 'propositions') { ctx.ouvrir3d(); void validation.lancer(); } else validation.oublierApercu();
      ecran = e;
      publier();
    },
    cible: () => visee.cible(capture),
    position: () => ({ etat: sens.etat(), precisionM: sens.precision(), boussole: sens.capBoussole() !== null }),
    prise: () => priseDe(sens, maintenant()),
    photographier(cle, cote) { fusionAPrise.effacer(); sens.autoriser(); sens.demarrer(); visee.choisir(cle, cote); ecran = 'prise'; ctx.ouvrir3d(); vue.epurer(true); vue.activer('prise'); publier(); },
    suivreLaPosition() { visee.choisir(null, null); visee.reconnaitre(sens); vue.faites(); vue.suivre(true); publier(); },
    verrou: () => visee.verrou(),
    verrouiller(cle) {
      // Un verrou sur un batiment qui n'est pas de la liste n'a pas de sens : il est refuse.
      if (cle !== null && !liste().batiments.some((b) => b.cle === cle)) return;
      visee.verrouiller(cle, sens);
      vue.faites(); vue.suivre(true); publier();
    },
    pasCetteFacade() { const m = visee.ecarter(sens); if (m) ctx.signaler(m); vue.faites(); vue.suivre(true); publier(); },
    toucher(ndc) {
      if (ecran !== 'prise') return;
      const r = vue.toucher(ndc);
      if (r && r !== 'choisie') ctx.signaler(r);
      if (r === 'choisie') publier();
    },
    lacherVue: () => vue.lacher(),
    // La camera se repose sur la scene neuve, puis les copies de « Apres » y reviennent (deux vues).
    sceneBatie() { if (ecran !== 'liste') vue.suivre(true); if (ecran === 'propositions') validation.reposer(); },
    cadrerVue: (cache) => vue.cadrer(cache),
    rangerPhoto(photo) {
      const c = visee.cible(capture);
      if (!c) return null;
      if (!capture.ajouterPhotoFacade(c.cle, c.cote, photo)) { ctx.signaler('Cette façade a déjà toutes ses photos : retirez-en une depuis la liste.'); return null; }
      dernier = 'Photo rangée sur ' + c.nom + ' (' + pluriel(c.photos + 1, 'photo') + ').';
      fusionAPrise.verifier(c.cle, c.cote, c.photos + 1);
      publier();
      return { cle: c.cle, cote: c.cote };
    },
    dernierRangement: () => dernier,
    avertissementPrise: () => fusionAPrise.lire(),
    lancerAnalyse() {
      capture.terminer();
      void brouillon.vider();
      ctx.signaler('Capture terminée : elle est gardée sur cet appareil, et vos mesures deviennent des propositions.');
      // La capture finie part au serveur tout de suite : c'est elle que l'analyse reprendra.
      if (sauvegarde.etat().automatique) void sauvegarde.envoyer();
      // Avec l'accord deja donne, les photos partent (et le toast le rappelle) ; sinon l'ecran pose la question.
      void analyse.lancer();
    },
    // L'ecran ferme rend la Vue 3D telle qu'elle etait : tous les objets, et la camera libre.
    suspendre() { sens.arreter(); visee.oublier(); vue.activer(null); vue.epurer(false); validation.oublierApercu(); },
    // Le plan a pu changer pendant que l'ecran etait ferme (un batiment modifie) : la liste se recalcule.
    reprendre() { memo = null; sens.demarrer(); visee.reconnaitre(sens); vue.epurer(true); if (ecran !== 'liste') vue.activer(ecran); if (ecran === 'propositions') validation.synchroniser(); },
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
  /**
   * Le batiment verrouille pour la prise (action volontaire de la personne, quand la parcelle porte
   * une annexe) : seul lui est reconnu et touche ; les autres restent des obstacles a la vue.
   */
  let verrou: string | null = null;
  let capReconnu: number | null = null;
  const ecartees = new Set<string>();
  let ecartDepuis: PtBrut | null = null;
  let surlignee: string | null = null;
  type Sens = ReturnType<typeof capteurs>;

  const proposees = (sens: Sens): FacadeDevant[] => {
    const p = sens.position();
    if (!p) return [];
    const { batiments, obstacles } = entreesReconnaissance(ctx.etat.objects, liste().batiments, p, verrou);
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
      // Choisir une facade d'un autre batiment, c'est choisir ce batiment : le verrou le suit.
      if (verrou !== null && cle !== null && cle !== verrou) verrou = cle;
      surlignerCourante();
    },
    /** Verrouille un batiment (ou rend la main avec `null`) ; la facade reconnue ou choisie chez un autre est oubliee. */
    verrouiller(cle: string | null, sens: Sens): void {
      verrou = cle;
      if (cle !== null && choisie && choisie.cle !== cle) choisie = null;
      ecartees.clear(); ecartDepuis = null;
      reconnaitre(sens);
    },
    verrou: (): string | null => verrou,
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
    oublier(): void { reconnue = null; verrou = null; surlignee = null; surligner(null, ROUGE_FACADE); },
    facade: (): Facade | null => cibleFacade()?.facade ?? null,
    /** Vrai si la facade visee a ete choisie (touchee, ou dans la liste) plutot que reconnue. */
    choisie: (): boolean => choisie !== null,
    /** Le batiment de la facade visee, ou null. */
    cleBatiment: (): string | null => cibleFacade()?.cle ?? null,
    /** La cle de la facade visee (batiment et cote), ou null. */
    cleVisee: (): string | null => { const f = cibleFacade(); return f ? cleFacade(f.cle, f.facade.cote) : null; },
  };
}

/** Une ligne de la liste, telle que la Vue 3D la montre : le mur jusque sous le toit, et son haut par morceaux. */
const facadeMontree = (l: LigneFacade): Facade => ({ ...l.facade, hauteur: l.hauteurMur, profil: l.profilMur } as Facade);

/** Le toit depasse le haut des murs : la vue d'ensemble compte cela de plus pour le cadrer. */
const PART_TOIT = 1.4;
/**
 * La facade reconnue vient de se perdre (un angle de la maison, la boussole qui tremble) : la vue a
 * hauteur d'homme reste cela avant de passer a la vue d'ensemble, pour ne pas sauter a chaque pas.
 */
export const DELAI_ENSEMBLE_MS = 2500;

/** L'ecran de l'audit pose sur la Vue 3D : la prise, ou les propositions ; null quand elle est rendue. */
export type EcranVue = 'prise' | 'propositions' | null;

/**
 * Les batiments que la Vue 3D de l'audit garde : ceux de la parcelle, ou le seul batiment verrouille
 * pour la prise (`verrouiller`), et celui de la facade visee ; leurs contours, et la hauteur a
 * cadrer (le plus haut mur, toit compris).
 *
 * Le verrou ne vaut que sur l'ecran de prise (`enPrise`). Les rendus que Claude recoit se dessinent
 * sur cette meme scene epuree (les batiments de la parcelle et le sol, sans arbres, clotures ni
 * voisins) quand l'analyse est lancee : un verrou encore pose y cacherait toutes les maisons sauf une,
 * et le rendu de leurs facades montrerait un terrain vide.
 */
function batimentsDeLaVue(ctx: ContexteAuditParcelle, visee: ReturnType<typeof viseeDe>, liste: () => ListeDeControle, enPrise: () => boolean) {
  const batimentsGardes = (): Set<string> => {
    const verrou = enPrise() ? visee.verrou() : null;
    const s = new Set(verrou !== null ? [verrou] : liste().batiments.map((b) => b.cle));
    const v = visee.cleBatiment();
    if (v) s.add(v);
    return s;
  };
  const contoursDe = (cles: Set<string>): PtBrut[][] =>
    ctx.etat.objects.filter((o) => cles.has(o.key) && aDesSommets(o)).map((o) => (o as { pts: PtBrut[] }).pts);
  const hauteurDe = (cles: Set<string>): number =>
    Math.max(3, ...liste().batiments.filter((b) => cles.has(b.cle)).flatMap((b) => b.facades.map((f) => f.hauteurMur))) * PART_TOIT;
  return { batimentsGardes, contoursDe, hauteurDe };
}

/**
 * La vue epuree de l'audit : les batiments gardes et le sol, rien d'autre. `poser` l'active (audit
 * ouvert) ou la retire ; `garder` la repose si ce qu'elle garde a change (un batiment verrouille),
 * et seulement alors.
 */
function vueEpuree(ctx: ContexteAuditParcelle, batimentsGardes: () => Set<string>) {
  const epurer = ctx.epurer ?? epurerVue3d;
  let active = false;
  let gardesPoses: string | null = null;
  function garder(): void {
    if (!active) {
      if (gardesPoses !== null) { gardesPoses = null; epurer(null); }
      return;
    }
    // Le sol reste : la parcelle du projet (son gazon) et les parcelles voisines, a plat.
    const sols = ctx.etat.objects.filter((o) => o.key === 'parcelle' || o.fonction === 'terrain').map((o) => o.key);
    const cles = new Set([...batimentsGardes(), ...sols]);
    const signature = [...cles].sort().join(',');
    if (signature === gardesPoses) return;
    gardesPoses = signature;
    epurer((cle) => cles.has(cle));
  }
  return { garder, active: () => active, poser(oui: boolean): void { active = oui; garder(); } };
}

/**
 * Une facade choisie fixe la vue : la camera tourne autour de son batiment, a distance fixe, sans
 * suivre le GPS. Elle arrive face a la facade ; ensuite la rotation suit vos pas autour du batiment
 * (si la position est sure) ou le doigt (vuePrise.ts, `orbite`). Faux quand il n'y a rien a cadrer.
 */
function poserOrbite(
  suivi: ReturnType<typeof suiviPieton>, sens: ReturnType<typeof capteurs>, visee: ReturnType<typeof viseeDe>,
  vues: { contoursDe: (cles: Set<string>) => PtBrut[][]; hauteurDe: (cles: Set<string>) => number }, nouvelle: boolean, force: boolean,
): boolean {
  const f = visee.facade(), cle = visee.cleBatiment();
  if (!f || !cle) return false;
  const cadre = cadreDe(vues.contoursDe(new Set([cle])), vues.hauteurDe(new Set([cle])), null);
  if (!cadre) return false;
  const depart = ((Math.atan2(-f.normale.x, -f.normale.y) * 180) / Math.PI + 360) % 360;
  suivi.orbite(cadre, depart, angleAutour(cadre.centre, sens.position(), sens.precision()), nouvelle, force, f);
  return true;
}

/**
 * La Vue 3D de l'audit (vuePrise.ts) :
 * - epuree tant que l'audit est ouvert (`epurer`) : le batiment audite et le sol, sans arbres, ni
 *   voisins, ni clotures (demande de l'utilisateur du 15 octobre) ; un affichage, rien n'entre dans
 *   le projet ;
 * - pendant la prise, a hauteur d'homme quand une position et une facade visee sont connues (c'est la
 *   prise elle-meme), en vue d'ensemble sinon (on choisit une facade en la touchant) ;
 * - pendant les propositions, en vue d'ensemble sur la parcelle, au-dessus de l'ecran qui les liste.
 * Le doigt y choisit une facade pendant la prise. Rien ne bouge hors de ces deux ecrans.
 */
function vueDe(ctx: ContexteAuditParcelle, sens: ReturnType<typeof capteurs>, visee: ReturnType<typeof viseeDe>, liste: () => ListeDeControle) {
  const horloge = ctx.horloge ?? (() => Date.now());
  const suivi = suiviPieton(ctx.vue ?? vuePieton(), horloge);
  const poserTrait = ctx.trait ?? poserTraitDePres;
  /** Le trait pose, arrondi au centieme : on ne le repose que s'il change. */
  let traitPose: string | null = null;
  /** Le trait renforce suit la derniere pose a hauteur d'homme ; hors d'elle, il est retire. */
  function trait(): void {
    const pose = ecran === 'prise' && mode === 'pieton' ? suivi.derniere() : null;
    const f = visee.facade(), cle = visee.cleBatiment(), p = sens.position();
    const force = pose && f && cle && p ? Math.round(forceDuTrait(p, pose.oeil, f, suivi.rapport()) * 100) / 100 : 0;
    const signature = force > 0 && cle ? cle + '@' + force : null;
    if (signature === traitPose) return;
    traitPose = signature;
    poserTrait(signature ? cle : null, force);
  }
  let ecran: EcranVue = null;
  let mode: 'pieton' | 'ensemble' | 'orbite' | null = null;
  /** La facade choisie sur laquelle la vue est fixee (cle du batiment et cote) ; une autre choisie repart face a elle. */
  let orbiteSur: string | null = null;
  let perdueDepuis: number | null = null;
  const { batimentsGardes, contoursDe, hauteurDe } = batimentsDeLaVue(ctx, visee, liste, () => ecran === 'prise');
  const epure = vueEpuree(ctx, batimentsGardes);
  const garder = epure.garder;

  /**
   * La vue d'ensemble : sur les batiments gardes pendant la prise, sur la parcelle et eux pendant les
   * propositions. `entree` : on y arrive, et le regard se choisit (face a la facade visee, sinon
   * depuis votre position) ; sinon il garde celui de la camera, que le doigt a pu tourner.
   */
  function ensemble(entree: boolean): void {
    const cles = batimentsGardes();
    const contours = contoursDe(cles);
    const parcelle = parcelleDuProjet(ctx.etat.objects);
    // Deux vues avant / apres : ce qui se compare, ce sont les batiments, que la parcelle entiere rendrait petits.
    if (ecran === 'propositions' && parcelle && aDesSommets(parcelle) && !affichage3d.comparaison) contours.push(parcelle.pts);
    let azimut: number | null = null;
    const cadreSans = cadreDe(contours, hauteurDe(cles), null);
    if (!cadreSans) return;
    if (entree) {
      const f = visee.facade(), p = sens.position();
      // Face a la facade visee, depuis l'exterieur ; sinon depuis ou vous etes, vers le batiment.
      if (f) azimut = ((Math.atan2(-f.normale.x, -f.normale.y) * 180) / Math.PI + 360) % 360;
      else if (p && Math.hypot(cadreSans.centre.x - p.x, cadreSans.centre.y - p.y) > 1) azimut = ((Math.atan2(cadreSans.centre.x - p.x, cadreSans.centre.y - p.y) * 180) / Math.PI + 360) % 360;
    }
    suivi.ensemble({ ...cadreSans, azimutDeg: azimut });
  }

  /** Une facade choisie fixe la vue : la camera tourne autour de son batiment (`poserOrbite`). */
  function orbite(force: boolean): boolean {
    const cleVisee = visee.cleVisee();
    const nouvelle = mode !== 'orbite' || orbiteSur !== cleVisee;
    if (!poserOrbite(suivi, sens, visee, { contoursDe, hauteurDe }, nouvelle, force)) return false;
    mode = 'orbite'; orbiteSur = cleVisee; perdueDepuis = null;
    return true;
  }

  const suivre = (force = false) => {
    suivreSansTrait(force);
    // Une pose forcee (scene rebatie, cadrage) repose le trait : celui d'une scene demolie est parti avec elle.
    if (force) traitPose = null;
    trait();
  };
  const suivreSansTrait = (force: boolean) => {
    if (!suivi.actif()) return;
    if (ecran === 'propositions') {
      const entree = mode !== 'ensemble';
      mode = 'ensemble';
      if (entree || force) ensemble(entree);
      return;
    }
    if (visee.choisie() && orbite(force)) return;
    const f = visee.facade(), p = sens.position();
    if (p && f) {
      const entree = mode !== 'pieton';
      mode = 'pieton'; perdueDepuis = null;
      // Une facade choisie (touchee, ou dans la liste) se regarde, quel que soit le cap du telephone.
      suivi.suivre(p, visee.choisie() ? null : sens.cap(), f, force || entree, contoursDe(batimentsGardes()));
      return;
    }
    if (p && mode === 'pieton') {
      const t = horloge();
      perdueDepuis ??= t;
      if (t - perdueDepuis < DELAI_ENSEMBLE_MS) { suivi.suivre(p, sens.cap(), null, force, contoursDe(batimentsGardes())); return; }
    }
    const entree = mode !== 'ensemble';
    mode = 'ensemble'; perdueDepuis = null;
    if (entree || force) ensemble(entree);
  };
  const poserFaites = ctx.surlignerFaites ?? poserFacadesFaites;
  let faitesPosees: string | null = null;
  /**
   * En vert, les facades qui ont deja une photo : on voit ce qui reste, et on peut les reprendre. La
   * facade visee n'y est pas : son propre surlignage la dit (verte si elle a deja une photo). Les
   * voiles ne sont refaits que si la liste change, pas a chaque mouvement de la boussole ; ceux d'un
   * batiment que la vue epuree masque ne flottent pas dans le vide.
   */
  const faites = () => {
    garder();
    const visee_ = visee.cleVisee();
    const gardes = batimentsGardes();
    const lignes = ecran === 'prise' ? liste().batiments.filter((b) => !epure.active() || gardes.has(b.cle)).flatMap((b) => b.facades.filter((f) => f.statut === 'photographiee' && cleFacade(b.cle, f.cote) !== visee_).map((f) => ({ cle: cleFacade(b.cle, f.cote), facade: facadeMontree(f) }))) : [];
    const cle = lignes.map((l) => l.cle).join(',');
    if (cle === faitesPosees) return;
    faitesPosees = cle;
    poserFaites(lignes.map((l) => l.facade));
  };
  return {
    suivre,
    faites,
    /** L'audit ouvert (vrai) ou ferme (faux) : la vue s'epure, ou redevient celle du projet. */
    epurer: epure.poser,
    /** L'ecran pose sur la Vue 3D : la camera y est pilotee ; null la rend. */
    activer(e: EcranVue): void {
      if (e !== ecran) mode = null;
      ecran = e;
      suivi.activer(e !== null);
      faites();
      if (e) suivre(true); else trait();
    },
    lacher: () => suivi.lacher(),
    /** L'ecran de l'audit commence la (pixels de la fenetre) : la camera cadre ce qu'il laisse voir, et se repose. */
    cadrer(cache: CacheVue | null): void { suivi.cadrer(cache); suivre(true); },
    /** La facade touchee : celle du batiment de la liste dont le mur passe le plus pres du doigt. */
    toucher(ndc: { x: number; y: number }): string | 'choisie' | null {
      if (!suivi.actif() || ecran !== 'prise') return null;
      // Le rayon traverse un arbre, une cloture, un batiment hors de la liste : seule compte la
      // premiere facade de la liste qu'il rencontre.
      const verrou = visee.verrou();
      const dansLaListe = (cle: string) => (verrou === null || cle === verrou) && liste().batiments.some((b) => b.cle === cle);
      const { cle, point } = (ctx.objetSous ?? objetSousLePointeur)(ndc, dansLaListe);
      if (!cle || !point) return null;
      const ligne = liste().batiments.find((b) => b.cle === cle);
      if (!ligne) return 'Ce bâtiment n’est pas dans la liste de la parcelle.';
      const f = facadeTouchee(ligne.facades, point);
      if (!f) return 'Ce bâtiment n’a pas de façade à photographier.';
      visee.choisir(cle, f.cote);
      faites();
      // La facade touchee fixe la vue : la camera tourne autour de son batiment, face a elle.
      suivre(true);
      return 'choisie';
    },
  };
}
