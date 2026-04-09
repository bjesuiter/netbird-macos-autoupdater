import { describe, expect, it } from "bun:test";

import {
  resolveInstalledVersion,
  resolveLatestUpdatePlan,
  type GitHubRelease,
  type RunResult,
} from "./update-netbird.ts";

function ok(stdout = "", stderr = ""): RunResult {
  return { exitCode: 0, stdout, stderr };
}

function fail(stdout = "", stderr = ""): RunResult {
  return { exitCode: 1, stdout, stderr };
}

describe("resolveInstalledVersion", () => {
  it("reads the installed version from NetBird.app Info.plist first", async () => {
    const version = await resolveInstalledVersion({
      pathExists: async (path) => path === "/Applications/NetBird.app/Contents/Info.plist",
      runCommand: async (args) => {
        if (args[0] === "/usr/libexec/PlistBuddy" && args[2] === "Print :CFBundleShortVersionString") {
          return ok("0.68.0\n");
        }

        throw new Error(`Unexpected command: ${args.join(" ")}`);
      },
    });

    expect(version).toBe("0.68.0");
  });

  it("falls back to the pkg receipt version when app metadata is unavailable", async () => {
    const version = await resolveInstalledVersion({
      pathExists: async () => false,
      runCommand: async (args) => {
        if (args[0] === "/usr/sbin/pkgutil") {
          return ok("package-id: io.netbird.client\nversion: 0.67.4\n");
        }

        return fail();
      },
    });

    expect(version).toBe("0.67.4");
  });
});

describe("resolveLatestUpdatePlan", () => {
  it("prefers the newest installable release when redirect latest is stale", async () => {
    const releases = new Map<string, GitHubRelease>([
      [
        "v0.68.1",
        {
          tag_name: "v0.68.1",
          name: "v0.68.1",
          html_url: "https://github.com/netbirdio/netbird/releases/tag/v0.68.1",
          published_at: "2026-04-09T00:00:00Z",
          assets: [
            {
              name: "netbird_0.68.1_darwin.pkg",
              browser_download_url:
                "https://github.com/netbirdio/netbird/releases/download/v0.68.1/netbird_0.68.1_darwin.pkg",
              size: 123,
            },
          ],
        },
      ],
      [
        "v0.68.0",
        {
          tag_name: "v0.68.0",
          name: "v0.68.0",
          html_url: "https://github.com/netbirdio/netbird/releases/tag/v0.68.0",
          published_at: "2026-04-08T00:00:00Z",
          assets: [
            {
              name: "netbird_0.68.0_darwin.pkg",
              browser_download_url:
                "https://github.com/netbirdio/netbird/releases/download/v0.68.0/netbird_0.68.0_darwin.pkg",
              size: 122,
            },
          ],
        },
      ],
    ]);

    const plan = await resolveLatestUpdatePlan({
      getLatestTagFromRedirect: async () => "v0.68.0",
      getStableReleasesFromApi: async () => [
        { ...releases.get("v0.68.1")!, draft: false, prerelease: false },
        { ...releases.get("v0.68.0")!, draft: false, prerelease: false },
      ],
      getReleaseByTag: async (tag) => releases.get(tag)!,
    });

    expect(plan.latestTag).toBe("v0.68.1");
    expect(plan.latestVersion).toBe("0.68.1");
    expect(plan.pkgAsset.name).toBe("netbird_0.68.1_darwin.pkg");
  });

  it("skips newer releases without a pkg and selects the newest installable one", async () => {
    const releases = new Map<string, GitHubRelease>([
      [
        "v0.68.1",
        {
          tag_name: "v0.68.1",
          name: "v0.68.1",
          html_url: "https://github.com/netbirdio/netbird/releases/tag/v0.68.1",
          published_at: "2026-04-09T00:00:00Z",
          assets: [
            {
              name: "netbird_0.68.1_darwin_all.tar.gz",
              browser_download_url:
                "https://github.com/netbirdio/netbird/releases/download/v0.68.1/netbird_0.68.1_darwin_all.tar.gz",
              size: 123,
            },
          ],
        },
      ],
      [
        "v0.68.0",
        {
          tag_name: "v0.68.0",
          name: "v0.68.0",
          html_url: "https://github.com/netbirdio/netbird/releases/tag/v0.68.0",
          published_at: "2026-04-08T00:00:00Z",
          assets: [
            {
              name: "netbird_0.68.0_darwin.pkg",
              browser_download_url:
                "https://github.com/netbirdio/netbird/releases/download/v0.68.0/netbird_0.68.0_darwin.pkg",
              size: 122,
            },
          ],
        },
      ],
    ]);

    const plan = await resolveLatestUpdatePlan({
      getLatestTagFromRedirect: async () => "v0.68.1",
      getStableReleasesFromApi: async () => [
        { ...releases.get("v0.68.1")!, draft: false, prerelease: false },
        { ...releases.get("v0.68.0")!, draft: false, prerelease: false },
      ],
      getReleaseByTag: async (tag) => releases.get(tag)!,
    });

    expect(plan.latestTag).toBe("v0.68.0");
    expect(plan.latestVersion).toBe("0.68.0");
    expect(plan.pkgAsset.name).toBe("netbird_0.68.0_darwin.pkg");
    expect(plan.sourceNotes.some((note) => note.includes("skipped v0.68.1: no pkg asset"))).toBe(
      true,
    );
  });
});
