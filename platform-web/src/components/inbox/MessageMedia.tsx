import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Loader2, X } from "lucide-react";
import { messageMediaUrl } from "../../api";
import { useAuthStore } from "../../store/auth";
import { cn } from "./utils";

type Props = {
  messageId: string;
  index?: number;
  mimeType?: string | null;
  filename?: string | null;
  contentType?: string;
  incoming?: boolean;
};

export function MessageMedia({
  messageId,
  index = 0,
  mimeType,
  filename,
  contentType,
  incoming,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setError(false);
    setSrc(null);

    (async () => {
      try {
        const res = await fetch(messageMediaUrl(messageId, index), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("load failed");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, index, token]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [previewOpen]);

  if (error) {
    return (
      <p className="text-xs opacity-80">
        Attachment unavailable{filename ? `: ${filename}` : ""}
      </p>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs opacity-70">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }

  const type = mimeType ?? "";
  const name = filename ?? "";
  // Instagram often stores videos as contentType "image" with filename "image.mp4".
  // Prefer real MIME / extension so we render <video>, not a broken <img>.
  const isVideo =
    type.startsWith("video/") ||
    contentType === "video" ||
    /\.(mp4|mov|webm|m4v)(\?|$)/i.test(name);
  const isAudio =
    !isVideo &&
    (type.startsWith("audio/") ||
      contentType === "audio" ||
      /\.(mp3|ogg|wav|m4a|webm|aac)(\?|$)/i.test(name));
  const isImage =
    !isVideo &&
    !isAudio &&
    (type.startsWith("image/") || contentType === "image");
  const downloadName = filename && !/^(image|audio|video|file|document)$/i.test(filename)
    ? filename
    : isImage
      ? "image"
      : isVideo
        ? "video"
        : isAudio
          ? "audio"
          : "attachment";

  if (isImage) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="block max-w-[220px] overflow-hidden rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title="View image"
        >
          <img
            src={src}
            alt={downloadName}
            className="max-h-52 w-full object-cover transition-opacity hover:opacity-95"
          />
        </button>
        {previewOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[80] flex flex-col bg-black/80"
              role="dialog"
              aria-modal="true"
              aria-label="Image preview"
              onClick={() => setPreviewOpen(false)}
            >
              <div
                className="flex shrink-0 items-center justify-end gap-2 px-4 py-3"
                onClick={(e) => e.stopPropagation()}
              >
                <a
                  href={src}
                  download={downloadName}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                <button
                  type="button"
                  aria-label="Close preview"
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                <img
                  src={src}
                  alt={downloadName}
                  className="max-h-full max-w-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  if (isVideo) {
    return (
      <video src={src} controls className="max-h-52 max-w-[260px] rounded-lg" />
    );
  }

  if (isAudio) {
    return <audio src={src} controls className="max-w-[260px]" preload="metadata" />;
  }

  return (
    <a
      href={src}
      download={downloadName}
      className={cn(
        "inline-flex max-w-[240px] items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium",
        incoming
          ? "border-border bg-background"
          : "border-primary-foreground/25 bg-primary-foreground/10",
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{filename && !/^(image|audio|video|file|document)$/i.test(filename) ? filename : "Download file"}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>
  );
}
