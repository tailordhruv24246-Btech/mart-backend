const express = require('express');
const router = express.Router();
const { placeOrder, getUserOrders, getOrderById, updateOrderStatus, assignDeliveryBoy, cancelOrder, getAllOrders } = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.post('/', authMiddleware, placeOrder);
router.get('/my', authMiddleware, getUserOrders);
router.get('/all', authMiddleware, roleMiddleware('admin', 'subadmin', 'delivery'), getAllOrders);
router.get('/:id', authMiddleware, getOrderById);
router.post('/:id/cancel', authMiddleware, cancelOrder);
router.put('/:id/status', authMiddleware, roleMiddleware('admin', 'subadmin', 'delivery'), updateOrderStatus);
router.put('/:id/assign-delivery', authMiddleware, roleMiddleware('admin', 'subadmin'), assignDeliveryBoy);

module.exports = router;
