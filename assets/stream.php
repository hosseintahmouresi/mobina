<?php
require_once __DIR__ . '/../includes/bootstrap.php';

// ۱. اعتبارسنجی کاربر
$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$partner = Auth::partner($pdo, $userId);
$partnerId = $partner ? (int) $partner['id'] : 0;

// ۲. آزادسازی سشن! (بسیار مهم برای اینکه کاربر بتواند همزمان پیام ارسال کند)
session_write_close();

// ۳. تنظیم هدرهای مخصوص Server-Sent Events
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // برای سرورهای Nginx

// برای جلوگیری از قطع شدن اسکریپت توسط سرور
set_time_limit(0);

// متغیرهای نگه‌دارنده وضعیت قبلی
$lastMsgId = isset($_GET['last_id']) ? (int) $_GET['last_id'] : 0;
$lastReceiptCount = -1;
$lastDeletedCount = -1;
$lastTyping = null;

$startTime = time();
$heartbeat = time();

// حلقه باز (حداکثر ۴۵ ثانیه برای جلوگیری از انباشت پردازش در هاست‌های اشتراکی)
// بعد از ۴۵ ثانیه کانکشن بسته می‌شود و جاوا اسکریپت به صورت خودکار دوباره وصل می‌شود.
while (time() - $startTime < 45) {
    if (connection_aborted()) {
        break;
    }

    $triggerUpdate = false;

    // الف) چک کردن پیام‌های جدید پارتنر
    $stmt = $pdo->prepare("SELECT MAX(id) FROM messages WHERE sender_id = ?");
    $stmt->execute([$partnerId]);
    $currentMsgId = (int) $stmt->fetchColumn();
    if ($currentMsgId > $lastMsgId) {
        $triggerUpdate = true;
        $lastMsgId = $currentMsgId;
    }

    // ب) چک کردن سین شدن پیام‌های من (Read Receipts)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM message_receipts r JOIN messages m ON m.id = r.message_id WHERE m.sender_id = ? AND r.read_at IS NOT NULL");
    $stmt->execute([$userId]);
    $currentReceiptCount = (int) $stmt->fetchColumn();
    if ($lastReceiptCount !== -1 && $currentReceiptCount !== $lastReceiptCount) {
        $triggerUpdate = true;
    }
    $lastReceiptCount = $currentReceiptCount;

    // ج) ارسال دستور آپدیت پیام‌ها به جاوا اسکریپت
    if ($triggerUpdate) {
        echo "event: update\ndata: {\"trigger\": \"messages\"}\n\n";
        ob_flush(); flush();
    }

    // د) چک کردن وضعیت تایپینگ (در کسری از ثانیه)
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM typing_status WHERE user_id = ? AND expires_at > UTC_TIMESTAMP()");
    $stmt->execute([$partnerId]);
    $currentTyping = ((int) $stmt->fetchColumn()) > 0;
    
    if ($lastTyping !== $currentTyping) {
        echo "event: typing\ndata: {\"typing\": " . ($currentTyping ? 'true' : 'false') . "}\n\n";
        ob_flush(); flush();
        $lastTyping = $currentTyping;
    }

    // پینگ هر ۱۵ ثانیه برای جلوگیری از قطع شدن کانکشن توسط فایروال
    if (time() - $heartbeat > 15) {
        echo ": heartbeat\n\n";
        ob_flush(); flush();
        $heartbeat = time();
    }

    // تاخیر ۰.۵ ثانیه‌ای (بهینه و بسیار سریع)
    usleep(500000); 
}