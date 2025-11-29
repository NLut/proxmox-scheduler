// --- HELPER: Generate Random IP ---
export function generateStaticIP() {
  const octet = Math.floor(Math.random() * (250 - 100 + 1)) + 100;
  return `192.168.1.${octet}`;
}
