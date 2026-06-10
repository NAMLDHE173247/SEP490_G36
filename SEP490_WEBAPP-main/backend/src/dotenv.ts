import dotenv from 'dotenv';
import path from 'path';

// Load .env from root directory (parent of backend)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Load .env from local backend directory (as a fallback)
dotenv.config();
