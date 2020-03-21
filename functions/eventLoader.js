const Discord = require('discord.js');
const config = require('../../media/config.json');
const statusWebhookClient = new Discord.WebhookClient(config.statusLog.id, config.statusLog.token);
const errorWebhookClient = new Discord.WebhookClient(config.errorLog.id, config.errorLog.token);
const fs = require('fs');

let lastHeartbeat = Date.now();

function statusUpdate (embed, restart, client) {
	if (!(process.argv[2] && process.argv[2] === 'test')) statusWebhookClient.send({ embeds: [ embed ] }).then(() => {
		if (restart) setTimeout(() => {
			if (Date.now() - lastHeartbeat > 45000 || (client && client.ws.lastHeartbeatAck === false)) process.exit(0);
			else statusUpdate({
				title: 'Reconnected',
				timestamp: new Date().toISOString(),
				color: 0xb25bff
			});
		}, 60000);
	}).catch(() => {});
}

const errorLog = (error, stack, code) => {
	if (process.argv[2] && process.argv[2] === 'test') return; //code += ' | Testbot error';
	errorWebhookClient.send({
		embeds: [ {
			title: error,
			description: '```js\n' + stack + '```',
			footer: { text: code },
			timestamp: new Date().toISOString(),
			color: 0xff0000
		} ]
	}).catch((e) => {
		console.error('Error sending error webhook:\n', e.stack);
	});
};

const rawEvents = {
	MESSAGE_REACTION_ADD: 'messageReactionAdd',
	MESSAGE_REACTION_REMOVE: 'messageReactionRemove'
};

exports.load = client => {
	let start = Date.now();
	let events = fs.readdirSync('./events');
	console.log(`Loading ${events.length} events..`);
	process.stdout.write('   ');

	client.errorLog = errorLog;

	events.forEach(file => {
		let eventName = file.split('.')[0];
		let event = require(`../events/${file}`);

		client.on(eventName, event.bind(null, client));
		process.stdout.write(`${file.slice(0, -3)} `);
	});

	console.log();
	console.log(`Loaded ${events.length} events in ${Date.now() - start} ms.\n`);
	
	client.on('raw', async event => {
		if (!rawEvents.hasOwnProperty(event.t)) return;
		
		const { d: data } = event;
		const user = await client.users.fetch(data.user_id);
		const channel = client.channels.cache.get(data.channel_id); // || await user.createDM(); if using DM reactions
		
		if (!channel || channel.messages.cache.has(data.message_id)) return;
		
		const message = await channel.messages.fetch(data.message_id).catch(() => {});
		if (!message) return;

		const emojiKey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;
		const reaction = message.reactions.cache.get(emojiKey) ? await message.reactions.cache.get(emojiKey).fetch() : undefined;

		if (!reaction || !reaction.message) return;

		client.emit(rawEvents[event.t], reaction, user);
	});

	client.on('debug', d => {
		if (d.startsWith('[VOICE')) return;
		
		if (d.includes('Session invalidated')) statusUpdate({
			title: 'Session Invalidated',
			timestamp: new Date().toISOString(),
			color: 0xf47742,
		}, true);
		
		if (d.includes('eartbeat')) {
			lastHeartbeat = Date.now();
			return;
		}
		
		console.log(d);
	});

	client.on('error', err => {
		console.error('Client error\n', err);
		errorLog('Discord.JS Client Error', err, err.code);
	});

	client.on('shardReconnecting', id => {
		statusUpdate({
			title: 'Reconnecting',
			footer: {
				text: `Shard ${id}`
			},
			timestamp: new Date().toISOString(),
			color: 0xfff53a
		});
	});

	client.on('resume', (num, id) => {
		statusUpdate({
			title: 'Resumed',
			description: `${num} events replayed.`,
			footer: {
				text: `Shard ${id}`
			},
			timestamp: new Date().toISOString(),
			color: 0x39ffb0
		});
	});

	process.on('unhandledPromiseRejection', (err, promise) => {
		errorLog('Unhandled Promise Rejection', err.stack, err.code);
		console.error('Unhandled Promise Rejection at ', promise, ':\n', err);
	});

	process.on('unhandledRejection', (err, promise) => {
		errorLog('Unhandled Rejection Error', err.stack, err.code);
		console.error('Unhandled Promise Rejection at ', promise, ':\n', err);
	});

	process.on('uncaughtException', err => {
		console.error(err);
		fs.writeFileSync(__basedir + '/../media/temp/crash.txt', err.code + '\n' + err.stack);
		process.exit(err.code);
	});
};

exports.statusUpdate = statusUpdate;
exports.errorLog = errorLog;
