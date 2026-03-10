const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getWishlist,
  addWishlistItem,
  removeWishlistItem,
} = require('../controllers/wishlistController');

router.get('/', authMiddleware, getWishlist);
router.post('/:productId', authMiddleware, addWishlistItem);
router.delete('/:productId', authMiddleware, removeWishlistItem);

module.exports = router;
