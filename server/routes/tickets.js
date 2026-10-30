const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a new ticket
 *     tags: [Tickets]
 */
router.post('/', async (req, res) => {
    try {
        const ticketData = req.body;

        if (Array.isArray(ticketData)) {
            // Bulk insert for multiple ride tickets
            const newTickets = await Ticket.insertMany(ticketData, { ordered: false });
            return res.status(201).json(newTickets);
        }

        // Single insert
        if (!ticketData.items || (ticketData.amount === undefined)) {
            return res.status(400).json({ message: 'Invalid ticket data' });
        }

        // Ensure posId is provided from frontend or fallback to default
        if (!ticketData.posId) {
            ticketData.posId = 'pos1'; // Legacy fallback
        }

        const newTicket = await Ticket.create(ticketData);
        res.status(201).json(newTicket);
    } catch (err) {
        // If it's a duplicate key error (E11000) during bulk insert, we still return success 
        // as some might have succeeded or they are already there.
        if (err.code === 11000) {
            return res.status(201).json({ message: 'Tickets synced (some duplicates skipped)' });
        }
        console.error('Ticket Create Error:', err.message);
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/tickets:
 *   get:
 *     summary: Get all tickets
 *     tags: [Tickets]
 */
router.get('/', async (req, res) => {
    try {
        let query = {};
        // Use a query parameter ?posId=someval to filter tickets
        if (req.query.posId && req.query.posId !== 'all') {
            query.posId = req.query.posId;
        }

        // Sort by createdAt desc (newest first)
        const tickets = await Ticket.find(query).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/tickets/stats:
 *   get:
 *     summary: Get today's ticket statistics
 *     tags: [Tickets]
 */
router.get('/stats', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // We only count tickets created today
        const query = {
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            parentId: { $exists: false } // Only count master tickets for revenue/count
        };

        if (req.query.posId && req.query.posId !== 'all') {
            query.posId = req.query.posId;
        }

        const tickets = await Ticket.find(query);

        const stats = {
            total: tickets.length,
            revenue: tickets.reduce((sum, t) => sum + (t.amount || 0), 0),
            // For scanned/pending, we look at individual ride tickets (isCoupon: true)
            scanned: await Ticket.countDocuments({
                createdAt: { $gte: startOfDay, $lte: endOfDay },
                isCoupon: true,
                status: 'used'
            }),
            pending: await Ticket.countDocuments({
                createdAt: { $gte: startOfDay, $lte: endOfDay },
                isCoupon: true,
                status: 'valid'
            })
        };

        res.json(stats);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/tickets/clear-all:
 *   delete:
 *     summary: Delete all tickets (Clear History)
 *     tags: [Tickets]
 */
router.delete('/clear-all', async (req, res) => {
    try {
        await Ticket.deleteMany({});
        res.json({ message: 'All tickets cleared successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     summary: Get a ticket by ID (search by TXN ID or Mongo ID)
 *     tags: [Tickets]
 */
router.get('/:id', async (req, res) => {
    try {
        let ticket;
        // Search by TXN ID (id field) first, then Mongo ID (_id)
        ticket = await Ticket.findOne({ id: req.params.id });
        if (!ticket && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            ticket = await Ticket.findById(req.params.id);
        }

        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
        res.json(ticket);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/tickets/{id}/verify:
 *   post:
 *     summary: Verify and redeem a ticket
 *     tags: [Tickets]
 */
router.post('/:id/verify', async (req, res) => {
    try {
        let ticket;
        // Search by TXN ID (id field) first, then Mongo ID (_id)
        ticket = await Ticket.findOne({ id: req.params.id });
        if (!ticket && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            ticket = await Ticket.findById(req.params.id);
        }

        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        if (ticket.status === 'used') {
            return res.status(400).json({
                message: 'Ticket already used',
                ticket: ticket
            });
        }

        // Expiration Logic: Check if the ticket's creation date is today
        const ticketDate = new Date(ticket.createdAt).toLocaleDateString();
        const currentDate = new Date().toLocaleDateString();

        if (ticketDate !== currentDate) {
            ticket.status = 'invalid'; // Optional: Mark as invalid if expired
            await ticket.save();
            return res.status(400).json({
                message: 'Ticket expired',
                ticket: ticket
            });
        }

        if (ticket.status === 'invalid') {
            return res.status(400).json({ message: 'Ticket is invalid' });
        }

        // Mark as used
        ticket.status = 'used';
        ticket.usedAt = new Date();
        await ticket.save();

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const { auth, admin } = require('../middleware/auth');

module.exports = router;
