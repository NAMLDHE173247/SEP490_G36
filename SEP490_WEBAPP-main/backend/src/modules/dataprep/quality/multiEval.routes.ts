import express from 'express';
import { MultiEvalController } from './multiEval.controller';
import { requireAssignmentReviewer, requireManager } from '../../../middleware/roleMiddleware';

const router = express.Router({ mergeParams: true });
const controller = new MultiEvalController();

router.post('/run', requireManager, (req, res) => controller.runJob(req, res));
router.get('/status/:jobId', requireAssignmentReviewer, (req, res) => controller.getJobStatus(req, res));
router.get('/status-latest', requireAssignmentReviewer, (req, res) => controller.getLatestJob(req, res));
router.get('/results', requireAssignmentReviewer, (req, res) => controller.getResults(req, res));
router.post('/adjudicate/:resultId', requireAssignmentReviewer, (req, res) => controller.adjudicateResult(req, res));

export default router;
