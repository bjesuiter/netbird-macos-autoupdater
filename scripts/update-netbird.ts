#!/usr/bin/env bun
// @tuna.name Update NetBird
// @tuna.subtitle Download the latest NetBird pkg, install it, and restart NetBird
// @tuna.icon symbol:arrow.down.app.fill
// @tuna.mode background
// @tuna.input none
// @tuna.output text

const GITHUB_REPO = "netbirdio/netbird";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const RELEASES_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
};

type GitHubRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
};

type UpdatePlan = {
  tag: string;
  releaseUrl: string;
  pkgAsset: ReleaseAsset;
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv.slice(2));

  return {
    json: flags.has("--json"),
    verbose: flags.has("--verbose"),
    downloadOnly: flags.has("--download-only"),
    install: flags.has("--install"),
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

function normalizeTag(tag: string): string {
  return tag.startsWith("v") ? tag : `v${tag}`;
}

function extractTagFromLocation(location: string): string {
  const match = location.match(/\/releases\/tag\/([^/?#]+)/);

  if (!match) {
    throw new Error(`Could not extract release tag from redirect location: ${location}`);
  }

  return decodeURIComponent(match[1]);
}

async function getLatestTagFromRedirect(): Promise<string> {
  const response = await fetch(RELEASES_LATEST_URL, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent": "netbird-macos-autoupdater",
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
      "user-agent": "netbird-macos-autoupdater",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${tag}: HTTP ${response.status}`);
  }

  return (await response.json()) as GitHubRelease;
}

function findPkgAsset(release: GitHubRelease): ReleaseAsset {
  const pkgAssets = release.assets.filter((asset) => asset.name.endsWith(".pkg"));

  if (pkgAssets.length === 0) {
    throw new Error(`No .pkg asset found on release ${release.tag_name}`);
  }

  const macPreferred =
    pkgAssets.find((asset) => /mac|darwin|universal|netbird/i.test(asset.name)) ?? pkgAssets[0];

  return macPreferred;
}

async function buildUpdatePlan(): Promise<UpdatePlan> {
  const latestTag = await getLatestTagFromRedirect();
  const release = await getReleaseByTag(normalizeTag(latestTag));
  const pkgAsset = findPkgAsset(release);

  return {
    tag: release.tag_name,
    releaseUrl: release.html_url,
    pkgAsset,
  };
}

async function downloadPkg(asset: ReleaseAsset): Promise<string> {
  const tmpDir = await Bun.$`mktemp -d`.text();
  const trimmedTmpDir = tmpDir.trim();
  const targetPath = `${trimmedTmpDir}/${asset.name}`;

  const response = await fetch(asset.browser_download_url, {
    headers: {
      "user-agent": "netbird-macos-autoupdater",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${asset.browser_download_url}: HTTP ${response.status}`);
  }

  await Bun.write(targetPath, response);
  return targetPath;
}

async function installPkg(_pkgPath: string): Promise<void> {
  throw new Error("Installation is not implemented yet. Next step: call /usr/sbin/installer with privilege escalation.");
}

async function restartNetBird(): Promise<void> {
  throw new Error("NetBird restart is not implemented yet. Next step: determine the authoritative macOS restart flow.");
}

function printHelp() {
  console.log(`Update NetBird\n\nUsage:\n  update-netbird.ts [--json] [--verbose] [--download-only] [--install]\n\nFlags:\n  --json           Output machine-readable JSON\n  --verbose        Include extra diagnostic output\n  --download-only  Resolve the latest pkg and download it, but do not install\n  --install        Attempt download + install + restart (install/restart are scaffolded but not implemented yet)\n  -h, --help       Show this help text`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  const plan = await buildUpdatePlan();

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          tag: plan.tag,
          releaseUrl: plan.releaseUrl,
          pkgName: plan.pkgAsset.name,
          pkgUrl: plan.pkgAsset.browser_download_url,
          pkgSizeBytes: plan.pkgAsset.size,
          installImplemented: false,
          restartImplemented: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const lines = [
    `NetBird release: ${plan.tag}`,
    `Package: ${plan.pkgAsset.name} (${formatBytes(plan.pkgAsset.size)})`,
    `Release page: ${plan.releaseUrl}`,
    `Package URL: ${plan.pkgAsset.browser_download_url}`,
  ];

  if (args.verbose) {
    lines.push(`Source: ${RELEASES_LATEST_URL} -> ${plan.tag}`);
  }

  if (!args.downloadOnly && !args.install) {
    lines.push("", "Scaffold status: release discovery is implemented. Download/install/restart steps are next.");
    console.log(lines.join("\n"));
    return;
  }

  const pkgPath = await downloadPkg(plan.pkgAsset);
  lines.push("", `Downloaded to: ${pkgPath}`);

  if (args.downloadOnly) {
    console.log(lines.join("\n"));
    return;
  }

  await installPkg(pkgPath);
  await restartNetBird();

  lines.push("Installed and restarted successfully.");
  console.log(lines.join("\n"));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Update NetBird failed: ${message}`);
  process.exit(1);
});
