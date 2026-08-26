# Incremental Build Prompt

Use this prompt for one approved task at a time.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use the relevant implementation skills:
- .agents/rules/skills/incremental-implementation/SKILL.md
- .agents/rules/skills/frontend-ui-engineering/SKILL.md for UI work
- .agents/rules/skills/api-and-interface-design/SKILL.md for API work
- .agents/rules/skills/security-and-hardening/SKILL.md when a trust boundary changes

Approved plan:
.agents/work/[feature-slug]/PLAN.md

Task to implement: [TASK ID AND TITLE]

Before editing:
1. Read the task, acceptance criteria, dependencies, and verification steps.
2. Read every target file before changing it.
3. Trace the real data flow and verify existing API/type names.
4. State any assumption or conflict before proceeding.

Implementation rules:
- Implement only this task.
- Keep the application compilable.
- Reuse existing components, services, styles, and auth patterns.
- Do not invent API endpoints, response fields, or test results.
- Do not refactor unrelated code or add unrequested features.
- Handle the required loading, empty, error, and permission states.
- Follow the repository's import-order and formatting rules.

After implementation:
1. Run the task's actual verification commands.
2. Run the narrowest relevant tests first, then build/lint/type-check as defined by the package.
3. Report commands and real results; label anything not run as NOT RUN.
4. Update the task status and evidence in:
   .agents/work/[feature-slug]/IMPLEMENTATION.md
5. Summarize changed files, intentionally untouched files, risks, and next task.

Do not start the next task until this one is verified and approved.
```
