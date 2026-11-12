// Etape 3 : le marquage brouillon, en lot sur les photos validees. Les modeles YOLO actifs (ceux du depot facade, puis les votres) et
// l'algorithme de recherche des baies proposent des rectangles ; la personne les corrige ensuite (etape 4).

import { useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { bitmap, COTE_TRAVAIL, pixels, reduire } from '../images.js';
import { detecter } from '../yolo.js';
import { brouillonSurExistant, correspondanceParDefaut, objetsDuBrouillon, parLaRecherche, selonLaCorrespondance, type Proposition } from '../brouillon.js';
import { choixDeCreation } from '../classes.js';
import type { MetaImage, Modele } from '../types.js';

export function EcranBrouillon({ banc }: { banc: Banc }) {
  const [recherche, setRecherche] = useState(true);
  const [refaire, setRefaire] = useState(false);
  const [etat, setEtat] = useState<string | null>(null);
  const actifs = banc.modeles.filter((m) => m.installe && m.actif !== false);
  const cibles = banc.images.filter((m) => m.statut === 'validee' || (refaire && (m.statut === 'brouillon' || m.statut === 'corrigee')));

  const marquer = async (l: MetaImage[]) => {
    let n = 0, objets = 0;
    for (const m of l) {
      setEtat(`Brouillon ${++n} sur ${l.length}…`);
      try {
        const b = await bitmap(api.fichier(m.id, 'redressee', m.redressement?.le ?? ''));
        const props: Proposition[] = [];
        for (const mod of actifs) props.push(...selonLaCorrespondance(mod, await detecter(mod, b, api.urlModele(mod.id)), banc.classes));
        if (recherche) {
          // La recherche travaille sur une image reduite : ses boites reviennent a l'echelle de la photo.
          const c = reduire(b, COTE_TRAVAIL), k = b.width / c.width;
          props.push(...parLaRecherche(pixels(c)).map((p) => ({ ...p, boite: { x0: p.boite.x0 * k, y0: p.boite.y0 * k, x1: p.boite.x1 * k, y1: p.boite.y1 * k } })));
        }
        b.close();
        const nouveaux = objetsDuBrouillon(props, banc.classes);
        const existants = m.statut === 'validee' ? [] : (await api.annotation(m.id)).objets;
        const tous = existants.length ? brouillonSurExistant(existants, nouveaux, banc.classes) : nouveaux;
        // Une photo deja corrigee le reste : le brouillon n'y ajoute que ce qu'elle n'avait pas, a relire.
        banc.remplacer(await api.ecrireAnnotation(m.id, { objets: tous, par: m.statut === 'corrigee' ? 'main' : 'auto' }));
        objets += nouveaux.length;
      } catch (e) {
        banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur');
      }
    }
    setEtat(`${l.length} photo(s) marquée(s), ${objets} objet(s) proposé(s).`);
  };

  return (
    <section className="pile-large">
      <div className="panneau">
        <h2>3 · Marquage brouillon</h2>
        <p className="aide">Sur les photos validées (2a) qui n’ont pas encore de marquage. Les objets proposés sont « auto » : ils ne comptent pour l’apprentissage qu’une fois relus et enregistrés (4).</p>
        <div className="rang">
          <label className="case"><input type="checkbox" checked={recherche} onChange={(e) => setRecherche(e.target.checked)} /> Algorithme de recherche des baies (sans modèle)</label>
          <label className="case"><input type="checkbox" checked={refaire} onChange={(e) => setRefaire(e.target.checked)} /> Aussi les photos déjà marquées (garde ce qui a été fait à la main)</label>
        </div>
        <div className="rang">
          <button type="button" className="principal" disabled={!cibles.length || !!etat?.endsWith('…') || (!actifs.length && !recherche)} onClick={() => { void marquer(cibles); }}>
            Marquer {cibles.length} photo(s) avec {actifs.length} modèle(s){recherche ? ' + recherche' : ''}
          </button>
          {etat && <span className="etat">{etat}</span>}
        </div>
      </div>
      <Modeles banc={banc} />
    </section>
  );
}

function Modeles({ banc }: { banc: Banc }) {
  const [attente, setAttente] = useState<string | null>(null);
  const agir = async (id: string, f: () => Promise<unknown>) => {
    setAttente(id);
    try { await f(); await banc.relire(); } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setAttente(null); }
  };
  return (
    <div className="panneau">
      <h3>Modèles YOLO</h3>
      <p className="aide">Ceux du dépôt facade (YOLOv10n, AGPL-3.0) s’installent d’un geste et trouvent fenêtres, portes et volets sans les qualifier. Le vôtre, entraîné sur vos types, les qualifie : ses noms vont d’eux-mêmes vers les types du même nom. Le modèle que vous entraînez avec le jeu exporté (6) se dépose ici : son <code>.onnx</code> et la liste de ses classes (celle de <code>data.yaml</code>, dans l’ordre).</p>
      <table className="tableau">
        <thead><tr><th>Modèle</th><th>Format</th><th>Classes → classes du banc</th><th>Seuil</th><th>Actif</th><th /></tr></thead>
        <tbody>
          {banc.modeles.map((m) => (
            <tr key={m.id}>
              <td>{m.nom}<br /><small>{m.id}</small></td>
              <td>{m.format}</td>
              <td>{m.classes.map((c) => (
                <label key={c} className="correspondance">{c} →
                  <select value={m.correspondance[c] ?? ''} disabled={!m.installe} onChange={(e) => { void agir(m.id, () => api.modifierModele(m.id, { correspondance: { ...m.correspondance, [c]: e.target.value } })); }}>
                    <option value="">(ignorée)</option>
                    {choixDeCreation(banc.classes).map((k) => <option key={k.valeur} value={k.valeur}>{k.nom}</option>)}
                  </select>
                </label>
              ))}</td>
              <td><input type="number" min={0.05} max={0.95} step={0.05} defaultValue={m.seuil} disabled={!m.installe} onBlur={(e) => { const s = Number(e.target.value); if (s !== m.seuil) void agir(m.id, () => api.modifierModele(m.id, { seuil: s })); }} /></td>
              <td>{m.installe ? <input type="checkbox" checked={m.actif !== false} onChange={(e) => { void agir(m.id, () => api.modifierModele(m.id, { actif: e.target.checked })); }} /> : '—'}</td>
              <td>{!m.installe && m.catalogue ? <button type="button" disabled={attente === m.id} onClick={() => { void agir(m.id, () => api.installer(m.id)); }}>{attente === m.id ? 'Téléchargement…' : 'Installer'}</button>
                : <button type="button" className="discret" onClick={() => { if (confirm('Retirer ce modèle ?')) void agir(m.id, () => api.supprimerModele(m.id)); }}>Retirer</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AjoutModele onAjout={(f, d) => agir('ajout', () => api.ajouterModele(f, { ...d, correspondance: correspondanceParDefaut(d.classes, banc.classes) }))} />
    </div>
  );
}

function AjoutModele({ onAjout }: { onAjout: (f: File, d: Omit<Modele, 'id' | 'installe'>) => Promise<void> }) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState('Mon modèle');
  const [format, setFormat] = useState<Modele['format']>('yolov10');
  const [classes, setClasses] = useState('');
  const liste = classes.split(/[\n,]+/).map((c) => c.replace(/^\s*\d+\s*:\s*/, '').trim()).filter(Boolean);
  return (
    <form className="pile ajout-modele" onSubmit={(e) => { e.preventDefault(); if (fichier) void onAjout(fichier, { nom, format, classes: liste, correspondance: Object.fromEntries(liste.map((c) => [c, c])), seuil: 0.3, actif: true }); }}>
      <h4>Déposer un modèle entraîné</h4>
      <label>Fichier .onnx <input type="file" accept=".onnx" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} required /></label>
      <label>Nom <input value={nom} onChange={(e) => setNom(e.target.value)} /></label>
      <label>Format <select value={format} onChange={(e) => setFormat(e.target.value as Modele['format'])}>
        <option value="yolov10">YOLOv10 (détection, sans NMS)</option>
        <option value="yolov8">YOLOv8 / YOLO11 (détection)</option>
        <option value="yolov8-seg">YOLOv8 / YOLO11 seg (contours)</option>
      </select></label>
      <label>Classes, dans l’ordre (copiez la liste <code>names</code> de data.yaml)
        <textarea rows={4} value={classes} onChange={(e) => setClasses(e.target.value)} placeholder={'0: fenetre\n1: cadre-haut\n…'} required />
      </label>
      <button type="submit" disabled={!fichier || !liste.length}>Déposer ({liste.length} classe(s))</button>
    </form>
  );
}
