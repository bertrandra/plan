// Le banc du rendu du plan (MD/roadmap-architecture.md, etape 0.2 ; MD/architecture.md, W3) : combien coute un rendu complet du
// plan (`render()` : la scene SVG, le tiroir, les zones) quand le plan grossit. La demonstration (147 objets, voisinage compris) est
// dupliquee a cote d'elle-meme jusqu'a la taille voulue, puis rendue plusieurs fois ; on garde la mediane et le pire.
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 --strictPort   # en arriere-plan
//   NODE_PATH=$(npm root -g) node scripts/banc-rendu.mjs http://localhost:5199 [150 300 600]
//
// BANC_ESSAIS=n : le nombre de rendus mesures par taille (9 par defaut ; davantage sur une machine partagee, ou les temps varient).
// BANC_ZONES=1 (serveur de developpement) : pour chaque taille, les zones React qui se sont redessinees pendant les rendus mesures,
// combien de fois et pour combien de temps (Profiler de React, zones/monter.tsx).
// BANC_PROFIL=1 : au bureau, a la premiere taille, le profil de dix rendus (fonctions de src/, temps inclusif) : ce qui coute.
// BANC_SCENARIOS=rendu,glisser,terrasse,zoom,pan (tous par defaut) : ce qui est mesure a chaque taille (etapes 2.3 et 6.5).
//   rendu     un rendu sans changement (une zone qui notifie, un zoom repousse) ;
//   glisser   chaque image d'un objet glisse (un arbre de la demonstration, selectionne) : il bouge, il est touche, le plan est rendu ;
//   terrasse  la meme chose pour la terrasse (le chiffrage et ses couches suivent) ;
//   zoom      chaque cran d'un zoom (x 1,1 puis / 1,1 autour du centre) : la scene change, le plan est rendu ;
//   pan       chaque image d'un deplacement de la vue (8 px) : la scene change, le plan est rendu.
// Les gestes de vue sont mesures sans le frein (`RENDU_LENT_MS`, app/boot/rendu.ts) : un rendu complet a chaque image, ce que le
// geste couterait si l'apercu par transformation n'etait pas la.
//
// Deux cibles. Le serveur de developpement donne le profil (BANC_PROFIL=1, noms de src/), mais React y tourne en mode developpement,
// plus lent que le paquet livre. Le paquet du banc donne les temps que les gens auront : un paquet de production qui garde les
// poignees `window.__plan` (mode `banc`, app/boot.ts), servi par la previsualisation :
//
//   BACKPROD_API_URL=http://plateforme.test npx vite build --mode banc
//   BACKPROD_API_URL=http://plateforme.test npx vite preview --port 5303 --strictPort   # en arriere-plan
//   NODE_PATH=$(npm root -g) node scripts/banc-rendu.mjs http://localhost:5303
//
// Refaire ensuite un build ordinaire avant de livrer : le paquet du banc porte les poignees.
//
// Deux appareils : le bureau (1440 x 900, processeur tel quel) et le telephone (390 x 844, processeur ralenti x4 par Chromium, ce
// qu'un telephone de milieu de gamme donne a peu pres). Le budget d'une image est de 16 ms au bureau, 33 ms au telephone (30 i/s).
import { createRequire } from 'node:module';
import { simulerPlateforme } from './captures.mjs';
import { servirThreeLocal } from './fumee-reseau.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const base = process.argv[2] || 'http://localhost:5199';
const tailles = process.argv.slice(3).map(Number).filter(Boolean);
const TAILLES = tailles.length ? tailles : [150, 300, 600];
const ESSAIS = Number(process.env.BANC_ESSAIS) || (process.env.BANC_PROFIL ? 10 : 9);
const SCENARIOS = (process.env.BANC_SCENARIOS || 'rendu,glisser,terrasse,zoom,pan').split(',').map((x) => x.trim()).filter(Boolean);
const APPAREILS = [
  { nom: 'bureau', viewport: { width: 1440, height: 900 }, ralenti: 1, budget: 16 },
  { nom: 'téléphone', viewport: { width: 390, height: 844 }, ralenti: 4, budget: 33, mobile: true }
];

