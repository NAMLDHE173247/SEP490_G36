import express from 'express';
import { DataPrepLabelingController } from './labeling.controller';
import { MessageAutoLabelingController } from './messageAutoLabel.controller';
import { AssignmentController } from './assignment.controller';
import { AutoLabelV2Controller } from './autoLabelV2.controller';
import { sseHandler } from './assignment.events';
import {
  requireAdmin,
  requireAssignmentReviewer,
  requireManager,
  requireStaff,
} from '../../../middleware/roleMiddleware';

const router = express.Router();
const controller = new DataPrepLabelingController();
const messageAutoLabelController = new MessageAutoLabelingController();
const autoLabelV2Controller = new AutoLabelV2Controller();

router.get('/samples/:sampleId/labels', (req, res) => controller.getLabelsBySample(req, res));
router.post('/samples/:sampleId/labels', (req, res) => controller.addLabel(req, res));
router.delete('/samples/:sampleId/labels', (req, res) => controller.removeLabel(req, res));
router.post('/message-auto-label/batch', (req, res) => messageAutoLabelController.batch(req, res));
router.post('/samples/:sampleId/message-auto-label/preview', (req, res) => messageAutoLabelController.preview(req, res));
router.post('/samples/:sampleId/message-auto-label/save', (req, res) => messageAutoLabelController.save(req, res));
router.post('/labels/:labelId/votes', (req, res) => controller.voteLabel(req, res));

// Assignment Routes
const assignmentController = new AssignmentController();
router.get('/assignments/stream', requireAssignmentReviewer, sseHandler);
// Compatibility aliases used by the current Checker and Data Prep screens.
router.get('/assignments/events', requireAssignmentReviewer, sseHandler);
router.get('/labeling/assignments/stream', requireAssignmentReviewer, sseHandler);
router.post('/assignments/reset', requireAdmin, (req, res) => assignmentController.resetData(req, res));
router.get('/assignments/available-staff', requireManager, (req, res) => assignmentController.getAvailableStaff(req, res));
router.post('/versions/:versionId/assignments/auto-assign', requireManager, (req, res) => assignmentController.createAutoAssignment(req, res));
router.post('/versions/:versionId/assignments/batch', requireManager, (req, res) => assignmentController.createBatchAssignment(req, res));
router.post('/versions/:versionId/assignments/replace', requireManager, (req, res) => assignmentController.replaceAssignee(req, res));
router.post('/versions/:versionId/assignments/add-staff', requireManager, (req, res) => assignmentController.addAssignee(req, res));
router.post('/versions/:versionId/assignments/revoke', requireManager, (req, res) => assignmentController.revokeAssignee(req, res));
router.get('/assignments/my-tasks', (req, res) => assignmentController.getMyTasks(req, res));
router.get('/assignments/all', requireManager, (req, res) => assignmentController.getAllTasks(req, res));
router.get('/assignments/manager/overview', requireAssignmentReviewer, (req, res) => assignmentController.getManagerOverview(req, res));
router.get('/assignments/staff-stats', requireManager, (req, res) => assignmentController.getStaffStats(req, res));
router.get('/assignments/manager/task/:taskId', requireAssignmentReviewer, (req, res) => assignmentController.getTaskDetail(req, res));
router.get('/assignments/my-task/:submissionId/samples', requireStaff, (req, res) => assignmentController.getBatchSamples(req, res));
router.post('/assignments/my-task/:submissionId/save-label', requireStaff, (req, res) => assignmentController.saveSampleLabel(req, res));
router.post('/assignments/my-task/:submissionId/samples/submit', requireStaff, (req, res) => assignmentController.submitSamples(req, res));
router.get('/assignments/review-queue', requireAssignmentReviewer, (req, res) => assignmentController.getReviewQueue(req, res));
router.post('/assignments/samples/review', requireAssignmentReviewer, (req, res) => assignmentController.reviewSamples(req, res));
router.post('/assignments/samples/canonical', requireManager, (req, res) => assignmentController.setCanonical(req, res));
router.post('/assignments/my-task/:submissionId/auto-label-v2', requireStaff, (req, res) => autoLabelV2Controller.preview(req, res));
router.post('/versions/:versionId/assignments/submit', requireStaff, (req, res) => assignmentController.submitTask(req, res));

// Supervisor Monitoring Routes
router.get('/assignments/manager/sample/:sampleId/split-view', requireAssignmentReviewer, (req, res) => assignmentController.getSampleSplitView(req, res));
router.post('/assignments/manager/submission/:submissionId/approve', requireManager, (req, res) => assignmentController.approveSubmission(req, res));
router.post('/assignments/manager/submission/:submissionId/reject', requireManager, (req, res) => assignmentController.rejectSubmission(req, res));
router.patch('/versions/:versionId/assignments/toggle-ai', requireManager, (req, res) => assignmentController.toggleAiAssist(req, res));
router.patch('/versions/:versionId/assignments/checker', requireManager, (req, res) => assignmentController.updateBatchChecker(req, res));

export default router;
