// Le geste « quatre repères » (MD/spec-facade-calage-audit.md §8 bis.2, lot F3) : l'option manuelle du redressement (E2), une seule
// version pour l'audit de la parcelle et la calibration. Quatre reperes aux coins d'un rectangle du mur (une fenetre, une porte, le
// mur entier) : ils ne disent que les verticales et les horizontales, la photo se redresse entiere, sans coupe, et l'egout et le sol
// se cherchent ensuite sur l'assemblage. « Ajuster l'égout et le sol » les reprend a la main (AjusterMur, l'option manuelle de l'E4)
// sur l'image prise pour la suite : l'assemblage des photos quand cette photo y est avec d'autres (le mur tire revient alors sur
// chacune), sinon la photo redressee entiere (CLAUDE.md, « Silhouette d'une façade »).
//
// Le composant est commande de l'exterieur : l'ecran qui le porte garde les reperes et le mur, et dit ce qu'il en fait (l'audit les
// applique d'un geste, la calibration les range dans le cas et rejoue). Ses propres gestes viennent en `children`.

import { useCallback, useState, type ReactNode } from 'react';
import { Coins } from './Coins.js';
import { AjusterMur, type MurAjuste } from './AjusterMur.js';
import { NOMS_REPERES } from './commun.js';
import type { Image, P2 } from '../../facade/vision/homographie.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { GabaritMur } from '../../facade/gabaritMur.js';
import { murAjusteSurLesPhotos, type AssemblageAAjuster } from '../../facade/releve/enchainement.js';

interface Props {
  photo: Photo;
  /** Le rang de la photo parmi celles de la facade (0 pour la premiere). */
  rang: number;
  reperes: P2[];
  changer: (c: P2[]) => void;
  /** Les coins du mur sur la photo (trouves, ou deja ajustes a la main) : le depart de « Ajuster l'égout et le sol ». */
  mur: readonly P2[] | null;
  /** Le gabarit du mur (le plan et le LiDAR) : la forme du haut, posee entre l'egout, le sol et les bouts. */
  gabarit?: GabaritMur | undefined;
  /** Les pixels de la photo, pour la redresser entiere a l'ecran. */
  charger: () => Promise<Image | null>;
  ajusterMur: (m: MurAjuste) => void;
  /**
   * L'assemblage de plusieurs photos et le mur que la chaine y a pose : quand cette photo en est, l'egout et le sol s'y ajustent, et
   * non sur elle seule. Absent (une photo, ou un assemblage pas encore calcule) : la photo redressee entiere, comme avant.
   */
  assemblage?: AssemblageAAjuster | null | undefined;
  /** Le mur tire sur l'assemblage, ramene sur chaque photo assemblee (par rang). Requis avec `assemblage`. */
  ajusterMurAssemble?: ((parPhoto: Map<number, P2[]>) => void) | undefined;
  /** Ce qui suit, a la fin de la consigne : « Appliquer », « Retrouver le mur sur toutes les photos »… */
  suite: string;
  /** Les gestes de l'ecran qui porte le composant (appliquer, retirer, annuler…). */
  children?: ReactNode;
}

export function PoserReperes({ photo, rang, reperes, changer, mur, gabarit, charger, ajusterMur, assemblage, ajusterMurAssemble, suite, children }: Props) {
  const [ajuster, setAjuster] = useState(false);
  // L'assemblage tel qu'il etait a l'ouverture : un rejeu ou un geste qui le retire ne change pas l'image sous le doigt.
  const [fige, setFige] = useState<AssemblageAAjuster | null>(null);
  const [murFige, setMurFige] = useState<P2[] | null>(null);
  const chargerFige = useCallback(async (): Promise<Image | null> => (fige ? { largeur: fige.largeur, hauteur: fige.hauteur, donnees: new Uint8ClampedArray(0) } : null), [fige]);
  const basculer = () => {
    const ouvrir = !ajuster;
    setAjuster(ouvrir);
    if (!ouvrir) return;
    setFige(assemblage && ajusterMurAssemble && assemblage.retours.some((r) => r.rang === rang) ? assemblage : null);
    setMurFige(null);
  };
  return (
    <div className="poserReperes" role="group" aria-label={'Quatre repères sur la photo ' + (rang + 1)}>
      <p className="detailPhoto">Photo {rang + 1} : placez quatre repères aux coins d’un rectangle du mur (une fenêtre, une porte, le mur entier) : deux en haut sur une même horizontale, deux en bas. Ils redressent la photo entière ; l’égout et le sol sont cherchés ensuite ({suite}).</p>
      <Coins photo={photo} coins={reperes} setCoins={(c) => changer(c.slice(0, 4))} noms={NOMS_REPERES} libelle="Photo : placez quatre repères" />
      <div className="actionsAudit">
        <button type="button" className="secondary small" aria-pressed={ajuster} data-controle="reperes.ajusterMur" onClick={basculer}>{ajuster ? 'Masquer l’égout et le sol' : 'Ajuster l’égout et le sol'}</button>
        {children}
      </div>
      {ajuster && fige && <>
        <p className="detailPhoto">Sur la façade assemblée ({fige.retours.length} photos), tirez l’égout, le sol et les deux bouts s’ils sont mal placés : ils valent pour chacune de ces photos, et la silhouette du mur (le plan et le LiDAR) les suit sans changer de forme.</p>
        <AjusterMur charger={chargerFige} reperes={null} url={fige.url} mur={murFige ?? fige.coins} {...(gabarit ? { gabarit } : {})}
          changer={(m) => { setMurFige(m.coins); ajusterMurAssemble?.(murAjusteSurLesPhotos(fige, m.coins)); }} />
      </>}
      {ajuster && !fige && <>
        <p className="detailPhoto">Sur la photo redressée, tirez l’égout, le sol et les deux bouts s’ils sont mal placés : la silhouette du mur (le plan et le LiDAR) les suit sans changer de forme.</p>
        <AjusterMur charger={charger} reperes={reperes} mur={mur} {...(gabarit ? { gabarit } : {})} changer={ajusterMur} />
      </>}
    </div>
  );
}
