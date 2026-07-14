---
description: Stop all running md-preview servers
---

Stop every running md-preview server.

1. Run: `pkill -f "md-preview/skills/md-preview/server.mjs"`
   - Exit code 0: one or more servers were stopped.
   - Exit code 1: no md-preview server was running — tell the user that; it is not an error.
2. Verify: `pgrep -f "md-preview/skills/md-preview/server.mjs"` must print nothing.
3. Report what was stopped (or that nothing was running).
