#!/Users/bjesuiter/.bun/bin/bun
// @tuna.name Update NetBird
// @tuna.subtitle Download the latest NetBird pkg, install it, and restart NetBird
// @tuna.icon symbol:arrow.down.app.fill
// @tuna.mode background
// @tuna.input none
// @tuna.output text
// version: 2026-04-09.3

const GITHUB_REPO = "netbirdio/netbird";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const RELEASES_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const APP_PATH = "/Applications/NetBird.app";
const APP_BUNDLE_ID = "io.netbird.client";
const APP_BINARY_PATH = `${APP_PATH}/Contents/MacOS/netbird`;
const APP_UI_BINARY_NAME = "netbird-ui";
const CLI_PATH = "/usr/local/bin/netbird";
const PKG_IDENTIFIER = "io.netbird.client";
const NETBIRD_LOG_DIR = "/var/log/netbird";
const PREINSTALL_LOG = `${NETBIRD_LOG_DIR}/client_pre_install.log`;
const POSTINSTALL_LOG = `${NETBIRD_LOG_DIR}/client_post_install.log`;
const CLIENT_LOG = `${NETBIRD_LOG_DIR}/client.log`;
const INSTALLER_LOG = "/private/tmp/netbird-macos-autoupdater-installer.log";
const EXPECTED_INSTALLER_SIGNER =
  "Developer ID Installer: Wiretrustee UG (haftungsbeschrankt) (TA739QLA7A)";
const EXPECTED_INSTALLER_FINGERPRINT =
  "F162AB76B243200C85027DE31F6C6522342F5B5E594764703F1A61D53FCB92F9";

const USER_AGENT = "netbird-macos-autoupdater";

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
};

export type GitHubRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReleaseAsset[];
};

export type UpdatePlan = {
  latestTag: string;
  latestVersion: string;
  releaseUrl: string;
  pkgAsset: ReleaseAsset;
  sourceNotes: string[];
};

export type InstalledState = {
  appInstalled: boolean;
  cliInstalled: boolean;
  brewInstalled: boolean;
  currentVersion: string | null;
  uiRunning: boolean;
  daemonRunning: boolean;
};

export type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv.slice(2));

  return {
    json: flags.has("--json"),
    verbose: flags.has("--verbose"),
    downloadOnly: flags.has("--download-only"),
    checkOnly: flags.has("--check-only"),
    force: flags.has("--force"),
    help: flags.has("--help") || flags.has("-h"),
  };
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function normalizeTag(tag: string): string {
  return tag.startsWith("v") ? tag : `v${tag}`;
}

export function stripLeadingV(value: string): string {
  return value.replace(/^v/i, "").trim();
}

export function normalizeVersion(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = stripLeadingV(value);
  return normalized.length > 0 ? normalized : null;
}

function parseVersionParts(value: string): { numeric: number[]; prerelease: string | null } {
  const normalized = stripLeadingV(value);
  const [corePart, prerelease] = normalized.split("-", 2);
  const core = corePart ?? "0";
  const numeric = core
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

  return {
    numeric,
    prerelease: prerelease ?? null,
  };
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const maxLength = Math.max(left.numeric.length, right.numeric.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left.numeric[index] ?? 0;
    const rightPart = right.numeric[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }

  if (left.prerelease === null) {
    return 1;
  }

  if (right.prerelease === null) {
    return -1;
  }

  return left.prerelease.localeCompare(right.prerelease);
}

export function extractTagFromLocation(location: string): string {
  const match = location.match(/\/releases\/tag\/([^/?#]+)/);

  if (!match) {
    throw new Error(`Could not extract release tag from redirect location: ${location}`);
  }

  const extractedTag = match[1];

  if (!extractedTag) {
    throw new Error(`Could not extract release tag from redirect location: ${location}`);
  }

  return decodeURIComponent(extractedTag);
}

function toAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function pathExists(path: string): Promise<boolean> {
  const result = await runCommand(["/bin/test", "-e", path], true);
  return result.exitCode === 0;
}

async function runCommand(args: string[], allowFailure = false): Promise<RunResult> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 && !allowFailure) {
    const rendered = [...args, "\n", stdout, stderr].filter(Boolean).join("");
    throw new Error(`Command failed (${exitCode}): ${rendered.trim()}`);
  }

  return { exitCode, stdout, stderr };
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return true;
    }

    await sleep(intervalMs);
  }

  return predicate();
}

