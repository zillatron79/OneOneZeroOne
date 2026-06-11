// SyncPro — unified cross-device sync for Lampa.
//
// Replaces the legacy quartet sync.js + bookmark.js + timecode.js + backup.js
// with a single plugin. All sync domains (favorites, timecodes, watch history,
// torrents, search history, plugin list, manual backup) live behind individual
// toggles in Settings → Синхронизация. The plugin also embeds a Profile section
// that lets users register / log in / generate a sync code so the same data
// follows them between devices without depending on Telegram auth.
//
// Auth model: every request relies on cookies that the auth middleware on the
// server (internal/auth/auth.go) reads — `lampac_token` (TG bot) or
// `lampac_profile_session` (this plugin's profile flow). Legacy `?uid=` and
// `?account_email=` are NOT appended because they were the source of repeated
// impersonation and NAT-collision bugs (see project memory 2026-05-25).
//
// Server endpoints exercised:
//   GET  /bookmark/list, POST /bookmark/{set,add,added,remove}
//   GET  /timecode/all,  POST /timecode/add
//   POST /storage/{set,get}?path=<domain>&pathfile=<profile_id>
//   POST /api/profile/{register,login,logout,change-password,sync-code/...}
//   GET  /api/profile/me
//
// Templated placeholders replaced by genericPluginJSHandler at serve time:
//   http://192.168.1.103:18118 — server base URL
//       — TG device token (may be empty, e.g. for anonymous installs)

