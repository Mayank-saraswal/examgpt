import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { BookOpen, ClipboardCheck, MessageSquare } from "lucide-react-native";

const WELCOME_KEY = "examgpt.welcome.seen.v1";
const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "notes",
    title: "Chat with your own notes",
    body: "Upload books and handwritten pages. Answers cite the exact page so you can trust what you read.",
    Icon: MessageSquare,
  },
  {
    key: "nta",
    title: "Real NTA-style mock tests",
    body: "Palette, timer, and submit rules that match the official computer-based exam window.",
    Icon: ClipboardCheck,
  },
  {
    key: "reports",
    title: "Reports that find weak topics",
    body: "After every attempt, see where you lose marks and what to practice next.",
    Icon: BookOpen,
  },
] as const;

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(WELCOME_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function finish() {
    await markWelcomeSeen();
    router.replace("/sign-in");
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <View className="flex-row items-center justify-between px-5 pt-14">
        <Text className="text-sm font-semibold text-primary-600">ExamGPT</Text>
        <Pressable onPress={() => void finish()} hitSlop={12}>
          <Text className="text-sm font-medium text-slate-500">Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={{ width }} className="flex-1 justify-center px-8">
            <item.Icon color="#2563eb" size={40} />
            <Text className="mt-6 text-3xl font-semibold text-slate-900 dark:text-slate-50">
              {item.title}
            </Text>
            <Text className="mt-4 text-base leading-6 text-slate-500">
              {item.body}
            </Text>
          </View>
        )}
      />

      <View className="flex-row items-center justify-center gap-2 pb-4">
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            className={`h-2 rounded-full ${i === index ? "w-6 bg-primary-600" : "w-2 bg-slate-300"}`}
          />
        ))}
      </View>

      <View className="px-6 pb-10">
        {index < SLIDES.length - 1 ? (
          <Pressable
            onPress={() =>
              listRef.current?.scrollToIndex({ index: index + 1, animated: true })
            }
            className="items-center rounded-xl bg-primary-600 py-3.5"
          >
            <Text className="font-semibold text-white">Next</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void finish()}
            className="items-center rounded-xl bg-primary-600 py-3.5"
          >
            <Text className="font-semibold text-white">Get started</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
