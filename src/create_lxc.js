import { waitForTask, getNextInstanceId, sanitizeHostname} from "../lib/helper.js"
import { pmx } from '../lib/axios_create.js';
// --- CORE: Create LXC Container ---
//
const PMX_NODE = process.env.PMX_NODE;
export async function createLXCContainer(vmData, targetVmid) {
  console.log(`\n [Proxmox API] Creating LXC ${targetVmid}...`);

  const cleanHostname = sanitizeHostname(vmData.name);
  const templatePath = vmData.imageLocation; 
  console.log(vmData);
  
  if (!templatePath) {
    console.error(" Error: No image location provided in database.");
    return { success: false };
  }

  console.log(`   └─ Template: ${templatePath}`);

  try {
    //  PAYLOAD (SSH Key removed)
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
    console.error("  Proxmox Error:", error.response?.data?.errors || error.message);
    return { success: false };
  }
}


