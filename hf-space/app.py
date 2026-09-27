"""FieldLens BioCLIP service: species ranking with optional candidate restriction.

Runs on a ZeroGPU Space (GPU attached per call) and falls back to CPU elsewhere,
so the same file can be tested locally.
"""

from __future__ import annotations

import base64
import io
import os
import time
from collections import defaultdict

import gradio as gr
import torch
from PIL import Image

try:  # Available on Hugging Face Spaces.
    import spaces

    ON_ZEROGPU = True
except ImportError:  # Local testing.
    ON_ZEROGPU = False

if not os.environ.get("FIELDLENS_COMPILE"):
    # pybioclip wraps the model in torch.compile; for one-photo requests the compile
    # time (tens of seconds on first call) outweighs any speedup, so skip it.
    torch.compile = lambda model, *args, **kwargs: model  # type: ignore[assignment]

from bioclip import TreeOfLifeClassifier  # noqa: E402

MODEL = "hf-hub:imageomics/bioclip-2"
RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"]
MAX_IMAGES = 5
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_K = 20

started = time.time()
DEVICE = "cuda" if (ON_ZEROGPU or torch.cuda.is_available()) else "cpu"
clf = TreeOfLifeClassifier(model_str=MODEL, device=DEVICE)
clf.model.eval()
labels = clf.get_label_data().fillna("")
EMB = clf.txt_embeddings  # (dim, n_taxa), already on DEVICE
LOGIT_SCALE = float(clf.model.logit_scale.exp())

# Name -> column indices, for fast per-request restriction without mutating shared state.
by_species: dict[str, list[int]] = defaultdict(list)
by_genus: dict[str, list[int]] = defaultdict(list)
for i, (sp, genus) in enumerate(zip(labels["species"], labels["genus"])):
    if sp:
        by_species[sp.lower()].append(i)
    if genus:
        by_genus[genus.lower()].append(i)

print(f"BioCLIP ready on {DEVICE}: {EMB.shape[1]} taxa in {time.time() - started:.0f}s", flush=True)


def _decode(images: list[str]) -> list[Image.Image]:
    if not isinstance(images, list) or not images:
        raise gr.Error("Send at least one image.")
    if len(images) > MAX_IMAGES:
        raise gr.Error(f"At most {MAX_IMAGES} images.")
    out = []
    for b64 in images:
        if not isinstance(b64, str):
            raise gr.Error("Images must be base64 strings.")
        raw = base64.b64decode(b64.split(",", 1)[-1], validate=False)
        if len(raw) > MAX_IMAGE_BYTES:
            raise gr.Error("Image too large.")
        img = Image.open(io.BytesIO(raw))
        img.load()
        out.append(img.convert("RGB"))
    return out


def _candidate_indices(taxa: list[str]) -> tuple[list[int], list[str]]:
    idx: set[int] = set()
    unmatched: list[str] = []
    for name in taxa[:5000]:
        key = str(name).strip().lower()
        if not key:
            continue
        hits = by_species.get(key) or (by_genus.get(key) if " " not in key else None)
        if hits:
            idx.update(hits)
        else:
            unmatched.append(str(name))
    return sorted(idx), unmatched


def _within_indices(within: dict) -> set[int] | None:
    """Columns whose taxonomy matches e.g. {"class": ["Insecta", "Arachnida"]}."""
    if not within:
        return None
    if not isinstance(within, dict):
        raise gr.Error("within must be an object like {\"class\": [\"Insecta\"]}.")
    mask = None
    for rank, values in within.items():
        if rank not in RANKS or not isinstance(values, list):
            raise gr.Error(f"Unsupported within rank: {rank}")
        wanted = {str(v).strip().lower() for v in values if str(v).strip()}
        m = labels[rank].str.lower().isin(wanted)
        mask = m if mask is None else (mask & m)
    return set(labels.index[mask].tolist()) if mask is not None else None


