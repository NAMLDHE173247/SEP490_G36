import express from 'express';
import { MultiEvalController } from './multiEval.controller';

const router = express.Router({ mergeParams: true });
const controller = new MultiEvalController();

router.post('/run', (req, res) => controller.runJob(req, res));
router.get('/status/:jobId', (req, res) => controller.getJobStatus(req, res));
router.get('/status-latest', (req, res) => controller.getLatestJob(req, res));
router.get('/results', (req, res) => controller.getResults(req, res));
router.post('/adjudicate/:resultId', (req, res) => controller.adjudicateResult(req, res));

export default router;
