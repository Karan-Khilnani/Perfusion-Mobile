// Keep the native Stream SDK out of the web bundle. Expo Router imports every
// route when it builds the browser preview, including the call screen.
export { enterPiPAndroid, useIsInPiPMode } from "@stream-io/video-react-native-sdk";
import { NativeModules, Platform } from "react-native";

export async function exitPiPAndroid(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const exit = NativeModules.StreamVideoReactNative?.exitPipMode;
  return exit ? Boolean(await exit()) : false;
}