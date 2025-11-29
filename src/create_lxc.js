import { waitForTask , sanitizeHostname} from "../lib/helper.js"
import { pmx } from '../lib/axios_create.js';
import { generateStaticIP } from "../lib/generate_ip.js";

const PMX_NODE = process.env.PMX_NODE;
// --- CORE: Create LXC Container ---
async function createLXCContainer(vmData, targetVmid) {
  console.log(`\n[Proxmox API] Creating LXC ${targetVmid}...`);

  const cleanHostname = sanitizeHostname(vmData.name);
  const templatePath = vmData.imageLocation; 
  
  if (!templatePath) {
    console.error("  Error: No image location provided.");
    return { success: false };
  }

  const staticIp = generateStaticIP();
  const gateway = "192.168.1.1";
  console.log(`   └─ Network: ${staticIp} (GW: ${gateway})`);

  try {
    const payload = {
      vmid: targetVmid,
      ostemplate: templatePath, 
      hostname: cleanHostname,
      arch: 'amd64',
      cores: vmData.cpu,
      memory: vmData.ram,
      swap: 512,
      rootfs: `local-lvm:${vmData.storage}`, 
      net0: `name=eth0,bridge=vmbr0,ip=${staticIp}/24,gw=${gateway},firewall=1`,
      password: vmData.password,
      force: 0,
      start: 1 
    };

    // 1. CREATE
    const createRes = await pmx.post(`/nodes/${PMX_NODE}/lxc`, payload);
    console.log(`   └─ Task Started: ${createRes.data.data}`);
    await waitForTask(createRes.data.data);

    // 2. WAIT FOR BOOT
    console.log(`   └─ Waiting for boot (5s)...`);
    await new Promise(r => setTimeout(r, 5000));

    return { success: true, ip: staticIp };

  } catch (error) {
    console.error("  Proxmox Error:", error.response?.data?.errors || error.message);
    return { success: false };
  }
}
