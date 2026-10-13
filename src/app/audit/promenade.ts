// L'etat d'une promenade d'audit (MD/spec-audit.md §18.3 a §18.5) : les batiments marques et ce qu'on
// en a dit. Aucun DOM ici : le controleur (app/audit/controleur.ts) branche le doigt, la Vue 3D et
// le partage.
//
// Marquer est immediat (le batiment passe en rouge sous le doigt) ; ce qui vient du reseau — la
// grille LiDAR relue, l'adresse — complete le cas ensuite, sans rien bloquer.

import { fichierPromenade, PHOTOS_PAR_CAS_MAX, type CasAudit, type CategorieAudit, type FichierPromenade, type LectureFacade, type MetaPromenade, type PhotoCas } from '../../model/audit.js';
import type { GrilleRelief } from '../../model/relief.js';
import type { PtBrut } from '../../model/types.js';

export interface DependancesPromenade {
  /** Ce qui se fige sans attendre : identite, entrees (sans grille), sorties. `null` si l'objet n'est plus la. */
  figer: (cle: string) => Pick<CasAudit, 'identite' | 'entrees' | 'sorties'> | null;
  /** La grille LiDAR relue sous le batiment, au moment de la marque. */
  lireGrille?: (cle: string) => Promise<GrilleRelief | null>;
  /** L'adresse du batiment (geocodage inverse). */
  adresse?: (cle: string) => Promise<string | null>;
  maintenant?: () => Date;
}

export interface Completion {
  categorie?: CategorieAudit;
  problemes?: string[];
  note?: string;
  /** Une photo de plus, a la suite des autres ; au-dela de six, elle est ignoree. */
  ajouterPhoto?: PhotoCas;
  /** Retire la photo de ce rang (et la couleur qu'elle a donnee). */
  retirerPhoto?: number;
  /** La couleur d'une facade lue sur une photo : elle remplace celle que cette photo avait donnee. */
  lectureFacade?: LectureFacade;
}

export interface Promenade {
  /** Le debut de la promenade ; celui d'un audit repris (brouillon local) quand on le reprend. */
  readonly debut: Date;
  estMarque(cle: string): boolean;
  cas(cle: string): CasAudit | undefined;
  liste(): CasAudit[];
  /** Marque le batiment (categorie « toit » par defaut). Deja marque : le cas existant. */
  marquer(cle: string, position: PtBrut, precisionM: number | null): CasAudit | null;
  retirer(cle: string): void;
  completer(cle: string, c: Completion): void;
  fichier(meta: Omit<MetaPromenade, 'debut' | 'fin'>): FichierPromenade;
  /** Les lectures du reseau encore en cours (grilles, adresses) : a attendre avant de partager. */
  enCours(): Promise<void>;
  /**
   * Reprend un audit laisse en cours (le brouillon local, io/brouillonAudit.ts) : son debut, et ses
   * cas avant ceux deja notes ici. Un batiment note des deux cotes garde le cas repris.
   */
  reprendre(debut: Date, cas: readonly CasAudit[]): void;
  /**
   * Relance la grille et l'adresse des cas qui ne les ont pas (un audit repris : l'onglet a pu etre
   * tue avant leur arrivee), une fois par cas, quand leur batiment est de nouveau dans le plan.
   */
  relireManquants(present: (cle: string) => boolean): void;
  abonner(f: () => void): () => void;
}

