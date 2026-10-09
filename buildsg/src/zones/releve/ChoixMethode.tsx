// Le releve de facade (zones/Releve.tsx), etape 2 : choisir comment obtenir la photo du mur.
//
// Trois chemins, chacun explique en deux phrases pour qu'on sache lequel prendre : une photo de
// rue deja prise (Panoramax), la camera du telephone guidee, ou une photo qu'on a deja. L'import
// se fait ici meme ; les deux autres ouvrent leur ecran.

import { useRef, useState } from 'react';
import { Icone } from '../icones.js';
import { cameraDisponible, lireFichier, type Photo } from '../../ui/releve/camera.js';

/** Pourquoi la photo de rue n'est pas proposee, ou `null` si elle l'est. */
export type EtatRue = null | 'sansPosition';

export function ChoixMethode({ rue, onRue, onCamera, onImporter, onRetour }: { rue: EtatRue; onRue: () => void; onCamera: () => void; onImporter: (p: Photo) => void; onRetour: () => void }) {
  const fichier = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const camera = cameraDisponible();
  const importer = async (fichiers: FileList | null) => {
    const fi = fichiers?.[0];
    if (!fi) return;
    try {
      onImporter(await lireFichier(fi));
    } catch {
      setErreur('Cette image n’a pas pu être lue. Choisissez une photo JPEG ou PNG.');
    }
  };
  return (
    <div className="releveCorps">
      <p className="releveConsigne">Comment obtenir la photo de ce mur ? Chaque méthode est expliquée : choisissez celle qui vous convient.</p>
      <div className="releveMethodes" role="group" aria-label="Méthodes">
        <section className={'releveMethode' + (rue ? ' indisponible' : '')} aria-label="Photo de rue">
          <h3><Icone nom="orbite" taille={18} /> Photo de rue (Panoramax)</h3>
          <p>
            Des photos libres prises depuis la rue par OpenStreetMap France et l’IGN. Rien à photographier : la distance au mur est connue par la position de la photo, et
            un panoramique est recadré sur le mur. Convient à un mur visible depuis la rue ; les photos peuvent dater de quelques années.
          </p>
          {rue === 'sansPosition' && <p className="releveNote">La parcelle n’est pas géolocalisée : importez-la depuis le cadastre pour chercher des photos de rue.</p>}
          <button data-controle="releve.methode" type="button" disabled={!!rue} onClick={onRue}>
            Chercher une photo de rue
          </button>
        </section>
        <section className="releveMethode" aria-label="Photographier">
          <h3><Icone nom="camera" taille={18} /> Photographier, guidé</h3>
          <p>
            La caméra arrière, avec l’aide au cadrage : la distance au mur (mesurée en réalité augmentée sur Android, sinon estimée avec deux repères), le nombre de photos à
            prendre ou le recul qu’il faut, l’aplomb du téléphone. Le mieux pour un mur côté jardin.
          </p>
          {!camera && <p className="releveNote">Cet appareil n’a pas de caméra accessible : ouvrez le projet sur un téléphone, ou importez une photo.</p>}
          <button data-controle="releve.methode" type="button" onClick={onCamera}>
            Ouvrir la caméra
          </button>
        </section>
        <section className="releveMethode" aria-label="Importer une photo">
          <h3><Icone nom="image" taille={18} /> Importer une photo</h3>
          <p>
            Une photo déjà prise, de face, qui montre tout le mur du sol à l’égout (et le pignon, s’il y en a un). La distance se déduit ensuite des coins que vous placez
            sur la photo ; le champ de l’objectif est lu dans la photo quand elle le porte.
          </p>
          <button data-controle="releve.importerPhoto" type="button" onClick={() => fichier.current?.click()}>
            Choisir une photo
          </button>
          <input data-controle="releve.importerPhoto" ref={fichier} type="file" accept="image/*" hidden onChange={(e) => void importer(e.target.files)} />
          {erreur && <p className="releveAvis" role="alert">{erreur}</p>}
        </section>
      </div>
      <div className="relevePied">
        <button data-controle="releve.retour" type="button" className="secondary" onClick={onRetour}>
          Retour
        </button>
      </div>
    </div>
  );
}
