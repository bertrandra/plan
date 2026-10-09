// Le releve de facade (zones/Releve.tsx), etape 2 bis : les photos de rue qui montrent le mur.
//
// La recherche part du milieu du mur (geo/panoramax.ts) ; chaque photo retenue est une vignette
// avec sa distance, l'angle sous lequel elle voit le mur, sa date et son auteur. En choisir une la
// telecharge et la recadre s'il le faut (ui/releve/panoramax.ts), puis le parcours continue aux
// coins comme pour une photo prise ou importee.

import { useEffect, useState } from 'react';
import { chercherPhotosRue, classerFaceAuMur, type CandidatRue, type MurVise } from '../../geo/panoramax.js';
import { photoDeRue } from '../../ui/releve/panoramax.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { MesureDistance } from '../../ui/releve/profondeur.js';
import { fr } from './commun.js';

type Etat = { quoi: 'cherche' } | { quoi: 'liste'; candidats: CandidatRue[] } | { quoi: 'charge'; id: string } | { quoi: 'erreur'; message: string };

/** « 2018 » ; l'annee suffit, c'est l'age de la photo qui compte. */
function annee(iso: string | null): string | null {
  const a = iso ? parseInt(iso.slice(0, 4), 10) : NaN;
  return Number.isFinite(a) ? String(a) : null;
}

function descriptionDe(c: CandidatRue): string {
  const vue = c.photo.panoramique ? 'panoramique recadré sur le mur' : c.ecart < 15 ? 'de face' : `à ${Math.round(c.ecart)}° du centre`;
  return `à ${fr(c.distance, 0)} m, ${vue}`;
}

export function PhotosRue({ mur, onPhoto, onRetour }: { mur: MurVise; onPhoto: (photo: Photo, mesure: MesureDistance) => void; onRetour: () => void }) {
  const [etat, setEtat] = useState<Etat>({ quoi: 'cherche' });
  useEffect(() => {
    let vivant = true;
    chercherPhotosRue(mur.lat, mur.lon)
      .then((photos) => { if (vivant) setEtat({ quoi: 'liste', candidats: classerFaceAuMur(photos, mur).slice(0, 12) }); })
      .catch((e: unknown) => { if (vivant) setEtat({ quoi: 'erreur', message: 'La recherche de photos de rue a échoué : ' + (e instanceof Error ? e.message : String(e)) }); });
    return () => { vivant = false; };
  }, [mur]);

  const choisir = async (c: CandidatRue) => {
    setEtat({ quoi: 'charge', id: c.photo.id });
    try {
      onPhoto(await photoDeRue(c), { distance: c.distance, source: 'rue' });
    } catch (e: unknown) {
      setEtat({ quoi: 'erreur', message: 'La photo n’a pas pu être préparée : ' + (e instanceof Error ? e.message : String(e)) });
    }
  };

  return (
    <div className="releveCorps">
      <p className="releveConsigne">
        Les photos de rue qui montrent ce mur, les plus proches et les plus de face d’abord. Touchez-en une : elle est téléchargée, recadrée s’il le faut, et vous placez ensuite
        les coins du mur comme sur une photo prise par vous.
      </p>
      {etat.quoi === 'cherche' && <p className="releveNote" aria-live="polite">Recherche des photos de rue autour du mur…</p>}
      {etat.quoi === 'charge' && <p className="releveNote" aria-live="polite">Téléchargement et recadrage de la photo… Un panoramique prend quelques secondes.</p>}
      {etat.quoi === 'erreur' && <p className="releveAvis" role="alert">{etat.message}</p>}
      {etat.quoi === 'liste' && etat.candidats.length === 0 && (
        <p className="releveAvis">Aucune photo de rue ne montre ce mur (à moins de 60 m, de face). Photographiez-le, ou importez une photo.</p>
      )}
      {etat.quoi === 'liste' && etat.candidats.length > 0 && (
        <div className="relevePhotosRue" role="group" aria-label="Photos de rue">
          {etat.candidats.map((c) => (
            <button data-controle="releve.photoRue" key={c.photo.id} type="button" className="secondary relevePhotoRue" onClick={() => void choisir(c)}>
              {c.photo.vignette ? <img src={c.photo.vignette} alt="" loading="lazy" /> : <span className="relevePhotoRueVide" aria-hidden="true" />}
              <span className="relevePhotoRueTexte">
                <strong>{descriptionDe(c)}</strong>
                <span className="releveNote">{[annee(c.photo.date), c.photo.auteur, c.photo.licence].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="releveNote">Photos Panoramax, sous licence libre : l’auteur et la licence sont indiqués sous chaque photo.</p>
      <div className="relevePied">
        <button data-controle="releve.retour" type="button" className="secondary" onClick={onRetour}>
          Retour
        </button>
      </div>
    </div>
  );
}
