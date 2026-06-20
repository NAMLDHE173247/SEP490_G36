import express from 'express';
import { ProjectController } from './project.controller';

const router = express.Router();
const controller = new ProjectController();

router.post('/', (req, res) => controller.createProject(req, res));
router.get('/', (req, res) => controller.listProjects(req, res));
router.get('/:projectId', (req, res) => controller.getProject(req, res));
router.get('/:projectId/versions', (req, res) => controller.listVersions(req, res));
router.get('/:projectId/tasks', (req, res) => controller.listProjectTasks(req, res));
router.delete('/:projectId', (req, res) => controller.deleteProject(req, res));

export default router;

