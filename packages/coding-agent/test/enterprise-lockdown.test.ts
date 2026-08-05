import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetEnterpriseBuildCache, getPackageDir } from "../src/config.ts";
import { applyEnterpriseLockdown } from "../src/main.ts";

describe("enterprise lockdown offline mode", () => {
	const envSnapshot = { ...process.env };
	const sentinelPath = join(getPackageDir(), "enterprise");

	beforeEach(() => {
		delete process.env.PI_OFFLINE;
		delete process.env.PI_SKIP_VERSION_CHECK;
		delete process.env.PI_TELEMETRY;
		delete process.env.PI_ALLOW_NETWORK;
		// Ensure sentinel is absent by default.
		if (existsSync(sentinelPath)) rmSync(sentinelPath, { force: true });
		_resetEnterpriseBuildCache();
	});

	afterEach(() => {
		if (existsSync(sentinelPath)) rmSync(sentinelPath, { force: true });
		_resetEnterpriseBuildCache();
		for (const [k, v] of Object.entries(envSnapshot)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});

	function installEnterpriseBuild(): void {
		mkdirSync(getPackageDir(), { recursive: true });
		writeFileSync(sentinelPath, "");
		_resetEnterpriseBuildCache();
	}

	it("forces offline env vars when enterprise sentinel is present", () => {
		installEnterpriseBuild();
		const offlineMode = applyEnterpriseLockdown(["--help"]);
		expect(offlineMode).toBe(true);
		expect(process.env.PI_OFFLINE).toBe("1");
		expect(process.env.PI_SKIP_VERSION_CHECK).toBe("1");
		expect(process.env.PI_TELEMETRY).toBe("0");
	});

	it("does NOT force offline when there is no enterprise sentinel", () => {
		const offlineMode = applyEnterpriseLockdown(["--help"]);
		expect(offlineMode).toBe(false);
		// Vars should remain untouched (undefined) — no lockdown.
		expect(process.env.PI_OFFLINE).toBeUndefined();
		expect(process.env.PI_SKIP_VERSION_CHECK).toBeUndefined();
		expect(process.env.PI_TELEMETRY).toBeUndefined();
	});

	it("allows operator override via PI_ALLOW_NETWORK=1 in enterprise builds", () => {
		installEnterpriseBuild();
		process.env.PI_ALLOW_NETWORK = "1";
		const offlineMode = applyEnterpriseLockdown(["--help"]);
		expect(offlineMode).toBe(false);
		expect(process.env.PI_OFFLINE).toBeUndefined();
		expect(process.env.PI_SKIP_VERSION_CHECK).toBeUndefined();
	});

	it("respects explicit --offline even when network is allowed", () => {
		installEnterpriseBuild();
		process.env.PI_ALLOW_NETWORK = "1";
		const offlineMode = applyEnterpriseLockdown(["--offline", "--help"]);
		expect(offlineMode).toBe(true);
		expect(process.env.PI_OFFLINE).toBe("1");
		expect(process.env.PI_SKIP_VERSION_CHECK).toBe("1");
		// Telemetry is NOT forced off here because this is the user --offline
		// path, not the enterprise-forced path.
		expect(process.env.PI_TELEMETRY).toBeUndefined();
	});

	it("respects an existing PI_OFFLINE env var regardless of enterprise build", () => {
		// Non-enterprise build, but user already set PI_OFFLINE.
		process.env.PI_OFFLINE = "1";
		const offlineMode = applyEnterpriseLockdown(["--help"]);
		expect(offlineMode).toBe(true);
		expect(process.env.PI_OFFLINE).toBe("1");
		expect(process.env.PI_SKIP_VERSION_CHECK).toBe("1");
		// PI_TELEMETRY should not be forced to 0 — that's enterprise-only.
		expect(process.env.PI_TELEMETRY).toBeUndefined();
	});
});
