# Feature Ship Readiness Prompt

Use this prompt for the final readiness check. It does not push, deploy, or
modify production systems unless explicitly authorized.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use:
.agents/rules/skills/git-workflow-and-versioning/SKILL.md

Feature workspace:
.agents/work/[feature-slug]/

Read:
- SPEC.md
- PLAN.md
- IMPLEMENTATION.md
- TEST-REPORT.md
- REVIEW.md
- SIMPLIFICATION.md if present

Perform a final release-readiness audit. Check:

- every acceptance criterion is satisfied;
- every plan task has a status and verification evidence;
- tests/build/lint/type-check results are actual and current;
- runtime/API/browser evidence is recorded where relevant;
- Blocker and Major findings are resolved or explicitly accepted by a human;
- no secrets, tokens, credentials, or production data are staged;
- the diff contains only intended feature scope;
- commits are atomic and explain why the change was made;
- documentation or architecture decisions are updated if behavior changed;
- rollback or feature-flag strategy exists for risky incomplete behavior.

Run only commands that are appropriate for the affected package and report
their exact results. Do not push, deploy, delete data, or change external
systems.

Save the final checklist to:
.agents/work/[feature-slug]/SHIP.md

Finish with:
- SHIP STATUS: READY / READY WITH ACCEPTED RISKS / NOT READY
- Exact remaining risks
- Human decision required
- Suggested commit or pull-request summary
```
