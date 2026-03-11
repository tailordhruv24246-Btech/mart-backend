const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

let dailyExpensesTableReady = false;

const getDayRange = (dateString) => {
  const datePart = String(dateString || '').slice(0, 10);
  return [
    `${datePart} 00:00:00`,
    `${datePart} 23:59:59`,
  ];
};

const ensureDailyExpensesTable = async () => {
  if (dailyExpensesTableReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS daily_expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      expense_date DATE NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      payment_method ENUM('cash','upi','card','bank','other') DEFAULT 'cash',
      note TEXT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_expense_date (expense_date),
      INDEX idx_expense_category (category)
    ) ENGINE=InnoDB`
  );

  dailyExpensesTableReady = true;
};

// GET /api/reports/daily-sales?date=2024-01-01
const getDailySales = async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [dayStart, dayEnd] = getDayRange(targetDate);

    const [summary] = await db.query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(total_amount) as total_sales,
        SUM(tax_amount) as total_tax,
        SUM(discount_amount) as total_discount,
        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'upi' THEN total_amount ELSE 0 END) as upi_sales
       FROM sales WHERE sale_date BETWEEN ? AND ?`,
      [dayStart, dayEnd]
    );

    const [profitData] = await db.query(
      `SELECT COALESCE(SUM(profit_amount), 0) as total_profit FROM sales_items si
       JOIN sales s ON s.id = si.sale_id WHERE s.sale_date BETWEEN ? AND ?`,
      [dayStart, dayEnd]
    );

    const [topProducts] = await db.query(
      `SELECT si.product_name, SUM(si.quantity) as qty_sold, SUM(si.total_amount) as revenue
       FROM sales_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.sale_date BETWEEN ? AND ?
       GROUP BY si.product_id, si.product_name ORDER BY qty_sold DESC LIMIT 10`,
      [dayStart, dayEnd]
    );

    return sendSuccess(res, {
      date: targetDate,
      summary: { ...summary[0], total_profit: profitData[0].total_profit },
      top_products: topProducts,
    }, 'Daily sales report');
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/monthly-sales?year=2024&month=1
const getMonthlySales = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;

    const [dailyBreakdown] = await db.query(
      `SELECT DATE(sale_date) as date,
        COUNT(*) as transactions, SUM(total_amount) as sales
       FROM sales
       WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?
       GROUP BY DATE(sale_date) ORDER BY date`,
      [targetYear, targetMonth]
    );

    const [monthlySummary] = await db.query(
      `SELECT COUNT(*) as total_transactions, SUM(total_amount) as total_sales,
        SUM(tax_amount) as total_tax, SUM(discount_amount) as total_discount
       FROM sales WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?`,
      [targetYear, targetMonth]
    );

    const [profit] = await db.query(
      `SELECT COALESCE(SUM(si.profit_amount), 0) as total_profit
       FROM sales_items si JOIN sales s ON s.id = si.sale_id
       WHERE YEAR(s.sale_date) = ? AND MONTH(s.sale_date) = ?`,
      [targetYear, targetMonth]
    );

    return sendSuccess(res, {
      year: targetYear, month: targetMonth,
      summary: { ...monthlySummary[0], total_profit: profit[0].total_profit },
      daily_breakdown: dailyBreakdown,
    }, 'Monthly sales report');
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/profit?from=2024-01-01&to=2024-01-31
const getProfitReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];
    const [fromStart] = getDayRange(fromDate);
    const [, toEnd] = getDayRange(toDate);

    const [overallProfit] = await db.query(
      `SELECT
        SUM(si.total_amount) as total_revenue,
        SUM(si.purchase_price * si.quantity) as total_cost,
        SUM(si.profit_amount) as gross_profit,
        ROUND(SUM(si.profit_amount) / NULLIF(SUM(si.total_amount), 0) * 100, 2) as profit_margin_percent
       FROM sales_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.sale_date BETWEEN ? AND ?`,
      [fromStart, toEnd]
    );

    const [categoryProfit] = await db.query(
      `SELECT c.name as category, SUM(si.total_amount) as revenue,
        SUM(si.profit_amount) as profit
       FROM sales_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE s.sale_date BETWEEN ? AND ?
       GROUP BY p.category_id, c.name ORDER BY profit DESC`,
      [fromStart, toEnd]
    );

    return sendSuccess(res, {
      period: { from: fromDate, to: toDate },
      overall: overallProfit[0],
      by_category: categoryProfit,
    }, 'Profit report');
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/stock
const getStockReport = async (req, res, next) => {
  try {
    const [stock] = await db.query(
      `SELECT p.id, p.name, p.sku, p.barcode, p.reorder_level, c.name as category,
        COALESCE(SUM(pb.quantity_remaining), 0) as current_stock,
        CASE WHEN COALESCE(SUM(pb.quantity_remaining), 0) <= p.reorder_level THEN 'LOW' ELSE 'OK' END as stock_status
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.quantity_remaining > 0
       WHERE p.is_active = 1
       GROUP BY p.id ORDER BY current_stock ASC`
    );
    return sendSuccess(res, stock, 'Stock report fetched');
  } catch (error) {
    next(error);
  }
};

