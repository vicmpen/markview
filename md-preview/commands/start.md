---
description: Start the markdown preview server for a directory and open the viewer in the browser
argument-hint: [dir]
---

Start the md-preview server.

1. Target directory: `$ARGUMENTS` if non-empty, otherwise the current working directory. Resolve to an absolute path.
2. Launch the server as a background task:

   node "${CLAUDE_PLUGIN_ROOT}/skills/md-preview/server.mjs" <target-dir>

3. Read the URL from the stdout line `Markdown reader for <dir> running at <url>`. Do not assume port 4173 — the server picks the next free port if it is taken.
4. Open the viewer for the user: `open <url>` (macOS).
5. Report the URL and mention that `/md-preview:stop` stops the server.

If the server fails to start, show the user its stderr output rather than guessing.
