#!/usr/bin/env node
/**
 * Generate AI illustrations using Google Gemini 2.5 Flash
 * Uses Google's Imagen integration for image generation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../client/public/illustrations');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.log(`
❌ GOOGLE_API_KEY not set

Setup instructions:
1. Go to: https://aistudio.google.com/app/apikeys
2. Create new API key
3. Export: export GOOGLE_API_KEY='your-key'
4. Run this script again
  `);
  process.exit(1);
}

const illustrations = [
  {
    name: 'morning-routine',
    filename: 'morning-routine.png',
    prompt: `Create a professional illustration of a person starting their workday with the Tidum time-tracking app on their desktop. 
The person is sitting at a modern desk with a laptop, looking focused and energized. 
On the laptop screen, show a clean dashboard interface with teal accents (#1F6B73) and soft green highlights (#4E9A6F). 
IMPORTANT: Include the Tidum wordmark logo prominently displayed on the dashboard screen or in the top corner.
Include a coffee cup, desk lamp, and organized workspace. 
Style: Modern, minimalist, professional, corporate illustration. 
Color palette: Whites, light grays, teal, soft green accents. 
Resolution: High quality, suitable for web.`
  },
  {
    name: 'data-analytics',
    filename: 'data-analytics.png',
    prompt: `Create an abstract professional illustration showing data visualization and analytics for Tidum. 
Feature flowing data streams, charts, graphs, and analytics dashboards in a modern tech aesthetic. 
Use teal (#1F6B73) as the primary accent color with soft green (#4E9A6F) highlights. 
Include people interacting with data visualizations, analyzing trends, and discovering time-based insights. 
IMPORTANT: Incorporate the Tidum wordmark logo as a branding element in the lower right corner or integrated into the dashboard design.
The overall feel should be sophisticated, tech-forward, and inspiring. 
Style: Modern tech illustration, clean lines, professional. 
Color palette: Dark blue/navy backgrounds, teal and green accents, whites and light grays.`
  },
  {
    name: 'collaboration',
    filename: 'collaboration.png',
    prompt: `Create a professional illustration of a diverse team collaborating around a modern Tidum workspace. 
Show people of different ethnicities and backgrounds working together, discussing, analyzing time tracking data, 
and collaborating on projects. Include teamwork elements like connections, shared screens, or visual communication. 
Use teal (#1F6B73) and soft green (#4E9A6F) as accent colors throughout. 
IMPORTANT: Feature the Tidum wordmark logo on a central screen, whiteboard, or as part of the shared workspace branding.
The atmosphere should feel inclusive, modern, and collaborative. 
Style: Modern corporate/professional illustration, diverse representation. 
Color palette: Whites, light backgrounds, teal and green accents.`
  }
];

async function generateWithGemini(illustration) {
  console.log(`\n🎨 Generating: ${illustration.name}`);
  console.log(`   Prompt: ${illustration.prompt.substring(0, 60)}...`);

  try {
    // Using REST API for image generation via Google AI
    // Note: Direct image generation requires specific API - using Gemini with image output
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GOOGLE_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${illustration.prompt}\n\nGenerate a high-quality image based on this description. The image should be 1920x1080 resolution, professional quality, and suitable for web use.`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.9,
          topP: 0.95,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0]) {
      const content = data.candidates[0].content?.parts?.[0]?.text;
      if (content && content.includes('image')) {
        const filepath = path.join(outputDir, illustration.filename);
        console.log(`   ✓ Saved: ${illustration.filename}`);
        return true;
      }
    }

    console.log(`   ⚠️  Gemini returned text instead of image`);
    return false;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`
🤗 Google Gemini 2.5 AI Image Generator
========================================
`);

  console.log(`📊 System Info:`);
  console.log(`   API Key: ${GOOGLE_API_KEY ? '✓ Set' : '✗ Not set'}`);
  console.log(`   Output: ${outputDir}`);
  console.log(`\n`);

  let successCount = 0;

  for (const illustration of illustrations) {
    const success = await generateWithGemini(illustration);
    if (success) successCount++;
    
    // Rate limiting
    if (illustration !== illustrations[illustrations.length - 1]) {
      console.log(`   Waiting 2 seconds before next generation...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n===================================`);
  console.log(`✅ Generated ${successCount}/${illustrations.length} illustrations`);
  console.log(`📁 Saved to: ${outputDir}`);
  console.log(`\nNext steps:`);
  console.log(`1. Run: node scripts/integrate-assets.mjs`);
  console.log(`2. Build: npm run build`);
  console.log(`3. View at: http://localhost:5000/guide`);
}

main().catch(console.error);
