// « Quelle formalité pour ce projet ? » : l'indication de engine/regles/plu/formalite.ts, montree en tete du dialogue de la
// declaration prealable (Z8) et dans l'onglet PLU (Z6). Le composant ne calcule rien : il ecrit la reponse, ses raisons et ses
// reserves. C'est une indication d'apres les regles nationales, jamais une autorisation : le texte le dit a chaque fois, et le mot
// de la reponse est ecrit (la couleur du filet ne porte rien seule).

import { LIBELLE_FORMALITE, type IndicationFormalite as Indication } from '../../engine/regles/plu/formalite.js';

const SUITE: Record<Indication['formalite'], string> = {
  aucune: 'd’après les règles nationales.',
  declaration: 'd’après les règles nationales.',
  permis: 'd’après les règles nationales.',
  'a-verifier': 'les règles nationales ne tranchent pas avec ce que le plan sait.',
};

/** `note` : ce que l'ecran qui la montre ajoute (le dialogue de la declaration dit ce que son dossier ecrit d'une terrasse surelevee). */
export function IndicationFormalite({ indication, id, note }: { indication: Indication; id: string; note?: string | null }) {
  const i = indication;
  return (
    <section className={'formalite formalite-' + i.formalite} id={id} data-formalite={i.formalite} aria-labelledby={id + 'Titre'}>
      <div className="formaliteTitre" id={id + 'Titre'}>Quelle formalité pour ce projet ?</div>
      <p className="formaliteReponse"><b>{LIBELLE_FORMALITE[i.formalite]}</b>{(i.formalite === 'a-verifier' ? ' : ' : ', ') + SUITE[i.formalite]}</p>
      {i.ouvrages === 0 && <div className="hint">Le plan ne porte ni abri, ni terrasse, ni bassin du projet : rien à déclarer d’après ce qu’il sait.</div>}
      {i.raisons.length > 0 && <ul className="formaliteRaisons">
        {i.raisons.map((r) => <li key={r.cle} data-raison={r.cle} data-formalite={r.formalite}>{r.texte}</li>)}
      </ul>}
      {i.reserves.map((r, n) => <div key={n} className="hint formaliteReserve">{r}</div>)}
      {note && <div className="hint formaliteNote">{note}</div>}
      <div className="hint formaliteFoi">C’est une indication, pas une autorisation : le PLU de la commune et la mairie font foi.</div>
    </section>
  );
}
