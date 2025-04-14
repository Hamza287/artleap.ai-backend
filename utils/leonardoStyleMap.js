const leonardoStyleMap = {
  "ANIME": {
    "preprocessorId": 67,
    "promptBoost": "anime, studio ghibli style, vivid colors, cel-shaded, 2D anime, hand-drawn style, soft lines, dramatic background",
    "influence": 1, // ↓ toned down to avoid over-processing
    "strengthType": "High"
  },
  "BOKEH": {
    "preprocessorId": 101,
    "promptBoost": "bokeh, enhanced detail, professional lighting",
    "influence": 0.5,
    "strengthType": "Mid"
  },
  "CINEMATIC": {
    "preprocessorId": 20,
    "promptBoost": "cinematic, enhanced detail, professional lighting",
    "influence": 0.55,
    "weight": 1
  },
  "CINEMATIC_CLOSEUP": {
    "preprocessorId": 133,
    "promptBoost": "cinematic closeup, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "High"
  },
  "CREATIVE": {
    "preprocessorId": 104,
    "promptBoost": "creative, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "Mid"
  },
  "DYNAMIC": {
    "preprocessorId": 105,
    "promptBoost": "dynamic, enhanced detail, professional lighting",
    "influence": 0.45,
    "strengthType": "Low"
  },
  "ENVIRONMENT": {
    "preprocessorId": 106,
    "promptBoost": "environment, enhanced detail, professional lighting",
    "influence": 0.55,
    "strengthType": "High"
  },
  "FASHION": {
    "preprocessorId": 133,
    "promptBoost": "fashion, enhanced detail, professional lighting",
    "influence": 0.55,
    "weight":1
  },
  "FILM": {
    "preprocessorId": 108,
    "promptBoost": "film, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "Low"
  },
  "FOOD": {
    "preprocessorId": 109,
    "promptBoost": "food, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "High"
  },
  "GENERAL": {
    "preprocessorId": 100,
    "promptBoost": "general, enhanced detail, professional lighting",
    "influence": 0.45,
    "strengthType": "Mid"
  },
  "HDR": {
    "preprocessorId": 133,
    "promptBoost": "hdr, enhanced detail, professional lighting",
    "influence": 0.5,
    "strengthType": "Low"
  },
  "ILLUSTRATION": {
    "preprocessorId": 102,
    "promptBoost": "illustration, enhanced detail, professional lighting",
    "influence": 0.55,
    "strengthType": "High"
  },
  "LEONARDO": {
    "preprocessorId": 103,
    "promptBoost": "leonardo, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "Mid"
  },
  "LONG_EXPOSURE": {
    "preprocessorId": 104,
    "promptBoost": "long exposure, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "Low"
  },
  "MACRO": {
    "preprocessorId": 105,
    "promptBoost": "macro, enhanced detail, professional lighting",
    "influence": 0.45,
    "strengthType": "High"
  },
  "MINIMALISTIC": {
    "preprocessorId": 106,
    "promptBoost": "minimalistic, enhanced detail, professional lighting",
    "influence": 0.5,
    "strengthType": "Mid"
  },
  "MONOCHROME": {
    "preprocessorId": 107,
    "promptBoost": "monochrome, enhanced detail, professional lighting",
    "influence": 0.55,
    "strengthType": "Low"
  },
  "MOODY": {
    "preprocessorId": 108,
    "promptBoost": "moody, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "High"
  },
  "NONE": {
    "preprocessorId": 109,
    "promptBoost": "none, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "Mid"
  },
  "NEUTRAL": {
    "preprocessorId": 100,
    "promptBoost": "neutral, enhanced detail, professional lighting",
    "influence": 0.45,
    "strengthType": "Low"
  },
  "PHOTOGRAPHY": {
    "preprocessorId": 101,
    "promptBoost": "photography, enhanced detail, professional lighting",
    "influence": 0.5,
    "strengthType": "High"
  },
  "PORTRAIT": {
    "preprocessorId": 102,
    "promptBoost": "portrait, enhanced detail, professional lighting",
    "influence": 0.55,
    "strengthType": "Mid"
  },
  "RAYTRACED": {
    "preprocessorId": 103,
    "promptBoost": "raytraced, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "Low"
  },
  "RENDER_3D": {
    "preprocessorId": 104,
    "promptBoost": "render 3d, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "High"
  },
  "RETRO": {
    "preprocessorId": 105,
    "promptBoost": "retro, enhanced detail, professional lighting",
    "influence": 0.45,
    "strengthType": "Mid"
  },
  "SKETCH_BW": {
    "preprocessorId": 106,
    "promptBoost": "sketch bw, enhanced detail, professional lighting",
    "influence": 0.5,
    "strengthType": "Low"
  },
  "STOCK_PHOTO": {
    "preprocessorId": 107,
    "promptBoost": "stock photo, enhanced detail, professional lighting",
    "influence": 0.55,
    "strengthType": "High"
  },
  "VIBRANT": {
    "preprocessorId": 108,
    "promptBoost": "vibrant, enhanced detail, professional lighting",
    "influence": 0.6,
    "strengthType": "Mid"
  },
  "UNPROCESSED": {
    "preprocessorId": 109,
    "promptBoost": "unprocessed, enhanced detail, professional lighting",
    "influence": 0.65,
    "strengthType": "Low"
  }
};

module.exports = leonardoStyleMap;