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
const { responseCache, clearResponseCache } = require('../middleware/responseCache');

const clearReportCache = clearResponseCache(['/api/reports']);

router.get('/daily-sales', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(20), getDailySales);
router.get('/monthly-sales', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(30), getMonthlySales);
router.get('/profit', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(25), getProfitReport);
router.get('/stock', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(30), getStockReport);
router.get('/daily-closing', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(20), getDailyClosingReport);
router.get('/expenses', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(20), getExpenseEntries);
router.post('/expenses', authMiddleware, roleMiddleware('admin', 'subadmin'), clearReportCache, addExpenseEntry);
router.get('/reorder-suggestions', authMiddleware, roleMiddleware('admin', 'subadmin'), responseCache(30), getReorderSuggestions);

module.exports = router;
