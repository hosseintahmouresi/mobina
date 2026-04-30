<?php
define('APP_ROOT', __DIR__);
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');
define('UPGRADE_APP_VERSION', '3.2.2');

@ini_set('display_errors', '0');
@ini_set('log_errors', '1');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store, private');

function h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function upgrade_log($message)
{
    $dir = APP_ROOT . '/storage/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($dir . '/app.log', '[' . gmdate('Y-m-d H:i:s') . ' UTC] UPGRADE ' . $message . "\n", FILE_APPEND | LOCK_EX);
}

function clean_relative_path($path)
{
    $path = str_replace('\\', '/', (string) $path);
    $path = ltrim($path, '/');
    if ($path === '' || strpos($path, "\0") !== false || preg_match('~(^|/)\.\.(/|$)~', $path)) {
        throw new RuntimeException('فایل zip مسیر نامعتبر دارد.');
    }
    return $path;
}

function ensure_inside_app($path)
{
    $root = str_replace('\\', '/', realpath(APP_ROOT));
    $parent = str_replace('\\', '/', realpath(is_dir($path) ? $path : dirname($path)));
    if ($parent === false || strpos($parent, $root) !== 0) {
        throw new RuntimeException('مسیر فایل خارج از برنامه است.');
    }
}

function recursive_delete($path)
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    ensure_inside_app($path);
    if (is_file($path) || is_link($path)) {
        if (!@unlink($path)) {
            throw new RuntimeException('حذف فایل ممکن نشد: ' . basename($path));
        }
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        throw new RuntimeException('خواندن پوشه ممکن نشد: ' . basename($path));
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        recursive_delete($path . '/' . $item);
    }
    if (!@rmdir($path)) {
        throw new RuntimeException('حذف پوشه ممکن نشد: ' . basename($path));
    }
}

function should_skip_extract($relative)
{
    if ($relative === 'config/config.php') {
        return true;
    }
    if (preg_match('/\.zip$/i', $relative)) {
        return true;
    }
    if (strpos($relative, 'uploads/') === 0 && !in_array($relative, array('uploads/.htaccess', 'uploads/.gitkeep'), true)) {
        return true;
    }
    if (strpos($relative, 'storage/logs/') === 0 || strpos($relative, 'storage/backups/') === 0 || strpos($relative, 'storage/upgrade-') === 0) {
        return true;
    }
    return false;
}

function copy_tree($from, $to)
{
    if (is_dir($from)) {
        if (!is_dir($to) && !@mkdir($to, 0755, true)) {
            throw new RuntimeException('ساخت پوشه مقصد ممکن نشد: ' . basename($to));
        }
        $items = scandir($from);
        if ($items === false) {
            throw new RuntimeException('خواندن پوشه نسخه جدید ممکن نشد.');
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            copy_tree($from . '/' . $item, $to . '/' . $item);
        }
        return;
    }
    $dir = dirname($to);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        throw new RuntimeException('ساخت پوشه فایل مقصد ممکن نشد.');
    }
    if (!@copy($from, $to)) {
        throw new RuntimeException('کپی فایل نسخه جدید ممکن نشد: ' . basename($to));
    }
    @chmod($to, 0644);
}

function zip_add_path($zip, $path, $baseLength)
{
    $relative = ltrim(str_replace('\\', '/', substr($path, $baseLength)), '/');
    if ($relative === '' || $relative === 'config/config.php' || preg_match('/\.zip$/i', $relative)) {
        return;
    }
    if (strpos($relative, 'uploads/') === 0 || strpos($relative, 'storage/backups/') === 0 || strpos($relative, 'storage/upgrade-') === 0) {
        return;
    }
    if (is_dir($path)) {
        $zip->addEmptyDir($relative);
        $items = scandir($path);
        if ($items) {
            foreach ($items as $item) {
                if ($item !== '.' && $item !== '..') {
                    zip_add_path($zip, $path . '/' . $item, $baseLength);
                }
            }
        }
        return;
    }
    $zip->addFile($path, $relative);
}

function make_backup()
{
    $dir = APP_ROOT . '/storage/backups';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $path = $dir . '/code-backup-' . gmdate('Ymd-His') . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('ساخت بکاپ قبل از آپدیت ممکن نشد.');
    }
    $baseLength = strlen(APP_ROOT) + 1;
    foreach (scandir(APP_ROOT) as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        zip_add_path($zip, APP_ROOT . '/' . $item, $baseLength);
    }
    $zip->close();
    return $path;
}

