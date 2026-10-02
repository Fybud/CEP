import { useState, useRef } from "react";
import { FileImage, FileText, Trash2, UploadCloud, X, Loader2 } from "lucide-react";
import { useMediaAssets, useUploadMediaAsset, useDeleteMediaAsset } from "../../api";
import { formatBytes } from "../../lib/channel-media";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { cn } from "./utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function assetSrc(url: string) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

interface Props {
  onInsert: (url: string) => void;
  onClose: () => void;
}

export function MediaAssetLibrary({ onInsert, onClose }: Props) {
  const { data: assets, isLoading } = useMediaAssets();
  const uploadAsset = useUploadMediaAsset();
  const deleteAsset = useDeleteMediaAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | "image" | "pdf">("all");

  const filtered = assets?.filter((a) => {
    if (filter === "all") return true;
    if (filter === "image") return a.mimeType.startsWith("image/");
    if (filter === "pdf") return a.mimeType === "application/pdf";
    return true;
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Only images and PDFs are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large (max 10MB).");
      return;
    }

    try {
      const fd = new FormData();
      fd.append("file", file);
      await uploadAsset.mutateAsync(fd);
      toast.success("Asset uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="absolute bottom-full mb-2 right-0 w-[360px] bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileImage className="w-4 h-4 text-primary" />
          Asset Library
        </h3>
        <Button variant="ghost" size="icon" className="w-6 h-6 hover:bg-muted" onClick={onClose}>
          <X className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50">
          {(["all", "image", "pdf"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors",
                filter === t
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          ref={fileInputRef}
          onChange={handleUpload}
          disabled={uploadAsset.isPending}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          disabled={uploadAsset.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadAsset.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UploadCloud className="w-3.5 h-3.5" />
          )}
          Upload
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[300px] p-2 min-h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !filtered?.length ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <FileImage className="w-8 h-8 opacity-20" />
            <p className="text-xs">No assets found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((asset) => {
              const isImage = asset.mimeType.startsWith("image/");
              const src = assetSrc(asset.url);
              return (
                <div
                  key={asset.id}
                  className="group relative border border-border/50 rounded-lg overflow-hidden bg-muted/10 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => onInsert(src)}
                >
                  <div className="aspect-video bg-muted flex items-center justify-center relative">
                    {isImage ? (
                      <img src={src} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
                    )}
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                      <span className="text-xs font-semibold text-primary">Insert</span>
                    </div>
                  </div>
                  <div className="p-1.5 flex flex-col gap-0.5">
                    <p className="text-[10px] font-medium truncate text-foreground" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="text-[9px] text-muted-foreground flex justify-between items-center">
                      {formatBytes(asset.size)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this asset?")) {
                            deleteAsset.mutate(asset.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 p-0.5 rounded transition-all"
                        title="Delete asset"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
