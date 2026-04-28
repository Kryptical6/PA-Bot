import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
export const sql = neon(process.env.DATABASE_URL);
