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
router.get('/', (req, res) => controller.getQualitySamples(req, res));

export default router;
