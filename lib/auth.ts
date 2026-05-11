import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";
import {
  getJWT,
  setJWT,
  clearJWT,
  clearStoredBaseUrl,
  signInWithApple,
  SCHOOL_CODE_KEY,
} from "./api";
import { clearThemeCache } from "./theme-context";

export async function isSignedIn(): Promise<boolean> {
  const token = await getJWT();
  return !!token;
}

/**
 * Sign out + reset tenant context so the user lands back at the school
 * code entry screen on next launch. This is the right behavior because
 * each tenant has its own ParentUser record server-side — staying signed
 * in with a stale school code would just confuse them with another
 * tenant's data.
 *
 * Also wipes the cached brand so the next sign-in flow doesn't briefly
 * flash the previous tenant's colors before the new theme loads.
 */
export async function signOut(): Promise<void> {
  await clearJWT();
  await clearStoredBaseUrl();
  await SecureStore.deleteItemAsync(SCHOOL_CODE_KEY);
  await clearThemeCache();
}

export async function appleSignIn(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In did not return an identity token");
  }

  const fullName = credential.fullName
    ? {
        givenName: credential.fullName.givenName ?? undefined,
        familyName: credential.fullName.familyName ?? undefined,
      }
    : undefined;

  const { token } = await signInWithApple(credential.identityToken, fullName);
  await setJWT(token);
}
