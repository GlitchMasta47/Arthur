const moment = require('moment');

const { getSubredditMeme } = require('../fun/meme');
const findMember = require('../../functions/findMember.js');

const VERSION = '0.1.3';
const THEME_COLOR = 0xfcba03;
const COIN_EMOJI = '<:duckcoin:696521259256905779>';

let init = false;
let curDuck;

setTimeout(async () => {
	let enUS = i18n._aliases.get('en-US');
	enUS.set('duck', 'nik');
	enUS.set('duk', 'nik');
	enUS.set('leet', 'nik');
	enUS.set('yikes', 'isaac'); // this is great code don't worry

	let obj = await sql.get('SELECT MAX(duckID) FROM ducks');
	curDuck = obj['MAX(duckID'];

	init = true;
}, 2000);

let meta = {
	help: {
		run: help,
		help: 'Get help using the advanced Duck system.',
		aliases: [ '?', 'halp' ]
	},
	balance: {
		run: balance,
		help: 'Check how much DuckCoin you have.',
		aliases: [ 'coins', 'bal' ]
	},
	transfer: {
		run: transfer,
		help: 'Transfer DuckCoin to someone else.',
		description: 'This transfer is instant and only reversible by the transfer recepient (via another transfer).',
		usage: '<amount> <user>',
		aliases: [ 'send' ]
	},
	daily: {
		run: daily,
		help: 'Get daily DuckCoin.',
		description: 'Random amount of coins given, increased if your duck is (or ducks are) happy.'
	},
	leaderboard: {
		run: leaderboard,
		help: 'View the DuckCoin leaderboard.',
		usage: '[page]',
		aliases: [ 'top', 'lb' ]
	},
	image: {
		run: image,
		help: 'Get a duck image.',
		description: 'If you have ducks, they might even reward you for adoring them.'
	},
	changelog: {
		run: changelog,
		help: 'View the update changelog.'
	}
};

let aliases = {};

Object.keys(meta).forEach(key => {
	let keyAliases = meta[key].aliases;
	if (!keyAliases) return;
	if (typeof keyAliases === 'string') aliases[keyAliases] = meta[key];
	else for (const alias of keyAliases)
		aliases[alias] = meta[key];
});

function help(message) {
	if (message.args[0] && (meta[message.args[0].toLowerCase()] || aliases[message.args[0].toLowerCase()])) {
		let arg = meta[message.args[0].toLowerCase()] || aliases[message.args[0].toLowerCase()];
		
		message.channel.send({ embed: {
			color: THEME_COLOR,
			author: {
				name: message.args[0].charAt(0).toUpperCase() + message.args[0].substring(1).toLowerCase()
			},
			description: arg.description ? arg.help + '\n' + arg.description : arg.help + (arg.aliases ? '\nAliases: `' + arg.aliases.join('`, `') + '`' : ''),
			footer: {
				text: '<> denotes a required argument and [] denotes an optional argument. Please don\'t type them.'
			}
		}});
	} else {
		message.channel.send({ embed: {
			color: THEME_COLOR,
			author: {
				name: 'Quack.'
			},
			description: Object.keys(meta).map(key => {
				return `\`${key}\`: ${meta[key].help}`
			}).join('\n'),
			footer: {
				text: `Use ${message.prefix}duck help <argument> to view help for a specific argument. Don't include the brackets, nerd.`
			}
		}});
	}
}

async function balance(message) {
	let member = message.member;
	
	if (message.args[0]) {
		let obj = message.client.findMember(message, message.suffix);
		if (obj) member = obj.member;
	}
	
	let coins = await getUser(member.id);
	coins = coins.coins;
	
	message.channel.send({ embed: {
		title: `${member.displayName}'s Balance`,
		description: `${COIN_EMOJI} ${coins}`,
		color: THEME_COLOR
	}});
}

