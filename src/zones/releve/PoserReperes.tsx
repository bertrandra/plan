// Le geste « quatre repères » (MD/spec-facade-calage-audit.md §8 bis.2, lot F3) : l'option manuelle du redressement (E2), une seule
// version pour l'audit de la parcelle et la calibration. Quatre reperes aux coins d'un rectangle du mur (une fenetre, une porte, le
// mur entier) : ils ne disent que les verticales et les horizontales, la photo se redresse entiere, sans coupe, et l'egout et le sol
// se cherchent ensuite sur l'assemblage. « Ajuster l'égout et le sol » les reprend a la main sur la photo redressee entiere
// (AjusterMur, l'option manuelle de l'E4).
//
// Le composant est commande de l'exterieur : l'ecran qui le porte garde les reperes et le mur, et dit ce qu'il en fait (l'audit les
// applique d'un geste, la calibration les range dans le cas et rejoue). Ses propres gestes viennent en `children`.

import { useState, type ReactNode } from 'react';
import { Coins } from './Coins.js';
import { AjusterMur, type MurAjuste } from './AjusterMur.js';
import { NOMS_REPERES } from './commun.js';
import type { Image, P2 } from '../../facade/vision/homographie.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { GabaritMur } from '../../facade/gabaritMur.js';

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
  /** Ce qui suit, a la fin de la consigne : « Appliquer », « Retrouver le mur sur toutes les photos »… */
  suite: string;
  /** Les gestes de l'ecran qui porte le composant (appliquer, retirer, annuler…). */
  children?: ReactNode;
}

export function PoserReperes({ photo, rang, reperes, changer, mur, gabarit, charger, ajusterMur, suite, children }: Props) {
  const [ajuster, setAjuster] = useState(false);
  return (
    <div className="poserReperes" role="group" aria-label={'Quatre repères sur la photo ' + (rang + 1)}>
      <p className="detailPhoto">Photo {rang + 1} : placez quatre repères aux coins d’un rectangle du mur (une fenêtre, une porte, le mur entier) : deux en haut sur une même horizontale, deux en bas. Ils redressent la photo entière ; l’égout et le sol sont cherchés ensuite ({suite}).</p>
      <Coins photo={photo} coins={reperes} setCoins={(c) => changer(c.slice(0, 4))} noms={NOMS_REPERES} libelle="Photo : placez quatre repères" />
      <div className="actionsAudit">
        <button type="button" className="secondary small" aria-pressed={ajuster} data-controle="reperes.ajusterMur" onClick={() => setAjuster((a) => !a)}>{ajuster ? 'Masquer l’égout et le sol' : 'Ajuster l’égout et le sol'}</button>
        {children}
      </div>
      {ajuster && <>
        <p className="detailPhoto">Sur la photo redressée, tirez l’égout, le sol et les deux bouts s’ils sont mal placés : la silhouette du mur (le plan et le LiDAR) les suit sans changer de forme.</p>
        <AjusterMur charger={charger} reperes={reperes} mur={mur} {...(gabarit ? { gabarit } : {})} changer={ajusterMur} />
      </>}
    </div>
  );
}
