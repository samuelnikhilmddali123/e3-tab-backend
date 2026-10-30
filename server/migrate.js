const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load models
const User = require('./models/User');
const Ticket = require('./models/Ticket');
const Order = require('./models/Order');
const Booking = require('./models/Booking');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function migrate() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        const dataDir = path.join(__dirname, 'data');

        // Helper to safely clean data for Mongoose
        const cleanForMongoose = (data) => {
            const cleaned = { ...data };
            if (cleaned._id && (typeof cleaned._id !== 'string' || cleaned._id.length !== 24)) {
                delete cleaned._id;
            }
            // If fields are empty strings and schema expects specific types, handle them
            return cleaned;
        };

        // 1. Migrate Users
        console.log('Migrating Users...');
        try {
            const userData = JSON.parse(fs.readFileSync(path.join(dataDir, 'User.json'), 'utf8'));
            for (const user of userData) {
                if (!user.email) continue;
                const existing = await User.findOne({ email: user.email });
                if (!existing) {
                    await User.create(cleanForMongoose(user));
                    console.log(`User ${user.email} migrated.`);
                }
            }
        } catch (e) { console.error('Error migrating users:', e.message); }

        // 2. Migrate Tickets
        console.log('Migrating Tickets...');
        try {
            const ticketData = JSON.parse(fs.readFileSync(path.join(dataDir, 'Ticket.json'), 'utf8'));
            let ticketCount = 0;
            for (const ticket of ticketData) {
                const existing = await Ticket.findOne({ id: ticket.id });
                if (!existing) {
                    await Ticket.create(cleanForMongoose(ticket));
                    ticketCount++;
                }
            }
            console.log(`${ticketCount} new tickets migrated.`);
        } catch (e) {
            console.error('Error migrating tickets:', e.message);
            if (e.errors) {
                Object.keys(e.errors).forEach(key => {
                    console.error(` - Field "${key}": ${e.errors[key].message}`);
                });
            }
        }

        // 3. Migrate Orders
        console.log('Migrating Orders...');
        try {
            const orderData = JSON.parse(fs.readFileSync(path.join(dataDir, 'Order.json'), 'utf8'));
            let orderCount = 0;
            for (const order of orderData) {
                const cleaned = cleanForMongoose(order);
                // Orders often have refs. If migration IDs don't match, we might need to skip ref validation
                // or just remove the ref fields if they are invalid.
                if (cleaned.user && (typeof cleaned.user !== 'string' || cleaned.user.length !== 24)) delete cleaned.user;
                if (cleaned.items) {
                    cleaned.items = cleaned.items.map(item => {
                        const newItem = { ...item };
                        if (newItem.product && (typeof newItem.product !== 'string' || newItem.product.length !== 24)) delete newItem.product;
                        return newItem;
                    });
                }
                await Order.create(cleaned);
                orderCount++;
            }
            console.log(`${orderCount} orders migrated.`);
        } catch (e) { console.error('Error migrating orders:', e.message); }

        // 4. Migrate Bookings
        console.log('Migrating Bookings...');
        try {
            const bookingData = JSON.parse(fs.readFileSync(path.join(dataDir, 'Booking.json'), 'utf8'));
            let bookingCount = 0;
            for (const booking of bookingData) {
                const cleaned = cleanForMongoose(booking);
                if (cleaned.user && (typeof cleaned.user !== 'string' || cleaned.user.length !== 24)) delete cleaned.user;
                await Booking.create(cleaned);
                bookingCount++;
            }
            console.log(`${bookingCount} bookings migrated.`);
        } catch (e) { console.error('Error migrating bookings:', e.message); }

        console.log('Migration process finished.');
        process.exit(0);
    } catch (error) {
        console.error('Global Migration Error:', error);
        process.exit(1);
    }
}

migrate();
