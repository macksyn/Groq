import EventEmitter from 'events';
import PluginManager from '../lib/pluginManager.js';

// Mock socket with EventEmitter and minimal API used by handlers
const ev = new EventEmitter();
const sock = {
  ev,
  sendMessage: async (jid, msg) => console.log('sock.sendMessage ->', jid, JSON.stringify(msg)),
  groupMetadata: async (id) => ({ subject: 'Test Group', participants: [{ id: '111@s.whatsapp.net' }] }),
  profilePictureUrl: async () => null
};

// Create a dummy plugin that listens for participant events
const filename = 'test_welcome_plugin.js';
const pluginInfo = {
  name: 'Test Welcome',
  filename,
  handler: async () => {},
    info: {
    groupEventHandlers: {
      'participants.add': async (sockArg, { id, participants }, logger) => {
        calls.push({ type: 'add', id, participants });
        console.log('PLUGIN HANDLER: participants.add ->', id, participants);
      },
      'participants.remove': async (sockArg, { id, participants }, logger) => {
        calls.push({ type: 'remove', id, participants });
        console.log('PLUGIN HANDLER: participants.remove ->', id, participants);
      }
    }
  },
  initialized: true,
  enabled: true,
  hasScheduledTasks: false,
  scheduledTasks: [],
  commands: [],
  aliases: []
};

// Array to capture calls for assertions
const calls = [];

// Register plugin in PluginManager (simulate loaded plugin)
PluginManager.plugins.set(filename, pluginInfo);
PluginManager.pluginStates.set(filename, { filename, enabled: true });

// Set references - this will register the groupParticipants forwarder
PluginManager.setReferences(sock, { PREFIX: '.' }, {});

// Emit a single add event (use Baileys event name 'group-participants.update')
console.log('\n--- Emitting single add event ---');
ev.emit('group-participants.update', { id: '123@g.us', participants: ['222@s.whatsapp.net'], action: 'add' });

// Emit a single remove event
setTimeout(() => {
  console.log('\n--- Emitting single remove event ---');
  ev.emit('group-participants.update', { id: '123@g.us', participants: ['333@s.whatsapp.net'], action: 'remove' });
}, 200);

// Emit array of updates
setTimeout(() => {
  console.log('\n--- Emitting array of updates ---');
  ev.emit('group-participants.update', [ { id: '123@g.us', participants: ['444@s.whatsapp.net'], action: 'add' } ]);
}, 400);

// Print captured calls then exit
setTimeout(() => {
  console.log('\nCaptured plugin calls:', calls);
  process.exit(0);
}, 1000);
