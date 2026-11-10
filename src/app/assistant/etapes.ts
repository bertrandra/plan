// Les etapes de l'assistant (lot L6 de MD/spec-lecture-ia-elargie.md §4.7, §5.5) : la reponse de Claude relue dans la forme du contrat,
// puis chaque etape confrontee au catalogue de Plan maintenant.
//
// Le contrat : `{ etapes: { commande?: string; champ?: { objet, cle, valeur }; pourquoi }[], questions?: string[] }`. Le schema de la
// sortie structuree est plat (deploy/schema-assistant.json : un `genre`, des chaines vides pour ce qui ne sert pas) ; `lireReponse` le
// ramene au contrat. Rien de ce que Claude ecrit ne s'execute tel quel : `resoudre` ne garde que ce que le catalogue connait, dit
// pourquoi une etape est grisee (le registre, la lecture seule, une valeur hors bornes), et prepare la valeur a ecrire.

import { nombreTexte, raisonDeRefus, type Catalogue, type ChampCatalogue, type Ecrit } from './catalogue.js';

/** Une etape telle que le contrat la dit (§4.7). */
export interface EtapeLue {
  commande?: string;
  champ?: { objet: string; cle: string; valeur: string };
  pourquoi: string;
}

export interface ReponseAssistant { etapes: EtapeLue[]; questions: string[] }

/** Une valeur a ecrire dans un champ, deja dans le type du descripteur. */
export type ValeurChamp = string | number | boolean;

/** Une etape montree a la personne : son libelle lisible, et si Plan l'accepte maintenant. */
export interface EtapeProposee {
  libelle: string;
  pourquoi: string;
  ecrit: Ecrit;
  /** Grisee : la raison, que l'ecran dit sous l'etape ; null : utilisable. */
  refus: string | null;
  commande?: string;
  /** Une bascule : ce qu'elle fera (vrai : afficher). */
  afficher?: boolean;
  champ?: { objet: string; cle: string; valeur: ValeurChamp };
}

const chaine = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** La sortie de Claude (deploy/schema-assistant.json), relue dans la forme du contrat ; une sortie illisible ne rend rien. */
export function lireReponse(sortie: unknown): ReponseAssistant {
  const s = sortie && typeof sortie === 'object' ? sortie as Record<string, unknown> : {};
  const etapes: EtapeLue[] = [];
  for (const x of Array.isArray(s.etapes) ? s.etapes : []) {
    if (!x || typeof x !== 'object') continue;
    const e = x as Record<string, unknown>;
    const pourquoi = chaine(e.pourquoi);
    if (e.genre === 'commande' && chaine(e.commande)) etapes.push({ commande: chaine(e.commande), pourquoi });
    else if (e.genre === 'champ' && chaine(e.champ)) etapes.push({ champ: { objet: chaine(e.objet), cle: chaine(e.champ), valeur: typeof e.valeur === 'string' ? e.valeur.trim() : String(e.valeur ?? '') }, pourquoi });
  }
  const questions = (Array.isArray(s.questions) ? s.questions : []).map(chaine).filter(Boolean);
  return { etapes, questions };
}

/** Le mot d'une valeur, pour le libelle de l'etape : le libelle d'une option, oui/non, le nombre et son unite. */
function valeurLisible(ch: ChampCatalogue, v: ValeurChamp): string {
  if (ch.type === 'case') return v ? 'oui' : 'non';
  if (ch.type === 'choix') return ch.options?.find((o) => o.valeur === v)?.libelle || String(v);
  if (ch.type === 'nombre') return String(v).replace('.', ',') + (ch.unite ? ' ' + ch.unite : '');
  return String(v);
}

