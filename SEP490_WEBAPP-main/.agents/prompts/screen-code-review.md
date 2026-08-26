# Screen Code Review Prompt

Use this prompt after implementing a new or changed screen. It is a read-only review: do not modify code unless the user explicitly requests a separate fixing step.

```text
Use the project skill:
.agents/rules/skills/screen-code-review/SKILL.md

You are an independent Senior Software Engineer reviewing this feature:

Feature/screen: [NAME]
User role: [ROLE]
User flow: [WHAT THE USER DOES]
Plan/spec: [PATH OR CONTENT]
Changed files/commit: [PATHS OR COMMIT]
API contract: [PATH OR CONTENT]

Review the actual repository. Before making conclusions, read the relevant
.cursor/rules/ and .agents/rules/ files, then inspect:

- the route and page/component;
- related hooks, state, and types;
- frontend API service such as api.ts or stage4Api.ts;
- the backend route/controller/service/model when data is remote;
- tests and one similar existing screen.

Do not invent endpoints, response fields, permissions, or success conditions.
If evidence is missing, mark it as UNKNOWN or NOT VERIFIED.

First trace this real data flow:

Database/model
  -> backend route/controller/service
  -> HTTP method, URL, request, response
  -> frontend API service
  -> page state/hook
  -> component props
  -> rendered UI

Then review:

1. Correctness and acceptance criteria
2. API contract and field mapping
3. Loading, success, empty, error, retry, unauthorized, and forbidden states
4. Authentication, authorization, validation, XSS, secrets, and sensitive data
5. Component architecture and consistency with existing patterns
6. Accessibility, keyboard navigation, labels, focus, contrast, and responsive layout
7. Performance, duplicate requests, unnecessary renders, and unbounded data
8. Tests, build, lint, type-check, and runtime verification
9. Scope discipline, readability, imports, and maintainability

If browser access is available, verify the real page with:

- console errors and warnings;
- network URL, method, payload, status, and response;
- DOM and accessibility tree;
- before/after screenshot;
- responsive behavior and important UI states.

Do not say that a command or runtime check passed unless it was actually run
after the latest code change.

Return exactly this report:

## 1. Review scope and evidence

## 2. Executive summary

## 3. Data-flow mapping
| Layer | File/function | Input | Output | Evidence | Status |
|---|---|---|---|---|---|

## 4. Findings
| Severity | File:line | Category | Evidence | Risk | Required action |
|---|---|---|---|---|---|

Severity definitions:
- BLOCKER: security issue, data loss, broken core flow, or unsafe to merge
- MAJOR: must fix before acceptance
- MINOR: should fix but does not block the feature
- INFO: optional improvement or observation

## 5. Verification performed
- Commands run and results
- Browser/runtime checks
- Screenshots or network evidence

## 6. Missing tests or evidence

## 7. Final verdict
Choose one: APPROVE / APPROVE WITH FIXES / REQUEST CHANGES

Do not edit files. Do not provide generic praise. Every actionable finding must
include an exact file/line, evidence, risk, and remediation.
```

Suggested usage:

```text
/review
Đọc .agents/prompts/screen-code-review.md và áp dụng cho:
- Feature: [name]
- Plan: [path]
- Changed files: [paths]
Không sửa code; chỉ tạo báo cáo review.
```
