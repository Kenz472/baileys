const major = parseInt(process.versions.node.split('.')[0], 10);

if (major < 20) {
  console.error(`[!] gunakan Node.js V20 Untuk Run baileys Ini 🤙\n\nVersi Yang Di Kamu pakai Adalah Versi: ${process.versions.node} Update Versi Mu Jadi V20`);
  process.exit(1);
}


