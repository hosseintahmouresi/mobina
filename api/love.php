<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

function love_json($value)
{
    if (!$value) {
        return array();
    }
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? $decoded : array();
}

function love_format_items($rows)
{
    $items = array();
    foreach ($rows as $row) {
        $attachment = null;
        if (!empty($row['attachment_id'])) {
            $attachment = array(
                'id' => (int) $row['attachment_id'],
                'name' => $row['original_name'] ?: 'فایل',
                'mime' => $row['mime_type'] ?: '',
                'size' => (int) ($row['size_bytes'] ?? 0),
                'url' => 'api/file.php?id=' . (int) $row['attachment_id'],
            );
        }
        $items[] = array(
            'id' => (int) $row['id'],
            'type' => $row['item_type'],
            'title' => $row['title'],
            'note' => $row['note'],
            'event_date' => $row['event_date'],
            'data' => love_json($row['data_json']),
            'attachment' => $attachment,
            'created_by' => (int) $row['created_by'],
            'creator_name' => $row['creator_name'] ?: '',
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        );
    }
    return $items;
}

function love_validate_attachment($pdo, $attachmentId)
{
    if (!$attachmentId) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id FROM attachments WHERE id = ? LIMIT 1');
    $stmt->execute(array($attachmentId));
    if (!$stmt->fetchColumn()) {
        Response::error('پیوست معتبر نیست.', 422);
    }
    return (int) $attachmentId;
}

if ($method === 'GET') {
    $stmt = $pdo->query(
        'SELECT li.*, u.display_name AS creator_name,
                a.original_name, a.mime_type, a.size_bytes
         FROM love_items li
         JOIN users u ON u.id = li.created_by
         LEFT JOIN attachments a ON a.id = li.attachment_id
         ORDER BY li.created_at DESC, li.id DESC
         LIMIT 240'
    );
    Response::json(array('ok' => true, 'items' => love_format_items($stmt->fetchAll())));
}

if ($method === 'POST') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    $action = (string) ($input['action'] ?? 'create');
    $id = (int) ($input['id'] ?? 0);
    $type = Security::cleanText((string) ($input['type'] ?? ''), 32);
    $allowed = array('photo', 'event', 'mood', 'promise');
    if (!in_array($type, $allowed, true)) {
        Response::error('نوع آیتم معتبر نیست.', 422);
    }
    $title = Security::cleanText((string) ($input['title'] ?? ''), 180);
    $note = Security::cleanText((string) ($input['note'] ?? ''), 1200);
    $eventDate = trim((string) ($input['event_date'] ?? ''));
    if ($eventDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $eventDate)) {
        Response::error('تاریخ معتبر نیست.', 422);
    }
    $data = isset($input['data']) && is_array($input['data']) ? $input['data'] : array();
    $dataJson = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $attachmentId = isset($input['attachment_id']) ? love_validate_attachment($pdo, (int) $input['attachment_id']) : null;
    if ($title === '') {
        $title = $type === 'mood' ? 'مود امروز' : ($type === 'photo' ? 'عکس دونفره' : 'آیتم عاشقانه');
    }
    $now = Security::now();

    if ($action === 'update') {
        if ($id < 1) {
            Response::error('شناسه معتبر نیست.', 422);
        }
        $stmt = $pdo->prepare('UPDATE love_items SET item_type = ?, title = ?, note = ?, event_date = ?, data_json = ?, attachment_id = COALESCE(?, attachment_id), updated_at = ? WHERE id = ?');
        $stmt->execute(array($type, $title, $note, $eventDate !== '' ? $eventDate : null, $dataJson, $attachmentId, $now, $id));
        Response::json(array('ok' => true, 'id' => $id));
    }

    $stmt = $pdo->prepare('INSERT INTO love_items (item_type, title, note, event_date, data_json, attachment_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute(array($type, $title, $note, $eventDate !== '' ? $eventDate : null, $dataJson, $attachmentId, $userId, $now, $now));
    Response::json(array('ok' => true, 'id' => (int) $pdo->lastInsertId()), 201);
}

if ($method === 'DELETE') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    $id = (int) ($input['id'] ?? 0);
    if ($id < 1) {
        Response::error('شناسه معتبر نیست.', 422);
    }
    $stmt = $pdo->prepare('DELETE FROM love_items WHERE id = ?');
    $stmt->execute(array($id));
    Response::json(array('ok' => true));
}

Response::error('متد پشتیبانی نمی‌شود.', 405);
