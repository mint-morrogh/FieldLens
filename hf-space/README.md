---
title: FieldLens BioCLIP
emoji: 🌿
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 5.33.0
app_file: app.py
pinned: false
license: mit
short_description: Species identification API for FieldLens (BioCLIP 2)
---

# FieldLens BioCLIP service

A small API around [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2) (MIT) for the
[FieldLens](https://github.com/mint-morrogh/FieldLens) app. It ranks species for one or more photos
of the same organism, optionally restricted to a list of candidate species or genera (e.g. species
recorded near the user), and can also classify at a higher rank (class, kingdom…) for automatic
category detection.

Source of truth: `hf-space/` in the FieldLens repository. Deploy with `npm run space:deploy`.

## API

`POST /gradio_api/call/identify` with `{"data": [payload]}`, where `payload` is:

```json
{
  "images": ["<base64 JPEG>", "..."],
  "taxa": ["Danaus plexippus", "Limenitis", "..."],
  "rank": "species",
  "k": 5
}
```

- `taxa` (optional): species ("Genus species") and/or genera ("Genus"); unknown names are ignored.
- `rank`: `species` (default) or `genus`, `family`, `order`, `class`, `phylum`, `kingdom`.
- `within` (optional): restrict to higher taxa, e.g. `{"class": ["Insecta", "Arachnida"]}`.
- `temperature` (optional, default 1): multiplies the logits; values below 1 soften BioCLIP's
  overconfident probabilities.

- `sign` (optional): `"track"` or `"scat"` with `candidates: [{"name": "Vulpes vulpes", "common": "Red fox"}, …]`
  (up to 400) ranks those species for a photo of tracks or droppings, using prompts such as "a photo of
  footprints of Red fox (Vulpes vulpes)" blended with the taxonomic match.

Returns `{ "results": [{ "name", "commonName", "kingdom", "phylum", "class", "order", "family",
"genus", "species", "score" }], "rank", "restricted", "candidateCount", "unmatched",
"groupProbability" }`. `groupProbability` (only with `within` and no `taxa`) is the share of the
model's belief that falls inside the `within` group — low values mean the photo probably doesn't
show that kind of organism.

Every response also includes `person` (0–1): how much a small general CLIP model
(MobileCLIP-S1) believes the photo shows a person. BioCLIP itself doesn't recognise people.

Scores are softmax probabilities over the candidate set; they are overconfident and are tempered
by the FieldLens server before display.
