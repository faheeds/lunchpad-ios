import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiDelete, apiPost } from "./api";
import { reportError } from "./sentry";

/**
 * Register for push notifications. Requests permission, gets the Expo push
 * token, and registers it with the backend. Does not show errors to the user
 * (fail-silent policy) but reports failures to Sentry.
 *
 * Subsequent calls will no-op if a token was already registered this session.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      reportError(new Error("Missing EAS projectId in app.json"), {
        context: "registerForPushNotifications",
      });
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token.data) {
      reportError(new Error("Failed to get Expo push token"), {
        context: "registerForPushNotifications",
      });
      return;
    }

    await apiPost("/api/mobile/native/push-token", {
      token: token.data,
      platform: "ios",
    });
  } catch (err) {
    reportError(err, {
      context: "registerForPushNotifications",
    });
  }
}

/**
 * Unregister push notifications by deleting the token from the backend.
 * Fails silently — sign-out must never fail due to push unregistration.
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    await apiDelete<{ ok: true }>(`/api/mobile/native/push-token`);
  } catch (err) {
    reportError(err, {
      context: "unregisterPushNotifications",
    });
  }
}

/**
 * Parse the data payload from a notification and compute the navigation target.
 * Returns null if the screen is unknown or missing (forward-compatible fallback).
 */
export type PushScreenRoute =
  | { screen: "order"; orderId?: string }
  | { screen: "weekly" }
  | null;

export function parsePushData(data: Record<string, unknown>): PushScreenRoute {
  const screen = data.screen as string | undefined;
  if (!screen) return null;

  switch (screen) {
    case "order":
      return {
        screen: "order",
        orderId: typeof data.orderId === "string" ? data.orderId : undefined,
      };
    case "weekly":
      return { screen: "weekly" };
    default:
      return null;
  }
}
