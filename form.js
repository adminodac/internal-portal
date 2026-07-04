/* ================================================================
   ODAC Internal Portal -- form.js
   Phase 1: Intake Form Logic
   Handles: validation, Supabase insert, email trigger,
            micro-interactions (no external libraries)
   ================================================================ */

'use strict';

/* -- Constants ------------------------------------------------- */
const ALLOWED_MIME  = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const ALLOWED_EXT   = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;   // 10 MB
const MAX_FILES     = 3;

const TYPE_LABELS = {
  event:        'Event',
  exhibition:   'Exhibition',
  artwork:      'Artwork',
  announcement: 'Announcement',
};

/* -- State ----------------------------------------------------- */
let db            = null;
let selectedFiles = [];

/* -- Bootstrap ------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // UI micro-interactions run always -- they don't need Supabase
  setupCharCounter();
  setupFileInput();
  setupDragDrop();
  setupSelectFill();
  setupEmailValidation();
  setupAccentInputs();

  // Supabase init -- show error and stop if not configured
  if (typeof supabase === 'undefined') {
    showError('Could not load the required libraries. Please refresh the page.');
    return;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT')) {
    showError('This form is not yet configured. Please contact Osoyoos & District Arts Council.');
    return;
  }

  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('submission-form')
          .addEventListener('submit', handleSubmit);
});

/* == MICRO-INTERACTIONS ======================================= */

/* 1. Dropdown: confirm group selected with accent border + check */
function setupSelectFill() {
  const sel = document.getElementById('group_name');
  sel.addEventListener('change', () => {
    if (sel.value) {
      sel.classList.add('select--filled');
    } else {
      sel.classList.remove('select--filled');
    }
  });
}

/* 2. Email: valid / invalid state on blur (never on focus) */
function setupEmailValidation() {
  const input = document.getElementById('submitter_email');

  input.addEventListener('focus', () => {
    // Clear error state on focus -- user is about to fix it
    input.classList.remove('input--invalid');
  });

  input.addEventListener('blur', () => {
    const val = input.value.trim();
    if (!val) {
      input.classList.remove('input--valid', 'input--invalid');
      return;
    }
    if (isValidEmail(val)) {
      input.classList.add('input--valid');
      input.classList.remove('input--invalid');
    } else {
      input.classList.add('input--invalid');
      input.classList.remove('input--valid');
    }
  });
}

/* 3. Title & Description: left accent line on focus;
      persists as long as the field has content */
function setupAccentInputs() {
  ['title', 'description'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('focus', () => {
      el.classList.add('field--active');
    });
    el.addEventListener('blur', () => {
      el.classList.remove('field--active');
      if (el.value.trim()) {
        el.classList.add('field--has-content');
      } else {
        el.classList.remove('field--has-content');
      }
    });
    // If page reloads with a value already in (browser autofill), handle it
    if (el.value.trim()) el.classList.add('field--has-content');
  });
}

/* == CHAR COUNTER ============================================= */
function setupCharCounter() {
  const textarea = document.getElementById('description');
  const counter  = document.getElementById('char-count');
  const wrapper  = counter.closest('.char-count');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    counter.textContent = len;

    // Colour the counter to signal proximity to limit
    // >= 2000 = danger (maxlength is 2000, can't exceed it)
    wrapper.classList.remove('char-count--mid', 'char-count--warn', 'char-count--danger');
    if (len >= 2000) {
      wrapper.classList.add('char-count--danger');
    } else if (len > 1800) {
      wrapper.classList.add('char-count--warn');
    } else if (len > 1000) {
      wrapper.classList.add('char-count--mid');
    }
  });
}

/* == FILE HANDLING =========================================== */
function setupFileInput() {
  document.getElementById('files')
          .addEventListener('change', e => processFiles(e.target.files));
}

function setupDragDrop() {
  const zone = document.getElementById('file-drop-zone');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  ['dragleave', 'dragend'].forEach(ev =>
    zone.addEventListener(ev, () => zone.classList.remove('drag-over'))
  );

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    processFiles(e.dataTransfer.files);
  });
}

