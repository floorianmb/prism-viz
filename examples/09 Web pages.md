---
type: showcase
tags: [prism, example, online]
status: done
date: 2026-10-08
---
# Web pages

Prism can show websites inside a note in two different ways: as a dedicated **web block** (```` ```viz web ````) that behaves like a small browser, or as an **`<iframe>` inside your own HTML block**, next to content that Prism draws. This note shows all three variants side by side.

> [!warning] One setting is needed
> Open **Settings → Prism → Online access** and switch on **Web pages**. It is off by default. Until then every block below explains that itself instead of showing a page. Command-line renders show a placeholder card, because no page is loaded there.

## Web block, webview mode

On desktop, `mode: webview` uses Obsidian's full browser view. It has its own process, back, forward and reload buttons, and it works for sites that refuse to be framed. This is the right choice for a whole website or web app.

```viz web height=420
url: https://obsidian.md
mode: webview
```

## Web block, iframe mode

`mode: iframe` embeds the page as a normal frame. It is what mobile always uses (`mode: auto`, the default, picks webview on desktop and iframe on mobile). Sites that send `X-Frame-Options` or a restrictive `frame-ancestors` policy refuse to appear in a frame and show an empty or blocked area, so pick pages that allow it, such as Wikipedia. Here with `theme: dark`: the page is shown in light mode by default, because Obsidian's dark mode is not passed on.

```viz web height=360
url: https://en.wikipedia.org/wiki/Prism
mode: iframe
theme: dark
```

## An iframe inside your own block

With the same setting you can place an `<iframe src="https://…">` directly in an HTML block and combine it with Prism content, here a caption card. The block checks `prism.online.web` first and shows a hint instead of the frame when the setting is off (a frame in the static HTML would be blocked and reported as an error). The frame inherits the block sandbox (no cookies or storage), and shows light mode unless you set `style="color-scheme:dark"` on it, as done here.

```viz id=framed title="Page with caption"
<div class="card" style="margin-bottom:var(--size-4-3)">
  <div class="label">Example Domain</div>
  <p class="muted" style="margin:4px 0 0">A page reserved for documentation, shown inside this block. Put your own controls, KPIs or charts above or below it.</p>
</div>
<div id="slot"></div>
<p class="caption">Source: example.com</p>
<script>
const slot = document.getElementById("slot");
if (prism.online.web) {
  slot.innerHTML = '<iframe src="https://example.com" style="width:100%;height:220px;border:1px solid var(--background-modifier-border);border-radius:var(--radius-m);color-scheme:dark" loading="lazy"></iframe>';
} else {
  slot.innerHTML = '<div class="card muted" style="height:220px;display:flex;align-items:center;justify-content:center;text-align:center">Web pages are off.<br>Enable Settings → Prism → Online access → Web pages.</div>';
}
</script>
```

## Which one to use

| | Web block, webview | Web block, iframe | iframe in a block |
|---|---|---|---|
| Syntax | ```` ```viz web ```` with `mode: webview` | ```` ```viz web ```` with `mode: iframe` | `<iframe>` in a ```` ```viz ```` block |
| Platform | Desktop only | Desktop and mobile | Desktop and mobile |
| Sites that refuse framing | Work | Do not work | Do not work |
| Back, forward, reload | Yes | Yes | No |
| Dark mode | `theme: dark` | `theme: dark` | `color-scheme:dark` on the iframe |
| Next to Prism content | No, its own block | No, its own block | Yes, same block |
| Best for | Whole sites and web apps | Embeddable pages, mobile | Maps, videos, widgets with your own controls |
