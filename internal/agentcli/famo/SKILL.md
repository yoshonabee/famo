---
name: famo
description: Use Famo's local task list to read today's work, investigate tasks in the configured workspace, and record evidence, links, and next decisions in Famo. Use when the user asks to work from Famo or update a Famo task.
---

# Famo

Use `famo-agent` or `~/.local/bin/famo-agent` if the command is outside PATH. For the Famo command-line web server, pass `--url http://127.0.0.1:8787` before the command when the user has selected that server.

- Run `famo-agent today` for unfinished tasks scheduled on the local day. Before working on an individual task, run `famo-agent context ID` for task notes, links, version, and the applicable `workspace.dir` and `workspace.prompt`. An assigned task uses its Project’s workspace. An unassigned task uses the default workspace, which is also returned by `today`.
- Use the title as a search lead. In the returned workspace, read any workspace prompt and project guidance, then locate matching documents, code, tests, or issue references. If the directory is missing or unreadable, ask for its location. If two interpretations remain plausible after searching, ask the user one specific question and include the evidence you found.
- For an authorized daily pass, start with one or two tasks that can yield a concrete result. For ambiguous work, investigate, reproduce, or compare approaches. For implementation the user authorized, use the project's conventions, isolate proposed changes, and verify them with appropriate tests.
- Report the result, verification, evidence or artifact links, and the decision or next action the user needs. To write back, read current context first. Use `famo-agent update ID --version N --description TEXT --link URL`. The description replaces the notes, so carry forward the user's existing text unless they request a replacement. Repeat `--link` for multiple links. On exit code 3, reread task context and reconcile the write with the latest notes.
- Use `famo-agent add --title TEXT --date YYYY-MM-DD` when asked to schedule a new task. Omit the date for an undated task. Use `famo-agent complete ID --version N` when the user has approved completion.
