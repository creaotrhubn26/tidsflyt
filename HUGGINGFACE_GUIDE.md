# 🤗 Hugging Face AI Generation Guide

Complete guide to generating illustrations and videos using Hugging Face models for the Tidum interactive guide.

## Overview

Hugging Face offers multiple ways to generate AI imagery:

1. **Inference API** - Free, easy, no setup (fastest to start)
2. **Inference Endpoints** - Dedicated, paid, more control
3. **Diffusers Library** - Local GPU/CPU, free, best for privacy

---

## Option 1: Hugging Face Inference API (Easiest ⭐)

### Setup (2 minutes)

```bash
# 1. Sign up
# → https://huggingface.co/join

# 2. Create API token
# → https://huggingface.co/settings/tokens
# → Create "Read" access token
# → Copy token

# 3. Export environment variable
export HF_API_TOKEN="hf_your_actual_token_here"

# 4. Run generator
cd /path/to/tidsflyt
node scripts/generate-with-huggingface.mjs
```

### Available Models

**Stable Diffusion 3 Medium (BEST)**
```
stabilityai/stable-diffusion-3-medium
```
- Latest, highest quality
- Fast inference (10-15 seconds)
- Free tier available
- Requires ~6GB VRAM

**Stable Diffusion XL (Alternative)**
```
stabilityai/stable-diffusion-xl
```
- Older, but still very good
- Faster than SD3 (8-12 seconds)
- Lower quality than SD3
- More memory efficient

**FLUX Pro (Premium)** 
```
black-forest-labs/FLUX.1-pro
```
- Highest quality images
- Slower (20-30 seconds)
- Paid API only
- Best for professional use

### Example Usage

```bash
# Using Node.js script
node scripts/generate-with-huggingface.mjs

# Using Python script
python scripts/generate-with-huggingface.py

# Or manually with curl
curl https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3-medium \
  -X POST \
  -H "Authorization: Bearer $HF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": "Professional person starting their day with Tidum app..."
  }' > morning-routine.png
```

### Pricing

- **Free Tier**: Limited requests per day
- **Pro**: $9/month - unlimited community model access
- **Enterprise**: Custom pricing

---

## Option 2: Hugging Face Diffusers (Local Generation)

### Best For
- Privacy (no data sent to servers)
- Unlimited generation
- Customization
- Using GPU locally

### Installation

```bash
# Install dependencies
pip install diffusers transformers torch pillow

# Optional: CUDA support (for NVIDIA GPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Optional: ONNX for faster inference
pip install onnx onnxruntime
```

### Run Generator

```bash
# With GPU (recommended)
python scripts/generate-with-huggingface.py

# Without GPU (slower but works)
python scripts/generate-with-huggingface.py

# With specific model
HF_MODEL="runwayml/stable-diffusion-v1-5" python scripts/generate-with-huggingface.py
```

### Performance

| Device      | Model                    | Time/Image | Quality |
|-------------|--------------------------|-----------|---------|
| NVIDIA GPU  | Stable Diffusion 3       | 15-20s    | ⭐⭐⭐⭐⭐ |
| NVIDIA GPU  | Stable Diffusion XL      | 10-15s    | ⭐⭐⭐⭐  |
| AMD GPU     | Stable Diffusion 1.5     | 30-60s    | ⭐⭐⭐   |
| CPU Only    | Stable Diffusion 1.5     | 2-5min    | ⭐⭐⭐   |
| Apple M1    | Stable Diffusion 1.5     | 30-90s    | ⭐⭐⭐   |

### Recommended Settings

```python
# For NVIDIA GPU (best quality)
pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/stable-diffusion-3-medium",
    torch_dtype=torch.float16,  # Mixed precision
    use_safetensors=True,
).to("cuda")

image = pipe(
    prompt=prompt,
    negative_prompt=negative_prompt,
    num_inference_steps=30,  # More steps = better quality but slower
    guidance_scale=7.5,       # Higher = follows prompt better
    height=512,
    width=512,
).images[0]

# For CPU (faster)
pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float32,
    safety_checker=None,       # Disable for speed
)

image = pipe(
    prompt=prompt,
    num_inference_steps=15,    # Low steps for speed
    guidance_scale=7.0,
).images[0]
```

---

## Option 3: Hugging Face Inference Endpoints

### Best For
- Production use
- Guaranteed uptime
- Higher throughput
- Custom models

### Setup

1. Go to: https://huggingface.co/inference-endpoints
2. Create new endpoint
3. Select model (e.g., `stabilityai/stable-diffusion-3-medium`)
4. Choose hardware (starts at $0.06/hour GPU time)
5. Copy endpoint URL
6. Get API token

### Usage

```bash
curl -X POST \
  -H "Authorization: Bearer $HF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":"Your prompt here"}' \
  https://your-endpoint-name.endpoints.huggingface.cloud
```