export function creerPromenade(d: DependancesPromenade): Promenade {
  const maintenant = d.maintenant ?? (() => new Date());
  let debut = maintenant();
  let cas = new Map<string, CasAudit>();
  const relus = new Set<string>();
  const abonnes = new Set<() => void>();
  const lectures = new Set<Promise<unknown>>();
  let numero = 0;
  const signaler = () => abonnes.forEach((f) => f());
  const suivre = (p: Promise<unknown>) => { lectures.add(p); void p.finally(() => lectures.delete(p)); };
  /** La grille et l'adresse arrivent ensuite ; un cas retire entre-temps n'est pas ressuscite. */
  function lire(cle: string, c: CasAudit, quoi: { grille: boolean; adresse: boolean }): void {
    if (quoi.grille && d.lireGrille) suivre(d.lireGrille(cle).then((g) => { if (cas.get(cle) === c && g) { c.entrees.grille = g; signaler(); } }).catch(() => {}));
    if (quoi.adresse && d.adresse) suivre(d.adresse(cle).then((a) => { if (cas.get(cle) === c && a) { c.identite.adresse = a; signaler(); } }).catch(() => {}));
  }

  return {
    get debut() { return debut; },
    estMarque: (cle) => cas.has(cle),
    cas: (cle) => cas.get(cle),
    liste: () => [...cas.values()],
    marquer(cle, position, precisionM) {
      const deja = cas.get(cle);
      if (deja) return deja;
      const fige = d.figer(cle);
      if (!fige) return null;
      const t = maintenant().toISOString();
      const c: CasAudit = {
        id: 'c' + ++numero, cle, statut: 'a_corriger',
        constat: { categorie: 'toit', problemes: [], note: '', t, position: { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10, precisionM }, photos: [] },
        ...fige, attendu: null, historique: [{ t, texte: 'marqué sur le terrain' }],
      };
      cas.set(cle, c);
      relus.add(cle);
      lire(cle, c, { grille: true, adresse: true });
      signaler();
      return c;
    },
    retirer(cle) { if (cas.delete(cle)) signaler(); },
    completer(cle, x) {
      const c = cas.get(cle);
      if (!c) return;
      if (x.categorie) c.constat.categorie = x.categorie;
      if (x.problemes) c.constat.problemes = [...new Set(x.problemes)];
      if (x.note !== undefined) c.constat.note = x.note;
      if (x.retirerPhoto !== undefined) {
        const r = x.retirerPhoto;
        c.constat.photos = c.constat.photos.filter((_, i) => i !== r);
        // Les lectures designent leur photo par son rang : celles des photos suivantes descendent d'un cran.
        if (c.lectures) c.lectures = { facades: c.lectures.facades.filter((l) => l.photo !== r).map((l) => (l.photo > r ? { ...l, photo: l.photo - 1 } : l)) };
      }
      if (x.ajouterPhoto && c.constat.photos.length < PHOTOS_PAR_CAS_MAX) c.constat.photos = [...c.constat.photos, x.ajouterPhoto];
      const l = x.lectureFacade;
      if (l && l.photo >= 0 && l.photo < c.constat.photos.length) {
        c.lectures = { facades: [...(c.lectures?.facades ?? []).filter((v) => v.photo !== l.photo), { ...l }].sort((a, b) => a.photo - b.photo) };
      }
      signaler();
    },
    fichier(meta) {
      return fichierPromenade({ ...meta, debut: debut.toISOString(), fin: maintenant().toISOString() }, [...cas.values()]);
    },
    async enCours() { await Promise.allSettled([...lectures]); },
    reprendre(debutRepris, repris) {
      const suite = new Map<string, CasAudit>(repris.map((c) => [c.cle, c]));
      for (const [cle, c] of cas) if (!suite.has(cle)) suite.set(cle, c);
      cas = suite;
      debut = debutRepris;
      // Les numeros reprennent apres le plus grand : deux cas ne portent jamais le meme identifiant.
      const vus = new Set<string>();
      for (const c of cas.values()) {
        const n = /^c(\d+)$/.exec(c.id);
        if (n) numero = Math.max(numero, Number(n[1]));
      }
      for (const c of cas.values()) { if (vus.has(c.id)) c.id = 'c' + ++numero; vus.add(c.id); }
      signaler();
    },
    relireManquants(present) {
      for (const [cle, c] of cas) {
        if (relus.has(cle) || !present(cle)) continue;
        const quoi = { grille: !c.entrees.grille, adresse: !c.identite.adresse };
        relus.add(cle);
        if (quoi.grille || quoi.adresse) lire(cle, c, quoi);
      }
    },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
