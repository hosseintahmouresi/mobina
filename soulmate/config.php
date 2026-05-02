<?php
/**
 * SoulMate Messenger - Configuration File
 * Compatible with WordPress Shared Hosting
 */

// Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_database_name');
define('DB_USER', 'your_database_user');
define('DB_PASS', 'your_database_password');
define('DB_CHARSET', 'utf8mb4');

// Application Settings
define('APP_NAME', 'SoulMate 💕');
define('APP_VERSION', '1.0.0');
define('SITE_URL', 'https://yourdomain.com/soulmate');

// Security Settings
define('SESSION_LIFETIME', 86400); // 24 hours in seconds
define('MAX_LOGIN_ATTEMPTS', 5);
define('LOGIN_ATTEMPT_WINDOW', 60); // 1 minute
define('CSRF_TOKEN_LENGTH', 32);

// File Upload Settings
define('UPLOAD_DIR', __DIR__ . '/uploads');
define('MAX_FILE_SIZE', 52428800); // 50MB
define('ALLOWED_IMAGE_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
define('ALLOWED_VIDEO_TYPES', ['video/mp4', 'video/webm', 'video/ogg']);
define('ALLOWED_AUDIO_TYPES', ['audio/mp3', 'audio/ogg', 'audio/wav']);
define('ALLOWED_DOC_TYPES', ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain']);

// Message Settings
define('MAX_MESSAGE_LENGTH', 4000);
define('EDIT_TIME_LIMIT', 300); // 5 minutes
define('DELETE_TIME_LIMIT', 600); // 10 minutes
define('MESSAGES_PER_PAGE', 50);

// Polling Interval (milliseconds)
define('POLLING_INTERVAL', 2000); // 2 seconds

// Error Reporting (Disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/error.log');

// Timezone
date_default_timezone_set('Asia/Tehran');

// Create upload directory if it doesn't exist
if (!file_exists(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
    mkdir(UPLOAD_DIR . '/images', 0755, true);
    mkdir(UPLOAD_DIR . '/videos', 0755, true);
    mkdir(UPLOAD_DIR . '/audios', 0755, true);
    mkdir(UPLOAD_DIR . '/files', 0755, true);
    mkdir(UPLOAD_DIR . '/avatars', 0755, true);
}

// Database Connection
function getDBConnection() {
    static $pdo = null;
    
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log("Database connection failed: " . $e->getMessage());
            die(json_encode(['success' => false, 'error' => 'اتصال به پایگاه داده ناموفق بود']));
        }
    }
    
    return $pdo;
}

// Start Session securely
function startSecureSession() {
    if (session_status() === PHP_SESSION_NONE) {
        ini_set('session.cookie_httponly', 1);
        ini_set('session.use_strict_mode', 1);
        ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) ? 1 : 0);
        session_start();
    }
}

// Generate CSRF Token
function generateCSRFToken() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(CSRF_TOKEN_LENGTH));
    }
    return $_SESSION['csrf_token'];
}

// Verify CSRF Token
function verifyCSRFToken($token) {
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

// Check if user is logged in
function isLoggedIn() {
    return isset($_SESSION['user_id']) && isset($_SESSION['username']);
}

// Get current user ID
function getCurrentUserId() {
    return $_SESSION['user_id'] ?? null;
}

// Get current username
function getCurrentUsername() {
    return $_SESSION['username'] ?? null;
}

// Rate Limiting Check
function checkRateLimit($ip, $username = null) {
    $pdo = getDBConnection();
    $window = time() - LOGIN_ATTEMPT_WINDOW;
    
    $stmt = $pdo->prepare("SELECT COUNT(*) as attempts FROM login_attempts 
                           WHERE ip_address = ? AND attempted_at > FROM_UNIXTIME(?)");
    $stmt->execute([$ip, $window]);
    $result = $stmt->fetch();
    
    return $result['attempts'] < MAX_LOGIN_ATTEMPTS;
}

// Record Login Attempt
function recordLoginAttempt($ip, $username = null) {
    $pdo = getDBConnection();
    $stmt = $pdo->prepare("INSERT INTO login_attempts (ip_address, username) VALUES (?, ?)");
    $stmt->execute([$ip, $username]);
}

// Clean old login attempts
function cleanOldLoginAttempts() {
    $pdo = getDBConnection();
    $window = time() - LOGIN_ATTEMPT_WINDOW;
    $stmt = $pdo->prepare("DELETE FROM login_attempts WHERE attempted_at < FROM_UNIXTIME(?)");
    $stmt->execute([$window]);
}

// Sanitize Input
function sanitizeInput($input) {
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

// JSON Response Helper
function jsonResponse($success, $data = null, $error = null) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'error' => $error,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Initialize application
startSecureSession();
cleanOldLoginAttempts();
