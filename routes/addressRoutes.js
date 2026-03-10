const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getAddresses,
  createAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
} = require('../controllers/addressController');

router.get('/', authMiddleware, getAddresses);
router.post('/', authMiddleware, createAddress);
router.put('/:id', authMiddleware, updateAddress);
router.delete('/:id', authMiddleware, removeAddress);
router.patch('/:id/default', authMiddleware, setDefaultAddress);

module.exports = router;
