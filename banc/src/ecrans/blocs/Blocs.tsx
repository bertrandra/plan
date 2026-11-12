// Etape 7 : les blocs d'apprentissage. Le tirage (graine et parts) range chaque photo corrigee en train, val ou test ; on peut le figer,
// ou poser un bloc a la main (la reserve n'est jamais exportee). Un echantillon de chaque bloc est tire pour etre verifie : chaque photo
// relue s'y marque « verifiee », et l'export peut ne prendre que celles-la. En haut, le geste qui attend (repartir, verifier) ; au milieu,
// le bilan ; en bas, chaque type appris et sa jauge vers les trente objets d'entrainement.

import { useState } from 'react';
import type { Banc } from '../../App.js';
import { manquesDuNom, OBJETS_TRAIN_MIN, type CompteNom } from '../../blocs.js';
import { cibleDuNom, libelleDe, nomsYolo } from '../../classes.js';
import type { Reglages } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Page, Section, Tuile, Tuiles, Vide } from '../../ui/Page.js';
import { useBlocs } from './useBlocs.js';

const BLOCS = ['train', 'val', 'test', 'reserve'] as const;

export function EcranBlocs({ banc, onReglages }: { banc: Banc; onReglages: (r: Reglages) => void }) {
  const c = useBlocs(banc, onReglages);
  const occupe = !!c.etat;
  return (
    <Page icone="blocs" numero="7" titre="Blocs et vérification"
      aide={<p>Le tirage est reproductible : la même graine range toujours une photo dans le même bloc (le serveur fait le même tirage à l’export). Changer la graine ou les parts déplace les photos sans bloc figé. Relisez chaque photo de l’échantillon et validez-la (<kbd>Entrée</kbd> dans l’éditeur) : c’est le contrôle de la qualité du marquage de chaque bloc.</p>}
      actions={<>
        {c.etat && <span className="etat">{c.etat}</span>}
        <button type="button" disabled={occupe || !c.corrigees.length} onClick={() => { void c.tirer(); }}><Icone nom="auto" /> Tirer l’échantillon</button>
        {c.aVerifier.length > 0 && <button type="button" onClick={() => banc.ouvrir(c.aVerifier[0]?.id ?? '', c.aVerifier.map((m) => m.id))}><Icone nom="valider" /> Vérifier l’échantillon ({c.aVerifier.length})</button>}
        <button type="button" className={c.sansBloc ? 'principal' : ''} disabled={occupe || !c.sansBloc} onClick={() => { void c.repartir(false); }}><Icone nom="blocs" /> Répartir {c.sansBloc ? `les ${c.sansBloc} nouvelle(s)` : 'les nouvelles'}</button>
      </>}>
      {!c.corrigees.length ? (
        <Vide icone="blocs" titre="Aucune photo corrigée" texte="Les blocs rangent les photos dont le marquage a été relu et enregistré."
          action={<button type="button" className="principal" onClick={() => banc.aller('catalogue')}>Aller au marquage</button>} />
      ) : <>
        <Tuiles>
          {BLOCS.map((b) => { const x = c.bilan?.[b]; const manque = x ? x.echantillon - x.echantillonVerifie : 0; return (
            <Tuile key={b} valeur={x?.images ?? '…'} libelle={b === 'reserve' ? 'réserve' : b} ton={b === 'reserve' ? undefined : manque > 0 ? 'attention' : 'accent'}
              detail={b === 'reserve' ? 'jamais exportée' : `échantillon ${x?.echantillonVerifie ?? 0} / ${x?.echantillon ?? 0} vérifié`} />
          ); })}
          {c.sansBloc > 0 && <Tuile valeur={c.sansBloc} libelle="sans bloc" ton="attention" detail="à répartir" />}
        </Tuiles>
        <ParNom banc={banc} parNom={c.parNom} />
      </>}
      <Section titre="Réglages du tirage" repliable ouverte={c.modifie}
        actions={c.modifie && <span className="puce attention">non enregistré</span>}>
        <div className="reglages-blocs">
          <label>Graine <input value={c.r.graine} onChange={(e) => c.setR({ ...c.r, graine: e.target.value })} /></label>
          {(['train', 'val', 'test'] as const).map((k) => <label key={k}>{k} <span className="unite"><input type="number" min={0} max={100} value={Math.round(c.r.parts[k] * 100)} onChange={(e) => c.part(k, e.target.value)} />%</span></label>)}
          <label>Échantillon <span className="unite"><input type="number" min={1} max={100} value={Math.round(c.r.echantillonPart * 100)} onChange={(e) => c.setR({ ...c.r, echantillonPart: Number(e.target.value) / 100 })} />% par bloc</span></label>
        </div>
        <div className="rang">
          <button type="button" className="principal" disabled={!c.modifie} onClick={() => { void c.enregistrer(); }}>Enregistrer</button>
          {c.modifie && <button type="button" className="discret" onClick={c.annuler}>Annuler</button>}
          <span className="espace" />
          <button type="button" className="danger" disabled={occupe} onClick={() => { void c.repartir(true); }}>Tout répartir de nouveau</button>
        </div>
      </Section>
    </Page>
  );
}

