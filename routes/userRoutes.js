const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');

router.use(authMiddleware);
router.get('/', roleMiddleware('admin', 'subadmin'), getUsers);
router.post('/', roleMiddleware('admin', 'subadmin'), createUser);
router.put('/:id', roleMiddleware('admin', 'subadmin'), updateUser);
router.delete('/:id', roleMiddleware('admin'), deleteUser);

module.exports = router;
