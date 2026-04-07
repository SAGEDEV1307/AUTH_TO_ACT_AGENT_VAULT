// Shared auth helpers used by all dashboard pages
'use strict';

function getToken() { return localStorage.getItem('ata_token'); }
function setToken(t) { localStorage.setItem('ata_token', t); }
function clearToken() { localStorage.removeItem('ata_token'); }

function logout() {
  clearToken();
  window.location.href = '/';
}

async function apiFetch(path, token, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}

function requireAuth(callback) {
  const token = getToken();
  if (!token) { window.location.href = '/'; return; }
  fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ user }) => {
      const el = document.getElementById('user-name');
      if (el) el.textContent = user.name || user.email;
      callback(token, user);
    })
    .catch(() => { clearToken(); window.location.href = '/'; });
}

// Handle auth callback — exchanges code for token via server
if (window.location.pathname === '/auth/callback') {
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: window.location.origin + '/auth/callback' }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.access_token) {
        setToken(data.access_token);
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/?error=auth_failed';
      }
    })
    .catch(() => { window.location.href = '/?error=auth_failed'; });
  }
}
