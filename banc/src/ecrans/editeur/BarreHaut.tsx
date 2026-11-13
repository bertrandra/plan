// La barre du haut de l'editeur, sur une ligne : revenir au catalogue, la photo (precedente, suivante, son rang), ce qui reste a relire,
// son etat (verifiee, bloc, rejet), et les deux gestes qui la terminent : enregistrer, ou valider et passer a la suivante (Entree).

import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import type { Bloc, MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';

export function BarreHaut({ banc, meta, rang, total, aRelire, modifie, envoi, relance, onAller, onEnregistrer, onValider, onFermer, onRelancer }: {
  banc: Banc; meta: MetaImage; rang: number; total: number; aRelire: number; modifie: boolean; envoi: boolean; relance: boolean;
  onAller: (k: number) => void; onEnregistrer: () => void; onValider: () => void; onFermer: () => void; onRelancer: () => void;
}) {
  // La case et le bloc changent tout de suite a l'ecran ; le serveur confirme (ou l'erreur remet l'etat d'avant).
  const modifierMeta = (champs: Parameters<typeof api.modifier>[1]) => {
    banc.remplacer({ ...meta, ...champs });
    api.modifier(meta.id, champs).then(banc.remplacer).catch((e: Error) => { banc.remplacer(meta); banc.dire(e.message, 'erreur'); });
  };
  return (
    <header className="barre-haut" onChange={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'SELECT' || (t as HTMLInputElement).type === 'checkbox') t.blur(); }}>
      <button type="button" className="discret" onClick={onFermer} title="Revenir au catalogue"><Icone nom="retour" /><span className="libelle">Catalogue</span></button>
      <span className="navigation-photos">
        <button type="button" className="discret" disabled={rang <= 0} onClick={() => onAller(rang - 1)} aria-label="Photo précédente (B)" title="Photo précédente (B)"><Icone nom="precedent" /></button>
        <span className="rang-photo">{rang + 1}<small> / {total}</small></span>
        <button type="button" className="discret" disabled={rang >= total - 1} onClick={() => onAller(rang + 1)} aria-label="Photo suivante (N)" title="Photo suivante (N)"><Icone nom="suivant" /></button>
      </span>
      <strong className="nom-photo" title={meta.nom ?? meta.id}>{meta.nom ?? meta.id}</strong>
      <span className={aRelire ? 'jeton attention' : 'jeton ok'}>{aRelire ? `${aRelire} à relire` : 'tout est relu'}</span>
      {modifie && <span className="jeton">non enregistré</span>}
      <span className="espace" />
      <span className="etat-photo">
      <label className="case"><input type="checkbox" checked={meta.verifiee} onChange={(e) => modifierMeta({ verifiee: e.target.checked })} /> Vérifiée</label>
      <label className="bloc"><span className="libelle">Bloc</span> <select value={meta.bloc} onChange={(e) => modifierMeta({ bloc: e.target.value as Bloc })}><option value="">(tirage)</option><option value="train">train</option><option value="val">val</option><option value="test">test</option><option value="reserve">réserve</option></select></label>
      <button type="button" className="discret" disabled={relance} onClick={onRelancer}
        title="Relancer le pré-marquage sur cette photo (modèles actifs et recherche des baies) : ce qui a été fait à la main est gardé, le pré-marquage non relu est remplacé ; Ctrl+Z le défait"><Icone nom="brouillon" /><span className="libelle">{relance ? 'Pré-marquage…' : 'Relancer le pré-marquage'}</span></button>
      <button type="button" className="discret danger" title="Rejeter cette photo : elle sort du jeu" onClick={() => { if (confirm('Rejeter cette photo ? Elle sort du jeu.')) modifierMeta({ statut: 'rejetee' }); }}><Icone nom="rejeter" /><span className="libelle">Rejeter</span></button>
      <button type="button" disabled={envoi} onClick={onEnregistrer} title="Enregistrer (Ctrl+S)"><Icone nom="enregistrer" /><span className="libelle">{envoi ? 'Enregistrement…' : 'Enregistrer'}</span></button>
      </span>
      <button type="button" className="principal" disabled={envoi} onClick={onValider} title="Enregistrer, marquer vérifiée et passer à la photo suivante (Entrée)"><Icone nom="valider" /><span className="libelle">Valider et suivante</span><kbd>⏎</kbd></button>
    </header>
  );
}
