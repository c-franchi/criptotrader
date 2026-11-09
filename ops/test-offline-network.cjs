// Preload for unit tests only. Prevent an accidental real API/RPC call even if a mock is missing.
const { syncBuiltinESMExports } = require("node:module");
function offline() {
  throw new Error("OFFLINE_VALIDATION: outbound network disabled");
}
for (const name of ["node:http", "node:https"]) {
  const client = require(name);
  client.request = offline;
  client.get = offline;
}
const net = require("node:net");
net.connect = offline;
net.createConnection = offline;
net.Socket.prototype.connect = offline;
globalThis.fetch = async () => offline();
syncBuiltinESMExports();
