// Etape 6 : l'indexation et le format. RF-DETR (Apache 2.0, par defaut, demande du proprietaire, 12 novembre 2026 : la licence AGPL des YOLO)
// prend le jeu au format COCO. Pour comparer, le jeu sort aussi au format natif d'Ultralytics (images/ et labels/ par bloc, data.yaml, un script
// d'entrainement) : en detection pour YOLO26n (par defaut) ou YOLOv10n (pour repartir des poids du depot facade), en segmentation pour
// YOLO26n-seg ou YOLO11n-seg ; ou dans le format du banc (annotations.json), pour garder les arbres, les attributs et les polygones.
// L'ecran se lit de haut en bas : ce qui entre dans le jeu (tuiles), le format, un seul bouton de telechargement ; le reste se replie.

import { useMemo } from 'react';
import type { Banc } from '../../App.js';
import { cibleDuNom, libelleDe, nomsYolo } from '../../classes.js';
import { Icone } from '../../ui/Icones.js';
import { Page, Section, Segments, Tuile, Tuiles, Vide } from '../../ui/Page.js';
import { useExport, VARIANTES, type Format } from './useExport.js';

const FORMATS: { valeur: Format; libelle: string }[] = [
  { valeur: 'rfdetr', libelle: 'RF-DETR · Apache 2.0' }, { valeur: 'detect', libelle: 'YOLO détection' }, { valeur: 'seg', libelle: 'YOLO contours' }, { valeur: 'natif', libelle: 'Format du banc' },
];
const MOTS: Record<Format, string> = {
  rfdetr: 'RF-DETR (Roboflow) : licence Apache 2.0 pour le code et les poids, libre dans un produit commercial. Le jeu au format COCO, un carnet Colab et un script.',
  detect: 'Ultralytics, sous AGPL-3.0 : un modèle entraîné avec eux, servi dans une application, impose d’en publier le code ou d’acheter leur licence. Pour comparer.',
  seg: 'Les contours (polygones) plutôt que les boîtes, sous AGPL-3.0 comme la détection YOLO.',
  natif: 'annotations.json : les arbres, les attributs et les polygones tels quels, pour un autre outil ou une sauvegarde.',
};