function verify_password($password)
{
    if (!is_file(APP_CONFIG_FILE)) {
        throw new RuntimeException('config/config.php پیدا نشد. اول نصب اولیه را کامل کنید.');
    }
    if ($password === '') {
        return false;
    }
    require_once APP_ROOT . '/includes/Database.php';
    $config = require APP_CONFIG_FILE;
    $pdo = Database::pdo($config);
    $rows = $pdo->query('SELECT password_hash FROM users')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $row) {
        if (!empty($row['password_hash']) && password_verify($password, $row['password_hash'])) {
            return true;
        }
    }
    return false;
}

function validate_zip($zip, $extractDir)
{
    $required = array('index.php', 'assets/app.js', 'assets/app.css', 'api/messages.php', 'api/love.php', 'api/search.php', 'api/webauthn.php', 'includes/schema.php', 'includes/WebAuthn.php', 'includes/SearchIndex.php', 'update.php', 'upgrade.php');
    $seen = array();
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = clean_relative_path($zip->getNameIndex($i));
        if (substr($name, -1) === '/') {
            continue;
        }
        $seen[$name] = true;
        if (should_skip_extract($name)) {
            continue;
        }
        $target = $extractDir . '/' . $name;
        $dir = dirname($target);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
            throw new RuntimeException('ساخت پوشه موقت ممکن نشد.');
        }
        $stream = $zip->getStream($zip->getNameIndex($i));
        if (!$stream) {
            throw new RuntimeException('خواندن فایل zip ممکن نشد.');
        }
        $out = @fopen($target, 'wb');
        if (!$out) {
            fclose($stream);
            throw new RuntimeException('نوشتن فایل موقت ممکن نشد.');
        }
        stream_copy_to_stream($stream, $out);
        fclose($stream);
        fclose($out);
    }
    foreach ($required as $file) {
        if (empty($seen[$file])) {
            throw new RuntimeException('این zip نسخه کامل SoulMate نیست. فایل لازم پیدا نشد: ' . $file);
        }
    }
}

function replace_app_files($extractDir)
{
    $delete = array(
        'api',
        'assets',
        'fonts',
        'includes',
        'index.php',
        'manifest.webmanifest',
        'sw.js',
        'doctor.php',
        'install.php',
        'repair.php',
        'update.php',
        'README.md',
        'DEPLOYMENT.md',
        'IMPROVEMENTS.md',
        'soulmate-pwa.zip',
        'api.zip',
        '.htaccess',
        'config/config.sample.php',
        'config/.htaccess',
        'storage/.htaccess',
        'uploads/.htaccess'
    );
    foreach ($delete as $relative) {
        recursive_delete(APP_ROOT . '/' . $relative);
    }

    $items = scandir($extractDir);
    if ($items === false) {
        throw new RuntimeException('پوشه نسخه جدید قابل خواندن نیست.');
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        copy_tree($extractDir . '/' . $item, APP_ROOT . '/' . $item);
    }
}

function current_base_url()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    $dir = str_replace('\\', '/', dirname(isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/'));
    $dir = rtrim($dir, '/');
    return $scheme . '://' . $host . ($dir ? $dir : '');
}

function write_config_file($config)
{
    $content = "<?php\n\nreturn " . var_export($config, true) . ";\n";
    if (@file_put_contents(APP_CONFIG_FILE, $content, LOCK_EX) === false) {
        throw new RuntimeException('نوشتن config/config.php ممکن نیست.');
    }
    @chmod(APP_CONFIG_FILE, 0640);
}

function column_exists($pdo, $table, $column)
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    $stmt->execute(array($table, $column));
    return ((int) $stmt->fetchColumn()) > 0;
}

function index_exists($pdo, $table, $index)
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?');
    $stmt->execute(array($table, $index));
    return ((int) $stmt->fetchColumn()) > 0;
}

function encrypt_existing_plaintext_messages($pdo, $config)
{
    $select = $pdo->prepare(
        'SELECT id, body
         FROM messages
         WHERE body IS NOT NULL
           AND body <> \'\'
           AND body NOT LIKE ?
         ORDER BY id
         LIMIT 200'
    );
    $update = $pdo->prepare('UPDATE messages SET body = ? WHERE id = ?');
    $encrypted = 0;

    do {
        $select->execute(array(Crypto::PREFIX . '%'));
        $rows = $select->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $update->execute(array(Crypto::encrypt((string) $row['body'], $config), (int) $row['id']));
            $encrypted++;
        }
    } while (count($rows) === 200);

    return $encrypted;
}

