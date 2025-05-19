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
    try {
      chrome.storage.sync.get(['apiKey'], async (result) => {
        try {
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
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: request.systemPrompt },
                  { role: 'user', content: request.userPrompt }
                ],
                temperature: 0.5,
                response_format: { type: "text" }
              })
            });

            const data = await response.json();
            
            if (data.error) {
              sendResponse({ error: data.error.message });
            } else if (data.choices && data.choices.length > 0 && data.choices[0].message) {
              sendResponse({ result: data.choices[0].message.content });
            } else {
              sendResponse({ error: 'Invalid response from OpenAI API' });
            }
          } catch (error) {
            console.error('OpenAI API error:', error);
            sendResponse({ error: error.message || 'An error occurred while processing your request.' });
          }
        } catch (innerError) {
          console.error('Storage callback error:', innerError);
          sendResponse({ error: 'An unexpected error occurred. Please try again.' });
        }
      });
    } catch (outerError) {
      console.error('Storage API error:', outerError);
      sendResponse({ error: 'Could not access extension storage. Please restart your browser and try again.' });
    }

    // Return true to indicate that sendResponse will be called asynchronously
    return true;
  } else if (request.action === 'open-popup') {
    // 处理打开扩展弹出窗口的请求
    chrome.action.openPopup();
    return true;
  }
}); 