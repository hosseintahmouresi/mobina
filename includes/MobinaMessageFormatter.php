<?php
if (!class_exists('MobinaMessageFormatter', false)) {
final class MobinaMessageFormatter
{
    public static function list($pdo, $messages, $currentUserId, $config = array())
    {
        if (!$messages) {
            return array();
        }

        $ids = array_map(static function ($message) {
            return (int) $message['id'];
        }, $messages);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $receipts = array();
        $stmt = $pdo->prepare("SELECT * FROM message_receipts WHERE message_id IN ($placeholders)");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $receipts[(int) $row['message_id']][(int) $row['user_id']] = $row;
        }

        $reactions = array();
        $stmt = $pdo->prepare("SELECT * FROM message_reactions WHERE message_id IN ($placeholders)");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $reactions[(int) $row['message_id']][] = array(
                'user_id' => (int) $row['user_id'],
                'reaction' => $row['reaction'],
                'created_at' => $row['created_at'],
            );
        }

        $result = array();
        foreach ($messages as $message) {
            $messageId = (int) $message['id'];
            $senderId = (int) $message['sender_id'];
            $status = null;

            if ($senderId === $currentUserId) {
                $messageReceipts = isset($receipts[$messageId]) ? $receipts[$messageId] : array();
                foreach ($messageReceipts as $uid => $receipt) {
                    if ($uid === $currentUserId) {
                        continue;
                    }
                    if (!empty($receipt['read_at'])) {
                        $status = 'read';
                    } elseif (!empty($receipt['delivered_at'])) {
                        $status = 'delivered';
                    } else {
                        $status = 'sent';
                    }
                }
                $status = $status ?: 'sent';
            }

            $attachment = null;
            if (!empty($message['attachment_id'])) {
                $attachment = array(
                    'id' => (int) $message['attachment_id'],
                    'name' => $message['original_name'],
                    'mime' => $message['mime_type'],
                    'size' => (int) $message['size_bytes'],
                    'url' => 'api/file.php?id=' . (int) $message['attachment_id'],
                );
            }

            $reply = null;
            if (!empty($message['reply_to_id']) && !empty($message['reply_id'])) {
                $replyLocked = (($message['reply_kind'] ?? '') === 'timed' && !empty($message['reply_open_at']) && strtotime((string) $message['reply_open_at'] . ' UTC') > time());
                $replyBody = $replyLocked ? 'پیام زمان‌دار' : Crypto::decrypt($message['reply_body'], $config);
                if (function_exists('mb_substr')) {
                    $replyBody = mb_substr((string) $replyBody, 0, 180, 'UTF-8');
                } else {
                    $replyBody = substr((string) $replyBody, 0, 180);
                }
                $reply = array(
                    'id' => (int) $message['reply_id'],
                    'sender_name' => $message['reply_sender_name'] ?: '',
                    'body' => $replyBody,
                    'kind' => $message['reply_kind'] ?: 'text',
                );
            }

            $result[] = array(
                'id' => $messageId,
                'client_id' => $message['client_id'],
                'sender_id' => $senderId,
                'sender_name' => $message['sender_name'],
                'sender_accent' => $message['sender_accent'],
                'body' => self::visibleBody($message, $config),
                'kind' => $message['kind'],
                'open_at' => !empty($message['open_at']) ? $message['open_at'] : null,
                'locked' => self::isTimedLocked($message),
                'attachment' => $attachment,
                'reply_to_id' => !empty($message['reply_to_id']) ? (int) $message['reply_to_id'] : null,
                'reply' => $reply,
                'created_at' => $message['created_at'],
                'status' => $status,
                'reactions' => isset($reactions[$messageId]) ? $reactions[$messageId] : array(),
            );
        }

        return $result;
    }

    private static function isTimedLocked($message)
    {
        if (($message['kind'] ?? '') !== 'timed' || empty($message['open_at'])) {
            return false;
        }
        return strtotime((string) $message['open_at'] . ' UTC') > time();
    }

    private static function visibleBody($message, $config)
    {
        if (self::isTimedLocked($message)) {
            return '';
        }
        return Crypto::decrypt($message['body'], $config);
    }

    public static function baseQuery()
    {
        return "SELECT m.*, u.display_name AS sender_name, u.accent AS sender_accent,
                a.original_name, a.mime_type, a.size_bytes, a.public_path,
                rm.id AS reply_id, rm.body AS reply_body, rm.kind AS reply_kind, rm.open_at AS reply_open_at,
                ru.display_name AS reply_sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            LEFT JOIN attachments a ON a.id = m.attachment_id
            LEFT JOIN messages rm ON rm.id = m.reply_to_id AND rm.deleted_at IS NULL
            LEFT JOIN users ru ON ru.id = rm.sender_id
            WHERE m.deleted_at IS NULL";
    }
}
}
