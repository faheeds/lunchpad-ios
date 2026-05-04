// LunchPad iOS — school-code entry & navigation bridge
// Runs inside the WKWebView on the www/index.html entry screen.

const SCHOOL_KEY = 'lunchpad_school_code';
const BASE_DOMAIN = 'lunchpad.us';

// ── Capacitor plugin references ───────────────────────────────────────────────
// Plugins are available via window.Capacitor.Plugins after the bridge loads.
// We defer access until DOMContentLoaded so the bridge is ready.

let Preferences = null;
let Haptics = null;

// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Grab Capacitor plugins (only available inside the native app, not browser)
  if (window.Capacitor?.Plugins) {
    Preferences = window.Capacitor.Plugins.Preferences;
    Haptics     = window.Capacitor.Plugins.Haptics;
  }

  // Allow Enter key to submit
  document.getElementById('schoolCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openSchool();
  });

  // If the parent already visited a school, go straight there
  const saved = await getSavedCode();
  if (saved) {
    showLoading(`Signing in to ${saved}.${BASE_DOMAIN}…`);
    navigateToSchool(saved);
    return;
  }

  // Show the "Switch school" link if a code is saved but the user triggered
  // the entry screen manually (handled in showSchoolEntry).
  document.getElementById('schoolCode').focus();
});

// ── Actions ───────────────────────────────────────────────────────────────────

async function openSchool() {
  const input = document.getElementById('schoolCode');
  const code  = sanitizeCode(input.value);

  clearError();

  if (!code) {
    showError('Please enter your school code.');
    input.focus();
    return;
  }

  if (Haptics) {
    await Haptics.impact({ style: 'Medium' }).catch(() => {});
  }

  await saveCode(code);
  showLoading(`Opening ${code}.${BASE_DOMAIN}…`);
  navigateToSchool(code);
}

function showSchoolEntry() {
  document.getElementById('loading').classList.remove('visible');
  document.getElementById('schoolCard').style.display = 'block';
  document.getElementById('switchLink').style.display = 'none';
  document.getElementById('schoolCode').value = '';
  document.getElementById('schoolCode').focus();
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigateToSchool(code) {
  // Navigating window.location causes the WKWebView to load the school's
  // subdomain. The web app (Next.js) handles auth from this point.
  window.location.href = `https://${code}.${BASE_DOMAIN}`;
}

// ── Preferences (persistent storage) ─────────────────────────────────────────

async function getSavedCode() {
  if (!Preferences) return null;
  try {
    const { value } = await Preferences.get({ key: SCHOOL_KEY });
    return value || null;
  } catch {
    return null;
  }
}

async function saveCode(code) {
  if (!Preferences) return;
  try {
    await Preferences.set({ key: SCHOOL_KEY, value: code });
  } catch {
    // non-fatal
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function sanitizeCode(raw) {
  // Lowercase, strip anything that isn't a letter, digit, or hyphen
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function showLoading(msg) {
  document.getElementById('loadingMsg').textContent = msg || 'Opening LunchPad…';
  document.getElementById('loading').classList.add('visible');
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearError() {
  const el = document.getElementById('errorMsg');
  el.style.display = 'none';
  el.textContent = '';
}
