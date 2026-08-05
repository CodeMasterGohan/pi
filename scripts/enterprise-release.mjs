#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packages = [
	{ directory: "packages/ai", name: "@earendil-works/pi-ai", buildScript: "build:offline" },
	{ directory: "packages/tui", name: "@earendil-works/pi-tui", buildScript: "build" },
	{ directory: "packages/agent", name: "@earendil-works/pi-agent-core", buildScript: "build" },
	{ directory: "packages/protocol", name: "@earendil-works/pi-protocol", buildScript: "build" },
	{ directory: "packages/client", name: "@earendil-works/pi-client", buildScript: "build" },
	{ directory: "packages/session-backends/sqlite-node", name: "@earendil-works/pi-session-backend-sqlite-node", buildScript: "build" },
	{ directory: "packages/coding-agent", name: "@earendil-works/pi-coding-agent", buildScript: "build" },
];

function printUsage() {
	console.log(`Usage: node scripts/enterprise-release.mjs [options]

Builds the Enterprise (airgapped/lockdown) distribution of pi. The output mirrors
\`npm run release:local -- --skip-install\` except that the coding-agent package
ships an \`enterprise\` sentinel file in its package dir, which causes the binary
to default to offline mode at startup (no version checks, no telemetry, no
model catalog refresh, no package update checks).

Options:
  --out <dir>          Output directory. Defaults to a new directory under ${tmpdir()}
  --force              Remove --out first if it already exists
  --skip-check         Do not run npm run check before building
  --skip-test          Do not run ./test.sh before building
  --help, -h           Show this help
`);
}

