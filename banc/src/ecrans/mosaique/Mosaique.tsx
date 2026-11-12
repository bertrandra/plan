// Etape 2a : la mosaique des photos redressees, pour les valider d'un coup d'oeil avant le marquage. Une photo rejetee n'entre ni dans le
// brouillon ni dans le jeu ; une photo mal redressee repart a l'etape 2. Au clavier : fleches, V valider, R rejeter, A refaire ; Entree
// ouvre la revue en grand, ou la photo suivante vient d'elle-meme apres chaque geste.

import { useEffect } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import type { MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Page, Segments, Vide } from '../../ui/Page.js';
import { useMosaique, type FiltreMosaique } from './useMosaique.js';

export function EcranValidation({ banc }: { banc: Banc }) {
  const c = useMosaique(banc);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, select, textarea')) return;
      const m = c.photo, k = e.key.toLowerCase();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') c.aller(c.rang + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') c.aller(c.rang - 1);
      else if (e.key === 'Enter' && m) c.setRevue(true);
      else if (e.key === 'Escape') c.setRevue(false);
      else if (m && k === 'v') void c.poser(m, 'validee');
      else if (m && k === 'r') void c.poser(m, 'rejetee');
      else if (m && k === 'a') void c.poser(m, 'importee');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });
  const filtres: { valeur: FiltreMosaique; libelle: string }[] = [
    { valeur: 'a-valider', libelle: `À valider · ${c.comptes['a-valider']}` }, { valeur: 'validee', libelle: `Validées · ${c.comptes.validee}` }, { valeur: 'rejetee', libelle: `Rejetées · ${c.comptes.rejetee}` },
  ];
  const aRedresser = banc.images.filter((m) => m.statut === 'importee').length;
  return (
    <Page icone="mosaique" numero="2a" titre="Mosaïque" large
      aide={<><p>Validez chaque photo bien redressée : le mur droit, assez net, assez de façade. Une photo rejetée sort du jeu ; « Refaire » la renvoie au redressement.</p><p>Au clavier : ← → pour aller, <kbd>V</kbd> valider, <kbd>R</kbd> rejeter, <kbd>A</kbd> refaire, <kbd>Entrée</kbd> la revue en grand.</p></>}
      actions={<>
        {c.filtre === 'a-valider' && c.liste.length > 0 && <button type="button" onClick={() => { c.aller(0); c.setRevue(true); }}><Icone nom="plein" /> Revue en grand <kbd>⏎</kbd></button>}
        {c.filtre === 'a-valider' && c.liste.length > 0 && <button type="button" className="principal" onClick={() => { void c.toutValider(); }}><Icone nom="valider" /> Tout valider ({c.liste.length})</button>}
        {c.filtre === 'rejetee' && <button type="button" className="danger" disabled={!c.liste.length} onClick={() => { void c.supprimer(c.liste); }}><Icone nom="poubelle" /> Supprimer les {c.liste.length} rejetée(s)</button>}
      </>}>
      <div className="barre-outils"><Segments label="Filtre" valeur={c.filtre} options={filtres} onChange={c.setFiltre} /></div>
      {c.liste.length ? (
        <ul className="grille-photos">
          {c.liste.map((m) => <Vignette key={m.id} m={m} courante={m.id === c.photo?.id} onChoisir={() => c.setCourante(m.id)} onOuvrir={() => { c.setCourante(m.id); c.setRevue(true); }}
            onPoser={(s) => { void c.poser(m, s); }} onSupprimer={() => { void c.supprimer([m]); }} />)}
        </ul>
      ) : c.filtre === 'a-valider' ? (
        <Vide icone="mosaique" titre="Rien à valider" texte={aRedresser ? `${aRedresser} photo(s) importée(s) attendent d’être redressées : elles arrivent ici ensuite.` : 'Les photos redressées arrivent ici, pour un coup d’œil avant le marquage.'}
          action={<button type="button" className="principal" onClick={() => banc.aller(aRedresser ? 'redressement' : 'import')}>{aRedresser ? `Redresser les ${aRedresser} photo(s)` : 'Importer des photos'}</button>} />
      ) : <Vide icone="mosaique" titre={c.filtre === 'validee' ? 'Aucune photo validée' : 'Aucune photo rejetée'} />}
      {c.revue && c.photo && <Revue m={c.photo} rang={c.rang} total={c.liste.length} onAller={c.aller} onPoser={(s) => { void c.poser(c.photo as MetaImage, s); }} onFermer={() => c.setRevue(false)} />}
    </Page>
  );
}