/** Par nom YOLO : ses objets dans train, val et test, une jauge vers le minimum d'entrainement, et ce qui lui manque. */
function ParNom({ banc, parNom }: { banc: Banc; parNom: Map<string, Record<'train' | 'val' | 'test', CompteNom>> | null }) {
  const [tous, setTous] = useState(false);
  const noms = nomsYolo(banc.classes);
  const avecExemples = noms.filter((n) => { const k = parNom?.get(n); return !!k && k.train.objets + k.val.objets + k.test.objets > 0; });
  const prets = parNom ? noms.filter((n) => !manquesDuNom(parNom.get(n)).length).length : 0;
  const aQualifier = banc.images.reduce((s, m) => s + (m.statut === 'corrigee' ? m.aQualifier ?? 0 : 0), 0);
  const montres = tous ? noms : avecExemples;
  return (
    <Section titre="Par type appris" compte={`${prets} prêt(s) sur ${noms.length}`}
      actions={noms.length > avecExemples.length && <button type="button" className="discret" onClick={() => setTous((x) => !x)}>{tous ? 'Seulement ceux qui ont des exemples' : `Montrer les ${noms.length - avecExemples.length} sans exemple`}</button>}>
      <p className="aide">Un type s’apprend quand il a assez d’exemples en train ({OBJETS_TRAIN_MIN} objets), et se mesure seulement s’il en a en val et en test.{aQualifier ? ` ${aQualifier} objet(s) restent à qualifier (sans type) : ils n’entrent pas dans le jeu.` : ''}</p>
      {montres.length ? (
        <table className="tableau tableau-types">
          <thead><tr><th>Type</th><th>train</th><th className="col-jauge" /><th>val</th><th>test</th><th>Pour l’apprentissage</th></tr></thead>
          <tbody>{montres.map((n) => {
            const k = parNom?.get(n), manque = manquesDuNom(k), cible = cibleDuNom(n, banc.classes), cl = banc.classes.find((x) => x.id === cible?.classe);
            return <tr key={n}><td><span className="pastille" style={{ background: cl?.couleur ?? '#999' }} /> {cible ? libelleDe(cible, banc.classes) : n} <small><code>{n}</code></small></td>
              <td className="nombre">{k?.train.objets ?? 0}</td><td className="col-jauge"><Jauge valeur={k?.train.objets ?? 0} cible={OBJETS_TRAIN_MIN} titre={`${k?.train.objets ?? 0} / ${OBJETS_TRAIN_MIN} en train`} /></td>
              <td className="nombre">{k?.val.objets ?? 0}</td><td className="nombre">{k?.test.objets ?? 0}</td>
              <td className={manque.length ? 'attention' : 'ok'}>{manque.length ? manque.join(' ; ') : <><Icone nom="valider" taille={14} /> prêt</>}</td></tr>;
          })}</tbody>
        </table>
      ) : <p className="aide">Aucun type n’a encore d’exemple dans un bloc : répartissez les photos corrigées.</p>}
    </Section>
  );
}
