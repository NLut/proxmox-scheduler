import { pmx } from "./axios_create.js";
import { supabase } from "./supabaseClient.js"

// --- CONFIGURATION ---
const PMX_NODE = process.env.PMX_NODE;
// --- HELPER: Wait for Task ---
export async function waitForTask(upid) {
  let status = "running";
  while (status === "running") {
    await new Promise(r => setTimeout(r, 1000));
    const res = await pmx.get(`/nodes/${PMX_NODE}/tasks/${upid}/status`);
    status = res.data.data.status;
  }
  if (status !== "stopped") throw new Error(`Task failed: ${status}`);
}

// --- HELPER: Get Next ID ---
export async function getNextInstanceId() {
  const { data, error } = await supabase
    .from('instance_info')
    .select('instance_id')
    .order('instance_id', { ascending: false })
    .limit(1);

  if (error || !data.length) return 100;
  return data[0].instance_id + 1;
}
// --- HELPER: Sanitize Hostname ---
export function sanitizeHostname(name) {
  return name
    .toLowerCase()             // Convert to lowercase
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove anything else (like _ or !)
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}
