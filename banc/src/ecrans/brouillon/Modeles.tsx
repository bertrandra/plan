// Les modeles du brouillon (etape 3) : ceux du depot facade a installer, les votres a deposer ; chacun actif ou non, son seuil, et la
// correspondance de ses classes vers celles du banc.

import { useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { correspondanceParDefaut } from '../../brouillon.js';
import { choixDeCreation } from '../../classes.js';
import type { Modele } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Section } from '../../ui/Page.js';

export function Modeles({ banc }: { banc: Banc }) {
  const [attente, setAttente] = useState<string | null>(null);
  const agir = async (id: string, f: () => Promise<unknown>) => {
    setAttente(id);
    try { await f(); await banc.relire(); } catch (e) { banc.dire((e as Error).message, 'erreur'); } finally { setAttente(null); }
  };
  const actifs = banc.modeles.filter((m) => m.installe && m.actif !== false).length;
  return (
    <>
      <Section titre="Modèles" compte={`${actifs} actif(s) sur ${banc.modeles.length}`}>
        <p className="aide">Ceux du dépôt facade (YOLOv10n, AGPL-3.0) s’installent d’un geste et trouvent fenêtres, portes et volets sans les qualifier. Le vôtre, entraîné sur vos types (étape 6), les qualifie : ses noms vont d’eux-mêmes vers les types du même nom.</p>
        <ul className="cartes-modeles">
          {banc.modeles.map((m) => (
            <li key={m.id} className={'carte-modele' + (m.installe && m.actif !== false ? ' actif' : '') + (m.installe ? '' : ' absent')}>
              <header>
                {m.installe ? <label className="interrupteur" title={m.actif !== false ? 'Actif : le pré-marquage l’utilise' : 'Inactif'}><input type="checkbox" checked={m.actif !== false} onChange={(e) => { void agir(m.id, () => api.modifierModele(m.id, { actif: e.target.checked })); }} /><span /></label> : null}
                <div className="titres-modele"><strong>{m.nom}</strong><small>{m.format} · {m.classes.length} classe(s)</small></div>
                <span className="espace" />
                {!m.installe && m.catalogue ? <button type="button" className="principal" disabled={attente === m.id} onClick={() => { void agir(m.id, () => api.installer(m.id)); }}>{attente === m.id ? 'Téléchargement…' : 'Installer'}</button>
                  : <button type="button" className="discret" title="Retirer ce modèle" aria-label="Retirer ce modèle" onClick={() => { if (confirm('Retirer ce modèle ?')) void agir(m.id, () => api.supprimerModele(m.id)); }}><Icone nom="poubelle" /></button>}
              </header>
              {m.installe && <>
                <label className="seuil-modele">Seuil <input type="number" min={0.05} max={0.95} step={0.05} defaultValue={m.seuil} onBlur={(e) => { const s = Number(e.target.value); if (s !== m.seuil) void agir(m.id, () => api.modifierModele(m.id, { seuil: s })); }} /></label>
                <details className="correspondances">
                  <summary>Ses classes → classes du banc ({m.classes.filter((c) => m.correspondance[c]).length} / {m.classes.length})</summary>
                  {m.classes.map((c) => (
                    <label key={c} className="correspondance"><code>{c}</code> →
                      <select value={m.correspondance[c] ?? ''} onChange={(e) => { void agir(m.id, () => api.modifierModele(m.id, { correspondance: { ...m.correspondance, [c]: e.target.value } })); }}>
                        <option value="">(ignorée)</option>
                        {choixDeCreation(banc.classes).map((k) => <option key={k.valeur} value={k.valeur}>{k.nom}</option>)}
                      </select>
                    </label>
                  ))}
                </details>
              </>}
            </li>
          ))}
        </ul>
      </Section>
      <Section titre="Déposer un modèle entraîné" repliable ouverte={false}>
        <AjoutModele onAjout={(f, d) => agir('ajout', () => api.ajouterModele(f, { ...d, correspondance: correspondanceParDefaut(d.classes, banc.classes) }))} />
      </Section>
    </>
  );
}

export function AjoutModele({ onAjout }: { onAjout: (f: File, d: Omit<Modele, 'id' | 'installe'>) => Promise<void> }) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState('Mon modèle');
  const [format, setFormat] = useState<Modele['format']>('rf-detr');
  const [resolution, setResolution] = useState(384);
  const [classes, setClasses] = useState('');
  const liste = classes.split(/[\n,]+/).map((c) => c.replace(/^\s*\d+\s*:\s*/, '').trim()).filter(Boolean);
  return (
    <form className="pile ajout-modele" onSubmit={(e) => { e.preventDefault(); if (fichier) void onAjout(fichier, { nom, format, ...(format === 'rf-detr' ? { resolution } : {}), classes: liste, correspondance: Object.fromEntries(liste.map((c) => [c, c])), seuil: 0.3, actif: true }); }}>
      <label>Fichier .onnx <input type="file" accept=".onnx" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} required /></label>
      <label>Nom <input value={nom} onChange={(e) => setNom(e.target.value)} /></label>
      <label>Architecture <select value={format} onChange={(e) => setFormat(e.target.value as Modele['format'])}>
        <option value="rf-detr">RF-DETR (détection, Apache 2.0)</option>
        <option value="yolo26">YOLO26 (détection)</option>
        <option value="yolo26-seg">YOLO26 seg (contours)</option>
        <option value="yolov10">YOLOv10 (détection)</option>
        <option value="yolov8">YOLOv8 / YOLO11 (détection)</option>
        <option value="yolov8-seg">YOLOv8 / YOLO11 seg (contours)</option>
      </select></label>
      {format === 'rf-detr' && <label>Résolution <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
        <option value={384}>384 (Nano)</option><option value={512}>512 (Small)</option><option value={576}>576 (Medium)</option>
      </select></label>}
      <p className="aide">{format === 'rf-detr' ? 'Le fichier modele-banc.onnx et la liste de noms.txt, sortis de l’entraînement RF-DETR.' : 'Pour mémoire : le banc lit la sortie d’un YOLO d’après sa forme (de bout en bout, 300 détections, ou brute, à trier).'}</p>
      <label>Classes, dans l’ordre (copiez la liste <code>names</code> de data.yaml)
        <textarea rows={4} value={classes} onChange={(e) => setClasses(e.target.value)} placeholder={'0: fenetre\n1: cadre-haut\n…'} required />
      </label>
      <button type="submit" disabled={!fichier || !liste.length}>Déposer ({liste.length} classe(s))</button>
    </form>
  );
}
