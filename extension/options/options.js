const fields = ['backendUrl', 'token', 'autoRead'];
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(fields).then((s) => {
  $('backendUrl').value = s.backendUrl || 'http://localhost:8787';
  $('token').value = s.token || '';
  $('autoRead').checked = s.autoRead !== false;
});

$('save').addEventListener('click', async () => {
  const backendUrl = $('backendUrl').value.trim().replace(/\/+$/, '');
  const status = $('status');
  status.textContent = 'Checking...';
  if (/^https:\/\//.test(backendUrl)) {
    // Must run inside the click gesture, before other awaits.
    await chrome.permissions.request({ origins: [`${new URL(backendUrl).origin}/*`] }).catch(() => false);
  }
  await chrome.storage.local.set({ backendUrl, token: $('token').value.trim(), autoRead: $('autoRead').checked });
  try {
    const res = await fetch(`${backendUrl}/v1/usage`, { headers: { Authorization: `Bearer ${$('token').value.trim()}` } });
    if (res.status === 401) throw new Error('token rejected');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const u = await res.json();
    status.textContent = `Saved. Connected: ${u.remainingChars.toLocaleString()} characters left this month (${u.plan}).`;
  } catch (err) {
    status.textContent = `Saved, but could not verify: ${err.message}`;
  }
});
