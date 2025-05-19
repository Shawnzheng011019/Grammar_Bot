// Create container for grammar suggestions
let suggestionContainer = null;
let activeElement = null;
let originalText = '';
let lastCaret = null;
let inlineMarker = null;
let currentMode = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'process-text') {
    processText(request.text, request.mode, request.tone);
    sendResponse({status: 'processing'});
  }
});

// Process text based on the selected mode
function processText(text, mode, tone) {
  console.log('Processing text with mode:', mode, 'tone:', tone);
  console.log('Text length:', text.length);
  originalText = text;
  currentMode = mode;
  saveSelectionState();
  
  // Generate the appropriate system prompt for each mode
  let systemPrompt = '';
  let userPrompt = text;

  switch (mode) {
    case 'grammar':
      // Grammar check mode
      systemPrompt = `You are an expert English grammar and writing assistant. Analyze the provided text and identify any grammar, spelling, punctuation, or style issues.

      Format your response as a JSON array of objects, where each object represents one issue found. Each object should have:
      - "original": the original text with the issue
      - "replacement": the corrected text
      - "explanation": brief explanation of the issue (max 10 words)
      - "index": character index where the issue starts (if you can't determine this precisely, use 0)
      - "length": length of the problematic text (if you can't determine this precisely, use the length of the original text)
      
      Only include entries where there are actual issues to fix. If there are no issues, return an empty array: []
      
      Example response:
      [
        {
          "original": "their going",
          "replacement": "they're going",
          "explanation": "wrong form of 'their/they're'",
          "index": 0,
          "length": 11
        }
      ]`;
      break;
    
    case 'shorten':
      systemPrompt = `You are an expert at concise writing. Rewrite the provided text to be shorter while preserving the key information. 
      Aim to reduce the length by 30-50% without losing important content. Return only the rewritten text without any explanation or formatting.`;
      break;
      
    case 'expand':
      systemPrompt = `You are an expert at expanding text. Rewrite the provided text to be more detailed, comprehensive, and clear. 
      Add relevant details, examples, or explanations to make the text more informative and engaging. Return only the rewritten text without any explanation or formatting.`;
      break;
      
    case 'chinglish':
      systemPrompt = `You are an expert at identifying and correcting "Chinglish" (English influenced by Chinese language patterns). 
      Analyze the provided text and identify expressions that sound unnatural to native English speakers, especially those that appear to be direct translations from Chinese.
      
      Format your response as a JSON array of objects, where each object represents one issue found. Each object should have:
      - "original": the original text with the Chinglish issue (copy it exactly as it appears)
      - "replacement": the corrected natural English alternative
      - "explanation": brief explanation of why the original is unnatural (max 10 words)
      - "index": character index where the issue starts (if you can't determine this precisely, use 0)
      - "length": length of the problematic text (if you can't determine this precisely, use the length of the original text)
      
      Only include entries where there are actual issues to fix. If there are no issues, return an empty array: []
      
      VERY IMPORTANT: 
      1. Your response must be ONLY a valid JSON array that can be parsed with JSON.parse()
      2. Do not include any text before or after the JSON array
      3. Every object must have all the required fields listed above
      4. Include the exact original text in the "original" field so it can be located in the document
      5. Keep corrections focused on Chinglish patterns, not minor grammar issues
      6. Ensure all quotes and brackets are properly escaped in the JSON
      
      Example response:
      [
        {
          "original": "I very like this movie",
          "replacement": "I really like this movie",
          "explanation": "Chinese pattern: 我很喜欢 → use 'really' not 'very'",
          "index": 0,
          "length": 19
        }
      ]`;
      break;
      
    case 'tone':
      systemPrompt = `You are an expert at rewriting text to match a specific tone.`;
      
      if (tone === 'professional') {
        systemPrompt += ` Rewrite the provided text to have a formal, professional tone appropriate for business or academic contexts. 
        Use precise language, avoid colloquialisms, and maintain a respectful, authoritative voice. Return only the rewritten text without any explanation or formatting.`;
      } else if (tone === 'concise') {
        systemPrompt += ` Rewrite the provided text to be as concise as possible without losing the key information. 
        Eliminate unnecessary words, shorten sentences, and focus on clarity and brevity. Return only the rewritten text without any explanation or formatting.`;
      } else if (tone === 'confident') {
        systemPrompt += ` Rewrite the provided text to convey a confident, assertive tone. 
        Use decisive language, minimize hedging words (like "maybe" or "perhaps"), and express ideas with conviction. Return only the rewritten text without any explanation or formatting.`;
      } else if (tone === 'friendly') {
        systemPrompt += ` Rewrite the provided text to have a warm, friendly, and approachable tone. 
        Use conversational language, a positive outlook, and a helpful attitude. Return only the rewritten text without any explanation or formatting.`;
      }
      break;
  }

  // Show loading message
  showLoadingMessage();

  const apiTimeout = setTimeout(() => {
    if (suggestionContainer && suggestionContainer.querySelector('.grammar-bot-loading')) {
      console.log('API请求超时');
      handleResponse({
        error: '请求超时，可能是API服务器响应慢或网络问题，请稍后重试。如果问题持续存在，请检查您的API密钥。'
      });
    }
  }, 30000); // 30秒超时
  
  // Send request to the background script
  chrome.runtime.sendMessage({
    action: 'openai-request',
    systemPrompt: systemPrompt,
    userPrompt: userPrompt
  }, response => {
    // 清除超时计时器
    clearTimeout(apiTimeout);
    
    // Handle the response in a callback
    if (response) {
      handleResponse(response);
    } else {
      // Handle case where no response is received
      showError('No response received from OpenAI. Please check your API key and try again.');
    }
  });
}

// Helper function: Save current selection state and active element
function saveSelectionState() {
  // Save active element
  activeElement = document.activeElement;
  console.log('Active element before processing:', activeElement);
  
  // Handle different editor types
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // Standard form elements
    lastCaret = {
      start: activeElement.selectionStart,
      end: activeElement.selectionEnd
    };
    console.log('Saved caret position for input/textarea:', lastCaret);
  } else {
    // Capture current selection
    const selection = window.getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      lastCaret = {
        range: range.cloneRange(),
        text: range.toString()
      };
      console.log('Saved selection range with text length:', lastCaret.text.length);
      
      // If no active element but there's a selection, find the editable element containing the selection
      if (!activeElement || (!activeElement.isContentEditable && activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'INPUT')) {
        let node = range.startContainer;
        
        // Special case for text nodes - use parentNode
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentNode;
        }
        
        // Find editable parent element
        while (node && node !== document.body) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
              activeElement = el;
              console.log('Found parent editable element from selection:', activeElement);
              break;
            }
          }
          node = node.parentNode;
        }
      }
    } else {
      console.warn('No selection found');
      lastCaret = null;
    }
  }
  
  // If we still don't have an active element, try other methods
  if (!activeElement) {
    console.warn('No active element found, trying fallback methods');
    
    // Method 1: Check for shadow DOM elements and iframes (for rich text editors)
    try {
      const potentialEditables = document.querySelectorAll('*[contenteditable="true"], div.editor, div.rich-text, textarea, input[type="text"]');
      for (const el of potentialEditables) {
        // Check if focused or contains the selection
        if (
          el.contains(window.getSelection().anchorNode) ||
          document.activeElement === el ||
          el.classList.contains('focused') ||
          el.classList.contains('active')
        ) {
          activeElement = el;
          console.log('Found potential editor element by class/attribute:', activeElement);
          break;
        }
      }
      
      // If still not found, try all elements
      if (!activeElement) {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          // Check for rich text editor
          if (
            el.getAttribute('contenteditable') === 'true' || 
            el.role === 'textbox' || 
            el.classList.contains('editor') || 
            el.classList.contains('rich-text') || 
            (el.shadowRoot && el.shadowRoot.activeElement)
          ) {
            activeElement = el;
            console.log('Found potential editor element:', activeElement);
            break;
          }
          
          // Check iframes
          if (el.tagName === 'IFRAME') {
            try {
              const iframeDoc = el.contentDocument || el.contentWindow.document;
              const iframeActiveElement = iframeDoc.activeElement;
              if (iframeActiveElement && 
                  (iframeActiveElement.isContentEditable || 
                  iframeActiveElement.tagName === 'TEXTAREA' || 
                  iframeActiveElement.tagName === 'INPUT')) {
                activeElement = iframeActiveElement;
                console.log('Found active element in iframe:', activeElement);
                break;
              }
            } catch (err) {
              // Cross-domain iframe access will fail, ignore error
              console.log('Could not access iframe content due to same-origin policy');
            }
          }
        }
      }
    } catch (err) {
      console.error('Error finding richtext editor:', err);
    }
    
    // Create a backup of the selection if nothing else worked
    if (!lastCaret && window.getSelection().toString().length > 0) {
      originalText = window.getSelection().toString();
      console.log('Saved selection text as originalText, length:', originalText.length);
    }
  }
  
  return {activeElement, lastCaret};
}

