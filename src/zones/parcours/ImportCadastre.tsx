// Z8, l'import cadastral depuis une adresse : les trois etapes, et l'apercu des parcelles.
//
// L'etat et les gestes sont dans app/importCadastre.ts ; ce composant les dessine et s'abonne a leurs
// changements. Le champ d'adresse garde le focus pendant la frappe : seules les suggestions se
// redessinent sous lui.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { centroid } from '../../geometry/basic.js';
import { libelleParcelle } from '../../geo/bdtopo.js';
import { ECART_AUTO_M, MAX_OBJETS_RAYON, RAYON_ETENDU_MAX_M, RAYON_ETENDU_MIN_M, RAYON_ETENDU_PAS_M, RAYON_LEGER_M, rayonDeLecture } from '../../geo/apiIgn.js';
import { AVERTISSEMENT_RAYON } from './avertissementRayon.js';
import { MAX_VOISINES } from '../../geo/constantesCadastre.js';
import type { Candidate } from '../../geo/apiIgn.js';
import type { CaseIgn, EtatPosition, ImportCadastre as Controleur } from '../../app/importCadastre.js';
import type { PtBrut } from '../../model/types.js';

type Props = { importe: Controleur };

/** Un bouton du parcours ; `controle` est sa cle dans le catalogue (app/controlesInterface.ts). */
function Bouton({ controle, principal, onClick, children, disabled }: { controle: string; principal?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" data-controle={controle} className={principal ? undefined : 'secondary'} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** L'apercu : la propriete (fusionnee s'il le faut), les voisines, les couches BD TOPO, le point d'adresse. */
function Apercu({ importe }: Props) {
  const e = importe.etat();
  if (!e.principale) return null;
  const { lots, limitesInternes, couches, etendu } = importe.apercu();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  lots.forEach(l => l.pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }));
  // Le voisinage etendu affiche : l'apercu cadre tout le disque, sinon on n'en verrait qu'un coin.
  if (etendu) {
    minX = Math.min(minX, etendu.centre.x - etendu.rayonM); maxX = Math.max(maxX, etendu.centre.x + etendu.rayonM);
    minY = Math.min(minY, etendu.centre.y - etendu.rayonM); maxY = Math.max(maxY, etendu.centre.y + etendu.rayonM);
  }
  const marge = Math.max(2, (maxX - minX + maxY - minY) * 0.03);
  minX -= marge; maxX += marge; minY -= marge; maxY += marge;
  const w = maxX - minX, h = maxY - minY;
  const trait = Math.max(0.08, w / 500);
  const points = (pts: PtBrut[]) => pts.map(p => (p.x - minX).toFixed(3) + ',' + (maxY - p.y).toFixed(3)).join(' ');
  const retenues = new Set([e.principale.idu].concat(importe.voisinesRetenues().map(v => v.idu)));
  const cliquer = (c: Candidate) => {
    if (e.etape === 2) void importe.choisirPrincipale(c);
    else if (c.idu !== e.principale?.idu) importe.basculerVoisine(c);
  };
  const cliquable = (c: Candidate | undefined) => c ? () => cliquer(c) : undefined;
  return (
    <svg viewBox={'0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2)} className="apercuCadastre" role="img" aria-label="Aperçu des parcelles">
      {/* Le voisinage etendu, sous tout le reste et non cliquable : un decor, borde par son disque. */}
      {etendu && <g pointerEvents="none">
        {etendu.parcelles.map((pts, i) => <polygon key={'ep' + i} points={points(pts)} fill="none" stroke="#b8ad98" strokeWidth={(trait * 0.6).toFixed(3)} />)}
        {etendu.batiments.map((pts, i) => <polygon key={'eb' + i} points={points(pts)} fill="#CFC3B4" fillOpacity={0.6} stroke="#8A7B63" strokeWidth={(trait * 0.5).toFixed(3)} />)}
        <circle cx={(etendu.centre.x - minX).toFixed(2)} cy={(maxY - etendu.centre.y).toFixed(2)} r={etendu.rayonM.toFixed(2)} fill="none" stroke="#7A5C31"
          strokeWidth={(trait * 1.2).toFixed(3)} strokeDasharray={(trait * 6).toFixed(2) + ' ' + (trait * 4).toFixed(2)} />
      </g>}
      {lots.slice().reverse().map(l => {
        const survole = e.survol === l.idu;
        const style = l.role === 'principale' ? { fill: '#FBF3D9', stroke: '#3B2E1F' }
          : l.role === 'retenue' ? { fill: '#EDE3CB', stroke: '#8A7B63' }
          : { fill: 'transparent', stroke: '#9a9a9a', strokeDasharray: (trait * 4).toFixed(2) + ' ' + (trait * 3).toFixed(2) };
        const c = centroid(l.pts);
        return (
          <g key={l.idu}>
            <polygon points={points(l.pts)} {...style} strokeWidth={(survole ? trait * 2.2 : trait).toFixed(3)}
              style={l.cliquable ? { cursor: 'pointer' } : undefined}
              onMouseEnter={l.cliquable ? () => importe.survoler(l.idu) : undefined}
              onMouseLeave={l.cliquable ? () => { if (e.survol === l.idu) importe.survoler(null); } : undefined}
              onClick={cliquable(l.candidate)} />
            <text x={(c.x - minX).toFixed(2)} y={(maxY - c.y).toFixed(2)} textAnchor="middle" fontSize={Math.max(0.9, w / 40).toFixed(2)} fill="#3B2E1F" pointerEvents="none">{l.libelle}</text>
          </g>
        );
      })}
      {/* Limites internes de la propriete, en pointille : elles disparaissent comme limite de terrain
          mais restent tracees, exactement comme dans le plan produit. */}
      {limitesInternes.map((chaine, i) => (
        <polyline key={'li' + i} points={points(chaine)} fill="none" stroke="#8A7B63" strokeWidth={(trait * 1.1).toFixed(3)}
          strokeDasharray={(trait * 5).toFixed(2) + ' ' + (trait * 4).toFixed(2)} pointerEvents="none" />
      ))}
      {couches.map((couche, ci) => couche.elements.map((el, i) => {
        const retenu = couche.actif && [...el.parcelles].some(idu => retenues.has(idu));
        return <polygon key={'c' + ci + '-' + i} points={points(el.pts)} fill={retenu ? couche.remplissage : 'none'} fillOpacity={retenu ? couche.opacite : 0}
          stroke={retenu ? couche.contour : '#b0b0b0'} strokeWidth={(retenu ? trait : trait * 0.7).toFixed(3)}
          strokeDasharray={retenu ? undefined : (trait * 2).toFixed(2) + ' ' + (trait * 2).toFixed(2)} pointerEvents="none" />;
      }))}
      {/* Le point d'adresse, souvent hors de toute parcelle : le montrer evite de croire a un bug. */}
      <circle cx={(0 - minX).toFixed(3)} cy={(maxY - 0).toFixed(3)} r={Math.max(0.4, w / 120).toFixed(3)} fill="#a02020" pointerEvents="none" />
    </svg>
  );
}

/** Ce que la ligne d'etat dit de la position de l'appareil ; vide quand il n'y a rien a dire. */
function texteDePosition(p: EtatPosition): string {
  const aPres = p.precisionM !== null ? ' (à ' + p.precisionM + ' m près)' : '';
  switch (p.etat) {
    case 'demande': return 'Recherche de votre position…';
    case 'trouvee': return 'Votre position' + aPres + ' : la parcelle sous vos pieds est cherchée.';
    case 'approximative': return 'Position approximative' + aPres + ' : vérifiez l’adresse proposée, puis Rechercher.';
    case 'refusee': return 'Position refusée par le navigateur : autorisez-la dans ses réglages, ou saisissez l’adresse.';
    case 'indisponible': return 'Position indisponible sur cet appareil : saisissez l’adresse.';
    default: return '';
  }
}

function Etape1({ importe }: Props) {
  const e = importe.etat();
  const [texte, setTexte] = useState('');
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus(); }, []);
  // L'adresse la plus proche de la position, recopiee dans le champ tant qu'on n'y a rien tape.
  const { etat: etatPosition, adresse: adressePosition } = e.position;
  useEffect(() => {
    if ((etatPosition === 'trouvee' || etatPosition === 'approximative') && adressePosition && !e.saisie) setTexte(adressePosition);
  }, [etatPosition, adressePosition, e.saisie]);
  const position = texteDePosition(e.position);
  return (
    <>
      <div className="corpsParcours">
        <div className="libelleChamp ligneAdresse">
          <span>Adresse du terrain (ou coordonnees « latitude, longitude ») :</span>
          {importe.positionDisponible() && (
            <button type="button" data-controle="cadastre.maPosition" className="secondary small" disabled={e.occupe || e.position.etat === 'demande'}
              title="Cherche la parcelle sous la position de cet appareil (GPS du téléphone, ou réseau). Le navigateur demande d’abord la permission."
              onClick={() => void importe.utiliserMaPosition(false)}>
              Utiliser ma position
            </button>
          )}
        </div>
        <input ref={champ} type="text" data-controle="cadastre.adresse" className="promptInput" placeholder="2 allee des Limites 78110 Le Vesinet" value={texte}
          onChange={(ev) => { setTexte(ev.target.value); importe.saisirAdresse(ev.target.value); }}
          onKeyDown={(ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            const suggestion = e.suggestions[0];
            if (suggestion) void importe.choisirAdresse(suggestion);
            else void importe.rechercher(texte.trim());
          }} />
        {position && <div className="detailIgn" role="status">{position}</div>}
        <div className="suggestionsAdresse">
          {e.suggestions.map((s, i) => (
            <button key={i} type="button" data-controle="cadastre.suggestion" className="secondary" onClick={() => void importe.choisirAdresse(s)}>
              {s.label + (s.genre && s.genre !== 'housenumber' ? '  (niveau ' + s.genre + ')' : '')}
            </button>
          ))}
        </div>
        <label className="caseParcours" title="Crée le plan dès la parcelle trouvée, sans les étapes 2 (choix de la parcelle) et 3 (voisines, données IGN) : la parcelle sous l’adresse, les bâtiments et la végétation qui la touchent, et le voisinage étendu s’il est coché. Le résumé dit ce qui arrivera avant de créer.">
          <input type="checkbox" data-controle="cadastre.importDirect" checked={e.importDirect} onChange={(ev) => importe.basculerImportDirect(ev.target.checked)} />
          Import direct, sans les étapes 2 et 3
        </label>
        {e.importDirect && <ReglageVoisinage importe={importe} />}
        {e.importDirect && e.resumePret && <ResumeDirect importe={importe} />}
      </div>
      <Pied importe={importe}>
        <Bouton controle="cadastre.annuler" onClick={importe.fermer}>Annuler</Bouton>
        {e.importDirect && e.resumePret
          ? <>
              <Bouton controle="cadastre.ajuster" onClick={() => importe.allerA(2)}>Ajuster (étapes 2 et 3)</Bouton>
              <Bouton controle="cadastre.creerDirect" principal onClick={() => void importe.creerProjet(importe.nomParDefaut())}>{importe.projetCible() ? 'Remplir le projet' : 'Créer le projet'}</Bouton>
            </>
          : <Bouton controle="cadastre.rechercher" principal onClick={() => void importe.rechercher(texte.trim())}>Rechercher</Bouton>}
      </Pied>
    </>
  );
}

