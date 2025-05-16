#!/bin/bash

# GrammarBot extension setup script

echo "Setting up GrammarBot browser extension..."

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "npm is required but not installed. Please install Node.js and npm first."
    exit 1
fi

# Install required dependencies
echo "Installing dependencies..."
npm install

# Generate proper icons from placeholder data URLs
echo "Generating icons..."
mkdir -p images

# Extract the base64 data from the placeholder icon files and convert them to proper PNG files
node -e "
const fs = require('fs');
const path = require('path');

try {
  // Check if the icon files exist and contain data URLs
  const icon16Content = fs.readFileSync(path.join(__dirname, 'images/icon16.png'), 'utf8');
  const icon48Content = fs.readFileSync(path.join(__dirname, 'images/icon48.png'), 'utf8');
  const icon128Content = fs.readFileSync(path.join(__dirname, 'images/icon128.png'), 'utf8');

  // Process each icon if it contains a data URL
  if (icon16Content.startsWith('data:image/png;base64,')) {
    const data = icon16Content.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(__dirname, 'images/icon16.png'), buffer);
    console.log('Generated icon16.png');
  }

  if (icon48Content.startsWith('data:image/png;base64,')) {
    const data = icon48Content.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(__dirname, 'images/icon48.png'), buffer);
    console.log('Generated icon48.png');
  }

  if (icon128Content.startsWith('data:image/png;base64,')) {
    const data = icon128Content.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(__dirname, 'images/icon128.png'), buffer);
    console.log('Generated icon128.png');
  }
} catch (error) {
  console.error('Error processing icon files:', error);
}
"

# Create a zip file for easy distribution
echo "Creating extension package..."
zip -r grammarbot.zip manifest.json popup.html popup.css popup.js background.js content.js content.css images README.md

echo "Setup complete! The extension is ready to use."
echo "You can load it in your browser by going to the extensions page, enabling 'Developer mode',"
echo "and clicking 'Load unpacked' to select the extension folder."
echo ""
echo "Alternatively, you can use the grammarbot.zip file to distribute the extension." 