import { test } from "node:test";
import assert from "node:assert/strict";
import { DataAccessError, checkDataAccess, extensionOf, isInFolder, resolveDataPath } from "../src/data";

// Pins the current behavior of the data path checks used by prism.data().
// These protect which files a block may read, so any change must fail loudly.

test("resolveDataPath keeps vault-relative paths as they are", () => {
	assert.equal(resolveDataPath("data/x.csv", "notes/n.md"), "data/x.csv");
	assert.equal(resolveDataPath("x.csv", "notes/n.md"), "x.csv");
	assert.equal(resolveDataPath("  data/x.csv  ", "n.md"), "data/x.csv");
});

test("resolveDataPath resolves ./ and ../ relative to the note's folder", () => {
	assert.equal(resolveDataPath("./x.csv", "notes/sub/n.md"), "notes/sub/x.csv");
	assert.equal(resolveDataPath("../x.csv", "notes/sub/n.md"), "notes/x.csv");
	assert.equal(resolveDataPath("./x.csv", "n.md"), "x.csv");
	assert.equal(resolveDataPath("../../x", "a/b/n.md"), "x");
});

test("resolveDataPath normalizes backslashes, '.', empty segments and trailing slashes", () => {
	assert.equal(resolveDataPath("a\\b.csv", "n.md"), "a/b.csv");
	assert.equal(resolveDataPath("..\\x.csv", "a/n.md"), "x.csv");
	assert.equal(resolveDataPath("a/./b.csv", "n.md"), "a/b.csv");
	assert.equal(resolveDataPath("a//b.csv", "n.md"), "a/b.csv");
	assert.equal(resolveDataPath("data/x.csv/", "n.md"), "data/x.csv");
	assert.equal(resolveDataPath("data/../x.csv", "n.md"), "x.csv");
});

test("resolveDataPath strips a leading slash instead of rejecting it", () => {
	assert.equal(resolveDataPath("/abs/x.csv", "n.md"), "abs/x.csv");
});

test("resolveDataPath: '..' above the vault root throws 'outside the vault'", () => {
	assert.throws(() => resolveDataPath("../../x", "n.md"), /prism\.data: "\.\.\/\.\.\/x" points outside the vault/);
	assert.throws(() => resolveDataPath("../x.csv", "n.md"), /outside the vault/);
	assert.throws(() => resolveDataPath("..", "a/n.md"), /outside the vault/);
	assert.throws(() => resolveDataPath("data/../../x.csv", "n.md"), /outside the vault/);
});

test("resolveDataPath: an empty or blank path throws", () => {
	assert.throws(() => resolveDataPath("", "n.md"), /prism\.data: empty path/);
	assert.throws(() => resolveDataPath("   ", "n.md"), /prism\.data: empty path/);
});

test("checkDataAccess without data folders throws DataAccessError naming the needed folder", () => {
	assert.throws(
		() => checkDataAccess("data/x.csv", []),
		(err: unknown) => err instanceof DataAccessError && err.folder === "data" && /prism\.data is off/.test(err.message)
	);
	assert.throws(
		() => checkDataAccess("x.csv", []),
		(err: unknown) => err instanceof DataAccessError && err.folder === "/"
	);
});

test("checkDataAccess with no folders rejects even hidden or wrong-extension paths with DataAccessError", () => {
	assert.throws(() => checkDataAccess(".obsidian/x.json", []), DataAccessError);
	assert.throws(() => checkDataAccess("notes.md", []), DataAccessError);
});

test("checkDataAccess rejects hidden segments even when the whole vault is allowed", () => {
	for (const folders of [["/"], [""]]) {
		assert.throws(() => checkDataAccess(".obsidian/x.json", folders), /prism\.data: hidden paths are not readable \(\.obsidian\/x\.json\)/);
		assert.throws(() => checkDataAccess("data/.secret/x.csv", folders), /hidden paths are not readable/);
		assert.throws(() => checkDataAccess(".hidden.csv", folders), /hidden paths are not readable/);
		assert.throws(
			() => checkDataAccess(".obsidian/x.json", folders),
			(err: unknown) => !(err instanceof DataAccessError)
		);
	}
});

