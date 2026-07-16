import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ExamGPT — AI exam prep from your notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0f172a",
          color: "#f8fafc",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, color: "#60a5fa", fontWeight: 600 }}>
          ExamGPT
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 900,
          }}
        >
          Chat with your notes. Sit real NTA-style mocks.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#94a3b8" }}>
          Page citations · NEET &amp; JEE · Deep reports
        </div>
      </div>
    ),
    { ...size },
  );
}
