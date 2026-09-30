import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { Upload, X, Download, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { useImportContacts, type BulkImportResult } from "../../api";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  name?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  facebook?: string;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse CSV line handling quotes
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ""));
    return values;
  };

  const headers = parseLine(lines[0] || "").map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const nameIdx = headers.findIndex((h) => h.includes("name"));
  const waIdx = headers.findIndex(
    (h) => h.includes("whatsapp") || h.includes("phone") || h.includes("mobile") || h.includes("number"),
  );
  const emailIdx = headers.findIndex((h) => h.includes("email") || h.includes("mail"));
  const igIdx = headers.findIndex((h) => h.includes("instagram") || h.includes("ig") || h.includes("handle"));
  const fbIdx = headers.findIndex((h) => h.includes("facebook") || h.includes("fb"));

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const row: ParsedRow = {};
    if (nameIdx !== -1 && cols[nameIdx]) row.name = cols[nameIdx];
    if (waIdx !== -1 && cols[waIdx]) row.whatsapp = cols[waIdx];
    if (emailIdx !== -1 && cols[emailIdx]) row.email = cols[emailIdx];
    if (igIdx !== -1 && cols[igIdx]) row.instagram = cols[igIdx].replace(/^@+/, "");
    if (fbIdx !== -1 && cols[fbIdx]) row.facebook = cols[fbIdx];

    if (row.name || row.whatsapp || row.email || row.instagram || row.facebook) {
      rows.push(row);
    }
  }

  return rows;
}

export function ContactCsvImportModal({ isOpen, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportContacts();

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const processFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please select a valid .csv file");
      return;
    }
    setFile(f);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const rows = parseCsv(content);
      if (rows.length === 0) {
        toast.error("No valid contacts found in the CSV file. Please check column headers.");
      }
      setParsedRows(rows);
    };
    reader.readAsText(f);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
  };

  const handleDownloadSample = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "name,whatsapp,email,instagram,facebook\n" +
      "John Doe,+14155552671,john.doe@example.com,johndoe,10009283746510\n" +
      "Moola Jagadeshwar Reddy,+916303481401,moola@example.com,moola_reddy,\n" +
      "Jane Smith,,jane.smith@example.com,janesmith,\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "contacts_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (parsedRows.length === 0) return;

    importMutation.mutate(parsedRows, {
      onSuccess: (res) => {
        setImportResult(res);
        toast.success(`Import complete! ${res.imported} added, ${res.updated} updated.`);
      },
      onError: (err: any) => {
        toast.error(err.message || "Failed to import contacts");
      },
    });
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Contacts from CSV</h2>
            <p className="text-xs text-muted-foreground">
              Bulk upload customer contacts with names, WhatsApp numbers, emails, and Instagram handles.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-4">
          {!file && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <div className="mb-3 rounded-full bg-primary/10 p-3 text-primary">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-foreground">Click to upload or drag & drop CSV</p>
                <p className="mt-1 text-xs text-muted-foreground">Supported format: .csv (up to 1,000 rows)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                <span>Supported headers: <code>name</code>, <code>whatsapp</code>, <code>email</code>, <code>instagram</code>, <code>facebook</code></span>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download sample CSV
                </button>
              </div>
            </>
          )}

          {file && !importResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{parsedRows.length} valid contacts ready</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
                  Change file
                </Button>
              </div>

              {parsedRows.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="p-2 font-medium">Name</th>
                        <th className="p-2 font-medium">WhatsApp</th>
                        <th className="p-2 font-medium">Email</th>
                        <th className="p-2 font-medium">Instagram</th>
                        <th className="p-2 font-medium">Facebook</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedRows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="p-2 text-foreground font-medium">{r.name || "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.whatsapp || "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.email || "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.instagram ? `@${r.instagram}` : "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.facebook || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 5 && (
                    <div className="p-2 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border">
                      + {parsedRows.length - 5} more contacts will be imported
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Result view */}
          {importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-sm">Import Completed Successfully</p>
                  <p>
                    <strong>{importResult.imported}</strong> new contacts added,{" "}
                    <strong>{importResult.updated}</strong> existing contacts merged/updated.
                  </p>
                </div>
              </div>

              {importResult.failed > 0 && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{importResult.failed} rows failed to import:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleClose}>
            {importResult ? "Done" : "Cancel"}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={parsedRows.length === 0 || importMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${parsedRows.length} Contacts`
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
