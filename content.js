// Create container for grammar suggestions
let suggestionContainer = null;
let activeElement = null;
let originalText = '';
let lastCaret = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'process-text') {
    processText(request.text, request.mode, request.tone);
  }
  return true;
});

// Process text based on the selected mode
function processText(text, mode, tone) {
  // Save the active element (textarea or input)
  activeElement = document.activeElement;
  originalText = text;
  
  // Save cursor position if in an editable element
  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    lastCaret = {
      start: activeElement.selectionStart,
      end: activeElement.selectionEnd
    };
  }

  // Generate the appropriate system prompt for each mode
  let systemPrompt = '';
  let userPrompt = text;

  switch (mode) {
    case 'grammar':
      systemPrompt = `You are an advanced English grammar correction assistant. Analyze the provided text at the word level for grammar, spelling, and punctuation errors. 
      Format your response as a JSON array of objects, where each object has these properties:
      - "original": the original word or phrase with issues
      - "suggestions": an array of better alternatives
      - "explanation": brief explanation of the issue (max 10 words)
      
      Only include entries where there are actual issues to fix. If there are no issues, return an empty array.`;
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
      Format your response as a JSON array of objects, where each object has:
      - "original": the original Chinglish phrase
      - "corrected": natural English alternative
      - "explanation": why the original is unnatural (max 10 words)
      
      Only include entries where there are actual issues to fix. If there are no issues, return an empty array.`;
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

  // Send request to the background script
  chrome.runtime.sendMessage({
    action: 'openai-request',
    systemPrompt: systemPrompt,
    userPrompt: userPrompt
  }, handleResponse);
}

// Handle API response
function handleResponse(response) {
  if (response.error) {
    showError(response.error);
    return;
  }

  try {
    const result = response.result;
    
    // Handle different types of responses based on the mode
    if (result.startsWith('[') && result.endsWith(']')) {
      // This is likely JSON for grammar or Chinglish mode
      try {
        const suggestions = JSON.parse(result);
        if (suggestions.length === 0) {
          showSuggestions([{ message: 'No issues found in the text.' }]);
        } else {
          showSuggestions(suggestions);
        }
      } catch (e) {
        // If JSON parsing fails, just show the raw text
        showRewrite(result);
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
  suggestionContainer.innerHTML = `
    <div class="grammar-bot-header">
      <span>GrammarBot</span>
      <button class="grammar-bot-close">&times;</button>
    </div>
    <div class="grammar-bot-content">
      <div class="grammar-bot-loading">
        <div class="grammar-bot-spinner"></div>
        <span>Processing...</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(suggestionContainer);
  
  // Position container near the selected text
  positionContainer();
  
  // Add event listener for close button
  const closeButton = suggestionContainer.querySelector('.grammar-bot-close');
  closeButton.addEventListener('click', removeSuggestionContainer);
}

// Show suggestions UI for grammar and Chinglish modes
function showSuggestions(suggestions) {
  if (!suggestionContainer) {
    suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'grammar-bot-container';
    document.body.appendChild(suggestionContainer);
  }
  
  // Clear existing content
  suggestionContainer.innerHTML = `
    <div class="grammar-bot-header">
      <span>GrammarBot</span>
      <button class="grammar-bot-close">&times;</button>
    </div>
    <div class="grammar-bot-content">
      <div class="grammar-bot-suggestions"></div>
    </div>
  `;
  
  const suggestionsContainer = suggestionContainer.querySelector('.grammar-bot-suggestions');
  
  if (suggestions.length === 1 && suggestions[0].message) {
    // This is a message, not a suggestion
    const messageDiv = document.createElement('div');
    messageDiv.className = 'grammar-bot-message';
    messageDiv.textContent = suggestions[0].message;
    suggestionsContainer.appendChild(messageDiv);
  } else {
    // Add each suggestion
    suggestions.forEach(suggestion => {
      const suggestionDiv = document.createElement('div');
      suggestionDiv.className = 'grammar-bot-suggestion';
      
      const originalSpan = document.createElement('span');
      originalSpan.className = 'grammar-bot-original';
      originalSpan.textContent = suggestion.original;
      suggestionDiv.appendChild(originalSpan);
      
      const explanationSpan = document.createElement('span');
      explanationSpan.className = 'grammar-bot-explanation';
      explanationSpan.textContent = suggestion.explanation;
      suggestionDiv.appendChild(explanationSpan);
      
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'grammar-bot-alternatives';
      
      (suggestion.suggestions || [suggestion.corrected]).forEach(alt => {
        const altButton = document.createElement('button');
        altButton.className = 'grammar-bot-alternative';
        altButton.textContent = alt;
        altButton.addEventListener('click', () => {
          replaceSuggestion(suggestion.original, alt);
        });
        suggestionsDiv.appendChild(altButton);
      });
      
      suggestionDiv.appendChild(suggestionsDiv);
      suggestionsContainer.appendChild(suggestionDiv);
    });
  }
  
  // Position container near the selected text
  positionContainer();
  
  // Add event listener for close button
  const closeButton = suggestionContainer.querySelector('.grammar-bot-close');
  closeButton.addEventListener('click', removeSuggestionContainer);
}

