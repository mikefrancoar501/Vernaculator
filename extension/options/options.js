const $ = (id) => document.getElementById(id);
const t = (key, fallback) => chrome.i18n.getMessage(key) || fallback;

// Languages offered as an override. The default ("auto") follows the browser's language.
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'hi', 'bn', 'zh', 'ja', 'ko', 'vi', 'id', 'tl', 'sw'];

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, el.textContent);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder, '');

const uiLang = chrome.i18n.getUILanguage();
const names = new Intl.DisplayNames([uiLang], { type: 'language' });
const label = (code) => {
  try {
    const n = names.of(code);
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch {
    return code;
  }
};
$('language').append(
  new Option(t('optLanguageAuto', 'Same as this browser ($1)').replace('$1', label(uiLang)), 'auto'),
  ...LANGS.map((c) => new Option(label(c), c)),
);

const fields = ['backendUrl', 'token', 'autoRead', 'userName', 'aboutMe', 'ageGroup', 'language'];
chrome.storage.local.get(fields).then((s) => {
  $('backendUrl').value = s.backendUrl || 'http://localhost:8787';
  $('token').value = s.token || '';
  $('autoRead').checked = s.autoRead !== false;
  $('userName').value = s.userName || '';
  $('aboutMe').value = s.aboutMe || '';
  $('ageGroup').value = s.ageGroup || '';
  $('language').value = s.language || 'auto';
});

$('save').addEventListener('click', async () => {
  const backendUrl = $('backendUrl').value.trim().replace(/\/+$/, '');
  const status = $('status');
  status.textContent = t('optChecking', 'Checking...');
  if (/^https:\/\//.test(backendUrl)) {
    // Must run inside the click gesture, before other awaits.
    await chrome.permissions.request({ origins: [`${new URL(backendUrl).origin}/*`] }).catch(() => false);
  }
  await chrome.storage.local.set({
    backendUrl,
    token: $('token').value.trim(),
    autoRead: $('autoRead').checked,
    userName: $('userName').value.trim().slice(0, 40),
    aboutMe: $('aboutMe').value.trim().slice(0, 600),
    ageGroup: $('ageGroup').value,
    language: $('language').value,
  });
  try {
    const res = await fetch(`${backendUrl}/v1/usage`, { headers: { Authorization: `Bearer ${$('token').value.trim()}` } });
    if (res.status === 401) throw new Error('token rejected');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const u = await res.json();
    status.textContent = `${t('optSaved', 'Saved.')} ${u.remainingChars.toLocaleString()} (${u.plan})`;
  } catch (err) {
    status.textContent = `${t('optSaved', 'Saved.')} (${err.message})`;
  }
});
