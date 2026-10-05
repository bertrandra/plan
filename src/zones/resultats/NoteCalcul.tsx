// Z6, onglet Note de calcul : ce que le moteur a retenu pour la piscine selectionnee, et la regle
// qui a servi a chaque chiffre (engine/piscine.ts, `noteDeCalcul`).
//
// Rien n'est calcule ici : la note est une donnee du moteur, rendue en tableaux, une section par
// sujet (geometrie, terrassement, structure, abords, hydraulique, equipements, reglementation). La
// meme note s'imprime en annexe du dossier de mairie (export/dossierMairie.ts).

import { calculerPiscine, noteDeCalcul } from '../../engine/piscine.js';
import { estPiscine } from '../../model/fonctions.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';

export function NoteCalcul({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const etat = resultats.etat;
  const piscine = etat.objects.find(o => o.key === etat.selectedKey && estPiscine(o));
  if (!piscine) return <div className="hint">Sélectionnez une piscine pour lire sa note de calcul.</div>;
  const calc = calculerPiscine(piscine, etat.objects);
  if (!calc) return <div className="hint">Le bassin doit avoir au moins trois coins et plus d'un demi-mètre carré pour être calculé.</div>;
  const sections = noteDeCalcul(calc);
  return (
    <div id="piscineNoteWrap">
      <div className="controls">
        <BoutonCommande commandes={commandes} id="export.dossierMairie" domId="dossierMairieBtn">Dossier mairie (PDF)</BoutonCommande>
      </div>
      <div className="hint">Pré-dimensionnement d'avant-projet pour « {piscine.name} » : chaque valeur dit la règle qui la donne. Ce n'est ni une étude de sol ni une note de calcul béton.</div>
      {sections.map(s => (
        <section key={s.titre}>
          <div className="sectionTitle">{s.titre}</div>
          <table className="attrTable">
            <tbody>
              <tr><th>Élément</th><th>Valeur</th><th>Règle</th></tr>
              {s.lignes.map(l => (
                <tr key={l.libelle}><td>{l.libelle}</td><td className="nombre">{l.valeur}</td><td className="noteLigne">{l.note || ''}</td></tr>
              ))}
            </tbody>
          </table>
          {s.remarque && <div className="hint">{s.remarque}</div>}
        </section>
      ))}
    </div>
  );
}
