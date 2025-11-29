import axios from 'axios';
import https from 'https';

const PMX_URL = process.env.PMX_URL;

// 1. Initialize Axios
export const pmx = axios.create({
  baseURL: `${PMX_URL}/api2/json`,
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});
