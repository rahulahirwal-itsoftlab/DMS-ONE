const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinaryService = require("../services/cloudinaryService");

const uploadRoot = path.join(__dirname, "../../uploads");

function ensureLocalDir(folder) {
  fs.mkdirSync(path.join(uploadRoot, folder), { recursive: true });
}

// Memory storage keeps file buffers in memory so they are never written to disk
const memoryStorage = multer.memoryStorage();

function fileFilter(allowedMimes, errorMsg) {
  return (req, file, cb) => {
    if (!allowedMimes || allowedMimes.some((mime) => file.mimetype.startsWith(mime) || file.mimetype === mime)) {
      return cb(null, true);
    }
    const error = new Error(errorMsg || "Invalid file type.");
    error.status = 400;
    cb(error);
  };
}

// Raw multer instances with memory storage
const rawProductMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter(["image/"], "Only image files (JPG, PNG, WebP, etc.) are allowed for product images.")
});

const rawLogoMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter(["image/"], "Only image files are allowed for logos.")
});

const rawRewardMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter(["image/"], "Only image files are allowed for reward images.")
});

const rawAvatarMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(["image/"], "Only image files are allowed for profile avatars.")
});

const rawInvoiceMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: fileFilter(
    ["image/", "application/pdf", "application/vnd.openxmlformats-officedocument", "application/vnd.ms-excel", "text/csv"],
    "Only images, PDF, and spreadsheet documents are allowed for invoices."
  )
});

const rawChatMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

/**
 * Uploads an in-memory file buffer to Cloudinary.
 * If Cloudinary is not configured, gracefully falls back to local disk storage for local development.
 */
async function processFile(file, folderName) {
  if (!file || !file.buffer) return file;

  if (cloudinaryService.isConfigured()) {
    try {
      const result = await cloudinaryService.uploadBuffer(file.buffer, {
        folder: folderName,
        resource_type: "auto"
      });
      file.cloudinaryUrl = result.secure_url;
      file.cloudinaryPublicId = result.public_id;
      file.path = result.secure_url;
      file.filename = result.public_id;
      file.format = result.format;
      file.bytes = result.bytes;
      return file;
    } catch (err) {
      console.error(`[Cloudinary] Upload failed for ${folderName}:`, err.message);
      throw err;
    }
  }

  // Graceful local fallback if Cloudinary credentials are not provided
  try {
    ensureLocalDir(folderName);
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeBase = path.basename(file.originalname || "upload", ext).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const filename = `${Date.now()}-${safeBase}${ext}`;
    const targetPath = path.join(uploadRoot, folderName, filename);
    fs.writeFileSync(targetPath, file.buffer);

    file.path = `/uploads/${folderName}/${filename}`.replace(/\\/g, "/");
    file.filename = filename;
    console.warn(`[Upload Warning] Cloudinary not configured. File saved locally to: ${file.path}`);
    return file;
  } catch (localErr) {
    console.error("[Upload Error] Local fallback save failed:", localErr);
    throw localErr;
  }
}

/**
 * Creates wrapped multer middleware that uploads directly to Cloudinary
 */
function createUploadMiddleware(multerInstance, folderName) {
  return {
    single: (fieldName) => {
      const uploadHandler = multerInstance.single(fieldName);
      return (req, res, next) => {
        uploadHandler(req, res, async (err) => {
          if (err) return next(err);
          if (!req.file) return next();
          try {
            await processFile(req.file, folderName);
            next();
          } catch (uploadErr) {
            next(uploadErr);
          }
        });
      };
    },
    array: (fieldName, maxCount = 10) => {
      const uploadHandler = multerInstance.array(fieldName, maxCount);
      return (req, res, next) => {
        uploadHandler(req, res, async (err) => {
          if (err) return next(err);
          if (!req.files || !req.files.length) return next();
          try {
            await Promise.all(req.files.map((f) => processFile(f, folderName)));
            next();
          } catch (uploadErr) {
            next(uploadErr);
          }
        });
      };
    },
    fields: (fields) => {
      const uploadHandler = multerInstance.fields(fields);
      return (req, res, next) => {
        uploadHandler(req, res, async (err) => {
          if (err) return next(err);
          try {
            if (req.files) {
              const allFiles = Object.values(req.files).flat();
              await Promise.all(allFiles.map((f) => processFile(f, folderName)));
            }
            next();
          } catch (uploadErr) {
            next(uploadErr);
          }
        });
      };
    }
  };
}

const productImageUpload = createUploadMiddleware(rawProductMulter, "products");
const organizationLogoUpload = createUploadMiddleware(rawLogoMulter, "organizations");
const creditRewardUpload = createUploadMiddleware(rawRewardMulter, "rewards");
const profileAvatarUpload = createUploadMiddleware(rawAvatarMulter, "profiles");
const invoiceUpload = createUploadMiddleware(rawInvoiceMulter, "invoices");
const chatUpload = createUploadMiddleware(rawChatMulter, "chat");

/**
 * Returns the public image/file URL.
 * Automatically gives Cloudinary HTTPS URL when available.
 */
function publicPath(folder, file) {
  if (!file) return null;
  if (typeof file === "string") return file;
  if (file.cloudinaryUrl) return file.cloudinaryUrl;
  if (file.path && (file.path.startsWith("http://") || file.path.startsWith("https://"))) {
    return file.path;
  }
  if (file.filename && (file.filename.startsWith("http://") || file.filename.startsWith("https://"))) {
    return file.filename;
  }
  if (file.filename) {
    return `/uploads/${folder}/${file.filename}`.replace(/\\/g, "/");
  }
  return file.path || null;
}

module.exports = {
  productImageUpload,
  organizationLogoUpload,
  creditRewardUpload,
  profileAvatarUpload,
  invoiceUpload,
  chatUpload,
  publicPath,
  processFile
};
