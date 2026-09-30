// Picture-in-picture for Stream calls is only available in the installed app.
// The web preview never enters the native Stream call screen.
export function useIsInPiPMode(): boolean {
  return false;
}

export async function exitPiPAndroid(): Promise<boolean> {
  return false;
}

export async function enterPiPAndroid(
  _aspectRatioWidth: number,
  _aspectRatioHeight: number,
): Promise<boolean> {
  return false;
}