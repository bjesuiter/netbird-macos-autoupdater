Custom Scripts and Script Directories · Docs · Tuna

[![Tuna](/assets/tuna-98e4ee34.webp)Tuna](/)

[Docs](/docs)

[Docs](/docs) [Download βeta](/download/latest)

## Entry

- [Start Here](/docs/start-here)

## Core Concepts

- [How Commands Work](/docs/how-commands-work)

## Modes

- [Fuzzy Mode](/docs/fuzzy-mode)
- [Text Mode](/docs/text-mode)
- [Talk Mode](/docs/talk-mode)
- [Leader Mode](/docs/leader-mode)

## Everyday Tools

- [Finding Files](/docs/finding-files)
- [Learning, Aliases, and Defaults](/docs/learning-aliases-and-defaults)
- [Clipboard History and Shelf](/docs/clipboard-history-and-shelf)
- [Built-In Tools](/docs/built-in-tools)
- [Send Keys](/docs/send-keys)

## Replacement Guides

- [Replacing Spotlight with Tuna](/docs/replacing-spotlight-with-tuna)
- [Replacing the System Emoji Picker](/docs/replacing-the-system-emoji-picker)

## Customization

- [Smart Links](/docs/smart-links)
- Custom Scripts and Script Directories
- [Hotkeys and Activation](/docs/hotkeys-and-activation)
- [Themes and Appearance](/docs/themes-and-appearance)

## Extensions

- [Extensions](/docs/extensions-overview)

## Reference

- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
- [Privacy and Local Processing](/docs/privacy-and-local-processing)

## Entry

- [Start Here](/docs/start-here)

## Core Concepts

- [How Commands Work](/docs/how-commands-work)

## Modes

- [Fuzzy Mode](/docs/fuzzy-mode)
- [Text Mode](/docs/text-mode)
- [Talk Mode](/docs/talk-mode)
- [Leader Mode](/docs/leader-mode)

## Everyday Tools

- [Finding Files](/docs/finding-files)
- [Learning, Aliases, and Defaults](/docs/learning-aliases-and-defaults)
- [Clipboard History and Shelf](/docs/clipboard-history-and-shelf)
- [Built-In Tools](/docs/built-in-tools)
- [Send Keys](/docs/send-keys)

## Replacement Guides

- [Replacing Spotlight with Tuna](/docs/replacing-spotlight-with-tuna)
- [Replacing the System Emoji Picker](/docs/replacing-the-system-emoji-picker)

## Customization

- [Smart Links](/docs/smart-links)
- Custom Scripts and Script Directories
- [Hotkeys and Activation](/docs/hotkeys-and-activation)
- [Themes and Appearance](/docs/themes-and-appearance)

## Extensions

- [Extensions](/docs/extensions-overview)

## Reference

- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
- [Privacy and Local Processing](/docs/privacy-and-local-processing)

# Custom Scripts and Script Directories

Tuna can treat your own scripts like normal commands.

That means your script can show up in search, run directly, accept input, and even hand text back into Tuna for the next step.

## [](#default-location)Default Location

By default, Tuna looks in `~/Library/Scripts`.

If that is enough for you, you do not need to configure anything.

## [](#adding-more-script-directories)Adding More Script Directories

If you want Tuna to scan other folders too, open:

`Settings -> Library -> Scripts`

From there you can add one or more custom script directories.

Default `~/Library/Scripts` support is available in free mode. Adding extra script directories requires Tuna Pro.

Once you add custom directories, Tuna uses those directories for the Scripts catalog. This is useful if you keep scripts in a dotfiles repo, a work folder, or a project-specific automation directory.

## [](#what-tuna-can-discover)What Tuna Can Discover

The Scripts catalog can pick up:

- AppleScript files
- AppleScript bundles
- Automator workflows
- folder actions
- executable scripts like shell, Ruby, or Python scripts
- shebang scripts even if the file is not marked executable

So this is not limited to AppleScript.

## [](#making-scripts-feel-native)Making Scripts Feel Native

Executable scripts and `.applescript` source files can add Tuna headers near the top of the file to control how they appear and run.

Example:

```
#!/bin/sh
# @tuna.name Resize Images
# @tuna.subtitle Shrink selected files for email
# @tuna.icon symbol:photo.badge.arrow.down
# @tuna.mode background
# @tuna.input arguments
# @tuna.output text
```

Tuna reads headers from leading comment lines until it reaches the first non-empty line that is not a comment.

## [](#script-metadata-reference)Script Metadata Reference

Supported headers:

- `@tuna.name`: sets the display name
- `@tuna.title`: same as `@tuna.name`
- `@tuna.subtitle`: sets the subtitle shown in search results
- `@tuna.icon`: sets the icon Tuna should show
- `@tuna.mode`: chooses how the script runs
- `@tuna.input`: chooses how `Run with Input...` passes input to the script
- `@tuna.output`: chooses whether Tuna stages script output back into the command flow

Defaults:

- `@tuna.mode inline`
- `@tuna.input arguments`
- `@tuna.output none`

Supported `@tuna.mode` values:

- `inline`: run immediately in Tuna's command flow
- `background`: run as a Shelf task

Supported `@tuna.input` values:

- `arguments`: pass input as argv values
- `stdin`: pass input through standard input
- `none`: make the script reject `Run with Input...`

Supported `@tuna.output` values:

- `none`: do not stage any output back into Tuna
- `text`: stage stdout as a text result

Supported `@tuna.icon` formats:

- `symbol:speaker.wave.3.fill`
- `bundle-id:com.todoist.mac.Todoist`
- `app:/Applications/Todoist.app`
- `file:~/Pictures/custom-icon.png`

Use `symbol:` for SF Symbols, `bundle-id:` to borrow another app's icon, `app:` for a specific app bundle on disk, and `file:` for an image file.

Tuna accepts metadata comment lines that start with `#`, `//`, `--`, or `;`.

If Tuna sees an unknown value for a header, it falls back to the default behavior instead of failing.

## [](#inline-scripts-and-background-scripts)Inline Scripts And Background Scripts

If a script runs inline and returns text, Tuna can stage that text right away so you can keep chaining actions.

If a script runs in the background, Tuna puts it in Shelf instead. That is a better fit for longer-running scripts or scripts that should not block the launcher.

## [](#run-with-input)Run With Input

Scripts can also participate in Tuna's normal command flow.

That means you can:

- pick some text or files as the subject
- choose `Run with Input...`
- send that input into a script

This makes scripts feel like part of Tuna's command system instead of a separate automation island.

## [](#which-script-types-support-headers)Which Script Types Support Headers

The Scripts catalog can discover several script-like file types, but Tuna metadata headers only apply to:

- executable scripts
- shebang scripts
- `.applescript` source files

Compiled AppleScript files, AppleScript bundles, Automator workflows, and folder actions can still show up in Tuna and run normally, but they do not use Tuna header metadata.

## [](#when-to-use-this)When To Use This

Use custom script directories when:

- you already have scripts you use often
- you want Tuna to become the front door to your own automation
- you want quick personal commands without building a full extension

If you want the bigger picture first, go back to [How Commands Work](/docs/how-commands-work).

[Changelog](/changelog) • [Terms of Use](/terms) • [Privacy Policy](/privacy)