function Vignette({ m, courante, onChoisir, onOuvrir, onPoser, onSupprimer }: { m: MetaImage; courante: boolean; onChoisir: () => void; onOuvrir: () => void; onPoser: (s: 'validee' | 'rejetee' | 'importee') => void; onSupprimer: () => void }) {
  return (
    <li className={'tuile-photo' + (courante ? ' courante' : '') + ' statut-' + m.statut} onClick={onChoisir} onDoubleClick={onOuvrir}>
      <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" />
      <div className="legende-photo"><span className="nom">{m.nom ?? m.id}</span><small>{m.redressement?.methode ?? '—'}{m.redressee ? ` · ${m.redressee.largeur}×${m.redressee.hauteur}` : ''}</small></div>
      <div className="gestes-photo" onClick={(e) => e.stopPropagation()}>
        {m.statut !== 'validee' && <button type="button" className="ok" title="Valider (V)" aria-label="Valider" onClick={() => onPoser('validee')}><Icone nom="valider" /></button>}
        {m.statut !== 'rejetee' && <button type="button" className="danger" title="Rejeter (R)" aria-label="Rejeter" onClick={() => onPoser('rejetee')}><Icone nom="rejeter" /></button>}
        <button type="button" title="Refaire le redressement (A)" aria-label="Refaire le redressement" onClick={() => onPoser('importee')}><Icone nom="refaire" /></button>
        {m.statut === 'rejetee' && <button type="button" className="danger" title="Supprimer définitivement" aria-label="Supprimer" onClick={onSupprimer}><Icone nom="poubelle" /></button>}
        <button type="button" title="En grand (Entrée)" aria-label="En grand" onClick={onOuvrir}><Icone nom="plein" /></button>
      </div>
    </li>
  );
}

/** La revue en grand : une photo a la fois, ses gestes au clavier ; la suivante vient d'elle-meme. */
function Revue({ m, rang, total, onAller, onPoser, onFermer }: { m: MetaImage; rang: number; total: number; onAller: (k: number) => void; onPoser: (s: 'validee' | 'rejetee' | 'importee') => void; onFermer: () => void }) {
  return (
    <div className="revue" role="dialog" aria-modal="true" aria-label="Revue des photos">
      <header>
        <strong>{m.nom ?? m.id}</strong><small>{rang + 1} / {total} · {m.redressement?.methode ?? '—'}{m.redressee ? ` · ${m.redressee.largeur}×${m.redressee.hauteur}` : ''}</small>
        <span className="espace" />
        <button type="button" className="discret" onClick={onFermer} aria-label="Fermer (Échap)" title="Fermer (Échap)"><Icone nom="fermer" /></button>
      </header>
      <div className="revue-photo">
        <button type="button" className="fleche" disabled={rang <= 0} onClick={() => onAller(rang - 1)} aria-label="Précédente (←)"><Icone nom="precedent" taille={28} /></button>
        <img src={api.fichier(m.id, 'redressee', m.redressement?.le ?? '')} alt={m.nom ?? m.id} />
        <button type="button" className="fleche" disabled={rang >= total - 1} onClick={() => onAller(rang + 1)} aria-label="Suivante (→)"><Icone nom="suivant" taille={28} /></button>
      </div>
      <footer>
        <button type="button" onClick={() => onPoser('importee')}><Icone nom="refaire" /> Refaire <kbd>A</kbd></button>
        <button type="button" className="danger" onClick={() => onPoser('rejetee')}><Icone nom="rejeter" /> Rejeter <kbd>R</kbd></button>
        <button type="button" className="principal" onClick={() => onPoser('validee')}><Icone nom="valider" /> Valider <kbd>V</kbd></button>
      </footer>
    </div>
  );
}
