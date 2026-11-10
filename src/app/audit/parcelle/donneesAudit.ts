// Ce que l'ecran Admin › « Audits » montre d'un audit recu (MD/spec-audit.md 15.4) : ses donnees
// (les photos, batiment par batiment et facade par facade, ou cas par cas pour une promenade) et sa
// conclusion (chaque proposition, de Claude ou des mesures, et ce qui en a ete fait ; pour une
// promenade, le statut de chaque cas et si un fait est ecrit pour son batiment). Rien n'est
// recalcule : on relit le fichier tel qu'il est arrive.

import { lireFichierAuditParcelle } from '../../../model/fichierAuditParcelle.js';
import { lireFichierPromenade, PROBLEMES_AUDIT, CATEGORIES_AUDIT, type StatutCas } from '../../../model/audit.js';
import { faitsEnVigueur } from '../../../regles/toits/faits.js';
import type { PhotoCas } from '../../../model/audit.js';

export interface PhotoVue { base64: string; legende: string }

export interface PropositionVue {
  objet: string;
  avant: string;
  apres: string;
  source: 'claude' | 'mesure' | 'arbitrage';
  decision: 'validee' | 'refusee' | null;
}

export interface FacadeVue { nom: string; photos: PhotoVue[]; mesure: string | null }
export interface BatimentVue { nom: string; facades: FacadeVue[]; toit: PhotoVue[] }

export interface CasVue {
  titre: string;
  categorie: string;
  problemes: string[];
  note: string;
  statut: string;
  /** Un fait est ecrit pour ce batiment dans regles/toits/faits.json (ou l'essai en cours). */
  fait: boolean;
  photos: PhotoVue[];
}

export type DonneesAudit =
  | { nature: 'parcelle'; idu: string; adresse: string | null; batiments: BatimentVue[]; cloture: PhotoVue[]; portail: PhotoVue[]; propositions: PropositionVue[]; validations: number }
  | { nature: 'promenade'; commune: string | null; cas: CasVue[] };

export const STATUTS_CAS: Record<StatutCas, string> = { a_corriger: 'À corriger', corrige: 'Corrigé', valide: 'Validé', sans_suite: 'Sans suite' };

const vues = (photos: readonly PhotoCas[], quoi: string): PhotoVue[] => photos.map((p, i) => ({ base64: p.base64, legende: quoi + ' — photo ' + (i + 1) }));

/** Les donnees et la conclusion d'un audit, lues dans son fichier ; leve si le fichier ne se lit pas. */
export function donneesAudit(texte: string): DonneesAudit {
  const brut = JSON.parse(texte) as { format?: unknown };
  if (brut.format === 'plan-audit') {
    const f = lireFichierPromenade(brut);
    const faits = faitsEnVigueur();
    return {
      nature: 'promenade', commune: f.promenade.commune,
      cas: f.cas.map((c, i) => {
        const titre = c.identite.adresse ?? c.identite.cleBdtopo ?? 'Cas ' + (i + 1);
        return {
          titre,
          categorie: CATEGORIES_AUDIT.find((x) => x.code === c.constat.categorie)?.libelle ?? c.constat.categorie,
          problemes: c.constat.problemes.map((p) => PROBLEMES_AUDIT.find((x) => x.code === p)?.libelle ?? p),
          note: c.constat.note,
          statut: STATUTS_CAS[c.statut] ?? c.statut,
          fait: !!c.identite.cleBdtopo && Object.prototype.hasOwnProperty.call(faits, c.identite.cleBdtopo),
          photos: vues(c.constat.photos, titre),
        };
      }),
    };
  }
  const f = lireFichierAuditParcelle(brut);
  return {
    nature: 'parcelle', idu: f.parcelle.idu, adresse: f.parcelle.adresse,
    batiments: f.batiments.map((b) => ({
      nom: b.nom,
      facades: b.facades.filter((x) => x.photos.length || x.mesure).map((x) => {
        const nom = 'Façade ' + (x.orientation ? x.orientation.toLowerCase() : 'côté ' + x.cote);
        const m = x.mesure;
        const mesure = m ? [m.releve ? m.releve.ouvertures.length + ' ouverture' + (m.releve.ouvertures.length > 1 ? 's' : '') + ' relevée' + (m.releve.ouvertures.length > 1 ? 's' : '') : null,
          m.hauteurM !== null ? 'hauteur ' + m.hauteurM.toFixed(2).replace('.', ',') + ' m' : null, m.couleur ? 'couleur ' + m.couleur.couleur : null,
          m.coinsTrouves ? 'coins trouvés' : 'coins non trouvés'].filter(Boolean).join(', ') : null;
        return { nom, photos: vues(x.photos, b.nom + ', ' + nom.toLowerCase()), mesure };
      }),
      toit: vues(b.photos, b.nom + ', toit'),
    })),
    cloture: vues(f.cloture.photos, 'Clôture'), portail: vues(f.portail.photos, 'Portail'),
    propositions: f.propositions.map((p) => ({ objet: p.objet, avant: p.avant, apres: p.apres, source: p.source, decision: p.decision })),
    validations: f.decisions.length,
  };
}
