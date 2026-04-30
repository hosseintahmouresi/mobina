<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$query = Security::cleanText((string) ($_GET['q'] ?? ''), 120);
if ($query === '') {
    Response::json(array('ok' => true, 'results' => array()));
}

function search_contains_text($haystack, $needle)
{
    if ($needle === '') {
        return true;
    }
    if (function_exists('mb_stripos')) {
        return mb_stripos((string) $haystack, (string) $needle, 0, 'UTF-8') !== false;
    }
    return stripos((string) $haystack, (string) $needle) !== false;
}

$results = array();
$memoryUnlocked = isset($_SESSION['memory_unlocked_until_' . $userId])
    && (int) $_SESSION['memory_unlocked_until_' . $userId] > time();

$messages = array();
try {
    $candidateIds = SearchIndex::candidateIds($pdo, $config, $query, 500);
    if ($candidateIds && count($candidateIds) > 0) { // Ensure candidateIds is not empty
        $placeholders = implode(',', array_fill(0, count($candidateIds), '?'));
        $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . " AND m.id IN ($placeholders) ORDER BY m.id DESC");
        $stmt->execute($candidateIds);
        $messages = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $userId, $config);
    } elseif (((int) $pdo->query('SELECT COUNT(*) FROM message_search_tokens')->fetchColumn()) === 0) {
        $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . ' ORDER BY m.id DESC LIMIT 5000');
        $stmt->execute();
        $messages = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $userId, $config);
    }
} catch (Exception $e) {
    Security::logException($e);
    $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . ' ORDER BY m.id DESC LIMIT 5000');
    $stmt->execute();
    $messages = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $userId, $config);
}
foreach ($messages as $message) {
    if (count($results) >= 60) {
        break;
    }
    if (strpos((string) ($message['body'] ?? ''), 'E2EE:') === 0) {
        continue; // پیام‌های رمزنگاری شده در سرور قابل جستجو نیستند
    }
    $attachmentName = isset($message['attachment']['name']) ? $message['attachment']['name'] : '';
    if (search_contains_text($message['body'] ?? '', $query) || search_contains_text($attachmentName, $query)) {
        $results[] = array(
            'type' => 'message',
            'id' => (int) $message['id'],
            'title' => $message['sender_name'] ?: 'پیام',
            'text' => $message['body'] ?: $attachmentName,
            'created_at' => $message['created_at'],
        );
    }
}

$stmt = $pdo->query(
    'SELECT memories.*, a.original_name AS image_name
     FROM memories
     LEFT JOIN attachments a ON a.id = memories.attachment_id
     ORDER BY memories.id DESC
     LIMIT 1000'
);
foreach ($stmt->fetchAll() as $memory) {
    if (count($results) >= 100) {
        break;
    }
    $isLocked = (int) ($memory['locked'] ?? 0) === 1;
    $canReadLocked = !$isLocked || $memoryUnlocked;
    $text = $canReadLocked
        ? trim((string) $memory['note'] . ' ' . (string) $memory['image_name'])
        : '';
    if (search_contains_text($memory['title'], $query) || search_contains_text($text, $query)) {
        $results[] = array(
            'type' => 'memory',
            'id' => (int) $memory['id'],
            'title' => $memory['title'],
            'text' => $canReadLocked ? $text : 'خاطره خصوصی قفل شده است.',
            'locked' => $isLocked ? 1 : 0,
            'unlocked' => $canReadLocked ? 1 : 0,
            'created_at' => $memory['created_at'],
        );
    }
}

$attachmentSql = 'SELECT a.*
     FROM attachments a
     LEFT JOIN memories m ON m.attachment_id = a.id AND m.locked = 1
     WHERE a.original_name LIKE ?';
if (!$memoryUnlocked) {
    $attachmentSql .= ' AND m.id IS NULL';
}
$attachmentSql .= ' ORDER BY a.id DESC LIMIT 60';
$stmt = $pdo->prepare($attachmentSql);
$stmt->execute(array('%' . $query . '%'));
foreach ($stmt->fetchAll() as $file) {
    $results[] = array(
        'type' => 'file',
        'id' => (int) $file['id'],
        'title' => $file['original_name'],
        'text' => $file['mime_type'],
        'created_at' => $file['created_at'],
    );
}

Response::json(array('ok' => true, 'results' => array_slice($results, 0, 100)));
