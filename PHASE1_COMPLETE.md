# SoulMate 3.2.2 - Phase 1 Security & Performance Improvements

## تغییرات اعمال شده در فاز ۱

### ۱. امنیت حیاتی (Critical Security)

#### ✅ آپلود فایل امن
- **فایل:** `api/upload.php`
- **تغییرات:**
  - اعتبارسنجی MIME type با استفاده از `finfo_file()` به جای تکیه بر extension
  - لیست سفید کامل MIME types مجاز
  - بررسی همخوانی extension با MIME type واقعی
  - Rate limiting: حداکثر ۲۰ آپلود در دقیقه برای هر کاربر
  - بهینه‌سازی تصاویر با Imagick یا GD
  - تولید خودکار thumbnail برای تصاویر (۳۰۰x۳۰۰)

#### ✅ Rate Limiting مبتنی بر دیتابیس
- **فایل:** `includes/Helpers.php`
- **تغییرات:**
  - بازنویسی کامل کلاس `RateLimiter` با backend دیتابیس
  - جدول `rate_limits` برای ذخیره درخواست‌ها
  - پاک‌سازی خودکار رکوردهای قدیمی (بیشتر از ۲۴ ساعت)
  - ایندکس‌های بهینه برای عملکرد سریع
  - API جدید: `isAllowed($action, $identifier, $maxRequests, $windowSeconds)`

#### ✅ CSP Header بهبود یافته
- **فایل:** `.htaccess`
- **تغییرات:**
  - افزودن `upgrade-insecure-requests`
  - اجازه اتصال به Google APIs برای Push Notifications
  - افزودن `Permissions-Policy` برای کنترل دسترسی به دوربین و میکروفون

#### ✅ Session Fixation رفع شد
- **فایل:** `includes/Auth.php`
- **وضعیت:** از قبل موجود بود (`session_regenerate_id(true)` در خط ۱۹۳)

### ۲. بهینه‌سازی دیتابیس (Database Optimization)

#### ✅ ایندکس‌های جدید
- **فایل:** `includes/schema.php`
- **تغییرات:**
  - افزودن `FULLTEXT INDEX` روی ستون `body` در جدول `messages`
  - جدول جدید `rate_limits` با ایندکس‌های مرکب

### ۳. کش HTTP (HTTP Caching)

#### ✅ کش استاتیک
- **فایل:** `.htaccess`
- **تغییرات:**
  - تنظیم `Expires` برای CSS, JS, تصاویر، فونت‌ها
  - `Cache-Control` با max-age=30 روز برای فایل‌های استاتیک

### ۴. متغیرهای محیطی (Environment Variables)

#### ✅ فایل .env.example
- **فایل:** `.env.example`
- **ویژگی‌ها:**
  - تمام تنظیمات قابل پیکربندی
  - راهنمای تولید کلیدهای امنیتی
  - تنظیمات Rate Limiting قابل تنظیم

## نحوه نصب و ارتقا

### نصب جدید
1. کپی `.env.example` به `.env`
2. پر کردن مقادیر در `.env`
3. اجرای `install.php`

### ارتقای نسخه موجود
1. بک‌آپ از دیتابیس و فایل‌ها
2. کپی فایل‌های جدید
3. کپی `.env.example` به `.env` و انتقال تنظیمات
4. اجرای `upgrade.php` برای ایجاد جدول `rate_limits` و ایندکس FULLTEXT

## تست امنیت

### تست آپلود فایل مخرب
```bash
# تلاش برای آپلود فایل PHP با پسوند jpg
curl -X POST https://example.com/api/upload.php \
  -F "file=@malicious.php.jpg" \
  -H "X-Mobina-Csrf: YOUR_CSRF_TOKEN"
# باید خطای 415 یا 422 دریافت کنید
```

### تست Rate Limiting
```bash
# ۶ بار تلاش برای لاگین در یک دقیقه
for i in {1..6}; do
  curl -X POST https://example.com/api/auth.php \
    -d '{"action":"login","slug":"hossein","password":"wrong"}'
done
# بار ششم باید خطای 429 دریافت کند
```

## فایل‌های تغییر یافته

| فایل | نوع تغییر | توضیح |
|------|----------|-------|
| `api/upload.php` | بازنویسی کامل | امنیت آپلود، بهینه‌سازی، thumbnail |
| `includes/Helpers.php` | بازنویسی RateLimiter | دیتابیس backend، پاک‌سازی خودکار |
| `includes/schema.php` | افزودن ایندکس و جدول | FULLTEXT index، جدول rate_limits |
| `.htaccess` | بهبود | CSP، کش HTTP، Permissions-Policy |
| `.env.example` | جدید | پیکربندی محیطی |
| `api/auth.php` | جزئی | تطبیق با API جدید RateLimiter |

## مرحله بعدی: فاز ۲

در فاز ۲ موارد زیر پیاده‌سازی می‌شوند:
- شکستن `app.js` به ماژول‌های جدا
- پیاده‌سازی Exponential Backoff برای polling
- Pagination برای پیام‌ها
- بهینه‌سازی Service Worker
- Lazy loading تصاویر

---
**نسخه:** 3.2.2  
**تاریخ:** 2024  
**وضعیت فاز ۱:** ✅ تکمیل شد
