const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');

router.get('/', authMiddleware, getCart);
router.post('/items', authMiddleware, addCartItem);
router.put('/items/:itemId', authMiddleware, updateCartItem);
router.delete('/items/:itemId', authMiddleware, removeCartItem);
router.delete('/clear', authMiddleware, clearCart);

module.exports = router;
