import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { QualityService } from './quality.service';

const qualityService = new QualityService();

export class QualityController {
  async getLabelingStatus(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.getLabelingStatus(versionId, ownerId);
      res.json(result);
    } catch (error: any) {
      console.error('Get labeling status error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get labeling status',
      });
    }
  }

  async updateIncompleteBucket(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const rawBucket = req.body?.bucket;
      const bucket = rawBucket === null || rawBucket === undefined || rawBucket === ''
        ? null
        : String(rawBucket);

      if (bucket !== null && !['Gold', 'Rewrite', 'Reject', 'Incomplete'].includes(bucket)) {
        res.status(400).json({ error: "bucket must be one of 'Gold', 'Rewrite', 'Reject', 'Incomplete' or null" });
        return;
      }

      const result = await qualityService.updateIncompleteBucket(versionId, ownerId, bucket as any);
      res.json({
        message: bucket
          ? `Incomplete samples will be placed in ${bucket}.`
          : 'Incomplete sample bucket override cleared.',
        ...result,
      });
    } catch (error: any) {
      console.error('Update incomplete bucket error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to update incomplete bucket',
      });
    }
  }

  async classify(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.classify(versionId, ownerId, undefined, { tagRejects: true });
      res.json(result);
    } catch (error: any) {
      console.error('Quality classification error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Quality classification failed',
      });
    }
  }

  async getQualitySamples(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const group = req.query.group ? String(req.query.group) : undefined;
      const result = await qualityService.classify(versionId, ownerId, group);
      res.json(result);
    } catch (error: any) {
      console.error('Get quality samples error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get quality samples',
      });
    }
  }

  async submitReview(req: Request, res: Response): Promise<void> {
    try {
      const reviewerId = getAuthUserId(req);
      if (!reviewerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { sampleId, qualityClassification, ratings, errors, note } = req.body;

      if (!sampleId || !qualityClassification || !ratings) {
        res.status(400).json({ error: 'Missing required review fields.' });
        return;
      }

      const result = await qualityService.submitReview(versionId, reviewerId, sampleId, {
        qualityClassification,
        ratings,
        errors,
        note,
      });

      res.json({ message: 'Review submitted successfully', review: result });
    } catch (error: any) {
      console.error('Submit review error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to submit review',
      });
    }
  }

  async getSampleReviews(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId, sampleId } = req.params;
      const result = await qualityService.getSampleReviews(versionId, sampleId);
      res.json(result);
    } catch (error: any) {
      console.error('Get sample reviews error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get sample reviews',
      });
    }
  }

  async adjudicate(req: Request, res: Response): Promise<void> {
    try {
      const supervisorId = getAuthUserId(req);
      if (!supervisorId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { sampleId, finalClassification, note } = req.body;

      if (!sampleId || !finalClassification) {
        res.status(400).json({ error: 'Missing required adjudication fields.' });
        return;
      }

      const result = await qualityService.adjudicate(versionId, supervisorId, sampleId, finalClassification, note);
      res.json({ message: 'Adjudication submitted successfully', adjudication: result });
    } catch (error: any) {
      console.error('Adjudicate quality error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Adjudication failed',
      });
    }
  }

  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const result = await qualityService.getStatistics(versionId);
      res.json(result);
    } catch (error: any) {
      console.error('Get quality statistics error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get statistics',
      });
    }
  }
}
