// La sauvegarde de l'audit de la parcelle sur le serveur de Plan, pendant la capture (MD/spec-audit.md
// §15) : le brouillon de l'appareil (io/brouillonAudit.ts) se perd avec le telephone ou le
// navigateur ; une copie sur le serveur permet de reprendre l'audit ailleurs, ou de le rejouer.
//
// - Elle part quand quelqu'un peut envoyer (session admin ou jeton de la plateforme, comme le
//   corpus) : quelques secondes apres la derniere photo rangee (un envoi pour une rafale, pas un par
//   geste), a « Lancer l'analyse », et a la demande (« Envoyer l'audit au serveur »).
// - Le meme depot est remplace a chaque envoi (PUT, son identifiant et son secret sont gardes avec la
//   capture) ; s'il a ete retire entre-temps, un nouveau le remplace.
// - Sans reseau (ou serveur indisponible), elle reessaie plus tard, de plus en plus espace, et des que
//   le navigateur retrouve le reseau ; la capture n'attend jamais.
// - Elle se distingue du partage « pour améliorer Plan » (corpus.ts, decision D7) par sa marque
//   (`sauvegarde`) : le corpus n'apprend pas d'une capture inachevee, et l'ecran Conformite l'ignore.
// - L'envoi automatique est celui de l'administrateur, ou d'un utilisateur qui laisse cochee la case
//   du partage (son accord d'envoyer le fichier, photos comprises, au serveur de Plan) ; sinon, rien
//   ne part sans le bouton. Decocher la case retire aussi la sauvegarde d'un utilisateur.

