/**
 * animations.ts — the ONE place that references Lottie JSON files.
 *
 * All animations were downloaded from LottieFiles (https://lottiefiles.com,
 * credits in assets/lottie/CREDITS.md) and are played with lottie-react-native
 * through the <LottieAnim> component. To swap an animation, replace the JSON
 * file in assets/lottie/ (keeping the name) or change the require() below.
 * Only files that really exist may be required, otherwise the bundle breaks.
 */
export const animations = {
  homeCards: require('../../assets/lottie/home-cards.json'),
  rangReveal: require('../../assets/lottie/rang-reveal.json'),
  sparkle: require('../../assets/lottie/sparkle.json'),
  confetti: require('../../assets/lottie/confetti.json'),
  trophy: require('../../assets/lottie/trophy.json'),
  lose: require('../../assets/lottie/lose.json'),
  loading: require('../../assets/lottie/loading.json'),
  cloudUpload: require('../../assets/lottie/cloud-upload.json'),
} as const;

export type AnimationName = keyof typeof animations;
