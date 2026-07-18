import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function testBackend() {
  console.log('🧪 Testing Backend...\n');

  // Test single video info
  try {
    console.log('📡 Testing video info...');
    const infoRes = await axios.get(`${BASE_URL}/audio/info/dQw4w9WgXcQ`);
    console.log('✅ Video info:', infoRes.data.info.title);
  } catch (error) {
    console.error('❌ Video info failed:', error.response?.data || error.message);
  }

  // Test playlist info
  try {
    console.log('\n📡 Testing playlist info...');
    const playlistUrl = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';
    const playlistRes = await axios.post(`${BASE_URL}/audio/playlist/info`, { url: playlistUrl });
    console.log(`✅ Playlist info: ${playlistRes.data.title} (${playlistRes.data.count} songs)`);
    console.log('   First song:', playlistRes.data.songs[0]?.title);
  } catch (error) {
    console.error('❌ Playlist info failed:', error.response?.data || error.message);
  }

  // Test download
  try {
    console.log('\n📡 Testing download...');
    const downloadRes = await axios.get(`${BASE_URL}/audio/download/dQw4w9WgXcQ`);
    console.log('✅ Download success:', downloadRes.data.fileName);
    console.log('   Size:', downloadRes.data.sizeMB, 'MB');
  } catch (error) {
    console.error('❌ Download failed:', error.response?.data || error.message);
  }
}

testBackend();