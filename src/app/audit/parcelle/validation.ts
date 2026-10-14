// L'audit de la parcelle, phases 2 et 3 sans Claude (MD/spec-audit.md §13.1, §14) : les mesures
// deviennent des propositions, montrees dans la Vue 3D avant et apres, cochees, puis ecrites.
//
// - Les mesures (app/audit/parcelle/mesures.ts) se font une fois par facade et se gardent tant que
//   ses photos ne changent pas ; elles se font l'une apres l'autre, l'ecran dit ou elles en sont.
// - L'apercu « Après » ne touche pas le projet : les batiments concernes sont copies, les propositions
//   cochees ecrites sur les copies, et la Vue 3D repose ces copies a la place des batiments
//   (three/scene.ts::remplacerObjets3d). « Avant », ou l'ecran ferme, y repose les batiments du plan.
//   Ainsi ni l'enregistrement ni les taches de fond ne voient jamais un apercu.
// - « Valider » ecrit tout ce qui est coche en un seul instantane d'historique : Ctrl+Z le defait, et
//   le projet est marque modifie. Les batiments vus et valides sont marques « vérifié sur place ».

import { appliquerPropositions, jourIso, cleDeLaCible, type Proposition } from '../../../model/propositions.js';
import { mesurerFacade, type DependancesMesures, type MesureFacade } from './mesures.js';
import { cleMesure, cochesParDefaut, propositionsDeLAudit, verifications, type EntreesPropositions, type EtatVerification } from './propositions.js';
import { propositionsDeClaude, type ReponsesBatiment } from './propositionsClaude.js';
import type { CaptureEnCours } from './capture.js';
import type { ListeDeControle } from './liste.js';
import type { EtatApp } from '../../../core/state.js';
import type { ObjetPlan } from '../../../model/types.js';
import type { PhotoCas } from '../../../model/audit.js';
import type { DecisionAudit } from '../../../model/auditParcelle.js';

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
}

export type EtatMesures = { etat: 'attente' } | { etat: 'mesure'; faites: number; total: number } | { etat: 'pretes' };
export type Apercu = 'avant' | 'apres';

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
  analyse?: { reponses(): Record<string, ReponsesBatiment> | null; version(): number };
}

export interface Validation {
  mesures(): EtatMesures;
  /** Mesure les facades photographiees qui ne le sont pas encore ; rend quand tout est pret. */
  lancer(): Promise<void>;
  /** Les entrees des propositions a cet instant (le plan, la liste, la capture, les mesures faites). */
  entrees(): EntreesPropositions;
  propositions(): readonly Proposition[];
  cochee(id: string): boolean;
  basculer(id: string): void;
  apercu(): Apercu;
  montrer(a: Apercu): void;
  verifications(): EtatVerification[];
  /** Ecrit ce qui est coche, en un pas d'historique ; null s'il n'y a rien a ecrire. */
  valider(): { ecrites: number; verifies: number } | null;
  /** La Vue 3D revient au plan (l'ecran se ferme, on revient a la liste). */
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

export function creerValidation(ctx: ContexteValidation): Validation {
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  const mesureur = mesureurDe(ctx, () => { memo = null; publier(); });
  /** Les cases touchees a la main : elles survivent a un nouveau calcul des propositions. */
  const choix = new Map<string, boolean>();
  let apercu: Apercu = 'avant';
  let montres: string[] = [];
  let memo: { cle: string; objets: unknown; propositions: Proposition[]; defaut: Set<string> } | null = null;

  const entrees = (): EntreesPropositions => ({ objets: ctx.etat.objects, liste: ctx.liste(), capture: ctx.capture.lire(), mesures: mesureur.lues() });
  function calculer() {
    const cle = ctx.capture.version() + ':' + mesureur.version() + ':' + (ctx.analyse?.version() ?? 0);
    if (memo && memo.cle === cle && memo.objets === ctx.etat.objects) return memo;
    const e = entrees();
    // Les mesures d'abord, puis Claude (spec-audit §14.2 : l'origine est dite sur chaque ligne).
    const reponses = ctx.analyse?.reponses();
    const propositions = [...propositionsDeLAudit(e), ...(reponses ? propositionsDeClaude(e.objets, e.liste.batiments, reponses) : [])];
    memo = { cle, objets: ctx.etat.objects, propositions, defaut: cochesParDefaut(propositions) };
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

  /** Les batiments que les propositions touchent : ceux que l'apercu repose dans la Vue 3D. */
  const batimentsTouches = () => [...new Set(calculer().propositions.map((p) => cleDeLaCible(p.cible)).filter((c): c is string => c !== null))];

  /** La Vue 3D montre l'apercu choisi : les copies avec les propositions cochees, ou le plan. */
  function poserApercu(): void {
    const cles = apercu === 'apres' ? batimentsTouches() : montres;
    if (!cles.length && !montres.length) return;
    if (apercu === 'avant') { ctx.projet.remplacer3d(montres); montres = []; return; }
    // Une copie de surface suffit : sur un batiment, chaque effet remplace le champ qu'il ecrit
    // (model/propositions.ts), il ne modifie rien en place. Le plan reste intact.
    const copies = new Map(ctx.etat.objects.filter((o) => cles.includes(o.key)).map((o) => [o.key, { ...o } as ObjetPlan]));
    const choisies = calculer().propositions.filter((p) => cochee(p.id) && p.cible.type !== 'parcelle');
    appliquerPropositions([...copies.values()], choisies, [], jourIso(ctx.maintenant()));
    const apres = ctx.etat.objects.map((o) => copies.get(o.key) ?? o);
    // Les batiments montres avant et plus touches maintenant reviennent au plan.
    const tous = [...new Set([...montres, ...cles])];
    ctx.projet.remplacer3d(tous, apres);
    montres = cles;
  }

  return {
    mesures: () => mesureur.etat(),
    lancer: () => mesureur.lancer(),
    entrees,
    propositions: () => calculer().propositions,
    cochee,
    basculer(id) {
      choix.set(id, !cochee(id));
      if (apercu === 'apres') poserApercu();
      publier();
    },
    apercu: () => apercu,
    montrer(a) { apercu = a; poserApercu(); publier(); },
    verifications: verifs,
    valider() {
      const { propositions } = calculer();
      const choisies = propositions.filter((p) => cochee(p.id));
      const verifies = verifs().filter((v) => v.verifie).map((v) => v.cle);
      if (!choisies.length && !verifies.length) { ctx.signaler('Aucune proposition cochée : rien n’est écrit dans le projet.'); return null; }
      // L'apercu revient au plan avant l'ecriture : la Vue 3D sera rebatie d'apres le projet ecrit.
      apercu = 'avant';
      montres = [];
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
    oublierApercu() { if (apercu === 'apres' || montres.length) { apercu = 'avant'; poserApercu(); } },
    mesuresFaites: () => mesureur.lues(),
    poserMesures: (mesures) => mesureur.poser(mesures),
    preregler(d) {
      preregle.clear();
      for (const id of d.acceptees) preregle.set(id, true);
      for (const id of d.refusees) preregle.set(id, false);
      publier();
    },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
