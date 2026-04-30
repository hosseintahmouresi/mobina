<?php
define('APP_ROOT', __DIR__);
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');

require_once APP_ROOT . '/includes/Response.php';
require_once APP_ROOT . '/includes/Security.php';
require_once APP_ROOT . '/includes/Crypto.php';
require_once APP_ROOT . '/includes/PushService.php';
require_once APP_ROOT . '/includes/SearchIndex.php';

function repair_h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function repair_post($key, $default = '')
{
    return trim((string) (isset($_POST[$key]) ? $_POST[$key] : $default));
}

function repair_connect($db)
{
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']);
    return new PDO($dsn, $db['user'], $db['pass'], array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ));
}

function repair_setting($pdo, $key, $value)
{
    $stmt = $pdo->prepare('REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute(array($key, $value, gmdate('Y-m-d H:i:s')));
}

function repair_existing_config()
{
    if (!is_file(APP_CONFIG_FILE)) {
        return array();
    }
    $config = require APP_CONFIG_FILE;
    return is_array($config) ? $config : array();
}

function repair_write_config($config)
{
    if (!is_dir(APP_ROOT . '/config')) {
        @mkdir(APP_ROOT . '/config', 0755, true);
    }
    if (is_file(APP_CONFIG_FILE)) {
        @copy(APP_CONFIG_FILE, APP_ROOT . '/config/config.backup-' . gmdate('Ymd-His') . '.php');
    }
    $content = "<?php\n\nreturn " . var_export($config, true) . ";\n";
    if (@file_put_contents(APP_CONFIG_FILE, $content, LOCK_EX) === false) {
        throw new RuntimeException('نوشتن config/config.php ممکن نیست. دسترسی پوشه config را بررسی کنید.');
    }
    @chmod(APP_CONFIG_FILE, 0640);
}

function repair_column_exists($pdo, $table, $column)
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    $stmt->execute(array($table, $column));
    return ((int) $stmt->fetchColumn()) > 0;
}

function repair_index_exists($pdo, $table, $index)
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?');
    $stmt->execute(array($table, $index));
    return ((int) $stmt->fetchColumn()) > 0;
}

function repair_encrypt_existing_plaintext_messages($pdo, $config)
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

function repair_admin_password_valid($pdo, $password)
{
    if ($password === '') {
        return false;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
    $stmt->execute(array('users'));
    if (((int) $stmt->fetchColumn()) < 1) {
        return true;
    }
    $rows = $pdo->query('SELECT password_hash FROM users')->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) {
        return true;
    }
    foreach ($rows as $row) {
        if (!empty($row['password_hash']) && password_verify($password, $row['password_hash'])) {
            return true;
        }
    }
    return false;
}

function repair_base_url()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    $dir = str_replace('\\', '/', dirname(isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '/'));
    $dir = rtrim($dir, '/');
    return $scheme . '://' . $host . ($dir ? $dir : '');
}

$existing = repair_existing_config();
$errors = array();
$success = null;

