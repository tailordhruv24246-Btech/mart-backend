const express = require('express');
const router = express.Router();
const {
	getDailySales,
	getMonthlySales,
	getProfitReport,
	getStockReport,
	addExpenseEntry,
	getExpenseEntries,
	getDailyClosingReport,
	getReorderSuggestions,
} = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.get('/daily-sales', authMiddleware, roleMiddleware('admin', 'subadmin'), getDailySales);
router.get('/monthly-sales', authMiddleware, roleMiddleware('admin', 'subadmin'), getMonthlySales);
router.get('/profit', authMiddleware, roleMiddleware('admin', 'subadmin'), getProfitReport);
router.get('/stock', authMiddleware, roleMiddleware('admin', 'subadmin'), getStockReport);
router.get('/daily-closing', authMiddleware, roleMiddleware('admin', 'subadmin'), getDailyClosingReport);
router.get('/expenses', authMiddleware, roleMiddleware('admin', 'subadmin'), getExpenseEntries);
router.post('/expenses', authMiddleware, roleMiddleware('admin', 'subadmin'), addExpenseEntry);
router.get('/reorder-suggestions', authMiddleware, roleMiddleware('admin', 'subadmin'), getReorderSuggestions);

module.exports = router;
