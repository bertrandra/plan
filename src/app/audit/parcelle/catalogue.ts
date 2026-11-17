// Admin › « Audits » (MD/spec-audit.md §15, 15.4 et 15.5) : l'outil de l'administrateur pour
// travailler, a son bureau, sur les audits recus par le serveur de Plan (`GET admin/audits`) :
// audits de parcelle (sauvegardes de capture, partages pour le corpus) et promenades des toits, en
// deux sections. Pour chacun : l'ouvrir dans le projet ouvert (meme parcelle), voir ses donnees et sa
// conclusion (ce qui a ete propose, par Claude et par les mesures, et ce qui en a ete fait), le
// telecharger tel qu'il est arrive, le retirer (confirme). Pour un audit de parcelle, ses analyses et
// rejeux, cote a cote (modele, versions, comptes, cout, duree ; export CSV), le detail de chacun
// (ce qui est parti chez Claude, ce qu'il a rendu ; export JSON), et « Rejouer l'analyse » avec le
// modele choisi.
//
// L'ecran (zones/parcours/AuditsParcelle.tsx) est un parcours de Z8 et non un ecran plein page comme
// la Conformite : « Ouvrir dans ce projet » et le rejeu demandent le projet ouvert dessous. Le retrait
// se confirme dans l'ecran meme, sur la ligne : une question de Z8 s'ouvrirait sous le parcours.

import { nomFichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { donneesAudit, type DonneesAudit } from './donneesAudit.js';
import { csvBenchmark, lignesBenchmark } from '../../../export/benchmarkAnalyses.js';
import type { ClientAudits, FicheAudit } from '../../../io/auditsServeur.js';
import type { AnalyseComplete, ClientAnalysesAudits, ResumeAnalyse } from '../../../io/analysesAudits.js';
import type { BrouillonServeur, ClientAnalyse, DemandeAnalyse } from '../../../io/analyseClaude.js';
import { choixExportParDefaut, donneesDuCatalogue, type DependancesDonnees, type EtatDonnees, type MethodesDonnees } from './donneesCatalogue.js';

/** Ce que le rejeu demande de plus au catalogue : les analyses gardees, le client de l'analyse, la preparation. */
export interface DependancesAnalyses {
  analyses: () => ClientAnalysesAudits | null;
  analyse: () => ClientAnalyse | null;
  /** La demande du rejeu sur le projet ouvert (rejeu.ts), ou la raison de son refus. */
  preparer: (texte: string, fiche: FicheAudit, modele: string) => Promise<DemandeAnalyse | { refus: string }>;
  /** Rappelle `f` dans `ms` (le suivi d'un rejeu en cours) ; rend de quoi l'annuler. */
  planifier?: (f: () => void, ms: number) => () => void;
}

export interface DependancesCatalogue extends DependancesDonnees {
  /** Le client des routes `admin/audits` ; null sans session admin. */
  client: () => ClientAudits | null;
  /** La parcelle du projet ouvert (IDU, ou point de calage), null sans parcelle cadastrale. */
  iduProjet: () => string | null;
  /** Pourquoi ce projet ne peut rien recevoir (lecture seule), null s'il peut. */
  refusEcriture: () => string | null;
  /** Reprend le fichier dans la session de cette parcelle, par le chemin de l'import (commande.ts). */
  ouvrir: (texte: string, fiche: FicheAudit, remesurer?: boolean) => void;
  /**
   * Montre l'avant et l'apres de cet audit sur l'ecran des propositions, en lecture seule, dans une
   * session a part (commande.ts) : ni l'audit en cours ni le projet n'en sont changes. Absent, pas de consultation.
   */
  consulter?: (texte: string, fiche: FicheAudit) => void;
  telecharger: (nom: string, texte: string, type?: string) => void;
  signaler: (message: string) => void;
  /** Demande un fichier au poste et rend son texte (« Ajouter un fichier d'audit… ») ; absent, pas de depot. */
  choisirFichier?: (surTexte: (texte: string) => void) => void;
  /** Les analyses, les rejeux et leur detail ; absents, l'ecran ne montre que les audits. */
  rejeu?: DependancesAnalyses;
}

/** Ce que la carte ouverte montre de son audit : ses donnees lues, ses analyses. */
export interface DetailAudit {
  id: string;
  texte: string | null;
  donnees: DonneesAudit | null;
  analyses: ResumeAnalyse[] | null;
  erreur: string | null;
}

export interface EtatCatalogue extends EtatDonnees {
  chargement: boolean;
  audits: FicheAudit[] | null;
  erreur: string | null;
  /** L'audit dont la ligne travaille (lecture, retrait, rejeu) ; une seule a la fois. */
  enCours: string | null;
  /** L'audit dont le retrait attend sa confirmation. */
  aConfirmer: string | null;
  /** La carte ouverte sur ses donnees, sa conclusion et ses analyses. */
  detail: DetailAudit | null;
  /** L'analyse ou le rejeu montre en entier : entrant, sortant. */
  trace: { audit: string; id: string; complete: AnalyseComplete | null; erreur: string | null } | null;
  /** Les modeles que le serveur admet, et celui choisi pour le prochain rejeu. */
  modeles: string[];
  modele: string | null;
  /** Le brouillon des regles du serveur (Admin › Regles), si l'administrateur en a enregistre un. */
  brouillon: BrouillonServeur | null;
  /** Le prochain rejeu part avec le prompt du brouillon et non avec le prompt livre. */
  essai: boolean;
  /** L'analyse ouverte, comparee a une autre du meme audit : ce que leurs reponses disent differemment. */
  comparaison: { audit: string; avec: string; complete: AnalyseComplete | null; erreur: string | null } | null;
}

export interface CatalogueAudits extends MethodesDonnees {
  etat(): EtatCatalogue;
  relire(): Promise<void>;
  /** Pourquoi cet audit ne s'ouvre pas dans ce projet ; null s'il s'y ouvre. */
  raisonOuvrir(a: FicheAudit): string | null;
  ouvrir(a: FicheAudit): Promise<void>;
  /**
   * Relance l'analyse des photos des facades : l'audit s'ouvre dans ce projet comme avec `ouvrir`, mais sans ses mesures ni ses
   * decisions. Ses photos repassent par les mesures d'aujourd'hui (releve des facades, silhouettes, toit) et se poussent sur les
   * facades du projet, comme en fin de capture. Meme raison de refus que `ouvrir`.
   */
  remesurer(a: FicheAudit): Promise<void>;
  /** Pourquoi l'avant et l'apres de cet audit ne se voient pas ici ; null s'ils se voient. */
  raisonConsulter(a: FicheAudit): string | null;
  /** L'avant et l'apres de l'audit, sur la Vue 3D du projet ouvert (meme parcelle) : la base des decisions. */
  consulter(a: FicheAudit): Promise<void>;
  telecharger(a: FicheAudit): Promise<void>;
  /** Premiere touche : la ligne demande confirmation ; `confirmer` retire, `garder` renonce. */
  demanderRetrait(a: FicheAudit): void;
  confirmerRetrait(): Promise<void>;
  garder(): void;
  /** Ouvre la carte sur ses donnees, sa conclusion et ses analyses ; la refermer si elle l'est deja. */
  basculerDetail(a: FicheAudit): Promise<void>;
  /** Relit les analyses de la carte ouverte ; celles en cours sont suivies jusqu'a leur fin. */
  relireAnalyses(): Promise<void>;
  /** Le rejeu est-il propose (session admin, analyse configuree) ? */
  rejeuDisponible(): boolean;
  /** Pourquoi cet audit ne se rejoue pas ici ; null s'il se rejoue. */
  raisonRejouer(a: FicheAudit): string | null;
  choisirModele(m: string): void;
  /** Rejouer avec le prompt du brouillon des regles (essai) plutot qu'avec le prompt livre. */
  choisirEssai(essai: boolean): void;
  rejouer(a: FicheAudit): Promise<void>;
  /** Compare l'analyse ouverte a `avec`, une autre analyse du meme audit. */
  comparer(audit: string, avec: string): Promise<void>;
  fermerComparaison(): void;
  exporterAnalyses(a: FicheAudit): void;
  voirTrace(audit: string, id: string): Promise<void>;
  fermerTrace(): void;
  exporterTrace(): void;
  urlImage(audit: string, nom: string): string | null;
  /** « Ajouter un fichier d'audit… » : un fichier du poste (une promenade du depot, un audit) va au serveur. */
  deposerDisponible(): boolean;
  deposer(): void;
  abonner(f: () => void): () => void;
}

const message = (e: unknown) => (e as Error).message || String(e);
const SESSION_EXPIREE = 'La session admin a expiré : rechargez la page pour retaper le mot de passe.';
/** Un rejeu rend en general en quelques minutes : on le relit toutes les vingt secondes. */
export const DELAI_SUIVI_REJEU_MS = 20000;
const planifierNavigateur = (f: () => void, ms: number) => { const t = setTimeout(f, ms); return () => clearTimeout(t); };
const jourFichier = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? new Date() : d; };

