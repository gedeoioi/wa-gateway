/**
 * PM2 process definition for a VPS deployment without Docker.
 *
 *   npm i -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup      # survive a reboot
 *
 * Two processes are declared: the API and the broadcast worker. Running them
 * separately keeps slow broadcasts from blocking HTTP requests.
 */
module.exports = {
  apps: [
    {
      name: "wa-gateway-api",
      script: "src/server.js",
      cwd: __dirname,
      instances: 1, // Keep at 1: Baileys sockets are stateful per device
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      // Give in-flight sends time to finish before the process dies
      kill_timeout: 15000,
      wait_ready: false,
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        // Point these at persistent storage, NOT the deploy folder, so a
        // redeploy does not wipe the WhatsApp pairing.
        WA_SESSION_DIR: "/var/lib/wa-gateway/wa-sessions",
        UPLOAD_DIR: "/var/lib/wa-gateway/uploads",
      },
      error_file: "/var/log/wa-gateway/api-error.log",
      out_file: "/var/log/wa-gateway/api-out.log",
      time: true,
    },
    {
      name: "wa-gateway-worker",
      script: "src/queue/worker.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      kill_timeout: 30000, // Let the current broadcast finish its batch
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/wa-gateway/worker-error.log",
      out_file: "/var/log/wa-gateway/worker-out.log",
      time: true,
    },
  ],
};
