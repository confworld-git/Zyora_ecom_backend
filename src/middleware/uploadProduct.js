import multer from "multer";

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;
const VIDEO_SIZE_LIMIT = 100 * 1024 * 1024;
const supportedVideoTypes = new Set(["video/mp4", "video/webm", "video/ogg"]);

const storage = {
  _handleFile(_req, file, callback) {
    const sizeLimit =
      file.fieldname === "images" ? IMAGE_SIZE_LIMIT : VIDEO_SIZE_LIMIT;
    const chunks = [];
    let size = 0;
    let oversized = false;

    file.stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > sizeLimit) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) {
        chunks.push(chunk);
      }
    });
    file.stream.on("limit", () => {
      oversized = true;
      chunks.length = 0;
    });
    file.stream.on("error", callback);
    file.stream.on("end", () => {
      callback(null, {
        buffer: oversized ? Buffer.alloc(0) : Buffer.concat(chunks),
        size: oversized ? sizeLimit + 1 : size,
      });
    });
  },
  _removeFile(_req, file, callback) {
    delete file.buffer;
    callback(null);
  },
};

const fileFilter = (req, file, cb) => {
  if (
    file.fieldname === "images" &&
    file.mimetype.startsWith("image/")
  ) {
    cb(null, true);
  } else if (
    file.fieldname === "video" &&
    supportedVideoTypes.has(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Upload image files and MP4, WebM, or Ogg videos only"), false);
  }
};

const uploadProductMedia = multer({
  storage,
  fileFilter,
  limits: {
    files: 5,
    fileSize: VIDEO_SIZE_LIMIT,
  },
});

export default uploadProductMedia;