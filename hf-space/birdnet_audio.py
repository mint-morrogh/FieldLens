"""Bird call identification with BirdNET v2.4, run in-process on the Space's CPU.

The TFLite models are loaded directly (one interpreter each): the `birdnet` package's own
pipeline starts worker processes per call, which re-import app.py (and BioCLIP) every time.

Models: BirdNET v2.4 (K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of
Ornithology & Chemnitz University of Technology), CC BY-NC-SA 4.0, downloaded once from
https://zenodo.org/records/15050749. Labels are "Scientific name_Common Name" (eBird/Clements).

The app decodes recordings on the phone and sends mono 16-bit WAV at 48 kHz, so no audio
decoding library is needed here.
"""

from __future__ import annotations

import datetime as dt
import os
import threading
from pathlib import Path

import numpy as np

try:  # Linux / Apple silicon: the small LiteRT runtime.
    from ai_edge_litert.interpreter import Interpreter
except ImportError:  # Intel macOS dev machines: full TensorFlow.
    from tensorflow.lite.python.interpreter import Interpreter  # type: ignore

SR = 48_000
SEG = 3 * SR  # BirdNET reads 3 s windows...
HOP = int(1.5 * SR)  # ...overlapping by 1.5 s.
MAX_SECONDS = 30
MIN_SECONDS = 1.0
# BirdNET-Analyzer's default location-filter threshold. On 40 real recordings it took
# top-1 from 33/40 to 36/40.
GEO_THRESHOLD = 0.03

MODEL_URL = "https://zenodo.org/records/15050749/files/BirdNET_v2.4_tflite.zip"
MODEL_DIR = Path(os.environ.get("BIRDNET_MODEL_DIR", Path(__file__).parent / "birdnet-v2.4"))
ACOUSTIC_PATH = MODEL_DIR / "audio-model.tflite"
GEO_PATH = MODEL_DIR / "meta-model.tflite"
LABELS_PATH = MODEL_DIR / "labels/en_us.txt"


def _ensure_models() -> None:
    if ACOUSTIC_PATH.exists() and GEO_PATH.exists() and LABELS_PATH.exists():
        return
    import urllib.request
    import zipfile

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = MODEL_DIR / "model.zip"
    urllib.request.urlretrieve(MODEL_URL, tmp)
    with zipfile.ZipFile(tmp) as z:
        z.extractall(
            MODEL_DIR,
            [n for n in z.namelist() if n.endswith(".tflite") or n == "labels/en_us.txt"],
        )
    tmp.unlink()


_ensure_models()

LABELS = [l.rstrip("\n") for l in open(LABELS_PATH, encoding="utf-8") if l.strip()]
SCI = [l.split("_", 1)[0] for l in LABELS]
COMMON = [l.split("_", 1)[1] if "_" in l else l for l in LABELS]
# Sound classes that aren't species ("Dog_Dog", "Human vocal_Human vocal", "Engine_Engine"…).
NOT_SPECIES = np.array([s == c for s, c in zip(SCI, COMMON)])

_lock = threading.Lock()  # TFLite interpreters aren't thread-safe.
_acoustic = Interpreter(model_path=str(ACOUSTIC_PATH), num_threads=2)
_acoustic.allocate_tensors()
_A_IN = _acoustic.get_input_details()[0]["index"]
_A_OUT = _acoustic.get_output_details()[0]["index"]
_geo = Interpreter(model_path=str(GEO_PATH))
_geo.allocate_tensors()
_G_IN = _geo.get_input_details()[0]["index"]
_G_OUT = _geo.get_output_details()[0]["index"]


