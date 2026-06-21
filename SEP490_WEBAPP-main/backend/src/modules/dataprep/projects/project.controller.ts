import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getAuthUserId } from '../../../utils/auth';
import { ProjectService, ProjectHasTasksError } from './project.service';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';

const projectService = new ProjectService();

export class ProjectController {
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const name = String(req.body?.name || '').trim();
      if (!name) {
        res.status(400).json({ error: 'Tên Project là bắt buộc' });
        return;
      }
      const sourceType = req.body?.sourceType === 'lesson' ? 'lesson' : 'chat';

      const project = await projectService.createProject(ownerId, name, sourceType);
      res.status(201).json({ project });
    } catch (error: any) {
      const isConflict = /đã tồn tại/i.test(error?.message || '');
      console.error('DataPrep createProject error:', error);
      res.status(isConflict ? 409 : 500).json({
        error: error?.message || 'Failed to create dataprep project',
      });
    }
  }

  async listProjectTasks(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { projectId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ error: 'Invalid project id' });
        return;
      }

      const project = await projectService.getProjectById(projectId, ownerId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const tasks = await DatasetAssignmentSubmission.find({ projectId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({ project, tasks });
    } catch (error: any) {
      console.error('DataPrep listProjectTasks error:', error);
      res.status(500).json({ error: 'Failed to list project tasks', details: error.message });
    }
  }

  async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const projects = await projectService.listProjects(ownerId);
      // Kèm số task của từng project (để FE biết project nào xóa được)
      const withCounts = await Promise.all(
        projects.map(async (p: any) => ({
          ...p,
          taskCount: await projectService.countTasks(String(p._id)),
        }))
      );
      res.json({ projects: withCounts });
    } catch (error: any) {
      console.error('DataPrep listProjects error:', error);
      res.status(500).json({ error: 'Failed to list dataprep projects', details: error.message });
    }
  }

  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { projectId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ error: 'Invalid project id' });
        return;
      }

      const result = await projectService.deleteProject(projectId, ownerId);
      if (!result) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({ success: true, ...result });
    } catch (error: any) {
      if (error instanceof ProjectHasTasksError) {
        res.status(409).json({ error: error.message });
        return;
      }
      console.error('DataPrep deleteProject error:', error);
      res.status(500).json({ error: 'Failed to delete project', details: error.message });
    }
  }

  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { projectId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ error: 'Invalid project id' });
        return;
      }

      const project = await projectService.getProjectById(projectId, ownerId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const versions = await projectService.listVersions(projectId, ownerId);

      res.json({
        project,
        versions,
      });
    } catch (error: any) {
      console.error('DataPrep getProject error:', error);
      res.status(500).json({ error: 'Failed to get dataprep project', details: error.message });
    }
  }

  async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { projectId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ error: 'Invalid project id' });
        return;
      }

      const project = await projectService.getProjectById(projectId, ownerId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const versions = await projectService.listVersions(projectId, ownerId);
      res.json({ project, versions });
    } catch (error: any) {
      console.error('DataPrep listVersions error:', error);
      res.status(500).json({ error: 'Failed to list project versions', details: error.message });
    }
  }
}

