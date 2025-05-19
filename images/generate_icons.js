const fs = require('fs');
const path = require('path');

// Create a simple canvas with a 'G' letter icon
function generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  
  // Letter 'G'
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', size/2, size/2);
  
  return canvas.toDataURL('image/png');
}

// Generate icons for different sizes
const sizes = [16, 48, 128];

for (const size of sizes) {
  const dataUrl = generateIcon(size);
  
  // Convert data URL to buffer
  const data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  
  // Save the image
  fs.writeFileSync(path.join(__dirname, `icon${size}.png`), buffer);
  console.log(`Generated icon${size}.png`);
}

/*
Note: This script is meant to be run in a Node.js environment with a DOM.
Since that's not typically available, you'd need to use a library like node-canvas.

For simplicity, you can use this as a reference to create the icons manually
or use a service like favicon.io to generate icons, or just use a temporary
placeholder like the below data URLs.

Data URLs for the icons:
- icon16.png: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEBSURBVHgBrVJBDsFAFH0zbaSxZVN2jkBcwBE4AeIEcQJOYE9gj4A7kBNgS0hsqHkmX5ommWlHX/I7M/+/99/7PyAF7XUDQlwhzJdgmwZowVK57xmQQQJcSIYE2LlhHl6U992LMaNn2QVry8sUyQUMx8rr/LGF0WSKDIdwQTgE3PkD2LQxs2dvvJJ+VwHK7iK6b+nfFuBDL+k9WuVbTAUVy9hwLkQCvjLQ6fewDSfvWqW0jgXC6N1o+bScm+I8CdisVVR6+KnApR32qkMVtQWQV+aBhGUVbkwFkgutQRkU32+GApIL/B2hUBoEIMcCQRrBOosX1nIh9PNnbj1xDsv1lZfxAV0CpHV8WSwxAAAAAElFTkSuQmCC
- icon48.png: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAKASURBVHgB7ZhNTttQEMffjh2FILr1qqsegR6huQFwAugJ2pyAcgLoqrBsTtBwgqYnIDcIN2huEFaVKKrEwo4Z5zmJZfzBl0SE/qQoiWfG85t582YMCAgICAgICLh/QOoA55v3gKt3AORpFCWfE+ue0+kTsqqHtDx4qX2o5ycxKnpNND4KxLVrxBSWOYaBcY5P+7E0dRMdlBBN5ZUYNw40hv3R6qY4bfX+IfCzGOy+VQA7lkHm4kfnpULzUuIKhD9h+gB4vbEP5ONhCpnnj/vjUgXWt9oYYXNlzgp4yNQTUfdVUVvnGznVuInrEXvWTITsrO0lbV94ndneCBMBTqenL5NL17OxHR4nD22mJy4D3hQXZxfHbXw6/UyRl/HUCeBiUVE1jf5tPzbGkddkw+H3ThJy1HFu4X73NU45VtNDnQBdMZUyxmVWd0eJ0wHFHh6y6kVQJwDLWFVGHj0/1kkd3/jKxsauaWGdAGzxhNQPXR/0QIpd9wOjlhI1Aqxkq2Ii9/HbsFEBvkZ7PVcrKhWgKKaQjdZeBj9ZmGoCKGUNj44uyNMIRUdVH9WLmEsZ+SCZfDPCQmxVsKlVGY05sJMzYS+ejZtY2mJJzQX4q28Qc4+WDUsBJgFg5BNAZl60PUeQPJ0/aM2BLLpn2Q/M+QQU/MvC3cYcYH+UPdHsJeZiJaAYCeVpkR8vtW3Ut+yM7xzl6ItxD4tM6QQIF1n/ub25XKM0GI7e13qm6GHuGkCFUGdFw+vX8yvnQJ0vZ+tePCu7zJl5HbFzuO9ZcaW0E5dveqPVB9k9qvhutLCPrOlfn/JCpj2uDQEBAQEBAQF3jP+2z7HvJ5Sm7AAAAABJRU5ErkJggg==
- icon128.png: data:image/png;base64,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
*/ 
