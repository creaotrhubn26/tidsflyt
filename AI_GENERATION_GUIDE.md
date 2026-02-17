# AI Generation Guide for Tidum Guide

## 1. Generate Illustrations with Google Vertex AI (Imagen)

### Setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable "Vertex AI API"
3. Create a service account and download JSON key
4. Set environment variable:
```bash
export GOOGLE_APPLICATION_CREDENTIALS=path/to/your-key.json
```

### Prompts to Generate:

**1. Morning Routine Illustration**
```
Professional person starting their day with Tidum app, coffee, productivity vibes
Detail: Person at desk with laptop showing time tracking interface, coffee cup, morning sunlight
Style: Modern, clean, professional, flat design
Colors: Teal (#1F6B73), green (#4E9A6F), warm lighting
```

**2. Data Analytics Journey**
```
Charts and graphs coming to life, showing productivity trends and insights
Detail: Abstract visualization of data flowing, bar charts, line graphs, upward trends
Style: Modern, dynamic, data visualization style
Colors: Teal and green gradient with accent colors
```

**3. Collaboration & Knowledge**
```
Team members collaborating and sharing knowledge through documentation platform
Detail: 3-4 people in a team setting, sharing documents, discussing, positive energy
Style: Inclusive, diverse, modern, professional
Colors: Tidum brand colors with warm tones
```

### Using Vertex AI Python Client:

```bash
pip install google-cloud-aiplatform
```

### Generate via Script:
```python
from google.cloud import aiplatform

def generate_image(prompt: str, output_path: str):
    aiplatform.init(project="your-project-id", location="us-central1")
    
    model = aiplatform.MultimodalGenerativeModel("imagegeneration@006")
    
    response = model.generate_content(
        [prompt],
        generation_config=aiplatform.GenerationConfig(
            max_output_tokens=2048,
        ),
    )
    
    image_data = response.candidates[0].content.parts[0].data
    with open(output_path, "wb") as f:
        f.write(image_data)
    
    print(f"✓ Saved: {output_path}")

# Generate images
generate_image("Professional person starting their day...", "client/public/illustrations/morning-routine.png")
generate_image("Charts and graphs coming to life...", "client/public/illustrations/data-analytics.png")
generate_image("Team members collaborating...", "client/public/illustrations/collaboration.png")
```

---

## 2. Create Videos with Google Cloud Video AI / Runway

### Option A: Use Runway ML (Easiest)
1. Go to [runwayml.com](https://runwayml.com)
2. Sign up and get API key
3. Use their Gen-1 or Gen-2 model to create videos from:
   - Still images generated above
   - Custom prompts for animation

### Option B: Use Google Cloud Video Intelligence
Good for analyzing video, but not generation.

### Option C: Use Synthesia or D-ID
- **Synthesia**: Create talking head videos explaining Tidum features
- **D-ID**: Animate illustrations with movement/talking

### Recommended Workflow:

**Video 1: Time Tracking Tutorial (30 seconds)**
```
Narration: "Track your time in seconds. Start, select project, add details, done."
Visuals: Animated screenshot of time-tracking flow with illustrations
Music: Upbeat, modern background music
```

**Video 2: Reports Generation (20 seconds)**
```
Narration: "Turn your time data into productivity insights. One click away."
Visuals: Data analytics illustration animating, charts appearing
Music: Inspiring, professional
```

**Video 3: Case Management Workflow (25 seconds)**
```
Narration: "Document, collaborate, and solve. Every case tells a story."
Visuals: Team members collaborating with case documents appearing
Music: Motivating, team-oriented
```

### Using Runway API:

```bash
pip install runway-python
```

```python
import requests

RUNWAY_API_KEY = "your-api-key"

def create_video(image_path: str, prompt: str, output_path: str):
    headers = {"Authorization": f"Bearer {RUNWAY_API_KEY}"}
    
    with open(image_path, "rb") as f:
        files = {"image": f}
        data = {"prompt": prompt}
        
        response = requests.post(
            "https://api.runwayml.com/v1/image_to_video",
            headers=headers,
            files=files,
            data=data
        )
    
    video_data = response.json()
    # Download and save video
    video_url = video_data["output_url"]
    print(f"✓ Video created: {video_url}")
```

---

## 3. File Structure After Generation

```
client/public/
├── screenshots/          (already captured)
│   ├── landing.webp
│   ├── time-tracking.webp
│   ├── reports-dashboard.webp
│   ├── case-management.webp
│   └── admin-panel.webp
├── illustrations/        (after Whisker generation)
│   ├── morning-routine.png
│   ├── data-analytics.png
│   └── collaboration.png
└── videos/              (after Video AI generation)
    ├── time-tracking-tutorial.mp4
    ├── reports-generation.mp4
    └── case-management-flow.mp4
```

---

## 4. Integration Script

Once you have images/videos, run this script to integrate them:

```bash
node scripts/integrate-assets.mjs
```

This will:
- Optimize images (compress WebP)
- Convert videos to multiple formats (mp4, webm)
- Update guide component with new assets
- Create fallback placeholders

---

## Quick Start (If using Replicate API - Easier):

```bash
# Install Replicate CLI
pip install replicate

# Set API token
export REPLICATE_API_TOKEN="your-token"

# Generate image
replicate run stability-ai/stable-diffusion \
  -i prompt="Professional person starting their day with Tidum app..."
```

---

## Next: Update Guide Component

Once assets are ready, update `interactive-guide.tsx` to use them:

```tsx
<img 
  src="/illustrations/morning-routine.png" 
  alt="Morning routine with Tidum"
  className="rounded-lg w-full"
/>
```

---

## Timeline:
- ⏰ Whisker images: 5-15 minutes (3 images)
- ⏰ Video generation: 5-10 minutes per video (3 videos)
- ⏰ Integration & testing: 10 minutes

**Total estimated time: 1-2 hours**

Would you like me to create the integration script and setup files?
