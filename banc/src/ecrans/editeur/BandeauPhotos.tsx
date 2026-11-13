// Le bandeau des photos du lot ouvert, sous la photo : chaque vignette avec son etat (brouillon a relire, corrigee, verifiee), la
// courante en evidence, un clic pour y aller ; et l'avancement du lot.

import { api } from '../../api.js';
import type { MetaImage } from '../../types.js';
import { avancement } from '../../relecture.js';
import { useEffect, useRef } from 'react';

const ETAT: Record<string, string> = { brouillon: 'à relire', corrigee: 'corrigée', validee: 'sans marquage', importee: 'importée', redressee: 'redressée', rejetee: 'rejetée' };

export function BandeauPhotos({ photos, courante, onAller }: { photos: MetaImage[]; courante: string; onAller: (k: number) => void }) {
  const a = avancement(photos);
  const ici = useRef<HTMLButtonElement>(null), bande = useRef<HTMLOListElement>(null);
  // La vignette courante au milieu du bandeau, en ne faisant defiler que lui (scrollIntoView ferait aussi defiler la page, au telephone).
  useEffect(() => {
    const b = bande.current, v = ici.current;
    if (b && v) b.scrollTo({ left: v.offsetLeft - b.clientWidth / 2 + v.clientWidth / 2, behavior: 'smooth' });
  }, [courante]);
  return (
    <footer className="bandeau-photos">
      <div className="avancement" title={`${a.relues} corrigée(s), ${a.verifiees} vérifiée(s), ${a.brouillons} pré-marquée(s) sur ${a.total}`}>
        <span className="barre-avancement"><span style={{ width: `${a.total ? (100 * a.relues) / a.total : 0}%` }} /><span className="verifiees" style={{ width: `${a.total ? (100 * a.verifiees) / a.total : 0}%` }} /></span>
        <small>{a.relues} / {a.total} corrigées · {a.verifiees} vérifiées</small>
      </div>
      <ol className="vignettes-photos" ref={bande}>
        {photos.map((m, k) => (
          <li key={m.id}>
            <button type="button" ref={m.id === courante ? ici : undefined} className={'vignette-photo etat-' + m.statut + (m.verifiee ? ' verifiee' : '') + (m.id === courante ? ' courante' : '')}
              title={`${m.nom ?? m.id} · ${ETAT[m.statut] ?? m.statut}${m.verifiee ? ' · vérifiée' : ''}`} onClick={() => onAller(k)}>
              <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ol>
    </footer>
  );
}