function run_schema_update()
{
    require_once APP_ROOT . '/includes/Database.php';
    require_once APP_ROOT . '/includes/Crypto.php';
    require_once APP_ROOT . '/includes/SearchIndex.php';
    $config = require APP_CONFIG_FILE;
    if (!isset($config['app']) || !is_array($config['app'])) {
        $config['app'] = array();
    }
    $config['app']['name'] = 'SoulMate';
    $config['app']['base_url'] = isset($config['app']['base_url']) ? rtrim($config['app']['base_url'], '/') : current_base_url();
    $config['app']['timezone'] = isset($config['app']['timezone']) ? $config['app']['timezone'] : 'Asia/Tehran';
    $config['app']['max_upload_bytes'] = isset($config['app']['max_upload_bytes']) ? (int) $config['app']['max_upload_bytes'] : 12 * 1024 * 1024;
    $config['app']['poll_ms'] = isset($config['app']['poll_ms']) ? (int) $config['app']['poll_ms'] : 1400;
    if (empty($config['app']['encryption_key'])) {
        $config['app']['encryption_key'] = Crypto::generateKey();
    }
    $config['app']['version'] = UPGRADE_APP_VERSION;
    write_config_file($config);

    $pdo = Database::pdo($config);
    foreach (require APP_ROOT . '/includes/schema.php' as $statement) {
        $pdo->exec($statement);
    }
    if (!column_exists($pdo, 'users', 'avatar_path')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN avatar_path VARCHAR(255) NULL AFTER avatar_label');
    }
    if (!column_exists($pdo, 'memories', 'attachment_id')) {
        $pdo->exec('ALTER TABLE memories ADD COLUMN attachment_id BIGINT UNSIGNED NULL AFTER emoji');
    }
    if (!column_exists($pdo, 'memories', 'locked')) {
        $pdo->exec('ALTER TABLE memories ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT 0 AFTER attachment_id');
    }
    if (!column_exists($pdo, 'messages', 'deleted_at')) {
        $pdo->exec('ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL AFTER created_at');
    }
    if (!column_exists($pdo, 'messages', 'reply_to_id')) {
        $pdo->exec('ALTER TABLE messages ADD COLUMN reply_to_id BIGINT UNSIGNED NULL AFTER attachment_id');
    }
    if (!column_exists($pdo, 'messages', 'open_at')) {
        $pdo->exec('ALTER TABLE messages ADD COLUMN open_at DATETIME NULL AFTER reply_to_id');
    }
    if (!index_exists($pdo, 'messages', 'idx_messages_reply')) {
        $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_reply (reply_to_id)');
    }
    if (!index_exists($pdo, 'messages', 'idx_messages_open_at')) {
        $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_open_at (open_at)');
    }
    if (!index_exists($pdo, 'messages', 'idx_messages_deleted_id')) {
        $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_deleted_id (deleted_at, id)');
    }
    if (!index_exists($pdo, 'messages', 'idx_messages_sender_created')) {
        $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_sender_created (sender_id, created_at)');
    }
    if (!index_exists($pdo, 'memories', 'idx_memories_attachment')) {
        $pdo->exec('ALTER TABLE memories ADD INDEX idx_memories_attachment (attachment_id)');
    }
    if (!index_exists($pdo, 'memories', 'idx_memories_locked')) {
        $pdo->exec('ALTER TABLE memories ADD INDEX idx_memories_locked (locked)');
    }
    $now = gmdate('Y-m-d H:i:s');
    $stmt = $pdo->prepare('REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(array('schema_version', UPGRADE_APP_VERSION, $now));
    $stmt->execute(array('app_updated_at', $now, $now));
    $stmt->execute(array('app_name', 'SoulMate', $now));
    $stmt->execute(array('messages_encrypted_count', (string) encrypt_existing_plaintext_messages($pdo, $config), $now));
    $stmt->execute(array('message_search_rebuilt_count', (string) SearchIndex::rebuildMessages($pdo, $config), $now));
}

function run_zip_upgrade()
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('افزونه PHP ZipArchive روی هاست فعال نیست. در کنترل‌پنل هاست extension=zip را فعال کنید.');
    }
    if (!isset($_FILES['package']) || !is_array($_FILES['package']) || ($_FILES['package']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('فایل zip نسخه جدید دریافت نشد.');
    }
    if (!verify_password((string) ($_POST['password'] ?? ''))) {
        throw new RuntimeException('رمز واردشده معتبر نیست.');
    }

    $suffix = function_exists('random_bytes') ? bin2hex(random_bytes(4)) : substr(md5(uniqid('', true)), 0, 8);
    $workDir = APP_ROOT . '/storage/upgrade-' . gmdate('Ymd-His') . '-' . $suffix;
    $extractDir = $workDir . '/extract';
    if (!@mkdir($extractDir, 0755, true)) {
        throw new RuntimeException('ساخت پوشه موقت آپدیت ممکن نشد.');
    }

    try {
        $zip = new ZipArchive();
        if ($zip->open($_FILES['package']['tmp_name']) !== true) {
            throw new RuntimeException('فایل zip قابل باز شدن نیست.');
        }
        validate_zip($zip, $extractDir);
        $zip->close();

        $backup = make_backup();
        replace_app_files($extractDir);
        run_schema_update();
        recursive_delete($workDir);
    } catch (Exception $e) {
        if (isset($zip) && $zip instanceof ZipArchive) {
            @$zip->close();
        }
        if (is_dir($workDir)) {
            recursive_delete($workDir);
        }
        throw $e;
    }

    return array(
        'backup' => str_replace(APP_ROOT . '/', '', $backup),
        'version' => UPGRADE_APP_VERSION,
    );
}

