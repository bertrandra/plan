<?php
// L'analyse par Claude pour un hebergement Apache + PHP, sans Node (MD/spec-audit.md 13.2 et 13.3,
// plan D1) : le proxy de l'API Message Batches d'Anthropic, ses plafonds et son journal.
//
// `.htaccess` renvoie `admin/claude/<chemin>` ici, avec `?chemin=<chemin>` : sous `admin/`,
// le cookie de la session admin (admin.php) arrive aussi ici, et un seul mot de passe suffit.
//
//   GET  admin/claude/etat                    cle configuree ou non, versions du prompt et du schema
//   POST admin/claude/batches                 cree un batch (une requete par passe) apres les plafonds
//   GET  admin/claude/batches/<id>            son etat, lu chez Anthropic
//   GET  admin/claude/batches/<id>/resultats  ses resultats ; le journal recoit une ligne par requete
//   POST admin/claude/messages                l'appel immediat (run d'une facade, trois passes au plus ; lecture du PLU, un PDF)
//   POST admin/claude/rejouer                 rejoue le run d'une facade gardee, depuis son image (administrateur, lot L0)
//   GET  admin/claude/donnees-analyse         l'export « données d'analyse » a travers les audits (administrateur, lot L0)
//   GET  admin/claude/images/<sha256>.<ext>   une image gardee par une trace, par son empreinte (administrateur, lot L0)
//   GET|PUT admin/claude/tarifs              la table des tarifs datee
//   GET|PUT admin/claude/plafonds             les plafonds par organisation, par jour et par mois
//   GET|PUT admin/claude/modeles              le modele de chaque usage, choisi par l'administrateur
//   GET|PUT|DELETE admin/claude/regles        le brouillon des regles (prompt et schema edites dans Admin › Regles), administrateur
//   GET  admin/consommation                  le journal filtre, pour le tableau de bord (13.3, L16 bis)
//   POST admin/audits                         depose un fichier `plan-audit-parcelle` (15, lot L21)
//   GET  admin/audits                         la liste des audits recus (administrateur)
//   GET  admin/audits/<id>                    un audit recu (administrateur)
//   PUT  admin/audits/<id>                    le remplace (la sauvegarde de la capture) : son secret, ou l'administrateur
//   DELETE admin/audits/<id>                  le retire : son secret de retrait, ou l'administrateur
//   GET|POST admin/conformite                 l'historique des mesures de conformite, une mesure de plus (T13.5, G3)
//
// Les audits partages pour le corpus (spec-audit 15, decision D7) : l'utilisateur coche « Partager
// cet audit pour améliorer Plan » ; le fichier arrive ici, par la session admin ou le jeton de la
// plateforme (`Authorization: Bearer`, verifie aupres d'elle, `plateformeUrl` de la configuration).
// Ils se rangent dans `data/audits/` (donnees.php), avec les autres donnees de l'admin, hors du dossier
// publie. L'envoi rend un secret de retrait, garde sur l'appareil, seul a pouvoir retirer le fichier
// quand la personne decoche la case ; le serveur n'en garde que l'empreinte. La sauvegarde de la
// capture (15) arrive par la meme route, marquee `X-Plan-Depot: sauvegarde`, et chaque envoi remplace
// son depot (PUT) ; sans marque, un depot est un partage pour le corpus.
//
// Taille : 48 Mo au plus (TAILLE_MAX). Le fichier se lit par `php://input`, que `post_max_size`
// (8 Mo par defaut) ne coupe pas pour un corps JSON (PHP n'en ecrit qu'un avertissement au journal) ;
// un hebergement qui le jetterait quand meme laisse un corps vide, et la route le dit. La vraie borne
// est `memory_limit` (128 Mo par defaut) : le texte et son JSON decode tiennent ensemble en memoire,
// ~3 fois la taille du fichier. A regler dans la configuration de PHP de l'hebergement (php.ini, ou
// `.user.ini` du dossier publie) : `memory_limit = 256M`, et `post_max_size = 64M` pour le journal.
//
// **La cle ne quitte jamais le serveur** (`anthropicCle`, dans la configuration hors du dossier
// publie), et la page ne choisit ni le prompt, ni le schema, ni le reglage : elle n'envoie que la
// partie propre a la maison (images et texte). Sans quoi la cle servirait a n'importe quoi.
//
// Qui peut appeler (plan D1, lot L17) : la session admin d'admin.php, ou un utilisateur de la
// plateforme par son jeton (`Authorization: Bearer`), verifie aupres de la plateforme elle-meme
// (`GET /api/v1/me/context`, `plateformeUrl` de la configuration) : son organisation (`tenant.id`)
// est celle du journal et des plafonds. Un utilisateur ne voit que `etat` et ses propres batches ;
// tarifs, plafonds et consommation restent a l'administrateur.
//
// Defenses : celles d'admin.php (en-tete `X-Plan-Admin: 1` sur toute ecriture, 404 partout sans
// configuration) ; seuls les batches crees ici se lisent, et par l'organisation qui les a crees ;
// ecriture atomique et `.bak` pour les JSON ; le journal ne fait que s'allonger, verrouille. Il ne
// garde ni photo ni contenu de reponse : les compteurs de `usage`, l'identite de la parcelle, le
// cout calcule avec la table des tarifs en vigueur le jour de l'appel, et les empreintes de l'image
// et de la reponse. L'image et la reponse elles-memes vont a la trace de la requete (lot L0), dans
// le dossier de l'audit nomme ou sous claude/analyses/sans-depot/, hors de la racine web comme le reste.
//
// L'appel se fait en HTTP direct (cURL, sinon les flux de PHP) : l'hebergement n'a pas Composer,
// et le SDK PHP d'Anthropic ne s'y installe pas.
//
// Les constantes et les fonctions sont dans analyse-fonctions.php (rien n'y s'execute a l'inclusion) :
// ce fichier-ci lit la configuration et la session, puis sert les routes.

