import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../client/public/illustrations');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Using the key you added

if (!OPENAI_API_KEY) {
  console.log(`
❌ OPENAI_API_KEY not set in .env file

Setup instructions:
1. Go to: https://platform.openai.com/api-keys
2. Create a new secret key.
3. Add it to your .env file: OPENAI_API_KEY='sk-your-key-here'
4. Make sure you have a funded OpenAI account.
5. Run this script again.
  `);
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const illustrations = [
    {
        name: 'morning-routine',
        filename: 'morning-routine.png',
        prompt: `A professional illustration of a person starting their workday with a time-tracking app on their desktop. The person is at a modern desk with a laptop, looking focused. The laptop screen shows a clean dashboard with teal (#1F6B73) and soft green (#4E9A6F) accents. The Tidum wordmark logo is clearly visible on the dashboard. Style: Modern, minimalist, professional corporate illustration. 16:9 aspect ratio.`
    },
    {
        name: 'data-analytics',
        filename: 'data-analytics.png',
        prompt: `An abstract professional illustration of data visualization and analytics. It features flowing data streams, charts, and dashboards in a modern tech aesthetic. The primary colors are teal (#1F6B73) and soft green (#4E9A6F). The Tidum wordmark logo is integrated as a watermark. Style: Modern tech illustration, clean lines. 16:9 aspect ratio.`
    },
    {
        name: 'collaboration',
        filename: 'collaboration.png',
        prompt: `A professional illustration of a diverse team collaborating around a modern dashboard. They are discussing time tracking data. The Tidum wordmark logo is featured on the central screen. The atmosphere is inclusive and modern. Style: Modern corporate illustration with diverse representation. 16:9 aspect ratio.`
    }
];

async function downloadImage(url, filepath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filepath, buffer);
}

async function generateWithOpenAI(illustration) {
  console.log(`\n🎨 Generating: ${illustration.name}`);
  console.log(`   Prompt: ${illustration.prompt.substring(0, 60)}...`);

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: illustration.prompt,
      n: 1,
      size: "1792x1024", // Closest to 16:9
      quality: "hd",
    });

    const imageUrl = response.data[0].url;
    if (!imageUrl) {
        throw new Error('No image URL returned from API.');
    }
    
    const filepath = path.join(outputDir, illustration.filename);
    
    console.log(`   Downloading image...`);
    await downloadImage(imageUrl, filepath);
    
    const stats = fs.statSync(filepath);
    console.log(`   ✓ Saved: ${illustration.filename} (${(stats.size / 1024).toFixed(2)} KB)`);
    return true;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.response) {
        console.error('   API Response:', error.response.data);
    }
    return false;
  }
}

async function main() {
  console.log(`
🤖 OpenAI DALL-E 3 Image Generator
====================================
`);

  let successCount = 0;

  for (const illustration of illustrations) {
    const success = await generateWithOpenAI(illustration);
    if (success) successCount++;
  }

  console.log(`\n===================================`);
  console.log(`✅ Generated ${successCount}/${illustrations.length} illustrations`);
  console.log(`📁 Saved to: ${outputDir}`);
  
  if (successCount === illustrations.length) {
    console.log(`\n🎉 All images generated successfully!`);
    console.log(`\nNext steps:`);
    console.log(`1. Run: node scripts/integrate-assets.mjs`);
    console.log(`2. View the guide at http://localhost:5000/guide`);
  } else {
    console.log(`\n⚠️ Some images failed to generate. Check the errors above.`);
  }
}

main().catch(console.error);
