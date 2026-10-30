// Assemble `livraison/` : le deploiement Apache + PHP, sans Node (MD/spec-demos-admin.md).
//
//   npm run livraison                       origine de production (https://www.raillard.org)
//   BACKPROD_API_URL=https://… npm run livraison
//
// Le dossier produit se depose tel quel dans le dossier publie de l'hote (public_html/ ou un
// sous-dossier). `livraison.zip`, a cote, est le meme contenu en une archive a televerser.
//
//   index.html                 la page de l'application
//   assets/                    son programme en morceaux (plan-<empreinte>.js) et sa feuille de style (plan-<empreinte>.css)
//   .htaccess                  en-tetes, politique de contenu, renvoi de `admin/…` vers admin.php
//   admin.php                  l'admin des fichiers de demo (mot de passe verifie ici) et la sauvegarde de data/
//   donnees.php                ou vivent les donnees (data/ a cote de public_html/), inclus par admin.php et analyse.php
//   admin-config.exemple.php   a copier HORS du dossier publie, mot de passe a changer
//   analyse.php                l'analyse par Claude (batch Anthropic, plafonds, journal), sous la session admin
//   analyse-fonctions.php      ses constantes et ses fonctions, incluses par analyse.php
//   prompt-analyse.md          le prompt versionne de l'analyse, lu par analyse.php
//   schema-analyse.json        le schema de sortie versionne de l'analyse
//   prompt-facade.md           le prompt versionne du run d'une facade (lots F2 et F3, genere par npm run regles:generer)
//   schema-facade.json         son schema de sortie versionne
//   prompt-plu.md              le prompt versionne de la lecture du reglement du PLU (lot L4, genere par npm run regles:generer)
//   schema-plu.json            son schema de sortie versionne, son exemple et sa consigne de repli
//   prompt-jardin.md           le prompt versionne de la lecture du jardin (lot L3, genere par npm run regles:generer)
//   schema-jardin.json         son schema de sortie versionne
//   prompt-facade-enrichie.md  le prompt versionne de la lecture enrichie d'une facade (lot L1, genere par npm run regles:generer)
//   schema-facade-enrichie.json son schema de sortie versionne
//   claude-tarifs.json         la premiere table des tarifs, posee dans data/claude/ au premier usage
//   data/demo/1.json           la demonstration integree, premiere demo de l'admin (data/ se pose hors racine)
//   data/demo/2.json…          les autres demos livrees, copiees de deploy/plan-demos/ (Peyrusse-le-Roc, voisinage 1 km et 5 km)
//   data/admin/arbres.json     la bibliotheque d'essences d'arbres livree (quarante essences, dix par taille) : le code n'en a aucune
//   cerfa/cerfa_13703-12.pdf   le formulaire officiel de la declaration prealable, rempli par la page
//   LISEZMOI-DEPLOIEMENT.txt   les etapes

import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = resolve(racine, 'livraison');
const origine = process.env.BACKPROD_API_URL || 'https://www.raillard.org';

execSync('npx vite build', { cwd: racine, stdio: 'inherit', env: { ...process.env, BACKPROD_API_URL: origine } });
execSync('node scripts/verifier-paquet.mjs dist/index.html', { cwd: racine, stdio: 'inherit' });


rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
cpSync(resolve(racine, 'dist/index.html'), resolve(sortie, 'index.html'));
// Le programme, sorti de la page au build (deploy/scripts-page.mjs) : sans lui, la page ne fait rien.
cpSync(resolve(racine, 'dist/assets'), resolve(sortie, 'assets'), { recursive: true });
cpSync(resolve(racine, 'dist/.htaccess'), resolve(sortie, '.htaccess'));
cpSync(resolve(racine, 'deploy/admin.php'), resolve(sortie, 'admin.php'));
// Ou vivent les donnees : inclus par admin.php et analyse.php, il doit etre a cote d'eux.
cpSync(resolve(racine, 'deploy/donnees.php'), resolve(sortie, 'donnees.php'));
cpSync(resolve(racine, 'deploy/admin-config.exemple.php'), resolve(sortie, 'admin-config.exemple.php'));
// L'analyse par Claude (MD/spec-audit.md 13.2) : le proxy, son prompt, son schema et ses tarifs.
for (const f of ['analyse.php', 'analyse-fonctions.php', 'prompt-analyse.md', 'schema-analyse.json', 'prompt-facade.md', 'schema-facade.json', 'prompt-plu.md', 'schema-plu.json', 'prompt-jardin.md', 'schema-jardin.json', 'prompt-facade-enrichie.md', 'schema-facade-enrichie.json', 'claude-tarifs.json']) cpSync(resolve(racine, 'deploy', f), resolve(sortie, f));
// Le formulaire officiel de la declaration prealable, que la page demande a cote d'elle.
cpSync(resolve(racine, 'dist/cerfa'), resolve(sortie, 'cerfa'), { recursive: true });

const version = JSON.parse(readFileSync(resolve(racine, 'package.json'), 'utf8')).version;

// La premiere demo de l'admin : la demonstration integree, au format de l'export ({meta, objects,
// measures}). Elle vient de contrat/plan-produit.json, que tests/unit/contrat-produit.test.ts garde
// identique au code (model/demo.ts) : la livraison n'a pas a compiler du TypeScript pour l'avoir.
// Pas d'horodatage dans `meta` : deux livraisons du meme commit donnent le meme fichier.
const contrat = JSON.parse(readFileSync(resolve(racine, 'contrat/plan-produit.json'), 'utf8'));
const demo = contrat.demo_project;
if (!demo || !Array.isArray(demo.document?.objects) || !demo.document.objects.length) {
  throw new Error('contrat/plan-produit.json : pas de demo_project a livrer');
}
// Rangees comme sur l'hebergement : data/demo/ (deploy/donnees.php).
mkdirSync(resolve(sortie, 'data/demo'), { recursive: true });
writeFileSync(resolve(sortie, 'data/demo/1.json'), JSON.stringify({
  meta: { id: '1', name: demo.name, appVersion: contrat.app_version, schemaVersion: demo.schema_version, exportedBy: 'livraison' },
  objects: demo.document.objects,
  measures: demo.document.measures || []
}, null, 2) + '\n');
// Les autres demos livrees : des exports de Plan ranges dans deploy/plan-demos/, copies tels quels.
const autresDemos = resolve(racine, 'deploy/plan-demos');
if (existsSync(autresDemos)) cpSync(autresDemos, resolve(sortie, 'data/demo'), { recursive: true });
// La bibliotheque d'essences d'arbres : un fichier de donnees (data/admin/arbres.json), lu par la 3D et retouche par Admin › Arbres.
mkdirSync(resolve(sortie, 'data/admin'), { recursive: true });
cpSync(resolve(racine, 'data/admin/arbres.json'), resolve(sortie, 'data/admin/arbres.json'));
let commit = 'inconnu';
try { commit = execSync('git rev-parse --short HEAD', { cwd: racine, encoding: 'utf8' }).trim(); } catch { /* hors git */ }

