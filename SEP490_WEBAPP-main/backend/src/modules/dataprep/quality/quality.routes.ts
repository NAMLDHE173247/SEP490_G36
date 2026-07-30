import express from 'express';
import { QualityController } from './quality.controller';
import {
  requireAdmin,
  requireAssignmentReviewer,
  requireCheckerOrAdmin,
  requireManager,
  requireStaff,
} from '../../../middleware/roleMiddleware';

const router = express.Router({ mergeParams: true });
const controller = new QualityController();

router.get('/labeling-status', requireAssignmentReviewer, (req, res) => controller.getLabelingStatus(req, res));
router.patch('/incomplete-bucket', requireManager, (req, res) => controller.updateIncompleteBucket(req, res));
router.post('/classify', requireManager, (req, res) => controller.classify(req, res));
router.post('/review', requireAssignmentReviewer, (req, res) => controller.submitReview(req, res));
router.get('/reviews/:sampleId', requireAssignmentReviewer, (req, res) => controller.getSampleReviews(req, res));
router.post('/adjudicate', requireManager, (req, res) => controller.adjudicate(req, res));
router.get('/statistics', requireAssignmentReviewer, (req, res) => controller.getStatistics(req, res));
router.get('/rewrite-assignments', (req, res) => controller.listRewriteAssignments(req, res));
router.post('/rewrite-assignments', requireAssignmentReviewer, (req, res) => controller.assignRewrite(req, res));
router.post('/rewrite-assignments/bulk', requireManager, (req, res) => controller.bulkAssignRewrite(req, res));
router.post('/rewrite-assignments/auto-bypass', requireManager, (req, res) => controller.autoBypassRewrite(req, res));
router.post('/rewrite-assignments/admin-submit', requireAdmin, (req, res) => controller.adminSubmitRewrite(req, res));
router.post('/rewrite-assignments/:taskId/submit', requireStaff, (req, res) => controller.submitRewrite(req, res));
router.post('/rewrite-assignments/:taskId/validate', requireStaff, (req, res) => controller.validateRewrite(req, res));
router.post('/rewrite-assignments/:taskId/suggest', requireStaff, (req, res) => controller.suggestRewrite(req, res));
router.post('/suggest-rewrite-generic', requireManager, (req, res) => controller.suggestRewriteGeneric(req, res));
router.post('/rewrite-assignments/:taskId/review', requireCheckerOrAdmin, (req, res) => controller.reviewRewrite(req, res));
router.post('/rewrite-assignments/:taskId/remind', requireManager, (req, res) => controller.remindRewrite(req, res));
router.get('/notifications', (req, res) => controller.listNotifications(req, res));
router.post('/notifications', requireManager, (req, res) => controller.createNotification(req, res));
router.post('/notifications/read', (req, res) => controller.markNotificationsRead(req, res));
router.get('/', requireAssignmentReviewer, (req, res) => controller.getQualitySamples(req, res));

export default router;
