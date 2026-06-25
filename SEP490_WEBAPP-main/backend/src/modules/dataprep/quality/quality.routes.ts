import express from 'express';
import { QualityController } from './quality.controller';

const router = express.Router({ mergeParams: true });
const controller = new QualityController();

router.get('/labeling-status', (req, res) => controller.getLabelingStatus(req, res));
router.patch('/incomplete-bucket', (req, res) => controller.updateIncompleteBucket(req, res));
router.post('/classify', (req, res) => controller.classify(req, res));
router.post('/review', (req, res) => controller.submitReview(req, res));
router.get('/reviews/:sampleId', (req, res) => controller.getSampleReviews(req, res));
router.post('/adjudicate', (req, res) => controller.adjudicate(req, res));
router.get('/statistics', (req, res) => controller.getStatistics(req, res));
router.get('/rewrite-assignments', (req, res) => controller.listRewriteAssignments(req, res));
router.post('/rewrite-assignments', (req, res) => controller.assignRewrite(req, res));
router.post('/rewrite-assignments/bulk', (req, res) => controller.bulkAssignRewrite(req, res));
router.post('/rewrite-assignments/auto-bypass', (req, res) => controller.autoBypassRewrite(req, res));
router.post('/rewrite-assignments/admin-submit', (req, res) => controller.adminSubmitRewrite(req, res));
router.post('/rewrite-assignments/:taskId/submit', (req, res) => controller.submitRewrite(req, res));
router.post('/rewrite-assignments/:taskId/validate', (req, res) => controller.validateRewrite(req, res));
router.post('/rewrite-assignments/:taskId/suggest', (req, res) => controller.suggestRewrite(req, res));
router.post('/rewrite-assignments/:taskId/review', (req, res) => controller.reviewRewrite(req, res));
router.post('/rewrite-assignments/:taskId/remind', (req, res) => controller.remindRewrite(req, res));
router.get('/notifications', (req, res) => controller.listNotifications(req, res));
router.post('/notifications', (req, res) => controller.createNotification(req, res));
router.post('/notifications/read', (req, res) => controller.markNotificationsRead(req, res));
router.get('/', (req, res) => controller.getQualitySamples(req, res));

export default router;
