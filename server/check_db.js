const mongoose = require('mongoose');
const uri = "mongodb+srv://Vercel-Admin-ethree_data:zEx6FeaB7XIaDOgr@ethree-data.asjikyd.mongodb.net/ethree_pos?retryWrites=true&w=majority";

async function run() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    console.log(users.map(u => u.email));
    
    // check verify user
    const user = await db.collection('users').findOne({email: 'verify1@ethree.com'});
    console.log("Verify user exists:", !!user);
    if (user) {
        const bcrypt = require('bcryptjs');
        const match = await bcrypt.compare('verify123', user.password);
        console.log("Password matches verify123:", match);
    }
    process.exit(0);
}
run().catch(console.error);
