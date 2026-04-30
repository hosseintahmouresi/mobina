<?php
define('APP_ROOT', __DIR__);
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');
define('APP_VERSION', '3.2.2');

require_once APP_ROOT . '/includes/Response.php';
require_once APP_ROOT . '/includes/Security.php';
require_once APP_ROOT . '/includes/Database.php';
require_once APP_ROOT . '/includes/Crypto.php';
require_once APP_ROOT . '/includes/SearchIndex.php';

define('APP_LOG_FILE', APP_ROOT . '/storage/logs/app.log');
Security::installErrorHandlers(APP_LOG_FILE);
Security::sendBaseHeaders();
header('Cache-Control: no-store, private');

function h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
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
    if (!is_dir(APP_ROOT . '/config')) {
        @mkdir(APP_ROOT . '/config', 0755, true);
    }

    if (is_file(APP_CONFIG_FILE)) {
        $backup = APP_ROOT . '/config/config.backup-' . gmdate('Ymd-His') . '.php';
        @copy(APP_CONFIG_FILE, $backup);
    }

    $content = "<?php\n\nreturn " . var_export($config, true) . ";\n";
    if (@file_put_contents(APP_CONFIG_FILE, $content, LOCK_EX) === false) {
        throw new RuntimeException('نوشتن config/config.php ممکن نیست. دسترسی نوشتن پوشه config را بررسی کنید.');
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

function update_password_is_valid($password)
{
    if (!is_file(APP_CONFIG_FILE) || $password === '') {
        return false;
    }

    $config = require APP_CONFIG_FILE;
    $pdo = Database::pdo($config);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
    $stmt->execute(array('users'));
    if (((int) $stmt->fetchColumn()) < 1) {
        return true;
    }

    $rows = $pdo->query('SELECT password_hash FROM users')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $row) {
        if (!empty($row['password_hash']) && password_verify($password, $row['password_hash'])) {
            return true;
        }
    }
    return false;
}

function run_update($fixBaseUrl)
{
    if (!is_file(APP_CONFIG_FILE)) {
        throw new RuntimeException('config/config.php پیدا نشد. اگر نصب اولیه انجام نشده، install.php را اجرا کنید.');
    }

    $config = require APP_CONFIG_FILE;
    if (!is_array($config)) {
        throw new RuntimeException('config/config.php معتبر نیست.');
    }

    if (!isset($config['app']) || !is_array($config['app'])) {
        $config['app'] = array();
    }
    if (!isset($config['db']) || !is_array($config['db'])) {
        throw new RuntimeException('تنظیمات دیتابیس در config/config.php پیدا نشد.');
    }
    if (!isset($config['vapid']) || !is_array($config['vapid'])) {
        $config['vapid'] = array('subject' => 'mailto:admin@example.com', 'public_key' => '', 'private_key_pem' => '');
    }

    $config['app']['name'] = isset($config['app']['name']) ? $config['app']['name'] : 'مبینا';
    $config['app']['name'] = 'SoulMate';
    $config['app']['base_url'] = $fixBaseUrl ? current_base_url() : (isset($config['app']['base_url']) ? rtrim($config['app']['base_url'], '/') : current_base_url());
    $config['app']['timezone'] = isset($config['app']['timezone']) ? $config['app']['timezone'] : 'Asia/Tehran';
    $config['app']['max_upload_bytes'] = isset($config['app']['max_upload_bytes']) ? (int) $config['app']['max_upload_bytes'] : 12 * 1024 * 1024;
    $config['app']['poll_ms'] = isset($config['app']['poll_ms']) ? (int) $config['app']['poll_ms'] : 2200;
    if (empty($config['app']['encryption_key'])) {
        $config['app']['encryption_key'] = Crypto::generateKey();
    }
    $config['app']['version'] = APP_VERSION;

    if (empty($config['vapid']['subject'])) {
        $config['vapid']['subject'] = 'mailto:admin@example.com';
    }
    if (!isset($config['vapid']['public_key'])) {
        $config['vapid']['public_key'] = '';
    }
    if (!isset($config['vapid']['private_key_pem'])) {
        $config['vapid']['private_key_pem'] = '';
    }

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
    $stmt->execute(array('schema_version', APP_VERSION, $now));
    $stmt->execute(array('app_updated_at', $now, $now));
    $stmt->execute(array('app_name', 'SoulMate', $now));
    $stmt->execute(array('messages_encrypted_count', (string) encrypt_existing_plaintext_messages($pdo, $config), $now));
    $stmt->execute(array('message_search_rebuilt_count', (string) SearchIndex::rebuildMessages($pdo, $config), $now));

    return array(
        'version' => APP_VERSION,
        'base_url' => $config['app']['base_url'],
        'config_rewritten' => true,
    );
}

