// Le releve de facade : l'aide de Claude a ses deux etapes (lot L18), par le run unique d'une facade depuis le lot F2. Aux coins, les
// angles qu'il situe sur la photo remplacent les coins predits qu'ils recalent ; a la verification, ses boites, lues sur l'elevation
// redressee, s'accordent avec la detection (zones/releve/aide.ts) avant d'etre proposees.

import { texteRunFacade } from '../../regles/facades/observations.js';
import { texteAccord } from '../../facade/regles/facades/ia.js';
import type { AideClaudeReleve } from '../../app/releve/runFacade.js';
import type { Image } from '../../facade/vision/homographie.js';
import { AideClaude } from './AideClaude.js';
import { coinsAvecAide, motifAide, ouverturesAvecAide, signauxDeVerification, signauxDesCoins } from './aide.js';
import type { OuverturesEnCours } from './ouvertures.js';
import type { Morceau } from '../../facade/releve/serie.js';

const pluriel = (n: number, s: string, p = s + 's') => n + ' ' + (n > 1 ? p : s);

/** L'aide a l'etape des coins de la photo courante. */
export function AideDesCoins({ aide, morceau, maj, largeurM, hauteurM, etiquette, parement = null }: { aide: AideClaudeReleve | null; morceau: Morceau; maj: (m: Morceau) => void; largeurM: number; hauteurM: number; etiquette: string; parement?: string | null }) {
  const signaux = signauxDesCoins(morceau);
  const demander = async () => {
    const r = await (aide as AideClaudeReleve).demander({ image: morceau.prise.photo.image, texte: texteRunFacade({ etiquette, image: 'photo', pointes: [], parement }) });
    if ('erreur' in r) return { message: r.erreur, erreur: true };
    const a = coinsAvecAide(morceau, r.reponse, largeurM, hauteurM);
    if (!a.recales) return { message: 'Claude n’a situé aucun coin que la photo confirme : placez les coins au doigt.', erreur: false };
    maj(a.morceau);
    return { message: 'Claude a proposé ' + pluriel(a.recales, 'coin') + ', recalé' + (a.recales > 1 ? 's' : '') + ' sur les arêtes de la photo : vérifiez-les avec la loupe.', erreur: false };
  };
  return <AideClaude key={morceau.prise.photo.url} aide={aide} signaux={signaux} etape="coins" demander={demander} />;
}

/**
 * L'aide a la verification : les ouvertures proposees, sur l'elevation redressee, que Claude regarde. `morceau` est la photo dont
 * elle vient : la seule, ou la vue de reference d'une fusion (lot G20), dont le masque d'occlusion (`occlusion`, part `masque` du
 * mur) part en gris sur l'elevation : ce qu'aucune photo ne montre, Claude ne l'invente pas.
 */
export function AideDesOuvertures(p: { aide: AideClaudeReleve | null; ouv: OuverturesEnCours; morceau: Morceau | undefined; elevation: Image | null; largeurM: number; hauteurM: number; couverture: number; masque?: number; occlusion?: Uint8Array | null; etiquette: string; parement?: string | null }) {
  const { aide, ouv, morceau } = p;
  const masque = p.masque ?? 0;
  const signaux = signauxDeVerification({ ouvertures: ouv.ouvertures, devinees: ouv.devinees, largeurM: p.largeurM, couverture: p.couverture, masque });
  if (!morceau || !p.elevation) return null;
  const elevation = p.elevation;
  const demander = async () => {
    const r = await (aide as AideClaudeReleve).demander({ image: elevation, cache: p.occlusion ?? null, texte: texteRunFacade({ etiquette: p.etiquette, image: 'elevation', pointes: [], parement: p.parement ?? null }) });
    if ('erreur' in r) return { message: r.erreur, erreur: true };
    const res = ouverturesAvecAide({ ouvertures: ouv.ouvertures, devinees: ouv.devinees, reponse: r.reponse, elevation, largeurM: p.largeurM, hauteurM: p.hauteurM });
    ouv.renforcer(res);
    const t = texteAccord(res.bilan);
    return { message: t ? t + '. Ses boîtes seules sont marquées « Proposée par Claude », décochées : vérifiez-les.' : 'Claude ne voit aucune ouverture : rien à changer.', erreur: false };
  };
  return <AideClaude aide={aide} signaux={signaux} etape="ouvertures" demander={demander} motif={motifAide(signaux, masque)} />;
}
