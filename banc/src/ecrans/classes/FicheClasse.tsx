// La fiche d'une classe de l'arbre (etape 0) : son nom, sa place, sa forme, sa couleur, ses types (les noms appris) et ses attributs.

import { estDetail, idDuNom, ordreDeLArbre } from '../../classes.js';
import { estApprenable, type Attribut, type Classe, type TypeObjet } from '../../types.js';
import { Icone } from '../../ui/Icones.js';

export function FicheClasse({ c, classes, onMaj, onId, onSupprimer, onDeplacer }: { c: Classe; classes: Classe[]; onMaj: (x: Partial<Classe>) => void; onId: (id: string) => void; onSupprimer: () => void; onDeplacer: (s: -1 | 1) => void }) {
  const descendants = (id: string): string[] => classes.filter((x) => x.parent === id).flatMap((x) => [x.id, ...descendants(x.id)]);
  const interdits = new Set([c.id, ...descendants(c.id)]);
  const majAttribut = (i: number, a: Partial<Attribut>) => onMaj({ attributs: c.attributs.map((x, k) => (k === i ? { ...x, ...a } : x)) });
  return (
    <div className="panneau fiche">
      <header className="tete-fiche"><h3><span className="pastille" style={{ background: c.couleur }} /> {c.nom}</h3><span className="espace" />
        <button type="button" className="discret" title="Monter" aria-label="Monter" onClick={() => onDeplacer(-1)}>↑</button>
        <button type="button" className="discret" title="Descendre" aria-label="Descendre" onClick={() => onDeplacer(1)}>↓</button>
        <button type="button" className="discret danger" title="Supprimer la classe" aria-label="Supprimer la classe" onClick={onSupprimer}><Icone nom="poubelle" /></button>
      </header>
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
      </div>
    </div>
  );
}
