// Etape 7 : les blocs d'apprentissage. Le tirage (graine et parts) range chaque photo corrigee en train, val ou test ; on peut le figer,
// ou poser un bloc a la main (la reserve n'est jamais exportee). Un echantillon de chaque bloc est tire pour etre verifie : chaque photo
// relue s'y marque « verifiee », et l'export peut ne prendre que celles-la.

import { useEffect, useState } from 'react';
import type { Banc } from '../App.js';
import { api } from '../api.js';
import { bilanDesBlocs, comptesParNom, dansLEchantillon, manquesDuNom, partsValables, repartirStratifie, type BilanBloc, type CompteNom } from '../blocs.js';
import { libelleDe, nomsYolo, cibleDuNom } from '../classes.js';
import type { Reglages } from '../types.js';

export function EcranBlocs({ banc, onReglages }: { banc: Banc; onReglages: (r: Reglages) => void }) {
  const [r, setR] = useState<Reglages>(banc.reglages);
  const [bilan, setBilan] = useState<Record<string, BilanBloc> | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  useEffect(() => setR(banc.reglages), [banc.reglages]);
  useEffect(() => { bilanDesBlocs(banc.reglages, banc.images).then(setBilan).catch(() => setBilan(null)); }, [banc.reglages, banc.images]);
  const corrigees = banc.images.filter((m) => m.statut === 'corrigee');
  const aVerifier = corrigees.filter((m) => m.echantillon && !m.verifiee);

  const enregistrer = async () => {
    if (!partsValables(r.parts)) { banc.dire('Les parts doivent faire 1 en tout, val et test non nulles.', 'erreur'); return; }
    try { onReglages(await api.ecrireReglages(r)); banc.dire('Blocs enregistrés.'); } catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };
  // La repartition stratifiee : les photos corrigees sans bloc (ou toutes, hors reserve, si on repart de zero) rangees pour que chaque
  // nom YOLO ait sa part dans train, val et test.
  const repartir = async (deZero: boolean) => {
    if (deZero && !confirm('Répartir de nouveau toutes les photos corrigées (hors réserve) ? Les blocs posés à la main sont remplacés.')) return;
    const l = corrigees.map((m) => (deZero && m.bloc !== 'reserve' ? { ...m, bloc: '' as const } : m));
    const blocs = await repartirStratifie(banc.reglages, l);
    let n = 0;
    for (const [id, bloc] of blocs) {
      const m = corrigees.find((x) => x.id === id);
      if (!m || m.bloc === bloc) continue;
      setEtat(`Bloc ${++n}…`);
      banc.remplacer(await api.modifier(id, { bloc }));
    }
    setEtat(`${blocs.size} photo(s) réparties, ${n} changée(s).`);
  };
  const tirer = async () => {
    let n = 0, dedans = 0;
    for (const m of corrigees) {
      const e = await dansLEchantillon(banc.reglages, m.id);
      if (e) dedans++;
      if (!!m.echantillon !== e) { setEtat(`Échantillon ${++n}…`); banc.remplacer(await api.modifier(m.id, { echantillon: e })); }
    }
    setEtat(`Échantillon : ${dedans} photo(s) sur ${corrigees.length} à vérifier.`);
  };
  const part = (k: keyof Reglages['parts'], v: string) => setR({ ...r, parts: { ...r.parts, [k]: Number(v) / 100 } });
  return (
    <section className="pile-large">
      <div className="panneau">
        <h2>7 · Blocs d’apprentissage et vérification</h2>
        <p className="aide">Le tirage est reproductible : la même graine range toujours une photo dans le même bloc (le serveur fait le même tirage à l’export). Changer la graine ou les parts déplace les photos sans bloc figé.</p>
        <div className="rang">
          <label>Graine <input value={r.graine} onChange={(e) => setR({ ...r, graine: e.target.value })} /></label>
          <label>train <input type="number" min={0} max={100} value={Math.round(r.parts.train * 100)} onChange={(e) => part('train', e.target.value)} /> %</label>
          <label>val <input type="number" min={0} max={100} value={Math.round(r.parts.val * 100)} onChange={(e) => part('val', e.target.value)} /> %</label>
          <label>test <input type="number" min={0} max={100} value={Math.round(r.parts.test * 100)} onChange={(e) => part('test', e.target.value)} /> %</label>
          <label>Échantillon à vérifier <input type="number" min={1} max={100} value={Math.round(r.echantillonPart * 100)} onChange={(e) => setR({ ...r, echantillonPart: Number(e.target.value) / 100 })} /> % de chaque bloc</label>
          <button type="button" className="principal" onClick={() => { void enregistrer(); }}>Enregistrer</button>
        </div>
        <div className="rang">
          <button type="button" className="principal" onClick={() => { void repartir(false); }}>Répartir les nouvelles photos (stratifié par type)</button>
          <button type="button" onClick={() => { void repartir(true); }}>Tout répartir de nouveau</button>
          <button type="button" onClick={() => { void tirer(); }}>Tirer l’échantillon à vérifier</button>
          {etat && <span className="etat">{etat}</span>}
        </div>
      </div>
      {bilan && (
        <div className="panneau">
          <h3>Bilan des blocs</h3>
          <table className="tableau">
            <thead><tr><th>Bloc</th><th>Photos corrigées</th><th>Vérifiées</th><th>Échantillon vérifié</th><th>Photos par classe</th></tr></thead>
            <tbody>{(['train', 'val', 'test', 'reserve'] as const).map((b) => {
              const x = bilan[b];
              return <tr key={b}><td>{b === 'reserve' ? 'réserve' : b}</td><td>{x?.images ?? 0}</td><td>{x?.verifiees ?? 0}</td>
                <td className={x && x.echantillon > x.echantillonVerifie ? 'attention' : ''}>{x?.echantillonVerifie ?? 0} / {x?.echantillon ?? 0}</td>
                <td>{Object.entries(x?.objets ?? {}).map(([c, n]) => `${banc.classes.find((k) => k.id === c)?.nom ?? c} ${n}`).join(' · ')}</td></tr>;
            })}</tbody>
          </table>
          <p className="aide">« Photos par classe » : le nombre de photos où la classe apparaît. Une classe absente de val ou de test ne se mesure pas.</p>
        </div>
      )}
      <ParNom banc={banc} />
      <div className="panneau">
        <h3>Échantillon à vérifier ({aVerifier.length})</h3>
        <p className="aide">Relisez chaque photo de l’échantillon dans l’éditeur et cochez « Vérifiée » : c’est le contrôle de la qualité du marquage de chaque bloc.</p>
        <div className="rang"><button type="button" className="principal" disabled={!aVerifier.length} onClick={() => banc.ouvrir(aVerifier[0]?.id ?? '', aVerifier.map((m) => m.id))}>Vérifier l’échantillon</button></div>
      </div>
    </section>
  );
}

