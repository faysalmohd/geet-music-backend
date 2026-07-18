import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import audioRoutes from './routes/audio.js';
import { getStorageStats, cleanupOldFiles } from './services/download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============ MIDDLEWARE ============
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// ============ ROUTES ============
app.use('/api/audio', audioRoutes);

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    const storage = await getStorageStats();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      storage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// ============ ROOT ============
app.get('/', (req, res) => {
  res.json({
    name: 'YT-DLP Audio Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      download: '/api/audio/download/:videoId',
      stream: '/api/audio/stream/:videoId',
      info: '/api/audio/info/:videoId',
      file: '/api/audio/file/:filename',
      playlist: '/api/audio/playlist/info (POST)'
    }
  });
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============ START SERVER ============
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Storage path: ${process.env.STORAGE_PATH || './downloads'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API base: http://localhost:${PORT}/api/audio`);
  console.log(`📡 Playlist endpoint: http://localhost:${PORT}/api/audio/playlist/info`);
  
  // Clean old files on startup
  await cleanupOldFiles();
});

// Clean old files every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

export default app;