const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  createInventoryAdjustment,
  getInventoryAdjustments,
} = require('../controllers/inventoryController');

router.use(authMiddleware, roleMiddleware('admin', 'subadmin'));
router.get('/adjustments', getInventoryAdjustments);
router.post('/adjustments', createInventoryAdjustment);

module.exports = router;
