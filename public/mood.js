const loadingScreen = document.querySelector('#loadingScreen');
const introScreen = document.querySelector('#introScreen');
const countdown = document.querySelector('#countdown');
const letterScreen = document.querySelector('#letterScreen');
const errorScreen = document.querySelector('#errorScreen');
const recipientName = document.querySelector('#recipientName');
const senderLine = document.querySelector('#senderLine');
const openingMessage = document.querySelector('#openingMessage');
const letterMood = document.querySelector('#letterMood');
const letterText = document.querySelector('#letterText');
const mediaButton = document.querySelector('#mediaButton');
const mediaFrame = document.querySelector('#mediaFrame');
const finalMessage = document.querySelector('#finalMessage');
const bgMusic = document.querySelector('#bgMusic');
const muteBtn = document.querySelector('#muteBtn');

let moodData = null;
let selectedMood = null;
let fadeInterval = null;
let musicStartQueued = false;
const maxMusicVolume = 0.3;

function show(element) {
  element.classList.remove('hidden');
  requestAnimationFrame(() => element.classList.add('visible'));
}

function hide(element) {
  element.classList.add('hidden');
  element.classList.remove('visible');
}

function slugFromPath() {
  return window.location.pathname.split('/').filter(Boolean).pop();
}

function formatText(text) {
  return (text || '').split('\n').map((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    return p;
  });
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    let id = '';
    if (parsed.hostname.includes('youtu.be')) id = parsed.pathname.slice(1);
    if (parsed.hostname.includes('youtube.com')) id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
  } catch {
    return '';
  }
}

function fadeInAudio(audio) {
  if (!audio) return;
  clearInterval(fadeInterval);

  let volume = 0;
  audio.volume = volume;
  fadeInterval = setInterval(() => {
    if (volume < maxMusicVolume) {
      volume = Math.min(maxMusicVolume, volume + 0.02);
      audio.volume = volume;
      return;
    }

    clearInterval(fadeInterval);
  }, 200);
}

function playBackgroundMusic() {
  if (!bgMusic || !bgMusic.src || !bgMusic.paused) return;

  bgMusic.volume = 0;
  bgMusic.play()
    .then(() => fadeInAudio(bgMusic))
    .catch(() => queueBackgroundMusicStart());
}

function queueBackgroundMusicStart() {
  if (musicStartQueued) return;

  musicStartQueued = true;
  document.addEventListener('click', () => {
    musicStartQueued = false;
    playBackgroundMusic();
  }, { once: true });
}

function setBackgroundMusic(data, mood) {
  if (!bgMusic || !data) return;

  const src = mood === 'angry'
    ? data.angry_music_url || ''
    : data.happy_music_url || '';

  if (!src) return;
  if (bgMusic.src === src) return;

  bgMusic.src = src;
  bgMusic.load();
}

async function runCountdown() {
  hide(introScreen);
  show(countdown);

  for (const value of ['3...', '2...', '1...']) {
    countdown.textContent = value;
    await new Promise((resolve) => setTimeout(resolve, 720));
  }

  hide(countdown);
}

function renderMedia(type, url) {
  mediaFrame.replaceChildren();
  mediaFrame.classList.remove('image-media', 'audio-media', 'video-media');

  if (!url) {
    mediaFrame.textContent = 'No media was attached for this mood.';
    show(mediaFrame);
    return;
  }

  if (type === 'image') {
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Attached memory';
    mediaFrame.classList.add('image-media');
    mediaFrame.append(image);
    show(mediaFrame);
    return;
  }

  if (type === 'audio') {
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true;
    audio.preload = 'metadata';
    mediaFrame.classList.add('audio-media');
    mediaFrame.append(audio);
    show(mediaFrame);
    return;
  }

  if (type === 'youtube') {
    const embedUrl = youtubeEmbedUrl(url);
    if (!embedUrl) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.title = 'Attached YouTube video';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    mediaFrame.classList.add('video-media');
    mediaFrame.append(iframe);
    show(mediaFrame);
    return;
  }

  if (type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    mediaFrame.classList.add('video-media');
    mediaFrame.append(video);
    show(mediaFrame);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

async function openLetter(mood) {
  selectedMood = mood;
  setBackgroundMusic(moodData, mood);
  playBackgroundMusic();
  await runCountdown();

  const isAngry = mood === 'angry';
  letterMood.textContent = isAngry ? 'For the angry moment' : 'For the happy moment';
  letterText.replaceChildren(...formatText(isAngry ? moodData.angry_letter : moodData.happy_letter));
  mediaButton.textContent = isAngry ? moodData.angry_button_text || 'Open attached media' : moodData.happy_button_text || 'Open attached media';
  finalMessage.textContent = moodData.final_message || '';
  hide(mediaFrame);
  show(letterScreen);
}

async function loadMood() {
  try {
    const response = await fetch(`/api/moods/${encodeURIComponent(slugFromPath())}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Mood letter not found.');

    moodData = result.mood;
    recipientName.textContent = moodData.recipient_name || 'For you';
    senderLine.textContent = moodData.sender_name ? `From ${moodData.sender_name}` : 'A private letter';
    openingMessage.textContent = moodData.opening_message || '';

    setTimeout(() => {
      hide(loadingScreen);
      show(introScreen);
    }, 850);
  } catch {
    hide(loadingScreen);
    show(errorScreen);
  }
}

document.querySelectorAll('.mood-button').forEach((button) => {
  button.addEventListener('click', () => openLetter(button.dataset.mood));
});

queueBackgroundMusicStart();

muteBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!bgMusic) return;

  bgMusic.muted = !bgMusic.muted;
  muteBtn.textContent = bgMusic.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', bgMusic.muted ? 'Unmute background music' : 'Mute background music');
});

mediaButton.addEventListener('click', () => {
  if (!selectedMood || !moodData) return;
  const prefix = selectedMood === 'angry' ? 'angry' : 'happy';
  renderMedia(moodData[`${prefix}_media_type`], moodData[`${prefix}_media_url`]);
});

loadMood();