// Create inline corrections, each with accept/reject options
function createInlineCorrections(textContent, corrections, range, mode) {
  // First remove previous markers
  removeInlineMarker();
  
  // Record the original text, for tracking user acceptance/rejection of changes
  const originalText = textContent;
  
  // Add a unique ID, if LLM response doesn't include one
  corrections.forEach(correction => {
    if (!correction.id) {
      correction.id = `correction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Ensure all corrections have correct index and length
    if (typeof correction.index !== 'number' || correction.index < 0 || correction.index >= originalText.length) {
      console.log("Correction index:", correction.original);
      correction.index = originalText.indexOf(correction.original);
      if (correction.index === -1) {
        // If exact match not found, try fuzzy matching
        correction.index = findBestMatchPosition(originalText, correction.original);
      }
    }
    
    if (typeof correction.length !== 'number' || correction.length <= 0) {
      correction.length = correction.original.length;
    }
    
    // Ensure there is a replacement field
    if (!correction.replacement && correction.corrected) {
      correction.replacement = correction.corrected;
    }
  });
  
  // Filter out invalid corrections (those without original position)
  const validCorrections = corrections.filter(c => c.index >= 0);
  
  // Sort corrections by position (from front to back)
  validCorrections.sort((a, b) => a.index - b.index);
  
  // Create the right fixed container
  inlineMarker = document.createElement('div');
  inlineMarker.className = 'grammar-bot-sidebar';
  inlineMarker.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 350px;
    height: 100vh;
    background-color: #F2F2F7;
    z-index: 9999;
    box-shadow: -2px 0 28px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif;
    overflow: hidden;
    transition: transform 0.3s ease;
  `;
  
  // Create the title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    padding: 14px 16px;
    background-color: #F2F2F7;
    color: #000000;
    font-weight: 600;
    font-size: 17px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #E5E5EA;
  `;
  
  // Display different titles based on different modes
  let titleText;
  if (mode === 'grammar') {
    titleText = `Grammar Check`;
  } else if (mode === 'chinglish') {
    titleText = `Chinglish Check`;
  } else {
    titleText = `Text Analysis`;
  }
  
  const titleTextEl = document.createElement('span');
  titleTextEl.textContent = titleText;
  titleBar.appendChild(titleTextEl);
  
  // Add close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="#8E8E93"/>
    </svg>
  `;
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 17px;
    color: #8E8E93;
    cursor: pointer;
    padding: 8px;
    line-height: 1;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeButton.addEventListener('click', () => {
    // Check if there are pending corrections that have been accepted but not applied
    const pendingCorrections = Object.keys(correctionStates).filter(id => 
      correctionStates[id].accepted === true && !correctionStates[id].applied
    );
    
    if (pendingCorrections.length > 0) {
      // Pop up a confirmation dialog to confirm if the user wants to close
      const confirmContainer = document.createElement('div');
      confirmContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: white;
        color: #1f2937;
        padding: 20px;
        border-radius: 14px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        font-size: 15px;
        max-width: 400px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      `;
      
      const confirmMessage = document.createElement('div');
      confirmMessage.textContent = `You have ${pendingCorrections.length} accepted ${pendingCorrections.length === 1 ? 'change' : 'changes'} that ${pendingCorrections.length === 1 ? 'hasn\'t' : 'haven\'t'} been applied yet. Apply ${pendingCorrections.length === 1 ? 'it' : 'them'} before closing?`;
      confirmMessage.style.fontWeight = '500';
      
      const confirmButtons = document.createElement('div');
      confirmButtons.style.cssText = `
        display: flex;
        gap: 10px;
      `;
      
      const confirmYesBtn = document.createElement('button');
      confirmYesBtn.textContent = 'Apply & Close';
      confirmYesBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background-color: #007AFF;
        color: white;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      `;
      confirmYesBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
        
        // Show the message that changes are being applied
        showMessage("Applying remaining changes...", true, 5000);
        
        // Call the application logic
        const corrections = pendingCorrections.map(id => correctionStates[id].correction);
        
        // Use Promise sequence to apply changes one by one
        const applyAndClose = async () => {
          // Apply changes from back to front to avoid index offset
          corrections.sort((a, b) => b.index - a.index);
          
          for (const correction of corrections) {
            // Apply changes directly
            applyDirectCorrection(correction);
            
            // Brief pause
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Close the sidebar
          removeInlineMarker();
          // Ensure the popup also closes
          removeSuggestionContainer();
          
          // Show the message that changes are done
          showMessage("All changes applied successfully!", true, 3000);
        };
        
        applyAndClose();
      });
      
      const confirmNoBtn = document.createElement('button');
      confirmNoBtn.textContent = 'Close Without Applying';
      confirmNoBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background-color: #F2F2F7;
        color: #007AFF;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      `;
      confirmNoBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
        removeInlineMarker();
        // 确保弹窗也关闭
        removeSuggestionContainer();
      });
      
      const confirmCancelBtn = document.createElement('button');
      confirmCancelBtn.textContent = 'Cancel';
      confirmCancelBtn.style.cssText = `
        padding: 12px;
        background: none;
        color: #8E8E93;
        border: none;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        text-align: center;
      `;
      confirmCancelBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
      });
      
      confirmButtons.appendChild(confirmYesBtn);
      confirmButtons.appendChild(confirmNoBtn);
      
      confirmContainer.appendChild(confirmMessage);
      confirmContainer.appendChild(confirmButtons);
      confirmContainer.appendChild(confirmCancelBtn);
      
      document.body.appendChild(confirmContainer);
    } else {
      // 如果没有未应用的修改，直接关闭
      removeInlineMarker();
      // 确保弹窗也关闭
      removeSuggestionContainer();
      showMessage("Finished!", true, 2000);
    }
  });
  titleBar.appendChild(closeButton);
  
  inlineMarker.appendChild(titleBar);
  
  // Create keyboard navigation event handler
  inlineMarker.keyHandler = function(e) {
    // ESC key closes the sidebar
    if (e.key === 'Escape') {
      removeInlineMarker();
      e.preventDefault();
      return;
    }
    
    // Use arrow keys to navigate correction suggestions
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const cards = document.querySelectorAll('[class^="correction-card-"]');
      if (cards.length === 0) return;
      
      // Find the currently focused card
      let focusedCard = null;
      let focusedIndex = -1;
      
      cards.forEach((card, index) => {
        if (card.classList.contains('focused-card')) {
          focusedCard = card;
          focusedIndex = index;
        }
      });
      
      // Calculate the next focused card index
      let nextIndex;
      if (focusedIndex === -1) {
        // No focused card, select the first or last card based on the key
        nextIndex = e.key === 'ArrowDown' ? 0 : cards.length - 1;
      } else {
        // There is a focused card, move up or down
        if (e.key === 'ArrowDown') {
          nextIndex = (focusedIndex + 1) % cards.length;
        } else {
          nextIndex = (focusedIndex - 1 + cards.length) % cards.length;
        }
      }
      
      // Remove the focus style from all cards
      cards.forEach(card => {
        card.classList.remove('focused-card');
        card.style.boxShadow = '';
      });
      
      // Add the focus style to the new card
      cards[nextIndex].classList.add('focused-card');
      cards[nextIndex].style.boxShadow = '0 0 0 2px #3b82f6';
      
      // Scroll to the visible area
      cards[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      e.preventDefault();
    }
    
    // Enter key: Accept the current focused change
    if (e.key === 'Enter') {
      const focusedCard = document.querySelector('.focused-card');
      if (focusedCard) {
        const acceptBtn = focusedCard.querySelector('button:first-of-type');
        if (acceptBtn) {
          acceptBtn.click();
        }
        e.preventDefault();
      }
    }
  };
  
  // Add keyboard event listener
  document.addEventListener('keydown', inlineMarker.keyHandler);
  
  // Create content area
  const contentArea = document.createElement('div');
  contentArea.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: #FFFFFF;
  `;
  
  // Add information summary
  const summaryEl = document.createElement('div');
  summaryEl.style.cssText = `
    padding: 14px 16px;
    background-color: #F2F2F7;
    border-radius: 12px;
    font-size: 15px;
    color: #3A3A3C;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  const infoIcon = document.createElement('span');
  infoIcon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `;
  summaryEl.appendChild(infoIcon);
  
  const summaryText = document.createElement('span');
  summaryText.textContent = `Found ${corrections.length} ${corrections.length === 1 ? 'issue' : 'issues'} to correct`;
  summaryEl.appendChild(summaryText);
  
  contentArea.appendChild(summaryEl);
  
  // Save correction states
  const correctionStates = {};
  corrections.forEach(correction => {
    correctionStates[correction.id] = {
      accepted: null, // null = not decided, true = accepted, false = rejected
      applied: false,  // Whether the change has been applied
      correction: correction
    };
  });
  
  // Add original text preview
  const originalTextPreview = document.createElement('div');
  originalTextPreview.className = 'grammar-bot-original-preview';
  originalTextPreview.style.cssText = `
    border: 1px solid #E5E5EA;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    color: #3A3A3C;
    background-color: #FFFFFF;
    max-height: 150px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  `;
  
  // Initialize the original text preview
  originalTextPreview.innerHTML = `<p style="margin: 0; white-space: pre-wrap;">${escapeHtml(originalText)}</p>`;
  
  const originalTextLabel = document.createElement('div');
  originalTextLabel.style.cssText = `
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 15px;
    color: #3A3A3C;
  `;
  originalTextLabel.textContent = 'Original Text Preview (issues highlighted)';
  
  const originalTextContainer = document.createElement('div');
  originalTextContainer.appendChild(originalTextLabel);
  originalTextContainer.appendChild(originalTextPreview);
  contentArea.appendChild(originalTextContainer);
  
  // Highlight the original text with error positions
  setTimeout(() => {
    updateOriginalTextPreview(originalText, Object.values(correctionStates));
  }, 0);
  
  // Helper function: Update the original text preview, highlight errors
  function updateOriginalTextPreview(text, states) {
    const preview = document.querySelector('.grammar-bot-original-preview');
    if (!preview) return;
    
    // Ensure the preview has content
    if (!text || text.trim() === '') {
      preview.innerHTML = '<p style="color: #6b7280; font-style: italic;">No original text</p>';
      return;
    }
    
    // Get all the error positions that need to be marked
    const markers = [];
    states.forEach(state => {
      if (state.correction && state.correction.original && typeof state.correction.index === 'number') {
        markers.push({
          index: state.correction.index,
          length: state.correction.length || state.correction.original.length,
          applied: state.applied === true,
          id: state.correction.id
        });
      }
    });
    
    // Sort by position (from back to front)
    markers.sort((a, b) => b.index - a.index);
    
    // Insert markers one by one
    let result = escapeHtml(text); // First escape the text
    
    // Handle the case where there are no markers - ensure the original text is displayed
    if (markers.length === 0) {
      preview.innerHTML = `<p style="margin: 0; white-space: pre-wrap;">${result}</p>`;
      return;
    }
    
    // Add markers to the text
    markers.forEach(marker => {
      // Calculate the index position (considering the offset due to HTML escaping)
      const escapedBefore = escapeHtml(text.substring(0, marker.index));
      const escapedMarked = escapeHtml(text.substring(marker.index, marker.index + marker.length));
      
      // Build the replacement pattern safely
      const beforeRegex = escapedBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const markedRegex = escapedMarked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      try {
        const pattern = new RegExp(`(${beforeRegex})(${markedRegex})`, 'g');
        
        const bgColor = marker.applied ? '#dcfce7' : '#fee2e2';
        const borderColor = marker.applied ? '#a7f3d0' : '#fecaca';
        const dataAttr = marker.id ? `data-correction-id="${marker.id}"` : '';
        
        result = result.replace(pattern, function(match, p1, p2) {
          return p1 + `<span class="grammar-bot-error-mark" ${dataAttr} style="background-color: ${bgColor}; border-bottom: 2px solid ${borderColor}; padding: 0 2px; border-radius: 2px;">` + p2 + '</span>';
        });
      } catch (e) {
        console.error('Error creating regex for highlighting:', e);
      }
    });
    
    // Ensure the content is displayed in paragraphs
    preview.innerHTML = `<p style="margin: 0; white-space: pre-wrap;">${result}</p>`;
    
    // Add click event, click the marker to scroll to the corresponding correction suggestion
    const errorMarks = preview.querySelectorAll('.grammar-bot-error-mark');
    errorMarks.forEach(mark => {
      mark.style.cursor = 'pointer';
      
      mark.addEventListener('click', () => {
        const id = mark.getAttribute('data-correction-id');
        if (id) {
          const card = document.querySelector(`.correction-card-${id}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.boxShadow = '0 0 0 2px #3b82f6';
            setTimeout(() => {
              card.style.boxShadow = '';
            }, 2000);
          }
        }
      });
    });
  }
  
  // Create the correction suggestion list
  const correctionsListTitle = document.createElement('div');
  correctionsListTitle.style.cssText = `
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 15px;
    color: #3A3A3C;
  `;
  correctionsListTitle.textContent = 'Suggested Changes';
  contentArea.appendChild(correctionsListTitle);
  
  const correctionsList = document.createElement('div');
  correctionsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  `;
  
  validCorrections.forEach((correction, index) => {
    const correctionCard = document.createElement('div');
    correctionCard.className = `correction-card-${correction.id}`;
    correctionCard.style.cssText = `
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
      transition: all 0.3s ease;
    `;
    
    // Suggestion title bar
    const cardHeader = document.createElement('div');
    cardHeader.style.cssText = `
      padding: 8px 12px;
      background-color: #f3f4f6;
      border-bottom: 1px solid #e5e7eb;
      color: #1f2937;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
    `;
    cardHeader.textContent = `Suggestion ${index + 1}`;
    
    // Add status indicator
    const statusIndicator = document.createElement('span');
    statusIndicator.className = `status-indicator-${correction.id}`;
    statusIndicator.style.cssText = `
      padding: 2px 6px;
      border-radius: 12px;
      font-size: 11px;
      background-color: #e5e7eb;
      color: #6b7280;
    `;
    statusIndicator.textContent = 'Pending';
    cardHeader.appendChild(statusIndicator);
    
    correctionCard.appendChild(cardHeader);
    
    // Suggestion content
    const cardContent = document.createElement('div');
    cardContent.style.cssText = `
      padding: 12px;
    `;
    
    // Show the original text (with strikethrough) and the replacement text (in green and bold) in comparison view
    const textCompareView = document.createElement('div');
    textCompareView.style.cssText = `
      margin-bottom: 12px;
      font-size: 14px;
      line-height: 1.5;
      background-color: #f9fafb;
      padding: 8px;
      border-radius: 4px;
    `;
    
    // Add labels to display the original and modified text
    const originalLabel = document.createElement('div');
    originalLabel.style.cssText = `
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    `;
    originalLabel.textContent = 'Original:';
    textCompareView.appendChild(originalLabel);
    
    // Original text (with strikethrough)
    const originalSpan = document.createElement('div');
    originalSpan.style.cssText = `
      color: #dc2626;
      text-decoration: line-through;
      margin-bottom: 8px;
    `;
    originalSpan.textContent = correction.original;
    textCompareView.appendChild(originalSpan);
    
    // Modified label
    const replacementLabel = document.createElement('div');
    replacementLabel.style.cssText = `
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    `;
    replacementLabel.textContent = 'Modified to:';
    textCompareView.appendChild(replacementLabel);
    
    // Replacement text (in green and bold)
    const replacementSpan = document.createElement('div');
    replacementSpan.style.cssText = `
      color: #047857;
      font-weight: bold;
    `;
    replacementSpan.textContent = correction.replacement;
    textCompareView.appendChild(replacementSpan);
    
    cardContent.appendChild(textCompareView);
    
    // Original text (keep the original style, but as a reference)
    const originalText = document.createElement('div');
    originalText.style.cssText = `
      color: #dc2626;
      text-decoration: line-through;
      margin-bottom: 6px;
      font-size: 14px;
      display: none;
    `;
    originalText.textContent = correction.original;
    cardContent.appendChild(originalText);
    
    // Replacement text (keep the original style, but as a reference)
    const replacementText = document.createElement('div');
    replacementText.style.cssText = `
      color: #047857;
      font-weight: 500;
      margin-bottom: 6px;
      font-size: 14px;
      display: none;
    `;
    replacementText.textContent = correction.replacement;
    cardContent.appendChild(replacementText);
    
    // Explanation
    const explanationText = document.createElement('div');
    explanationText.style.cssText = `
      color: #6b7280;
      font-size: 12px;
      margin-bottom: 10px;
      border-left: 2px solid #d1d5db;
      padding-left: 8px;
    `;
    explanationText.textContent = correction.explanation;
    cardContent.appendChild(explanationText);
    
    // Action buttons
    const actionButtons = document.createElement('div');
    actionButtons.style.cssText = `
      display: flex;
      gap: 8px;
    `;
    
    const acceptBtn = document.createElement('button');
    acceptBtn.textContent = 'Accept';
    acceptBtn.style.cssText = `
      flex: 1;
      padding: 6px 0;
      background-color: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #047857;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    `;
    acceptBtn.addEventListener('click', () => updateCorrectionState(correction.id, true));
    actionButtons.appendChild(acceptBtn);
    
    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = 'Reject';
    rejectBtn.style.cssText = `
      flex: 1;
      padding: 6px 0;
      background-color: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #dc2626;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    `;
    rejectBtn.addEventListener('click', () => updateCorrectionState(correction.id, false));
    actionButtons.appendChild(rejectBtn);
    
    cardContent.appendChild(actionButtons);
    correctionCard.appendChild(cardContent);
    correctionsList.appendChild(correctionCard);
  });
  
  contentArea.appendChild(correctionsList);
  inlineMarker.appendChild(contentArea);
  
  // Create the bottom control button bar
  const controlsBar = document.createElement('div');
  controlsBar.style.cssText = `
    padding: 14px 16px;
    border-top: 1px solid #E5E5EA;
    display: flex;
    gap: 10px;
    background-color: #F2F2F7;
  `;
  
  const acceptAllBtn = document.createElement('button');
  acceptAllBtn.textContent = 'Accept All';
  acceptAllBtn.style.cssText = `
    padding: 12px;
    background-color: #34C759;
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    flex: 1;
  `;
  acceptAllBtn.addEventListener('click', async () => {
    // Disable the button to prevent repeated clicks
    acceptAllBtn.disabled = true;
    acceptAllBtn.style.opacity = '0.6';
    acceptAllBtn.textContent = 'Processing...';

    const correctionsToApply = [];
    const successfullyAcceptedIds = []; // Keep track of IDs that were visually marked as "Accepted"

    // Phase 1: Identify corrections and update UI to "Accepted" for pending ones
    for (const id in correctionStates) {
      if (correctionStates.hasOwnProperty(id)) {
        const state = correctionStates[id];
        const card = document.querySelector(`.correction-card-${id}`);
        const statusIndicator = document.querySelector(`.status-indicator-${id}`);

        if (state.accepted === null) { // Correction is pending
          state.accepted = true; // Mark as accepted (but not yet applied)
          successfullyAcceptedIds.push(id);
          
          if (statusIndicator) {
            statusIndicator.style.backgroundColor = '#E3FFF2'; // Light green for "Accepted"
            statusIndicator.style.color = '#34C759';
            statusIndicator.textContent = 'Accepted';
          }
          if (card) {
            const acceptCardBtn = card.querySelector('button:nth-of-type(1)');
            const rejectCardBtn = card.querySelector('button:nth-of-type(2)');
            if (acceptCardBtn) acceptCardBtn.disabled = true;
            if (rejectCardBtn) rejectCardBtn.disabled = true;
          }
          correctionsToApply.push(state.correction);
        } else if (state.accepted === true && !state.applied) { // Already accepted but not applied
          correctionsToApply.push(state.correction);
          successfullyAcceptedIds.push(id); // Ensure it's in this list for UI consistency
           // Ensure UI is up-to-date for these too
          if (statusIndicator && statusIndicator.textContent !== 'Accepted' && statusIndicator.textContent !== 'Applied' && statusIndicator.textContent !== 'Failed') {
              statusIndicator.style.backgroundColor = '#E3FFF2';
              statusIndicator.style.color = '#34C759';
              statusIndicator.textContent = 'Accepted';
          }
          if (card) {
              const acceptCardBtn = card.querySelector('button:nth-of-type(1)');
              const rejectCardBtn = card.querySelector('button:nth-of-type(2)');
              if (acceptCardBtn && !acceptCardBtn.disabled) acceptCardBtn.disabled = true;
              if (rejectCardBtn && !rejectCardBtn.disabled) rejectCardBtn.disabled = true;
          }
        }
      }
    }

    if (correctionsToApply.length === 0) {
      showMessage("No pending or unapplied changes to accept.", true, 3000, false);
      acceptAllBtn.disabled = false;
      acceptAllBtn.style.opacity = '1';
      acceptAllBtn.textContent = 'Accept All';
      return;
    }

    // Sort corrections by index (descending) to apply from back to front
    correctionsToApply.sort((a, b) => b.index - a.index);

    let appliedCount = 0;
    // Phase 2: Apply corrections
    for (const correction of correctionsToApply) {
      const state = correctionStates[correction.id];
      const success = applyDirectCorrection(correction); // applyDirectCorrection directly modifies content

      const card = document.querySelector(`.correction-card-${correction.id}`);
      const statusIndicator = document.querySelector(`.status-indicator-${correction.id}`);

      if (success) {
        state.applied = true;
        appliedCount++;
        if (card) {
          card.style.backgroundColor = '#F9FFF9'; // Applied success style
          card.style.borderColor = '#D1F3DF';
        }
        // Status indicator already 'Accepted', could change to 'Applied' if desired
        // if (statusIndicator) statusIndicator.textContent = 'Applied';
      } else {
        state.applied = false;
        // Keep state.accepted = true, but visually indicate failure
        if (card) {
          card.style.backgroundColor = ''; // Revert to default
          card.style.borderColor = '#e5e7eb';
          // Re-enable buttons on this specific card for manual retry
          const acceptCardBtn = card.querySelector('button:nth-of-type(1)');
          const rejectCardBtn = card.querySelector('button:nth-of-type(2)');
          if (acceptCardBtn) acceptCardBtn.disabled = false;
          if (rejectCardBtn) rejectCardBtn.disabled = false;
        }
        if (statusIndicator) {
          statusIndicator.style.backgroundColor = '#FFFBEB'; // Light yellow for "Failed"
          statusIndicator.style.color = '#D97706';    // Amber/orange for "Failed"
          statusIndicator.textContent = 'Failed';
        }
        console.warn("Failed to apply correction during Accept All:", correction);
      }
       // Optional: Short pause if many changes still cause issues
       // await new Promise(resolve => setTimeout(resolve, 30)); 
    }

    // Update the original text preview once after all applications
    updateOriginalTextPreview(originalText, Object.values(correctionStates));

    if (appliedCount > 0 && appliedCount === correctionsToApply.length) {
      showMessage(`Applied all ${appliedCount} changes.`, true, 3000, false);
    } else if (appliedCount > 0) {
      showMessage(`Applied ${appliedCount} out of ${correctionsToApply.length} changes. Some failed.`, true, 4000, false);
    } else {
      showMessage("No changes were successfully applied. Please check suggestions.", false, 4000, false);
    }

    acceptAllBtn.disabled = false;
    acceptAllBtn.style.opacity = '1';
    acceptAllBtn.textContent = 'Accept All';
  });
  controlsBar.appendChild(acceptAllBtn);
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Finish';
  closeBtn.style.cssText = `
    padding: 12px;
    background-color: #007AFF;
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    flex: 1;
  `;
  closeBtn.addEventListener('click', () => {
    // Check if there are pending changes that have been accepted but not applied
    const pendingCorrections = Object.keys(correctionStates).filter(id => 
      correctionStates[id].accepted === true && !correctionStates[id].applied
    );
    
    if (pendingCorrections.length > 0) {
      // Pop up a confirmation dialog to confirm if the user wants to close
      const confirmContainer = document.createElement('div');
      confirmContainer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: white;
        color: #1f2937;
        padding: 20px;
        border-radius: 14px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        font-size: 15px;
        max-width: 400px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      `;
      
      const confirmMessage = document.createElement('div');
      confirmMessage.textContent = `You have ${pendingCorrections.length} accepted ${pendingCorrections.length === 1 ? 'change' : 'changes'} that ${pendingCorrections.length === 1 ? 'hasn\'t' : 'haven\'t'} been applied yet. Apply ${pendingCorrections.length === 1 ? 'it' : 'them'} before closing?`;
      confirmMessage.style.fontWeight = '500';
      
      const confirmButtons = document.createElement('div');
      confirmButtons.style.cssText = `
        display: flex;
        gap: 10px;
      `;
      
      const confirmYesBtn = document.createElement('button');
      confirmYesBtn.textContent = 'Apply & Close';
      confirmYesBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background-color: #007AFF;
        color: white;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      `;
      confirmYesBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
        
        // Show the message that changes are being applied
        showMessage("Applying remaining changes...", true, 5000);
        
        // Call the application logic
        const corrections = pendingCorrections.map(id => correctionStates[id].correction);
        
        // Use Promise sequence to apply changes one by one
        const applyAndClose = async () => {
          // Apply changes from back to front to avoid index offset
          corrections.sort((a, b) => b.index - a.index);
          
          for (const correction of corrections) {
            // Apply changes directly
            applyDirectCorrection(correction);
            
            // Brief pause
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Close the sidebar
          removeInlineMarker();
          // Ensure the popup also closes
          removeSuggestionContainer();
          
          // Show the message that changes are done
          showMessage("All changes applied successfully!", true, 3000);
        };
        
        applyAndClose();
      });
      
      const confirmNoBtn = document.createElement('button');
      confirmNoBtn.textContent = 'Close Without Applying';
      confirmNoBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background-color: #F2F2F7;
        color: #007AFF;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      `;
      confirmNoBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
        removeInlineMarker();
        // 确保弹窗也关闭
        removeSuggestionContainer();
      });
      
      const confirmCancelBtn = document.createElement('button');
      confirmCancelBtn.textContent = 'Cancel';
      confirmCancelBtn.style.cssText = `
        padding: 12px;
        background: none;
        color: #8E8E93;
        border: none;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        text-align: center;
      `;
      confirmCancelBtn.addEventListener('click', () => {
        document.body.removeChild(confirmContainer);
      });
      
      confirmButtons.appendChild(confirmYesBtn);
      confirmButtons.appendChild(confirmNoBtn);
      
      confirmContainer.appendChild(confirmMessage);
      confirmContainer.appendChild(confirmButtons);
      confirmContainer.appendChild(confirmCancelBtn);
      
      document.body.appendChild(confirmContainer);
    } else {
      // If there are no pending changes, close directly
      removeInlineMarker();
      // Ensure the popup also closes
      removeSuggestionContainer();
      showMessage("Finished!", true, 2000);
    }
  });
  controlsBar.appendChild(closeBtn);
  
  inlineMarker.appendChild(controlsBar);
  
  // Add to the document
  document.body.appendChild(inlineMarker);
  
  // Update the function of modifying the status
  function updateCorrectionState(id, accepted) {
    if (correctionStates[id]) {
      const previousState = correctionStates[id].accepted;
      correctionStates[id].accepted = accepted;
      
      // Update the UI
      const statusIndicator = document.querySelector(`.status-indicator-${id}`);
      if (statusIndicator) {
        if (accepted) {
          statusIndicator.style.backgroundColor = '#E3FFF2';
          statusIndicator.style.color = '#34C759';
          statusIndicator.textContent = 'Accepted';
          
          // If the change is accepted from the not accepted state, apply it immediately
          if (previousState !== true) {
            const correction = correctionStates[id].correction;
            
            // Apply this change directly
            const success = applyDirectCorrection(correction);
            
            if (success) {
              // Mark as applied
              correctionStates[id].applied = true;
              
              // Ensure the sidebar is not removed when there is a sidebar
              if (inlineMarker) {
                showMessage(`Applied change: "${correction.original.substring(0, 15)}${correction.original.length > 15 ? '...' : ''}"`, true, 5000, false);
              } else {
                showMessage(`Applied change: "${correction.original}" → "${correction.replacement}"`, true, 5000);
              }
              
              // Update the card UI to show the applied status
              const card = document.querySelector(`.correction-card-${id}`);
              if (card) {
                card.style.backgroundColor = '#F9FFF9';
                card.style.borderColor = '#D1F3DF';
              }
            } else {
              correctionStates[id].applied = false;
              
              // Ensure the sidebar is not removed when there is a sidebar
              if (inlineMarker) {
                showMessage(`Unable to apply change. Try replacing manually.`, false, 3000, false);
              } else {
                showMessage(`Unable to apply change. Try replacing manually.`, false, 3000);
              }
              
              // Provide a choice: copy the replacement text to the clipboard
              try {
                navigator.clipboard.writeText(correction.replacement);
                
                // Ensure the sidebar is not removed when there is a sidebar
                if (inlineMarker) {
                  showMessage("Replacement text copied to clipboard", true, 2000, false);
                } else {
                  showMessage("Replacement text copied to clipboard", true, 2000);
                }
              } catch (err) {
                console.error("Failed to copy to clipboard:", err);
              }
            }
            
            // Update the error marks in the original text preview
            updateOriginalTextPreview(originalText, Object.values(correctionStates));
          }
        } else if (accepted === false) {
          statusIndicator.style.backgroundColor = '#FFEBE8';
          statusIndicator.style.color = '#FF3B30';
          statusIndicator.textContent = 'Rejected';
        } else {
          statusIndicator.style.backgroundColor = '#E5E5EA';
          statusIndicator.style.color = '#8E8E93';
          statusIndicator.textContent = 'Pending';
        }
      }
    }
  }
}
  
