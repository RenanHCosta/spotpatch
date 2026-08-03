import { defineBackground } from "wxt/utils/define-background";

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: {
        type: string;
        boundingBox?: { left: number; top: number; width: number; height: number };
        devicePixelRatio?: number;
      },
      sender,
      respond,
    ) => {
      if (message.type === "SPOTPATCH_GET_IDS") {
        void getIds().then(respond, (error: unknown) => {
          respond({
            success: false,
            error: error instanceof Error ? error.message : "Failed to create extension IDs",
          });
        });
        return true;
      }
      if (message.type !== "SPOTPATCH_CAPTURE") return;
      void (async () => {
        try {
          const viewport = await chrome.tabs.captureVisibleTab({ format: "png" });
          let element: string | undefined;
          try {
            if (message.boundingBox)
              element = await crop(viewport, message.boundingBox, message.devicePixelRatio ?? 1);
          } catch {
            element = undefined;
          }
          respond({ success: true, viewport, element });
        } catch (error) {
          respond({
            success: false,
            error: error instanceof Error ? error.message : "Screenshot failed",
          });
        }
      })();
      return true;
    },
  );
});

async function getIds() {
  const stored = await chrome.storage.local.get("installationId"),
    installationId =
      typeof stored.installationId === "string" ? stored.installationId : crypto.randomUUID();
  if (!stored.installationId) await chrome.storage.local.set({ installationId });

  const session = await chrome.storage.session.get("sessionId"),
    sessionId = typeof session.sessionId === "string" ? session.sessionId : crypto.randomUUID();
  if (!session.sessionId) await chrome.storage.session.set({ sessionId });

  return { success: true, installationId, sessionId };
}

async function crop(
  dataUrl: string,
  box: { left: number; top: number; width: number; height: number },
  ratio: number,
) {
  const blob = await (await fetch(dataUrl)).blob(),
    bitmap = await createImageBitmap(blob),
    left = Math.max(0, Math.floor(box.left * ratio)),
    top = Math.max(0, Math.floor(box.top * ratio)),
    width = Math.min(bitmap.width - left, Math.max(1, Math.ceil(box.width * ratio))),
    height = Math.min(bitmap.height - top, Math.max(1, Math.ceil(box.height * ratio)));
  if (width <= 0 || height <= 0) throw new Error("Element is outside captured viewport");
  const canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
  const output = await canvas.convertToBlob({ type: "image/png" });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(output);
  });
}
