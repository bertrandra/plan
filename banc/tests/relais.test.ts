// Le relais des images Panoramax (banc/public/api.php ; demande du proprietaire, 15 novembre 2026 : toute instance federee marche
// d'office, sans ouvrir la politique de contenu a tous les hotes). La page donne un identifiant de photo et une taille, jamais une
// adresse. Chaque garde-fou est essaye ici : les fonctions une a une avec un faux DNS et un faux catalogue (fixtures/relais-essai.php),
// la lecture bornee contre un petit serveur local, et la route par `php -S`. Aucun appel au vrai reseau. Saute si PHP manque.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const php = spawnSync('php', ['-r', 'exit(function_exists("curl_init") ? 0 : 1);']).status === 0;
const racine = path.resolve(__dirname, '..');
const essai = (scenario: Record<string, unknown>): unknown => {
  const r = spawnSync('php', [path.join(racine, 'tests/fixtures/relais-essai.php')], { input: JSON.stringify(scenario) });
  return JSON.parse(r.stdout.toString() || 'null');
};

/** Le meme, sans bloquer Node : le petit serveur local de ce test doit pouvoir repondre pendant que PHP l'appelle. */
const essaiLibre = (scenario: Record<string, unknown>): Promise<unknown> => new Promise((ok) => {
  const p = spawn('php', [path.join(racine, 'tests/fixtures/relais-essai.php')]);
  let sortie = '';
  p.stdout.on('data', (d: Buffer) => { sortie += d.toString(); });
  p.on('close', () => ok(JSON.parse(sortie || 'null')));
  p.stdin.end(JSON.stringify(scenario));
});

const ID = '5e1f6b8d-9d21-4fbd-96f9-0390a79d9b58';
const CATALOGUE = 'https://api.panoramax.xyz/api/search?ids=' + ID;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const DNS = { 'api.panoramax.xyz': ['193.200.42.124'], 'photos.instance-federee.example': ['203.0.113.7'], 'stockage.example': ['198.51.100.9'], 'interne.example': ['10.0.0.5'], 'local.example': ['127.0.0.1'], 'lien-local.example': ['169.254.169.254'], 'double.example': ['203.0.113.7', '192.168.1.1'] };
const HD = 'https://photos.instance-federee.example/api/pictures/' + ID + '/hd.jpg';
const item = (assets: Record<string, string>) => ({ code: 200, entetes: { 'Content-Type': 'application/geo+json' }, corps: JSON.stringify({ features: [{ id: ID, assets: Object.fromEntries(Object.entries(assets).map(([k, href]) => [k, { href }])) }] }) });
const image = { code: 200, entetes: { 'Content-Type': 'image/jpeg' }, base64: JPEG };
type Rendu = { type?: string; taille?: number; refus?: string; code?: number; demandes: { url: string; hote: string; ip: string; max: number }[] };
const relais = (reponses: Record<string, unknown>, id = ID, taille = 'hd') => essai({ mode: 'image', id, taille, dns: DNS, reponses }) as Rendu;

