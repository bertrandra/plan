<?php
// L'admin des demos pour un hebergement Apache + PHP, sans Node (MD/spec-demos-admin.md).
//
// Meme contrat que buildsg/demosAdmin.mjs, route pour route : la page ne sait pas lequel lui
// repond. `.htaccess` renvoie `admin/<chemin>` ici, avec `?chemin=<chemin>`.
//
//   GET    admin/session          200 si la session est ouverte, 401 sinon
//   POST   admin/session          {motDePasse} -> ouvre la session (cookie)
//   DELETE admin/session          ferme la session
//   GET    admin/demos            {demos: [{id, name, updatedAt}]}
//   POST   admin/demos            cree la demo au premier numero libre
//   GET|PUT|DELETE admin/demos/<id>
//   GET|PUT admin/controleurs     l'arbre des controleurs de l'ecran (app/controleurs.ts)
//   GET    admin/palette          la palette de l'interface, SANS session : chaque page l'applique
//   PUT    admin/palette          la remplace (session ; styles/paletteServeur.ts)
//   GET    admin/arbres           la bibliotheque d'essences d'arbres, SANS session : la 3D la lit
//   PUT    admin/arbres           la remplace (session ; model/especesArbre.ts)
//   GET    admin/calibration      les reglages de la detection des ouvertures calibres, SANS session : chaque page les applique
//   PUT    admin/calibration      les remplace (session ; facade/corpusReel.ts)
//   GET    admin/calibration-cas  la liste des cas de calibration : photos de facades annotees (session)
//   GET|PUT|DELETE admin/calibration-cas/<id>   un cas, avec ses photos (session)
//   GET    admin/vitrine/<id>     la demo <id> en lecture seule, SANS session : ce que la vitrine
//                                 publique montre (`?mode=demo&file=<id>`)
//
// **Le mot de passe se verifie ici, jamais dans la page** : le fichier livre se lit en entier.
// Il vit dans un fichier de configuration (admin-config.exemple.php), de preference HORS du dossier
// publie. Sans configuration ou sans mot de passe, chaque route repond 404 : l'admin n'existe pas.
//
// Defenses : cookie HttpOnly + SameSite=Strict + Secure en HTTPS ; en-tete `X-Plan-Admin: 1` exige
// sur toute ecriture (un autre site ne peut pas le poser) ; cinq echecs en dix minutes bloquent une
// adresse dix minutes ; identifiants `[A-Za-z0-9_-]{1,64}` ; 25 Mo au plus ; ecriture atomique,
// version precedente gardee en `.bak`.

declare(strict_types=1);

