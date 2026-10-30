const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true, index: true },
    points: { type: Number, default: 0 },
    transactions: [{
        date: { type: Date, default: Date.now },
        amount: Number,
        pointsChange: Number, // Positive for EARN, Negative for REDEEM
        type: { type: String, enum: ['EARN', 'REDEEM'] },
        ticketId: String
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