describe.skipIf(!php)('le relais Panoramax : ce qu’il refuse', () => {
  it('une adresse IP publique seulement : ni privée, ni locale, ni lien-local, ni réservée, ni IPv6', () => {
    const ips = ['193.200.42.124', '8.8.8.8', '10.0.0.1', '172.16.5.4', '192.168.1.1', '127.0.0.1', '127.8.9.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', '::ffff:127.0.0.1', 'pas-une-ip', ''];
    expect(essai({ mode: 'ip', ips })).toEqual([true, true, ...ips.slice(2).map(() => false)]);
  });
  it('une adresse : https, port 443, sans identifiants, un nom d’hôte (pas une IP écrite en chiffres), résolu en adresse publique', () => {
    const urls = [
      'https://photos.instance-federee.example/a.jpg', 'https://photos.instance-federee.example:443/a.jpg',
      'http://photos.instance-federee.example/a.jpg', 'ftp://photos.instance-federee.example/a.jpg', 'file:///etc/passwd', 'gopher://stockage.example/',
      'https://photos.instance-federee.example:8443/a.jpg', 'https://moi:secret@photos.instance-federee.example/a.jpg',
      'https://127.0.0.1/a.jpg', 'https://[::1]/a.jpg', 'https://2130706433/a.jpg', 'https://0x7f000001/a.jpg', 'https://localhost/a.jpg',
      'https://interne.example/a.jpg', 'https://local.example/a.jpg', 'https://lien-local.example/latest/meta-data/', 'https://double.example/a.jpg', 'https://inconnu.example/a.jpg', 'pas une adresse', '',
    ];
    const r = essai({ mode: 'destination', urls, dns: DNS }) as unknown[];
    expect(r.slice(0, 2)).toEqual([{ hote: 'photos.instance-federee.example', ip: '203.0.113.7' }, { hote: 'photos.instance-federee.example', ip: '203.0.113.7' }]);
    for (const [k, refus] of r.slice(2).entries()) expect(typeof refus, urls[k + 2]).toBe('string');
    expect(r[2]).toMatch(/https seulement/);
    expect(r[13]).toMatch(/privée ou locale/);
    expect(r[14]).toMatch(/privée ou locale/);
    expect(r[15]).toMatch(/privée ou locale/);
    // Une seule adresse privee parmi celles de l'hote suffit a le refuser.
    expect(r[16]).toMatch(/privée ou locale/);
    expect(r[17]).toMatch(/introuvable/);
  });
  it('un identifiant qui n’est pas un UUID, une taille inconnue : refusés avant toute requête', () => {
    for (const id of ['', 'abc', '../../etc/passwd', ID + '/../x', ID.toUpperCase(), 'https://127.0.0.1/', ID + '&ids=autre', ID + '%00']) {
      const r = relais({}, id);
      expect([r.code, r.demandes.length], id).toEqual([400, 0]);
    }
    expect(relais({}, ID, 'original')).toMatchObject({ code: 400, demandes: [] });
    expect(relais({}, ID, 'https://127.0.0.1/')).toMatchObject({ code: 400, demandes: [] });
  });
  it('la photo se demande au méta-catalogue par son identifiant, et l’image à l’hôte qu’il nomme : rien ne vient de l’appelant', () => {
    const r = relais({ [CATALOGUE]: item({ hd: HD }), [HD]: image });
    expect(r).toMatchObject({ type: 'image/jpeg', taille: 204 });
    expect(r.demandes.map((d) => [d.url, d.hote, d.ip])).toEqual([[CATALOGUE, 'api.panoramax.xyz', '193.200.42.124'], [HD, 'photos.instance-federee.example', '203.0.113.7']]);
    // Les trois tailles prennent chacune leur image, avec sa borne.
    const assets = { hd: HD, sd: HD.replace('hd', 'sd'), thumb: HD.replace('hd', 'thumb') };
    const tailles = (['hd', 'sd', 'vignette'] as const).map((t) => relais({ [CATALOGUE]: item(assets), [assets.hd]: image, [assets.sd]: image, [assets.thumb]: image }, ID, t).demandes[1]);
    expect(tailles.map((d) => [d?.url, d?.max])).toEqual([[assets.hd, 25 * 1048576], [assets.sd, 4 * 1048576], [assets.thumb, 1048576]]);
  });
  it('une redirection se suit à la main, revérifiée : vers 127.0.0.1, un hôte privé ou http, elle s’arrête avant toute connexion', () => {
    const vers = (location: string) => relais({ [CATALOGUE]: item({ hd: HD }), [HD]: { code: 302, entetes: { Location: location } }, 'https://stockage.example/h/d.jpg': image });
    expect(vers('https://stockage.example/h/d.jpg')).toMatchObject({ type: 'image/jpeg' });
    for (const mauvaise of ['https://127.0.0.1/secret', 'https://local.example/secret', 'https://interne.example/admin', 'https://lien-local.example/latest/meta-data/', 'http://stockage.example/h/d.jpg', 'https://stockage.example:8080/x', 'file:///etc/passwd']) {
      const r = vers(mauvaise);
      expect(r.refus, mauvaise).toMatch(/refus/);
      expect(r.code).toBe(502);
      // Rien n'a ete demande a la cible de la redirection.
      expect(r.demandes.map((d) => d.url)).toEqual([CATALOGUE, HD]);
    }
    // Le catalogue lui-meme ne peut pas renvoyer vers un hote local.
    expect(relais({ [CATALOGUE]: { code: 302, entetes: { Location: 'https://local.example/api' } } })).toMatchObject({ code: 502, demandes: [{ url: CATALOGUE }] });
    // Un faux catalogue qui nomme une image sur un hote prive : refuse de meme.
    expect(relais({ [CATALOGUE]: item({ hd: 'https://interne.example/hd.jpg' }) })).toMatchObject({ code: 502, demandes: [{ url: CATALOGUE }] });
    expect(relais({ [CATALOGUE]: item({ hd: 'http://photos.instance-federee.example/hd.jpg' }) }).refus).toMatch(/https seulement/);
  });
  it('trois redirections au plus, relatives comprises', () => {
    const chaine = (n: number) => Object.fromEntries([[CATALOGUE, item({ hd: 'https://stockage.example/r0' })], ...Array.from({ length: n }, (_, k) => ['https://stockage.example/r' + k, { code: 302, entetes: { Location: '/r' + (k + 1) } }]), ['https://stockage.example/r' + n, image]]);
    expect(relais(chaine(3))).toMatchObject({ type: 'image/jpeg' });
    expect(relais(chaine(4))).toMatchObject({ code: 502, refus: 'trop de redirections' });
    expect(essai({ mode: 'absolue', cas: [['https://a.example/x/y.jpg', '/z.jpg'], ['https://a.example/x/y.jpg', 'z.jpg'], ['https://a.example/x/y.jpg', '//b.example/z'], ['https://a.example/x', 'https://c.example/q']] })).toEqual(['https://a.example/z.jpg', 'https://a.example/x/z.jpg', 'https://b.example/z', 'https://c.example/q']);
  });
  it('une image, deux fois : l’en-tête le dit et les premiers octets le confirment', () => {
    const avec = (r: unknown) => relais({ [CATALOGUE]: item({ hd: HD }), [HD]: r });
    expect(avec({ code: 200, entetes: { 'Content-Type': 'text/html' }, base64: JPEG }).refus).toMatch(/pas une image/);
    expect(avec({ code: 200, entetes: { 'Content-Type': 'image/jpeg' }, corps: '<html><script>alert(1)</script></html>' }).refus).toMatch(/pas une image/);
    expect(avec({ code: 200, entetes: { 'Content-Type': 'image/svg+xml' }, corps: '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>' }).refus).toMatch(/pas une image/);
    expect(avec({ code: 200, entetes: {}, base64: JPEG }).refus).toMatch(/pas une image/);
    expect(avec({ code: 200, entetes: { 'Content-Type': 'image/jpeg; charset=binary' }, base64: JPEG }).type).toBe('image/jpeg');
    const b64 = (o: number[]) => Buffer.from(o).toString('base64');
    expect(essai({ mode: 'type', octets: [JPEG, b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), Buffer.from('RIFF\0\0\0\0WEBPVP8 ').toString('base64'), Buffer.from('GIF89a').toString('base64'), Buffer.from('<svg').toString('base64'), Buffer.from('%PDF-1.7').toString('base64'), ''] })).toEqual(['image/jpeg', 'image/png', 'image/webp', null, null, null, null]);
  });
  it('une taille bornée : 25 Mo en hd, 4 en sd, 1 pour une vignette', () => {
    const pese = (octets: number, taille: string) => relais({ [CATALOGUE]: item({ hd: HD, sd: HD, thumb: HD }), [HD]: { code: 200, entetes: { 'Content-Type': 'image/jpeg' }, octets } }, ID, taille);
    expect(pese(26 * 1048576, 'hd')).toMatchObject({ code: 502, refus: expect.stringMatching(/trop grosse \(plus de 25 Mo\)/) as unknown });
    expect(pese(5 * 1048576, 'sd').refus).toMatch(/trop grosse \(plus de 4 Mo\)/);
    expect(pese(2 * 1048576, 'vignette').refus).toMatch(/trop grosse \(plus de 1 Mo\)/);
  });
  it('photo inconnue, taille absente, hôte en panne : dits en clair', () => {
    expect(relais({ [CATALOGUE]: { code: 200, entetes: {}, corps: '{"features":[]}' } })).toMatchObject({ code: 404, refus: 'photo inconnue du catalogue Panoramax' });
    // Le catalogue rend une autre photo que celle demandee : ce n'est pas elle.
    expect(relais({ [CATALOGUE]: { code: 200, entetes: {}, corps: JSON.stringify({ features: [{ id: 'autre', assets: { hd: { href: HD } } }] }) } }).code).toBe(404);
    expect(relais({ [CATALOGUE]: item({ sd: HD }) })).toMatchObject({ code: 404 });
    expect(relais({ [CATALOGUE]: item({ hd: HD }), [HD]: { code: 503 } }).refus).toBe('l’hôte photos.instance-federee.example a répondu 503');
    expect(relais({ [CATALOGUE]: { code: 200, entetes: {}, corps: 'pas du json' } }).code).toBe(404);
  });
});