def week_of(date: dt.date) -> int:
    """BirdNET's 48-week year: four "weeks" per month (days 1-7, 8-14, 15-21, 22-end)."""
    return (date.month - 1) * 4 + min(4, (date.day - 1) // 7 + 1)


def read_wav(data: bytes) -> np.ndarray:
    """Mono 16-bit PCM WAV at 48 kHz -> float32 samples in [-1, 1]."""
    if len(data) < 44 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("Not a WAV file.")
    pos, fmt = 12, None
    while pos + 8 <= len(data):
        chunk, size = data[pos : pos + 4], int.from_bytes(data[pos + 4 : pos + 8], "little")
        body = data[pos + 8 : pos + 8 + size]
        if chunk == b"fmt ":
            fmt = (
                int.from_bytes(body[0:2], "little"),
                int.from_bytes(body[2:4], "little"),
                int.from_bytes(body[4:8], "little"),
                int.from_bytes(body[14:16], "little"),
            )
        elif chunk == b"data":
            if fmt != (1, 1, SR, 16):
                raise ValueError("Expected mono 16-bit PCM at 48 kHz.")
            samples = np.frombuffer(body[: len(body) // 2 * 2], dtype="<i2")
            return (samples[: MAX_SECONDS * SR].astype(np.float32)) / 32768.0
        pos += 8 + size + (size & 1)
    raise ValueError("No audio data.")


def _segments(x: np.ndarray) -> np.ndarray:
    segs = []
    for s in range(0, max(1, len(x) - SEG + HOP), HOP):
        seg = x[s : s + SEG]
        if len(seg) < MIN_SECONDS * SR and segs:
            break
        segs.append(np.pad(seg, (0, SEG - len(seg))))
    return np.stack(segs).astype(np.float32)


def _acoustic_scores(segs: np.ndarray) -> np.ndarray:
    with _lock:
        _acoustic.resize_tensor_input(_A_IN, list(segs.shape))
        _acoustic.allocate_tensors()
        _acoustic.set_tensor(_A_IN, segs)
        _acoustic.invoke()
        logits = _acoustic.get_tensor(_A_OUT).copy()
    return 1.0 / (1.0 + np.exp(-np.clip(logits, -20, 20)))


def _geo_scores(lat: float, lon: float, week: int | None) -> np.ndarray:
    w = float(week) if week and 1 <= week <= 48 else -1.0
    with _lock:
        _geo.set_tensor(_G_IN, np.array([[lat, lon, w]], dtype=np.float32))
        _geo.invoke()
        return _geo.get_tensor(_G_OUT)[0].copy()


def identify_audio(
    wav: bytes,
    lat: float | None = None,
    lon: float | None = None,
    week: int | None = None,
    k: int = 5,
    min_score: float = 0.1,
) -> dict:
    """Species heard in a short recording.

    Each 3 s window is scored independently (sigmoid, so several birds can score high at once).
    Results are ranked by the mean over windows, which favours the bird singing throughout over a
    one-off call (35/40 vs 33/40 top-1 in testing); `score` is the best single window. With a
    location, species BirdNET's location model doesn't expect there that week are dropped.
    `sound` names a non-species class (e.g. "Human vocal") when it outscores every bird.
    """
    x = read_wav(wav)
    if len(x) < MIN_SECONDS * SR:
        raise ValueError("Recording too short.")
    probs = _acoustic_scores(_segments(x))
    best = probs.max(axis=0)
    mean = probs.mean(axis=0)
    hits = (probs >= min_score).sum(axis=0)
    other = int(np.argmax(np.where(NOT_SPECIES, mean, -1)))
    other_best, other_mean = float(best[other]), float(mean[other])
    keep = ~NOT_SPECIES
    if lat is not None and lon is not None:
        keep &= _geo_scores(lat, lon, week) >= GEO_THRESHOLD
    best, mean = np.where(keep, best, 0.0), np.where(keep, mean, 0.0)
    order = [i for i in np.argsort(-mean) if best[i] >= min_score][:k]
    sound = (
        COMMON[other]
        if other_best >= 0.5 and (not order or other_mean > mean[order[0]])
        else None
    )
    return {
        "results": [
            {
                "name": SCI[i],
                "common": COMMON[i],
                "score": round(float(best[i]), 4),
                "mean": round(float(mean[i]), 4),
                "segments": int(hits[i]),
                "of": int(probs.shape[0]),
            }
            for i in order
        ],
        "sound": sound,
        "seconds": round(len(x) / SR, 1),
    }
