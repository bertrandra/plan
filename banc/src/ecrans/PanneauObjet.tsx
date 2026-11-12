// Le panneau de l'objet choisi (sa classe, son parent, ses attributs) et la liste des objets de la photo, rangee en arbre.

import type { ReactElement } from 'react';
import type { Classe, Objet } from '../types.js';
import { ordreDeLArbre } from '../classes.js';
import { changerAttribut, changerClasse, changerType, enPolygone } from '../edition.js';
import { classeContenante, libelleDe } from '../classes.js';

const ORIGINES = { auto: 'brouillon, pas encore relu', main: 'posé à la main', corrige: 'brouillon corrigé' } as const;

export function PanneauObjet({ o, objets, classes, onChanger, onSupprimer, onCopier, onCouper }: { o: Objet; objets: Objet[]; classes: Classe[]; onChanger: (o: Objet) => void; onSupprimer: () => void; onCopier: () => void; onCouper: () => void }) {
  const c = classes.find((x) => x.id === o.classe);
  const contenante = c ? classeContenante(c, classes) : null;
  const parents = contenante ? objets.filter((x) => x.classe === contenante && x.id !== o.id) : [];
  const nom = (x: Objet) => (classes.find((k) => k.id === x.classe)?.nom ?? x.classe) + ' ' + x.id;
  return (
    <div className="pile fiche-objet">
      <h3><span className="pastille" style={{ background: c?.couleur ?? '#999' }} /> {c?.nom ?? o.classe} <small>{o.id}</small></h3>
      <p className="aide">{ORIGINES[o.origine]}{o.modele ? ` (${o.modele}${o.score !== undefined ? ', ' + Math.round(o.score * 100) + ' %' : ''})` : ''}</p>
      <label>Classe
        <select value={o.classe} onChange={(e) => { const k = classes.find((x) => x.id === e.target.value); if (k) onChanger(changerClasse(o, k)); }}>
          {ordreDeLArbre(classes).map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
        </select>
      </label>
      {!!c?.types?.length && (
        <label className={o.type ? '' : 'attention'}>Type (ce que le modèle apprend)
          <select value={o.type ?? ''} onChange={(e) => onChanger(changerType(o, e.target.value))}>
            <option value="">— à qualifier —</option>
            {c.types.map((t) => <option key={t.id} value={t.id}>{t.nom} ({t.id})</option>)}
          </select>
        </label>
      )}
      {contenante && (
        <label>Dans
          <select value={o.parent ?? ''} onChange={(e) => onChanger({ ...o, parent: e.target.value || null, origine: o.origine === 'auto' ? 'corrige' : o.origine })}>
            <option value="">— aucun ({classes.find((k) => k.id === contenante)?.nom}) —</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{nom(p)}</option>)}
          </select>
        </label>
      )}
      {c?.attributs.map((a) => {
        const v = o.attributs[a.cle];
        return (
          <label key={a.cle}>{a.nom}
            {a.type === 'choix' ? (
              <select value={typeof v === 'string' ? v : ''} onChange={(e) => onChanger(changerAttribut(o, a.cle, e.target.value || null))}>
                <option value="">—</option>{(a.valeurs ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            ) : a.type === 'booleen' ? (
              <input type="checkbox" checked={v === true} onChange={(e) => onChanger(changerAttribut(o, a.cle, e.target.checked ? true : null))} />
            ) : (
              <input type={a.type === 'nombre' ? 'number' : 'text'} value={v === undefined ? '' : String(v)} onChange={(e) => onChanger(changerAttribut(o, a.cle, a.type === 'nombre' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value))} />
            )}
          </label>
        );
      })}
      <div className="rang">
        {o.forme === 'rectangle' && <button type="button" onClick={() => onChanger(enPolygone(o))}>En polygone</button>}
        {o.origine === 'auto' && <button type="button" className="ok" onClick={() => onChanger({ ...o, origine: 'corrige' })}>Juste tel quel</button>}
        <button type="button" onClick={onCopier} title="Ctrl+C">Copier</button>
        <button type="button" onClick={onCouper} title="Ctrl+X">Couper</button>
        <button type="button" className="danger" onClick={onSupprimer}>Supprimer (Suppr)</button>
      </div>
      {(o.forme === 'polygone' || o.forme === 'ligne') && <p className="aide">Tirez un sommet ; le petit rond au milieu d’un côté ajoute un sommet ; Alt + clic sur un sommet le retire.</p>}
    </div>
  );
}

export function ListeObjets({ objets, classes, choisi, caches, onChoisir, onCacher }: { objets: Objet[]; classes: Classe[]; choisi: string | null; caches: Set<string>; onChoisir: (id: string) => void; onCacher: (classe: string) => void }) {
  const enfants = (p: string | null) => objets.filter((o) => (o.parent ?? null) === p || (p === null && o.parent && !objets.some((x) => x.id === o.parent)));
  const presentes = ordreDeLArbre(classes).filter((c) => objets.some((o) => o.classe === c.id));
  const ligne = (o: Objet, n: number): ReactElement => {
    const c = classes.find((k) => k.id === o.classe);
    return (
      <li key={o.id}>
        <button type="button" className={o.id === choisi ? 'objet-liste choisi' : 'objet-liste'} style={{ paddingLeft: 6 + 14 * n }} onClick={() => onChoisir(o.id)}>
          <span className="pastille" style={{ background: c?.couleur ?? '#999' }} /> {libelleDe(o, classes)}{c?.types?.length && !o.type ? ' ?' : ''} <small>{o.id}{o.origine === 'auto' ? ' · auto' : ''}</small>
        </button>
        {enfants(o.id).length > 0 && <ul>{enfants(o.id).map((x) => ligne(x, n + 1))}</ul>}
      </li>
    );
  };
  return (
    <div className="pile">
      <h4>Objets ({objets.length}, dont {objets.filter((o) => o.origine === 'auto').length} à relire, {objets.filter((o) => classes.find((c) => c.id === o.classe)?.types?.length && !o.type).length} à qualifier)</h4>
      <div className="puces">{presentes.map((c) => <button key={c.id} type="button" className={caches.has(c.id) ? 'puce eteinte' : 'puce'} style={{ borderColor: c.couleur }} onClick={() => onCacher(c.id)} title="Montrer ou cacher cette classe">{c.nom}</button>)}</div>
      <ul className="liste-objets">{enfants(null).map((o) => ligne(o, 0))}</ul>
    </div>
  );
}
