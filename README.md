# GrammarBot

A browser extension for checking and improving English grammar and writing style.

## Features

- **Grammar Check**: Identifies grammar, spelling, and punctuation errors with suggested corrections
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
   - For grammar check and Chinglish detection: Click on suggested alternatives to apply them
   - For rewriting operations: Click "Apply" to replace the selected text or "Copy" to copy the suggestion to clipboard

## OpenAI API Key

This extension requires an OpenAI API key to function:

1. If you don't have an API key, sign up at [OpenAI](https://platform.openai.com/)
2. Navigate to the [API keys page](https://platform.openai.com/account/api-keys)
3. Create a new secret key
4. Copy the key and paste it into the GrammarBot extension popup

## Privacy

- Your API key is stored locally in your browser's storage and is only used to make requests to the OpenAI API
- Text selected for processing is sent to OpenAI's servers for analysis
- The extension does not collect or store any user data

## Development

This extension uses:
- Manifest V3 for Chrome extensions
- OpenAI's GPT API for language processing
- JavaScript for browser interaction

## License

MIT 