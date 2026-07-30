import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APP_ROLES,
  requireAdmin,
  requireAssignmentReviewer,
  requireCheckerOrAdmin,
  requireManager,
  requireStaff,
} from '../middleware/roleMiddleware';
import { canCheckerReviewRewrite, canStaffSubmitRewrite } from '../modules/dataprep/quality/rewriteWorkflowPolicy';

function middlewareAllows(middleware: any, role: string): boolean {
  let passed = false;
  let statusCode = 200;
  const req = { user: { role } };
  const res = {
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
  };
  middleware(req, res, () => { passed = true; });
  assert.equal(passed || statusCode === 403, true);
  return passed;
}

assert.deepEqual(APP_ROLES, ['admin', 'supervisor', 'checker', 'staff']);

const userModel = readFileSync(resolve(process.cwd(), 'src/models/User.ts'), 'utf8');
assert.match(userModel, /enum: \['admin', 'supervisor', 'staff', 'checker'\]/);
assert.doesNotMatch(userModel, /['"]reviewer['"]/);

const authController = readFileSync(resolve(process.cwd(), 'src/controllers/authController.ts'), 'utf8');
assert.doesNotMatch(authController, /\[[^\]]*['"]reviewer['"][^\]]*\]\.includes\(role\)/);

for (const role of APP_ROLES) {
  assert.equal(middlewareAllows(requireAdmin, role), role === 'admin');
  assert.equal(middlewareAllows(requireManager, role), role === 'admin' || role === 'supervisor');
  assert.equal(middlewareAllows(requireAssignmentReviewer, role), role !== 'staff');
  assert.equal(middlewareAllows(requireCheckerOrAdmin, role), role === 'admin' || role === 'checker');
  assert.equal(middlewareAllows(requireStaff, role), role === 'staff');
}

assert.equal(canStaffSubmitRewrite('assigned'), true);
assert.equal(canStaffSubmitRewrite('redo'), true);
assert.equal(canStaffSubmitRewrite('rejected'), true);
assert.equal(canStaffSubmitRewrite('submitted'), false);
assert.equal(canStaffSubmitRewrite('checker_approved'), false);
assert.equal(canStaffSubmitRewrite('approved'), false);

assert.equal(canCheckerReviewRewrite('submitted'), true);
assert.equal(canCheckerReviewRewrite('checker_approved'), true); // legacy compatibility
assert.equal(canCheckerReviewRewrite('assigned'), false);
assert.equal(canCheckerReviewRewrite('redo'), false);
assert.equal(canCheckerReviewRewrite('approved'), false);

const labelingRoutes = readFileSync(resolve(process.cwd(), 'src/modules/dataprep/labeling/labeling.routes.ts'), 'utf8');
assert.match(labelingRoutes, /assignments\/reset', requireAdmin/);
assert.match(labelingRoutes, /assignments\/events', requireAssignmentReviewer/);
assert.match(labelingRoutes, /assignments\/auto-assign', requireManager/);
assert.match(labelingRoutes, /save-label', requireStaff/);
assert.match(labelingRoutes, /samples\/review', requireAssignmentReviewer/);

const qualityRoutes = readFileSync(resolve(process.cwd(), 'src/modules/dataprep/quality/quality.routes.ts'), 'utf8');
assert.match(qualityRoutes, /admin-submit', requireAdmin/);
assert.match(qualityRoutes, /:taskId\/submit', requireStaff/);
assert.match(qualityRoutes, /:taskId\/review', requireCheckerOrAdmin/);

const multiEvalRoutes = readFileSync(resolve(process.cwd(), 'src/modules/dataprep/quality/multiEval.routes.ts'), 'utf8');
assert.match(multiEvalRoutes, /\/run', requireManager/);

console.log('RBAC and rewrite workflow policy checks passed.');