test("checkDataAccess rejects disallowed extensions (notes are not data)", () => {
	assert.throws(
		() => checkDataAccess("notes.md", ["/"]),
		/^Error: prism\.data: \.md files are not readable \(allowed: \.csv, \.tsv, \.json, \.geojson, \.yaml, \.yml, \.txt\)$/
	);
	assert.throws(() => checkDataAccess("README", ["/"]), /prism\.data: \.\? files are not readable/);
});

test("checkDataAccess: extension is checked before the folder (not a DataAccessError)", () => {
	assert.throws(
		() => checkDataAccess("other/notes.md", ["data"]),
		(err: unknown) => err instanceof Error && !(err instanceof DataAccessError)
	);
});

test("checkDataAccess: extensions are case-insensitive", () => {
	assert.doesNotThrow(() => checkDataAccess("DATA.CSV", ["/"]));
	assert.doesNotThrow(() => checkDataAccess("data/x.GeoJSON", ["data"]));
});

test("checkDataAccess allows a file inside an allowed folder, including nested folders", () => {
	assert.doesNotThrow(() => checkDataAccess("data/x.csv", ["data"]));
	assert.doesNotThrow(() => checkDataAccess("data/sub/x.json", ["data"]));
	assert.doesNotThrow(() => checkDataAccess("other/y.txt", ["notes", "other"]));
});

test("checkDataAccess: data2/x.csv is NOT inside the folder data", () => {
	assert.throws(
		() => checkDataAccess("data2/x.csv", ["data"]),
		(err: unknown) =>
			err instanceof DataAccessError &&
			err.folder === "data2" &&
			err.message === "prism.data: data2/x.csv is outside the data folders (data). Add its folder in Settings → Prism → Data folders."
	);
});

test("checkDataAccess: a path outside every allowed folder names its own folder", () => {
	assert.throws(
		() => checkDataAccess("data/x.csv", ["notes"]),
		(err: unknown) => err instanceof DataAccessError && err.folder === "data" && /\(notes\)/.test(err.message)
	);
});

test("checkDataAccess: folders are matched ignoring leading and trailing slashes", () => {
	assert.doesNotThrow(() => checkDataAccess("data/x.csv", ["/data/"]));
	assert.doesNotThrow(() => checkDataAccess("data/x.csv", ["data/"]));
	assert.doesNotThrow(() => checkDataAccess("data/x.csv", ["/data"]));
});

test("checkDataAccess: '/' or '' allows the whole vault", () => {
	assert.doesNotThrow(() => checkDataAccess("deep/er/x.txt", ["/"]));
	assert.doesNotThrow(() => checkDataAccess("x.csv", [""]));
});

test("isInFolder matches the folder itself and its children only", () => {
	assert.equal(isInFolder("data/x.csv", "data"), true);
	assert.equal(isInFolder("data", "data"), true);
	assert.equal(isInFolder("data/sub/x", "data"), true);
	assert.equal(isInFolder("data2/x.csv", "data"), false);
	assert.equal(isInFolder("a/bc", "a/b"), false);
	assert.equal(isInFolder("data/x.csv", "/data/"), true);
});

test("isInFolder: an empty or root folder contains everything", () => {
	assert.equal(isInFolder("anything/at/all", "/"), true);
	assert.equal(isInFolder("anything", ""), true);
});

test("isInFolder does not normalize '..' (callers pass resolved paths)", () => {
	assert.equal(isInFolder("data/../secret.csv", "data"), true);
});

test("extensionOf returns the lowercase text after the last dot", () => {
	assert.equal(extensionOf("a/b.CSV"), "csv");
	assert.equal(extensionOf("x.tar.gz"), "gz");
	assert.equal(extensionOf(".csv"), "csv");
	assert.equal(extensionOf("README"), "");
	assert.equal(extensionOf(""), "");
});

test("extensionOf looks at the whole path, so a dot in a folder name counts", () => {
	assert.equal(extensionOf("a.b/c"), "b/c");
});