writeFileSync(resolve(sortie, 'LISEZMOI-DEPLOIEMENT.txt'), `Plan ${version} (${commit}) - deploiement Apache + PHP, sans Node.js
Plateforme : ${origine}

Sur l'hebergement, trois choses voisines :
   public_html/                 le site (le contenu de cette livraison, sauf data/)
   plan-admin-config.php        la configuration, HORS de public_html/
   data/                        toutes les donnees du serveur, HORS de public_html/ :
     demo/                      les demos de l'admin et de la vitrine ?mode=demo (1.json...)
     admin/                     palette.json, controleurs.json, echecs.json
     claude/                    journal-AAAA-MM.jsonl, tarifs.json, plafonds.json, modeles.json, batches/,
                                analyses/sans-depot/<organisation>/<AAAA-MM>/ (la trace des requetes
                                qui ne nomment pas d'audit, et leurs images ; gardee 24 mois)
     audits/                    les audits recus, un dossier chacun, classes :
       parcelle/<IDU>/<id>/     audit.json (le fichier tel qu'il est arrive), fiche.json,
                                decisions.json (propositions et ce qui en a ete fait),
                                analyses/<date>-<modele>-<n>/ (entrant.json : ce qui est parti
                                chez Claude ; sortant.json : ce qu'il a rendu ; resume.json),
                                images/ (les images envoyees, une fois par audit)
       promenade/<commune>/<id>/  les memes, pour les promenades des toits
       index.json               la liste rapide ; se reconstruit s'il est supprime
                                (<id> commence par la date et l'heure de reception)
     conformite/                mesures.json
     migration.json             ce que le premier passage a deplace d'un ancien dossier

1. Televerser le contenu de ce dossier dans le dossier publie, par exemple public_html/ : le plus
   sur est d'y envoyer livraison.zip et de l'extraire sur place (Gestionnaire de fichiers de Site
   Tools, clic droit > Extract), qui n'oublie ni le dossier assets/ ni le fichier cache .htaccess.
   - index.html et assets/ vont ensemble : la page appelle son programme, en morceaux
     (assets/plan-<empreinte>.js, certains charges seulement a l'usage) et sa feuille de style
     (assets/plan-<empreinte>.css). Sans le dossier assets/ COMPLET de la meme livraison, la page
     reste blanche ou un ecran ne s'ouvre pas. Les anciens assets/plan-* peuvent etre supprimes,
     ou laisses : ils ne servent plus.
   - assets/vendor/ porte les bibliotheques chargees a la demande (three.js pour la Vue 3D, EZ-tree
     pour les arbres, pdf-lib pour le dossier de declaration), a leur version : sans lui, la Vue 3D
     ne s'ouvre pas. Les anciennes versions de assets/vendor/ peuvent etre supprimees.
   - .htaccess pose le cache, les en-tetes de securite et la route admin/.
   - admin.php, analyse.php, analyse-fonctions.php et donnees.php vont ensemble : admin.php et
     analyse.php incluent donnees.php, analyse.php inclut analyse-fonctions.php.
   - data/ de la livraison ne reste pas dans public_html/ (voir 2.c) ; .htaccess le refuse de
     toute facon (404). Ne pas y laisser non plus d'ancien api.php.

2. Admin des demos (facultatif) :
   a. Copier admin-config.exemple.php a cote de public_html/ (le dossier au-dessus de la racine
      web, pas dedans), sous le nom plan-admin-config.php. Cela vaut aussi si Plan est dans un
      sous-dossier de public_html/.
   b. Y remplacer « A-CHANGER » par le mot de passe admin. Le reglage dossierDonnees (par defaut
      data/ a cote de ce fichier) dit ou vivent toutes les donnees.
   c. Premiere installation : deplacer le dossier data/ de cette livraison a cote de
      plan-admin-config.php (hors de public_html/). Il contient data/demo/1.json, la
      demonstration integree, premiere demo de l'admin, 2.json et 3.json, Peyrusse-le-Roc avec un
      voisinage d'un et de cinq kilometres (3.json pese 4 Mo et s'ouvre en quelques secondes). Les
      demos enregistrees ensuite y sont rangees : une nouvelle mise en ligne ne les touche pas.
      Si data/ existe deja la-bas, ne pas l'ecraser : ce sont vos donnees. Pour recevoir une demo
      livree, copier ce seul fichier dans data/demo/, apres avoir garde l'ancien si vous l'aviez
      modifie. Puis supprimer public_html/data/.
      Les arbres : data/admin/arbres.json est la bibliotheque d'essences (quarante essences, dix par
      taille : petits, moyens, grands, tres grands) que la 3D lit et que l'ecran Admin > Arbres
      retouche. Le code n'en a aucune : sans ce fichier, les arbres se dessinent en tronc et boule.
      Sur une installation qui a deja data/, copier ce seul fichier dans data/admin/ (garder l'ancien
      s'il a ete retouche dans l'admin).
   d. Droits : data/ et ses sous-dossiers doivent etre lisibles et inscriptibles par PHP (dossiers
      755, fichiers 644, meme utilisateur que le site). Un fichier present mais illisible, ou une
      configuration absente, laisse la vitrine (?mode=demo&file=<n>) sur la demonstration
      integree : la raison se lit alors sur https://<hote>/admin/vitrine/<n> et dans la console.
   Sans ce fichier de configuration, l'admin n'existe pas (admin/... repond 404).

   e. Venir d'une version d'avant data/ (un plan-demos/ a cote de plan-admin-config.php) :
      - Tant que plan-admin-config.php dit 'dossierDemos' (et pas 'dossierDonnees'), rien ne
        bouge : Plan lit et ecrit plan-demos/ comme avant (demos, claude/, audits/, conformite/,
        .palette.json). La mise en ligne est sans risque ; passer a data/ quand vous voulez.
      - Pour passer a data/ : NE PAS copier data/ de la livraison (2.c). Dans
        plan-admin-config.php, remplacer la ligne  'dossierDemos' => __DIR__ . '/plan-demos',
        par  'dossierDonnees' => __DIR__ . '/data',  puis ouvrir https://<hote>/?admin. A ce
        premier passage, Plan deplace le contenu de plan-demos/ dans data/ : les demos dans
        data/demo/, .palette.json et .controleurs.json dans data/admin/, claude/, audits/ et
        conformite/ tels quels. Rien n'est ecrase : ce qui existe deja dans data/ reste, et
        l'element de plan-demos/ correspondant reste ou il est. data/migration.json dit ce qui a
        ete deplace et ce qui est reste ; plan-demos/ recoit DEPLACE-VERS-DATA.txt. Le voir aussi
        sur https://<hote>/admin/claude/etat (session admin) : "donnees" : "disposition": "data",
        "migration": {...}.
      - Ensuite seulement, copier dans data/demo/ les demos livrees qui vous manquent, puis
        supprimer plan-demos/ s'il ne contient plus que DEPLACE-VERS-DATA.txt.
      - Revenir en arriere : remettre la ligne 'dossierDemos' et redeplacer les fichiers a la main.

   f. Analyse par Claude (facultatif) : dans plan-admin-config.php, remplacer « A-CHANGER » de
      anthropicCle par la cle d'API Anthropic (console.anthropic.com, Settings > API keys). Elle
      ne quitte jamais le serveur. analyse.php range ses donnees dans data/claude/ :
      journal-AAAA-MM.jsonl (une ligne par appel, tokens et cout, les empreintes de l'image et de
      la reponse, ni photo ni reponse), tarifs.json (pose au premier usage depuis
      claude-tarifs.json), plafonds.json (1 $ par jour et 10 $ par mois tant qu'il n'existe pas),
      batches/ (les batches en cours), analyses/sans-depot/ (la trace de chaque requete qui ne
      nomme pas d'audit : calibration, releve, analyse sans depot ; l'image envoyee et la reponse
      brute ; chaque mois s'efface 24 mois apres, comme le journal se consulte). Tout est sous
      data/, hors de public_html/ : aucune regle .htaccess de plus. Sans cle,
      admin/claude/... repond 503. Le tableau de bord (menu Admin > Consommation de Claude,
      ?admin&ecran=consommation) relit ce journal ; il y regle aussi les tarifs et les plafonds.

   g. Audits (parcelle et promenade ; sauvegardes pendant la capture, partages pour le corpus,
      deposes par l'administrateur) : analyse.php les range dans data/audits/, 48 Mo au plus par
      audit, et garde avec chaque audit, dans data/audits/<id>/, tout ce qui est parti chez Claude
      et tout ce qu'il a rendu (analyses, rejeux, escalades, runs des facades) : rien n'est jete.
      Le menu Admin > Audits les liste, les montre et les rejoue ; « Exporter les donnees
      d'analyse » y rend, pour une periode, chaque requete de tous les audits et hors audit et
      chaque proposition avec sa decision (JSON ou CSV ; les images par empreinte seulement). Un audit se lit et se decode en memoire : dans la
      configuration de PHP de l'hebergement (Site Tools > Devs > PHP Manager > PHP Variables, ou un
      fichier .user.ini dans public_html/), porter memory_limit a 256M et post_max_size a 64M
      (128M et 8M par defaut). Sans cela, un gros audit (dix facades de huit photos, environ 32 Mo)
      peut echouer en 500, et la page le dit sous « Envoyer l'audit au serveur ».

   h. Sauvegarde : Plan ne jette rien, mais ne sauvegarde rien tout seul. Toutes les donnees sont
      dans data/ (hors de public_html/) :
      - Verifier que la sauvegarde automatique de l'hebergeur couvre bien ce dossier (chez
        SiteGround : Site Tools > Security > Backups ; elle prend tout le compte, data/ compris,
        et garde plusieurs jours). Y faire une sauvegarde manuelle avant une operation risquee.
      - Menu Admin > « Telecharger une sauvegarde des donnees » (https://<hote>/admin/sauvegarde,
        session admin) : une archive plan-data-AAAA-MM-JJ-HHMM.zip de tout data/ (demos, audits et
        analyses de Claude, journal et reglages de Claude, palette, arbres, conformite), avec
        sauvegarde.json (date, nombre de fichiers, taille). Ni la configuration ni la cle d'API n'y
        sont. La telecharger AVANT chaque mise a jour de Plan, et la garder hors de l'hebergement.
        Restaurer : extraire l'archive et remettre son dossier data/ a la place de celui du serveur.
      - Sans l'extension PHP zip, la route repond 501 : l'activer dans Site Tools > Devs >
        PHP Manager > PHP Extensions.

3. Verifier :
   - https://<hote>/                 l'atelier (connexion plateforme) ; page blanche : la console
                                     du navigateur dit quel fichier manque
   - https://<hote>/?admin           le mot de passe admin, puis les demos
   - https://<hote>/?demofile=1      la demo 1 (admin seulement)
   - https://<hote>/admin/demos      doit repondre 401 sans session
   - https://<hote>/admin/claude/etat   401 sans session ; avec la session admin, "actif": true
                                       si la cle Anthropic est posee, et "donnees" (2.e)
   - https://<hote>/admin/consommation  401 sans session ; avec, le journal des 30 derniers jours
   - https://<hote>/admin/sauvegarde    401 sans session ; avec, l'archive zip de data/ (2.h)
   - https://<hote>/?mode=demo&file=1   la vitrine publique sur la demo 1 (sans mot de passe)
   - https://<hote>/admin/vitrine/1     le JSON de la demo 1, sans mot de passe ; sinon la vitrine
                                       montre la demonstration integree, et la reponse dit pourquoi
   - https://<hote>/data/demo/1.json   doit repondre 404 (data/ n'est jamais servi)
   - npm run verifier-deploiement https://<hote>   (depuis le depot)

Une demo est un fichier JSON au format de l'export de Plan ({meta, objects, measures}).
Sans aucune demo (data/demo/ absent ou vide), le premier ?admin propose d'en creer une : « Ouvrir
le plan de demonstration » cree la demo 1.
`);

const zip = resolve(racine, 'livraison.zip');
rmSync(zip, { force: true });
execSync('zip -q -r ' + JSON.stringify(zip) + ' .', { cwd: sortie });
if (!existsSync(zip)) throw new Error('livraison.zip absent');
console.log('livraison/ et livraison.zip : Plan ' + version + ' (' + commit + '), plateforme ' + origine);
