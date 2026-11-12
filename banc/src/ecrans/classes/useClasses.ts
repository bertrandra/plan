// Le controleur de l'arbre des classes (etape 0) : la copie en cours d'edition, la classe choisie, les gestes sur l'arbre, et
// l'enregistrement (refuse tant que l'arbre a une erreur).

import { useEffect, useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { erreursDeLArbre, indicesYolo, ordreDeLArbre } from '../../classes.js';
import type { Classe } from '../../types.js';

export function useClasses(banc: Banc, onClasses: (c: Classe[]) => void) {
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

  return { classes, choisie, setChoisie, modifie, ordre, yolo, erreurs, c, changer, majClasse, renommerId, ajouter, supprimer, deplacer, enregistrer };
}