def _run(payload: dict) -> dict:
    images = _decode(payload.get("images", []))
    rank = str(payload.get("rank") or "species").lower()
    if rank not in RANKS:
        raise gr.Error(f"rank must be one of {', '.join(RANKS)}")
    k = max(1, min(MAX_K, int(payload.get("k") or 5)))
    taxa = payload.get("taxa") or []
    if not isinstance(taxa, list):
        raise gr.Error("taxa must be a list of names.")

    # Softer (<1) or sharper (>1) probabilities; BioCLIP's raw scores are overconfident.
    temperature = float(payload.get("temperature") or 1.0)
    temperature = max(0.05, min(2.0, temperature))

    columns, unmatched = _candidate_indices(taxa) if taxa else ([], [])
    within = _within_indices(payload.get("within") or {})
    if within is not None:
        columns = sorted(within.intersection(columns)) if columns else sorted(within)
        if not columns:
            raise gr.Error("No taxa match the requested filters.")
    restricted = bool(columns)

    with torch.no_grad():
        feats = torch.stack([clf.create_image_features_for_image(img, normalize=True) for img in images])
        # Several photos of one organism: average their embeddings.
        feat = feats.mean(dim=0)
        feat = (feat / feat.norm()).to(EMB.dtype).to(EMB.device)
        group_probability = None
        if within is not None and not taxa:
            # Softmax over every taxon, then keep the requested group: the group's share of the
            # total ("how much does this look like an insect at all?") flags off-target photos.
            full = torch.softmax(temperature * LOGIT_SCALE * (feat @ EMB), dim=0).float().cpu()
            sub = full[columns]
            group_probability = float(sub.sum())
            probs = sub / max(group_probability, 1e-12)
        else:
            emb = EMB[:, columns] if restricted else EMB
            probs = torch.softmax(temperature * LOGIT_SCALE * (feat @ emb), dim=0).float().cpu()

    col_ids = columns if restricted else list(range(EMB.shape[1]))
    if rank == "species":
        top = torch.topk(probs, k=min(k, probs.numel()))
        results = [
            _format(labels.iloc[col_ids[j]].to_dict(), labels.iloc[col_ids[j]]["species"], p)
            for p, j in zip(top.values.tolist(), top.indices.tolist())
        ]
    else:
        # Sum probabilities by the requested rank (e.g. class for "Auto" category detection).
        frame = labels.iloc[col_ids][RANKS[: RANKS.index(rank) + 1]].copy()
        frame["p"] = probs.numpy()
        frame = frame[frame[rank] != ""]
        grouped = frame.groupby(rank, sort=False).agg({"p": "sum", **{r: "first" for r in RANKS[: RANKS.index(rank)]}})
        best = grouped.sort_values("p", ascending=False).head(k)
        results = [_format({**row, rank: name}, name, row["p"], upto=rank) for name, row in best.iterrows()]

    return {
        "results": results,
        "rank": rank,
        "restricted": restricted,
        "candidateCount": len(columns) if restricted else int(EMB.shape[1]),
        "unmatched": unmatched[:50],
        "groupProbability": None if group_probability is None else round(group_probability, 6),
    }


def _format(row: dict, name: str, score: float, upto: str = "species") -> dict:
    out = {"name": name, "score": round(float(score), 6)}
    for r in RANKS[: RANKS.index(upto) + 1]:
        out[r] = row.get(r, "")
    if upto == "species":
        out["commonName"] = row.get("common_name", "")
    return out


if ON_ZEROGPU:
    _run = spaces.GPU(duration=30)(_run)


def identify(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise gr.Error("Send a JSON object.")
    return _run(payload)


with gr.Blocks(title="FieldLens BioCLIP") as demo:
    gr.Markdown("## FieldLens BioCLIP service\nJSON API for the FieldLens app. See the README for the payload format.")
    inp = gr.JSON(label="Payload", value={"images": [], "taxa": [], "rank": "species", "k": 5})
    out = gr.JSON(label="Result")
    gr.Button("Run").click(identify, inputs=inp, outputs=out, api_name="identify")

demo.queue(default_concurrency_limit=2, max_size=20)

if __name__ == "__main__":
    demo.launch()
