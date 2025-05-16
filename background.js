// Create context menus when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Create a parent context menu item
  chrome.contextMenus.create({
    id: 'grammar-bot',
    title: 'GrammarBot',
    contexts: ['selection', 'editable']
  });

  // Create child menu items for each mode
  chrome.contextMenus.create({
    id: 'grammar-check',
    parentId: 'grammar-bot',
    title: 'Grammar Check',
    contexts: ['selection', 'editable']
  });

  chrome.contextMenus.create({
    id: 'shorten',
    parentId: 'grammar-bot',
    title: 'Shorten',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'expand',
    parentId: 'grammar-bot',
    title: 'Expand',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'chinglish',
    parentId: 'grammar-bot',
    title: 'Detect Chinglish',
    contexts: ['selection', 'editable']
  });

  // Tone submenu
  chrome.contextMenus.create({
    id: 'tone',
    parentId: 'grammar-bot',
    title: 'Change Tone',
    contexts: ['selection']
  });

  // Create tone options
  chrome.contextMenus.create({
    id: 'tone-professional',
    parentId: 'tone',
    title: 'Professional',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'tone-concise',
    parentId: 'tone',
    title: 'Concise',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'tone-confident',
    parentId: 'tone',
    title: 'Confident',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'tone-friendly',
    parentId: 'tone',
    title: 'Friendly',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Get the selected text
  const selectedText = info.selectionText;
  
  if (!selectedText) {
    return;
  }

  let mode, tone;
  
  // Determine which operation to perform based on the menu item that was clicked
  if (info.menuItemId === 'grammar-check') {
    mode = 'grammar';
  } else if (info.menuItemId === 'shorten') {
    mode = 'shorten';
  } else if (info.menuItemId === 'expand') {
    mode = 'expand';
  } else if (info.menuItemId === 'chinglish') {
    mode = 'chinglish';
  } else if (info.menuItemId.startsWith('tone-')) {
    mode = 'tone';
    tone = info.menuItemId.replace('tone-', '');
  } else {
    return;
  }

  // Send message to content script
  chrome.tabs.sendMessage(tab.id, {
    action: 'process-text',
    text: selectedText,
    mode: mode,
    tone: tone
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openai-request') {
    // Get API key from storage
    chrome.storage.sync.get(['apiKey'], async (result) => {
      if (!result.apiKey) {
        sendResponse({ error: 'No API key found. Please set your OpenAI API key in the extension popup.' });
        return;
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt }
            ],
            temperature: 0.7
          })
        });

        const data = await response.json();
        
        if (data.error) {
          sendResponse({ error: data.error.message });
        } else {
          sendResponse({ result: data.choices[0].message.content });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
    });

    // Return true to indicate that sendResponse will be called asynchronously
    return true;
  }
}); 