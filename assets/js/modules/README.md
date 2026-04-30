# ماژول‌های JavaScript - SoulMate

این پوشه حاوی ماژول‌های جداگانه برای بهبود ساختار کد است.

## ماژول‌ها

### 1. `constants.js`
تعریف تمام ثابت‌ها و مقادیر جادویی پروژه.
- جلوگیری از Magic Numbers
- تنظیمات متمرکز
- قابلیت تغییر آسان

### 2. `utils.js`
توابع کمکی عمومی:
- فرمت‌بندی تاریخ شمسی
- مدیریت فایل و حجم
- توابع debounce/throttle
- اعتبارسنجی‌ها
- و سایر ابزارها

### 3. `localdb.js`
مدیریت IndexedDB با قابلیت‌های پیشرفته:
- Pagination
- ایندکس‌گذاری بهینه
- کش هوشمند
- پشتیبانی آفلاین

### 4. `polling.js`
مدیریت هوشمند polling:
- Exponential Backoff
- Visibility API
- تشخیص فعالیت کاربر
- بهینه‌سازی مصرف باتری

### 5. `imageOptimizer.js`
بهینه‌سازی تصاویر:
- تغییر سایز خودکار
- فشرده‌سازی
- تولید thumbnail
- پشتیبانی از EXIF

### 6. `app.modular.js`
نسخه ماژولار app.js که از ماژول‌های بالا استفاده می‌کند.

## نحوه استفاده

در `index.php` ماژول‌ها به ترتیب لود می‌شوند:

```html
<script src="modules/constants.js"></script>
<script src="modules/utils.js"></script>
<script src="modules/localdb.js"></script>
<script src="modules/polling.js"></script>
<script src="modules/imageOptimizer.js"></script>
<script src="app.modular.js"></script>
```

## مزایا

✅ کد خوانا و قابل نگهداری  
✅ تست‌پذیری بهتر  
✅ قابلیت استفاده مجدد  
✅ کاهش تداخل  
✅ دیباگ آسان‌تر  

## نسخه فعلی: 3.2.2