(function () {
'use strict';

if (window.lampac_syncpro_plugin) return;
window.lampac_syncpro_plugin = true;

var HOST = 'http://192.168.1.103:18118';
var TOKEN = '';

// ----------------------------------------------------------------------
//  i18n
// ----------------------------------------------------------------------

function loadLang() {
    Lampa.Lang.add({
        syncpro_title:               { ru: 'Синхронизация', en: 'Sync', uk: 'Синхронізація' },
        syncpro_section_domains:     { ru: 'Что синхронизировать', en: 'What to sync', uk: 'Що синхронізувати' },
        syncpro_section_profile:     { ru: 'Профиль', en: 'Profile', uk: 'Профіль' },
        syncpro_section_actions:     { ru: 'Действия', en: 'Actions', uk: 'Дії' },

        syncpro_dom_bookmarks:       { ru: 'Закладки', en: 'Bookmarks', uk: 'Закладки' },
        syncpro_dom_timecodes:       { ru: 'Таймкоды', en: 'Timecodes', uk: 'Таймкоди' },
        syncpro_dom_history:         { ru: 'История просмотров', en: 'Watch history', uk: 'Історія перегляду' },
        syncpro_dom_torrents:        { ru: 'Торренты', en: 'Torrents', uk: 'Торенти' },
        syncpro_dom_search:          { ru: 'История поиска', en: 'Search history', uk: 'Історія пошуку' },
        syncpro_dom_plugins:         { ru: 'Список плагинов', en: 'Installed plugins', uk: 'Список плагінів' },

        syncpro_action_backup_save:  { ru: 'Создать бэкап на сервере', en: 'Save backup to server', uk: 'Створити бекап' },
        syncpro_action_backup_load:  { ru: 'Восстановить из бэкапа', en: 'Restore backup', uk: 'Відновити з бекапу' },
        syncpro_action_force_pull:   { ru: 'Подтянуть данные сейчас', en: 'Pull all data now', uk: 'Завантажити зараз' },

        syncpro_profile_status_anon: { ru: 'Не вошёл', en: 'Not signed in', uk: 'Не увійшов' },
        syncpro_profile_status_tg:   { ru: 'Вход через Telegram', en: 'Signed in via Telegram', uk: 'Вхід через Telegram' },
        syncpro_profile_status_prof: { ru: 'Профиль: {name}', en: 'Profile: {name}', uk: 'Профіль: {name}' },

        syncpro_profile_login:       { ru: 'Войти в профиль', en: 'Sign in', uk: 'Увійти' },
        syncpro_profile_register:    { ru: 'Создать профиль', en: 'Create profile', uk: 'Створити профіль' },
        syncpro_profile_logout:      { ru: 'Выйти из профиля', en: 'Sign out', uk: 'Вийти' },
        syncpro_profile_chgpass:     { ru: 'Сменить пароль', en: 'Change password', uk: 'Змінити пароль' },
        syncpro_profile_sync_issue:  { ru: 'Получить код для другого устройства', en: 'Get sync code', uk: 'Отримати код синхронізації' },
        syncpro_profile_sync_redeem: { ru: 'Ввести код синхронизации', en: 'Enter sync code', uk: 'Ввести код синхронізації' },
        syncpro_profile_pin_login:   { ru: 'Войти по PIN', en: 'Sign in with PIN', uk: 'Увійти за PIN' },
        syncpro_field_pin:           { ru: 'PIN (4-8 цифр)', en: 'PIN (4-8 digits)', uk: 'PIN (4-8 цифр)' },

        syncpro_field_username:      { ru: 'Имя пользователя', en: 'Username', uk: 'Ім\'я користувача' },
        syncpro_field_password:      { ru: 'Пароль', en: 'Password', uk: 'Пароль' },
        syncpro_field_password_old:  { ru: 'Старый пароль', en: 'Old password', uk: 'Старий пароль' },
        syncpro_field_password_new:  { ru: 'Новый пароль', en: 'New password', uk: 'Новий пароль' },
        syncpro_field_code:          { ru: 'Код синхронизации', en: 'Sync code', uk: 'Код синхронізації' },

        syncpro_msg_done:            { ru: 'Готово', en: 'Done', uk: 'Готово' },
        syncpro_msg_pulled:          { ru: 'Данные подтянуты', en: 'Data pulled', uk: 'Дані завантажено' },
        syncpro_msg_backup_ok:       { ru: 'Бэкап сохранён', en: 'Backup saved', uk: 'Бекап збережено' },
        syncpro_msg_backup_restored: { ru: 'Бэкап восстановлен, перезагрузка…', en: 'Restored, reloading…', uk: 'Відновлено, перезавантаження…' },
        syncpro_msg_login_ok:        { ru: 'Вход выполнен', en: 'Signed in', uk: 'Вхід виконано' },
        syncpro_msg_logout_ok:       { ru: 'Вы вышли', en: 'Signed out', uk: 'Ви вийшли' },
        syncpro_msg_register_ok:     { ru: 'Профиль создан', en: 'Profile created', uk: 'Профіль створено' },
        syncpro_msg_chgpass_ok:      { ru: 'Пароль изменён', en: 'Password changed', uk: 'Пароль змінено' },
        syncpro_msg_sync_code:       { ru: 'Код: {code}\nДействителен 1 час, ввести на другом устройстве', en: 'Code: {code}\nValid for 1 hour, type it on the other device', uk: 'Код: {code}' },

        syncpro_err_generic:         { ru: 'Ошибка ({code})', en: 'Error ({code})', uk: 'Помилка ({code})' },
        syncpro_err_username_taken:  { ru: 'Имя занято', en: 'Username already taken', uk: 'Ім\'я вже зайняте' },
        syncpro_err_username_inv:    { ru: 'Имя: 3-32 символа [a-z0-9_-]', en: 'Username: 3-32 chars [a-z0-9_-]', uk: 'Ім\'я: 3-32 символи' },
        syncpro_err_password_weak:   { ru: 'Пароль слишком короткий (мин. 6)', en: 'Password too short (min 6)', uk: 'Пароль закороткий (мін. 6)' },
        syncpro_err_invalid_creds:   { ru: 'Неверное имя или пароль', en: 'Invalid username or password', uk: 'Невірне ім\'я або пароль' },
        syncpro_err_sync_invalid:    { ru: 'Код недействителен', en: 'Code invalid or expired', uk: 'Код недійсний' },
        syncpro_err_sync_used:       { ru: 'Код уже использован', en: 'Code already used', uk: 'Код вже використано' },
        syncpro_err_rate_limited:    { ru: 'Слишком часто, подождите', en: 'Too many requests, wait', uk: 'Зачекайте' },
        syncpro_err_disabled:        { ru: 'Профильная синхронизация выключена на сервере', en: 'Profile sync disabled on server', uk: 'Вимкнено на сервері' },

        // -- Compact UI: section pickers --
        syncpro_open_profile_mgmt:   { ru: 'Управление профилем', en: 'Profile actions', uk: 'Керування профілем' },
        syncpro_open_domains:        { ru: 'Что синхронизировать', en: 'What to sync', uk: 'Що синхронізувати' },
        syncpro_open_actions:        { ru: 'Действия', en: 'Actions', uk: 'Дії' },
        syncpro_summary_domains:     { ru: 'Включено {n} из {total}', en: '{n} of {total} enabled', uk: 'Увімкнено {n} з {total}' },
        syncpro_msg_tg_no_code:      { ru: 'Вы уже входите через Telegram — устройства синхронизируются автоматически, отдельный код не нужен.', en: 'You are signed in via Telegram — devices already sync automatically.', uk: 'Ви вже увійшли через Telegram.' },
        syncpro_msg_tg_no_profile:   { ru: 'Вы вошли через Telegram. Чтобы использовать профиль с паролем — выйдите из TG и войдите как профиль.', en: 'Signed in via Telegram. Sign out of TG to use a profile.', uk: 'Ви увійшли через Telegram.' },
        syncpro_back:                { ru: 'Назад', en: 'Back', uk: 'Назад' },

        // -- Storage-side error slugs (msg field from writeStorageError) --
        syncpro_err_storage_disabled:{ ru: 'Хранилище на сервере отключено', en: 'Server storage is disabled', uk: 'Серверне сховище вимкнено' },
        syncpro_err_storage_max:     { ru: 'Слишком большой бэкап для сервера', en: 'Backup is larger than server limit', uk: 'Бекап більше за ліміт сервера' },
        syncpro_err_storage_path:    { ru: 'Сервер отверг путь — войдите в профиль или TG', en: 'Server rejected path — sign in to TG or profile', uk: 'Сервер відхилив шлях' },
        syncpro_err_storage_lock:    { ru: 'Сервер не смог записать файл', en: 'Server failed to write file', uk: 'Помилка запису на сервері' },
        syncpro_err_network:         { ru: 'Нет соединения с сервером', en: 'No connection to the server', uk: 'Немає з\'єднання з сервером' },
        syncpro_err_backup_empty:    { ru: 'Бэкап ещё не создан', en: 'No backup saved yet', uk: 'Бекап ще не створено' },
        syncpro_err_backup_parse:    { ru: 'Бэкап повреждён, не удалось прочитать', en: 'Backup is corrupted', uk: 'Бекап пошкоджено' },
        syncpro_err_too_large_proxy: { ru: 'Бэкап слишком большой для прокси (nginx client_max_body_size). Попросите админа увеличить лимит до 50M.', en: 'Backup exceeds the reverse-proxy body limit (nginx client_max_body_size). Ask the operator to raise it to 50M.', uk: 'Бекап більший за ліміт зворотного проксі (nginx client_max_body_size).' },

        // -- Active-profile switcher (TG users) --
        syncpro_switch_profile:      { ru: 'Сменить активный профиль', en: 'Switch active profile', uk: 'Змінити активний профіль' },
        syncpro_active_profile:      { ru: 'Активный профиль: {name}', en: 'Active profile: {name}', uk: 'Активний профіль: {name}' },
        syncpro_active_default:      { ru: 'Активный профиль: общий (TG)', en: 'Active profile: shared (TG)', uk: 'Активний профіль: спільний (TG)' },
        syncpro_profile_default:     { ru: '— Общий (TG)', en: '— Shared (TG)', uk: '— Спільний (TG)' },
        syncpro_profile_loading:     { ru: 'Загрузка списка профилей…', en: 'Loading profiles…', uk: 'Завантаження профілів…' },
        syncpro_profile_none_owned:  { ru: 'Нет своих профилей. Создайте на /bkit или /kit.', en: 'No owned profiles yet. Create one in /bkit or /kit.', uk: 'Немає профілів. Створіть у /bkit або /kit.' },
        syncpro_switched:            { ru: 'Профиль переключён', en: 'Profile switched', uk: 'Профіль перемкнено' },
    });
}

function errorMessageFromSlug(slug, code) {
    var map = {
        username_taken:      'syncpro_err_username_taken',
        username_invalid:    'syncpro_err_username_inv',
        password_weak:       'syncpro_err_password_weak',
        invalid_credentials: 'syncpro_err_invalid_creds',
        sync_code_invalid:   'syncpro_err_sync_invalid',
        sync_code_used:      'syncpro_err_sync_used',
        rate_limited:        'syncpro_err_rate_limited',
        profile_store_disabled: 'syncpro_err_disabled',
        // 401 from sync-code/issue, change-password, etc. when the user
        // taps a profile-only action while TG-authed (race between UI
        // refresh and server check). Friendlier than "Error (401)".
        not_authenticated:   'syncpro_msg_tg_no_code',
        // Slugs from /storage/* (writeStorageError). The msg field on the
        // 200-with-success:false response carries one of these — surfacing
        // them in plain Russian beats showing "Ошибка (200)".
        disabled:            'syncpro_err_storage_disabled',
        max_size:            'syncpro_err_storage_max',
        outFile:             'syncpro_err_storage_path',
        fileLock:            'syncpro_err_storage_lock',
        network:             'syncpro_err_network',
        nodata:              'syncpro_err_backup_empty',
        parse:               'syncpro_err_backup_parse',
        too_large_proxy:     'syncpro_err_too_large_proxy',
    };
    if (slug && map[slug]) return Lampa.Lang.translate(map[slug]);
    return Lampa.Lang.translate('syncpro_err_generic').replace('{code}', code || slug || '?');
}

// ----------------------------------------------------------------------
//  Settings storage helpers
// ----------------------------------------------------------------------
//
// Toggles use `syncpro_<domain>` keys in Lampa.Storage. Default to true so
// new installs sync everything; users opt out per domain.

function pref(domain, def) {
    var key = 'syncpro_' + domain;
    var v = Lampa.Storage.field(key);
    if (typeof v === 'undefined' || v === null || v === '') {
        if (typeof def !== 'undefined') return def;
        return true;
    }
    return v === true || v === 'true' || v === 1 || v === '1';
}

function url(path) {
    // No legacy query params. Server resolves user from cookies
    // (lampac_token or lampac_profile_session). connectionId is appended
    // when the invc-ws hub is up so the server can skip echoing the event
    // back to the originating connection.
    var u = HOST + path;
    if (TOKEN) u = Lampa.Utils.addUrlComponent(u, 'token=' + encodeURIComponent(TOKEN));
    if (window.lwsEvent && window.lwsEvent.connectionId) {
        u = Lampa.Utils.addUrlComponent(u, 'connectionId=' + encodeURIComponent(window.lwsEvent.connectionId));
    }
    var profileSeg = Lampa.Storage.get('lampac_profile_id', '');
    if (profileSeg) {
        // bookmark / timecode read `profile_id`, /storage reads `pathfile`
        // — historical naming split. We always send both: the unused one is
        // silently dropped by each handler, and a single source of truth
        // (lampac_profile_id) means switching the active profile from the
        // settings sheet partitions ALL synced domains, not just two of
        // them. Verified server-side: storage_api.go:50 and timecode_api.go:108.
        u = Lampa.Utils.addUrlComponent(u, 'profile_id=' + encodeURIComponent(profileSeg));
        u = Lampa.Utils.addUrlComponent(u, 'pathfile=' + encodeURIComponent(profileSeg));
    }
    return u;
}

// ----------------------------------------------------------------------
//  Network primitives
// ----------------------------------------------------------------------
//
// We use raw XHR (not Lampa.Reguest) for the profile API because we need
// to inspect HTTP status codes and JSON error slugs. Lampa.Reguest swallows
// non-2xx into a generic error.

// Profile-session token kept in Lampa.Storage so it survives across the
// Lampa Android WebView, which silently drops Set-Cookie from XHR
// responses (see auth.go resolveUser for the server-side header path).
// In a normal browser the cookie path is enough; the storage shadow is
// harmless because the server treats whichever is present.
// Dual storage namespace: `alpac_*` is our brand-scoped key (preferred),
// `lampac_*` is the legacy name we still read for backward compatibility.
// We *write* the alpac key only — if a foreign plugin overwrites the
// legacy lampac key, our session survives via alpac.
function getProfileSessionToken() {
    try {
        var v = Lampa.Storage.get('alpac_profile_session_token', '');
        if (v) return v;
        v = Lampa.Storage.get('lampac_profile_session_token', '');
        if (v) return v;
    } catch (e) { /* Storage not ready */ }
    return '';
}
function setProfileSessionToken(tok) {
    try {
        Lampa.Storage.set('alpac_profile_session_token', tok || '');
        // Mirror to the legacy key so older syncpro builds running on the
        // same device continue to work after one of them logs in/out.
        Lampa.Storage.set('lampac_profile_session_token', tok || '');
    } catch (e) { /* ignore */ }
}

// getAlpacToken reads the TG device token from any of its known
// hideouts. The TG bot's OAuth flow sets a `lampac_token` cookie via
// navigation response — that's the canonical store on a normal browser.
// In Lampa's Android WebView the cookie often DOES get persisted, but
// the WebView's network stack sometimes withholds it from same-host
// XHRs (varies by Android API level + how the wrapper initialised
// CookieManager). lampainit + iptv2 also keep a copy in Lampa.Storage
// for exactly this case. We accept whichever channel has a value so
// the syncpro plugin works regardless of which runtime it's loaded in.
//
// Server side reads the same value from `X-Alpac-Token` header in
// auth.go resolveUser, in addition to the cookie + ?token=.
function getAlpacToken() {
    // Search both namespaces (alpac_* first as our brand, lampac_* as the
    // legacy / external fallback). Each is checked in BOTH Lampa.Storage
    // and document.cookie because the TG auth flow on the server writes
    // both cookies, and external plugins / older Lampa builds may have
    // populated Lampa.Storage with the legacy name.
    var names = ['alpac_token', 'lampac_token'];
    try {
        for (var i = 0; i < names.length; i++) {
            var v = Lampa.Storage.get(names[i], '');
            if (v) return v;
        }
    } catch (e) { /* Storage not ready */ }
    try {
        for (var j = 0; j < names.length; j++) {
            var re = new RegExp('(?:^|;\\s*)' + names[j] + '=([^;]*)');
            var m = document.cookie.match(re);
            if (m && m[1]) return decodeURIComponent(m[1]);
        }
    } catch (e) { /* document.cookie may throw in odd sandboxes */ }
    return '';
}

function httpJSON(method, path, body, cb, errCb) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url(path), true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        // Use the brand-scoped X-Alpac-* headers — the server reads
        // X-Alpac-* as a backward-compat fallback for older clients.
        var sessTok = getProfileSessionToken();
        if (sessTok) xhr.setRequestHeader('X-Alpac-Profile-Session', sessTok);
        var lampTok = getAlpacToken();
        if (lampTok) xhr.setRequestHeader('X-Alpac-Token', lampTok);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            var parsed = null;
            try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) { /* ignore */ }
            if (xhr.status >= 200 && xhr.status < 300) {
                // Auth responses carry session_token mirroring the cookie
                // — persist it for the next request when the WebView ate
                // the Set-Cookie header.
                if (parsed && typeof parsed.session_token === 'string' && parsed.session_token) {
                    setProfileSessionToken(parsed.session_token);
                }
                if (cb) cb(parsed, xhr.status);
            } else {
                if (errCb) errCb(parsed, xhr.status);
            }
        };
        xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) {
        if (errCb) errCb(null, 0);
    }
}

