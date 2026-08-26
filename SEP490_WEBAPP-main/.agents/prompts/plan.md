# Feature Plan Prompt

Use this only after `SPEC.md` has been reviewed or its status is explicitly
accepted as the planning input. Do not write production code.

```text
Use the skill:
.agents/rules/skills/feature-development-workflow/SKILL.md

Use the phase skill:
.agents/rules/skills/planning-and-task-breakdown/SKILL.md

Approved specification:
.agents/work/[feature-slug]/SPEC.md

Work in read-only planning mode. Inspect the relevant source, types, tests,
routes, API services, backend handlers, and existing similar features.

Create a technical implementation plan. The plan must:

1. Identify the current architecture and patterns to reuse.
2. Trace dependencies from database/model to backend API to frontend UI.
3. Divide the feature into small vertical slices, not large horizontal layers.
4. Order tasks by dependency and risk.
5. Define exact files likely to change for every task.
6. Give acceptance criteria and verification commands for every task.
7. Add a checkpoint after every phase.
8. Identify security, accessibility, performance, migration, and rollback risks.
9. Mark what may be parallelized and what must remain sequential.
10. List open questions that require human decisions.

Do not silently choose between conflicting requirements. Do not create tasks
that only say "implement the feature". Keep each task focused and reviewable.

Use exactly this structure:

# PLAN: [NAME]
## 1. Overview
## 2. Architecture decisions and rationale
## 3. Dependency/data-flow map
## 4. Phase 1: Foundation
## Checkpoint: Phase 1
## 5. Phase 2: Core behavior
## Checkpoint: Phase 2
## 6. Phase 3: UI states and polish
## Checkpoint: Phase 3
## 7. Testing and verification matrix
## 8. Risks and mitigations
## 9. Parallelization and sequencing
## 10. Open questions
## 11. Definition of done

Each task must contain:
- Task ID and title
- Scope and files
- Dependencies
- Acceptance criteria
- Verification
- Rollback or failure note

Save the result to:
.agents/work/[feature-slug]/PLAN.md

Finish with:
- PLAN STATUS: DRAFT
- HUMAN APPROVAL REQUIRED: YES
- Any task that must not start before a decision is made
```
