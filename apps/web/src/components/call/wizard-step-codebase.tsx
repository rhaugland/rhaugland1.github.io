"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CodebaseEntry {
  id: string;
  name: string | null;
  source: string;
  filename: string | null;
  createdAt: string;
}

interface StepCodebaseProps {
  clientMode: "new" | "existing";
  clientId: string | null; // either selectedClient.id or createdClientId
  codebaseMode: "new" | "upload" | "previous";
  setCodebaseMode: (mode: "new" | "upload" | "previous") => void;
  uploadedCodebaseId: string | null;
  setUploadedCodebaseId: (id: string | null) => void;
  uploadedFilename: string | null;
  setUploadedFilename: (name: string | null) => void;
  selectedCodebaseId: string | null;
  setSelectedCodebaseId: (id: string | null) => void;
  setSelectedCodebaseName: (name: string | null) => void;
  error: string | null;
  setError: (err: string | null) => void;
}

export default function WizardStepCodebase({
  clientMode, clientId,
  codebaseMode, setCodebaseMode,
  uploadedCodebaseId, setUploadedCodebaseId,
  uploadedFilename, setUploadedFilename,
  selectedCodebaseId, setSelectedCodebaseId, setSelectedCodebaseName,
  error, setError,
}: StepCodebaseProps) {
  const [codebases, setCodebases] = useState<CodebaseEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // fetch codebases for existing client
  useEffect(() => {
    if (clientMode !== "existing" || !clientId) return;
    fetch(`/api/clients/${clientId}/codebases`)
      .then((r) => r.json())
      .then((data) => setCodebases(data.codebases ?? []))
      .catch(() => {});
  }, [clientMode, clientId]);

  const handleUpload = useCallback(async (file: File) => {
    setError(null);

    // validate extension
    const name = file.name.toLowerCase();
    if (!name.endsWith(".zip") && !name.endsWith(".tar.gz") && !name.endsWith(".tgz")) {
      setError("invalid file type — accepted: .zip, .tar.gz, .tgz");
      return;
    }

    // validate size
    if (file.size > 100 * 1024 * 1024) {
      setError("file too large — max 100MB");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId!);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/calls/upload");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const result = await new Promise<{ codebaseId: string; filename: string }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error ?? "upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("upload failed"));
        xhr.send(formData);
      });

      setUploadedCodebaseId(result.codebaseId);
      setUploadedFilename(result.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }, [clientId, setError, setUploadedCodebaseId, setUploadedFilename]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">select a codebase</h3>

      {/* mode selection */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => { setCodebaseMode("new"); setSelectedCodebaseId(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            codebaseMode === "new"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          new project
        </button>
        <button
          onClick={() => { setCodebaseMode("upload"); setSelectedCodebaseId(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            codebaseMode === "upload"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          upload existing
        </button>
        {clientMode === "existing" && codebases.length > 0 && (
          <button
            onClick={() => { setCodebaseMode("previous"); setUploadedCodebaseId(null); setUploadedFilename(null); }}
            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
              codebaseMode === "previous"
                ? "border-primary bg-primary/5 text-primary"
                : "border-gray-300 text-foreground hover:bg-gray-50"
            }`}
          >
            use previous
          </button>
        )}
      </div>

      {/* upload area */}
      {codebaseMode === "upload" && (
        <div className="mt-4">
          {!uploadedCodebaseId ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${
                dragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.tar.gz,.tgz"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploading ? (
                <div>
                  <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted">{uploadProgress}%</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">
                    drop a file here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted">.zip, .tar.gz, .tgz — max 100MB</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">uploaded: {uploadedFilename}</p>
                <button
                  onClick={() => { setUploadedCodebaseId(null); setUploadedFilename(null); }}
                  className="text-sm text-muted underline hover:text-foreground"
                >
                  remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* previous codebases dropdown */}
      {codebaseMode === "previous" && (
        <div className="mt-4">
          <label htmlFor="previousCodebase" className="mb-1 block text-sm font-medium text-foreground">
            select a previous codebase
          </label>
          <select
            id="previousCodebase"
            value={selectedCodebaseId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setSelectedCodebaseId(id);
              const cb = codebases.find((c) => c.id === id);
              setSelectedCodebaseName(cb?.name ?? cb?.filename ?? null);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">choose a codebase</option>
            {codebases.map((cb) => (
              <option key={cb.id} value={cb.id}>
                {cb.name ?? cb.filename ?? "unnamed"} ({cb.source}) — {new Date(cb.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}
    </div>
  );
}
