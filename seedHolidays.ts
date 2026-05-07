import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/udarsy';

const GlobalEventSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    desc: { type: String },
    date: { type: String, required: true },
    endDate: { type: String },
    category: { type: String, required: true },
    color: { type: String, required: true },
    isGlobal: { type: Boolean, default: true },
}, { timestamps: true });

const GlobalEvent = mongoose.model('GlobalEvent', GlobalEventSchema);

const moroccoHolidays = [
    { id:'ma25-01', title:"New Year's Day", date:"2025-01-01", category:'personal', color:'green', desc:'Moroccan Public holiday' },
    { id:'ma25-02', title:"Independence Manifesto", date:"2025-01-11", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-03', title:"Amazigh New Year", date:"2025-01-14", category:'personal', color:'green', desc:'Moroccan Public holiday' },
    { id:'ma25-04', title:"Eid al-Fitr", date:"2025-03-31", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma25-05', title:"Labour Day", date:"2025-05-01", category:'personal', color:'dark', desc:'Moroccan Public holiday' },
    { id:'ma25-06', title:"Eid al-Adha", date:"2025-06-07", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma25-07', title:"Islamic New Year", date:"2025-06-27", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma25-08', title:"Throne Day", date:"2025-07-30", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-09', title:"Oued Ed-Dahab Day", date:"2025-08-14", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-10', title:"Revolution Day", date:"2025-08-20", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-11', title:"Youth Day", date:"2025-08-21", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-12', title:"Prophet's Birthday", date:"2025-09-05", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma25-13', title:"Green March Day", date:"2025-11-06", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma25-14', title:"Independence Day", date:"2025-11-18", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    
    { id:'ma26-01', title:"New Year's Day", date:"2026-01-01", category:'personal', color:'green', desc:'Moroccan Public holiday' },
    { id:'ma26-02', title:"Independence Manifesto", date:"2026-01-11", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-03', title:"Amazigh New Year", date:"2026-01-14", category:'personal', color:'green', desc:'Moroccan Public holiday' },
    { id:'ma26-04', title:"Eid al-Fitr", date:"2026-03-20", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma26-05', title:"Labour Day", date:"2026-05-01", category:'personal', color:'dark', desc:'Moroccan Public holiday' },
    { id:'ma26-06', title:"Eid al-Adha", date:"2026-05-27", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma26-07', title:"Islamic New Year", date:"2026-06-17", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma26-08', title:"Throne Day", date:"2026-07-30", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-09', title:"Oued Ed-Dahab Day", date:"2026-08-14", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-10', title:"Revolution Day", date:"2026-08-20", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-11', title:"Youth Day", date:"2026-08-21", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-12', title:"Prophet's Birthday", date:"2026-08-26", category:'personal', color:'blue', desc:'Moroccan Public holiday' },
    { id:'ma26-13', title:"Green March Day", date:"2026-11-06", category:'personal', color:'red', desc:'Moroccan Public holiday' },
    { id:'ma26-14', title:"Independence Day", date:"2026-11-18", category:'personal', color:'red', desc:'Moroccan Public holiday' },
].map(ev => ({ ...ev, isGlobal: true }));

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');
        
        for (const holiday of moroccoHolidays) {
            await GlobalEvent.findOneAndUpdate({ id: holiday.id }, holiday, { upsert: true });
        }
        
        console.log('Moroccan holidays seeded successfully.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
