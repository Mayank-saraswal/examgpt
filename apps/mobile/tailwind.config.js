const { colors } = require("@examgpt/ui-tokens/colors.cjs");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        slate: colors.slate,
        success: colors.success,
        error: colors.error,
        warning: colors.warning,
        exam: colors.exam,
      },
    },
  },
  plugins: [],
};