$result = null;
$error = null;
$installed = is_file(APP_CONFIG_FILE);

if ((isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET') === 'POST') {
    try {
        if ($installed && !update_password_is_valid((string) (isset($_POST['password']) ? $_POST['password'] : ''))) {
            throw new RuntimeException('برای اجرای آپدیت، رمز ورود حسین یا مبینا را وارد کنید.');
        }
        $result = run_update(!empty($_POST['fix_base_url']));
    } catch (Exception $e) {
        Security::logException($e);
        $error = $e->getMessage();
    }
}

$currentUrl = current_base_url();
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>آپدیت SoulMate</title>
    <style>
        :root { --ink:#172126; --line:#d8e2df; --rose:#e11d48; --teal:#0f766e; --paper:#fbfdfc; --soft:#eef5f2; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; font-family:Tahoma, Arial, sans-serif; background:var(--paper); color:var(--ink); display:grid; place-items:center; padding:24px; }
        main { width:min(760px, 100%); border:1px solid var(--line); background:#fff; border-radius:8px; padding:24px; box-shadow:0 18px 50px rgba(23,33,38,.08); }
        h1 { margin:0 0 8px; font-size:28px; }
        p, li { line-height:1.9; color:#43525a; }
        .notice { border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--soft); margin:14px 0; }
        .error { border-color:#fecdd3; background:#fff1f2; color:#9f1239; }
        .ok { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
        label { display:flex; align-items:center; gap:8px; margin:14px 0; color:#34434a; font-weight:700; }
        input[type="checkbox"] { width:18px; height:18px; }
        button, a.button { border:0; border-radius:8px; background:var(--rose); color:#fff; padding:12px 16px; font:inherit; font-weight:800; cursor:pointer; text-decoration:none; display:inline-flex; }
        a.button { background:var(--teal); margin-top:10px; }
        code { direction:ltr; display:inline-block; background:#f4f7f6; padding:2px 6px; border-radius:6px; }
    </style>
</head>
<body>
<main>
    <h1>آپدیت SoulMate</h1>
    <p>این صفحه فایل کانفیگ را کامل می‌کند و جدول‌های دیتابیس را بدون حذف پیام‌ها و خاطره‌ها به‌روزرسانی می‌کند.</p>

    <?php if (!$installed): ?>
        <div class="notice error">برنامه هنوز نصب نشده است. اول <code>install.php</code> را اجرا کنید.</div>
    <?php endif; ?>

    <?php if ($error): ?>
        <div class="notice error"><?= h($error) ?></div>
    <?php endif; ?>

    <?php if ($result): ?>
        <div class="notice ok">
            آپدیت انجام شد. نسخه: <?= h($result['version']) ?><br>
            آدرس برنامه: <code><?= h($result['base_url']) ?></code>
        </div>
        <a class="button" href="./">باز کردن برنامه</a>
    <?php endif; ?>

    <?php if ($installed && !$result): ?>
        <form method="post">
            <div class="notice">
                آدرس تشخیص‌داده‌شده فعلی: <code><?= h($currentUrl) ?></code>
            </div>
            <label>
                <input type="checkbox" name="fix_base_url" value="1" checked>
                آدرس برنامه در config با همین آدرس فعلی تنظیم شود
            </label>
            <label>
                رمز ورود حسین یا مبینا
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button type="submit">اجرای آپدیت امن</button>
        </form>
    <?php endif; ?>
</main>
</body>
</html>