/** Le temps inclusif des fonctions de src/ dans un profil de Chromium : chaque echantillon compte pour toute sa pile. */
function imprimerProfil(profil) {
  const noeuds = new Map(profil.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profil.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const inclusif = new Map();
  profil.samples.forEach((id, i) => {
    const vus = new Set();
    for (let x = id; x !== undefined; x = parent.get(x)) {
      const n = noeuds.get(x), m = /\/src\/(.*?)(\?|$)/.exec(n.callFrame.url);
      const cle = m ? m[1] + ' ' + (n.callFrame.functionName || '(anonyme)') : null;
      if (cle && !vus.has(cle)) { vus.add(cle); inclusif.set(cle, (inclusif.get(cle) ?? 0) + (profil.timeDeltas[i] ?? 0)); }
    }
  });
  console.log('profil (dix rendus, temps inclusif) :');
  for (const [k, v] of [...inclusif].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
  // Le temps propre, toutes origines : ce que React, le DOM et le ramasse-miettes prennent hors de src/.
  const propre = new Map();
  profil.samples.forEach((id, i) => {
    const n = noeuds.get(id), f = n.callFrame, cle = (f.url.split('/').pop()?.split('?')[0] || '(natif)') + ' ' + (f.functionName || '(anonyme)');
    propre.set(cle, (propre.get(cle) ?? 0) + (profil.timeDeltas[i] ?? 0));
  });
  console.log('temps propre, toutes origines :');
  for (const [k, v] of [...propre].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
}

const navigateur = await chromium.launch();
const lignes = [];
for (const a of APPAREILS) {
  const contexte = await navigateur.newContext({ viewport: a.viewport, isMobile: !!a.mobile, hasTouch: !!a.mobile });
  const page = await contexte.newPage();
  await servirThreeLocal(page);
  await simulerPlateforme(page);
  // Sur le serveur de developpement, le plan verifie ses cles de version en redessinant tout (render/pipeline.ts) : le banc mesure
  // ce que les gens auront.
  await page.addInitScript(() => { window.__sansToitsFond = true; window.__sansVerifierCles = true; });
  await page.goto(base + '/');
  await page.getByRole('button', { name: /d[ée]monstration/i }).click();
  await page.waitForFunction(() => window.__plan?.etat?.().objects.length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: a.ralenti });
  const origine = await page.evaluate(() => window.__plan.etat().objects.length);
  for (const n of TAILLES) {
    const profiler = process.env.BANC_PROFIL && a.nom === (process.env.BANC_PROFIL_APPAREIL || 'bureau') && n === TAILLES[0];
    if (profiler) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    const r = await page.evaluate(async ({ n, essais, scenarios }) => {
      const etat = window.__plan.etat();
      // Repartir des objets d'origine, puis copier la demonstration sur elle-meme, un peu decalee, jusqu'a n.
      const origine = etat.objects.filter((o) => !String(o.key).includes('~banc'));
      const copies = [];
      for (let k = 1; origine.length + copies.length < n; k++) {
        for (const o of origine) {
          if (origine.length + copies.length >= n) break;
          const c = structuredClone(o);
          c.key = o.key + '~banc' + k;
          // Un leger decalage : la copie reste dans la vue (une copie hors de l'ecran ne coute rien a dessiner, et ne dit rien).
          const dx = 0.7 * k;
          if (c.pts) c.pts = c.pts.map((p) => ({ ...p, x: p.x + dx }));
          if (c.center) c.center = { ...c.center, x: c.center.x + dx };
          copies.push(c);
        }
      }
      etat.objects = [...origine, ...copies];
      // Un objet neuf a besoin de son noeud SVG, comme apres un geste ; une copie deja dessinee (taille precedente) le garde.
      window.__bancDessines ??= new Set();
      for (const c of copies) if (!window.__bancDessines.has(c.key)) { window.__plan.dessinerObjet(c); window.__bancDessines.add(c.key); }
      // React rend les zones apres coup, dans une tache a lui (scheduler, MessageChannel) : un message poste apres le rendu passe
      // derriere elle. Le temps compte donc le plan et les zones, sans l'attente de l'image suivante.
      const apresReact = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
      window.__bancSelection ??= etat.selectedKey;
      const selectionner = async (cle) => { if (etat.selectedKey !== cle) { window.__plan.selectionnerCle(cle); window.__plan.rendre(); await apresReact(); } };
      await selectionner(window.__bancSelection);
      // Les premiers rendus posent les noeuds et mettent le navigateur en route (les copies neuves, les taches qu'elles lancent) : on
      // les laisse passer, puis on mesure les suivants.
      for (let i = 0; i < 5; i++) { window.__plan.rendre(); await apresReact(); }
      await new Promise((r) => setTimeout(r, 1000));
      window.__plan.rendre(); await apresReact();
      const glisser = (o) => (i) => {
        const d = (i % 2 ? -1 : 1) * 0.05;
        if (o.pts) o.pts = o.pts.map((p) => ({ ...p, x: p.x + d })); // le glisser remplace les sommets (interaction/drag.ts)
        if (o.center) o.center = { ...o.center, x: o.center.x + d };
        window.__plan.toucher(o.key);
      };
      const cx = () => etat.scene.W / 2, cy = () => etat.scene.H / 2;
      const gestes = {
        rendu: { avant: () => {}, image: () => {} },
        glisser: { cible: () => origine.find((o) => o.fonction === 'arbre') ?? origine.find((o) => o.fonction !== 'terrain') },
        terrasse: { cible: () => origine.find((o) => o.fonction === 'terrasse') },
        zoom: { image: (i) => {
          const s = etat.scene, k = i % 2 ? 1 / 1.1 : 1.1;
          etat.scene = { ...s, scale: s.scale * k, origine: { x: cx() + (s.origine.x - cx()) * k, y: cy() + (s.origine.y - cy()) * k } };
        } },
        pan: { image: (i) => { const s = etat.scene, d = i % 2 ? -8 : 8; etat.scene = { ...s, origine: { x: s.origine.x + d, y: s.origine.y + d / 2 } }; } }
      };
      const resultats = {};
      for (const nom of scenarios) {
        const g = gestes[nom];
        if (!g) continue;
        let image = g.image;
        if (g.cible) {
          const o = g.cible();
          if (!o) continue;
          await selectionner(o.key);
          image = glisser(o);
          // La premiere image d'un geste prend son pas d'annulation (tout est neuf) : on mesure les suivantes.
          image(1); window.__plan.rendre(); await apresReact();
        }
        window.__dureesZones = {};
        const t = [], plan = [];
        for (let i = 0; i < essais; i++) {
          const debut = performance.now();
          image(i);
          plan.push(window.__plan.rendre());
          await apresReact();
          t.push(performance.now() - debut);
        }
        // Un nombre impair d'images laisse l'objet ou la vue un cran a cote : on revient au depart.
        if (essais % 2) { image(essais); window.__plan.rendre(); await apresReact(); }
        if (g.cible) await selectionner(window.__bancSelection);
        t.sort((x, y) => x - y); plan.sort((x, y) => x - y);
        resultats[nom] = { zones: window.__dureesZones, mediane: t[Math.floor(t.length / 2)], pire: t[t.length - 1], plan: plan[Math.floor(plan.length / 2)] };
      }
      const noeuds = document.querySelectorAll('#stage svg *').length;
      return { resultats, objets: etat.objects.length, noeuds };
    }, { n, essais: ESSAIS, scenarios: SCENARIOS });
    if (profiler) imprimerProfil((await cdp.send('Profiler.stop')).profile);
    for (const [nom, x] of Object.entries(r.resultats)) {
      if (process.env.BANC_ZONES) {
        const z = Object.entries(x.zones ?? {}).sort((u, v) => v[1].ms - u[1].ms);
        console.log(`zones redessinées (${nom}, ${ESSAIS} images) : ` + (z.map(([k, v]) => `${k} ${v.rendus}× ${v.ms.toFixed(0)} ms`).join(', ') || 'aucune'));
      }
      lignes.push({ appareil: a.nom, scenario: nom, objets: r.objets, mediane: x.mediane, pire: x.pire, plan: x.plan, budget: a.budget });
      console.log(`${a.nom.padEnd(10)} ${nom.padEnd(8)} ${String(r.objets).padStart(4)} objets, ${String(r.noeuds).padStart(6)} nœuds SVG : médiane ${x.mediane.toFixed(1).padStart(6)} ms (dont plan ${x.plan.toFixed(1)}), pire ${x.pire.toFixed(1).padStart(6)} ms  (budget ${a.budget} ms) ${x.mediane > a.budget ? 'AU-DELÀ' : 'ok'}`);
    }
  }
  console.log(`(${a.nom} : démonstration de ${origine} objets au départ, ${ESSAIS} rendus par taille)`);
  await contexte.close();
}
await navigateur.close();
