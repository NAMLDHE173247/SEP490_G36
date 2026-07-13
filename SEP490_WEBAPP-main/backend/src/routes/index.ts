import express from 'express';
import multer from 'multer';
import { ConversionController } from '../controllers/conversionController';
import { HuggingFaceController } from '../controllers/huggingfaceController';
import { CloudStorageController } from '../controllers/cloudStorageController';
import { EvaluationController } from '../controllers/evaluationController';
import {
  startTraining,
  getActiveTrainingJobs,
  getTrainingStatus,
  streamTrainingStatus,
  stopTraining,
  getSystemResources,
  resumeTraining,
  getDashboardStats,
  downloadCloudDataset,
} from '../controllers/trainController';
import {
  saveTrainingHistory,
  getTrainingHistoryList,
  getTrainingHistoryDetail,
  deleteTrainingHistory,
  getDistinctBaseModels,
} from '../controllers/trainingHistoryController';
import { chatWithAI, inferWithAI, chatWithAIStream, inferWithAIStream, saveChatHistory, getChatHistory, loadModel, getInferenceLogs, validateModel, stopInference, unloadModel } from '../controllers/chatController';
import {
  getSessions,
  getSessionById,
  createSession,
  appendMessageToSession,
  deleteSession,
  updateSessionTitle
} from '../controllers/chatSessionController';
import { clusterData, clusterFilter, deleteClusterCache, clusterVisualize, removeNoise, deduplicate, safeSplit } from '../controllers/clusterController';
import { ModelRegistryController } from '../controllers/modelRegistryController';
import { PromptController } from '../controllers/promptController';
import authRoutes from './authRoutes';
import {
  runEvaluation,
  streamEvalStatus,
  saveEvalResult,
  getEvaluation,
  getEvaluatedModels,
  getEvalHistory,
  pinEvaluation,
  deleteEvaluation,
  compareEvaluations,
  getGpuStatusEndpoint,
  getActiveEvaluation,
  reviewConversation
} from '../controllers/evalModelController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';
import labelRoutes from './labelRoutes';
import dataprepRoutes from './dataprepRoutes';
import { getGpuConfig, updateGpuConfig, getPersonalApiKeys, updatePersonalApiKeys, getGlobalApiKeys, updateGlobalApiKeys, getCliProxyStatus, getCliProxyModels, startCliProxyOAuth, getCliProxyOAuthStatus, listCliProxyAccounts, disconnectCliProxyAccount } from '../controllers/configController';
import { autoLabelGroups } from '../controllers/autoLabelController';
import { decideRoute, evaluateRouter, getRouterMetrics } from '../controllers/routerController';
import { isManager } from '../utils/auth';


const router = express.Router();
const controller = new ConversionController();
const hfController = new HuggingFaceController();
const cloudStorageController = new CloudStorageController();
const evalController = new EvaluationController();
const registryController = new ModelRegistryController();
const promptController = new PromptController();

const requireManager: express.RequestHandler = (req, res, next) => {
  if (!isManager(req)) {
    res.status(403).json({ error: 'Admin or supervisor role required.' });
    return;
  }
  next();
};

const requireAdjudicator: express.RequestHandler = (req, res, next) => {
  if (!['admin', 'supervisor', 'checker'].includes(String((req as any).user?.role || ''))) {
    res.status(403).json({ error: 'Admin, supervisor, or checker role required.' });
    return;
  }
  next();
};

const requireAdmin: express.RequestHandler = (req, res, next) => {
  if (String((req as any).user?.role || '') !== 'admin') {
    res.status(403).json({ error: 'Admin role required.' });
    return;
  }
  next();
};

// Cấu hình multer cho upload
// Cấu hình multer cho upload
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    // Thêm các định dạng phổ biến cho Machine Learning: .json, .jsonl, .csv, .txt, .xlsx, .xls
    const allowedMimeTypes = [
      'application/json',
      'text/csv',
      'text/plain',
      'application/octet-stream',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const allowedExtensions = ['.json', '.jsonl', '.csv', '.txt', '.zip', '.xlsx', '.xls'];

    const isMimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    const isExtensionValid = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));

    if (isMimeTypeValid || isExtensionValid) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON, JSONL, CSV, Excel, TXT, and ZIP files are allowed.'));
    }
  },
});

