// L'audit de la parcelle, phases 2 et 3 sans Claude (MD/spec-audit.md §13.1, §14) : les mesures
// deviennent des propositions, montrees dans la Vue 3D avant et apres, cochees, puis ecrites.
//
// - Les mesures (app/audit/parcelle/mesures.ts) se font une fois par facade et se gardent tant que
//   ses photos ne changent pas ; elles se font l'une apres l'autre, l'ecran dit ou elles en sont.
// - L'apercu ne touche pas le projet : les objets concernes sont copies, les propositions cochees
//   ecrites sur les copies (regles/decisions.ts::projetApres). Par defaut, la Vue 3D montre deux
//   vues, « Avant » et « Après », avec la meme camera (three/comparaison3d.ts) ; « Après » seul y
//   repose les copies a la place des batiments (three/scene.ts::remplacerObjets3d) ; « Avant », ou
//   l'ecran ferme, y rend le plan. Ainsi ni l'enregistrement ni les taches de fond ne voient jamais
//   un apercu. Chaque case cochee ou decochee, chaque nouveau calcul des propositions, s'y reflete.
// - « Valider » ecrit tout ce qui est coche en un seul instantane d'historique : Ctrl+Z le defait, et
//   le projet est marque modifie. Les batiments vus et valides sont marques « vérifié sur place ».

