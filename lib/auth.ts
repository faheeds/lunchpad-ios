import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import * as SecureStore from "expo-secure-store";
import {
  getJWT,
  setJWT,
  clearJWT,
  clearStoredBaseUrl,
  signInWithApple,
  signInWithGoogle,
  SCHOOL_CODE_KEY,
} from "./api";
import { clearThemeCache } from "./theme-context";
import { unregisterPushNotifications } from "./push-notifications";

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
 *
 * Unregisters push notifications before clearing the JWT, since the DELETE
 * call needs a valid authenticated session. Failures are reported to Sentry
 * but do not block sign-out.
 */
export async function signOut(): Promise<void> {
  await unregisterPushNotifications();
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

export async function googleSignIn(): Promise<void> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false }).catch(() => {
    // hasPlayServices is an Android-only check (Google Play Services) —
    // it always resolves fine on iOS, but wrapped defensively anyway
    // rather than assuming it never throws there.
  });
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;

  if (!idToken) {
    throw new Error("Google Sign In did not return an identity token");
  }

  const { token } = await signInWithGoogle(idToken);
  await setJWT(token);
}