async function transfer(message) {
	if (!message.args[0]) return message.channel.send('Please provide a sum to transfer (see `help transfer`).');
	if (!message.args[1]) return message.channel.send('Please provide a user to transfer to (see `help transfer`).');
	
	let obj = findMember(message, message.suffix.slice(message.args[0].length + 1));
	if (!obj) return message.channel.send('Could not find provided user.');
	if (obj.user.id === message.author.id) return message.channel.send('Circular transfers aren\'t that helpful, unfortunately.');
	
	let [ user ] = await Promise.all([
		sql.get('SELECT coins FROM duckEconomy WHERE userID = ?', [ message.author.id ]),
		sql.run('INSERT OR IGNORE INTO duckEconomy (userID) VALUES (?)', [ message.author.id ])
	]);
	if (!user) await sql.run('INSERT INTO duckEconomy (userID) VALUES (?)', [ message.author.id ]);
	
	let num = parseInt(message.args[0]);
	if (!num) return message.channel.send('Invalid transfer amount provided (see `help transfer`).');
	if (num < 0) return message.channel.send('Heh. Nice try.');
	if (num === 0) return message.channel.send('Zero coins successfully transfered. Dweeb.');
	if (num > user.coins) return message.channel.send('You can\'t afford that transfer.');
	
	await Promise.all([
		sql.run('UPDATE duckEconomy SET coins = coins - ? WHERE userID = ?', [ num, message.author.id ]),
		sql.run('UPDATE duckEconomy SET coins = coins + ? WHERE userID = ?', [ num, obj.user.id ])
	]);
	
	message.channel.send({embed: {
		description: `${message.member.displayName}, you've transfered ${COIN_EMOJI}${num} to ${obj.member.displayName}.`,
		color: THEME_COLOR
	}})
}

async function daily(message) {
	let user = await getUser(message.author.id);
	let { coins } = user;
	
	let today = moment().format('M-DD');
	if (user.lastDaily && user.lastDaily === today) return message.channel.send('You already claimed your daily DuckCoin. Nerd.');
	
	let out = '';
	let base = Math.round(Math.random() * 40) + 30;
	let modifier = 1; // TODO: Implement duck(s) happiness modifier
	
	let day = moment().format('M-D');
	if (day === '1-18') {
		out += '\nIt\'s national duck day! Coins multiplied by 10.';
		modifier *= 10;
	}
	
	if (day === '2-24') {
		out += '\nIt\'s our overlord\'s birthday! Coins multiplied by 100.';
		modifier *= 100;
	}
	
	let add = base * modifier;
	coins += add;
	
	message.channel.send({embed: {
		title: 'Daily DuckCoins!',
		color: THEME_COLOR,
		description: `${add} DuckCoins added for a total of ${COIN_EMOJI} ${coins}${out}`
	}});
	
	sql.run('UPDATE duckEconomy SET coins = ?, lastDaily = ? WHERE userID = ?', [ coins, today, message.author.id ]);
}

const ENTRIES_PER_PAGE = 10;
const emojiArray = [ '👑', ':two:', ':three:', ':four:', ':five:', ':six:', ':seven:', ':eight:', ':nine:', ':keycap_ten:' ];
const numberToEmoji = num => {
	if (num <= 9) return emojiArray[num - 1];
	else return num + '.';
};
async function leaderboard(message) {
	let page = 1;
	
	if (message.args[0]) {
		page = parseInt(message.args[0]);
		if (!page) return message.channel.send('Invalid page number.');
		if (page < 1) return message.channel.send('Please choose a page number of at least 1.');	
	}
	
	let entries = await sql.all(`SELECT userID, coins FROM duckEconomy`);
	
	let maxPage = Math.ceil(entries.length / ENTRIES_PER_PAGE);
	if (page > maxPage) return message.channel.send(`Please choose a page number within the page range (max of ${maxPage} at current)`);

	entries = entries.sort((a, b) => a.coins < b.coins ? 1 : -1);
	
	let userLocation = entries.findIndex(entry => entry.userID === message.author.id);
	let userPage = Math.floor(userLocation / ENTRIES_PER_PAGE);
	
	entries = entries.slice(page * ENTRIES_PER_PAGE - ENTRIES_PER_PAGE, page * ENTRIES_PER_PAGE);
	let num = page * ENTRIES_PER_PAGE - ENTRIES_PER_PAGE + 1;

	let formattedEntries = [];
	for (let entry of entries) {
		let user = await message.client.users.fetch(entry.userID);
		let name = num === 1 ? `**${user.username} | ${entry.coins} coins**` : `${user.username} | ${entry.coins} coins`;
		formattedEntries.push(numberToEmoji(num) + ' ' + name);
		num++;
	}
	
	message.channel.send({ embed: {
		title: `${COIN_EMOJI} DuckCoin Leaderboard`,
		description: formattedEntries.join('\n'),
		color: THEME_COLOR,
		footer: {
			text: `Page ${page} of ${maxPage} | You are rank ${userLocation} on page ${userPage}.`
		}
	}})
}

