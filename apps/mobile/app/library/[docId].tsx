import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { trpc } from "../../src/trpc";

/**
 * PDF viewer for citation deep-links: examgpt://library/{docId}?page=n
 * Uses WebView + browser PDF rendering for Expo SDK 53 compatibility
 * (react-native-pdf requires native rebuild; WebView works in Expo Go).
 */
export default function LibraryDocScreen() {
  const { docId, page } = useLocalSearchParams<{
    docId: string;
    page?: string;
  }>();
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const { isSignedIn } = useAuth();

  const file = useQuery({
    ...trpc.documents.getFileUrl.queryOptions({ id: docId! }),
    enabled: !!isSignedIn && !!docId,
  });
  const meta = useQuery({
    ...trpc.documents.get.queryOptions({ id: docId! }),
    enabled: !!isSignedIn && !!docId,
  });

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Sign in required</Text>
      </View>
    );
  }

  if (file.isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (file.isError || !file.data?.url) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-error">
          {file.error?.message ?? "Could not load file URL"}
        </Text>
      </View>
    );
  }

  // Many mobile browsers open PDF at #page=n
  const uri = `${file.data.url}#page=${pageNum}`;

  return (
    <View className="flex-1 bg-white">
      <View className="border-b border-slate-200 px-4 py-3">
        <Text className="font-semibold text-slate-900" numberOfLines={1}>
          {meta.data?.title ?? "Document"}
        </Text>
        <Text className="text-xs text-slate-500">Page {pageNum}</Text>
      </View>
      <WebView
        source={{ uri }}
        startInLoadingState
        renderLoading={() => (
          <ActivityIndicator className="mt-10" color="#2563eb" />
        )}
        style={{ flex: 1 }}
      />
    </View>
  );
}