// ----------------------------------------------------------------------
//  Profile API (talks to /api/profile/*)
// ----------------------------------------------------------------------

var Profile = {
    me: function (cb) {
        httpJSON('GET', '/api/profile/me', null, function (j) {
            cb(j || { authenticated: false, auth_method: 'none' });
        }, function () {
            cb({ authenticated: false, auth_method: 'none' });
        });
    },
    register: function (username, password, cb, errCb) {
        httpJSON('POST', '/api/profile/register', { username: username, password: password }, cb, errCb);
    },
    login: function (username, password, cb, errCb) {
        httpJSON('POST', '/api/profile/login', { username: username, password: password }, cb, errCb);
    },
    logout: function (cb) {
        httpJSON('POST', '/api/profile/logout', null, cb, cb);
    },
    changePassword: function (oldPass, newPass, cb, errCb) {
        httpJSON('POST', '/api/profile/change-password', { old_password: oldPass, new_password: newPass }, cb, errCb);
    },
    issueCode: function (cb, errCb) {
        httpJSON('POST', '/api/profile/sync-code/issue', {}, cb, errCb);
    },
    redeemCode: function (code, cb, errCb) {
        httpJSON('POST', '/api/profile/sync-code/redeem', { code: code }, cb, errCb);
    },
    // PIN login (no TG required) — user enters {username, PIN}. The PIN is
    // set on the server side by the profile's TG-owner via /api/profile/
    // owned/set-pin or the /profiles bot command.
    pinLogin: function (username, pin, cb, errCb) {
        httpJSON('POST', '/api/profile/pin-login', { username: username, pin: pin }, cb, errCb);
    },
    // listOwned — returns profiles owned by the currently-authenticated TG
    // user. Requires the lampac_token cookie (auto-sent by Lampa wrapper).
    // Used for the "Switch active profile" picker — TG users want to pick
    // which of their owned profiles is active on this device, like Netflix
    // profiles. The picker rewrites localStorage.lampac_profile_id, and
    // url() then segments every /bookmark, /timecode, /storage request by
    // that profile_id / pathfile.
    listOwned: function (cb, errCb) {
        httpJSON('GET', '/api/profile/owned', null, cb, errCb);
    },
};

