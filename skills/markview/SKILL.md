---
name: markview
description: Use when the user wants to preview, browse, or read a directory's markdown or HTML files rendered in the browser — e.g. "preview the markdown files here", "start the markdown reader", "show me these md files rendered". Starts a local web server with a styled viewer.
---

# Markdown Preview Server

Serve a browsable, rendered view of all markdown files in a directory.

## Starting the server

1. Determine the target directory: the argument if one was given, otherwise the current working directory.
2. Launch the server as a background task:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/markview/server.mjs <target-dir>
   ```

3. Read the URL from the stdout line `Markdown reader for <dir> running at <url>`. Do not assume port 4173 — the server picks the next free port if it is taken.
4. Open the viewer for the user: `open <url>` (macOS).
5. Tell the user the URL and that you can stop the server whenever they ask (kill the background task).

## Notes

- Requires Node.js ≥ 18; uses only built-ins, no npm install.
- Scans the target directory recursively for `.md` and `.html` files, skipping `node_modules` and dot-directories.
- To preview a different directory, start another instance with that directory as the argument — each instance picks its own port.
- Slash commands are available for explicit control: `/markview:start [dir]` and `/markview:stop` (stops all instances).
- If the server fails to start, show the user its stderr output rather than guessing.
