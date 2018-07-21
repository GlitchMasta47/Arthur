const ms = require('ms');
const moment = require('moment');
const sql = require('sqlite');
const askQuestion = require('../../functions/askQuestion');

const emojis = [ '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯' ];

const footer = {
	text: 'Command will cancel in 60 seconds. Type "cancel" to cancel now. Attempt 1 of 5.'
};

const titleEmbed = {
	title: 'Poll title',
	description: 'What would you like the poll title to be?',
	color: 0x007c29,
	footer: footer
};

const titleCondition = (title) => {
	return title;
};

const optionsEmbed = {
	title: 'Poll options',
	description: 'What poll options would you like?\nSeperate each option with a `|` character (below the backspace key)\nMaximum 10 options',
	color: 0x00892d,
	footer: footer
};

const optionsCondition = options => {
	return options.split('|')[1] && options.split('|').length <= 10;
};

const timeEmbed = {
	title: 'Poll time',
	description: 'How long would you like the poll to run for?\ne.g. `2d 8h 3m 14s` (maximum time of one week)',
	color: 0x008e2e,
	footer: footer
};

const timeCondition = string => {
	let time = parseTimeString(string);
	return time && time < 604800001;
};

function parseTimeString (string) {
	let time = 0;
	string.split(' ').forEach(s => {
		if (!s) return;
		let thingy = ms(s);
		if (!thingy) return;
		time += thingy;
	});
	return time;
}

function askeroni (channel, embed, authorID, message, attempt, condition, resolve, reject) {
	if (resolve) {
		askQuestion(channel, embed, authorID, message, attempt).then(object => {
			if (!condition(object.response)) return askeroni(channel, embed, authorID, object.message, object.attempt, condition, resolve, reject);
			resolve(object);
		}).catch(err => {
			reject(err);
		});
	} else {
		return new Promise((resolve, reject) => {
			askQuestion(channel, embed, authorID, message, attempt).then(object => {
				if (!condition(object.response)) return askeroni(channel, embed, authorID, object.message, object.attempt, condition, resolve, reject);
				resolve(object);
			}).catch(err => {
				reject(err);
			});
		});
	}
}

function emojiDescription (array) {
	let newArray = [];
	array.forEach((text, i) => {
		newArray.push(`${emojis[i]} ${text}`);
	});
	return newArray.join('\n');
}

async function addReactions (message, number) {
	for (let i = 0; i < number; i++) {
		await message.react(emojis[i]);
	}
}

function watch (message, options, endDate, client, embed) {
	client.reactionCollectors.set(message.id, {
		message: message,
		number: options.length,
		options: options,
		embed: embed
	});

	setTimeout(() => {
		finish(message.id, client)
	}, endDate - Date.now());
}

function finish (messageID, client) {
	let obj = client.reactionCollectors.get(messageID);
	let theseEmojis = emojis.slice(0, obj.options.length);
	let emojiObject = {};
	let { embed } = obj;

	obj.message.reactions.forEach(reaction => {
		if (!theseEmojis.includes(reaction.emoji.name)) return;
		emojiObject[reaction.emoji.name] = reaction.count - 1;
	});

	let total = calculateTotalResults(theseEmojis, emojiObject);
	embed.description = finishedEmojiDescription(theseEmojis, emojiObject, obj.options, total);
	embed.footer.text = 'Ended';
	embed.title = 'Poll finished: ' + embed.title;
	embed.color = 0x42f4a1;

	obj.message.channel.send({ embed: obj.embed });
	obj.message.delete().catch(() => {});
	sql.run('DELETE FROM pollReactionCollectors WHERE messageID = ?', [obj.message.id]).catch(console.log);
}

function finishedEmojiDescription (emojiArray, emojiObject, options, total) {
	let final = [];
	emojiArray.forEach((emoji, i) => {
		let count = emojiObject[emoji];
		let percentage = Math.round(count / total * 100);
		let fullEmojis = Math.round(percentage / 10);
		final.push(`${options[i]} - ${count} of ${total} - ${percentage}%\n${':large_blue_diamond:'.repeat(fullEmojis)}${':black_small_square:'.repeat(10 - fullEmojis)}`);
	});
	return final.join('\n');
}

function calculateTotalResults (emojiArray, emojiObject) {
	let total = 0;
	emojiArray.forEach(emoji => {
		total += emojiObject[emoji];
	});
	return total;
}

exports.run = async (message, a, s, client) => {
	let title;
	let options;
	let time;
	let embedMessage;

	try {
		let titleObj = await askeroni(message.channel, titleEmbed, message.author.id, undefined, 1, titleCondition);
		title = titleObj.response;
		let optionsObj = await askeroni(message.channel, optionsEmbed, message.author.id, titleObj.message, 1, optionsCondition);
		options = optionsObj.response;
		let timeObj = await askeroni(message.channel, timeEmbed, message.author.id, optionsObj.message, 1, timeCondition);
		time = timeObj.response;
		embedMessage = timeObj.message;
	} catch (e) {
		return e;
	}

	options = options.split('|');
	options.forEach((op, i) => {
		options[i] = op.replace(/^ ?(.*) ?$/g, '$1');
	});
	time = parseTimeString(time);

	let embed = {
		title: title,
		description: emojiDescription(options),
		footer: {
			text: 'Ends '
		},
		timestamp: moment(Date.now() + time).toISOString(),
		color: 0x00c140
	};

	embedMessage.edit({ embed });

	await addReactions(embedMessage, options.length).catch(() => {});

	let endDate = Date.now() + time;

	await sql.run('INSERT INTO pollReactionCollectors (channelID, messageID, options, endDate, embed) VALUES (?, ?, ?, ?, ?)',
		[embedMessage.channel.id, embedMessage.id, JSON.stringify(options), endDate, JSON.stringify(embed)]).catch(console.log);

	watch(embedMessage, options, endDate, client, embed);
};

exports.config = {
	enabled: true,
	permLevel: 3,
	aliases: [ 'startpoll', 'createpoll', 'newpoll', 'ask', 'askquestion', 'multiplechoice', 'multiplechoicepoll' ],
	perms: [ 'EMBED_LINKS', 'ADD_REACTIONS' ]
};

exports.help = {
	name: 'Poll',
	description: 'Start a poll',
	usage: 'poll',
	help: 'Start a poll. ',
	category: 'Other'
};

exports.watch = watch;
exports.emojis = emojis;