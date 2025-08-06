const SKU_MAPPINGS = {
  basic: ["basic", "basica"],
  standard: ["standard", "standards"],
  premium: ["premium"],
  trial: ["trial", "free_trial"],
};

const mapGoogleProductType = (sku) => {
  try {
    sku = sku.toLowerCase();
    for (const [type, variants] of Object.entries(SKU_MAPPINGS)) {
      if (variants.some((variant) => sku.includes(variant))) {
        return type;
      }
    }
    return "free";
  } catch (error) {
    console.error("[Utils] mapGoogleProductType failed:", error);
    throw error;
  }
};

const mapBillingPeriod = (sku) => {
  try {
    sku = sku.toLowerCase();
    if (sku.includes("basic")) return "7 days";
    if (sku.includes("standard")) return "1 month";
    if (sku.includes("premium")) return "1 year";
    if (sku.includes("trial")) return "7 days";
    return "none";
  } catch (error) {
    console.error("[Utils] mapBillingPeriod failed:", error);
    throw error;
  }
};

const convertPrice = (priceMicros) => {
  try {
    const price = (priceMicros?.units || 0) + (priceMicros?.nanos || 0) / 1_000_000_000;
    const converted = parseFloat(price.toFixed(2));
    return converted;
  } catch (error) {
    console.error("[Utils] convertPrice failed:", error);
    throw error;
  }
};

const calculateCredits = (sku, type = "total") => {
  try {
    sku = sku.toLowerCase();
    let base;

    if (sku.includes("basic")) base = 1200;
    else if (sku.includes("standard")) base = 5040;
    else if (sku.includes("premium")) base = 60500;
    else if (sku.includes("trial")) base = 200;
    else base = 10;

    switch (type) {
      case "image":
      case "prompt":
      case "total":
        return base;
      default:
        return 0;
    }
  } catch (error) {
    console.error("[Utils] calculateCredits failed:", error);
    throw error;
  }
};

const parseFeatures = (description) => {
  try {
    const features = description
      ? description.split(";").map((f) => f.trim()).filter((f) => f)
      : ["Basic features"];
    return features;
  } catch (error) {
    console.error("[Utils] parseFeatures failed:", error);
    throw error;
  }
};

const getPlanDetails = (sku, googleProduct) => {
  try {
    sku = sku.toLowerCase();
    const defaultDetails = {
      name: googleProduct?.name || googleProduct?.sku || "Unnamed Plan",
      description: googleProduct?.description || "No description provided",
      price: convertPrice(googleProduct?.priceMicros || { units: 0, nanos: 0 }),
    };

    if (sku.includes("basic")) {
      return {
        name: googleProduct?.name || "Basic",
        description: googleProduct?.description || "Basic subscription plan",
        price: googleProduct?.priceMicros ? convertPrice(googleProduct.priceMicros) : 5.00,
      };
    } else if (sku.includes("standard")) {
      return {
        name: googleProduct?.name || "Standard",
        description: googleProduct?.description || "Standard subscription plan",
        price: googleProduct?.priceMicros ? convertPrice(googleProduct.priceMicros) : 14.00,
      };
    } else if (sku.includes("premium")) {
      return {
        name: googleProduct?.name || "Premium",
        description: googleProduct?.description || "Premium subscription plan",
        price: googleProduct?.priceMicros ? convertPrice(googleProduct.priceMicros) : 160.00,
      };
    } else if (sku.includes("trial")) {
      return {
        name: googleProduct?.name || "Trial",
        description: googleProduct?.description || "Free trial plan",
        price: googleProduct?.priceMicros ? convertPrice(googleProduct.priceMicros) : 0.00,
      };
    } else {
      return {
        name: googleProduct?.name || "Free",
        description: googleProduct?.description || "Free plan with limited features",
        price: googleProduct?.priceMicros ? convertPrice(googleProduct.priceMicros) : 0.00,
      };
    }
  } catch (error) {
    console.error("[Utils] getPlanDetails failed:", error);
    throw error;
  }
};

module.exports = {
  mapGoogleProductType,
  mapBillingPeriod,
  convertPrice,
  calculateCredits,
  parseFeatures,
  getPlanDetails,
};