# Feature Review Prompt

Use this prompt after the relevant tests pass. This review is read-only.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use these review skills:
- .agents/rules/skills/code-review-and-quality/SKILL.md
- .agents/rules/skills/screen-code-review/SKILL.md for a web screen
- .agents/rules/skills/security-and-hardening/SKILL.md
- .agents/rules/skills/doubt-driven-development/SKILL.md for non-trivial decisions

Feature:
[NAME]

Specification:
.agents/work/[feature-slug]/SPEC.md

Plan:
.agents/work/[feature-slug]/PLAN.md

Test report:
.agents/work/[feature-slug]/TEST-REPORT.md

Changed files or commit:
[PATHS / COMMIT]

Review independently. Read the contract and tests before the implementation.
Trace the real backend/model → API → frontend service → page state →
component/UI data flow. Do not invent missing information and do not modify
files.

Review:
1. Correctness, acceptance criteria, edge cases, and error paths
2. API contract, field mapping, validation, and stale state
3. Architecture, coupling, duplication, and scope discipline
4. Authentication, authorization, input handling, XSS, secrets, and data exposure
5. Accessibility, responsive behavior, loading/empty/error states
6. Performance, duplicate requests, unbounded lists, and unnecessary renders
7. Test quality, build/lint/type-check evidence, and runtime evidence
8. Maintainability, imports, naming, and rollback safety

Every actionable finding must include severity, exact file/line, evidence,
risk, and required action. Use BLOCKER, MAJOR, MINOR, or INFO. Do not provide
generic praise and do not approve simply because the happy path renders.

Save the report to:
.agents/work/[feature-slug]/REVIEW.md

Finish with:
- REVIEW STATUS: APPROVE / APPROVE WITH FIXES / REQUEST CHANGES
- Unresolved Blocker/Major findings
- Evidence that was not available
- Whether human approval is required before the next phase
```
