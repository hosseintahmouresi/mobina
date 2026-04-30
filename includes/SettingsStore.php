<?php
if (!class_exists('SettingsStore', false)) {
final class SettingsStore
{
    public static function all($pdo)
    {
        $rows = $pdo->query('SELECT setting_key, setting_value FROM settings')->fetchAll();
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
        return $settings;
    }

    public static function get($pdo, $key, $default = null)
    {
        $stmt = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value === false ? $default : (string) $value;
    }

    public static function set($pdo, $key, $value)
    {
        $stmt = $pdo->prepare('REPLACE INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)');
        $stmt->execute([$key, $value, Security::now()]);
    }
}
}