// ----------------------------------------------------------------------
//  Per-domain sync modules
// ----------------------------------------------------------------------

// Bookmarks (replaces bookmark.js)
var Bookmarks = {
    enabled: function () { return pref('bookmarks'); },
    bound: false,

    bind: function () {
        if (this.bound) return;
        this.bound = true;
        var self = this;
        var fav = Lampa.Favorite;
        if (!fav || !fav.listener) return;
        fav.listener.follow('add', function (e) {
            if (!self.enabled()) return;
            if (e.card && e.card.received) return;
            self.sendAdd(e);
        });
        fav.listener.follow('added', function (e) {
            if (!self.enabled()) return;
            if (e.card && e.card.received) return;
            self.sendAdded(e);
        });
        fav.listener.follow('remove', function (e) {
            if (!self.enabled()) return;
            if (e.card && e.card.received) return;
            self.sendRemove(e);
        });
        Lampa.Listener.follow('lampac', function (e) {
            if (e.name === 'bookmark_pullFromServer' && self.enabled()) self.pull();
            else if (e.name === 'bookmark_set' && self.enabled()) {
                self.applyServerSet(e.value);
                httpJSON('POST', '/bookmark/set', e.value);
            }
        });
        // Periodic refresh on tab visibility (devices that sleep miss WS pushes).
        var lastFocus = Date.now();
        document.addEventListener('visibilitychange', function () {
            if (Date.now() - lastFocus > 10 * 60 * 1000 && self.enabled()) self.pull();
            lastFocus = Date.now();
        });
    },

    sanitize: function (card) {
        if (!card) return null;
        if (Lampa.Utils.clearCard) return Lampa.Utils.clearCard(Lampa.Arrays.clone(card));
        return card;
    },

    sendAdd: function (e) {
        var id = e && e.card && typeof e.card.id !== 'undefined' ? e.card.id : null;
        if (id === null) return;
        httpJSON('POST', '/bookmark/add', {
            where: e.where || '',
            method: e.method || 'card',
            card_id: id,
            id: id,
            card: this.sanitize(e.card),
        });
    },
    sendAdded: function (e) {
        var id = e && e.card && typeof e.card.id !== 'undefined' ? e.card.id : null;
        if (id === null) return;
        httpJSON('POST', '/bookmark/added', {
            where: e.where || '',
            method: e.method || 'card',
            card_id: id,
            id: id,
            card: this.sanitize(e.card),
        });
    },
    sendRemove: function (e) {
        var id = (e && e.card && typeof e.card.id !== 'undefined' ? e.card.id : (e && e.id));
        if (typeof id === 'undefined' || id === null) return;
        httpJSON('POST', '/bookmark/remove', {
            where: e.where || '',
            method: e.method || 'card',
            card_id: id,
            id: id,
            card: this.sanitize(e.card),
        });
    },

    pull: function () {
        var self = this;
        httpJSON('GET', '/bookmark/list', null, function (json) {
            if (!json || json.dbInNotInitialization) return;
            self.applyServerSet(json);
        });
    },

    applyServerSet: function (data) {
        // data is { card: [...], history: [...], like: [...], ... }.
        // Translate into the localStorage 'favorite' shape used by Lampa.
        if (!data) return;
        var fav = {};
        try {
            var raw = localStorage.getItem('favorite');
            fav = raw ? (JSON.parse(raw) || {}) : {};
        } catch (e) { fav = {}; }

        Object.keys(data).forEach(function (k) {
            if (k === 'success' || k === 'dbInNotInitialization') return;
            fav[k] = data[k];
        });
        try { localStorage.setItem('favorite', JSON.stringify(fav)); } catch (e) { /* quota */ }
    },
};

// Timecodes (replaces timecode.js)
var Timecodes = {
    enabled: function () { return pref('timecodes'); },
    bound: false,
    bind: function () {
        if (this.bound) return;
        this.bound = true;
        var self = this;
        if (!Lampa.Timeline || !Lampa.Timeline.listener) return;
        Lampa.Timeline.listener.follow('update', function (e) {
            if (!self.enabled()) return;
            self.add(e);
        });
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' && self.enabled()) self.pullForCurrent();
        });
        Lampa.Listener.follow('lampac', function (e) {
            if (e.type === 'timecode_pullFromServer' && self.enabled()) self.pullForCurrent();
        });
    },
    cardID: function () {
        var act = Lampa.Storage.get('activity', '{}');
        var card = (act && (act.movie || act.card)) || { id: 0 };
        return (card.id || 0) + '_' + (card.name ? 'tv' : 'movie');
    },
    add: function (e) {
        var id = e && e.data && e.data.hash;
        var payload = e && e.data && e.data.road;
        if (!id || !payload) return;
        var u = '/timecode/add?card_id=' + encodeURIComponent(this.cardID());
        // Server expects form-encoded id/data — keep classic behaviour.
        var form = 'id=' + encodeURIComponent(id) + '&data=' + encodeURIComponent(JSON.stringify(payload));
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url(u), true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(form);
    },
    pullForCurrent: function () {
        var u = '/timecode/all?card_id=' + encodeURIComponent(this.cardID());
        httpJSON('GET', u, null, function (json) {
            if (!json) return;
            var account = Lampa.Storage.get('account', '{}');
            var fname = 'file_view' + (account.profile ? '_' + account.profile.id : '');
            var viewed = Lampa.Storage.cache(fname, 10000, {});
            Object.keys(json).forEach(function (i) {
                try {
                    var t = JSON.parse(json[i]);
                    if (!t || typeof t !== 'object') return;
                    viewed[i] = t;
                    if (typeof viewed[i].duration === 'undefined') viewed[i].duration = 0;
                    if (typeof viewed[i].time === 'undefined') viewed[i].time = 0;
                    if (typeof viewed[i].percent === 'undefined') viewed[i].percent = 0;
                    delete viewed[i].hash;
                } catch (e) { /* corrupt entry — ignore */ }
            });
            Lampa.Storage.set(fname, viewed, true);
        });
    },
};

