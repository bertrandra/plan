// Z4, ce que l'atelier du toit (Z10, zones/AtelierToit.tsx) pose sur la scene de la Vue 3D pendant une session : le plan des facades, le
// plan du toit de dessus, le doigt qui invite a toucher, les poignees et l'indicateur d'insertion. Rien de cela n'existe sur le plan :
// l'atelier y est seul. Aucune regle de toit ici : les poignees demandent au controleur par la session.

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { altitudeDuBatiment, etatToit, sessionToit } from '../../app/toits/modeToit.js';
import { insertionToit, type InsertionToit } from '../../app/ecouteurs/toitCatalogue.js';
import { useCle, CLE_GELEE } from '../composants/abonnement.js';
import { enPoints } from '../../model/formes.js';
import { abonnerImage, cameraDeVue, hotes3d, vue3d } from '../../three/etat3d.js';
import { NavigateurFacades } from './NavigateurFacades.js';
import { PoigneesToit } from './PoigneesToit.js';
import { PlanToit } from './PlanToit.js';
import { Icone } from '../icones.js';
import type { IntentionToit } from '../../facade/modeToit/controleurToit.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes }

/** Le doigt qui invite a toucher le batiment, au-dessus de lui, tant que rien n'a ete touche. */
function IndiceMain({ magasin }: { magasin: Magasin }) {
  const [, redessiner] = useState(0);
  // Il suit chaque image rendue (la camera de l'image meme), tant qu'il se montre.
  useEffect(() => abonnerImage(() => { if (sessionToit()?.indice) redessiner((n) => n + 1); }), []);
  const s = sessionToit(), sc = vue3d.scene, hote = hotes3d.vue3d;
  if (!s || !s.indice || !sc || !hote) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const pts = o ? (enPoints(o).pts as { x: number; y: number }[]) : [];
  if (!pts.length) return null;
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const v = new THREE.Vector3(cx - sc.cen.x, altitudeDuBatiment(o) + (o?.elevation ?? 3) + 2, sc.cen.y - cy).project(cameraDeVue(sc));
  if (v.z > 1) return null;
  const r = hote.getBoundingClientRect();
  return (
    <svg className="indiceMain" data-suit-la-camera="" style={{ left: ((v.x + 1) / 2) * r.width, top: ((1 - v.y) / 2) * r.height }} width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12V5.5a1.5 1.5 0 013 0V11M12 10.5V9a1.5 1.5 0 013 0v2M15 11a1.5 1.5 0 013 0v4c0 3.5-2.5 6-5.5 6S8 18.5 6.5 15.5L5 12.5a1.5 1.5 0 012.5-1L9 13" />
    </svg>
  );
}

/**
 * L'etat de la session, d'un coup d'oeil, sur la scene (retour du proprietaire, 8 novembre 2026 : « j'ai du mal a distinguer si je suis en
 * modif ou insertion ») : une pastille « Modification » ou « Ajout », un mot et son icone, sans phrase (le titre du panneau et sa promesse
 * la disent, parcours simple du 27 novembre 2026 : la scene garde sa place) ; et, quand une piece armee attend un toucher, « Insertion » en
 * toutes lettres, avec ou toucher et comment en sortir. Toujours en mots, jamais par la couleur seule ; pose sur la scene, hors du panneau,
 * il ne defile pas avec lui et reste au-dessus de lui au telephone. Au doigt, pas d'Echap : le bouton « Annuler » le dit.
 */
function EtatSession({ insertion, intention, commandes, clavier }: { insertion: InsertionToit | null; intention: IntentionToit; commandes: RegistreCommandes; clavier: boolean }) {
  const etat = insertion ? 'insertion' : intention === 'ajouter' ? 'ajout' : 'modification';
  return (
    <div className="etatToit" data-etat={etat} role="status" aria-live="polite">
      <span className="badgeEtatToit"><Icone nom={etat === 'modification' ? 'crayon' : 'plus'} taille={16} />{insertion ? insertion.nature + ' : ' + insertion.piece : etat === 'ajout' ? 'Ajout' : 'Modification'}</span>
      {insertion && (
        <>
          <span className="texteEtatToit">{'— ' + insertion.consigne + (clavier ? ' · Échap pour annuler' : '')}</span>
          <button type="button" className="annulerEtatToit" data-commande="toit.quitterInsertion" title="Quitter l’insertion sans rien poser (Échap)"
            onClick={(ev) => { commandes.executer('toit.quitterInsertion', ev.currentTarget); }}>Annuler</button>
        </>
      )}
    </div>
  );
}

export function ToitEn3d({ magasin, commandes }: Props) {
  // Hors d'une session attachee a la 3D, rien a montrer : la zone ne suit pas les rendus du plan ; en session, elle les suit tous.
  useCle(magasin, 'toit en 3D', (s) => (sessionToit()?.en3d ? String(s.version) : CLE_GELEE));
  const tactile = useStore(magasin.store, (x) => x.classe) !== 'large';
  const s = sessionToit();
  if (!s?.en3d || !etatToit().actif) return null;
  return (
    <>
      <NavigateurFacades magasin={magasin} commandes={commandes} />
      <PlanToit magasin={magasin} commandes={commandes} />
      <IndiceMain magasin={magasin} />
      {/* Les poignees changent ce qui existe : en « Ajouter », rien d'existant n'est touche (le controleur le refuse), elles ne se montrent pas. */}
      {s.ctl.etat().intention === 'modifier' && <PoigneesToit magasin={magasin} />}
      <EtatSession insertion={insertionToit()} intention={s.ctl.etat().intention} commandes={commandes} clavier={!tactile} />
    </>
  );
}
