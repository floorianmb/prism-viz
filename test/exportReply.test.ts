import { test } from "node:test";
import assert from "node:assert/strict";
import { isExportReply } from "../src/util";

// Replies a block's runtime really sends (taken from Chrome): PNG from
// html-to-image (canvas.toDataURL), SVG from serializeSvg or html-to-image's
// toSvg (decoded), WebM from FileReader.readAsDataURL of the recording.

test("isExportReply accepts what the runtime exports", () => {
	assert.ok(isExportReply("png", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVU"));
	assert.ok(isExportReply("svg", `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="40" height="20" xmlns="http://www.w3.org/2000/svg"><rect/></svg>`));
	assert.ok(isExportReply("svg", `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><foreignObject/></svg>`));
	assert.ok(isExportReply("svg", `<svg xmlns="http://www.w3.org/2000/svg"/>`));
	assert.ok(isExportReply("webm", "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH"));
});

test("isExportReply rejects empty exports", () => {
	assert.ok(!isExportReply("png", "data:,"));
	assert.ok(!isExportReply("png", ""));
	assert.ok(!isExportReply("png", "data:image/png;base64,"));
	assert.ok(!isExportReply("webm", "data:video/webm;base64,"));
	assert.ok(!isExportReply("svg", ""));
});

test("isExportReply rejects URLs and other formats", () => {
	assert.ok(!isExportReply("png", "https://evil.example/?data=secret"));
	assert.ok(!isExportReply("png", " data:image/png;base64,AAAA"));
	assert.ok(!isExportReply("png", "data:image/svg+xml;base64,PHN2Zz4="));
	assert.ok(!isExportReply("png", "data:text/html;base64,PHNjcmlwdD4="));
	assert.ok(!isExportReply("svg", "https://evil.example/x.svg"));
	assert.ok(!isExportReply("svg", "data:image/png;base64,iVBORw0KGgo"));
	assert.ok(!isExportReply("svg", "<svgx>"));
	assert.ok(!isExportReply("webm", "data:image/png;base64,iVBORw0KGgo"));
	assert.ok(!isExportReply("webm", "blob:null/1234"));
});
