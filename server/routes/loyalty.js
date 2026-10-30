const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

/**
 * @swagger
 * /api/loyalty/{mobile}:
 *   get:
 *     summary: Get loyalty points balance
 */
router.get('/:mobile', async (req, res) => {
    try {
        const customer = await Customer.findOne({ mobile: req.params.mobile });
        res.json({ points: customer ? customer.points : 0 });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/loyalty/earn:
 *   post:
 *     summary: Earn points based on transaction amount
 */
router.post('/earn', async (req, res) => {
    try {
        const { mobile, amount, ticketId } = req.body;
        console.log(`Loyalty Earn Request: Mobile=${mobile}, Amount=${amount}, Ticket=${ticketId}`);

        if (!mobile) return res.status(400).json({ message: 'Mobile number required' });

        // Logic: 10 Points for every ₹100 spent
        const numAmount = Number(amount);
        const pointsEarned = Math.floor(numAmount / 100) * 10;

        if (pointsEarned === 0) {
            console.log(`No points earned for amount: ${numAmount}`);
            return res.json({ message: 'No points earned (< 100 spend)', points: 0, earned: 0 });
        }

        let customer = await Customer.findOne({ mobile });
        if (!customer) {
            console.log(`Creating new customer for mobile: ${mobile}`);
            customer = new Customer({ mobile, points: 0, transactions: [] });
        }

        const oldPoints = customer.points;
        customer.points += pointsEarned;
        customer.transactions.push({
            amount: numAmount,
            pointsChange: pointsEarned,
            type: 'EARN',
            ticketId
        });

        await customer.save();
        console.log(`Points updated for ${mobile}: ${oldPoints} -> ${customer.points} (+${pointsEarned})`);
        res.json({ message: 'Points added successfully', points: customer.points, earned: pointsEarned });
    } catch (err) {
        console.error('Loyalty Earn Route Error:', err);
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/loyalty/redeem:
 *   post:
 *     summary: Redeem 100 points for a reward
 */
router.post('/redeem', async (req, res) => {
    try {
        const { mobile, ticketId } = req.body;
        const COST_PER_REWARD = 100;

        const customer = await Customer.findOne({ mobile });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        if (customer.points < COST_PER_REWARD) {
            return res.status(400).json({ message: 'Insufficient points' });
        }

        customer.points -= COST_PER_REWARD;
        customer.transactions.push({
            amount: 0,
            pointsChange: -COST_PER_REWARD,
            type: 'REDEEM',
            ticketId
        });

        await customer.save();
        res.json({ message: 'Redemption successful', points: customer.points });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
