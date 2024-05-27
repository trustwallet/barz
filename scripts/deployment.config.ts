import * as dotenv from 'dotenv';

dotenv.config();

export default {
    ENTRYPOINT_ADDRESS: process.env.ENTRYPOINT_ADDRESS ?? '',
    PRIVATE_KEY: process.env.PRIVATE_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000'
}