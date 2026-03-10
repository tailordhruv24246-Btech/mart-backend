const express = require('express');
const router = express.Router();
const { createPosBill, getInvoiceData, getPosSales } = require('../controllers/posController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.post('/bill', authMiddleware, roleMiddleware('admin', 'subadmin', 'salesman'), createPosBill);
router.get('/invoice/:saleId', authMiddleware, getInvoiceData);
router.get('/sales', authMiddleware, roleMiddleware('admin', 'subadmin', 'salesman'), getPosSales);

module.exports = router;
