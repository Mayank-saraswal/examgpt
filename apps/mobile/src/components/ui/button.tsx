import { Pressable, Text, type PressableProps } from "react-native";
import { colors } from "@examgpt/ui-tokens";

type Props = PressableProps & {
  title: string;
  variant?: "default" | "outline";
};

/** Minimal react-native-reusables-style Button (className + tokens). */
export function Button({
  title,
  variant = "default",
  disabled,
  className,
  ...props
}: Props & { className?: string }) {
  const isOutline = variant === "outline";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={`items-center justify-center rounded-lg px-4 py-3 ${className ?? ""}`}
      style={{
        backgroundColor: isOutline ? "transparent" : colors.primary[600],
        borderWidth: isOutline ? 1 : 0,
        borderColor: colors.slate[300],
        opacity: disabled ? 0.5 : 1,
      }}
      {...props}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: isOutline ? colors.slate[900] : "#ffffff" }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
