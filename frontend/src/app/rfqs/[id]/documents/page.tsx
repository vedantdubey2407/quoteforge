"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  FileText,
  FileSpreadsheet,
  Upload,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Save,
} from "lucide-react";

type DocumentRow = {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  extraction_status: string;
  created_at: string;
  extracted_data?: Record<string, any> | null;
}; 

type ReviewField = {
  value: string;
  source_text: string | null;
  status: string;
};

type ExtractionResponse = {
  success: boolean;
  data: {
    extraction: {
      fields: Record<string, { value: string | number | null; source_text: string | null; status: string }>;
      extracted_count: number;
      total_fields: number;
      review_required: boolean;
      note: string;
    };
  };
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RfqDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const rfqId = params.id as string;

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [reviewingDocument, setReviewingDocument] = useState<DocumentRow | null>(null);
  const [reviewFields, setReviewFields] = useState<Record<string, ReviewField>>({});
  const [savingReview, setSavingReview] = useState(false);

  const loadDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("rfq_documents")
      .select(
        "id, original_filename, storage_path, mime_type, file_size_bytes, extraction_status, created_at, extracted_data"
      )
      .eq("rfq_id", rfqId)
      .order("created_at", { ascending: false });

    if (queryError) throw queryError;
    setDocuments((data ?? []) as DocumentRow[]);
  }, [rfqId]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        setLoading(true);
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/");
          return;
        }

        const { data: rfq, error: rfqError } = await supabase
          .from("rfqs")
          .select("id, rfq_number")
          .eq("id", rfqId)
          .single();

        if (rfqError) throw rfqError;
        if (!active) return;
        await loadDocuments();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load RFQ documents."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (rfqId) void initialize();

    return () => {
      active = false;
    };
  }, [rfqId, router, loadDocuments]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setMessage("");
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Choose a PDF, XLSX, or XLS file.");
      setSelectedFile(null);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be 10 MB or less.");
      setSelectedFile(null);
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  async function uploadDocument() {
    if (!selectedFile || uploading) return;

    setUploading(true);
    setError("");
    setMessage("");

    const supabase = createClient();

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) throw new Error("Please sign in again.");

      const safeName = selectedFile.name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${user.id}/${rfqId}/${Date.now()}-${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("rfq-documents")
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (storageError) throw storageError;

      const { error: metadataError } = await supabase
        .from("rfq_documents")
        .insert({
          rfq_id: rfqId,
          uploaded_by: user.id,
          original_filename: selectedFile.name,
          storage_path: storagePath,
          mime_type: selectedFile.type,
          file_size_bytes: selectedFile.size,
          extraction_status: "uploaded",
        });

      if (metadataError) {
        await supabase.storage.from("rfq-documents").remove([storagePath]);
        throw metadataError;
      }

      setSelectedFile(null);
      setMessage("Document uploaded securely.");
      await loadDocuments();

      const input = document.getElementById(
        "rfq-document-input"
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function extractDocument(documentRow: DocumentRow) {
    setExtractingId(documentRow.id);
    setError("");
    setMessage("");
    const supabase = createClient();

    try {
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("rfq-documents")
        .download(documentRow.storage_path);

      if (downloadError || !fileBlob) {
        throw downloadError || new Error("Could not download the stored document.");
      }

      const formData = new FormData();
      formData.append("file", fileBlob, documentRow.original_filename);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${apiUrl}/api/documents/parse`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Document extraction failed.");
      }

      const fields = result.data.extraction.fields as ExtractionResponse["data"]["extraction"]["fields"];
      const editable: Record<string, ReviewField> = {};
      Object.entries(fields).forEach(([key, field]) => {
        editable[key] = {
          value: field.value === null ? "" : String(field.value),
          source_text: field.source_text,
          status: field.status,
        };
      });

      setReviewFields(editable);
      setReviewingDocument(documentRow);
      setMessage(
        `Extracted ${result.data.extraction.extracted_count} of ${result.data.extraction.total_fields} fields. Review before saving.`
      );

      await supabase
        .from("rfq_documents")
        .update({
          extraction_status: "processing",
          extracted_data: result.data.extraction,
          extraction_error: null,
        })
        .eq("id", documentRow.id);

      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document extraction failed.");
    } finally {
      setExtractingId(null);
    }
  }

  function updateReviewField(key: string, value: string) {
    setReviewFields((current) => ({
      ...current,
      [key]: {
        ...current[key],
        value,
        status: value.trim() ? "reviewed" : "missing",
      },
    }));
  }

  async function saveReview() {
    if (!reviewingDocument || savingReview) return;

    setSavingReview(true);
    setError("");
    setMessage("");

    const supabase = createClient();

    try {
      const normalizedFields: Record<string, { value: string | number | null; source_text: string | null; status: string }> = {};

      Object.entries(reviewFields).forEach(([key, field]) => {
        let value: string | number | null = field.value.trim() || null;
        if (value !== null && ["annual_volume", "gross_weight_kg", "cycle_time_minutes"].includes(key)) {
          const parsed = Number(value.replace(/,/g, ""));
          value = Number.isFinite(parsed) ? parsed : null;
        }
        normalizedFields[key] = {
          value,
          source_text: field.source_text,
          status: value === null ? "missing" : "reviewed",
        };
      });

      const extractedCount = Object.values(normalizedFields).filter(
        (field) => field.value !== null
      ).length;

      const { error: updateError } = await supabase
        .from("rfq_documents")
        .update({
          extracted_data: {
            fields: normalizedFields,
            extracted_count: extractedCount,
            total_fields: Object.keys(normalizedFields).length,
            review_required: false,
            reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
            reviewed_at: new Date().toISOString(),
          },
          extraction_status: "reviewed",
          extraction_error: null,
        })
        .eq("id", reviewingDocument.id);

      if (updateError) throw updateError;

      setMessage("Estimator review saved successfully.");
      setReviewingDocument(null);
      setReviewFields({});
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save estimator review.");
    } finally {
      setSavingReview(false);
    }
  }

  async function deleteDocument(documentRow: DocumentRow) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `Delete "${documentRow.original_filename}"?`
    );
    if (!confirmed) return;

    setDeletingId(documentRow.id);
    setError("");
    setMessage("");

    const supabase = createClient();

    try {
      const { error: storageError } = await supabase.storage
        .from("rfq-documents")
        .remove([documentRow.storage_path]);

      if (storageError) throw storageError;

      const { error: rowError } = await supabase
        .from("rfq_documents")
        .delete()
        .eq("id", documentRow.id);

      if (rowError) throw rowError;

      setDocuments((current) =>
        current.filter((item) => item.id !== documentRow.id)
      );
      setMessage("Document deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-emerald-700"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wider text-emerald-700">
                QUOTEFORGE
              </p>
              <h1 className="text-2xl font-bold text-slate-950">
                RFQ documents
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Upload customer drawings, RFQ PDFs, or Excel sheets.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {message && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <p>{message}</p>
            </div>
          )}

          <div className="mt-7 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
            <label
              htmlFor="rfq-document-input"
              className="flex cursor-pointer flex-col items-center text-center"
            >
              <Upload size={30} className="text-emerald-700" />
              <span className="mt-3 font-semibold text-slate-900">
                Choose an RFQ document
              </span>
              <span className="mt-1 text-sm text-slate-600">
                PDF, XLSX or XLS · Maximum 10 MB
              </span>
            </label>

            <input
              id="rfq-document-input"
              type="file"
              accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileChange}
              className="sr-only"
            />

            {selectedFile && (
              <div className="mx-auto mt-5 flex max-w-lg items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
                <button
                  onClick={uploadDocument}
                  disabled={uploading}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            )}
          </div>

          {reviewingDocument && (
            <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-950">Review extracted RFQ details</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {reviewingDocument.original_filename} · Verify or correct every value before saving.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(reviewFields).map(([key, field]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-800">
                      {key.replaceAll("_", " ").replace(/\\b\\w/g, (c) => c.toUpperCase())}
                    </span>
                    <input
                      value={field.value}
                      onChange={(event) => updateReviewField(key, event.target.value)}
                      placeholder="Not found — enter value"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      {field.source_text ? `Source: ${field.source_text}` : "Not found in document"}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => void saveReview()}
                  disabled={savingReview}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {savingReview ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingReview ? "Saving..." : "Confirm and save review"}
                </button>
                <button
                  onClick={() => { setReviewingDocument(null); setReviewFields({}); }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Uploaded documents
              </h2>
              <span className="text-sm text-slate-500">
                {documents.length} file(s)
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-600">
                <Loader2 size={18} className="animate-spin" />
                Loading documents...
              </div>
            ) : documents.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                No documents uploaded for this RFQ yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {documents.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.mime_type === "application/pdf" ? (
                        <FileText className="shrink-0 text-red-600" size={22} />
                      ) : (
                        <FileSpreadsheet
                          className="shrink-0 text-emerald-700"
                          size={22}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.original_filename}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatBytes(item.file_size_bytes)} ·{" "}
                          {new Date(item.created_at).toLocaleString("en-IN")} ·{" "}
                          {item.extraction_status}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => void extractDocument(item)}
                        disabled={extractingId === item.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {extractingId === item.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        {extractingId === item.id ? "Extracting" : "Extract"}
                      </button>
                      <button
                        onClick={() => void deleteDocument(item)}
                        disabled={deletingId === item.id}
                        aria-label={`Delete ${item.original_filename}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        {deletingId === item.id ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Trash2 size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
