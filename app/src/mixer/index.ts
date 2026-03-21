/**
 * Mixer module — mixing console view with channel strips.
 *
 * @example
 * ```tsx
 * import { Mixer } from "./mixer";
 * // ...
 * <Mixer />
 * ```
 */

export { Mixer } from "./Mixer.js";
export { ChannelStrip } from "./ChannelStrip.js";
export { Fader } from "./Fader.js";
export { LevelMeter } from "./LevelMeter.js";
export {
  useMixerStore,
  hasSoloActive,
  isChannelAudible,
  faderToDb,
  dbToFader,
  dbToGain,
  gainToDb,
  levelToMeterHeight,
  meterColor,
  MIN_DB,
  MAX_DB,
  FADER_MIN_DB,
} from "./store.js";
export type { MixerChannel, MixerStore } from "./store.js";