export function EcranExport({ banc }: { banc: Banc }) {
  const c = useExport(banc);
  const noms = useMemo(() => nomsYolo(banc.classes), [banc.classes]);
  const nomFormat = c.format === 'natif' ? 'format du banc' : VARIANTES[c.format].find((v) => v.valeur === c.variante)?.libelle ?? c.variante;
  return (
    <Page icone="exporter" numero="6" titre="Export"
      aide={<p>Seules les photos <b>corrigées</b> (marquage relu et enregistré) entrent dans le jeu. Les fichiers portent l’identifiant de la photo ; le bloc vient de l’étape 7 (la réserve n’est jamais exportée).</p>}>
      {!c.corrigees ? (
        <Vide icone="exporter" titre="Aucune photo corrigée" texte={c.aRelire ? `${c.aRelire} photo(s) pré-marquée(s) attendent d’être relues : chaque photo relue et enregistrée entre dans le jeu.` : 'Marquez et enregistrez des photos : elles entrent dans le jeu.'}
          action={<button type="button" className="principal" onClick={() => banc.aller('catalogue')}>Aller au marquage</button>} />
      ) : <>
        <Section titre="Ce qui entre dans le jeu" actions={<label className="case"><input type="checkbox" checked={c.verifiees} onChange={(e) => c.setVerifiees(e.target.checked)} /> Seulement les vérifiées ({c.verifieesN} sur {c.corrigees})</label>}>
          <Tuiles>
            {(['train', 'val', 'test'] as const).map((b) => <Tuile key={b} valeur={c.bilan?.[b]?.images ?? '…'} libelle={b} ton="accent" detail={`${c.bilan?.[b]?.verifiees ?? 0} vérifiée(s)`} />)}
            <Tuile valeur={c.bilan?.reserve?.images ?? '…'} libelle="réserve" detail="jamais exportée" />
            {c.aRelire > 0 && <Tuile valeur={c.aRelire} libelle="pré-marquées" ton="attention" detail="pas encore dans le jeu" />}
          </Tuiles>
          {c.sansBloc > 0 && <p className="note attention">{c.sansBloc} photo(s) corrigée(s) n’ont pas de bloc : répartissez-les d’abord (<button type="button" className="lien" onClick={() => banc.aller('blocs')}>étape 7</button>), sinon elles suivent le simple tirage, sans équilibre des types.</p>}
        </Section>
        <Section titre="Format">
          <div className="pile-export">
            <Segments label="Format" valeur={c.format} options={FORMATS} onChange={c.setFormat} />
            <p className="aide">{MOTS[c.format]}</p>
            {c.format !== 'natif' && <div className="rang">
              <Segments label="Variante" valeur={c.variante} options={VARIANTES[c.format]} onChange={c.setVariante} />
              <Segments label="Départ" valeur={c.depart} options={[{ valeur: 'coco', libelle: 'Avec COCO' }, { valeur: 'zero', libelle: 'De zéro' }]} onChange={c.setDepart} />
            </div>}
            {c.format !== 'natif' && <Segments label="Machine" valeur={c.machine} options={[{ valeur: 'gpu', libelle: 'Colab ou carte NVIDIA' }, { valeur: 'mac', libelle: 'Mac à puce Apple' }]} onChange={c.setMachine} />}
            {c.format !== 'natif' && c.machine === 'mac' && <p className="aide">Le script prend la puce graphique du Mac (Metal) sans argument, par lots de {c.format === 'rfdetr' && c.variante !== 'rf-detr-nano' ? 8 : 16} photos et huit processus de chargement. Une fois : <code>python3 -m venv ~/banc-ia</code>, <code>source ~/banc-ia/bin/activate</code>, <code>pip install {c.format === 'rfdetr' ? "'rfdetr[train,loggers]==1.12.*'" : 'ultralytics==8.4.*'}</code> ; puis dans le dossier décompressé : <code>python3 entrainer.py</code>.</p>}
            {c.format !== 'natif' && <p className="aide">{c.depart === 'coco' ? 'Le modèle part de ce qu’il sait déjà voir (COCO), ou de depart.pt posé à côté du script.' : 'L’architecture seule, rien d’appris : 300 époques, et il faut plus de photos pour rattraper le départ COCO.'}</p>}
            <a className="bouton principal grand" href={c.url} download><Icone nom="exporter" /> Télécharger le jeu · {nomFormat}{c.format !== 'natif' && c.depart === 'zero' ? ' · de zéro' : ''}{c.format !== 'natif' && c.machine === 'mac' ? ' · Mac' : ''} <small>({c.dansLeJeu} photo(s), .zip)</small></a>
          </div>
        </Section>
      </>}
      <Section titre="Entraîner un modèle pour accélérer le marquage" repliable ouverte={false}>
        <ol className="etapes-guide">
          <li>Corriger et qualifier une première série (une trentaine d’objets par type au moins), puis répartir les blocs (7) : 70 % train, 20 % val, 10 % test, stratifié par type.</li>
          <li>Exporter en <b>RF-DETR Nano</b> (Apache 2.0, libre pour Plan) ; YOLO26n ou YOLOv10n (AGPL) restent là pour comparer.</li>
          <li>Ouvrir <code>entrainer.ipynb</code> du zip dans Google Colab (GPU gratuit), ou lancer <code>python3 entrainer.py 0</code> sur un PC avec carte graphique, ou <code>python3 entrainer.py</code> sur un Mac à puce Apple (export « Mac à puce Apple ») ; sur processeur seul, compter quelques heures pour quelques centaines de photos.</li>
          <li>Déposer le modèle à l’étape 3 (<code>modele-banc.onnx</code> et <code>noms.txt</code> pour RF-DETR, avec sa résolution ; <code>best.onnx</code> et <code>names</code> pour YOLO) : ses noms vont d’eux-mêmes vers vos types.</li>
          <li>Lancer le pré-marquage sur les photos non annotées : il pose et qualifie ; vous corrigez, la série grandit, on réentraîne.</li>
        </ol>
        <p className="aide">Le test (10 %) ne sert jamais à l’entraînement : <code>entrainer.py</code> le mesure à la fin (mAP par type). La validation (20 %) arrête l’entraînement quand il ne progresse plus. Pour choisir, entraînez les variantes sur les mêmes blocs (vers 150 photos vérifiées) et gardez le meilleur mAP du test.</p>
      </Section>
      <Section titre="Structure du jeu (Ultralytics)" repliable ouverte={false}>
        <pre className="arborescence">{`banc-yolo26n-AAAAMMJJ-HHMMSS/
  data.yaml            les blocs et les noms des classes, dans l’ordre des indices
  entrainer.py         Ultralytics 8.4, graine fixe, puis export .onnx (sans NMS)
  bilan.json           photos par bloc, objets par classe
  images/train/<id>.jpg   images/val/…   images/test/…
  labels/train/<id>.txt   une ligne par objet :
     détection : classe cx cy l h            (parts de l’image)
     contours  : classe x1 y1 x2 y2 … xn yn  (un rectangle : ses 4 coins)`}</pre>
      </Section>
      <Section titre="Noms appris" compte={noms.length} repliable ouverte={false}>
        <table className="tableau">
          <thead><tr><th>Indice</th><th>Nom</th><th>Ce que c’est</th></tr></thead>
          <tbody>{noms.map((n, i) => { const k = cibleDuNom(n, banc.classes); const cl = banc.classes.find((x) => x.id === k?.classe); return <tr key={n}><td>{i}</td><td><code>{n}</code></td><td><span className="pastille" style={{ background: cl?.couleur ?? '#999' }} /> {k ? libelleDe(k, banc.classes) : ''}{k?.type ? ` (${cl?.nom})` : ''}</td></tr>; })}</tbody>
        </table>
        <p className="aide">Changer l’arbre (étape 0) change les indices : un modèle entraîné avant garde sa propre liste de classes (étape 3).</p>
      </Section>
    </Page>
  );
}
