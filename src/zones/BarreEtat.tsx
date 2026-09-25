// Z7, la barre d'etat (spec-ihm-zones §4.7) : ou l'on en est.
//
// Serveur ou mode local, statut d'enregistrement, objet selectionne, echelle du plan, pointeur en
// metres, version. Rien n'y est cliquable. Elle lit le magasin : les champs immuables directement,
// et l'etat du plan a travers le compteur de version, qui la redessine a chaque rendu.

import { useStore } from 'zustand';
import { APP_VERSION, SCHEMA_VERSION, API_VERSION, versionLongue } from '../model/version.js';
import type { Magasin } from '../app/magasin.js';
import { texteStatut } from './statut.js';

const metres = (v: number) => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BarreEtat({ magasin }: { magasin: Magasin }) {
  const p = useStore(magasin.store, (s) => s.projet);
  const pointeur = useStore(magasin.store, (s) => s.pointeur);
  useStore(magasin.store, (s) => s.version);
  const etat = magasin.store.getState().etat;
  const selection = etat.selectedKey ? etat.objects.find((o) => o.key === etat.selectedKey) : undefined;

  const statut = texteStatut(p);

  return (
    <>
      <span id="projectStatus" className={p.statut === 'local' ? 'local' : ''}>{statut}</span>
      {/* Un plan qu'on ne peut pas enregistrer doit le dire avant qu'on l'ait modifie pour rien. */}
      {etat.lectureSeule && (
        <span className="etatLectureSeule" title="Votre compte n'a pas le droit d'écrire sur cette organisation : un administrateur peut vous le donner.">
          Lecture seule
        </span>
      )}
      <span className="etatSelection" title="Objet selectionne">{selection ? selection.name : 'Aucune selection'}</span>
      <span className="etatEchelle" title="Echelle du plan a l'ecran">1 m = {Math.round(etat.scene.scale)} px</span>
      <span className="etatPointeur" title="Position du pointeur sur le plan, en metres">
        {pointeur ? 'x ' + metres(pointeur.x) + ' · y ' + metres(pointeur.y) + ' m' : ''}
      </span>
      <span id="appVersion" title={versionLongue() + ' — schema de projet ' + SCHEMA_VERSION + ', API ' + API_VERSION}>v{APP_VERSION}</span>
    </>
  );
}
