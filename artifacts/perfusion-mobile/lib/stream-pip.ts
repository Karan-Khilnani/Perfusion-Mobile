// Keep the native Stream SDK out of the web bundle. Expo Router imports every
// route when it builds the browser preview, including the call screen.
export { enterPiPAndroid, useIsInPiPMode } from "@stream-io/video-react-native-sdk";