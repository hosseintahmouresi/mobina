<?php
define('APP_ROOT', __DIR__);
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');

require_once APP_ROOT . '/includes/Response.php';
require_once APP_ROOT . '/includes/Crypto.php';
require_once APP_ROOT . '/includes/PushService.php';

$installed = is_file(APP_CONFIG_FILE);
$errors = [];
$success = false;
$manualConfig = '';

function e($value)
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function post_value($key, $default = '')
{
    return trim((string) ($_POST[$key] ?? $default));
}

function connect_db($db)
{
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']);
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function put_setting($pdo, $key, $value)
{
    $stmt = $pdo->prepare('REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)');
    $stmt->execute([$key, $value, gmdate('Y-m-d H:i:s')]);
}

function install_column_exists($pdo, $table, $column)
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    $stmt->execute([$table, $column]);
    return ((int) $stmt->fetchColumn()) > 0;
}

if (!$installed && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $db = [
        'host' => post_value('db_host', 'localhost'),
        'name' => post_value('db_name'),
        'user' => post_value('db_user'),
        'pass' => (string) ($_POST['db_pass'] ?? ''),
    ];
    $baseUrl = rtrim(post_value('base_url'), '/');
    $subjectEmail = post_value('subject_email');
    $hosseinPassword = (string) ($_POST['hossein_password'] ?? '');
    $mobinaPassword = (string) ($_POST['mobina_password'] ?? '');
    $coupleSince = post_value('couple_since', date('Y-m-d'));

    if ($db['name'] === '' || $db['user'] === '') {
        $errors[] = 'نام دیتابیس و کاربر دیتابیس الزامی است.';
    }
    if (!filter_var($baseUrl, FILTER_VALIDATE_URL) || strpos($baseUrl, 'https://') !== 0) {
        $errors[] = 'آدرس برنامه باید HTTPS معتبر باشد؛ Web Push روی HTTPS کار می‌کند.';
    }
    if (!filter_var($subjectEmail, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'ایمیل VAPID معتبر نیست.';
    }
    if (strlen($hosseinPassword) < 8 || strlen($mobinaPassword) < 8) {
        $errors[] = 'رمز هر دو کاربر حداقل باید ۸ کاراکتر باشد.';
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $coupleSince)) {
        $errors[] = 'تاریخ شروع باید با فرمت YYYY-MM-DD باشد.';
    }

    if (!$errors) {
        try {
            $pdo = connect_db($db);
            foreach (require APP_ROOT . '/includes/schema.php' as $statement) {
                $pdo->exec($statement);
            }
            if (!install_column_exists($pdo, 'users', 'avatar_path')) {
                $pdo->exec('ALTER TABLE users ADD COLUMN avatar_path VARCHAR(255) NULL AFTER avatar_label');
            }

            $now = gmdate('Y-m-d H:i:s');
            $users = [
                ['hossein', 'حسین', $hosseinPassword, 'ح', '#0f766e'],
                ['mobina', 'مبینا', $mobinaPassword, 'م', '#e11d48'],
            ];

            $pdo->beginTransaction();
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
                $stmt->execute([
                    $user[0],
                    $user[1],
                    password_hash($user[2], PASSWORD_DEFAULT),
                    $user[3],
                    $user[4],
                    $now,
                ]);
            }

            put_setting($pdo, 'app_name', 'SoulMate');
            put_setting($pdo, 'schema_version', '3.2.2');
            put_setting($pdo, 'couple_since', $coupleSince);
            put_setting($pdo, 'daily_phrase', 'هر پیام کوچک، یک قرار کوتاه بین ماست.');
            put_setting($pdo, 'notification_preview', '1');
            put_setting($pdo, 'notification_mode', 'preview');
            $pdo->commit();

            $keys = PushService::generateVapidKeys();
            $config = [
                'app' => [
                    'name' => 'SoulMate',
                    'base_url' => $baseUrl,
                    'timezone' => 'Asia/Tehran',
                    'max_upload_bytes' => 12 * 1024 * 1024,
                    'poll_ms' => 2200,
                    'encryption_key' => Crypto::generateKey(),
                    'version' => '3.2.2',
                ],
                'db' => $db,
                'vapid' => [
                    'subject' => 'mailto:' . $subjectEmail,
                    'public_key' => $keys['public_key'],
                    'private_key_pem' => $keys['private_key_pem'],
                ],
            ];

            $manualConfig = "<?php\n\n"
                . 'return ' . var_export($config, true) . ";\n";

            if (!is_dir(APP_ROOT . '/config')) {
                mkdir(APP_ROOT . '/config', 0755, true);
            }

            $written = @file_put_contents(APP_CONFIG_FILE, $manualConfig, LOCK_EX);
            if ($written === false) {
                $errors[] = 'جدول‌ها ساخته شدند، اما نوشتن فایل config/config.php ممکن نبود. متن کانفیگ پایین را در همین مسیر قرار بدهید.';
            } else {
                @chmod(APP_CONFIG_FILE, 0640);
                $success = true;
                $installed = true;
            }
        } catch (Throwable $e) {
            if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $errors[] = $e->getMessage();
        }
    }
}

$defaultUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'example.com') . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>نصب SoulMate</title>
    <style>
        :root { color-scheme: light; --ink:#172126; --line:#d8e2df; --rose:#e11d48; --teal:#0f766e; --paper:#fbfdfc; --soft:#eef5f2; }
        * { box-sizing: border-box; }
        body { margin:0; min-height:100vh; font-family: Tahoma, Arial, sans-serif; background: var(--paper); color: var(--ink); display:grid; place-items:center; padding:24px; }
        main { width:min(760px, 100%); border:1px solid var(--line); background:#fff; border-radius:8px; padding:24px; box-shadow:0 18px 50px rgba(23,33,38,.08); }
        h1 { margin:0 0 8px; font-size:28px; }
        p { line-height:1.9; margin:8px 0 18px; color:#43525a; }
        form { display:grid; gap:16px; }
        .grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
        label { display:grid; gap:7px; font-size:13px; font-weight:700; color:#34434a; }
        input { width:100%; border:1px solid var(--line); border-radius:8px; padding:12px; font:inherit; direction:ltr; }
        input[name="subject_email"], input[name="db_user"], input[name="db_name"], input[name="db_host"], input[name="base_url"] { text-align:left; }
        button, .button { border:0; border-radius:8px; background:var(--rose); color:#fff; padding:12px 16px; font:inherit; font-weight:800; cursor:pointer; text-decoration:none; display:inline-flex; justify-content:center; }
        .button.secondary { background:var(--teal); }
        .notice { border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--soft); }
        .errors { border-color:#fecdd3; background:#fff1f2; color:#9f1239; }
        textarea { width:100%; min-height:260px; direction:ltr; text-align:left; font-family:Consolas, monospace; font-size:12px; }
        @media (max-width: 680px) { .grid { grid-template-columns:1fr; } main { padding:18px; } }
    </style>
</head>
<body>
<main>
    <h1>نصب SoulMate</h1>

    <?php if ($installed && !$errors): ?>
        <div class="notice">
            <p>SoulMate نصب شده است. برای امنیت، بعد از اطمینان از اجرا، فایل install.php را از هاست حذف کنید.</p>
            <a class="button secondary" href="./">ورود به برنامه</a>
        </div>
    <?php else: ?>
        <p>این نصب‌کننده دیتابیس را آماده می‌کند، دو حساب حسین و مبینا را می‌سازد و کلیدهای Web Push را تنظیم می‌کند.</p>

        <?php if ($success): ?>
            <div class="notice">نصب کامل شد.</div>
        <?php endif; ?>

        <?php if ($errors): ?>
            <div class="notice errors">
                <?php foreach ($errors as $error): ?>
                    <div><?= e($error) ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="post" autocomplete="off">
            <div class="grid">
                <label>هاست دیتابیس
                    <input name="db_host" value="<?= e(post_value('db_host', 'localhost')) ?>" required>
                </label>
                <label>نام دیتابیس
                    <input name="db_name" value="<?= e(post_value('db_name')) ?>" required>
                </label>
                <label>کاربر دیتابیس
                    <input name="db_user" value="<?= e(post_value('db_user')) ?>" required>
                </label>
                <label>رمز دیتابیس
                    <input name="db_pass" type="password" value="<?= e((string) ($_POST['db_pass'] ?? '')) ?>">
                </label>
            </div>

            <label>آدرس HTTPS برنامه
                <input name="base_url" value="<?= e(post_value('base_url', $defaultUrl)) ?>" required>
            </label>

            <div class="grid">
                <label>ایمیل برای VAPID
                    <input name="subject_email" type="email" value="<?= e(post_value('subject_email')) ?>" placeholder="you@example.com" required>
                </label>
                <label>تاریخ شروع باهم بودن
                    <input name="couple_since" type="date" value="<?= e(post_value('couple_since', date('Y-m-d'))) ?>" required>
                </label>
                <label>رمز حسین
                    <input name="hossein_password" type="password" minlength="8" required>
                </label>
                <label>رمز مبینا
                    <input name="mobina_password" type="password" minlength="8" required>
                </label>
            </div>

            <button type="submit">نصب و ساخت برنامه</button>
        </form>

        <?php if ($manualConfig): ?>
            <p>اگر فایل کانفیگ خودکار ساخته نشد، این متن را در config/config.php قرار بدهید.</p>
            <textarea readonly><?= e($manualConfig) ?></textarea>
        <?php endif; ?>
    <?php endif; ?>
</main>
</body>
</html>
