/**
 * App lock with Face ID or fingerprint (owner: "Lock on app open").
 *
 * Off until the member turns it on with the app-only switch on Me. Once on, the app asks when it
 * opens and when the member comes back after more than a minute away; the phone's own passcode
 * works too (the system offers it). Only an on/off flag is kept, in the phone's secure storage;
 * nothing about the face or fingerprint ever reaches the app or Jurrgun, and nothing goes to the server.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export const LOCK_MESSAGE = 'jurrgun-lock';
const KEY = 'jurrgun.applock';
/** Coming back after this long away asks again. */
export const RELOCK_MS = 60_000;

export async function lockOn(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

/** Whether this phone has Face ID or a fingerprint set up. */
export async function lockAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function unlock(th: boolean): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: th ? 'ปลดล็อก Jurrgun' : 'Unlock Jurrgun',
      cancelLabel: th ? 'ยกเลิก' : 'Cancel',
    });
    return r.success;
  } catch {
    return false;
  }
}

/** Turning it on asks once first, so nobody locks themselves out with a face the phone can't read. */
export async function setLock(on: boolean, th: boolean): Promise<boolean> {
  if (on && !(await unlock(th))) return false;
  try {
    if (on) await SecureStore.setItemAsync(KEY, '1');
    else await SecureStore.deleteItemAsync(KEY);
    return true;
  } catch {
    return false;
  }
}

/** Tell the page's switch the state. */
export function lockStateScript(state: { on: boolean; available: boolean; ok?: boolean }): string {
  return `dispatchEvent(new CustomEvent(${JSON.stringify(LOCK_MESSAGE)},{detail:${JSON.stringify(state)}}));true;`;
}
