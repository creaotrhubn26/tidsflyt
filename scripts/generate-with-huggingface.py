#!/usr/bin/env python3
"""
Hugging Face AI Image Generator (Python Version)
Generates illustrations using Hugging Face diffusers library

Installation:
    pip install diffusers transformers torch pillow

Setup:
    export HF_API_TOKEN="your-token"
    python scripts/generate-with-huggingface.py
"""

import os
import sys
from pathlib import Path

# Try to import required libraries
try:
    from diffusers import StableDiffusionPipeline, AutoPipelineForText2Image
    from PIL import Image
    import torch
except ImportError:
    print("❌ Missing dependencies!")
    print("")
    print("Install with:")
    print("  pip install diffusers transformers torch pillow")
    sys.exit(1)

# Configuration
HF_API_TOKEN = os.getenv("HF_API_TOKEN")
OUTPUT_DIR = Path(__file__).parent.parent / "client" / "public" / "illustrations"

ILLUSTRATIONS = [
    {
        "name": "morning-routine",
        "prompt": "Professional person starting their day with Tidum app on desk, coffee cup, laptop screen showing time tracking interface, morning sunlight through window, modern flat design illustration style, teal and green colors, productivity theme, clean and minimalist, professional workspace",
        "negative_prompt": "blurry, low quality, watermark, text, distorted, deformed",
    },
    {
        "name": "data-analytics",
        "prompt": "Abstract visualization of data flowing and transforming into productivity insights, animated charts and graphs coming to life, bar charts growing upward, line graphs with positive trends, colorful data visualization, modern infographic style, teal and green gradient colors, digital art, clean design, business analytics theme",
        "negative_prompt": "blurry, low quality, watermark, text, distorted, deformed",
    },
    {
        "name": "collaboration",
        "prompt": "Diverse team of professionals collaborating around a table, sharing documents and knowledge, positive energy, smiling faces, modern office environment, teamwork and communication theme, warm lighting, professional illustration, diverse representation, inclusive workplace, teal and green accents, productive collaboration scene",
        "negative_prompt": "blurry, low quality, watermark, text, distorted, deformed",
    },
]


def check_gpu():
    """Check if GPU is available"""
    if torch.cuda.is_available():
        print(f"✓ GPU available: {torch.cuda.get_device_name(0)}")
        return True
    else:
        print("⚠️  No GPU detected - using CPU (slower)")
        return False


def generate_image(illustration):
    """Generate image using Stable Diffusion"""
    print(f"\n🎨 Generating: {illustration['name']}")
    print(f"   Prompt: {illustration['prompt'][:50]}...")

    # Determine device
    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Use smaller model for CPU, larger for GPU
    if device == "cuda":
        model_id = "stabilityai/stable-diffusion-3-medium"
    else:
        # Use smaller model for CPU
        model_id = "runwayml/stable-diffusion-v1-5"

    try:
        print(f"   Loading model: {model_id}")

        # Load pipeline
        if device == "cuda":
            pipe = AutoPipelineForText2Image.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                use_safetensors=True,
            ).to(device)
        else:
            pipe = StableDiffusionPipeline.from_pretrained(
                model_id,
                torch_dtype=torch.float32,
                safety_checker=None,  # Disable for faster CPU processing
            )
            pipe = pipe.to(device)

        # Generate image
        print("   Generating image (this may take 30-60 seconds)...")
        image = pipe(
            prompt=illustration["prompt"],
            negative_prompt=illustration["negative_prompt"],
            num_inference_steps=25 if device == "cuda" else 15,
            guidance_scale=7.5,
            height=512,
            width=512,
        ).images[0]

        # Save image
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path = OUTPUT_DIR / f"{illustration['name']}.png"
        image.save(output_path)

        file_size = output_path.stat().st_size / 1024
        print(f"   ✓ Saved: {illustration['name']}.png ({file_size:.2f}KB)")

        return output_path

    except Exception as e:
        print(f"   ✗ Failed: {str(e)}")
        raise


def main():
    print("\n🤗 Hugging Face AI Image Generator")
    print("===================================")

    if not HF_API_TOKEN:
        print("\n⚠️  HF_API_TOKEN not set")
        print("\nSetup instructions:")
        print("1. Sign up at: https://huggingface.co")
        print("2. Go to: https://huggingface.co/settings/tokens")
        print("3. Create new token (read access is enough)")
        print("4. Export: export HF_API_TOKEN='your-token'")
        print("5. Login with: huggingface-cli login")

    print("\n" + "=" * 35)

    # Check GPU availability
    print("\n📊 System Info:")
    has_gpu = check_gpu()
    print(f"   Device: {'GPU (faster)' if has_gpu else 'CPU (slower)'}")
    print(f"   Output: {OUTPUT_DIR}")

    print("\n" + "=" * 35 + "\n")

    success_count = 0

    for i, illustration in enumerate(ILLUSTRATIONS):
        try:
            generate_image(illustration)
            success_count += 1

            # Add delay between generations
            if i < len(ILLUSTRATIONS) - 1:
                print("   Waiting 5 seconds before next generation...")
                import time
                time.sleep(5)

        except Exception as e:
            print(f"✗ Failed to generate {illustration['name']}")

    print("\n" + "=" * 35)
    print(f"✅ Generated {success_count}/{len(ILLUSTRATIONS)} illustrations")
    print(f"📁 Saved to: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Create videos with Runway ML or D-ID")
    print("2. Run: node scripts/integrate-assets.mjs")
    print("")


if __name__ == "__main__":
    main()
