---
description: Stop all running markview servers
---

Stop every running markview server.

1. Run: `pkill -f "markview/skills/markview/server.mjs"`
   - Exit code 0: one or more servers were stopped.
   - Exit code 1: no markview server was running — tell the user that; it is not an error.
2. Verify: `pgrep -f "markview/skills/markview/server.mjs"` must print nothing.
3. Report what was stopped (or that nothing was running).