function processFiles(fileList) {
  clearError();
  const incoming = Array.from(fileList);

  for (const file of incoming) {
    if (selectedFiles.length >= MAX_FILES) {
      showError('You can attach a maximum of ' + MAX_FILES + ' files. Remove one before adding more.');
      break;
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(ext)) {
      showError('"' + truncate(file.name, 40) + '" is not a supported file type. Please use JPG, PNG, or PDF.');
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      showError('"' + truncate(file.name, 40) + '" is too large (' + formatBytes(file.size) + '). Maximum is 10 MB per file.');
      continue;
    }

    const isDuplicate = selectedFiles.some(
      f => f.name === file.name && f.size === file.size
    );
    if (!isDuplicate) {
      selectedFiles.push(file);
    }
  }

  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');

  if (selectedFiles.length === 0) {
    list.hidden = true;
    list.innerHTML = '';
    return;
  }

  list.hidden  = false;
  // CSS animation on .file-item handles the fade-in automatically
  list.innerHTML = selectedFiles.map((file, i) =>
    '<div class="file-item">' +
      '<span class="file-item-name" title="' + esc(file.name) + '">' + esc(truncate(file.name, 50)) + '</span>' +
      '<span class="file-item-size">' + formatBytes(file.size) + '</span>' +
      '<button type="button" class="file-item-remove" onclick="removeFile(' + i + ')" aria-label="Remove ' + esc(file.name) + '">✕</button>' +
    '</div>'
  ).join('');
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
  clearError();
}

/* == FORM SUBMISSION ========================================= */
async function handleSubmit(e) {
  e.preventDefault();
  clearError();

  const fd = new FormData(e.target);

  const group_name      = fd.get('group_name')      || '';
  const submitter_email = fd.get('submitter_email')  || '';
  const content_type    = fd.get('content_type')     || '';
  const title           = (fd.get('title')           || '').trim();
  const description     = (fd.get('description')     || '').trim();
  const publish_to      = fd.getAll('publish_to');

  /* -- Validation -- */
  if (!group_name)
    return showError('Please select your group from the dropdown.');

  if (!submitter_email)
    return showError('Please enter your email address so we can send you a confirmation.');

  if (!isValidEmail(submitter_email))
    return showError("That email address doesn't look right. Please check it and try again.");

  if (!content_type)
    return showError('Please choose what you are sharing (Event, Exhibition, Artwork, or Announcement).');

  if (publish_to.length === 0)
    return showError('Please select at least one platform to publish to.');

  if (!title)
    return showError('Please add a title for your submission.');

  if (title.length < 3)
    return showError('Your title is too short -- please make it a bit more descriptive.');

  if (!description)
    return showError('Please add a description. This will help us write the post.');

  if (description.length < 20)
    return showError('Your description is a little short. Please add a bit more detail (at least 20 characters).');

  /* -- Submit -- */
  setLoading(true);

  try {
    const submissionId = crypto.randomUUID();

    /* 1. Upload files */
    const uploadedFiles = [];

    for (const file of selectedFiles) {
      const safeName = sanitizeFilename(file.name);
      const path     = 'submissions/' + submissionId + '/' + Date.now() + '-' + safeName;

      const { error: uploadErr } = await db.storage
        .from('submission-files')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadErr) {
        throw new Error(
          'We couldn\'t upload "' + truncate(file.name, 30) + '". ' +
          'Please check your internet connection and try again. ' +
          '(' + uploadErr.message + ')'
        );
      }

      uploadedFiles.push({
        path,
        original_name:   file.name,
        file_size_bytes: file.size,
      });
    }

    /* 2. Insert submission record */
    const { error: insertErr } = await db
      .from('submissions')
      .insert({
        id: submissionId,
        group_name,
        submitter_email,
        content_type,
        publish_to,
        title,
        description,
        status: 'received',
      });

    if (insertErr) {
      throw new Error(
        'We couldn\'t save your submission. Please try again, or email us directly. ' +
        '(' + insertErr.message + ')'
      );
    }

    /* 3. Insert file records (non-fatal) */
    if (uploadedFiles.length > 0) {
      const fileRows = uploadedFiles.map(f => ({
        submission_id:   submissionId,
        storage_path:    f.path,
        original_name:   f.original_name,
        file_size_bytes: f.file_size_bytes,
      }));

      const { error: filesErr } = await db
        .from('submission_files')
        .insert(fileRows);

      if (filesErr) {
        console.warn('submission_files insert failed:', filesErr.message);
      }
    }

    /* 4. Success -- brief "Sent!" state on button, then fade */
    setSubmitSent();
    setTimeout(() => {
      showSuccess({ group_name, content_type, title, submitter_email, file_count: uploadedFiles.length });
    }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(msg || 'Something went wrong. Please try again, or contact ODAC directly.');
    setLoading(false);
  }
  /* Note: setLoading(false) is NOT called on success path --
     the button stays in "Sent!" state until the view fades. */
}