/** Le resume de l'import direct : la parcelle trouvee et ce qui arrivera dans le plan, avant de creer. */
function ResumeDirect({ importe }: Props) {
  const e = importe.etat();
  const p = e.principale;
  if (!p) return null;
  const n = (liste: Parameters<typeof importe.elementsRetenus>[0], actif: boolean) => (actif ? importe.elementsRetenus(liste).length : 0);
  return (
    <>
      <Apercu importe={importe} />
      <div className="infoParcelle" role="status">
        <b>{'Parcelle ' + libelleParcelle(p)}</b>{' — ' + (p.commune || '') + ' — ' + importe.ligneSurface(p)}<br />
        {'Sur la parcelle : ' + n(e.batiments, e.importerBatiments) + ' bâtiment(s), ' + (n(e.haies, e.importerHaies) + n(e.vegetation, e.importerVegetation)) + ' haie(s) et zone(s) de végétation.'}
        {e.plu?.zones?.[0] && <><br />{'PLU : zone ' + e.plu.zones[0].libelle}</>}
        {importe.reliefPermis() && <><br />{e.importerRelief ? 'Relief : lu à la création, ' + (e.reliefToutesParcelles ? 'sur toutes les parcelles.' : 'sur la parcelle du projet.') : 'Relief : non lu.'}</>}
      </div>
    </>
  );
}

