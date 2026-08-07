import './dotenv';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import mongoose from 'mongoose';
import compression from 'compression';
import express, { Express } from 'express';

console.log('=== APP STARTING ===');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGO_URI exists:', !!process.env.MONGO_URI);
// Force reload

const app: Express = express();
// Render/most PaaS run the app behind a reverse proxy. Trust the first proxy so
// client IPs (used by rate limiting) are read from X-Forwarded-For correctly.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sep_training';



// Connect to MongoDB
import { User } from './models/User';
import bcrypt from 'bcryptjs';
import { seedDefaultStage4Data } from './seedStage4';
import { startAssignmentDeadlineReminderService } from './services/assignmentDeadlineReminderService';

async function seedDefaultUsers() {
  // Demo accounts use the well-known password "1" and must never exist in
  // production. Allow an explicit override only for controlled staging setups.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.log('⏭️  Skipping demo user seeding in production.');
    return;
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('1', salt);

    const demoUsers = [
      { name: 'System Admin', email: 'admin', passwordHash, role: 'admin' as const, status: 'active' as const },
      { name: 'System Supervisor', email: 'supervisor', passwordHash, role: 'supervisor' as const, status: 'active' as const },
      { name: 'System Checker', email: 'checker', passwordHash, role: 'checker' as const, status: 'active' as const },
      { name: 'System Staff', email: 'staff', passwordHash, role: 'staff' as const, status: 'active' as const },
      { name: 'System Pending', email: 'pending', passwordHash, role: 'staff' as const, status: 'pending' as const },
      { name: 'System Disabled', email: 'disabled', passwordHash, role: 'staff' as const, status: 'inactive' as const },
    ];

    for (const demo of demoUsers) {
      const existing = await User.findOne({ email: demo.email });
      if (!existing) {
        await User.create(demo);
        console.log(`🌱 Seeded demo account: ${demo.email} (password: 1, role: ${demo.role}, status: ${demo.status})`);
      }
    }
  } catch (err: any) {
    console.error('❌ Seeding error:', err.message);
  }
}

mongoose
  .connect(MONGO_URI, { retryWrites: false } as any)
  .then(async () => {
    console.log('✅ MongoDB connected:', MONGO_URI);
    // Reviewer was an unfinished fifth role. Existing accounts are migrated to
    // Checker, which owns the human quality-review responsibilities.
    await User.collection.updateMany({ role: 'reviewer' }, { $set: { role: 'checker' } });
    await seedDefaultUsers();
    await seedDefaultStage4Data();
    startAssignmentDeadlineReminderService();

    try {
      // Reset any stuck running multi-eval jobs to failed
      const { MultiModelEvaluationJob } = require('./models/MultiModelEvaluationJob');
      const result = await MultiModelEvaluationJob.updateMany(
        { status: 'running' },
        { $set: { status: 'failed', error: 'Server restarted during job execution.' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`🧹 Cleaned up ${result.modifiedCount} stuck running multi-eval jobs.`);
      }
    } catch (err: any) {
      console.error('❌ Stuck jobs cleanup error:', err.message);
    }
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

// Middleware
// CORS: restrict to a configured allowlist instead of reflecting every origin.
// FRONTEND_ORIGINS is a comma-separated list; falls back to localhost dev ports.
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients (curl, server-to-server) that send no Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
  },
  credentials: true,
}));
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    if (req.path.includes('/stream') || req.headers.accept === 'text/event-stream') {
      return false;
    }
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Tạo thư mục uploads nếu chưa có
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 API docs available at http://localhost:${PORT}/api`);
});

export default app;
