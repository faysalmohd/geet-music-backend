import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  downloadAudio, 
  getAudioInfo, 
  checkVideoExists,
  streamAudio,
  deleteAudioFile,
  getStorageStats 
} from '../services/download.js';

const execAsync = promisify(exec);
const router = express.Router();

// ============ GET PLAYLIST INFO ============
router.post('/playlist/info', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'No URL provided'
    });
  }

  try {
    console.log(`📡 Playlist info request for: ${url}`);
    
    let playlistId = null;
    if (url.includes('list=')) {
      playlistId = url.split('list=')[1].split('&')[0];
    } else if (url.includes('/playlist/')) {
      playlistId = url.split('/playlist/')[1].split('?')[0];
    }
    
    if (!playlistId) {
      throw new Error('Could not extract playlist ID');
    }

    console.log(`📡 Playlist ID: ${playlistId}`);

    // Use yt-dlp command with --dump-json and cookies if available
    const cookiesPath = process.env.COOKIES_PATH || './cookies.txt';
    let cookieOption = '';
    
    // Check if cookies file exists
    try {
      if (await fs.pathExists(cookiesPath)) {
        cookieOption = `--cookies "${cookiesPath}"`;
        console.log('🍪 Using cookies file for authentication');
      }
    } catch (error) {
      console.log('⚠️ Could not check cookies file:', error.message);
    }

    const command = `yt-dlp --dump-json --no-warnings --flat-playlist --skip-download ${cookieOption} "${url}"`;
    console.log('🔧 Running command:', command);

    const { stdout, stderr } = await execAsync(command, { 
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000 // 60 second timeout
    });

    if (stderr && !stderr.includes('warning')) {
      console.warn('⚠️ yt-dlp stderr:', stderr);
    }

    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error('Failed to parse line:', line);
        return null;
      }
    }).filter(entry => entry !== null);

    if (entries.length === 0) {
      throw new Error('No entries found in playlist');
    }

    const title = entries[0]?.playlist_title || 'Untitled Playlist';

    const songs = entries.map(entry => ({
      videoId: entry.id,
      title: entry.title || 'Unknown Title',
      artist: entry.channel || entry.uploader || 'Unknown Artist',
      duration: entry.duration || 0,
      thumbnail: entry.thumbnail || `https://img.youtube.com/vi/${entry.id}/hqdefault.jpg`
    }));

    console.log(`✅ Found ${songs.length} songs in playlist: ${title}`);

    return res.json({
      success: true,
      type: 'playlist',
      title: title,
      songs: songs,
      count: songs.length,
      playlistId: playlistId
    });

  } catch (error) {
    console.error('Playlist info error:', error);
    
    // Check if it's an authentication error
    if (error.message && (
      error.message.includes('Sign in to confirm') ||
      error.message.includes('bot') ||
      error.message.includes('cookies')
    )) {
      return res.status(401).json({
        success: false,
        error: 'YouTube requires authentication. Please set up cookies.',
        message: error.message,
        requiresAuth: true
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get playlist info',
      message: error.message
    });
  }
});

// ============ GET AUDIO INFO ============
router.get('/info/:videoId', async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'No video ID provided'
    });
  }

  try {
    console.log(`📡 Info request for: ${videoId}`);
    const info = await getAudioInfo(videoId);
    return res.json({
      success: true,
      info
    });
  } catch (error) {
    console.error('Info error:', error);
    return res.status(404).json({
      success: false,
      error: 'Failed to get audio info',
      message: error.message,
      videoId: videoId
    });
  }
});