async function getLatestTagFromRedirect(): Promise<string> {
  const response = await fetch(RELEASES_LATEST_URL, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  const location = response.headers.get("location");

  if (!location) {
    throw new Error(`Expected redirect from ${RELEASES_LATEST_URL}, got status ${response.status}`);
  }

  return extractTagFromLocation(location);
}

async function getReleaseByTag(tag: string): Promise<GitHubRelease> {
  const response = await fetch(`${RELEASES_API_BASE}/tags/${encodeURIComponent(tag)}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${tag}: HTTP ${response.status}`);
  }

  return (await response.json()) as GitHubRelease;
}

async function getStableReleasesFromApi(): Promise<GitHubRelease[]> {
  const response = await fetch(`${RELEASES_API_BASE}?per_page=10`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub releases lookup failed: HTTP ${response.status}`);
  }

  const releases = (await response.json()) as GitHubRelease[];
  const stableReleases = releases.filter((release) => !release.prerelease && !release.draft);

  if (stableReleases.length === 0) {
    throw new Error("No stable GitHub release found.");
  }

  return stableReleases;
}

export function findPkgAsset(release: GitHubRelease): ReleaseAsset {
  const pkgAssets = release.assets.filter((asset) => asset.name.endsWith(".pkg"));

  if (pkgAssets.length === 0) {
    throw new Error(`No .pkg asset found on release ${release.tag_name}`);
  }

  const selectedAsset =
    pkgAssets.find((asset) => /darwin|mac|netbird/i.test(asset.name)) ?? pkgAssets[0];

  if (!selectedAsset) {
    throw new Error(`No selectable .pkg asset found on release ${release.tag_name}`);
  }

  return selectedAsset;
}

export async function resolveLatestUpdatePlan(deps: {
  getLatestTagFromRedirect?: () => Promise<string>;
  getStableReleasesFromApi?: () => Promise<GitHubRelease[]>;
  getReleaseByTag?: (tag: string) => Promise<GitHubRelease>;
} = {}): Promise<UpdatePlan> {
  const sourceNotes: string[] = [];
  const getLatestTag = deps.getLatestTagFromRedirect ?? getLatestTagFromRedirect;
  const getStableReleases = deps.getStableReleasesFromApi ?? getStableReleasesFromApi;
  const fetchReleaseByTag = deps.getReleaseByTag ?? getReleaseByTag;

  const [redirectResult, apiReleasesResult] = await Promise.allSettled([
    getLatestTag(),
    getStableReleases(),
  ]);

  const candidateTags: string[] = [];

  if (redirectResult.status === "fulfilled") {
    sourceNotes.push(`redirect latest -> ${redirectResult.value}`);
    candidateTags.push(normalizeTag(redirectResult.value));
  } else {
    sourceNotes.push(`redirect latest lookup failed: ${redirectResult.reason}`);
  }

  if (apiReleasesResult.status === "fulfilled") {
    const apiTags = apiReleasesResult.value.map((release) => normalizeTag(release.tag_name));
    sourceNotes.push(`api stable releases -> ${apiTags.slice(0, 5).join(", ")}`);
    candidateTags.push(...apiTags);
  } else {
    sourceNotes.push(`api stable releases lookup failed: ${apiReleasesResult.reason}`);
  }

  const uniqueTags = [...new Set(candidateTags)].sort((left, right) =>
    compareVersions(stripLeadingV(right), stripLeadingV(left)),
  );

  if (uniqueTags.length === 0) {
    throw new Error("Could not determine the latest NetBird release from GitHub.");
  }

  for (const tag of uniqueTags) {
    const release = await fetchReleaseByTag(tag);

    try {
      const pkgAsset = findPkgAsset(release);
      sourceNotes.push(`selected installable release -> ${tag}`);
      return {
        latestTag: release.tag_name,
        latestVersion: stripLeadingV(release.tag_name),
        releaseUrl: release.html_url,
        pkgAsset,
        sourceNotes,
      };
    } catch {
      sourceNotes.push(`skipped ${tag}: no pkg asset`);
    }
  }

  throw new Error("No installable NetBird GitHub release with a macOS .pkg asset was found.");
}

async function buildUpdatePlan(): Promise<UpdatePlan> {
  return resolveLatestUpdatePlan();
}

async function isBrewInstalledNetBird(): Promise<boolean> {
  const brew = await runCommand(
    ["/bin/sh", "-lc", "command -v brew >/dev/null 2>&1 && brew list --formula | grep -qx netbird"],
    true,
  );
  return brew.exitCode === 0;
}

export async function resolveInstalledVersion(deps: {
  pathExists?: (path: string) => Promise<boolean>;
  runCommand?: (args: string[], allowFailure?: boolean) => Promise<RunResult>;
} = {}): Promise<string | null> {
  const hasPath = deps.pathExists ?? pathExists;
  const exec = deps.runCommand ?? runCommand;

  if (await hasPath(`${APP_PATH}/Contents/Info.plist`)) {
    for (const key of [":CFBundleShortVersionString", ":CFBundleVersion"]) {
      const result = await exec(
        ["/usr/libexec/PlistBuddy", "-c", `Print ${key}`, `${APP_PATH}/Contents/Info.plist`],
        true,
      );

      const value = normalizeVersion(result.stdout.trim());
      if (result.exitCode === 0 && value) {
        return value;
      }
    }
  }

  for (const binaryPath of [CLI_PATH, APP_BINARY_PATH]) {
    if (!(await hasPath(binaryPath))) {
      continue;
    }

    const result = await exec([binaryPath, "version"], true);
    const value = normalizeVersion(result.stdout.trim());
    if (result.exitCode === 0 && value) {
      return value;
    }
  }

  const receipt = await exec(["/usr/sbin/pkgutil", "--pkg-info", PKG_IDENTIFIER], true);
  if (receipt.exitCode === 0) {
    const match = receipt.stdout.match(/version:\s*([^\s]+)/i);
    const value = normalizeVersion(match?.[1]);
    if (value) {
      return value;
    }
  }

  return null;
}

async function getInstalledVersion(): Promise<string | null> {
  return resolveInstalledVersion();
}

async function isUiRunning(): Promise<boolean> {
  const result = await runCommand(["/usr/bin/pgrep", "-x", APP_UI_BINARY_NAME], true);
  return result.exitCode === 0;
}

async function isDaemonRunning(): Promise<boolean> {
  const result = await runCommand(["/usr/bin/pgrep", "-f", "netbird.*service run"], true);
  return result.exitCode === 0;
}

async function getInstalledState(): Promise<InstalledState> {
  const [appInstalled, cliInstalled, brewInstalled, currentVersion, uiRunning, daemonRunning] =
    await Promise.all([
      pathExists(APP_PATH),
      pathExists(CLI_PATH),
      isBrewInstalledNetBird(),
      getInstalledVersion(),
      isUiRunning(),
      isDaemonRunning(),
    ]);

  return {
    appInstalled,
    cliInstalled,
    brewInstalled,
    currentVersion,
    uiRunning,
    daemonRunning,
  };
}

async function makeTemporaryDirectory(): Promise<string> {
  const result = await runCommand(["/usr/bin/mktemp", "-d"]);
  return result.stdout.trim();
}

async function downloadPkg(asset: ReleaseAsset): Promise<string> {
  const targetDirectory = await makeTemporaryDirectory();
  const targetPath = `${targetDirectory}/${asset.name}`;

  const response = await fetch(asset.browser_download_url, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${asset.browser_download_url}: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  await Bun.write(targetPath, new Uint8Array(buffer));

  return targetPath;
}

async function verifyPkg(pkgPath: string): Promise<string> {
  const result = await runCommand(["/usr/sbin/pkgutil", "--check-signature", pkgPath]);
  const rendered = `${result.stdout}${result.stderr}`.trim();

  if (!rendered.includes("trusted by the Apple notary service")) {
    throw new Error(`Package notarization check failed for ${pkgPath}`);
  }

  if (!rendered.includes(EXPECTED_INSTALLER_SIGNER)) {
    throw new Error(
      "Package signer did not match the expected NetBird Developer ID Installer certificate.",
    );
  }

  const normalizedSignatureOutput = rendered.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
  if (!normalizedSignatureOutput.includes(EXPECTED_INSTALLER_FINGERPRINT)) {
    throw new Error(
      "Package signer fingerprint did not match the expected NetBird Developer ID Installer certificate.",
    );
  }

  return rendered;
}

async function installPkg(pkgPath: string): Promise<string> {
  const shellCommand = `/usr/sbin/installer -pkg ${JSON.stringify(pkgPath)} -target / > ${JSON.stringify(INSTALLER_LOG)} 2>&1`;

  if (process.getuid?.() === 0) {
    await runCommand(["/bin/sh", "-lc", shellCommand]);
  } else {
    const appleScript = [
      `set shellCommand to ${toAppleScriptString(shellCommand)}`,
      "do shell script shellCommand with administrator privileges",
    ];

    const result = await runCommand(
      ["/usr/bin/osascript", ...appleScript.flatMap((line) => ["-e", line])],
      true,
    );

    if (result.exitCode !== 0) {
      const combined = `${result.stdout}${result.stderr}`;
      if (/User canceled/i.test(combined)) {
        throw new Error("Installation canceled at the macOS administrator prompt.");
      }

      const installerLog = await tailLog(INSTALLER_LOG, 50);
      throw new Error(
        `Installer failed: ${combined.trim()}${installerLog ? `\n${installerLog}` : ""}`,
      );
    }
  }

  return (await tailLog(INSTALLER_LOG, 50)) ?? "";
}

async function openNetBirdApp(): Promise<void> {
  await runCommand(["/usr/bin/open", "-b", APP_BUNDLE_ID], true);
}

async function restartNetBirdFallback(): Promise<void> {
  const binaryPath = (await pathExists(CLI_PATH)) ? CLI_PATH : APP_BINARY_PATH;

  await runCommand(
    [
      "/usr/bin/osascript",
      "-e",
      `try`,
      "-e",
      `tell application id ${toAppleScriptString(APP_BUNDLE_ID)} to quit`,
      "-e",
      "end try",
    ],
    true,
  );

  if (process.getuid?.() === 0) {
    await runCommand([binaryPath, "service", "install"], true);
    await runCommand([binaryPath, "service", "start"], true);
  } else {
    const appleScript = [
      `set shellCommand to ${toAppleScriptString(`${binaryPath} service install || true; ${binaryPath} service start || true 2>&1`)}`,
      "do shell script shellCommand with administrator privileges",
    ];

    await runCommand(["/usr/bin/osascript", ...appleScript.flatMap((line) => ["-e", line])], true);
  }

  await openNetBirdApp();
}

async function waitForInstalledVersion(expectedVersion: string): Promise<boolean> {
  return waitFor(
    async () => {
      const current = await getInstalledVersion();
      return current !== null && compareVersions(current, expectedVersion) === 0;
    },
    60_000,
    1_500,
  );
}

async function waitForHealthyNetBird(): Promise<boolean> {
  return waitFor(
    async () => {
      const [uiRunning, daemonRunning] = await Promise.all([isUiRunning(), isDaemonRunning()]);
      return uiRunning && daemonRunning;
    },
    45_000,
    1_500,
  );
}

async function tailLog(path: string, lines = 20): Promise<string | null> {
  if (!(await pathExists(path))) {
    return null;
  }

  const result = await runCommand(["/usr/bin/tail", "-n", String(lines), path], true);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function printStdout(text: string): void {
  process.stdout.write(`${text}\n`);
}

function printStderr(text: string): void {
  process.stderr.write(`${text}\n`);
}

function printProgress(enabled: boolean, text: string): void {
  if (enabled) {
    printStderr(`[update-netbird] ${text}`);
  }
}

async function sendMacNotification(
  message: string,
  options: { title?: string; subtitle?: string } = {},
): Promise<void> {
  const title = options.title ?? "Update NetBird";
  let command = `display notification ${toAppleScriptString(message)} with title ${toAppleScriptString(title)}`;

  if (options.subtitle) {
    command += ` subtitle ${toAppleScriptString(options.subtitle)}`;
  }

  await runCommand(["/usr/bin/osascript", "-e", command], true);
}

function printHelp() {
  printStdout(`Update NetBird

Usage:
  update-netbird.ts [--check-only] [--download-only] [--force] [--json] [--verbose]

Behavior:
  With no flags, the script checks the latest GitHub release, compares it to the installed NetBird version,
  downloads the latest pkg when needed, installs it with a macOS admin prompt, and verifies NetBird came back up.

Flags:
  --check-only    Only report current/latest versions and whether an update is available
  --download-only Download the latest pkg, verify its signature, and stop before installation
  --force         Continue even if the installed version already matches the latest version
  --json          Output machine-readable JSON
  --verbose       Include extra diagnostic output
  -h, --help      Show this help text`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  printProgress(args.verbose, "Resolving latest release and installed state...");
  const [plan, installed] = await Promise.all([buildUpdatePlan(), getInstalledState()]);
  const currentVersion = normalizeVersion(installed.currentVersion);
  const latestVersion = normalizeVersion(plan.latestVersion);
  const updateAvailable =
    currentVersion === null ||
    latestVersion === null ||
    compareVersions(currentVersion, latestVersion) < 0;

  if (args.json) {
    printStdout(
      JSON.stringify(
        {
          currentVersion,
          latestTag: plan.latestTag,
          latestVersion,
          updateAvailable,
          releaseUrl: plan.releaseUrl,
          pkgName: plan.pkgAsset.name,
          pkgUrl: plan.pkgAsset.browser_download_url,
          pkgSizeBytes: plan.pkgAsset.size,
          appInstalled: installed.appInstalled,
          cliInstalled: installed.cliInstalled,
          brewInstalled: installed.brewInstalled,
          uiRunning: installed.uiRunning,
          daemonRunning: installed.daemonRunning,
          sourceNotes: plan.sourceNotes,
        },
        null,
        2,
      ),
    );
    return;
  }

  const lines = [
    `Installed version: ${currentVersion ?? "not installed"}`,
    `Latest version: ${latestVersion ?? plan.latestTag}`,
    `Update available: ${updateAvailable ? "yes" : "no"}`,
    `Package: ${plan.pkgAsset.name} (${formatBytes(plan.pkgAsset.size)})`,
    `Release page: ${plan.releaseUrl}`,
  ];

  if (args.verbose) {
    lines.push(`Package URL: ${plan.pkgAsset.browser_download_url}`);
    lines.push(
      `Current state: uiRunning=${installed.uiRunning}, daemonRunning=${installed.daemonRunning}, brewInstalled=${installed.brewInstalled}`,
    );
    lines.push(`Release resolution: ${plan.sourceNotes.join(" | ")}`);
  }

  if (installed.brewInstalled) {
    throw new Error(
      "NetBird appears to be installed via Homebrew. Use Homebrew to update it instead of the pkg updater.",
    );
  }

  if (args.checkOnly) {
    printStdout(lines.join("\n"));
    return;
  }

  if (!updateAvailable && !args.force) {
    lines.push("", "NetBird is already up to date. No install was performed.");
    await sendMacNotification("NetBird is already up to date.", {
      subtitle: currentVersion ?? plan.latestTag,
    });
    printStdout(lines.join("\n"));
    return;
  }

  await sendMacNotification("Preparing update…", {
    subtitle: latestVersion ? `Updating to ${latestVersion}` : plan.latestTag,
  });

  lines.push("", "Downloading pkg...");
  printProgress(args.verbose, `Downloading ${plan.pkgAsset.browser_download_url} ...`);
  await sendMacNotification("Downloading NetBird package…", {
    subtitle: plan.pkgAsset.name,
  });
  const pkgPath = await downloadPkg(plan.pkgAsset);
  lines.push(`Downloaded to: ${pkgPath}`);

  lines.push("", "Verifying package signature...");
  printProgress(args.verbose, `Verifying signature for ${pkgPath} ...`);
  await sendMacNotification("Verifying package signature…", {
    subtitle: latestVersion ? `NetBird ${latestVersion}` : plan.latestTag,
  });
  const signatureSummary = await verifyPkg(pkgPath);
  if (args.verbose) {
    lines.push(signatureSummary);
  } else {
    const signerLine = signatureSummary
      .split("\n")
      .find((line) => line.includes("Developer ID Installer:"));
    if (signerLine) {
      lines.push(signerLine.trim());
    }
    lines.push("Package notarization verified.");
  }

  if (args.downloadOnly) {
    lines.push("", "Download-only mode: package verified but not installed.");
    await sendMacNotification("Package downloaded and verified.", {
      subtitle: "Download-only mode",
    });
    printProgress(args.verbose, "Download-only run completed.");
    printStdout(lines.join("\n"));
    return;
  }

  lines.push("", "Installing pkg (macOS may prompt for your administrator password)...");
  printProgress(args.verbose, "Starting privileged installer...");
  await sendMacNotification("Installing update…", {
    subtitle: "macOS may ask for your password",
  });
  const installOutput = await installPkg(pkgPath);
  if (args.verbose && installOutput) {
    lines.push(installOutput);
  }

  const versionUpdated =
    latestVersion !== null ? await waitForInstalledVersion(latestVersion) : true;
  if (!versionUpdated && latestVersion !== null) {
    throw new Error(
      `Installation completed but NetBird did not report version ${latestVersion} within the expected time.`,
    );
  }

  await sendMacNotification("Waiting for NetBird to restart…", {
    subtitle: latestVersion ? `Expecting ${latestVersion}` : plan.latestTag,
  });

  let healthy = await waitForHealthyNetBird();
  if (!healthy) {
    lines.push(
      "",
      "Installer completed, but NetBird did not come back up cleanly. Trying restart fallback...",
    );
    printProgress(args.verbose, "Running restart fallback...");
    await sendMacNotification("Trying NetBird restart fallback…");
    await restartNetBirdFallback();
    healthy = await waitForHealthyNetBird();
  }

  const finalState = await getInstalledState();
  lines.push(
    "",
    `Final version: ${finalState.currentVersion ?? "unknown"}`,
    `Final state: uiRunning=${finalState.uiRunning}, daemonRunning=${finalState.daemonRunning}`,
  );

  if (!healthy) {
    const [preinstallLog, postinstallLog, clientLog] = await Promise.all([
      tailLog(PREINSTALL_LOG),
      tailLog(POSTINSTALL_LOG),
      tailLog(CLIENT_LOG),
    ]);

    lines.push("", "NetBird installed, but restart verification still failed.");
    if (preinstallLog) {
      lines.push("", `Last lines from ${PREINSTALL_LOG}:`, preinstallLog);
    }
    if (postinstallLog) {
      lines.push("", `Last lines from ${POSTINSTALL_LOG}:`, postinstallLog);
    }
    if (clientLog) {
      lines.push("", `Last lines from ${CLIENT_LOG}:`, clientLog);
    }

    throw new Error(lines.join("\n"));
  }

  lines.push("", "NetBird update completed successfully.");
  await sendMacNotification("NetBird update completed successfully.", {
    subtitle: finalState.currentVersion ?? latestVersion ?? plan.latestTag,
  });
  printStdout(lines.join("\n"));
}

if (import.meta.main) {
  main().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await sendMacNotification("NetBird update failed.", {
      subtitle: message.slice(0, 120),
    });
    printStderr(`Update NetBird failed: ${message}`);
    process.exit(1);
  });
}
