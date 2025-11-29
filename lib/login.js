import { pmx } from "./axios_create.js";
const PMX_USER = process.env.PMX_USER;
const PMX_PASSWORD = process.env.PMX_PASSWORD;

// --- AUTH: Login ---
export async function loginToProxmox() {
  console.log(` Logging into Proxmox...`);
  try {
    const res = await pmx.post('/access/ticket', {
      username: PMX_USER,
      password: PMX_PASSWORD
    });
    const { ticket, CSRFPreventionToken } = res.data.data;
    pmx.defaults.headers.common['CSRFPreventionToken'] = CSRFPreventionToken;
    pmx.defaults.headers.common['Cookie'] = `PVEAuthCookie=${ticket}`;
    console.log(" Login Successful.");
  } catch (error) {
    console.error(" Proxmox Login Failed:", error.response?.data || error.message);
    process.exit(1);
  }
}