const DUREE_SESSION = 8 * 3600;
const FENETRE_ECHECS = 600;
const ECHECS_MAX = 5;
const TAILLE_MAX = 25 * 1024 * 1024;
const ID_VALIDE = '/^[A-Za-z0-9_-]{1,64}$/';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function repondre(int $statut, $corps = null): void {
    http_response_code($statut);
    if ($corps !== null && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function erreur(int $statut, string $code, string $message): void {
    repondre($statut, ['error' => ['code' => $code, 'message' => $message]]);
}

// --- La configuration ---------------------------------------------------------------------------
// Cherchee d'abord hors du dossier publie — a cote de la racine web (public_html/), ce qui vaut
// aussi quand Plan est dans un sous-dossier —, puis a cote du dossier de Plan, puis a cote de ce fichier.
$config = null;
$fichierConfig = null;
$racineWeb = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
foreach ([getenv('PLAN_ADMIN_CONFIG') ?: null, $racineWeb !== '' ? dirname($racineWeb) . '/plan-admin-config.php' : null,
          dirname(__DIR__) . '/plan-admin-config.php', __DIR__ . '/admin-config.php'] as $f) {
    if ($f && is_file($f)) { $config = require $f; $fichierConfig = $f; break; }
}
$motDePasse = is_array($config) ? (string)($config['motDePasse'] ?? '') : '';
$chemin = trim((string)($_GET['chemin'] ?? ''), '/');
// La vitrine (`vitrine/<id>`, plus bas) est publique : ses refus se disent, et se lisent de toute
// origine — la plateforme l'encadre dans un <iframe> en bac a sable, dont l'origine est `null`
// tant qu'il ne porte pas `allow-same-origin` ; sans cet en-tete sur CHAQUE reponse de la route,
// la page n'y voit ni la demo ni la raison de son absence, et montre la demonstration integree
// sans que personne ne sache pourquoi. Sans risque : la route est publique par construction, et
// aucun cookie n'y est lu ni pose.
$vitrine = preg_match('#^vitrine/#', $chemin) === 1;
if ($vitrine) header('Access-Control-Allow-Origin: *');
if ($motDePasse === '' || $motDePasse === 'A-CHANGER') {
    // Sans configuration, l'admin n'existe pas (404 partout) — mais la vitrine, elle, dit pourquoi
    // elle ne peut pas lire sa demo : c'est le premier oubli d'une mise en ligne.
    if ($vitrine) erreur(404, 'NOT_CONFIGURED', 'Admin non configuré : plan-admin-config.php absent, ou mot de passe « A-CHANGER ». La vitrine ne peut pas lire ses démos.');
    erreur(404, 'NOT_FOUND', 'Introuvable');
}
// Les donnees vivent dans data/, a cote de public_html/ (donnees.php) : les demos dans data/demos/,
// la palette, les controleurs et les echecs de connexion dans data/admin/.
require __DIR__ . '/donnees.php';
$donnees = dossiersDonnees($config, $racineWeb, __DIR__, $fichierConfig);
migrerDonnees($donnees);
$dossier = $donnees['demos'];
if (!is_dir($dossier) && !@mkdir($dossier, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier des demos impossible a creer (droits du dossier parent) : ' . $dossier . '.');
if (!is_dir($donnees['admin'])) @mkdir($donnees['admin'], 0750, true);

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$lecture = $methode === 'GET' || $methode === 'HEAD';

if (!$lecture && ($_SERVER['HTTP_X_PLAN_ADMIN'] ?? '') !== '1') erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');

// --- La vitrine ---------------------------------------------------------------------------------
// Une demo se montre au public par la vitrine (`?mode=demo&file=<id>`) : en lecture seule, sans
// session, et avant elle — ni cookie pose, ni session ouverte pour un visiteur. Une demo est faite
// pour etre montree ; ce qu'elle ne doit pas etre, c'est modifiable, et rien ici n'ecrit.
if (preg_match('#^vitrine/([^/]+)$#', $chemin, $m)) {
    // `Access-Control-Allow-Origin: *` est deja pose plus haut, pour toutes les reponses de la route.
    if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    $id = rawurldecode($m[1]);
    if (!preg_match(ID_VALIDE, $id)) erreur(400, 'BAD_ID', 'Identifiant de démo invalide.');
    $f = $dossier . '/' . $id . '.json';
    if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune démo « ' . $id . ' ».');
    // Present mais illisible (droits du fichier) : `is_file` passe, `readfile` echouait, et la
    // reponse etait un 200 au corps vide — la vitrine retombait en silence sur la demonstration
    // integree. Le dire, c'est la seule facon de le voir.
    if (!is_readable($f)) erreur(500, 'UNREADABLE', 'Démo « ' . $id . ' » présente mais illisible : droits du fichier (PHP doit pouvoir le lire — 644, même utilisateur que le site).');
    // Une minute de cache : la page d'accueil qui l'encadre ne redemande pas le fichier a chaque
    // visite, et une demo reenregistree se voit vite.
    header('Cache-Control: public, max-age=60');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($f)) . ' GMT');
    http_response_code(200);
    if ($methode !== 'HEAD') readfile($f);
    exit;
}

// --- La palette ---------------------------------------------------------------------------------
// Les couleurs de l'interface (styles/paletteServeur.ts) : chaque page de Plan les lit au demarrage,
// sans session. Seule l'ecriture, plus bas, demande la session.
if ($chemin === 'palette' && $lecture) {
    // Lisible de toute origine, comme la vitrine plus haut : la vitrine encadree en bac a sable la lit.
    header('Access-Control-Allow-Origin: *');
    $f = $donnees['palette'];
    if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune palette enregistrée.');
    header('Cache-Control: no-cache');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($f)) . ' GMT');
    http_response_code(200);
    if ($methode !== 'HEAD') readfile($f);
    exit;
}