/* == UI STATE ================================================ */
function setLoading(loading) {
  const btn     = document.getElementById('submit-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnSpin = btn.querySelector('.btn-loading');
  btn.disabled  = loading;
  btnText.hidden = loading;
  btnSpin.hidden = !loading;
}

/* Brief "Sent to ODAC" state before success view appears */
function setSubmitSent() {
  const btn     = document.getElementById('submit-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnSpin = btn.querySelector('.btn-loading');
  btn.disabled  = true;
  btnSpin.hidden = true;
  btnText.hidden = false;
  btnText.textContent = 'Sent ✓';
}

function showError(message) {
  const el = document.getElementById('form-error');
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearError() {
  const el = document.getElementById('form-error');
  el.hidden = true;
  el.textContent = '';
}

function showSuccess({ group_name, content_type, title, submitter_email, file_count }) {
  const formView    = document.getElementById('form-view');
  const successView = document.getElementById('success-view');

  /* Fade form out */
  formView.classList.add('is-exiting');

  setTimeout(() => {
    formView.hidden = true;
    formView.classList.remove('is-exiting');

    /* Update success content */
    const label = TYPE_LABELS[content_type] || content_type;

    // Icon: replace emoji with styled circle checkmark
    const iconEl = successView.querySelector('.success-icon');
    iconEl.innerHTML = '<span class="success-check-circle" aria-hidden="true">✓</span>';

    // Title
    const titleEl = successView.querySelector('.success-title');
    titleEl.textContent = 'Your content is on its way';

    // Main message
    const msgEl = successView.querySelector('.success-message');
    msgEl.innerHTML = "We'll review and publish it within <strong>48 hours</strong>.";

    // Sub message with email
    const subEl = successView.querySelector('.success-sub');
    subEl.innerHTML =
      "We'll email you at <span class=\"success-email-highlight\">" + esc(submitter_email) + "</span> when it's live.";

    // Summary card
    const summary = document.getElementById('success-summary');
    summary.innerHTML =
      '<strong>From:</strong> ' + esc(group_name) + '<br>' +
      '<strong>Type:</strong> ' + esc(label) + '<br>' +
      '<strong>Title:</strong> ' + esc(title) +
      (file_count > 0 ? '<br><strong>Files attached:</strong> ' + file_count : '');

    /* Fade success in */
    successView.hidden = false;
    // Force reflow so transition fires
    void successView.offsetHeight;
    successView.classList.add('is-visible');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 270);
}

/* Called by "Submit something else" button */
function resetForm() {
  const formView    = document.getElementById('form-view');
  const successView = document.getElementById('success-view');

  successView.classList.remove('is-visible');

  setTimeout(() => {
    successView.hidden = true;

    // Reset form fields
    document.getElementById('submission-form').reset();
    selectedFiles = [];
    renderFileList();
    clearError();

    // Reset char counter
    document.getElementById('char-count').textContent = '0';
    const charWrap = document.querySelector('.char-count');
    charWrap.classList.remove('char-count--mid', 'char-count--warn', 'char-count--danger');

    // Reset interaction classes
    document.getElementById('group_name').classList.remove('select--filled');
    document.getElementById('submitter_email').classList.remove('input--valid', 'input--invalid');
    document.getElementById('title').classList.remove('field--active', 'field--has-content');
    document.getElementById('description').classList.remove('field--active', 'field--has-content');

    // Restore button
    const btn = document.getElementById('submit-btn');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Send to ODAC';
    btn.querySelector('.btn-loading').hidden = true;
    btn.querySelector('.btn-text').hidden = false;

    // Show form with fade-in
    formView.hidden = false;
    void formView.offsetHeight;
    formView.style.opacity = '1';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 180);
}

/* == UTILITIES =============================================== */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function formatBytes(bytes) {
  if (bytes < 1024)            return bytes + ' B';
  if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
}

function esc(str) {
  return String(str != null ? str : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
