const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String },
        price: { type: Number },
        quantity: { type: Number }
    }],
    totalAmount: { type: Number, required: true },
    txnid: { type: String, index: true },
    customerName: { type: String },
    customerPhone: { type: String },
    customerEmail: { type: String },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    orderStatus: { type: String, enum: ['placed', 'preparing', 'completed', 'cancelled'], default: 'placed' },
    paymentMethod: { type: String },
    paymentGateway: { type: String },
    gatewayTransactionId: { type: String },
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