// --- Les essences d'arbres ----------------------------------------------------------------------
// La bibliotheque d'EZ-tree (model/especesArbre.ts) : la 3D de chaque page en a besoin pour dessiner
// les arbres, donc lisible sans session. Seule l'ecriture, plus bas, demande la session.
if ($chemin === 'arbres' && $lecture) {
    header('Access-Control-Allow-Origin: *');
    $f = $donnees['arbres'];
    if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune bibliothèque d’arbres enregistrée.');
    header('Cache-Control: no-cache');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($f)) . ' GMT');
    http_response_code(200);
    if ($methode !== 'HEAD') readfile($f);
    exit;
}

// --- Les reglages calibres de la detection --------------------------------------------------------
// Les valeurs que l'admin a calibrees sur ses photos (facade/regles/facades/surcharges.ts) : chaque page les applique au
// demarrage, donc lisibles sans session. Seule l'ecriture, plus bas, demande la session.
if ($chemin === 'calibration' && $lecture) {
    header('Access-Control-Allow-Origin: *');
    $f = $donnees['calibration'];
    if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune calibration enregistrée.');
    header('Cache-Control: no-cache');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($f)) . ' GMT');
    http_response_code(200);
    if ($methode !== 'HEAD') readfile($f);
    exit;
}

// --- La session ---------------------------------------------------------------------------------
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]) === 'https';
// Le cookie ne part que vers `admin/…`, a cote de la page, quel que soit le sous-dossier.
$cheminCookie = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/admin.php'))), '/') . '/admin/';
session_name('plan_admin');
session_set_cookie_params(['lifetime' => DUREE_SESSION, 'path' => $cheminCookie, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
ini_set('session.gc_maxlifetime', (string)DUREE_SESSION);
session_start();

function sessionValide(): bool {
    return isset($_SESSION['admin']) && is_int($_SESSION['admin']) && $_SESSION['admin'] > time();
}

/** Les echecs recents, par adresse, dans un fichier des reglages de l'admin. Verrouille. */
function echecs(string $f, string $ip, bool $ajouter, bool $effacer): int {
    $h = fopen($f, 'c+');
    if (!$h) return 0;
    flock($h, LOCK_EX);
    $tous = json_decode((string)stream_get_contents($h), true);
    if (!is_array($tous)) $tous = [];
    $limite = time() - FENETRE_ECHECS;
    $miens = array_values(array_filter($tous[$ip] ?? [], fn($t) => is_int($t) && $t > $limite));
    if ($ajouter) $miens[] = time();
    if ($effacer) $miens = [];
    if ($miens) $tous[$ip] = $miens; else unset($tous[$ip]);
    ftruncate($h, 0); rewind($h);
    fwrite($h, json_encode($tous));
    flock($h, LOCK_UN); fclose($h);
    return count($miens);
}

if ($chemin === 'session') {
    if ($lecture) {
        if (sessionValide()) repondre(200, ['admin' => true]);
        erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
    }
    if ($methode === 'POST') {
        $ip = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ($_SERVER['REMOTE_ADDR'] ?? '')))[0]);
        if (echecs($donnees['echecs'], $ip, false, false) >= ECHECS_MAX) erreur(429, 'TOO_MANY_ATTEMPTS', 'Trop d’essais. Réessayez dans dix minutes.');
        $corps = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
        $donne = is_array($corps) ? (string)($corps['motDePasse'] ?? '') : '';
        // Un mot de passe range sous forme de hachage (password_hash) ou en clair.
        $bon = str_starts_with($motDePasse, '$2y$') || str_starts_with($motDePasse, '$argon2')
            ? password_verify($donne, $motDePasse)
            : hash_equals(hash('sha256', $motDePasse), hash('sha256', $donne));
        if (!$bon) {
            echecs($donnees['echecs'], $ip, true, false);
            erreur(401, 'BAD_PASSWORD', 'Mot de passe refusé.');
        }
        echecs($donnees['echecs'], $ip, false, true);
        session_regenerate_id(true);
        $_SESSION['admin'] = time() + DUREE_SESSION;
        repondre(200, ['admin' => true]);
    }
    if ($methode === 'DELETE') {
        $_SESSION = [];
        session_destroy();
        setcookie('plan_admin', '', ['expires' => 1, 'path' => $cheminCookie, 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
        repondre(200, ['admin' => false]);
    }
    erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
}

if (!sessionValide()) erreur(401, 'UNAUTHENTICATED', 'Mot de passe requis.');
// La session n'est plus ecrite : la liberer laisse passer les requetes paralleles.
session_write_close();

// --- Les fichiers -------------------------------------------------------------------------------
function fichier(string $dossier, string $id): string { return $dossier . '/' . $id . '.json'; }

function resume(string $dossier, string $id): array {
    $f = fichier($dossier, $id);
    $name = $id;
    $d = json_decode((string)@file_get_contents($f), true);
    if (is_array($d) && isset($d['meta']['name']) && is_string($d['meta']['name']) && $d['meta']['name'] !== '') $name = $d['meta']['name'];
    return ['id' => $id, 'name' => $name, 'updatedAt' => gmdate('Y-m-d\TH:i:s.000\Z', (int)filemtime($f))];
}

function lireDocument(): array {
    $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
    if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier trop gros (25 Mo au plus).');
    $d = json_decode($texte, true);
    if (!is_array($d) || array_is_list($d) || !isset($d['objects']) || !is_array($d['objects'])) {
        erreur(400, 'BAD_DOCUMENT', 'Le document n’a pas la forme d’un plan (objects manquant).');
    }
    return $d;
}

function ecrire(string $dossier, string $id, array $document): void {
    $f = fichier($dossier, $id);
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $texte = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($texte === false || file_put_contents($tmp, $texte . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
}

/** Ecrit un document JSON hors demos : dossier cree au besoin, version precedente gardee en `.bak`, ecriture atomique. */
function ecrireAtomique(string $f, array $document): void {
    $dir = dirname($f);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $texte = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($texte === false || file_put_contents($tmp, $texte . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
}

if ($chemin === 'demos') {
    if ($lecture) {
        $demos = [];
        foreach (scandir($dossier) ?: [] as $n) {
            if (str_ends_with($n, '.json') && preg_match(ID_VALIDE, substr($n, 0, -5))) $demos[] = resume($dossier, substr($n, 0, -5));
        }
        usort($demos, fn($a, $b) => strnatcmp($a['id'], $b['id']));
        repondre(200, ['demos' => $demos]);
    }
    if ($methode === 'POST') {
        $document = lireDocument();
        $n = 1;
        while (file_exists(fichier($dossier, (string)$n)) || file_exists(fichier($dossier, (string)$n) . '.bak')) $n++;
        ecrire($dossier, (string)$n, $document);
        repondre(201, resume($dossier, (string)$n));
    }
    erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
}

// L'arbre des controleurs de l'ecran (app/controleurs.ts) : un seul document, a part des demos.
// Le point en tete le garde hors de la liste des demos.
if ($chemin === 'controleurs') {
    $f = $donnees['controleurs'];
    if ($lecture) {
        if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucun registre des contrôleurs enregistré.');
        http_response_code(200);
        if ($methode !== 'HEAD') readfile($f);
        exit;
    }
    if ($methode === 'PUT') {
        $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
        if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier trop gros (25 Mo au plus).');
        $d = json_decode($texte, true);
        if (!is_array($d) || ($d['format'] ?? null) !== 'plan-controleurs' || !isset($d['arbre']) || !is_array($d['arbre'])) {
            erreur(400, 'BAD_DOCUMENT', 'Ce n’est pas un registre des contrôleurs.');
        }
        if (is_file($f)) copy($f, $f . '.bak');
        $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $sortie = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($sortie === false || file_put_contents($tmp, $sortie . "\n") === false || !rename($tmp, $f)) {
            @unlink($tmp);
            erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
        }
        repondre(200, ['decouvertLe' => $d['decouvertLe'] ?? null]);
    }
    erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
}

// La palette, en ecriture : un document `plan-palette` dont chaque couleur est `#RRGGBB`.
if ($chemin === 'palette') {
    if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    $f = $donnees['palette'];
    $texte = (string)file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($texte) > 65536) erreur(413, 'TOO_LARGE', 'Palette trop grosse (64 Ko au plus).');
    $d = json_decode($texte, true);
    $valide = is_array($d) && ($d['format'] ?? null) === 'plan-palette' && isset($d['couleurs']) && is_array($d['couleurs']);
    if ($valide) {
        foreach ($d['couleurs'] as $theme => $valeurs) {
            if (!in_array($theme, ['clair', 'sombre'], true) || !is_array($valeurs)) { $valide = false; break; }
            foreach ($valeurs as $nom => $v) {
                if (!is_string($nom) || !preg_match('/^[a-z0-9-]{1,40}$/', $nom) || !is_string($v) || !preg_match('/^#[0-9A-Fa-f]{6}$/', $v)) { $valide = false; break 2; }
            }
        }
    }
    if (!$valide) erreur(400, 'BAD_DOCUMENT', 'Ce n’est pas une palette (couleurs #RRGGBB, thèmes clair et sombre).');
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $sortie = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($sortie === false || file_put_contents($tmp, $sortie . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
    repondre(200, ['modifieLe' => $d['modifieLe'] ?? null]);
}

// Les essences d'arbres, en ecriture : un document `plan-arbres`, des essences a identifiant [a-z0-9-] et reglages.
if ($chemin === 'arbres') {
    if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    $f = $donnees['arbres'];
    $texte = (string)file_get_contents('php://input', false, null, 0, 524289);
    if (strlen($texte) > 524288) erreur(413, 'TOO_LARGE', 'Bibliothèque trop grosse (512 Ko au plus).');
    $d = json_decode($texte, true);
    $valide = is_array($d) && ($d['format'] ?? null) === 'plan-arbres' && isset($d['especes']) && is_array($d['especes']) && count($d['especes']) <= 200;
    if ($valide) {
        $ids = [];
        foreach ($d['especes'] as $e) {
            if (!is_array($e) || !isset($e['id']) || !is_string($e['id']) || !preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $e['id']) || isset($ids[$e['id']])
                || !isset($e['reglages']) || !is_array($e['reglages'])) { $valide = false; break; }
            $ids[$e['id']] = true;
        }
    }
    if (!$valide) erreur(400, 'BAD_DOCUMENT', 'Ce n’est pas une bibliothèque d’arbres (essences avec identifiant [a-z0-9-] et réglages).');
    if (is_file($f)) copy($f, $f . '.bak');
    $tmp = $f . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $sortie = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($sortie === false || file_put_contents($tmp, $sortie . "\n") === false || !rename($tmp, $f)) {
        @unlink($tmp);
        erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
    }
    repondre(200, ['modifieLe' => $d['modifieLe'] ?? null]);
}

// Les reglages calibres de la detection, en ecriture : un document `plan-calibration`, des reglages `facades.<detection|structure>.<nom>` numeriques.
if ($chemin === 'calibration') {
    if ($methode !== 'PUT') erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    $f = $donnees['calibration'];
    $texte = (string)file_get_contents('php://input', false, null, 0, 262145);
    if (strlen($texte) > 262144) erreur(413, 'TOO_LARGE', 'Calibration trop grosse (256 Ko au plus).');
    $d = json_decode($texte, true);
    $valide = is_array($d) && ($d['format'] ?? null) === 'plan-calibration' && isset($d['parametres']) && is_array($d['parametres']) && count($d['parametres']) <= 200
        && (!isset($d['historique']) || (is_array($d['historique']) && count($d['historique']) <= 200));
    if ($valide) {
        foreach ($d['parametres'] as $nom => $v) {
            if (!is_string($nom) || !preg_match('/^facades\.(detection|structure)\.[A-Za-z0-9]{1,40}$/', $nom) || !(is_int($v) || is_float($v)) || !is_finite((float)$v)) { $valide = false; break; }
        }
    }
    if (!$valide) erreur(400, 'BAD_DOCUMENT', 'Ce n’est pas une calibration (réglages facades.detection.* ou facades.structure.* numériques).');
    ecrireAtomique($f, $d);
    repondre(200, ['modifieLe' => $d['modifieLe'] ?? null]);
}

// Les cas de calibration : une facade photographiee, annotee a la main (facade/corpusReel.ts), photos comprises (data:image/jpeg).
if ($chemin === 'calibration-cas' || preg_match('#^calibration-cas/([^/]+)$#', $chemin, $mc)) {
    $dossierCas = $donnees['calibrationCas'];
    if ($chemin === 'calibration-cas') {
        if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
        $cas = [];
        foreach (@scandir($dossierCas) ?: [] as $n) {
            if (!str_ends_with($n, '.json') || !preg_match(ID_VALIDE, substr($n, 0, -5))) continue;
            $c = json_decode((string)@file_get_contents($dossierCas . '/' . $n), true);
            if (!is_array($c)) continue;
            $cas[] = ['id' => substr($n, 0, -5), 'nom' => is_string($c['nom'] ?? null) ? $c['nom'] : substr($n, 0, -5), 'statut' => ($c['statut'] ?? '') === 'valide' ? 'valide' : 'brouillon',
                'photos' => is_array($c['photos'] ?? null) ? count($c['photos']) : 0, 'ouvertures' => is_array($c['ouvertures'] ?? null) ? count($c['ouvertures']) : 0,
                'updatedAt' => gmdate('Y-m-d\TH:i:s.000\Z', (int)filemtime($dossierCas . '/' . $n))];
        }
        usort($cas, fn($a, $b) => strnatcmp($a['id'], $b['id']));
        repondre(200, ['cas' => $cas]);
    }
    $id = rawurldecode($mc[1]);
    if (!preg_match(ID_VALIDE, $id)) erreur(400, 'BAD_ID', 'Identifiant de cas invalide.');
    $f = $dossierCas . '/' . $id . '.json';
    if ($lecture) {
        if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucun cas « ' . $id . ' ».');
        header('Cache-Control: no-store');
        http_response_code(200);
        if ($methode !== 'HEAD') readfile($f);
        exit;
    }
    if ($methode === 'PUT') {
        $texte = (string)file_get_contents('php://input', false, null, 0, TAILLE_MAX + 1);
        if (strlen($texte) > TAILLE_MAX) erreur(413, 'TOO_LARGE', 'Fichier trop gros (25 Mo au plus).');
        $d = json_decode($texte, true);
        $n = is_array($d) && is_array($d['photos'] ?? null) ? count($d['photos']) : 0;
        $valide = is_array($d) && ($d['format'] ?? null) === 'plan-facade-reelle' && ($d['version'] ?? null) === 1 && is_string($d['nom'] ?? null) && $n >= 1 && $n <= 8
            && is_array($d['images'] ?? null) && count($d['images']) === $n && is_array($d['ouvertures'] ?? null) && count($d['ouvertures']) <= 100;
        if ($valide) foreach ($d['images'] as $im) { if (!is_string($im) || !str_starts_with($im, 'data:image/')) { $valide = false; break; } }
        if (!$valide) erreur(400, 'BAD_DOCUMENT', 'Ce n’est pas un cas de calibration (nom, 1 à 8 photos avec leur image, ouvertures).');
        if (!is_dir($dossierCas) && !@mkdir($dossierCas, 0775, true) && !is_dir($dossierCas)) erreur(500, 'SERVER_ERROR', 'Écriture impossible.');
        ecrireAtomique($f, $d);
        repondre(200, ['id' => $id]);
    }
    if ($methode === 'DELETE') {
        if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucun cas « ' . $id . ' ».');
        // Rien ne s'efface pour de bon : le fichier est renomme, on le retrouve a la main.
        rename($f, $f . '.supprime-' . gmdate('Y-m-d\TH-i-s'));
        repondre(200, new stdClass());
    }
    erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
}

if (preg_match('#^demos/([^/]+)$#', $chemin, $m)) {
    $id = rawurldecode($m[1]);
    if (!preg_match(ID_VALIDE, $id)) erreur(400, 'BAD_ID', 'Identifiant de démo invalide.');
    $f = fichier($dossier, $id);
    if ($lecture) {
        if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune démo « ' . $id . ' ».');
        header('Last-Modified: ' . gmdate('D, d M Y H:i:s', (int)filemtime($f)) . ' GMT');
        http_response_code(200);
        if ($methode !== 'HEAD') readfile($f);
        exit;
    }
    if ($methode === 'PUT') {
        ecrire($dossier, $id, lireDocument());
        repondre(200, resume($dossier, $id));
    }
    if ($methode === 'DELETE') {
        if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune démo « ' . $id . ' ».');
        // Rien ne s'efface pour de bon : le fichier est renomme, on le retrouve a la main.
        rename($f, $f . '.supprime-' . gmdate('Y-m-d\TH-i-s'));
        repondre(200, new stdClass());
    }
    erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
}

erreur(404, 'NOT_FOUND', 'Introuvable');
