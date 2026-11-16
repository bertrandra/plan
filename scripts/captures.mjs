// Captures de reference de l'interface (MD/spec-ihm-mobile.md §3.5).
//
// Ouvre le jeu de demonstration dans Chromium a trois largeurs, en clair et en sombre, sur six
// etats, et depose les captures dans tests/captures/. Elles ne se comparent pas au pixel : elles se
// relisent a chaque etape et se joignent a la pull request.
//
// La plateforme est simulee : Plan ne s'ouvre pas sans elle (spec-connexion-plateforme), et une
// capture ne doit dependre ni d'un compte ni du reseau. Les routes simulees sont les trois que la
// porte et le premier pas appellent : le renouvellement de session, le contexte, la liste des
// projets (vide, pour arriver sur « Par quoi commencer ? » et ouvrir le plan de demonstration).
//
//   BACKPROD_API_URL=http://plateforme.test npx vite --port 5199 &
//   node scripts/captures.mjs [http://localhost:5199] [dossier]
//
// Playwright n'est pas une dependance du projet : le script le prend la ou il est installe
// (NODE_PATH, ou l'installation globale).

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
  catch { console.error('Playwright introuvable : installer playwright ou renseigner NODE_PATH.'); process.exit(1); }
}

const principalLance = import.meta.url === 'file://' + process.argv[1];
// Les deux scripts prennent l'adresse en premier argument : `fumee.mjs` importe ce module, et son
// argument doit valoir ici aussi — sans quoi `node scripts/fumee.mjs http://localhost:5200` jouait
// en silence contre le 5199.
const argUrl = process.argv[2] && /^https?:\/\//.test(process.argv[2]) ? process.argv[2] : null;
export const BASE = argUrl || process.env.PLAN_URL || 'http://localhost:5199';
const SORTIE = resolve((principalLance && process.argv[3]) || 'tests/captures');
const PLATEFORME = 'http://plateforme.test';

export const FORMATS = [
  { nom: 'compact', width: 390, height: 844, mobile: true },
  { nom: 'moyen', width: 820, height: 1180, mobile: true },
  { nom: 'large', width: 1440, height: 900, mobile: false }
];
const THEMES = ['light', 'dark'];

export const CONTEXTE = {
  user: { id: 'u1', email: 'demo@plan.test', display_name: 'Demo', locale: 'fr' },
  tenant: { id: 't1', slug: 'demo', name: 'Demo' },
  product: { id: 'p1', code: 'plan', name: 'Plan', app_url: null },
  roles: ['admin'],
  permissions: ['projects.read', 'projects.write'],
  capabilities: ['plan.documents', 'plan.cadastre', 'plan.ortho', 'plan.plu', 'plan.terrasse', 'plan.export.dxf', 'plan.export.dossier', 'plan.3d'],
  entitlements: [],
  usage: [],
  token_expires_at: null
};

/**
 * Simule la plateforme sur une page.
 *
 * Le depot tient en memoire ce que Plan y enregistre : le plan de demonstration est cree par un
 * `POST /projects`, puis relu par son identifiant, exactement comme sur la vraie plateforme.
 */
