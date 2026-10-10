// Checks that the release version is the same everywhere: manifest.json,
// package.json, package-lock.json, versions.json (with the manifest's
// minAppVersion) and a CHANGELOG.md section. Run in CI and before releases.

import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const json = (file) => JSON.parse(read(file));

const manifest = json("manifest.json");
const pkg = json("package.json");
const lock = json("package-lock.json");
const versions = json("versions.json");
const changelog = read("CHANGELOG.md");
const { version, minAppVersion } = manifest;

const problems = [];
if (pkg.version !== version) problems.push(`package.json has ${pkg.version}`);
if (lock.version !== version || lock.packages?.[""]?.version !== version) {
	problems.push(`package-lock.json has ${lock.version} (run npm install)`);
}
if (versions[version] !== minAppVersion) {
	problems.push(`versions.json maps ${version} to ${versions[version] ?? "nothing"}, expected ${minAppVersion}`);
}
if (!changelog.split("\n").some((line) => line.startsWith(`## ${version} `))) {
	problems.push(`CHANGELOG.md has no "## ${version} …" section`);
}

if (problems.length) {
	console.error(`Version ${version} (manifest.json) does not match:\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
console.log(`Version ${version} is consistent.`);