function image(message) {
	getSubredditMeme('duck').then(meme => {
		message.channel.send({embed: {
			title: 'Quack!',
			image: {
				url: `https://i.imgur.com/${meme.hash}${meme.ext}`
			},
			color: THEME_COLOR // TODO: Add duck happiness/xp increase (rare-ish) and coin get (somewhat rare)
		}})
	}).catch(() => {
		message.channel.send({ embed: {
			color: THEME_COLOR,
			description: 'Duck image retrieval failed. :('
		}})
	})
}

async function getUser(id) {
	let obj = await sql.get('SELECT * FROM duckEconomy WHERE userID = ?', [ id ]);

	if (!obj) {
		obj = { coins: 0 };
		sql.run('INSERT INTO duckEconomy (userID) VALUES (?)', [ id ]);
	}
	
	return obj;
}

exports.run = (message, args, suffix, client, perms, prefix) => {
	if (!init) return message.channel.send(':duck: Duck still initializing. Please come back later.');
	if (!args[0]) return message.channel.send(`:duck: Duck v${VERSION} operational.\nUse the \`help\` argument to get started.`);
	
	let func = meta[args[0].toLowerCase()] || aliases[args[0].toLowerCase()];
	if (!func) return message.channel.send(`Invalid command. For help, use the \`help\` argument.`);
	func = func.run;

	message.suffix = suffix.slice(args[0].length + 1);
	message.args = args.slice(1);
	message.perms = perms;
	message.prefix = prefix;
	
	func(message);
};

exports.config = {
	enabled: true,
	permLevel: 2,
	perms: [ 'ATTACH_FILES' ],
	category: 'eggs',
	aliases: [ 'duck' ]
};

exports.meta = {
	command: 'nik',
	name: 'Nik\'s utterly wild duck command',
	description: 'An easter egg for Nik',
	usage: '',
	help: 'whoooo boy. use `duck help` to see how to use this wild command.'
};

let changelogText = `**v0.4**
 - \`leaderboard\` command added so you can say you're cooler than your friends
 - \`transfer\` command added so you can make your friends cooler than you
 - Command aliases added (e.g. \`lb\` for leaderboard) Use the help command with another command to view its aliases.
 - Command usages added. View the help menu of a specific command to view its usage.
 - Learned how [semantic versioning](https://semver.org/) actually worked, and updated version numbers to reflect it (which, by the way, is totally something you *don't* do with semantic versioning).

**v0.3 - Changelogs!**
 - 100x better coin emoji added
 - \`image\` command added to view duck images
 - \`changelog\` command added. you're using it. nice.
 - "leet" alias added

**v0.2**
 - Framework for commands created
 - Database for ducks and duck economy created
 - Basic commands \`help\`, \`balance\`, and \`daily\` added
 - "duck" and "duk" aliases added

**v0.1 - The Beta Begins**
Duck v0.1 is created. Only a base message is shown.
 - Guidelines in [trello card](https://trello.com/c/wm6NbkBt/602-anik) for what is to come in the future created`;

function changelog(message) {
	message.channel.send({ embed: {
		description: changelogText,
		color: THEME_COLOR
	}});
}