function Etape2({ importe }: Props) {
  const e = importe.etat();
  // L'etape 2 ne s'ouvre qu'une parcelle choisie et l'adresse geocodee : sans elles, rien a montrer.
  const { principale: p, geo } = e;
  if (!p || !geo) return null;
  const [premier, second] = e.candidats;
  const ecartAuto = premier && second ? second.distance - premier.distance : Infinity;
  return (
    <>
      <div className="corpsParcours">
        <Apercu importe={importe} />
        <div className="infoParcelle">
          <b>{'Parcelle ' + libelleParcelle(p)}</b>{' — ' + (p.commune || '') + ' (INSEE ' + (p.codeInsee || '') + ')'}<br />
          {'Surface : ' + importe.ligneSurface(p)}<br />
          {(geo.genre === 'position' ? 'Adresse la plus proche : ' : 'Adresse : ') + geo.label}<br />
          {/* Le point d'une position est celui de l'appareil, pas un point d'adresse pose sur la voirie. */}
          {geo.genre === 'position'
            ? 'Votre position' + (e.position.precisionM !== null ? ' (à ' + e.position.precisionM + ' m près)' : '') + ' : ' + (p.dedans ? 'dans la parcelle' : 'à ' + p.distance.toFixed(2) + ' m du bord')
            : 'Point d\'adresse : ' + (p.dedans ? 'dans la parcelle' : 'a ' + p.distance.toFixed(2) + ' m du bord (il est pose devant la porte, sur la voirie)')}
          {geo.genre && geo.genre !== 'housenumber' && geo.genre !== 'coordonnees' && geo.genre !== 'position' && <><br /><i>{'Adresse resolue au niveau ' + geo.genre + ' : la parcelle proposee est approximative.'}</i></>}
          {ecartAuto < ECART_AUTO_M && <><br /><i>Plusieurs parcelles sont a distance comparable : verifie le choix ci-dessous.</i></>}
        </div>
        <div className="titreListe">Autre parcelle ? (clic sur l'apercu ou dans la liste)</div>
        <div className="listeParcelles">
          {e.candidats.map(c => (
            <button key={c.idu} type="button" data-controle="cadastre.parcelle" className={c.idu === p.idu ? undefined : 'secondary'}
              onMouseEnter={() => importe.survoler(c.idu)} onMouseLeave={() => importe.survoler(null)}
              onClick={() => void importe.choisirPrincipale(c)}>
              {libelleParcelle(c) + ' — ' + importe.ligneSurface(c) + ' — ' + c.distance.toFixed(2) + ' m de l\'adresse'}
            </button>
          ))}
        </div>
        <label className="caseParcours">
          <input type="checkbox" data-controle="cadastre.simplifier" checked={e.simplifier} onChange={(ev) => importe.basculerSimplifier(ev.target.checked)} />
          Simplifier les contours (sommets alignes a moins de 2 cm)
        </label>
      </div>
      <Pied importe={importe}>
        <Bouton controle="cadastre.annuler" onClick={importe.fermer}>Annuler</Bouton>
        <Bouton controle="cadastre.changerAdresse" onClick={() => importe.allerA(1)}>← Changer d'adresse</Bouton>
        <Bouton controle="cadastre.voisines" principal onClick={() => importe.allerA(3)}>Parcelles voisines →</Bouton>
      </Pied>
    </>
  );
}

/** Une voisine : « propriete » la fusionne a la principale, « importer » la pose en decor de reference. */
function LigneVoisine({ importe, c }: Props & { c: Candidate }) {
  const e = importe.etat();
  const prop = e.propriete.has(c.idu);
  return (
    <div className={'ligneVoisine' + (e.survol === c.idu ? ' survolee' : '')}
      onMouseEnter={() => importe.survoler(c.idu)} onMouseLeave={() => { if (e.survol === c.idu) importe.survoler(null); }}>
      <label title="Cette parcelle fait partie de la propriete : elle sera fusionnee avec la parcelle principale, sa limite interne restant en pointille.">
        <input type="checkbox" data-controle="cadastre.propriete" checked={prop} onChange={() => importe.basculerPropriete(c)} /> propriété
      </label>
      <label title="Importer cette parcelle comme voisine, en decor de reference.">
        <input type="checkbox" data-controle="cadastre.importerVoisine" checked={e.selection.has(c.idu) || prop} disabled={prop} onChange={() => importe.basculerVoisine(c)} /> importer
      </label>
      <span className="texteVoisine" onClick={() => importe.basculerVoisine(c)}>
        {libelleParcelle(c) + ' — ' + importe.ligneSurface(c) + (c.frontiere ? ' — ' + c.frontiere.toFixed(1) + ' m de limite commune' : ' — a ' + (c.distancePrincipale || 0).toFixed(1) + ' m')}
      </span>
      {/* Permuter la principale sans repasser par l'etape 2 : c'est ici qu'on voit le voisinage en
          entier, donc ici qu'on se rend compte qu'on a designe la mauvaise parcelle. */}
      <button type="button" data-controle="cadastre.principale" className="secondary petitBouton"
        title="En faire la parcelle principale : celle qui porte l'adresse, l'origine du plan et le zonage PLU. L'actuelle redevient une voisine."
        onClick={(ev) => { ev.stopPropagation(); void importe.choisirPrincipale(c); }}>↑ principale</button>
    </div>
  );
}

function DonneesIgn({ importe }: Props) {
  const e = importe.etat();
  const ligne = (cle: CaseIgn, libelle: string, n: number, titre: string) => (
    <label className={'caseParcours' + (n === 0 ? ' vide' : '')} title={titre}>
      <input type="checkbox" data-controle="cadastre.coucheIgn" checked={e[cle]} disabled={n === 0} onChange={(ev) => importe.basculerCaseIgn(cle, ev.target.checked)} />
      {libelle + ' — ' + n}
    </label>
  );
  const hauteurs = importe.hauteursPropriete();
  const vegs = importe.elementsRetenus(e.vegetation);
  const plu = e.plu;
  return (
    <div className="blocIgn">
      {ligne('importerBatiments', 'Bâtiments (BD TOPO, avec hauteur)', importe.elementsRetenus(e.batiments).length,
        'Emprise et hauteur reelles des batiments. Ceux de la parcelle sont modifiables, ceux des voisins arrivent verrouilles.')}
      {hauteurs.length > 0 && <div className="detailIgn">{'Sur la propriété : ' + hauteurs.length + ' bâtiment(s), hauteurs ' + hauteurs.map(x => x.toFixed(1).replace('.', ',') + ' m').join(', ')}</div>}
      {ligne('importerHaies', 'Haies (géométrie + hauteur)', importe.elementsRetenus(e.haies).length,
        'Couche haie de la BD TOPO : renseignee surtout en zone de bocage, souvent vide en ville.')}
      {ligne('importerVegetation', 'Zones de végétation', vegs.length, 'Bois, forets, vergers... hauteur deduite de la nature de la zone.')}
      {ligne('importerArbres', 'Arbres estimés dans ces zones (~' + importe.nombreArbresEstimes() + ')', vegs.length,
        'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille reguliere d\'un arbre pour 64 m2 est repartie dans les zones de vegetation - un ordre de grandeur du couvert, pas un releve.')}
      <ReglageRelief importe={importe} />
      <div className="pluParcours">
        {plu?.zones?.[0] ? (() => {
          const z = plu.zones[0];
          return <><b>PLU</b>{' — zone ' + z.libelle + (z.typezone ? ' (type ' + z.typezone + ')' : '')}
            {z.libelong && <><br />{z.libelong}</>}
            {z.urlfic && <><br /><a href={z.urlfic} target="_blank" rel="noopener">Règlement (PDF)</a></>}
            <br /><span className="discret">Le zonage est rattaché à la parcelle et consultable dans l'onglet PLU.</span></>;
        })() : plu && plu.commune && plu.commune.rnu
          ? 'PLU : commune au RNU (pas de document d\'urbanisme local).'
          : 'PLU : aucun zonage renvoye par le Geoportail de l\'urbanisme pour ce point.'}
      </div>
      {e.ignErreur && <div className="erreurParcours">{e.ignErreur}</div>}
    </div>
  );
}

/**
 * Le relief du terrain, lu a la creation du plan : sur la parcelle du projet, ou sur toutes les
 * parcelles importees. Absent sans la capacite `plan.relief`.
 */
function ReglageRelief({ importe }: Props) {
  const e = importe.etat();
  if (!importe.reliefPermis()) return null;
  return (
    <>
      <label className="caseParcours" title="Grille d’altitudes du sol nu (LiDAR HD à 50 cm, sinon RGE ALTI à 1 m), lue à la création du plan : courbes de niveau, sol en 3D, hauteur des plots. Elle change des quantités.">
        <input type="checkbox" data-controle="cadastre.relief" checked={e.importerRelief} onChange={(ev) => importe.basculerCaseIgn('importerRelief', ev.target.checked)} />
        Relief du terrain (IGN)
      </label>
      <label className={'caseParcours sousCase' + (e.importerRelief ? '' : ' vide')} title="La grille couvre aussi les parcelles voisines importées. Au-delà d’un pas de 5 m, elle revient à la parcelle du projet et ses abords.">
        <input type="checkbox" data-controle="cadastre.reliefToutes" checked={e.reliefToutesParcelles} disabled={!e.importerRelief} onChange={(ev) => importe.basculerCaseIgn('reliefToutesParcelles', ev.target.checked)} />
        Relief sur toutes les parcelles importées
      </label>
    </>
  );
}

/**
 * Le voisinage etendu : une case, un curseur de 10 a 1 000 m, et le compte de ce qui arrivera avant
 * de creer. Le disque est lu une fois par palier (200, 500, 1 000 m) ; sous le palier lu, le
 * curseur le filtre sans appel au reseau.
 */
function ReglageVoisinage({ importe }: Props) {
  const e = importe.etat();
  const v = importe.voisinageEtenduRetenu();
  const lecture = e.voisinageEtendu && !!e.principale && (!e.etenduMax || e.etenduMax.rayonM < rayonDeLecture(e.rayonEtendu));
  return (
    <div className="blocIgn" role="group" aria-label="Voisinage étendu">
      <label className="caseParcours" title={'Toutes les parcelles et tout le bâti à moins de ce rayon du centre de la parcelle, lus en plusieurs requêtes à l’IGN ; au-delà de ' + MAX_OBJETS_RAYON + ' par famille, les plus proches seulement.'}>
        <input type="checkbox" data-controle="cadastre.voisinageEtendu" checked={e.voisinageEtendu} onChange={(ev) => void importe.basculerVoisinageEtendu(ev.target.checked)} />
        {'Ajouter tout le voisinage dans un rayon de ' + e.rayonEtendu + ' m'}
      </label>
      <label className={'caseParcours curseurRayon' + (e.voisinageEtendu ? '' : ' vide')}>
        <input type="range" data-controle="cadastre.rayon" aria-label="Rayon du voisinage étendu" min={RAYON_ETENDU_MIN_M} max={RAYON_ETENDU_MAX_M} step={RAYON_ETENDU_PAS_M} value={e.rayonEtendu}
          disabled={!e.voisinageEtendu} aria-valuetext={e.rayonEtendu + ' mètres'} onChange={(ev) => importe.reglerRayonEtendu(Number(ev.target.value))} />
        <span className="valeurRayon">{e.rayonEtendu + ' m'}</span>
      </label>
      {e.voisinageEtendu && <div className="detailIgn" role="status">
        {lecture ? 'Lecture du voisinage…'
          : v ? v.parcelles.length + ' parcelle(s) et ' + (e.importerBatiments ? v.batiments.length + ' bâtiment(s)' : 'aucun bâtiment (couche décochée)') + ' seront ajoutés, verrouillés et marqués « voisinage »' + (v.tronque ? ' ; coupés aux ' + MAX_OBJETS_RAYON + ' plus proches' : '') + '.'
          : e.principale ? 'Voisinage non chargé.' : 'Le compte s’affichera dès la parcelle trouvée.'}
      </div>}
      {e.voisinageEtendu && e.rayonEtendu > RAYON_LEGER_M && <div className="detailIgn avertissementRayon" role="note">{AVERTISSEMENT_RAYON}</div>}
      <label className={'caseParcours' + (e.voisinageEtendu ? '' : ' vide')} title="Montre le voisinage étendu dans l’aperçu, et le laisse visible à l’ouverture du plan. Décoché, il est importé mais masqué : l’œil « Voisinage » de l’explorateur le réaffiche.">
        <input type="checkbox" data-controle="cadastre.afficherEtendu" checked={e.afficherEtendu} disabled={!e.voisinageEtendu} onChange={(ev) => importe.basculerAfficherEtendu(ev.target.checked)} />
        Afficher le voisinage étendu
      </label>
    </div>
  );
}

function Etape3({ importe }: Props) {
  const e = importe.etat();
  const [nom, setNom] = useState(() => importe.nomParDefaut());
  const resume = importe.resumePropriete();
  const groupe = (titre: string, liste: Candidate[]) => liste.length ? (
    <><div className="titreGroupe">{titre}</div>{liste.map(c => <LigneVoisine key={c.idu} importe={importe} c={c} />)}</>
  ) : null;
  return (
    <>
      <div className="corpsParcours">
        <Apercu importe={importe} />
        <div className={'resumePropriete' + (resume.alerte ? ' alerte' : '')}>{resume.texte}</div>
        <div className="aideParcours">
          Coche « propriété » pour les parcelles qui forment ton terrain (elles seront fusionnées en une seule), « importer » pour celles qui
          restent un simple décor de référence. Un clic sur l'aperçu bascule « importer ». Un objet coche « contraint a la parcelle » reste
          enferme dans la parcelle principale : pour construire a cheval sur une voisine, decoche cette contrainte dans le panneau Objet.
        </div>
        <div className="barreSelection">
          <Bouton controle="cadastre.cocherMitoyennes" onClick={importe.cocherMitoyennes}>Cocher toutes les mitoyennes</Bouton>
          <Bouton controle="cadastre.toutDecocher" onClick={importe.toutDecocher}>Tout decocher</Bouton>
        </div>
        <div className="listeVoisines">
          {groupe('Parcelles mitoyennes', e.adjacentes)}
          {groupe('Autres parcelles du secteur', e.autres)}
          {e.tropDense && <div className="erreurParcours">{'Perimetre tres dense : seules les ' + MAX_VOISINES + ' plus grandes limites communes sont proposees.'}</div>}
        </div>
        <div className="titreListe">Voisinage étendu</div>
        <ReglageVoisinage importe={importe} />
        <div className="titreListe">Données IGN à importer sur les parcelles retenues</div>
        <DonneesIgn importe={importe} />
        <div className="libelleChamp">Nom du projet :</div>
        <input type="text" data-controle="cadastre.nomProjet" className="promptInput" value={nom} onChange={(ev) => setNom(ev.target.value)} />
      </div>
      <Pied importe={importe}>
        <Bouton controle="cadastre.annuler" onClick={importe.fermer}>Annuler</Bouton>
        <Bouton controle="cadastre.retour" onClick={() => importe.allerA(2)}>← Retour</Bouton>
        <Bouton controle="cadastre.creerProjet" principal onClick={() => void importe.creerProjet(nom)}>{importe.projetCible() ? 'Remplir le projet' : 'Creer le projet'}</Bouton>
      </Pied>
    </>
  );
}

/** L'etat du travail en cours, puis les boutons de l'etape — grises pendant un appel au reseau. */
function Pied({ importe, children }: Props & { children: React.ReactNode }) {
  const e = importe.etat();
  return (
    <>
      <div className={'etatParcours' + (e.erreur ? ' erreur' : '')} role="status">{e.erreur || e.message}</div>
      <fieldset className="piedDialogue" disabled={e.occupe}>{children}</fieldset>
    </>
  );
}

const TITRES = { 1: 'Nouveau projet depuis une adresse (1/3)', 2: 'Parcelle trouvee (2/3)', 3: 'Parcelles voisines et creation (3/3)' };

export function ImportCadastre({ importe }: Props) {
  useSyncExternalStore(importe.abonner, importe.version);
  const etape = importe.etat().etape;
  return (
    <div className="dialogueImperatif dialogueCadastre" role="dialog" aria-modal="true" aria-label={TITRES[etape]}>
      <div className="titreParcours">{TITRES[etape]}</div>
      {etape === 1 && <Etape1 importe={importe} />}
      {etape === 2 && <Etape2 importe={importe} />}
      {/* Une autre principale refait l etape entiere, nom par defaut compris. */}
      {etape === 3 && <Etape3 key={importe.etat().principale?.idu} importe={importe} />}
      <div className="mentionCadastre">Le plan cadastral (PCI, IGN) est un document fiscal de reference : il ne vaut pas bornage. Seul un geometre-expert peut etablir les limites reelles de propriete.</div>
    </div>
  );
}
