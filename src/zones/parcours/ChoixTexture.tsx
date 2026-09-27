// Z8, le choix d'une texture Poly Haven (CC0) : une recherche, une grille de vignettes, un apercu.
//
// Le catalogue est charge une fois (io/polyhaven.ts). « Enregistrer » va chercher l'image de la
// texture choisie, puis rappelle `choisir` ; la simple navigation dans la grille n'ecrit rien.

import { useEffect, useRef, useState } from 'react';
import { chargerCataloguePolyhaven, filtrerCatalogue, resoudreTexture, VIGNETTES_MAX, type CataloguePolyhaven } from '../../io/polyhaven.js';
import { showErrBanner } from '../../shell/dialogs.js';
import type { TextureAppliquee } from '../../model/types.js';

interface Props {
  titre: string;
  caseLibelle?: string | undefined;
  choisir: (choix: TextureAppliquee, appliquerATous: boolean) => void;
  fermer: () => void;
}

export function ChoixTexture({ titre, caseLibelle, choisir, fermer }: Props) {
  const [catalogue, setCatalogue] = useState<CataloguePolyhaven | null>(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<string | null>(null);
  const [tous, setTous] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivant = true;
    chargerCataloguePolyhaven()
      .then(c => { if (vivant) { setCatalogue(c); champ.current?.focus(); } })
      .catch((e: Error) => { if (vivant) setErreur('Impossible de charger le catalogue Poly Haven (connexion internet requise) : ' + e.message); });
    return () => { vivant = false; };
  }, []);

  const resultats = catalogue ? filtrerCatalogue(catalogue, recherche) : [];
  const choisie = selection && catalogue ? catalogue[selection] : undefined;
  const statut = !catalogue ? (erreur ? '' : 'Chargement du catalogue Poly Haven…')
    : !recherche.trim() ? Object.keys(catalogue).length + ' textures disponibles.'
    : resultats.length + ' resultat' + (resultats.length > 1 ? 's' : '') + (resultats.length > VIGNETTES_MAX ? ' (' + VIGNETTES_MAX + ' premiers affiches, affine ta recherche pour voir les autres)' : '');

  const enregistrer = () => {
    if (!selection || !choisie) return;
    setEnregistrement(true);
    resoudreTexture(selection, choisie)
      .then(choix => { fermer(); choisir(choix, tous); })
      .catch((e: Error) => { setEnregistrement(false); showErrBanner('Texture Poly Haven : ' + e.message); });
  };

  return (
    <div className="dialogueImperatif dialogueTextures" role="dialog" aria-modal="true" aria-label={titre + ' — textures Poly Haven'}>
      <div className="enteteTextures">
        <div className="titreParcours">{titre + ' — textures Poly Haven (CC0)'}</div>
        <button type="button" className="secondary small" aria-label="Fermer" onClick={fermer}>✕</button>
      </div>
      <input ref={champ} type="text" className="rechercheTextures" placeholder="Rechercher (bois, brique, tuile, beton, gazon...)" value={recherche}
        onChange={(e) => setRecherche(e.target.value)} />
      <div className="statutTextures">{statut}</div>
      <div className="corpsTextures">
        <div className="grilleTextures">
          {erreur && <div className="hint erreurParcours">{erreur}</div>}
          {resultats.slice(0, VIGNETTES_MAX).map(([id, d]) => (
            <button key={id} type="button" data-id={id} title={d.name} className={'vignetteTexture' + (id === selection ? ' choisie' : '')} onClick={() => setSelection(id)}>
              <img src={d.thumbnail_url} alt="" loading="lazy" />
              <div>{d.name}</div>
            </button>
          ))}
        </div>
        <div className="apercuTexture">
          {choisie ? <>
            <img src={choisie.thumbnail_url} alt="" />
            <div className="nomTexture">{choisie.name}</div>
            <div className="noteTexture">{choisie.category || (choisie.categories || []).join(', ')}</div>
            <div className="noteTexture">{choisie.description || ''}</div>
          </> : <div className="hint">Clique une vignette pour la voir en grand.</div>}
        </div>
      </div>
      <div className="piedDialogue">
        {caseLibelle && <label className="caseTous"><input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} /> {caseLibelle}</label>}
        <button type="button" className="secondary" onClick={fermer}>Annuler</button>
        <button type="button" disabled={!choisie || enregistrement} onClick={enregistrer}>{enregistrement ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}
