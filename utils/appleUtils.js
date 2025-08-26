const mapAppleProductType = (productId) => {
  // Adjust based on your Apple product ID naming convention, e.g., 'com.example.basic.monthly'
  if (productId.includes('free')) return 'free';
  if (productId.includes('basicweekly')) return 'basic';
  if (productId.includes('standardmonthly')) return 'standard';
  if (productId.includes('premiumyearly')) return 'premium';
  if (productId.includes('trial')) return 'trial';
  console.warn(`[mapAppleProductType] Unknown productId: ${productId}`);
  return 'unknown';
};

const mapAppleProductName = (productId) => {
  // Adjust based on your Apple product ID naming convention, e.g., 'com.example.basic.monthly'
  if (productId.includes('free')) return 'Free';
  if (productId.includes('basicweekly')) return 'Basic';
  if (productId.includes('standardmonthly')) return 'Standard';
  if (productId.includes('premiumyearly')) return 'Premium';
  if (productId.includes('trial')) return 'Trial';
  console.warn(`[mapAppleProductType] Unknown productId: ${productId}`);
  return 'unknown';
};

const mapAppleBillingPeriod = (subscriptionPeriod) => {
  // Apple subscription periods: 'ONE_WEEK', 'ONE_MONTH', etc.
  switch (subscriptionPeriod) {
    case 'ONE_WEEK': return 'weekly';
    case 'ONE_MONTH': return 'monthly';
    case 'TWO_MONTHS': return 'bimonthly';
    case 'THREE_MONTHS': return 'quarterly';
    case 'SIX_MONTHS': return 'semiannual';
    case 'ONE_YEAR': return 'yearly';
    default:
      console.warn(`[mapAppleBillingPeriod] Unknown period: ${subscriptionPeriod}`);
      return 'unknown';
  }
};

// Map Apple product IDs to Google product IDs or plan types for consistency
const appleToGoogleProductIdMap = {
  'com.example.basic.monthly': 'basic_monthly',
  'com.example.premium.yearly': 'premium_yearly',
  'com.example.basic.weekly': 'basic_weekly',
  // Add all your Apple product IDs and their Google equivalents
};

const mapAppleToGoogleProductId = (appleProductId) => {
  return appleToGoogleProductIdMap[appleProductId] || null;
};

module.exports = {
  mapAppleProductType,
  mapAppleBillingPeriod,
  mapAppleToGoogleProductId,
  mapAppleProductName,
};