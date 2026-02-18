#!/usr/bin/env bash
# Hugging Face Quick Start - Copy & Paste Commands

echo "
🤗 Hugging Face AI Generation - Quick Start
============================================
"

echo "STEP 1: Setup Hugging Face Account (one time)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Go to: https://huggingface.co/join"
echo "2️⃣  Create account"
echo "3️⃣  Go to: https://huggingface.co/settings/tokens"
echo "4️⃣  Create new token (Read access is enough)"
echo "5️⃣  Copy the token"
echo ""
echo "6️⃣  Set environment variable:"
echo "    export HF_API_TOKEN='hf_your_actual_token_here'"
echo ""
echo ""

echo "STEP 2: Generate Illustrations "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option A: Using Node.js + Inference API (Fastest)"
echo "───────────────────────────────────────────────"
echo ""
echo "  cd /path/to/tidsflyt"
echo "  node scripts/generate-with-huggingface.mjs"
echo ""
echo "⏱️  Time: ~2-5 minutes for 3 images"
echo "✓ Works on all systems"
echo "✓ No GPU required"
echo "✓ Easiest setup"
echo ""
echo ""

echo "Option B: Using Python + Diffusers (Best Quality)"
echo "─────────────────────────────────────────────────"
echo ""
echo "  # Install once:"
echo "  pip install diffusers transformers torch pillow"
echo ""
echo "  # Generate:"
echo "  python scripts/generate-with-huggingface.py"
echo ""
echo "⏱️  Time: ~2-5 min (GPU) or 10-15 min (CPU)"
echo "✓ No API calls needed"
echo "✓ Private - images stay local"
echo "✓ Higher quality"
echo "⚠ Requires ~8GB VRAM (for GPU)"
echo ""
echo ""

echo "Option C: Using Curl (Minimal Setup)"
echo "────────────────────────────────────"
echo ""
echo "  curl -X POST \\"
echo "    -H \"Authorization: Bearer \$HF_API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{ \"inputs\": \"Professional person starting their day with Tidum app...\" }' \\"
echo "    https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3-medium \\"
echo "    > morning-routine.png"
echo ""
echo ""

echo "STEP 3: What Gets Generated"
echo "───────────────────────────"
echo ""
echo "  ✓ client/public/illustrations/morning-routine.png"
echo "  ✓ client/public/illustrations/data-analytics.png"
echo "  ✓ client/public/illustrations/collaboration.png"
echo ""
echo ""

echo "STEP 4: Create Videos (Optional but Recommended)"
echo "──────────────────────────────────────────────"
echo ""
echo "Option A: Runway ML (Easiest + Best)"
echo "1. Go to: https://runwayml.com"
echo "2. Sign up"
echo "3. Create project"
echo "4. Upload illustrations"
echo "5. Use Gen-2 model to create videos"
echo "6. Export as MP4"
echo ""
echo "Option B: FFmpeg (DIY, Quickest)"
echo "ffmpeg -framerate 1/3 -i client/public/illustrations/morning-routine.png \\"
echo "  -c:v libx264 -pix_fmt yuv420p \\"
echo "  client/public/videos/time-tracking-tutorial.mp4"
echo ""
echo ""

echo "STEP 5: Verify & Build"
echo "─────────────────────"
echo ""
echo "  # Check assets are in place"
echo "  node scripts/integrate-assets.mjs"
echo ""
echo "  # Build project"
echo "  npm run build"
echo ""
echo "  # View at:"
echo "  http://localhost:5000/guide"
echo ""
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 COMPARISON TABLE"
echo ""

cat << 'EOF'
╔════════════════════╦═══════════╦═══════════╦════════════╗
║ Method             ║ Speed     ║ Setup     ║ Requires   ║
╠════════════════════╬═══════════╬═══════════╬════════════╣
║ Node.js API        ║ ⭐⭐⭐⭐   ║ ⭐⭐⭐⭐⭐ ║ Token      ║
║ Python GPU         ║ ⭐⭐⭐⭐⭐ ║ ⭐⭐      ║ NVIDIA GPU ║
║ Python CPU         ║ ⭐⭐      ║ ⭐⭐      ║ Just CPU   ║
║ Curl               ║ ⭐⭐⭐⭐   ║ ⭐⭐⭐⭐   ║ Token      ║
║ Runway ML (Video)  ║ ⭐⭐⭐    ║ ⭐⭐      ║ Credit $   ║
╚════════════════════╩═══════════╩═══════════╩════════════╝
EOF

echo ""
echo ""

echo "🎨 GENERATION QUALITY"
echo ""

cat << 'EOF'
╔═════════════════════════╦═════════════════╗
║ Model                   ║ Quality Rating  ║
╠═════════════════════════╬═════════════════╣
║ Stable Diffusion 3      ║ ⭐⭐⭐⭐⭐      ║ BEST
║ Stable Diffusion XL     ║ ⭐⭐⭐⭐        ║ Very Good
║ Stable Diffusion 1.5    ║ ⭐⭐⭐          ║ Good
║ OpenJourney             ║ ⭐⭐⭐⭐        ║ Very Good
╚═════════════════════════╩═════════════════╝
EOF

echo ""
echo ""

echo "💡 RECOMMENDATIONS"
echo ""
echo "✓ Best Overall: Use Python + Diffusers with GPU"
echo "              Fast, free, private, highest quality"
echo ""
echo "✓ Easiest: Use Node.js + Inference API"
echo "          No setup, just export token and run"
echo ""
echo "✓ Budget: Use CPU Python"
echo "         Free, but takes 10-15 minutes per image"
echo ""
echo ""

echo "🔗 LINKS"
echo ""
echo "📖 Hugging Face: https://huggingface.co"
echo "📚 Diffusers Docs: https://huggingface.co/docs/diffusers"
echo "🎬 Runway ML: https://runwayml.com"
echo "💬 Community: https://huggingface.co/discuss"
echo ""
echo ""

echo "✅ NEXT STEPS"
echo ""
echo "1. Export token:"
echo "   export HF_API_TOKEN='your-token'"
echo ""
echo "2. Choose method and run generator"
echo ""
echo "3. Create videos with Runway ML (optional)"
echo ""
echo "4. Verify integration:"
echo "   node scripts/integrate-assets.mjs"
echo ""
echo "5. View at http://localhost:5000/guide"
echo ""
