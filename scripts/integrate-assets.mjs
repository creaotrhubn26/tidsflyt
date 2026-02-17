#!/usr/bin/env node
/**
 * Asset Integration Script
 * Integrates generated illustrations and videos into the interactive guide
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSETS = {
  illustrations: {
    'morning-routine': {
      placeholder: 'Morning Routine Illustration',
      description: 'A person starting their day with Tidum app, coffee in hand, ready to track their work...',
      section: 'time-registration',
    },
    'data-analytics': {
      placeholder: 'Data Analytics Journey',
      description: 'Charts and graphs coming to life, showing productivity insights and trends...',
      section: 'reports',
    },
    collaboration: {
      placeholder: 'Documentation & Collaboration',
      description: 'Team members collaborating, sharing knowledge, and building a robust knowledge base...',
      section: 'case-management',
    },
  },
  videos: {
    'time-tracking-tutorial': {
      title: 'Time Tracking Tutorial',
      description: 'Learn how to track your time in seconds',
      duration: '0:30',
      section: 'time-registration',
    },
    'reports-generation': {
      title: 'Reports Generation',
      description: 'Turn your time data into productivity insights',
      duration: '0:20',
      section: 'reports',
    },
    'case-management-flow': {
      title: 'Case Management Workflow',
      description: 'Document, collaborate, and solve cases',
      duration: '0:25',
      section: 'case-management',
    },
  },
};

async function checkAssets() {
  console.log('📁 Checking for generated assets...\n');

  const illDir = path.join(__dirname, 'client', 'public', 'illustrations');
  const vidDir = path.join(__dirname, 'client', 'public', 'videos');

  // Check illustrations
  console.log('🎨 Illustrations:');
  for (const [name, config] of Object.entries(ASSETS.illustrations)) {
    const pngPath = path.join(illDir, `${name}.png`);
    const webpPath = path.join(illDir, `${name}.webp`);

    if (await fs.pathExists(pngPath)) {
      const size = (await fs.stat(pngPath)).size;
      console.log(`  ✓ ${name}.png (${(size / 1024).toFixed(2)}KB)`);
    } else if (await fs.pathExists(webpPath)) {
      const size = (await fs.stat(webpPath)).size;
      console.log(`  ✓ ${name}.webp (${(size / 1024).toFixed(2)}KB)`);
    } else {
      console.log(`  ○ ${name} - NOT FOUND (placeholder in use)`);
    }
  }

  // Check videos
  console.log('\n🎬 Videos:');
  for (const [name, config] of Object.entries(ASSETS.videos)) {
    const mp4Path = path.join(vidDir, `${name}.mp4`);
    const webmPath = path.join(vidDir, `${name}.webm`);

    if (await fs.pathExists(mp4Path)) {
      const size = (await fs.stat(mp4Path)).size;
      console.log(`  ✓ ${name}.mp4 (${(size / 1024 / 1024).toFixed(2)}MB)`);
    } else if (await fs.pathExists(webmPath)) {
      const size = (await fs.stat(webmPath)).size;
      console.log(`  ✓ ${name}.webm (${(size / 1024 / 1024).toFixed(2)}MB)`);
    } else {
      console.log(`  ○ ${name} - NOT CREATED YET`);
    }
  }

  console.log('\n📋 Next Steps:');
  console.log('   1. Generate illustrations using:');
  console.log('      - Google Vertex AI (Imagen)');
  console.log('      - Replicate API');
  console.log('      - Midjourney');
  console.log('      - DALL-E 3');
  console.log('');
  console.log('   2. Save to: client/public/illustrations/');
  console.log('   3. Create videos using:');
  console.log('      - Runway ML Gen-2');
  console.log('      - D-ID (for animation)');
  console.log('      - Synthesia (for talking heads)');
  console.log('');
  console.log('   4. Save to: client/public/videos/');
  console.log('   5. Run this script again to verify integration');
  console.log('');
}

async function generateIntegrationCode() {
  console.log('\n\n📝 Component Integration Code:\n');

  console.log('// For illustrations (in interactive-guide.tsx):');
  console.log('const illustration = {');
  Object.entries(ASSETS.illustrations).forEach(([name, config]) => {
    console.log(`  "${name}": {`);
    console.log(`    src: "/illustrations/${name}.png",`);
    console.log(`    alt: "${config.placeholder}",`);
    console.log(`  },`);
  });
  console.log('};\n');

  console.log('// For videos (new VideoPlayer component):');
  console.log('const videos = {');
  Object.entries(ASSETS.videos).forEach(([name, config]) => {
    console.log(`  "${name}": {`);
    console.log(`    src: "/videos/${name}.mp4",`);
    console.log(`    poster: "/videos/${name}-poster.jpg",`);
    console.log(`    title: "${config.title}",`);
    console.log(`    duration: "${config.duration}",`);
    console.log(`  },`);
  });
  console.log('\n');
}

async function createVideoPlayerComponent() {
  const componentCode = `import React from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title: string;
  duration: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, poster, title, duration }) => {
  const [isPlaying, setIsPlaying] = React.useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden bg-black group cursor-pointer">
      <video
        src={src}
        poster={poster}
        controls={isPlaying}
        autoPlay={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-auto"
      />
      
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
          <button
            onClick={() => setIsPlaying(true)}
            className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition"
          >
            <span className="text-xl">▶️</span>
          </button>
          
          <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-sm">
            {duration}
          </div>
        </div>
      )}
      
      <h3 className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white font-semibold">
        {title}
      </h3>
    </div>
  );
};

export default VideoPlayer;
`;

  const componentPath = path.join(
    __dirname,
    'client',
    'src',
    'components',
    'video-player.tsx'
  );

  await fs.ensureDir(path.dirname(componentPath));
  await fs.writeFile(componentPath, componentCode);

  console.log('✓ Created VideoPlayer component at:');
  console.log(`  client/src/components/video-player.tsx`);
}

async function main() {
  try {
    console.log('\n🎬 Tidum Guide Asset Integration Tool\n');
    console.log('=' .repeat(50) + '\n');

    await checkAssets();
    await generateIntegrationCode();
    await createVideoPlayerComponent();

    console.log('=' .repeat(50));
    console.log('\n✅ Setup complete!\n');
    console.log('Ready to integrate assets when they\'re generated.\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
