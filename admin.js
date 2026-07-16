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
const activeCardTab  = {};        // submission id -> 'details' | 'publish' | 'social'
const socialDrafts   = {};        // "id:channel" -> unsaved textarea edits
let adminsLoaded     = false;

const searchState = { query: '', month: '', year: '', day: '' }; // filters applied to both tabs

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
  document.getElementById('add-group-form').addEventListener('submit', handleAddGroup);
  document.getElementById('invite-form').addEventListener('submit', handleInviteAdmin);
  document.getElementById('forgot-toggle').addEventListener('click', toggleForgotSection);
  document.getElementById('forgot-form').addEventListener('submit', sendRecoveryEmail);
  document.getElementById('change-password-btn').addEventListener('click', openChangePassword);
  document.getElementById('cp-close').addEventListener('click', closeChangePassword);
  document.getElementById('cp-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeChangePassword();
  });
  document.getElementById('cp-form').addEventListener('submit', handleChangePassword);

  document.querySelectorAll('.page-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPageTab(btn.dataset.pageTab));
  });

  document.getElementById('search-query').addEventListener('input', handleSearchChange);
  document.getElementById('search-month').addEventListener('change', handleSearchChange);
  document.getElementById('search-year').addEventListener('change', handleSearchChange);
  document.getElementById('search-day').addEventListener('change', handleSearchChange);
  document.getElementById('search-clear').addEventListener('click', clearSearch);

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
  await loadGroups();
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
  populateYearFilter();
  renderSubmissions();
}

function populateYearFilter() {
  const select = document.getElementById('search-year');
  const currentValue = select.value;

  const years = Array.from(new Set(
    submissionsCache.map(s => parseDate(s.created_at).getFullYear())
  )).sort((a, b) => b - a);

  select.innerHTML = '<option value="">All years</option>' +
    years.map(y => '<option value="' + y + '">' + y + '</option>').join('');

  select.value = years.includes(+currentValue) ? currentValue : '';
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

  const openFiltered   = filterSubmissions(open);
  const closedFiltered = filterSubmissions(closed);

  const openList   = document.getElementById('submission-list');
  const closedList = document.getElementById('completed-list');

  openList.innerHTML = openFiltered.length
    ? openFiltered.map(renderCard).join('')
    : ('<p class="empty-text">' + (open.length ? 'No submissions match your search.' : 'No open submissions right now.') + '</p>');

  closedList.innerHTML = closedFiltered.length
    ? closedFiltered.map(renderCard).join('')
    : ('<p class="empty-text">' + (closed.length ? 'No submissions match your search.' : 'Nothing completed yet.') + '</p>');

  // The badge always reflects total workload, not the current search.
  document.getElementById('review-count').textContent = open.length;

  attachCardHandlers();
}

/* == SEARCH / DATE FILTER ======================================== */
function handleSearchChange() {
  searchState.query = document.getElementById('search-query').value.trim().toLowerCase();
  searchState.month = document.getElementById('search-month').value;
  searchState.year  = document.getElementById('search-year').value;
  searchState.day   = document.getElementById('search-day').value;

  const active = searchState.query || searchState.month || searchState.year || searchState.day;
  document.getElementById('search-clear').hidden = !active;

  renderSubmissions();
}

function clearSearch() {
  document.getElementById('search-query').value = '';
  document.getElementById('search-month').value = '';
  document.getElementById('search-year').value  = '';
  document.getElementById('search-day').value   = '';
  handleSearchChange();
}

function filterSubmissions(list) {
  return list.filter(sub => {
    if (searchState.query) {
      const haystack = (sub.group_name + ' ' + sub.title + ' ' + sub.description).toLowerCase();
      if (!haystack.includes(searchState.query)) return false;
    }

    const created = parseDate(sub.created_at);

    if (searchState.day) {
      // Exact day picked in the date input overrides month/year.
      if (formatISODate(created) !== searchState.day) return false;
      return true;
    }

    if (searchState.month && created.getMonth() !== +searchState.month) return false;
    if (searchState.year  && created.getFullYear() !== +searchState.year) return false;

    return true;
  });
}

