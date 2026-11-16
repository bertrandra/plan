// L'enregistrement automatique du projet (audit de l'IHM du 16 novembre 2026, lot 1).
//
// Plan n'enregistrait que sur demande (Ctrl+S, le bouton « Enregistrer ») : un ajout fait puis la page
// rechargee, et il etait perdu. Desormais, quelques secondes apres la derniere modification qui marque
// le projet « modifie », le projet s'enregistre de lui-meme, par le meme chemin que Ctrl+S
// (app/projet.ts) : meme document, meme taille annoncee, meme statut dans la barre d'etat.
//
// Ce qu'il ne fait pas :
//   - pendant un geste (un doigt ou un bouton de souris appuye) : il attend qu'il soit lache ;
//   - en lecture seule, sans plateforme, ou sans projet ouvert : un plan qui n'est pas encore un projet
//     (le premier pas « Dessiner sans adresse », la demonstration sans serveur) ne se cree pas d'office,
//     parce que creer un projet compte dans le quota de l'organisation (`projet.nouveau`, QUOTA_PROJETS).
//     La barre d'etat le dit (zones/statut.ts) ;
//   - par-dessus un enregistrement en cours (Ctrl+S, la tache de fond des toits) : il repasse apres ;
//   - quand la personne l'a decoche (Fichier › Enregistrement automatique, une preference de
//     l'appareil, cochee par defaut : ni Ctrl+Z, ni « projet modifie »).
//
// Un echec ne se perd pas : la barre d'etat le dit, et une nouvelle tentative suit (10 s, 30 s, puis
// chaque minute), tant que le projet reste a enregistrer.

/** Le delai entre la derniere modification et l'enregistrement : assez pour qu'une suite de saisies n'en fasse qu'un. */
export const DELAI_ENREGISTREMENT_AUTO_MS = 4000;
/** Un geste ou un enregistrement en cours : on revient voir apres ce delai. */
export const ATTENTE_OCCUPE_MS = 1000;
/** Les nouvelles tentatives apres un echec : la derniere se repete. */
export const REPRISES_APRES_ECHEC_MS = [10_000, 30_000, 60_000] as const;
const DELAI_REPRISE_MAX_MS = 60_000;

/** La preference, gardee dans le navigateur : elle suit l'appareil, pas le projet. */
export const CLE_PREFERENCE_ENREGISTREMENT_AUTO = 'plan.enregistrementAuto';

export interface Minuteur {
  poser(f: () => void, ms: number): unknown;
  annuler(id: unknown): void;
}

const MINUTEUR_DU_NAVIGATEUR: Minuteur = {
  poser: (f, ms) => setTimeout(f, ms),
  annuler: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
};

export interface ContexteEnregistrementAuto {
  /** La preference est cochee. */
  actif(): boolean;
  /** Le projet peut s'enregistrer : un projet ouvert sur la plateforme, le droit d'ecrire, pas en lecture seule. */
  possible(): boolean;
  /** Le projet a des modifications non enregistrees. */
  sale(): boolean;
  /** Le compteur des modifications (core/historique.ts) : seul son changement relance le delai. */
  modifications(): number;
  /** Un geste est en cours (un pointeur appuye) : on n'enregistre pas un etat de milieu de geste. */
  occupe(): boolean;
  /** Un enregistrement est deja en cours (Ctrl+S, la tache de fond des toits). */
  enregistrementEnCours(): boolean;
  /** Enregistre, sans toast ; rend vrai si la plateforme l'a accepte. */
  enregistrer(): Promise<boolean>;
  /** Un echec : le combientieme d'affilee, et le delai avant la prochaine tentative. */
  apresEchec?(echecs: number, repriseMs: number): void;
  minuteur?: Minuteur;
  delaiMs?: number;
}

export interface EnregistrementAuto {
  /** A appeler quand le statut du projet change (une modification, un enregistrement). */
  signaler(): void;
  /** Un enregistrement automatique part en ce moment. */
  enCours(): boolean;
  /** Un enregistrement automatique est prevu (le delai court, ou une reprise apres echec). */
  prevu(): boolean;
  /** Les echecs d'affilee, remis a zero au premier succes. */
  echecs(): number;
  /** Oublie ce qui etait prevu (la preference decochee, la page qui part). */
  arreter(): void;
}

