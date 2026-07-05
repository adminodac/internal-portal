/* ================================================================
   ODAC Internal Portal -- admin.js
   Phase 2: Admin Dashboard
   Handles: login (Supabase Auth), loading submissions, marking
            channels as posted, marking submissions complete.
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
  renderSubmissions();
}

/* == RENDERING ================================================= */
function renderSubmissions() {
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
  const deadline = deadlineInfo(sub.created_at);
  const isExpired = sub.expire_date && new Date(sub.expire_date) < startOfToday();

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

  return (
    '<div class="submission-card' + (sub.status === 'closed' ? ' is-closed' : '') + '">' +
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
      '<div class="card-actions">' + channelButtons + completeButton + '</div>' +
    '</div>'
  );
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
}

/* == ACTIONS ==================================================== */
async function markChannelPosted(id, channel) {
  const sub = submissionsCache.find(s => s.id === id);
  if (!sub) return;

  const updates = { ['posted_' + channel]: true };

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

/* == UTILITIES =================================================== */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function esc(str) {
  return String(str != null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
