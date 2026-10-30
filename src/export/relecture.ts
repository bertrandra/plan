// La relecture du dossier de declaration prealable avant l'export (lot L5 de la lecture IA elargie, §5.4, decision 11) : une liste
// de points, chacun avec sa gravite et le geste qui le regle. Deterministe et sans appel a Claude : un meme projet, avec les memes
// pieces, donne la meme relecture, dans le meme ordre.
//
// Elle reprend ce que le cerfa disait manquer (les `manques` de export/cerfa13703.ts, deplaces ici, memes phrases, meme ordre), puis
// ce que le dossier sait de plus : une piece sans image (DP6, DP7, DP8), une distance a la limite que le DP2 ne cote pas, un texte non
// valide ou perime, une regle du PLU lue et pas encore verifiee, un ecart aux regles verifiees. Rien n'y bloque un export : la
// personne decide, comme pour le PLU (engine/regles/plu/conformite.ts, dont la relecture repete les ecarts sans rien imprimer).

import { ouvragesDeclares, referencesDuTerrain, remplirCerfa13703, type Piece } from './cerfa13703.js';
import { distancesAuxLimites } from './piecesDP.js';
import { empreinteFaits } from './faitsDossier.js';
import { conformitePlu } from '../engine/regles/plu/conformite.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { LIBELLES_PIECES_TEXTE, PIECES_TEXTE, photoDe, texteDe } from '../regles/textes/dossier.js';
import type { DeclarationPrealable, ObjetPlan } from '../model/types.js';
import type { GesteRelecture, PointRelecture } from './typesRelecture.js';
export { LIBELLES_GRAVITE, type GesteRelecture, type GraviteRelecture, type PointRelecture } from './typesRelecture.js';

/** Ce que le formulaire demande et que le plan ne sait pas : les phrases des `manques` d'avant le lot L5, dans leur ordre. */
function pointsDuCerfa(objets: ObjetPlan[], pieces: readonly Piece[]): PointRelecture[] {
  const parcelle = parcelleDuProjet(objets);
  const d: DeclarationPrealable = parcelle?.declaration || {};
  const out: PointRelecture[] = [];
  const point = (cle: string, texte: string, geste?: GesteRelecture) => out.push({ cle: 'cerfa.' + cle, gravite: 'a-completer', texte, cerfa: true, ...(geste ? { geste } : {}) });
  if (!d.nom || !d.prenom) point('declarant', 'le nom et le prénom du déclarant');
  if (!d.naissance) point('naissance', 'la date et le lieu de naissance');
  if (!d.voie || !d.localite) point('adresse', 'l\'adresse du déclarant');
  if (!referencesDuTerrain(parcelle).length) point('references', 'les références cadastrales du terrain (importez la parcelle depuis son adresse)', { commande: 'projet.depuisAdresse', libelle: 'Importer la parcelle' });
  if (!ouvragesDeclares(objets).length) point('ouvrage', 'un ouvrage à déclarer (pergola, carport ou terrasse)');
  if (!parcelle?.plu) point('protections', 'les protections patrimoniales (consultez le PLU de la parcelle pour les cocher)', { commande: 'plu.interroger', libelle: 'Interroger le PLU' });
  point('signature', 'la signature du déclarant');
  if (!pieces.includes('DP6')) point('DP6', 'la pièce DP6 (insertion) : ouvrez la Vue 3D, cadrez le projet comme vu de la rue, puis générez le dossier depuis le menu Exporter sans quitter la 3D', { commande: 'vue.3d', libelle: 'Ouvrir la Vue 3D' });
  // Les photographies : une phrase pour les deux tant qu'aucune n'est jointe (celle d'avant le lot L5), une par piece sinon.
  const dp7 = pieces.includes('DP7'), dp8 = pieces.includes('DP8');
  if (!dp7 && !dp8) point('photos', 'les photographies DP7 (environnement proche) et DP8 (paysage lointain), si le projet est visible depuis l\'espace public');
  else if (!dp7) point('DP7', 'la photographie DP7 (environnement proche), si le projet est visible depuis l\'espace public');
  else if (!dp8) point('DP8', 'la photographie DP8 (paysage lointain), si le projet est visible depuis l\'espace public');
  return out;
}

/** Une photographie choisie qui n'est pas sur cet appareil (le projet a ete enregistre ailleurs) : la piece ne part pas. */
function pointsDesPhotos(objets: ObjetPlan[]): PointRelecture[] {
  const dossier = parcelleDuProjet(objets)?.dossier;
  return (['DP7', 'DP8'] as const).flatMap((p): PointRelecture[] => {
    const ph = photoDe(dossier, p);
    return ph && !ph.image ? [{ cle: 'photo.' + p, gravite: 'a-completer', cerfa: false,
      texte: 'La photographie ' + p + ' choisie est restée sur un autre appareil : choisissez-la de nouveau parmi les photos de l’audit, sinon la pièce ne part pas.' }] : [];
  });
}

