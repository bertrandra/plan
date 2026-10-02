<?php
// Le role du .htaccess pour `php -S` : `admin/<chemin>` -> admin.php?chemin=<chemin>.
$p = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/admin/(.*)$#', $p, $m)) {
    $_GET['chemin'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/admin.php';
    require getenv('ADMIN_PHP');
    return true;
}
http_response_code(404);
echo 'page';
return true;
