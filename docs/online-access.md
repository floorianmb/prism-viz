# Online access

Prism blocks have no network access by default. Under *Settings → Prism → Online access* the user can allow two things, each after a dialog that lists the consequences. This page describes what each switch allows and how requests are approved.

| Setting (`data.json` → `settings.online`) | Default | Allows |
| --- | --- | --- |
| *API requests* (`http`) | off | `prism.http` and `prism.http.json`: requests sent by Obsidian through `requestUrl` (no CORS, desktop and mobile) |
| *Ask before sending requests* (`httpConfirm`) | on | Requests wait until the reader clicks **Run requests** below the block |
| *Web pages* (`web`) | off | `<iframe src="https://…">` inside blocks and ` ```viz web ` blocks |

The code lives in `src/online/` (host) and `src/runtime/online.ts` (block runtime).

## Approving requests

With *Ask before sending requests* on (`HttpApproval` in `src/online/http.ts`):

- A request is held until the reader approves it. Below the block, a bar names the host it wants to reach: *This block wants to send requests to **api.github.com**.*
- **Run requests** releases the requests to the hosts named in the bar, and further requests to these hosts, for this render of the block.
- **A request to another host shows the bar again**, now as *This block also wants to send requests to …*. Approving one host never approves another. The host includes the port, so `localhost:27124` is a different host from `localhost`.
- Requests to several hosts that arrive together are listed in one bar and released with one click.
- **Every new render of the block** ends the approval: *Reload* in the toolbar, a change of the block's code, reopening the note. Held requests are dropped, never sent later.
- **Command-line renders and PDF export** never show the bar, so their requests are never sent. Agents see the block's waiting state in the snapshot.

Up to 0.5.2, one click approved every request of the current render, including requests to hosts the bar had not shown. A block could show a harmless API in the bar and, after the click, call a service on the local machine or network.

With *Ask before sending requests* off, requests are sent without asking, as soon as a note with such a block is shown.

## Limits per block

- 60 requests per minute, 4 at a time
- 30 s timeout
- 10 MB per response, 1 MB per request body
- `http:` and `https:` URLs only, no credentials in the URL
- Headers the HTTP stack sets itself (`Host`, `Content-Length`, `Connection`, …) are dropped
