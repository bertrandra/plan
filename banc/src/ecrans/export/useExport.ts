// Le controleur de l'export (etape 6) : le format choisi (RF-DETR par defaut, YOLO pour comparer, ou le format du banc), sa variante, le
// depart (COCO ou de zero), le filtre « verifiees », et le bilan des blocs qui en sort. Le lien de telechargement se compose ici.

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bilanDesBlocs, type BilanBloc } from '../../blocs.js';

export type Format = 'rfdetr' | 'detect' | 'seg' | 'natif';
export const VARIANTES: Record<Exclude<Format, 'natif'>, { valeur: string; libelle: string }[]> = {
  rfdetr: [{ valeur: 'rf-detr-nano', libelle: 'Nano · 384 px' }, { valeur: 'rf-detr-small', libelle: 'Small · 512 px' }, { valeur: 'rf-detr-medium', libelle: 'Medium · 576 px' }],
  detect: [{ valeur: 'yolo26n', libelle: 'YOLO26n' }, { valeur: 'yolov10n', libelle: 'YOLOv10n (poids du dépôt facade)' }],
  seg: [{ valeur: 'yolo26n-seg', libelle: 'YOLO26n-seg' }, { valeur: 'yolo11n-seg', libelle: 'YOLO11n-seg' }],
};

export function useExport(banc: Banc) {
  const [verifiees, setVerifiees] = useState(true);
  const [format, setFormat] = useState<Format>('rfdetr');
  const [variantes, setVariantes] = useState<Record<string, string>>({ rfdetr: 'rf-detr-nano', detect: 'yolo26n', seg: 'yolo26n-seg' });
  // Le depart : les poids appris sur COCO (ou depart.pt), ou l'architecture seule, de zero.
  const [depart, setDepart] = useState<'coco' | 'zero'>('coco');
  const [bilan, setBilan] = useState<Record<string, BilanBloc> | null>(null);
  const corrigees = useMemo(() => banc.images.filter((m) => m.statut === 'corrigee'), [banc.images]);
  useEffect(() => { bilanDesBlocs(banc.reglages, verifiees ? banc.images.filter((m) => m.verifiee) : banc.images).then(setBilan).catch(() => setBilan(null)); }, [banc.reglages, banc.images, verifiees]);
  const variante = format === 'natif' ? '' : variantes[format] ?? '';
  const url = format === 'natif' ? api.urlExport('natif', verifiees) : api.urlExport(format, verifiees, variante, depart);
  const dansLeJeu = bilan ? (['train', 'val', 'test'] as const).reduce((s, b) => s + (bilan[b]?.images ?? 0), 0) : 0;
  return {
    verifiees, setVerifiees, format, setFormat, variante, setVariante: (v: string) => setVariantes((x) => ({ ...x, [format]: v })), depart, setDepart, bilan, url, dansLeJeu,
    corrigees: corrigees.length, verifieesN: corrigees.filter((m) => m.verifiee).length, sansBloc: corrigees.filter((m) => !m.bloc).length,
    aRelire: banc.images.filter((m) => m.statut === 'brouillon').length,
  };
}