export function creerEnregistrementAuto(ctx: ContexteEnregistrementAuto): EnregistrementAuto {
  const minuteur = ctx.minuteur ?? MINUTEUR_DU_NAVIGATEUR;
  const delai = ctx.delaiMs ?? DELAI_ENREGISTREMENT_AUTO_MS;
  let prevu: unknown = null;
  let enCours = false;
  let echecs = 0;
  // Le compteur vu au dernier signal : un statut republie sans modification nouvelle ne relance pas le delai.
  let vu = ctx.modifications();

  function annuler(): void {
    if (prevu !== null) minuteur.annuler(prevu);
    prevu = null;
  }
  function armer(ms: number): void {
    annuler();
    prevu = minuteur.poser(() => { prevu = null; void tenter(); }, ms);
  }
  const permis = () => ctx.actif() && ctx.possible();

  async function tenter(): Promise<void> {
    if (!permis() || !ctx.sale()) return;
    if (enCours || ctx.occupe() || ctx.enregistrementEnCours()) { armer(ATTENTE_OCCUPE_MS); return; }
    enCours = true;
    let ok = false;
    try { ok = await ctx.enregistrer(); } catch { ok = false; } finally { enCours = false; }
    if (ok) {
      echecs = 0;
      vu = ctx.modifications();
      // Modifie pendant l'envoi : ce qui est parti n'est plus tout le plan, il reste a enregistrer.
      if (ctx.sale() && permis()) armer(delai);
      return;
    }
    echecs++;
    const reprise = REPRISES_APRES_ECHEC_MS[Math.min(echecs, REPRISES_APRES_ECHEC_MS.length) - 1] ?? DELAI_REPRISE_MAX_MS;
    ctx.apresEchec?.(echecs, reprise);
    if (permis()) armer(reprise);
  }

  return {
    signaler() {
      const n = ctx.modifications();
      const nouvelle = n !== vu;
      vu = n;
      if (!permis() || !ctx.sale()) {
        // Plus rien a enregistrer (enregistre a la main, annule jusqu'a l'etat enregistre) ou plus permis.
        if (!enCours) { annuler(); if (!ctx.sale()) echecs = 0; }
        return;
      }
      // Une reprise apres echec garde son delai : une modification ne la rapproche pas. Sinon, chaque
      // modification nouvelle relance le delai ; rien de prevu (la preference recochee), on le pose.
      if (echecs > 0 && prevu !== null) return;
      if (nouvelle || prevu === null) { if (!enCours) armer(delai); }
    },
    enCours: () => enCours,
    prevu: () => prevu !== null,
    echecs: () => echecs,
    arreter: annuler
  };
}

/** Lit la preference (cochee par defaut, et quand le stockage est refuse). */
export function lirePreferenceEnregistrementAuto(stockage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): boolean {
  try { return stockage?.getItem(CLE_PREFERENCE_ENREGISTREMENT_AUTO) !== 'non'; } catch { return true; }
}

/** Ecrit la preference ; un stockage refuse (navigation privee) la garde pour la session seulement. */
export function ecrirePreferenceEnregistrementAuto(actif: boolean, stockage: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null): void {
  try { stockage?.setItem(CLE_PREFERENCE_ENREGISTREMENT_AUTO, actif ? 'oui' : 'non'); } catch { /* preference de session */ }
}

/**
 * Un pointeur appuye quelque part dans la page : un geste en cours (glisser un sommet, tirer une
 * poignee, pincer le plan). Ecoute en capture, pour etre vu meme quand un geste avale l'evenement.
 */
export function suivreLesPointeurs(cible: Pick<Window, 'addEventListener'> = window): () => boolean {
  const appuyes = new Set<number>();
  cible.addEventListener('pointerdown', (e) => { appuyes.add((e as PointerEvent).pointerId); }, true);
  const lacher = (e: Event) => { appuyes.delete((e as PointerEvent).pointerId); };
  cible.addEventListener('pointerup', lacher, true);
  cible.addEventListener('pointercancel', lacher, true);
  // La fenetre perd le focus au milieu d'un geste (une autre application) : le geste est fini.
  cible.addEventListener('blur', () => { appuyes.clear(); });
  return () => appuyes.size > 0;
}
