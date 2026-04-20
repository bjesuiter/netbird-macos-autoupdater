# Changelog

All notable changes to this project will be documented in this file.

## 2026-04-20.1

First stable Tuna-integrated release.

### Added
- Tuna-compatible NetBird updater script with metadata headers
- GitHub release detection for the latest installable macOS `.pkg`
- Installed-version detection for local NetBird app/CLI/receipt state
- Package signature and notarization verification
- macOS notifications for update progress and outcomes
- Bun test coverage for installed-version and latest-version resolution
- Tuna deployment instructions in the README

### Changed
- Hardcoded Bun shebang for Tuna/launchd environments without the usual user PATH
- Copy-based Tuna deployment instead of symlink-based deployment
- Custom administrator prompt text so the update action is identifiable during privilege escalation

### Notes
- The updater is designed to be launched from Tuna instead of adding another persistent menu bar item.
