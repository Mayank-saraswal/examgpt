/**
 * Rasterize a single-page PDF buffer to PNG using pdfjs-dist + @napi-rs/canvas.
 *
 * NOTE: pdfjs-dist types assume browser HTMLCanvasElement. Node rendering uses
 * @napi-rs/canvas (not assignable to those types), so we use a narrow local
 * structural interface + one boundary cast.
 */
import { createRequire } from "node:module";

export type RenderedPage = {
  png: Buffer;
  width: number;
  height: number;
};

type NapiCanvas = {
  getContext: (t: "2d") => unknown;
  toBuffer: (mime: "image/png") => Buffer;
  width: number;
  height: number;
};

type PdfjsModule = {
  getDocument: (src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
  }) => {
    promise: Promise<{
      getPage: (n: number) => Promise<{
        getViewport: (o: { scale: number }) => { width: number; height: number };
        render: (params: {
          canvas: null;
          canvasContext: unknown;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
};

/**
 * Render first page of a (usually single-page) PDF to PNG at given scale.
 */
export async function renderPdfPageToPng(
  pdfBytes: Buffer | Uint8Array,
  scale = 2,
): Promise<RenderedPage> {
  const require = createRequire(import.meta.url);

  let pdfjs: PdfjsModule;
  try {
    // Boundary cast: pdfjs export types don't match Node canvas rendering.
    pdfjs = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as unknown as PdfjsModule;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as PdfjsModule;
  }

  let createCanvas: (w: number, h: number) => NapiCanvas;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvasMod = require("@napi-rs/canvas") as {
      createCanvas: (w: number, h: number) => NapiCanvas;
    };
    createCanvas = canvasMod.createCanvas;
  } catch {
    throw new Error(
      "PDF page rasterization requires @napi-rs/canvas — install for diagram crops",
    );
  }

  const data =
    pdfBytes instanceof Buffer
      ? new Uint8Array(pdfBytes)
      : new Uint8Array(pdfBytes);

  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const ctx = canvas.getContext("2d");

  // canvas:null + canvasContext for non-DOM backends (pdfjs RenderParameters).
  await page.render({
    canvas: null,
    canvasContext: ctx,
    viewport,
  }).promise;

  const png = canvas.toBuffer("image/png");
  return {
    png: Buffer.from(png),
    width: canvas.width,
    height: canvas.height,
  };
}
