<?php
// Backend minimal de persistance pour le plan interactif.
// Chaque projet = un fichier JSON dans data/. Pas de base de donnees : inutile au
// volume de donnees d'un plan personnel (quelques formes, quelques mesures).
//
// Actions (voir plan.html / DEMO_OBJECTS pour la forme exacte des donnees) :
//   GET  api.php?action=list                -> [{id,name,updatedAt}, ...]
//   GET  api.php?action=load&id=...         -> {meta,objects,measures}
//   POST api.php?action=save   (JSON body)  -> {id,updatedAt}
//   POST api.php?action=delete (JSON body)  -> {ok:true}

header('Content-Type: application/json; charset=utf-8');
// L'hebergement met en cache les reponses PHP par defaut (proxy dynamique cote
// serveur) : sans ces en-tetes, action=list/load peut continuer a servir une
// reponse perimee apres une sauvegarde, meme si le fichier sur disque est a jour.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function isValidId($id) {
    return is_string($id) && preg_match('/^[a-z0-9-]{1,80}$/', $id) === 1;
}

function projectPath($dataDir, $id) {
    return $dataDir . '/' . $id . '.json';
}

function slugify($text) {
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT', $text);
    if ($ascii === false) $ascii = $text;
    $slug = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $ascii));
    $slug = trim($slug, '-');
    return $slug !== '' ? substr($slug, 0, 60) : 'projet';
}

function readJsonBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) fail(400, 'JSON invalide dans le corps de la requete');
    return $data;
}

$action = $_GET['action'] ?? '';

// ---- list ----
if ($action === 'list') {
    $out = [];
    // scandir() plutot que glob() : certains hebergeurs mutualises restreignent ou
    // desactivent glob() (open_basedir et consorts) sans que ca remonte comme une
    // erreur PHP franche - la boucle se contente alors de ne rien trouver, en silence.
    $entries = @scandir($dataDir);
    if ($entries !== false) {
        foreach ($entries as $entry) {
            if (substr($entry, -5) !== '.json') continue;
            $file = $dataDir . '/' . $entry;
            if (!is_file($file)) continue;
            $data = json_decode(file_get_contents($file), true);
            if (!$data || !isset($data['meta']['id'])) continue;
            $out[] = [
                'id' => $data['meta']['id'],
                'name' => $data['meta']['name'] ?? $data['meta']['id'],
                'updatedAt' => $data['meta']['updatedAt'] ?? null,
            ];
        }
    }
    usort($out, function($a, $b){ return strcasecmp($a['name'], $b['name']); });
    echo json_encode($out);
    exit;
}

// ---- load ----
if ($action === 'load') {
    $id = $_GET['id'] ?? '';
    if (!isValidId($id)) fail(400, 'id invalide');
    $path = projectPath($dataDir, $id);
    if (!is_file($path)) fail(404, 'projet introuvable');
    echo file_get_contents($path);
    exit;
}

// ---- save (create or overwrite) ----
if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'methode non autorisee, utiliser POST');
    $body = readJsonBody();
    if (!$body || empty($body['name']) || !isset($body['objects']) || !is_array($body['objects'])) {
        fail(400, 'corps de requete invalide (name et objects sont requis)');
    }

    $now = gmdate('Y-m-d\TH:i:s\Z');
    $id = $body['id'] ?? null;

    if ($id !== null && isValidId($id) && is_file(projectPath($dataDir, $id))) {
        // mise a jour d'un projet existant : on garde createdAt, on sauvegarde une copie de secours
        $existing = json_decode(file_get_contents(projectPath($dataDir, $id)), true);
        $createdAt = $existing['meta']['createdAt'] ?? $now;
        @copy(projectPath($dataDir, $id), projectPath($dataDir, $id) . '.bak');
    } else {
        // nouveau projet : id genere cote serveur, jamais choisi librement par le client
        $base = slugify($body['name']);
        $id = $base;
        $n = 2;
        while (is_file(projectPath($dataDir, $id))) {
            $id = $base . '-' . $n;
            $n++;
        }
        $createdAt = $now;
    }

    $record = [
        'meta' => [
            'id' => $id,
            'name' => (string) $body['name'],
            // Version du client qui a ecrit ce fichier, et version du schema de son contenu :
            // sans elles, un projet qui se comporte mal des mois plus tard n'est rattachable a
            // rien (MD/RELEASE.md 5.2). Un client anterieur au versionnement n'envoie rien : 1.
            'appVersion' => isset($body['appVersion']) ? (string) $body['appVersion'] : null,
            'schemaVersion' => isset($body['schemaVersion']) ? (int) $body['schemaVersion'] : 1,
            'createdAt' => $createdAt,
            'updatedAt' => $now,
        ],
        'objects' => $body['objects'],
        'measures' => $body['measures'] ?? [],
    ];

    $json = json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) fail(500, 'echec de serialisation JSON');

    $fp = fopen(projectPath($dataDir, $id), 'c');
    if (!$fp) fail(500, 'ecriture impossible sur le serveur (droits du dossier data/ ?)');
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    fwrite($fp, $json);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode(['id' => $id, 'updatedAt' => $now]);
    exit;
}

// ---- delete ----
if ($action === 'delete') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'methode non autorisee, utiliser POST');
    $body = readJsonBody();
    $id = $body['id'] ?? '';
    if (!isValidId($id)) fail(400, 'id invalide');
    $path = projectPath($dataDir, $id);
    if (!is_file($path)) fail(404, 'projet introuvable');
    @copy($path, $path . '.deleted.bak');
    unlink($path);
    echo json_encode(['ok' => true]);
    exit;
}

fail(400, 'action inconnue (attendu : list, load, save, delete)');