router.use('/auth', authRoutes);
router.use(optionalAuthMiddleware);
// Conversion Routes
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => controller.uploadFile(req, res));
router.post('/convert', authMiddleware, (req, res) => controller.convertData(req, res));
router.get('/stats/:fileId', authMiddleware, (req, res) => controller.getStats(req, res));
router.get('/preview/:fileId', authMiddleware, (req, res) => controller.previewData(req, res));
router.delete('/file/:fileId', authMiddleware, (req, res) => controller.deleteFile(req, res));

// Chat Route
router.post('/chat', authMiddleware, chatWithAI);
router.post('/infer', authMiddleware, inferWithAI);
router.post('/chat/stream', authMiddleware, chatWithAIStream);
router.post('/infer/stream', authMiddleware, inferWithAIStream);
router.post('/chat/validate-model', authMiddleware, validateModel);
router.get('/infer/logs', authMiddleware, getInferenceLogs);
router.post('/model/load', authMiddleware, requireManager, loadModel);
router.post('/infer/stop/:slotId', authMiddleware, stopInference);
router.post('/router/decide', authMiddleware, decideRoute);
router.post('/router/evaluate', authMiddleware, requireManager, evaluateRouter);
router.get('/router/metrics', authMiddleware, requireManager, getRouterMetrics);
router.post('/model/unload/:slotId', authMiddleware, requireManager, unloadModel);
router.post('/chat/history', authMiddleware, saveChatHistory);
router.get('/chat/history', authMiddleware, getChatHistory);

// Chat Session Routes
router.get('/chat/sessions', authMiddleware, getSessions);
router.get('/chat/sessions/:id', authMiddleware, getSessionById);
router.post('/chat/sessions', authMiddleware, createSession);
router.put('/chat/sessions/:id', authMiddleware, appendMessageToSession);
router.delete('/chat/sessions/:id', authMiddleware, deleteSession);
router.patch('/chat/sessions/:id/title', authMiddleware, updateSessionTitle);


// Hugging Face Routes
router.post('/huggingface/upload', authMiddleware, requireManager, (req, res) => hfController.uploadDataset(req, res));

// Cloud Storage Routes
router.post('/cloud-storage/sync', authMiddleware, requireManager, (req, res) => cloudStorageController.syncDataset(req, res));

// Gemini Evaluation
router.post('/evaluate', authMiddleware, (req, res) => evalController.evaluate(req, res));
router.post('/evaluate/refine', authMiddleware, (req, res) => evalController.refine(req, res));
router.post('/evaluate/rewrite', authMiddleware, (req, res) => evalController.rewrite(req, res));
router.post('/evaluate/save', authMiddleware, (req, res) => evalController.saveEvaluation(req, res));
router.get('/evaluate/history', authMiddleware, (req, res) => evalController.getEvaluationHistory(req, res));
router.patch('/evaluate/history/:id', authMiddleware, (req, res) => evalController.updateEvaluationHistory(req, res));
router.post('/dataset-versions/create', authMiddleware, requireManager, (req, res) => evalController.createDatasetVersion(req, res));
router.get('/dataset-versions/:id', authMiddleware, (req, res) => evalController.getDatasetVersionDetail(req, res));
router.patch('/dataset-versions/:id/visibility', authMiddleware, requireManager, (req, res) => evalController.updateDatasetVersionVisibility(req, res));
router.patch('/dataset-versions/:id/share', authMiddleware, requireManager, (req, res) => evalController.updateDatasetVersionSharing(req, res));
router.get('/dataset-versions/:id/assignments', authMiddleware, (req, res) => evalController.getDatasetVersionAssignments(req, res));
router.get('/dataset-versions/:id/assignments/users/:userId/detail', authMiddleware, (req, res) => evalController.getDatasetVersionUserAssignmentDetail(req, res));
router.get('/dataset-versions/:id/assignments/me/status', authMiddleware, (req, res) => evalController.getMyAssignmentSubmissionStatus(req, res));
router.post('/dataset-versions/:id/assignments/me/submit', authMiddleware, (req, res) => evalController.submitMyAssignment(req, res));
router.post('/dataset-versions/:id/assignments/samples/:sampleId/adjudications/publish', authMiddleware, requireAdjudicator, (req, res) => evalController.publishDatasetVersionAssignmentAdjudication(req, res));
router.post('/dataset-versions/:id/assignments/range', authMiddleware, requireManager, (req, res) => evalController.assignDatasetVersionRange(req, res));
router.post('/dataset-versions/:id/assignments/users/:userId/approve', authMiddleware, requireManager, (req, res) => evalController.approveUserAssignmentSubmission(req, res));
router.delete('/dataset-versions/:id/assignments/range', authMiddleware, requireManager, (req, res) => evalController.clearDatasetVersionAssignmentRange(req, res));
router.delete('/dataset-versions/:id/assignments/users/:userId', authMiddleware, requireManager, (req, res) => evalController.clearDatasetVersionUserAssignments(req, res));
router.delete('/dataset-versions/items/:sampleId', authMiddleware, requireManager, (req, res) => evalController.deleteDatasetVersionSample(req, res));
router.get('/community/public-projects', authMiddleware, (req, res) => evalController.getPublicProjectsHub(req, res));
router.get('/community/public-projects/:id/labeling', authMiddleware, (req, res) => evalController.getPublicProjectLabeling(req, res));

