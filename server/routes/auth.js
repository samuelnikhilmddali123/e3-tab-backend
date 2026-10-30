const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');

// Fallback secret for development/debugging if env var fails
const JWT_SECRET = process.env.JWT_SECRET || 'ethree_fallback_secret_key_2024';
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ WARNING: Using fallback JWT_SECRET. Please configure process.env.JWT_SECRET in production.');
}

// Middleware to check if user is admin
const verifyAdmin = async (req, res, next) => {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        token = req.header('x-auth-token');
    }

    if (!token) return res.status(401).json({ message: 'Access denied' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin privileges required' });
        }
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        const userPosId = req.body.posId || 'pos1';
        user = await User.create({ name, email, password, role: role || 'customer', posId: userPosId });

        const token = jwt.sign({ id: user._id, role: user.role, email: user.email, posId: user.posId }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, posId: user.posId } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`[AUTH] Login attempt: ${email || 'UNDEFINED'}`);

        if (!email || !password) {
            console.log(`[AUTH] Login failed: Missing credentials. Email: ${!!email}, Password: ${!!password}`);
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Check if DB is connected
        if (mongoose.connection.readyState !== 1) {
            console.error('[AUTH] Database not connected. State:', mongoose.connection.readyState);
            return res.status(500).json({
                message: 'Database connection error',
                dbState: mongoose.connection.readyState
            });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        // Auto-fix admin password in live database
        if (email.toLowerCase() === 'admin@ethree.com' && password === 'Ethree@123') {
            if (!user) {
                console.log(`[AUTH] Auto-creating admin user`);
                user = await User.create({ name: 'Ethree Admin', email: 'admin@ethree.com', password: 'Ethree@123', role: 'superadmin', posId: 'all' });
            } else {
                console.log(`[AUTH] Auto-updating admin password`);
                user.password = 'Ethree@123';
                await user.save();
            }
        }

        if (!user) {
            console.log(`[AUTH] User not found: ${email}`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        console.log(`[AUTH] User found: ${user.email}, Role: ${user.role}`);

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log(`[AUTH] Password mismatch for: ${email}`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (!JWT_SECRET || JWT_SECRET === 'your_jwt_secret_key_here' || JWT_SECRET === 'ethree_fallback_secret_key_2024') {
            console.warn('[AUTH] WARNING: Using fallback or default JWT_SECRET.');
        }

        const token = jwt.sign({ id: user._id, role: user.role, email: user.email, posId: user.posId }, JWT_SECRET, { expiresIn: '1d' });
        console.log(`[AUTH] Login successful: ${email}`);
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, posId: user.posId } });
    } catch (err) {
        console.error('[AUTH] Login Exception:', err);
        res.status(500).json({
            message: 'Internal server error during login',
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            dbState: mongoose.connection.readyState,
            hasBody: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            hint: 'If dbState is 0, check MongoDB Atlas IP whitelisting for Vercel (0.0.0.0/0).'
        });
    }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Admin changes user password
 *     tags: [Auth]
 */
router.post('/change-password', verifyAdmin, async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.password = newPassword; // Will be hashed by pre-save
        await user.save();

        res.json({ message: `Password updated for ${email}` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/auth/change-email:
 *   post:
 *     summary: Admin changes user email
 *     tags: [Auth]
 */
router.post('/change-email', verifyAdmin, async (req, res) => {
    try {
        const { currentEmail, newEmail } = req.body;

        // Find user by current email
        const user = await User.findOne({ email: currentEmail });
        if (!user) {
            return res.status(404).json({ message: 'User with current email not found' });
        }

        // Check if new email is already taken
        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'New email is already in use' });
        }

        user.email = newEmail;
        await user.save();

        res.json({ message: `Email updated successfully for ${user.name}` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send dummy OTP
 *     tags: [Auth]
 */
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    // In production, integrate SMS/Email provider here
    res.json({ message: 'OTP sent successfully (Dummy: 123456)', email });
});

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify dummy OTP and login
 *     tags: [Auth]
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, name } = req.body;
        if (otp !== '123456') return res.status(400).json({ message: 'Invalid OTP' });

        let user = await User.findOne({ email });
        if (!user) {
            const userPosId = req.body.posId || 'pos1';
            user = await User.create({ name: name || 'User', email, password: randomPass, role: 'customer', posId: userPosId });
        }

        const token = jwt.sign({ id: user._id, role: user.role, email: user.email, posId: user.posId }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, posId: user.posId } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Auth]
 */
router.get('/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
