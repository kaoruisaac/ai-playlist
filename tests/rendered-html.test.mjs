import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const dist = new URL("../dist/", import.meta.url);

test("build emits a deployable Vite SPA", async () => {
  const html = await readFile(new URL("index.html", dist), "utf8");

  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /<script type="module" crossorigin src="\/assets\/.+\.js"><\/script>/);
  assert.match(html, /選曲室｜為此刻排一段歌/);
  assert.match(html, /name="description" content="說出一個心情/);
  assert.match(html, /href="\/favicon\.svg"/);
  assert.match(html, /property="og:image" content="\/og\.png"/);

  await access(new URL("favicon.svg", dist));
  await access(new URL("og.png", dist));
  await assert.rejects(access(new URL("server/", dist)));
  await assert.rejects(access(new URL(".openai/", dist)));
  assert.doesNotMatch(html, /vinext|react-server-dom|worker/i);
});
