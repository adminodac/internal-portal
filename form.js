/* ================================================================
   ODAC Internal Portal â€” form.js
   Phase 1: Intake Form Logic
   Handles: validation, file upload, Supabase insert, email trigger
   ================================================================ */

'use strict';

/* â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
let db          = null;
let selectedFiles = [];

/* â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabase === 'undefined') {
    showError('Could not load the required libraries. Please refresh the page.');
    return;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT')) {
    showError('This form is not yet configured. Please contact ODAC.');
    return;
  }

  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  setupCharCounter();
  setupFileInput();
  setupDragDrop();
  document.getElementById('submission-form')
          .addEventListener('submit', handleSubmit);
});

/* â”€â”€ Character Counter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function setupCharCounter() {
  const textarea = document.getElementById('description');
  const counter  = document.getElementById('char-count');
  textarea.addEventListener('input', () => {
    counter.textContent = textarea.value.length;
  });
}

/* â”€â”€ File Handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      showError(`You can attach a maximum of ${MAX_FILES} files. Remove one before adding more.`);
      break;
    }

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(ext)) {
      showError(`"${truncate(file.name, 40)}" is not a supported file type. Please use JPG, PNG, or PDF.`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      showError(`"${truncate(file.name, 40)}" is too large (${formatBytes(file.size)}). Maximum is 10 MB per file.`);
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
  list.innerHTML = selectedFiles.map((file, i) => `
    <div class="file-item">
      <span class="file-item-name" title="${esc(file.name)}">${esc(truncate(file.name, 50))}</span>
      <span class="file-item-size">${formatBytes(file.size)}</span>
      <button
        type="button"
        class="file-item-remove"
        onclick="removeFile(${i})"
        aria-label="Remove ${esc(file.name)}"
      >âœ•</button>
    </div>
  `).join('');
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
  clearError();
}

/* â”€â”€ Form Submission â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function handleSubmit(e) {
  e.preventDefault();
  clearError();

  const fd = new FormData(e.target);

  const group_name      = fd.get('group_name')      || '';
  const submitter_email = fd.get('submitter_email')  || '';
  const content_type    = fd.get('content_type')     || '';
  const title           = (fd.get('title')           || '').trim();
  const description     = (fd.get('description')     || '').trim();

  /* â”€â”€ Validation â”€â”€â”€â”€ */
  if (!group_name)
    return showError('Please select your group from the dropdown.');

  if (!submitter_email)
    return showError('Please enter your email address so we can send you a confirmation.');

  if (!isValidEmail(submitter_email))
    return showError('That email address doesn\'t look right. Please check it and try again.');

  if (!content_type)
    return showError('Please choose what you are sharing (Event, Exhibition, Artwork, or Announcement).');

  if (!title)
    return showError('Please add a title for your submission.');

  if (title.length < 3)
    return showError('Your title is too short â€” please make it a bit more descriptive.');

  if (!description)
    return showError('Please add a description. This will help us write the Facebook post.');

  if (description.length < 20)
    return showError('Your description is a little short. Please add a bit more detail (at least 20 characters).');

  /* â”€â”€ Submit â”€â”€â”€â”€ */
  setLoading(true);

  try {
    /* Generate a client-side UUID so we can use it in the storage path
       before the DB insert happens â€” this keeps the operation recoverable
       if only one step fails. */
    const submissionId = crypto.randomUUID();

    /* 1. Upload files â”€â”€â”€â”€ */
    const uploadedFiles = [];

    for (const file of selectedFiles) {
      const safeName = sanitizeFilename(file.name);
      const path     = `submissions/${submissionId}/${Date.now()}-${safeName}`;

      const { error: uploadErr } = await db.storage
        .from('submission-files')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadErr) {
        throw new Error(
          `We couldn't upload "${truncate(file.name, 30)}". ` +
          `Please check your internet connection and try again. ` +
          `(${uploadErr.message})`
        );
      }

      uploadedFiles.push({
        path,
        original_name:   file.name,
        file_size_bytes: file.size,
      });
    }

    /* 2. Insert submission record â”€â”€â”€â”€ */
    const { error: insertErr } = await db
      .from('submissions')
      .insert({
        id: submissionId,
        group_name,
        submitter_email,
        content_type,
        title,
        description,
        status: 'received',
      });

    if (insertErr) {
      throw new Error(
        'We couldn\'t save your submission. Please try again, or email us directly. ' +
        `(${insertErr.message})`
      );
    }

    /* 3. Insert file records (non-fatal if this step fails) â”€â”€â”€â”€ */
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
        /* Files are already in storage â€” just the metadata record failed.
           Log but don't surface to user; ODAC can still retrieve the files. */
        console.warn('submission_files insert failed:', filesErr.message);
      }
    }

    /* 4. Show success â”€â”€â”€â”€ */
    showSuccess({
      group_name,
      content_type,
      title,
      file_count: uploadedFiles.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(msg || 'Something went wrong. Please try again, or contact ODAC directly.');
  } finally {
    setLoading(false);
  }
}

/* â”€â”€ UI State Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function setLoading(loading) {
  const btn       = document.getElementById('submit-btn');
  const btnText   = btn.querySelector('.btn-text');
  const btnSpin   = btn.querySelector('.btn-loading');
  btn.disabled    = loading;
  btnText.hidden  = loading;
  btnSpin.hidden  = !loading;
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

function showSuccess({ group_name, content_type, title, file_count }) {
  document.getElementById('form-view').hidden = true;

  const summary = document.getElementById('success-summary');
  const label   = TYPE_LABELS[content_type] || content_type;

  summary.innerHTML =
    `<strong>From:</strong> ${esc(group_name)}<br>` +
    `<strong>Type:</strong> ${esc(label)}<br>` +
    `<strong>Title:</strong> ${esc(title)}` +
    (file_count > 0
      ? `<br><strong>Files attached:</strong> ${file_count}`
      : '');

  const successView = document.getElementById('success-view');
  successView.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Called by the "Submit something else" button */
function resetForm() {
  document.getElementById('form-view').hidden    = false;
  document.getElementById('success-view').hidden = true;
  document.getElementById('submission-form').reset();
  selectedFiles = [];
  renderFileList();
  clearError();
  document.getElementById('char-count').textContent = '0';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function formatBytes(bytes) {
  if (bytes < 1024)            return bytes + ' B';
  if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + 'â€¦';
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

