# Code Simplification Prompt

Use this prompt after behavior and review findings are under control.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use:
.agents/rules/skills/code-simplification/SKILL.md

Feature:
[NAME]

Plan and review:
- .agents/work/[feature-slug]/PLAN.md
- .agents/work/[feature-slug]/REVIEW.md

Changed files:
[PATHS]

Review the implementation for unnecessary complexity without changing its
observable behavior. Prefer the smallest clear implementation that follows
existing repository patterns.

Check for:
- premature abstractions;
- duplicated or dead code;
- unnecessary state and effects;
- deeply nested control flow;
- overly broad utilities;
- unrelated refactors;
- comments that describe obvious code instead of intent.

Do not add hypothetical future features. Do not change the API contract,
security behavior, or user-visible behavior without explicit approval.

If a safe simplification is justified, make only that focused change, run the
relevant tests/build/lint/type-check, and report the before/after rationale.
If no change is justified, say so with evidence.

Save the result to:
.agents/work/[feature-slug]/SIMPLIFICATION.md
```