/** Ce que les analyses partagent avec le catalogue : son etat, la lecture d'un audit. */
interface Noyau {
  etat: () => EtatCatalogue;
  poser: (x: Partial<EtatCatalogue>) => void;
  lire: (a: FicheAudit) => Promise<string | null>;
}

type MethodesAnalyses = Pick<CatalogueAudits, 'relireAnalyses' | 'rejeuDisponible' | 'raisonRejouer' | 'choisirModele' | 'choisirEssai' | 'rejouer' | 'comparer' | 'fermerComparaison' | 'exporterAnalyses' | 'voirTrace' | 'fermerTrace' | 'exporterTrace' | 'urlImage'>
  & { suivre(id: string): Promise<void>; chargerModeles(): Promise<void>; arreter(): void };

/** Les analyses et rejeux d'un audit de parcelle : leur suivi, leur comparaison, leur detail, le rejeu. */
function analysesDuCatalogue(d: DependancesCatalogue, n: Noyau): MethodesAnalyses {
  let annulerSuivi: (() => void) | null = null;
  const majDetail = (id: string, x: Partial<DetailAudit>) => { const det = n.etat().detail; if (det?.id === id) n.poser({ detail: { ...det, ...x } }); };

  const m: MethodesAnalyses = {
    arreter() { annulerSuivi?.(); annulerSuivi = null; },
    /** Les analyses en cours de la carte ouverte : leur batch est relu ; fini, le serveur complete la trace. */
    async suivre(id) {
      m.arreter();
      const r = d.rejeu, analyses = r?.analyses(), analyse = r?.analyse();
      if (!r || !analyses) return;
      let liste: ResumeAnalyse[];
      try { liste = await analyses.lister(id); } catch (e) { majDetail(id, { erreur: message(e) }); return; }
      let fini = false;
      // Seul un batch se suit : un appel immediat (lot L0) a sa trace finie des sa reponse.
      for (const x of analyse ? liste.filter((y) => y.etat === 'en_cours' && y.idBatch) : []) {
        const idBatch = x.idBatch as string;
        try {
          if ((await analyse?.etatBatch(idBatch))?.etat === 'ended') { await analyse?.resultats(idBatch); fini = true; }
        } catch { /* passager : le prochain tour reessaie */ }
      }
      if (fini) { try { liste = await analyses.lister(id); } catch { /* la liste d'avant reste */ } }
      majDetail(id, { analyses: liste });
      if (liste.some((x) => x.etat === 'en_cours' && x.idBatch) && n.etat().detail?.id === id) {
        annulerSuivi = (r.planifier ?? planifierNavigateur)(() => { annulerSuivi = null; void m.suivre(id); }, DELAI_SUIVI_REJEU_MS);
      }
    },
    async chargerModeles() {
      const analyse = d.rejeu?.analyse();
      if (!analyse || n.etat().modeles.length) return;
      try {
        const etat = await analyse.etat();
        const modeles = etat.modeles ?? [];
        if (modeles.length) n.poser({ modeles, modele: n.etat().modele ?? modeles[0] ?? null, brouillon: etat.brouillon ?? null });
      } catch { /* l'analyse non configuree : le rejeu le dira */ }
    },
    async relireAnalyses() { const det = n.etat().detail; if (det) await m.suivre(det.id); },
    rejeuDisponible: () => !!d.rejeu && !!d.rejeu.analyse() && !!d.rejeu.analyses(),
    raisonRejouer(a) {
      if (a.nature === 'promenade') return 'Le rejeu par Claude ne porte que sur les audits de parcelle.';
      if (!m.rejeuDisponible()) return SESSION_EXPIREE;
      const idu = d.iduProjet();
      if (!idu) return 'Ouvrez le projet de la parcelle ' + a.idu + ' : le rejeu y prend le modèle actuel, l’orthophoto et le relief.';
      if (a.idu !== idu) return 'Ce projet est sur la parcelle ' + idu + ' : ouvrez le projet de la parcelle ' + a.idu + ' pour rejouer son audit.';
      if (!a.photos) return 'Cet audit n’a aucune photo à analyser.';
      if (!n.etat().modele) return 'Le serveur ne dit pas quels modèles il admet : l’analyse par Claude est-elle configurée ?';
      if (n.etat().essai && !n.etat().brouillon) return 'Le serveur n’a pas de brouillon des règles : enregistrez-le dans Admin › Règles (« Enregistrer sur le serveur »).';
      return null;
    },
    choisirModele(x) { if (n.etat().modeles.includes(x)) n.poser({ modele: x }); },
    choisirEssai(essai) { n.poser({ essai }); },
    async rejouer(a) {
      const raison = m.raisonRejouer(a);
      const r = d.rejeu, analyse = r?.analyse(), modele = n.etat().modele;
      if (raison || !r || !analyse || !modele) { d.signaler(raison ?? SESSION_EXPIREE); return; }
      const texte = await n.lire(a);
      if (texte === null) return;
      n.poser({ enCours: a.id });
      try {
        const demande = await r.preparer(texte, a, modele);
        if ('refus' in demande) { d.signaler('Rejeu refusé : ' + demande.refus); return; }
        const essai = n.etat().essai;
        await analyse.creerBatch(essai ? { ...demande, essai: 'brouillon' } : demande);
        d.signaler('Rejeu de l’analyse parti (' + modele + (essai ? ', prompt du brouillon des règles' : '') + ', ' + demande.requetes.length + ' requêtes) : la réponse arrive en général en quelques minutes.');
      } catch (e) {
        d.signaler('Le rejeu n’est pas parti : ' + message(e));
        return;
      } finally {
        n.poser({ enCours: null });
      }
      if (n.etat().detail?.id === a.id) await m.suivre(a.id);
    },
    exporterAnalyses(a) {
      const det = n.etat().detail;
      const liste = det?.id === a.id ? det.analyses : null;
      if (!liste?.length) return;
      d.telecharger('analyses-' + (a.idu || a.id) + '-' + a.id + '.csv', csvBenchmark(lignesBenchmark(liste)), 'text/csv;charset=utf-8');
    },
    async voirTrace(audit, id) {
      const analyses = d.rejeu?.analyses();
      if (!analyses) { d.signaler(SESSION_EXPIREE); return; }
      n.poser({ trace: { audit, id, complete: null, erreur: null } });
      try {
        const complete = await analyses.lire(audit, id);
        if (n.etat().trace?.id === id) n.poser({ trace: { audit, id, complete, erreur: null } });
      } catch (e) {
        if (n.etat().trace?.id === id) n.poser({ trace: { audit, id, complete: null, erreur: message(e) } });
      }
    },
    fermerTrace() { n.poser({ trace: null, comparaison: null }); },
    async comparer(audit, avec) {
      const analyses = d.rejeu?.analyses();
      if (!analyses) { d.signaler(SESSION_EXPIREE); return; }
      n.poser({ comparaison: { audit, avec, complete: null, erreur: null } });
      try {
        const complete = await analyses.lire(audit, avec);
        if (n.etat().comparaison?.avec === avec) n.poser({ comparaison: { audit, avec, complete, erreur: null } });
      } catch (e) {
        if (n.etat().comparaison?.avec === avec) n.poser({ comparaison: { audit, avec, complete: null, erreur: message(e) } });
      }
    },
    fermerComparaison() { n.poser({ comparaison: null }); },
    exporterTrace() {
      const t = n.etat().trace;
      if (!t?.complete) return;
      d.telecharger('analyse-' + t.audit + '-' + t.id + '.json', JSON.stringify(t.complete, null, 2) + '\n');
    },
    urlImage: (audit, nom) => d.rejeu?.analyses()?.urlImage(audit, nom) ?? null,
  };
  return m;
}