// Generic localStorage-blob sync — for view history, torrents, search history,
// installed plugins. Each blob is one /storage/{set,get} path. We push on
// localStorage change events (Lampa.Storage.listener) and pull on app load.
function makeBlobSync(domainPref, storagePath, lsKeys) {
    return {
        enabled: function () { return pref(domainPref); },
        bound: false,
        debounce: 0,
        bind: function () {
            if (this.bound) return;
            this.bound = true;
            var self = this;
            if (Lampa.Storage.listener && Lampa.Storage.listener.follow) {
                Lampa.Storage.listener.follow('change', function (e) {
                    if (!self.enabled()) return;
                    if (lsKeys.indexOf(e.name) === -1) return;
                    self.scheduleFlush();
                });
            }
        },
        scheduleFlush: function () {
            var self = this;
            if (self.debounce) clearTimeout(self.debounce);
            self.debounce = setTimeout(function () { self.flush(); }, 1500);
        },
        flush: function () {
            // Bundle all lsKeys into one JSON object so we make one /storage
            // request per domain, not one per key.
            var bundle = {};
            lsKeys.forEach(function (k) {
                try {
                    var v = localStorage.getItem(k);
                    if (v !== null) bundle[k] = v;
                } catch (e) { /* ignore */ }
            });
            var body = JSON.stringify(bundle);
            // Use raw XHR; Lampa.Reguest can't send raw string body. Mirror
            // the X-Alpac-Profile-Session header from httpJSON so the
            // server can identify the user when Set-Cookie was eaten by
            // the Lampa Android WebView.
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url('/storage/set?path=' + storagePath), true);
            xhr.withCredentials = true;
            var sessTok3 = getProfileSessionToken();
            if (sessTok3) xhr.setRequestHeader('X-Alpac-Profile-Session', sessTok3);
            var lampTok3 = getAlpacToken();
            if (lampTok3) xhr.setRequestHeader('X-Alpac-Token', lampTok3);
            xhr.send(body);
        },
        pull: function () {
            var self = this;
            httpJSON('GET', '/storage/get?path=' + storagePath, null, function (j) {
                if (!j || !j.data) return;
                try {
                    var bundle = JSON.parse(j.data);
                    Object.keys(bundle).forEach(function (k) {
                        if (lsKeys.indexOf(k) === -1) return;
                        var raw = bundle[k];
                        if (typeof raw !== 'string') return;
                        // We persist values as the raw JSON-stringified
                        // strings that Lampa.Storage wrote into
                        // localStorage. To make Lampa SEE the pulled
                        // data, we must go through Storage.set so the
                        // in-memory `readed[]` cache is updated as well.
                        // localStorage.setItem alone leaves the cache
                        // stale and Storage.get keeps returning the old
                        // value (this was the "history doesn't sync" bug).
                        var parsed = raw;
                        try {
                            var c = raw.charAt(0);
                            if (c === '[' || c === '{') parsed = JSON.parse(raw);
                            else if (raw === 'true' || raw === 'false') parsed = (raw === 'true');
                        } catch (e) { /* not JSON — write as string */ }
                        try {
                            // nolisten=true — otherwise this triggers
                            // our own change-listener and starts a
                            // push-pull bounce loop.
                            if (Lampa && Lampa.Storage && typeof Lampa.Storage.set === 'function') {
                                Lampa.Storage.set(k, parsed, true);
                            } else {
                                localStorage.setItem(k, raw);
                            }
                        } catch (e) { /* quota or strange Lampa shape */ }
                    });
                } catch (e) { /* corrupt blob — ignore */ }
            });
        },
    };
}

var ViewHistory = makeBlobSync('history', 'sync_view', [
    'online_view', 'online_last_balanser', 'online_watched_last',
    'recomends_list', 'recomends_list_history',
]);
var Torrents = makeBlobSync('torrents', 'sync_torrents', [
    'torrents_view', 'torrents_filter_data',
]);
var SearchHistory = makeBlobSync('search', 'search_history', [
    // Lampa's main app stores recent searches under these keys depending on
    // version. We sync both — whichever the current app uses, the other
    // is harmless dead data.
    'search_recent', 'search_history',
]);
var PluginsList = makeBlobSync('plugins', 'sync_plugins', [
    'plugins',
]);

// Full backup: dump/restore the entire localStorage. Manual, not on a timer.
var FullBackup = {
    save: function (onDone, onFail) {
        var dump = {};
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k) continue;
                // Skip our own session cookie shadows and ephemeral keys.
                if (k.indexOf('lampac_psync_') === 0) continue;
                dump[k] = localStorage.getItem(k);
            }
        } catch (e) { /* ignore */ }
        var body = JSON.stringify(dump);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url('/storage/set?path=backup'), true);
        xhr.withCredentials = true;
        // Same header dance as httpJSON: Android WebView eats Set-Cookie
        // on XHR responses, so storage requests need the profile-session
        // token as an explicit header for the user identity to follow
        // through to resolveStoragePath.
        var sessTok2 = getProfileSessionToken();
        if (sessTok2) xhr.setRequestHeader('X-Alpac-Profile-Session', sessTok2);
        var lampTok2 = getAlpacToken();
        if (lampTok2) xhr.setRequestHeader('X-Alpac-Token', lampTok2);
        // No Content-Type — storage handler reads body as raw bytes and a
        // JSON content-type would mislead intermediaries (some hosts
        // intercept JSON bodies for inspection and choke on long dumps).
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            // Storage handler returns 200 even on logical errors (with
            // {"success":false, "msg":"<slug>"}). Distinguish the cases so
            // the toast can show *what* went wrong instead of the
            // un-actionable "Error (200)".
            var slug = '';
            var ok = false;
            try {
                var j = JSON.parse(xhr.responseText || '{}');
                ok = !!j.success;
                if (!ok) slug = j.msg || j.error || '';
            } catch (e) { /* response not JSON */ }
            if (ok) { if (onDone) onDone(); return; }
            // 413 Payload Too Large doesn't reach our handler — it's
            // emitted by the reverse proxy (nginx default
            // client_max_body_size is 1m). Surface a *specific* slug so
            // the toast can tell the admin to bump the limit instead of
            // showing "Error (413)".
            if (xhr.status === 413) {
                if (onFail) onFail('too_large_proxy');
                return;
            }
            if (onFail) {
                // Report the storage-layer reason if we have one; otherwise
                // fall back to the HTTP status. xhr.status==0 ⇒ network
                // error (offline, CORS preflight rejected, …).
                onFail(slug || xhr.status || 'network');
            }
        };
        xhr.send(body);
    },
    restore: function (onDone, onFail) {
        httpJSON('GET', '/storage/get?path=backup', null, function (j) {
            if (!j || !j.data) { if (onFail) onFail('nodata'); return; }
            try {
                var data = JSON.parse(j.data);
                Object.keys(data).forEach(function (k) {
                    try { localStorage.setItem(k, data[k]); } catch (e) { /* quota */ }
                });
                if (onDone) onDone();
            } catch (e) {
                if (onFail) onFail('parse');
            }
        }, function (_, status) { if (onFail) onFail(status); });
    },
};

// ----------------------------------------------------------------------
//  WS bridge — listen to lwsEvent for cross-device pushes
// ----------------------------------------------------------------------

function bindWS() {
    document.addEventListener('lwsEvent', function (ev) {
        if (!ev || !ev.detail) return;
        var name = ev.detail.name;
        var data = ev.detail.data;

        if (name === 'bookmark' && Bookmarks.enabled()) {
            try {
                var ob = JSON.parse(data);
                if (ob.profile_id && ob.profile_id !== Lampa.Storage.get('lampac_profile_id', '')) return;
                if (ob.type === 'set' && ob.data) {
                    Bookmarks.applyServerSet(ob.data);
                } else if ((ob.type === 'add' || ob.type === 'remove') && Lampa.Favorite) {
                    var rows = Array.isArray(ob.data) ? ob.data : [ob.data];
                    rows.forEach(function (item) {
                        if (item && item.card) {
                            item.card.received = true;
                            Lampa.Favorite[ob.type](item.where, item.card);
                        }
                    });
                }
            } catch (e) { /* malformed payload — ignore */ }
        } else if (name === 'timecode' && Timecodes.enabled()) {
            // Push the new timecode into the local cache without forcing a
            // full /timecode/all roundtrip — that would amplify NWS traffic.
            try {
                var t = JSON.parse(data);
                if (!t || !t.card_id || !t.id) return;
                var account = Lampa.Storage.get('account', '{}');
                var fname = 'file_view' + (account.profile ? '_' + account.profile.id : '');
                var viewed = Lampa.Storage.cache(fname, 10000, {});
                try {
                    viewed[t.id] = JSON.parse(t.data);
                    Lampa.Storage.set(fname, viewed, true);
                } catch (e) { /* invalid timecode payload */ }
            } catch (e) { /* ignore */ }
        }
    });
}

