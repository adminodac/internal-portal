/* ================================================================
   ODAC Internal Portal -- admin.js
   Phase 2: Admin Dashboard
   Handles: login (Supabase Auth), loading submissions, marking
            channels as posted, marking submissions complete,
            editing expire_date, and social publishing flow.
   ================================================================ */

'use strict';

const TYPE_LABELS = {
  event:        'Event',
  exhibition:   'Exhibition',
  artwork:      'Artwork',
  announcement: 'Announcement',
};

const CHANNEL_LABELS = {
  facebook:  'Facebook',
  website:   'Website',
  instagram: 'Instagram',
};

let db               = null;
let submissionsCache = [];
let filesCache       = {};        // submission_id -> array of file records
const openSocialPanels = new Set(); // ids of cards with the social panel open
const socialDrafts     = {};        // "id:channel" -> unsaved textarea edits

/* -- Bootstrap ------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof supabase === 'undefined') {
    showLoginError('Could not load the required libraries. Please refresh the page.');
    return;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT')) {
    showLoginError('This dashboard is not yet configured. Please contact the developer.');
    return;
  }

  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  db.auth.onAuthStateChange((_event, session) => {
    if (!session) showLoginView();
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await enterDashboard(session.user);
  } else {
    showLoginView();
  }
});

/* == AUTH ====================================================== */
async function handleLogin(e) {
  e.preventDefault();
  clearLoginError();

  const fd       = new FormData(e.target);
  const email    = (fd.get('email')    || '').trim();
  const password = fd.get('password')  || '';

  if (!email || !password)
    return showLoginError('Please enter both your email and password.');

  setLoginLoading(true);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  setLoginLoading(false);

  if (error)
    return showLoginError('We could not log you in. Please check your email and password and try again.');

  await enterDashboard(data.user);
}

async function handleLogout() {
  await db.auth.signOut();
  showLoginView();
}

async function enterDashboard(user) {
  document.getElementById('login-view').hidden = true;
  document.getElementById('dashboard-view').hidden = false;

  const headerUser = document.getElementById('admin-header-user');
  headerUser.hidden = false;
  document.getElementById('user-email').textContent = user.email;

  await loadSubmissions();
}

function showLoginView() {
  document.getElementById('dashboard-view').hidden = true;
  document.getElementById('admin-header-user').hidden = true;
  document.getElementById('login-view').hidden = false;
  document.getElementById('login-form').reset();
}

function setLoginLoading(loading) {
  const btn     = document.getElementById('login-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnSpin = btn.querySelector('.btn-loading');
  btn.disabled   = loading;
  btnText.hidden = loading;
  btnSpin.hidden = !loading;
}

function showLoginError(message) {
  const el = document.getElementById('login-error');
  el.textContent = message;
  el.hidden = false;
}

function clearLoginError() {
  const el = document.getElementById('login-error');
  el.hidden = true;
  el.textContent = '';
}

/* == LOADING SUBMISSIONS ======================================= */
async function loadSubmissions() {
  const list = document.getElementById('submission-list');
  list.innerHTML = '<p class="loading-text">Loading submissions…</p>';

  const { data, error } = await db
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<p class="error-text">Could not load submissions. Please refresh the page.</p>';
    return;
  }

  submissionsCache = data || [];
  await loadFiles();
  renderSubmissions();
}

async function loadFiles() {
  // Needs the authenticated SELECT policy from 05_social_fields.sql.
  // If that migration has not run yet, we simply show no attachments.
  filesCache = {};
  const { data, error } = await db.from('submission_files').select('*');
  if (error || !data) return;
  data.forEach(f => {
    (filesCache[f.submission_id] = filesCache[f.submission_id] || []).push(f);
  });
}

/* == RENDERING ================================================= */
function renderSubmissions() {
  // Keep unsaved social-text edits alive across re-renders.
  document.querySelectorAll('.social-textarea').forEach(t => {
    socialDrafts[t.dataset.id + ':' + t.dataset.channel] = t.value;
  });

  const open   = submissionsCache.filter(s => s.status !== 'closed');
  const closed = submissionsCache.filter(s => s.status === 'closed');

  const openList   = document.getElementById('submission-list');
  const closedList = document.getElementById('completed-list');

  openList.innerHTML = open.length
    ? open.map(renderCard).join('')
    : '<p class="empty-text">No open submissions right now.</p>';

  closedList.innerHTML = closed.length
    ? closed.map(renderCard).join('')
    : '<p class="empty-text">Nothing completed yet.</p>';

  attachCardHandlers();
}

