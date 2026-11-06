const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const isConfigured = Boolean(
  (cloudName && apiKey && apiSecret) || process.env.CLOUDINARY_URL
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

function getFolder(subFolder = "") {
  const prefix = (process.env.CLOUDINARY_FOLDER_PREFIX || "dms").replace(/^\/+|\/+$/g, "");
  const cleanSub = String(subFolder || "").replace(/^\/+|\/+$/g, "");
  return cleanSub ? `${prefix}/${cleanSub}` : prefix;
}

module.exports = {
  cloudinary,
  isConfigured: () => isConfigured,
  getFolder
};

