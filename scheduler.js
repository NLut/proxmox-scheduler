import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';
import https from 'https';
import { supabase } from './supabaseClient.js';

// --- CONFIGURATION ---
const PMX_URL = process.env.PMX_URL;
const PMX_NODE = process.env.PMX_NODE;
const PMX_USER = process.env.PMX_USER;
const PMX_PASSWORD = process.env.PMX_PASSWORD;

// 1. Initialize Axios
const pmx = axios.create({
  baseURL: `${PMX_URL}/api2/json`,
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});


// --- AUTH: Login ---
async function loginToProxmox() {
  console.log(`🔑 Logging into Proxmox...`);
  try {
    const res = await pmx.post('/access/ticket', {
      username: PMX_USER,
      password: PMX_PASSWORD
    });
    const { ticket, CSRFPreventionToken } = res.data.data;
    pmx.defaults.headers.common['CSRFPreventionToken'] = CSRFPreventionToken;
    pmx.defaults.headers.common['Cookie'] = `PVEAuthCookie=${ticket}`;
    console.log("✅ Login Successful.");
  } catch (error) {
    console.error("❌ Proxmox Login Failed:", error.response?.data || error.message);
    process.exit(1);
  }
}

// --- HELPER: Wait for Task ---
async function waitForTask(upid) {
  let status = "running";
  while (status === "running") {
    await new Promise(r => setTimeout(r, 1000));
    const res = await pmx.get(`/nodes/${PMX_NODE}/tasks/${upid}/status`);
    status = res.data.data.status;
  }
  if (status !== "stopped") throw new Error(`Task failed: ${status}`);
}

// --- HELPER: Get Next ID ---
async function getNextInstanceId() {
  const { data, error } = await supabase
    .from('instance_info')
    .select('instance_id')
    .order('instance_id', { ascending: false })
    .limit(1);

  if (error || !data.length) return 100;
  return data[0].instance_id + 1;
}
// --- HELPER: Sanitize Hostname ---
function sanitizeHostname(name) {
  return name
    .toLowerCase()             // Convert to lowercase
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove anything else (like _ or !)
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}

// --- CORE: Create LXC Container ---
async function createLXCContainer(vmData, targetVmid) {
  console.log(`\n🔌 [Proxmox API] Creating LXC ${targetVmid}...`);

  const cleanHostname = sanitizeHostname(vmData.name);
  const templatePath = vmData.imageLocation; 
  console.log(vmData);
  
  if (!templatePath) {
    console.error("   ❌ Error: No image location provided in database.");
    return { success: false };
  }

  console.log(`   └─ Template: ${templatePath}`);

  try {
    // ⚡️ PAYLOAD (SSH Key removed)
    const payload = {
      vmid: targetVmid,
      ostemplate: templatePath, 
      hostname: cleanHostname,
      arch: 'amd64',
      cores: vmData.cpu,
      memory: vmData.ram,           // MB
      swap: 512,
      
      // Disk Config: storage:size_in_GB (e.g., local-lvm:10)
      rootfs: `local-lvm:${vmData.storage}`, 
      
      // Network (Standard bridge setup)
      net0: 'name=eth0,bridge=vmbr0,ip=dhcp,firewall=1',
      
      password: vmData.password,    // Root password
      
      force: 0,                     // Don't overwrite
      start: 1                      // Auto start
    };

    // 1. SEND REQUEST
    const createRes = await pmx.post(`/nodes/${PMX_NODE}/lxc`, payload);

    console.log(`   └─ Task Started: ${createRes.data.data}`);
    await waitForTask(createRes.data.data);

    // 2. WAIT FOR NETWORK
    console.log(`   └─ Waiting for Network...`);
    await new Promise(r => setTimeout(r, 5000));

    // 3. GET IP (Attempt)
    let ip = "Dynamic (Check Dashboard)";
    try {
      // Logic to fetch IP if needed later
    } catch (e) {}

    return { success: true, ip };

  } catch (error) {
    console.error("   ❌ Proxmox Error:", error.response?.data?.errors || error.message);
    return { success: false };
  }
}

// --- MAIN LOOP ---
async function main() {
  await loginToProxmox();
  console.log(`[${new Date().toISOString()}] 🤖 Job Started...`);

  // 1. Fetch Approved Requests
  const { data: requests, error } = await supabase
    .from('request_info')
    .select(`
      *,
      template:instance_os_template (
        os:os_template (*),
        hardware:instance_template (*)
      )
    `)
    .eq('request_status', 'approved')
    .is('is_create', false);

  if (error || !requests.length) {
    console.log("✅ No pending requests.");
    return;
  }

  let currentIdCounter = await getNextInstanceId();

  for (const req of requests) {
    const hardware = req.template?.hardware;
    const os = req.template?.os;
    if (!hardware || !os) continue;

    const generatedUser = "root";
    const generatedPass = crypto.randomBytes(8).toString('hex');
    const targetVmid = currentIdCounter;

    // Call Create Function
    const result = await createLXCContainer({
      name: req.instant_name,
      cpu: hardware.cpu_amount,
      ram: hardware.ram_amount,
      storage: hardware.storage_amount,
      imageLocation: os.image_location,
      username: generatedUser,
      password: generatedPass
    }, targetVmid);

    if (result.success) {
      // SAVE TO DB
      await supabase.from('instance_info').insert({
        instance_id: targetVmid,
        user_id: req.user_id,
        request_id: req.request_id,
        username: generatedUser,
        password: generatedPass,
        ip_addr: result.ip,
        machine_state: 'Running',
        create_date: new Date(),
        expire_date: req.end_datetime,
        update_by: req.user_id,
        update_date: new Date()
      });

      await supabase
        .from('request_info')
        .update({ request_status: 'created', is_create: true, last_edit_datetime: new Date() })
        .eq('request_id', req.request_id);

      console.log(`✅ Provisioned LXC ${targetVmid}`);
      currentIdCounter++;
    }
  }
  console.log(`[${new Date().toISOString()}] Finished.`);
}

main().then(() => process.exit(0));
