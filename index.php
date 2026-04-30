<?php
if (!is_file(__DIR__ . '/config/config.php')) {
    header('Location: install.php');
    exit;
}

$config = require __DIR__ . '/config/config.php';
$appName = htmlspecialchars(isset($config['app']['name']) ? $config['app']['name'] : 'SoulMate', ENT_QUOTES, 'UTF-8');
$baseHref = htmlspecialchars(rtrim(isset($config['app']['base_url']) ? $config['app']['base_url'] : './', '/') . '/', ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="#111827">
    <meta name="robots" content="noindex,nofollow">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="<?= $appName ?>">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <title><?= $appName ?></title>
    <base href="<?= $baseHref ?>">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="assets/icon-192.png">
    <link rel="stylesheet" href="assets/app.css?v=322">
    <link rel="stylesheet" href="assets/enhancements.css?v=322">
    <link rel="stylesheet" href="assets/css/base.css?v=322">
    <link rel="stylesheet" href="assets/css/layout.css?v=322">
    <link rel="stylesheet" href="assets/css/chat.css?v=322">
    <link rel="stylesheet" href="assets/css/memories.css?v=322">
    <link rel="stylesheet" href="assets/css/settings.css?v=322">
    <link rel="stylesheet" href="assets/css/mobile-fixes.css?v=322">
    <!-- Modular JS - Load in order -->
    <script defer src="assets/js/modules/constants.js?v=322"></script>
    <script defer src="assets/js/modules/utils.js?v=322"></script>
    <script defer src="assets/js/modules/localdb.js?v=322"></script>
    <script defer src="assets/js/modules/polling.js?v=322"></script>
    <script defer src="assets/js/modules/imageOptimizer.js?v=322"></script>
    <script defer src="assets/js/app.modular.js?v=322"></script>
    <!-- Legacy fallback -->
    <script defer src="assets/app.js?v=322"></script>
    <script defer src="assets/enhancements.js?v=322"></script>
</head>
<body>
<div class="app-shell" id="appShell" data-state="loading">
    <section class="login-view" id="loginView" hidden>
        <div class="login-panel">
            <div class="brand-lockup">
                <img src="assets/icon.svg" alt="" width="76" height="76">
                <div>
                    <h1>SoulMate</h1>
                    <p>فضای خصوصی حسین و مبینا</p>
                </div>
            </div>

            <div class="person-switch" role="group" aria-label="انتخاب کاربر">
                <button class="person-button is-active" type="button" data-login-user="hossein">
                    <span>ح</span>
                    حسین
                </button>
                <button class="person-button" type="button" data-login-user="mobina">
                    <span>م</span>
                    مبینا
                </button>
            </div>

            <div class="login-mode" id="loginMode" hidden>
                <button class="mode-button is-active" type="button" data-login-mode="password">رمز</button>
                <button class="mode-button" type="button" data-login-mode="pin">PIN</button>
            </div>

            <form class="login-form" id="loginForm">
                <label>
                    رمز عبور
                    <input id="loginPassword" type="password" autocomplete="current-password" minlength="8" required>
                </label>
                <button class="primary-button" type="submit">ورود</button>
                <button type="button" id="biometricLoginBtn" class="ghost-button biometric-btn" onclick="SoulMateApp.biometricLogin()" hidden>ورود امن با اثر انگشت / FaceID</button>
            </form>

            <form class="login-form" id="pinLoginForm" hidden>
                <label>
                    PIN دستگاه
                    <input id="loginPin" type="tel" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="one-time-code">
                </label>
                <button class="primary-button" type="submit">ورود با PIN</button>
            </form>
        </div>
    </section>

    <section class="main-view" id="mainView" hidden>
        <aside class="sidebar">
            <div class="sidebar-brand">
                <img src="assets/icon.svg" alt="" width="44" height="44">
                <div>
                    <strong>SoulMate</strong>
                    <span id="activePair">حسین و مبینا</span>
                </div>
            </div>

            <div class="love-meter">
                <span id="daysTogether">۰</span>
                <small>روز کنار هم</small>
            </div>

            <nav class="app-nav" aria-label="ناوبری">
                <button class="nav-button is-active" type="button" data-tab="chat" title="چت">
                    <span aria-hidden="true">✦</span>
                    چت
                    <b class="tab-badge" id="chatTabBadge" hidden></b>
                </button>
                <button class="nav-button" type="button" data-tab="memories" title="خاطره‌ها">
                    <span aria-hidden="true">♡</span>
                    خاطره‌ها
                    <b class="tab-badge" id="memoriesTabBadge" hidden></b>
                </button>
                <button class="nav-button" type="button" data-tab="love" title="عشقمون">
                    <span aria-hidden="true">∞</span>
                    عشقمون
                </button>
                <button class="nav-button" type="button" data-tab="settings" title="تنظیمات">
                    <span aria-hidden="true">⚙</span>
                    تنظیمات
                </button>
            </nav>

            <div class="daily-phrase" id="dailyPhrase"></div>

            <div class="profile-strip">
                <div class="avatar" id="myAvatar">ح</div>
                <div>
                    <strong id="myName">حسین</strong>
                    <span id="partnerName">مبینا</span>
                </div>
            </div>
        </aside>

        <main class="workspace">
            <header class="topbar">
                <div class="peer-card">
                    <div class="peer-avatar" id="peerAvatar">م</div>
                    <div class="peer-meta">
                        <strong id="conversationTitle">SoulMate</strong>
                        <span id="presenceText">آماده</span>
                    </div>
                </div>
                <div class="topbar-actions">
                    <button class="icon-button" id="searchButton" type="button" title="جستجو">⌕</button>
                    <button class="icon-button" id="installButton" type="button" title="نصب وب‌اپ" hidden>⇩</button>
                    <button class="icon-button" id="notifyButton" type="button" title="نوتیفیکیشن">◉</button>
                </div>
            </header>

            <section class="tab-panel is-active" id="chatTab" data-panel="chat" role="tabpanel" aria-labelledby="chatTabButton">
                <div class="chat-search" id="chatSearch" hidden>
                    <input id="searchInput" type="search" placeholder="جستجو در پیام‌ها و نام فایل‌ها..." autocomplete="off">
                    <button class="ghost-button" id="clearSearchButton" type="button">بستن</button>
                </div>
                <div class="messages" id="messages" aria-live="polite"></div>
                <button class="scroll-bottom" id="scrollBottomButton" type="button" title="رفتن به آخر چت" hidden>↓</button>
                <div class="love-actions" id="loveActions">
                    <button type="button" data-love-message="دلم برات تنگ شده.">دلتنگی</button>
                    <button type="button" data-love-message="یه بغل خیلی محکم از راه دور.">بغل مجازی</button>
                    <button type="button" data-love-message="همین الان بهت فکر کردم.">فکر تو</button>
                    <button type="button" data-love-message="صبح بخیر قشنگ‌ترین دلیل لبخندم.">صبح‌بخیر</button>
                    <button type="button" data-love-message="شب بخیر عشق من؛ امشب هم با فکر تو می‌خوابم.">شب‌بخیر</button>
                    <button type="button" data-love-message="یه بوسه کوچیک از راه دور برای همین لحظه.">بوسه</button>
                    <button type="button" data-love-message="دوستت دارم، بیشتر از چیزی که کلمه‌ها جا داشته باشن.">دوستت دارم</button>
                    <button type="button" data-love-tool="surprise">سوپرایز</button>
                    <button type="button" data-love-tool="prompt">ایده حرف</button>
                    <button type="button" data-love-tool="compliment">تعریف</button>
                    <button type="button" data-love-tool="date">قرار</button>
                    <button type="button" data-love-tool="challenge">چالش</button>
                    <button type="button" data-love-tool="memory">خاطره</button>
                    <button type="button" data-love-tool="promise">قول</button>
                    <button type="button" data-love-tool="poem">نامه کوتاه</button>
                    <button type="button" data-love-tool="day">روز ما</button>
                </div>
                <div class="typing-line" id="typingLine"></div>

                <form class="composer" id="composer">
                    <div class="composer-main">
                        <button class="composer-menu-button" id="composerMenuButton" type="button" title="ابزارهای پیام">＋</button>
                        <div class="composer-tools" id="composerTools" hidden>
                            <input id="fileInput" type="file" hidden accept="image/*,audio/*,video/*,application/pdf,text/plain,.zip,.rar,.doc,.docx,.xls,.xlsx,.ppt,.pptx">
                            <button class="tool-button" id="attachButton" type="button" title="پیوست" aria-label="افزودن پیوست">پیوست</button>
                            <button class="tool-button" id="recordButton" type="button" title="ویس" aria-label="ضبط پیام صوتی">ویس</button>
                        </div>
                        <div class="recording-panel" id="recordingPanel" hidden>
                            <span class="recording-dot" aria-hidden="true"></span>
                            <strong id="recordingTime">۰۰:۰۰</strong>
                            <button class="recording-save" id="saveRecordButton" type="button">آماده</button>
                            <button class="recording-cancel" id="cancelRecordButton" type="button">لغو</button>
                        </div>
                        <div class="attachment-pill" id="attachmentPill" hidden></div>
                        <div class="reply-preview" id="replyPreview" hidden>
                            <div>
                                <strong>پاسخ به پیام</strong>
                                <span id="replyPreviewText"></span>
                            </div>
                            <button type="button" id="cancelReplyButton" aria-label="لغو ریپلای">×</button>
                        </div>
                        <div class="timed-panel" id="timedPanel" hidden>
                            <label>باز شود در <input id="timedOpenAt" type="datetime-local"></label>
                            <button type="button" id="clearTimedButton" aria-label="حذف زمان">×</button>
                        </div>
                        <textarea id="messageInput" rows="1" maxlength="4000" placeholder="پیام..." autocomplete="off" aria-label="متن پیام"></textarea>
                        <div class="message-mode-popover" id="messageModePopover" hidden role="menu">
                            <button type="button" id="emojiButton" title="ایموجی" aria-label="انتخاب ایموجی" role="menuitem">ایموجی</button>
                            <button type="button" id="loveModeButton" title="پیام قلبی" aria-label="ارسال پیام قلبی" role="menuitem">قلبی</button>
                            <button type="button" id="letterModeButton" title="نامه عاشقانه" aria-label="ارسال نامه عاشقانه" role="menuitem">نامه</button>
                            <button type="button" id="timedModeButton" title="پیام زمان‌دار" aria-label="ارسال پیام زمان‌دار" role="menuitem">زمان</button>
                            <button type="button" id="stickerModeButton" title="استیکر" aria-label="ارسال استیکر" role="menuitem">استیکر</button>
                            <button type="button" id="clearModeButton" title="پیام عادی" aria-label="تغییر به پیام عادی" role="menuitem">عادی</button>
                        </div>

                    </div>
                    <button class="send-button" id="sendButton" type="submit" title="ارسال">➤</button>
                </form>
            </section>

            <section class="tab-panel" id="memoriesTab" data-panel="memories" role="tabpanel" aria-labelledby="memoriesTabButton">
                <form class="memory-form" id="memoryForm">
                    <input id="memoryImageInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                    <input id="memoryEmoji" maxlength="8" value="❤" aria-label="نشانه">
                    <input id="memoryTitle" maxlength="140" placeholder="عنوان خاطره" required>
                    <input id="memoryDate" type="text" inputmode="numeric" placeholder="۱۴۰۳/۰۲/۰۶" aria-label="تاریخ شمسی">
                    <textarea id="memoryNote" maxlength="2000" placeholder="یادداشت"></textarea>
                    <div class="memory-image-pill" id="memoryImagePill" hidden></div>
                    <button class="secondary-button" id="memoryImageButton" type="button">افزودن عکس</button>
                    <label class="memory-lock-row"><input id="memoryLocked" type="checkbox"> قفل خصوصی</label>
                    <button class="primary-button" type="submit">ثبت خاطره</button>
                    <button class="ghost-button" id="cancelMemoryEditButton" type="button" hidden>لغو ویرایش</button>
                </form>
                <div class="memory-list" id="memoryList"></div>
            </section>
            
            <section class="tab-panel" id="loveTab" data-panel="love" role="tabpanel" aria-labelledby="loveTabButton">
                <div class="love-dashboard">
                    <article class="love-hero-card">
                        <span class="mini-label">عشقمون</span>
                        <strong id="loveDaysBig">۰</strong>
                        <small>روز از شروع قصه‌مون</small>
                    </article>
                    <article class="love-note-card">
                        <span class="mini-label">یادداشت روز</span>
                        <p id="loveDailyNote">هنوز یادداشت روز ثبت نشده.</p>
                    </article>
                    <article class="love-card">
                        <span class="mini-label">امروز</span>
                        <strong id="loveTodayDate">—</strong>
                        <small id="loveTogetherLine">هر روز کنار هم، یک صفحه تازه.</small>
                    </article>
                    <article class="love-card">
                        <span class="mini-label">آخرین خاطره</span>
                        <strong id="loveLastMemoryTitle">—</strong>
                        <small id="loveLastMemoryDate">خاطره‌ای ثبت نشده.</small>
                    </article>
                    <article class="love-card love-wide-card">
                        <span class="mini-label">ایده عاشقانه امروز</span>
                        <p id="loveSuggestion">یک پیام کوتاه بفرست و فقط بگو: همین الان بهت فکر کردم.</p>
                    </article>
                    <article class="love-card love-wide-card miss-card">
                        <span class="mini-label">Miss you</span>
                        <strong id="missYouText" aria-live="polite">—</strong>
                        <small>از آخرین پیام عشقت گذشته</small>
                    </article>
                    <article class="love-card love-wide-card timed-message-card">
                        <span class="mini-label">پیام زمان‌دار عاشقانه</span>
                        <form id="timedMessageForm" class="inline-love-form">
                            <textarea id="timedMessageText" maxlength="1000" placeholder="متن پیام مخفی تا زمان مشخص..."></textarea>
                            <input id="timedMessageOpenAt" type="datetime-local" required>
                            <button class="primary-button" type="submit">ارسال زمان‌دار</button>
                        </form>
                    </article>
                    <article class="love-card love-wide-card album-card">
                        <span class="mini-label">آلبوم عکس دونفره</span>
                        <form id="albumForm" class="inline-love-form">
                            <input id="albumFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required>
                            <input id="albumCaptionInput" maxlength="180" placeholder="کپشن کوتاه عکس">
                            <button class="secondary-button" type="submit">افزودن به آلبوم</button>
                        </form>
                        <div class="album-timeline" id="albumTimeline"></div>
                    </article>
                    <article class="love-card">
                        <span class="mini-label">مود امروز</span>
                        <div class="mood-grid" id="moodGrid">
                            <button type="button" data-mood="😍">😍 عاشقانه</button>
                            <button type="button" data-mood="🥺">🥺 دلتنگ</button>
                            <button type="button" data-mood="😌">😌 آروم</button>
                            <button type="button" data-mood="😂">😂 شاد</button>
                            <button type="button" data-mood="🤗">🤗 نیاز به بغل</button>
                        </div>
                        <div class="mood-list" id="moodList"></div>
                    </article>
                    <article class="love-card">
                        <span class="mini-label">استیکرهای اختصاصی</span>
                        <div class="sticker-grid" id="stickerGrid">
                            <button type="button" data-sticker="💌">💌</button>
                            <button type="button" data-sticker="🫶">🫶</button>
                            <button type="button" data-sticker="💋">💋</button>
                            <button type="button" data-sticker="🥰">🥰</button>
                            <button type="button" data-sticker="✨">✨</button>
                            <button type="button" data-sticker="🌙">🌙</button>
                            <button type="button" data-sticker="🧸">🧸</button>
                            <button type="button" data-sticker="🌹">🌹</button>
                        </div>
                    </article>
                    <article class="love-card love-wide-card">
                        <span class="mini-label">تقویم مناسبت‌ها و قرارها</span>
                        <form id="eventForm" class="inline-love-form compact-love-form">
                            <input id="eventTitleInput" maxlength="140" placeholder="عنوان مناسبت یا قرار">
                            <input id="eventDateInput" type="date" required>
                            <button class="secondary-button" type="submit">افزودن</button>
                        </form>
                        <div class="event-list" id="eventList"></div>
                    </article>
                    <article class="love-card love-wide-card">
                        <span class="mini-label">دفترچه قول‌ها</span>
                        <form id="promiseForm" class="inline-love-form compact-love-form">
                            <input id="promiseTextInput" maxlength="200" placeholder="یک قول قشنگ...">
                            <button class="secondary-button" type="submit">ثبت قول</button>
                        </form>
                        <div class="promise-list" id="promiseList"></div>
                    </article>
                    <article class="love-card love-wide-card">
                        <span class="mini-label">جستجوی پیشرفته</span>
                        <form id="advancedSearchForm" class="inline-love-form compact-love-form">
                            <input id="advancedSearchInput" type="search" maxlength="120" placeholder="جستجو در پیام‌ها، خاطره‌ها و فایل‌ها...">
                            <button class="secondary-button" type="submit">جستجو</button>
                        </form>
                        <div class="advanced-search-results" id="advancedSearchResults"></div>
                    </article>
                </div>
            </section>

            <section class="tab-panel" id="settingsTab" data-panel="settings" role="tabpanel" aria-labelledby="settingsTabButton">
                <div class="settings-grid">
                    <div class="profile-card">
                        <div class="profile-photo" id="settingsAvatar">ح</div>
                        <div>
                            <strong id="settingsName">حسین</strong>
                            <span>عکس پروفایل و ورود سریع این دستگاه</span>
                        </div>
                        <input id="avatarInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                        <button class="secondary-button" id="avatarButton" type="button">تغییر عکس</button>
                    </div>

                    <form class="settings-form" id="settingsForm">
                        <label>
                            تاریخ شروع
                            <input id="coupleSinceInput" type="text" inputmode="numeric" placeholder="۱۴۰۳/۰۲/۰۶">
                        </label>
                        <label>
                            جمله روز
                            <input id="dailyPhraseInput" maxlength="240">
                        </label>
                        <label>
                            حریم نوتیفیکیشن
                            <select id="notificationModeInput">
                                <option value="preview">نمایش متن پیام</option>
                                <option value="sender">فقط نام فرستنده</option>
                                <option value="private">کاملاً خصوصی</option>
                            </select>
                            <input id="notificationPreviewInput" type="checkbox" hidden>
                        </label>
                        <button class="primary-button" type="submit">ذخیره</button>
                    </form>

                    <form class="settings-form" id="pinForm">
                        <label>
                            PIN این دستگاه
                            <input id="pinInput" type="tel" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="۴ تا ۸ رقم">
                        </label>
                        <button class="primary-button" type="submit">ثبت PIN</button>
                        <button class="ghost-button" id="clearPinButton" type="button">حذف PIN</button>
                    </form>

                    <div class="device-panel">
                        <div class="device-status">
                            <strong id="notificationStatus">نوتیفیکیشن</strong>
                            <span id="installStatus">وب‌اپ</span>
                        </div>
                        <div class="install-checklist" id="installChecklist"></div>
                        <button class="secondary-button" id="enablePushButton" type="button">فعال‌سازی نوتیفیکیشن</button>
                        <button class="secondary-button" id="testPushButton" type="button">ارسال تست</button>
                        <button class="ghost-button" id="themeButton" type="button">تغییر تم</button>
                        <button class="ghost-button" type="button" onclick="SoulMateApp.promptBiometricRegistration()">تنظیم ورود امن</button>
                        <button class="ghost-button" type="button" onclick="SoulMateApp.setupE2EE()">باز کردن کلید E2EE</button>
                        <button class="danger-button" id="logoutButton" type="button">خروج</button>
                    </div>
                </div>
            </section>
        </main>
    </section>

    <div class="reaction-dock" id="reactionDock" hidden role="toolbar" aria-label="انتخاب واکنش">
        <button type="button" data-reaction="❤">❤</button>
        <button type="button" data-reaction="😘">😘</button>
        <button type="button" data-reaction="✨">✨</button>
        <button type="button" data-reaction="🌹">🌹</button>
        <button type="button" data-reaction="🤍">🤍</button>
        <button type="button" data-reaction="🫶">🫶</button>
        <button type="button" data-reaction="🥰">🥰</button>
        <button type="button" data-reaction="😍">😍</button>
        <button type="button" data-reaction="💋">💋</button>
        <button type="button" data-reaction="💌">💌</button>
        <button type="button" data-reaction="🫠">🫠</button>
        <button type="button" data-reaction="😂">😂</button>
        <button type="button" data-reaction="🥺">🥺</button>
        <button type="button" data-reaction="حذف">−</button>
    </div>

    <div class="toast" id="toast" hidden role="status" aria-live="polite"></div>

    <!-- Bottom Sheet Template -->
    <div class="bottom-sheet-overlay" id="bottomSheetOverlay" hidden>
        <div class="bottom-sheet" id="bottomSheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-header">
                <strong id="bottomSheetTitle">عنوان</strong>
                <p id="bottomSheetDesc">توضیحات</p>
            </div>
            <div class="bottom-sheet-body">
                <input type="password" id="bottomSheetInput" hidden>
                <button class="primary-button" id="bottomSheetConfirm">تایید</button>
                <button class="ghost-button" id="bottomSheetCancel">لغو</button>
            </div>
        </div>
    </div>
</div>
</body>
</html>
