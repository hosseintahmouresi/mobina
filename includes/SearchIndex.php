<?php
if (!class_exists('SearchIndex', false)) {
final class SearchIndex
{
    public static function indexMessage($pdo, $config, $messageId, $plainBody, $attachmentName = '')
    {
        $messageId = (int) $messageId;
        if ($messageId < 1) {
            return;
        }

        $delete = $pdo->prepare('DELETE FROM message_search_tokens WHERE message_id = ?');
        $delete->execute(array($messageId));

        $body = (string) $plainBody;
        if (strpos($body, 'E2EE:') === 0) {
            $body = '';
        }
        $tokens = self::tokens($body . ' ' . (string) $attachmentName);
        if (!$tokens) {
            return;
        }

        $insert = $pdo->prepare('INSERT IGNORE INTO message_search_tokens (token_hash, message_id) VALUES (?, ?)');
        foreach ($tokens as $token) {
            $insert->execute(array(self::hashToken($config, $token), $messageId));
        }
    }

    public static function candidateIds($pdo, $config, $query, $limit = 240)
    {
        $tokens = self::tokens((string) $query);
        if (!$tokens) {
            return array();
        }

        $tokens = array_slice($tokens, 0, 6);
        $hashes = array_map(static function ($token) use ($config) {
            return self::hashToken($config, $token);
        }, $tokens);

        $placeholders = implode(',', array_fill(0, count($hashes), '?'));
        $sql = "SELECT message_id
            FROM message_search_tokens
            WHERE token_hash IN ($placeholders)
            GROUP BY message_id
            HAVING COUNT(DISTINCT token_hash) = ?
            ORDER BY message_id DESC
            LIMIT ?";
        $stmt = $pdo->prepare($sql);
        $position = 1;
        foreach ($hashes as $hash) {
            $stmt->bindValue($position++, $hash, PDO::PARAM_STR);
        }
        $stmt->bindValue($position++, count($hashes), PDO::PARAM_INT);
        $stmt->bindValue($position, max(1, min(1000, (int) $limit)), PDO::PARAM_INT);
        $stmt->execute();
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public static function rebuildMessages($pdo, $config)
    {
        $pdo->exec('DELETE FROM message_search_tokens');
        $stmt = $pdo->query(
            'SELECT m.id, m.body, a.original_name
             FROM messages m
             LEFT JOIN attachments a ON a.id = m.attachment_id
             WHERE m.deleted_at IS NULL
             ORDER BY m.id'
        );
        $count = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            self::indexMessage(
                $pdo,
                $config,
                (int) $row['id'],
                Crypto::decrypt($row['body'], $config),
                (string) ($row['original_name'] ?? '')
            );
            $count++;
        }
        return $count;
    }

    private static function tokens($text)
    {
        $text = self::normalize($text);
        $parts = preg_split('/[^\p{L}\p{N}]+/u', $text) ?: array();
        $tokens = array();
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            $length = function_exists('mb_strlen') ? mb_strlen($part, 'UTF-8') : strlen($part);
            if ($length < 2) {
                continue;
            }
            $tokens[$part] = true;
            if (count($tokens) >= 64) {
                break;
            }
        }
        return array_keys($tokens);
    }

    private static function normalize($text)
    {
        $text = str_replace(array('ي', 'ك', 'ة'), array('ی', 'ک', 'ه'), (string) $text);
        $text = strtr($text, array(
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ));
        return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    }

    private static function hashToken($config, $token)
    {
        $key = (string) ($config['app']['encryption_key'] ?? 'soulmate-search');
        return hash_hmac('sha256', $token, $key);
    }
}
}