// ============ DOWNLOAD AUDIO ============
router.get('/download/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const cookiesPath = process.env.COOKIES_PATH || './cookies.txt';
  const autoDelete = req.query.autoDelete !== 'false';
  
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'No video ID provided',
      code: 'MISSING_VIDEO_ID'
    });
  }

  const cleanVideoId = videoId.split('?')[0].split('/').pop().trim();
  
  if (cleanVideoId.length < 5) {
    return res.status(400).json({
      success: false,
      error: 'Invalid video ID format',
      code: 'INVALID_VIDEO_ID',
      message: 'YouTube video IDs are typically 11 characters long'
    });
  }

  console.log(`📥 Download request for: ${cleanVideoId}`);

  try {
    // Check storage
    const storage = await getStorageStats();
    if (storage.isFull) {
      return res.status(507).json({
        success: false,
        error: 'Storage is full',
        code: 'STORAGE_FULL'
      });
    }

    // Check if cookies file exists
    let cookiePath = null;
    try {
      if (await fs.pathExists(cookiesPath)) {
        cookiePath = cookiesPath;
        console.log('🍪 Using cookies file for authentication');
      } else {
        console.log('⚠️ Cookies file not found, trying without authentication');
      }
    } catch (error) {
      console.log('⚠️ Could not check cookies file:', error.message);
    }

    // Download audio
    const result = await downloadAudio(cleanVideoId, cookiePath);

    const response = {
      success: true,
      videoId: cleanVideoId,
      fileName: result.fileName,
      fileSize: result.fileSize,
      sizeMB: (result.fileSize / 1024 / 1024).toFixed(2),
      downloadUrl: `/api/audio/file/${result.fileName}`,
      streamUrl: `/api/audio/stream/${result.fileName}`,
      autoDelete: autoDelete
    };

    return res.json(response);

  } catch (error) {
    console.error('Download error:', error);
    
    // Check if it's an authentication error
    if (error.message && (
      error.message.includes('Sign in to confirm') ||
      error.message.includes('bot') ||
      error.message.includes('cookies')
    )) {
      return res.status(401).json({
        success: false,
        error: 'YouTube requires authentication. Please set up cookies.',
        message: error.message,
        requiresAuth: true
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message
    });
  }
});

// ============ DOWNLOAD PLAYLIST ============
router.post('/playlist/download', async (req, res) => {
  const { playlistId, songs, autoDelete = true } = req.body;
  
  if (!playlistId || !songs || !Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid playlist data'
    });
  }

  console.log(`📥 Downloading playlist: ${playlistId} (${songs.length} songs)`);

  try {
    const results = [];
    const errors = [];

    for (const song of songs) {
      try {
        console.log(`📥 Downloading: ${song.title} (${song.videoId})`);
        const result = await downloadAudio(song.videoId);
        
        const downloadedSong = {
          id: result.fileName,
          videoId: song.videoId,
          title: song.title,
          artist: song.artist,
          duration: song.duration,
          thumbnail: song.thumbnail,
          fileName: result.fileName,
          fileSize: result.fileSize,
          downloadedAt: new Date().toISOString(),
          autoDelete: autoDelete
        };
        
        results.push(downloadedSong);
        console.log(`✅ Downloaded: ${song.title}`);
        
        // Add a small delay between downloads to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Failed to download: ${song.title}`, error.message);
        errors.push({
          song: song.title,
          videoId: song.videoId,
          error: error.message
        });
      }
    }

    return res.json({
      success: true,
      downloaded: results.length,
      failed: errors.length,
      results: results,
      errors: errors,
      autoDelete: autoDelete
    });

  } catch (error) {
    console.error('Playlist download error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to download playlist',
      message: error.message
    });
  }
});

// ============ STREAM AUDIO ============
router.get('/stream/:fileName', async (req, res) => {
  const { fileName } = req.params;
  
  try {
    await streamAudio(fileName, res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(404).json({
        success: false,
        error: 'Stream failed',
        message: error.message
      });
    }
  }
});

// ============ GET FILE ============
router.get('/file/:fileName', async (req, res) => {
  const { fileName } = req.params;
  const shouldDownload = req.query.download === 'true';
  
  try {
    const filePath = path.join(process.env.STORAGE_PATH || './downloads', fileName);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    if (shouldDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
  } catch (error) {
    console.error('File serve error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    });
  }
});

// ============ DELETE FILE ============
router.delete('/file/:fileName', async (req, res) => {
  const { fileName } = req.params;
  
  try {
    const deleted = await deleteAudioFile(fileName);
    if (deleted) {
      return res.json({ success: true, message: 'File deleted successfully' });
    } else {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
});

// ============ STORAGE STATS ============
router.get('/storage/stats', async (req, res) => {
  try {
    const stats = await getStorageStats();
    return res.json({ success: true, ...stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to get storage stats' });
  }
});

export default router;