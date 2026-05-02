<?php
/**
 * SoulMate Messenger - Login & Authentication API
 */

require_once '../config.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check_session':
        checkSession();
        break;
    case 'set_pin':
        setPIN();
        break;
    case 'login_with_pin':
        loginWithPIN();
        break;
    default:
        jsonResponse(false, null, 'عملیات نامعتبر');
}

function handleLogin() {
    $username = sanitizeInput($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (empty($username) || empty($password)) {
        jsonResponse(false, null, 'نام کاربری و رمز عبور الزامی است');
    }
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    $ip = $_SERVER['REMOTE_ADDR'];
    
    if (!checkRateLimit($ip, $username)) {
        jsonResponse(false, null, 'تعداد تلاش‌های ورود بیش از حد است. لطفاً چند دقیقه صبر کنید.');
    }
    
    $pdo = getDBConnection();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordLoginAttempt($ip, $username);
        jsonResponse(false, null, 'نام کاربری یا رمز عبور اشتباه است');
    }
    
    // Check partner relationship
    $stmt = $pdo->prepare("SELECT p.*, u.display_name as partner_name, u.avatar as partner_avatar 
                           FROM partners p 
                           JOIN users u ON (p.partner_id = u.id AND p.user_id = ?) OR (p.user_id = u.id AND p.partner_id = ?)
                           WHERE p.status = 'accepted'
                           LIMIT 1");
    $stmt->execute([$user['id'], $user['id']]);
    $partner = $stmt->fetch();
    
    if (!$partner) {
        jsonResponse(false, null, 'شما هنوز شریک زندگی خود را اضافه نکرده‌اید');
    }
    
    // Create session
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['display_name'] = $user['display_name'];
    $_SESSION['avatar'] = $user['avatar'];
    $_SESSION['partner_id'] = $partner['partner_id'] == $user['id'] ? $partner['user_id'] : $partner['partner_id'];
    $_SESSION['partner_name'] = $partner['partner_name'];
    $_SESSION['partner_avatar'] = $partner['partner_avatar'];
    $_SESSION['theme'] = $user['theme'];
    
    // Update last login
    $stmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
    $stmt->execute([$user['id']]);
    
    // Generate new CSRF token
    $new_csrf_token = generateCSRFToken();
    
    jsonResponse(true, [
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'display_name' => $user['display_name'],
            'avatar' => $user['avatar'],
            'theme' => $user['theme'],
            'relationship_start_date' => $user['relationship_start_date'],
            'daily_quote' => $user['daily_quote']
        ],
        'partner' => [
            'id' => $_SESSION['partner_id'],
            'name' => $_SESSION['partner_name'],
            'avatar' => $_SESSION['partner_avatar']
        ],
        'csrf_token' => $new_csrf_token
    ]);
}

function handleLogout() {
    session_destroy();
    jsonResponse(true, ['message' => 'با موفقیت خارج شدید']);
}

function checkSession() {
    if (isLoggedIn()) {
        $pdo = getDBConnection();
        
        // Get partner info
        $stmt = $pdo->prepare("SELECT u.id, u.display_name, u.avatar FROM users u 
                               JOIN partners p ON (p.partner_id = u.id AND p.user_id = ?) OR (p.user_id = u.id AND p.partner_id = ?)
                               WHERE p.status = 'accepted'
                               LIMIT 1");
        $stmt->execute([getCurrentUserId(), getCurrentUserId()]);
        $partner = $stmt->fetch();
        
        jsonResponse(true, [
            'user' => [
                'id' => getCurrentUserId(),
                'username' => getCurrentUsername(),
                'display_name' => $_SESSION['display_name'],
                'avatar' => $_SESSION['avatar'],
                'theme' => $_SESSION['theme']
            ],
            'partner' => $partner ? [
                'id' => $partner['id'],
                'name' => $partner['display_name'],
                'avatar' => $partner['avatar']
            ] : null
        ]);
    } else {
        jsonResponse(false, null, 'جلسه معتبر نیست');
    }
}

function setPIN() {
    if (!isLoggedIn()) {
        jsonResponse(false, null, 'لطفاً ابتدا وارد شوید');
    }
    
    $pin = $_POST['pin'] ?? '';
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    if (!preg_match('/^\d{4,8}$/', $pin)) {
        jsonResponse(false, null, 'PIN باید ۴ تا ۸ رقم باشد');
    }
    
    $pdo = getDBConnection();
    $stmt = $pdo->prepare("UPDATE users SET pin_code = ? WHERE id = ?");
    $stmt->execute([$pin, getCurrentUserId()]);
    
    jsonResponse(true, ['message' => 'PIN با موفقیت تنظیم شد']);
}

function loginWithPIN() {
    $username = sanitizeInput($_POST['username'] ?? '');
    $pin = $_POST['pin'] ?? '';
    
    if (empty($username) || empty($pin)) {
        jsonResponse(false, null, 'نام کاربری و PIN الزامی است');
    }
    
    $pdo = getDBConnection();
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? AND pin_code = ?");
    $stmt->execute([$username, $pin]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(false, null, 'نام کاربری یا PIN اشتباه است');
    }
    
    // Check partner
    $stmt = $pdo->prepare("SELECT p.*, u.display_name as partner_name, u.avatar as partner_avatar 
                           FROM partners p 
                           JOIN users u ON (p.partner_id = u.id AND p.user_id = ?) OR (p.user_id = u.id AND p.partner_id = ?)
                           WHERE p.status = 'accepted'
                           LIMIT 1");
    $stmt->execute([$user['id'], $user['id']]);
    $partner = $stmt->fetch();
    
    if (!$partner) {
        jsonResponse(false, null, 'شریک زندگی یافت نشد');
    }
    
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['display_name'] = $user['display_name'];
    $_SESSION['avatar'] = $user['avatar'];
    $_SESSION['partner_id'] = $partner['partner_id'] == $user['id'] ? $partner['user_id'] : $partner['partner_id'];
    $_SESSION['partner_name'] = $partner['partner_name'];
    $_SESSION['partner_avatar'] = $partner['partner_avatar'];
    $_SESSION['theme'] = $user['theme'];
    
    jsonResponse(true, [
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'display_name' => $user['display_name']
        ],
        'partner' => [
            'id' => $_SESSION['partner_id'],
            'name' => $_SESSION['partner_name'],
            'avatar' => $_SESSION['partner_avatar']
        ]
    ]);
}