function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/* == PAGE-LEVEL TABS (To review / Completed / Manage groups) ===== */
function switchPageTab(tab) {
  document.querySelectorAll('.page-tab-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.pageTab === tab);
  });
  document.querySelectorAll('.page-tab-panel').forEach(p => {
    p.hidden = p.dataset.pageTab !== tab;
  });
  // Search/date filters only apply to submissions tabs.
  document.getElementById('search-bar').hidden = (tab === 'groups' || tab === 'admins');
  if (tab === 'admins' && !adminsLoaded) loadAdmins();
}

function renderCard(sub) {
  const deadline  = deadlineInfo(sub.created_at);
  const isExpired = sub.expire_date && parseDate(sub.expire_date) < startOfToday();
  const isClosed  = sub.status === 'closed';

  const socialChannels = (sub.publish_to || []).filter(c => c === 'facebook' || c === 'instagram');
  const hasSocialTab    = !isClosed && socialChannels.length > 0;

  const activeTab = activeCardTab[sub.id] || 'details';

  const tabBar =
    '<div class="card-tabs" role="tablist">' +
      cardTabButton(sub.id, 'details', 'Details', activeTab) +
      cardTabButton(sub.id, 'publish', 'Publish', activeTab) +
      (hasSocialTab ? cardTabButton(sub.id, 'social', 'Social', activeTab) : '') +
    '</div>';

  return (
    '<div class="submission-card' + (isClosed ? ' is-closed' : '') + '" data-card-id="' + sub.id + '">' +
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
      tabBar +
      renderDetailsTab(sub, activeTab) +
      renderPublishTab(sub, activeTab, isClosed) +
      (hasSocialTab ? renderSocialTab(sub, activeTab) : '') +
    '</div>'
  );
}

function cardTabButton(id, tab, label, activeTab) {
  return '<button type="button" class="card-tab-btn' + (tab === activeTab ? ' is-active' : '') + '" ' +
    'data-id="' + id + '" data-tab="' + tab + '">' + label + '</button>';
}

function cardTabPanel(tab, activeTab, innerHtml) {
  return '<div class="card-tab-panel" data-tab="' + tab + '"' + (tab === activeTab ? '' : ' hidden') + '>' + innerHtml + '</div>';
}

/* --- Details tab: description + attachments ---------------------- */
function renderDetailsTab(sub, activeTab) {
  return cardTabPanel('details', activeTab,
    '<p class="card-description">' + esc(sub.description) + '</p>' +
    renderAttachments(sub)
  );
}

/* --- Publish tab: channel buttons, complete, expire_date ---------- */
function renderPublishTab(sub, activeTab, isClosed) {
  const channelButtons = (sub.publish_to || []).map(channel => {
    const posted = sub['posted_' + channel];
    const label  = CHANNEL_LABELS[channel] || channel;
    return posted
      ? '<span class="channel-done">' + esc(label) + ' ✓ posted</span>'
      : '<button type="button" class="btn-channel" data-id="' + sub.id + '" data-channel="' + channel + '">Mark as posted to ' + esc(label) + '</button>';
  }).join('');

  const completeButton = !isClosed
    ? '<button type="button" class="btn-complete" data-id="' + sub.id + '">Mark as complete</button>'
    : '';

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

  return cardTabPanel('publish', activeTab,
    '<div class="card-actions">' + channelButtons + completeButton + '</div>' +
    expireEditor
  );
}

