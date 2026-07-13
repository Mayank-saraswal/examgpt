import { TextInput, type TextInputProps } from "react-native";
import { colors } from "@examgpt/ui-tokens";

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.slate[400]}
      className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
      style={{ borderColor: colors.slate[200], color: colors.slate[900] }}
      {...props}
    />
  );
}
