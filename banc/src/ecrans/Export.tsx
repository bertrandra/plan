// Etape 6 : l'indexation et le format. Le jeu sort au format natif d'Ultralytics (images/ et labels/ par bloc, data.yaml, un script
// d'entrainement) : en detection pour YOLOv10n (le meme modele que le depot facade), en segmentation pour YOLO11n-seg ; ou dans le
// format du banc (annotations.json), pour garder les arbres, les attributs et les polygones tels quels.

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { cibleDuNom, libelleDe, nomsYolo } from '../classes.js';
import { bilanDesBlocs, type BilanBloc } from '../blocs.js';

export function EcranExport({ banc }: { banc: Banc }) {
  const [verifiees, setVerifiees] = useState(true);
  const [bilan, setBilan] = useState<Record<string, BilanBloc> | null>(null);
  const noms = useMemo(() => nomsYolo(banc.classes), [banc.classes]);
  const sansBloc = banc.images.filter((m) => m.statut === 'corrigee' && !m.bloc).length;
  useEffect(() => { bilanDesBlocs(banc.reglages, verifiees ? banc.images.filter((m) => m.verifiee) : banc.images).then(setBilan).catch(() => setBilan(null)); }, [banc.reglages, banc.images, verifiees]);
  const corrigees = banc.images.filter((m) => m.statut === 'corrigee');
  const aRelire = banc.images.filter((m) => m.statut === 'brouillon').length;
  return (
    <section className="pile-large">
      <div className="panneau">
        <h2>6 · Indexation et export</h2>
        <p className="aide">Seules les photos <b>corrigées</b> (marquage relu et enregistré) entrent dans le jeu ; {aRelire} brouillon(s) attendent encore. Les fichiers portent l’identifiant de la photo ; le bloc vient de l’étape 7 (la réserve n’est jamais exportée).</p>
        <label className="case"><input type="checkbox" checked={verifiees} onChange={(e) => setVerifiees(e.target.checked)} /> Seulement les photos vérifiées ({corrigees.filter((m) => m.verifiee).length} sur {corrigees.length})</label>
        {bilan && (
          <table className="tableau">
            <thead><tr><th>Bloc</th><th>Photos</th><th>Vérifiées</th></tr></thead>
            <tbody>{(['train', 'val', 'test', 'reserve'] as const).map((b) => <tr key={b}><td>{b === 'reserve' ? 'réserve (non exportée)' : b}</td><td>{bilan[b]?.images ?? 0}</td><td>{bilan[b]?.verifiees ?? 0}</td></tr>)}</tbody>
          </table>
        )}
        {sansBloc > 0 && <p className="attention">{sansBloc} photo(s) corrigée(s) n’ont pas de bloc : répartissez-les d’abord (7), sinon elles suivent le simple tirage, sans équilibre des types.</p>}
        <div className="rang">
          <a className="bouton principal" href={api.urlExport('detect', verifiees)} download>YOLOv10n · détection (.zip)</a>
          <a className="bouton principal" href={api.urlExport('seg', verifiees)} download>YOLO11n-seg · contours (.zip)</a>
          <a className="bouton" href={api.urlExport('natif', verifiees)} download>Format du banc (.zip)</a>
        </div>
      </div>
      <div className="panneau">
        <h3>Entraîner un modèle pour accélérer le marquage</h3>
        <ol className="etapes">
          <li>Corriger et qualifier une première série (une trentaine d’objets par type au moins), puis répartir les blocs (7) : 70 % train, 20 % val, 10 % test, stratifié par type.</li>
          <li>Exporter en <b>YOLOv10n · détection</b> (le même modèle que le dépôt facade).</li>
          <li>Ouvrir <code>entrainer.ipynb</code> du zip dans Google Colab (GPU gratuit), ou lancer <code>python3 entrainer.py 0</code> sur un PC avec carte graphique ; sur processeur seul, compter quelques heures pour quelques centaines de photos.</li>
          <li>Déposer <code>best.onnx</code> à l’étape 3 avec la liste <code>names</code> : ses noms vont d’eux-mêmes vers vos types.</li>
          <li>Lancer le brouillon sur les photos non annotées : il pose et qualifie ; vous corrigez, la série grandit, on réentraîne.</li>
        </ol>
        <p className="aide">Le test (10 %) ne sert jamais à l’entraînement : <code>entrainer.py</code> le mesure à la fin (mAP par type). La validation (20 %) arrête l’entraînement quand il ne progresse plus.</p>
      </div>
      <div className="panneau">
        <h3>Structure du jeu (Ultralytics)</h3>
        <pre className="arborescence">{`banc-detect-AAAAMMJJ-HHMMSS/
  data.yaml            les blocs et les noms des classes, dans l’ordre des indices
  entrainer.py         Ultralytics 8.4, graine fixe, puis export .onnx
  bilan.json           photos par bloc, objets par classe
  images/train/<id>.jpg   images/val/…   images/test/…
  labels/train/<id>.txt   une ligne par objet :
     détection : classe cx cy l h            (parts de l’image)
     contours  : classe x1 y1 x2 y2 … xn yn  (un rectangle : ses 4 coins)`}</pre>
        <h3>Noms appris (data.yaml)</h3>
        <table className="tableau">
          <thead><tr><th>Indice</th><th>Nom</th><th>Ce que c’est</th></tr></thead>
          <tbody>{noms.map((n, i) => { const c = cibleDuNom(n, banc.classes); const k = banc.classes.find((x) => x.id === c?.classe); return <tr key={n}><td>{i}</td><td><code>{n}</code></td><td><span className="pastille" style={{ background: k?.couleur ?? '#999' }} /> {c ? libelleDe(c, banc.classes) : ''}{c?.type ? ` (${k?.nom})` : ''}</td></tr>; })}</tbody>
        </table>
        <p className="aide">Changer l’arbre (étape 0) change les indices : un modèle entraîné avant garde sa propre liste de classes (étape 3).</p>
      </div>
    </section>
  );
}
