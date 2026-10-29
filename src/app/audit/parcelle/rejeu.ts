// Le rejeu de l'analyse par Claude d'un audit stocke (MD/spec-audit.md 15.5) : sans refaire la
// visite, on reprend les photos, les mesures et « Ce que je vois » du fichier, sur le projet ouvert
// de la meme parcelle (le modele actuel, l'orthophoto et le relief en viennent, comme a l'analyse),
// et on renvoie l'analyse des maisons avec le prompt et le schema actuels du serveur et le modele
// choisi. Le serveur garde la trace dans le dossier de l'audit ; le fichier de l'audit ne change pas.
//
// Le run des facades n'est pas rejoue ici : il a son propre prompt, et il demande le releve calcule
// sur la photo. Un rejeu coute comme une analyse, sous les memes plafonds (usage `rejeu`).

import { preparerImport } from './fichier.js';
import { preparerDemande, type FabriqueImages } from './entreesAnalyse.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import { listeDeControle } from './liste.js';
import { captureDuFichier, mesuresDuFichier } from '../../../model/fichierAuditParcelle.js';
import type { DemandeAnalyse } from '../../../io/analyseClaude.js';
import type { ObjetPlan } from '../../../model/types.js';

export interface DemandeRejeu {
  /** Le texte du fichier de l'audit, tel qu'il est sur le serveur. */
  texte: string;
  /** L'identifiant de l'audit sur le serveur : la trace s'y range. */
  depot: string;
  modele: string;
  objets: readonly ObjetPlan[];
  /** La parcelle du projet ouvert (IDU, ou point de calage). */
  iduProjet: string | null;
  projet: string | null;
}

/** La demande du rejeu, ou la raison de son refus (a montrer telle quelle). */
export async function preparerRejeu(d: DemandeRejeu, fab: FabriqueImages): Promise<DemandeAnalyse | { refus: string }> {
  const r = preparerImport(d.texte, d.objets, d.iduProjet);
  if ('refus' in r) return { refus: r.refus };
  const capture = captureDuFichier(r.fichier);
  const entrees: EntreesPropositions = {
    objets: d.objets, capture, liste: listeDeControle(d.objets, capture),
    mesures: new Map(mesuresDuFichier(r.fichier).map((m) => [cleMesure(m.cle, m.cote), m])),
  };
  // Un batiment de l'audit qui a des photos mais que le projet ouvert ne reconnait pas comme batiment de la parcelle serait absent du
  // rejeu, sans un mot, et le rejeu serait paye quand meme (le 18 octobre : l'abri seul, sans la maison, sur le bac a sable). On refuse.
  const reconnus = new Set(entrees.liste.batiments.map((b) => b.cle));
  const noms = new Map(r.fichier.batiments.map((b) => [b.cle, b.nom]));
  const absents = Object.entries(capture.batiments).flatMap(([cle, b]) => {
    const photos = b.photos.length + Object.values(b.facades).reduce((n, f) => n + f.photos.length, 0);
    return photos > 0 && !reconnus.has(cle) ? [{ nom: noms.get(cle) ?? cle, photos }] : [];
  });
  if (absents.length) {
    return { refus: absents.map((a) => '« ' + a.nom + ' » (' + a.photos + ' photo' + (a.photos > 1 ? 's' : '') + ')').join(', ') + (absents.length > 1 ? ' ne sont pas reconnus' : ' n’est pas reconnu') + ' comme bâtiment de la parcelle dans le projet ouvert : ' + (absents.length > 1 ? 'ils seraient absents' : 'il serait absent') + ' de l’analyse. Vérifiez qu’il est posé sur la parcelle du projet (import du cadastre) et qu’il n’est pas marqué voisin, puis rejouez.' };
  }
  // L'analyse des maisons seule : sans `facade`, la fabrique ne prepare pas le run des facades.
  const maisons: FabriqueImages = { photo: fab.photo, rendu: fab.rendu, ortho: fab.ortho, carte: fab.carte };
  const prepare = await preparerDemande(entrees, maisons, { projet: d.projet, idu: r.fichier.parcelle.idu, adresse: r.fichier.parcelle.adresse, audit: d.depot });
  if (!prepare) return { refus: 'Aucune photo de bâtiment à analyser dans cet audit.' };
  return { ...prepare.demande, usage: 'rejeu', depot: d.depot, modele: d.modele };
}