export async function simulerPlateforme(page, { connecte = true, capacites = null, refusPartage = null, liensPublics = {} } = {}) {
  // `connecte: false` : aucune session, la porte s'affiche ; `capacites` : l'offre de la personne, a la place de celle du contexte ;
  // `refusPartage` : l'erreur que la creation d'un lien de partage rend ({ statut, code, details }), au lieu d'un lien ;
  // `liensPublics` : ce que `public/shares/open` rend pour un jeton ({ <jeton>: <reponse> | <statut> }) ; un jeton inconnu, 404.
  const contexte = capacites ? { ...CONTEXTE, capabilities: capacites } : CONTEXTE;
  const projets = new Map();
  // Les liens de partage (ADR-073), par projet : la plateforme n'en rend l'adresse qu'a la creation.
  const liens = new Map();
  // Ce que la page a demande a la plateforme, dans l'ordre : `METHODE /chemin`, et si un jeton l'accompagnait.
  const journal = [];
  let suivant = 1;
  const resume = (p) => ({ id: p.id, name: p.name, updated_at: p.updated_at, deleted_at: null, schema_version: p.schema_version ?? 1 });
  await page.route(PLATEFORME + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const chemin = url.pathname.replace(/^\/api\/v1/, '');
    const corps = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    const lu = () => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } };
    journal.push({ requete: req.method() + ' ' + chemin, jeton: !!req.headers()['authorization'], produit: !!req.headers()['x-product'], referent: req.headers()['referer'] ?? null });
    if (chemin === '/public/shares/open' && req.method() === 'POST') {
      const lien = liensPublics[lu().token];
      if (typeof lien === 'number') return corps({ error: { code: lien === 429 ? 'RATE_LIMITED' : 'ERREUR', message: 'm', details: {}, request_id: 'req-fumee' } }, lien);
      return lien ? corps(lien) : corps({ error: { code: 'SHARE_NOT_FOUND', message: 'Not found', details: {}, request_id: 'req-fumee' } }, 404);
    }
    const mp = chemin.match(/^\/projects\/([^/]+)\/shares(?:\/([^/]+))?$/);
    if (mp) {
      const liste = liens.get(mp[1]) ?? [];
      liens.set(mp[1], liste);
      if (!mp[2] && req.method() === 'GET') return corps({ shares: [...liste].reverse() });
      if (!mp[2] && req.method() === 'POST') {
        if (refusPartage) return corps({ error: { code: refusPartage.code, message: refusPartage.code, details: refusPartage.details ?? {}, request_id: 'req-fumee' } }, refusPartage.statut);
        const b = lu();
        const maintenant = Date.now();
        const lien = { id: 'lien' + suivant++, project_id: mp[1], display_name: b.display_name ?? null, recipient_label: b.recipient_label ?? null, status: 'ACTIVE',
          created_by: 'u1', created_at: new Date(maintenant).toISOString(), expires_at: new Date(maintenant + (b.expires_in_days ?? 30) * 86400000).toISOString(),
          revoked_at: null, open_count: 0, last_opened_at: null };
        liste.push(lien);
        return corps({ ...lien, url: BASE + '/?product=plan#share=jeton-fumee-' + lien.id }, 201);
      }
      const lien = liste.find((l) => l.id === mp[2]);
      if (lien && req.method() === 'DELETE') { lien.status = 'REVOKED'; lien.revoked_at = new Date().toISOString(); return route.fulfill({ status: 204 }); }
      return corps({ error: { code: 'NOT_FOUND', message: 'Lien absent' } }, 404);
    }
    if (chemin === '/auth/refresh') return connecte ? corps({ access_token: 'jeton', expires_in: 3600 }) : corps({ error: { code: 'UNAUTHENTICATED', message: 'Session absente' } }, 401);
    if (chemin === '/me/context') return connecte ? corps(contexte) : corps({ error: { code: 'UNAUTHENTICATED', message: 'Session absente' } }, 401);
    if (chemin === '/auth/jwks') return corps({ keys: [] });
    if (chemin === '/projects' && req.method() === 'GET') return corps({ projects: [...projets.values()].map(resume) });
    if (chemin === '/projects' && req.method() === 'POST') {
      const b = lu();
      const p = { id: 'p' + suivant++, name: b.name || 'Plan', document: b.document, schema_version: b.schema_version, updated_at: new Date().toISOString() };
      projets.set(p.id, p);
      return corps({ ...resume(p), document: p.document }, 201);
    }
    const m = chemin.match(/^\/projects\/([^/]+)$/);
    if (m && projets.has(m[1])) {
      const p = projets.get(m[1]);
      if (req.method() === 'PATCH') {
        const b = lu();
        if (b.name !== undefined) p.name = b.name;
        if (b.document !== undefined) p.document = b.document;
        p.updated_at = new Date().toISOString();
      }
      return corps({ ...resume(p), document: p.document });
    }
    return corps({ error: { code: 'NON_SIMULE', message: req.method() + ' ' + chemin } }, 404);
  });
  return { journal, liens };
}

