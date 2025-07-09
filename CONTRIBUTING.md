# Contributing to YouTube to Watch2Gether (Y2W)

First off, thank you for considering contributing to Y2W! It's people like you that make Y2W such a great tool. 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Process](#development-process)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by the [Y2W Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the Repository**
   - Click the "Fork" button at the top right of the [Y2W repository](https://github.com/fedevgonzalez/youtube-to-w2g)

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR-USERNAME/youtube-to-w2g.git
   cd youtube-to-w2g
   ```

3. **Set Up Development Environment**
   - Install Chrome or any Chromium-based browser
   - Load the extension in developer mode (see README for instructions)
   - Get your W2G API credentials for testing

4. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear and descriptive title**
- **Steps to reproduce** the behavior
- **Expected behavior** description
- **Screenshots** if applicable
- **Environment details** (Chrome version, OS)
- **Console errors** if any

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, provide:

- **Clear and descriptive title**
- **Detailed description** of the proposed functionality
- **Use case** explaining why this enhancement would be useful
- **Possible implementation** approach (if you have ideas)

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Simple issues good for beginners
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements

### Pull Requests

1. **Before coding:**
   - Check if there's an existing issue for your change
   - If not, create one to discuss the change first
   - Wait for feedback before starting major work

2. **While coding:**
   - Follow the [Style Guidelines](#style-guidelines)
   - Add/update tests if applicable
   - Update documentation as needed
   - Test your changes thoroughly

3. **Submitting:**
   - Fill in the pull request template
   - Reference any related issues
   - Ensure all checks pass

## Development Process

### Project Structure

```
youtube-to-w2g/
├── manifest.json       # Extension configuration
├── popup.html         # Settings popup
├── css/              # Stylesheets
├── js/               # JavaScript files
│   ├── background.js # Service worker
│   ├── content.js    # YouTube page script
│   └── popup.js      # Popup logic
└── assets/           # Resources directory
    ├── icons/        # Extension icons
    └── images/       # Promotional images
```

### Testing Your Changes

1. **Manual Testing**
   - Test on different YouTube layouts (default, theater, fullscreen)
   - Test with various video types (regular, live, premiere)
   - Verify API integration works correctly
   - Check error handling scenarios

2. **Browser Compatibility**
   - Test in Chrome
   - Test in other Chromium browsers if possible

### Building Icons

If you modify the icon design:
```bash
cd icons
# Generate all required sizes from the SVG
convert -density 300 icon.svg -resize 16x16 icon16.png
convert -density 300 icon.svg -resize 32x32 icon32.png
convert -density 300 icon.svg -resize 48x48 icon48.png
convert -density 300 icon.svg -resize 128x128 icon128.png
```

## Style Guidelines

### JavaScript Style Guide

- Use ES6+ features where appropriate
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Use async/await for asynchronous operations

Example:
```javascript
// Good
async function sendVideoToW2G(videoId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'sendToW2G',
      videoId: videoId
    });
    return response;
  } catch (error) {
    console.error('Failed to send video:', error);
    throw error;
  }
}

// Avoid
function send(id) {
  chrome.runtime.sendMessage({action: 'sendToW2G', videoId: id}, (r) => {
    // ...
  });
}
```

### CSS Style Guide

- Use meaningful class names
- Keep selectors specific but not overly complex
- Group related properties
- Use CSS custom properties for theming

### HTML Style Guide

- Use semantic HTML5 elements
- Keep markup clean and minimal
- Add appropriate ARIA labels for accessibility

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add keyboard shortcut for sending videos
fix: correct button position in theater mode
docs: update installation instructions
```

## Pull Requests

### PR Title Format
Use the same format as commit messages:
```
feat: add dark mode support for button
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested on Chrome
- [ ] Tested different YouTube layouts
- [ ] Verified no console errors

## Screenshots (if applicable)
Add screenshots here

## Related Issues
Closes #XXX
```

### Review Process

1. All PRs require at least one review
2. Address review comments promptly
3. Keep PRs focused - one feature/fix per PR
4. Update your branch with main if needed

## Community

### Getting Help

- Check the [documentation](README.md)
- Look through [existing issues](https://github.com/fedevgonzalez/youtube-to-w2g/issues)
- Join discussions in [GitHub Discussions](https://github.com/fedevgonzalez/youtube-to-w2g/discussions)

### Stay Updated

- Watch the repository for updates
- Follow the [releases](https://github.com/fedevgonzalez/youtube-to-w2g/releases) page

## Recognition

Contributors will be recognized in:
- The README acknowledgments section
- Release notes when applicable
- Special mentions for significant contributions

---

Thank you again for your interest in contributing to Y2W! We look forward to your contributions. 🚀