$result = null;
$error = null;
if ((isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET') === 'POST') {
    try {
        $result = run_zip_upgrade();
    } catch (Exception $e) {
        upgrade_log($e->getMessage());
        $error = $e->getMessage();
    }
}

$maxUpload = ini_get('upload_max_filesize');
$maxPost = ini_get('post_max_size');
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>آپدیت با zip - SoulMate</title>
    <style>
        :root { --ink:#17212b; --muted:#617080; --line:#d9e1e8; --blue:#3390ec; --paper:#eef3f7; --ok:#15803d; --bad:#be123c; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; font-family:Tahoma, Arial, sans-serif; background:var(--paper); color:var(--ink); display:grid; place-items:center; padding:20px; }
        main { width:min(760px, 100%); background:#fff; border:1px solid var(--line); border-radius:10px; padding:22px; box-shadow:0 16px 40px rgba(23,33,43,.10); }
        h1 { margin:0 0 8px; font-size:26px; }
        p, li { color:var(--muted); line-height:1.9; }
        .notice { border:1px solid var(--line); background:#f8fafc; border-radius:10px; padding:12px; margin:14px 0; }
        .ok { border-color:#bbf7d0; background:#f0fdf4; color:var(--ok); }
        .error { border-color:#fecdd3; background:#fff1f2; color:var(--bad); }
        label { display:grid; gap:7px; margin:12px 0; font-weight:700; }
        input { width:100%; border:1px solid var(--line); border-radius:8px; padding:12px; font:inherit; }
        button, a.button { border:0; border-radius:8px; background:var(--blue); color:#fff; padding:12px 16px; font:inherit; font-weight:800; cursor:pointer; text-decoration:none; display:inline-flex; }
        code { direction:ltr; display:inline-block; background:#eef3f7; padding:2px 6px; border-radius:6px; }
    </style>
</head>
<body>
<main>
    <h1>آپدیت SoulMate با فایل zip</h1>
    <p>zip نسخه جدید را انتخاب کن؛ برنامه خودش کدهای قبلی را جایگزین می‌کند و دیتابیس را آپدیت می‌کند. <code>config/config.php</code>، فایل‌های آپلودشده و لاگ‌ها حذف نمی‌شوند.</p>

    <?php if ($error): ?>
        <div class="notice error"><?= h($error) ?></div>
    <?php endif; ?>

    <?php if ($result): ?>
        <div class="notice ok">
            آپدیت کامل شد. نسخه: <?= h($result['version']) ?><br>
            بکاپ کد قبلی: <code><?= h($result['backup']) ?></code>
        </div>
        <a class="button" href="./">باز کردن برنامه</a>
    <?php else: ?>
        <div class="notice">
            محدودیت هاست: <code>upload_max_filesize=<?= h($maxUpload) ?></code> و <code>post_max_size=<?= h($maxPost) ?></code>
        </div>
        <form method="post" enctype="multipart/form-data">
            <label>
                فایل zip نسخه جدید
                <input type="file" name="package" accept=".zip,application/zip" required>
            </label>
            <label>
                رمز ورود حسین یا مبینا
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button type="submit">آپلود و جایگزینی کامل</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
