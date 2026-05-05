import * as AppleAuthentication from "expo-apple-authentication";
import { getJWT, setJWT, clearJWT, signInWithApple } from "./api";

export async function isSignedIn(): Promise<boolean> {
  const token = await getJWT();
  return !!token;
}

export async function signOut(): Promise<void> {
  await clearJWT();
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