if ((isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET') === 'POST') {
    $postedDbPass = (string) (isset($_POST['db_pass']) ? $_POST['db_pass'] : '');
    $db = array(
        'host' => repair_post('db_host', 'localhost'),
        'name' => repair_post('db_name'),
        'user' => repair_post('db_user'),
        'pass' => $postedDbPass !== ''
            ? $postedDbPass
            : (isset($existing['db']['pass']) ? (string) $existing['db']['pass'] : ''),
    );
    $baseUrl = rtrim(repair_post('base_url', repair_base_url()), '/');
    $subjectEmail = repair_post('subject_email');
    $hosseinPassword = (string) (isset($_POST['hossein_password']) ? $_POST['hossein_password'] : '');
    $mobinaPassword = (string) (isset($_POST['mobina_password']) ? $_POST['mobina_password'] : '');
    $resetPasswords = !empty($_POST['reset_passwords']);
    $adminPassword = (string) (isset($_POST['admin_password']) ? $_POST['admin_password'] : '');

    if ($db['name'] === '' || $db['user'] === '') {
        $errors[] = 'نام دیتابیس و کاربر دیتابیس الزامی است.';
    }
    if (!filter_var($baseUrl, FILTER_VALIDATE_URL) || strpos($baseUrl, 'https://') !== 0) {
        $errors[] = 'آدرس برنامه باید HTTPS معتبر باشد.';
    }
    if (!filter_var($subjectEmail, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'ایمیل VAPID معتبر نیست.';
    }
    if ($resetPasswords && (strlen($hosseinPassword) < 8 || strlen($mobinaPassword) < 8)) {
        $errors[] = 'برای تغییر رمز، رمز هر دو کاربر حداقل باید ۸ کاراکتر باشد.';
    }

    if (!$errors) {
        try {
            $pdo = repair_connect($db);
            foreach (require APP_ROOT . '/includes/schema.php' as $statement) {
                $pdo->exec($statement);
            }
            if (is_file(APP_CONFIG_FILE) && !repair_admin_password_valid($pdo, $adminPassword)) {
                throw new RuntimeException('برای ترمیم وقتی config موجود است، رمز ورود حسین یا مبینا لازم است.');
            }
            if (!repair_column_exists($pdo, 'users', 'avatar_path')) {
                $pdo->exec('ALTER TABLE users ADD COLUMN avatar_path VARCHAR(255) NULL AFTER avatar_label');
            }
            if (!repair_column_exists($pdo, 'memories', 'attachment_id')) {
                $pdo->exec('ALTER TABLE memories ADD COLUMN attachment_id BIGINT UNSIGNED NULL AFTER emoji');
            }
            if (!repair_column_exists($pdo, 'memories', 'locked')) {
                $pdo->exec('ALTER TABLE memories ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT 0 AFTER attachment_id');
            }
            if (!repair_column_exists($pdo, 'messages', 'deleted_at')) {
                $pdo->exec('ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL AFTER created_at');
            }
            if (!repair_column_exists($pdo, 'messages', 'reply_to_id')) {
                $pdo->exec('ALTER TABLE messages ADD COLUMN reply_to_id BIGINT UNSIGNED NULL AFTER attachment_id');
            }
            if (!repair_column_exists($pdo, 'messages', 'open_at')) {
                $pdo->exec('ALTER TABLE messages ADD COLUMN open_at DATETIME NULL AFTER reply_to_id');
            }
            if (!repair_index_exists($pdo, 'messages', 'idx_messages_reply')) {
                $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_reply (reply_to_id)');
            }
            if (!repair_index_exists($pdo, 'messages', 'idx_messages_open_at')) {
                $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_open_at (open_at)');
            }
            if (!repair_index_exists($pdo, 'messages', 'idx_messages_deleted_id')) {
                $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_deleted_id (deleted_at, id)');
            }
            if (!repair_index_exists($pdo, 'messages', 'idx_messages_sender_created')) {
                $pdo->exec('ALTER TABLE messages ADD INDEX idx_messages_sender_created (sender_id, created_at)');
            }
            if (!repair_index_exists($pdo, 'memories', 'idx_memories_attachment')) {
                $pdo->exec('ALTER TABLE memories ADD INDEX idx_memories_attachment (attachment_id)');
            }
            if (!repair_index_exists($pdo, 'memories', 'idx_memories_locked')) {
                $pdo->exec('ALTER TABLE memories ADD INDEX idx_memories_locked (locked)');
            }

            $now = gmdate('Y-m-d H:i:s');
            $countUsers = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            if ($countUsers === 0 || $resetPasswords) {
                if (strlen($hosseinPassword) < 8 || strlen($mobinaPassword) < 8) {
                    throw new RuntimeException('برای ساخت یا تغییر کاربران، رمز حسین و مبینا لازم است.');
                }
                $users = array(
                    array('hossein', 'حسین', $hosseinPassword, 'ح', '#0f766e'),
                    array('mobina', 'مبینا', $mobinaPassword, 'م', '#e11d48'),
                );
                foreach ($users as $user) {
                    $stmt = $pdo->prepare(
                        'INSERT INTO users (slug, display_name, password_hash, avatar_label, accent, created_at)
                         VALUES (?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                            display_name = VALUES(display_name),
                            password_hash = VALUES(password_hash),
                            avatar_label = VALUES(avatar_label),
                            accent = VALUES(accent)'
                    );
                    $stmt->execute(array(
                        $user[0],
                        $user[1],
                        password_hash($user[2], PASSWORD_DEFAULT),
                        $user[3],
                        $user[4],
                        $now,
                    ));
                }
            }

            repair_setting($pdo, 'app_name', 'SoulMate');
            repair_setting($pdo, 'schema_version', '3.2.2');
            if (!$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'notification_preview'")->fetchColumn()) {
                repair_setting($pdo, 'notification_preview', '1');
            }
            if (!$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'notification_mode'")->fetchColumn()) {
                repair_setting($pdo, 'notification_mode', 'preview');
            }

            $keys = PushService::generateVapidKeys();
            $config = array(
                'app' => array(
                    'name' => 'SoulMate',
                    'base_url' => $baseUrl,
                    'timezone' => 'Asia/Tehran',
                    'max_upload_bytes' => 12 * 1024 * 1024,
                    'poll_ms' => 2200,
                    'encryption_key' => isset($existing['app']['encryption_key']) && $existing['app']['encryption_key']
                        ? $existing['app']['encryption_key']
                        : Crypto::generateKey(),
                    'version' => '3.2.2',
                ),
                'db' => $db,
                'vapid' => array(
                    'subject' => 'mailto:' . $subjectEmail,
                    'public_key' => isset($existing['vapid']['public_key']) && $existing['vapid']['public_key']
                        ? $existing['vapid']['public_key']
                        : $keys['public_key'],
                    'private_key_pem' => isset($existing['vapid']['private_key_pem']) && $existing['vapid']['private_key_pem']
                        ? $existing['vapid']['private_key_pem']
                        : $keys['private_key_pem'],
                ),
            );

            repair_write_config($config);
            repair_setting($pdo, 'messages_encrypted_count', (string) repair_encrypt_existing_plaintext_messages($pdo, $config));
            repair_setting($pdo, 'message_search_rebuilt_count', (string) SearchIndex::rebuildMessages($pdo, $config));
            $success = 'config/config.php بدون حذف داده‌ها ساخته شد.';
        } catch (Exception $e) {
            $errors[] = $e->getMessage();
        }
    }
}

$prefillDb = isset($existing['db']) ? $existing['db'] : array();
$prefillApp = isset($existing['app']) ? $existing['app'] : array();
$prefillVapid = isset($existing['vapid']) ? $existing['vapid'] : array();
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>بازیابی SoulMate</title>
    <style>
        :root { --ink:#172126; --line:#d8e2df; --rose:#e11d48; --teal:#0f766e; --paper:#fbfdfc; --soft:#eef5f2; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; font-family:Tahoma, Arial, sans-serif; background:var(--paper); color:var(--ink); display:grid; place-items:center; padding:24px; }
        main { width:min(760px, 100%); border:1px solid var(--line); background:#fff; border-radius:8px; padding:24px; box-shadow:0 18px 50px rgba(23,33,38,.08); }
        h1 { margin:0 0 8px; font-size:28px; }
        p { line-height:1.9; color:#43525a; }
        form { display:grid; gap:14px; }
        .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
        label { display:grid; gap:7px; color:#34434a; font-size:13px; font-weight:700; }
        input { width:100%; border:1px solid var(--line); border-radius:8px; padding:12px; font:inherit; direction:ltr; }
        .check { display:flex; align-items:center; gap:8px; }
        .check input { width:18px; height:18px; }
        button, a { border:0; border-radius:8px; background:var(--rose); color:#fff; padding:12px 16px; font:inherit; font-weight:800; cursor:pointer; text-decoration:none; display:inline-flex; justify-content:center; }
        a { background:var(--teal); }
        .notice { border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--soft); }
        .error { border-color:#fecdd3; background:#fff1f2; color:#9f1239; }
        .ok { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
        @media (max-width:680px){ .grid { grid-template-columns:1fr; } }
    </style>
</head>
<body>
<main>
    <h1>بازیابی SoulMate</h1>
    <p>این صفحه فقط فایل config و جدول‌های جاافتاده را می‌سازد؛ پیام‌ها، خاطره‌ها و فایل‌های قبلی را حذف نمی‌کند.</p>

    <?php if ($success): ?>
        <div class="notice ok"><?= repair_h($success) ?></div>
        <a href="./update.php">ادامه به آپدیت امن</a>
    <?php endif; ?>

    <?php if ($errors): ?>
        <div class="notice error">
            <?php foreach ($errors as $error): ?>
                <div><?= repair_h($error) ?></div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <form method="post" autocomplete="off">
        <div class="grid">
            <label>هاست دیتابیس
                <input name="db_host" value="<?= repair_h(repair_post('db_host', isset($prefillDb['host']) ? $prefillDb['host'] : 'localhost')) ?>" required>
            </label>
            <label>نام دیتابیس
                <input name="db_name" value="<?= repair_h(repair_post('db_name', isset($prefillDb['name']) ? $prefillDb['name'] : '')) ?>" required>
            </label>
            <label>کاربر دیتابیس
                <input name="db_user" value="<?= repair_h(repair_post('db_user', isset($prefillDb['user']) ? $prefillDb['user'] : '')) ?>" required>
            </label>
            <label>رمز دیتابیس
                <input name="db_pass" type="password" value="<?= repair_h((string) (isset($_POST['db_pass']) ? $_POST['db_pass'] : '')) ?>" placeholder="<?= isset($prefillDb['pass']) && $prefillDb['pass'] !== '' ? 'رمز قبلی محفوظ می‌ماند' : '' ?>">
            </label>
        </div>

        <?php if (is_file(APP_CONFIG_FILE)): ?>
            <label>رمز ورود حسین یا مبینا برای تأیید ترمیم
                <input name="admin_password" type="password" autocomplete="current-password" required>
            </label>
        <?php endif; ?>

        <label>آدرس HTTPS برنامه
            <input name="base_url" value="<?= repair_h(repair_post('base_url', isset($prefillApp['base_url']) ? $prefillApp['base_url'] : repair_base_url())) ?>" required>
        </label>

        <label>ایمیل VAPID
            <input name="subject_email" type="email" value="<?= repair_h(repair_post('subject_email', isset($prefillVapid['subject']) ? str_replace('mailto:', '', $prefillVapid['subject']) : '')) ?>" required>
        </label>

        <label class="check">
            <input type="checkbox" name="reset_passwords" value="1" <?= !empty($_POST['reset_passwords']) ? 'checked' : '' ?>>
            ساخت/تغییر رمز کاربران حسین و مبینا
        </label>

        <div class="grid">
            <label>رمز حسین
                <input name="hossein_password" type="password" minlength="8">
            </label>
            <label>رمز مبینا
                <input name="mobina_password" type="password" minlength="8">
            </label>
        </div>

        <button type="submit">بازیابی بدون حذف داده‌ها</button>
    </form>
</main>
</body>
</html>
