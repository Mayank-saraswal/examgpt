import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { trpc } from "../../src/trpc";

export default function LibraryScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: !!isSignedIn,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const busy = data.some(
        (d) => d.ingestStatus === "PENDING" || d.ingestStatus === "PROCESSING",
      );
      return busy ? 2500 : false;
    },
  });

  const presign = useMutation(trpc.documents.presignUpload.mutationOptions());
  const register = useMutation(trpc.documents.registerUpload.mutationOptions());
  const addByUrl = useMutation(trpc.documents.addByUrl.mutationOptions());
  const retry = useMutation(trpc.documents.retryIngest.mutationOptions());

  async function uploadUri(
    uri: string,
    name: string,
    mimeType: string,
    size: number,
    sourceType: "UPLOAD_PDF" | "UPLOAD_IMAGE",
  ) {
    setError(null);
    const { documentId, uploadUrl } = await presign.mutateAsync({
      kind: "NOTES",
      title: name,
      mimeType,
      sizeBytes: size || 1,
      sourceType,
    });
    const blob = await (await fetch(uri)).blob();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: blob,
    });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    await register.mutateAsync({ documentId });
    await qc.invalidateQueries(trpc.documents.list.queryFilter());
  }

  async function pickDocument() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      for (const asset of res.assets) {
        const mime = asset.mimeType ?? "application/pdf";
        const sourceType =
          mime === "application/pdf" ? "UPLOAD_PDF" : "UPLOAD_IMAGE";
        await uploadUri(
          asset.uri,
          asset.name ?? "document",
          mime,
          asset.size ?? 1,
          sourceType,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function pickCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission denied. You can still pick files.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try {
      await uploadUri(
        a.uri,
        "camera-note.jpg",
        a.mimeType ?? "image/jpeg",
        a.fileSize ?? 1,
        "UPLOAD_IMAGE",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera upload failed");
    }
  }

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-4 text-slate-600">Sign in to open your library.</Text>
        <Link href="/sign-in" asChild>
          <Button title="Sign in" />
        </Link>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-4 pt-4 dark:bg-slate-950">
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        Library
      </Text>
      <View className="mt-4 gap-2">
        <Button title="Upload PDF / file" onPress={pickDocument} />
        <Button title="Camera" variant="outline" onPress={pickCamera} />
        <Input
          value={url}
          onChangeText={setUrl}
          placeholder="https://…/notes.pdf"
          autoCapitalize="none"
        />
        <Button
          title="Add by URL"
          variant="outline"
          onPress={async () => {
            try {
              await addByUrl.mutateAsync({
                url: url.trim(),
                title: "PDF from URL",
                kind: "NOTES",
              });
              setUrl("");
              await qc.invalidateQueries(trpc.documents.list.queryFilter());
            } catch (e) {
              setError(e instanceof Error ? e.message : "URL add failed");
            }
          }}
        />
      </View>
      {error ? (
        <Text className="mt-2 text-sm text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {list.isLoading ? (
        <ActivityIndicator className="mt-8" color="#2563eb" />
      ) : null}
      {list.isError ? (
        <View className="mt-6">
          <Text className="text-error">{list.error.message}</Text>
          <Button title="Retry" variant="outline" onPress={() => list.refetch()} />
        </View>
      ) : null}
      {list.data?.length === 0 ? (
        <Text className="mt-10 text-center text-slate-500">
          No documents yet. Upload notes to get started.
        </Text>
      ) : null}

      <FlatList
        className="mt-4"
        data={list.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const pagesDone =
            item.pages?.filter((p) => p.ocrStatus === "READY").length ?? 0;
          const total = item.pageCount ?? item.pages?.length ?? 0;
          const statusLabel =
            item.ingestStatus === "PROCESSING"
              ? `Processing ${pagesDone}/${total || "?"} pages`
              : item.ingestStatus;
          return (
            <Pressable
              className="mb-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              onPress={() => {
                if (item.ingestStatus === "READY") {
                  router.push(`/library/${item.id}?page=1`);
                }
              }}
            >
              <Text className="font-medium text-slate-900 dark:text-slate-50">
                {item.title}
              </Text>
              <Text className="mt-1 text-xs text-slate-500">{statusLabel}</Text>
              {item.ingestStatus === "FAILED" ? (
                <Button
                  title="Retry ingest"
                  variant="outline"
                  onPress={() =>
                    retry.mutate(
                      { id: item.id },
                      {
                        onSuccess: () =>
                          qc.invalidateQueries(trpc.documents.list.queryFilter()),
                      },
                    )
                  }
                />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
