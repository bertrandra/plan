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
$racineWeb = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
foreach ([getenv('PLAN_ADMIN_CONFIG') ?: null, $racineWeb !== '' ? dirname($racineWeb) . '/plan-admin-config.php' : null,
          dirname(__DIR__) . '/plan-admin-config.php', __DIR__ . '/admin-config.php'] as $f) {
    if ($f && is_file($f)) { $config = require $f; break; }
}
$motDePasse = is_array($config) ? (string)($config['motDePasse'] ?? '') : '';
if ($motDePasse === '' || $motDePasse === 'A-CHANGER') erreur(404, 'NOT_FOUND', 'Introuvable');
$dossier = rtrim((string)($config['dossierDemos'] ?? (__DIR__ . '/demos')), '/');
if (!is_dir($dossier) && !@mkdir($dossier, 0750, true)) erreur(500, 'SERVER_ERROR', 'Dossier des demos impossible a creer.');

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$lecture = $methode === 'GET' || $methode === 'HEAD';
$chemin = trim((string)($_GET['chemin'] ?? ''), '/');

if (!$lecture && ($_SERVER['HTTP_X_PLAN_ADMIN'] ?? '') !== '1') erreur(403, 'FORBIDDEN', 'En-tete X-Plan-Admin manquant.');

// --- La vitrine ---------------------------------------------------------------------------------
// Une demo se montre au public par la vitrine (`?mode=demo&file=<id>`) : en lecture seule, sans
// session, et avant elle — ni cookie pose, ni session ouverte pour un visiteur. Une demo est faite
// pour etre montree ; ce qu'elle ne doit pas etre, c'est modifiable, et rien ici n'ecrit.
if (preg_match('#^vitrine/([^/]+)$#', $chemin, $m)) {
    if (!$lecture) erreur(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
    $id = rawurldecode($m[1]);
    if (!preg_match(ID_VALIDE, $id)) erreur(400, 'BAD_ID', 'Identifiant de démo invalide.');
    $f = $dossier . '/' . $id . '.json';
    if (!is_file($f)) erreur(404, 'NOT_FOUND', 'Aucune démo « ' . $id . ' ».');
    // Une minute de cache : la page d'accueil qui l'encadre ne redemande pas le fichier a chaque
    // visite, et une demo reenregistree se voit vite.
    header('Cache-Control: public, max-age=60');
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

/** Les echecs recents, par adresse, dans un fichier du dossier des demos. Verrouille. */
function echecs(string $dossier, string $ip, bool $ajouter, bool $effacer): int {
    $f = $dossier . '/.echecs.json';
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
        if (echecs($dossier, $ip, false, false) >= ECHECS_MAX) erreur(429, 'TOO_MANY_ATTEMPTS', 'Trop d’essais. Réessayez dans dix minutes.');
        $corps = json_decode((string)file_get_contents('php://input', false, null, 0, 4096), true);
        $donne = is_array($corps) ? (string)($corps['motDePasse'] ?? '') : '';
        // Un mot de passe range sous forme de hachage (password_hash) ou en clair.
        $bon = str_starts_with($motDePasse, '$2y$') || str_starts_with($motDePasse, '$argon2')
            ? password_verify($donne, $motDePasse)
            : hash_equals(hash('sha256', $motDePasse), hash('sha256', $donne));
        if (!$bon) {
            echecs($dossier, $ip, true, false);
            erreur(401, 'BAD_PASSWORD', 'Mot de passe refusé.');
        }
        echecs($dossier, $ip, false, true);
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
    $f = $dossier . '/.controleurs.json';
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