// Function: Apply the selected changes
function applySelectedCorrections(originalText, states) {
  console.log('Applying corrections, originalText:', originalText);
  console.log('Active element:', activeElement);
  console.log('Last caret position:', lastCaret);
  
  let result = originalText;
  const acceptedCorrections = [];
  
  // Collect all accepted changes
  Object.values(states).forEach(state => {
    if (state.accepted === true) {
      acceptedCorrections.push(state.correction);
    }
  });
  
  if (acceptedCorrections.length === 0) {
    showMessage("No changes accepted", false, 3000);
    return;
  }
  
  console.log('Accepted corrections:', acceptedCorrections);
  
  // Apply changes from back to front to avoid index offset
  acceptedCorrections
    .sort((a, b) => b.index - a.index)
    .forEach(correction => {
      const before = result.substring(0, correction.index);
      const after = result.substring(correction.index + correction.length);
      result = before + correction.replacement + after;
    });
  
  console.log('Result after applying corrections:', result);
  
  // Check the active element
  if (!activeElement) {
    // Try to find the active element again
    try {
      activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) {
        // Try to find the editable element from the selection
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          let node = selection.getRangeAt(0).startContainer;
          while (node && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.isContentEditable || node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
                activeElement = node;
                console.log('Found editable element from selection:', activeElement);
                break;
              }
            }
            node = node.parentNode;
          }
        }
      }
    } catch (err) {
      console.error('Error trying to find active element:', err);
    }
    
    if (!activeElement || activeElement === document.body) {
      showMessage("Cannot find the editable element, please click the text to edit and try again", false, 4000);
      return;
    }
  }
  
  console.log('Active element tag:', activeElement.tagName);
  console.log('Is content editable:', activeElement.isContentEditable);
  
  let success = false;
  
  // Apply to the text
  if (activeElement.isContentEditable) {
    try {
      const selection = window.getSelection();
      let range;
      
      // Try to restore the saved range
      if (lastCaret && lastCaret.range) {
        try {
          range = lastCaret.range.cloneRange();
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (rangeErr) {
          console.warn('Failed to restore saved range:', rangeErr);
          if (selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
          } else {
            // If there is no selection, try to create a range that covers the entire element
            try {
              range = document.createRange();
              range.selectNodeContents(activeElement);
              selection.removeAllRanges();
              selection.addRange(range);
            } catch (createRangeErr) {
              console.error('Failed to create range:', createRangeErr);
            }
          }
        }
      } else if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      } else {
        // Try to create a range that covers the entire element
        try {
          range = document.createRange();
          range.selectNodeContents(activeElement);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (createRangeErr) {
          console.error('Failed to create range:', createRangeErr);
        }
      }
      
      // Check if the range was successfully obtained
      if (range) {
        try {
          // Clear the current selection content and insert new text
          range.deleteContents();
          const textNode = document.createTextNode(result);
          range.insertNode(textNode);
          
          // Reset the selection to the end of the text
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          
          console.log('Applied with range manipulation');
          success = true;
        } catch (insertErr) {
          console.error('Error inserting text with range:', insertErr);
          
          // Try to set innerHTML directly
          try {
            activeElement.innerHTML = result;
            console.log('Applied by setting innerHTML');
            success = true;
          } catch (innerHTMLErr) {
            console.error('Error setting innerHTML:', innerHTMLErr);
          }
        }
      } else {
        console.warn('No valid range available, trying innerHTML');
        try {
          activeElement.innerHTML = result;
          console.log('Applied by setting innerHTML');
          success = true;
        } catch (err) {
          console.error('Error setting innerHTML:', err);
        }
      }
      
      // Finally try execCommand as a fallback method
      if (!success) {
        try {
          if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, result);
            console.log('Applied with execCommand');
            success = true;
          }
        } catch (cmdErr) {
          console.error('execCommand failed:', cmdErr);
        }
      }
    } catch (err) {
      console.error('Error applying to contentEditable:', err);
    }
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    try {
      const value = activeElement.value;
      
      // Determine the replacement range
      let selStart, selEnd;
      
      // Use the saved cursor position (if any)
      if (lastCaret && typeof lastCaret.start !== 'undefined' && typeof lastCaret.end !== 'undefined') {
        selStart = lastCaret.start;
        selEnd = lastCaret.end;
      } else {
        // Otherwise use the current selection or replace the entire content
        selStart = activeElement.selectionStart || 0;
        selEnd = activeElement.selectionEnd || value.length;
      }
      
      // Check if the selection length is similar to the original text length (allow some error)
      const selectedText = value.substring(selStart, selEnd);
      if (Math.abs(selectedText.length - originalText.length) > originalText.length * 0.3 && originalText.length > 10) {
        // If the selection length is significantly different from the original text length, try to find the original text in the entire text
        const startIdx = value.indexOf(originalText);
        if (startIdx !== -1) {
          selStart = startIdx;
          selEnd = startIdx + originalText.length;
          console.log('Found better match for selection at index:', startIdx);
        } else {
          console.warn('Could not find exact match for original text in value');
        }
      }
      
      console.log('Selected text length:', selectedText.length, 'Original text length:', originalText.length);
      console.log('Selection start:', selStart, 'Selection end:', selEnd);
      
      // Save the scroll position
      const scrollTop = activeElement.scrollTop;
      
      // Set the new value
      activeElement.value = value.substring(0, selStart) + result + value.substring(selEnd);
      
      // Restore the scroll position
      activeElement.scrollTop = scrollTop;
      
      // Restore focus and selection
      activeElement.focus();
      try {
        activeElement.setSelectionRange(selStart, selStart + result.length);
      } catch (selErr) {
        console.warn('Could not set selection range:', selErr);
      }
      
      console.log('New value:', activeElement.value);
      
      // Trigger the input event to ensure the change is processed
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      success = true;
    } catch (err) {
      console.error('Error applying to input/textarea:', err);
    }
  } else {
    console.warn('Unknown element type, cannot apply corrections');
    showMessage("Cannot modify this type of element", false, 3000);
  }
  
  // Show success or failure message
  if (success) {
    showMessage("Changes applied!", true, 2000);
  } else {
    showMessage("Failed to apply changes, please try to copy the result manually", false, 4000);
    
    // Provide copy functionality as a backup
    try {
      navigator.clipboard.writeText(result)
        .then(() => {
          console.log('Result text copied to clipboard');
          showMessage("The modified text has been copied to the clipboard", true, 3000);
        })
        .catch(clipErr => {
          console.error('Failed to copy to clipboard:', clipErr);
        });
    } catch (clipErr) {
      console.error('Failed to copy to clipboard:', clipErr);
    }
  }
  
  // Remove the marker
  removeInlineMarker();
}