/**
 * Ouvre le plan de demonstration et attend l'atelier. `temoin` ouvre celui d'origine, dont les golden
 * files sont captures (2.1.1 : l'utilisateur ouvre le meme plan aux couleurs de la maquette).
 */
export async function ouvrirDemo(page, { temoin = false } = {}) {
  await simulerPlateforme(page);
  // Pas de lecture des toits en tache de fond (app/toits/toitsFond.ts) : elle changerait, la ou l'IGN
  // repond, les toits que les points de la fumee et les captures mesurent.
  await page.addInitScript(() => { window.__sansToitsFond = true; });
  await page.goto(BASE + (temoin ? '/?temoin' : '/'));
  await page.getByRole('button', { name: /d[ée]monstration/i }).click();
  await page.waitForSelector('#stage svg');
  await page.waitForTimeout(300);
  // Un plan ecrit a un schema anterieur ouvre « Mettre a jour le modele ? » par-dessus l'atelier, et
  // son voile intercepte tous les gestes qui suivent : c'est ce qui faisait echouer les points 1, 3,
  // 17 et 31 de la fumee quand la demonstration etait au schema 1. On la referme comme le ferait
  // la personne, sans rien mettre a jour : ce n'est pas ce qu'on eprouve ici.
  const garder = page.getByRole('button', { name: 'Garder tel quel' });
  if (await garder.count()) { await garder.click(); await page.waitForTimeout(150); }
}

/**
 * Selectionne la premiere terrasse du plan, par le magasin expose en developpement, puis cadre
 * dessus sur telephone et tablette, comme le fait un choix dans la feuille Objets (2.1.1).
 */
async function selectionnerTerrasse(page) {
  await page.evaluate(() => window.__plan?.selectionnerPremiere('terrasse'));
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (document.documentElement.dataset.classe !== 'large') window.__plan?.executer('vue.ajuster'); });
  await page.waitForTimeout(100);
}

const ETATS = [
  { nom: '1-plan', faire: async () => {} },
  { nom: '2-terrasse', faire: selectionnerTerrasse },
  { nom: '3-outils', faire: async (p) => { await selectionnerTerrasse(p); await p.evaluate(() => window.__plan?.ouvrirFeuille('outils')); } },
  { nom: '4-proprietes', faire: async (p) => { await selectionnerTerrasse(p); await p.evaluate(() => window.__plan?.ouvrirFeuille('proprietes')); } },
  { nom: '5-resultats', faire: async (p) => { await selectionnerTerrasse(p); await p.evaluate(() => { window.__plan?.ouvrirResultats('bom'); window.__plan?.ouvrirFeuille(document.documentElement.dataset.classe === 'compact' ? 'resultats' : null); }); } },
  { nom: '6-vue3d', faire: async (p) => { await p.evaluate(() => window.__plan?.executer('vue.3d')); await p.waitForTimeout(800); } }
];

async function principal() {
  mkdirSync(SORTIE, { recursive: true });
  const navigateur = await chromium.launch();
  let n = 0;
  for (const f of FORMATS) {
    for (const theme of THEMES) {
      for (const etat of ETATS) {
        const contexte = await navigateur.newContext({
          viewport: { width: f.width, height: f.height }, isMobile: f.mobile, hasTouch: f.mobile,
          deviceScaleFactor: 1, colorScheme: theme
        });
        const page = await contexte.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(e.message));
        await ouvrirDemo(page);
        await etat.faire(page);
        await page.waitForTimeout(250);
        await page.screenshot({ path: resolve(SORTIE, `${f.nom}-${theme}-${etat.nom}.png`) });
        if (erreurs.length) console.error(`${f.nom}-${theme}-${etat.nom} : ${erreurs.join(' | ')}`);
        await contexte.close();
        n++;
      }
    }
  }
  await navigateur.close();
  console.log(n + ' captures dans ' + SORTIE);
}

if (principalLance) await principal();
