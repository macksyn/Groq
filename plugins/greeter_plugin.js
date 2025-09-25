import { ButtonHelpers } from '../lib/helpers.js';

export const info = {
  name: 'greeter',
  version: '1.0.0',
  author: 'Jules',
  description: 'A simple plugin to demonstrate button functionality.',
  commands: [
    {
      name: 'greet',
      description: 'Sends a greeting with buttons.'
    }
  ]
};

export default async function greeterHandler(m, sock, config) {
  if (!m.body || !m.body.startsWith(config.PREFIX)) return;

  const args = m.body.slice(config.PREFIX.length).trim().split(' ');
  const command = args[0].toLowerCase();

  if (command === 'greet') {
    const buttons = [
      { buttonId: 'hi_button', buttonText: { displayText: 'Hi!' }, type: 1 },
      { buttonId: 'bye_button', buttonText: { displayText: 'Bye!' }, type: 1 }
    ];

    await ButtonHelpers.sendButtons(sock, m.from, 'Hello!', 'Please select an option:', buttons);
  }
}

export const buttonHandlers = {
  'hi_button': async (m, sock, config) => {
    await m.reply('Hello there!');
  },
  'bye_button': async (m, sock, config) => {
    await m.reply('Goodbye!');
  }
};