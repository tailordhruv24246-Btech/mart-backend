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

const uploadProductImages = multer({
  storage: productStorage,
  fileFilter,
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
}).array('image_files', 5);

const uploadCategoryImage = multer({
  storage: categoryStorage,
  fileFilter,
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
}).single('image_file');

const uploadSettingLogo = multer({
  storage: settingsStorage,
  fileFilter,
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
}).single('logo_file');

module.exports = { uploadProductImages, uploadCategoryImage, uploadSettingLogo };