<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vercel

- **Correct prod link:** projectId `prj_gFU1GTY9xEaDqivVoQ9MUYE2gmtX`, orgId `team_SCRMCGjICtwdftsPVA9hfHcN` (`dallentaylorproductions-5050s-projects`).
- `.vercel/project.json` is gitignored and per-machine. If MCP/CLI calls return 403, it's pointing at the stale `aaron-thomas-home-team` — re-link to the IDs above.
- Deploys ship via **git push only**. Never use the Vercel CLI.
