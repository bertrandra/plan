// Etape 0 : l'arbre des objets a marquer. Chaque classe : son nom, sa place (son parent), sa forme (rectangle ou polygone), sa couleur
// de marquage, ses attributs a renseigner, et si elle entre dans le jeu YOLO (son indice, dans l'ordre de l'arbre).

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { CLASSES_DEFAUT, erreursDeLArbre, estDetail, idDuNom, indicesYolo, nomsDeLaClasse, ordreDeLArbre, profondeur } from '../classes.js';

/** Les indices YOLO d'une classe, en abrege : « #3 », « #0–8 », « — » sans indice. */
const indicesAffiches = (l: number[]): string => (!l.length ? '—' : l.length === 1 ? '#' + l[0] : `#${l[0]}–${l[l.length - 1]}`);
import { estApprenable, type Attribut, type Classe, type TypeObjet } from '../types.js';

export function EcranClasses({ banc, onClasses }: { banc: Banc; onClasses: (c: Classe[]) => void }) {
  const [classes, setClasses] = useState<Classe[]>(banc.classes);
  const [choisie, setChoisie] = useState<string | null>(banc.classes[0]?.id ?? null);
  const [modifie, setModifie] = useState(false);
  useEffect(() => { setClasses(banc.classes); setModifie(false); }, [banc.classes]);

  const ordre = useMemo(() => ordreDeLArbre(classes), [classes]);
  const yolo = useMemo(() => indicesYolo(classes), [classes]);
  const erreurs = useMemo(() => erreursDeLArbre(classes), [classes]);
  const c = classes.find((x) => x.id === choisie) ?? null;
  const changer = (l: Classe[]) => { setClasses(l); setModifie(true); };
  const majClasse = (champs: Partial<Classe>) => { if (c) changer(classes.map((x) => (x.id === c.id ? { ...x, ...champs } : x))); };
  const renommerId = (nouveau: string) => {
    if (!c) return;
    changer(classes.map((x) => (x.id === c.id ? { ...x, id: nouveau } : x.parent === c.id ? { ...x, parent: nouveau } : x)));
    setChoisie(nouveau);
  };
  const ajouter = (parent: string | null) => {
    const ids = new Set(classes.map((x) => x.id));
    let id = 'nouvelle', k = 1;
    while (ids.has(id)) id = 'nouvelle-' + ++k;
    const n: Classe = { id, nom: 'Nouvelle classe', parent, forme: 'rectangle', couleur: '#ff7043', attributs: [], apprendre: true };
    changer([...classes, n]);
    setChoisie(id);
  };
  const supprimer = () => {
    if (!c) return;
    if (classes.some((x) => x.parent === c.id)) { banc.dire('Retirez ou déplacez d’abord ses classes filles.', 'erreur'); return; }
    if (banc.images.some((m) => m.classes?.includes(c.id)) && !confirm(`Des photos ont des objets « ${c.nom} ». Ils resteront dans leur marquage mais ne s’exporteront plus. Supprimer la classe ?`)) return;
    changer(classes.filter((x) => x.id !== c.id));
    setChoisie(null);
  };
  const deplacer = (sens: -1 | 1) => {
    if (!c) return;
    const freres = classes.filter((x) => x.parent === c.parent);
    const i = freres.findIndex((x) => x.id === c.id), j = i + sens;
    const autre = freres[j];
    if (!autre) return;
    const l = [...classes], a = l.indexOf(c), b = l.indexOf(autre);
    [l[a], l[b]] = [autre, c];
    changer(l);
  };
  const enregistrer = () => {
    if (erreurs.length) { banc.dire(erreurs[0] ?? 'Arbre invalide.', 'erreur'); return; }
    api.ecrireClasses(classes).then((r) => { onClasses(r.classes); setModifie(false); banc.dire('Classes enregistrées.'); }).catch((e: Error) => banc.dire(e.message, 'erreur'));
  };

  return (
    <section className="deux-colonnes">
      <div className="panneau">
        <h2>0 · Les objets à marquer</h2>
        <p className="aide">Trois niveaux : un <b>regroupement</b> classe sans se dessiner (Ouverture → Fenêtre, Porte) ; une <b>classe</b> se dessine et se range dans l’objet de sa classe parente (un cadre dans sa fenêtre) ; ses <b>types</b> la qualifient (fenetre_2v). Ce qui est « appris » entre dans le jeu YOLO avec l’indice affiché ; les détails appris prennent leurs indices après les objets principaux.</p>
        <ul className="arbre" role="listbox" aria-label="Classes">
          {ordre.map((x) => (
            <li key={x.id} role="option" aria-selected={x.id === choisie} className={x.id === choisie ? 'choisie' : ''} style={{ paddingLeft: 8 + 18 * profondeur(classes, x.id) }} onClick={() => setChoisie(x.id)}>
              <span className="pastille" style={{ background: x.couleur }} />
              {x.regroupement ? <b>{x.nom}</b> : x.nom}{x.aussi?.length ? <em className="aussi"> (aussi {x.aussi.map((a) => classes.find((k) => k.id === a)?.nom ?? a).join(', ')})</em> : null} <small>{x.regroupement ? 'regroupement' : <>{x.forme === 'polygone' ? '⬠' : x.forme === 'ligne' ? '╱' : x.forme === 'point' ? '⊕' : '▭'} {indicesAffiches(nomsDeLaClasse(x).map((n) => yolo.get(n) ?? -1))}</>}</small>
            </li>
          ))}
        </ul>
        <div className="rang">
          <button type="button" onClick={() => ajouter(null)}>+ À la racine</button>
          <button type="button" onClick={() => ajouter(choisie)} disabled={!choisie}>+ Dans la classe choisie</button>
        </div>
        <div className="rang">
          <button type="button" className="principal" onClick={enregistrer} disabled={!modifie}>Enregistrer</button>
          <button type="button" className="discret" onClick={() => { if (confirm('Revenir à l’arbre de départ ?')) changer(CLASSES_DEFAUT); }}>Arbre de départ</button>
        </div>
        {erreurs.length > 0 && <ul className="erreur">{erreurs.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
      {c ? <FicheClasse c={c} classes={classes} onMaj={majClasse} onId={renommerId} onSupprimer={supprimer} onDeplacer={deplacer} /> : <div className="panneau"><p className="aide">Choisissez une classe.</p></div>}
    </section>
  );
}

function FicheClasse({ c, classes, onMaj, onId, onSupprimer, onDeplacer }: { c: Classe; classes: Classe[]; onMaj: (x: Partial<Classe>) => void; onId: (id: string) => void; onSupprimer: () => void; onDeplacer: (s: -1 | 1) => void }) {
  const descendants = (id: string): string[] => classes.filter((x) => x.parent === id).flatMap((x) => [x.id, ...descendants(x.id)]);
  const interdits = new Set([c.id, ...descendants(c.id)]);
  const majAttribut = (i: number, a: Partial<Attribut>) => onMaj({ attributs: c.attributs.map((x, k) => (k === i ? { ...x, ...a } : x)) });
  return (
    <div className="panneau fiche">
      <h3><span className="pastille" style={{ background: c.couleur }} /> {c.nom}</h3>
      <div className="grille-champs">
        <label>Nom<input value={c.nom} onChange={(e) => onMaj({ nom: e.target.value })} onBlur={() => { if (c.id.startsWith('nouvelle')) onId(idDuNom(c.nom)); }} /></label>
        <label>Identifiant (export)<input value={c.id} onChange={(e) => onId(e.target.value)} /></label>
        <label>Parent
          <select value={c.parent ?? ''} onChange={(e) => onMaj({ parent: e.target.value || null })}>
            <option value="">— racine —</option>
            {ordreDeLArbre(classes).filter((x) => !interdits.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        </label>
        <label>Forme
          <select value={c.forme} onChange={(e) => onMaj({ forme: e.target.value as Classe['forme'] })}>
            <option value="rectangle">Rectangle</option>
            <option value="polygone">Polygone</option>
            <option value="ligne">Ligne (égout, sol : jamais apprise par YOLO)</option>
            <option value="point">Point (pointe de pignon : jamais appris par YOLO)</option>
          </select>
        </label>
        <label>Couleur du marquage<input type="color" value={c.couleur} onChange={(e) => onMaj({ couleur: e.target.value })} /></label>
        <label className="case"><input type="checkbox" checked={!!c.regroupement} onChange={(e) => onMaj(e.target.checked ? { regroupement: true, apprendre: false, types: [] } : { regroupement: false })} /> Regroupement (classe ses enfants, ne se dessine pas)</label>
        {!c.regroupement && estApprenable(c.forme) && <label className="case"><input type="checkbox" checked={c.apprendre} onChange={(e) => onMaj({ apprendre: e.target.checked })} /> Apprise (entre dans le jeu YOLO){estDetail(c, classes) ? ' — un détail : ses indices viennent après les objets principaux' : ''}</label>}
        <label className="large">Description<input value={c.description ?? ''} onChange={(e) => onMaj({ description: e.target.value })} /></label>
        {!c.regroupement && estApprenable(c.forme) && c.apprendre && !c.types?.length && (
          <label>Indice YOLO figé<input type="number" min={0} value={c.indice ?? ''} placeholder="(à la suite)" onChange={(e) => { const { indice: _a, ...reste } = c; void _a; onMaj(e.target.value === '' ? reste : { indice: Number(e.target.value) }); }} /></label>
        )}
      </div>
      {!c.regroupement && classes.some((x) => x.regroupement && x.id !== c.parent) && (
        <div className="rang">
          <span className="aide">Fait aussi partie de :</span>
          {classes.filter((x) => x.regroupement && x.id !== c.parent).map((x) => (
            <label key={x.id} className="case"><input type="checkbox" checked={(c.aussi ?? []).includes(x.id)}
              onChange={(e) => onMaj({ aussi: e.target.checked ? [...(c.aussi ?? []), x.id] : (c.aussi ?? []).filter((a) => a !== x.id) })} /> {x.nom}</label>
          ))}
        </div>
      )}
      {!c.regroupement && estApprenable(c.forme) && <>
      <h4>Types (les noms que le modèle apprend)</h4>
      <p className="aide">Avec des types, le modèle voit l’objet et le qualifie : chaque type est un nom de <code>data.yaml</code>. Sans type, la classe elle-même est le nom appris.</p>
      <table className="tableau">
        <thead><tr><th>Nom YOLO</th><th>Indice figé</th><th>Libellé</th><th /></tr></thead>
        <tbody>
          {(c.types ?? []).map((t, i) => (
            <tr key={i}>
              <td><input value={t.id} onChange={(e) => onMaj({ types: (c.types ?? []).map((x, k) => (k === i ? { ...x, id: e.target.value } : x)) })} /></td>
              <td><input type="number" min={0} value={t.indice ?? ''} placeholder="(à la suite)" onChange={(e) => onMaj({ types: (c.types ?? []).map((x, k) => { if (k !== i) return x; const { indice: _a, ...reste } = x; void _a; return e.target.value === '' ? reste : { ...x, indice: Number(e.target.value) }; }) })} /></td>
              <td><input value={t.nom} onChange={(e) => onMaj({ types: (c.types ?? []).map((x, k) => (k === i ? { ...x, nom: e.target.value } : x)) })} onBlur={() => { if (!t.id || t.id.startsWith('type_')) onMaj({ types: (c.types ?? []).map((x, k) => (k === i ? { ...x, id: idDuNom(x.nom, '_') } : x)) }); }} /></td>
              <td>
                <button type="button" className="discret" aria-label="Monter" disabled={!i} onClick={() => { const l = [...(c.types ?? [])]; [l[i - 1], l[i]] = [l[i] as TypeObjet, l[i - 1] as TypeObjet]; onMaj({ types: l }); }}>↑</button>
                <button type="button" className="discret" aria-label={'Retirer ' + t.nom} onClick={() => onMaj({ types: (c.types ?? []).filter((_, k) => k !== i) })}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rang"><button type="button" onClick={() => onMaj({ types: [...(c.types ?? []), { id: 'type_' + ((c.types?.length ?? 0) + 1), nom: 'Nouveau type' }] })}>+ Type</button></div>
      </>}
      <h4>Attributs à renseigner</h4>
      <table className="tableau">
        <thead><tr><th>Clé</th><th>Nom</th><th>Type</th><th>Valeurs (séparées par des virgules)</th><th /></tr></thead>
        <tbody>
          {c.attributs.map((a, i) => (
            <tr key={i}>
              <td><input value={a.cle} onChange={(e) => majAttribut(i, { cle: idDuNom(e.target.value) })} /></td>
              <td><input value={a.nom} onChange={(e) => majAttribut(i, { nom: e.target.value })} /></td>
              <td><select value={a.type} onChange={(e) => majAttribut(i, { type: e.target.value as Attribut['type'] })}>
                <option value="choix">choix</option><option value="nombre">nombre</option><option value="booleen">oui / non</option><option value="texte">texte</option>
              </select></td>
              <td>{a.type === 'choix' ? <input value={(a.valeurs ?? []).join(', ')} onChange={(e) => majAttribut(i, { valeurs: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /> : '—'}</td>
              <td><button type="button" className="discret" aria-label={'Retirer ' + a.nom} onClick={() => onMaj({ attributs: c.attributs.filter((_, k) => k !== i) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rang">
        <button type="button" onClick={() => onMaj({ attributs: [...c.attributs, { cle: 'attribut' + (c.attributs.length + 1), nom: 'Attribut', type: 'choix', valeurs: [] }] })}>+ Attribut</button>
        <button type="button" onClick={() => onDeplacer(-1)}>↑ Monter</button>
        <button type="button" onClick={() => onDeplacer(1)}>↓ Descendre</button>
        <button type="button" className="danger" onClick={onSupprimer}>Supprimer la classe</button>
      </div>
    </div>
  );
}