// Clustering Route (proxy to Python K-means on Colab via GPU_SERVICE_URL)
router.post('/cluster/visualize', authMiddleware, requireManager, clusterVisualize);
router.post('/cluster', authMiddleware, requireManager, clusterData);
router.post('/cluster/filter', authMiddleware, requireManager, clusterFilter);
router.post('/cluster/remove-noise', authMiddleware, requireManager, removeNoise);
router.post('/cluster/deduplicate', authMiddleware, requireManager, deduplicate);
router.post('/cluster/safe-split', authMiddleware, requireManager, safeSplit);
router.delete('/cluster/cache', authMiddleware, requireManager, deleteClusterCache);

// Auto Label Route (Label with AI)
router.post('/auto-label', authMiddleware, requireManager, autoLabelGroups);

// Config Routes
router.get('/config/gpu-url', authMiddleware, requireManager, getGpuConfig);
router.post('/config/gpu-url', authMiddleware, requireManager, updateGpuConfig);
router.get('/config/personal-keys', authMiddleware, getPersonalApiKeys);
router.put('/config/personal-keys', authMiddleware, updatePersonalApiKeys);
router.get('/config/global-keys', authMiddleware, requireAdmin, getGlobalApiKeys);
router.put('/config/global-keys', authMiddleware, requireAdmin, updateGlobalApiKeys);
router.get('/config/cli-proxy/status', authMiddleware, getCliProxyStatus);
router.get('/config/cli-proxy/models', authMiddleware, getCliProxyModels);
router.post('/config/cli-proxy/oauth/:provider/start', authMiddleware, startCliProxyOAuth);
router.get('/config/cli-proxy/oauth/status', authMiddleware, getCliProxyOAuthStatus);
router.get('/config/cli-proxy/accounts', authMiddleware, listCliProxyAccounts);
router.delete('/config/cli-proxy/accounts/:accountId', authMiddleware, disconnectCliProxyAccount);

// Training Routes
router.post('/train/start', authMiddleware, requireManager, upload.single('dataset_file'), startTraining);
router.post('/train/download-cloud', authMiddleware, requireManager, downloadCloudDataset);
router.get('/train/active', authMiddleware, getActiveTrainingJobs);
router.get('/train/status/:jobId', authMiddleware, getTrainingStatus);
router.get('/train/stream/:jobId', authMiddleware, streamTrainingStatus);
router.post('/train/stop/:jobId', authMiddleware, requireManager, stopTraining);
router.post('/train/resume/:jobId', authMiddleware, requireManager, resumeTraining);
router.get('/system/resources', authMiddleware, requireManager, getSystemResources);
router.get('/system/dashboard-stats', authMiddleware, getDashboardStats);