// ----------------------------------------------------------------------
//  Profile state — kept in module memory so the settings UI reflects login
// ----------------------------------------------------------------------

var profileState = { authenticated: false, auth_method: 'none', username: '' };

// Reference to the rendered status row so callbacks (login, logout,
// switch-profile, …) can repaint its description text without waiting
// for the settings screen to be reopened. We capture it in onRender of
// the status param in buildSettings.
var profileStatusItem = null;

function repaintProfileStatus() {
    if (!profileStatusItem) return;
    try {
        profileStatusItem.find('.settings-param__descr').text(profileStatusLine());
    } catch (e) { /* DOM shape changed in a Lampa update — ignore */ }
}

function refreshProfileState(cb) {
    Profile.me(function (resp) {
        profileState.authenticated = !!(resp && resp.authenticated);
        profileState.auth_method = (resp && resp.auth_method) || 'none';
        profileState.username = (resp && resp.username) || '';
        repaintProfileStatus();
        if (cb) cb(profileState);
    });
}

function profileStatusLine() {
    var base;
    if (!profileState.authenticated) base = Lampa.Lang.translate('syncpro_profile_status_anon');
    else if (profileState.auth_method === 'telegram') base = Lampa.Lang.translate('syncpro_profile_status_tg');
    else if (profileState.auth_method === 'profile')
        base = Lampa.Lang.translate('syncpro_profile_status_prof').replace('{name}', profileState.username || '?');
    else base = Lampa.Lang.translate('syncpro_profile_status_anon');

    // Append the *active* sub-profile name when one is selected. This is
    // the per-device `lampac_profile_id` — distinct from the auth identity.
    // Without surfacing it, two devices belonging to the same TG user can
    // silently drift if they happen to have different profiles selected
    // (a recurring "sync isn't working" report). The friendly name is
    // cached in lampac_profile_name when the user picks via the switch
    // sheet; we fall back to the raw ID otherwise.
    try {
        var pid = Lampa.Storage.get('lampac_profile_id', '');
        if (pid) {
            var pname = Lampa.Storage.get('lampac_profile_name', '') || pid;
            base += ' • ' + Lampa.Lang.translate('syncpro_active_profile').replace('{name}', pname);
        }
    } catch (e) { /* Storage not ready */ }
    return base;
}

// ----------------------------------------------------------------------
//  Login / register / sync-code dialogs
// ----------------------------------------------------------------------

function inputForm(title, fields, onSubmit) {
    // Two-field input via Lampa.Activity 'category_input' is overkill. Use a
    // sequence of single-field Lampa.Input prompts — that's how Lampa's own
    // CUB sign-in handles it (see app.min.js account_profile_name flow).
    var values = {};
    var idx = 0;
    function next() {
        if (idx >= fields.length) {
            onSubmit(values);
            return;
        }
        var f = fields[idx++];
        // Compose the prompt label as "Action / Field". Lampa shows `title`
        // above the on-screen keyboard, so without it the user sees an
        // empty input and has no way to know what's being asked for
        // (which was the "Появляются текстовые поля, которые не подписаны"
        // bug report).
        var promptTitle = title ? (title + ' — ' + f.label) : f.label;
        Lampa.Input.edit({
            title: promptTitle,
            value: '',
            free: true,
            nosave: true,
            nomic: true,
        }, function (v) {
            values[f.key] = v || '';
            next();
        });
    }
    next();
}

function doRegister() {
    inputForm(Lampa.Lang.translate('syncpro_profile_register'), [
        { key: 'username', label: Lampa.Lang.translate('syncpro_field_username') },
        { key: 'password', label: Lampa.Lang.translate('syncpro_field_password') },
    ], function (vals) {
        if (!vals.username || !vals.password) return;
        Lampa.Loading.start();
        Profile.register(vals.username, vals.password,
            function (resp) {
                Lampa.Loading.stop();
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_register_ok'));
                refreshProfileState();
                pullAll();
            },
            function (resp, status) {
                Lampa.Loading.stop();
                Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
            }
        );
    });
}

function doLogin() {
    inputForm(Lampa.Lang.translate('syncpro_profile_login'), [
        { key: 'username', label: Lampa.Lang.translate('syncpro_field_username') },
        { key: 'password', label: Lampa.Lang.translate('syncpro_field_password') },
    ], function (vals) {
        if (!vals.username || !vals.password) return;
        Lampa.Loading.start();
        Profile.login(vals.username, vals.password,
            function (resp) {
                Lampa.Loading.stop();
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_login_ok'));
                refreshProfileState();
                pullAll();
            },
            function (resp, status) {
                Lampa.Loading.stop();
                Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
            }
        );
    });
}

function doLogout() {
    Lampa.Loading.start();
    Profile.logout(function () {
        Lampa.Loading.stop();
        // Drop the cached session token regardless of whether the server
        // call succeeded — locally we want to be signed out either way.
        setProfileSessionToken('');
        Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_logout_ok'));
        refreshProfileState();
    });
}

function doChangePassword() {
    inputForm(Lampa.Lang.translate('syncpro_profile_chgpass'), [
        { key: 'old', label: Lampa.Lang.translate('syncpro_field_password_old') },
        { key: 'new', label: Lampa.Lang.translate('syncpro_field_password_new') },
    ], function (vals) {
        if (!vals.old || !vals.new) return;
        Lampa.Loading.start();
        Profile.changePassword(vals.old, vals.new,
            function () {
                Lampa.Loading.stop();
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_chgpass_ok'));
            },
            function (resp, status) {
                Lampa.Loading.stop();
                Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
            }
        );
    });
}

function doIssueSyncCode() {
    Lampa.Loading.start();
    Profile.issueCode(
        function (resp) {
            Lampa.Loading.stop();
            var msg = Lampa.Lang.translate('syncpro_msg_sync_code').replace('{code}', resp.code);
            Lampa.Noty.show(msg, 15000);
        },
        function (resp, status) {
            Lampa.Loading.stop();
            Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
        }
    );
}

// PIN login entrypoint — the user types their profile name and the PIN that
// was assigned in the TG bot (/profiles → Set PIN). Server returns the same
// session cookie shape as register/login. Designed for TV remotes: PIN is
// digits-only and we don't ask for the password.
function doPinLogin() {
    inputForm(Lampa.Lang.translate('syncpro_profile_pin_login'), [
        { key: 'username', label: Lampa.Lang.translate('syncpro_field_username') },
        { key: 'pin',      label: Lampa.Lang.translate('syncpro_field_pin') },
    ], function (vals) {
        if (!vals.username || !vals.pin) return;
        Lampa.Loading.start();
        Profile.pinLogin(vals.username, vals.pin,
            function () {
                Lampa.Loading.stop();
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_login_ok'));
                refreshProfileState();
                pullAll();
            },
            function (resp, status) {
                Lampa.Loading.stop();
                Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
            }
        );
    });
}

