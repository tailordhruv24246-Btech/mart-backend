const fs = require('fs');
const path = require('path');
const multer = require('multer');

const productUploadDir = path.join(__dirname, '..', 'uploads', 'products');
const categoryUploadDir = path.join(__dirname, '..', 'uploads', 'categories');
const settingsUploadDir = path.join(__dirname, '..', 'uploads', 'settings');

if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
}
if (!fs.existsSync(categoryUploadDir)) {
  fs.mkdirSync(categoryUploadDir, { recursive: true });
}
if (!fs.existsSync(settingsUploadDir)) {
  fs.mkdirSync(settingsUploadDir, { recursive: true });
}

const productStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, productUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.jpg';
    cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const categoryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, categoryUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.jpg';
    cb(null, `category-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const settingsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, settingsUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.png';
    cb(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed.'));
};

const normalizeFiles = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  if (typeof files === 'object') {
    return Object.values(files)
      .flat()
      .filter(Boolean);
  }
  return [];
};

const createMultiFieldUpload = ({ storage, fieldNames, maxFiles = 5 }) => {
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      files: maxFiles,
      fileSize: 5 * 1024 * 1024,
    },
  }).fields(fieldNames.map((name) => ({ name, maxCount: maxFiles })));

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return next(err);
      req.files = normalizeFiles(req.files).slice(0, maxFiles);
      return next();
    });
  };
};

const createSingleFieldUpload = ({ storage, fieldNames }) => {
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024,
    },
  }).fields(fieldNames.map((name) => ({ name, maxCount: 1 })));

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return next(err);
      const files = normalizeFiles(req.files);
      req.file = files[0] || null;
      req.files = files;
      return next();
    });
  };
};

const uploadProductImages = createMultiFieldUpload({
  storage: productStorage,
  fieldNames: ['image_files', 'image_files[]', 'images', 'images[]', 'image_file', 'image', 'files'],
  maxFiles: 5,
});

const uploadCategoryImage = createSingleFieldUpload({
  storage: categoryStorage,
  fieldNames: ['image_file', 'image', 'file'],
});

const uploadSettingLogo = createSingleFieldUpload({
  storage: settingsStorage,
  fieldNames: ['logo_file', 'logo', 'image_file', 'image'],
});

module.exports = { uploadProductImages, uploadCategoryImage, uploadSettingLogo };