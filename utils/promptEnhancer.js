const styleEnhancements = {
  photo: ["professional photography", "high resolution", "realistic", "natural lighting", "detailed"],
  mockup: ["professional mockup", "clean presentation", "modern design", "template"],
  cartoon: ["vibrant colors", "animated style", "fun cartoon", "character design"],
  "3d": ["3D render", "CGI", "blender", "volumetric lighting", "detailed model"],
  vector: ["vector art", "clean lines", "flat design", "minimalist", "scalable"],
  vintage: ["retro style", "aged look", "classic", "nostalgic", "sepia tones"],
  "digital-art": ["digital painting", "concept art", "illustration", "artstation"],
  "pixel-art": ["8-bit", "retro gaming", "pixel perfect", "low resolution"],
  "70s-vibe": ["1970s style", "retro", "groovy", "psychedelic", "vintage colors"],
  comic: ["comic book style", "bold outlines", "speech bubbles", "action lines"],
  painting: ["oil painting", "brush strokes", "canvas texture", "artistic"],
  dark: ["dark theme", "gothic", "mysterious", "shadowy", "dramatic lighting"],
  "art-nouveau": ["elegant curves", "organic forms", "decorative", "alfons mucha"],
  sketch: ["pencil drawing", "rough sketch", "line art", "preliminary drawing"],
  cyberpunk: ["futuristic", "neon lights", "dystopian", "high tech", "low life"],
  anime: ["anime style", "japanese animation", "manga", "expressive eyes"],
  watercolor: ["watercolor painting", "transparent washes", "soft edges", "fluid"],
  origami: ["paper craft", "folded paper", "geometric", "origami art"],
  surreal: ["dreamlike", "fantastical", "illogical", "surrealism", "dali"],
  fantasy: ["magical", "mythical", "epic", "fantasy art", "creatures"],
  "traditional-japan": ["japanese art", "ukiyo-e", "woodblock print", "japanese culture"],
  "studio-shot": ["studio lighting", "professional photo", "clean background", "portrait"]
};

const meaningfulSubjects = {
  objects: [
    "abstract geometric patterns", "futuristic architecture", "natural landscapes", 
    "mechanical devices", "sci-fi vehicles", "ancient artifacts", "crystal formations",
    "organic structures", "digital interfaces", "cosmic phenomena", "urban cityscapes",
    "underwater scenes", "desert landscapes", "forest ecosystems", "mountain ranges",
    "cloud formations", "technological gadgets", "architectural designs",
    "industrial machinery", "scientific instruments", "artistic sculptures"
  ],
  animals: [
    "wild animals in nature", "mythical creatures", "insect macro photography",
    "marine life", "bird species", "reptile closeups", "mammal portraits"
  ],
  nature: [
    "botanical illustrations", "geological formations", "weather phenomena",
    "ecosystem diversity", "natural patterns", "mineral specimens"
  ],
  abstract: [
    "fluid dynamics", "light refraction", "color theory manifestations",
    "mathematical patterns", "conceptual art", "surreal compositions"
  ]
};

const randomAdjectives = [
  "stunning", "breathtaking", "magnificent", "gorgeous", "spectacular",
  "captivating", "mesmerizing", "dazzling", "exquisite", "glorious",
  "majestic", "impressive", "splendid", "wonderful", "fantastic"
];

const randomDetails = [
  "highly detailed", "intricate", "masterpiece", "award winning", "professional",
  "ultra detailed", "sharp focus", "perfect composition", "dynamic lighting",
  "cinematic", "epic scale", "artistic", "creative", "innovative"
];

class PromptEnhancer {
  isMeaninglessPrompt(prompt) {
    if (!prompt || prompt.trim().length === 0) return true;
    
    const cleanPrompt = prompt.toLowerCase().trim();
    const words = cleanPrompt.split(/\s+/);
    
    if (words.length === 1 && words[0].length < 3) return true;
    
    const meaninglessPatterns = [
      /^[a-z]{1,2}$/i,
      /^[^a-z0-9]+$/i,
      /^(asd|qwe|zxc|fgh|vbn|rty|uio|jkl|nm)+$/i,
      /^[hgfdsa]+$/i,
      /^[poiuyt]+$/i,
      /^[lkjhg]+$/i,
      /^[mnbvc]+$/i
    ];
    
    return meaninglessPatterns.some(pattern => pattern.test(cleanPrompt));
  }

  enhancePrompt(originalPrompt, style) {
    if (this.isMeaninglessPrompt(originalPrompt)) {
      return this.generateMeaningfulPrompt(style);
    }

    const words = originalPrompt.trim().split(/\s+/);
    
    if (words.length <= 2) {
      return this.generateEnhancedPrompt(originalPrompt, style);
    }

    return this.refinePrompt(originalPrompt, style);
  }

  generateMeaningfulPrompt(style) {
    const categories = Object.keys(meaningfulSubjects);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const subjects = meaningfulSubjects[randomCategory];
    const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
    
    const randomAdjective = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)];
    const randomDetail = randomDetails[Math.floor(Math.random() * randomDetails.length)];
    
    const styleEnhancement = styleEnhancements[style] 
      ? styleEnhancements[style][Math.floor(Math.random() * styleEnhancements[style].length)]
      : "";

    const prompt = `${randomAdjective} ${randomSubject} ${styleEnhancement} ${randomDetail}`;
    
    return this.addNegativeReinforcement(prompt);
  }

  addNegativeReinforcement(prompt) {
    const negativeTerms = "no humans, no people, no persons, no faces, no portraits, no characters";
    return `${prompt}, ${negativeTerms}`;
  }

  generateEnhancedPrompt(prompt, style) {
    const randomAdjective = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)];
    const randomDetail = randomDetails[Math.floor(Math.random() * randomDetails.length)];
    
    const styleEnhancement = styleEnhancements[style] 
      ? styleEnhancements[style][Math.floor(Math.random() * styleEnhancements[style].length)]
      : "";

    const enhanced = `${randomAdjective} ${prompt} ${styleEnhancement} ${randomDetail}`;
    
    return this.addNegativeReinforcement(enhanced);
  }

  refinePrompt(prompt, style) {
    const styleSpecific = styleEnhancements[style] || [];
    const randomStyleEnhancement = styleSpecific.length > 0 
      ? styleSpecific[Math.floor(Math.random() * styleSpecific.length)]
      : "";

    const enhancements = [...randomAdjectives, ...randomDetails];
    const randomEnhancement = enhancements[Math.floor(Math.random() * enhancements.length)];

    const refined = `${prompt}, ${randomStyleEnhancement}, ${randomEnhancement}`;
    
    return this.addNegativeReinforcement(refined);
  }
}

module.exports = new PromptEnhancer();