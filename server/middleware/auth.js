const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ethree_fallback_secret_key_2024';

const auth = (req, res, next) => {
    // Check for token in Authorization header or x-auth-token
    let token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        token = req.header('x-auth-token');
    }

    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

const optionalAuth = (req, res, next) => {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        token = req.header('x-auth-token');
    }

    if (!token) return next();

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        // ignore invalid token for public browse
    }
    next();
};

const admin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
        return res.status(403).json({ message: 'Access denied. Admin or Superadmin only.' });
    }
    next();
};

module.exports = { auth, optionalAuth, admin };
