#!/bin/bash
# Script to package the GrammarBot extension

echo "Packaging GrammarBot extension..."

# Create a new directory for the package
mkdir -p dist

# Create a zip file with all the necessary files
zip -r dist/grammarbot.zip \
    manifest.json \
    background.js \
    content.js \
    content.css \
    popup.html \
    popup.js \
    popup.css \
    images/ \
    README.md

echo "Package created at dist/grammarbot.zip"
echo "You can upload this file to the Chrome Web Store or distribute it for manual installation." 