// Remove the inline marker
function removeInlineMarker() {
  if (inlineMarker) {
    // Remove the keyboard event listener
    if (inlineMarker.keyHandler) {
      document.removeEventListener('keydown', inlineMarker.keyHandler);
    }
    
    if (inlineMarker.parentNode) {
      inlineMarker.parentNode.removeChild(inlineMarker);
    }
    inlineMarker = null;
  }
}

// Show simple message
function showMessage(message, isSuccess = true, duration = 4000, removeInline = true) {
  // Never automatically remove sidebar, only when explicitly requested
  if (removeInline) {
    removeInlineMarker();
  }
  
  // Remove existing messages to avoid overlapping
  const existingMessages = document.querySelectorAll('.grammar-bot-message-container');
  existingMessages.forEach(msg => {
    if (msg.parentNode) {
      msg.parentNode.removeChild(msg);
    }
  });
  
  // If there's a sidebar, use inline message without removing the sidebar
  if (inlineMarker) {
    // Create internal notification
    const statusMsg = document.createElement('div');
    statusMsg.textContent = message;
    statusMsg.style.cssText = `
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background-color: ${isSuccess ? '#34C759' : '#FF3B30'};
      color: white;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      font-size: 15px;
      font-weight: 500;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    inlineMarker.appendChild(statusMsg);
    setTimeout(() => {
      statusMsg.style.opacity = '1';
    }, 10);
    setTimeout(() => {
      statusMsg.style.opacity = '0';
      setTimeout(() => {
        if (statusMsg.parentNode) {
          statusMsg.parentNode.removeChild(statusMsg);
        }
      }, 300);
    }, duration);
    
    return;
  }
  
  const messageContainer = document.createElement('div');
  messageContainer.className = 'grammar-bot-message-container';
  messageContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: ${isSuccess ? '#34C759' : '#FF3B30'};
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    font-size: 15px;
    font-weight: 500;
    max-width: 80%;
    word-wrap: break-word;
    animation: grammar-bot-fade-in 0.3s ease-out;
  `;
  
  // Add style to ensure animation works
  if (!document.getElementById('grammar-bot-animations')) {
    const style = document.createElement('style');
    style.id = 'grammar-bot-animations';
    style.textContent = `
      @keyframes grammar-bot-fade-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes grammar-bot-fade-out {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(20px); }
      }
      
      .grammar-bot-message-fade-out {
        animation: grammar-bot-fade-out 0.3s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }
  
  messageContainer.textContent = message;
  
  document.body.appendChild(messageContainer);
  
  // Fade out and remove message after specified duration
  setTimeout(() => {
    messageContainer.classList.add('grammar-bot-message-fade-out');
    setTimeout(() => {
      if (messageContainer && messageContainer.parentNode) {
        messageContainer.parentNode.removeChild(messageContainer);
      }
    }, 300); // Wait for fade-out animation to complete
  }, duration);
  
  // Click message to dismiss it
  messageContainer.addEventListener('click', () => {
    messageContainer.classList.add('grammar-bot-message-fade-out');
    setTimeout(() => {
      if (messageContainer && messageContainer.parentNode) {
        messageContainer.parentNode.removeChild(messageContainer);
      }
    }, 300);
  });
}

// Handle API response
function handleResponse(response) {
  // Clear the loading timeout
  if (suggestionContainer && suggestionContainer.loadingTimeout) {
    clearTimeout(suggestionContainer.loadingTimeout);
    suggestionContainer.loadingTimeout = null;
  }
  
  // Ensure the loading UI is cleared
  const loadingUI = suggestionContainer && suggestionContainer.querySelector('.grammar-bot-loading');
  if (loadingUI) {
    // Convert to completed state instead of removing
    loadingUI.innerHTML = `
      <div style="width: 32px; height: 32px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>
      <div style="text-align: center; color: #16a34a; font-weight: 500;">Text processing completed</div>
    `;
    
    // Close the popup after 2 seconds (only if not a rewrite mode that shows its own persistent UI)
    if (currentMode !== 'shorten' && currentMode !== 'expand' && currentMode !== 'tone') {
      setTimeout(() => {
        if (suggestionContainer && !inlineMarker) {
          removeSuggestionContainer();
        }
      }, 2000);
    }
  }
  
  if (response.error) {
    showError(response.error);
    return;
  }

  try {
    const result = response.result;
    console.log("API response:", result);
    
    // Handle different types of responses based on the mode
    if (result.startsWith('[') && result.endsWith(']')) {
      // This is likely JSON for grammar or Chinglish mode
      try {
        let suggestions = JSON.parse(result);
        console.log("Parsed JSON suggestions:", suggestions);
        
        // Ensure all suggestions have the required fields
        const validSuggestions = suggestions.filter(item => 
          item && item.original && (item.replacement || item.corrected) && 
          typeof item.index !== 'undefined' && typeof item.length !== 'undefined'
        );
        
        if (validSuggestions.length === 0) {
          if (suggestions.length === 0) {
            showMessage("No issues found", true, 3000);
          } else {
            console.warn("Found suggestions but missing required fields:", suggestions);
            showMessage("Error parsing response, suggestion format is incorrect", false, 3000);
          }
        } else {
          console.log("Number of valid suggestions:", validSuggestions.length);
          
          // Ensure each suggestion has the correct index and length
          validSuggestions.forEach((suggestion, i) => {
            if (!suggestion.replacement && suggestion.corrected) {
              suggestion.replacement = suggestion.corrected;
            }
            if (typeof suggestion.index !== 'number') {
              suggestion.index = originalText.indexOf(suggestion.original);
            }
            if (typeof suggestion.length !== 'number' || suggestion.length <= 0) {
              suggestion.length = suggestion.original.length;
            }
          });
          
          // Both grammar and Chinglish modes will now use the same format with replacement, index, length
          // Get the selection range (needed for positioning the UI)
          const selection = window.getSelection();
          if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            // Pass the current mode to createInlineCorrections
            createInlineCorrections(originalText, validSuggestions, range, currentMode);
          } else {
            showSuggestions(validSuggestions);
          }
        }
      } catch (e) {
        console.error("JSON parsing error:", e);
        // If JSON parsing fails, show the error and the raw text
        showError(`Error parsing JSON response: ${e.message}. Raw response: ${result.substring(0, 100)}...`);
      }
    } else {
      // Simple text rewrite for shorten, expand, and tone modes
      showRewrite(result);
    }
  } catch (error) {
    showError('Error processing response: ' + error.message);
  }
}

// Show loading message
function showLoadingMessage() {
  removeSuggestionContainer();
  
  suggestionContainer = document.createElement('div');
  suggestionContainer.className = 'grammar-bot-container';
  suggestionContainer.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #000;
    max-width: 400px;
    width: 90%;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  `;

  const loadingContent = document.createElement('div');
  loadingContent.className = 'grammar-bot-loading';
  loadingContent.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 15px;
    font-weight: 500;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 20px;
    height: 20px;
    border: 2px solid #007AFF;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  loadingContent.appendChild(spinner);
  loadingContent.appendChild(document.createTextNode('Processing...'));
  suggestionContainer.appendChild(loadingContent);
  suggestionContainer.appendChild(style);
  document.body.appendChild(suggestionContainer);
  
  positionContainer();
}

// Show suggestions UI for grammar and Chinglish modes
function showSuggestions(suggestions) {
  removeSuggestionContainer();
  
  suggestionContainer = document.createElement('div');
  suggestionContainer.className = 'grammar-bot-container';
  suggestionContainer.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #000;
    max-width: 400px;
    width: 90%;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  `;

  const title = document.createElement('div');
  title.textContent = 'Suggestions';
  title.style.cssText = `
    font-size: 17px;
    font-weight: 600;
    color: #000;
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    color: #666;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    &:hover {
      color: #000;
    }
  `;
  closeButton.onclick = removeSuggestionContainer;

  header.appendChild(title);
  header.appendChild(closeButton);
  suggestionContainer.appendChild(header);

  const suggestionsList = document.createElement('div');
  suggestionsList.style.cssText = `
    max-height: 300px;
    overflow-y: auto;
    margin: 0 -16px;
    padding: 0 16px;
  `;

  suggestions.forEach((suggestion, index) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.style.cssText = `
      padding: 12px;
      margin: 8px 0;
      background: #F2F2F7;
      border-radius: 8px;
      font-size: 15px;
      line-height: 1.4;
    `;

    const originalText = document.createElement('div');
    originalText.textContent = suggestion.original;
    originalText.style.cssText = `
      color: #666;
      margin-bottom: 4px;
      text-decoration: line-through;
    `;

    const replacementText = document.createElement('div');
    replacementText.textContent = suggestion.replacement;
    replacementText.style.cssText = `
      color: #000;
      font-weight: 500;
    `;

    const explanation = document.createElement('div');
    explanation.textContent = suggestion.explanation;
    explanation.style.cssText = `
      color: #666;
      font-size: 13px;
      margin-top: 4px;
    `;

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.style.cssText = `
      background: #007AFF;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 14px;
      font-weight: 500;
      margin-top: 8px;
      cursor: pointer;
      &:hover {
        background: #0066CC;
      }
    `;
    applyButton.onclick = () => applyDirectCorrection(suggestion);

    suggestionItem.appendChild(originalText);
    suggestionItem.appendChild(replacementText);
    suggestionItem.appendChild(explanation);
    suggestionItem.appendChild(applyButton);
    suggestionsList.appendChild(suggestionItem);
  });

  suggestionContainer.appendChild(suggestionsList);
  document.body.appendChild(suggestionContainer);
  positionContainer();
}

// Show rewrite UI for shorten, expand, and tone modes
function showRewrite(rewrittenText) {
  // Remove any existing loading UI
  if (suggestionContainer) {
    // Preserve the container but clear its contents
    suggestionContainer.innerHTML = '';
  } else {
    // Create a new container if one doesn't exist
    suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'grammar-bot-container';
    document.body.appendChild(suggestionContainer);
  }
  
  // Add new content
  suggestionContainer.innerHTML = `
    <div class="grammar-bot-header">
      <span>GrammarBot</span>
      <button class="grammar-bot-close">&times;</button>
    </div>
    <div class="grammar-bot-content">
      <div class="grammar-bot-rewrite">
        <div class="grammar-bot-compare">
          <div style="margin-bottom: 16px;">
            <div style="font-weight: 600; font-size: 15px; color: #3A3A3C; margin-bottom: 6px;">Original</div>
            <div style="color: #8E8E93; font-size: 15px; padding: 12px; background-color: #F2F2F7; border-radius: 12px;">${escapeHtml(originalText)}</div>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 15px; color: #3A3A3C; margin-bottom: 6px;">Result</div>
            <div style="color: #007AFF; font-weight: 500; font-size: 15px; padding: 12px; background-color: #F2F2F7; border-radius: 12px;">${escapeHtml(rewrittenText)}</div>
          </div>
        </div>
        <div class="grammar-bot-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="grammar-bot-apply" style="flex: 1; padding: 12px; background-color: #007AFF; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;">Apply Changes</button>
          <button class="grammar-bot-copy" style="padding: 12px; background-color: #F2F2F7; color: #007AFF; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; flex: 1;">Copy</button>
        </div>
        <div class="grammar-bot-help-text" style="margin-top: 12px; font-size: 13px; color: #8E8E93; text-align: center;">
          If "Apply Changes" doesn't work, use "Copy" and paste manually.
        </div>
      </div>
    </div>
  `;
  
  // Position container near the selected text
  positionContainer();
  
  // Add event listeners
  const closeButton = suggestionContainer.querySelector('.grammar-bot-close');
  closeButton.addEventListener('click', removeSuggestionContainer);
  
  const applyButton = suggestionContainer.querySelector('.grammar-bot-apply');
  applyButton.addEventListener('click', () => {
    applyRewrite(rewrittenText);
  });
  
  const copyButton = suggestionContainer.querySelector('.grammar-bot-copy');
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(rewrittenText)
      .then(() => {
        copyButton.textContent = 'Copied!';
        copyButton.style.backgroundColor = '#34C759';
        copyButton.style.color = 'white';
        setTimeout(() => {
          copyButton.textContent = 'Copy';
          copyButton.style.backgroundColor = '';
          copyButton.style.color = '#007AFF';
        }, 2000);
        
        showMessage("Text copied to clipboard!", true, 2000);
        removeSuggestionContainer();
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        showMessage("Failed to copy text", false, 3000);
        
        // Fallback copy method
        try {
          const textarea = document.createElement('textarea');
          textarea.value = rewrittenText;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          
          copyButton.textContent = 'Copied!';
          copyButton.style.backgroundColor = '#34C759';
          copyButton.style.color = 'white';
          setTimeout(() => {
            copyButton.textContent = 'Copy Text';
            copyButton.style.backgroundColor = '#007AFF';
          }, 2000);
          
          showMessage("Text copied to clipboard!", true, 2000);
          removeSuggestionContainer();
        } catch (fallbackErr) {
          console.error('Fallback copy also failed:', fallbackErr);
          showMessage("Unable to copy text", false, 3000);
        }
      });
  });
}

// Show error message
function showError(errorMessage) {
  removeSuggestionContainer();
  
  suggestionContainer = document.createElement('div');
  suggestionContainer.className = 'grammar-bot-container';
  suggestionContainer.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #000;
    max-width: 400px;
    width: 90%;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  `;

  const errorContent = document.createElement('div');
  errorContent.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    color: #FF3B30;
    font-size: 15px;
    font-weight: 500;
  `;

  const errorIcon = document.createElement('div');
  errorIcon.innerHTML = '⚠️';
  errorIcon.style.cssText = `
    font-size: 20px;
  `;

  errorContent.appendChild(errorIcon);
  errorContent.appendChild(document.createTextNode(errorMessage));
  suggestionContainer.appendChild(errorContent);
  document.body.appendChild(suggestionContainer);
  
  positionContainer();
}

// Position the suggestion container near the selected text
function positionContainer() {
  if (!suggestionContainer) return;
  
  const selection = window.getSelection();
  
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    const containerRect = suggestionContainer.getBoundingClientRect();
    
    // Position the container below the selection
    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;
    
    // Adjust if the container would go off-screen
    if (left + containerRect.width > window.innerWidth) {
      left = window.innerWidth - containerRect.width - 20;
    }
    
    suggestionContainer.style.position = 'absolute';
    suggestionContainer.style.top = `${top}px`;
    suggestionContainer.style.left = `${left}px`;
    suggestionContainer.style.zIndex = '9999';
  } else if (activeElement) {
    // If no selection but we have an active element
    const rect = activeElement.getBoundingClientRect();
    
    suggestionContainer.style.position = 'absolute';
    suggestionContainer.style.top = `${rect.bottom + window.scrollY + 10}px`;
    suggestionContainer.style.left = `${rect.left + window.scrollX}px`;
    suggestionContainer.style.zIndex = '9999';
  }
}

// Remove the suggestion container
function removeSuggestionContainer() {
  if (suggestionContainer && suggestionContainer.parentNode) {
    suggestionContainer.parentNode.removeChild(suggestionContainer);
    suggestionContainer = null;
  }
}

// Replace suggestion
function replaceSuggestion(original, replacement) {
  console.log('Replacing suggestion, original:', original, 'replacement:', replacement);
  console.log('Active element:', activeElement);
  console.log('Last caret position:', lastCaret);
  
  if (!activeElement) {
    console.warn('No active element found to replace suggestion');
    try {
      activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          let node = selection.getRangeAt(0).startContainer;
          while (node && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.isContentEditable || node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
                activeElement = node;
                console.log('Found editable element from selection:', activeElement);
                break;
              }
            }
            node = node.parentNode;
          }
        }
      }
    } catch (err) {
      console.error('Error trying to find active element:', err);
    }
    
    if (!activeElement || activeElement === document.body) {
      showMessage("Cannot find editable element, please click the text you want to edit and try again", false, 4000);
      return;
    }
  }
  
  console.log('Active element tag:', activeElement.tagName);
  console.log('Is content editable:', activeElement.isContentEditable);
  
  let success = false;
  
  if (activeElement.isContentEditable) {
    try {
      // Try to replace text in the selection
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        // If we have a saved range, we can restore it
        let range;
        if (lastCaret && lastCaret.range) {
          try {
            range = lastCaret.range.cloneRange();
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (rangeErr) {
            console.warn('Failed to restore saved range:', rangeErr);
            range = selection.getRangeAt(0);
          }
        } else {
          range = selection.getRangeAt(0);
        }
        
        // Get the current selection content or use the saved original text
        const content = originalText || range.toString();

        if (!content.includes(original)) {
          console.warn(`Original text "${original}" not found in content: "${content}"`);
          // Try using the full text for replacement
          let fullText = '';
          try {
            fullText = activeElement.innerText || activeElement.textContent;
            if (fullText.includes(original)) {
              // If the original text is found in the full content, use the entire content for replacement
              activeElement.innerText = fullText.replace(original, replacement);
              console.log('Using full content for replacement');
              success = true;
            }
          } catch (getTextErr) {
            console.error('Failed to get full text:', getTextErr);
          }
          
          if (!success) {
            showMessage("Cannot find original text, cannot apply changes", false, 3000);
          }
        } else {
          // Execute replacement
          const newContent = content.replace(original, replacement);
          
          // Clear the current selection content and insert new text
          try {
            range.deleteContents();
            const textNode = document.createTextNode(newContent);
            range.insertNode(textNode);
            
            // Reset the selection to the end of the text
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            
            console.log('Using Range operation to apply replacement');
            success = true;
          } catch (rangeInsertErr) {
            console.error('Range insertion failed:', rangeInsertErr);
            // Try direct HTML replacement
            try {
              activeElement.innerHTML = activeElement.innerHTML.replace(
                escapeRegExp(original), 
                replacement
              );
              console.log('Using innerHTML replacement to apply changes');
              success = true;
            } catch (innerHTMLErr) {
              console.error('innerHTML replacement failed:', innerHTMLErr);
            }
          }
        }
      } else {
        console.warn('No selection found, trying to use innerHTML');
        try {
          const html = activeElement.innerHTML;
          if (html.includes(original)) {
            activeElement.innerHTML = html.replace(escapeRegExp(original), replacement);
            console.log('Using innerHTML to apply replacement');
            success = true;
          } else if (activeElement.innerText && activeElement.innerText.includes(original)) {
            activeElement.innerText = activeElement.innerText.replace(original, replacement);
            console.log('Using innerText to apply replacement');
            success = true;
          } else {
            console.warn('Original text not found in HTML and text');
          }
        } catch (htmlErr) {
          console.error('HTML replacement failed:', htmlErr);
        }
      }
      
      // If still not successful, try execCommand as a last fallback method
      if (!success) {
        try {
          if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, replacement);
            console.log('Using execCommand to apply replacement');
            success = true;
          }
        } catch (cmdErr) {
          console.error('execCommand replacement failed:', cmdErr);
        }
      }
    } catch (err) {
      console.error('Error replacing editable content:', err);
    }
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    try {
      const value = activeElement.value;
      
      // Determine the replacement range
      let selStart, selEnd;
      
      // Use the saved cursor position (if any)
      if (lastCaret && typeof lastCaret.start !== 'undefined' && typeof lastCaret.end !== 'undefined') {
        selStart = lastCaret.start;
        selEnd = lastCaret.end;
      } else {
        // Otherwise use the current selection or replace the entire content
        selStart = activeElement.selectionStart || 0;
        selEnd = activeElement.selectionEnd || value.length;
      }
      
      console.log('Selection start:', selStart, 'Selection end:', selEnd);
      
      // Get the selected text or the entire content
      const selectedText = selStart !== selEnd ? value.substring(selStart, selEnd) : value;
      
      let newValue;
      
      // Check if the original text exists in the selection
      if (selectedText.includes(original)) {
        // If the original text is found in the selection, only replace the selection content
        const newText = selectedText.replace(original, replacement);
        newValue = value.substring(0, selStart) + newText + value.substring(selEnd);
        
        // Calculate the new selection position
        const newSelEnd = selStart + newText.length;
        
        // Save the scroll position
        const scrollTop = activeElement.scrollTop;
        
        // Apply changes
        activeElement.value = newValue;
        
        // Restore the scroll position
        activeElement.scrollTop = scrollTop;
        
        // Restore focus and selection
        activeElement.focus();
        try {
          activeElement.setSelectionRange(selStart, newSelEnd);
        } catch (selErr) {
          console.warn('Failed to set selection range:', selErr);
        }
        
        success = true;
      } else if (value.includes(original)) {
        // If the original text is found in the entire content, replace the first match
        newValue = value.replace(original, replacement);
        
        // Save the scroll position
        const scrollTop = activeElement.scrollTop;
        
        // Apply changes
        activeElement.value = newValue;
        
        // Restore the scroll position
        activeElement.scrollTop = scrollTop;
        
        // Try to set the cursor position after the replacement text
        const replaceIndex = value.indexOf(original);
        if (replaceIndex >= 0) {
          const newPos = replaceIndex + replacement.length;
          try {
            activeElement.setSelectionRange(newPos, newPos);
          } catch (selErr) {
            console.warn('Failed to set cursor position:', selErr);
          }
        }
        
        success = true;
      } else {
        console.warn(`Original text "${original}" not found in element value`);
        showMessage("Cannot find original text, cannot apply changes", false, 3000);
      }
      
      if (success) {
        // Trigger input event to ensure changes are processed
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Applied to input/textarea');
      }
    } catch (err) {
      console.error('Error replacing input/textarea:', err);
    }
  } else {
    console.warn('Unknown element type, cannot replace:', activeElement.tagName);
    showMessage("Cannot modify this type of element", false, 3000);
    return;
  }
  
  if (suggestionContainer && !inlineMarker) {
    removeSuggestionContainer();
  }
  
  if (success) {
    showMessage("Changes applied!", true, 2000, false);
  } else {
    showMessage("Failed to apply changes, please try to copy and replace the text manually", false, 4000, false);
    
    try {
      navigator.clipboard.writeText(replacement)
        .then(() => {
          console.log('Copied replacement text to clipboard');
        })
        .catch(clipErr => {
          console.error('Failed to copy to clipboard:', clipErr);
        });
    } catch (clipErr) {
      console.error('Failed to copy to clipboard:', clipErr);
    }
  }
}

// Helper function: Escape special characters in regular expressions
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function: Find the best match position
function findBestMatchPosition(text, pattern) {
  // 1. Try to match after removing spaces
  const noSpaceText = text.replace(/\s+/g, '');
  const noSpacePattern = pattern.replace(/\s+/g, '');
  
  const cleanIndex = noSpaceText.indexOf(noSpacePattern);
  if (cleanIndex !== -1) {
    // Find the corresponding position in the original text
    let spaceCount = 0;
    let originalIndex = 0;
    
    for (let i = 0; i < text.length && originalIndex < text.length; i++) {
      if (i - spaceCount === cleanIndex) {
        originalIndex = i;
        break;
      }
      
      if (/\s/.test(text[i])) {
        spaceCount++;
      }
    }
    
    console.log("Found position through space removal:", originalIndex);
    return originalIndex;
  }
  
  // 2. Longest common substring matching
  function longestCommonSubstring(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
    let maxLength = 0;
    let endPos = 0;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i-1] === s2[j-1]) {
          dp[i][j] = dp[i-1][j-1] + 1;
          if (dp[i][j] > maxLength) {
            maxLength = dp[i][j];
            endPos = i - 1;
          }
        }
      }
    }
    
    return {
      length: maxLength,
      substring: s1.substring(endPos - maxLength + 1, endPos + 1),
      position: endPos - maxLength + 1
    };
  }
  
  const commonResult = longestCommonSubstring(text, pattern);
  if (commonResult.length > pattern.length * 0.6) {
    console.log("Found position through longest common substring:", commonResult.position);
    return commonResult.position;
  }
  
  // 3. If nothing is found, try starting from the beginning
  console.log("No match found, returning 0");
  return 0;
}

function applyDirectCorrection(correction) {
  if (!activeElement) {
    console.warn('Cannot find editable element, please click the text area and try again');
    showMessage("Cannot find editable element, please click the text area and try again", false, 3000);
    return false;
  }
  
  console.log('Applying direct correction:', correction);
  
  let success = false;
  if (activeElement.isContentEditable) {
    success = applyToContentEditable(correction);
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    success = applyToInput(correction);
  } else {
    showMessage("Unsupported element type, cannot apply changes", false, 3000);
    return false;
  }
  
  // Show success message, but do not remove sidebar
  if (success) {
    // Only show a short message, do not remove sidebar
    const msg = `Applied changes: "${correction.original.substring(0, 15)}${correction.original.length > 15 ? '...' : ''}"`;
    console.log(msg);
    
    // Use a way to show message without removing sidebar
    if (!inlineMarker) {
      showMessage(msg, true, 2000);
    } else {
      // Show temporary message in sidebar
      const statusMsg = document.createElement('div');
      statusMsg.textContent = msg;
      statusMsg.style.cssText = `
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #057857;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      if (inlineMarker) {
        inlineMarker.appendChild(statusMsg);
        setTimeout(() => {
          statusMsg.style.opacity = '1';
        }, 10);
        setTimeout(() => {
          statusMsg.style.opacity = '0';
          setTimeout(() => {
            if (statusMsg.parentNode) {
              statusMsg.parentNode.removeChild(statusMsg);
            }
          }, 300);
        }, 2000);
      }
    }
  }
  
  return success;
}

