import './dotenv';
import express, { Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import routes from './routes';
import fs from 'fs';
import path from 'path';

console.log('=== APP STARTING ===');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGO_URI exists:', !!process.env.MONGO_URI);

const app: Express = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sep_training';



// Connect to MongoDB
import { User } from './models/User';
import bcrypt from 'bcryptjs';
import { seedDefaultStage4Data } from './seedStage4';
import { seedModelRegistryData } from './seedModelRegistry';
import { seedTrainingHistoryData } from './seedTrainingHistory';

async function seedDefaultUsers() {
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('1', salt);

    const demoUsers = [
      { name: 'System Admin', email: 'admin', passwordHash, role: 'admin' as const, status: 'active' as const },
      { name: 'System Supervisor', email: 'supervisor', passwordHash, role: 'supervisor' as const, status: 'active' as const },
      { name: 'System Staff', email: 'staff', passwordHash, role: 'staff' as const, status: 'active' as const },
      { name: 'System Reviewer', email: 'reviewer', passwordHash, role: 'reviewer' as const, status: 'active' as const },
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
    await seedDefaultUsers();
    await seedDefaultStage4Data();
    await seedModelRegistryData();
    await seedTrainingHistoryData();
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

// Middleware
app.use(cors());
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

app.get('/api/debug-env', (_req, res) => {
  res.json({
    GPU_SERVICE_URL: process.env.GPU_SERVICE_URL || 'undefined',
    MONGO_URI: process.env.MONGO_URI || 'undefined'
  });
});

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

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 API docs available at http://localhost:${PORT}/api`);
});

export default app;