/** Les ouvrages dont le DP2 ne cote pas la distance a la limite (ils la touchent). */
function pointsDuPlanDeMasse(objets: ObjetPlan[]): PointRelecture[] {
  return distancesAuxLimites(objets).filter((x) => x.distance === null).map((x) => ({
    cle: 'dp2.' + x.objet.key, gravite: 'a-verifier' as const, cerfa: false,
    texte: '« ' + x.objet.name + ' » touche une limite du terrain : le plan de masse (DP2) ne cote pas sa distance à la limite. Dites-le dans la notice (implantation en limite séparative ou sur rue).',
  }));
}

/** Les textes du dossier : un brouillon pas encore valide, un brouillon ou un texte valide redige sur un projet qui a change depuis. */
function pointsDesTextes(objets: ObjetPlan[]): PointRelecture[] {
  const dossier = parcelleDuProjet(objets)?.dossier;
  if (!dossier) return [];
  const faits = empreinteFaits(objets);
  return PIECES_TEXTE.flatMap((piece): PointRelecture[] => {
    const t = texteDe(dossier, piece);
    if (!t) return [];
    const nom = LIBELLES_PIECES_TEXTE[piece].toLowerCase();
    const out: PointRelecture[] = [];
    if (t.valide?.entrees && t.valide.entrees !== faits) {
      out.push({ cle: 'texte.' + piece + '.date', gravite: 'alerte', cerfa: false, texte: 'Le projet a changé depuis la validation du texte « ' + nom + ' » : relisez-le, l’export l’imprime tel que vous l’avez validé.',
        geste: { commande: 'export.redigerTexte', valeur: piece, libelle: 'Rédiger de nouveau' } });
    }
    if (t.brouillon && !t.valide) {
      const perime = t.brouillon.entrees !== faits;
      out.push({ cle: 'texte.' + piece + '.brouillon', gravite: perime ? 'alerte' : 'a-verifier', cerfa: false,
        texte: perime ? 'Le brouillon « ' + nom + ' » est périmé : le projet a changé depuis sa rédaction. Il n’est pas validé, l’export ne l’imprime pas.'
                      : 'Le brouillon « ' + nom + ' » n’est pas validé : l’export ne l’imprime pas' + (piece === 'description' ? ' et garde la description calculée.' : '.'),
        geste: perime ? { commande: 'export.redigerTexte', valeur: piece, libelle: 'Rédiger de nouveau' } : { commande: 'export.validerTexte', valeur: piece, libelle: 'Valider le texte' } });
    }
    return out;
  });
}

/** Le PLU : les regles lues et pas encore verifiees, une zone qui a change, chaque ecart du projet aux regles verifiees. */
function pointsDuPlu(objets: ObjetPlan[]): PointRelecture[] {
  const reglement = parcelleDuProjet(objets)?.reglementPlu;
  if (!reglement) return [];
  const out: PointRelecture[] = [];
  const proposes = reglement.faits.filter((f) => f.statut === 'propose').length;
  if (proposes) out.push({ cle: 'plu.proposes', gravite: 'a-verifier', cerfa: false, texte: proposes + ' règle(s) du PLU lue(s) par Claude ne sont pas vérifiées : comparez-les au règlement (Résultats › PLU) pour qu’elles contrôlent le projet.' });
  const c = conformitePlu(objets, reglement);
  if (c.zoneChangee) out.push({ cle: 'plu.zone', gravite: 'alerte', cerfa: false, texte: 'Le zonage de la parcelle ne nomme plus la zone ' + reglement.zone + ' dont le règlement a été lu : relisez le règlement de la zone actuelle.' });
  c.verdicts.forEach((v, i) => {
    if (v.etat === 'ecart') out.push({ cle: 'plu.ecart.' + v.fait + '.' + (v.objet ?? i), gravite: 'alerte', cerfa: false, texte: v.message });
  });
  return out;
}

/**
 * La relecture du dossier, tel qu'il partirait avec ces pieces (export/dossierMairie.ts::piecesDuDossier) : les points du formulaire,
 * puis les photographies, le plan de masse, les textes et le PLU. `pieces` dit ce qui sera joint ; la relecture ne le devine pas.
 */
export function relireDossier(objets: ObjetPlan[], pieces: readonly Piece[]): PointRelecture[] {
  const regime = remplirCerfa13703(objets, new Date(0), [...pieces]).regime;
  const permis: PointRelecture[] = regime === 'permis' ? [{ cle: 'regime.permis', gravite: 'alerte', cerfa: false, texte: 'L’emprise au sol créée relève d’un permis de construire (cerfa 13406) : ce dossier peut servir de base, pas être déposé tel quel.' }] : [];
  return [...pointsDuCerfa(objets, pieces), ...permis, ...pointsDesPhotos(objets), ...pointsDuPlanDeMasse(objets), ...pointsDesTextes(objets), ...pointsDuPlu(objets)];
}
