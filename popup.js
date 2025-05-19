document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyButton = document.getElementById('save-api-key');
  const apiKeyStatus = document.getElementById('api-key-status');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const toneButtons = document.querySelectorAll('.tone-btn');
  const toneOptions = document.querySelector('.tone-options');

  // Load saved API key
  chrome.storage.sync.get(['apiKey'], function(result) {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
      apiKeyStatus.textContent = 'API key is saved';
      apiKeyStatus.style.color = '#16a34a';
    }
  });

  // Load saved mode
  chrome.storage.sync.get(['mode', 'tone'], function(result) {
    const currentMode = result.mode || 'grammar';
    const currentTone = result.tone || 'professional';
    
    modeButtons.forEach(button => {
      if (button.dataset.mode === currentMode) {
        button.classList.add('active');
        if (currentMode === 'tone') {
          toneOptions.style.display = 'flex';
        }
      } else {
        button.classList.remove('active');
      }
    });

    toneButtons.forEach(button => {
      if (button.dataset.tone === currentTone) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  });

  // Save API key
  saveApiKeyButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (apiKey) {
      chrome.storage.sync.set({apiKey: apiKey}, function() {
        apiKeyStatus.textContent = 'API key saved successfully!';
        apiKeyStatus.style.color = '#16a34a';
        
        setTimeout(() => {
          apiKeyStatus.textContent = 'API key is saved';
        }, 2000);
      });
    } else {
      apiKeyStatus.textContent = 'Please enter a valid API key';
      apiKeyStatus.style.color = '#dc2626';
    }
  });

  // Mode selection
  modeButtons.forEach(button => {
    button.addEventListener('click', function() {
      const mode = this.dataset.mode;
      
      modeButtons.forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');
      
      if (mode === 'tone') {
        toneOptions.style.display = 'flex';
      } else {
        toneOptions.style.display = 'none';
      }
      
      chrome.storage.sync.set({mode: mode});
    });
  });

  // Tone selection
  toneButtons.forEach(button => {
    button.addEventListener('click', function() {
      const tone = this.dataset.tone;
      
      toneButtons.forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');
      
      chrome.storage.sync.set({tone: tone});
    });
  });
}); 