/** « Ajouter un fichier d'audit… » : le fichier choisi au poste part au serveur, puis la liste se relit. */
function deposerFichier(d: DependancesCatalogue, relire: () => Promise<void>): void {
  d.choisirFichier?.((texte) => {
    void (async () => {
      const client = d.client();
      if (!client) { d.signaler(SESSION_EXPIREE); return; }
      try {
        await client.envoyer(texte, 'corpus');
        d.signaler('Fichier d’audit ajouté au serveur de Plan.');
        await relire();
      } catch (e) {
        d.signaler(message(e));
      }
    })();
  });
}

export function creerCatalogue(d: DependancesCatalogue): CatalogueAudits {
  const abonnes = new Set<() => void>();
  let etat: EtatCatalogue = { chargement: false, audits: null, erreur: null, enCours: null, aConfirmer: null, detail: null, trace: null, modeles: [], modele: null, brouillon: null, essai: false, comparaison: null,
    exportDonnees: choixExportParDefaut(new Date()), donneesEnCours: null };
  const poser = (x: Partial<EtatCatalogue>) => { etat = { ...etat, ...x }; abonnes.forEach((f) => f()); };

  async function lire(a: FicheAudit): Promise<string | null> {
    if (etat.detail?.id === a.id && etat.detail.texte !== null) return etat.detail.texte;
    const client = d.client();
    if (!client) { d.signaler(SESSION_EXPIREE); return null; }
    poser({ enCours: a.id });
    try { return await client.lire(a.id); } catch (e) { d.signaler(message(e)); return null; } finally { poser({ enCours: null }); }
  }
  const analyses = analysesDuCatalogue(d, { etat: () => etat, poser, lire });
  const majDetail = (id: string, x: Partial<DetailAudit>) => { if (etat.detail?.id === id) poser({ detail: { ...etat.detail, ...x } }); };
  // Le rejeu d'une facade ajoute une analyse a l'audit : la carte ouverte relit les siennes.
  const donnees = donneesDuCatalogue(d, () => etat, poser, async (audit) => { if (etat.detail?.id === audit) await analyses.suivre(audit); });

  const catalogue: CatalogueAudits = {
    etat: () => etat,
    async relire() {
      const client = d.client();
      if (!client) { poser({ erreur: SESSION_EXPIREE }); return; }
      poser({ chargement: true, erreur: null });
      try { poser({ chargement: false, audits: await client.lister() }); } catch (e) { poser({ chargement: false, erreur: message(e) }); }
    },
    raisonOuvrir(a) {
      if (a.nature === 'promenade') return 'Une promenade des toits ne s’ouvre pas dans un projet : téléchargez-la pour la rejouer avec le skill regles-toits.';
      const refus = d.refusEcriture();
      if (refus) return refus;
      const idu = d.iduProjet();
      if (!idu) return 'Ce projet n’a pas de parcelle cadastrale : importez d’abord la parcelle depuis son adresse.';
      if (a.idu !== idu) return 'Ce projet est sur la parcelle ' + idu + ' : ouvrez le projet de la parcelle ' + a.idu + '.';
      return null;
    },
    async ouvrir(a) {
      const raison = catalogue.raisonOuvrir(a);
      if (raison) { d.signaler(raison); return; }
      const texte = await lire(a);
      if (texte !== null) d.ouvrir(texte, a);
    },
    async remesurer(a) {
      const raison = catalogue.raisonOuvrir(a);
      if (raison) { d.signaler(raison); return; }
      const texte = await lire(a);
      if (texte !== null) d.ouvrir(texte, a, true);
    },
    raisonConsulter(a) {
      if (a.nature === 'promenade') return 'Une promenade des toits n’a pas d’avant ni d’après à comparer.';
      if (!d.consulter) return 'La consultation n’est pas branchée.';
      const idu = d.iduProjet();
      if (!idu) return 'Ouvrez le projet de la parcelle ' + a.idu + ' : l’avant et l’après se voient sur son modèle 3D.';
      if (a.idu !== idu) return 'Ce projet est sur la parcelle ' + idu + ' : ouvrez le projet de la parcelle ' + a.idu + ' pour voir l’avant et l’après.';
      if (a.propositions && !a.propositions.total) return 'Cet audit n’a aucune proposition : rien à comparer.';
      return null;
    },
    async consulter(a) {
      const raison = catalogue.raisonConsulter(a);
      if (raison) { d.signaler(raison); return; }
      const texte = await lire(a);
      if (texte !== null) d.consulter?.(texte, a);
    },
    async telecharger(a) {
      const texte = await lire(a);
      if (texte === null) return;
      // Le nom du fichier de l'audit (celui du partage du telephone), au jour de sa reception ; le
      // texte part tel qu'il est arrive, sans etre relu : il se rejoue a l'octet pres.
      const nom = a.nature === 'promenade' ? 'audit-promenade-' + a.id + '.json' : nomFichierAuditParcelle(jourFichier(a.recuLe), a.idu);
      d.telecharger(nom, texte);
    },
    demanderRetrait(a) { poser({ aConfirmer: a.id }); },
    garder() { poser({ aConfirmer: null }); },
    async confirmerRetrait() {
      const id = etat.aConfirmer, client = d.client();
      if (!id) return;
      if (!client) { poser({ aConfirmer: null }); d.signaler(SESSION_EXPIREE); return; }
      poser({ enCours: id, aConfirmer: null });
      try {
        // L'administrateur retire sans secret : sa session suffit.
        await client.retirer(id, '');
        poser({ audits: (etat.audits ?? []).filter((x) => x.id !== id), ...(etat.detail?.id === id ? { detail: null, trace: null, comparaison: null } : {}) });
        d.signaler('Audit retiré du serveur de Plan.');
      } catch (e) {
        d.signaler(message(e));
      } finally {
        poser({ enCours: null });
      }
    },
    async basculerDetail(a) {
      analyses.arreter();
      if (etat.detail?.id === a.id) { poser({ detail: null, trace: null, comparaison: null }); return; }
      poser({ detail: { id: a.id, texte: null, donnees: null, analyses: null, erreur: null }, trace: null, comparaison: null });
      const texte = await lire(a);
      if (texte === null) { majDetail(a.id, { erreur: 'Le fichier de l’audit n’a pas pu être lu.' }); return; }
      let donnees: DonneesAudit | null = null, erreur: string | null = null;
      try { donnees = donneesAudit(texte); } catch (e) { erreur = 'Fichier de l’audit illisible : ' + message(e); }
      majDetail(a.id, { texte, donnees, erreur });
      if (a.nature === 'parcelle') { await analyses.chargerModeles(); await analyses.suivre(a.id); }
    },
    relireAnalyses: analyses.relireAnalyses, rejeuDisponible: analyses.rejeuDisponible, raisonRejouer: analyses.raisonRejouer, choisirModele: analyses.choisirModele,
    choisirEssai: analyses.choisirEssai, rejouer: analyses.rejouer, comparer: analyses.comparer, fermerComparaison: analyses.fermerComparaison, exporterAnalyses: analyses.exporterAnalyses, voirTrace: analyses.voirTrace, fermerTrace: analyses.fermerTrace,
    exporterTrace: analyses.exporterTrace, urlImage: analyses.urlImage,
    ...donnees,
    deposerDisponible: () => !!d.choisirFichier,
    deposer() { deposerFichier(d, () => catalogue.relire()); },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); if (!abonnes.size) analyses.arreter(); }; },
  };
  return catalogue;
}
