"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileBox, X, Check, AlertCircle } from "lucide-react";

interface ModelUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileLoaded: (buffer: ArrayBuffer, fileName: string, fileType: "ifc" | "gltf" | "glb") => void;
}

const ACCEPTED_EXTENSIONS = [".ifc", ".gltf", ".glb"];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function ModelUploader({ open, onOpenChange, onFileLoaded }: ModelUploaderProps) {
  const isKo = useAppStore((s) => s.language) === "ko";
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    setLoadedFile(null);

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(isKo ? `지원하지 않는 파일 형식: ${ext}` : `Unsupported file type: ${ext}`);
      setLoading(false);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(isKo ? "파일 크기가 100MB를 초과합니다" : "File exceeds 100MB limit");
      setLoading(false);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const fileType = ext === ".ifc" ? "ifc" : ext === ".glb" ? "glb" : "gltf";
      onFileLoaded(buffer, file.name, fileType);
      setLoadedFile(file.name);
      setLoading(false);
    } catch {
      setError(isKo ? "파일을 읽을 수 없습니다" : "Failed to read file");
      setLoading(false);
    }
  }, [isKo, onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            {isKo ? "3D 모델 업로드" : "Upload 3D Model"}
          </DialogTitle>
          <DialogDescription>
            {isKo
              ? "IFC, glTF, GLB 파일을 업로드하여 실제 건축 모델을 표시합니다."
              : "Upload IFC, glTF, or GLB files to display the actual architectural model."}
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className={`h-10 w-10 ${dragOver ? "text-primary" : "text-muted-foreground/50"}`} />
          <div className="text-center">
            <p className="text-sm font-medium">
              {isKo ? "파일을 끌어다 놓거나" : "Drag and drop a file, or"}
            </p>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">
                {isKo ? "파일 선택" : "browse"}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".ifc,.gltf,.glb"
                onChange={handleFileInput}
              />
            </label>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">.ifc</Badge>
            <Badge variant="outline" className="text-[10px]">.gltf</Badge>
            <Badge variant="outline" className="text-[10px]">.glb</Badge>
          </div>
        </div>

        {/* Status */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {isKo ? "모델 로딩 중..." : "Loading model..."}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loadedFile && !loading && !error && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            {loadedFile}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isKo ? "닫기" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
