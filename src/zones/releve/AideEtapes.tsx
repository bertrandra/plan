// Le releve de facade : l'aide de Claude a ses deux etapes (lot L18). Aux coins, ses graines
// remplacent les coins predits qu'elles recalent ; a la verification, ses avis et ses boites
// manquees passent par le recalage (zones/releve/aide.ts) avant d'etre proposes.

import { texteBilan } from '../../facade/detection/renfortRecalage.js';
import type { AideClaudeReleve } from '../../app/releve/renfortReleve.js';
import type { Image } from '../../facade/vision/homographie.js';
import type { GrilleFacade } from '../../model/types.js';
import { AideClaude } from './AideClaude.js';
import { coinsAvecAide, motifAide, ouverturesAvecAide, signauxDeVerification, signauxDesCoins } from './aide.js';
import type { OuverturesEnCours } from './ouvertures.js';
import type { Morceau } from '../../facade/releve/serie.js';

const pluriel = (n: number, s: string, p = s + 's') => n + ' ' + (n > 1 ? p : s);

/** L'aide a l'etape des coins de la photo courante. */
export function AideDesCoins({ aide, morceau, maj, largeurM, hauteurM, etiquette }: { aide: AideClaudeReleve | null; morceau: Morceau; maj: (m: Morceau) => void; largeurM: number; hauteurM: number; etiquette: string }) {
  const signaux = signauxDesCoins(morceau);
  const demander = async () => {
    const r = await (aide as AideClaudeReleve).demander({
      photo: morceau.prise.photo.image, coins: morceau.coins, coinsTrouves: (morceau.sources ?? []).every((s) => s === 'trouve'), elevation: null,
      largeurM, hauteurM, hauteurMesuree: false, ouvertures: [], grille: null, signaux, etiquette,
    });
    if ('erreur' in r) return { message: r.erreur, erreur: true };
    const a = coinsAvecAide(morceau, r.vote, largeurM, hauteurM);
    if (!a.recales) return { message: 'Claude n’a situé aucun coin que la photo confirme : placez les coins au doigt.', erreur: false };
    maj(a.morceau);
    return { message: 'Claude a proposé ' + pluriel(a.recales, 'coin') + ', recalé' + (a.recales > 1 ? 's' : '') + ' sur les arêtes de la photo : vérifiez-les avec la loupe.', erreur: false };
  };
  return <AideClaude key={morceau.prise.photo.url} aide={aide} signaux={signaux} etape="coins" demander={demander} />;
}

/**
 * L'aide a la verification : les ouvertures proposees, sur l'elevation redressee. `morceau` est la
 * photo que Claude regarde : la seule, ou la vue de reference d'une fusion (lot G20), dont le masque
 * d'occlusion (`occlusion`, part `masque` du mur) part hachure sur l'elevation.
 */
export function AideDesOuvertures(p: { aide: AideClaudeReleve | null; ouv: OuverturesEnCours; morceau: Morceau | undefined; elevation: Image | null; largeurM: number; hauteurM: number; hauteurMesuree: boolean; couverture: number; masque?: number; occlusion?: Uint8Array | null; grille: GrilleFacade | null; etiquette: string }) {
  const { aide, ouv, morceau } = p;
  const masque = p.masque ?? 0;
  const signaux = signauxDeVerification({ ouvertures: ouv.ouvertures, devinees: ouv.devinees, largeurM: p.largeurM, couverture: p.couverture, masque });
  if (!morceau || !p.elevation) return null;
  const elevation = p.elevation;
  const demander = async () => {
    const ouvertures = ouv.ouvertures;
    const r = await (aide as AideClaudeReleve).demander({
      photo: morceau.prise.photo.image, coins: morceau.coins, coinsTrouves: (morceau.sources ?? []).every((s) => s !== 'predit'), elevation, cache: p.occlusion ?? null,
      largeurM: p.largeurM, hauteurM: p.hauteurM, hauteurMesuree: p.hauteurMesuree, ouvertures, grille: p.grille, signaux, etiquette: p.etiquette,
    });
    if ('erreur' in r) return { message: r.erreur, erreur: true };
    const res = ouverturesAvecAide({ ouvertures, devinees: ouv.devinees, vote: r.vote, elevation, largeurM: p.largeurM, hauteurM: p.hauteurM });
    ouv.renforcer(res);
    const t = texteBilan(res.bilan);
    return { message: t ? 'Claude propose : ' + t + '. Ses propositions sont marquées « Proposée par Claude » : vérifiez-les.' : 'Claude confirme ce que Plan a trouvé : rien à changer.', erreur: false };
  };
  return <AideClaude aide={aide} signaux={signaux} etape="ouvertures" demander={demander} motif={motifAide(signaux, masque)} />;
}
