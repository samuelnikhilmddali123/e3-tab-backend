const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // The TXN- ID
    amount: { type: Number, required: true },
    date: { type: String, required: true }, // Display date string
    items: { type: Array, default: [] }, // Array of cart items
    status: { type: String, enum: ['valid', 'used', 'invalid'], default: 'valid' },
    mobile: { type: String },
    paymentMode: { type: String, enum: ['cash', 'upi'], default: 'cash' },
    createdBy: { type: String }, // User name or ID who issued the ticket
    posId: { type: String }, // POS Branch the ticket was issued from
    createdAt: { type: Date, default: Date.now },
    isCoupon: { type: Boolean, default: false },
    parentId: { type: String }, // If it's a sub-ticket
    usedAt: { type: Date }
});

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
