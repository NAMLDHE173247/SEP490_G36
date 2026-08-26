# Feature Test and Verification Prompt

Use this prompt after a build increment or completed phase.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use the relevant testing skills:
- .agents/rules/skills/test-driven-development/SKILL.md
- .agents/rules/skills/browser-testing-with-devtools/SKILL.md for browser work
- .agents/rules/skills/security-and-hardening/SKILL.md for security-sensitive behavior

Feature:
[NAME]

Specification:
.agents/work/[feature-slug]/SPEC.md

Plan:
.agents/work/[feature-slug]/PLAN.md

Changed files or phase:
[PATHS / TASK IDS]

Test the behavior, not only implementation details. First identify the
commands actually available in the affected package.json. Do not claim a test,
build, lint, type-check, or browser check passed unless it was run after the
latest relevant change.

Create a verification matrix covering:

| Requirement | Test/check | Command or action | Expected result | Actual result | Status |
|---|---|---|---|---|---|

For a data-backed screen, verify:
- request URL, method, params/body, status, and response shape;
- field mapping from response to UI;
- loading, success, empty, error, unauthorized, and forbidden states;
- mutation behavior, refresh, duplicate prevention, and retry;
- console errors/warnings and accessibility structure;
- responsive behavior at 320px, 768px, 1024px, and 1440px when relevant.

If a needed test does not exist, add a focused test only when authorized, or
record the missing test as a gap. Do not change production behavior merely to
make a test pass.

Save the report to:
.agents/work/[feature-slug]/TEST-REPORT.md

Finish with:
- TEST STATUS: PASS / PASS WITH GAPS / FAIL
- Commands actually run
- Evidence not available
- Defects requiring a new build increment
```