function renderCard(sub) {
  const deadline  = deadlineInfo(sub.created_at);
  const isExpired = sub.expire_date && parseDate(sub.expire_date) < startOfToday();

  /* --- Channel buttons ---------------------------------------- */
  const channelButtons = (sub.publish_to || []).map(channel => {
    const posted = sub['posted_' + channel];
    const label  = CHANNEL_LABELS[channel] || channel;
    return posted
      ? '<span class="channel-done">' + esc(label) + ' ✓ posted</span>'
      : '<button type="button" class="btn-channel" data-id="' + sub.id + '" data-channel="' + channel + '">Mark as posted to ' + esc(label) + '</button>';
  }).join('');

  const completeButton = sub.status !== 'closed'
    ? '<button type="button" class="btn-complete" data-id="' + sub.id + '">Mark as complete</button>'
    : '';

  /* --- expire_date inline editor ------------------------------ */
  const expireValue = sub.expire_date || '';
  const expireEditor =
    '<div class="card-field-row">' +
      '<label class="card-field-label" for="expire-' + sub.id + '">Remove from website after:</label>' +
      '<div class="card-field-inline">' +
        '<input type="date" id="expire-' + sub.id + '" class="card-date-input" ' +
               'data-id="' + sub.id + '" data-field="expire_date" ' +
               'value="' + esc(expireValue) + '">' +
        '<button type="button" class="btn-save-field" ' +
                'data-id="' + sub.id + '" data-field="expire_date" ' +
                'data-source="expire-' + sub.id + '">Save</button>' +
        (expireValue
          ? '<button type="button" class="btn-clear-field" ' +
                    'data-id="' + sub.id + '" data-field="expire_date">Clear</button>'
          : '') +
      '</div>' +
    '</div>';

  return (
    '<div class="submission-card' + (sub.status === 'closed' ? ' is-closed' : '') + '" data-card-id="' + sub.id + '">' +
      (isExpired
        ? '<div class="expire-banner">⚠ Remove from website — expired ' + formatDate(sub.expire_date) + '</div>'
        : '') +
      '<div class="card-top">' +
        '<div class="card-main">' +
          '<div class="card-group">' + esc(sub.group_name) + '</div>' +
          '<div class="card-title">' + esc(sub.title) + '</div>' +
          '<div class="card-meta">' +
            esc(TYPE_LABELS[sub.content_type] || sub.content_type) +
            ' &middot; Received ' + formatDate(sub.created_at) +
            (sub.event_date ? ' &middot; Event on ' + formatDate(sub.event_date) : '') +
          '</div>' +
        '</div>' +
        '<div class="card-deadline ' + deadline.className + '">' + deadline.label + '</div>' +
      '</div>' +
      '<p class="card-description">' + esc(sub.description) + '</p>' +
      expireEditor +
      renderAttachments(sub) +
      '<div class="card-actions">' + channelButtons + completeButton + '</div>' +
      renderSocialSection(sub) +
    '</div>'
  );
}

/* == ATTACHED FILES ============================================= */
function renderAttachments(sub) {
  const files = filesCache[sub.id] || [];
  if (!files.length) return '';

  const items = files.map(f =>
    '<button type="button" class="btn-file" data-path="' + esc(f.storage_path) + '">' +
      'Download ' + esc(f.original_name) +
    '</button>'
  ).join('');

  return '<div class="card-files">' + items + '</div>';
}