function switchCardTab(id, tab) {
  const card = document.querySelector('.submission-card[data-card-id="' + id + '"]');
  if (!card) return;
  card.querySelectorAll('.card-tab-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  card.querySelectorAll('.card-tab-panel').forEach(p => { p.hidden = p.dataset.tab !== tab; });
  activeCardTab[id] = tab;
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

function renderSocialTab(sub, activeTab) {
  // The social columns arrive with SELECT * only after migration
  // 05_social_fields.sql has run. Until then, show a plain notice.
  if (!('facebook_text' in sub)) {
    return cardTabPanel('social', activeTab,
      '<p class="social-note">The social post editor needs a database update (05_social_fields.sql) before it can be used.</p>'
    );
  }

  const channels = (sub.publish_to || []).filter(c => c === 'facebook' || c === 'instagram');

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

  return cardTabPanel('social', activeTab,
    '<p class="social-help">Edit the text below if you want, click "Copy", then paste it into ' +
      'Facebook or Instagram yourself. Nothing is posted automatically.</p>' +
    editors
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
  document.querySelectorAll('.card-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchCardTab(btn.dataset.id, btn.dataset.tab));
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

/* == MANAGE GROUPS =============================================== */
async function loadGroups() {
  const list = document.getElementById('groups-list');
  list.innerHTML = '<p class="loading-text">Loading groups…</p>';

  const { data, error } = await db
    .from('groups')
    .select('*')
    .order('name');

  if (error) {
    list.innerHTML = '<p class="error-text">Could not load groups. Please refresh the page.</p>';
    return;
  }

  list.innerHTML = (data || []).map(renderGroupRow).join('');

  document.querySelectorAll('.btn-toggle-group').forEach(btn => {
    btn.addEventListener('click', () => toggleGroupActive(btn.dataset.id, btn.dataset.active === 'true'));
  });
}

function renderGroupRow(group) {
  return (
    '<div class="group-row' + (group.active ? '' : ' group-row--inactive') + '">' +
      '<span class="group-row-name">' + esc(group.name) + '</span>' +
      '<button type="button" class="btn-toggle-group ' + (group.active ? 'btn-toggle-group--on' : 'btn-toggle-group--off') + '" ' +
              'data-id="' + group.id + '" data-active="' + group.active + '">' +
        (group.active ? 'On — shown on form' : 'Off — hidden from form') +
      '</button>' +
    '</div>'
  );
}

async function handleAddGroup(e) {
  e.preventDefault();
  const errEl  = document.getElementById('groups-error');
  errEl.hidden = true;

  const input = document.getElementById('new-group-name');
  const name  = input.value.trim();
  if (!name) return;

  const { error } = await db.from('groups').insert({ name });

  if (error) {
    errEl.textContent = error.code === '23505'
      ? 'A group with that name already exists.'
      : 'Could not add this group. Please try again.';
    errEl.hidden = false;
    return;
  }

  input.value = '';
  await loadGroups();
}

async function toggleGroupActive(id, currentlyActive) {
  const { error } = await db.from('groups').update({ active: !currentlyActive }).eq('id', id);
  if (error) {
    alert('Could not update this group. Please try again.');
    return;
  }
  await loadGroups();
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

/* == INVITE ADMIN + ADMIN LIST =================================== */
async function loadAdmins() {
  const list = document.getElementById('admins-list');
  list.innerHTML = '<p class="loading-text">Loading admins…</p>';

  const { data, error } = await db.functions.invoke('invite-admin', { method: 'GET' });

  if (error || !data?.users) {
    list.innerHTML = '<p class="error-text">Could not load admins. Please refresh the page.</p>';
    return;
  }

  adminsLoaded = true;
  const users = data.users.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  list.innerHTML = users.map(renderAdminRow).join('') ||
    '<p class="empty-text">No admins found.</p>';
}

function renderAdminRow(user) {
  const joined    = formatDate(user.created_at);
  const lastLogin = user.last_sign_in_at ? formatDate(user.last_sign_in_at) : null;
  const pending   = !user.email_confirmed_at;

  return (
    '<div class="admin-row">' +
      '<div class="admin-row-info">' +
        '<span class="admin-email">' + esc(user.email || '—') + '</span>' +
        (pending
          ? '<span class="admin-badge-pending">Invite pending</span>'
          : '') +
        '<span class="admin-meta">Joined ' + joined +
          (lastLogin ? ' &middot; Last login ' + lastLogin : ' &middot; Never logged in') +
        '</span>' +
      '</div>' +
    '</div>'
  );
}

async function handleInviteAdmin(e) {
  e.preventDefault();
  const errEl = document.getElementById('invite-error');
  const sucEl = document.getElementById('invite-success');
  errEl.hidden = true;
  sucEl.hidden = true;

  const emailInput = document.getElementById('invite-email');
  const email      = emailInput.value.trim();

  if (!email || !email.includes('@')) {
    errEl.textContent = "That email doesn't look right. Please check and try again.";
    errEl.hidden = false;
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  const { data, error } = await db.functions.invoke('invite-admin', {
    method: 'POST',
    body:   { email },
  });

  btn.disabled    = false;
  btn.textContent = 'Send invitation';

  if (error || data?.error) {
    errEl.textContent = data?.error || 'Something went wrong — please try again or contact Francisco.';
    errEl.hidden = false;
    return;
  }

  sucEl.textContent = 'Invitation sent to ' + email + '. They will receive an email with a link to set their password.';
  sucEl.hidden = false;
  emailInput.value = '';

  // Refresh the admin list to show the new pending invite.
  adminsLoaded = false;
  await loadAdmins();
}

/* == FORGOT PASSWORD (login page) ================================ */
function toggleForgotSection() {
  const section = document.getElementById('forgot-section');
  const toggle  = document.getElementById('forgot-toggle');
  section.hidden = !section.hidden;
  toggle.textContent = section.hidden ? 'Forgot your password?' : '← Back to login';
  if (!section.hidden) {
    document.getElementById('forgot-email').focus();
    document.getElementById('forgot-error').hidden   = true;
    document.getElementById('forgot-success').hidden = true;
  }
}

async function sendRecoveryEmail(e) {
  e.preventDefault();
  const errEl = document.getElementById('forgot-error');
  const sucEl = document.getElementById('forgot-success');
  errEl.hidden = true;
  sucEl.hidden = true;

  const email = document.getElementById('forgot-email').value.trim();
  if (!email || !email.includes('@')) {
    errEl.textContent = "That email doesn't look right. Please check and try again.";
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById('forgot-btn');
  btn.querySelector('.btn-text').hidden    = true;
  btn.querySelector('.btn-loading').hidden = false;
  btn.disabled = true;

  await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://adminodac.github.io/internal-portal/admin/reset-password/'
  });

  btn.querySelector('.btn-text').hidden    = false;
  btn.querySelector('.btn-loading').hidden = true;
  btn.disabled = false;

  // Same message whether the email exists or not — security best practice.
  sucEl.textContent = "If that email is registered, you'll receive a recovery link shortly. Check your inbox.";
  sucEl.hidden = false;
  document.getElementById('forgot-email').value = '';
}

/* == CHANGE PASSWORD (dashboard) ================================= */
function openChangePassword() {
  document.getElementById('cp-overlay').hidden = false;
  document.getElementById('cp-form').reset();
  document.getElementById('cp-error').hidden   = true;
  document.getElementById('cp-success').hidden = true;
  document.getElementById('cp-current').focus();
}

function closeChangePassword() {
  document.getElementById('cp-overlay').hidden = true;
}

async function handleChangePassword(e) {
  e.preventDefault();
  const errEl = document.getElementById('cp-error');
  const sucEl = document.getElementById('cp-success');
  errEl.hidden = true;
  sucEl.hidden = true;

  const currentPwd = document.getElementById('cp-current').value;
  const newPwd     = document.getElementById('cp-new').value;
  const confirmPwd = document.getElementById('cp-confirm').value;

  if (!currentPwd) {
    errEl.textContent = 'Please enter your current password.';
    errEl.hidden = false;
    return;
  }
  if (!newPwd || newPwd.length < 6) {
    errEl.textContent = 'New password must be at least 6 characters.';
    errEl.hidden = false;
    return;
  }
  if (newPwd !== confirmPwd) {
    errEl.textContent = "Passwords don't match. Please check and try again.";
    errEl.hidden = false;
    return;
  }

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    errEl.textContent = 'Your session has expired. Please log out and log back in.';
    errEl.hidden = false;
    return;
  }

  const btn = document.getElementById('cp-btn');
  btn.querySelector('.btn-text').hidden    = true;
  btn.querySelector('.btn-loading').hidden = false;
  btn.disabled = true;

  // Verify current password before changing.
  const { error: signInError } = await db.auth.signInWithPassword({
    email:    user.email,
    password: currentPwd
  });

  if (signInError) {
    btn.querySelector('.btn-text').hidden    = false;
    btn.querySelector('.btn-loading').hidden = true;
    btn.disabled = false;
    errEl.textContent = 'Your current password is incorrect. Please try again.';
    errEl.hidden = false;
    return;
  }

  const { error } = await db.auth.updateUser({ password: newPwd });

  btn.querySelector('.btn-text').hidden    = false;
  btn.querySelector('.btn-loading').hidden = true;
  btn.disabled = false;

  if (error) {
    errEl.textContent = 'Something went wrong — please try again.';
    errEl.hidden = false;
    return;
  }

  sucEl.textContent = 'Password updated successfully.';
  sucEl.hidden = false;
  setTimeout(closeChangePassword, 2000);
}
