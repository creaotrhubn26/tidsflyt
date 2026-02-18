#!/usr/bin/env node
/**
 * Hugging Face AI Asset Generator
 * Generates illustrations using Hugging Face Inference API
 *
 * Setup:
 * 1. Sign up at: https://huggingface.co
 * 2. Create API token: https://huggingface.co/settings/tokens
 * 3. Set environment: export HF_API_TOKEN="your-token"
 * 4. Run: node scripts/generate-with-huggingface.mjs
 */

import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HF_API_TOKEN = process.env.HF_API_TOKEN;
const OUTPUT_DIR = path.join(__dirname, '..', 'client', 'public', 'illustrations');

if (!HF_API_TOKEN) {
  console.error('❌ Error: HF_API_TOKEN environment variable not set');
  console.error('');
  console.error('Setup instructions:');
  console.error('1. Sign up: https://huggingface.co');
  console.error('2. Get token: https://huggingface.co/settings/tokens');
  console.error('3. Export token: export HF_API_TOKEN="your-token"');
  console.error('4. Run: node scripts/generate-with-huggingface.mjs');
  process.exit(1);
}

const ILLUSTRATIONS = [
  {
    name: 'morning-routine',
    prompt: `Professional person starting their day with Tidum app on desk, coffee cup, laptop screen showing time tracking interface, morning sunlight through window, modern flat design illustration style, teal and green colors, productivity theme, clean and minimalist, professional workspace`,
    model: 'stabilityai/stable-diffusion-3-medium',
  },
  {
    name: 'data-analytics',
    prompt: `Abstract visualization of data flowing and transforming into productivity insights, animated charts and graphs coming to life, bar charts growing upward, line graphs with positive trends, colorful data visualization, modern infographic style, teal and green gradient colors, digital art, clean design, business analytics theme`,
    model: 'stabilityai/stable-diffusion-3-medium',
  },
  {
    name: 'collaboration',
    prompt: `Diverse team of professionals collaborating around a table, sharing documents and knowledge, positive energy, smiling faces, modern office environment, teamwork and communication theme, warm lighting, professional illustration, diverse representation, inclusive workplace, teal and green accents, productive collaboration scene`,
    model: 'stabilityai/stable-diffusion-3-medium',
  },
];

async function generateImage(illustration) {
  console.log(`🎨 Generating: ${illustration.name}`);
  console.log(`   Prompt: ${illustration.prompt.substring(0, 50)}...`);

  try {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${illustration.model}`,
      {
        headers: { Authorization: `Bearer ${HF_API_TOKEN}` },
        method: 'POST',
        body: JSON.stringify({
          inputs: illustration.prompt,
          parameters: {
            negative_prompt:
              'blurry, low quality, watermark, text, distorted, deformed',
            num_inference_steps: 30,
            guidance_scale: 7.5,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const buffer = await response.buffer();

    // Create output directory
    await fs.ensureDir(OUTPUT_DIR);

    // Save as PNG
    const pngPath = path.join(OUTPUT_DIR, `${illustration.name}.png`);
    await fs.writeFile(pngPath, buffer);

    // Also create WebP version for web optimization
    console.log(`   ✓ Saved: ${illustration.name}.png (${(buffer.length / 1024).toFixed(2)}KB)`);
    console.log('');

    return pngPath;
  } catch (error) {
    console.error(`   ✗ Failed: ${error.message}`);
    console.log('');
    throw error;
  }
}

async function main() {
  console.log('\n🤗 Hugging Face AI Image Generator');
  console.log('===================================\n');

  try {
    let successCount = 0;

    for (const illustration of ILLUSTRATIONS) {
      try {
        await generateImage(illustration);
        successCount++;
        // Wait between requests to avoid rate limiting
        if (successCount < ILLUSTRATIONS.length) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Failed to generate ${illustration.name}`);
      }
    }

    console.log('===================================');
    console.log(`✅ Generated ${successCount}/${ILLUSTRATIONS.length} illustrations`);
    console.log(`📁 Saved to: ${OUTPUT_DIR}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Create videos with Runway ML or D-ID');
    console.log('2. Run: node scripts/integrate-assets.mjs');
    console.log('');
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
}

main();
