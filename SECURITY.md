# Security Policy

## 🛡️ Reporting Security Vulnerabilities

Hey! First off, thanks for taking the time to help make Y2W more secure. Seriously, security researchers are the unsung heroes of the internet.

### Found Something?

If you've discovered a security vulnerability in Y2W, here's what to do:

**DO:**
- Report security vulnerabilities through [GitHub's private vulnerability reporting](https://github.com/fedevgonzalez/youtube-to-w2g/security/advisories/new)
- Provide detailed steps to reproduce the issue
- Include any relevant screenshots or proof of concept code
- Give me a reasonable amount of time to fix it before going public

**DON'T:**
- Post it publicly on GitHub issues (use the private security advisory instead! 🙏)
- Tweet about it before we've had a chance to patch
- Use it to mess with other people's W2G rooms (not cool)

### What Happens Next?

1. **GitHub will notify me immediately** - I'll get an alert as soon as you submit the report
2. **I'll respond within 48 hours** - To acknowledge receipt and start investigating
3. **We'll work together** - Through GitHub's secure advisory system, I might have questions or need clarification
4. **Credit where it's due** - Want recognition? You got it! GitHub makes it easy to credit security researchers
5. **Fix and release** - Once patched, I'll push an update ASAP and publish the security advisory

## 🔒 Security Considerations

### What Y2W Does with Your Data

- **API Credentials**: Stored locally in Chrome's secure storage (never sent anywhere except W2G's API)
- **Video Information**: Only the video URL and title are sent to W2G
- **No Analytics**: I don't track you. Period. No Google Analytics, no telemetry, nada
- **No External Services**: Besides W2G's API, this extension doesn't talk to any other services

### Current Security Measures

- All credentials stored using Chrome's `storage.sync` API
- HTTPS-only communication with W2G API  
- Content Security Policy in place
- Minimal permissions (only what's absolutely needed)

### Known Limitations

Let's be real here:
- This is a browser extension, so it has the same security constraints as any extension
- Your W2G API credentials could be exposed if someone has access to your computer
- The extension can see what YouTube videos you're watching (duh, that's how it works)

## 📋 Security Checklist for Contributors

If you're contributing code, please ensure:
- [ ] No hardcoded credentials or secrets
- [ ] All external requests use HTTPS
- [ ] Input validation for any user-provided data
- [ ] No use of `eval()` or similar dangerous functions
- [ ] Dependencies are from trusted sources

## 🏷️ Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Basically, always use the latest version. I'm just one person, so I can only support the current release.

## 🙏 Thanks

Huge thanks to everyone who reports security issues responsibly through GitHub's security features. You make the internet a safer place, one bug at a time.

Security researchers who help improve Y2W will be acknowledged in our security advisories (unless you prefer to remain anonymous).

---

_Remember: with great power comes great responsibility. Don't be evil!_ 🦸‍♀️