async function openFile(path) {
  const { data, error } = await db.storage
    .from('submission-files')
    .createSignedUrl(path, 300);

  if (error || !data) {
    alert('Could not open this file. Please try again, or contact the developer.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

/* == SOCIAL POSTS ("assist, don't automate" — rule R3) ========== */
/* The dashboard PREPARES the post text. The admin copies it and
   pastes it into Facebook/Instagram by hand. Nothing is ever
   published automatically.                                        */

function renderSocialSection(sub) {
  if (sub.status === 'closed') return '';

  const channels = (sub.publish_to || []).filter(c => c === 'facebook' || c === 'instagram');
  if (!channels.length) return '';

  // The social columns arrive with SELECT * only after migration
  // 05_social_fields.sql has run. Until then, show a plain notice.
  if (!('facebook_text' in sub)) {
    return '<div class="social-section"><p class="social-note">' +
      'The social post editor needs a database update (05_social_fields.sql) before it can be used.' +
      '</p></div>';
  }

  const isOpen = openSocialPanels.has(sub.id);

  const editors = channels.map(channel => {
    const label    = CHANNEL_LABELS[channel];
    const draftKey = sub.id + ':' + channel;
    const value    = (draftKey in socialDrafts)
      ? socialDrafts[draftKey]
      : (sub[channel + '_text'] || suggestedSocialText(sub));
    return (
      '<div class="social-editor">' +
        '<label class="social-editor-label" for="social-' + channel + '-' + sub.id + '">' +
          esc(label) + ' post text</label>' +
        '<textarea id="social-' + channel + '-' + sub.id + '" class="social-textarea" rows="8" ' +
          'data-id="' + sub.id + '" data-channel="' + channel + '">' + esc(value) + '</textarea>' +
        '<div class="social-editor-actions">' +
          '<button type="button" class="btn-social-copy" data-id="' + sub.id + '" data-channel="' + channel + '">' +
            'Copy the ' + esc(label) + ' text</button>' +
          '<button type="button" class="btn-social-save" data-id="' + sub.id + '" data-channel="' + channel + '">' +
            'Save this ' + esc(label) + ' text</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="social-section">' +
      '<button type="button" class="btn-social-toggle" data-id="' + sub.id + '">' +
        (isOpen ? 'Hide the social media posts' : 'Prepare the social media posts') +
      '</button>' +
      '<div class="social-panel"' + (isOpen ? '' : ' hidden') + '>' +
        '<p class="social-help">Edit the text below if you want, click "Copy", then paste it into ' +
          'Facebook or Instagram yourself. Nothing is posted automatically.</p>' +
        editors +
      '</div>' +
    '</div>'
  );
}

function suggestedSocialText(sub) {
  const lines = [sub.title, '', sub.description];
  if (sub.event_date) lines.push('', '📅 ' + formatDate(sub.event_date));
  lines.push('', 'Shared on behalf of ' + sub.group_name +
    ' by the Osoyoos & District Arts Council.');
  return lines.join('\n');
}

function findTextarea(id, channel) {
  return document.getElementById('social-' + channel + '-' + id);
}

async function saveSocialText(id, channel, button) {
  const sub = submissionsCache.find(s => s.id === id);
  const box = findTextarea(id, channel);
  if (!sub || !box) return;

  const updates = {};
  updates[channel + '_text'] = box.value;

  button.disabled = true;
  const { error } = await db.from('submissions').update(updates).eq('id', id);
  button.disabled = false;

  if (error) {
    alert('Could not save this text. Please check your internet connection and try again.');
    return;
  }

  Object.assign(sub, updates);
  flashButton(button, 'Saved ✓');
}

async function copySocialText(id, channel, button) {
  const box = findTextarea(id, channel);
  if (!box) return;

  try {
    await navigator.clipboard.writeText(box.value);
  } catch (_e) {
    // Older browsers: select the text so the admin can press Ctrl+C.
    box.focus();
    box.select();
    alert('Please press Ctrl+C (or Cmd+C on a Mac) to copy the selected text.');
    return;
  }
  flashButton(button, 'Copied ✓');
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 2000);
}

function toggleSocialPanel(id) {
  if (openSocialPanels.has(id)) openSocialPanels.delete(id);
  else openSocialPanels.add(id);
  renderSubmissions();
}

function deadlineInfo(createdAt) {
  const created  = new Date(createdAt);
  const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000);
  const hoursLeft = (deadline - new Date()) / (1000 * 60 * 60);

  if (hoursLeft <= 0)
    return { className: 'deadline--red', label: '🔴 ' + Math.round(Math.abs(hoursLeft)) + 'h past the 48h deadline' };

  if (hoursLeft <= 12)
    return { className: 'deadline--yellow', label: '🟡 ' + Math.round(hoursLeft) + 'h left of the 48h deadline' };

  return { className: 'deadline--green', label: '🟢 ' + Math.round(hoursLeft) + 'h left of the 48h deadline' };
}

function attachCardHandlers() {
  document.querySelectorAll('.btn-channel').forEach(btn => {
    btn.addEventListener('click', () => markChannelPosted(btn.dataset.id, btn.dataset.channel));
  });
  document.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', () => markComplete(btn.dataset.id));
  });
  document.querySelectorAll('.btn-save-field').forEach(btn => {
    btn.addEventListener('click', () => saveField(btn.dataset.id, btn.dataset.field, btn.dataset.source));
  });
  document.querySelectorAll('.btn-clear-field').forEach(btn => {
    btn.addEventListener('click', () => clearField(btn.dataset.id, btn.dataset.field));
  });
  document.querySelectorAll('.btn-file').forEach(btn => {
    btn.addEventListener('click', () => openFile(btn.dataset.path));
  });
  document.querySelectorAll('.btn-social-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleSocialPanel(btn.dataset.id));
  });
  document.querySelectorAll('.btn-social-save').forEach(btn => {
    btn.addEventListener('click', () => saveSocialText(btn.dataset.id, btn.dataset.channel, btn));
  });
  document.querySelectorAll('.btn-social-copy').forEach(btn => {
    btn.addEventListener('click', () => copySocialText(btn.dataset.id, btn.dataset.channel, btn));
  });
}

