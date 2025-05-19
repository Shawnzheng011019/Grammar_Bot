# GrammarBot

A browser extension for checking and improving English grammar and writing style.

## Features

- **Grammar Check**: Identifies grammar, spelling, and punctuation errors with suggested corrections using OpenAI's GPT-4o-mini model
- **Sentence Shortening**: Helps make text more concise while preserving key information
- **Sentence Expansion**: Adds details and clarity to make text more comprehensive
- **Chinglish Detection**: Identifies and corrects English expressions influenced by Chinese language patterns
- **Tone Adjustment**: Rewrites text with professional, concise, confident, or friendly tones

## Installation

### Chrome/Edge/Brave

1. Download or clone this repository
2. Open your browser and navigate to the extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The GrammarBot extension is now installed

### Firefox

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Select any file in the extension folder (e.g., manifest.json)
5. The GrammarBot extension is now temporarily installed

## Usage

1. Click on the GrammarBot icon in your browser's toolbar to:
   - Enter your OpenAI API key (required)
   - Set your preferred correction mode

2. Use the extension via right-click menu:
   - Select text on any webpage
   - Right-click and choose "GrammarBot" from the context menu
   - Select the desired operation from the submenu

3. View the suggestions in the popup window that appears:
   - For grammar check: Each suggestion has Accept/Reject buttons and keyboard shortcuts (Y/N)
   - For Chinglish detection: Click on suggested alternatives to apply them
   - For rewriting operations: Click "Apply" to replace the selected text or "Copy" to copy the suggestion to clipboard

## OpenAI API Key

This extension requires an OpenAI API key to function:

1. If you don't have an API key, sign up at [OpenAI](https://platform.openai.com/)
2. Navigate to the [API keys page](https://platform.openai.com/account/api-keys)
3. Create a new secret key
4. Copy the key and paste it into the GrammarBot extension popup

**Note:** Using the GPT-4o-mini model for grammar checking may incur higher API costs than GPT-3.5-Turbo, but it's more cost-effective than GPT-4-Turbo.

## Privacy

- Your API key is stored locally in your browser's storage and is only used to make requests to the OpenAI API
- Text selected for processing is sent to OpenAI's servers for analysis
- The extension does not collect or store any user data

## Development

This extension uses:
- Manifest V3 for Chrome extensions
- OpenAI's GPT-4o-mini API for language processing
- JavaScript for browser interaction

## Troubleshooting

### Text Replacement Issues

If you experience problems with the "Apply" button not replacing text:

1. **Use the Copy Button**: All rewrite operations provide a "Copy" button as an alternative. Use this to copy the text and paste it manually.

2. **Check Your Browser**: Some websites with complex editors may prevent direct text manipulation. This is a security feature of those websites.

3. **Focus on Input First**: Before using GrammarBot, click inside the text field you want to edit, then select the text. This helps the extension identify where to apply changes.

4. **Compatibility**: The extension works best with standard text fields. Complex rich text editors may have limited compatibility.

### Test Page

A `test.html` file is included in the extension's directory. Open this file in your browser to test the extension on different input types.

## Development Notes

To improve text replacement in complex editors:
- The extension uses multiple fallback mechanisms for text replacement
- Debug logs can be viewed in the browser console
- Text selection state is saved to improve replacement accuracy

## License

MIT 
