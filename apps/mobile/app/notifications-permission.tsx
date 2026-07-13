import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../src/components/ui/button";
import { trpc } from "../src/trpc";

/**
 * Ask for notification permission AFTER onboarding with a value explainer
 * (TASKS.md Phase 1). Denial must not crash the flow.
 */
export default function NotificationsPermissionScreen() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const register = useMutation(
    trpc.notifications.registerPushToken.mutationOptions(),
  );

  async function enable() {
    try {
      if (!Device.isDevice) {
        setMessage("Push tokens require a physical device. You can skip.");
        return;
      }
      const existing = (await Notifications.getPermissionsAsync()) as {
        granted?: boolean;
        status?: string;
      };
      let granted = Boolean(existing.granted || existing.status === "granted");
      if (!granted) {
        const req = (await Notifications.requestPermissionsAsync()) as {
          granted?: boolean;
          status?: string;
        };
        granted = Boolean(req.granted || req.status === "granted");
      }
      if (!granted) {
        setMessage(
          "Notifications are off. You can enable them later in system settings.",
        );
        return;
      }
      const token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
        })
      ).data;
      await register.mutateAsync({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      });
      setMessage("Notifications enabled.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not register for notifications. You can continue.",
      );
    }
  }

  return (
    <View className="flex-1 bg-white px-6 py-8 dark:bg-slate-950">
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        Stay on track
      </Text>
      <Text className="mt-3 text-sm leading-5 text-slate-600 dark:text-slate-300">
        ExamGPT can notify you when your syllabus or notes finish processing and
        when mock-test results are ready. We never spam. You can change this
        anytime in settings.
      </Text>
      <View className="mt-8 gap-3">
        <Button title="Enable notifications" onPress={enable} />
        <Button
          title="Not now"
          variant="outline"
          onPress={() => router.replace("/")}
        />
      </View>
      {message ? (
        <Text className="mt-4 text-sm text-slate-600">{message}</Text>
      ) : null}
      {message ? (
        <View className="mt-4">
          <Button title="Continue to home" onPress={() => router.replace("/")} />
        </View>
      ) : null}
    </View>
  );
}
