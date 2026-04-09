# netbird-macos-autoupdater

A dedicated macOS updater for NetBird that can **download a `.pkg`, install it, and restart NetBird correctly**.

## Why this repo exists

The current "updater" is not really an updater.

Today, the flow is effectively:

1. Show or open a download link
2. Let the user download a `.pkg`
3. Let the user run the installer manually
4. Hope NetBird is restarted properly afterward

That is a manual install flow, not an update system.

This repository exists to build the missing automation layer:

- detect or receive an available update
- download the correct `.pkg`
- verify it before installation
- run the macOS package installer
- restart NetBird cleanly after install
- provide logs and error handling when something goes wrong

## Why this should be its own repo

A real updater has different concerns than the main app:

- **privileged operations**: installing a `.pkg` usually requires elevated permissions
- **process management**: NetBird must be stopped and restarted safely
- **release/install lifecycle**: download, verification, install, relaunch, recovery
- **macOS-specific behavior**: package installation, launchd/app restart behavior, permissions, signing
- **reliability requirements**: update failures should be isolated from normal app logic

Keeping this as a separate repo makes it easier to:

- iterate on the updater independently
- test install/restart logic safely
- keep updater responsibilities small and explicit
- version and ship updater changes separately
- document the update pipeline clearly

## Problem statement

We want to replace:

> "Here is a package file — please install it yourself"

with:

> "An update is available — download it, install it, and bring NetBird back up automatically"

## Goals

- Download the correct NetBird macOS `.pkg`
- Verify the package before installing
- Install using the native macOS installer flow
- Restart NetBird correctly after install
- Surface useful progress and error messages
- Be robust across common failure cases

## Non-goals

- Replacing NetBird itself
- Building a generic updater for every macOS app
- Avoiding macOS security requirements

## Expected high-level flow

1. Check whether an update is available
2. Resolve the correct package URL/version
3. Download the package to a temporary location
4. Verify package integrity/signing
5. Stop NetBird safely if needed
6. Run package installation
7. Restart NetBird or its related services correctly
8. Confirm the updated version is running
9. Report success or actionable failure details

## Open questions

- Where should update metadata come from?
- How do we authenticate or trust the package URL?
- What is the authoritative way to stop/start NetBird on macOS?
- Does restart mean relaunching an app bundle, a helper, a daemon, or all of them?
- What permissions model should we use for installation?
- How should silent vs interactive updates work?

## Initial deliverables

- updater requirements and architecture
- package download + verification implementation
- installation runner for `.pkg`
- NetBird stop/restart orchestration
- logging and failure diagnostics
- local test plan for upgrade scenarios

## Status

Repository initialized. README added as the starting project definition.