function doRedeemSyncCode() {
    inputForm(Lampa.Lang.translate('syncpro_profile_sync_redeem'), [
        { key: 'code', label: Lampa.Lang.translate('syncpro_field_code') },
    ], function (vals) {
        if (!vals.code) return;
        Lampa.Loading.start();
        Profile.redeemCode(vals.code,
            function () {
                Lampa.Loading.stop();
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_login_ok'));
                refreshProfileState();
                pullAll();
            },
            function (resp, status) {
                Lampa.Loading.stop();
                Lampa.Noty.show(errorMessageFromSlug(resp && resp.error, status));
            }
        );
    });
}

// ----------------------------------------------------------------------
//  Pull everything that's enabled — used after login / on app load / on
//  manual "Pull now" action.
// ----------------------------------------------------------------------

function pullAll() {
    if (Bookmarks.enabled()) Bookmarks.pull();
    if (Timecodes.enabled()) Timecodes.pullForCurrent();
    if (ViewHistory.enabled()) ViewHistory.pull();
    if (Torrents.enabled()) Torrents.pull();
    if (SearchHistory.enabled()) SearchHistory.pull();
    if (PluginsList.enabled()) PluginsList.pull();
}

// ----------------------------------------------------------------------
//  Settings UI
// ----------------------------------------------------------------------

var SVG_ICON = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9c2.7 0 5.1 1.2 6.8 3" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="21 4 21 9 16 9" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function addToggle(domain, label) {
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { name: 'syncpro_' + domain, type: 'trigger', default: true },
        field: { name: label, description: '' },
        onChange: function () {
            // No-op — readers consult pref() at event time.
        },
    });
}

function addButton(name, onClick) {
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { type: 'button' },
        field: { name: name },
        onChange: onClick,
    });
}

// Lampa setting sheets — open a contextual Lampa.Select. Action handlers
// run on item.onSelect; the sheet auto-closes. We always pass an onBack
// that returns control to settings_component so the focus chain doesn't
// dead-end.
function openSheet(title, items) {
    Lampa.Select.show({
        title: title,
        items: items,
        onBack: function () { Lampa.Controller.toggle('settings_component'); },
        onSelect: function (a) {
            if (a && typeof a.action === 'function') a.action();
        },
    });
}

// Profile management sheet — contextual on auth state.
// - anon    → register / login / PIN / redeem code
// - tg      → friendly note "TG users don't need this"; the only real
//             action is logout-of-TG which is owned by the lampac TG plugin
// - profile → issue code / change password / logout
// currentActiveProfileLabel — short description of which Lampa profile is
// active on THIS device. The active profile_id is stored as a plain string
// in Lampa.Storage; the label shown to the user is cached in a parallel
// key so we don't have to round-trip /api/profile/owned just to render the
// "active: X" subtitle. The cache is updated whenever the user picks an
// item in openSwitchProfileSheet.
function currentActiveProfileLabel() {
    var pid = String(Lampa.Storage.get('lampac_profile_id', '') || '');
    if (!pid) return Lampa.Lang.translate('syncpro_active_default');
    var name = String(Lampa.Storage.get('lampac_profile_name', '') || pid);
    return Lampa.Lang.translate('syncpro_active_profile').replace('{name}', name);
}

// openSwitchProfileSheet — sheet that lists owned profiles + "Default
// (TG)" and lets the user pick one. Selection writes localStorage and
// re-pulls. The list is fetched fresh each time; we don't cache because
// the user may have just created a new profile via /bkit and want to
// see it immediately.
function openSwitchProfileSheet() {
    Lampa.Noty.show(Lampa.Lang.translate('syncpro_profile_loading'));
    Profile.listOwned(function (resp) {
        var owned = (resp && resp.profiles) || [];
        var activeId = String(Lampa.Storage.get('lampac_profile_id', '') || '');

        var items = [];
        // "Default (TG)" — empty profile_id, data lives under the bare
        // tg:<id> bucket on the server. This is the entry point for new
        // installs and the way to "reset" back to shared state.
        items.push({
            title: (activeId === '' ? '✓ ' : '  ') + Lampa.Lang.translate('syncpro_profile_default'),
            action: function () {
                Lampa.Storage.set('lampac_profile_id', '');
                Lampa.Storage.set('lampac_profile_name', '');
                Lampa.Noty.show(Lampa.Lang.translate('syncpro_switched'));
                pullAll();
            },
        });
        if (!owned.length) {
            items.push({
                title: Lampa.Lang.translate('syncpro_profile_none_owned'),
            });
        } else {
            owned.forEach(function (sp) {
                var on = sp.id === activeId;
                items.push({
                    title: (on ? '✓ ' : '  ') + sp.username + (sp.has_pin ? ' 🔑' : ''),
                    action: function () {
                        Lampa.Storage.set('lampac_profile_id', sp.id);
                        Lampa.Storage.set('lampac_profile_name', sp.username);
                        Lampa.Noty.show(Lampa.Lang.translate('syncpro_switched'));
                        // Pull immediately so the user sees the new
                        // profile's bookmarks/timecodes without having
                        // to navigate away and back. pullAll() honors
                        // the new lampac_profile_id via url() helper.
                        pullAll();
                    },
                });
            });
        }

        openSheet(Lampa.Lang.translate('syncpro_switch_profile'), items);
    }, function () {
        // 401 / network error — owned-list isn't available. The user is
        // probably anon despite refreshProfileState saying telegram; race
        // between cookie reset and our cached state. Soft-fail with a
        // toast instead of opening an empty sheet.
        Lampa.Noty.show(Lampa.Lang.translate('syncpro_err_generic').replace('{code}', '401'));
    });
}

function openProfileSheet() {
    refreshProfileState(function (st) {
        var items = [];
        if (st.authenticated && st.auth_method === 'profile') {
            items.push({
                title: Lampa.Lang.translate('syncpro_profile_sync_issue'),
                action: doIssueSyncCode,
            });
            items.push({
                title: Lampa.Lang.translate('syncpro_profile_chgpass'),
                action: doChangePassword,
            });
            items.push({
                title: Lampa.Lang.translate('syncpro_profile_logout'),
                action: doLogout,
            });
        } else if (st.authenticated && st.auth_method === 'telegram') {
            // TG-authenticated users treat profiles as a *sub-identity* of
            // their TG account (Netflix-style "Дети / Жена / Я"). The
            // primary identity stays tg:<id>; each profile is just a key
            // (lampac_profile_id) that segments bookmarks/timecodes/etc.
            // server-side via the profile_id/pathfile query params.
            items.push({
                title: Lampa.Lang.translate('syncpro_switch_profile'),
                action: openSwitchProfileSheet,
                subtitle: currentActiveProfileLabel(),
            });
        } else {
            // Anonymous (or expired session): show all four entry points.
            items.push({ title: Lampa.Lang.translate('syncpro_profile_register'),    action: doRegister });
            items.push({ title: Lampa.Lang.translate('syncpro_profile_login'),       action: doLogin });
            items.push({ title: Lampa.Lang.translate('syncpro_profile_pin_login'),   action: doPinLogin });
            items.push({ title: Lampa.Lang.translate('syncpro_profile_sync_redeem'), action: doRedeemSyncCode });
        }
        openSheet(Lampa.Lang.translate('syncpro_open_profile_mgmt'), items);
    });
}