function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); });
  });
}

describe.skipIf(!php)('le relais Panoramax : la lecture (cURL) et la route', () => {
  let local: http.Server, portLocal = 0, serveur: ChildProcess, base = '', tmp = '', cookie = '';
  beforeAll(async () => {
    // Un petit hote local : une grosse reponse, une redirection, une reponse qui n'arrive jamais.
    local = http.createServer((q, r) => {
      if (q.url === '/gros') { r.writeHead(200, { 'Content-Type': 'image/jpeg' }); const lot = Buffer.alloc(65536, 1); let n = 0; const envoyer = () => { if (n++ < 64 && !r.destroyed) r.write(lot, envoyer); else r.end(); }; envoyer(); }
      else if (q.url === '/annonce') { r.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': '9000000' }); r.write('x'); }
      else if (q.url === '/ailleurs') { r.writeHead(302, { Location: 'http://127.0.0.1:1/secret' }); r.end(); }
      else if (q.url === '/lent') { /* jamais de reponse */ }
      else { r.writeHead(200, { 'Content-Type': 'image/jpeg' }); r.end('petit'); }
    });
    await new Promise<void>((ok) => local.listen(0, '127.0.0.1', ok));
    portLocal = (local.address() as net.AddressInfo).port;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-relais-'));
    fs.mkdirSync(path.join(tmp, 'sessions'));
    const config = path.join(tmp, 'banc-config.php');
    fs.writeFileSync(config, `<?php return ['motDePasse' => 'secret-banc', 'dossierDonnees' => ${JSON.stringify(path.join(tmp, 'apprentissage'))}];\n`);
    const port = await portLibre();
    base = 'http://127.0.0.1:' + port;
    serveur = spawn('php', ['-d', 'session.save_path=' + path.join(tmp, 'sessions'), '-S', '127.0.0.1:' + port, '-t', path.join(racine, 'public')], { env: { ...process.env, BANC_CONFIG: config }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { await fetch(base + '/api.php?r=etat'); return; } catch { await new Promise((ok) => setTimeout(ok, 100)); }
    }
  });
  afterAll(() => { local.closeAllConnections(); local.close(); serveur.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const demander = (chemin: string, max: number, delai = 5) => essaiLibre({ mode: 'demander', url: `http://hote.essai:${portLocal}${chemin}`, hote: 'hote.essai', ip: '127.0.0.1', max, delai }) as Promise<{ code?: number; trop?: boolean; taille?: number; location?: string | null; refus?: string }>;
  const relais = async (params: Record<string, string>) => {
    const r = await fetch(base + '/api.php?' + new URLSearchParams({ r: 'relais', ...params }).toString(), { headers: cookie ? { Cookie: cookie } : {} });
    return { statut: r.status, type: r.headers.get('content-type'), erreur: ((await r.json().catch(() => null)) as { erreur?: string } | null)?.erreur ?? null };
  };

  it('la lecture s’arrête à la borne, même sans taille annoncée, et refuse une taille annoncée trop grande', async () => {
    expect(await demander('/petit', 1000)).toMatchObject({ code: 200, trop: false, taille: 5 });
    // 4 Mo envoyes par morceaux, sans Content-Length : la lecture s'arrete des que la borne est passee.
    const gros = await demander('/gros', 100000);
    expect(gros.trop).toBe(true);
    expect(gros.taille ?? Infinity).toBeLessThanOrEqual(100000);
    expect(await demander('/annonce', 100000)).toMatchObject({ trop: true });
  });
  it('aucune redirection n’est suivie d’office, et un hôte muet est abandonné après le délai', async () => {
    expect(await demander('/ailleurs', 1000)).toMatchObject({ code: 302, location: 'http://127.0.0.1:1/secret', taille: 0 });
    const t0 = Date.now(), r = await demander('/lent', 1000, 1);
    expect(r).toMatchObject({ code: 504, refus: 'l’hôte hote.essai ne répond pas à temps' });
    expect(Date.now() - t0).toBeLessThan(4000);
  });
  it('en service, la lecture ne parle que https', async () => {
    expect((await essaiLibre({ mode: 'https-seul', url: `http://hote.essai:${portLocal}/petit`, hote: 'hote.essai', ip: '127.0.0.1' }) as { refus: string | null }).refus).toMatch(/injoignable/);
  });
  it('la route : connexion requise, identifiant et taille validés, réponses d’erreur en JSON sans rien demander au réseau', async () => {
    expect((await relais({ id: '5e1f6b8d-9d21-4fbd-96f9-0390a79d9b58', taille: 'sd' })).statut).toBe(401);
    const c = await fetch(base + '/api.php?r=connexion', { method: 'POST', headers: { 'X-Banc': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ motDePasse: 'secret-banc' }) });
    cookie = (c.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(c.status).toBe(200);
    for (const id of ['', 'x', '../../banc-config.php', 'https://127.0.0.1/', '5E1F6B8D-9D21-4FBD-96F9-0390A79D9B58']) {
      expect(await relais({ id, taille: 'sd' })).toMatchObject({ statut: 400, type: 'application/json; charset=utf-8', erreur: 'Relais Panoramax : identifiant de photo invalide.' });
    }
    expect(await relais({ id: '5e1f6b8d-9d21-4fbd-96f9-0390a79d9b58', taille: 'tout' })).toMatchObject({ statut: 400, erreur: 'Relais Panoramax : taille inconnue (hd, sd ou vignette).' });
    // Une adresse glissee en parametre ne sert a rien : la route ne lit que l'identifiant et la taille.
    expect(await relais({ id: 'abc', taille: 'sd', url: 'https://127.0.0.1/' })).toMatchObject({ statut: 400 });
  });
  it('la route : un débit borné par session', async () => {
    // Des demandes invalides (elles comptent aussi, et ne touchent pas le reseau) jusqu'a la limite d'une minute.
    let refusees = 0, autres = 0;
    for (let lot = 0; lot < 10; lot++) {
      const l = await Promise.all(Array.from({ length: 20 }, () => relais({ id: 'x', taille: 'sd' })));
      for (const r of l) { if (r.statut === 429) refusees++; else if (r.statut === 400) autres++; }
    }
    // Sept demandes ont deja ete comptees par le test d'avant : 180 par minute en tout.
    expect(autres).toBe(180 - 7);
    expect(refusees).toBe(200 - autres);
  }, 30000);
});
