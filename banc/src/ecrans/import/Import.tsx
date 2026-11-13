// Etape 1 : capturer des images. 1a, les photos de l'iPhone (ou de tout appareil), leur EXIF garde, choisies ou glissees sur la zone de
// depot ; 1b, les photos de rue Panoramax prises autour d'une adresse, par lot, un panoramique 360 ramene a la vue tournee vers l'adresse.

import { useState, type DragEvent } from 'react';
import type { Banc } from '../../App.js';
import { COTE_SOURCE } from '../../images.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Page, Section, Segments } from '../../ui/Page.js';
import { ImportPanoramax } from './ImportPanoramax.js';
import { useImport } from './useImport.js';

export { nomDuLot } from './useImport.js';

export function EcranImport({ banc }: { banc: Banc }) {
  const [source, setSource] = useState<'fichiers' | 'panoramax'>('fichiers');
  const aRedresser = banc.images.filter((m) => m.statut === 'importee').length;
  return (
    <Page icone="importer" numero="1" titre="Import" large
      aide={<p>Les photos de l’iPhone (ou de tout appareil) gardent leur EXIF : position, date, cap et focale ; le grand côté est ramené à {COTE_SOURCE} px. Panoramax donne les photos de rue libres prises autour d’une adresse, chacune avec sa licence.</p>}
      actions={aRedresser > 0 && <button type="button" className="principal" onClick={() => banc.aller('redressement')}>Redresser les {aRedresser} photo(s) <Icone nom="suivant" /></button>}>
      <div className="barre-outils">
        <Segments label="Source" valeur={source} onChange={setSource} options={[{ valeur: 'fichiers', libelle: 'Photos de l’appareil' }, { valeur: 'panoramax', libelle: 'Panoramax autour d’une adresse' }]} />
      </div>
      {/* Les deux restent montes : passer de l'un a l'autre ne perd ni la recherche Panoramax ni le journal. */}
      <div hidden={source !== 'fichiers'}><ImportFichiers banc={banc} /></div>
      <div hidden={source !== 'panoramax'}><Section titre="Panoramax autour d’une adresse"><ImportPanoramax banc={banc} /></Section></div>
    </Page>
  );
}

function ImportFichiers({ banc }: { banc: Banc }) {
  const c = useImport(banc);
  const [survol, setSurvol] = useState(false);
  const deposer = (e: DragEvent) => { e.preventDefault(); setSurvol(false); if (!c.avance) void c.importer(Array.from(e.dataTransfer.files)); };
  const ok = c.journal.filter((l) => l.ok).length;
  return (
    <Section titre="Photos de l’appareil">
      {/* Au telephone : l'appareil photo s'ouvre directement (capture), la photo prise s'importe aussitot ; on en reprend une autre d'un
          geste. Sur un ordinateur, la zone de depot suffit. */}
      <label className={'bouton principal prendre-photo' + (c.avance ? ' occupe' : '')}>
        <Icone nom="appareil" taille={22} /> Prendre une photo
        <input type="file" accept="image/*" capture="environment" hidden disabled={!!c.avance} onChange={(e) => { void c.importer(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      <label className={'zone-depot' + (survol ? ' survol' : '') + (c.avance ? ' occupe' : '')}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)} onDrop={deposer}>
        <span className="icone-depot"><Icone nom="importer" taille={30} /></span>
        {c.avance ? <>
          <strong>Import {c.avance.fait + 1} sur {c.avance.total}…</strong>
          <Jauge valeur={c.avance.fait} cible={c.avance.total} />
        </> : <>
          <strong>Glissez des photos ici</strong>
          <span>ou <u>choisissez-les</u> dans la photothèque (l’iPhone les envoie en JPEG)</span>
        </>}
        <input type="file" accept="image/*" multiple hidden disabled={!!c.avance} onChange={(e) => { void c.importer(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      {c.journal.length > 0 && (
        <div className="journal-import">
          <div className="rang"><strong>{ok} importée(s){c.journal.length - ok ? `, ${c.journal.length - ok} en erreur` : ''}</strong><span className="espace" /><button type="button" className="discret" onClick={c.effacerJournal}>Effacer</button></div>
          <ul className="journal">{c.journal.map((l, i) => <li key={i} className={l.ok ? 'ok' : 'erreur'}><Icone nom={l.ok ? 'valider' : 'rejeter'} taille={14} /> {l.nom}{l.detail ? <small> · {l.detail}</small> : null}</li>)}</ul>
        </div>
      )}
    </Section>
  );
}
