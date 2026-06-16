const form = document.querySelector('#moodForm');
const resultCard = document.querySelector('#resultCard');
const generatedLink = document.querySelector('#generatedLink');
const generateButton = document.querySelector('#generateButton');
const copyButton = document.querySelector('#copyButton');
const setupError = document.querySelector('#setupError');
const maxImageSize = 5 * 1024 * 1024;
const maxMusicSize = 10 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedMusicTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']);

function getAdminKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function setButtonState(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? 'Generating...' : 'Generate Link';
}

function showSetupError(message) {
  setupError.textContent = message;
  setupError.classList.remove('hidden');
}

function clearSetupError() {
  setupError.textContent = '';
  setupError.classList.add('hidden');
}

function mediaTypeSelect(mood) {
  return form.elements[`${mood}_media_type`];
}

function mediaUrlInput(mood) {
  return form.elements[`${mood}_media_url`];
}

function imageFileInput(mood) {
  return form.elements[`${mood}_image_file`];
}

function musicFileInput(mood) {
  return form.elements[`${mood}_music_file`];
}

function updateMediaControls(mood) {
  const type = mediaTypeSelect(mood).value;
  const urlField = document.querySelector(`[data-media-field="${mood}"]`);
  const uploadField = document.querySelector(`[data-upload-field="${mood}"]`);
  const title = urlField.querySelector('.field-title');
  const urlInput = mediaUrlInput(mood);
  const fileInput = imageFileInput(mood);
  const labelMood = mood === 'angry' ? 'Angry' : 'Happy';
  const isImage = type === 'image';

  uploadField.classList.toggle('hidden', !isImage);
  urlField.classList.toggle('hidden', isImage);
  fileInput.disabled = !isImage;
  urlInput.disabled = isImage;

  if (isImage) {
    urlInput.value = '';
    return;
  }

  fileInput.value = '';
  title.textContent = type === 'youtube'
    ? `${labelMood} YouTube URL`
    : `${labelMood} Video URL`;
}

function validateImageFile(file) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('Images must be JPG, PNG, or WEBP.');
  }

  if (file.size > maxImageSize) {
    throw new Error('Images must be 5MB or smaller.');
  }
}

function validateMusicFile(file) {
  if (!allowedMusicTypes.has(file.type)) {
    throw new Error('Music files must be MP3, WAV, OGG, or M4A.');
  }

  if (file.size > maxMusicSize) {
    throw new Error('Music files must be 10MB or smaller.');
  }
}

async function uploadPhoto(file) {
  validateImageFile(file);

  const body = new FormData();
  body.append('photo', file);

  const response = await fetch(`/api/upload-photo?key=${encodeURIComponent(getAdminKey())}`, {
    method: 'POST',
    headers: {
      'x-admin-key': getAdminKey()
    },
    body
  });

  const result = await response.json();
  if (!response.ok) {
    const message = result.details || result.error || 'Could not upload image.';
    if (result.error === 'Supabase Storage setup error.') showSetupError(message);
    throw new Error(message);
  }

  return result.url;
}

async function uploadMusic(file) {
  validateMusicFile(file);

  const body = new FormData();
  body.append('music', file);

  const response = await fetch(`/api/upload-music?key=${encodeURIComponent(getAdminKey())}`, {
    method: 'POST',
    headers: {
      'x-admin-key': getAdminKey()
    },
    body
  });

  const result = await response.json();
  if (!response.ok) {
    const message = result.details || result.error || 'Could not upload music.';
    if (result.error === 'Supabase Storage setup error.') showSetupError(message);
    throw new Error(message);
  }

  return result.url;
}

async function buildMoodPayload() {
  const formData = new FormData(form);
  const payload = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    payload[key] = typeof value === 'string' ? value.trim() : value;
  }

  for (const mood of ['angry', 'happy']) {
    if (payload[`${mood}_media_type`] !== 'image') continue;

    const file = imageFileInput(mood).files[0];
    payload[`${mood}_media_url`] = file ? await uploadPhoto(file) : '';
  }

  for (const mood of ['angry', 'happy']) {
    const file = musicFileInput(mood).files[0];
    payload[`${mood}_music_url`] = file ? await uploadMusic(file) : '';
  }

  return payload;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setButtonState(true);
  resultCard.classList.add('hidden');
  clearSetupError();

  try {
    const payload = await buildMoodPayload();
    const response = await fetch(`/api/moods?key=${encodeURIComponent(getAdminKey())}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey()
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.details || result.error || 'Could not generate link.');

    generatedLink.value = result.link;
    resultCard.classList.remove('hidden');
  } catch (error) {
    if (!setupError.textContent) showSetupError(error.message);
  } finally {
    setButtonState(false);
  }
});

['angry', 'happy'].forEach((mood) => {
  mediaTypeSelect(mood).addEventListener('change', () => updateMediaControls(mood));
  updateMediaControls(mood);
});

copyButton.addEventListener('click', async () => {
  if (!generatedLink.value) return;
  await navigator.clipboard.writeText(generatedLink.value);
  copyButton.textContent = 'Copied';
  setTimeout(() => {
    copyButton.textContent = 'Copy';
  }, 1400);
});
