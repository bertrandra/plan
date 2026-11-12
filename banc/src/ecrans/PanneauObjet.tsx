// Le panneau de l'objet choisi (sa classe, son parent, ses attributs) et la liste des objets de la photo, rangee en arbre.

import type { ReactElement } from 'react';
import type { Classe, Objet } from '../types.js';
import { ordreDeLArbre } from '../classes.js';
import { changerAttribut, changerClasse, changerType, enPolygone } from '../edition.js';
import { classeContenante, libelleDe } from '../classes.js';

const ORIGINES = { auto: 'brouillon, pas encore relu', main: 'posé à la main', corrige: 'brouillon corrigé' } as const;

/** La valeur commune d'une liste (undefined si elles different) : ce que montre un champ de la selection multiple. */
function commune<T>(l: readonly T[]): T | undefined {
  return l.length && l.every((x) => x === l[0]) ? l[0] : undefined;
}

/**
 * L'inspecteur d'une selection de plusieurs objets (demande du proprietaire, 12 novembre 2026) : la classe, le type et les attributs
 * qu'ils partagent se changent pour tous d'un coup ; un champ dont les valeurs different le dit (« plusieurs »). Le type se choisit pour
 * tout le groupe, quelles que soient ses classes (il porte la sienne) ; les attributs, quand tous les objets sont de la meme classe.
 */
export function PanneauSelection({ objets, classes, onChanger, onSupprimer, onCopier, onCouper }: { objets: Objet[]; classes: Classe[]; onChanger: (os: Objet[]) => void; onSupprimer: () => void; onCopier: () => void; onCouper: () => void }) {
  const classe = commune(objets.map((o) => o.classe));
  const c = classes.find((x) => x.id === classe);
  const type = commune(objets.map((o) => o.type ?? ''));
  const auto = objets.filter((o) => o.origine === 'auto').length;
  // Les classes qui ont des types (celles du groupe d'abord) ; le type commun s'ecrit « classe:type ».
  const qualifiables = ordreDeLArbre(classes).filter((k) => k.types?.length).sort((a, b) => Number(objets.some((o) => o.classe === b.id)) - Number(objets.some((o) => o.classe === a.id)));
  const typeCommun = classe && type ? `${classe}:${type}` : '';
  const tous = (f: (o: Objet) => Objet) => onChanger(objets.map(f));
  return (
    <div className="pile fiche-objet">
      <h3>{objets.length} objets sélectionnés</h3>
      <p className="aide">Ce qui se change ici vaut pour toute la sélection (Ctrl+Z l’annule d’un coup).</p>
      <label>Classe
        <select value={classe ?? ''} onChange={(e) => { const k = classes.find((x) => x.id === e.target.value); if (k) tous((o) => changerClasse(o, k)); }}>
          {classe === undefined && <option value="">— plusieurs —</option>}
          {ordreDeLArbre(classes).map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
        </select>
      </label>
      {/* Le type, pour tout le groupe : chaque type dit sa classe ; le choisir donne a tous cette classe et ce type (des fenetres et des
          portes prises ensemble deviennent toutes « Fenetre, imposte simple »). */}
      {qualifiables.length > 0 && (
        <label className={typeCommun ? '' : 'attention'}>Type (ce que le modèle apprend)
          <select value={typeCommun || '__plusieurs'} onChange={(e) => { const [k, t] = e.target.value.split(':'); const kc = classes.find((x) => x.id === k); if (kc && t) tous((o) => changerType(o.classe === kc.id ? o : changerClasse(o, kc), t)); }}>
            {!typeCommun && <option value="__plusieurs" disabled>{classe && type === '' ? '— à qualifier —' : '— plusieurs —'}</option>}
            {qualifiables.map((k) => <optgroup key={k.id} label={k.nom}>{(k.types ?? []).map((t) => <option key={t.id} value={`${k.id}:${t.id}`}>{t.nom} ({t.id})</option>)}</optgroup>)}
          </select>
        </label>
      )}
      {c?.attributs.map((a) => {
        const v = commune(objets.map((o) => o.attributs[a.cle]));
        const poser = (x: string | number | boolean | null) => tous((o) => changerAttribut(o, a.cle, x));
        return (
          <label key={a.cle}>{a.nom}
            {a.type === 'choix' ? (
              <select value={typeof v === 'string' ? v : ''} onChange={(e) => poser(e.target.value || null)}>
                <option value="">{v === undefined && objets.some((o) => o.attributs[a.cle] !== undefined) ? '— plusieurs —' : '—'}</option>{(a.valeurs ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            ) : a.type === 'booleen' ? (
              <input type="checkbox" checked={v === true} onChange={(e) => poser(e.target.checked ? true : null)} />
            ) : (
              <input type={a.type === 'nombre' ? 'number' : 'text'} placeholder={v === undefined ? 'plusieurs' : ''} value={v === undefined ? '' : String(v)} onChange={(e) => poser(a.type === 'nombre' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
            )}
          </label>
        );
      })}
      <div className="rang">
        {auto > 0 && <button type="button" className="ok" onClick={() => tous((o) => (o.origine === 'auto' ? { ...o, origine: 'corrige' } : o))}>Justes tels quels ({auto})</button>}
        <button type="button" onClick={onCopier} title="Ctrl+C">Copier</button>
        <button type="button" onClick={onCouper} title="Ctrl+X">Couper</button>
        <button type="button" className="danger" onClick={onSupprimer}>Supprimer les {objets.length} (Suppr)</button>
      </div>
    </div>
  );
}

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
