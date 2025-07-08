# YouTube to Watch2Gether (Y2W)

<div align="center">
  <img src="icons/icon128.png" alt="Y2W Logo" width="128" height="128">
  
  **Send YouTube videos to your Watch2Gether room with a single click!**
  
  [![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-red?style=flat-square&logo=google-chrome)](https://chrome.google.com/webstore)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
</div>

## 📋 Overview

YouTube to Watch2Gether (Y2W) is a Chrome extension that adds a convenient "Send to W2G" button directly to YouTube videos. Share videos with your Watch2Gether room instantly without copying URLs or switching tabs!

### ✨ Features

- 🎬 **One-Click Sharing**: Send any YouTube video to your W2G room instantly
- 🔄 **Seamless Integration**: Button appears naturally in the YouTube player
- 🎯 **Smart Positioning**: Works with all YouTube layouts (default, theater, fullscreen)
- 🔐 **Secure**: Your API credentials are stored locally in Chrome's secure storage
- ⚡ **Lightweight**: Minimal performance impact, only active on YouTube

## 🚀 Installation

### From Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store soon!

### Manual Installation (Developer Mode)

1. **Download the Extension**
   ```bash
   git clone https://github.com/fedevgonzalez/youtube-to-w2g.git
   cd youtube-to-w2g
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the `youtube-to-w2g` folder

3. **Configure Your Credentials**
   - Click the Y2W extension icon in your toolbar
   - Enter your Watch2Gether API key and Room Access Key
   - Click **Save Configuration**

## 🔑 Getting Watch2Gether Credentials

### API Key
1. Visit [Watch2Gether API](https://www.watch2gether.com/api)
2. Log in to your W2G account
3. Navigate to the API section
4. Generate or copy your API key

### Room Access Key
1. Create or join a W2G room
2. Open the room settings
3. Look for "Room Access Key" or "Room API Access"
4. Copy the key

> **Note**: Keep your credentials secure and never share them publicly!

## 📸 Screenshots

<div align="center">
  <img src="docs/screenshots/button-preview.png" alt="Y2W Button in YouTube Player" width="600">
  <p><em>The Y2W button seamlessly integrates into the YouTube player</em></p>
  
  <img src="docs/screenshots/popup-config.png" alt="Extension Configuration" width="400">
  <p><em>Simple configuration popup</em></p>
</div>

## 🛠️ Development

### Prerequisites
- Chrome browser
- Basic knowledge of Chrome Extension development
- ImageMagick (optional, for icon generation)

### Project Structure
```
youtube-to-w2g/
├── manifest.json          # Extension manifest (V3)
├── popup.html            # Configuration popup
├── css/                  # Styles
│   └── popup.css
├── js/                   # JavaScript files
│   ├── background.js     # Service worker
│   ├── content.js        # Content script
│   └── popup.js          # Popup logic
├── icons/                # Extension icons
│   └── icon.svg          # Source icon
└── assets/               # Additional assets
    └── y2w.svg          # Button icon
```

### Making Changes

1. Edit the relevant files
2. Reload the extension in `chrome://extensions/`
3. Refresh YouTube to test changes

### Building Icons
If you modify the icon, regenerate PNG versions:
```bash
cd icons
convert -density 300 icon.svg -resize 16x16 icon-16.png
convert -density 300 icon.svg -resize 32x32 icon-32.png
convert -density 300 icon.svg -resize 48x48 icon-48.png
convert -density 300 icon.svg -resize 128x128 icon-128.png
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Start
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Bug Reports & Feature Requests

Found a bug or have a feature idea? Please check the [issue tracker](https://github.com/fedevgonzalez/youtube-to-w2g/issues) to see if it already exists. If not, feel free to [open a new issue](https://github.com/fedevgonzalez/youtube-to-w2g/issues/new)!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Watch2Gether](https://www.watch2gether.com/) for providing the API
- Chrome Extension community for documentation and examples
- All contributors who help improve this extension

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/fedevgonzalez/youtube-to-w2g/issues)
- **Discussions**: [GitHub Discussions](https://github.com/fedevgonzalez/youtube-to-w2g/discussions)

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/fedevgonzalez">fedevgonzalez</a> and contributors
</div>