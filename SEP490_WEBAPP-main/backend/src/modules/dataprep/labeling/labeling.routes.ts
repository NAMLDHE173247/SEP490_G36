import express from 'express';
import { DataPrepLabelingController } from './labeling.controller';
import { MessageAutoLabelingController } from './messageAutoLabel.controller';
import { AssignmentController } from './assignment.controller';
import { AutoLabelV2Controller } from './autoLabelV2.controller';
import { sseHandler } from './assignment.events';

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
router.get('/assignments/stream', sseHandler);
router.post('/assignments/reset', (req, res) => assignmentController.resetData(req, res));
router.get('/assignments/available-staff', (req, res) => assignmentController.getAvailableStaff(req, res));
router.post('/versions/:versionId/assignments/auto-assign', (req, res) => assignmentController.createAutoAssignment(req, res));
router.post('/versions/:versionId/assignments/batch', (req, res) => assignmentController.createBatchAssignment(req, res));
router.post('/versions/:versionId/assignments/replace', (req, res) => assignmentController.replaceAssignee(req, res));
router.post('/versions/:versionId/assignments/add-staff', (req, res) => assignmentController.addAssignee(req, res));
router.post('/versions/:versionId/assignments/revoke', (req, res) => assignmentController.revokeAssignee(req, res));
router.get('/assignments/my-tasks', (req, res) => assignmentController.getMyTasks(req, res));
router.get('/assignments/all', (req, res) => assignmentController.getAllTasks(req, res));
router.get('/assignments/manager/overview', (req, res) => assignmentController.getManagerOverview(req, res));
router.get('/assignments/manager/task/:taskId', (req, res) => assignmentController.getTaskDetail(req, res));
router.get('/assignments/my-task/:submissionId/samples', (req, res) => assignmentController.getBatchSamples(req, res));
router.post('/assignments/my-task/:submissionId/save-label', (req, res) => assignmentController.saveSampleLabel(req, res));
router.post('/assignments/my-task/:submissionId/samples/submit', (req, res) => assignmentController.submitSamples(req, res));
router.get('/assignments/review-queue', (req, res) => assignmentController.getReviewQueue(req, res));
router.post('/assignments/samples/review', (req, res) => assignmentController.reviewSamples(req, res));
router.post('/assignments/samples/canonical', (req, res) => assignmentController.setCanonical(req, res));
router.post('/assignments/my-task/:submissionId/auto-label-v2', (req, res) => autoLabelV2Controller.preview(req, res));
router.post('/versions/:versionId/assignments/submit', (req, res) => assignmentController.submitTask(req, res));

// Supervisor Monitoring Routes
router.get('/assignments/manager/sample/:sampleId/split-view', (req, res) => assignmentController.getSampleSplitView(req, res));
router.post('/assignments/manager/submission/:submissionId/approve', (req, res) => assignmentController.approveSubmission(req, res));
router.post('/assignments/manager/submission/:submissionId/reject', (req, res) => assignmentController.rejectSubmission(req, res));

export default router;