/** La valeur ecrite par Claude, dans le type du champ ; ou la raison de la refuser. */
export function valeurDuChamp(ch: ChampCatalogue, brut: string): { valeur: ValeurChamp } | { refus: string } {
  switch (ch.type) {
    case 'case': {
      const v = brut.toLowerCase();
      if (['oui', 'true', 'vrai', '1'].includes(v)) return { valeur: true };
      if (['non', 'false', 'faux', '0'].includes(v)) return { valeur: false };
      return { refus: 'Valeur refusée : « ' + brut + ' » n’est ni oui ni non.' };
    }
    case 'nombre': {
      const n = Number(brut.replace(',', '.').replace(/\s/g, ''));
      if (!brut || !Number.isFinite(n)) return { refus: 'Valeur refusée : « ' + brut + ' » n’est pas un nombre.' };
      const u = ch.unite ? ' ' + ch.unite : '';
      if ((ch.min !== undefined && n < ch.min) || (ch.max !== undefined && n > ch.max)) {
        return { refus: 'Valeur refusée : ' + nombreTexte(n).replace('.', ',') + u + ' sort des bornes du champ ('
          + (ch.min !== undefined ? 'de ' + nombreTexte(ch.min).replace('.', ',') : '') + (ch.max !== undefined ? ' à ' + nombreTexte(ch.max).replace('.', ',') : '') + u + ').' };
      }
      return { valeur: n };
    }
    case 'choix':
      return ch.options?.some((o) => o.valeur === brut) ? { valeur: brut } : { refus: 'Valeur refusée : « ' + brut + ' » n’est pas une option de ce champ.' };
    case 'couleur':
      return /^#[0-9a-fA-F]{6}$/.test(brut) ? { valeur: brut.toLowerCase() } : { refus: 'Valeur refusée : « ' + brut + ' » n’est pas une couleur (#rrggbb).' };
    case 'texte':
      return brut.length <= 200 ? { valeur: brut } : { refus: 'Valeur refusée : un texte de plus de 200 caractères.' };
  }
}

const LECTURE_SEULE = 'Lecture seule : seules les préférences d’affichage s’appliquent.';

/** Une etape lue, confrontee au catalogue : son libelle, ce qu'elle ecrit, et sa raison d'etre grisee. */
export function resoudreEtape(e: EtapeLue, cat: Catalogue): EtapeProposee {
  if (e.commande) {
    const c = cat.commandes.find((x) => x.id === e.commande);
    if (!c) return { libelle: 'Commande « ' + e.commande + ' »', pourquoi: e.pourquoi, ecrit: 'projet', refus: 'Plan ne propose pas cette commande ici : étape écartée.', commande: e.commande };
    const afficher = c.bascule === undefined ? undefined : !c.bascule;
    const libelle = c.libelle + (afficher === undefined ? '' : afficher ? ' : afficher' : ' : masquer');
    const refus = raisonDeRefus(c.etat) ?? (cat.lectureSeule && c.ecrit === 'projet' ? LECTURE_SEULE : null);
    return { libelle, pourquoi: e.pourquoi, ecrit: c.ecrit, refus, commande: c.id, ...(afficher === undefined ? {} : { afficher }) };
  }
  const f = e.champ ?? { objet: '', cle: '', valeur: '' };
  const ch = cat.champs.find((x) => x.cle === f.cle);
  const nom = (cle: string) => cat.objets.find((o) => o.cle === cle)?.nom ?? cle;
  const base = { pourquoi: e.pourquoi };
  if (!cat.selection || f.objet !== cat.selection.cle) {
    return { ...base, libelle: 'Champ « ' + f.cle + ' » de « ' + nom(f.objet) + ' »', ecrit: 'projet', champ: { objet: f.objet, cle: f.cle, valeur: f.valeur },
      refus: 'Ce champ est celui d’un objet qui n’est pas sélectionné : sélectionnez « ' + nom(f.objet) + ' », puis redemandez.' };
  }
  if (!ch) return { ...base, libelle: 'Champ « ' + f.cle + ' »', ecrit: 'projet', champ: { objet: f.objet, cle: f.cle, valeur: f.valeur }, refus: 'Plan ne connaît pas ce champ pour cet objet : étape écartée.' };
  const v = valeurDuChamp(ch, f.valeur);
  const valeur = 'valeur' in v ? v.valeur : f.valeur;
  const libelle = ch.titreSection + ' › ' + ch.libelle + ' : ' + valeurLisible(ch, valeur);
  const refus = 'refus' in v ? v.refus : cat.lectureSeule && ch.ecrit === 'projet' ? LECTURE_SEULE : !ch.actif ? 'Ce champ est grisé pour cet objet : Plan ne l’écrit pas maintenant.' : null;
  return { ...base, libelle, ecrit: ch.ecrit, refus, champ: { objet: f.objet, cle: ch.cle, valeur } };
}

/** Les etapes d'une reponse, confrontees au catalogue de maintenant. */
export const resoudre = (r: ReponseAssistant, cat: Catalogue): EtapeProposee[] => r.etapes.map((e) => resoudreEtape(e, cat));
