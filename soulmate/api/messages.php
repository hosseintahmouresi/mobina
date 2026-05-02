<?php
/**
 * SoulMate Messenger - Messages API
 */

require_once '../config.php';

header('Content-Type: application/json; charset=utf-8');

if (!isLoggedIn()) {
    jsonResponse(false, null, 'لطفاً ابتدا وارد شوید');
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'get_messages':
        getMessages();
        break;
    case 'send_message':
        sendMessage();
        break;
    case 'edit_message':
        editMessage();
        break;
    case 'delete_message':
        deleteMessage();
        break;
    case 'mark_read':
        markAsRead();
        break;
    case 'set_typing':
        setTypingStatus();
        break;
    case 'get_typing':
        getTypingStatus();
        break;
    case 'add_reaction':
        addReaction();
        break;
    default:
        jsonResponse(false, null, 'عملیات نامعتبر');
}

function getMessages() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $partner_id = $_SESSION['partner_id'];
    $page = intval($_GET['page'] ?? 1);
    $limit = MESSAGES_PER_PAGE;
    $offset = ($page - 1) * $limit;
    
    // Get messages between users
    $stmt = $pdo->prepare("SELECT m.*, 
                                  s.display_name as sender_name, 
                                  s.avatar as sender_avatar,
                                  r.display_name as receiver_name,
                                  (SELECT COUNT(*) FROM messages WHERE id < m.id AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))) as message_index
                           FROM messages m
                           JOIN users s ON m.sender_id = s.id
                           JOIN users r ON m.receiver_id = r.id
                           WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                             AND m.is_deleted = 0
                             AND (m.scheduled_time IS NULL OR m.scheduled_time <= NOW())
                           ORDER BY m.sent_at DESC
                           LIMIT ? OFFSET ?");
    
    $stmt->execute([$user_id, $partner_id, $partner_id, $user_id, 
                    $user_id, $partner_id, $partner_id, $user_id, 
                    $limit, $offset]);
    $messages = $stmt->fetchAll();
    
    // Update delivered status for received messages
    $stmt = $pdo->prepare("UPDATE messages SET delivered_at = NOW() 
                           WHERE receiver_id = ? AND sender_id = ? AND delivered_at IS NULL");
    $stmt->execute([$user_id, $partner_id]);
    
    // Reverse to show oldest first
    $messages = array_reverse($messages);
    
    // Get total count
    $stmt = $pdo->prepare("SELECT COUNT(*) as total FROM messages 
                           WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                           AND is_deleted = 0");
    $stmt->execute([$user_id, $partner_id, $partner_id, $user_id]);
    $total = $stmt->fetch()['total'];
    
    jsonResponse(true, [
        'messages' => $messages,
        'pagination' => [
            'current_page' => $page,
            'total_pages' => ceil($total / $limit),
            'total_messages' => $total,
            'has_more' => $offset > 0
        ]
    ]);
}

function sendMessage() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $partner_id = $_SESSION['partner_id'];
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    $message_type = $_POST['message_type'] ?? 'text';
    $content = trim($_POST['content'] ?? '');
    $reply_to_id = intval($_POST['reply_to_id'] ?? null);
    $scheduled_time = $_POST['scheduled_time'] ?? null;
    
    if (empty($content) && !in_array($message_type, ['sticker'])) {
        jsonResponse(false, null, 'محتوای پیام نمی‌تواند خالی باشد');
    }
    
    if (strlen($content) > MAX_MESSAGE_LENGTH) {
        jsonResponse(false, null, 'پیام بسیار طولانی است (حداکثر ۴۰۰۰ کاراکتر)');
    }
    
    // Calculate deadlines
    $edit_deadline = date('Y-m-d H:i:s', time() + EDIT_TIME_LIMIT);
    $delete_deadline = date('Y-m-d H:i:s', time() + DELETE_TIME_LIMIT);
    
    $stmt = $pdo->prepare("INSERT INTO messages 
                           (sender_id, receiver_id, message_type, content, reply_to_id, scheduled_time, edit_deadline, delete_deadline) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    
    $stmt->execute([
        $user_id, 
        $partner_id, 
        $message_type, 
        $content, 
        $reply_to_id ?: null, 
        $scheduled_time ?: null,
        $edit_deadline,
        $delete_deadline
    ]);
    
    $message_id = $pdo->lastInsertId();
    
    // Clear typing status
    $stmt = $pdo->prepare("UPDATE typing_status SET is_typing = 0 WHERE user_id = ? AND partner_id = ?");
    $stmt->execute([$user_id, $partner_id]);
    
    // Get the sent message
    $stmt = $pdo->prepare("SELECT m.*, s.display_name as sender_name, s.avatar as sender_avatar
                           FROM messages m
                           JOIN users s ON m.sender_id = s.id
                           WHERE m.id = ?");
    $stmt->execute([$message_id]);
    $message = $stmt->fetch();
    
    jsonResponse(true, [
        'message' => $message,
        'notification' => 'پیام ارسال شد'
    ]);
}

function editMessage() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $message_id = intval($_POST['message_id'] ?? 0);
    $new_content = trim($_POST['content'] ?? '');
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    // Check if message exists and belongs to user
    $stmt = $pdo->prepare("SELECT * FROM messages WHERE id = ? AND sender_id = ?");
    $stmt->execute([$message_id, $user_id]);
    $message = $stmt->fetch();
    
    if (!$message) {
        jsonResponse(false, null, 'پیام یافت نشد');
    }
    
    // Check if within edit time limit
    if ($message['edit_deadline'] && strtotime($message['edit_deadline']) < time()) {
        jsonResponse(false, null, 'زمان ویرایش پیام گذشته است (۵ دقیقه)');
    }
    
    if (strlen($new_content) > MAX_MESSAGE_LENGTH) {
        jsonResponse(false, null, 'پیام بسیار طولانی است');
    }
    
    $stmt = $pdo->prepare("UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?");
    $stmt->execute([$new_content, $message_id]);
    
    jsonResponse(true, ['message' => 'پیام ویرایش شد']);
}

function deleteMessage() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $message_id = intval($_POST['message_id'] ?? 0);
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    $stmt = $pdo->prepare("SELECT * FROM messages WHERE id = ? AND sender_id = ?");
    $stmt->execute([$message_id, $user_id]);
    $message = $stmt->fetch();
    
    if (!$message) {
        jsonResponse(false, null, 'پیام یافت نشد');
    }
    
    // Check if within delete time limit
    if ($message['delete_deadline'] && strtotime($message['delete_deadline']) < time()) {
        jsonResponse(false, null, 'زمان حذف پیام گذشته است (۱۰ دقیقه)');
    }
    
    $stmt = $pdo->prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?");
    $stmt->execute([$message_id]);
    
    jsonResponse(true, ['message' => 'پیام حذف شد']);
}

