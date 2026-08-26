# Feature Specification Prompt

Use this prompt for a new feature or screen. Do not write production code.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use the phase skill:
.agents/rules/skills/spec-driven-development/SKILL.md

We need to define this feature:

Feature name: [NAME]
User/role: [ROLE]
Problem: [PROBLEM]
Desired user flow: [FLOW]
Relevant existing screens or code: [PATHS]

Work in read-only mode. Inspect the relevant repository files, existing
patterns, routes, API services, types, tests, and documentation before making
claims. Read the applicable .cursor/rules/ and .agents/rules/ files.

Do not implement code. Do not invent an endpoint, field, permission, or
framework API. List assumptions and unresolved questions explicitly.

Create a specification with exactly these sections:

# SPEC: [NAME]
## 1. Objective and user value
## 2. User stories and acceptance criteria
## 3. Existing architecture and relevant files
## 4. Data flow and API contract
## 5. UI states and interaction behavior
## 6. Tech and code conventions to follow
## 7. Testing strategy
## 8. Security, accessibility, and performance boundaries
## 9. Always do / Ask first / Never do
## 10. Assumptions and open questions
## 11. Definition of done

Acceptance criteria must be observable and testable. Include the expected
loading, success, empty, error, unauthorized, and forbidden behavior where
relevant.

Save the result to:
.agents/work/[feature-slug]/SPEC.md

Finish with:
- SPEC STATUS: DRAFT
- HUMAN APPROVAL REQUIRED: YES
- Top three decisions the team must confirm
```
