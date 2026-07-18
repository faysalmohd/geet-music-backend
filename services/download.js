import youtubedl from 'youtube-dl-exec';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import yts from 'yt-search';

const STORAGE_PATH = process.env.STORAGE_PATH || './downloads';
fs.ensureDirSync(STORAGE_PATH);

// ============ FORMAT VIDEO ID ============
function formatVideoId(videoId) {
  if (!videoId) return null;
  let cleanId = videoId.split('?')[0];
  cleanId = cleanId.split('/').pop();
  cleanId = cleanId.replace(/[^A-Za-z0-9_-]/g, '');
  return cleanId.trim();
}

// ============ CHECK IF VIDEO EXISTS WITH MULTIPLE METHODS ============
export async function checkVideoExists(videoId) {
  console.log(`🔍 Checking if video exists: ${videoId}`);
  
  const cleanVideoId = formatVideoId(videoId);
  if (!cleanVideoId || cleanVideoId.length < 5) {
    return {
      exists: false,
      error: 'Invalid video ID format',
      code: 'INVALID_VIDEO_ID'
    };
  }

  const methods = [
    checkViaYTS,
    checkViaOEmbed,
    checkViaYouTubePage,
    checkViaYouTubeDL
  ];

  let lastError = null;

  for (const method of methods) {
    try {
      console.log(`📡 Trying method: ${method.name}`);
      const result = await method(cleanVideoId);
      if (result && result.exists) {
        console.log(`✅ Video exists: ${result.title}`);
        return result;
      }
    } catch (error) {
      lastError = error;
      console.log(`⚠️ ${method.name} failed:`, error.message);
    }
  }

  console.error('❌ Video does not exist or is unavailable');
  return {
    exists: false,
    error: 'Video not found or unavailable',
    code: 'VIDEO_NOT_FOUND',
    details: lastError?.message
  };
}

// ============ METHOD 1: yt-search ============
async function checkViaYTS(videoId) {
  try {
    const result = await yts({ videoId });
    
    if (!result || !result.videos || result.videos.length === 0) {
      throw new Error('No video found in yt-search');
    }

    const video = result.videos[0];
    
    return {
      exists: true,
      videoId: video.videoId,
      title: video.title || 'Unknown Title',
      artist: video.author?.name || 'Unknown Artist',
      duration: video.duration?.seconds || 0,
      thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
    };
  } catch (error) {
    console.log('yt-search error:', error.message);
    throw error;
  }
}

// ============ METHOD 2: YouTube oEmbed API ============
async function checkViaOEmbed(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      throw new Error(`oEmbed returned ${response.status}`);
    }

    const data = await response.json();
    
    return {
      exists: true,
      videoId: videoId,
      title: data.title || 'Unknown Title',
      artist: data.author_name || 'Unknown Artist',
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (error) {
    console.log('oEmbed error:', error.message);
    throw error;
  }
}

