import express from 'express';
import projectRoutes from '../modules/dataprep/projects/project.routes';
import versionRoutes from '../modules/dataprep/versions/version.routes';
import labelingRoutes from '../modules/dataprep/labeling/labeling.routes';
import { preprocessingRouter, versionPreprocessingRouter } from '../modules/dataprep/preprocessing/preprocessing.routes';
import exportRoutes from '../modules/dataprep/export/export.routes';
import autoLabelRoutes from '../modules/dataprep/auto-label/autoLabel.routes';
import classificationRoutes from '../modules/dataprep/classification/classification.routes';
import qualityRoutes from '../modules/dataprep/quality/quality.routes';
import multiEvalRoutes from '../modules/dataprep/quality/multiEval.routes';
import { QualityController } from '../modules/dataprep/quality/quality.controller';

const router = express.Router();
const qualityController = new QualityController();

router.use('/projects', projectRoutes);
router.use('/versions', versionRoutes);
router.get('/stage4/rewrite-assignments', (req, res) => qualityController.listMyRewriteAssignments(req, res));
router.get('/stage4/notifications', (req, res) => qualityController.listMyNotifications(req, res));
router.use('/versions/:versionId/auto-label', autoLabelRoutes);
router.use('/versions/:versionId/classification', classificationRoutes);
router.use('/versions/:versionId/quality', qualityRoutes);
router.use('/versions/:versionId/multi-eval', multiEvalRoutes);
router.use('/versions/:versionId/preprocessing', versionPreprocessingRouter);
router.use('/preprocessing', preprocessingRouter);
router.use('/export', exportRoutes);
router.use('/', labelingRoutes);

export default router;
