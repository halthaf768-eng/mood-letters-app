const form = document.querySelector('#moodForm');
const resultCard = document.querySelector('#resultCard');
const generatedLink = document.querySelector('#generatedLink');
const generateButton = document.querySelector('#generateButton');
const copyButton = document.querySelector('#copyButton');

function getAdminKey() {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function setButtonState(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? 'Generating...' : 'Generate Link';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setButtonState(true);
  resultCard.classList.add('hidden');

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
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
    alert(error.message);
  } finally {
    setButtonState(false);
  }
});

copyButton.addEventListener('click', async () => {
  if (!generatedLink.value) return;
  await navigator.clipboard.writeText(generatedLink.value);
  copyButton.textContent = 'Copied';
  setTimeout(() => {
    copyButton.textContent = 'Copy';
  }, 1400);
});
