/**
 * Shared file upload utility — uses the base64-JSON contract expected by /api/upload/document.
 * Works in any authenticated context (admin, provider, seeker, profile).
 * For registration (unauthenticated), use uploadRegistrationDocument instead.
 */
export async function uploadFileAsBase64(file: File | Blob, filename?: string): Promise<string> {
  const name = filename ?? (file instanceof File ? file.name : "upload.bin");
  const mimeType = file.type || "application/octet-stream";

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data-URL prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch("/api/upload/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ base64, filename: name, mimeType }),
  });

  if (!res.ok) {
    let reason = "Upload failed";
    try {
      const body = await res.json();
      reason = body.message || reason;
    } catch {}
    throw new Error(reason);
  }

  const data = await res.json();
  return data.url as string;
}

/**
 * Upload a registration document before the user is authenticated.
 * Uses a separate public endpoint that does not require a session.
 */
export async function uploadRegistrationDocument(file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const res = await fetch("/api/upload/registration-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, filename: file.name, mimeType: file.type }),
  });

  if (!res.ok) {
    let reason = "Upload failed";
    try {
      const body = await res.json();
      reason = body.message || reason;
    } catch {}
    throw new Error(reason);
  }

  const data = await res.json();
  return data.url as string;
}