// Show rewrite UI for shorten, expand, and tone modes
function showRewrite(rewrittenText) {
  if (!suggestionContainer) {
    suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'grammar-bot-container';
    document.body.appendChild(suggestionContainer);
  }
  
  // Clear existing content
  suggestionContainer.innerHTML = `
    <div class="grammar-bot-header">
      <span>GrammarBot</span>
      <button class="grammar-bot-close">&times;</button>
    </div>
    <div class="grammar-bot-content">
      <div class="grammar-bot-rewrite">
        <div class="grammar-bot-rewritten-text">${escapeHtml(rewrittenText)}</div>
        <div class="grammar-bot-actions">
          <button class="grammar-bot-apply">Apply</button>
          <button class="grammar-bot-copy">Copy</button>
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
        setTimeout(() => {
          copyButton.textContent = 'Copy';
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  });
}

// Show error message
function showError(errorMessage) {
  if (!suggestionContainer) {
    suggestionContainer = document.createElement('div');
    suggestionContainer.className = 'grammar-bot-container';
    document.body.appendChild(suggestionContainer);
  }
  
  // Clear existing content
  suggestionContainer.innerHTML = `
    <div class="grammar-bot-header">
      <span>GrammarBot</span>
      <button class="grammar-bot-close">&times;</button>
    </div>
    <div class="grammar-bot-content">
      <div class="grammar-bot-error">${escapeHtml(errorMessage)}</div>
    </div>
  `;
  
  // Position container near the selected text
  positionContainer();
  
  // Add event listener for close button
  const closeButton = suggestionContainer.querySelector('.grammar-bot-close');
  closeButton.addEventListener('click', removeSuggestionContainer);
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

// Replace the original text with suggestion
function replaceSuggestion(original, replacement) {
  if (!activeElement) return;
  
  if (activeElement.isContentEditable) {
    // For contentEditable elements
    document.execCommand('insertText', false, originalText.replace(original, replacement));
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    // For input elements
    const value = activeElement.value;
    const selStart = lastCaret ? lastCaret.start : 0;
    const selEnd = lastCaret ? lastCaret.end : value.length;
    
    const selectedText = value.substring(selStart, selEnd);
    const newText = selectedText.replace(original, replacement);
    
    activeElement.value = value.substring(0, selStart) + newText + value.substring(selEnd);
    
    // Focus the element and restore selection
    activeElement.focus();
    activeElement.setSelectionRange(selStart, selStart + newText.length);
  }
}

// Apply complete rewrite
function applyRewrite(rewrittenText) {
  if (!activeElement) return;
  
  if (activeElement.isContentEditable) {
    // For contentEditable elements
    document.execCommand('insertText', false, rewrittenText);
  } else if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
    // For input elements
    const value = activeElement.value;
    const selStart = lastCaret ? lastCaret.start : 0;
    const selEnd = lastCaret ? lastCaret.end : value.length;
    
    activeElement.value = value.substring(0, selStart) + rewrittenText + value.substring(selEnd);
    
    // Focus the element and restore selection
    activeElement.focus();
    activeElement.setSelectionRange(selStart, selStart + rewrittenText.length);
  }
  
  removeSuggestionContainer();
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
} 