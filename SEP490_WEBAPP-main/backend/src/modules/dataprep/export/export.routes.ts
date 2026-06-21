import express from 'express';
import { exportController } from './export.controller';
import { canonicalizeController } from './canonicalize.controller';

const router = express.Router();

// Existing export
router.get('/:versionId', exportController.downloadDataset);

// Canonicalization & JSONL Export
router.post('/:versionId/canonicalize', (req, res) => canonicalizeController.canonicalizeVersion(req, res));
router.post('/:versionId/snapshot', (req, res) => canonicalizeController.snapshotVersion(req, res));
router.get('/:versionId/jsonl', (req, res) => canonicalizeController.exportJSONL(req, res));
router.get('/:versionId/training-data', (req, res) => canonicalizeController.getTrainingData(req, res));

export default router;
