"""The photo reader for Healthy Me, on Modal.

An open-source vision model (Qwen3-VL 8B, Apache 2.0) run by llama.cpp's
server on one L4 GPU. It sleeps after two minutes idle and wakes when a photo
arrives, so it only costs while reading. The app calls the OpenAI-style
endpoint /v1/chat/completions with the photo and a JSON schema. Every request
needs the key in the Modal secret "vision-server" (LLAMA_API_KEY), which
llama-server reads from the environment.

Deploy:  .venv/bin/modal run server.py::download   (once, copies the model in)
         .venv/bin/modal deploy server.py
"""
import subprocess

import modal

# llama.cpp build 11669, the same build the models were tested with on the Mac.
IMAGE = modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server-cuda-b11669", add_python="3.12").entrypoint([])

MODEL_REPO = "Qwen/Qwen3-VL-8B-Instruct-GGUF"
MODEL = "Qwen3VL-8B-Instruct-Q4_K_M.gguf"
MMPROJ = "mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf"

app = modal.App("vision-server")
models = modal.Volume.from_name("healthyme-models", create_if_missing=True)
fetch_image = modal.Image.debian_slim().pip_install("huggingface_hub==0.36.0")


@app.function(image=fetch_image, volumes={"/models": models}, timeout=1800)
def download():
    """Copies the model files into the volume, so a cold start only has to load them."""
    from huggingface_hub import hf_hub_download

    for f in (MODEL, MMPROJ):
        hf_hub_download(MODEL_REPO, f, local_dir="/models")
    models.commit()


@app.function(
    image=IMAGE,
    # L4 first; when Modal has none free (28 Oct 2026 photos queued for 10+ minutes),
    # take an A10G or a T4 instead. All three hold the 8B model and cost about the same.
    gpu=["L4", "A10G", "T4"],
    volumes={"/models": models},
    secrets=[modal.Secret.from_name("vision-server")],
    scaledown_window=120,   # sleep after 2 minutes with no photos
    max_containers=1,       # never more than one GPU at a time
    timeout=600,
)
@modal.concurrent(max_inputs=4)
@modal.web_server(port=8080, startup_timeout=300)
def serve():
    subprocess.Popen([
        "/app/llama-server",
        "-m", f"/models/{MODEL}", "--mmproj", f"/models/{MMPROJ}",
        "-ngl", "99", "-c", "8192", "--host", "0.0.0.0", "--port", "8080",
    ])