/** Par nom YOLO : ses objets dans train, val et test, et ce qui lui manque pour s'apprendre. */
function ParNom({ banc }: { banc: Banc }) {
  const [c, setC] = useState<Map<string, Record<'train' | 'val' | 'test', CompteNom>> | null>(null);
  useEffect(() => { comptesParNom(banc.reglages, banc.images).then(setC).catch(() => setC(null)); }, [banc.reglages, banc.images]);
  const noms = nomsYolo(banc.classes);
  const prets = c ? noms.filter((n) => !manquesDuNom(c.get(n)).length).length : 0;
  const aQualifier = banc.images.reduce((s, m) => s + (m.statut === 'corrigee' ? m.aQualifier ?? 0 : 0), 0);
  return (
    <div className="panneau">
      <h3>Par type appris ({prets} prêt(s) sur {noms.length})</h3>
      <p className="aide">Objets marqués par bloc. Un type s’apprend quand il a assez d’exemples en train, et se mesure seulement s’il en a en val et en test.{aQualifier ? ` ${aQualifier} objet(s) restent à qualifier (sans type) : ils n’entrent pas dans le jeu.` : ''}</p>
      <table className="tableau">
        <thead><tr><th>#</th><th>Nom</th><th>train</th><th>val</th><th>test</th><th>Pour l’apprentissage</th></tr></thead>
        <tbody>{noms.map((n, i) => {
          const k = c?.get(n), manque = manquesDuNom(k), cible = cibleDuNom(n, banc.classes);
          return <tr key={n}><td>{i}</td><td><code>{n}</code> <small>{cible ? libelleDe(cible, banc.classes) : ''}</small></td>
            <td>{k?.train.objets ?? 0}</td><td>{k?.val.objets ?? 0}</td><td>{k?.test.objets ?? 0}</td>
            <td className={manque.length ? 'attention' : 'ok'}>{manque.length ? manque.join(' ; ') : 'prêt'}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}
