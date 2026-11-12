// Etape 6 : l'indexation et le format. RF-DETR (Apache 2.0, par defaut, demande du proprietaire, 12 novembre 2026 : la licence AGPL des YOLO)
// prend le jeu au format COCO. Pour comparer, le jeu sort aussi au format natif d'Ultralytics (images/ et labels/ par bloc, data.yaml, un script
// d'entrainement) : en detection pour YOLO26n (par defaut) ou YOLOv10n (pour repartir des poids du depot facade), en segmentation pour
// YOLO26n-seg ou YOLO11n-seg ; ou dans le format du banc (annotations.json), pour garder les arbres, les attributs et les polygones.

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { cibleDuNom, libelleDe, nomsYolo } from '../classes.js';
import { bilanDesBlocs, type BilanBloc } from '../blocs.js';

export function EcranExport({ banc }: { banc: Banc }) {
  const [verifiees, setVerifiees] = useState(true);
  const [baseDetect, setBaseDetect] = useState<'yolo26n' | 'yolov10n'>('yolo26n');
  const [baseSeg, setBaseSeg] = useState<'yolo26n-seg' | 'yolo11n-seg'>('yolo26n-seg');
  const [baseRf, setBaseRf] = useState<'rf-detr-nano' | 'rf-detr-small' | 'rf-detr-medium'>('rf-detr-nano');
  // Le depart : les poids appris sur COCO (ou depart.pt), ou l'architecture seule, de zero.
  const [depart, setDepart] = useState<'coco' | 'zero'>('coco');
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
          <label>Départ <select value={depart} onChange={(e) => setDepart(e.target.value as typeof depart)}>
            <option value="coco">Avec COCO (poids pré-entraînés)</option>
            <option value="zero">Sans COCO (de zéro)</option>
          </select></label>
          <span className="aide">{depart === 'coco' ? 'Le modèle part de ce qu’il sait déjà voir (COCO), ou de depart.pt posé à côté du script.' : 'L’architecture seule, rien d’appris : 300 époques, et il faut plus de photos pour rattraper le départ COCO.'}</span>
        </div>
        <div className="rang">
          <label>RF-DETR · Apache 2.0 <select value={baseRf} onChange={(e) => setBaseRf(e.target.value as typeof baseRf)}>
            <option value="rf-detr-nano">Nano (384 px)</option>
            <option value="rf-detr-small">Small (512 px)</option>
            <option value="rf-detr-medium">Medium (576 px)</option>
          </select></label>
          <a className="bouton principal" href={api.urlExport('rfdetr', verifiees, baseRf, depart)} download>RF-DETR {baseRf.replace('rf-detr-', '')} · détection{depart === 'zero' ? ' · de zéro' : ''} (.zip)</a>
        </div>
        <p className="aide">RF-DETR (Roboflow) : licence <b>Apache 2.0</b> pour le code et les poids, libre dans un produit commercial. Les YOLO d’Ultralytics (YOLO26, YOLOv10, YOLO11) sont sous <b>AGPL-3.0</b> : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence.</p>
        <div className="rang">
          <label>YOLO · détection (AGPL) <select value={baseDetect} onChange={(e) => setBaseDetect(e.target.value as typeof baseDetect)}>
            <option value="yolo26n">YOLO26n</option>
            <option value="yolov10n">YOLOv10n (peut repartir des poids du dépôt facade)</option>
          </select></label>
          <a className="bouton principal" href={api.urlExport('detect', verifiees, baseDetect, depart)} download>{baseDetect === 'yolo26n' ? 'YOLO26n' : 'YOLOv10n'} · détection{depart === 'zero' ? ' · de zéro' : ''} (.zip)</a>
        </div>
        <div className="rang">
          <label>YOLO · contours (AGPL) <select value={baseSeg} onChange={(e) => setBaseSeg(e.target.value as typeof baseSeg)}>
            <option value="yolo26n-seg">YOLO26n-seg</option>
            <option value="yolo11n-seg">YOLO11n-seg</option>
          </select></label>
          <a className="bouton principal" href={api.urlExport('seg', verifiees, baseSeg, depart)} download>{baseSeg === 'yolo26n-seg' ? 'YOLO26n-seg' : 'YOLO11n-seg'} · contours{depart === 'zero' ? ' · de zéro' : ''} (.zip)</a>
          <a className="bouton" href={api.urlExport('natif', verifiees)} download>Format du banc (.zip)</a>
        </div>
        <p className="aide">Pour choisir, entraînez une fois les variantes (YOLO26n ou YOLOv10n, avec ou sans COCO) sur les mêmes blocs (vers 150 photos vérifiées) et comparez le mAP du bloc test (affiché à la fin de l’entraînement) : on garde le meilleur.</p>
      </div>
      <div className="panneau">
        <h3>Entraîner un modèle pour accélérer le marquage</h3>
        <ol className="etapes">
          <li>Corriger et qualifier une première série (une trentaine d’objets par type au moins), puis répartir les blocs (7) : 70 % train, 20 % val, 10 % test, stratifié par type.</li>
          <li>Exporter en <b>RF-DETR Nano</b> (Apache 2.0, libre pour Plan) ; YOLO26n ou YOLOv10n (AGPL) restent là pour comparer.</li>
          <li>Ouvrir <code>entrainer.ipynb</code> du zip dans Google Colab (GPU gratuit), ou lancer <code>python3 entrainer.py 0</code> sur un PC avec carte graphique ; sur processeur seul, compter quelques heures pour quelques centaines de photos.</li>
          <li>Déposer le modèle à l’étape 3 (<code>modele-banc.onnx</code> et <code>noms.txt</code> pour RF-DETR, avec sa résolution ; <code>best.onnx</code> et <code>names</code> pour YOLO) : ses noms vont d’eux-mêmes vers vos types.</li>
          <li>Lancer le brouillon sur les photos non annotées : il pose et qualifie ; vous corrigez, la série grandit, on réentraîne.</li>
        </ol>
        <p className="aide">Le test (10 %) ne sert jamais à l’entraînement : <code>entrainer.py</code> le mesure à la fin (mAP par type). La validation (20 %) arrête l’entraînement quand il ne progresse plus.</p>
      </div>
      <div className="panneau">
        <h3>Structure du jeu (Ultralytics)</h3>
        <pre className="arborescence">{`banc-yolo26n-AAAAMMJJ-HHMMSS/
  data.yaml            les blocs et les noms des classes, dans l’ordre des indices
  entrainer.py         Ultralytics 8.4, graine fixe, puis export .onnx (sans NMS)
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
