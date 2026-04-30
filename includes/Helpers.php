<?php
/**
 * SoulMate 3.2.2 - Phase 1 Security & Performance Improvements
 * Rate Limiting with Database Backend & Auto-Cleanup
 */

if (!class_exists('RateLimiter', false)) {
final class RateLimiter
{
    private static $pdo = null;
    private static $tableName = 'rate_limits';
    
    /**
     * Initialize rate limiter with database connection
     */
    public static function init($pdo = null)
    {
        self::$pdo = $pdo;
        
        // Create table if not exists
        if (self::$pdo) {
            self::ensureTable();
            self::cleanupOldRecords();
        }
    }
    
    /**
     * Ensure rate_limits table exists
     */
    private static function ensureTable()
    {
        try {
            self::$pdo->exec("
                CREATE TABLE IF NOT EXISTS " . self::$tableName . " (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    identifier VARCHAR(120) NOT NULL,
                    action VARCHAR(60) NOT NULL,
                    created_at DATETIME NOT NULL,
                    INDEX idx_identifier_action (identifier, action),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        } catch (Exception $e) {
            Security::logException($e);
        }
    }
    
    /**
     * Clean up old rate limit records (older than 24 hours)
     */
    public static function cleanupOldRecords()
    {
        if (!self::$pdo) return;
        
        try {
            $stmt = self::$pdo->prepare(
                "DELETE FROM " . self::$tableName . " WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)"
            );
            $stmt->execute();
        } catch (Exception $e) {
            Security::logException($e);
        }
    }

    /**
     * Check if request exceeds rate limit
     * 
     * @param string $action Action type (login, upload, etc.)
     * @param string $identifier Unique identifier (user_id, IP, etc.)
     * @param int $maxRequests Maximum requests allowed
     * @param int $windowSeconds Time window in seconds
     * @return bool True if within limit, false if exceeded
     */
    public static function isAllowed($action, $identifier, $maxRequests = 100, $windowSeconds = 60)
    {
        if (!self::$pdo) {
            // Fallback to always allow if no DB connection
            return true;
        }
        
        $key = $action . ':' . $identifier;
        $windowStart = gmdate('Y-m-d H:i:s', time() - $windowSeconds);
        
        try {
            // Count recent requests
            $stmt = self::$pdo->prepare(
                "SELECT COUNT(*) as count FROM " . self::$tableName . 
                " WHERE identifier = ? AND action = ? AND created_at > ?"
            );
            $stmt->execute([$identifier, $action, $windowStart]);
            $row = $stmt->fetch();
            $count = (int) ($row['count'] ?? 0);
            
            if ($count >= $maxRequests) {
                return false;
            }
            
            // Record this request
            $stmt = self::$pdo->prepare(
                "INSERT INTO " . self::$tableName . " (identifier, action, created_at) VALUES (?, ?, NOW())"
            );
            $stmt->execute([$identifier, $action]);
            
            return true;
        } catch (Exception $e) {
            Security::logException($e);
            // Fail open - allow request if DB error
            return true;
        }
    }

    /**
     * Reset rate limit for a specific key
     */
    public static function reset($action, $identifier)
    {
        if (!self::$pdo) return;
        
        try {
            $stmt = self::$pdo->prepare(
                "DELETE FROM " . self::$tableName . " WHERE identifier = ? AND action = ?"
            );
            $stmt->execute([$identifier, $action]);
        } catch (Exception $e) {
            Security::logException($e);
        }
    }
    
    /**
     * Get remaining requests for an action
     */
    public static function getRemaining($action, $identifier, $maxRequests, $windowSeconds)
    {
        if (!self::$pdo) return $maxRequests;
        
        $windowStart = gmdate('Y-m-d H:i:s', time() - $windowSeconds);
        
        try {
            $stmt = self::$pdo->prepare(
                "SELECT COUNT(*) as count FROM " . self::$tableName . 
                " WHERE identifier = ? AND action = ? AND created_at > ?"
            );
            $stmt->execute([$identifier, $action, $windowStart]);
            $row = $stmt->fetch();
            $count = (int) ($row['count'] ?? 0);
            
            return max(0, $maxRequests - $count);
        } catch (Exception $e) {
            Security::logException($e);
            return $maxRequests;
        }
    }
}
}

if (!class_exists('InputValidator', false)) {
final class InputValidator
{
    public static function validateUsername($username)
    {
        return preg_match('/^[a-z0-9_]{3,32}$/i', $username);
    }

    public static function validateEmail($email)
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function validateUrl($url)
    {
        return filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    public static function sanitizeFilename($filename)
    {
        $filename = basename($filename);
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);
        return $filename ?: 'file';
    }

    public static function isValidMimeType($mime, $allowed = [])
    {
        if (empty($allowed)) {
            return true;
        }
        return in_array($mime, $allowed, true);
    }

    public static function validateFileSize($size, $maxBytes = 12582912)
    {
        return $size > 0 && $size <= $maxBytes;
    }
}
}

if (!class_exists('CacheHelper', false)) {
final class CacheHelper
{
    private static $cache = [];
    private static $cacheFile = null;

    public static function init($cacheDir = null)
    {
        if ($cacheDir === null) {
            $cacheDir = sys_get_temp_dir() . '/soulmate_cache';
        }
        
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }
        
        self::$cacheFile = $cacheDir . '/cache.json';
    }

    public static function get($key, $default = null)
    {
        if (isset(self::$cache[$key])) {
            $item = self::$cache[$key];
            if ($item['expiry'] > time()) {
                return $item['value'];
            }
            unset(self::$cache[$key]);
        }

        return $default;
    }

    public static function set($key, $value, $ttl = 3600)
    {
        self::$cache[$key] = [
            'value' => $value,
            'expiry' => time() + $ttl,
        ];

        self::persist();
    }

    public static function delete($key)
    {
        unset(self::$cache[$key]);
        self::persist();
    }

    public static function flush()
    {
        self::$cache = [];
        self::persist();
    }

    private static function persist()
    {
        if (self::$cacheFile) {
            @file_put_contents(self::$cacheFile, json_encode(self::$cache), LOCK_EX);
        }
    }
}
}