// ============ METHOD 3: YouTube Page Fetch ============
async function checkViaYouTubePage(videoId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      throw new Error(`YouTube page returned ${response.status}`);
    }

    const html = await response.text();
    
    if (html.includes('Video unavailable') || html.includes('This video is private')) {
      throw new Error('Video is private or unavailable');
    }
    
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Unknown Title';
    
    const channelMatch = html.match(/"owner":{"name":"(.*?)"/);
    const artist = channelMatch ? channelMatch[1] : 'Unknown Artist';
    
    return {
      exists: true,
      videoId: videoId,
      title: title,
      artist: artist,
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (error) {
    console.log('YouTube page fetch error:', error.message);
    throw error;
  }
}

// ============ METHOD 4: youtube-dl-exec ============
async function checkViaYouTubeDL(videoId) {
  try {
    const result = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpJson: true,
      noPlaylist: true,
      skipDownload: true,
      socketTimeout: 10,
      addHeader: [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    });

    if (!result || !result.title) {
      throw new Error('No info from youtube-dl');
    }

    return {
      exists: true,
      videoId: videoId,
      title: result.title || 'Unknown Title',
      artist: result.uploader || 'Unknown Artist',
      duration: result.duration || 0,
      thumbnail: result.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (error) {
    console.log('youtube-dl check error:', error.message);
    throw error;
  }
}

// ============ GET AUDIO INFO WITH FALLBACKS ============
export async function getAudioInfo(videoId) {
  console.log(`🔍 Getting info for video: ${videoId}`);
  
  const cleanVideoId = formatVideoId(videoId);
  if (!cleanVideoId || cleanVideoId.length < 5) {
    throw new Error('Invalid video ID');
  }

  const videoCheck = await checkVideoExists(cleanVideoId);
  
  if (!videoCheck.exists) {
    throw new Error(`Video not found: ${videoCheck.error || 'Video is unavailable'}`);
  }
  
  return {
    videoId: videoCheck.videoId,
    title: videoCheck.title,
    artist: videoCheck.artist,
    duration: videoCheck.duration,
    durationFormatted: formatDuration(videoCheck.duration || 0),
    thumbnail: videoCheck.thumbnail,
    views: 0,
    uploadedAt: null
  };
}

// ============ DOWNLOAD AUDIO (Updated with mweb client support) ============
export async function downloadAudio(videoId, cookiesPath = null) {
  console.log(`📥 Downloading audio for: ${videoId}`);
  
  const cleanVideoId = formatVideoId(videoId);
  if (!cleanVideoId || cleanVideoId.length < 5) {
    throw new Error('Invalid video ID');
  }

  try {
    // Check if already downloaded
    const existing = await findExistingAudio(cleanVideoId);
    if (existing) {
      console.log(`✅ Using existing file: ${existing}`);
      const stats = await fs.stat(existing);
      return {
        filePath: existing,
        fileName: path.basename(existing),
        fileSize: stats.size,
        isNew: false
      };
    }

    // Check if video exists
    const videoCheck = await checkVideoExists(cleanVideoId);
    if (!videoCheck.exists) {
      throw new Error(`Video not found: ${videoCheck.error}`);
    }

    const fileName = `${uuidv4()}.mp3`;
    const filePath = path.join(STORAGE_PATH, fileName);

    console.log(`🔄 Downloading with yt-dlp: ${cleanVideoId}`);

    // Build options with all necessary flags
    const options = {
      output: filePath,
      format: 'bestaudio',
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      noPlaylist: true,
      addHeader: [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.5'
      ],
      retries: 5,
      fragmentRetries: 5,
      skipUnavailableFragments: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      socketTimeout: 120,
      extractorRetries: 5,
      fileAccessRetries: 5,
      sleepInterval: 10,
      maxSleepInterval: 20,
      // Use mweb client first (most lenient)
      extractorArgs: ['youtube:player-client=mweb']
    };

    // Add cookies if available
    if (cookiesPath) {
      try {
        if (await fs.pathExists(cookiesPath)) {
          console.log('🍪 Using cookies file for authentication');
          options.cookies = cookiesPath;
        } else {
          console.log('⚠️ Cookies file not found at:', cookiesPath);
        }
      } catch (error) {
        console.log('⚠️ Could not check cookies file:', error.message);
      }
    }

    console.log('🔄 Trying with Mobile Web (mweb) client...');
    
    try {
      // First try with mweb client
      await youtubedl(`https://www.youtube.com/watch?v=${cleanVideoId}`, options);
    } catch (error) {
      console.log('❌ mweb client failed, trying with android client...');
      
      // If mweb fails, try android
      const androidOptions = {
        ...options,
        extractorArgs: ['youtube:player-client=android']
      };
      
      try {
        await youtubedl(`https://www.youtube.com/watch?v=${cleanVideoId}`, androidOptions);
      } catch (androidError) {
        console.log('❌ android client failed, trying with web client...');
        
        // If android fails, try web
        const webOptions = {
          ...options,
          extractorArgs: ['youtube:player-client=web']
        };
        
        try {
          await youtubedl(`https://www.youtube.com/watch?v=${cleanVideoId}`, webOptions);
        } catch (webError) {
          console.error('All clients failed');
          
          // Check if it's an auth error
          if (webError.message && webError.message.includes('Sign in to confirm')) {
            throw new Error('YouTube requires authentication. Please ensure cookies.txt is valid.');
          }
          throw webError;
        }
      }
    }

    if (!await fs.pathExists(filePath)) {
      throw new Error('Audio file was not created');
    }

    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      await fs.remove(filePath);
      throw new Error('Downloaded file is empty');
    }

    console.log(`✅ Audio downloaded: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      filePath,
      fileName,
      fileSize: stats.size,
      isNew: true
    };

  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

// ============ STREAM AUDIO ============
export async function streamAudio(fileName, res) {
  try {
    const filePath = path.join(STORAGE_PATH, fileName);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error('Audio file not found');
    }

    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return true;
  } catch (error) {
    console.error('Stream error:', error);
    throw error;
  }
}

// ============ FIND EXISTING AUDIO ============
async function findExistingAudio(videoId) {
  try {
    const files = await fs.readdir(STORAGE_PATH);
    for (const file of files) {
      if (file.endsWith('.mp3') && file.includes(videoId)) {
        return path.join(STORAGE_PATH, file);
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// ============ DELETE AUDIO FILE ============
export async function deleteAudioFile(fileName) {
  try {
    const filePath = path.join(STORAGE_PATH, fileName);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(`🗑️ Deleted: ${fileName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}

// ============ GET STORAGE STATS ============
export async function getStorageStats() {
  try {
    const files = await fs.readdir(STORAGE_PATH);
    let totalSize = 0;
    let count = 0;
    
    for (const file of files) {
      if (file.endsWith('.mp3') || file.endsWith('.m4a')) {
        const stats = await fs.stat(path.join(STORAGE_PATH, file));
        totalSize += stats.size;
        count++;
      }
    }
    
    return {
      totalFiles: count,
      totalSize: totalSize,
      totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
      maxStorageGB: parseFloat(process.env.MAX_STORAGE_GB || 15),
      isFull: totalSize > (parseFloat(process.env.MAX_STORAGE_GB || 15) * 1024 * 1024 * 1024)
    };
  } catch (error) {
    console.error('Storage stats error:', error);
    return { 
      totalFiles: 0, 
      totalSize: 0, 
      totalSizeGB: '0.00', 
      maxStorageGB: 15,
      isFull: false 
    };
  }
}

// ============ CLEANUP OLD FILES ============
export async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(STORAGE_PATH);
    const now = Date.now();
    const maxAge = (process.env.MAX_FILE_AGE_HOURS || 24) * 60 * 60 * 1000;
    
    let cleanedCount = 0;
    for (const file of files) {
      if (file.endsWith('.mp3') || file.endsWith('.m4a')) {
        const filePath = path.join(STORAGE_PATH, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAge) {
          await fs.remove(filePath);
          cleanedCount++;
          console.log(`🧹 Cleaned up old file: ${file}`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old files`);
    }
    return cleanedCount;
  } catch (error) {
    console.error('Cleanup error:', error);
    return 0;
  }
}

// ============ HELPER FUNCTIONS ============
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default {
  downloadAudio,
  getAudioInfo,
  checkVideoExists,
  streamAudio,
  deleteAudioFile,
  getStorageStats,
  cleanupOldFiles
};