import 'dotenv/config';
import crypto from 'crypto';
import { supabase } from './lib/supabaseClient.js';
import { loginToProxmox} from './lib/login.js'
import { getNextInstanceId } from "./lib/helper.js"
import { createLXCContainer } from "./src/create_lxc.js"


// --- MAIN LOOP ---
async function main() {
  await loginToProxmox();
  console.log(`[${new Date().toISOString()}] Job Started...`);

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
    console.log(" No pending requests.");
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

      console.log(` Provisioned LXC ${targetVmid}`);
      currentIdCounter++;
    }
  }
  console.log(`[${new Date().toISOString()}] Finished.`);
}

main().then(() => process.exit(0));
