<?php
// Le role du .htaccess pour `php -S` : `admin/<chemin>` -> admin.php?chemin=<chemin>,
// `admin/claude/<chemin>` -> analyse.php?chemin=<chemin>, `admin/consommation` -> analyse.php?chemin=@consommation.
$p = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// `admin/claude/<chemin>` -> analyse.php, avant le reste d'`admin/`, comme dans .htaccess.
if (getenv('ANALYSE_PHP') && preg_match('#^/admin/claude(?:/(.*))?$#', $p, $m)) {
    $_GET['chemin'] = $m[1] ?? '';
    $_SERVER['SCRIPT_NAME'] = '/analyse.php';
    require getenv('ANALYSE_PHP');
    return true;
}
if (getenv('ANALYSE_PHP') && preg_match('#^/admin/consommation/?$#', $p)) {
    $_GET['chemin'] = '@consommation';
    $_SERVER['SCRIPT_NAME'] = '/analyse.php';
    require getenv('ANALYSE_PHP');
    return true;
}
// `admin/audits[/<id>]` -> analyse.php?chemin=@audits/<id> (les audits partages, lot L21).
if (getenv('ANALYSE_PHP') && preg_match('#^/admin/audits(?:/(.*))?$#', $p, $m)) {
    $_GET['chemin'] = '@audits/' . ($m[1] ?? '');
    $_SERVER['SCRIPT_NAME'] = '/analyse.php';
    require getenv('ANALYSE_PHP');
    return true;
}
if (preg_match('#^/admin/(.*)$#', $p, $m)) {
    $_GET['chemin'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/admin.php';
    require getenv('ADMIN_PHP');
    return true;
}
http_response_code(404);
echo 'page';
return true;