function markAsRead() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $partner_id = $_SESSION['partner_id'];
    
    $stmt = $pdo->prepare("UPDATE messages SET read_at = NOW() 
                           WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL");
    $stmt->execute([$partner_id, $user_id]);
    
    jsonResponse(true, ['message' => 'پیام‌ها خوانده شدند']);
}

function setTypingStatus() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $partner_id = $_SESSION['partner_id'];
    $is_typing = intval($_POST['is_typing'] ?? 0);
    
    $stmt = $pdo->prepare("INSERT INTO typing_status (user_id, partner_id, is_typing) 
                           VALUES (?, ?, ?)
                           ON DUPLICATE KEY UPDATE is_typing = ?, updated_at = NOW()");
    $stmt->execute([$user_id, $partner_id, $is_typing, $is_typing]);
    
    jsonResponse(true, ['status' => $is_typing]);
}

function getTypingStatus() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $partner_id = $_SESSION['partner_id'];
    
    $stmt = $pdo->prepare("SELECT is_typing FROM typing_status 
                           WHERE user_id = ? AND partner_id = ?");
    $stmt->execute([$partner_id, $user_id]);
    $result = $stmt->fetch();
    
    jsonResponse(true, [
        'is_typing' => $result ? intval($result['is_typing']) : 0
    ]);
}

function addReaction() {
    $pdo = getDBConnection();
    $user_id = getCurrentUserId();
    $message_id = intval($_POST['message_id'] ?? 0);
    $reaction = $_POST['reaction'] ?? '';
    $csrf_token = $_POST['csrf_token'] ?? '';
    
    if (!verifyCSRFToken($csrf_token)) {
        jsonResponse(false, null, 'توکن امنیتی نامعتبر است');
    }
    
    $valid_reactions = ['❤', '😘', '✨', '🌹', '🤍', '🫶', '🥰', '😍', '💋', '💌', '🫠', '😂', '🥺'];
    if (!in_array($reaction, $valid_reactions)) {
        jsonResponse(false, null, 'واکنش نامعتبر است');
    }
    
    $stmt = $pdo->prepare("SELECT reactions FROM messages WHERE id = ?");
    $stmt->execute([$message_id]);
    $message = $stmt->fetch();
    
    if (!$message) {
        jsonResponse(false, null, 'پیام یافت نشد');
    }
    
    $reactions = json_decode($message['reactions'] ?? '[]', true) ?? [];
    
    // Add or update reaction
    $found = false;
    foreach ($reactions as &$r) {
        if ($r['user_id'] == $user_id) {
            $r['reaction'] = $reaction;
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        $reactions[] = [
            'user_id' => $user_id,
            'reaction' => $reaction,
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }
    
    $stmt = $pdo->prepare("UPDATE messages SET reactions = ? WHERE id = ?");
    $stmt->execute([json_encode($reactions, JSON_UNESCAPED_UNICODE), $message_id]);
    
    jsonResponse(true, ['reactions' => $reactions]);
}
