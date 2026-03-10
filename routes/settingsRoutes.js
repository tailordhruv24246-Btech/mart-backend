const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { uploadSettingLogo } = require('../middleware/uploadMiddleware');
const { getSettings, getPublicSettings, updateSettings, downloadBackup } = require('../controllers/settingsController');
const { responseCache, clearResponseCache } = require('../middleware/responseCache');

const clearSettingsCache = clearResponseCache(['/api/settings/public', '/api/settings']);

router.get('/public', responseCache(120), getPublicSettings);
router.get('/', authMiddleware, roleMiddleware('admin', 'subadmin', 'salesman', 'delivery'), getSettings);
router.put('/', authMiddleware, roleMiddleware('admin', 'subadmin'), clearSettingsCache, uploadSettingLogo, updateSettings);
router.get('/backup', authMiddleware, roleMiddleware('admin'), downloadBackup);

module.exports = router;