import { photosDeLaCapture, type CaptureParcelle } from '../../../model/auditParcelle.js';
import { EchecPartageAudit, TAILLE_MAX_AUDIT, type ClientAudits } from '../../../io/auditsServeur.js';
import type { FichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import type { CaptureEnCours } from './capture.js';

/** Une rafale de photos ne fait qu'un envoi : on attend ce calme apres la derniere. */
export const DELAI_REGROUPEMENT_MS = 5000;
/** Les nouveaux essais sans reseau, de plus en plus espaces ; le dernier se repete. */
export const REESSAIS_MS: readonly number[] = [15000, 30000, 60000, 120000, 300000];

export interface DependancesSauvegarde {
  capture: CaptureEnCours;
  /** Le client des routes `admin/audits`, ou null quand personne ne peut envoyer. */
  client: () => ClientAudits | null;
  fichier: () => Promise<FichierAuditParcelle>;
  /** L'envoi automatique est permis (administrateur, ou accord du partage). */
  automatique: () => boolean;
  maintenant: () => Date;
  delaiMs?: number;
  reessaisMs?: readonly number[];
  tailleMax?: number;
  /** Rappelle `f` dans `ms` ; rend de quoi l'annuler. Par defaut `setTimeout`. */
  planifier?: (f: () => void, ms: number) => () => void;
  /** Appelle `f` quand le reseau revient ; rend de quoi se desabonner. Par defaut l'evenement `online`. */
  surReseau?: (f: () => void) => () => void;
}

export type EtatEnvoi =
  | { etat: 'repos' }
  | { etat: 'attente' }
  | { etat: 'envoi' }
  | { etat: 'envoye'; t: string }
  /** Sans reseau ou serveur indisponible : un nouvel essai est prevu a `essai` (ISO). */
  | { etat: 'reessai'; essai: string; horsLigne: boolean; message: string }
  | { etat: 'erreur'; message: string }
  | { etat: 'tropGros'; octets: number; max: number };

export type EtatSauvegarde = EtatEnvoi & {
  /** Quelqu'un peut envoyer : la ligne se montre. */
  disponible: boolean;
  automatique: boolean;
  /** Le dernier envoi reussi (ISO), meme quand l'etat dit autre chose. */
  dernier: string | null;
};

export interface Sauvegarde {
  etat(): EtatSauvegarde;
  /** Une photo rangee : un envoi regroupe part dans quelques secondes, si l'envoi automatique est permis. */
  planifier(): void;
  /** Tout de suite (le bouton, « Lancer l'analyse ») ; rend vrai si le serveur l'a recu. */
  envoyer(): Promise<boolean>;
  /** Retire le depot du serveur (un utilisateur decoche le partage). */
  retirer(): Promise<void>;
  abonner(f: () => void): () => void;
}

/** Ce qu'une photo change : leur nombre et leur poids, pas une note tapee. */
export function signaturePhotos(c: CaptureParcelle): string {
  return photosDeLaCapture(c).map((p) => p.base64.length).join(',');
}

/** Les octets du texte en UTF-8 : ce que le serveur compte (les photos en base64 sont en ASCII). */
export function octetsUtf8(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    // Une paire de substitution (un emoji) : quatre octets pour les deux unites.
    else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
/** « 17:42 » : l'heure locale d'un instant ISO. */
export function heureDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : deuxChiffres(d.getHours()) + ':' + deuxChiffres(d.getMinutes());
}
/** « à 17:42 » aujourd'hui, « le 13/10 à 17:42 » un autre jour. */
function quand(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jour = d.toDateString() === maintenant.toDateString() ? '' : 'le ' + deuxChiffres(d.getDate()) + '/' + deuxChiffres(d.getMonth() + 1) + ' ';
  return jour + 'à ' + heureDe(iso);
}
const mo = (octets: number) => Math.ceil(octets / (1024 * 1024)) + ' Mo';

/** La phrase de la ligne « Envoyer l'audit au serveur » : ce qui est parti, ce qui va partir, ou pourquoi rien ne part. */
export function texteDeLaSauvegarde(e: EtatSauvegarde, maintenant: Date = new Date()): string {
  const dernier = e.dernier ? ' Dernier envoi ' + quand(e.dernier, maintenant) + '.' : '';
  switch (e.etat) {
    case 'attente': return 'Envoi au serveur dans quelques secondes…';
    case 'envoi': return 'Envoi de l’audit au serveur…';
    case 'envoye': return 'Envoyé ' + quand(e.t, maintenant) + '.' + (e.automatique ? ' Chaque photo y part aussi, quelques secondes après.' : '');
    case 'reessai': return (e.horsLigne ? 'En attente de réseau' : 'Le serveur n’a pas répondu (' + e.message + ')') + ', nouvel essai ' + quand(e.essai, maintenant) + '.' + dernier;
    case 'erreur': return 'L’envoi n’a pas abouti : ' + e.message.replace(/[.\s]+$/, '') + '.' + dernier;
    case 'tropGros': return 'L’audit pèse ' + mo(e.octets) + ' : le serveur de Plan en accepte ' + mo(e.max) + ' au plus. Retirez quelques photos pour qu’il puisse partir.' + dernier;
    default: return e.automatique
      ? 'Chaque photo part aussi sur le serveur de Plan, quelques secondes après : rien ne se perd si le téléphone s’éteint.'
      : 'Rien n’est encore parti : l’envoi met l’audit à l’abri sur le serveur de Plan.';
  }
}

const planifierNavigateur = (f: () => void, ms: number) => { const m = setTimeout(f, ms); return () => clearTimeout(m); };
const reseauNavigateur = (f: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', f);
  return () => window.removeEventListener('online', f);
};

/** Un refus qui se reessaie : pas de reponse, un serveur indisponible ou surcharge. */
const passager = (statut: number | null) => statut === null || statut >= 500 || statut === 408 || statut === 429;

export function creerSauvegarde(d: DependancesSauvegarde): Sauvegarde {
  const abonnes = new Set<() => void>();
  const publier = () => abonnes.forEach((f) => f());
  const planifier = d.planifier ?? planifierNavigateur;
  const reessais = d.reessaisMs ?? REESSAIS_MS;
  const max = d.tailleMax ?? TAILLE_MAX_AUDIT;
  const depot = () => d.capture.lire().sauvegarde ?? null;
  let etat: EtatEnvoi = { etat: 'repos' };
  let enCours = false, encore = false, essais = 0;
  let annuler: (() => void) | null = null;
  const attendre = (f: () => void, ms: number) => { annuler?.(); annuler = planifier(() => { annuler = null; f(); }, ms); };
  // Le reseau revenu : un essai en attente part sans attendre son heure.
  (d.surReseau ?? reseauNavigateur)(() => { if (etat.etat === 'reessai') void envoyer(); });

  async function deposer(client: ClientAudits, texte: string): Promise<{ id: string; retrait: string }> {
    const prec = depot();
    if (prec) {
      try { return await client.remplacer(prec.id, prec.retrait, texte, 'sauvegarde'); } catch (e) {
        // Retire entre-temps (l'administrateur l'a jete) : un nouveau depot le remplace.
        if (!(e instanceof EchecPartageAudit && e.statut === 404)) throw e;
      }
    }
    return client.envoyer(texte, 'sauvegarde');
  }

  async function envoyer(): Promise<boolean> {
    const client = d.client();
    if (!client) return false;
    // Un envoi en cours : le suivant partira juste apres, avec ce qui vient de changer.
    if (enCours) { encore = true; return false; }
    annuler?.(); annuler = null;
    enCours = true;
    etat = { etat: 'envoi' };
    publier();
    let reussi = false;
    try {
      const texte = JSON.stringify(await d.fichier());
      const octets = octetsUtf8(texte);
      if (octets > max) { etat = { etat: 'tropGros', octets, max }; return false; }
      const recu = await deposer(client, texte);
      const t = d.maintenant().toISOString();
      d.capture.noterSauvegarde({ id: recu.id, retrait: recu.retrait, t });
      etat = { etat: 'envoye', t };
      essais = 0;
      reussi = true;
    } catch (e) {
      const statut = e instanceof EchecPartageAudit ? e.statut : null;
      const message = ((e as Error).message || String(e)).replace(/^[^:]*: /, '');
      if (statut === 413) etat = { etat: 'erreur', message: 'le serveur le refuse, trop gros (' + message + ')' };
      else if (passager(statut)) {
        const ms = reessais[Math.min(essais, reessais.length - 1)] ?? 60000;
        essais++;
        etat = { etat: 'reessai', essai: new Date(d.maintenant().getTime() + ms).toISOString(), horsLigne: statut === null, message };
        attendre(() => { void envoyer(); }, ms);
      } else etat = { etat: 'erreur', message };
    } finally {
      enCours = false;
      if (encore) { encore = false; attendre(() => { void envoyer(); }, 0); }
      publier();
    }
    return reussi;
  }

  return {
    etat: () => {
      const dernier = depot()?.t ?? null;
      // Rien en cours depuis l'ouverture : la capture dit ce qui est deja parti (un brouillon repris).
      const e: EtatEnvoi = etat.etat === 'repos' && dernier ? { etat: 'envoye', t: dernier } : etat;
      return { ...e, disponible: d.client() !== null, automatique: d.automatique(), dernier };
    },
    planifier() {
      if (!d.client() || !d.automatique()) return;
      if (enCours) { encore = true; return; }
      etat = { etat: 'attente' };
      attendre(() => { void envoyer(); }, d.delaiMs ?? DELAI_REGROUPEMENT_MS);
      publier();
    },
    envoyer,
    async retirer() {
      const client = d.client(), prec = depot();
      annuler?.(); annuler = null;
      if (!client || !prec) { etat = { etat: 'repos' }; publier(); return; }
      try {
        await client.retirer(prec.id, prec.retrait);
        d.capture.noterSauvegarde(null);
        etat = { etat: 'repos' };
      } catch (e) {
        etat = { etat: 'erreur', message: 'le retrait de la sauvegarde n’a pas abouti (' + ((e as Error).message || String(e)) + ')' };
      }
      publier();
    },
    abonner(f) { abonnes.add(f); return () => { abonnes.delete(f); }; },
  };
}
