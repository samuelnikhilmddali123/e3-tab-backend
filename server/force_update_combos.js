const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://paradise:paradise@cluster0.z5p1n.mongodb.net/ethree?retryWrites=true&w=majority';

const ProductSchema = new mongoose.Schema({
    id: String,
    name: String,
    price: Number,
    description: String,
    category: String,
    version: String
});

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected!');

        console.log('Updating Combo Adult...');
        await Product.findOneAndUpdate(
            { id: '19' },
            {
                name: 'Combo Adult (6 Rides)',
                description: '6 Rides for Adults.',
                version: '3.5'
            }
        );

        console.log('Updating Combo Child...');
        await Product.findOneAndUpdate(
            { id: '20' },
            {
                name: 'Combo Child (6 Rides)',
                description: '6 Rides for Children.',
                version: '3.5'
            }
        );

        console.log('✅ Success! Combo ride counts updated to 6.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error updating database:', err);
        process.exit(1);
    }
}

run();