// Apply changes to contentEditable element
function applyToContentEditable(correction) {
  try {
    const selection = window.getSelection();
    
    // If there is no valid selection, try to create one
    if (!selection.rangeCount) {
      try {
        const range = document.createRange();
        range.selectNodeContents(activeElement);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (err) {
        console.error('Failed to create selection:', err);
        return false;
      }
    }

    // First try to find the text using a more robust method
    const text = activeElement.innerText || activeElement.textContent;
    const startPos = text.indexOf(correction.original);
    
    if (startPos === -1) {
      console.warn('Cannot find original content in text:', correction.original);
      return false;
    }

    // Create a tree walker to find the text node containing our target
    const walker = document.createTreeWalker(
      activeElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    let currentPos = 0;
    let targetNode = null;
    let nodeStartPos = 0;

    // Find the text node containing our target
    while (node = walker.nextNode()) {
      const nodeLength = node.nodeValue.length;
      
      if (currentPos <= startPos && startPos < currentPos + nodeLength) {
        targetNode = node;
        nodeStartPos = currentPos;
        break;
      }
      
      currentPos += nodeLength;
    }

    if (!targetNode) {
      console.warn('Cannot find node containing original text:', correction.original);
      return false;
    }

    // Create a range for the replacement
    const range = document.createRange();
    const offsetInNode = startPos - nodeStartPos;
    range.setStart(targetNode, offsetInNode);
    range.setEnd(targetNode, offsetInNode + correction.original.length);

    // Select the text
    selection.removeAllRanges();
    selection.addRange(range);

    // Replace the selected text
    document.execCommand('insertText', false, correction.replacement);
    console.log('Successfully applied changes using tree walker');
    return true;

  } catch (err) {
    console.error('Error applying to contentEditable:', err);
    
    // Fallback: Try direct HTML replacement
    try {
      const html = activeElement.innerHTML;
      const newHtml = html.replace(
        escapeRegExp(correction.original),
        correction.replacement
      );
      
      if (newHtml !== html) {
        activeElement.innerHTML = newHtml;
        console.log('Applied changes using HTML replacement fallback');
        return true;
      }
    } catch (htmlErr) {
      console.error('HTML replacement fallback failed:', htmlErr);
    }
    
    return false;
  }
}

// Apply changes to input/textarea element
function applyToInput(correction) {
  try {
    const value = activeElement.value;
    
    // Try to find the text in the current value
    let startPos = value.indexOf(correction.original);
    
    // If not found in current value, try to find it in the original text
    if (startPos === -1 && originalText) {
      const originalStartPos = originalText.indexOf(correction.original);
      if (originalStartPos !== -1) {
        // Try to find a similar position in the current value
        const beforeText = originalText.substring(0, originalStartPos);
        const afterText = originalText.substring(originalStartPos + correction.original.length);
        
        // Look for similar context in current value
        const beforeMatch = value.indexOf(beforeText.substring(-20));
        const afterMatch = value.indexOf(afterText.substring(0, 20));
        
        if (beforeMatch !== -1 && afterMatch !== -1 && beforeMatch < afterMatch) {
          startPos = beforeMatch + 20;
        }
      }
    }
    
    if (startPos === -1) {
      console.warn('Cannot find original content in input:', correction.original);
      return false;
    }
    
    // Save scroll position
    const scrollTop = activeElement.scrollTop;
    
    // Replace text
    const newValue = value.substring(0, startPos) + 
                    correction.replacement + 
                    value.substring(startPos + correction.original.length);
    
    // Update the value
    activeElement.value = newValue;
    
    // Restore scroll position
    activeElement.scrollTop = scrollTop;
    
    // Update cursor position to after the replacement text
    activeElement.focus();
    try {
      activeElement.setSelectionRange(
        startPos + correction.replacement.length,
        startPos + correction.replacement.length
      );
    } catch (selErr) {
      console.warn('Could not set selection range:', selErr);
    }
    
    // Trigger events
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.log('Successfully applied changes (input/textarea)');
    return true;
  } catch (err) {
    console.error('Error applying to input/textarea:', err);
    return false;
  }
}

// Apply complete rewrite
function applyRewrite(rewrittenText) {
  console.log('Applying rewrite, rewrittenText:', rewrittenText.substring(0, 30) + '...');
  console.log('Original text:', originalText.substring(0, 30) + '...');
  console.log('Active element:', activeElement);
  console.log('Last caret position:', lastCaret);
  
  if (!activeElement) {
    console.warn('No active element found to apply rewrite');
    // Try to get active element from current selection
    try {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let el = range.startContainer;
        
        // Try to find editable parent element
        while (el && el !== document.body) {
          if (el.nodeType === Node.ELEMENT_NODE && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
            activeElement = el;
            console.log('Found parent editable element:', activeElement);
            break;
          }
          el = el.parentNode;
        }
      }
    } catch (err) {
      console.error('Error finding active element from selection:', err);
    }
    
    if (!activeElement) {
      showMessage("Cannot find editable element to apply changes. Try copying instead.", false, 5000);
      
      // Provide copy interface
      const copyMessage = document.createElement('div');
      copyMessage.className = 'grammar-bot-copy-error';

      copyMessage.innerHTML = `
        <p style="margin-bottom: 12px; color: #3A3A3C; font-size: 15px;">Could not find an editable text area. Copy text to clipboard:</p>
        <textarea style="width: 100%; height: 100px; margin-bottom: 12px; padding: 12px; border: 1px solid #E5E5EA; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; font-size: 15px;">${escapeHtml(rewrittenText)}</textarea>
        <button id="copyErrorText" style="padding: 12px; background-color: #007AFF; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; width: 100%;">Copy Text</button>
      `;
      
      // Add to suggestion container
      if (suggestionContainer) {
        const contentDiv = suggestionContainer.querySelector('.grammar-bot-content');
        if (contentDiv) {
          contentDiv.appendChild(copyMessage);
          
          // Add copy button event
          const copyButton = copyMessage.querySelector('#copyErrorText');
          if (copyButton) {
            copyButton.addEventListener('click', () => {
              const textarea = copyMessage.querySelector('textarea');
              if (textarea) {
                textarea.select();
                document.execCommand('copy');
                copyButton.textContent = 'Copied!';
                copyButton.style.backgroundColor = '#34C759';
                setTimeout(() => {
                  copyButton.textContent = 'Copy Text';
                  copyButton.style.backgroundColor = '#007AFF';
                }, 2000);
              }
            });
          }
        }
      }
      return;
    }
  }
  
  console.log('Active element tag:', activeElement.tagName);
  console.log('Is content editable:', activeElement.isContentEditable);
  
  let success = false;

  
  if (activeElement.isContentEditable) {
    try {
      const selection = window.getSelection();
      
      // Restore saved range if possible
      let range;
      if (lastCaret && lastCaret.range) {
        range = lastCaret.range.cloneRange();
        selection.removeAllRanges();
        selection.addRange(range);
        console.log('Restored saved range');
      } else if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      } else {
        console.warn('No selection range found, trying fallback');
        try {
          if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
            document.execCommand('insertText', false, rewrittenText);
            console.log('Applied with execCommand');
            success = true;
          }
        } catch (cmdErr) {
          console.error('execCommand fallback failed:', cmdErr);
        }
        if (!success) {
          activeElement.innerHTML = rewrittenText;
          console.log('Applied by setting innerHTML');
          success = true;
        }
        return;
      }
      
      // Clear current selection and insert new text
      range.deleteContents();
      const textNode = document.createTextNode(rewrittenText);
      range.insertNode(textNode);
      
      // Set selection after inserted text
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      
      console.log('Applied rewrite with range manipulation');
      success = true;
    } catch (err) {
      console.error('Error applying to contentEditable:', err);
      
      // Final fallback - innerHTML
      try {
        activeElement.innerHTML = rewrittenText;
        console.log('Applied with innerHTML fallback');
        success = true;
      } catch (innerErr) {
        console.error('All contentEditable methods failed:', innerErr);
      }
    }
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    try {
      const value = activeElement.value;
      
      // Determine replacement range
      let selStart, selEnd;
      
      // Use saved caret position if available
      if (lastCaret && typeof lastCaret.start !== 'undefined' && typeof lastCaret.end !== 'undefined') {
        selStart = lastCaret.start;
        selEnd = lastCaret.end;
      } else {
        // Otherwise use current selection or replace entire content
        selStart = activeElement.selectionStart || 0;
        selEnd = activeElement.selectionEnd || value.length;
      }
      
      console.log('Selection start:', selStart, 'Selection end:', selEnd);
      
      // Save scroll position
      const scrollTop = activeElement.scrollTop;
      
      // Replace text
      activeElement.value = value.substring(0, selStart) + rewrittenText + value.substring(selEnd);

      
      // Restore scroll position
      activeElement.scrollTop = scrollTop;
      
      // Restore focus and selection
      activeElement.focus();
      try {
        activeElement.setSelectionRange(selStart + rewrittenText.length, selStart + rewrittenText.length);
      } catch (selErr) {
        console.warn('Could not set selection range:', selErr);
      }
      
      // Trigger input events
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('Applied to input/textarea');
      success = true;
    } catch (err) {
      console.error('Error applying to input/textarea:', err);
    }
  } else {
    console.warn('Unknown element type, cannot apply rewrite:', activeElement.tagName);
  }
  
  // Verify if application was successful
  if (success) {
    removeSuggestionContainer();
    showMessage("Changes applied successfully!", true, 3000);
  } else {
    // If all methods failed, provide copy interface
    const copyMessage = document.createElement('div');
    copyMessage.className = 'grammar-bot-copy-error';
    copyMessage.innerHTML = `
      <p style="margin-bottom: 12px; color: #3A3A3C; font-size: 15px;">Couldn't apply changes automatically. Copy text to clipboard:</p>
      <textarea style="width: 100%; height: 100px; margin-bottom: 12px; padding: 12px; border: 1px solid #E5E5EA; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; font-size: 15px;">${escapeHtml(rewrittenText)}</textarea>
      <button id="copyErrorText" style="padding: 12px; background-color: #007AFF; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; width: 100%;">Copy Text</button>
    `;

    
    // Remove existing error message if any
    const existingError = document.querySelector('.grammar-bot-copy-error');
    if (existingError && existingError.parentNode) {
      existingError.parentNode.removeChild(existingError);
    }
    
    // Add to suggestion container
    if (suggestionContainer) {
      const contentDiv = suggestionContainer.querySelector('.grammar-bot-content');
      if (contentDiv) {
        contentDiv.appendChild(copyMessage);
        
        // Add copy button event
        const copyButton = copyMessage.querySelector('#copyErrorText');
        if (copyButton) {
          copyButton.addEventListener('click', () => {
            const textarea = copyMessage.querySelector('textarea');
            if (textarea) {
              textarea.select();
              document.execCommand('copy');
              copyButton.textContent = 'Copied!';
              copyButton.style.backgroundColor = '#34C759';
              setTimeout(() => {
                copyButton.textContent = 'Copy Text';
                copyButton.style.backgroundColor = '#007AFF';
              }, 2000);
            }
          });
        }
      }
    } else {
      showMessage("Failed to apply changes. Try copying the text manually.", false, 5000);
    }
    
    console.error("All application methods failed");
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Function: Adjust bubble position
function positionTooltip(highlightElement, tooltipElement) {
  // Get the position and size of the highlighted element
  const highlightRect = highlightElement.getBoundingClientRect();
  
  // Get the viewport dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Reset the position style of the tooltip
  tooltipElement.style.top = '-5px';
  tooltipElement.style.left = '100%';
  tooltipElement.style.right = 'auto';
  tooltipElement.style.bottom = 'auto';
  tooltipElement.style.marginLeft = '8px';
  tooltipElement.style.marginRight = 'auto';
  tooltipElement.style.marginTop = 'auto';
  tooltipElement.style.marginBottom = 'auto';
  
  // Calculate the expected size of the tooltip
  const tooltipWidth = 280; // Same as the width set in CSS
  
  // Check if there is enough space on the right
  const rightSpace = viewportWidth - (highlightRect.right + window.scrollX);
  
  if (rightSpace < tooltipWidth + 20) {
    // Not enough space on the right, try left display
    tooltipElement.style.left = 'auto';
    tooltipElement.style.right = '100%';
    tooltipElement.style.marginLeft = 'auto';
    tooltipElement.style.marginRight = '8px';
  }
  
  // Check the position in the vertical direction
  setTimeout(() => {
    const tooltipRect = tooltipElement.getBoundingClientRect();
    
    // If the tooltip exceeds the bottom of the viewport
    if (tooltipRect.bottom > viewportHeight) {
      const overflowBottom = tooltipRect.bottom - viewportHeight;
      tooltipElement.style.top = `-${overflowBottom + 10}px`;
    }
    
    // If the tooltip exceeds the top of the viewport
    if (tooltipRect.top < 0) {
      tooltipElement.style.top = `${Math.abs(tooltipRect.top) + 5}px`;
    }
  }, 0);
}
