// Z7, la barre d'etat (spec-ihm-zones §4.7) : ou l'on en est.
//
// Serveur ou mode local, statut d'enregistrement, objet selectionne, echelle du plan, pointeur en
// metres, version. Rien n'y est cliquable. Elle lit le magasin : les champs immuables directement,
// et l'etat du plan a travers le compteur de version, qui la redessine a chaque rendu.

import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { APP_VERSION, SCHEMA_VERSION, API_VERSION, versionLongue } from '../model/version.js';
import type { Magasin } from '../app/magasin.js';
import { texteStatut } from './statut.js';
import { lectureToits } from '../core/lectureToits.js';
import { modeDiagnostic, compterDiagnostic, LEGENDES, COULEURS_DIAGNOSTIC } from '../app/diagnostic.js';

/** Le mode de diagnostic de l'adresse (?mode=devroof ou devwall), lu une fois. */
const diagnostic = modeDiagnostic();

const metres = (v: number) => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BarreEtat({ magasin }: { magasin: Magasin }) {
  const p = useStore(magasin.store, (s) => s.projet);
  const pointeur = useStore(magasin.store, (s) => s.pointeur);
  useStore(magasin.store, (s) => s.version);
  const etat = magasin.store.getState().etat;
  const selection = etat.selectedKey ? etat.objects.find((o) => o.key === etat.selectedKey) : undefined;

  const statut = texteStatut(p);
  // Les toits lus en tache de fond (app/toitsFond.ts) : combien sur combien, tant qu'il en reste.
  const toits = useSyncExternalStore(lectureToits.abonner, lectureToits.progression);
  const suite = toits?.etat === 'pause' ? ' (en pause)' : toits?.etat === 'arretee' ? ' (service LiDAR muet)' : '';

  return (
    <>
      <span id="projectStatus" className={p.statut === 'local' ? 'local' : ''}>{statut}</span>
      {/* Un plan qu'on ne peut pas enregistrer doit le dire avant qu'on l'ait modifie pour rien. */}
      {etat.lectureSeule && (
        <span className="etatLectureSeule" title="Votre compte n'a pas le droit d'écrire sur cette organisation : un administrateur peut vous le donner.">
          Lecture seule
        </span>
      )}
      {diagnostic && <LegendeDiagnostic mode={diagnostic} objets={etat.objects} />}
      {toits && toits.etat !== 'finie' && (
        <span className="etatToits" title="Toits du voisinage lus sur le LiDAR HD de l'IGN, du plus proche au plus loin ; Fichier › Suspendre ou Reprendre">
          Toits LiDAR : {toits.faits.toLocaleString('fr-FR')} / {toits.total.toLocaleString('fr-FR')}{suite}
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

/** La legende d'un mode de diagnostic : chaque couleur, ce qu'elle dit, et combien de batiments la portent. */
function LegendeDiagnostic({ mode, objets }: { mode: NonNullable<ReturnType<typeof modeDiagnostic>>; objets: Parameters<typeof compterDiagnostic>[0] }) {
  const n = compterDiagnostic(objets, mode);
  const l = LEGENDES[mode];
  return (
    <span className="etatDiagnostic" title={'Mode de diagnostic (?mode=' + mode + ') : la couleur de chaque bâtiment dit d’où vient ' + (mode === 'devroof' ? 'son toit' : 'la couleur de ses murs')}>
      <strong>{l.titre}</strong>
      {l.classes.map(({ classe, libelle }) => (
        <span key={classe} className="classeDiagnostic">
          {/* La pastille porte la couleur calculee du diagnostic ; le mot la dit aussi. */}
          <span className="pastilleDiagnostic" style={{ background: COULEURS_DIAGNOSTIC[classe] }} aria-hidden="true" />
          {libelle} {n[classe].toLocaleString('fr-FR')}
        </span>
      ))}
    </span>
  );
}