function parseArgs() {
	const options = {
		force: false,
		outDir: undefined,
		skipCheck: false,
		skipTest: false,
	};
	const args = process.argv.slice(2);

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		}
		if (arg === "--force") {
			options.force = true;
			continue;
		}
		if (arg === "--skip-check") {
			options.skipCheck = true;
			continue;
		}
		if (arg === "--skip-test") {
			options.skipTest = true;
			continue;
		}
		if (arg === "--out") {
			const value = args[++i];
			if (!value) throw new Error("--out requires a directory");
			options.outDir = value;
			continue;
		}
		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function run(command, args, options = {}) {
	console.log(`$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: "utf8",
		shell: process.platform === "win32",
		stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
	});

	if (result.status !== 0) {
		throw new Error(`Command failed: ${[command, ...args].join(" ")}`);
	}

	return result.stdout ?? "";
}

function readPackageJson(directory) {
	return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function commandExists(command) {
	return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function isInsidePath(child, parent) {
	const relativePath = relative(parent, child);
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function prepareOutputDirectory(options, repoRoot) {
	if (!options.outDir) {
		return mkdtempSync(join(tmpdir(), "pi-enterprise-release-"));
	}

	const outDir = resolve(options.outDir);

	if (isInsidePath(outDir, repoRoot)) {
		throw new Error(`Output directory must be outside the repository: ${outDir}`);
	}

	if (existsSync(outDir)) {
		if (!options.force) {
			throw new Error(`Output directory already exists. Use --force to replace it: ${outDir}`);
		}
		rmSync(outDir, { force: true, recursive: true });
	}

	mkdirSync(outDir, { recursive: true });
	return outDir;
}

function fileSpecifier(fromDirectory, file) {
	const relativePath = relative(fromDirectory, file).replaceAll("\\", "/");
	return `file:${relativePath.startsWith(".") ? relativePath : `./${relativePath}`}`;
}

function packPackage(pkg, tarballDirectory) {
	const packageJson = readPackageJson(pkg.directory);
	if (packageJson.name !== pkg.name) {
		throw new Error(`${pkg.directory}/package.json has name ${packageJson.name}, expected ${pkg.name}`);
	}

	const output = run("npm", ["pack", "--json", "--pack-destination", tarballDirectory], {
		capture: true,
		cwd: pkg.directory,
	});
	const packed = JSON.parse(output)[0];
	return join(tarballDirectory, packed.filename);
}

function createPiShim(installDirectory) {
	const binDirectory = join(installDirectory, "node_modules", ".bin");
	const target = join("node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi");
	const shimPath = join(installDirectory, process.platform === "win32" ? "pi.cmd" : "pi");

	if (process.platform === "win32") {
		const piCmd = join(binDirectory, "pi.cmd");
		const piPs1 = join(binDirectory, "pi.ps1");
		if (existsSync(piCmd)) {
			writeFileSync(join(installDirectory, "pi.cmd"), '@ECHO off\r\n"%~dp0node_modules\\.bin\\pi.cmd" %*\r\n');
			writeFileSync(join(installDirectory, "pi.ps1"), '& "$PSScriptRoot/node_modules/.bin/pi.ps1" @args\r\n');
		} else {
			writeFileSync(join(installDirectory, "pi.cmd"), '@ECHO off\r\n"%~dp0node_modules\\.bin\\pi.exe" %*\r\n');
			writeFileSync(join(installDirectory, "pi.ps1"), '& "$PSScriptRoot/node_modules/.bin/pi.exe" @args\r\n');
		}
	} else {
		symlinkSync(target, shimPath);
	}
}

const options = parseArgs();
const repoRoot = process.cwd();
const rootPackageJson = readPackageJson(repoRoot);

if (rootPackageJson.name !== "pi-monorepo") {
	throw new Error("Run this script from the repository root");
}

const outDir = prepareOutputDirectory(options, repoRoot);
const tarballDirectory = join(outDir, "tarballs");
const nodeInstallDirectory = join(outDir, "node");
mkdirSync(tarballDirectory, { recursive: true });

// Release artifacts always use a freshly generated, strictly validated catalog.
run("npm", ["run", "generate:models"], { cwd: repoRoot });

if (!options.skipCheck) {
	run("npm", ["run", "check"], { cwd: repoRoot });
}

for (const pkg of packages) {
	run("npm", ["run", "clean"], { cwd: pkg.directory });
	run("npm", ["run", pkg.buildScript], { cwd: pkg.directory });
}

if (!options.skipTest) {
	run("./test.sh", [], { cwd: repoRoot });
}

// Inject the enterprise sentinel file into the coding-agent dist so the built
// binary detects isEnterpriseBuild() === true at runtime.
const codingAgentPkg = packages.find((p) => p.name === "@earendil-works/pi-coding-agent");
const codingAgentDist = join(repoRoot, codingAgentPkg.directory, "dist");
writeFileSync(join(codingAgentDist, "enterprise"), "");
console.log("# Injected enterprise sentinel into dist/");

const tarballs = new Map();
for (const pkg of packages) {
	const tarball = packPackage(pkg, tarballDirectory);
	tarballs.set(pkg.name, tarball);
}

// Isolated Node install
mkdirSync(nodeInstallDirectory, { recursive: true });
const dependencies = Object.fromEntries(
	packages.map((pkg) => [pkg.name, fileSpecifier(nodeInstallDirectory, tarballs.get(pkg.name))]),
);
const installPackageJson = `${JSON.stringify({ private: true, dependencies, overrides: dependencies }, undefined, "\t")}\n`;
writeFileSync(join(nodeInstallDirectory, "package.json"), installPackageJson);

run("npm", ["install", "--omit=dev", "--ignore-scripts"], { cwd: nodeInstallDirectory });
createPiShim(nodeInstallDirectory);

// Copy the enterprise sentinel into the installed package dir so that the
// installed binary (not just the dist build) detects enterprise mode.
const installedCodingAgentDir = join(
	nodeInstallDirectory,
	"node_modules",
	"@earendil-works",
	"pi-coding-agent",
);
cpSync(join(codingAgentDist, "enterprise"), join(installedCodingAgentDir, "enterprise"));

console.log("\nEnterprise release artifacts created:");
console.log(`  ${outDir}`);
console.log("\nTarballs:");
for (const tarball of tarballs.values()) {
	console.log(`  ${tarball}`);
}

console.log("\nIsolated npm install:");
console.log(`  ${nodeInstallDirectory}`);
console.log("\nRun the locally packed Enterprise CLI from outside the repository:");
console.log(`  ${join(nodeInstallDirectory, process.platform === "win32" ? "pi.cmd" : "pi")} --help`);
console.log(
	"\nVerify the binary is in lockdown mode (should print enterprise: true and no version-check network call):",
);
console.log(
	`  ${join(nodeInstallDirectory, process.platform === "win32" ? "pi.cmd" : "pi")} -p "what is your version"`,
);