declare(strict_types=1);

require __DIR__ . '/analyse-fonctions.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function repondre(int $statut, $corps = null): void {
    http_response_code($statut);
    if ($corps !== null && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }
    exit;
}

function erreur(int $statut, string $code, string $message, array $plus = []): void {
    repondre($statut, ['error' => ['code' => $code, 'message' => $message]] + $plus);
}

// --- La configuration (celle d'admin.php, cherchee aux memes endroits) -------------------------
$config = null;
$fichierConfig = null;
$racineWeb = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
foreach ([getenv('PLAN_ADMIN_CONFIG') ?: null, $racineWeb !== '' ? dirname($racineWeb) . '/plan-admin-config.php' : null,
          dirname(__DIR__) . '/plan-admin-config.php', __DIR__ . '/admin-config.php'] as $f) {
    if ($f && is_file($f)) { $config = require $f; $fichierConfig = $f; break; }
}
$motDePasse = is_array($config) ? (string)($config['motDePasse'] ?? '') : '';
if ($motDePasse === '' || $motDePasse === 'A-CHANGER') erreur(404, 'NOT_FOUND', 'Introuvable');
$cle = (string)($config['anthropicCle'] ?? '');
$avecCle = $cle !== '' && $cle !== 'A-CHANGER';
$anthropicUrl = rtrim((string)($config['anthropicUrl'] ?? 'https://api.anthropic.com'), '/');
$plateformeUrl = rtrim((string)($config['plateformeUrl'] ?? 'https://www.raillard.org'), '/');
// Les donnees vivent dans data/, a cote de public_html/ (donnees.php) ; claude/, audits/ et
// conformite/ y ont le meme nom dans les deux dispositions, l'ancienne comprise.
require __DIR__ . '/donnees.php';
$donnees = dossiersDonnees($config, $racineWeb, __DIR__, $fichierConfig);
migrerDonnees($donnees);
$dossier = $donnees['racine'];
$dossierAudits = $dossier . '/audits';
$dossierClaude = $dossier . '/claude';
$dossierBatches = $dossierClaude . '/batches';
if (!is_dir($dossierBatches) && !@mkdir($dossierBatches, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier claude/ impossible a creer (droits du dossier des donnees) : ' . $dossierBatches . '.');

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$lecture = $methode === 'GET' || $methode === 'HEAD';
$chemin = trim((string)($_GET['chemin'] ?? ''), '/');
if (!$lecture && ($_SERVER['HTTP_X_PLAN_ADMIN'] ?? '') !== '1') erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');

// --- La session d'admin.php, lue sans etre ecrite -----------------------------------------------
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]) === 'https';
$cheminCookie = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/analyse.php'))), '/') . '/admin/';
session_name('plan_admin');
session_set_cookie_params(['lifetime' => 8 * 3600, 'path' => $cheminCookie, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
session_start(['read_and_close' => true]);
$sessionAdmin = isset($_SESSION['admin']) && is_int($_SESSION['admin']) && $_SESSION['admin'] > time();
// Les audits partages (`@audits`, lot L21) : leur retrait se fait aussi par le seul secret rendu a
// l'envoi ; leur route verifie elle-meme qui appelle.
$routeAudits = preg_match('#^@audits(/|$)#', $chemin) === 1;

/** Le jeton porteur de la plateforme, s'il y en a un ; Apache le passe parfois via REDIRECT_. */
function jetonPorteur(): ?string {
    $v = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    return preg_match('/^Bearer\s+([A-Za-z0-9._~+\/=-]{16,4096})$/', trim($v), $m) ? $m[1] : null;
}

$sansCle = fn() => erreur(503, 'NOT_CONFIGURED', 'Clé Anthropic absente : anthropicCle dans plan-admin-config.php.');

// --- Les routes ---------------------------------------------------------------------------------
try {
    // `admin/conformite` (.htaccess : `chemin=@conformite`) : les mesures des indicateurs (13.5, G3),
    // a l'administrateur seul.
    if ($chemin === '@conformite') {
        if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
        $fConformite = $dossier . '/conformite/mesures.json';
        $lu = lireJson($fConformite);
        $mesures = is_array($lu['mesures'] ?? null) ? $lu['mesures'] : [];
        if ($lecture) repondre(200, ['format' => 'plan-conformite', 'version' => 1, 'mesures' => $mesures]);
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MESURE_MAX + 1);
        if (strlen($texte) > TAILLE_MESURE_MAX) erreur(413, 'TOO_LARGE', 'Mesure trop grosse (2 Mo au plus).');
        $d = json_decode($texte, true);
        if ($d === null) throw new Refus('JSON illisible.');
        $mesure = verifierMesureConformite($d);
        $mesure['recuLe'] = maintenant();
        $mesures[] = $mesure;
        $gardees = array_slice($mesures, -MESURES_CONFORMITE_MAX);
        ecrireJson($fConformite, ['format' => 'plan-conformite', 'version' => 1, 'mesures' => $gardees]);
        repondre(201, ['recuLe' => $mesure['recuLe'], 'mesures' => count($gardees)]);
    }

    // `admin/audits` (.htaccess : `chemin=@audits/<id>`) : les audits de parcelle et de promenade
    // (15, L21), et pour chacun ses analyses et rejeux (15.5).
    if ($routeAudits) {
        $reste = trim(substr($chemin, strlen('@audits')), '/');
        $parts = $reste === '' ? [] : explode('/', $reste);
        $id = $parts[0] ?? '';
        if ($id === '') {
            if ($lecture) {
                if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
                repondre(200, ['audits' => listeAudits($dossierAudits)]);
            }
            if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
            $organisation = acteur($sessionAdmin, jetonPorteur(), $plateformeUrl)['organisation'];
            $texte = texteAudit();
            $d = json_decode($texte, true);
            if ($d === null) throw new Refus('JSON illisible.');
            $parcelle = verifierAudit($d);
            // Une promenade se depose par l'administrateur seul (son ecran des audits).
            if ($parcelle['nature'] === 'promenade' && !$sessionAdmin) erreur(403, 'FORBIDDEN', 'Réservé à l’administrateur.');
            $marque = marqueAudit((string)($_SERVER['HTTP_X_PLAN_DEPOT'] ?? ''));
            $t = maintenant();
            $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
            $retrait = bin2hex(random_bytes(24));
            $fiche = ['id' => $id, 'recuLe' => $t, 'organisation' => $organisation] + $parcelle
                + ['taille' => strlen($texte), 'marque' => $marque] + resumeAudit($d) + ['retrait' => hash('sha256', $retrait)];
            $dir = $dossierAudits . '/' . dossierRelatifAudit($fiche);
            ecrireAudit($dir, $texte);
            ecrireFicheAudit($dossierAudits, $dir, $fiche, $d);
            repondre(201, ['id' => $id, 'retrait' => $retrait]);
        }
        if (!preg_match(ID_AUDIT, $id)) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');
        $dir = dossierAudit($dossierAudits, $id);
        $fiche = $dir !== null ? lireJson($dir . '/fiche.json') : null;
        if ($fiche === null || $dir === null) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $id . ' ».');

        // Ses analyses et rejeux, et les images qu'ils ont envoyees : a l'administrateur seul, en lecture.
        if (count($parts) > 1) {
            if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
            if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
            if ($parts[1] === 'analyses' && count($parts) === 2) repondre(200, ['analyses' => listeTraces($dir)]);
            if ($parts[1] === 'analyses' && count($parts) === 3) {
                $dt = dossierTrace($dossierAudits, $id, $parts[2]);
                if ($dt === null) erreur(404, 'NOT_FOUND', 'Aucune analyse « ' . $parts[2] . ' ».');
                repondre(200, ['format' => 'plan-audit-analyse-complete', 'version' => 1, 'audit' => $id, 'resume' => lireJson($dt . '/resume.json'),
                               'entrant' => lireJson($dt . '/entrant.json'), 'sortant' => lireJson($dt . '/sortant.json')]);
            }
            if ($parts[1] === 'images' && count($parts) === 3 && preg_match(IMAGE_TRACE, $parts[2]) && is_file($dir . '/images/' . $parts[2])) {
                $type = array_search(pathinfo($parts[2], PATHINFO_EXTENSION), EXTENSIONS_IMAGE, true);
                header('Content-Type: ' . $type);
                header('Cache-Control: private, max-age=86400, immutable');
                http_response_code(200);
                if ($methode !== 'HEAD') readfile($dir . '/images/' . $parts[2]);
                exit;
            }
            erreur(404, 'NOT_FOUND', 'Introuvable');
        }

        if ($lecture) {
            if (!$sessionAdmin) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(200);
            if ($methode !== 'HEAD') readfile($dir . '/audit.json');
            exit;
        }
        if ($methode !== 'DELETE' && $methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        // Le secret rendu a l'envoi, ou l'administrateur : personne d'autre ne remplace ni ne retire un audit.
        $secret = (string)($_SERVER['HTTP_X_PLAN_RETRAIT'] ?? '');
        $proprietaire = $secret !== '' && hash_equals((string)($fiche['retrait'] ?? ''), hash('sha256', $secret));
        if ($methode === 'PUT') {
            // Remplacer : comme deposer (session admin ou jeton), et par le secret de ce depot ou
            // l'administrateur. L'identifiant, le secret, l'organisation et le dossier du premier envoi restent.
            acteur($sessionAdmin, jetonPorteur(), $plateformeUrl);
            if (!$sessionAdmin && !$proprietaire) erreur(403, 'FORBIDDEN', 'Secret de retrait invalide.');
            $texte = texteAudit();
            $d = json_decode($texte, true);
            if ($d === null) throw new Refus('JSON illisible.');
            $parcelle = verifierAudit($d);
            $marque = marqueAudit((string)($_SERVER['HTTP_X_PLAN_DEPOT'] ?? ''), (string)($fiche['marque'] ?? 'corpus'));
            ecrireAudit($dir, $texte);
            ecrireFicheAudit($dossierAudits, $dir, array_merge($fiche, ['recuLe' => maintenant()], $parcelle, ['taille' => strlen($texte), 'marque' => $marque], resumeAudit($d)), $d);
            repondre(200, ['id' => $id, 'remplace' => true]);
        }
        if (!$sessionAdmin && !$proprietaire) erreur(403, 'FORBIDDEN', 'Secret de retrait invalide.');
        // Retirer emporte tout le dossier de l'audit, analyses et images comprises : la personne qui
        // reprend son accord reprend aussi ce qui en a ete tire.
        effacerDossier($dir);
        majIndex($dossierAudits, function (array $index) use ($id) { unset($index[$id]); return $index; });
        repondre(200, ['id' => $id, 'retire' => true]);
    }

    $qui = acteur($sessionAdmin, jetonPorteur(), $plateformeUrl);
    $organisation = $qui['organisation'];
    $reserveAdmin = function () use ($qui): void { if (!$qui['admin']) erreur(403, 'FORBIDDEN', 'Réservé à l’administrateur.'); };
    // Le dossier de l'audit nomme par une demande (`depot`), quand sa trace peut s'y ranger : il existe, et il est a cette
    // organisation (ou l'administrateur appelle). Sinon null : la trace se range sans depot (lot L0).
    $dirAuditPermis = function (?string $depot) use ($dossierAudits, $qui, $organisation): ?string {
        if ($depot === null) return null;
        $entree = indexAudits($dossierAudits)[$depot] ?? null;
        return is_array($entree) && ($qui['admin'] || ($entree['organisation'] ?? null) === $organisation) ? dossierAudit($dossierAudits, $depot) : null;
    };

    if ($chemin === 'etat') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        [$prompt, $schema] = promptEtSchema();
        // Un deploiement d'avant le lot F2 n'a pas les fichiers du run d'une facade : l'etat le dit, sans tomber.
        $versionsDe = function (string $usage): ?array {
            try {
                [$pU, $sU] = promptEtSchema($usage);
                return ['prompt' => $pU['version'], 'schema' => $sU['version']];
            } catch (Throwable $e) {
                return null;
            }
        };
        $facade = $versionsDe('facade');
        $plu = $versionsDe('plu');
        // La lecture du jardin (lot L3) : ses versions, ou null sur un deploiement d'avant.
        $jardin = $versionsDe('jardin');
        $parUsage = modelesParUsage(reglageModeles($dossierClaude));
        repondre(200, ['actif' => $avecCle, 'modeles' => MODELES, 'usages' => USAGES, 'modelesParUsage' => $parUsage, 'prompt' => $prompt['version'], 'schema' => $schema['version'], 'effort' => EFFORT,
                       'facade' => $facade, 'plu' => $plu, 'jardin' => $jardin, 'escaladeFacade' => escaladeFacade($parUsage, tarifs($dossierClaude), substr(maintenant(), 0, 10)), 'organisation' => $organisation, 'admin' => $qui['admin']]
                       + ($qui['admin'] ? ['donnees' => vueDonnees($donnees), 'brouillon' => vueBrouillonRegles(lireBrouillonRegles($dossierClaude))] : []));
    }

    // Le brouillon des regles (Admin › Regles) : a l'administrateur seul. Il ne change jamais le prompt
    // livre ; une demande qui le nomme (`essai`) le lit, les autres n'y touchent pas.
    if ($chemin === 'regles') {
        $reserveAdmin();
        $f = $dossierClaude . '/' . FICHIER_BROUILLON;
        if ($lecture) {
            $b = lireBrouillonRegles($dossierClaude);
            repondre(200, ['brouillon' => $b === null ? null : vueBrouillonRegles($b) + ['prompt_texte' => $b['prompt'], 'schema_texte' => $b['schema'], 'etat' => $b['etat'] ?? null]]);
        }
        if ($methode === 'DELETE') {
            if (is_file($f)) @unlink($f);
            repondre(200, ['brouillon' => null]);
        }
        if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $b = verifierBrouillonRegles(lireCorps(BROUILLON_MAX));
        ecrireJson($f, $b);
        repondre(200, ['brouillon' => vueBrouillonRegles($b)]);
    }

    // `admin/consommation` (.htaccess : `chemin=@consommation`) : il ne fait que relire le journal.
    if ($chemin === '@consommation') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $reserveAdmin();
        $aujourdhui = gmdate('Y-m-d');
        $f = lireFiltres($_GET, $aujourdhui);
        $p = plafonds($dossierClaude);
        // Chaque fichier mensuel est lu une fois, meme s'il sert a la periode, aux sept derniers
        // jours et au mois des plafonds.
        $lus = [];
        $mois = function (array $liste) use (&$lus, $dossierClaude): array {
            $l = [];
            foreach ($liste as $m) {
                if (!isset($lus[$m])) $lus[$m] = lireJournal($dossierClaude, $m . '-01');
                array_push($l, ...$lus[$m]);
            }
            return $l;
        };
        $periode = $mois(moisEntre($f['du'], $f['au']));
        $debutRecents = decalerJour($aujourdhui, -6);
        repondre(200, [
            'format' => 'plan-claude-consommation', 'du' => $f['du'], 'au' => $f['au'], 'aujourdhui' => $aujourdhui,
            'filtres' => ['organisation' => $f['organisation'], 'modele' => $f['modele'], 'usage' => $f['usage'], 'parcelle' => $f['parcelle']],
            'lignes' => filtrerConsommation($periode, $f),
            'recents' => filtrerConsommation($mois(moisEntre($debutRecents, $aujourdhui)), ['du' => $debutRecents, 'au' => $aujourdhui]),
            'organisations' => etatOrganisations($mois([substr($aujourdhui, 0, 7)]), $p, $aujourdhui),
            'choix' => choixConsommation($periode, $p),
        ]);
    }

    if ($chemin === 'tarifs' || $chemin === 'plafonds') {
        $reserveAdmin();
        if ($lecture) repondre(200, $chemin === 'tarifs' ? tarifs($dossierClaude) : plafondsJson(plafonds($dossierClaude)));
        if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $d = lireCorps(1024 * 1024);
        if ($chemin === 'tarifs') {
            verifierTarifs($d);
            if (!passeGarde(tarifs($dossierClaude), $d, substr(maintenant(), 0, 10))) erreur(409, 'PAST_PRICES', 'Un tarif passé ne se réécrit pas : ajoutez une ligne datée.');
            ecrireJson($dossierClaude . '/tarifs.json', $d);
            repondre(200, $d);
        }
        $d = plafondsJson(verifierPlafonds($d));
        ecrireJson($dossierClaude . '/plafonds.json', $d);
        repondre(200, $d);
    }

    // Le modele de chaque usage (13.2), a l'administrateur seul. Il vaut pour les envois suivants : un
    // batch deja cree garde le sien, ecrit dans sa fiche.
    if ($chemin === 'modeles') {
        $reserveAdmin();
        if ($lecture) repondre(200, vueModeles(reglageModeles($dossierClaude)));
        if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $d = verifierModeles(lireCorps(64 * 1024));
        // `usages` reste un objet en JSON, meme vide.
        ecrireJson($dossierClaude . '/modeles.json', ['format' => $d['format'], 'usages' => (object)$d['usages']]);
        repondre(200, vueModeles(reglageModeles($dossierClaude)));
    }

    if ($chemin === 'batches') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $demande = verifierDemande(lireCorps(TAILLE_MAX), $p, modelesParUsage(reglageModeles($dossierClaude)));
        // Le rejeu (15.5) : l'administrateur seul, sur un audit range, l'analyse des maisons seule.
        if ($demande['usage'] === 'rejeu') {
            $reserveAdmin();
            if ($demande['depot'] === null) throw new Refus('Un rejeu nomme son audit (depot).');
            foreach ($demande['requetes'] as $r) if ($r['usage'] !== 'rejeu') throw new Refus('Un rejeu ne porte que l’analyse des maisons.');
        }
        // L'essai du brouillon des regles : l'administrateur seul, et un brouillon doit exister.
        $brouillon = null;
        if ($demande['essai']) {
            $reserveAdmin();
            $brouillon = lireBrouillonRegles($dossierClaude);
            if ($brouillon === null) throw new Refus('Aucun brouillon des règles enregistré sur le serveur (Admin › Règles, « Enregistrer sur le serveur »).');
        }
        // La trace va dans le dossier de l'audit nomme. Un rejeu exige cet audit ; l'analyse de la
        // session, elle, se range sans depot (lot L0) si son depot a ete retire entre-temps ou n'est pas le sien.
        if ($demande['usage'] === 'rejeu' && $demande['depot'] !== null && !is_array(indexAudits($dossierAudits)[$demande['depot']] ?? null)) erreur(404, 'NOT_FOUND', 'Aucun audit « ' . $demande['depot'] . ' ».');
        $dirAudit = $dirAuditPermis($demande['depot']);
        $t = maintenant();
        $identite = ['organisation' => $organisation, 'projet' => $demande['projet'] ?? ($qui['admin'] ? 'admin' : null), 'idu' => $demande['idu'], 'adresse' => $demande['adresse'],
                     'audit' => $demande['audit'], 'usage' => $demande['usage'], 'modele' => $demande['modele'], 'batch' => true]
                  + ($demande['essai'] ? ['essai' => true] : []);
        [$prompt, $schema] = promptEtSchema($demande['usage'], $brouillon);
        $prompts = promptsDesRequetes($demande['requetes'], $brouillon);
        $images = array_sum(array_column($demande['requetes'], 'images'));
        // Les passes d'une maison couvrent les memes facades : on les compte sur la premiere passe.
        $facades = array_sum(array_map(fn($r) => ($r['passe'] ?? 1) === 1 ? $r['facades'] : 0, $demande['requetes']));
        $ligneVide = fn(string $statut, array $extra = []) => ['t' => $t] + $identite + ['idBatch' => null, 'requete' => null, 'passe' => null,
            'tokens' => tokensDeUsage(null), 'images' => $images, 'facades' => $facades, 'cout' => 0, 'tarif' => null, 'statut' => $statut, 'arret' => null,
            'prompt' => $prompt['version'], 'schema' => $schema['version']] + $extra;

        // Les plafonds : ce qui est depense, plus ce qui est engage dans les batches ouverts, plus
        // une estimation de celui-ci. Un batch se paie a la fin : sans l'engage, dix batches lances
        // d'un coup passeraient tous sous le plafond.
        $ouverts = engagements($dossierClaude, $dossierBatches, $organisation, $avecCle);
        $fait = depenses(lireJournal($dossierClaude, $t), $organisation, substr($t, 0, 10));
        $engage = ($ouverts + count($demande['requetes'])) * $p['estimationRequete'];
        $plafond = plafondDe($p, $organisation);
        if ($fait['jour'] + $engage > $plafond['jour'] || $fait['mois'] + $engage > $plafond['mois']) {
            journaliser($dossierClaude, [$ligneVide('plafond')]);
            erreur(429, 'BUDGET_EXCEEDED', 'Plafond de l’analyse atteint pour aujourd’hui ou ce mois-ci.', ['depense' => $fait, 'engage' => $engage, 'plafond' => $plafond]);
        }

        $requetes = [];
        foreach ($demande['requetes'] as $r) {
            [$pR, $sR] = $prompts[$r['usage']];
            $requetes[] = ['custom_id' => $r['id'], 'params' => parametresRequete($r['modele'], $pR['texte'], $sR['schema'], $r['contenu'], false, $sR['exemple'] ?? null, $sR['consigne'] ?? null)];
        }
        $corps = json_encode(['requests' => $requetes], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        [$statut, $texte] = anthropic('POST', '/v1/messages/batches', $corps === false ? '' : $corps);
        if ($statut === 0) {
            journaliser($dossierClaude, [$ligneVide('echoue', ['erreur' => 'reseau'])]);
            erreur(502, 'UPSTREAM', 'Anthropic injoignable.');
        }
        if ($statut < 200 || $statut >= 300) {
            journaliser($dossierClaude, [$ligneVide('echoue', ['erreur' => 'http-' . $statut])]);
            erreur(502, 'UPSTREAM', 'Anthropic a refusé le batch (' . $statut . ') : ' . messageApi($texte));
        }
        $b = json_decode($texte, true);
        if (!is_array($b) || !is_string($b['id'] ?? null) || !preg_match(ID_BATCH, $b['id'])) erreur(502, 'UPSTREAM', 'Réponse d’Anthropic illisible.');
        $parRequete = [];
        foreach ($demande['requetes'] as $r) {
            $parRequete[$r['id']] = ['passe' => $r['passe'], 'images' => $r['images'], 'facades' => $r['facades'], 'usage' => $r['usage'], 'modele' => $r['modele'],
                                     'prompt' => $prompts[$r['usage']][0]['version'], 'schema' => $prompts[$r['usage']][1]['version'], 'empreintes' => empreintesRequete($r)];
        }
        // La trace (15.5, lot L0) : ce qui part, dans le dossier de l'audit ou sans depot ; ce qui revient la completera.
        $idTrace = idNouvelleTrace($demande['modele'], $t);
        [$base, $dt, $trace] = lieuTrace($dossierClaude, $dirAudit, $dirAudit !== null ? $demande['depot'] : null, $organisation, $idTrace);
        if ($dirAudit === null) purgerSansDepot($dossierClaude, substr($t, 0, 10));
        commencerTrace($base, $dt, $dirAudit !== null ? $demande : ['depot' => null] + $demande, $prompts,
                       resumeTrace($idTrace, $dirAudit !== null ? $demande : ['depot' => null] + $demande, $prompts, $identite, $demande['usage'] === 'rejeu' ? 'rejeu' : 'analyse', $t, $b['id']));
        ecrireFiche($dossierBatches, ['id' => $b['id'], 'creeLe' => $t] + $identite + ['promptVersion' => $prompt['version'], 'schemaVersion' => $schema['version'],
                    'requetes' => $parRequete, 'etat' => $b['processing_status'] ?? null, 'journalise' => false, 'trace' => $trace]
                    // Le texte du brouillon qui est parti : la reponse se ramene a SON schema, meme si le brouillon change ensuite.
                    + ($brouillon !== null ? ['brouillonCopie' => ['prompt' => $brouillon['prompt'], 'schema' => $brouillon['schema']]] : []));
        repondre(201, ['batch' => vueBatch($b), 'modele' => $demande['modele'], 'prompt' => $prompt['version'], 'schema' => $schema['version'], 'essai' => $demande['essai'], 'trace' => $idTrace,
                       'depot' => $trace['audit']]);
    }

    if ($chemin === 'messages') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        if (!$avecCle) $sansCle();
        $p = plafonds($dossierClaude);
        $d = lireCorps(TAILLE_MAX);
        if (is_array($d) && ($d['usage'] ?? null) === 'rejeu') throw new Refus('Un rejeu passe par un batch.');
        $demande = verifierDemande($d, ['requetesParBatch' => min(REQUETES_IMMEDIATES, (int)$p['requetesParBatch'])] + $p, modelesParUsage(reglageModeles($dossierClaude)));
        if ($demande['essai']) throw new Refus('L’essai du brouillon passe par un batch.');
        // La trace (lot L0) : dans le dossier de l'audit nomme quand il est permis (l'escalade d'un audit sauvegarde), sinon sans depot.
        $dirAudit = $dirAuditPermis($demande['depot']);
        if ($dirAudit === null) $demande['depot'] = null;
        repondre(200, appelImmediat($dossierClaude, $dossierBatches, $demande, $organisation, $qui['admin'], $avecCle, $p, $dirAudit));
    }

    // Le rejeu du run d'une facade depuis son image gardee (lot L0) : la requete d'une trace repart telle qu'elle est partie (ses
    // textes, son image octet pour octet), avec le prompt, le schema et le modele d'aujourd'hui. Administrateur seul ; une passe ou
    // trois ; il se compte en rejeu, et sa trace se range a cote de celle qu'il rejoue.
    if ($chemin === 'rejouer') {
        if ($methode !== 'POST') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $reserveAdmin();
        if (!$avecCle) $sansCle();
        $d = lireCorps(64 * 1024);
        $audit = $d['audit'] ?? null;
        $idSource = (string)($d['trace'] ?? '');
        $idRequete = (string)($d['requete'] ?? '');
        $passes = $d['passes'] ?? 3;
        if ($audit !== null && (!is_string($audit) || !preg_match(ID_AUDIT, $audit))) throw new Refus('Champ « audit » invalide.');
        if (!is_int($passes) || $passes < 1 || $passes > REQUETES_IMMEDIATES) throw new Refus('Passes invalides (1 à 3).');
        $dirAudit = $audit !== null ? dossierAudit($dossierAudits, $audit) : null;
        $dt = $audit !== null ? dossierTrace($dossierAudits, $audit, $idSource) : traceSansDepot($dossierClaude, $idSource);
        if ($dt === null) erreur(404, 'NOT_FOUND', 'Aucune analyse « ' . $idSource . ' ».');
        $resumeSource = lireJson($dt . '/resume.json') ?? [];
        $source = null;
        foreach (listeDe(lireJson($dt . '/entrant.json')['requetes'] ?? null) as $q) if (is_array($q) && ($q['id'] ?? null) === $idRequete) $source = $q;
        if ($source === null) erreur(404, 'NOT_FOUND', 'Aucune requête « ' . $idRequete . ' » dans cette analyse.');
        if (($source['usage'] ?? null) !== 'facade') throw new Refus('Seul le run d’une façade se rejoue depuis son image.');
        $contenu = contenuRejoue($source, $dirAudit ?? dirname($dt));
        $fiche = $audit !== null ? (indexAudits($dossierAudits)[$audit] ?? []) : [];
        $p = plafonds($dossierClaude);
        $demande = verifierDemande(['projet' => 'admin', 'idu' => $fiche['idu'] ?? ($resumeSource['idu'] ?? null), 'adresse' => $fiche['adresse'] ?? ($resumeSource['adresse'] ?? null),
            'audit' => substr('rejeu-' . $idSource, 0, 64), 'depot' => $audit, 'usage' => 'facade']
            + (isset($d['modele']) ? ['modele' => $d['modele']] : [])
            + ['requetes' => array_map(fn($k) => ['id' => 'rejeu-p' . $k, 'passe' => $k, 'usage' => 'facade', 'facades' => $k === 1 ? 1 : 0, 'contenu' => $contenu], range(1, $passes))],
            ['requetesParBatch' => REQUETES_IMMEDIATES] + $p, modelesParUsage(reglageModeles($dossierClaude)));
        foreach ($demande['requetes'] as &$r) $r['compte'] = 'rejeu';
        unset($r);
        repondre(200, appelImmediat($dossierClaude, $dossierBatches, $demande, $organisation, true, $avecCle, $p, $dirAudit, 'rejeu-facade') + ['source' => $idSource]);
    }

    // L'export « données d'analyse » (lot L0) : a l'administrateur seul ; il ne fait que relire les traces et les conclusions.
    if ($chemin === 'donnees-analyse') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $reserveAdmin();
        repondre(200, donneesAnalyse($dossierAudits, $dossierClaude, lireFiltres($_GET, gmdate('Y-m-d')), maintenant()));
    }

    // Une image gardee, par son empreinte : a l'administrateur seul (les photos ne partent que sur demande, une a une).
    if (preg_match('#^images/([^/]+)$#', $chemin, $mi)) {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $reserveAdmin();
        $audit = isset($_GET['audit']) && $_GET['audit'] !== '' ? (string)$_GET['audit'] : null;
        $f = imageGardee($dossierAudits, $dossierClaude, $audit, $mi[1]);
        if ($f === null) erreur(404, 'NOT_FOUND', 'Aucune image « ' . $mi[1] . ' ».');
        header('Content-Type: ' . array_search(pathinfo($f, PATHINFO_EXTENSION), EXTENSIONS_IMAGE, true));
        header('Cache-Control: private, max-age=86400, immutable');
        http_response_code(200);
        if ($methode !== 'HEAD') readfile($f);
        exit;
    }

    if (preg_match('#^batches/([^/]+)(/resultats)?$#', $chemin, $mb)) {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $id = rawurldecode($mb[1]);
        // Seuls les batches crees par ce serveur se lisent, et par l'organisation qui les a crees : la
        // cle ne sert pas a fouiller le compte, ni une organisation a lire les resultats d'une autre.
        $fiche = preg_match(ID_BATCH, $id) ? lireJson(fBatch($dossierBatches, $id)) : null;
        if ($fiche === null || (!$qui['admin'] && ($fiche['organisation'] ?? null) !== $organisation)) erreur(404, 'NOT_FOUND', 'Aucun batch « ' . $id . ' ».');
        if (!$avecCle) $sansCle();
        [$statut, $texte] = anthropic('GET', '/v1/messages/batches/' . rawurlencode($id));
        if ($statut !== 200) erreur(502, 'UPSTREAM', 'Anthropic : ' . $statut . ' ' . messageApi($texte));
        $b = json_decode($texte, true);
        if (!is_array($b)) erreur(502, 'UPSTREAM', 'Réponse d’Anthropic illisible.');
        if (empty($mb[2])) {
            if (($fiche['etat'] ?? null) !== ($b['processing_status'] ?? null)) ecrireFiche($dossierBatches, ['etat' => $b['processing_status'] ?? null] + $fiche);
            repondre(200, vueBatch($b));
        }
        if (($b['processing_status'] ?? null) !== 'ended') erreur(409, 'NOT_READY', 'Le batch n’est pas terminé (' . (string)($b['processing_status'] ?? '?') . ').');
        $lu = resultats($dossierClaude, $dossierBatches, ['finLe' => $b['ended_at'] ?? null] + $fiche);
        if (isset($lu['erreur'])) erreur(502, 'UPSTREAM', 'Anthropic : ' . $lu['erreur'][0] . ' ' . messageApi($lu['erreur'][1]));
        repondre(200, ['batch' => vueBatch($b), 'modele' => $fiche['modele'], 'prompt' => $fiche['promptVersion'], 'schema' => $fiche['schemaVersion'], 'essai' => ($fiche['essai'] ?? false) === true, 'resultats' => $lu['sortie']]);
    }
    erreur(404, 'NOT_FOUND', 'Introuvable');
} catch (Refus $e) {
    erreur(400, 'BAD_REQUEST', $e->getMessage());
} catch (Throwable $e) {
    error_log('Plan analyse : ' . $e->getMessage());
    erreur(500, 'SERVER_ERROR', 'Erreur du serveur.');
}