// Training History Routes  (⚠️ /models MUST come before /:jobId)
router.get('/train/history/models', authMiddleware, getDistinctBaseModels);
router.post('/train/history', authMiddleware, requireManager, saveTrainingHistory);
router.get('/train/history', authMiddleware, getTrainingHistoryList);
router.get('/train/history/:jobId', authMiddleware, getTrainingHistoryDetail);
router.delete('/train/history/:jobId', authMiddleware, requireManager, deleteTrainingHistory);

// Model Eval Routes
router.use('/model-eval', authMiddleware, requireManager);
router.patch('/model-eval/:evalId/review/:convIndex', authMiddleware, requireManager, reviewConversation);
router.get('/model-eval/gpu-status', getGpuStatusEndpoint);  // ⚠️ trước wildcard
router.get('/model-eval/active', getActiveEvaluation);
router.get('/model-eval/leaderboard', authMiddleware, getEvaluatedModels);
router.post('/model-eval/run/:jobId', authMiddleware, requireManager, upload.single('eval_file'), runEvaluation);
router.get('/model-eval/stream/:evalJobId', authMiddleware, streamEvalStatus);
router.post('/model-eval/save', authMiddleware, requireManager, saveEvalResult);
router.get('/model-eval/history/:jobId', authMiddleware, getEvalHistory);
router.post('/model-eval/pin/:evalId', pinEvaluation);         // ⚠️ phải đứng trước /:evalId
router.get('/model-eval/compare', compareEvaluations);         // ⚠️ trước GET /:evalId
router.delete('/model-eval/:evalId', deleteEvaluation);        // ⚠️ trước GET /:evalId
router.get('/model-eval/:evalId', getEvaluation);              // ⚠️ wildcard — đứng cuối cùng

// Model Registry Routes
router.get('/model-registry', authMiddleware, (req, res) => registryController.listRegistries(req, res));
router.post('/model-registry/sync-training-history', authMiddleware, requireManager, (req, res) => registryController.syncFromTrainingHistory(req, res));
router.post('/model-registry', authMiddleware, requireManager, (req, res) => registryController.createRegistry(req, res));
router.get('/model-registry/:id', authMiddleware, (req, res) => registryController.getRegistry(req, res));
router.put('/model-registry/:id', authMiddleware, requireManager, (req, res) => registryController.updateRegistry(req, res));
router.delete('/model-registry/:id', authMiddleware, requireManager, (req, res) => registryController.deleteRegistry(req, res));

// Model Version Routes
router.get('/model-registry/:registryId/versions', authMiddleware, (req, res) => registryController.listVersions(req, res));
router.post('/model-versions', authMiddleware, requireManager, (req, res) => registryController.registerVersion(req, res));
router.put('/model-versions/:id/status', authMiddleware, requireManager, (req, res) => registryController.updateVersionStatus(req, res));
router.delete('/model-versions/:id', authMiddleware, requireManager, (req, res) => registryController.deleteVersion(req, res));
router.get('/model-versions/evaluations/:jobId', authMiddleware, (req, res) => registryController.getEvaluationsByJob(req, res));
router.get('/model-versions/download-dataset/:id', authMiddleware, (req, res) => registryController.downloadDataset(req, res));
router.get('/model-registry/:registryId/active', authMiddleware, (req, res) => registryController.getActiveVersion(req, res));

// Dataset Prompt Routes
router.get('/dataset-prompts', authMiddleware, (req, res) => promptController.listByProject(req, res));
router.get('/dataset-prompts/project/:projectName', authMiddleware, (req, res) => promptController.listByProject(req, res));
router.get('/dataset-prompts/:id', authMiddleware, (req, res) => promptController.getById(req, res));
router.post('/dataset-prompts', authMiddleware, requireManager, (req, res) => promptController.create(req, res));
router.delete('/dataset-prompts/:id', authMiddleware, requireManager, (req, res) => promptController.delete(req, res));

// Data Labeling Routes
router.use('/labels', labelRoutes);

// Data Preparation routes must stay protected.
router.use('/dataprep', authMiddleware, dataprepRoutes);

export default router;
