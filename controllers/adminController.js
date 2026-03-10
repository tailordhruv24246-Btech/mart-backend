const db = require('../config/db');
const { sendSuccess } = require('../utils/response');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDashboardStats = async (req, res, next) => {
  try {
    const [[usersSummary]] = await db.query(
      `SELECT
         COUNT(*) AS total_users,
         COALESCE(SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END), 0) AS total_customers,
         COALESCE(SUM(CASE WHEN role IN ('admin','subadmin','salesman','delivery') THEN 1 ELSE 0 END), 0) AS total_staff
       FROM users`
    );

    const [[productsSummary]] = await db.query(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active_products
       FROM products`
    );

    const [[ordersSummary]] = await db.query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN LOWER(status) IN ('pending','processing','packed','shipped') THEN 1 ELSE 0 END), 0) AS pending_orders,
         COALESCE(SUM(total_amount), 0) AS gross_order_amount
       FROM orders`
    );

    const [[salesSummary]] = await db.query(
      `SELECT
         COUNT(*) AS total_transactions,
         COALESCE(SUM(total_amount), 0) AS total_sales
       FROM sales`
    );

    return sendSuccess(
      res,
      {
        total_users: toNumber(usersSummary?.total_users),
        total_customers: toNumber(usersSummary?.total_customers),
        total_staff: toNumber(usersSummary?.total_staff),
        total_products: toNumber(productsSummary?.total_products),
        active_products: toNumber(productsSummary?.active_products),
        total_orders: toNumber(ordersSummary?.total_orders),
        pending_orders: toNumber(ordersSummary?.pending_orders),
        gross_order_amount: toNumber(ordersSummary?.gross_order_amount),
        total_transactions: toNumber(salesSummary?.total_transactions),
        total_sales: toNumber(salesSummary?.total_sales),
      },
      'Dashboard stats fetched'
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = { getDashboardStats };