/* == ACTIONS ==================================================== */
async function markChannelPosted(id, channel) {
  const sub = submissionsCache.find(s => s.id === id);
  if (!sub) return;

  const updates = { ['posted_' + channel]: true };

  // First confirmed publication stamps published_at (contract 1.1.b).
  // The 'in' check keeps this working until migration 05 has run.
  if ('published_at' in sub && !sub.published_at)
    updates.published_at = new Date().toISOString();

  const allPosted = (sub.publish_to || []).every(c =>
    c === channel ? true : sub['posted_' + c]
  );
  if (allPosted) updates.status = 'closed';

  const { error } = await db.from('submissions').update(updates).eq('id', id);
  if (error) {
    alert('Could not save this change. Please check your internet connection and try again.');
    return;
  }

  Object.assign(sub, updates);
  renderSubmissions();
}

async function markComplete(id) {
  const sub = submissionsCache.find(s => s.id === id);
  if (!sub) return;

  const { error } = await db.from('submissions').update({ status: 'closed' }).eq('id', id);
  if (error) {
    alert('Could not save this change. Please check your internet connection and try again.');
    return;
  }

  sub.status = 'closed';
  renderSubmissions();
}

async function saveField(id, field, sourceId) {
  const sub = submissionsCache.find(s => s.id === id);
  if (!sub) return;

  const sourceEl = document.getElementById(sourceId);
  if (!sourceEl) return;

  const rawValue = sourceEl.value.trim();
  const value = (field === 'expire_date' && rawValue === '') ? null : rawValue || null;

  const saveBtn = document.querySelector(
    '.btn-save-field[data-id="' + id + '"][data-field="' + field + '"]'
  );
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const { error } = await db.from('submissions').update({ [field]: value }).eq('id', id);

  if (error) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    alert('Could not save. Please try again. (' + error.message + ')');
    return;
  }

  sub[field] = value;

  const cardEl = document.querySelector('.submission-card[data-card-id="' + id + '"]');
  if (cardEl) {
    cardEl.outerHTML = renderCard(sub);
    attachCardHandlers();
  }
}

async function clearField(id, field) {
  const sub = submissionsCache.find(s => s.id === id);
  if (!sub) return;

  const { error } = await db.from('submissions').update({ [field]: null }).eq('id', id);
  if (error) {
    alert('Could not clear this field. Please try again.');
    return;
  }

  sub[field] = null;
  const cardEl = document.querySelector('.submission-card[data-card-id="' + id + '"]');
  if (cardEl) {
    cardEl.outerHTML = renderCard(sub);
    attachCardHandlers();
  }
}

/* == UTILITIES =================================================== */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(dateStr) {
  // Date-only values (YYYY-MM-DD, like event_date/expire_date) must be
  // parsed as LOCAL dates: new Date('2026-07-20') is midnight UTC, which
  // is still the previous day in Pacific time.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(dateStr);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return parseDate(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function esc(str) {
  return String(str != null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