// Domain toggle sheet — each tap flips the storage flag and re-shows the
// sheet so the user sees the new state without leaving.
var DOMAIN_DEFS = [
    { key: 'bookmarks', label: 'syncpro_dom_bookmarks' },
    { key: 'timecodes', label: 'syncpro_dom_timecodes' },
    { key: 'history',   label: 'syncpro_dom_history' },
    { key: 'torrents',  label: 'syncpro_dom_torrents' },
    { key: 'search',    label: 'syncpro_dom_search' },
    { key: 'plugins',   label: 'syncpro_dom_plugins' },
];

function domainsSummary() {
    var on = 0;
    DOMAIN_DEFS.forEach(function (d) { if (pref(d.key, true)) on++; });
    return Lampa.Lang.translate('syncpro_summary_domains')
        .replace('{n}', on).replace('{total}', DOMAIN_DEFS.length);
}

function openDomainsSheet() {
    var items = DOMAIN_DEFS.map(function (d) {
        var on = pref(d.key, true);
        return {
            title: (on ? '✓ ' : '✗ ') + Lampa.Lang.translate(d.label),
            action: function () {
                Lampa.Storage.set('syncpro_' + d.key, !on);
                // Re-open so the user sees the new check state immediately.
                openDomainsSheet();
            },
        };
    });
    openSheet(Lampa.Lang.translate('syncpro_open_domains'), items);
}

function openActionsSheet() {
    var items = [
        {
            title: Lampa.Lang.translate('syncpro_action_force_pull'),
            action: function () {
                Lampa.Loading.start();
                pullAll();
                setTimeout(function () {
                    Lampa.Loading.stop();
                    Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_pulled'));
                }, 1500);
            },
        },
        {
            title: Lampa.Lang.translate('syncpro_action_backup_save'),
            action: function () {
                Lampa.Loading.start();
                FullBackup.save(
                    function () {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_backup_ok'));
                    },
                    function (status) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(Lampa.Lang.translate('syncpro_err_generic').replace('{code}', status || '?'));
                    }
                );
            },
        },
        {
            title: Lampa.Lang.translate('syncpro_action_backup_load'),
            action: function () {
                // Confirmation step — restore overwrites the whole local
                // store, which is too destructive to do on one tap.
                Lampa.Select.show({
                    title: Lampa.Lang.translate('sure'),
                    nomark: true,
                    items: [
                        { title: Lampa.Lang.translate('confirm'), confirm: true, selected: true },
                        { title: Lampa.Lang.translate('cancel') },
                    ],
                    onSelect: function (a) {
                        if (!a.confirm) { openActionsSheet(); return; }
                        Lampa.Loading.start();
                        FullBackup.restore(
                            function () {
                                Lampa.Loading.stop();
                                Lampa.Noty.show(Lampa.Lang.translate('syncpro_msg_backup_restored'));
                                setTimeout(function () { window.location.reload(); }, 2500);
                            },
                            function (status) {
                                Lampa.Loading.stop();
                                Lampa.Noty.show(Lampa.Lang.translate('syncpro_err_generic').replace('{code}', status || '?'));
                            }
                        );
                    },
                    onBack: function () { openActionsSheet(); },
                });
            },
        },
    ];
    openSheet(Lampa.Lang.translate('syncpro_open_actions'), items);
}

// Build the compact Settings → Sync page. Three rows total:
//   1. Profile status (static, live-updated)
//   2. Profile management        (opens Lampa.Select)
//   3. What to sync (X of N)     (opens Lampa.Select with toggles)
//   4. Actions                   (opens Lampa.Select with pull/backup)
//
// The previous flat layout had ~19 rows; consolidating action-style entries
// behind a single sheet collapses that to four and matches the look of
// Lampa's own "Mirror / Source" pickers.
function buildSettings() {
    Lampa.SettingsApi.addComponent({
        component: 'syncpro',
        icon: SVG_ICON,
        name: Lampa.Lang.translate('syncpro_title'),
    });

    // -- profile status (live) --
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { type: 'static' },
        field: {
            name: Lampa.Lang.translate('syncpro_section_profile'),
            description: profileStatusLine(),
        },
        onRender: function (item) {
            // Cache the row jQuery handle so async events (login, logout,
            // switch-profile) can call repaintProfileStatus() and update
            // the description text in-place without needing the user to
            // close-and-reopen the settings screen.
            profileStatusItem = item;
            refreshProfileState();
        },
    });

    // -- profile actions (contextual) --
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { type: 'button' },
        field: {
            name: Lampa.Lang.translate('syncpro_open_profile_mgmt'),
            description: '',
        },
        onChange: openProfileSheet,
    });

    // -- what to sync (live summary in description) --
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { type: 'button' },
        field: {
            name: Lampa.Lang.translate('syncpro_open_domains'),
            description: domainsSummary(),
        },
        onRender: function (item) {
            // Refresh "X of N enabled" on every render so the user sees
            // changes immediately after closing the toggle sheet.
            try { item.find('.settings-param__descr').text(domainsSummary()); } catch (e) { /* ignore */ }
        },
        onChange: openDomainsSheet,
    });

    // -- actions (pull / backup) --
    Lampa.SettingsApi.addParam({
        component: 'syncpro',
        param: { type: 'button' },
        field: {
            name: Lampa.Lang.translate('syncpro_open_actions'),
            description: '',
        },
        onChange: openActionsSheet,
    });
}

// ----------------------------------------------------------------------
//  Boot
// ----------------------------------------------------------------------

function whenReady(callback) {
    if (typeof window === 'undefined') return;
    if (window.Lampa && Lampa.Favorite && Lampa.Storage && Lampa.SettingsApi && Lampa.Listener && Lampa.Utils) {
        callback();
    } else {
        setTimeout(function () { whenReady(callback); }, 500);
    }
}

function start() {
    loadLang();
    buildSettings();
    refreshProfileState();

    Bookmarks.bind();
    Timecodes.bind();
    ViewHistory.bind();
    Torrents.bind();
    SearchHistory.bind();
    PluginsList.bind();

    bindWS();

    // Initial server pull — runs after Lampa is fully ready so cards exist
    // when bookmark.applyServerSet writes 'favorite'.
    Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
            pullAll();
        }
    });

    // The WS hub lives in invc-ws.js (already loaded by /sync.js). When the
    // server admin disables sync.js, ensure we still attempt to load it so
    // syncpro's WS bridge has events to listen to. Safe to call twice —
    // putScript de-dupes.
    if (Lampa.Utils && Lampa.Utils.putScript) {
        try {
            Lampa.Utils.putScript([url('/invc-ws.js')], function () {}, function () {});
        } catch (e) { /* not all Lampa builds expose putScript */ }
    }
}

whenReady(start);

})();