import { appliquerPropositions, avecReserveSurPlace, cocheeParDefaut, jourIso, cleDeLaCible, projetApres, rivalesSurPlace, type Proposition } from '../../../regles/decisions.js';
import { mesurerFacade, type DependancesMesures, type MesureFacade } from './mesures.js';
import { cleMesure, cochesParDefaut, propositionsDeLAudit, verifications, type EntreesPropositions, type EtatVerification } from './propositions.js';
import { propositionsDeClaude, propositionsRenfort, votesDesBatiments, type ReponsesBatiment } from './propositionsClaude.js';
import { arbitragesParBatiment, cleChoix, propositionsArbitrees, propositionsDesArbitrages, resumeArbitrage, type ArbitragesBatiment, type ChoixArbitrages } from './arbitrages.js';
import type { ChoixArbitrage } from '../../../facade/regles/reconciliation.js';
import type { ArbitrageProposition } from '../../../regles/decisions.js';
import { observationsDeClaude, type ObservationsBatiment } from './observationsClaude.js';
import type { RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { CaptureEnCours } from './capture.js';
import type { ListeDeControle } from './liste.js';
import type { EtatApp } from '../../../core/state.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { DecisionAudit } from '../../../model/auditParcelle.js';
import type { DecisionProposition, PropositionAuditee } from '../../../model/fichierAuditParcelle.js';

/** Ce que la validation demande au reste du programme : l'historique, le rendu, la Vue 3D. */
export interface ProjetAudit {
  /** Un instantane d'historique, pris avant l'ecriture : il marque aussi le projet modifie. */
  pushHistory(): void;
  render(): void;
  /** Rebatit la Vue 3D ouverte d'apres le plan (rien si elle est fermee). */
  refaire3d(): void;
  /**
   * Repose ces objets dans la Vue 3D ouverte, d'apres `objets` (l'apercu) ou, sans eux, d'apres le
   * plan. Faux quand la scene n'est plus celle qui a ete batie.
   */
  remplacer3d(cles: readonly string[], objets?: readonly ObjetPlan[]): boolean;
  /**
   * Les deux vues de la Vue 3D ouverte (three/comparaison3d.ts) : « Avant », le plan, et « Après »,
   * ces copies ; null revient a la vue unique. Faux quand il n'y a pas de scene ou qu'elle n'est plus
   * celle qui a ete batie. Absente (tests, projet muet) : rien ne se compare.
   */
  comparer3d?(apres: ApresAudit | null): boolean;
  /** Ou est l'ecran des propositions, en pixels de la fenetre : les deux vues l'evitent. */
  cadrer3d?(panneau: RectEcran | null): void;
}

/** Ce que la vue « Après » montre a la place du plan : les batiments copies, et la parcelle si sa cloture change. */
export interface ApresAudit { cles: string[]; objets: ObjetPlan[]; parcelle: ObjetPlan | null }
export interface RectEcran { left: number; top: number; right: number; bottom: number }

export type EtatMesures = { etat: 'attente' } | { etat: 'mesure'; faites: number; total: number } | { etat: 'pretes' };
/** Ce que montre la Vue 3D : le plan, les deux cote a cote (par defaut), ou les propositions cochees. */
export type Apercu = 'avant' | 'deux' | 'apres';

export interface ContexteValidation {
  etat: EtatApp;
  capture: CaptureEnCours;
  liste: () => ListeDeControle;
  projet: ProjetAudit;
  mesures: DependancesMesures;
  signaler: (message: string) => void;
  maintenant: () => Date;
  /** Apres chaque validation qui a ecrit : le partage pour le corpus (§15) part alors, s'il est coche. */
  apresValidation?: () => void;
  /** Les reponses de Claude (app/audit/parcelle/analyseClaude.ts), quand il y en a : elles s'ajoutent aux mesures. */
  analyse?: { reponses(): Record<string, ReponsesBatiment> | null; version(): number; renfort?(): Record<string, RenfortFacadeCapture> | null };
}

export interface Validation {
  mesures(): EtatMesures;
  /** Mesure les facades photographiees qui ne le sont pas encore ; rend quand tout est pret. */
  lancer(): Promise<void>;
  /** Les entrees des propositions a cet instant (le plan, la liste, la capture, les mesures faites). */
  entrees(): EntreesPropositions;
  propositions(): readonly Proposition[];
  /** Ce que Claude a vu sans que le projet sache l'ecrire, batiment par batiment : a lire, rien a cocher. */
  observations(): readonly ObservationsBatiment[];
  /** Tous les arbitrages de chaque batiment (y compris ceux sans proposition), avec la main de la personne. */
  arbitrages(): readonly { cle: string; nom: string; arbitrages: readonly ArbitrageProposition[] }[];
  /**
   * La personne decide d'un attribut : retenir le groupe de sources a cet index, forcer une valeur, ou (null)
   * reprendre le choix du moteur. Cocher la proposition qui en resulte ; rien n'est ecrit avant « Valider ».
   */
  decider(cible: string, attribut: string, choix: ChoixArbitrage | null): void;
  cochee(id: string): boolean;
  basculer(id: string): void;
  apercu(): Apercu;
  montrer(a: Apercu): void;
  /**
   * La Vue 3D montre l'apercu choisi d'apres les propositions et les cases d'aujourd'hui : rien ne se
   * repose si rien n'a change. A appeler quand les propositions ont pu changer (mesures, Claude).
   */
  synchroniser(): void;
  /** La Vue 3D vient d'etre rebatie : l'apercu s'y repose. */
  reposer(): void;
  /** Ou est l'ecran des propositions (null : il est ferme) : les deux vues l'evitent. */
  cadrer(panneau: RectEcran | null): void;
  verifications(): EtatVerification[];
  /** Ecrit ce qui est coche, en un pas d'historique ; null s'il n'y a rien a ecrire. */
  valider(): { ecrites: number; verifies: number } | null;
  /** La Vue 3D revient au plan (l'ecran se ferme, on revient a la liste) ; le choix d'apercu reste. */
  oublierApercu(): void;
  /** Les mesures a jour, par `cle#cote` : ce que le fichier de l'audit recopie (§15). */
  mesuresFaites(): ReadonlyMap<string, MesureFacade>;
  /**
   * Un fichier importe (§15) : ses mesures tiennent lieu de calcul, tant que les photos de leur
   * facade ne changent pas ; rejouer le releve donnerait le meme resultat, en plus long.
   */
  poserMesures(mesures: readonly MesureFacade[]): void;
  /** Les cases d'une validation passee (un fichier importe) : acceptees cochees, refusees decochees. */
  preregler(d: DecisionAudit): void;
  /**
   * Consultation d'un audit recu (Admin › Audits) : les propositions et les decisions du fichier,
   * telles qu'elles y sont, prennent la place de celles que la session calculerait. Rien ne se mesure
   * ni ne s'ecrit ; l'apercu avant / apres est le meme, avec les memes cases. Une decision du fichier
   * fait la case (validee : cochee) ; sans aucune decision, les cases par defaut de l'audit.
   */
  figer(propositions: readonly PropositionAuditee[]): void;
  /** Vrai pour une consultation : les cases ne se touchent pas et « Valider » n'ecrit rien. */
  lectureSeule(): boolean;
  /** Ce que le fichier dit de cette proposition (consultation) ; null hors consultation ou si elle n'est pas decidee. */
  decision(id: string): DecisionProposition;
  abonner(f: () => void): () => void;
}

/** Les photos d'une facade, et ce qui les distingue : une photo ajoutee ou retiree relance la mesure. */
const signature = (photos: readonly PhotoCas[]) => photos.map((p) => p.base64.length + ':' + (p.prise?.t ?? '')).join('|');

/** Les mesures des facades photographiees, faites une fois, l'une apres l'autre. */
function mesureurDe(ctx: ContexteValidation, publier: () => void) {
  const faites = new Map<string, { signature: string; mesure: MesureFacade }>();
  let etat: EtatMesures = { etat: 'attente' };
  let enCours: Promise<void> | null = null;
  let version = 0;

  /** Les facades a mesurer : photographiees, avec leurs photos d'aujourd'hui. */
  const aMesurer = () => ctx.liste().batiments.flatMap((b) => b.facades.filter((f) => f.statut === 'photographiee').map((f) => {
    const photos = ctx.capture.lire().batiments[b.cle]?.facades[String(f.cote)]?.photos ?? [];
    return { b, f, photos, cle: cleMesure(b.cle, f.cote), sig: signature(photos) };
  }));

  async function tout(): Promise<void> {
    const liste = aMesurer().filter((x) => faites.get(x.cle)?.signature !== x.sig);
    let n = 0;
    // Dire quand les photos partent a l'analyse des facades, et ce qu'elle en a tire.
    const heure = (): string => { const t = ctx.maintenant(); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
    if (liste.length) ctx.signaler('Photos soumises à l’analyse des façades à ' + heure() + ' : ' + liste.reduce((s, x) => s + x.photos.length, 0) + ' photo(s) sur ' + liste.length + ' façade(s).');
    for (const x of liste) {
      etat = { etat: 'mesure', faites: n, total: liste.length };
      publier();
      const bat = ctx.etat.objects.find((o) => o.key === x.b.cle);
      if (bat && 'pts' in bat && bat.pts) {
        const m = await mesurerFacade(x.b.cle, x.f.facade, { pts: bat.pts }, x.photos, ctx.mesures);
        faites.set(x.cle, { signature: x.sig, mesure: m });
        version++;
      }
      n++;
    }
    etat = { etat: 'pretes' };
    publier();
    if (liste.length) {
      const mesures = liste.map((x) => faites.get(x.cle)?.mesure).filter((m): m is MesureFacade => !!m);
      ctx.signaler('Analyse des photos terminée à ' + heure() + ' : ' + mesures.length + ' façade(s) mesurée(s), coins trouvés sur ' + mesures.filter((m) => m.coinsTrouves).length + '.');
    }
  }

  return {
    etat: () => etat,
    version: () => version,
    /** Les mesures a jour, par `cle#cote` : celles des facades dont les photos n'ont pas change. */
    lues(): Map<string, MesureFacade> {
      const out = new Map<string, MesureFacade>();
      for (const x of aMesurer()) { const m = faites.get(x.cle); if (m && m.signature === x.sig) out.set(x.cle, m.mesure); }
      return out;
    },
    lancer(): Promise<void> {
      // Une mesure en cours repart a la fin pour les photos ajoutees entre-temps.
      enCours ??= tout().finally(() => { enCours = null; });
      return enCours;
    },
    /** Des mesures venues d'ailleurs, signees des photos de la capture d'aujourd'hui. */
    poser(mesures: readonly MesureFacade[]): void {
      for (const m of mesures) {
        const photos = ctx.capture.lire().batiments[m.cle]?.facades[String(m.cote)]?.photos ?? [];
        if (photos.length) faites.set(cleMesure(m.cle, m.cote), { signature: signature(photos), mesure: m });
      }
      version++;
      publier();
    },
  };
}

/**
 * Ce que la Vue 3D montre des propositions : le plan (« Avant »), les deux vues (« Les deux », par
 * defaut : l'utilisateur veut voir l'avant et l'apres ensemble pour decider), ou les copies a la place
 * des batiments (« Après »). Les copies viennent de regles/decisions.ts::projetApres : le plan reste
 * intact, ni l'enregistrement ni les taches de fond ne voient l'apercu. `lire` rend les propositions
 * du moment, celles qui sont cochees, et le numero de leur calcul.
 */
function apercuDe(ctx: ContexteValidation, lire: () => { toutes: readonly Proposition[]; choisies: Proposition[]; calculs: number }) {
  let mode: Apercu = 'deux';
  /** Les batiments reposes d'apres leurs copies dans la vue unique « Après ». */
  let montres: string[] = [];
  /** Les deux vues sont posees dans la Vue 3D. */
  let compare = false;
  /** Ce que la Vue 3D montre (mode, calcul, cases) : rien ne se repose s'il n'a pas change. */
  let montre: string | null = null;

  /** La Vue 3D revient au plan : les deux vues se referment, les batiments reposes reviennent. */
  function retirer(): void {
    if (compare) { ctx.projet.comparer3d?.(null); compare = false; }
    if (montres.length) { ctx.projet.remplacer3d(montres); montres = []; }
  }

  function poser(): void {
    const { toutes, choisies, calculs } = lire();
    const signature = mode + '|' + calculs + '|' + choisies.map((p) => p.id).join(',');
    if (signature === montre) return;
    montre = signature;
    if (mode === 'avant') { retirer(); return; }
    const apres = projetApres(ctx.etat.objects, choisies, jourIso(ctx.maintenant()));
    if (mode === 'deux') {
      if (montres.length) { ctx.projet.remplacer3d(montres); montres = []; }
      // Seuls les batiments que les cases cochees changent different d'une vue a l'autre.
      const cles = apres.touches.filter((c) => c !== 'parcelle');
      const parcelle = apres.touches.includes('parcelle') ? (apres.objets.find((o) => o.key === 'parcelle') ?? null) : null;
      compare = ctx.projet.comparer3d?.({ cles, objets: apres.objets, parcelle }) ?? false;
      // Pas de scene encore (la Vue 3D s'ouvre) : `reposer` reprendra quand elle sera batie.
      if (!compare) montre = null;
      return;
    }
    if (compare) { ctx.projet.comparer3d?.(null); compare = false; }
    // La vue unique ne repose que les batiments, tous ceux que les propositions visent : un decoche y
    // revient ainsi au plan.
    const cles = [...new Set(toutes.map((p) => cleDeLaCible(p.cible)).filter((c): c is string => c !== null))];
    if (!cles.length && !montres.length) return;
    const tous = [...new Set([...montres, ...cles])];
    if (ctx.projet.remplacer3d(tous, apres.objets)) montres = cles;
    else { montres = []; montre = null; }
  }

  return {
    mode: () => mode,
    choisir(a: Apercu): void { mode = a; poser(); },
    poser,
    /** La scene neuve n'a ni deux vues ni batiments reposes : rien a defaire, tout a reposer. */
    reposer(): void { compare = false; montres = []; montre = null; poser(); },
    /** L'ecran se ferme, ou l'on ecrit : la Vue 3D revient au plan ; le mode reste. */
    oublier(): void { retirer(); montre = null; },
  };
}

/**
 * Les photos de l'audit alimentent les facades : un releve mesure sur la photo, aux coins trouves et a la confiance
 * suffisante (ce que les cases cochent par defaut), est pose sur sa facade des que la mesure est prete, sans
 * attendre « Valider ». En un pas d'historique (Ctrl+Z le retire). Jamais sur une facade que la personne a relevee
 * a la main : cette ligne-la reste une proposition decochee qui dit qu'elle remplacerait son choix. Le releve pose
 * porte `depuisAudit` : une nouvelle photo, mesuree plus tard, le remplace, et la ligne n'est plus proposee.
 * Rend le nombre de facades relevees.
 */
function alimenterLesFacades(ctx: ContexteValidation, e: EntreesPropositions): number {
  const prets = propositionsArbitrees(e, {}).filter((p) => p.effet.type === 'releve' && cocheeParDefaut(p));
  if (!prets.length) return 0;
  ctx.projet.pushHistory();
  appliquerPropositions(ctx.etat.objects, prets, [], jourIso(ctx.maintenant()));
  for (const p of prets) {
    if (p.cible.type !== 'facade') continue;
    const cote = p.cible.cote;
    const r = ctx.etat.objects.find((o) => o.key === (p.cible as { cle: string }).cle)?.facades?.find((x) => x.cote === cote);
    if (r) r.depuisAudit = true;
  }
  ctx.projet.render();
  ctx.projet.refaire3d();
  ctx.signaler(prets.length + ' façade' + (prets.length > 1 ? 's relevées' : ' relevée') + ' automatiquement d’après vos photos (Ctrl+Z pour annuler).');
  return prets.length;
}

/**
 * Tout ce que l'audit propose a cet instant : les mesures d'abord, puis Claude (spec-audit §14.2 : l'origine est dite sur
 * chaque ligne). D21 : la valeur notee sur place l'emporte sur celle de Claude (la ligne de Claude arrive decochee, et le dit).
 * La toiture et la hauteur a l'egout sont decidees par l'arbitrage des sources (arbitrages.ts) : les lignes de Claude qui
 * ecrivaient les corps du toit y sont entrees comme un constat de plus.
 */
/** L'ordre d'une liste : par batiment (celui de la liste de controle), puis ce qui se mesure, ce qui se decide, ce qui se voit ; la parcelle a la fin. */
const RANG_EFFETS: readonly string[] = ['releve', 'hauteur', 'hauteurToit', 'couleurMurs', 'materiauMurs', 'couverture', 'corpsToit', 'cheminees', 'terrasse'];

function dansLOrdre(e: EntreesPropositions, propositions: Proposition[]): Proposition[] {
  const batiment = (p: Proposition): number => { const cle = cleDeLaCible(p.cible); const i = cle === null ? -1 : e.liste.batiments.findIndex((b) => b.cle === cle); return cle === null || i < 0 ? Infinity : i; };
  const rang = (p: Proposition): number => { const i = RANG_EFFETS.indexOf(p.effet.type); return i < 0 ? RANG_EFFETS.length : i; };
  // Un tri stable : a egalite, l'ordre d'avant (mesures, arbitrage, Claude, renfort) reste.
  return propositions.map((p, i) => ({ p, i })).sort((a, b) => (batiment(a.p) - batiment(b.p) || rang(a.p) - rang(b.p) || a.i - b.i)).map((x) => x.p);
}

/** Les effets que l'arbitrage des sources decide : les lignes de Claude qui les ecrivaient y sont entrees comme un constat de plus. */
const EFFETS_ARBITRES: readonly string[] = ['corpsToit', 'materiauMurs', 'couverture', 'cheminees'];

function proposer(entrees: EntreesPropositions, reponses: ReturnType<NonNullable<ContexteValidation['analyse']>['reponses']> | undefined, renfort: Record<string, RenfortFacadeCapture> | null | undefined, decisions: ReadonlyMap<string, ChoixArbitrage>) {
  const e: EntreesPropositions = { ...entrees, renfort };
  const deClaude = reponses ? propositionsDeClaude(e.objets, e.liste.batiments, reponses).filter((p) => !EFFETS_ARBITRES.includes(p.effet.type)) : [];
  const arbitrages = arbitragesParBatiment(e, reponses ? votesDesBatiments(reponses) : {}, undefined, Object.fromEntries(decisions) as ChoixArbitrages);
  const propositions = dansLOrdre(e, avecReserveSurPlace([...propositionsDeLAudit(e), ...propositionsDesArbitrages(e, arbitrages), ...deClaude, ...(renfort ? propositionsRenfort(e, renfort) : [])]));
  const observations = reponses || renfort ? observationsDeClaude(e, reponses ?? {}, renfort ?? {}) : [];
  return { propositions, observations, arbitrages };
}

type Memo = { cle: string; objets: unknown; propositions: Proposition[]; observations: ObservationsBatiment[]; defaut: Set<string>; arbitrages: ArbitragesBatiment[] };

export function creerValidation(ctx: ContexteValidation): Validation {
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  const mesureur = mesureurDe(ctx, () => { memo = null; publier(); });
  /** Les cases touchees a la main : elles survivent a un nouveau calcul des propositions. */
  const choix = new Map<string, boolean>();
  /** Augmente a chaque nouveau calcul des propositions : l'apercu se repose alors. */
  let calculs = 0;
  /** Les decisions de la personne sur les arbitrages (`cible|attribut`) ; chacune change le calcul. */
  const decisions = new Map<string, ChoixArbitrage>();
  let versionDecisions = 0;
  let memo: Memo | null = null;
  /** Les propositions d'un audit recu, posees par `figer` : elles tiennent lieu de tout calcul. */
  const decisionsFigees = new Map<string, DecisionProposition>();
  let figees: Memo | null = null;

  const entrees = (): EntreesPropositions => ({ objets: ctx.etat.objects, liste: ctx.liste(), capture: ctx.capture.lire(), mesures: mesureur.lues() });
  function calculer() {
    if (figees) return figees;
    const cle = ctx.capture.version() + ':' + mesureur.version() + ':' + (ctx.analyse?.version() ?? 0) + ':' + versionDecisions;
    if (memo && memo.cle === cle && memo.objets === ctx.etat.objects) return memo;
    const { propositions, observations, arbitrages } = proposer(entrees(), ctx.analyse?.reponses(), ctx.analyse?.renfort?.(), decisions);
    memo = { cle, objets: ctx.etat.objects, propositions, observations, defaut: cochesParDefaut(propositions), arbitrages };
    calculs++;
    return memo;
  }
  /**
   * Les cases d'une validation passee (un fichier importe) : elles viennent apres celles touchees ici,
   * et ne cochent jamais une ligne qui remplacerait un choix fait a la main dans ce projet (§14.3).
   */
  const preregle = new Map<string, boolean>();
  const cochee = (id: string): boolean => {
    const c = choix.get(id);
    if (c !== undefined) return c;
    const p = preregle.get(id);
    if (p === false || (p === true && !calculer().propositions.find((x) => x.id === id)?.remplaceChoix)) return p;
    return calculer().defaut.has(id);
  };
  const cochees = () => new Set(calculer().propositions.filter((p) => cochee(p.id)).map((p) => p.id));
  const verifs = () => verifications(ctx.liste(), ctx.capture.lire(), calculer().propositions, cochees());

  const apercu = apercuDe(ctx, () => {
    const { propositions } = calculer();
    return { toutes: propositions, choisies: propositions.filter((p) => cochee(p.id)), calculs };
  });

  /** Decider, c'est vouloir : la proposition qui en resulte se coche (sa rivale sur place, elle, se decoche). */
  function decider(cible: string, attribut: string, choixArb: ChoixArbitrage | null) {
    if (figees) return;
    const k = cleChoix(cible, attribut);
    // La case d'une proposition qui disparait avec le choix ne doit pas survivre : elle cocherait la prochaine du meme id.
    for (const q of calculer().propositions) if (q.arbitrages?.some((a) => a.cible === cible && a.attribut === attribut)) choix.delete(q.id);
    if (choixArb) decisions.set(k, choixArb); else decisions.delete(k);
    versionDecisions++; memo = null;
    const { propositions } = calculer();
    const p = propositions.find((x) => x.arbitrages?.some((a) => a.cible === cible && a.attribut === attribut));
    if (p) {
      const main = p.arbitrages?.some((a) => a.cible === cible && a.attribut === attribut && (a.decision === 'choisie' || a.decision === 'forcee'));
      if (main) { choix.set(p.id, true); for (const r of rivalesSurPlace(p, propositions)) choix.set(r.id, false); } else choix.delete(p.id);
    }
    apercu.poser();
    publier();
  }

  return {
    mesures: () => (figees ? { etat: 'pretes' } : mesureur.etat()),
    lancer: async () => {
      if (figees) return;
      await mesureur.lancer();
      if (alimenterLesFacades(ctx, entrees())) { memo = null; publier(); }
    },
    entrees,
    propositions: () => calculer().propositions,
    observations: () => calculer().observations,
    arbitrages: () => calculer().arbitrages.map((b) => ({ cle: b.cle, nom: b.nom, arbitrages: b.arbitrages.map((a) => resumeArbitrage(a)) })),
    decider: (cible, attribut, choixArb) => decider(cible, attribut, choixArb),
    cochee,
    basculer(id) {
      if (figees) return;
      const vers = !cochee(id);
      choix.set(id, vers);
      // D21 : cocher une ligne decoche sa rivale (la note sur place contre la valeur de Claude) ; decocher ne rend rien.
      if (vers) {
        const { propositions } = calculer();
        const p = propositions.find((x) => x.id === id);
        for (const r of p ? rivalesSurPlace(p, propositions) : []) choix.set(r.id, false);
      }
      apercu.poser();
      publier();
    },
    apercu: () => apercu.mode(),
    montrer(a) { apercu.choisir(a); publier(); },
    synchroniser: () => apercu.poser(),
    reposer: () => apercu.reposer(),
    cadrer(panneau) { ctx.projet.cadrer3d?.(panneau); },
    verifications: verifs,
    valider() {
      if (figees) return null;
      const { propositions } = calculer();
      const choisies = propositions.filter((p) => cochee(p.id));
      const verifies = verifs().filter((v) => v.verifie).map((v) => v.cle);
      if (!choisies.length && !verifies.length) { ctx.signaler('Aucune proposition cochée : rien n’est écrit dans le projet.'); return null; }
      // L'apercu quitte la Vue 3D avant l'ecriture : elle sera rebatie d'apres le projet ecrit.
      apercu.oublier();
      const maintenant = ctx.maintenant();
      ctx.projet.pushHistory();
      appliquerPropositions(ctx.etat.objects, choisies, verifies, jourIso(maintenant));
      ctx.projet.render();
      ctx.projet.refaire3d();
      ctx.capture.noterDecision({
        t: maintenant.toISOString(), acceptees: choisies.map((p) => p.id), refusees: propositions.filter((p) => !cochee(p.id)).map((p) => p.id), verifies,
        // Telles qu'elles etaient : ecrites, elles ne se proposeront plus, le fichier doit les redire.
        propositions: JSON.parse(JSON.stringify(propositions)) as Proposition[],
      });
      const n = choisies.length;
      const v = verifies.length;
      ctx.signaler((n ? n + ' changement' + (n > 1 ? 's' : '') + ' écrit' + (n > 1 ? 's' : '') + ' dans le projet' : 'Aucun changement')
        + (v ? ', ' + v + ' bâtiment' + (v > 1 ? 's' : '') + ' vérifié' + (v > 1 ? 's' : '') + ' sur place' : '') + '. Ctrl+Z les défait.');
      choix.clear();
      preregle.clear();
      memo = null;
      publier();
      ctx.apresValidation?.();
      return { ecrites: n, verifies: v };
    },
    oublierApercu: () => apercu.oublier(),
    mesuresFaites: () => mesureur.lues(),
    poserMesures: (mesures) => mesureur.poser(mesures),
    preregler(d) {
      preregle.clear();
      for (const id of d.acceptees) preregle.set(id, true);
      for (const id of d.refusees) preregle.set(id, false);
      publier();
    },
    figer(propositions) {
      // La decision n'est pas une proposition : elle reste a part (decisionsFigees), et la copie ne la porte pas.
      const copies = propositions.map((p) => JSON.parse(JSON.stringify({ ...p, decision: undefined })) as Proposition);
      const decidees = propositions.some((p) => p.decision !== null);
      const defaut = decidees ? new Set(propositions.filter((p) => p.decision === 'validee').map((p) => p.id)) : cochesParDefaut(copies);
      decisionsFigees.clear();
      for (const p of propositions) decisionsFigees.set(p.id, p.decision);
      figees = { cle: 'figees', objets: null, propositions: copies, observations: [], defaut, arbitrages: [] };
      calculs++;
      publier();
    },
    lectureSeule: () => figees !== null,
    decision: (id) => decisionsFigees.get(id) ?? null,
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
