import express from 'express';
import { DataPrepLabelingController } from './labeling.controller';
import { MessageAutoLabelingController } from './messageAutoLabel.controller';
import { AssignmentController } from './assignment.controller';

const router = express.Router();
const controller = new DataPrepLabelingController();
const messageAutoLabelController = new MessageAutoLabelingController();

router.get('/samples/:sampleId/labels', (req, res) => controller.getLabelsBySample(req, res));
router.post('/samples/:sampleId/labels', (req, res) => controller.addLabel(req, res));
router.delete('/samples/:sampleId/labels', (req, res) => controller.removeLabel(req, res));
router.post('/message-auto-label/batch', (req, res) => messageAutoLabelController.batch(req, res));
router.post('/samples/:sampleId/message-auto-label/preview', (req, res) => messageAutoLabelController.preview(req, res));
router.post('/samples/:sampleId/message-auto-label/save', (req, res) => messageAutoLabelController.save(req, res));
router.post('/labels/:labelId/votes', (req, res) => controller.voteLabel(req, res));

// Assignment Routes
const assignmentController = new AssignmentController();
router.post('/assignments/reset', (req, res) => assignmentController.resetData(req, res));
router.post('/versions/:versionId/assignments/batch', (req, res) => assignmentController.createBatchAssignment(req, res));
router.get('/assignments/my-tasks', (req, res) => assignmentController.getMyTasks(req, res));
router.get('/assignments/all', (req, res) => assignmentController.getAllTasks(req, res));
router.get('/assignments/manager/overview', (req, res) => assignmentController.getManagerOverview(req, res));
router.get('/assignments/manager/task/:taskId', (req, res) => assignmentController.getTaskDetail(req, res));
router.get('/assignments/my-task/:submissionId/samples', (req, res) => assignmentController.getBatchSamples(req, res));
router.post('/assignments/my-task/:submissionId/save-label', (req, res) => assignmentController.saveSampleLabel(req, res));
router.post('/versions/:versionId/assignments/submit', (req, res) => assignmentController.submitTask(req, res));

export default router;