// POST /api/reports/expenses
const addExpenseEntry = async (req, res, next) => {
  try {
    await ensureDailyExpensesTable();

    const {
      expense_date,
      category,
      amount,
      payment_method = 'cash',
      note,
    } = req.body;

    const safeAmount = Number(amount);
    if (!category || !Number.isFinite(safeAmount) || safeAmount <= 0) {
      return sendError(res, 'category and amount (>0) are required.', 400);
    }

    const targetDate = expense_date || new Date().toISOString().split('T')[0];

    const [result] = await db.query(
      `INSERT INTO daily_expenses (expense_date, category, amount, payment_method, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [targetDate, String(category).trim(), safeAmount, payment_method, note || null, req.user?.id || null]
    );

    const [rows] = await db.query('SELECT * FROM daily_expenses WHERE id = ?', [result.insertId]);
    return sendSuccess(res, rows[0], 'Expense added successfully', 201);
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/expenses?date=YYYY-MM-DD
const getExpenseEntries = async (req, res, next) => {
  try {
    await ensureDailyExpensesTable();

    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [rows] = await db.query(
      `SELECT de.*, u.name as created_by_name
       FROM daily_expenses de
       LEFT JOIN users u ON u.id = de.created_by
       WHERE de.expense_date = ?
       ORDER BY de.created_at DESC`,
      [targetDate]
    );

    const [[summary]] = await db.query(
      `SELECT
         COALESCE(SUM(amount), 0) as total_expense,
         COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0) as cash_expense,
         COALESCE(SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END), 0) as upi_expense,
         COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0) as card_expense
       FROM daily_expenses
       WHERE expense_date = ?`,
      [targetDate]
    );

    return sendSuccess(res, { date: targetDate, expenses: rows, summary }, 'Expense entries fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/daily-closing?date=YYYY-MM-DD
const getDailyClosingReport = async (req, res, next) => {
  try {
    await ensureDailyExpensesTable();

    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [dayStart, dayEnd] = getDayRange(targetDate);

    const [posRows] = await db.query(
      `SELECT payment_method, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as transactions
       FROM sales
       WHERE sale_date BETWEEN ? AND ?
       GROUP BY payment_method`,
      [dayStart, dayEnd]
    );

    const [orderRows] = await db.query(
      `SELECT payment_method, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders
       FROM orders
       WHERE status = 'delivered'
         AND (
           (delivered_at IS NOT NULL AND delivered_at BETWEEN ? AND ?)
           OR (delivered_at IS NULL AND created_at BETWEEN ? AND ?)
         )
       GROUP BY payment_method`,
      [dayStart, dayEnd, dayStart, dayEnd]
    );

    const [[expenseSummary]] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expense FROM daily_expenses WHERE expense_date = ?`,
      [targetDate]
    );

    const collect = (rows, key, metric = 'amount') => Number(rows.find((row) => row.payment_method === key)?.[metric] || 0);

    const pos = {
      cash: collect(posRows, 'cash'),
      upi: collect(posRows, 'upi'),
      card: collect(posRows, 'card'),
      other: posRows
        .filter((row) => !['cash', 'upi', 'card'].includes(row.payment_method))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      total: posRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      transactions: posRows.reduce((sum, row) => sum + Number(row.transactions || 0), 0),
    };

    const online = {
      cod: collect(orderRows, 'cod'),
      upi: collect(orderRows, 'upi'),
      card: collect(orderRows, 'card'),
      other: orderRows
        .filter((row) => !['cod', 'upi', 'card'].includes(row.payment_method))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      total: orderRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      orders: orderRows.reduce((sum, row) => sum + Number(row.orders || 0), 0),
    };

    const grossCollection = Number(pos.total || 0) + Number(online.total || 0);
    const totalExpense = Number(expenseSummary?.total_expense || 0);
    const netCollection = grossCollection - totalExpense;

    return sendSuccess(res, {
      date: targetDate,
      pos,
      online,
      expenses: totalExpense,
      gross_collection: grossCollection,
      net_collection: netCollection,
    }, 'Daily closing report fetched');
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/reorder-suggestions?days=30&lead_days=7
const getReorderSuggestions = async (req, res, next) => {
  try {
    const days = Math.max(parseInt(req.query.days, 10) || 30, 1);
    const leadDays = Math.max(parseInt(req.query.lead_days, 10) || 7, 1);

    const [rows] = await db.query(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.reorder_level,
         COALESCE(stock.current_stock, 0) as current_stock,
         COALESCE(sales30.qty_sold, 0) as qty_sold_last_days,
         ROUND(COALESCE(sales30.qty_sold, 0) / ?, 2) as avg_daily_sale,
         COALESCE(latest_batch.purchase_price, 0) as last_purchase_price
       FROM products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity_remaining) as current_stock
         FROM product_batches
         GROUP BY product_id
       ) stock ON stock.product_id = p.id
       LEFT JOIN (
         SELECT si.product_id, SUM(si.quantity) as qty_sold
         FROM sales_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.sale_date >= (NOW() - INTERVAL ? DAY)
         GROUP BY si.product_id
       ) sales30 ON sales30.product_id = p.id
       LEFT JOIN (
         SELECT pb.product_id, pb.purchase_price
         FROM product_batches pb
         JOIN (
           SELECT product_id, MAX(id) as max_batch_id
           FROM product_batches
           GROUP BY product_id
         ) latest ON latest.max_batch_id = pb.id
       ) latest_batch ON latest_batch.product_id = p.id
       WHERE p.is_active = 1`,
      [days, days]
    );

    const suggestions = rows
      .map((row) => {
        const reorderLevel = Number(row.reorder_level || 0);
        const stock = Number(row.current_stock || 0);
        const avgDaily = Number(row.avg_daily_sale || 0);
        const velocityNeed = Math.ceil(avgDaily * leadDays);
        const minNeed = Math.max(reorderLevel - stock, 0);
        const velocityGap = Math.max(velocityNeed - stock, 0);
        const suggestedQty = Math.max(minNeed, velocityGap, 0);

        return {
          ...row,
          reorder_level: reorderLevel,
          current_stock: stock,
          avg_daily_sale: avgDaily,
          suggested_qty: suggestedQty,
          estimated_cost: Number((suggestedQty * Number(row.last_purchase_price || 0)).toFixed(2)),
        };
      })
      .filter((row) => row.suggested_qty > 0)
      .sort((a, b) => b.suggested_qty - a.suggested_qty);

    const totalEstimated = suggestions.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);

    return sendSuccess(res, {
      days,
      lead_days: leadDays,
      total_items: suggestions.length,
      total_estimated_cost: Number(totalEstimated.toFixed(2)),
      suggestions,
    }, 'Reorder suggestions fetched');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDailySales,
  getMonthlySales,
  getProfitReport,
  getStockReport,
  addExpenseEntry,
  getExpenseEntries,
  getDailyClosingReport,
  getReorderSuggestions,
};
