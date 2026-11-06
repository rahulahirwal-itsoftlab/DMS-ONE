const streamifier = require("stream");
const { cloudinary, isConfigured, getFolder } = require("../config/cloudinary");

/**
 * Extracts Cloudinary public_id from a Cloudinary URL or publicId string.
 * Example: https://res.cloudinary.com/cloud/image/upload/v12345/dms/products/prod-1.jpg -> dms/products/prod-1
 */
function extractPublicId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== "string") return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("cloudinary.com/")) {
    // If it's already a public_id (doesn't have http or slashes indicating domain)
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("/")) {
      return trimmed.replace(/\.[^/.]+$/, ""); // strip extension if present
    }
    return null;
  }
  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split("/");
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1) return null;
    let parts = pathParts.slice(uploadIndex + 1);
    // Remove version tag (e.g. v123456789)
    if (parts.length > 0 && /^v\d+$/.test(parts[0])) {
      parts = parts.slice(1);
    }
    const fullPathWithExt = parts.join("/");
    // Remove extension
    return fullPathWithExt.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

/**
 * Upload a Buffer directly to Cloudinary.
 */
function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      const error = new Error("Cloudinary credentials are not configured in environment variables.");
      error.code = "CLOUDINARY_NOT_CONFIGURED";
      return reject(error);
    }

    if (!buffer || !Buffer.isBuffer(buffer)) {
      return reject(new Error("A valid file buffer is required for Cloudinary upload."));
    }

    const folder = getFolder(options.folder || "general");
    const uploadOptions = {
      folder,
      resource_type: options.resource_type || "auto",
      overwrite: true,
      ...options
    };

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve({
        secure_url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        resource_type: result.resource_type,
        created_at: result.created_at
      });
    });

    const readable = new streamifier.Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

/**
 * Upload a local file path to Cloudinary (used for migration of existing files).
 */
async function uploadFile(filePath, options = {}) {
  if (!isConfigured()) {
    const error = new Error("Cloudinary credentials are not configured in environment variables.");
    error.code = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }
  const folder = getFolder(options.folder || "general");
  const uploadOptions = {
    folder,
    resource_type: options.resource_type || "auto",
    ...options
  };
  const result = await cloudinary.uploader.upload(filePath, uploadOptions);
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    resource_type: result.resource_type,
    created_at: result.created_at
  };
}

/**
 * Delete an asset from Cloudinary by public_id or Cloudinary URL.
 */
async function deleteAsset(publicIdOrUrl, options = {}) {
  if (!isConfigured() || !publicIdOrUrl) return { result: "skipped" };
  const publicId = extractPublicId(publicIdOrUrl) || publicIdOrUrl;
  if (!publicId || publicId.startsWith("/uploads/")) return { result: "skipped_local" };

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: options.resource_type || "image",
      ...options
    });
    return result;
  } catch (err) {
    console.warn(`[Cloudinary] Failed to delete asset ${publicId}:`, err.message);
    return { result: "error", error: err.message };
  }
}

/**
 * Replace an existing asset:
 * Only deletes old asset after new upload successfully completes.
 */
async function replaceAsset(newBuffer, oldPublicIdOrUrl, options = {}) {
  const uploadResult = await uploadBuffer(newBuffer, options);
  if (oldPublicIdOrUrl) {
    deleteAsset(oldPublicIdOrUrl, options).catch((err) => {
      console.warn("[Cloudinary] Background deletion of old asset failed:", err?.message || err);
    });
  }
  return uploadResult;
}

/**
 * Upload multiple file buffers in parallel.
 */
async function uploadMultipleBuffers(files = [], options = {}) {
  if (!Array.isArray(files) || !files.length) return [];
  return Promise.all(
    files.map((file) => uploadBuffer(file.buffer || file, {
      ...options,
      original_filename: file.originalname
    }))
  );
}

module.exports = {
  isConfigured,
  getFolder,
  extractPublicId,
  uploadBuffer,
  uploadFile,
  deleteAsset,
  replaceAsset,
  uploadMultipleBuffers
};

