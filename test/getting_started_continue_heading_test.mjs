import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const [file, heading, eyebrow] of [
  ["docs/getting-started.html", "Lanjutkan proyek pertama.", "05 · LANJUTKAN PROYEK"],
  ["en/docs/getting-started.html", "Continue your first project.", "05 · CONTINUE THE PROJECT"],
]) {
  test(file + " labels its creative continuation section accurately", () => {
    const html = fs.readFileSync(file, "utf8");
    const start = html.indexOf(`aria-labelledby="data-title"`);
    const section = html.slice(start, html.indexOf("</section>", start));
    assert.ok(section.includes(heading), "heading must describe continuation, not local storage");
    assert.ok(section.includes(eyebrow));
    assert.equal(section.split(`class="docs-card"`).length - 1, 3);
  });
}