---

## Video Generation with Hugging Face

### Option A: Text-to-Video Models

**Model**: `damo-vilab/text-to-video-ms-1.7b`

```python
from diffusers import DDPMScheduler, TextToVideoSDPipeline

pipe = TextToVideoSDPipeline.from_pretrained(
    "damo-vilab/text-to-video-ms-1.7b",
    torch_dtype=torch.float16,
).to("cuda")

prompt = "Smooth camera pan showing time-tracking interface, professional, clean design"
video_frames = pipe(prompt).frames
```

### Option B: Image-to-Video (Better Quality)

Use Hugging Face + Runway ML:

1. Generate image with Hugging Face diffusers
2. Upload to Runway ML
3. Use Gen-2 to convert to video

```bash
# Generate image
python scripts/generate-with-huggingface.py

# Then create video with Runway ML API
# See: https://docs.runwayml.com/api/gen2
```

---

## Complete Workflow

### Step 1: Generate Illustrations

```bash
# Setup (one time)
export HF_API_TOKEN="your-token-here"

# Generate images
python scripts/generate-with-huggingface.py

# Or using API
node scripts/generate-with-huggingface.mjs
```

### Step 2: Create Videos

```bash
# Option A: Simple video from images
ffmpeg -framerate 1/3 -i client/public/illustrations/morning-routine.png \
  -c:v libx264 -pix_fmt yuv420p client/public/videos/routine.mp4

# Option B: Animated with Runway ML
# (See Runway documentation)

# Option C: Text-to-video with HF
python scripts/generate-video-with-huggingface.py
```

### Step 3: Integrate

```bash
# Verify everything is in place
node scripts/integrate-assets.mjs

# Build project
npm run build

# View at http://localhost:5000/guide
```

---

## Prompt Engineering Tips

### Good Prompts
- Specific and detailed
- Include style guidance
- Mention colors/aesthetics
- Reference quality

Example:
```
Professional person starting their day with Tidum app on desk, 
coffee cup, laptop screen showing time tracking interface, 
morning sunlight through window, modern flat design illustration style, 
teal (#1F6B73) and green (#4E9A6F) colors, productivity theme, 
clean and minimalist, professional workspace, high quality, 4K
```

### Bad Prompts
- Too vague
- Too long (over 200 words)
- Contradictory descriptions
- Unrealistic requests

### Color Guidance

For Tidum branding:
- **Primary teal**: #1F6B73
- **Secondary green**: #4E9A6F
- **Accent color**: #3A8B73
- **Light background**: #E6F2EE

Add to prompts: `"teal and green color scheme"` or `"inspired by teal #1F6B73 and green #4E9A6F"`

---

## Troubleshooting

### "API Rate Limit Exceeded"
- **Cause**: Too many requests
- **Fix**: Add delays between generations or use paid tier

### "Out of Memory" (GPU)
- **Cause**: Model too large for GPU VRAM
- **Fix**: Use smaller model or enable attention slicing

```python
pipe.enable_attention_slicing()
```

### "Slow inference on CPU"
- **Cause**: CPU processing is naturally slow
- **Fix**: Use GPU, reduce num_inference_steps, or use smaller model

### "Images look low quality"
- **Cause**: Prompt unclear or num_inference_steps too low
- **Fix**: Improve prompt, increase steps to 35-50, increase guidance_scale to 8-10

---

## File Locations

After generation:

```
✓ client/public/
  ├── screenshots/          (✓ Already created)
  │   └── *.webp
  │
  ├── illustrations/        (Generated here)
  │   ├── morning-routine.png
  │   ├── data-analytics.png
  │   └── collaboration.png
  │
  └── videos/              (Create with Runway/FFmpeg)
      ├── *.mp4
      └── *.webm
```

---

## Resources

- 📚 Hugging Face: https://huggingface.co
- 📖 Diffusers Doc: https://huggingface.co/docs/diffusers
- 🎨 Model Hub: https://huggingface.co/models?pipeline_tag=text-to-image
- 🎬 Video Models: https://huggingface.co/models?pipeline_tag=text-to-video
- 📝 Community: https://huggingface.co/discuss

---

## Quick Commands Reference

```bash
# Setup API
export HF_API_TOKEN="hf_..."

# Generate with Node.js
node scripts/generate-with-huggingface.mjs

# Generate with Python (GPU)
python scripts/generate-with-huggingface.py

# Generate with Python (CPU)
CPU_ONLY=1 python scripts/generate-with-huggingface.py

# Verify integration
node scripts/integrate-assets.mjs

# Build project
npm run build

# View guide
# http://localhost:5000/guide
```

---

## Support

If stuck:
1. Check Hugging Face docs: https://huggingface.co/docs
2. See AI_GENERATION_GUIDE.md for other services
3. Check script comments for troubleshooting
4. Ask community: https://huggingface.co/discuss
